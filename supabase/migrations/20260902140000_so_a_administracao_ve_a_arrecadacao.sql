-- ═══════════════════════════════════════════════════════════════════════════
-- Só a Administração vê a arrecadação
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── A REGRA ────────────────────────────────────────────────────────────────
--
-- Ditada pela igreja em 02/09/2026, depois de ver a bancada pronta:
--
--   "Ministério de Administração e Perfil Administração apenas verão as
--    arrecadações"
--
-- São as duas Administrações que a própria igreja separou em 01/09: o PERFIL
-- (`admin`, dona do sistema) e o MINISTÉRIO (com líder no cadastro, hoje o
-- Caio Marcelo).
--
-- Isto ESTREITA o que 20260902120000 fez há poucas horas. Ali eu concedi as
-- quatro permissões a `admin` **e `secretaria`**, pelo critério de "quem já
-- cuida de dinheiro". A igreja corrigiu o critério: o Bazar e a Cantina são
-- do ministério que os opera, não da secretaria.
--
-- Medido antes de tirar, para não cortar quem trabalha: **tudo o que existe
-- no módulo foi feito pela conta da Telma** — as 17 reservas criadas e
-- aprovadas, as 7 vendas, os caixas fechados e os problemas reportados. A
-- Lourdes nunca tocou no módulo. Ninguém perde trabalho aqui.
--
-- ── VER, E NÃO OPERAR ──────────────────────────────────────────────────────
--
-- A palavra da igreja para o líder foi "enxergar caixa e vendas". Então ele
-- LÊ. Abrir caixa, registrar venda, aprovar reserva e mexer em taxa
-- continuam só com `admin`. Num acesso a dinheiro, errar para menos é a
-- escolha certa, e dar o operar depois é trocar `FOR SELECT` por `FOR ALL`
-- nestas sete políticas — uma decisão separada, tomada de olhos abertos.
--
-- ── PELO DADO, NÃO PELO PAPEL ──────────────────────────────────────────────
--
-- Não concedo nada ao papel `lideranca`: ele é o papel de TODOS os líderes de
-- ministério, e dar o caixa do Bazar a quem lidera a Música é o mesmo erro
-- que `lideranca` alcançar o financeiro, corrigido anteontem.
--
-- O recorte sai de `ministerios.lider_id / vice_lider_id / co_lider_id`
-- cruzado com `ministerios.modulo = 'arrecadacao'`. Se a igreja trocar o
-- líder, a permissão troca junto; se mover o Bazar para outro ministério, a
-- permissão vai com o Bazar. Nada disso pede commit.
--
-- ── POR QUE POLÍTICAS NOVAS, E NÃO UM `OR` NAS QUE EXISTEM ─────────────────
--
-- As políticas do módulo são `ALL`. Acrescentar um `OR` nelas daria leitura E
-- escrita de uma vez — exatamente o que não foi pedido. Política permissiva
-- soma com OU, então uma política nova só de SELECT dá o que se quer e nada
-- além. E, se isto for revertido, basta apagar as sete: nada do que já
-- funcionava foi tocado.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A secretaria sai
-- ═══════════════════════════════════════════════════════════════════════════

DELETE FROM public.role_permissoes
 WHERE role = 'secretaria'::app_role
   AND permissao_codigo IN ('ver_arrecadacao', 'ver_arrecadacao_admin',
                            'gerenciar_arrecadacao', 'operar_caixa');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A pergunta "eu lidero o ministério deste módulo?", num lugar só
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.lidero_ministerio_do_modulo(p_modulo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.ministerios m
     WHERE m.ativo
       AND m.modulo = p_modulo
       AND public.minha_pessoa_id() IN (m.lider_id, m.vice_lider_id, m.co_lider_id)
  );
$$;

COMMENT ON FUNCTION public.lidero_ministerio_do_modulo(text) IS
  'Verdadeiro se quem chama lidera, vice-lidera ou co-lidera o ministerio marcado com este modulo em ministerios.modulo. SECURITY DEFINER porque le ministerios e profiles, que a RLS restringe.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A leitura, nas sete tabelas que compõem "caixa e vendas"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O caixa, o que se vendeu, os itens de cada venda, os movimentos de
-- dinheiro, as reservas a que os caixas pertencem, o checklist de entrega e
-- os problemas que dele saem.
--
-- Ficam de fora `arr_espacos` e `arr_produtos`, que já são legíveis por
-- qualquer autenticado, e `arr_caixa_operadores`, `arr_acordo_template`,
-- `arr_checklist_template` e `arr_estoque_movimentos`, que são configuração
-- e não movimento.

DROP POLICY IF EXISTS "arr_caixas_lider_le" ON public.arr_caixas;
CREATE POLICY "arr_caixas_lider_le" ON public.arr_caixas
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_vendas_lider_le" ON public.arr_vendas;
CREATE POLICY "arr_vendas_lider_le" ON public.arr_vendas
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_itens_venda_lider_le" ON public.arr_itens_venda;
CREATE POLICY "arr_itens_venda_lider_le" ON public.arr_itens_venda
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_movimentos_lider_le" ON public.arr_movimentos;
CREATE POLICY "arr_movimentos_lider_le" ON public.arr_movimentos
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_reservas_lider_le" ON public.arr_reservas;
CREATE POLICY "arr_reservas_lider_le" ON public.arr_reservas
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_reserva_checklist_lider_le" ON public.arr_reserva_checklist;
CREATE POLICY "arr_reserva_checklist_lider_le" ON public.arr_reserva_checklist
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

DROP POLICY IF EXISTS "arr_problemas_lider_le" ON public.arr_problemas_manutencao;
CREATE POLICY "arr_problemas_lider_le" ON public.arr_problemas_manutencao
  FOR SELECT TO authenticated
  USING (public.lidero_ministerio_do_modulo('arrecadacao'));

COMMIT;
