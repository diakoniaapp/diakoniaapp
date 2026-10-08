-- SÓ LEITURA — não grava nada. Rode ANTES da migration 20261008180000_fin_lancamentos_invest_pdf_unico.sql. Um comando só; devolve uma tabela.
-- ─── Auditoria prévia do índice único das transferências do Invest Fácil ─────────────────────────────────────────────────
-- O índice garante que, por conta, só exista UM lançamento com a marca `[invest-pdf:CHAVE]` na coluna `observacoes` (a marca que a Mesa grava
-- nas duas pernas de cada transferência vinda do PDF; a chave é `data:APLICACAO|RESGATE:lote:valor`). Antes de criá-lo, este relatório diz:
--   · quantos lançamentos já carregam essa marca (esperado hoje: 0 — a automação ainda não gravou nada);
--   · se existe algum CONFLITO (a mesma chave duas vezes na mesma conta) — é o que impediria a criação do índice;
--   · linhas que o índice NÃO enxergaria (marca repetida na mesma linha, marca `[ofx:PDF:…]` sem a `[invest-pdf:…]` igual);
--   · chaves presas em lançamentos que não são realizado/conciliado (a Mesa não as reconhece como "já registradas", o índice as conta);
--   · se o índice já existe.
-- A linha "VEREDITO" (ordem 0) diz se pode criar. Se houver conflito, as linhas seguintes listam conta, chave e os ids.
WITH marcados AS (
  SELECT l.id, l.conta_id, l.status, l.tipo, l.valor, l.data, l.observacoes,
         substring(l.observacoes from '\[invest-pdf:([^\]]+)\]') AS chave,
         substring(l.observacoes from '\[ofx:PDF:([^\]]+)\]')    AS chave_ofx,
         (length(l.observacoes) - length(replace(l.observacoes, '[invest-pdf:', ''))) / length('[invest-pdf:') AS n_marcas
    FROM public.fin_lancamentos l
   WHERE l.observacoes LIKE '%[invest-pdf:%' OR l.observacoes LIKE '%[ofx:PDF:%' OR l.observacoes LIKE '%INVEST_FACIL_PDF%'
),
duplicadas AS (
  SELECT conta_id, chave, count(*) AS n, array_agg(id::text ORDER BY id) AS ids
    FROM marcados WHERE chave IS NOT NULL GROUP BY conta_id, chave HAVING count(*) > 1
),
marca_repetida AS (SELECT id FROM marcados WHERE n_marcas > 1),
marca_sem_par AS (SELECT id FROM marcados WHERE chave_ofx IS NOT NULL AND chave IS DISTINCT FROM chave_ofx),
chave_presa AS (SELECT id FROM marcados WHERE chave IS NOT NULL AND status NOT IN ('realizado', 'conciliado')),
resumo AS (
  SELECT
    (SELECT count(*) FROM public.fin_lancamentos)                                   AS total_tabela,
    (SELECT count(*) FROM marcados WHERE chave IS NOT NULL)                         AS com_marca,
    (SELECT count(DISTINCT chave) FROM marcados WHERE chave IS NOT NULL)            AS chaves,
    (SELECT count(*) FROM duplicadas)                                               AS conflitos,
    (SELECT count(*) FROM marca_repetida)                                           AS repetidas,
    (SELECT count(*) FROM marca_sem_par)                                            AS sem_par,
    (SELECT count(*) FROM chave_presa)                                              AS presas,
    EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fin_lancamentos_invest_pdf_chave_uq') AS indice_existe,
    -- a expressão do índice precisa funcionar exatamente como a Mesa grava
    (substring('[ofx:PDF:2026-09-02:APLICACAO:1067645:5936.77] [invest-pdf:2026-09-02:APLICACAO:1067645:5936.77] x' from '\[invest-pdf:([^\]]+)\]') = '2026-09-02:APLICACAO:1067645:5936.77') AS expressao_ok
)
SELECT ordem, secao, valor, detalhe FROM (
  SELECT 0 AS ordem, 'VEREDITO' AS secao,
         CASE WHEN indice_existe THEN 'O ÍNDICE JÁ EXISTE'
              WHEN NOT expressao_ok THEN 'NÃO CRIE — a expressão não extrai a chave'
              WHEN conflitos = 0 THEN 'PODE CRIAR O ÍNDICE'
              ELSE 'NÃO CRIE — há ' || conflitos || ' conflito(s)' END AS valor,
         CASE WHEN conflitos = 0 THEN 'nenhuma chave repetida na mesma conta' ELSE 'veja as linhas "CONFLITO" abaixo; resolva (apagar a duplicata pelo Desfazer da Mesa) e rode de novo' END AS detalhe
    FROM resumo
  UNION ALL SELECT 1, 'lançamentos na tabela',                          total_tabela::text, '' FROM resumo
  UNION ALL SELECT 2, 'lançamentos com a marca [invest-pdf:…]',         com_marca::text,    'esperado 0 antes da primeira confirmação na Mesa; 2 por transferência depois (uma por perna)' FROM resumo
  UNION ALL SELECT 3, 'chaves distintas',                               chaves::text,       '' FROM resumo
  UNION ALL SELECT 4, 'CONFLITOS (mesma chave 2x na mesma conta)',      conflitos::text,    'tem de ser 0 para criar o índice' FROM resumo
  UNION ALL SELECT 5, 'marca repetida na MESMA linha',                  repetidas::text,    'o índice só enxerga a primeira; deveria ser 0' FROM resumo
  UNION ALL SELECT 6, '[ofx:PDF:X] sem [invest-pdf:X] igual',           sem_par::text,      'marca de PDF incompleta; deveria ser 0' FROM resumo
  UNION ALL SELECT 7, 'chave em lançamento que não é realizado/conciliado', presas::text,   'a Mesa não as reconhece como já registradas, mas o índice as conta (cancelado/previsto)' FROM resumo
  UNION ALL SELECT 8, 'a expressão do índice extrai a chave?',          CASE WHEN expressao_ok THEN 'sim' ELSE 'NÃO' END, 'teste com uma marca no formato exato que a Mesa grava' FROM resumo
  UNION ALL SELECT 9, 'o índice já existe?',                            CASE WHEN indice_existe THEN 'sim' ELSE 'não' END, 'fin_lancamentos_invest_pdf_chave_uq' FROM resumo
  UNION ALL
  SELECT 10, 'CONFLITO', d.chave,
         (SELECT c.nome FROM public.fin_contas c WHERE c.id = d.conta_id) || ' · ' || d.n || ' lançamentos: ' || array_to_string(d.ids, ', ')
    FROM duplicadas d
  UNION ALL
  SELECT 11, 'chave presa', m.chave, m.id::text || ' · ' || m.status || ' · ' || m.data::text || ' · ' || m.valor::text
    FROM marcados m WHERE m.id IN (SELECT id FROM chave_presa)
) t
ORDER BY ordem, secao, valor;
