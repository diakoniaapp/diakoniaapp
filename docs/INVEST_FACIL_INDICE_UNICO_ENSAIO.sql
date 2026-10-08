-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- Rode depois da auditoria (docs/INVEST_FACIL_INDICE_UNICO_AUDITORIA.sql, veredito "PODE CRIAR O ÍNDICE") e ANTES de aplicar.
-- ─── Ensaio do índice único das transferências do Invest Fácil ──────────────────────────────────────────────────────────
-- Dentro de uma transação que será desfeita: cria o índice (mede quanto leva) e prova, com transferências de mentira entre o Bradesco e a conta de
-- aplicação, que
--   1. o par de pernas (um INSERT só) é aceito;
--   2. o MESMO par outra vez — a corrida entre duas abas — é recusado pelo banco INTEIRO (nenhuma perna fica);
--   3. "Vincular Evidência PDF" numa linha que já tem outra com a mesma chave é recusado;
--   4. outra chave, e lançamentos sem marca, continuam livres;
--   5. depois de apagar o par (Desfazer), a chave volta a poder ser registrada.
-- Nada disso fica: o RAISE EXCEPTION final desfaz a criação do índice e os lançamentos de teste (e os saldos que o gatilho mexeu).
DO $ensaio$
DECLARE
  v_corr uuid; v_apl uuid; v_outra text;
  k text := 'ENSAIO-2026-09-02:APLICACAO:0000:123.45';
  k2 text := 'ENSAIO-2026-09-03:RESGATE:0000:50.00';
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  a2 uuid := gen_random_uuid(); b2 uuid := gen_random_uuid();
  a3 uuid := gen_random_uuid(); b3 uuid := gen_random_uuid();
  a4 uuid := gen_random_uuid(); b4 uuid := gen_random_uuid();
  r3 uuid := gen_random_uuid(); r4 uuid := gen_random_uuid();
  n int; rel text := ''; t0 timestamptz; conflitos text; linhas_antes bigint; origem_comum text;
BEGIN
  SELECT id INTO v_corr FROM public.fin_contas WHERE nome ILIKE 'bradesco%' AND nome NOT ILIKE '%aplica%' ORDER BY ordem NULLS LAST, nome LIMIT 1;
  SELECT id INTO v_apl  FROM public.fin_contas WHERE nome ILIKE '%aplica%' ORDER BY ordem NULLS LAST, nome LIMIT 1;
  IF v_corr IS NULL OR v_apl IS NULL THEN
    RAISE EXCEPTION 'Não achei a conta Bradesco (corrente) e a conta de Aplicação — o ensaio precisa das duas.';
  END IF;
  SELECT origem::text INTO origem_comum FROM public.fin_lancamentos WHERE origem::text <> 'transferencia' LIMIT 1;
  SELECT count(*) INTO linhas_antes FROM public.fin_lancamentos;
  rel := format('Contas do ensaio: %s (corrente) e %s (aplicação). Lançamentos na tabela: %s.', (SELECT nome FROM public.fin_contas WHERE id = v_corr), (SELECT nome FROM public.fin_contas WHERE id = v_apl), linhas_antes);

  -- 0. a mesma checagem e a mesma criação da migration
  SELECT string_agg(c.nome || ' · ' || d.chave || ' (' || d.n || 'x)', E'\n') INTO conflitos
    FROM (
      SELECT x.conta_id, x.chave, count(*) AS n
        FROM (SELECT conta_id, substring(observacoes from '\[invest-pdf:([^\]]+)\]') AS chave
                FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:%') x
       WHERE x.chave IS NOT NULL GROUP BY x.conta_id, x.chave HAVING count(*) > 1
    ) d JOIN public.fin_contas c ON c.id = d.conta_id;
  IF conflitos IS NOT NULL THEN RAISE EXCEPTION E'Há conflitos — o índice não seria criado:\n%', conflitos; END IF;
  rel := rel || E'\n0. Conflitos existentes: nenhum.';

  t0 := clock_timestamp();
  EXECUTE $ddl$
    CREATE UNIQUE INDEX IF NOT EXISTS fin_lancamentos_invest_pdf_chave_uq
      ON public.fin_lancamentos (conta_id, (substring(observacoes from '\[invest-pdf:([^\]]+)\]')))
      WHERE observacoes LIKE '%[invest-pdf:%'
  $ddl$;
  rel := rel || format(E'\n0. Índice criado em %s ms.', round(extract(epoch FROM clock_timestamp() - t0) * 1000));

  -- 1. o par de pernas, exatamente como a Mesa grava
  INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, lancamento_pai_id, observacoes) VALUES
    (a, 'saida',   DATE '2026-09-02', 123.45, v_corr, 'conciliado', 'ENSAIO (saída)',   'transferencia', b, '[ofx:PDF:' || k || '] [transferencia-ofx] [invest-pdf:' || k || '] [origem:INVEST_FACIL_PDF]'),
    (b, 'entrada', DATE '2026-09-02', 123.45, v_apl,  'realizado',  'ENSAIO (entrada)', 'transferencia', a, '[invest-pdf:' || k || '] [origem:INVEST_FACIL_PDF]');
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:' || k || ']%';
  rel := rel || format(E'\n1. Par de pernas aceito: %s linhas com a chave — %s.', n, CASE WHEN n = 2 THEN 'OK' ELSE 'FALHOU' END);

  -- 2. a corrida: o MESMO par de novo, num INSERT só
  BEGIN
    INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, lancamento_pai_id, observacoes) VALUES
      (a2, 'saida',   DATE '2026-09-02', 123.45, v_corr, 'conciliado', 'ENSAIO duplicado (saída)',   'transferencia', b2, '[ofx:PDF:' || k || '] [transferencia-ofx] [invest-pdf:' || k || '] [origem:INVEST_FACIL_PDF]'),
      (b2, 'entrada', DATE '2026-09-02', 123.45, v_apl,  'realizado',  'ENSAIO duplicado (entrada)', 'transferencia', a2, '[invest-pdf:' || k || '] [origem:INVEST_FACIL_PDF]');
    rel := rel || E'\n2. O par duplicado FOI ACEITO — FALHOU: o índice não protege.';
  EXCEPTION WHEN unique_violation THEN
    SELECT count(*) INTO n FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:' || k || ']%';
    rel := rel || format(E'\n2. Par duplicado recusado (23505); continuam %s linhas com a chave (nenhuma perna do duplicado ficou) — %s.', n, CASE WHEN n = 2 THEN 'OK' ELSE 'FALHOU' END);
  END;

  -- 3. "Vincular Evidência PDF" numa linha que já existe, com a chave de outra transferência
  INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, observacoes)
    VALUES (r3, 'saida', DATE '2026-09-02', 123.45, v_corr, 'conciliado', 'ENSAIO transferência feita à mão', coalesce(origem_comum, 'transferencia'), NULL);
  BEGIN
    UPDATE public.fin_lancamentos SET observacoes = '[invest-pdf:' || k || '] [origem:INVEST_FACIL_PDF]' WHERE id = r3;
    rel := rel || E'\n3. Vincular a mesma chave numa segunda linha da conta FOI ACEITO — FALHOU.';
  EXCEPTION WHEN unique_violation THEN
    rel := rel || E'\n3. Vincular a mesma chave numa segunda linha da conta recusado (23505) — OK.';
  END;

  -- 4. outra chave e lançamentos sem marca seguem livres
  BEGIN
    INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, lancamento_pai_id, observacoes) VALUES
      (a4, 'entrada', DATE '2026-09-03', 50.00, v_corr, 'conciliado', 'ENSAIO outra chave (entrada)', 'transferencia', b4, '[ofx:PDF:' || k2 || '] [transferencia-ofx] [invest-pdf:' || k2 || ']'),
      (b4, 'saida',   DATE '2026-09-03', 50.00, v_apl,  'realizado',  'ENSAIO outra chave (saída)',   'transferencia', a4, '[invest-pdf:' || k2 || ']');
    INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, observacoes)
      VALUES (r4, 'saida', DATE '2026-09-02', 123.45, v_corr, 'conciliado', 'ENSAIO sem marca', coalesce(origem_comum, 'transferencia'), 'observação qualquer');
    rel := rel || E'\n4. Outra chave e lançamentos sem marca (inclusive de mesmo valor e data) aceitos — OK.';
  EXCEPTION WHEN unique_violation THEN
    rel := rel || E'\n4. Outra chave ou lançamento sem marca RECUSADO — FALHOU.';
  END;

  -- 5. Desfazer: apagar o par libera a chave
  DELETE FROM public.fin_lancamentos WHERE id IN (a, b);
  BEGIN
    INSERT INTO public.fin_lancamentos (id, tipo, data, valor, conta_id, status, descricao, origem, lancamento_pai_id, observacoes) VALUES
      (a3, 'saida',   DATE '2026-09-02', 123.45, v_corr, 'conciliado', 'ENSAIO refeito (saída)',   'transferencia', b3, '[ofx:PDF:' || k || '] [transferencia-ofx] [invest-pdf:' || k || ']'),
      (b3, 'entrada', DATE '2026-09-02', 123.45, v_apl,  'realizado',  'ENSAIO refeito (entrada)', 'transferencia', a3, '[invest-pdf:' || k || ']');
    rel := rel || E'\n5. Depois de apagar o par, a mesma chave voltou a ser aceita — OK.';
  EXCEPTION WHEN unique_violation THEN
    rel := rel || E'\n5. Depois de apagar o par, a chave continua recusada — FALHOU.';
  END;

  -- 6. nada do que já existia entrou no índice
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:%' AND observacoes NOT LIKE '%ENSAIO-%';
  rel := rel || format(E'\n6. Lançamentos reais com a marca (fora do ensaio): %s — esperado 0.', n);

  RAISE EXCEPTION E'ENSAIO CONCLUÍDO — nada foi gravado (isto é um erro de propósito):\n%\n\nLeia: cada item tem de terminar em OK. Se algum disse FALHOU, NÃO aplique.', rel;
END
$ensaio$;
