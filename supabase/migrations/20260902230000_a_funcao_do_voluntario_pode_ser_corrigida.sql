-- ═══════════════════════════════════════════════════════════════════════════
-- A função do voluntário pode ser corrigida
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ESTA MIGRATION PREPARA ───────────────────────────────────────────
--
-- Medido em 02/09/2026: **80 dos 128 vínculos ativos não têm função** — e,
-- contando os nomes de área que vazaram para a coluna, a Comunhão tem 40 de
-- 44. Quem lidera não monta escala sem saber quem faz o quê.
--
-- E não havia como corrigir: procurando em todo o `src`, os únicos `update`
-- em `area_voluntarios` mudam `status` para 'encerrada'. A função só nascia,
-- nunca era editada. Consertar a de alguém exigia encerrar a atuação e criar
-- outra, em duas telas diferentes.
--
-- A tela de edição vem no mesmo commit. Estas duas correções são o que ela
-- precisa por baixo.
--
-- ── 1. O LÍDER EDITA A PRÓPRIA ÁREA, E SÓ ELA ──────────────────────────────
--
-- `staff_update_area_voluntarios` dá UPDATE a `admin` e `lideranca` sem
-- recorte nenhum. O líder da Música podia alterar o vínculo de alguém da
-- Recepção.
--
-- E a assimetria denuncia o descuido: a política de INSERT ao lado,
-- `lider_insert_voluntario_proprio`, JÁ é recortada por
-- `area_id IN (fn_minhas_areas())`. Quem a escreveu sabia da regra; ela só
-- não foi aplicada ao UPDATE.
--
-- `admin` continua sem recorte, e `secretaria` segue coberta pela política
-- `ALL` que já existe ao lado.
--
-- ── 2. O CONTA ≠ FICHA, PELA OITAVA VEZ ────────────────────────────────────
--
-- `voluntario_ve_proprio_vinculo` compara `membro_id = auth.uid()`.
-- `membro_id` aponta para `membros`; `auth.uid()` é o id da CONTA. Medido em
-- 01/09: das 297 fichas, ZERO têm o id de uma conta — a política nunca
-- liberou uma linha desde que existe.
--
-- É o mesmo defeito corrigido em cinco políticas na 20260901180000 e numa
-- sexta na 20260901240000 (`consent_proprio`). Esta estava fora daquele
-- levantamento porque nomeia `membro_id`, e a varredura de então procurava
-- `pessoa_id`.
--
-- Consequência prática: quem serve na igreja não conseguia ver, pelo próprio
-- acesso, que serve — a Home dizia "minha semana" pelas escalas e calava
-- sobre o vínculo que as origina.

BEGIN;

-- ── 1. O UPDATE da liderança ganha recorte ─────────────────────────────────

DROP POLICY IF EXISTS "staff_update_area_voluntarios" ON public.area_voluntarios;

CREATE POLICY "staff_update_area_voluntarios" ON public.area_voluntarios
  FOR UPDATE TO authenticated
  USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR (
      has_role((SELECT auth.uid()), 'lideranca'::app_role)
      AND area_id IN (SELECT public.fn_minhas_areas())
    )
  )
  WITH CHECK (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    OR (
      has_role((SELECT auth.uid()), 'lideranca'::app_role)
      AND area_id IN (SELECT public.fn_minhas_areas())
    )
  );

-- ── 2. Quem serve enxerga o próprio vínculo ────────────────────────────────

DROP POLICY IF EXISTS "voluntario_ve_proprio_vinculo" ON public.area_voluntarios;

CREATE POLICY "voluntario_ve_proprio_vinculo" ON public.area_voluntarios
  FOR SELECT TO authenticated
  USING (membro_id = public.minha_pessoa_id());

COMMIT;
