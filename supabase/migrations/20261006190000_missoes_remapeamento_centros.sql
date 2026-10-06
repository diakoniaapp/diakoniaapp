-- ─── Missões, parte 2 de 3 — REMAPEAMENTO DE CENTROS ───
--
-- Requer a parte 1 (20261006180000). Move as SAÍDAS de missões para os subcentros novos e
-- corrige os centros padrão que apontavam para os antigos. Aprovado por ela em 06/10/2026.
--
--   Pastor Missionário (saídas)                    → Sustento Missionário
--   Ofertas Missionárias (saídas: parcerias R$300) → Sustento Missionário
--   Missões Mundiais / Nacionais (saídas)          → Envios Missionários
--
-- NÃO move as ENTRADAS (225 em "Missões Mundiais", 5 em "Ofertas Missionárias"): entrada não é
-- custo, e a campanha delas vai pelo campo novo. Por isso esses dois centros continuam ativos.
--
-- ANTES de mover: R$ 337,00 de 08/07/2025 NÃO é remessa — é a NF-e 83744 da Junta de Missões
-- Nacionais (17 "Revista Visão Missionária 3T25"). Vira consumo, centro Min. Educação Cristã
-- (decisão dela, com o comprovante em mãos). Sem isso ela iria para "Envios Missionários".
-- Não mexe no lançamento de R$ 300 em "Segurança e Monitoramento" (centro-pai).
--
-- Idempotente: rodar de novo não move nada a mais.

DO $$
DECLARE
  c_sust uuid; c_env uuid; c_mob uuid; c_edu uuid; cat_consumo uuid;
  c_pastor constant uuid := 'ae0365b8-adf8-49d9-bcfb-df7cfc63451c';  -- Pastor Missionário
  c_ofmis  constant uuid := 'fce184f5-46ff-4201-9778-f8576e06b418';  -- Ofertas Missionárias
  c_mund   constant uuid := '0f677a79-aa6f-4342-b1d9-d96d65ae9949';  -- Missões Mundiais
  c_nac    constant uuid := 'bec7c1e9-f524-4902-b336-07ce38ae198b';  -- Missões Nacionais
  n_antes int; n_sust int; n_env int;
BEGIN
  SELECT id INTO c_sust FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Sustento Missionário';
  SELECT id INTO c_env  FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Envios Missionários';
  SELECT id INTO c_mob  FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Mobilização Missionária';
  SELECT id INTO c_edu  FROM public.fin_centros_custo WHERE nome = 'Min. Educação Cristã';
  SELECT id INTO cat_consumo FROM public.fin_categorias WHERE nome = 'Material de Consumo' AND tipo = 'saida';
  IF c_sust IS NULL OR c_env IS NULL OR c_mob IS NULL THEN
    RAISE EXCEPTION 'Rode a parte 1 (20261006180000) antes: os subcentros novos não existem.';
  END IF;
  IF c_edu IS NULL OR cat_consumo IS NULL THEN
    RAISE EXCEPTION 'Centro "Min. Educação Cristã" ou categoria "Material de Consumo" não encontrados.';
  END IF;

  -- 0) A NF de revistas deixa de ser remessa (guardas: id + valor + ainda no lugar antigo).
  UPDATE public.fin_lancamentos
     SET categoria_id = cat_consumo, centro_custo_id = c_edu, campanha_missionaria = NULL,
         descricao = 'Revista Visão Missionária 3T25 (17 un.) — NF-e 83744, Junta de Missões Nacionais'
   WHERE id = '0a0ce3a2-32d0-4fc3-bf20-15521334456f' AND valor = 337.00 AND centro_custo_id = c_mund;

  -- 1) Conferência: depois da etapa 0 havia 53 saídas nos 4 centros antigos (11 + 30 + 7 + 5).
  --    Menos que isso = o banco não é o que foi revisado → aborta. Mais = lançamento novo, tudo bem.
  SELECT count(*) INTO n_antes FROM public.fin_lancamentos
   WHERE tipo = 'saida' AND centro_custo_id IN (c_pastor, c_ofmis, c_mund, c_nac);
  --    (0 = já foi rodada antes: nada a mover, não é erro.)
  IF n_antes BETWEEN 1 AND 52 THEN
    RAISE EXCEPTION 'Esperava ao menos 53 saídas nos 4 centros antigos; achei %.', n_antes;
  END IF;

  UPDATE public.fin_lancamentos SET centro_custo_id = c_sust
   WHERE tipo = 'saida' AND centro_custo_id IN (c_pastor, c_ofmis);
  GET DIAGNOSTICS n_sust = ROW_COUNT;
  UPDATE public.fin_lancamentos SET centro_custo_id = c_env
   WHERE tipo = 'saida' AND centro_custo_id IN (c_mund, c_nac);
  GET DIAGNOSTICS n_env = ROW_COUNT;
  RAISE NOTICE 'Saídas movidas: % para Sustento (esperado 41) e % para Envios (esperado 12).', n_sust, n_env;

  -- 2) Centro padrão (por categoria e por fornecedor) que apontava para os antigos.
  UPDATE public.fin_categorias SET centro_custo_padrao_id = c_env WHERE nome = 'Repasses Missionários';
  UPDATE public.fin_categorias SET centro_custo_padrao_id = c_mob WHERE nome = 'Ofertas à Preletores';
  -- "Ofertas para Missões" (entrada) e "Doações e Contribuições" (saída genérica) passam a ter
  -- o centro-pai, para não rotular de "sustento" uma doação qualquer.
  UPDATE public.fin_categorias
     SET centro_custo_padrao_id = (SELECT id FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões')
   WHERE nome IN ('Ofertas para Missões', 'Doações e Contribuições');
  UPDATE public.fin_fornecedores SET centro_custo_padrao_id = c_sust
   WHERE centro_custo_padrao_id = c_pastor;                 -- o pastor missionário (achado pelo vínculo, não pelo nome)
  UPDATE public.fin_fornecedores SET centro_custo_padrao_id = NULL
   WHERE nome LIKE 'Junta de Missoes Nacionais%';           -- recebe parceria (Sustento) E repasse (Envios): a categoria decide

  -- 3) Desativa (não apaga) os que ficaram sem NENHUM lançamento. "Missões Mundiais" e
  --    "Ofertas Missionárias" continuam ativos: ainda guardam entradas.
  UPDATE public.fin_centros_custo SET ativo = false
   WHERE id IN (c_pastor, c_nac)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.centro_custo_id = fin_centros_custo.id);
END $$;
