-- ─── RASCUNHO PARA REVISÃO — simplificação do centro "Min. Evangelismo e Missões" em 4 subcentros ───
--
-- NÃO É UMA MIGRATION: está em docs/ de propósito, para ninguém aplicar por engano. Só vira migration
-- (supabase/migrations/…) depois da sua aprovação, e então é ensaiada com BEGIN/ROLLBACK, como as outras.
-- NÃO ENSAIADA (o token de gerenciamento do Supabase está sem acesso) e NÃO APLICADA.
-- Proposta e números: docs/PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.md
--
-- ESTRUTURA FINAL (decisões dela de 06/10/2026):
--   1. Sustento Missionário     — o que já existe; perde os 29 de R$ 300 (vão para Projetos) e ganha as 2 prebendas
--                                 que estão no centro antigo "Pastor Missionário"
--   2. Campanhas de Missões     — o "Envios Missionários" RENOMEADO (mesmo id: nada se perde); ganha 5 despesas da feira
--   3. Projetos Missionários    — NOVO; recebe Cristolândia (2 panetones) e Carreta (29 × R$ 300, projeto novo)
--   4. Ofertas Missionárias     — o centro antigo de mesmo nome, reaproveitado (só saídas); recebe a oferta ao preletor
--   (Mobilização, Pastor Missionário e Missões Nacionais ficam inativos DEPOIS de vazios — nunca apagados.)
--
-- O QUE NÃO MUDA: o Fundo Missionário (−7.830,22), o campo "Campanha missionária", categorias, valores, datas,
-- contas, conciliação. Só mudam centro_custo_id (e projeto_id nos 29 da Carreta).
--
-- Cada UPDATE é guardado por id/critério + estado antigo + contagem esperada (rodar de novo não faz nada) e há
-- verificação final por SOMA em cada subcentro. Qualquer divergência dá RAISE EXCEPTION e desfaz tudo.

DO $$
DECLARE
  c_pai uuid; c_sust uuid; c_camp uuid; c_proj uuid; c_mob uuid; p_carreta uuid; cat_preletores uuid; n int; soma numeric;
  c_ofer   constant uuid := 'fce184f5-46ff-4201-9778-f8576e06b418';  -- Ofertas Missionárias (centro antigo, reaproveitado)
  c_pastor constant uuid := 'ae0365b8-adf8-49d9-bcfb-df7cfc63451c';  -- Pastor Missionário (antigo)
  c_nac    constant uuid := 'bec7c1e9-f524-4902-b336-07ce38ae198b';  -- Missões Nacionais (antigo)
BEGIN
  SELECT id INTO c_pai  FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões';
  SELECT id INTO c_sust FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Sustento Missionário';
  SELECT id INTO c_mob  FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Mobilização Missionária';
  IF c_pai IS NULL OR c_sust IS NULL OR c_mob IS NULL THEN
    RAISE EXCEPTION 'Centro-pai, Sustento ou Mobilização não encontrado.';
  END IF;

  -- 1) Envios Missionários → Campanhas de Missões (renomeia; o id e todos os lançamentos continuam)
  UPDATE public.fin_centros_custo
     SET nome = 'Evangelismo e Missões · Campanhas de Missões',
         descricao = 'Campanhas Mundiais e Nacionais: repasses às Juntas (Envio Oficial, categoria Repasses Missionários) e o custo de arrecadá-las (feira, banner, material).'
   WHERE nome = 'Evangelismo e Missões · Envios Missionários';
  SELECT id INTO c_camp FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Campanhas de Missões';
  IF c_camp IS NULL THEN RAISE EXCEPTION 'Campanhas de Missões não existe (o Envios Missionários não foi achado).'; END IF;

  -- 2) Projetos Missionários (novo)
  INSERT INTO public.fin_centros_custo (nome, vinculo_tipo, centro_pai_id, cor, ativo, descricao)
  SELECT 'Evangelismo e Missões · Projetos Missionários', 'subgrupo_administracao'::public.fin_centro_vinculo, p.id, p.cor, true,
         'Projetos de missões (Cristolândia, Carreta e específicos): um projeto por iniciativa, sem ano no nome.'
    FROM public.fin_centros_custo p
   WHERE p.id = c_pai
     AND NOT EXISTS (SELECT 1 FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Projetos Missionários');
  SELECT id INTO c_proj FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Projetos Missionários';

  -- 3) Ofertas Missionárias: o centro antigo passa a ser só de SAÍDAS (entregas diretas a missionários)
  UPDATE public.fin_centros_custo
     SET ativo = true, centro_pai_id = c_pai,
         descricao = 'Entregas diretas a missionários: visitantes, quem prega na igreja, ajuda pontual, vocacionados. NÃO é a receita "Ofertas para Missões".'
   WHERE id = c_ofer;

  -- 4) Projeto Carreta Missionária (missionário, sem ano)
  INSERT INTO public.fin_projetos (nome, descricao, status, missionario)
  SELECT 'Carreta Missionária', 'Carreta Missionária da Junta de Missões Nacionais: contribuição mensal da igreja.', 'ativo', true
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_projetos WHERE nome = 'Carreta Missionária');
  SELECT id INTO p_carreta FROM public.fin_projetos WHERE nome = 'Carreta Missionária';

  -- ── movimentos ────────────────────────────────────────────────────────────
  -- a) os 29 de R$ 300 "Carreta Missionária" saem do Sustento → Projetos (+ projeto Carreta). Esperado: 29 (R$ 8.700,00).
  UPDATE public.fin_lancamentos AS l
     SET centro_custo_id = c_proj, projeto_id = p_carreta
   WHERE l.tipo = 'saida' AND l.centro_custo_id = c_sust AND l.valor = 300.00 AND l.descricao ILIKE 'Carreta Miss%'
     AND l.fornecedor_id IN (SELECT id FROM public.fin_fornecedores WHERE nome LIKE 'Junta de Missoes Nacionais%');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 29) THEN RAISE EXCEPTION 'Esperava 29 pagamentos da Carreta (ou 0, se já rodou); achei % — desfazendo.', n; END IF;

  -- b) os 2 panetones (projeto Cristolândia) saem do centro-pai → Projetos. Esperado: 2 (R$ 5.050,00).
  UPDATE public.fin_lancamentos AS l SET centro_custo_id = c_proj
   WHERE l.id IN ('6e8decd5-8559-4e13-bf6e-97d9631f7f53', '5ecb5c32-a261-4fcf-bc1a-2d0157b21104')
     AND l.tipo = 'saida' AND l.centro_custo_id IS DISTINCT FROM c_proj;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN RAISE EXCEPTION 'Esperava 2 panetones (ou 0); achei %.', n; END IF;

  -- c) as 5 despesas da feira saem da Mobilização → Campanhas. Esperado: 5 (R$ 984,40).
  UPDATE public.fin_lancamentos AS l SET centro_custo_id = c_camp
    FROM (VALUES
      ('eb678363-054d-43a1-a718-9b0df2686049'::uuid, 300.00), ('580a32f9-aab6-4271-b9b6-9fb63602cf87'::uuid, 127.00),
      ('af03745d-8d9a-425c-9f32-76aacc2add40'::uuid, 314.00), ('864433f8-ae5a-473b-8f54-4d6c25f36a7e'::uuid, 214.00),
      ('b74af91b-9338-4f4f-9b10-ce4a257a4700'::uuid,  29.40)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'saida' AND l.centro_custo_id = c_mob;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 5) THEN RAISE EXCEPTION 'Esperava 5 despesas da feira (ou 0); achei %.', n; END IF;

  -- d) a oferta ao preletor (R$ 150) sai da Mobilização → Ofertas Missionárias. Esperado: 1.
  UPDATE public.fin_lancamentos SET centro_custo_id = c_ofer
   WHERE id = '1bf5cd83-f698-4ce6-97db-96d85c0e7f94' AND valor = 150.00 AND tipo = 'saida' AND centro_custo_id = c_mob;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 1) THEN RAISE EXCEPTION 'Esperava 1 oferta ao preletor (ou 0); achei %.', n; END IF;

  -- e) as prebendas que ficaram no centro antigo "Pastor Missionário" (jul e ago/2026) → Sustento. Esperado: 2.
  UPDATE public.fin_lancamentos SET centro_custo_id = c_sust WHERE tipo = 'saida' AND centro_custo_id = c_pastor;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN RAISE EXCEPTION 'Esperava 2 prebendas no centro antigo (ou 0); achei %.', n; END IF;

  -- f) ENTRADAS que estavam em subcentros de saída (1 em Campanhas/Envios, 4 em Ofertas Missionárias) → centro-pai,
  --    que é o centro padrão de "Ofertas para Missões". Esperado: 5 (ou menos, se alguma já foi movida).
  UPDATE public.fin_lancamentos SET centro_custo_id = c_pai WHERE tipo = 'entrada' AND centro_custo_id IN (c_camp, c_ofer);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 5 THEN RAISE EXCEPTION 'Esperava no máximo 5 entradas fora do lugar; achei %.', n; END IF;

  -- g) o centro padrão da categoria "Ofertas à Preletores" passa a ser Ofertas Missionárias
  SELECT id INTO cat_preletores FROM public.fin_categorias WHERE nome = 'Ofertas à Preletores' AND tipo = 'saida';
  IF cat_preletores IS NOT NULL THEN
    UPDATE public.fin_categorias SET centro_custo_padrao_id = c_ofer WHERE id = cat_preletores;
  END IF;

  -- h) desativa (NUNCA apaga) os que ficaram VAZIOS — qualquer lançamento (de qualquer status) segura o centro ativo
  UPDATE public.fin_centros_custo SET ativo = false
   WHERE id IN (c_mob, c_pastor, c_nac)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.centro_custo_id = fin_centros_custo.id);

  -- ── verificação final por SOMA (só saídas realizadas/conciliadas) ─────────
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_sust;
  IF soma <> 70592.93 THEN RAISE EXCEPTION 'Sustento deveria somar 70.592,93; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_camp;
  IF soma <> 158152.29 THEN RAISE EXCEPTION 'Campanhas deveria somar 158.152,29; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_proj;
  IF soma <> 13750.00 THEN RAISE EXCEPTION 'Projetos deveria somar 13.750,00; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_ofer;
  IF soma <> 150.00 THEN RAISE EXCEPTION 'Ofertas Missionárias deveria somar 150,00; soma %.', soma; END IF;
END $$;

-- ─── OPCIONAL (decisão dela) — as 647 ofertas do fundo sem centro → "Min. Evangelismo e Missões" ──────────────────
-- Hoje o Fechamento mensal BLOQUEIA o malote por "entrada sem centro de custo"; 647 das 653 entradas do fundo estão
-- assim (o centro "Missões Mundiais", que guardava 224 delas, foi excluído hoje e o banco as deixou sem centro).
-- É o centro padrão da categoria "Ofertas para Missões". Não muda saldo nem fundo.
--
--   UPDATE public.fin_lancamentos
--      SET centro_custo_id = (SELECT id FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões')
--    WHERE tipo = 'entrada' AND centro_custo_id IS NULL
--      AND categoria_id = (SELECT id FROM public.fin_categorias WHERE nome = 'Ofertas para Missões' AND tipo = 'entrada');
--   -- esperado: 647 linhas
