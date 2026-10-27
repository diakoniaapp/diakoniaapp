-- ENSAIO (não grava nada) de supabase/migrations/20261027230000_categoria_eventos_e_vendas.sql
-- Faz o mesmo que a migration e, no fim, FORÇA UM ERRO de propósito: o erro desfaz tudo (nada fica gravado) e a mensagem dele traz os números.
-- Cole no SQL Editor do Supabase e rode. Leia a mensagem "ENSAIO: …" (não é falha da migration).
-- Esperado em 27/10/2026, sem período fechado: 65 lançamentos e R$ 7.982,34 movidos; 0 Cielo restante em Ofertas.
-- Se vier menos de 65, a diferença está em período fechado/aprovado (o ensaio diz quantos).
DO $ensaio$
DECLARE
  v_movidos integer; v_valor numeric; v_restantes integer; v_fechados integer; v_missoes integer;
BEGIN
  INSERT INTO public.fin_categorias (nome, tipo, classificacao_dre, ordem, sistema, ativo, observacao)
  SELECT 'Eventos e Vendas', 'entrada', 'outras_receitas', 4, false, true, 'ensaio'
  WHERE NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE nome = 'Eventos e Vendas' AND tipo = 'entrada');

  WITH alvo AS (
    SELECT l.id
    FROM public.fin_lancamentos l
    JOIN public.fin_categorias oferta ON oferta.id = l.categoria_id AND oferta.nome = 'Ofertas' AND oferta.tipo = 'entrada'
    JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id AND f.nome ILIKE '%cielo%'
    LEFT JOIN public.fin_fechamentos_periodo p ON p.id = l.fechamento_id
    WHERE l.tipo = 'entrada' AND l.pessoa_id IS NULL AND l.data >= DATE '2026-01-01'
      AND l.status::text IN ('realizado', 'conciliado')
      AND (l.fechamento_id IS NULL OR p.status::text NOT IN ('fechado', 'aprovado'))
  )
  UPDATE public.fin_lancamentos l
     SET categoria_id = (SELECT id FROM public.fin_categorias WHERE nome = 'Eventos e Vendas' AND tipo = 'entrada')
    FROM alvo WHERE l.id = alvo.id;

  SELECT count(*), COALESCE(sum(l.valor), 0) INTO v_movidos, v_valor
    FROM public.fin_lancamentos l JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.nome = 'Eventos e Vendas' AND c.tipo = 'entrada';
  SELECT count(*) INTO v_restantes
    FROM public.fin_lancamentos l
    JOIN public.fin_categorias oferta ON oferta.id = l.categoria_id AND oferta.nome = 'Ofertas' AND oferta.tipo = 'entrada'
    JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id AND f.nome ILIKE '%cielo%'
   WHERE l.tipo = 'entrada' AND l.pessoa_id IS NULL AND l.data >= DATE '2026-01-01' AND l.status::text IN ('realizado', 'conciliado');
  SELECT count(*) INTO v_missoes
    FROM public.fin_lancamentos l
    JOIN public.fin_categorias m ON m.id = l.categoria_id AND m.nome = 'Ofertas para Missões' AND m.tipo = 'entrada'
    JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id AND f.nome ILIKE '%cielo%'
   WHERE l.data >= DATE '2026-01-01';
  v_fechados := v_restantes;

  RAISE EXCEPTION 'ENSAIO (nada foi gravado): % lançamentos movidos para Eventos e Vendas, somando R$ %; % Cielo ficaram em Ofertas (período fechado/aprovado); % Cielo de Ofertas para Missões intactas (esperado 51).',
    v_movidos, v_valor, v_fechados, v_missoes;
END
$ensaio$;
