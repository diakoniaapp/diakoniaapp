-- ═══════════════════════════════════════════════════════════════════════════
-- Liderança só opera a própria escala
-- ═══════════════════════════════════════════════════════════════════════════
--
-- B·2, terceiro lote — e o B·5 que a troca de perfil do Bruno revelou em
-- 03/09: "esc_select é USING(true) — toda conta vê todas as escalas. E as
-- quatro políticas recortadas logo abaixo dela — a do líder, a do pastor, a
-- do voluntário — são inteiramente redundantes: parecem recorte e não
-- recortam nada."
--
-- ── A DIFERENÇA DESTE LOTE PARA OS DOIS ANTERIORES ──────────────────────────
--
-- EBD e PGM não tinham NENHUMA política recortada — foi preciso criar. Aqui
-- o recorte por área/ministério já existe em `escalas`:
-- `lider_insert_escala_propria`, `lider_select_escalas_proprias`,
-- `lider_update_escala_propria`. O defeito não é a falta de recorte — é que
-- três políticas AMPLAS, sem condição nenhuma, ainda davam a qualquer
-- `lideranca` ALL sobre toda escala da igreja: `esc_write`,
-- `staff_insert_escalas`, `staff_update_escalas`. Políticas permissivas se
-- somam — bastava UMA ampla para as três recortadas não valerem nada.
--
-- ── ESCRITA, NÃO LEITURA ─────────────────────────────────────────────────────
--
-- `esc_select` (leitura ampla) NÃO é tocada aqui — de propósito. Escala de
-- culto costuma ser informação afixada, pública dentro da igreja; apertar a
-- leitura sem perguntar decidiria por conta própria que deixou de ser assim.
-- O que se fecha é quem PODE MEXER, que é onde o risco mora.
--
-- ── `escala_voluntarios` NÃO TINHA NENHUM RECORTE, NEM PARA LEITURA ─────────
--
-- Diferente de `escalas`, aqui não existia nenhuma política recortada por
-- área — só a própria linha (`escvol_a_minha`), a leitura pastoral, e as
-- amplas. Apertar as amplas sem criar o recorte tiraria da liderança até a
-- visão da própria equipe — e quebraria `tirarDaEscala()`, que depende de
-- DELETE. Por isso este lote cria uma política nova aqui, e só aqui.

BEGIN;

-- ── escalas: apertar as três amplas; as três recortadas já existem ─────────

ALTER POLICY "esc_write" ON public.escalas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

ALTER POLICY "staff_insert_escalas" ON public.escalas
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

ALTER POLICY "staff_update_escalas" ON public.escalas
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

-- ── escala_voluntarios: apertar as amplas, e criar o recorte que faltava ───

ALTER POLICY "escvol_admin" ON public.escala_voluntarios
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[]));

ALTER POLICY "staff_insert_escala_voluntarios" ON public.escala_voluntarios
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[]));

ALTER POLICY "staff_update_escala_voluntarios" ON public.escala_voluntarios
  USING (public.has_any_role((SELECT auth.uid()), ARRAY['admin']::app_role[])
         OR pessoa_id = public.minha_pessoa_id());

-- A equipe da própria área — ler, escalar, remover. `FOR ALL` porque líder
-- que monta escala precisa das quatro operações; `admin_delete_escala_
-- voluntarios` continua de pé por cima disto, sem conflito.
CREATE POLICY "lider_gerencia_escala_voluntarios_da_propria_area" ON public.escala_voluntarios
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'lideranca') AND area_id IN (SELECT public.fn_minhas_areas()));

COMMIT;
