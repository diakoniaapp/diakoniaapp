-- ─── CONTA CORRENTE DE SUSTENTO — carga inicial (ENSAIO: não grava nada; NÃO é migration) ───────────────────────
-- Pré-requisito: a migration 20261008170000_sustento_conta_corrente.sql já aplicada (ela só cria tabelas novas e uma visão).
--
-- COMO FUNCIONA: é UM ÚNICO comando (um bloco DO) que carrega tudo, confere tudo e TERMINA SEMPRE COM UM ERRO de propósito —
-- "ENSAIO CONCLUÍDO (nada foi gravado)" seguido do quadro de conferência. Erro desfaz o comando inteiro, então nada fica gravado
-- em nenhum editor, com ou sem transação explícita. (A primeira versão usava BEGIN/ROLLBACK e tabelas temporárias entre vários
-- comandos; o SQL Editor do Supabase não segura isso de um comando para o outro: "relation _antes does not exist".)
-- Se aparecer "ABORTADO: …" em vez de "ENSAIO CONCLUÍDO", alguma conferência falhou — a mensagem diz qual.
--
-- O que o ensaio faz: cadastra os dois beneficiários, as competências de agosto e setembro/2026 de cada um, e LIGA a elas os
-- lançamentos que já existem (PIX de adiantamento, pagamento do líquido). Prova duas proteções do banco (histórico de quem
-- alterou gravado pelo gatilho; modo de competência com movimento imutável) e que fin_lancamentos e os saldos NÃO mudaram.
--
-- QUEM USA a conta corrente é decidido pela forma de receber, não pelo cargo (revisão dela, 08/10/2026). Os dois entram com o
-- "Controle por competência" LIGADO e o tipo de controle em Automático — o app resolve: titular → Avançado (adiantamentos e RSP),
-- missionário → Simples (só valor previsto, pago e saldo). Resultado esperado, validado por ela em 08/10/2026:
--   Pastor Titular · setembro/2026:     bruto 17.451,84 · IRRF 3.723,55 · adiantamentos 8.000,00 · saldo a pagar 5.728,00
--   Pastor Missionário · setembro/2026: valor 2.362,00 · pago 0,00 · saldo 2.362,00
-- A Carreta Missionária e a Cristolândia NÃO entram aqui (decisão dela): são projetos/ofertas missionárias, não sustento de pessoa.
--
-- OS IDs DOS LANÇAMENTOS foram lidos em 08/10/2026 (todos conciliados, conta Bradesco 9c6730f9…):
--   Pastor Titular (Lucio Paulo Paz Barreto)
--     13/08 R$ 8.000  e8f093b5…  adiantamento · agosto        (Omie)
--     20/08 R$ 2.300  44914b07…  adiantamento · agosto        (Omie, "PIX … L cio P")
--     01/09 R$ 3.429  d9d0dad4…  pagamento final · agosto     (OFX N10403)   → líquido de agosto pago em 01/09
--     09/09 R$ 4.000  f817dfcc…  adiantamento · setembro      (OFX N10EBB)
--     15/09 R$ 4.000  aff731e7…  adiantamento · setembro      (OFX N1136D)
--   Pastor Missionário (Alexandre Lourenço Silva)
--     01/09 R$ 2.362  c28cb1bb…  pagamento · agosto           (OFX N103ED)   → o líquido de agosto, pago em 01/09
--   O previsto de 05/10 (R$ 2.362, 9810ed42…) e o previsto de 15/09 (R$ 4.000, 009c50dd…) NÃO são ligados: a Fase 2 decide o
--   destino das obrigações. O pagamento de 03/08 R$ 2.362 (a27f8356…) seria o de julho; fica de fora até haver o valor de julho.
--
-- DEPOIS DO ENSAIO, a carga de verdade é o mesmo bloco com a última linha trocada (ver o comentário no fim) — só quando ela disser
-- "pode aplicar".

DO $ensaio$
DECLARE
  v_conta   uuid := '9c6730f9-89a5-4112-b040-1cce5a5d77b3';
  v_cat     uuid := (SELECT id FROM public.fin_categorias WHERE nome = 'Prebenda' LIMIT 1);
  v_lucio   uuid := (SELECT id FROM public.membros WHERE nome_completo = 'Lucio Paulo Paz Barreto' LIMIT 1);
  v_alex    uuid := (SELECT id FROM public.membros WHERE nome_completo = 'Alexandre Lourenço Silva' LIMIT 1);
  b_titular uuid; b_missio uuid; c_ago_t uuid; c_set_t uuid; c_ago_m uuid; v_set uuid; falhou boolean := false; n_hist int;
  -- foto ANTES
  a_n bigint; a_soma numeric; a_resumo text; a_saldos text;
  -- foto DEPOIS
  d_n bigint; d_soma numeric; d_resumo text; d_saldos text;
  quadro text; historico text; n_conferem int; n_total int;
BEGIN
  SELECT count(*), COALESCE(sum(valor), 0),
         md5(string_agg(id::text || '|' || valor::text || '|' || status || '|' || coalesce(categoria_id::text, '') || '|' || coalesce(pessoa_id::text, ''), ',' ORDER BY id))
    INTO a_n, a_soma, a_resumo FROM public.fin_lancamentos;
  SELECT md5(string_agg(id::text || '|' || coalesce(saldo_atual::text, ''), ',' ORDER BY id)) INTO a_saldos FROM public.fin_contas;

  IF v_cat IS NULL OR v_lucio IS NULL OR v_alex IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: cadastro não encontrado (categoria Prebenda: %, Lucio: %, Alexandre: %)', v_cat, v_lucio, v_alex;
  END IF;

  INSERT INTO public.sustento_beneficiarios (tipo, nome_exibicao, pessoa_id, conta_id, categoria_id, dia_do_liquido, controle_por_competencia)
    VALUES ('pastor_titular', 'Lucio Paulo Paz Barreto — Pastor Titular', v_lucio, v_conta, v_cat, 5, true) RETURNING id INTO b_titular;
  INSERT INTO public.sustento_beneficiarios (tipo, nome_exibicao, pessoa_id, conta_id, categoria_id, dia_do_liquido, controle_por_competencia)
    VALUES ('pastor_missionario', 'Alexandre Lourenço Silva — Pastor Missionário', v_alex, v_conta, v_cat, 5, true) RETURNING id INTO b_missio;

  -- ── Pastor Titular · avançado ──
  -- agosto: sem o RSP em mãos; o líquido previsto é o de setembro (13.728,00), "≈" — falta o RSP de agosto para fechar o centavo
  INSERT INTO public.sustento_competencias (beneficiario_id, competencia, status, modo, valor_previsto, fechada_em, observacoes)
    VALUES (b_titular, '2026-08-01', 'paga', 'avancado', 13728.00, now(),
            'Carga inicial: líquido estimado pelo RSP de setembro; o RSP de agosto fecha o centavo (diferença de R$ 1,00).')
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

  -- ── Pastor Missionário · simples (o Automático resolve para Simples: sem adiantamento nem RSP) ──
  INSERT INTO public.sustento_competencias (beneficiario_id, competencia, status, modo, valor_previsto, confirmada_em, observacoes)
    VALUES (b_missio, '2026-08-01', 'paga', 'simples', 2362.00, now(), 'Carga inicial: líquido de agosto, pago em 01/09.') RETURNING id INTO c_ago_m;
  INSERT INTO public.sustento_pagamentos (competencia_id, lancamento_id, tipo)
    VALUES (c_ago_m, 'c28cb1bb-c4d2-4e0d-a21f-f4359754de5a', 'pagamento');
  INSERT INTO public.sustento_competencias (beneficiario_id, competencia, status, modo, valor_previsto, confirmada_em, observacoes)
    VALUES (b_missio, '2026-09-01', 'fechada', 'simples', 2362.00, now(), 'RSP de setembro/2026: previsto 2.362,00; IRRF 0,00; sem adiantamento. Ainda não pago.');

  -- ── prova das duas proteções do banco ──
  v_set := c_set_t;
  -- (2) a competência de setembro já tem rubricas e pagamentos: trocar o modo tem de ser recusado
  BEGIN
    UPDATE public.sustento_competencias SET modo = 'simples' WHERE id = v_set;
  EXCEPTION WHEN OTHERS THEN falhou := true;
  END;
  IF NOT falhou THEN RAISE EXCEPTION 'ABORTADO: o banco deixou trocar o modo de uma competência com movimento'; END IF;

  -- (1) trocar o tipo de controle do titular gera uma linha no histórico (quem/quando); a competência existente não muda
  UPDATE public.sustento_beneficiarios SET tipo_controle = 'simples' WHERE id = b_titular;
  SELECT count(*) INTO n_hist FROM public.sustento_controle_historico
   WHERE beneficiario_id = b_titular AND tipo_controle_anterior = 'automatico' AND tipo_controle_novo = 'simples';
  IF n_hist <> 1 THEN RAISE EXCEPTION 'ABORTADO: o histórico de alteração não foi gravado (% linhas)', n_hist; END IF;
  IF (SELECT modo FROM public.sustento_competencias WHERE id = v_set) <> 'avancado' THEN
    RAISE EXCEPTION 'ABORTADO: a troca do tipo de controle reinterpretou uma competência existente';
  END IF;
  UPDATE public.sustento_beneficiarios SET tipo_controle = 'automatico' WHERE id = b_titular;   -- volta (e também fica registrado)

  -- ── trava: nada em fin_lancamentos ou nos saldos pode ter mudado ──
  SELECT count(*), COALESCE(sum(valor), 0),
         md5(string_agg(id::text || '|' || valor::text || '|' || status || '|' || coalesce(categoria_id::text, '') || '|' || coalesce(pessoa_id::text, ''), ',' ORDER BY id))
    INTO d_n, d_soma, d_resumo FROM public.fin_lancamentos;
  SELECT md5(string_agg(id::text || '|' || coalesce(saldo_atual::text, ''), ',' ORDER BY id)) INTO d_saldos FROM public.fin_contas;
  IF a_n <> d_n OR a_soma <> d_soma OR a_resumo IS DISTINCT FROM d_resumo THEN
    RAISE EXCEPTION 'ABORTADO: fin_lancamentos mudou (antes % linhas / % — depois % / %)', a_n, a_soma, d_n, d_soma;
  END IF;
  IF a_saldos IS DISTINCT FROM d_saldos THEN RAISE EXCEPTION 'ABORTADO: algum saldo de conta mudou'; END IF;

  -- ── o quadro de conferência: uma linha por competência ──
  SELECT string_agg(
           format('%s | %s | %s | %s | bruto %s | IRRF %s | líquido %s | adiant. %s | pag.final %s | pag.simples %s | SALDO A PAGAR %s | confere: %s',
                  nome_exibicao, to_char(competencia, 'MM/YYYY'), status, modo, sustento, irrf, liquido_previsto, adiantamentos,
                  pagamentos_finais, pagamentos_simples, saldo_a_pagar,
                  CASE WHEN tipo = 'pastor_titular' THEN
                         CASE competencia
                           WHEN '2026-09-01' THEN (sustento = 17451.84 AND irrf = 3723.55 AND liquido_previsto = 13728.00 AND adiantamentos = 8000.00 AND saldo_a_pagar = 5728.00)
                           WHEN '2026-08-01' THEN (adiantamentos = 10300.00 AND pagamentos_finais = 3429.00 AND saldo_a_pagar = -1.00)
                         END
                       ELSE
                         CASE competencia
                           WHEN '2026-09-01' THEN (liquido_previsto = 2362.00 AND pagamentos_simples = 0 AND saldo_a_pagar = 2362.00)
                           WHEN '2026-08-01' THEN (liquido_previsto = 2362.00 AND pagamentos_simples = 2362.00 AND saldo_a_pagar = 0)
                         END
                  END),
           E'\n' ORDER BY nome_exibicao, competencia),
         count(*),
         count(*) FILTER (WHERE
           CASE WHEN tipo = 'pastor_titular' THEN
                  CASE competencia
                    WHEN '2026-09-01' THEN (sustento = 17451.84 AND irrf = 3723.55 AND liquido_previsto = 13728.00 AND adiantamentos = 8000.00 AND saldo_a_pagar = 5728.00)
                    WHEN '2026-08-01' THEN (adiantamentos = 10300.00 AND pagamentos_finais = 3429.00 AND saldo_a_pagar = -1.00)
                  END
                ELSE
                  CASE competencia
                    WHEN '2026-09-01' THEN (liquido_previsto = 2362.00 AND pagamentos_simples = 0 AND saldo_a_pagar = 2362.00)
                    WHEN '2026-08-01' THEN (liquido_previsto = 2362.00 AND pagamentos_simples = 2362.00 AND saldo_a_pagar = 0)
                  END
           END)
    INTO quadro, n_total, n_conferem
    FROM public.vw_sustento_conta_corrente;

  SELECT string_agg(format('%s: controle %s→%s, tipo %s→%s, por %s',
                           b.nome_exibicao, coalesce(h.controle_anterior::text, '(cadastro)'), h.controle_novo,
                           coalesce(h.tipo_controle_anterior, '(cadastro)'), h.tipo_controle_novo, coalesce(h.alterado_por_nome, 'SQL Editor')),
                    E'\n' ORDER BY b.nome_exibicao, h.alterado_em)
    INTO historico
    FROM public.sustento_controle_historico h JOIN public.sustento_beneficiarios b ON b.id = h.beneficiario_id;

  -- termina SEMPRE com erro: o comando inteiro é desfeito e nada fica gravado
  RAISE EXCEPTION E'ENSAIO CONCLUÍDO (nada foi gravado)\n\nCOMPETÊNCIAS — % de % conferem com o esperado:\n%\n\nHISTÓRICO DE CONTROLE (gatilho):\n%\n\nTRAVA: fin_lancamentos intacto (% lançamentos, soma %) e saldos das contas intactos.',
                  n_conferem, n_total, quadro, historico, d_n, d_soma;
END
$ensaio$;

-- ─── A CARGA DE VERDADE ────────────────────────────────────────────────────────────────────────────────────────────
-- Só depois de ela ver o quadro acima e dizer "pode aplicar": o mesmo bloco, trocando o RAISE EXCEPTION final por
--   RAISE NOTICE '…';   (e mantendo o DO sem erro, ele grava ao terminar). Eu preparo essa versão no momento da aplicação.
