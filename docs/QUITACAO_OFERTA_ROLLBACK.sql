-- ROLLBACK — devolve as três funções à definição de antes da revisão da Matriz para ofertas (lidas do banco em 15/10/2026). Nenhum dado é tocado.
CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
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
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.fin_decidir_quitacao(p_quitacao uuid, p_tipo text, p_decisao text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não há o que decidir.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: só a reabertura permite uma nova decisão.'; END IF;
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
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- aprovar o Relatado pode extinguir a oferta
END
$function$;
