-- APLICAÇÃO DEFINITIVA da Fase 1C-c (BLOQUEIOS do malote e do fechamento) — só depois do "pode aplicar" dela. PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- GRAVA: 1 função nova (fin_quitacao_bloqueios) e atualiza fin_enviar_malote e fin_fechar_periodo. NENHUM dado é alterado. A vigência continua DESLIGADA: nada bloqueia até o Administrador ligá-la.
-- Idêntico a supabase/migrations/20261015110000. Pode rodar mais de uma vez. Para desfazer: docs/QUITACAO_1C_C_ROLLBACK.sql.
-- Antes de rodar: rode docs/QUITACAO_1C_C_ENSAIO.sql e confira "TUDO OK, pode aplicar".
-- ─── Fase 1C-c: os BLOQUEIOS — o que está sem resposta não passa despercebido no malote nem no fechamento (e a oferta passa a ser travada pelo período fechado) ───────────
-- Depende da 1A, do M0, da 1B e da 1C-a (aplicadas ANTES). Nenhum dado existente é alterado.
--
-- A regra (Política, seção 7; aprovada em 13/10/2026): uma despesa cuja quitação por terceiro está "A esclarecer" ou "Formalizar" não pode ser enviada à contabilidade nem entrar num período
-- fechado enquanto não tiver resposta. Mas NADA disso começa sozinho: tudo fica atrás da VIGÊNCIA (parâmetro `fin_quitacao_parametros.vigencia`). Vigência vazia (o estado de hoje e o estado
-- padrão) = a Política só INFORMA; nenhum malote e nenhum fechamento é recusado. A vigência só liga por decisão consciente do Administrador (fin_quitacao_parametros_alterar, com motivo,
-- que fica no histórico), e só vale para despesas COM DATA a partir dela — o passado nunca é bloqueado por esta Política.
--
-- O que esta migration faz:
--   1. `fin_quitacao_bloqueios(ini, fim)`: quantas despesas do intervalo estão bloqueando (a mesma conta de vw_fin_quitacao.bloqueia_fechamento — uma fonte só, a visão);
--   2. `fin_enviar_malote`: recusa o envio do mês se houver bloqueio (defesa NO SERVIDOR, não só na tela). O resto da função é idêntico ao do D6;
--   3. `fin_fechar_periodo`: (a) recusa fechar período com bloqueio; (b) passa a carimbar `fechamento_id` TAMBÉM nas obrigações `quitado_terceiro`, para o período fechado travá-las
--      (sem isso a oferta ficaria destravada num período fechado). Para o que já era carimbado (realizado e conciliado) o resultado é IDÊNTICO — o ensaio prova.
--   "Reembolso a pagar" e "Investigar" NÃO bloqueiam: são dívida conhecida / pergunta aberta, e aparecem como ATENÇÃO no checklist. (Se ela quiser que bloqueiem, é uma linha na visão.)
-- Reversível: docs/QUITACAO_1C_C_ROLLBACK.sql (devolve as duas funções ao D6 e ao Fase 6).

-- ── 1) quantas despesas do intervalo bloqueiam ────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_bloqueios(p_ini date, p_fim date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT count(*)::int FROM public.vw_fin_quitacao q WHERE q.bloqueia_fechamento AND q.data_despesa BETWEEN p_ini AND p_fim;
$fn$;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_bloqueios(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_bloqueios(date, date) TO authenticated;

-- ── 2) fin_enviar_malote: recusa o mês com bloqueio ────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_enviar_malote(p_ano int, p_mes int, p_dossies int DEFAULT 0, p_pendencias int DEFAULT 0, p_observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ini date; fim date; envio uuid; n int; bloqueios int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar o envio do malote.';
  END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano NOT BETWEEN 2020 AND 2099 THEN RAISE EXCEPTION 'Período inválido: %/%.', p_mes, p_ano; END IF;
  ini := make_date(p_ano, p_mes, 1); fim := (ini + interval '1 month' - interval '1 day')::date;

  -- a Política de compras por terceiros: com a vigência ligada, despesa A esclarecer ou Formalizar do mês não passa despercebida
  bloqueios := public.fin_quitacao_bloqueios(ini, fim);
  IF bloqueios > 0 THEN
    RAISE EXCEPTION 'Há % despesa(s) de %/% com quitação por terceiro sem resposta (A esclarecer ou Formalizar). Resolva-as antes de enviar o malote: quem pagou? qual era a intenção? falta o documento assinado?',
      bloqueios, lpad(p_mes::text, 2, '0'), p_ano;
  END IF;

  INSERT INTO public.fin_malote_envios (ano, mes, dossies, pendencias_documentos, observacao, enviado_por)
  VALUES (p_ano, p_mes, GREATEST(COALESCE(p_dossies, 0), 0), GREATEST(COALESCE(p_pendencias, 0), 0), p_observacao, (SELECT auth.uid()))
  RETURNING id INTO envio;

  -- as despesas do mês (a mesma regra do Pacote e do "Ciclo do mês": dia do pagamento, senão o vencimento) que estão PRONTAS neste instante
  INSERT INTO public.fin_malote_itens (envio_id, lancamento_id, obrigacao_id, ano, mes, valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, incluido_por)
  SELECT envio, l.id, COALESCE(l.obrigacao_id, l.id), p_ano, p_mes, l.valor, l.data, l.categoria_id, l.centro_custo_id, l.fornecedor_id, l.pessoa_id, (SELECT auth.uid())
    FROM public.vw_fin_ciclo v
    JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
   WHERE v.estado = 'pronta_para_malote'
     AND ((l.data_pagamento BETWEEN ini AND fim) OR (l.data_pagamento IS NULL AND l.data BETWEEN ini AND fim))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.fin_malote_envios SET despesas = n WHERE id = envio;
  RETURN envio;
END
$fn$;

-- ── 3) fin_fechar_periodo: recusa o período com bloqueio e passa a travar também a oferta ──────────────────────────────────────────────────────────
-- Idêntica à da Fase 6, com DUAS diferenças: a recusa (só com a vigência ligada) e o carimbo nas `quitado_terceiro` (a oferta é despesa do período e tem de ficar travada nele).
-- O saldo_final continua somando só realizado/conciliado: a oferta não moveu caixa nem banco.
CREATE OR REPLACE FUNCTION public.fin_fechar_periodo(p_fechamento_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_fech record;
  v_data_inicio date;
  v_data_fim date;
  v_saldo_inicial numeric(14,2);
  v_movimento numeric(14,2);
  v_bloqueios int;
BEGIN
  SELECT * INTO v_fech FROM public.fin_fechamentos_periodo WHERE id = p_fechamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado'; END IF;
  IF v_fech.status NOT IN ('aberto', 'em_revisao') THEN
    RAISE EXCEPTION 'Período já está %', v_fech.status;
  END IF;

  v_data_inicio := make_date(v_fech.ano_inicio, v_fech.mes_inicio, 1);
  v_data_fim := (v_data_inicio + (v_fech.qtd_meses || ' months')::interval - interval '1 day')::date;

  v_bloqueios := public.fin_quitacao_bloqueios(v_data_inicio, v_data_fim);
  IF v_bloqueios > 0 THEN
    RAISE EXCEPTION 'Há % despesa(s) do período com quitação por terceiro sem resposta (A esclarecer ou Formalizar). Resolva-as antes de fechar: quem pagou? qual era a intenção? falta o documento assinado?', v_bloqueios;
  END IF;

  UPDATE public.fin_lancamentos
    SET fechamento_id = p_fechamento_id
    WHERE data BETWEEN v_data_inicio AND v_data_fim
      AND status::text IN ('realizado', 'conciliado', 'quitado_terceiro')
      AND fechamento_id IS NULL;

  SELECT coalesce(sum(saldo_inicial), 0) INTO v_saldo_inicial FROM public.fin_contas;
  SELECT coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) INTO v_movimento
    FROM public.fin_lancamentos
    WHERE data <= v_data_fim AND status IN ('realizado', 'conciliado');

  UPDATE public.fin_fechamentos_periodo
    SET status = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
        saldo_final = v_saldo_inicial + v_movimento
    WHERE id = p_fechamento_id;
END
$fn$;

