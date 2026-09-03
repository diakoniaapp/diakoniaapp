-- ═══════════════════════════════════════════════════════════════════════════
-- Quem mexe nos postos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Duas tabelas novas nascem sem RLS ligada, e nesse estado o PostgREST as
-- serve inteiras a qualquer conta autenticada. Ligar a RLS e não escrever
-- política nenhuma é o extremo oposto: a tabela fica invisível até para quem
-- deveria mexer. As duas pontas são erro; esta migration escreve o meio.
--
-- ── O RECORTE ──────────────────────────────────────────────────────────────
--
--   O CATÁLOGO (area_funcoes) é estrutura, como a própria área.
--     ler      qualquer autenticado — é uma lista de nomes de posto, e a
--              tela do voluntário precisa dela para oferecer as etiquetas.
--              Mesmo recorte de `Autenticados leem areas`.
--     escrever admin/secretaria em qualquer área; líder só nas suas.
--
--   A LIGAÇÃO (area_voluntario_funcoes) diz o que UMA PESSOA faz, e isso é
--   dado dela.
--     ler      staff e pastor; o líder, na sua área; o voluntário, o seu.
--     escrever staff; o líder na sua área; e o voluntário APENAS para se
--              autodeclarar, sempre por confirmar.
--
-- ── POR QUE HELPERS EM VEZ DE SUBCONSULTA DIRETA ───────────────────────────
--
-- Uma política que faz `EXISTS (SELECT ... FROM area_voluntarios ...)` roda
-- essa subconsulta com a RLS de `area_voluntarios` por cima. Quando a linha
-- está escondida do chamador, o EXISTS dá falso e a política nega — sem erro,
-- sem aviso, sem nada que se pareça com um defeito. É a mesma família da
-- escrita barrada que devolve sucesso com zero linhas.
--
-- Os dois helpers abaixo são SECURITY DEFINER e respondem uma pergunta só:
-- de que área é este vínculo, e de quem ele é. Determinístico.
--
-- ── DIAKONIA ───────────────────────────────────────────────────────────────
--
-- Não aparece em nenhuma política aqui, e é de propósito: desde
-- 20260902160000 a conta do dono carrega `diakonia` E `admin`, exatamente
-- para que as políticas não precisem listar os dois.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_area_do_vinculo(p_vinculo uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT av.area_id FROM public.area_voluntarios av WHERE av.id = p_vinculo
$fn$;

CREATE OR REPLACE FUNCTION public.fn_pessoa_do_vinculo(p_vinculo uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT av.membro_id FROM public.area_voluntarios av WHERE av.id = p_vinculo
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O CATÁLOGO
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.area_funcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon" ON public.area_funcoes
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Autenticados leem area_funcoes" ON public.area_funcoes
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/Sec gerenciam area_funcoes" ON public.area_funcoes
  FOR ALL TO authenticated
  USING      (public.has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- O líder monta o catálogo da SUA área e de mais nenhuma. É ele quem sabe
-- que a banda precisa de baterista e a recepção não.
CREATE POLICY "lider_gerencia_postos_da_propria_area" ON public.area_funcoes
  FOR ALL TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND area_id IN (SELECT public.fn_minhas_areas())
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND area_id IN (SELECT public.fn_minhas_areas())
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- A LIGAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.area_voluntario_funcoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon" ON public.area_voluntario_funcoes
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Admin/Sec gerenciam area_voluntario_funcoes" ON public.area_voluntario_funcoes
  FOR ALL TO authenticated
  USING      (public.has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (public.has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- `lideranca` NÃO está aqui, e a primeira versão desta migration punha.
--
-- Fui conferir a política irmã antes de fechar: `Staff leem area_voluntarios`
-- é admin + secretaria + diakonia, e a liderança lê por OUTRA política, a
-- que recorta por `fn_minhas_areas()`. Listar `lideranca` neste SELECT amplo
-- entregaria a cada líder a função de todos os voluntários da igreja — com
-- cara de política recortada, porque logo abaixo há uma que recorta. É a
-- mesma armadilha do `igreja_id` que casava com 297 de 297 linhas.
--
-- O líder lê a própria equipe pela política seguinte, e nada além dela.
CREATE POLICY "staff_le_area_voluntario_funcoes" ON public.area_voluntario_funcoes
  FOR SELECT TO authenticated
  USING (public.has_any_role((SELECT auth.uid()),
         ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

CREATE POLICY "pastor_ve_area_voluntario_funcoes" ON public.area_voluntario_funcoes
  FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'pastor'::app_role));

CREATE POLICY "lider_gerencia_funcoes_da_propria_equipe" ON public.area_voluntario_funcoes
  FOR ALL TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND public.fn_area_do_vinculo(area_voluntario_id) IN (SELECT public.fn_minhas_areas())
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND public.fn_area_do_vinculo(area_voluntario_id) IN (SELECT public.fn_minhas_areas())
  );

-- O voluntário vê o que declarou e o que confirmaram sobre ele. Ver a função
-- dos outros não é assunto dele — é a mesma linha que já vale para a ficha.
CREATE POLICY "voluntario_ve_as_proprias_funcoes" ON public.area_voluntario_funcoes
  FOR SELECT TO authenticated
  USING (public.fn_pessoa_do_vinculo(area_voluntario_id) = public.minha_pessoa_id());

-- A autodeclaração. Três amarras no WITH CHECK, e cada uma tapa um caminho:
--   origem='autodeclarada'   ninguém se cadastra como se a liderança tivesse
--                            cadastrado;
--   confirmada_em IS NULL    ninguém se autoconfirma;
--   é o próprio vínculo      ninguém declara função para outra pessoa.
CREATE POLICY "voluntario_declara_a_propria_funcao" ON public.area_voluntario_funcoes
  FOR INSERT TO authenticated
  WITH CHECK (
    origem = 'autodeclarada'
    AND confirmada_em IS NULL
    AND confirmada_por IS NULL
    AND public.fn_pessoa_do_vinculo(area_voluntario_id) = public.minha_pessoa_id()
  );

-- Quem se enganou tem de poder desdizer — mas só enquanto pende. Depois de
-- confirmada, a função é da equipe e sai pela liderança.
CREATE POLICY "voluntario_retira_a_propria_pendente" ON public.area_voluntario_funcoes
  FOR DELETE TO authenticated
  USING (
    origem = 'autodeclarada'
    AND confirmada_em IS NULL
    AND public.fn_pessoa_do_vinculo(area_voluntario_id) = public.minha_pessoa_id()
  );

COMMIT;
