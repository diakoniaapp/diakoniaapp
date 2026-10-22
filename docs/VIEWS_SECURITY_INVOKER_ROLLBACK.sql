-- Reverte a migration 20261022170000: devolve as quatro views ao estado em que o Advisor do Supabase as marca como "Security Definer View" (lêem com os direitos do dono, ignorando a RLS).
-- Só use se uma tela financeira ficar vazia por causa da mudança — e então o certo é ajustar a RLS das tabelas de base, não reabrir a falha.
ALTER VIEW public.vw_fin_resumo_mes RESET (security_invoker);
ALTER VIEW public.vw_fin_centros_resumo RESET (security_invoker);
ALTER VIEW public.vw_fin_orcamento_vs_real RESET (security_invoker);
ALTER VIEW public.vw_fin_proximos_vencimentos RESET (security_invoker);
