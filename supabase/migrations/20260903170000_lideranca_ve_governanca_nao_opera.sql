-- ═══════════════════════════════════════════════════════════════════════════
-- Liderança vê governança, não opera
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B·2 do plano, segundo lote. A igreja já tinha decidido isto, em duas
-- frases separadas por poucos minutos: "liderança não opera o financeiro" e,
-- perguntada sobre atas e pautas, "sim, liderança vê". As 11 tabelas de
-- governança davam a `lideranca` acesso ALL — ler, criar, editar, apagar
-- ata, pauta, voto, assembleia. A igreja pediu metade disso.
--
-- ── SEM RECORTE POR ÁREA, DE PROPÓSITO ──────────────────────────────────────
--
-- As outras frentes deste plano (EBD, PGM) recortam por
-- `lidero_ministerio_do_modulo` — só quem lidera aquele módulo opera aquela
-- tabela. Governança não tem módulo, nem área, nem ministério: medido antes
-- de escrever, nenhuma das 11 tabelas tem `area_id` nem `ministerio_id`. Ata
-- de assembleia e pauta de reunião de diretoria são da igreja inteira, não
-- de um ministério — e por isso a regra é a mesma para toda `lideranca`,
-- sem condicionar a quem lidera o quê.
--
-- ── O QUE NÃO MUDA ───────────────────────────────────────────────────────────
--
-- admin, secretaria, tesouraria, pastor e diakonia continuam com ALL —
-- ninguém desses perde nada. `lideranca` sai do array de cada política ALL e
-- ganha uma política própria de SELECT, em cada uma das 11.

BEGIN;

-- ── As quatro com pastor no array (assuntos e correlatas) ──────────────────

ALTER POLICY "assinaturas_oficiais_equipe" ON public.assinaturas_oficiais
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lideranca_ve_assinaturas_oficiais" ON public.assinaturas_oficiais
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "assuntos_equipe" ON public.assuntos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lideranca_ve_assuntos" ON public.assuntos
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "assuntos_historico_equipe" ON public.assuntos_historico
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lideranca_ve_assuntos_historico" ON public.assuntos_historico
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "reuniao_assuntos_equipe" ON public.reuniao_assuntos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','pastor','diakonia']::app_role[]));
CREATE POLICY "lideranca_ve_reuniao_assuntos" ON public.reuniao_assuntos
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

-- ── As sete com tesouraria no array, sem pastor (gov_*) ─────────────────────

ALTER POLICY "gov_assembleia_presentes_equipe" ON public.gov_assembleia_presentes
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_assembleia_presentes" ON public.gov_assembleia_presentes
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_assembleias_equipe" ON public.gov_assembleias
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_assembleias" ON public.gov_assembleias
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_historico_equipe" ON public.gov_historico
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_historico" ON public.gov_historico
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_participantes_equipe" ON public.gov_participantes
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_participantes" ON public.gov_participantes
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_pautas_equipe" ON public.gov_pautas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_pautas" ON public.gov_pautas
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_reunioes_equipe" ON public.gov_reunioes
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_reunioes" ON public.gov_reunioes
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

ALTER POLICY "gov_votos_equipe" ON public.gov_votos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria','tesouraria']::app_role[]));
CREATE POLICY "lideranca_ve_gov_votos" ON public.gov_votos
  FOR SELECT TO authenticated USING (public.has_role((SELECT auth.uid()), 'lideranca'));

COMMIT;
