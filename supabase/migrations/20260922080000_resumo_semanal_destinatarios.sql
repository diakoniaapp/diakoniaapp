-- ─── resumo_semanal_destinatarios() ─────────────────────────────────────
--
-- Fase 4 da Bússola do Diakonia, próximo passo depois de duas
-- sexta-feiras de envio automático confirmado só pra Telma (11/09 e
-- 18/09/2026, `cron.job_run_details` — as duas rodaram com sucesso):
-- "expandir o resumo semanal a outros papéis (pastor, secretária,
-- tesoureira)". Decidido com ela (22/09/2026): cada papel recebe só a
-- PRÓPRIA seção, não o resumo inteiro — menos ruído, cada um vê o que é
-- dele.
--
-- Busca o e-mail de verdade — `auth.users.email` é sintético (fabricado
-- do telefone, ver CLAUDE.md §5.1); quem tem e-mail real cadastrado é
-- `membros.email`, alcançado por user_roles → profiles → membros.
-- Quem não tiver e-mail cadastrado simplesmente não aparece na lista —
-- a Edge Function não falha por isso, só não manda pra essa pessoa.
--
-- Não usa DISTINCT: se um papel tiver mais de uma pessoa no futuro,
-- todas recebem — é o comportamento certo pra uma notificação, não um
-- bug de duplicação.
CREATE OR REPLACE FUNCTION public.resumo_semanal_destinatarios()
RETURNS TABLE(papel text, email text, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'pastoral', m.email, m.nome_completo
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  JOIN membros m ON m.id = p.pessoa_id
  WHERE ur.role = 'pastor' AND m.email IS NOT NULL AND m.email <> ''
  UNION ALL
  SELECT 'secretaria', m.email, m.nome_completo
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  JOIN membros m ON m.id = p.pessoa_id
  WHERE ur.role = 'secretaria' AND m.email IS NOT NULL AND m.email <> ''
  UNION ALL
  SELECT 'tesouraria', m.email, m.nome_completo
  FROM user_roles ur
  JOIN profiles p ON p.id = ur.user_id
  JOIN membros m ON m.id = p.pessoa_id
  WHERE ur.role = 'tesouraria' AND m.email IS NOT NULL AND m.email <> '';
$$;

REVOKE ALL ON FUNCTION public.resumo_semanal_destinatarios() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_destinatarios() TO service_role;
