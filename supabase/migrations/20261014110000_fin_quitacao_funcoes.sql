-- ─── Fase 1A (2/3): as FUNÇÕES da Quitação — a Matriz de suficiência, o registro, a alteração, a remoção, a aprovação e as guardas ──────────────────────
-- Depende de 20261014100000. Nenhum dado existente é alterado; só nascem funções e gatilhos.
--
-- O que esta migration cria:
--   1. `fin_quitacao_graus`, `fin_quitacao_avaliar` (a Matriz, cláusula 3.7 da Política) e `fin_quitacao_resultado` (resultado, credor atual e fila): funções PURAS, as mesmas de
--      lib/quitacao.ts (provadas equivalentes em milhares de cenários). O grau de prova NASCE DOS ANEXOS; não é digitado.
--   2. `fin_quitacao_entrada` (monta, de uma quitação, tudo o que a Matriz precisa: anexos, nota, chave, circuito, histórico de pagamentos, moduladores) e `fin_quitacao_aprovacoes`
--      (a decisão vigente de cada tipo, que perde a validade se a quitação mudar depois dela).
--   3. `fin_registrar_quitacao`, `fin_alterar_quitacao`, `fin_remover_quitacao`: quem escreve na tabela. Registram o histórico por gatilho; a alteração e a remoção exigem motivo.
--   4. `fin_decidir_quitacao`: a APROVAÇÃO é um evento próprio. Aprovar o reembolso NÃO paga, NÃO gera liquidação, NÃO mexe em conta nem em saldo: só reconhece que a igreja aceita
--      a despesa e assume a dívida com o terceiro. Alçada por valor (Tesouraria até o teto 1; acima, o Administrador) e nunca o próprio favorecido.
--   5. `fin_quitacao_parametros_alterar`: só o Administrador, com motivo, e fica no histórico.
--   6. DUAS GUARDAS na fin_lancamentos: (a) uma obrigação com quitação por terceiro NÃO pode ser marcada paga pela via comum (evita pagar o fornecedor de novo); só o caminho do reembolso
--      (variável qibrj.reembolso, da entrega 1C) a libera; e a marcação "Não localizado" some sozinha, com rastro, quando a igreja paga; (b) não se exclui despesa que tem quitação.
-- GATES desta entrega (caem sozinhos quando a entrega seguinte for aplicada): a OFERTA só é aceita depois de existir o status `quitado_terceiro` (entrega 1B); a COMPENSAÇÃO DE
-- ADIANTAMENTO exige o vínculo com o adiantamento (fase futura) e hoje é recusada.
-- Padrões conservadores aprovados (13/10/2026): bem durável sem limite de capitalização = Alto · Empresa sem histórico de pagamentos = Médio · reembolso exige Formal ·
-- compensação exige Formal · responsável não identificado nunca é suficiente.
-- Reversível: docs/QUITACAO_ROLLBACK.sql.

-- ── 1) as funções puras ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- o grau nasce dos anexos: terceiro sem anexo = Relatado; prova do pagamento do terceiro = responsável Formal; declaração (ou pedido de reembolso) = intenção Formal
CREATE OR REPLACE FUNCTION public.fin_quitacao_graus(p_responsavel text, p_intencao text, p_anexos text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE gr text; gi text;
BEGIN
  IF p_responsavel NOT IN ('pessoa', 'empresa', 'entidade') THEN RETURN jsonb_build_object('responsavel', 'nenhum', 'intencao', 'nenhum'); END IF;
  gr := CASE WHEN 'prova_pagamento_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END;
  IF p_intencao IN ('nao_declarada', 'nao_se_aplica') THEN gi := 'nenhum';
  ELSIF p_intencao = 'reembolso' THEN gi := CASE WHEN 'pedido_reembolso' = ANY(COALESCE(p_anexos, '{}')) OR 'declaracao_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END;
  ELSE gi := CASE WHEN 'declaracao_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END; END IF;
  RETURN jsonb_build_object('responsavel', gr, 'intencao', gi);
END
$fn$;

-- a Matriz de suficiência da prova. Entrada e saída em jsonb (chaves em snake_case, as mesmas de lib/quitacao.ts em camelCase)
CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE
  resp text := p->>'responsavel'; inten text := p->>'intencao';
  gr int; gi int; gc int; nat int; pat int; las int; rel int; base int; passos int; nv int;
  valor numeric := COALESCE((p->>'valor')::numeric, 0); limite numeric := (p->>'limite_capitalizacao')::numeric; natit text := p->>'natureza_item';
  dias int := (p->>'dias_entre_pagamento_e_declaracao')::int;
  mods text[] := '{}'; vencida boolean; nm int;
  suf boolean := false; exige boolean := false; motivo text := NULL; gc_txt text;
  rotulos text[] := ARRAY['baixo', 'medio', 'alto']; graus text[] := ARRAY['nenhum', 'relatado', 'formal'];
BEGIN
  gr := CASE p->>'grau_responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END;
  gi := CASE p->>'grau_intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END;
  gc := LEAST(gr, gi);
  -- eixo 1 — natureza da operação
  nat := CASE WHEN inten IN ('reembolso', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica') THEN 2 WHEN COALESCE((p->>'oferta_com_condicao')::boolean, false) THEN 1 ELSE 0 END;
  -- eixo 2 — patrimônio (sem natureza ou sem limite de capitalização definido: o lado seguro)
  pat := CASE WHEN natit IS NULL THEN 2 WHEN natit <> 'duravel' THEN 0 WHEN limite IS NULL OR valor >= limite THEN 2 ELSE 1 END;
  -- eixo 3 — lastro de nota fiscal
  las := CASE WHEN NOT COALESCE((p->>'tem_nota_anexada')::boolean, false) THEN 2
              WHEN COALESCE((p->>'comprador_cnpj_igreja')::boolean, false) AND COALESCE((p->>'chave_valida')::boolean, false) AND COALESCE((p->>'chave_confere_com_emitente')::boolean, false) THEN 0
              ELSE 1 END;
  -- eixo 4 — risco da relação
  rel := CASE resp
    WHEN 'pessoa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'terceiro_no_circuito')::boolean, false) THEN 2
                            WHEN COALESCE((p->>'terceiro_ministro')::boolean, false) OR COALESCE((p->>'intencao_alterada_recentemente')::boolean, false) THEN 1 ELSE 0 END
    WHEN 'empresa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'empresa_com_pagamentos_12m')::boolean, false) THEN 2 ELSE 1 END
    WHEN 'entidade' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) THEN 2 ELSE 1 END
    ELSE 0 END;

  -- moduladores
  IF dias IS NOT NULL AND dias > COALESCE((p->>'prazo_declaracao_dias')::int, 30) THEN mods := array_append(mods, 'M1'); END IF;
  IF valor > COALESCE((p->>'teto_1')::numeric, 500) THEN mods := array_append(mods, 'M2'); END IF;
  IF COALESCE((p->>'acumulado_ano_do_terceiro')::numeric, 0) > COALESCE((p->>'teto_anual_terceiro')::numeric, 2000)
     OR COALESCE((p->>'qtd_relatadas_no_trimestre')::int, 0) >= COALESCE((p->>'qtd_relatadas_trimestre')::int, 3) THEN mods := array_append(mods, 'M3'); END IF;
  IF COALESCE((p->>'periodo_aprovado')::boolean, false) THEN mods := array_append(mods, 'M4'); END IF;
  vencida := gc = 1 AND COALESCE((p->>'formalizacao_vencida')::boolean, false);
  nm := COALESCE(cardinality(mods), 0);
  IF vencida THEN mods := array_append(mods, 'vencida'); END IF;

  base := GREATEST(nat, pat, las, rel);
  passos := LEAST(2, nm) + CASE WHEN vencida THEN 1 ELSE 0 END;
  nv := LEAST(2, base + passos);

  -- suficiência
  IF inten IN ('nao_declarada', 'nao_se_aplica') THEN motivo := 'A intenção do terceiro não foi declarada.';
  ELSIF gr = 0 THEN motivo := 'Falta identificar quem pagou.';
  ELSIF gi = 0 THEN motivo := 'Falta a declaração da intenção.';
  ELSIF gc = 2 THEN suf := true;
  ELSIF inten = 'reembolso' THEN motivo := 'Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.';
  ELSIF inten = 'compensacao_adiantamento' THEN motivo := 'A compensação de adiantamento exige a prova Formal.';
  ELSIF nv = 0 THEN suf := true;
  ELSIF nv = 1 THEN
    IF COALESCE((p->>'aprovado_pelo_administrador')::boolean, false) THEN suf := true;
    ELSE exige := true; motivo := 'O Relatado, neste nível de risco, precisa da aprovação do Administrador.'; END IF;
  ELSE motivo := 'Neste nível de risco o Relatado não basta: anexe a declaração assinada e a prova do pagamento do terceiro.'; END IF;

  RETURN jsonb_build_object(
    'eixo_natureza', rotulos[nat + 1], 'eixo_patrimonio', rotulos[pat + 1], 'eixo_lastro', rotulos[las + 1], 'eixo_relacao', rotulos[rel + 1],
    'moduladores', to_jsonb(mods), 'nivel', rotulos[nv + 1], 'grau_conjunto', graus[gc + 1], 'suficiente', suf,
    'exige_aprovacao_administrador', exige, 'motivo', to_jsonb(motivo));
END
$fn$;

-- resultado, credor atual e fila — tudo derivado dos fatos
CREATE OR REPLACE FUNCTION public.fin_quitacao_resultado(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE resp text := p->>'responsavel'; inten text := p->>'intencao'; suf boolean := COALESCE((p->>'suficiente')::boolean, false);
        aprov text := p->>'aprovacao'; paga boolean := COALESCE((p->>'paga')::boolean, false);
BEGIN
  IF resp = 'igreja' THEN RETURN jsonb_build_object('resultado', 'pago_pela_igreja', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
  IF resp = 'ninguem_ainda' THEN RETURN jsonb_build_object('resultado', 'em_aberto', 'credor_atual', 'emitente', 'fila', NULL); END IF;
  IF resp = 'nao_localizado' THEN RETURN jsonb_build_object('resultado', 'sem_quitacao_localizada', 'credor_atual', 'emitente', 'fila', 'investigar'); END IF;
  IF inten IN ('nao_declarada', 'nao_se_aplica') THEN RETURN jsonb_build_object('resultado', 'a_esclarecer', 'credor_atual', 'em_analise', 'fila', 'a_esclarecer'); END IF;
  IF NOT suf THEN RETURN jsonb_build_object('resultado', 'a_formalizar', 'credor_atual', 'em_analise', 'fila', 'formalizar'); END IF;
  IF inten = 'reembolso' THEN
    IF aprov = 'recusada' THEN RETURN jsonb_build_object('resultado', 'a_esclarecer', 'credor_atual', 'em_analise', 'fila', 'a_esclarecer'); END IF;
    IF aprov IS DISTINCT FROM 'aprovada' THEN RETURN jsonb_build_object('resultado', 'reembolso_em_analise', 'credor_atual', 'em_analise', 'fila', 'aprovar_reembolso'); END IF;
    IF paga THEN RETURN jsonb_build_object('resultado', 'reembolsada', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
    RETURN jsonb_build_object('resultado', 'divida_com_terceiro', 'credor_atual', 'terceiro', 'fila', 'reembolso_a_pagar');
  END IF;
  IF inten = 'oferta' THEN RETURN jsonb_build_object('resultado', 'extinta_como_oferta', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
  RETURN jsonb_build_object('resultado', 'compensada', 'credor_atual', 'nenhum', 'fila', NULL);
END
$fn$;

-- ── 2) o que a Matriz precisa saber de uma quitação ──────────────────────────────────────────────────────────────────────────────────────────
-- as decisões de aprovação vigentes: a mais recente de cada tipo, e só vale se a quitação NÃO mudou depois dela
CREATE OR REPLACE FUNCTION public.fin_quitacao_aprovacoes(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ultima_mudanca timestamptz; r text; a text;
BEGIN
  SELECT max(e.em) INTO ultima_mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('registrada', 'alterada');
  SELECT e.decisao INTO r FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_reembolso' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  SELECT e.decisao INTO a FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_relatado' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  RETURN jsonb_build_object('reembolso', to_jsonb(r), 'relatado', to_jsonb(a));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_grau_conjunto(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; tipos text[]; g jsonb;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  RETURN CASE LEAST(CASE g->>'responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END, CASE g->>'intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END)
              WHEN 2 THEN 'formal' WHEN 1 THEN 'relatado' ELSE 'nenhum' END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; f public.fin_fornecedores%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE;
  tipos text[]; g jsonb; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  acumulado numeric := 0; relatadas int := 0; conj text; ap jsonb; no_circuito boolean := false; ministro boolean := false; com_pagamentos boolean := false;
  alterada boolean := false; periodo boolean := false; chave text; confere boolean := false; vencida boolean := false; r record;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO f FROM public.fin_fornecedores WHERE id = l.fornecedor_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  conj := public.fin_quitacao_grau_conjunto(q.id);
  ap := public.fin_quitacao_aprovacoes(q.id);

  chave := l.nf_chave_acesso;
  IF chave IS NOT NULL AND f.id IS NOT NULL AND f.cnpj_cpf IS NOT NULL THEN
    confere := substr(chave, 7, 14) = regexp_replace(f.cnpj_cpf, '\D', '', 'g');
  END IF;

  IF q.responsavel_tipo = 'pessoa' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id = pr.id
                    WHERE pr.pessoa_id = q.responsavel_pessoa_id AND ur.role::text IN ('admin', 'diakonia', 'secretaria', 'tesouraria')) INTO no_circuito;
    SELECT EXISTS (SELECT 1 FROM public.membros m, unnest(m.funcoes_ministeriais) fn WHERE m.id = q.responsavel_pessoa_id AND fn::text <> 'membro') INTO ministro;
  END IF;
  IF q.responsavel_tipo = 'empresa' THEN
    SELECT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = q.responsavel_fornecedor_id AND x.tipo::text = 'saida' AND x.status::text IN ('realizado', 'conciliado')
                      AND COALESCE(x.data_pagamento, x.data) >= hoje - 365) INTO com_pagamentos;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento = 'alterada' AND (e.de->>'intencao') IS DISTINCT FROM (e.para->>'intencao')
                    AND e.em >= now() - interval '30 days') INTO alterada;
  SELECT EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo fp WHERE fp.status = 'aprovado'
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) >= fp.ano_inicio * 12 + fp.mes_inicio
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) <  fp.ano_inicio * 12 + fp.mes_inicio + fp.qtd_meses) INTO periodo;

  IF q.pago_em IS NOT NULL THEN
    SELECT COALESCE(sum(COALESCE(lo.valor_original, lo.valor)), 0) INTO acumulado
      FROM public.fin_quitacoes q2 JOIN public.fin_lancamentos lo ON lo.id = q2.obrigacao_id
     WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
       AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
       AND EXTRACT(year FROM q2.pago_em) = EXTRACT(year FROM q.pago_em);
    FOR r IN SELECT q2.id FROM public.fin_quitacoes q2
              WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
                AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
                AND date_trunc('quarter', q2.pago_em::timestamp) = date_trunc('quarter', q.pago_em::timestamp) LOOP
      IF public.fin_quitacao_grau_conjunto(r.id) = 'relatado' THEN relatadas := relatadas + 1; END IF;
    END LOOP;
  END IF;

  vencida := conj = 'relatado' AND ((q.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date + par.prazo_formalizacao_dias) < hoje;

  RETURN jsonb_build_object(
    'responsavel', q.responsavel_tipo, 'intencao', q.intencao, 'grau_responsavel', g->>'responsavel', 'grau_intencao', g->>'intencao',
    'natureza_item', to_jsonb(l.natureza_item), 'valor', COALESCE(l.valor_original, l.valor),
    'tem_nota_anexada', ('nota_fiscal' = ANY(tipos) OR 'xml' = ANY(tipos)), 'comprador_cnpj_igreja', (l.comprador = 'cnpj_igreja'),
    'chave_valida', (chave IS NOT NULL AND public.fin_nfe_chave_valida(chave)), 'chave_confere_com_emitente', confere,
    'terceiro_no_circuito', no_circuito, 'terceiro_ministro', ministro, 'empresa_com_pagamentos_12m', com_pagamentos,
    'intencao_alterada_recentemente', alterada, 'pede_recibo_fiscal', q.pede_recibo, 'oferta_com_condicao', (q.condicao IS NOT NULL),
    'dias_entre_pagamento_e_declaracao', CASE WHEN q.declarado_em IS NOT NULL AND q.pago_em IS NOT NULL THEN to_jsonb(q.declarado_em - q.pago_em) ELSE 'null'::jsonb END,
    'acumulado_ano_do_terceiro', acumulado, 'qtd_relatadas_no_trimestre', relatadas, 'periodo_aprovado', periodo, 'formalizacao_vencida', vencida,
    'aprovado_pelo_administrador', (ap->>'relatado' = 'aprovada'),
    'teto_1', par.teto_1, 'prazo_declaracao_dias', par.prazo_declaracao_dias, 'teto_anual_terceiro', par.teto_anual_terceiro,
    'qtd_relatadas_trimestre', par.qtd_relatadas_trimestre, 'limite_capitalizacao', to_jsonb(par.limite_capitalizacao));
END
$fn$;

-- ── 3) validação comum ao registro e à alteração ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_validar_campos(p_lancamento uuid, p_tipo text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago date, p_declarado date) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; f public.fin_fornecedores%ROWTYPE; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento;
  IF p_tipo NOT IN ('pessoa', 'empresa', 'entidade', 'nao_localizado') THEN RAISE EXCEPTION 'Responsável inválido: %. Use pessoa, empresa, entidade ou nao_localizado (Igreja e Ninguém ainda o sistema deduz).', p_tipo; END IF;
  IF p_intencao NOT IN ('reembolso', 'oferta', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica') THEN RAISE EXCEPTION 'Intenção inválida: %.', p_intencao; END IF;
  IF p_tipo = 'nao_localizado' THEN
    IF p_intencao <> 'nao_se_aplica' THEN RAISE EXCEPTION 'Quando não se sabe quem pagou, a intenção não se aplica.'; END IF;
    IF p_pessoa IS NOT NULL OR p_fornecedor IS NOT NULL OR p_pago IS NOT NULL OR p_declarado IS NOT NULL THEN RAISE EXCEPTION 'Não localizado não leva pessoa, empresa, entidade nem datas.'; END IF;
    RETURN;
  END IF;
  IF p_intencao = 'nao_se_aplica' THEN RAISE EXCEPTION 'Escolha a intenção do terceiro, ou marque Não declarada.'; END IF;
  IF p_tipo = 'pessoa' THEN
    IF p_pessoa IS NULL OR p_fornecedor IS NOT NULL THEN RAISE EXCEPTION 'Escolha a pessoa que pagou (e só ela).'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.membros WHERE id = p_pessoa) THEN RAISE EXCEPTION 'Pessoa não encontrada no cadastro.'; END IF;
  ELSE
    IF p_fornecedor IS NULL OR p_pessoa IS NOT NULL THEN RAISE EXCEPTION 'Escolha % que pagou (e só ela).', CASE WHEN p_tipo = 'empresa' THEN 'a empresa' ELSE 'a entidade' END; END IF;
    SELECT * INTO f FROM public.fin_fornecedores WHERE id = p_fornecedor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cadastro não encontrado.'; END IF;
    IF NOT public.fin_cnpj_valido(f.cnpj_cpf) THEN RAISE EXCEPTION 'Empresa e Entidade só podem ser responsáveis com CNPJ válido no cadastro (% está sem CNPJ válido).', f.nome; END IF;
    IF p_fornecedor IS NOT DISTINCT FROM l.fornecedor_id THEN RAISE EXCEPTION 'O próprio emitente da nota não pode ser o terceiro que a quitou.'; END IF;
  END IF;
  IF p_pago IS NULL THEN RAISE EXCEPTION 'Informe a data em que o terceiro pagou.'; END IF;
  IF p_pago > hoje THEN RAISE EXCEPTION 'A data do pagamento do terceiro não pode ser futura.'; END IF;
  IF p_intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento') THEN
    IF p_declarado IS NULL THEN RAISE EXCEPTION 'Informe a data da declaração do terceiro.'; END IF;
    IF p_declarado > hoje THEN RAISE EXCEPTION 'A data da declaração não pode ser futura.'; END IF;
  ELSIF p_declarado IS NOT NULL THEN RAISE EXCEPTION 'Intenção não declarada não tem data de declaração.'; END IF;
  -- os gates desta entrega
  IF p_intencao = 'compensacao_adiantamento' THEN RAISE EXCEPTION 'A compensação de adiantamento será liberada numa fase futura: ela exige o vínculo com o adiantamento anterior.'; END IF;
  IF p_intencao = 'oferta' AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'fin_lancamento_status' AND e.enumlabel = 'quitado_terceiro') THEN
    RAISE EXCEPTION 'A oferta será liberada na entrega 1B (precisa do status "quitado por terceiro"). Por enquanto registre Não declarada ou Reembolso.';
  END IF;
END
$fn$;

-- ── 4) registrar ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(
  p_lancamento uuid, p_responsavel text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date,
  p_natureza_item text DEFAULT NULL, p_comprador text DEFAULT NULL, p_condicao text DEFAULT NULL, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; novo uuid; v_nat text; v_comp text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar a quitação de uma despesa.';
  END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'Só uma despesa (saída) tem quitação.'; END IF;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'Esta despesa não está em aberto (situação: %). A quitação por terceiro só se registra em despesa ainda a pagar.', l.status; END IF;
  IF COALESCE(l.obrigacao_id, l.id) <> l.id THEN RAISE EXCEPTION 'Registre a quitação na obrigação principal, não numa das suas parcelas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id AND x.id <> l.id AND x.status::text IN ('realizado', 'conciliado')) THEN
    RAISE EXCEPTION 'Esta obrigação já teve pagamento parcial; nesta entrega a quitação por terceiro só vale para obrigação ainda sem baixa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = l.id) THEN RAISE EXCEPTION 'Esta obrigação já tem uma quitação registrada: altere ou remova a existente.'; END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em);

  IF p_responsavel <> 'nao_localizado' THEN
    v_nat := COALESCE(p_natureza_item, l.natureza_item); v_comp := COALESCE(p_comprador, l.comprador);
    IF v_nat IS NULL THEN RAISE EXCEPTION 'Informe a natureza do item (consumo, estoque, bem durável ou serviço).'; END IF;
    IF v_nat NOT IN ('consumo', 'estoque', 'duravel', 'servico') THEN RAISE EXCEPTION 'Natureza do item inválida: %.', v_nat; END IF;
    IF v_comp IS NULL THEN RAISE EXCEPTION 'Informe se a igreja é a compradora por documento fiscal no CNPJ dela ou por contratação prévia.'; END IF;
    IF v_comp NOT IN ('cnpj_igreja', 'contratacao_previa') THEN RAISE EXCEPTION 'Comprador inválido: %.', v_comp; END IF;
    IF v_nat IS DISTINCT FROM l.natureza_item OR v_comp IS DISTINCT FROM l.comprador THEN
      UPDATE public.fin_lancamentos SET natureza_item = v_nat, comprador = v_comp WHERE id = l.id;
    END IF;
  END IF;

  PERFORM set_config('qibrj.motivo', COALESCE(p_motivo, ''), true);
  INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, pago_em, declarado_em, condicao, pede_recibo)
  VALUES (l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em, NULLIF(btrim(COALESCE(p_condicao, '')), ''), COALESCE(p_pede_recibo, false))
  RETURNING id INTO novo;
  PERFORM set_config('qibrj.motivo', '', true);
  RETURN novo;
END
$fn$;

-- ── 5) alterar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; k text; permitidas text[] := ARRAY['responsavel_tipo', 'responsavel_pessoa_id', 'responsavel_fornecedor_id', 'intencao', 'pago_em', 'declarado_em', 'condicao', 'pede_recibo'];
        n_tipo text; n_pessoa uuid; n_forn uuid; n_int text; n_pago date; n_decl date; n_cond text; n_recibo boolean;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para alterar a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da alteração (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os campos a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Campo não alterável: %.', k; END IF;
  END LOOP;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se altera mais.', l.status; END IF;

  n_tipo  := COALESCE(p_patch->>'responsavel_tipo', q.responsavel_tipo);
  n_pessoa := CASE WHEN p_patch ? 'responsavel_pessoa_id' THEN NULLIF(p_patch->>'responsavel_pessoa_id', '')::uuid ELSE q.responsavel_pessoa_id END;
  n_forn  := CASE WHEN p_patch ? 'responsavel_fornecedor_id' THEN NULLIF(p_patch->>'responsavel_fornecedor_id', '')::uuid ELSE q.responsavel_fornecedor_id END;
  n_int   := COALESCE(p_patch->>'intencao', q.intencao);
  n_pago  := CASE WHEN p_patch ? 'pago_em' THEN NULLIF(p_patch->>'pago_em', '')::date ELSE q.pago_em END;
  n_decl  := CASE WHEN p_patch ? 'declarado_em' THEN NULLIF(p_patch->>'declarado_em', '')::date ELSE q.declarado_em END;
  n_cond  := CASE WHEN p_patch ? 'condicao' THEN NULLIF(btrim(COALESCE(p_patch->>'condicao', '')), '') ELSE q.condicao END;
  n_recibo := CASE WHEN p_patch ? 'pede_recibo' THEN COALESCE((p_patch->>'pede_recibo')::boolean, false) ELSE q.pede_recibo END;
  -- mudar o tipo de responsável limpa o cadastro do tipo anterior, a menos que o novo venha no mesmo pedido
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
END
$fn$;

-- ── 6) remover ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_remover_quitacao(p_quitacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para remover a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da remoção (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se remove mais. Para mudar algo, reabra a despesa.', l.status; END IF;
  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  DELETE FROM public.fin_quitacoes WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
END
$fn$;

-- ── 7) a APROVAÇÃO — evento próprio, que não paga ─────────────────────────────────────────────────────────────────────────────────────────
-- Fluxo: Documento → Análise → Aprovação → Obrigação com a pessoa → Pagamento → Liquidação. Aprovar NÃO movimenta caixa, NÃO movimenta banco, NÃO gera liquidação, NÃO gera conciliação:
-- só reconhece que a igreja aceita a despesa e assume a dívida com o terceiro. O pagamento é ato posterior (entrega 1C).
CREATE OR REPLACE FUNCTION public.fin_decidir_quitacao(p_quitacao uuid, p_tipo text, p_decisao text, p_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE; a jsonb; uid uuid := (SELECT auth.uid());
        valor numeric; eh_admin boolean; pessoa_aprovador uuid;
BEGIN
  eh_admin := has_any_role(uid, ARRAY['admin'::app_role]);
  IF NOT (eh_admin OR has_any_role(uid, ARRAY['tesouraria'::app_role])) THEN RAISE EXCEPTION 'Só o Administrador e a Tesouraria decidem sobre a quitação.'; END IF;
  IF p_tipo NOT IN ('reembolso', 'relatado') THEN RAISE EXCEPTION 'Tipo de decisão inválido: % (use reembolso ou relatado).', p_tipo; END IF;
  IF p_decisao NOT IN ('aprovada', 'recusada') THEN RAISE EXCEPTION 'Decisão inválida: % (use aprovada ou recusada).', p_decisao; END IF;
  IF p_decisao = 'recusada' AND (p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5) THEN RAISE EXCEPTION 'Recusar exige o motivo (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não há o que decidir.', l.status; END IF;
  a := public.fin_quitacao_avaliar(public.fin_quitacao_entrada(q.id));
  valor := COALESCE(l.valor_original, l.valor);

  IF p_tipo = 'reembolso' THEN
    IF q.intencao <> 'reembolso' THEN RAISE EXCEPTION 'Esta quitação não é um reembolso.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'suficiente')::boolean THEN
      RAISE EXCEPTION 'Não dá para aprovar: %', COALESCE(a->>'motivo', 'a prova ainda não é suficiente.');
    END IF;
    IF valor > par.teto_1 AND NOT eh_admin THEN RAISE EXCEPTION 'Reembolso acima de R$ % só o Administrador aprova.', par.teto_1; END IF;
    SELECT pr.pessoa_id INTO pessoa_aprovador FROM public.profiles pr WHERE pr.id = uid;
    IF pessoa_aprovador IS NOT NULL AND q.responsavel_pessoa_id IS NOT DISTINCT FROM pessoa_aprovador THEN
      RAISE EXCEPTION 'Ninguém aprova o próprio reembolso: peça a outra pessoa.';
    END IF;
  ELSE
    IF NOT eh_admin THEN RAISE EXCEPTION 'Só o Administrador aprova o grau Relatado.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'exige_aprovacao_administrador')::boolean THEN
      RAISE EXCEPTION 'Esta quitação não precisa da aprovação do Administrador (%).', COALESCE(a->>'motivo', 'a prova já é suficiente ou não pode ser aceita como Relatado');
    END IF;
  END IF;

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, decisao, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, CASE p_tipo WHEN 'reembolso' THEN 'aprovacao_reembolso' ELSE 'aprovacao_relatado' END, p_decisao,
          jsonb_build_object('nivel', a->>'nivel', 'grau_conjunto', a->>'grau_conjunto', 'valor', valor), NULLIF(btrim(COALESCE(p_motivo, '')), ''), uid);
END
$fn$;

-- ── 8) parâmetros (só o Administrador, com motivo) ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE k text; antes jsonb; depois jsonb; permitidas text[] := ARRAY['vigencia', 'teto_1', 'prazo_declaracao_dias', 'teto_anual_terceiro', 'qtd_relatadas_trimestre', 'prazo_formalizacao_dias', 'prazo_esclarecimento_dias', 'prazo_reembolso_dias', 'limite_capitalizacao'];
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'Só o Administrador altera os parâmetros da Política.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da mudança (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os parâmetros a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Parâmetro desconhecido: %.', k; END IF;
  END LOOP;
  SELECT to_jsonb(p) INTO antes FROM public.fin_quitacao_parametros p;
  UPDATE public.fin_quitacao_parametros SET
    vigencia = CASE WHEN p_patch ? 'vigencia' THEN NULLIF(p_patch->>'vigencia', '')::date ELSE vigencia END,
    teto_1 = COALESCE((p_patch->>'teto_1')::numeric, teto_1),
    prazo_declaracao_dias = COALESCE((p_patch->>'prazo_declaracao_dias')::int, prazo_declaracao_dias),
    teto_anual_terceiro = COALESCE((p_patch->>'teto_anual_terceiro')::numeric, teto_anual_terceiro),
    qtd_relatadas_trimestre = COALESCE((p_patch->>'qtd_relatadas_trimestre')::int, qtd_relatadas_trimestre),
    prazo_formalizacao_dias = COALESCE((p_patch->>'prazo_formalizacao_dias')::int, prazo_formalizacao_dias),
    prazo_esclarecimento_dias = COALESCE((p_patch->>'prazo_esclarecimento_dias')::int, prazo_esclarecimento_dias),
    prazo_reembolso_dias = COALESCE((p_patch->>'prazo_reembolso_dias')::int, prazo_reembolso_dias),
    limite_capitalizacao = CASE WHEN p_patch ? 'limite_capitalizacao' THEN NULLIF(p_patch->>'limite_capitalizacao', '')::numeric ELSE limite_capitalizacao END,
    atualizado_em = now(), atualizado_por = (SELECT auth.uid())
  WHERE id;
  SELECT to_jsonb(p) INTO depois FROM public.fin_quitacao_parametros p;
  INSERT INTO public.fin_quitacao_eventos (evento, de, para, motivo, por) VALUES ('parametros', antes, depois, btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;

-- ── 9) as guardas na fin_lancamentos ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) uma obrigação cujo fornecedor já foi pago por um terceiro NÃO pode ser marcada paga pela via comum — senão o fornecedor seria pago de novo. Só o caminho do reembolso
--     (entrega 1C, que liga qibrj.reembolso) a libera. Se a marcação era "Não localizado" e a igreja pagou, a marcação perde o sentido: some, com o motivo no histórico.
CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE raiz uuid;
BEGIN
  IF NEW.status::text NOT IN ('realizado', 'conciliado') THEN RETURN NEW; END IF;
  raiz := COALESCE(NEW.obrigacao_id, NEW.id);
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text IN ('realizado', 'conciliado') THEN RETURN NEW; END IF;   -- já era paga: só mudou entre realizado e conciliado
  ELSIF raiz = NEW.id THEN
    RETURN NEW;                                                                    -- despesa nova, obrigação própria: não há quitação possível
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.responsavel_tipo IN ('pessoa', 'empresa', 'entidade'))
     AND COALESCE(current_setting('qibrj.reembolso', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Esta conta já foi paga ao fornecedor por um terceiro (quitação registrada). Não a pague de novo ao fornecedor: pague o reembolso à pessoa, ou remova a quitação (com motivo) se ela foi registrada por engano.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.responsavel_tipo = 'nao_localizado') THEN
    PERFORM set_config('qibrj.motivo', 'Pago pela igreja: a marcação "Não localizado" perdeu o sentido.', true);
    DELETE FROM public.fin_quitacoes WHERE obrigacao_id = raiz AND responsavel_tipo = 'nao_localizado';
    PERFORM set_config('qibrj.motivo', '', true);
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_quitacao_pagamento ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitacao_pagamento BEFORE INSERT OR UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text IN ('realizado', 'conciliado')) EXECUTE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento();

-- (b) não se exclui a despesa que tem quitação (a chave estrangeira já impede; aqui a mensagem é clara)
CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_protege_apagar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = OLD.id) THEN
    RAISE EXCEPTION 'Esta despesa tem uma quitação por terceiro registrada. Remova a quitação (com motivo) antes de excluí-la.';
  END IF;
  RETURN OLD;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_quitacao_apagar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitacao_apagar BEFORE DELETE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_quitacao_protege_apagar();

-- ── 10) permissões ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) TO authenticated;
