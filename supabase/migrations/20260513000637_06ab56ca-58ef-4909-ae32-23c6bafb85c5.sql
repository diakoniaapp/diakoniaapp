DROP POLICY IF EXISTS "Autenticados leem area_voluntarios" ON public.area_voluntarios;
CREATE POLICY "Staff leem area_voluntarios"
ON public.area_voluntarios FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "Autenticados leem ministerio_membros" ON public.ministerio_membros;
CREATE POLICY "Staff leem ministerio_membros"
ON public.ministerio_membros FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "Autenticados leem historico_lideranca" ON public.historico_lideranca;
CREATE POLICY "Staff leem historico_lideranca"
ON public.historico_lideranca FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));