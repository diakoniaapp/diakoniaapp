-- ═══════════════════════════════════════════════════════════════════════════
-- Liderança só opera o próprio módulo — EBD e PGM
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B·2 do plano. `lideranca` é hoje um papel só, e ele fazia dois trabalhos
-- ao mesmo tempo: "lidera uma equipe" e "é liderança da igreja" — quatorze
-- políticas recortadas por área/ministério, e sessenta e uma sem recorte
-- nenhum. Esta migration fecha as catorze primeiras: as sete de EBD e as
-- sete de PGM.
--
-- ── O QUE ESTAVA ABERTO ─────────────────────────────────────────────────────
--
-- Toda conta com o papel `lideranca` operava (ALL — ler, criar, editar,
-- apagar) as sete tabelas de EBD e as sete de PGM, sirva ela num ministério
-- ou não tenha ligação nenhuma com nenhum dos dois. Uma líder de Recepção
-- podia editar presença de EBD e reunião de Pequeno Grupo — módulos que
-- nunca tocou.
--
-- ── O QUE PASSA A VALER ──────────────────────────────────────────────────────
--
-- admin, secretaria, pastor e diakonia continuam com acesso total — nada
-- muda para eles. `lideranca` sai do array amplo e ganha uma política
-- própria, condicionada a `lidero_ministerio_do_modulo('ebd' | 'pgm')` — a
-- mesma função que já decide quem vê a bancada do painel, agora decidindo
-- quem opera a tabela por trás dela.
--
-- Hoje isso abre para dois: Patricia Oliveira Da Silva Barreto (Educação
-- Cristã) e Lucio Paulo Paz Barreto (Pastoral) — e fecha para as outras
-- ~18 pessoas que um dia terão `lideranca` sem ligação com nenhum dos dois.

BEGIN;

-- ── EBD ──────────────────────────────────────────────────────────────────

ALTER POLICY "ebd_aulas_modify_lider" ON public.ebd_aulas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_aulas" ON public.ebd_aulas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_campanhas_modify_lider" ON public.ebd_campanhas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_campanhas" ON public.ebd_campanhas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_classes_modify_lider" ON public.ebd_classes
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_classes" ON public.ebd_classes
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_entradas_modify_lider" ON public.ebd_entradas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_entradas" ON public.ebd_entradas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_matriculas_modify_lider" ON public.ebd_matriculas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_matriculas" ON public.ebd_matriculas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_presencas_modify_lider" ON public.ebd_presencas
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_presencas" ON public.ebd_presencas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

ALTER POLICY "ebd_prof_modify" ON public.ebd_professores
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid())
                    AND ur.role::text = ANY (ARRAY['admin','secretaria','pastor','diakonia'])));
CREATE POLICY "lider_ebd_opera_professores" ON public.ebd_professores
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('ebd'))
  WITH CHECK (public.lidero_ministerio_do_modulo('ebd'));

-- ── PGM ──────────────────────────────────────────────────────────────────

ALTER POLICY "pgm_grupos_equipe" ON public.pgm_grupos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_grupos" ON public.pgm_grupos
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_marcos_discipulado_equipe" ON public.pgm_marcos_discipulado
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_marcos" ON public.pgm_marcos_discipulado
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_membros_equipe" ON public.pgm_membros
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_membros" ON public.pgm_membros
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_pedidos_oracao_equipe" ON public.pgm_pedidos_oracao
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_pedidos_oracao" ON public.pgm_pedidos_oracao
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_presencas_equipe" ON public.pgm_presencas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_presencas" ON public.pgm_presencas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_reunioes_equipe" ON public.pgm_reunioes
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_reunioes" ON public.pgm_reunioes
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

ALTER POLICY "pgm_visitas_equipe" ON public.pgm_visitas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lider_pgm_opera_visitas" ON public.pgm_visitas
  FOR ALL TO authenticated
  USING (public.lidero_ministerio_do_modulo('pgm'))
  WITH CHECK (public.lidero_ministerio_do_modulo('pgm'));

COMMIT;
