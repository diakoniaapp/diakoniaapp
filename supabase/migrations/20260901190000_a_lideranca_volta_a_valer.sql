-- ═══════════════════════════════════════════════════════════════════════════
-- A liderança volta a valer: onze políticas saem de uma tabela vazia
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- `fn_meu_ministerio_id()` lê da tabela `liderancas`:
--
--   SELECT referencia_id FROM liderancas
--    WHERE pessoa_id = auth.uid() AND tipo = 'ministerio' AND ativo
--
-- **`liderancas` tem 0 linhas.** A função devolve NULL para todo mundo,
-- sempre — e ONZE políticas de RLS dependem dela. Nenhuma jamais liberou nada.
--
-- E há um segundo erro embutido no primeiro: `liderancas.pessoa_id` seria
-- comparado a `auth.uid()`, que é id de CONTA e não de ficha. Ainda que a
-- tabela fosse preenchida com fichas, a comparação continuaria falhando — é o
-- mesmo defeito das outras sete políticas corrigidas hoje.
--
-- ── POR QUE NÃO PREENCHER `liderancas` ─────────────────────────────────────
--
-- A liderança JÁ está registrada, e em dois lugares que a igreja mantém:
--
--   ministerios   lider_id, vice_lider_id, co_lider_id
--   areas         lider_id, co_lider_id
--
-- Medido em 01/09/2026: 24 pessoas lideram algo por essas colunas, nos 11
-- ministérios. Copiá-las para `liderancas` criaria uma TERCEIRA cópia do mesmo
-- fato, que precisaria ser mantida em sincronia por gatilho — e este banco já
-- tem duas duplicações estruturais brigando (`profiles.role` contra
-- `user_roles`, `permissoes_modulo` contra `role_permissoes`).
--
-- Então as funções passam a ler de onde o dado está.
--
-- ── POR QUE UM CONJUNTO, E NÃO UM VALOR ────────────────────────────────────
--
-- `fn_meu_ministerio_id()` devolve UM uuid, e as políticas comparam com `=`.
-- Medido: das 24 pessoas que lideram, **3 lideram mais de um ministério**.
--
-- Consertar só a função deixaria essas três com acesso a metade do que
-- lideram — e "funciona para 21 de 24" é pior que não funcionar, porque
-- ninguém descobre quais três.
--
-- Daí `fn_meus_ministerios()`, que devolve `SETOF uuid`, e as políticas
-- passando de `=` para `IN`.
--
-- ── A HIERARQUIA É RESPEITADA ──────────────────────────────────────────────
--
-- Quem lidera um MINISTÉRIO alcança todas as áreas dele.
-- Quem lidera uma ÁREA alcança só a sua.
--
-- Por isso são duas funções e não uma. Dar a um líder de área a escala inteira
-- do ministério seria mais do que a igreja registrou sobre ele — e o painel de
-- ministério, que já lê essas mesmas colunas, faz a mesma distinção na tela.
--
-- ── O QUE ISSO DESTRAVA ────────────────────────────────────────────────────
--
-- Ler e escrever áreas, escalas e eventos do próprio ministério. Hoje a
-- LEITURA funciona por acidente — há políticas largas em paralelo
-- (`Autenticados leem areas`, `esc_select` com `true`) — mas a escrita não:
-- nenhum líder cria um evento do ministério dele.

BEGIN;

-- ── Os ministérios que eu lidero ───────────────────────────────────────────
--
-- SECURITY DEFINER porque `ministerios`, `areas` e `profiles` têm RLS: dentro
-- de uma política, consultar as três dispararia a RLS delas — e a de `areas`
-- chama esta função, o que seria recursão.
CREATE OR REPLACE FUNCTION public.fn_meus_ministerios()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT m.id
    FROM public.ministerios m
   WHERE m.ativo
     AND public.minha_pessoa_id() IN (m.lider_id, m.vice_lider_id, m.co_lider_id);
$fn$;

COMMENT ON FUNCTION public.fn_meus_ministerios() IS
  'Os ministerios que quem esta logado lidera, por ministerios.lider_id/vice/co. Le a ficha via minha_pessoa_id(), NAO auth.uid() — conta e ficha sao registros diferentes.';

-- ── As áreas que eu alcanço ────────────────────────────────────────────────
--
-- As que lidero diretamente, mais todas as dos ministérios que lidero.
CREATE OR REPLACE FUNCTION public.fn_minhas_areas()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT a.id
    FROM public.areas a
   WHERE a.ativo
     AND (
       public.minha_pessoa_id() IN (a.lider_id, a.co_lider_id)
       OR a.ministerio_id IN (SELECT public.fn_meus_ministerios())
     );
$fn$;

COMMENT ON FUNCTION public.fn_minhas_areas() IS
  'As areas que quem esta logado alcanca: as que lidera, mais todas as dos ministerios que lidera. Ver fn_meus_ministerios().';

-- ── A função antiga passa a ler o lugar certo ──────────────────────────────
--
-- Não é apagada: nada garante que só as onze políticas a usem, e um `DROP`
-- levaria junto qualquer chamador que eu não tenha encontrado. Ela devolve o
-- primeiro dos meus ministérios, que é o que ela sempre prometeu — agora
-- lendo de onde o dado está.
CREATE OR REPLACE FUNCTION public.fn_meu_ministerio_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT id FROM public.fn_meus_ministerios() AS id LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.fn_meu_ministerio_id() IS
  'O PRIMEIRO ministerio que a pessoa lidera. Lia de `liderancas`, que esta vazia, e devolvia NULL sempre. Para quem lidera mais de um (3 de 24 em 01/09/2026) ela e insuficiente: prefira fn_meus_ministerios().';

-- ══════════════════════════════════════════════════════════════════════════
-- As onze políticas, de `=` para `IN`
-- ══════════════════════════════════════════════════════════════════════════
--
-- Cada uma é recriada inteira, preservando o `has_role('lideranca')` que já
-- tinham. O que muda é só a comparação de ministério e de área.

-- ── areas ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS lider_select_areas_proprias ON public.areas;
CREATE POLICY lider_select_areas_proprias ON public.areas
  FOR SELECT
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND ministerio_id IN (SELECT public.fn_meus_ministerios())
  );

DROP POLICY IF EXISTS lider_insert_area_propria ON public.areas;
CREATE POLICY lider_insert_area_propria ON public.areas
  FOR INSERT
  WITH CHECK (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND ministerio_id IN (SELECT public.fn_meus_ministerios())
  );

DROP POLICY IF EXISTS lider_update_area_propria ON public.areas;
CREATE POLICY lider_update_area_propria ON public.areas
  FOR UPDATE
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND ministerio_id IN (SELECT public.fn_meus_ministerios())
  );

-- ── area_voluntarios ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS lider_select_voluntarios_proprios ON public.area_voluntarios;
CREATE POLICY lider_select_voluntarios_proprios ON public.area_voluntarios
  FOR SELECT
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND area_id IN (SELECT public.fn_minhas_areas())
  );

DROP POLICY IF EXISTS lider_insert_voluntario_proprio ON public.area_voluntarios;
CREATE POLICY lider_insert_voluntario_proprio ON public.area_voluntarios
  FOR INSERT
  WITH CHECK (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND area_id IN (SELECT public.fn_minhas_areas())
  );

-- ── escalas ───────────────────────────────────────────────────────────────
--
-- Mantém o `OR` original: a escala pode estar presa ao ministério OU à área.
DROP POLICY IF EXISTS lider_select_escalas_proprias ON public.escalas;
CREATE POLICY lider_select_escalas_proprias ON public.escalas
  FOR SELECT
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND (
      ministerio_id IN (SELECT public.fn_meus_ministerios())
      OR area_id IN (SELECT public.fn_minhas_areas())
    )
  );

DROP POLICY IF EXISTS lider_insert_escala_propria ON public.escalas;
CREATE POLICY lider_insert_escala_propria ON public.escalas
  FOR INSERT
  WITH CHECK (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND (
      ministerio_id IN (SELECT public.fn_meus_ministerios())
      OR area_id IN (SELECT public.fn_minhas_areas())
    )
  );

DROP POLICY IF EXISTS lider_update_escala_propria ON public.escalas;
CREATE POLICY lider_update_escala_propria ON public.escalas
  FOR UPDATE
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND (
      ministerio_id IN (SELECT public.fn_meus_ministerios())
      OR area_id IN (SELECT public.fn_minhas_areas())
    )
  );

-- ── eventos ───────────────────────────────────────────────────────────────
--
-- Nível de ministério, como era. `ministerio_principal_id IS NULL` continua
-- passando em SELECT e INSERT: um evento sem ministério é da igreja inteira, e
-- tirar isso agora esconderia eventos que hoje a liderança vê.
DROP POLICY IF EXISTS lider_select_eventos_proprios ON public.eventos;
CREATE POLICY lider_select_eventos_proprios ON public.eventos
  FOR SELECT
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND (
      ministerio_principal_id IN (SELECT public.fn_meus_ministerios())
      OR ministerio_principal_id IS NULL
    )
  );

DROP POLICY IF EXISTS lider_insert_evento_proprio ON public.eventos;
CREATE POLICY lider_insert_evento_proprio ON public.eventos
  FOR INSERT
  WITH CHECK (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND (
      ministerio_principal_id IN (SELECT public.fn_meus_ministerios())
      OR ministerio_principal_id IS NULL
    )
  );

-- No UPDATE o `IS NULL` não estava, e continua não estando: editar um evento
-- da igreja inteira é outra coisa, e quem pode fazê-lo já tem `staff_update`.
DROP POLICY IF EXISTS lider_update_evento_proprio ON public.eventos;
CREATE POLICY lider_update_evento_proprio ON public.eventos
  FOR UPDATE
  USING (
    has_role((SELECT auth.uid()), 'lideranca'::app_role)
    AND ministerio_principal_id IN (SELECT public.fn_meus_ministerios())
  );

COMMIT;
