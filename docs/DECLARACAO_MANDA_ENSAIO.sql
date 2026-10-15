-- ENSAIO — Fase 2A: A DECLARAÇÃO MANDA. NADA FICA GRAVADO: o bloco termina de propósito com um erro ("RESULTADO DO ENSAIO ..."), que desfaz tudo. Cole a mensagem de volta.
-- Ele aplica o corpo da migration, confere que o que já existe segue igual e prova a regra com dados de teste criados e desfeitos no mesmo bloco.
DO $ens$
DECLARE
  rel text := ''; ok boolean := true; passo text := 'início'; total int := 0; mudaram int := 0; regressoes int := 0; lista text := ''; r record; a jsonb;
  antes jsonb := '{}'::jsonb; adm uuid; msg text; n int;
  forn uuid; forn2 uuid; cat uuid; cat2 uuid; st text; cen uuid; conta uuid; pes uuid; lid uuid; qid uuid; did uuid; an uuid; est text; g text; ap jsonb; cnt int; hist record;
BEGIN
  -- guarda: a 1D-a e a Matriz de Ofertas precisam estar aplicadas, e as funções que esta fase troca ainda são as lidas em 15/10/2026 (ou já têm a regra nova, e então só se reaplica)
  IF to_regclass('public.fin_declaracoes_terceiro') IS NULL THEN RAISE EXCEPTION 'A Declaração do Terceiro (Fase 1D-a) ainda não está aplicada: aplique-a antes. Nada foi gravado.'; END IF;
  IF position('chave_informada' IN pg_get_functiondef('public.fin_quitacao_entrada(uuid)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'A Matriz de Ofertas (docs/QUITACAO_OFERTA_APLICAR.sql) ainda não está aplicada: aplique-a ANTES desta fase. Nada foi gravado.'; END IF;
  IF md5(replace(pg_get_functiondef('public.fin_quitacao_aprovacoes(uuid)'::regprocedure), chr(13), '')) <> '80655acd77517df5ffdbffb704924e18' AND position('selo_atual' IN pg_get_functiondef('public.fin_quitacao_aprovacoes(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_quitacao_aprovacoes mudou depois de 15/10/2026: NÃO aplique sem rever. Nada foi gravado.';
  END IF;
  IF md5(replace(pg_get_functiondef('public.fin_quitacao_grau_conjunto(uuid)'::regprocedure), chr(13), '')) <> '157754ba4927195539a1d764d680431b' AND position('tipos_validos' IN pg_get_functiondef('public.fin_quitacao_grau_conjunto(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_quitacao_grau_conjunto mudou depois de 15/10/2026: NÃO aplique sem rever. Nada foi gravado.';
  END IF;
  IF md5(replace(pg_get_functiondef('public.fin_lanc_congela_enviada()'::regprocedure), chr(13), '')) <> '2d2a75ee14912cb6c2a3b8ba1ed94ddf' AND position('projeto' IN pg_get_functiondef('public.fin_lanc_congela_enviada()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_lanc_congela_enviada mudou depois de 15/10/2026: NÃO aplique sem rever. Nada foi gravado.';
  END IF;
  IF md5(replace(pg_get_functiondef('public.fin_quitacao_entrada(uuid)'::regprocedure), chr(13), '')) <> '39b1d2927c755f3cc104d59af68af296' AND position('tipos_validos' IN pg_get_functiondef('public.fin_quitacao_entrada(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_quitacao_entrada não é a da Matriz de Ofertas (commit ad7fddf): NÃO aplique sem rever. Nada foi gravado.';
  END IF;

  -- foto ANTES: cada quitação real — avaliação da Matriz, grau conjunto e aprovações vigentes
  FOR r IN SELECT id FROM public.fin_quitacoes ORDER BY id LOOP
    antes := antes || jsonb_build_object(r.id::text, jsonb_build_object('avaliacao', public.fin_quitacao_avaliar(public.fin_quitacao_entrada(r.id)), 'conjunto', public.fin_quitacao_grau_conjunto(r.id), 'aprov', public.fin_quitacao_aprovacoes(r.id)));
    total := total + 1;
  END LOOP;

  -- aplica o corpo da migration
  EXECUTE $mig$
-- ─── Fase 2A: A DECLARAÇÃO MANDA — o que o terceiro assinou deixa de valer quando os fatos mudam; o histórico das edições vira trilha imutável ────────────────────────────
-- Pedido (Telma, 15/10/2026): "qualquer mudança em informação que conste na declaração deve invalidá-la" (intenção, quem pagou, valor, fornecedor, data, forma de pagamento, chave PIX, número da
-- nota, emitente) e "a aprovação deve cair sempre que a declaração for invalidada". Histórico imutável para TODOS os lançamentos (valor, fornecedor, categoria, centro, projeto, data, conta).
-- Editar a nota continua PERMITIDO, mas com confirmação, motivo e aviso claro.
--
-- Defeitos medidos no código vivo (15/10/2026):
--   · `fin_declaracao_estado` já distingue sem_declaracao · aguardando_assinatura · assinada · desatualizada · externa, mas NADA o usa: o grau "Formal" da intenção continuava valendo só porque existe um
--     anexo do tipo declaracao_terceiro, mesmo depois de a nota, o valor ou o fornecedor mudarem (a assinatura de um fato que já não existe).
--   · `fin_quitacao_aprovacoes` só derruba a aprovação quando a QUITAÇÃO muda (eventos registrada/alterada); editar a nota (valor, fornecedor, número, chave, data) não derrubava aprovação nenhuma.
--   · `fin_lanc_congela_atualizar` congela valor, data, categoria, centro, favorecido, tipo e situação depois do envio à contabilidade, mas NÃO o projeto.
--   · quem edita um lançamento não deixa rastro do antes e do depois (só `audit_user_id`/`audit_em`, o último a mexer); nomes de quem agiu saem em branco para a Tesouraria (a tabela de perfis só deixa
--     cada um ler o próprio nome, e a Secretaria/Administração ler todos).
--
-- O que esta migration faz (nenhum dado existente é alterado):
--   1. `fin_quitacao_eventos` ganha o evento `declaracao_invalidada`.
--   2. `fin_quitacao_selo`: a impressão digital dos fatos que a declaração declara (o hash do "declarado"; se a declaração ainda não é gerável, o hash de um resumo dos mesmos fatos). Um gatilho a grava em
--      TODA decisão de aprovação, e `fin_quitacao_aprovacoes` só dá a aprovação por vigente quando o selo de hoje é igual ao da decisão. As aprovações antigas (sem selo) seguem a regra de antes.
--   3. `fin_quitacao_tipos_validos`: os tipos de anexo que PROVAM, já descontadas as declarações que não valem mais. A declaração gerada pelo sistema só vale se o estado é "assinada" (a via mais nova,
--      igual ao registro atual); a declaração EXTERNA (anexada à mão) e o pedido de reembolso só valem se foram anexados DEPOIS da última alteração dos dados declarados.
--      `fin_quitacao_grau_conjunto` e `fin_quitacao_entrada` passam a usá-la: sem declaração vigente a intenção volta a Relatado — a Matriz decide o resto.
--   4. `fin_lancamento_historico`: trilha imutável (só acrescenta) de valor, data, fornecedor, favorecido, categoria, centro, projeto, conta, número e chave da nota — para TODOS os lançamentos, com quem
--      (identificador e NOME gravado na hora), quando, antes e depois (com o rótulo legível) e o motivo.
--   5. `fin_lancamentos.motivo_edicao`: canal de passagem do motivo (a tela o envia no mesmo UPDATE; o gatilho o lê, grava na trilha e o zera: nunca fica na linha).
--   6. `fin_lanc_historico_declaracao` (BEFORE UPDATE): grava a trilha; se a edição muda um dado DECLARADO e a quitação já tem declaração, anexo declaratório ou aprovação, EXIGE o motivo (pelo menos 5
--      caracteres) quando quem edita é um usuário do aplicativo, e grava o evento `declaracao_invalidada` na quitação. Rotinas de manutenção (sem usuário) passam, com o motivo "rotina sem motivo informado".
--      Depois da edição (AFTER UPDATE), `fin_lanc_declaracao_sincroniza` reavalia a oferta NA HORA: se a declaração deixou de valer, a extinção por oferta é desfeita sem esperar o agendador.
--   7. `fin_lanc_congela_enviada` e o gatilho `fin_lanc_congela_atualizar` passam a congelar também o PROJETO depois do envio à contabilidade.
--   8. `fin_nomes_dos_usuarios` (RPC) e `fin_nome_do_usuario` (interna): os nomes de quem agiu, para a equipe do financeiro, sem depender da leitura direta de `profiles`.
--   9. `fin_impacto_edicao` (RPC): antes de salvar, a tela pergunta o que a edição invalidaria (campos, estado da declaração, aprovações) para pedir a confirmação e o motivo.
-- Reversível: docs/DECLARACAO_MANDA_ROLLBACK.sql (a trilha só sai se estiver vazia: é prova).

-- ── 1) o histórico da quitação ganha o evento ────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada', 'declaracao_invalidada'));
END $$;

-- ── 2) o selo dos fatos declarados e a aprovação presa a ele ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_selo(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  BEGIN
    RETURN public.fin_declaracao_hash((public.fin_declaracao_conteudo(q.id))->'declarado');          -- o mesmo código impresso na Declaração
  EXCEPTION WHEN OTHERS THEN NULL;                                                                    -- dado incompleto: a declaração ainda não é gerável
  END;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  RETURN 'p:' || public.fin_declaracao_hash(jsonb_build_object(
    'intencao', q.intencao, 'declarante_tipo', q.responsavel_tipo, 'declarante_id', COALESCE(q.responsavel_pessoa_id, q.responsavel_fornecedor_id),
    'fornecedor_id', l.fornecedor_id, 'nota_numero', l.documento_numero, 'nota_chave', l.nf_chave_acesso, 'nota_data', l.data, 'valor', COALESCE(l.valor_original, l.valor),
    'forma_pagamento', q.forma_pagamento_terceiro, 'data_pagamento', q.pago_em));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_eventos_sela() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.evento IN ('aprovacao_reembolso', 'aprovacao_relatado') AND NEW.quitacao_id IS NOT NULL THEN
    NEW.para := COALESCE(NEW.para, '{}'::jsonb) || jsonb_build_object('selo', public.fin_quitacao_selo(NEW.quitacao_id));
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_quitacao_eventos_sela ON public.fin_quitacao_eventos;
CREATE TRIGGER fin_quitacao_eventos_sela BEFORE INSERT ON public.fin_quitacao_eventos FOR EACH ROW EXECUTE FUNCTION public.fin_quitacao_eventos_sela();

-- a decisão vigente de cada tipo: a mais recente, depois da última mudança (registro, alteração ou invalidação) E feita sobre os mesmos fatos de hoje (selo). `*_caiu` avisa que houve decisão que deixou de valer.
CREATE OR REPLACE FUNCTION public.fin_quitacao_aprovacoes(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ultima_mudanca timestamptz; selo_atual text; ev record; r text; a text; r_caiu boolean := false; a_caiu boolean := false; vale boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('aprovacao_reembolso', 'aprovacao_relatado')) THEN
    RETURN jsonb_build_object('reembolso', 'null'::jsonb, 'relatado', 'null'::jsonb, 'reembolso_caiu', false, 'relatado_caiu', false);
  END IF;
  SELECT max(e.em) INTO ultima_mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('registrada', 'alterada', 'declaracao_invalidada');
  selo_atual := public.fin_quitacao_selo(p_quitacao);
  FOR ev IN SELECT DISTINCT ON (e.evento) e.evento, e.decisao, e.em, e.para->>'selo' AS selo
              FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('aprovacao_reembolso', 'aprovacao_relatado')
             ORDER BY e.evento, e.em DESC LOOP
    vale := ev.em > COALESCE(ultima_mudanca, '-infinity') AND (ev.selo IS NULL OR ev.selo = selo_atual);
    IF ev.evento = 'aprovacao_reembolso' THEN IF vale THEN r := ev.decisao; ELSE r_caiu := true; END IF;
    ELSE IF vale THEN a := ev.decisao; ELSE a_caiu := true; END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('reembolso', to_jsonb(r), 'relatado', to_jsonb(a), 'reembolso_caiu', r_caiu, 'relatado_caiu', a_caiu);
END
$fn$;

-- ── 3) os anexos que PROVAM, sem as declarações que não valem mais ───────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_tipos_validos(p_quitacao uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; tipos text[]; mudanca timestamptz; gerada boolean; vale boolean;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN '{}'::text[]; END IF;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  SELECT max(e.em) INTO mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento IN ('alterada', 'declaracao_invalidada');
  gerada := EXISTS (SELECT 1 FROM public.fin_declaracoes_terceiro d WHERE d.quitacao_id = q.id);

  IF 'declaracao_terceiro' = ANY(tipos) THEN
    IF gerada THEN
      vale := public.fin_declaracao_estado(q.id) = 'assinada';                                           -- a via mais nova, igual ao registro de hoje, com a assinatura
    ELSE                                                                                                  -- declaração externa: só vale se veio depois da última alteração dos dados declarados
      SELECT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
                      WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND a.tipo = 'declaracao_terceiro' AND a.enviado_em > COALESCE(mudanca, '-infinity')) INTO vale;
    END IF;
    IF NOT vale THEN tipos := array_remove(tipos, 'declaracao_terceiro'); END IF;
  END IF;
  IF 'pedido_reembolso' = ANY(tipos) THEN
    SELECT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
                    WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND a.tipo = 'pedido_reembolso' AND a.enviado_em > COALESCE(mudanca, '-infinity')) INTO vale;
    IF NOT vale THEN tipos := array_remove(tipos, 'pedido_reembolso'); END IF;
  END IF;
  RETURN tipos;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_grau_conjunto(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; tipos text[]; g jsonb;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  tipos := public.fin_quitacao_tipos_validos(q.id);
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  RETURN CASE LEAST(CASE g->>'responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END, CASE g->>'intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END)
              WHEN 2 THEN 'formal' WHEN 1 THEN 'relatado' ELSE 'nenhum' END;
END
$fn$;

-- fin_quitacao_entrada: a definição da Matriz de Ofertas (commit ad7fddf) com UMA troca — os tipos de anexo vêm de fin_quitacao_tipos_validos (só as declarações que ainda valem)
CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  tipos := public.fin_quitacao_tipos_validos(q.id);                 -- só as declarações que ainda valem (Fase 2A)
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
    'chave_informada', (chave IS NOT NULL AND btrim(chave) <> ''), 'chave_valida', (chave IS NOT NULL AND public.fin_nfe_chave_valida(chave)), 'chave_confere_com_emitente', confere,
    'terceiro_no_circuito', no_circuito, 'terceiro_ministro', ministro, 'empresa_com_pagamentos_12m', com_pagamentos,
    'intencao_alterada_recentemente', alterada, 'pede_recibo_fiscal', q.pede_recibo, 'oferta_com_condicao', (q.condicao IS NOT NULL),
    'dias_entre_pagamento_e_declaracao', CASE WHEN q.declarado_em IS NOT NULL AND q.pago_em IS NOT NULL THEN to_jsonb(q.declarado_em - q.pago_em) ELSE 'null'::jsonb END,
    'acumulado_ano_do_terceiro', acumulado, 'qtd_relatadas_no_trimestre', relatadas, 'periodo_aprovado', periodo, 'formalizacao_vencida', vencida,
    'aprovado_pelo_administrador', (ap->>'relatado' = 'aprovada'),
    'teto_1', par.teto_1, 'prazo_declaracao_dias', par.prazo_declaracao_dias, 'teto_anual_terceiro', par.teto_anual_terceiro,
    'qtd_relatadas_trimestre', par.qtd_relatadas_trimestre, 'limite_capitalizacao', to_jsonb(par.limite_capitalizacao));
END
$function$;

-- ── 4) a trilha imutável das edições de TODOS os lançamentos ──────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_lancamento_historico (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id        uuid NOT NULL,                                       -- sem FK: é história (o lançamento pode ser excluído)
  campo                text NOT NULL CHECK (campo IN ('valor', 'data', 'fornecedor', 'favorecido', 'categoria', 'centro_custo', 'projeto', 'conta', 'documento_numero', 'nf_chave_acesso')),
  antes                text,
  depois               text,
  antes_rotulo         text,                                                -- o nome na hora (fornecedor, categoria, centro, projeto, conta): continua legível se for renomeado
  depois_rotulo        text,
  motivo               text,
  invalidou_declaracao boolean NOT NULL DEFAULT false,
  por                  uuid,
  por_nome             text,                                                -- o nome na hora: a tabela de perfis só deixa cada um ler o próprio
  em                   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS fin_lancamento_historico_lanc_idx ON public.fin_lancamento_historico (lancamento_id, em);
COMMENT ON TABLE public.fin_lancamento_historico IS 'Trilha imutável (só acrescenta) das edições de valor, data, fornecedor, favorecido, categoria, centro, projeto, conta, número e chave da nota de QUALQUER lançamento: antes, depois, quem (identificador e nome na hora), quando e o motivo. Alimentada só pelo gatilho fin_lanc_historico_declaracao.';

CREATE OR REPLACE FUNCTION public.fin_lancamento_historico_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'O histórico de edição do lançamento só acrescenta: não se altera nem se apaga.'; END $fn$;
DROP TRIGGER IF EXISTS fin_lancamento_historico_imutavel ON public.fin_lancamento_historico;
CREATE TRIGGER fin_lancamento_historico_imutavel BEFORE UPDATE OR DELETE ON public.fin_lancamento_historico FOR EACH ROW EXECUTE FUNCTION public.fin_lancamento_historico_imutavel();

ALTER TABLE public.fin_lancamento_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_lancamento_historico_leitura ON public.fin_lancamento_historico;
CREATE POLICY fin_lancamento_historico_leitura ON public.fin_lancamento_historico FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de escrita: só o gatilho (SECURITY DEFINER) grava

-- ── 5) o canal do motivo e os nomes ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS motivo_edicao text;
COMMENT ON COLUMN public.fin_lancamentos.motivo_edicao IS 'CANAL DE PASSAGEM, nunca fica gravado: a tela envia o motivo da edição no mesmo UPDATE; o gatilho fin_lanc_historico_declaracao o lê, o leva para a trilha e zera a coluna.';

CREATE OR REPLACE FUNCTION public.fin_nome_do_usuario(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(NULLIF(btrim(p.nome), ''), NULLIF(btrim(m.nome_completo), ''))
    FROM public.profiles p LEFT JOIN public.membros m ON m.id = p.pessoa_id WHERE p.id = p_id
$fn$;

CREATE OR REPLACE FUNCTION public.fin_nomes_dos_usuarios(p_ids uuid[]) RETURNS TABLE (id uuid, nome text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RETURN; END IF;
  RETURN QUERY SELECT u, public.fin_nome_do_usuario(u) FROM unnest(p_ids) u;
END
$fn$;

-- ── 6) o que, no lançamento, a Declaração declara ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_campos_declarados_alterados(o public.fin_lancamentos, n public.fin_lancamentos) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $fn$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(o.valor_original, o.valor) IS DISTINCT FROM COALESCE(n.valor_original, n.valor) THEN 'valor' END,
    CASE WHEN o.fornecedor_id    IS DISTINCT FROM n.fornecedor_id    THEN 'emitente (fornecedor)' END,
    CASE WHEN o.documento_numero IS DISTINCT FROM n.documento_numero THEN 'número da nota' END,
    CASE WHEN o.nf_chave_acesso  IS DISTINCT FROM n.nf_chave_acesso  THEN 'chave da nota' END,
    CASE WHEN o.data             IS DISTINCT FROM n.data             THEN 'data da nota' END], NULL)
$fn$;

-- ── 7) o gatilho: trilha para todos, motivo e invalidação onde há declaração ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_lanc_historico_declaracao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid := (SELECT auth.uid());
  motivo text := NULLIF(btrim(COALESCE(NEW.motivo_edicao, '')), '');
  nome text; campos text[]; q public.fin_quitacoes%ROWTYPE; tem_decl boolean := false; invalida boolean := false;
  divisao boolean := OLD.valor_original IS NULL AND NEW.valor_original IS NOT NULL AND NEW.valor_original = OLD.valor;     -- baixa parcial/total: o valor vira o pago, o original fica guardado
BEGIN
  NEW.motivo_edicao := NULL;                                                                                       -- o canal nunca fica gravado
  nome := CASE WHEN uid IS NULL THEN 'rotina do sistema' ELSE COALESCE(public.fin_nome_do_usuario(uid), 'usuário sem nome cadastrado') END;

  campos := public.fin_campos_declarados_alterados(OLD, NEW);
  IF cardinality(campos) > 0 THEN
    SELECT * INTO q FROM public.fin_quitacoes WHERE obrigacao_id = NEW.id AND intencao IN ('reembolso', 'oferta');
    IF FOUND THEN
      tem_decl := EXISTS (SELECT 1 FROM public.fin_declaracoes_terceiro d WHERE d.quitacao_id = q.id)
               OR EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
                           WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND a.tipo IN ('declaracao_terceiro', 'pedido_reembolso'))
               OR EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento IN ('aprovacao_reembolso', 'aprovacao_relatado'));
      IF tem_decl THEN
        invalida := true;
        IF uid IS NOT NULL AND (motivo IS NULL OR char_length(motivo) < 5) THEN
          RAISE EXCEPTION 'Esta alteração (%) invalidará a declaração atual e cancelará quaisquer aprovações relacionadas. Informe o motivo (pelo menos 5 caracteres) para confirmar.', array_to_string(campos, ', ');
        END IF;
        INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, para, motivo, por)
        VALUES (q.id, NEW.id, 'declaracao_invalidada',
                jsonb_build_object('campos', to_jsonb(campos), 'valor', COALESCE(OLD.valor_original, OLD.valor), 'fornecedor_id', OLD.fornecedor_id, 'documento_numero', OLD.documento_numero, 'nf_chave_acesso', OLD.nf_chave_acesso, 'data', OLD.data),
                jsonb_build_object('campos', to_jsonb(campos), 'valor', COALESCE(NEW.valor_original, NEW.valor), 'fornecedor_id', NEW.fornecedor_id, 'documento_numero', NEW.documento_numero, 'nf_chave_acesso', NEW.nf_chave_acesso, 'data', NEW.data),
                COALESCE(motivo, 'rotina sem motivo informado'), uid);
      END IF;
    END IF;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor AND NOT divisao THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, motivo, invalidou_declaracao, por, por_nome)
    VALUES (NEW.id, 'valor', OLD.valor::text, NEW.valor::text, motivo, invalida AND 'valor' = ANY(campos), uid, nome);
  END IF;
  IF OLD.data IS DISTINCT FROM NEW.data THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, motivo, invalidou_declaracao, por, por_nome)
    VALUES (NEW.id, 'data', OLD.data::text, NEW.data::text, motivo, invalida AND 'data da nota' = ANY(campos), uid, nome);
  END IF;
  IF OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, invalidou_declaracao, por, por_nome)
    VALUES (NEW.id, 'fornecedor', OLD.fornecedor_id::text, NEW.fornecedor_id::text, (SELECT f.nome FROM public.fin_fornecedores f WHERE f.id = OLD.fornecedor_id),
            (SELECT f.nome FROM public.fin_fornecedores f WHERE f.id = NEW.fornecedor_id), motivo, invalida AND 'emitente (fornecedor)' = ANY(campos), uid, nome);
  END IF;
  IF OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, por, por_nome)
    VALUES (NEW.id, 'favorecido', OLD.pessoa_id::text, NEW.pessoa_id::text, (SELECT m.nome_completo FROM public.membros m WHERE m.id = OLD.pessoa_id),
            (SELECT m.nome_completo FROM public.membros m WHERE m.id = NEW.pessoa_id), motivo, uid, nome);
  END IF;
  IF OLD.categoria_id IS DISTINCT FROM NEW.categoria_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, por, por_nome)
    VALUES (NEW.id, 'categoria', OLD.categoria_id::text, NEW.categoria_id::text, (SELECT c.nome FROM public.fin_categorias c WHERE c.id = OLD.categoria_id),
            (SELECT c.nome FROM public.fin_categorias c WHERE c.id = NEW.categoria_id), motivo, uid, nome);
  END IF;
  IF OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, por, por_nome)
    VALUES (NEW.id, 'centro_custo', OLD.centro_custo_id::text, NEW.centro_custo_id::text, (SELECT c.nome FROM public.fin_centros_custo c WHERE c.id = OLD.centro_custo_id),
            (SELECT c.nome FROM public.fin_centros_custo c WHERE c.id = NEW.centro_custo_id), motivo, uid, nome);
  END IF;
  IF OLD.projeto_id IS DISTINCT FROM NEW.projeto_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, por, por_nome)
    VALUES (NEW.id, 'projeto', OLD.projeto_id::text, NEW.projeto_id::text, (SELECT p.nome FROM public.fin_projetos p WHERE p.id = OLD.projeto_id),
            (SELECT p.nome FROM public.fin_projetos p WHERE p.id = NEW.projeto_id), motivo, uid, nome);
  END IF;
  IF OLD.conta_id IS DISTINCT FROM NEW.conta_id THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, antes_rotulo, depois_rotulo, motivo, por, por_nome)
    VALUES (NEW.id, 'conta', OLD.conta_id::text, NEW.conta_id::text, (SELECT c.nome FROM public.fin_contas c WHERE c.id = OLD.conta_id),
            (SELECT c.nome FROM public.fin_contas c WHERE c.id = NEW.conta_id), motivo, uid, nome);
  END IF;
  IF OLD.documento_numero IS DISTINCT FROM NEW.documento_numero THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, motivo, invalidou_declaracao, por, por_nome)
    VALUES (NEW.id, 'documento_numero', OLD.documento_numero, NEW.documento_numero, motivo, invalida AND 'número da nota' = ANY(campos), uid, nome);
  END IF;
  IF OLD.nf_chave_acesso IS DISTINCT FROM NEW.nf_chave_acesso THEN
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, motivo, invalidou_declaracao, por, por_nome)
    VALUES (NEW.id, 'nf_chave_acesso', OLD.nf_chave_acesso, NEW.nf_chave_acesso, motivo, invalida AND 'chave da nota' = ANY(campos), uid, nome);
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_historico_declaracao ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_historico_declaracao BEFORE UPDATE ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.motivo_edicao IS NOT NULL OR OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id
                     OR OLD.projeto_id IS DISTINCT FROM NEW.projeto_id OR OLD.conta_id IS DISTINCT FROM NEW.conta_id OR OLD.documento_numero IS DISTINCT FROM NEW.documento_numero
                     OR OLD.nf_chave_acesso IS DISTINCT FROM NEW.nf_chave_acesso OR OLD.valor_original IS DISTINCT FROM NEW.valor_original)
  EXECUTE FUNCTION public.fin_lanc_historico_declaracao();

-- depois da edição, a oferta é reavaliada NA HORA (a declaração deixou de valer: a extinção por oferta pode ter de ser desfeita; o agendador faria o mesmo, mas só depois)
CREATE OR REPLACE FUNCTION public.fin_lanc_declaracao_sincroniza() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = NEW.id AND q.intencao = 'oferta') THEN
    BEGIN
      PERFORM public.fin_quitacao_sincronizar(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Edição gravada, mas não consegui reavaliar a oferta da obrigação %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_declaracao_sincroniza ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_declaracao_sincroniza AFTER UPDATE OF valor, valor_original, data, fornecedor_id, documento_numero, nf_chave_acesso ON public.fin_lancamentos
  FOR EACH ROW WHEN (COALESCE(OLD.valor_original, OLD.valor) IS DISTINCT FROM COALESCE(NEW.valor_original, NEW.valor) OR OLD.data IS DISTINCT FROM NEW.data OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.documento_numero IS DISTINCT FROM NEW.documento_numero OR OLD.nf_chave_acesso IS DISTINCT FROM NEW.nf_chave_acesso)
  EXECUTE FUNCTION public.fin_lanc_declaracao_sincroniza();

-- ── 8) o projeto também congela depois do envio à contabilidade ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE it record; campos text[] := '{}';
BEGIN
  SELECT i.ano, i.mes INTO it FROM public.fin_malote_itens i WHERE i.lancamento_id = OLD.id AND i.reaberto_em IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e não pode ser excluída. Para isso, um Administrador ou a Tesouraria precisa reabri-la, com motivo.', lpad(it.mes::text, 2, '0'), it.ano;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN campos := array_append(campos, 'valor'); END IF;
  IF OLD.data IS DISTINCT FROM NEW.data THEN campos := array_append(campos, 'data (vencimento)'); END IF;
  IF OLD.categoria_id IS DISTINCT FROM NEW.categoria_id THEN campos := array_append(campos, 'categoria'); END IF;
  IF OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id THEN campos := array_append(campos, 'centro de custo'); END IF;
  IF OLD.projeto_id IS DISTINCT FROM NEW.projeto_id THEN campos := array_append(campos, 'projeto'); END IF;
  IF OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN campos := array_append(campos, 'favorecido'); END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN campos := array_append(campos, 'tipo'); END IF;
  IF OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro') THEN campos := array_append(campos, 'situação do pagamento'); END IF;
  IF array_length(campos, 1) IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e está congelada: não se altera %. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)',
    lpad(it.mes::text, 2, '0'), it.ano, array_to_string(campos, ', ');
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, projeto_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.projeto_id IS DISTINCT FROM NEW.projeto_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();

-- ── 9) a pergunta da tela, ANTES de salvar: o que esta edição invalidaria? ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_impacto_edicao(p_lancamento uuid, p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE o public.fin_lancamentos%ROWTYPE; n public.fin_lancamentos%ROWTYPE; q public.fin_quitacoes%ROWTYPE; campos text[]; estado text; tem_aprov boolean := false; tem_decl boolean := false;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT * INTO o FROM public.fin_lancamentos WHERE id = p_lancamento;
  IF NOT FOUND THEN RETURN jsonb_build_object('invalida', false, 'campos', '[]'::jsonb); END IF;
  n := jsonb_populate_record(o, p_patch);
  campos := public.fin_campos_declarados_alterados(o, n);
  SELECT * INTO q FROM public.fin_quitacoes WHERE obrigacao_id = o.id AND intencao IN ('reembolso', 'oferta');
  IF NOT FOUND OR cardinality(campos) = 0 THEN RETURN jsonb_build_object('invalida', false, 'campos', to_jsonb(campos)); END IF;
  estado := public.fin_declaracao_estado(q.id);
  tem_aprov := EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento IN ('aprovacao_reembolso', 'aprovacao_relatado'));
  tem_decl := estado <> 'sem_declaracao' OR tem_aprov;
  RETURN jsonb_build_object('invalida', tem_decl, 'campos', to_jsonb(campos), 'declaracao_estado', estado, 'derruba_aprovacoes', tem_aprov);
END
$fn$;

-- ── 10) permissões ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_selo(uuid), public.fin_quitacao_tipos_validos(uuid), public.fin_quitacao_aprovacoes(uuid), public.fin_quitacao_grau_conjunto(uuid),
  public.fin_nome_do_usuario(uuid), public.fin_nomes_dos_usuarios(uuid[]), public.fin_impacto_edicao(uuid, jsonb), public.fin_campos_declarados_alterados(public.fin_lancamentos, public.fin_lancamentos) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_selo(uuid), public.fin_quitacao_tipos_validos(uuid), public.fin_quitacao_aprovacoes(uuid), public.fin_quitacao_grau_conjunto(uuid),
  public.fin_nomes_dos_usuarios(uuid[]), public.fin_impacto_edicao(uuid, jsonb) TO authenticated;
GRANT SELECT ON public.fin_lancamento_historico TO authenticated;

  $mig$;

  -- 1) nada do que já existe mudou de resultado
  FOR r IN SELECT id FROM public.fin_quitacoes ORDER BY id LOOP
    a := jsonb_build_object('avaliacao', public.fin_quitacao_avaliar(public.fin_quitacao_entrada(r.id)), 'conjunto', public.fin_quitacao_grau_conjunto(r.id), 'aprov', public.fin_quitacao_aprovacoes(r.id));
    IF (antes->(r.id::text)->'avaliacao'->>'suficiente')::boolean AND NOT (a->'avaliacao'->>'suficiente')::boolean THEN regressoes := regressoes + 1; END IF;
    IF (antes->(r.id::text)->'avaliacao') IS DISTINCT FROM (a->'avaliacao') OR (antes->(r.id::text)->>'conjunto') IS DISTINCT FROM (a->>'conjunto')
       OR (antes->(r.id::text)->'aprov'->'reembolso') IS DISTINCT FROM (a->'aprov'->'reembolso') OR (antes->(r.id::text)->'aprov'->'relatado') IS DISTINCT FROM (a->'aprov'->'relatado') THEN
      mudaram := mudaram + 1; lista := lista || ' [' || left(r.id::text, 8) || ']';
    END IF;
  END LOOP;
  IF regressoes = 0 AND mudaram = 0 THEN rel := rel || ' 1 ok (as ' || total || ' quitação(ões) reais seguem com a MESMA avaliação, o MESMO grau e as MESMAS aprovações).';
  ELSIF regressoes = 0 THEN rel := rel || ' 1 ATENÇÃO (nenhuma piorou, mas ' || mudaram || ' mudaram:' || lista || ').';
  ELSE ok := false; rel := rel || ' FALHOU 1: ' || regressoes || ' quitação(ões) real(is) piorou(aram):' || lista || '.'; END IF;

  -- 2) a regra, com dados de teste (tudo desfeito no fim)
  BEGIN
    passo := 'fixtures';
    adm := (SELECT user_id FROM public.user_roles WHERE role::text = 'admin' LIMIT 1);
    PERFORM set_config('request.jwt.claim.sub', adm::text, true);
    SELECT id INTO forn FROM public.fin_fornecedores ORDER BY id LIMIT 1;
    SELECT id INTO forn2 FROM public.fin_fornecedores WHERE id <> forn ORDER BY id LIMIT 1;
    SELECT id INTO cat FROM public.fin_categorias WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;
    SELECT id INTO cen FROM public.fin_centros_custo ORDER BY id LIMIT 1;
    SELECT id INTO conta FROM public.fin_contas ORDER BY id LIMIT 1;
    SELECT responsavel_pessoa_id INTO pes FROM public.fin_quitacoes WHERE responsavel_pessoa_id IS NOT NULL ORDER BY id LIMIT 1;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, origem)
    VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO 2A', 'ENS-2A', forn, cat, cen, 'manual') RETURNING id INTO lid;
    qid := public.fin_registrar_quitacao(lid, 'pessoa', pes, NULL, 'oferta', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO', 'dinheiro');
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (lid, 'nota_fiscal', 'ens/nota.pdf'), (lid, 'prova_pagamento_terceiro', 'ens/prova.pdf');
    passo := 'declaração gerada e assinada';
    did := public.fin_gerar_declaracao_terceiro(qid);
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (lid, 'declaracao_terceiro', 'ens/assinada.pdf') RETURNING id INTO an;
    PERFORM public.fin_registrar_assinatura_declaracao(did, an, current_date - 1);
    est := public.fin_declaracao_estado(qid); g := public.fin_quitacao_entrada(qid)->>'grau_intencao';
    IF est = 'assinada' AND g = 'formal' AND public.fin_quitacao_grau_conjunto(qid) = 'formal' THEN rel := rel || ' 2a ok (assinada vale: intenção Formal).'; ELSE ok := false; rel := rel || ' FALHOU 2a (estado ' || est || ', intenção ' || g || ').'; END IF;

    passo := 'editar sem motivo';
    msg := NULL;
    BEGIN UPDATE public.fin_lancamentos SET valor = 120 WHERE id = lid; EXCEPTION WHEN OTHERS THEN msg := SQLERRM; END;
    IF msg LIKE '%invalidará a declaração atual e cancelará quaisquer aprovações relacionadas%' THEN rel := rel || ' 2b ok (editar a nota sem motivo é recusado com o aviso).'; ELSE ok := false; rel := rel || ' FALHOU 2b (' || COALESCE(msg, 'sem erro') || ').'; END IF;

    passo := 'editar com motivo';
    UPDATE public.fin_lancamentos SET valor = 120, motivo_edicao = 'ensaio: nota corrigida' WHERE id = lid;
    est := public.fin_declaracao_estado(qid); g := public.fin_quitacao_entrada(qid)->>'grau_intencao';
    SELECT count(*) INTO cnt FROM public.fin_quitacao_eventos WHERE quitacao_id = qid AND evento = 'declaracao_invalidada';
    SELECT * INTO hist FROM public.fin_lancamento_historico WHERE lancamento_id = lid AND campo = 'valor';
    IF est = 'desatualizada' AND g = 'relatado' AND cnt = 1 AND hist.invalidou_declaracao AND hist.antes::numeric = 100 AND hist.depois::numeric = 120 AND hist.motivo = 'ensaio: nota corrigida'
       AND (SELECT motivo_edicao FROM public.fin_lancamentos WHERE id = lid) IS NULL
    THEN rel := rel || ' 2c ok (com motivo: a declaração fica desatualizada, o Formal cai, o evento e a trilha são gravados).'; ELSE ok := false; rel := rel || ' FALHOU 2c (estado ' || est || ', intenção ' || g || ', eventos ' || cnt || ').'; END IF;

    passo := 'aprovação';
    did := public.fin_gerar_declaracao_terceiro(qid);
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (lid, 'declaracao_terceiro', 'ens/assinada2.pdf') RETURNING id INTO an;
    PERFORM public.fin_registrar_assinatura_declaracao(did, an, current_date - 1);
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, decisao, motivo, por) VALUES (qid, lid, 'aprovacao_relatado', 'aprovada', 'ensaio: justificativa longa', adm);
    ap := public.fin_quitacao_aprovacoes(qid);
    IF ap->>'relatado' = 'aprovada' THEN rel := rel || ' 2d ok (a aprovação nasce vigente).'; ELSE ok := false; rel := rel || ' FALHOU 2d (' || ap::text || ').'; END IF;
    UPDATE public.fin_lancamentos SET fornecedor_id = forn2, motivo_edicao = 'ensaio: emitente trocado' WHERE id = lid;
    ap := public.fin_quitacao_aprovacoes(qid);
    IF ap->>'relatado' IS NULL AND (ap->>'relatado_caiu')::boolean THEN rel := rel || ' 2e ok (trocar o fornecedor derruba a aprovação).'; ELSE ok := false; rel := rel || ' FALHOU 2e (' || ap::text || ').'; END IF;
    did := public.fin_gerar_declaracao_terceiro(qid);
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (lid, 'declaracao_terceiro', 'ens/assinada3.pdf') RETURNING id INTO an;
    PERFORM public.fin_registrar_assinatura_declaracao(did, an, current_date - 1);
    ap := public.fin_quitacao_aprovacoes(qid);
    IF ap->>'relatado' IS NULL AND public.fin_declaracao_estado(qid) = 'assinada' THEN rel := rel || ' 2f ok (a nova via assinada NÃO ressuscita a aprovação).'; ELSE ok := false; rel := rel || ' FALHOU 2f (' || ap::text || ').'; END IF;

    passo := 'trilha de qualquer lançamento';
    SELECT id INTO cat2 FROM public.fin_categorias WHERE tipo::text = 'saida' AND id <> cat ORDER BY id LIMIT 1;
    IF cat2 IS NULL THEN
      rel := rel || ' 2g ATENÇÃO (só existe uma categoria de saída: a trilha de categoria não foi exercitada).';
    ELSE
    UPDATE public.fin_lancamentos SET categoria_id = cat2 WHERE id = lid;
    SELECT * INTO hist FROM public.fin_lancamento_historico WHERE lancamento_id = lid AND campo = 'categoria';
    IF hist.antes_rotulo IS NOT NULL AND hist.depois_rotulo IS NOT NULL AND hist.por = adm AND hist.por_nome IS NOT NULL THEN rel := rel || ' 2g ok (categoria: ' || hist.antes_rotulo || ' → ' || hist.depois_rotulo || ', por ' || hist.por_nome || ').';
    ELSE ok := false; rel := rel || ' FALHOU 2g (rótulos ou nome em branco).'; END IF;
    END IF;

    passo := 'nomes e impacto';
    SELECT count(*) INTO cnt FROM public.fin_nomes_dos_usuarios(ARRAY[adm]) WHERE nome IS NOT NULL AND btrim(nome) <> '';
    IF cnt = 1 THEN rel := rel || ' 2h ok (o nome do Administrador vem pela função).'; ELSE rel := rel || ' 2h ATENÇÃO (o Administrador não tem nome nem no perfil nem na pessoa vinculada).'; END IF;
    a := public.fin_impacto_edicao(lid, '{"valor": 999}'::jsonb);
    IF (a->>'invalida')::boolean AND a->'campos'->>0 = 'valor' THEN rel := rel || ' 2i ok (a pergunta da tela responde: mudar o valor invalida).'; ELSE ok := false; rel := rel || ' FALHOU 2i (' || a::text || ').'; END IF;
  EXCEPTION WHEN OTHERS THEN
    ok := false; rel := rel || ' FALHOU no passo "' || passo || '": ' || SQLERRM || '.';
  END;

  -- 3) o projeto congela e os gatilhos estão no lugar
  IF position('projeto_id' IN (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'fin_lanc_congela_atualizar' AND NOT tgisinternal)) > 0
     AND position('projeto' IN pg_get_functiondef('public.fin_lanc_congela_enviada()'::regprocedure)) > 0
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fin_lanc_historico_declaracao' AND NOT tgisinternal)
  THEN rel := rel || ' 3 ok (o projeto congela depois do envio; o gatilho da trilha está no lugar).'; ELSE ok := false; rel := rel || ' FALHOU 3.'; END IF;

  RAISE EXCEPTION 'RESULTADO DO ENSAIO (nada foi gravado): %', CASE WHEN ok THEN 'TUDO OK.' ELSE 'HÁ FALHAS.' END || rel;
END
$ens$;
