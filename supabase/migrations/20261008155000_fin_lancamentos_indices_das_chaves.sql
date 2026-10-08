-- ─── Índices que faltavam nas chaves estrangeiras que apontam para fin_lancamentos ───────────────────────────────
-- Medido em 08/10/2026 (diagnóstico da limpeza das recorrências, docs/LIMPEZA_RECORRENCIAS_DIAGNOSTICO.sql): apagar 200 lançamentos levou
-- 1,68 s — 8,4 ms por linha, ~247 s para as 29.460 que a limpeza remove — porque `fin_lancamentos.lancamento_pai_id` (auto-referência,
-- ON DELETE SET NULL) não tem índice: para cada linha apagada o Postgres varre as 43 mil linhas da própria tabela procurando filhas.
-- Isto não é só da limpeza: TODO delete de lançamento paga esse custo, e hoje ele cresce com a tabela.
--
-- O que faz: cria dois índices PARCIAIS (só as linhas que têm o vínculo — poucas), sem alterar dado nenhum:
--   · fin_lancamentos.lancamento_pai_id   — o que pesa de verdade;
--   · sustento_competencias.obrigacao_id  — a chave nova do Sustento, por higiene (tabela pequena, custo zero).
-- Outras chaves sem índice (fin_estoque_movimentos, fin_folha_lancamentos, fiscal_agenda) apontam para tabelas pequenas: ficam como estão.
-- Reversível: DROP INDEX fin_lancamentos_pai_idx, sustento_competencias_obrigacao_idx. Segura ao rodar: uma criação de índice em 43 mil linhas
-- leva menos de um segundo e só segura ESCRITA na tabela nesse intervalo.
CREATE INDEX IF NOT EXISTS fin_lancamentos_pai_idx ON public.fin_lancamentos (lancamento_pai_id) WHERE lancamento_pai_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sustento_competencias_obrigacao_idx ON public.sustento_competencias (obrigacao_id) WHERE obrigacao_id IS NOT NULL;
