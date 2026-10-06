-- ─── Missões — o centro "Min. Evangelismo e Missões" em 4 subcentros (aprovado por ela em 06/10/2026) ───
--
-- Proposta, números e decisões: docs/PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.md.
--   1. Sustento Missionário   — recebe TODA despesa do pastor missionário Alexandre (fornecedor fb315437…): 2 estavam no
--                               centro antigo "Pastor Missionário", 2 são PREVISTAS (nov/dez 2026) sem centro e sem categoria
--   2. Campanhas Missionárias — o "Envios Missionários" RENOMEADO (mesmo id); aqui moram as campanhas Mundiais e Nacionais:
--                               as ofertas do Fundo (entrada), os repasses às Juntas e o custo de arrecadar (saída)
--   3. Projetos Missionários  — NOVO; Cristolândia (2 panetones) e Carreta (29 × R$ 300, projeto novo)
--   4. Ofertas Missionárias   — o centro antigo de mesmo nome, só com saídas (entregas diretas a missionários)
-- Mobilização, Pastor Missionário e Missões Nacionais ficam inativos DEPOIS de vazios — nunca apagados.
--
-- O QUE NÃO MUDA: o Fundo Missionário (é por CATEGORIA), o campo "Campanha missionária", valores, datas, contas e
-- conciliação. Só mudam centro_custo_id (+ projeto_id nos 29 da Carreta, + categoria_id nos 2 previstos sem categoria)
-- e o centro padrão de 2 categorias.
--
-- Cada UPDATE é guardado por id/critério + estado antigo + contagem esperada (rodar de novo não faz nada) e há verificação
-- final por SOMA e por contagem. Qualquer divergência dá RAISE EXCEPTION e desfaz tudo. ENSAIAR com BEGIN/ROLLBACK.

DO $$
DECLARE
  c_pai uuid; c_sust uuid; c_camp uuid; c_proj uuid; c_mob uuid; p_carreta uuid; cat_preletores uuid; n int; soma numeric;
  c_ofer       constant uuid := 'fce184f5-46ff-4201-9778-f8576e06b418';  -- Ofertas Missionárias (centro antigo, reaproveitado)
  c_pastor     constant uuid := 'ae0365b8-adf8-49d9-bcfb-df7cfc63451c';  -- Pastor Missionário (antigo)
  c_nac        constant uuid := 'bec7c1e9-f524-4902-b336-07ce38ae198b';  -- Missões Nacionais (antigo)
  f_alexandre  constant uuid := 'fb315437-d175-48ea-b9b7-1befc520602c';  -- Alexandre Lourenço Silva (pastor missionário)
  cat_prebenda constant uuid := '93bbe7b8-4fdf-4d38-9bf5-698b25722d36';  -- Prebenda (saída)
  cat_ofertas  constant uuid := '42bc6e2a-a73a-4717-bec6-99e851f1bf84';  -- Ofertas para Missões (entrada) = receita do Fundo
BEGIN
  SELECT id INTO c_pai  FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões';
  SELECT id INTO c_sust FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Sustento Missionário';
  SELECT id INTO c_mob  FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Mobilização Missionária';
  IF c_pai IS NULL OR c_sust IS NULL OR c_mob IS NULL THEN
    RAISE EXCEPTION 'Centro-pai, Sustento ou Mobilização não encontrado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_fornecedores WHERE id = f_alexandre AND nome ILIKE 'ALEXANDRE LOUREN%') THEN
    RAISE EXCEPTION 'O fornecedor Alexandre Lourenço Silva não foi encontrado pelo id esperado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE id = cat_prebenda AND nome = 'Prebenda' AND tipo = 'saida')
     OR NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE id = cat_ofertas AND nome = 'Ofertas para Missões' AND tipo = 'entrada') THEN
    RAISE EXCEPTION 'Categoria Prebenda ou Ofertas para Missões não encontrada pelo id esperado.';
  END IF;

  -- 1) Envios Missionários → Campanhas Missionárias (renomeia; o id e todos os lançamentos continuam)
  UPDATE public.fin_centros_custo
     SET nome = 'Evangelismo e Missões · Campanhas Missionárias',
         descricao = 'Campanhas Mundiais e Nacionais: ofertas arrecadadas, repasses às Juntas (Envio Oficial, categoria Repasses Missionários) e o custo de arrecadá-las (feira, banner, material).'
   WHERE nome = 'Evangelismo e Missões · Envios Missionários';
  SELECT id INTO c_camp FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Campanhas Missionárias';
  IF c_camp IS NULL THEN RAISE EXCEPTION 'Campanhas Missionárias não existe (o Envios Missionários não foi achado).'; END IF;

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
         descricao = 'Entregas diretas a missionários: visitantes, quem prega na igreja, ajuda pontual, vocacionados. NÃO é a receita "Ofertas para Missões" (essa mora em Campanhas Missionárias).'
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

  -- e) TODA despesa do pastor missionário Alexandre (filtro pelo FORNECEDOR, não pela categoria — o pastor titular e
  --    outros também recebem "Prebenda") → Sustento Missionário. Esperado: 4 =
  --      2 realizadas no centro antigo "Pastor Missionário" (jul e ago/2026, R$ 4.724,00) +
  --      2 PREVISTAS de 05/11 e 05/12/2026 (R$ 2.362,00 cada), importadas do Omie SEM centro e SEM categoria.
  --    Nos 2 previstos a categoria vazia vira "Prebenda" (a mesma das 32 já classificadas dele).
  UPDATE public.fin_lancamentos
     SET centro_custo_id = c_sust,
         categoria_id    = COALESCE(categoria_id, cat_prebenda)
   WHERE tipo = 'saida' AND fornecedor_id = f_alexandre
     AND (categoria_id = cat_prebenda OR categoria_id IS NULL)
     AND centro_custo_id IS DISTINCT FROM c_sust;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 4) THEN RAISE EXCEPTION 'Esperava 4 lançamentos do Alexandre fora do Sustento (ou 0); achei %.', n; END IF;

  -- f) as OFERTAS do Fundo ("Ofertas para Missões") passam a morar em Campanhas Missionárias. Esperado: 652 =
  --    646 conciliadas + 1 realizada sem centro + 4 que estavam em Ofertas Missionárias (agora só de saídas) +
  --    1 que estava em "Min. Administração" (R$ 160,50 de 08/06/2024, movida por decisão dela: id explícito, não por centro).
  --    A 653ª oferta já estava em Envios (= Campanhas, mesmo id).
  UPDATE public.fin_lancamentos SET centro_custo_id = c_camp
   WHERE tipo = 'entrada' AND categoria_id = cat_ofertas
     AND (centro_custo_id IS NULL OR centro_custo_id = c_ofer
          OR (id = '48dc8207-4bed-4896-98ef-c8188f5b4b4d' AND valor = 160.50));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 652) THEN RAISE EXCEPTION 'Esperava 652 ofertas do Fundo para mover (ou 0); achei %.', n; END IF;

  -- g) centro padrão das categorias: nova oferta já nasce no lugar certo
  UPDATE public.fin_categorias SET centro_custo_padrao_id = c_camp WHERE id = cat_ofertas;  -- Ofertas para Missões
  SELECT id INTO cat_preletores FROM public.fin_categorias WHERE nome = 'Ofertas à Preletores' AND tipo = 'saida';
  IF cat_preletores IS NOT NULL THEN
    UPDATE public.fin_categorias SET centro_custo_padrao_id = c_ofer WHERE id = cat_preletores;
  END IF;
  -- (Repasses Missionários já aponta para o Envios renomeado — mesmo id — e continua certo.)

  -- h) desativa (NUNCA apaga) os que ficaram VAZIOS — qualquer lançamento (de qualquer status) segura o centro ativo
  UPDATE public.fin_centros_custo SET ativo = false
   WHERE id IN (c_mob, c_pastor, c_nac)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.centro_custo_id = fin_centros_custo.id);

  -- ── verificação final ─────────────────────────────────────────────────────
  -- por SOMA (só saídas realizadas/conciliadas)
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_sust;
  IF soma <> 70592.93 THEN RAISE EXCEPTION 'Sustento deveria somar 70.592,93; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_camp;
  IF soma <> 158152.29 THEN RAISE EXCEPTION 'Campanhas deveria somar 158.152,29 de saídas; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_proj;
  IF soma <> 13750.00 THEN RAISE EXCEPTION 'Projetos deveria somar 13.750,00; soma %.', soma; END IF;
  SELECT COALESCE(SUM(valor), 0) INTO soma FROM public.fin_lancamentos WHERE tipo = 'saida' AND status IN ('realizado', 'conciliado') AND centro_custo_id = c_ofer;
  IF soma <> 150.00 THEN RAISE EXCEPTION 'Ofertas Missionárias deveria somar 150,00; soma %.', soma; END IF;

  -- por contagem
  SELECT COUNT(*) INTO n FROM public.fin_lancamentos WHERE fornecedor_id = f_alexandre AND tipo = 'saida' AND centro_custo_id IS DISTINCT FROM c_sust;
  IF n <> 0 THEN RAISE EXCEPTION 'Ainda há % lançamentos do Alexandre fora do Sustento.', n; END IF;
  SELECT COUNT(*) INTO n FROM public.fin_lancamentos WHERE tipo = 'entrada' AND categoria_id = cat_ofertas AND centro_custo_id IS DISTINCT FROM c_camp;
  IF n <> 0 THEN RAISE EXCEPTION 'Ainda há % ofertas do Fundo fora de Campanhas Missionárias.', n; END IF;
  SELECT COUNT(*) INTO n FROM public.fin_lancamentos WHERE tipo = 'entrada' AND centro_custo_id = c_ofer;
  IF n <> 0 THEN RAISE EXCEPTION 'Ofertas Missionárias deveria ter só saídas; achei % entradas.', n; END IF;
END $$;
