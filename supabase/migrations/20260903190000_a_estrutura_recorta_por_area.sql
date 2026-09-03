-- ═══════════════════════════════════════════════════════════════════════════
-- A estrutura recorta por área
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B·2, quarto lote — 27 políticas em 11 tabelas, e três formas diferentes do
-- mesmo problema.
--
-- ── FORMA 1 · O RECORTE JÁ EXISTIA, E UMA AMPLA O ANULAVA ───────────────────
--
-- `areas` e `eventos` já tinham `lider_insert/update/select_..._propria`,
-- condicionadas a `fn_minhas_areas()` / `fn_meus_ministerios()` — o mesmo
-- B·5 de `escalas`. Bastava apertar as amplas (`staff_insert_areas`,
-- `staff_update_areas`, `staff_insert_eventos`, `staff_update_eventos`,
-- `staff_insert_area_voluntarios`); o recorte certo já estava esperando.
--
-- ── FORMA 2 · NUNCA HOUVE RECORTE, E PRECISA HAVER ───────────────────────────
--
-- `checklist_area`, `evento_areas`, `evento_ministerios`, `ministerios`
-- (só o UPDATE) e `perfil_servico` davam a qualquer `lideranca` ALL sem
-- condição nenhuma, e não existia nenhuma política alternativa recortada.
-- Aqui a migration CRIA o recorte, não só aperta o que já havia.
--
-- `perfil_servico` é o achado mais sério dos quatro lotes até aqui: a tabela
-- não tem `area_id` — é dado da PESSOA — e por isso o recorte precisa de uma
-- subconsulta em `area_voluntarios`: só quem SERVE numa área que o líder
-- lidera. Sem isto, qualquer `lideranca` lia e editava dias, turnos,
-- restrições, motivo de descanso e nota pastoral de QUALQUER pessoa da
-- igreja — não só da própria equipe.
--
-- ── FORMA 3 · REGISTRO ADMINISTRATIVO, NÃO OPERAÇÃO DE LIDERANÇA ─────────────
--
-- `historico_lideranca`, `liderancas` e `ministerios` (o INSERT) são
-- registro formal — quem ocupou que cargo, quando um ministério nasceu.
-- Não existe "minha área" antes de o ministério existir, e reescrever o
-- próprio histórico de liderança não é operação de quem lidera. `lideranca`
-- sai por completo dessas três, sem política substituta — fica só admin
-- (e secretaria, onde já valia).
--
-- `ministerio_membros`: 0 linhas em produção, tabela morta desde a fusão de
-- `pessoa_participacao`/`area_voluntarios`. Segue a Forma 3 por economia —
-- não vale desenhar recorte para o que não é lido em lugar nenhum.
--
-- ── O QUE FICA DE FORA DESTE LOTE, DE PROPÓSITO ─────────────────────────────
--
-- `checklist_execucao`: insere e edita quem quer que esteja autenticado —
-- é a conferência de presença de quem SERVE, não trabalho de liderança, e
-- apertar isso é outra conversa.
-- `pessoas`: já não dava escrita a `lideranca` nenhuma; só leitura de
-- visitante/congregado, já recortada. Nada a fazer.
-- `predios`, `unidades`: `lideranca` só lê; gerenciar já era só admin/
-- secretaria. Nada a fazer.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- FORMA 1 — apertar o amplo, o recorte já existe
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "staff_insert_area_voluntarios" ON public.area_voluntarios
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

ALTER POLICY "staff_insert_areas" ON public.areas
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_update_areas" ON public.areas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

ALTER POLICY "staff_insert_eventos" ON public.eventos
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_update_eventos" ON public.eventos
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

-- ═══════════════════════════════════════════════════════════════════════════
-- FORMA 2 — apertar o amplo, e criar o recorte que faltava
-- ═══════════════════════════════════════════════════════════════════════════

-- ── checklist_area ──────────────────────────────────────────────────────

ALTER POLICY "chk_write" ON public.checklist_area
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_insert_checklist_area" ON public.checklist_area
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));
ALTER POLICY "staff_update_checklist_area" ON public.checklist_area
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

CREATE POLICY "lider_gerencia_checklist_da_propria_area" ON public.checklist_area
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()));

-- ── evento_areas ─────────────────────────────────────────────────────────

ALTER POLICY "staff_insert_evento_areas" ON public.evento_areas
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_update_evento_areas" ON public.evento_areas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

CREATE POLICY "lider_gerencia_evento_areas_da_propria_area" ON public.evento_areas
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()));

-- ── evento_ministerios ───────────────────────────────────────────────────

ALTER POLICY "staff_insert_evento_ministerios" ON public.evento_ministerios
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_update_evento_ministerios" ON public.evento_ministerios
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

CREATE POLICY "lider_gerencia_evento_ministerios_do_proprio_ministerio" ON public.evento_ministerios
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'lideranca') AND ministerio_id IN (SELECT public.fn_meus_ministerios()))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'lideranca') AND ministerio_id IN (SELECT public.fn_meus_ministerios()));

-- ── ministerios — só o UPDATE ganha recorte; criar ministério é Forma 3 ────

ALTER POLICY "staff_update_ministerios" ON public.ministerios
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

CREATE POLICY "lider_atualiza_proprio_ministerio" ON public.ministerios
  FOR UPDATE TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'lideranca') AND id IN (SELECT public.fn_meus_ministerios()))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'lideranca') AND id IN (SELECT public.fn_meus_ministerios()));

-- ── perfil_servico — o achado do lote ───────────────────────────────────
--
-- Sem area_id: o recorte é "a pessoa serve em alguma área que eu lidero".

ALTER POLICY "ps_admin" ON public.perfil_servico
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));
ALTER POLICY "staff_insert_perfil_servico" ON public.perfil_servico
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));
ALTER POLICY "staff_update_perfil_servico" ON public.perfil_servico
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

CREATE POLICY "lider_gerencia_perfil_da_propria_equipe" ON public.perfil_servico
  FOR ALL TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'lideranca')
    AND pessoa_id IN (
      SELECT av.membro_id FROM public.area_voluntarios av
       WHERE av.status = 'ativa' AND av.area_id IN (SELECT public.fn_minhas_areas())
    )
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'lideranca')
    AND pessoa_id IN (
      SELECT av.membro_id FROM public.area_voluntarios av
       WHERE av.status = 'ativa' AND av.area_id IN (SELECT public.fn_minhas_areas())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- FORMA 3 — registro administrativo: lideranca sai, sem substituta
-- ═══════════════════════════════════════════════════════════════════════════

ALTER POLICY "staff_insert_historico_lideranca" ON public.historico_lideranca
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));
ALTER POLICY "staff_update_historico_lideranca" ON public.historico_lideranca
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

ALTER POLICY "staff_insert_liderancas" ON public.liderancas
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));
ALTER POLICY "staff_update_liderancas" ON public.liderancas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

ALTER POLICY "staff_insert_ministerios" ON public.ministerios
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

ALTER POLICY "staff_insert_ministerio_membros" ON public.ministerio_membros
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));
ALTER POLICY "staff_update_ministerio_membros" ON public.ministerio_membros
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

COMMIT;
