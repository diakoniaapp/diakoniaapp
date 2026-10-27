-- Reverte supabase/migrations/20261027220000_contribuicoes_triagem_de_identificacao.sql
-- ATENÇÃO: apaga a trilha de triagem (anônimo/ignorado/desfeita). Exporte `fin_contribuicao_triagem` antes, se ela já tiver linhas.
-- O CHECK do registro de acessos volta ao de antes: só funciona se NÃO houver linhas com a ação 'ver_pendentes' (a trilha de acessos é imutável).
DROP FUNCTION IF EXISTS public.contribuicao_triar(uuid, text, text);
DROP VIEW IF EXISTS public.fin_contribuicao_triagem_atual;
DROP TABLE IF EXISTS public.fin_contribuicao_triagem;
DROP FUNCTION IF EXISTS public.fin_contribuicao_triagem_imutavel();
ALTER TABLE public.contribuicoes_acessos DROP CONSTRAINT IF EXISTS contribuicoes_acessos_acao_check;
ALTER TABLE public.contribuicoes_acessos ADD CONSTRAINT contribuicoes_acessos_acao_check CHECK (acao IN (
  'ver_pessoas', 'ver_nao_contribuiram', 'exportar_pessoas', 'exportar_nao_contribuiram', 'ver_pessoa',
  'previa_relatorio', 'teste_relatorio', 'enviar_relatorio'
));
