-- Reverte supabase/migrations/20261027200000_contribuicoes_acessos_relatorio.sql
-- ATENÇÃO: só funciona se NÃO houver linhas com as ações do relatório (previa_relatorio, teste_relatorio, enviar_relatorio); a trilha é imutável e não pode ser apagada.
ALTER TABLE public.contribuicoes_acessos DROP CONSTRAINT IF EXISTS contribuicoes_acessos_acao_check;
ALTER TABLE public.contribuicoes_acessos ADD CONSTRAINT contribuicoes_acessos_acao_check CHECK (acao IN (
  'ver_pessoas', 'ver_nao_contribuiram', 'exportar_pessoas', 'exportar_nao_contribuiram', 'ver_pessoa'
));
