-- ─── ENSAIO: baixar as 12 obrigações pagas que ficaram abertas por duplicidade ─────────────────────────────────
-- Roda tudo e DESFAZ (ROLLBACK). NADA fica gravado. O resultado (JSON) traz a tabela dos 12 casos, a quantificação e as verificações.
--
-- O problema (auditoria de 08/10/2026): o caminho "Confirmar" da Mesa de Conciliação criou um lançamento NOVO para o pagamento e não baixou
-- a obrigação prevista; dois pagamentos foram lançados à mão (JMN e FGTS). Resultado: a obrigação segue "aberta" na Mesa de Operações e o
-- pagamento existe em duplicidade. Para cada um dos 12 pares (obrigação prevista × lançamento duplicado, mesmo valor, mesmo pagamento):
--   1. mantém a OBRIGAÇÃO original (com recorrência, modelo, forma de liquidação);
--   2. cria a LIQUIDAÇÃO (fin_liquidacoes) ligada ao OFX do pagamento;
--   3. baixa a obrigação: status `conciliado`, data do pagamento, liquidacao_id/obrigacao_id — exatamente como `fin_liquidar` faz;
--   4. remove o lançamento DUPLICADO (anexos, comprovante, projeto e favorecido dele migram para a obrigação se ela não os tem).
-- Os 4 casos de valor DIFERENTE (Cbd, Ana Patricia, Denise, Carlos Eduardo) ficam de fora.
--
-- Segurança (tudo na MESMA transação):
--   · só age se encontrar EXATAMENTE os 12 pares revisados (os 12 FITIDs do OFX abaixo); qualquer diferença aborta;
--   · cópia de segurança dos 24 lançamentos (12 obrigações como eram + 12 duplicados) em `fin_lancamentos_baixa_backup_20261008`;
--   · o saldo de NENHUMA conta pode mudar (a obrigação paga entra no saldo e o duplicado sai, com o mesmo valor); idem a quantidade e a
--     soma dos lançamentos realizados/conciliados por conta; se algo mudar, ABORTA;
--   · confere os vínculos OFX (1 liquidação por FITID), as conciliações (12 obrigações `conciliado`) e a visão de obrigações.

BEGIN;

-- fotografia do que NÃO pode mudar
CREATE TEMP TABLE _saldos_antes ON COMMIT DROP AS SELECT id, saldo_atual FROM public.fin_contas;
CREATE TEMP TABLE _reais_antes ON COMMIT DROP AS
  SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
    FROM public.fin_lancamentos WHERE status IN ('realizado', 'conciliado') GROUP BY conta_id;
CREATE TEMP TABLE _atrasadas_antes ON COMMIT DROP AS
  SELECT count(*) AS n, coalesce(sum(valor), 0) AS soma FROM public.fin_lancamentos
   WHERE status = 'previsto' AND tipo = 'saida' AND data < (now() AT TIME ZONE 'America/Sao_Paulo')::date;

-- 1. os pares: obrigação prevista atrasada × pagamento já gravado (mesma conta, valor IDÊNTICO, até 7 dias de diferença,
--    mesmo favorecido — ou o pagamento sem favorecido, que é o caso dos PIX para pessoas lançados pelo Confirmar)
CREATE TEMP TABLE _cand ON COMMIT DROP AS
SELECT o.id AS o_id, d.id AS d_id, abs(d.data - o.data) AS dias,
       coalesce(substring(d.observacoes from '\[ofx:([^\]]+)\]'), m.fitid) AS fitid
  FROM public.fin_lancamentos o
  JOIN public.fin_lancamentos d
    ON d.tipo = 'saida' AND d.status = 'conciliado' AND d.origem IN ('importado_ofx', 'manual')
   AND d.conta_id = o.conta_id AND d.valor = o.valor AND d.liquidacao_id IS NULL
   AND abs(d.data - o.data) <= 7
   AND ((o.fornecedor_id IS NOT NULL AND d.fornecedor_id = o.fornecedor_id)
     OR (o.pessoa_id IS NOT NULL AND d.pessoa_id = o.pessoa_id)
     OR (d.fornecedor_id IS NULL AND d.pessoa_id IS NULL))
  -- os dois pagos à mão não carregam a marca do OFX: o FITID foi identificado na revisão (valor + data da linha do extrato)
  LEFT JOIN (VALUES (300.00::numeric, 'N10FAB'), (713.21::numeric, 'N114D9')) AS m(valor, fitid) ON d.origem = 'manual' AND m.valor = d.valor
 WHERE o.tipo = 'saida' AND o.status = 'previsto' AND o.origem = 'recorrencia'
   AND o.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date;

CREATE TEMP TABLE _pares ON COMMIT DROP AS
  SELECT DISTINCT ON (o_id) o_id, d_id, fitid, dias FROM _cand ORDER BY o_id, dias, d_id;
-- cada duplicado serve a um só par (o de menor diferença de dias)
DELETE FROM _pares p WHERE EXISTS (
  SELECT 1 FROM _pares q WHERE q.d_id = p.d_id AND (q.dias < p.dias OR (q.dias = p.dias AND q.o_id < p.o_id)));

-- 2. a trava: só segue com EXATAMENTE os 12 casos revisados
DO $$
DECLARE
  n int; achados text[];
  esperados text[] := ARRAY['N10F7F','N10FAB','N10F95','N10FC1','N10FD7','N1136D','N1146B','N114D9','N11A25','N11CDD','N11F2D','N11D09'];
BEGIN
  SELECT count(*), array_agg(fitid ORDER BY fitid) INTO n, achados FROM _pares;
  IF n <> 12 THEN RAISE EXCEPTION 'Encontrei % pares (esperado 12) — abortando', n; END IF;
  IF EXISTS (SELECT 1 FROM _pares WHERE fitid IS NULL) THEN RAISE EXCEPTION 'Há par sem FITID do OFX — abortando'; END IF;
  IF achados IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(esperados) x) THEN
    RAISE EXCEPTION 'Os pares encontrados (%) diferem dos 12 revisados — abortando', achados;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_liquidacoes l JOIN _pares p ON l.ofx_fitid = p.fitid) THEN
    RAISE EXCEPTION 'Algum desses FITIDs já tem liquidação — abortando';
  END IF;
  -- o duplicado não pode ter nada preso a ele além dos anexos (que migram)
  IF EXISTS (SELECT 1 FROM _pares p WHERE
        EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = p.d_id)
     OR EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = p.d_id)
     OR EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = p.d_id)
     OR EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = p.d_id)
     OR EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = p.d_id)
     OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = p.d_id OR x.lancamento_pai_id = p.d_id)) THEN
    RAISE EXCEPTION 'Algum lançamento duplicado tem vínculos (rateio, folha, fiscal, estoque…) — abortando';
  END IF;
END $$;

-- 3. a tabela dos 12 casos, ANTES de mexer
CREATE TEMP TABLE _tabela ON COMMIT DROP AS
SELECT jsonb_build_object(
         'obrigacao', coalesce(f.nome, m.nome_completo, o.descricao),
         'recorrencia', o.descricao,
         'valor', o.valor, 'vencimento', o.data,
         'duplicado_valor', d.valor, 'duplicado_data', d.data, 'duplicado_origem', d.origem,
         'ofx', p.fitid,
         'classificacao', CASE WHEN o.categoria_id IS NOT DISTINCT FROM d.categoria_id AND o.centro_custo_id IS NOT DISTINCT FROM d.centro_custo_id
                               THEN 'igual' ELSE 'difere (fica a da obrigação)' END,
         'status_apos', 'conciliado e liquidado; duplicado removido') AS linha, o.data AS vencimento
  FROM _pares p
  JOIN public.fin_lancamentos o ON o.id = p.o_id
  JOIN public.fin_lancamentos d ON d.id = p.d_id
  LEFT JOIN public.fin_fornecedores f ON f.id = o.fornecedor_id
  LEFT JOIN public.membros m ON m.id = o.pessoa_id;

-- 4. backup (só quem tem acesso total ao banco lê: RLS ligada, sem política)
CREATE TABLE IF NOT EXISTS public.fin_lancamentos_baixa_backup_20261008 AS
  SELECT *, ''::text AS papel FROM public.fin_lancamentos WHERE false;
ALTER TABLE public.fin_lancamentos_baixa_backup_20261008 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_lancamentos_baixa_backup_20261008 FROM anon, authenticated;
INSERT INTO public.fin_lancamentos_baixa_backup_20261008
  SELECT l.*, 'obrigacao' FROM public.fin_lancamentos l JOIN _pares p ON p.o_id = l.id
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos_baixa_backup_20261008 b WHERE b.id = l.id);
INSERT INTO public.fin_lancamentos_baixa_backup_20261008
  SELECT l.*, 'duplicado' FROM public.fin_lancamentos l JOIN _pares p ON p.d_id = l.id
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos_baixa_backup_20261008 b WHERE b.id = l.id);

-- 5. a liquidação de cada pagamento, ligada ao OFX
CREATE TEMP TABLE _liq ON COMMIT DROP AS
SELECT p.o_id, p.d_id, p.fitid, gen_random_uuid() AS liq_id, d.conta_id,
       coalesce(d.data_pagamento, d.data) AS dia, d.valor, d.forma_pagamento
  FROM _pares p JOIN public.fin_lancamentos d ON d.id = p.d_id;

INSERT INTO public.fin_liquidacoes (id, conta_id, data_pagamento, forma_pagamento, valor_total, ofx_fitid, observacoes)
SELECT liq_id, conta_id, dia, forma_pagamento, valor, fitid,
       'Baixa da obrigação ligada ao pagamento já conciliado do OFX (correção de 08/10/2026)' FROM _liq;

-- 6. migra o que o duplicado tem e a obrigação não (anexos, comprovante, projeto, favorecido)
UPDATE public.fin_lancamento_anexos a SET lancamento_id = q.o_id FROM _liq q WHERE a.lancamento_id = q.d_id;

-- 7. baixa a obrigação (como `fin_liquidar`): conciliada, data do pagamento, liquidação e obrigação ligadas
DO $$
DECLARE n int;
BEGIN
  UPDATE public.fin_lancamentos o
     SET status = 'conciliado', data_pagamento = q.dia, valor_original = coalesce(o.valor_original, o.valor),
         obrigacao_id = o.id, liquidacao_id = q.liq_id, componente = 'principal',
         forma_pagamento = coalesce(o.forma_pagamento, q.forma_pagamento),
         comprovante_url = coalesce(o.comprovante_url, d.comprovante_url),
         projeto_id = coalesce(o.projeto_id, d.projeto_id),
         fornecedor_id = coalesce(o.fornecedor_id, d.fornecedor_id),
         pessoa_id = coalesce(o.pessoa_id, d.pessoa_id),
         observacoes = concat_ws(E'\n', nullif(o.observacoes, ''), '[ofx:' || q.fitid || '] [baixa-por-ofx]')
    FROM _liq q JOIN public.fin_lancamentos d ON d.id = q.d_id
   WHERE o.id = q.o_id AND o.status = 'previsto';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 12 THEN RAISE EXCEPTION 'Baixei % obrigações (esperado 12) — abortando', n; END IF;
END $$;

-- 8. remove o duplicado
DO $$
DECLARE n int;
BEGIN
  DELETE FROM public.fin_lancamentos WHERE id IN (SELECT d_id FROM _liq);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 12 THEN RAISE EXCEPTION 'Removi % duplicados (esperado 12) — abortando', n; END IF;
END $$;

-- 9. verificações: qualquer diferença ABORTA e desfaz tudo
DO $$
DECLARE n_saldo int; n_reais int; n_liq int; n_baixadas int; n_marca int; n_view int; atr_n bigint; atr_soma numeric; esp_n bigint; esp_soma numeric;
BEGIN
  SELECT count(*) INTO n_saldo FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual;
  IF n_saldo > 0 THEN RAISE EXCEPTION 'O saldo de % conta(s) mudou — abortando', n_saldo; END IF;

  SELECT count(*) INTO n_reais FROM (
    SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
      FROM public.fin_lancamentos WHERE status IN ('realizado', 'conciliado') GROUP BY conta_id) d
    FULL JOIN _reais_antes a USING (conta_id)
   WHERE d.n IS DISTINCT FROM a.n OR d.soma IS DISTINCT FROM a.soma;
  IF n_reais > 0 THEN RAISE EXCEPTION 'Lançamentos realizados/conciliados mudaram (quantidade ou soma) em % conta(s) — abortando', n_reais; END IF;

  -- vínculos OFX: exatamente 1 liquidação por FITID, cada uma ligada a UMA obrigação conciliada
  SELECT count(*) INTO n_liq FROM _liq q WHERE (SELECT count(*) FROM public.fin_liquidacoes l WHERE l.conta_id = q.conta_id AND l.ofx_fitid = q.fitid) = 1;
  IF n_liq <> 12 THEN RAISE EXCEPTION 'Vínculos OFX: só % dos 12 FITIDs têm exatamente uma liquidação — abortando', n_liq; END IF;
  SELECT count(*) INTO n_baixadas FROM _liq q JOIN public.fin_lancamentos o ON o.id = q.o_id
   WHERE o.status = 'conciliado' AND o.liquidacao_id = q.liq_id AND o.obrigacao_id = o.id;
  IF n_baixadas <> 12 THEN RAISE EXCEPTION 'Conciliações: só % das 12 obrigações ficaram conciliadas e ligadas — abortando', n_baixadas; END IF;
  -- cada FITID aparece na marca de UM só lançamento (o da obrigação): o duplicado se foi
  SELECT count(*) INTO n_marca FROM _liq q WHERE (SELECT count(*) FROM public.fin_lancamentos l WHERE l.conta_id = q.conta_id AND l.observacoes LIKE '%[ofx:' || q.fitid || ']%') = 1;
  IF n_marca <> 12 THEN RAISE EXCEPTION 'Marca do OFX: só % dos 12 FITIDs aparecem em um único lançamento — abortando', n_marca; END IF;
  -- a visão de obrigações enxerga todas como pagas integralmente
  SELECT count(*) INTO n_view FROM _liq q JOIN public.vw_fin_obrigacoes v ON v.obrigacao_id = q.o_id WHERE v.situacao = 'pago_integralmente';
  IF n_view <> 12 THEN RAISE EXCEPTION 'Visão de obrigações: só % das 12 constam como pagas integralmente — abortando', n_view; END IF;

  -- a quantificação bate com o esperado
  SELECT count(*), coalesce(sum(valor), 0) INTO atr_n, atr_soma FROM public.fin_lancamentos
   WHERE status = 'previsto' AND tipo = 'saida' AND data < (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT n - 12, soma - (SELECT sum(valor) FROM _liq) INTO esp_n, esp_soma FROM _atrasadas_antes;
  IF atr_n <> esp_n OR atr_soma <> esp_soma THEN RAISE EXCEPTION 'Atrasadas depois (% / %) diferem do esperado (% / %) — abortando', atr_n, atr_soma, esp_n, esp_soma; END IF;
END $$;

-- o resultado (abra o JSON): a tabela dos 12, a quantificação e as verificações
SELECT jsonb_pretty(jsonb_build_object(
  'tabela_dos_12_casos', (SELECT jsonb_agg(linha ORDER BY vencimento, linha ->> 'obrigacao') FROM _tabela),
  'quantificacao', jsonb_build_object(
      'atrasadas_hoje',        (SELECT n FROM _atrasadas_antes),
      'atrasadas_apos',        (SELECT count(*) FROM public.fin_lancamentos WHERE status = 'previsto' AND tipo = 'saida' AND data < (now() AT TIME ZONE 'America/Sao_Paulo')::date),
      'valor_atrasado_hoje',   (SELECT soma FROM _atrasadas_antes),
      'valor_atrasado_apos',   (SELECT coalesce(sum(valor), 0) FROM public.fin_lancamentos WHERE status = 'previsto' AND tipo = 'saida' AND data < (now() AT TIME ZONE 'America/Sao_Paulo')::date),
      'valor_baixado',         (SELECT sum(valor) FROM _liq)),
  'backup', jsonb_build_object('linhas', (SELECT count(*) FROM public.fin_lancamentos_baixa_backup_20261008)),
  'verificacoes', jsonb_build_object(
      'saldos_alterados',      (SELECT count(*) FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual),
      'liquidacoes_criadas',   (SELECT count(*) FROM _liq),
      'duplicados_removidos',  12,
      'resultado',             'todas as verificações passaram')
)) AS resultado;

ROLLBACK;
