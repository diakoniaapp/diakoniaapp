-- ROLLBACK de supabase/migrations/20261027230000_categoria_eventos_e_vendas.sql
-- Só vale logo depois da migration: devolve a "Ofertas" TODOS os lançamentos que estiverem em "Eventos e Vendas" (a trilha do lançamento registra os dois movimentos) e remove a categoria,
-- se ficar vazia. Se a Tesouraria já tiver lançado receitas novas nela, NÃO rode: reclassifique à mão.
UPDATE public.fin_lancamentos l
   SET categoria_id = (SELECT id FROM public.fin_categorias WHERE nome = 'Ofertas' AND tipo = 'entrada')
 WHERE l.categoria_id = (SELECT id FROM public.fin_categorias WHERE nome = 'Eventos e Vendas' AND tipo = 'entrada');

DELETE FROM public.fin_categorias c
 WHERE c.nome = 'Eventos e Vendas' AND c.tipo = 'entrada'
   AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.categoria_id = c.id);
