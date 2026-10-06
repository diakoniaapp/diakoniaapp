-- ─── Missões — panetones (projeto Cristolândia) e bazar fora do Fundo Missionário (aprovado em 06/10/2026) ───
--
-- Auditoria da Junta Nacional: docs/auditoria-missoes/AUDITORIA_JUNTA_NACIONAL.md. Decisões dela:
--
-- 1) PANETONES (R$ 4.050,00 de 19/12/2024 e R$ 1.000,00 de 10/12/2025). Os membros encomendam e pagam os panetones
--    à igreja; a igreja repassa o valor à Junta Nacional. É repasse de terceiros para um PROJETO (Cristolândia), não
--    campanha: saem do Envio Oficial. Categoria "Doações e Contribuições", projeto "Cristolândia" (sem ano no nome).
--    A receita dos membros continua onde está ("Ofertas"); só a despesa deixa de reduzir o Fundo.
--    Também saem da campanha (campo em branco), e o texto "Campanha Missões Nacionais" — que contradizia a natureza do
--    pagamento — é substituído por uma descrição verdadeira. O centro passa para o centro-pai de missões (o
--    subcentro "Envios Missionários" é do Fundo, e este pagamento não é).
--
-- 2) BAZAR. Só 2 das 5 linhas de "Ofertas para Missões" que citavam bazar são de bazar (R$ 60,00 de 18/07/2025 e
--    R$ 19,82 de 07/08/2025): vão para "Ofertas" + centro Min. Evangelismo e Missões, como os demais bazares
--    (a migration 20261006220000 fez o mesmo com os outros 42). As 3 outras (R$ 21,00, R$ 10,00 e R$ 50,00 de
--    05–07/11/2024) são da FEIRA DAS REGIÕES, que a igreja lança como oferta de campanha — ficam no fundo.
--
-- Guardado por id + valor + estado antigo (rodar de novo não faz nada), com verificação final.

DO $$
DECLARE
  cat_doacoes uuid; cat_ofertas uuid; centro_missoes uuid; proj uuid; n int;
BEGIN
  SELECT id INTO cat_doacoes FROM public.fin_categorias WHERE nome = 'Doações e Contribuições' AND tipo = 'saida';
  SELECT id INTO cat_ofertas FROM public.fin_categorias WHERE nome = 'Ofertas' AND tipo = 'entrada';
  SELECT id INTO centro_missoes FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões';
  IF cat_doacoes IS NULL OR cat_ofertas IS NULL OR centro_missoes IS NULL THEN
    RAISE EXCEPTION 'Categoria "Doações e Contribuições", categoria "Ofertas" ou centro "Min. Evangelismo e Missões" não encontrado.';
  END IF;

  -- Projeto Cristolândia (missionário). Um só, sem ano no nome.
  INSERT INTO public.fin_projetos (nome, descricao, status, missionario)
  SELECT 'Cristolândia',
         'Apoio ao projeto Cristolândia da Junta de Missões Nacionais: panetones encomendados pelos membros e repassados pela igreja (todo dezembro).',
         'ativo', true
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_projetos WHERE nome = 'Cristolândia');
  SELECT id INTO proj FROM public.fin_projetos WHERE nome = 'Cristolândia';

  -- 1) Os dois panetones saem do Envio Oficial.
  UPDATE public.fin_lancamentos AS l
     SET categoria_id = cat_doacoes, projeto_id = proj, campanha_missionaria = NULL, centro_custo_id = centro_missoes,
         descricao = 'Panetones Cristolândia — repasse à Junta de Missões Nacionais (venda por encomenda dos membros)'
    FROM (VALUES
      ('6e8decd5-8559-4e13-bf6e-97d9631f7f53'::uuid, 4050.00),
      ('5ecb5c32-a261-4fcf-bc1a-2d0157b21104'::uuid, 1000.00)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'saida' AND l.categoria_id IS DISTINCT FROM cat_doacoes;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN
    RAISE EXCEPTION 'Esperava 2 panetones (ou 0, se já rodou); atualizei % — desfazendo.', n;
  END IF;

  -- 2) As duas linhas de bazar que estavam em "Ofertas para Missões".
  UPDATE public.fin_lancamentos AS l
     SET categoria_id = cat_ofertas, centro_custo_id = centro_missoes
    FROM (VALUES
      ('e97c17d6-bae8-4bab-95f9-c603a7688962'::uuid, 60.00),
      ('e4af7c1f-0c8b-4f2a-b09f-8487b1d3d19b'::uuid, 19.82)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'entrada' AND l.categoria_id IS DISTINCT FROM cat_ofertas;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN
    RAISE EXCEPTION 'Esperava 2 linhas de bazar (ou 0, se já rodou); atualizei % — desfazendo.', n;
  END IF;

  -- Verificação final.
  SELECT count(*) INTO n FROM public.fin_lancamentos
   WHERE id IN ('6e8decd5-8559-4e13-bf6e-97d9631f7f53', '5ecb5c32-a261-4fcf-bc1a-2d0157b21104')
     AND categoria_id = cat_doacoes AND projeto_id = proj AND campanha_missionaria IS NULL;
  IF n <> 2 THEN RAISE EXCEPTION 'Verificação dos panetones falhou (% de 2) — desfazendo.', n; END IF;
END $$;
