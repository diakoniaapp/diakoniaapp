-- ─── CONTA CORRENTE DE SUSTENTO — carga inicial (ENSAIO: termina em ROLLBACK; NÃO é migration) ────────────────────
-- Pré-requisito: a migration 20261008170000_sustento_conta_corrente.sql já aplicada (ela só cria 4 tabelas novas e uma visão).
-- O que este roteiro faz: cadastra os dois beneficiários, as competências de agosto e setembro/2026 do Pastor Titular, e LIGA a
-- elas os lançamentos que já existem (PIX de adiantamento, pagamento do líquido).
-- QUEM USA a conta corrente é decidido pela forma de receber, não pelo cargo (revisão dela, 08/10/2026): o Pastor Titular tem o
-- "Controle por competência" LIGADO (recebe com adiantamento e saldo); o Pastor Missionário é cadastrado com ele DESLIGADO — segue
-- pago pela recorrência de sempre, sem competência, e nada dele é ligado aqui. Para ligar depois: a chave na tela, ou
-- UPDATE public.sustento_beneficiarios SET controle_por_competencia = true WHERE id = '…'.
-- TIPO DE CONTROLE: ambos nascem em "automatico" (o padrão). Cada competência carregada guarda o modo com que nasceu — as do titular
-- são 'avancado' (RSP com rubricas, adiantamentos) — e o app resolve o Automático só para as PRÓXIMAS. O ensaio também prova duas
-- proteções do banco: (1) o histórico de quem alterou o controle é gravado pelo gatilho; (2) o modo de uma competência com
-- movimento não pode ser trocado.
-- O que NÃO faz: não altera, não apaga e não cria nenhum lançamento; não toca em saldo, recorrência ou OFX. Só insere nas
-- tabelas sustento_*. O bloco de verificação compara fin_lancamentos antes e depois e ABORTA se qualquer coisa mudou.
--
-- Como usar: rode inteiro no SQL Editor. Termina em ROLLBACK — nada fica gravado; o resultado é o quadro de conferência.
-- Só depois de ela ver o quadro e dizer "pode aplicar", trocar o ROLLBACK final por COMMIT.
--
-- OS IDs DOS LANÇAMENTOS foram lidos em 08/10/2026 (todos conciliados, conta Bradesco 9c6730f9…):
--   Pastor Titular (Lucio Paulo Paz Barreto)
--     13/08 R$ 8.000  e8f093b5…  adiantamento · agosto        (Omie)
--     20/08 R$ 2.300  44914b07…  adiantamento · agosto        (Omie, "PIX … L cio P")
--     01/09 R$ 3.429  d9d0dad4…  pagamento final · agosto     (OFX N10403)   → líquido de agosto pago em 01/09
--     09/09 R$ 4.000  f817dfcc…  adiantamento · setembro      (OFX N10EBB)
--     15/09 R$ 4.000  aff731e7…  adiantamento · setembro      (OFX N1136D)
--   A recorrência previsto de 05/10 (R$ 2.362, 9810ed42…) e o previsto de 15/09 (R$ 4.000, 009c50dd…) NÃO são ligados: a
--   Fase 2 decide o destino das obrigações; aqui nada previsto é tocado.
-- Os pagamentos de R$ 2.362 do Pastor Missionário (03/08 a27f8356…, 01/09 c28cb1bb…) ficam como estão: sem controle por competência,
-- nada é ligado a eles.

BEGIN;

-- foto de fin_lancamentos ANTES (contagem, soma e um resumo de todas as linhas)
CREATE TEMP TABLE _antes ON COMMIT DROP AS
  SELECT count(*) AS n, COALESCE(sum(valor), 0) AS soma,
         md5(string_agg(id::text || '|' || valor::text || '|' || status || '|' || coalesce(categoria_id::text, '') || '|' || coalesce(pessoa_id::text, ''),
                        ',' ORDER BY id)) AS resumo
    FROM public.fin_lancamentos;
CREATE TEMP TABLE _saldos_antes ON COMMIT DROP AS SELECT id, saldo_atual FROM public.fin_contas;

DO $carga$
DECLARE
  v_conta   uuid := '9c6730f9-89a5-4112-b040-1cce5a5d77b3';
  v_cat     uuid := (SELECT id FROM public.fin_categorias WHERE nome = 'Prebenda' LIMIT 1);
  v_lucio   uuid := (SELECT id FROM public.membros WHERE nome_completo = 'Lucio Paulo Paz Barreto' LIMIT 1);
  v_alex    uuid := (SELECT id FROM public.membros WHERE nome_completo = 'Alexandre Lourenço Silva' LIMIT 1);
  b_titular uuid; b_missio uuid; c_ago_t uuid; c_set_t uuid;
BEGIN
  IF v_cat IS NULL OR v_lucio IS NULL OR v_alex IS NULL THEN
    RAISE EXCEPTION 'cadastro não encontrado (categoria Prebenda: %, Lucio: %, Alexandre: %) — abortado', v_cat, v_lucio, v_alex;
  END IF;

  INSERT INTO public.sustento_beneficiarios (tipo, nome_exibicao, pessoa_id, conta_id, categoria_id, dia_do_liquido, controle_por_competencia)
    VALUES ('pastor_titular', 'Lucio Paulo Paz Barreto — Pastor Titular', v_lucio, v_conta, v_cat, 5, true) RETURNING id INTO b_titular;
  INSERT INTO public.sustento_beneficiarios (tipo, nome_exibicao, pessoa_id, conta_id, categoria_id, dia_do_liquido, controle_por_competencia)
    VALUES ('pastor_missionario', 'Alexandre Lourenço Silva — Pastor Missionário', v_alex, v_conta, v_cat, 5, false) RETURNING id INTO b_missio;

  -- ── Pastor Titular · controle por competência ligado ──
  -- agosto: sem o RSP em mãos; o líquido previsto é o de setembro (13.728,00), "≈" — falta o RSP de agosto para fechar o centavo
  INSERT INTO public.sustento_competencias (beneficiario_id, competencia, status, modo, valor_previsto, fechada_em, observacoes)
    VALUES (b_titular, '2026-08-01', 'paga', 'avancado', 13728.00, now(), 'Carga inicial: líquido estimado pelo RSP de setembro; o RSP de agosto fecha o centavo (diferença de R$ 1,00).')
    RETURNING id INTO c_ago_t;
  INSERT INTO public.sustento_pagamentos (competencia_id, lancamento_id, tipo) VALUES
    (c_ago_t, 'e8f093b5-bf59-446f-8eea-587cad341e2a', 'adiantamento'),
    (c_ago_t, '44914b07-2cb5-4903-a3da-963cded86f82', 'adiantamento'),
    (c_ago_t, 'd9d0dad4-3dff-456f-bd6c-20447dd42e80', 'pagamento_final');

  -- setembro: o RSP está em mãos → fechada, com as rubricas
  INSERT INTO public.sustento_competencias (beneficiario_id, competencia, status, modo, fechada_em, observacoes)
    VALUES (b_titular, '2026-09-01', 'fechada', 'avancado', now(), 'Carga inicial a partir do RSP de setembro/2026.') RETURNING id INTO c_set_t;
  INSERT INTO public.sustento_itens (competencia_id, rubrica, descricao, natureza, valor, ordem) VALUES
    (c_set_t, 'sustento',       'Sustento pastoral',        'provento', 17451.84, 1),
    (c_set_t, 'arredondamento', 'Arredondamento (crédito)', 'provento',     0.48, 2),
    (c_set_t, 'irrf',           'IRRF',                     'desconto',  3723.55, 3),
    (c_set_t, 'arredondamento', 'Arredondamento (débito)',  'desconto',     0.77, 4);
  INSERT INTO public.sustento_pagamentos (competencia_id, lancamento_id, tipo) VALUES
    (c_set_t, 'f817dfcc-1ac5-4a3f-abfb-4819888ab36b', 'adiantamento'),
    (c_set_t, 'aff731e7-8a1f-42d2-be8b-da0dbf4cee25', 'adiantamento');

END
$carga$;

-- ─── quadro de conferência: o que a visão devolve ───────────────────────────────────────────────────────────────
SELECT nome_exibicao, to_char(competencia, 'MM/YYYY') AS competencia, status, modo,
       liquido_previsto, adiantamentos, pagamentos_finais, pagamentos_simples, saldo_a_pagar,
       CASE competencia
         WHEN '2026-09-01' THEN (liquido_previsto = 13728.00 AND adiantamentos = 8000.00 AND saldo_a_pagar = 5728.00)
         WHEN '2026-08-01' THEN (adiantamentos = 10300.00 AND pagamentos_finais = 3429.00 AND saldo_a_pagar = -1.00)
       END AS confere
  FROM public.vw_sustento_conta_corrente ORDER BY nome_exibicao, competencia;

-- ─── prova das duas proteções do banco ──────────────────────────────────────────────────────────────────────────
DO $prova$
DECLARE v_set uuid; v_titular uuid; n_hist int; falhou boolean := false;
BEGIN
  SELECT id INTO v_titular FROM public.sustento_beneficiarios WHERE tipo = 'pastor_titular';
  SELECT id INTO v_set FROM public.sustento_competencias WHERE beneficiario_id = v_titular AND competencia = '2026-09-01';

  -- (2) a competência de setembro já tem rubricas e pagamentos: trocar o modo tem de ser recusado
  BEGIN
    UPDATE public.sustento_competencias SET modo = 'simples' WHERE id = v_set;
  EXCEPTION WHEN OTHERS THEN falhou := true;
  END;
  IF NOT falhou THEN RAISE EXCEPTION 'ABORTADO: o banco deixou trocar o modo de uma competência com movimento'; END IF;

  -- (1) trocar o tipo de controle do titular gera uma linha no histórico (quem/quando); a competência existente não muda
  UPDATE public.sustento_beneficiarios SET tipo_controle = 'simples' WHERE id = v_titular;
  SELECT count(*) INTO n_hist FROM public.sustento_controle_historico
   WHERE beneficiario_id = v_titular AND tipo_controle_anterior = 'automatico' AND tipo_controle_novo = 'simples';
  IF n_hist <> 1 THEN RAISE EXCEPTION 'ABORTADO: o histórico de alteração não foi gravado (% linhas)', n_hist; END IF;
  IF (SELECT modo FROM public.sustento_competencias WHERE id = v_set) <> 'avancado' THEN
    RAISE EXCEPTION 'ABORTADO: a troca do tipo de controle reinterpretou uma competência existente';
  END IF;
  UPDATE public.sustento_beneficiarios SET tipo_controle = 'automatico' WHERE id = v_titular;   -- volta (e também fica registrado)
  RAISE NOTICE 'OK: modo imutável com movimento; histórico de controle gravado pelo gatilho';
END
$prova$;

SELECT b.nome_exibicao, h.tipo_controle_anterior, h.tipo_controle_novo, h.controle_anterior, h.controle_novo, h.alterado_por_nome, h.alterado_em
  FROM public.sustento_controle_historico h JOIN public.sustento_beneficiarios b ON b.id = h.beneficiario_id
 ORDER BY h.alterado_em, b.nome_exibicao;

-- ─── trava: nada em fin_lancamentos ou nos saldos pode ter mudado ───────────────────────────────────────────────
DO $trava$
DECLARE a record; d record; n_saldos int;
BEGIN
  SELECT * INTO a FROM _antes;
  SELECT count(*) AS n, COALESCE(sum(valor), 0) AS soma,
         md5(string_agg(id::text || '|' || valor::text || '|' || status || '|' || coalesce(categoria_id::text, '') || '|' || coalesce(pessoa_id::text, ''), ',' ORDER BY id)) AS resumo
    INTO d FROM public.fin_lancamentos;
  IF a.n <> d.n OR a.soma <> d.soma OR a.resumo <> d.resumo THEN
    RAISE EXCEPTION 'ABORTADO: fin_lancamentos mudou (antes % linhas / % — depois % / %)', a.n, a.soma, d.n, d.soma;
  END IF;
  SELECT count(*) INTO n_saldos FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual;
  IF n_saldos > 0 THEN RAISE EXCEPTION 'ABORTADO: % saldo(s) de conta mudaram', n_saldos; END IF;
  RAISE NOTICE 'OK: fin_lancamentos e saldos intactos (% lançamentos)', d.n;
END
$trava$;

SELECT 'fin_lancamentos e saldos intactos' AS trava, (SELECT n FROM _antes) AS lancamentos;

-- os dois beneficiários e a chave de cada um
SELECT nome_exibicao, tipo, controle_por_competencia AS controle_ligado, tipo_controle,
       (SELECT count(*) FROM public.sustento_competencias c WHERE c.beneficiario_id = b.id) AS competencias
  FROM public.sustento_beneficiarios b ORDER BY nome_exibicao;

ROLLBACK;   -- ← só trocar por COMMIT depois da conferência dela
