-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261008200000 (juros, multa e complemento viram atributos da obrigação) contra os dados REAIS ─────────────
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda a migration inteira (colunas, fin_liquidar, view, incorporação dos
-- lançamentos de encargo que já existem) e confere que NADA do que importa mudou: saldos de todas as contas, total gasto, os juros/multas somados
-- pela view e a distribuição das situações (Previsto, Em Aberto, Pago...). Se algo divergir, a mensagem diz FALHOU e você NÃO aplica.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true;
  n_comp_antes int; n_lanc_antes bigint; j_antes numeric; m_antes numeric; c_antes numeric; a_antes numeric; gasto_antes numeric;
  n_comp_depois int; n_lanc_depois bigint; j_depois numeric; m_depois numeric; c_depois numeric; a_depois numeric; gasto_depois numeric;
  sit_antes text; sit_depois text; saldos_antes text; saldos_depois text;
BEGIN
  -- ── antes ──
  SELECT count(*) INTO n_comp_antes FROM public.fin_lancamentos WHERE componente IN ('juros','multa','complemento','ajuste');
  SELECT count(*) INTO n_lanc_antes FROM public.fin_lancamentos;
  SELECT COALESCE(sum(juros),0), COALESCE(sum(multa),0), COALESCE(sum(complemento),0), COALESCE(sum(ajuste),0) INTO j_antes, m_antes, c_antes, a_antes FROM public.vw_fin_obrigacoes;
  SELECT COALESCE(sum(valor),0) INTO gasto_antes FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado','conciliado');
  SELECT string_agg(situacao || '=' || n, ', ' ORDER BY situacao) INTO sit_antes FROM (SELECT situacao, count(*) n FROM public.vw_fin_obrigacoes GROUP BY situacao) s;
  SELECT string_agg(id::text || ':' || saldo_atual::text, ', ' ORDER BY id) INTO saldos_antes FROM public.fin_contas;
  rel := format('ANTES: %s lançamentos de encargo existentes; %s lançamentos no total; juros %s · multa %s · complemento %s · ajuste %s; total gasto (saídas pagas) %s; situações: %s.',
                n_comp_antes, n_lanc_antes, j_antes, m_antes, c_antes, a_antes, gasto_antes, sit_antes);

  -- ── a migration inteira ──
  -- comando 1 da migration
  EXECUTE $mig$ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS juros      numeric(14,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),
  ADD COLUMN IF NOT EXISTS multa      numeric(14,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  ADD COLUMN IF NOT EXISTS complemento numeric(14,2) NOT NULL DEFAULT 0 CHECK (complemento >= 0),
  ADD COLUMN IF NOT EXISTS ajuste     numeric(14,2) NOT NULL DEFAULT 0 CHECK (ajuste >= 0),
  ADD COLUMN IF NOT EXISTS motivo_diferenca text$mig$;
  -- comando 2 da migration
  EXECUTE $mig$COMMENT ON COLUMN public.fin_lancamentos.juros IS 'Juros pagos junto com esta obrigação (parte de `valor`). Preenchido por fin_liquidar.'$mig$;
  -- comando 3 da migration
  EXECUTE $mig$COMMENT ON COLUMN public.fin_lancamentos.multa IS 'Multa paga junto com esta obrigação (parte de `valor`). Preenchido por fin_liquidar.'$mig$;
  -- comando 4 da migration
  EXECUTE $mig$COMMENT ON COLUMN public.fin_lancamentos.complemento IS 'Pago a mais, voluntário, junto com esta obrigação (parte de `valor`).'$mig$;
  -- comando 5 da migration
  EXECUTE $mig$COMMENT ON COLUMN public.fin_lancamentos.ajuste IS 'Diferença sem outra explicação (parte de `valor`); exige motivo_diferenca.'$mig$;
  -- comando 6 da migration
  EXECUTE $mig$COMMENT ON COLUMN public.fin_lancamentos.motivo_diferenca IS 'Por que o valor pago difere do documento (obrigatório quando há ajuste).'$mig$;
  -- comando 7 da migration
  EXECUTE $mig$CREATE OR REPLACE FUNCTION public.fin_liquidar(
  p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor_total numeric,
  p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  liq uuid; it jsonb; en jsonb; l public.fin_lancamentos%ROWTYPE;
  v_pago numeric; v_desc numeric; v_saldo numeric; v_orig numeric; v_raiz uuid; v_total numeric := 0; n int;
  v_tipo text; v_valor numeric; v_id uuid;
  v_juros numeric; v_multa numeric; v_compl numeric; v_ajuste numeric; v_motivo text; v_enc numeric;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'Informe ao menos um documento a pagar.'; END IF;

  -- todo encargo precisa apontar para um documento desta mesma liquidação (o encargo é atributo DELE, não um lançamento solto)
  FOR en IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    v_tipo := en->>'tipo'; v_valor := round((en->>'valor')::numeric, 2);
    IF v_tipo NOT IN ('juros', 'multa', 'complemento', 'ajuste') THEN RAISE EXCEPTION 'Tipo de encargo desconhecido: %.', v_tipo; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de % inválido.', v_tipo; END IF;
    IF v_tipo = 'ajuste' AND COALESCE(btrim(en->>'motivo'), '') = '' THEN RAISE EXCEPTION 'Ajuste manual exige o motivo da diferença.'; END IF;
    v_id := (en->>'lancamento_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE (i->>'lancamento_id')::uuid = v_id) THEN
      RAISE EXCEPTION 'O % de % não aponta para nenhum dos documentos desta liquidação.', v_tipo, v_valor;
    END IF;
  END LOOP;

  INSERT INTO public.fin_liquidacoes (conta_id, data_pagamento, forma_pagamento, valor_total, comprovante_url, ofx_fitid, observacoes)
  VALUES (p_conta_id, p_data, p_forma, p_valor_total, p_comprovante_url, p_ofx_fitid, p_observacoes)
  RETURNING id INTO liq;

  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = (it->>'lancamento_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento % não encontrado.', it->>'lancamento_id'; END IF;
    IF l.tipo <> 'saida' OR l.status <> 'previsto' THEN RAISE EXCEPTION 'O lançamento % não está previsto para pagamento (status %).', l.id, l.status; END IF;
    v_pago := (it->>'valor_pago')::numeric; v_desc := COALESCE((it->>'desconto')::numeric, 0);
    IF v_pago IS NULL OR v_pago <= 0 THEN RAISE EXCEPTION 'Valor pago inválido para o lançamento %.', l.id; END IF;
    v_saldo := l.valor - v_pago - v_desc;
    IF v_saldo < -0.004 THEN RAISE EXCEPTION 'Pago (%) + desconto (%) passa do valor da obrigação (%): o que passa é juros, multa ou complemento — informe como encargo.', v_pago, v_desc, l.valor; END IF;
    v_orig := COALESCE(l.valor_original, l.valor); v_raiz := COALESCE(l.obrigacao_id, l.id);

    -- os encargos deste documento
    SELECT COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'juros'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'multa'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'complemento'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'ajuste'), 0),
           NULLIF(string_agg(NULLIF(btrim(e->>'motivo'), ''), ' · '), '')
      INTO v_juros, v_multa, v_compl, v_ajuste, v_motivo
      FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) e WHERE (e->>'lancamento_id')::uuid = l.id;
    v_enc := v_juros + v_multa + v_compl + v_ajuste;

    IF v_saldo > 0.004 THEN  -- baixa parcial: o que falta continua previsto, com a mesma classificação e o mesmo vencimento
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_competencia, valor, valor_original, descricao, categoria_id,
        centro_custo_id, projeto_id, fornecedor_id, pessoa_id, forma_pagamento, documento_numero, observacoes, origem, campanha_missionaria,
        valor_variavel, obrigacao_id, componente)
      VALUES (l.conta_id, 'saida', 'previsto', l.data, l.data_competencia, round(v_saldo, 2), v_orig, l.descricao, l.categoria_id,
        l.centro_custo_id, l.projeto_id, l.fornecedor_id, l.pessoa_id, l.forma_pagamento, l.documento_numero, l.observacoes, l.origem, l.campanha_missionaria,
        l.valor_variavel, v_raiz, 'principal');
      -- (recorrencia_id/parcela_* NÃO são copiados: o gerador de recorrências continua vendo o mês como já gerado pelo lançamento pago)
    END IF;

    -- UM lançamento por obrigação: `valor` = tudo o que saiu do banco por ela (principal + encargos)
    UPDATE public.fin_lancamentos
       SET status = 'realizado', data_pagamento = p_data, valor = round(v_pago + v_enc, 2), desconto = round(v_desc, 2),
           juros = v_juros, multa = v_multa, complemento = v_compl, ajuste = v_ajuste,
           motivo_diferenca = COALESCE(v_motivo, motivo_diferenca),
           valor_original = v_orig, obrigacao_id = v_raiz, liquidacao_id = liq, componente = 'principal',
           conta_id = p_conta_id,
           forma_pagamento = COALESCE(p_forma, forma_pagamento), comprovante_url = COALESCE(p_comprovante_url, comprovante_url)
     WHERE id = l.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Não consegui gravar a baixa do lançamento % (permissão?).', l.id; END IF;
    v_total := v_total + round(v_pago + v_enc, 2);
  END LOOP;

  IF abs(v_total - round(p_valor_total, 2)) > 0.004 THEN
    RAISE EXCEPTION 'Documentos + encargos somam % e o pagamento foi de %: explique a diferença (% ).', v_total, round(p_valor_total, 2), round(p_valor_total, 2) - v_total;
  END IF;
  RETURN liq;
END
$fn$$mig$;
  -- comando 8 da migration
  EXECUTE $mig$COMMENT ON FUNCTION public.fin_liquidar IS 'Liquida um ou mais documentos: baixa total/parcial e grava desconto, juros, multa, complemento e ajuste (com motivo) COMO CAMPOS do lançamento do documento — um lançamento por obrigação. Tudo ou nada; recusa se a soma não fechar com o valor pago.'$mig$;
  -- comando 9 da migration
  EXECUTE $mig$DROP VIEW IF EXISTS public.vw_fin_obrigacoes$mig$;
  -- comando 10 da migration
  EXECUTE $mig$CREATE VIEW public.vw_fin_obrigacoes WITH (security_invoker = true) AS
WITH base AS (
  SELECT COALESCE(l.obrigacao_id, l.id) AS grupo_id, l.*
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
),
agg AS (
  SELECT grupo_id AS obrigacao_id,
         COALESCE(MAX(valor_original) FILTER (WHERE componente = 'principal'),
                  SUM(valor - juros - multa - complemento - ajuste + desconto) FILTER (WHERE componente = 'principal' AND status <> 'cancelado'), 0) AS valor_original,
         COALESCE(SUM(valor - juros - multa - complemento - ajuste) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0) AS pago_principal,
         COALESCE(SUM(desconto) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)                                    AS desconto,
         COALESCE(SUM(juros)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'juros'       AND status IN ('realizado','conciliado')), 0)                                AS juros,
         COALESCE(SUM(multa)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'multa'       AND status IN ('realizado','conciliado')), 0)                                AS multa,
         COALESCE(SUM(complemento) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'complemento' AND status IN ('realizado','conciliado')), 0)                                AS complemento,
         COALESCE(SUM(ajuste)      FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'ajuste'      AND status IN ('realizado','conciliado')), 0)                                AS ajuste,
         MIN(data) FILTER (WHERE componente = 'principal' AND status = 'previsto')                                                                      AS vencimento_pendente,
         MIN(data) FILTER (WHERE componente = 'principal')                                                                                              AS vencimento,
         BOOL_AND(status = 'cancelado')                                                                                                                 AS tudo_cancelado,
         MAX(data_pagamento)                                                                                                                            AS ultimo_pagamento,
         (ARRAY_AGG(id ORDER BY data) FILTER (WHERE componente = 'principal' AND status = 'previsto'))[1]                                               AS id_pendente
    FROM base GROUP BY grupo_id
)
SELECT a.obrigacao_id,
       a.valor_original, a.pago_principal, a.desconto, a.juros, a.multa, a.complemento, a.ajuste,
       GREATEST(a.valor_original - a.pago_principal - a.desconto, 0)                       AS saldo_pendente,
       a.pago_principal + a.juros + a.multa + a.complemento + a.ajuste                     AS total_pago,
       CASE
         WHEN a.tudo_cancelado THEN 'cancelado'
         WHEN a.pago_principal = 0 AND a.juros + a.multa + a.complemento + a.ajuste = 0
              THEN CASE WHEN COALESCE(a.vencimento_pendente, a.vencimento) < CURRENT_DATE THEN 'em_aberto' ELSE 'previsto' END
         WHEN a.valor_original - a.pago_principal - a.desconto > 0.009                      THEN 'pago_parcialmente'
         WHEN a.desconto + a.juros + a.multa + a.complemento + a.ajuste > 0                 THEN 'pago_com_diferenca'
         ELSE 'pago_integralmente'
       END                                                                                 AS situacao,
       a.vencimento_pendente, a.vencimento, a.ultimo_pagamento, a.id_pendente,
       COALESCE(a.ultimo_pagamento, a.vencimento_pendente, a.vencimento)                   AS referencia,
       r.descricao, r.fornecedor_id, r.categoria_id, r.centro_custo_id, r.conta_id
  FROM agg a
  LEFT JOIN public.fin_lancamentos r ON r.id = a.obrigacao_id$mig$;
  -- comando 11 da migration
  EXECUTE $mig$COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, cancelado. Juros, multa, complemento, ajuste e desconto são CAMPOS do lançamento do documento (soma também lançamentos de encargo legados). security_invoker: vale a RLS de fin_lancamentos.'$mig$;
  -- comando 12 da migration
  EXECUTE $mig$REVOKE ALL ON public.vw_fin_obrigacoes FROM PUBLIC, anon$mig$;
  -- comando 13 da migration
  EXECUTE $mig$GRANT SELECT ON public.vw_fin_obrigacoes TO authenticated$mig$;
  -- comando 14 da migration
  EXECUTE $mig$REVOKE EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) FROM PUBLIC, anon$mig$;
  -- comando 15 da migration
  EXECUTE $mig$GRANT  EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) TO authenticated$mig$;
  -- comando 16 da migration
  EXECUTE $mig$DO $incorporar$
DECLARE c RECORD; alvo uuid; incorporados int := 0;
BEGIN
  FOR c IN SELECT * FROM public.fin_lancamentos WHERE componente IN ('juros', 'multa', 'complemento', 'ajuste') ORDER BY created_at LOOP
    SELECT id INTO alvo FROM public.fin_lancamentos p
     WHERE p.componente = 'principal' AND p.liquidacao_id IS NOT DISTINCT FROM c.liquidacao_id AND c.liquidacao_id IS NOT NULL
       AND COALESCE(p.obrigacao_id, p.id) = COALESCE(c.obrigacao_id, c.id) AND p.status IN ('realizado', 'conciliado')
     ORDER BY p.created_at LIMIT 1;
    IF alvo IS NULL THEN
      RAISE EXCEPTION 'O encargo % (%) não encontrou o documento da sua liquidação — nada foi incorporado.', c.id, c.componente;
    END IF;
    EXECUTE format('UPDATE public.fin_lancamentos SET valor = valor + $1, %I = %I + $1, motivo_diferenca = COALESCE(motivo_diferenca, $2) WHERE id = $3', c.componente, c.componente)
      USING c.valor, c.observacoes, alvo;
    DELETE FROM public.fin_lancamentos WHERE id = c.id;
    incorporados := incorporados + 1;
  END LOOP;
  RAISE NOTICE 'Encargos incorporados ao documento: %', incorporados;
END
$incorporar$$mig$;

  -- ── depois ──
  SELECT count(*) INTO n_comp_depois FROM public.fin_lancamentos WHERE componente IN ('juros','multa','complemento','ajuste');
  SELECT count(*) INTO n_lanc_depois FROM public.fin_lancamentos;
  SELECT COALESCE(sum(juros),0), COALESCE(sum(multa),0), COALESCE(sum(complemento),0), COALESCE(sum(ajuste),0) INTO j_depois, m_depois, c_depois, a_depois FROM public.vw_fin_obrigacoes;
  SELECT COALESCE(sum(valor),0) INTO gasto_depois FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado','conciliado');
  SELECT string_agg(situacao || '=' || n, ', ' ORDER BY situacao) INTO sit_depois FROM (SELECT situacao, count(*) n FROM public.vw_fin_obrigacoes GROUP BY situacao) s;
  SELECT string_agg(id::text || ':' || saldo_atual::text, ', ' ORDER BY id) INTO saldos_depois FROM public.fin_contas;
  rel := rel || format(E'\nDEPOIS: %s lançamentos de encargo restantes; %s lançamentos no total; juros %s · multa %s · complemento %s · ajuste %s; total gasto %s; situações: %s.',
                n_comp_depois, n_lanc_depois, j_depois, m_depois, c_depois, a_depois, gasto_depois, sit_depois);

  -- ── conferências ──
  rel := rel || E'\n';
  IF n_comp_depois <> 0 THEN ok := false; rel := rel || E'\nFALHOU — ainda restam lançamentos de encargo.'; ELSE rel := rel || E'\nOK — nenhum lançamento de encargo restou (foram incorporados aos documentos).'; END IF;
  IF n_lanc_depois <> n_lanc_antes - n_comp_antes THEN ok := false; rel := rel || format(E'\nFALHOU — o total de lançamentos deveria cair %s e caiu %s.', n_comp_antes, n_lanc_antes - n_lanc_depois); ELSE rel := rel || format(E'\nOK — o total de lançamentos caiu exatamente %s.', n_comp_antes); END IF;
  IF (j_antes, m_antes, c_antes, a_antes) IS DISTINCT FROM (j_depois, m_depois, c_depois, a_depois) THEN ok := false; rel := rel || E'\nFALHOU — a view soma juros/multa/complemento/ajuste diferente.'; ELSE rel := rel || E'\nOK — a view soma exatamente os mesmos juros, multas, complementos e ajustes.'; END IF;
  IF gasto_antes <> gasto_depois THEN ok := false; rel := rel || E'\nFALHOU — o total gasto mudou.'; ELSE rel := rel || E'\nOK — o total gasto (saídas pagas) é o mesmo.'; END IF;
  IF sit_antes IS DISTINCT FROM sit_depois THEN ok := false; rel := rel || E'\nFALHOU — a distribuição das situações mudou.'; ELSE rel := rel || E'\nOK — a distribuição das situações é a mesma.'; END IF;
  IF saldos_antes IS DISTINCT FROM saldos_depois THEN ok := false; rel := rel || E'\nFALHOU — algum saldo de conta mudou.'; ELSE rel := rel || E'\nOK — os saldos de todas as contas são os mesmos.'; END IF;

  RAISE EXCEPTION E'ENSAIO CONCLUÍDO — nada foi gravado (isto é um erro de propósito):\n%\n\n%', rel,
    CASE WHEN ok THEN 'RESULTADO: tudo OK — pode aplicar.' ELSE 'RESULTADO: há FALHAS — NÃO aplique.' END;
END
$ensaio$;
