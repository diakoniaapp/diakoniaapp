-- ═══════════════════════════════════════════════════════════════════════════
-- Crescimento é dona das tarefas de acolhimento
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `acolhimento_tarefas` — as 12 tarefas vencidas que abriram a bancada "A
-- porta da frente" — nunca teve `area_id`. Era trabalho do MINISTÉRIO, sem
-- dono dentro dele. Agora tem: a área Crescimento, criada há pouco com essa
-- descrição exata.
--
-- ── COMO O SISTEMA SABE QUAL ÁREA É ─────────────────────────────────────────
--
-- `ministerios.modulo = 'acolhimento'` já marca QUAL ministério tem a
-- bancada. `ministerios.area_acolhimento_id`, nova aqui, marca qual ÁREA
-- dentro dele é a dona — o mesmo desenho, um nível abaixo. Sem essa coluna, o
-- código teria de adivinhar "a área que se chama Crescimento", e nome é a
-- primeira coisa que muda quando ninguém está olhando.
--
-- ── O QUE ISSO ABRE, DE VERDADE ─────────────────────────────────────────────
--
-- Hoje só admin, secretaria, pastor e diakonia enxergam
-- `acolhimento_tarefas` — LIDERANÇA NENHUMA, nem a do próprio ministério. O
-- líder de Comunhão via a seção no painel, mas a RLS por baixo recusava toda
-- linha; a tela e o banco discordavam. Esta migration acrescenta o que
-- faltava: quem lidera a ÁREA (ou o ministério, pela cascata que
-- `fn_minhas_areas()` já faz) passa a ler e editar as tarefas da própria
-- área. As quatro políticas pastorais continuam de pé — liderança ganha
-- acesso, ninguém perde.
--
-- ── O QUE NÃO MUDA AQUI ──────────────────────────────────────────────────────
--
-- `visita_historico` (293 linhas) não é tocada — é linha do tempo, não
-- trabalho de área. E a política de INSERT continua aberta a qualquer
-- autenticado: apertar esse portão é outra conversa, e esta é sobre dar dono
-- ao que já existia solto.

BEGIN;

ALTER TABLE public.ministerios
  ADD COLUMN IF NOT EXISTS area_acolhimento_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

ALTER TABLE public.acolhimento_tarefas
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

DO $migracao$
DECLARE
  v_crescimento uuid;
BEGIN
  SELECT id INTO v_crescimento FROM public.areas a
   WHERE a.nome = 'Crescimento'
     AND a.ministerio_id = (SELECT id FROM public.ministerios WHERE nome LIKE 'Comunh%');

  IF v_crescimento IS NULL THEN
    RAISE EXCEPTION 'Área Crescimento não encontrada — nada foi alterado.';
  END IF;

  UPDATE public.ministerios SET area_acolhimento_id = v_crescimento
   WHERE modulo = 'acolhimento';

  -- As 12 de hoje ganham dono. Só as que ainda não tinham — reaplicar esta
  -- migration não reatribui o que já foi movido para outro lugar por alguém.
  UPDATE public.acolhimento_tarefas SET area_id = v_crescimento
   WHERE area_id IS NULL;
END
$migracao$;

-- ── A liderança da área passa a enxergar o que é dela ───────────────────────
--
-- `fn_minhas_areas()` já faz a cascata: líder da ÁREA, ou líder do
-- MINISTÉRIO que a contém. Um nome cobre os dois casos sem duplicar política.

CREATE POLICY "lider_le_tarefas_da_propria_area" ON public.acolhimento_tarefas
  FOR SELECT TO authenticated
  USING (area_id IN (SELECT public.fn_minhas_areas()));

CREATE POLICY "lider_edita_tarefas_da_propria_area" ON public.acolhimento_tarefas
  FOR UPDATE TO authenticated
  USING (area_id IN (SELECT public.fn_minhas_areas()))
  WITH CHECK (area_id IN (SELECT public.fn_minhas_areas()));

COMMIT;
