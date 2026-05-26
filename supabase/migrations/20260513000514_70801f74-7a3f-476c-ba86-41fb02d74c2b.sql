-- 1) MEMBROS — restringir SELECT a admin/secretaria/diakonia
DROP POLICY IF EXISTS "Autenticados leem membros" ON public.membros;
CREATE POLICY "Staff leem membros"
ON public.membros
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

-- 2) HISTORICO_MEMBRO — restringir SELECT a admin/secretaria/diakonia
DROP POLICY IF EXISTS "Autenticados leem historico" ON public.historico_membro;
CREATE POLICY "Staff leem historico"
ON public.historico_membro
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

-- 3) FAMILIAS — restringir SELECT a admin/secretaria/diakonia
DROP POLICY IF EXISTS "Autenticados leem familias" ON public.familias;
CREATE POLICY "Staff leem familias"
ON public.familias
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

-- 4) VINCULOS_FAMILIARES — restringir SELECT a admin/secretaria/diakonia
DROP POLICY IF EXISTS "Autenticados leem vinculos_familiares" ON public.vinculos_familiares;
CREATE POLICY "Staff leem vinculos_familiares"
ON public.vinculos_familiares
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

-- 5) SECURITY DEFINER hardening — revogar EXECUTE das funções não usadas em RLS
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_evento_ministerios() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_membros_delete() FROM PUBLIC, anon, authenticated;