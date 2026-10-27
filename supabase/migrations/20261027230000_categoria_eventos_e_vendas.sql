-- ─── Categoria de entrada "Eventos e Vendas" (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────
-- DEFEITO. Só existem 6 categorias de entrada (Descontos Obtidos, Dizimos, Estornos e Recuperações, Ofertas, Ofertas para Missões, Rendimentos de Aplicações). Não havia onde lançar a receita de bazar,
-- almoço, lanche ou evento: ela caía em "Ofertas" e inflava as ofertas e a "Arrecadado" da Central de Doadores (e as Receitas Regulares do DRE).
-- MEDIÇÃO (auditoria de 27/10/2026, docs/AUDITORIA_INDICADORES_CONTRIBUICOES_2026-10-27.md): 65 lançamentos de 2026 em "Ofertas", sem pessoa, pagos por cartão (favorecido Cielo), R$ 7.982,34 = 11,2% das
-- Ofertas: Bazar Ornamentação 36, Almoço Juventude 13, Bazar Apoio ADM 11, Lanche Juventude 1, 4 sem descrição. Destes, 62 (R$ 7.845,79) trazem uma palavra de venda no texto; os outros 3 (R$ 136,55) não dizem
-- o que são. DECISÃO DELA (27/10/2026): "Cielo é sempre venda" — então os 65 vão. As 51 Cielo de "Ofertas para Missões" (R$ 9.497,28; todas sem descrição, 49 em junho/2026, centro Campanhas Missionárias)
-- NÃO são tocadas: mexer nelas tira dinheiro do fundo missionário; aguardam decisão própria.
-- DECISÃO DELA (27/10/2026): categoria "Eventos e Vendas", classificada no DRE como "Outras Receitas".
-- O QUE FAZ: (1) cria a categoria (entrada, outras_receitas, ordem 4); (2) move para ela os 65 lançamentos acima, SÓ os que não estão num período fechado ou aprovado (o gatilho fin_lanc_bloqueio_fechamento
-- recusa edição ali, e reabrir período é decisão da Tesouraria); (3) mostra quantos moveu e quantos ficaram para trás.
-- ALTERNATIVA DESCARTADA: reclassificar também os lançamentos de períodos fechados (exige reabrir o período, com motivo) e as 51 Cielo de Missões (ver acima).
-- A contribuição da Central de Doadores é pelo NOME da categoria (Dizimos, Ofertas, Ofertas para Missões): "Eventos e Vendas" sai sozinha dos indicadores, sem mudar código.
-- ENSAIO: rode primeiro dentro de BEGIN; … ROLLBACK; (o SELECT final mostra o resultado) — esta migration NÃO foi ensaiada contra o banco (sem acesso de gerenciamento na sessão de 27/10).
-- ROLLBACK: docs/CATEGORIA_EVENTOS_E_VENDAS_ROLLBACK.sql.

-- 1) a categoria
INSERT INTO public.fin_categorias (nome, tipo, classificacao_dre, ordem, sistema, ativo, observacao)
SELECT 'Eventos e Vendas', 'entrada', 'outras_receitas', 4, false, true,
       'Receita de bazar, almoço, lanche, cantina e eventos. Não é oferta nem dízimo: não entra nos indicadores da Central de Doadores. Criada em 27/10/2026.'
WHERE NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE nome = 'Eventos e Vendas' AND tipo = 'entrada');

-- 2) os lançamentos de 2026 em Ofertas, sem pessoa, do favorecido Cielo (sempre venda), fora de período fechado
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
  FROM alvo
 WHERE l.id = alvo.id;

-- 3) o resultado (leia antes de seguir): quantos estão na nova categoria e quantos candidatos ficaram em Ofertas
SELECT
  (SELECT count(*) FROM public.fin_lancamentos l JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.nome = 'Eventos e Vendas' AND c.tipo = 'entrada') AS em_eventos_e_vendas,
  (SELECT COALESCE(sum(l.valor), 0) FROM public.fin_lancamentos l JOIN public.fin_categorias c ON c.id = l.categoria_id AND c.nome = 'Eventos e Vendas' AND c.tipo = 'entrada') AS valor_em_eventos_e_vendas,
  (SELECT count(*) FROM public.fin_lancamentos l
     JOIN public.fin_categorias oferta ON oferta.id = l.categoria_id AND oferta.nome = 'Ofertas' AND oferta.tipo = 'entrada'
     JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id AND f.nome ILIKE '%cielo%'
    WHERE l.tipo = 'entrada' AND l.pessoa_id IS NULL AND l.data >= DATE '2026-01-01' AND l.status::text IN ('realizado', 'conciliado')) AS cielo_que_ficou_em_ofertas;
-- esperado no dado de 27/10/2026, sem período fechado: 65 e R$ 7.982,34 em Eventos e Vendas; 0 Cielo que ficou em Ofertas. Menos que 65 = parte está em período fechado/aprovado.
