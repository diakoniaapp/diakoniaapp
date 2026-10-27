-- ─── O registro de acessos passa a cobrir o RELATÓRIO COM NOMES enviado por e-mail (27/10/2026) ────────────────────────────────────────────────────────────────────────────────────────
--
-- Decisão dela (27/10/2026): o modelo Pastor do relatório de contribuições pode levar NOMES por e-mail (nome, última contribuição, frequência, situação), nunca valores individuais. Quem VÊ esses nomes
-- (prévia, teste) e quem os ENVIA precisa ficar registrado, como já fica quem vê a lista nominal na tela (`contribuicoes_acessos`, migration 20261027160000).
--
-- O QUE ESTA MIGRATION FAZ: acrescenta três ações ao CHECK de `contribuicoes_acessos.acao`: `previa_relatorio`, `teste_relatorio` e `enviar_relatorio`. Nada mais muda; as linhas existentes continuam válidas.
-- A Edge Function `contribuicoes-enviar` grava essas ações com a chave de serviço e RECUSA gerar um relatório com nomes se o registro falhar (sem esta migration, o relatório com nomes não sai; o agregado sai normalmente).
-- Ordem: 1º esta migration; 2º reimplantar `contribuicoes-enviar`. Reverter: docs/CONTRIBUICOES_ACESSOS_RELATORIO_ROLLBACK.sql.

ALTER TABLE public.contribuicoes_acessos DROP CONSTRAINT IF EXISTS contribuicoes_acessos_acao_check;
ALTER TABLE public.contribuicoes_acessos ADD CONSTRAINT contribuicoes_acessos_acao_check CHECK (acao IN (
  'ver_pessoas', 'ver_nao_contribuiram', 'exportar_pessoas', 'exportar_nao_contribuiram', 'ver_pessoa',
  'previa_relatorio', 'teste_relatorio', 'enviar_relatorio'
));
