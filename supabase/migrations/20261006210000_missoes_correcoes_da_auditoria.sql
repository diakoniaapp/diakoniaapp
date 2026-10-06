-- ─── Missões — correções aprovadas da auditoria do Fundo Missionário (06/10/2026) ───
--
-- Auditoria em docs/auditoria-missoes/AUDITORIA_FUNDO_MISSIONARIO.md. Ela aprovou, item a item:
--   C1  R$ 70,00 de 10/03/2024 ("Saldo da campanha de Missões Nacionais 2023") → Ofertas para Missões
--   C2  R$ 250,00 de 09/12/2024 ("ALVO MISSÕES CLASSE JOVENS I", hoje em Dízimos) → Ofertas para Missões
--   S1  as 21 prebendas do pastor missionário (jun/2024–abr/2026) sem categoria e sem centro → Prebenda · Sustento
--   M1–M5  as despesas da feira e do preletor missionário → Mobilização Missionária
--
-- Requer as migrations de missões 20261006180000 (campo campanha_missionaria e subcentros novos).
-- Cada UPDATE é guardado por id + valor (+ o estado antigo): só mexe no que ainda está como foi auditado,
-- então rodar de novo não faz nada. NÃO toca em valores, datas, contas, extratos nem conciliação.
--
-- Efeito esperado (conferir depois): saldo registrado do Fundo −16.270,80 → −15.950,80 (+320,00);
-- Sustento Missionário +45.778,68 −150,00; Mobilização Missionária 1.134,40.

DO $$
DECLARE
  cat_ofertas_missoes uuid; cat_prebenda uuid; cat_consumo uuid; cat_preletores uuid;
  c_sustento uuid; c_mobilizacao uuid;
  n int;
BEGIN
  SELECT id INTO cat_ofertas_missoes FROM public.fin_categorias WHERE nome = 'Ofertas para Missões' AND tipo = 'entrada';
  SELECT id INTO cat_prebenda        FROM public.fin_categorias WHERE nome = 'Prebenda'              AND tipo = 'saida';
  SELECT id INTO cat_consumo         FROM public.fin_categorias WHERE nome = 'Material de Consumo'   AND tipo = 'saida';
  SELECT id INTO cat_preletores      FROM public.fin_categorias WHERE nome = 'Ofertas à Preletores'  AND tipo = 'saida';
  SELECT id INTO c_sustento    FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Sustento Missionário';
  SELECT id INTO c_mobilizacao FROM public.fin_centros_custo WHERE nome = 'Evangelismo e Missões · Mobilização Missionária';
  IF cat_ofertas_missoes IS NULL OR cat_prebenda IS NULL OR cat_consumo IS NULL OR cat_preletores IS NULL
     OR c_sustento IS NULL OR c_mobilizacao IS NULL THEN
    RAISE EXCEPTION 'Categoria ou subcentro não encontrado — rode antes as migrations 20261006180000 a 20261006200000.';
  END IF;

  -- C1 — a oferta explicitamente da campanha Nacional de 2023: categoria certa + campanha (o ciclo a poria em Mundiais 2024, errado).
  UPDATE public.fin_lancamentos
     SET categoria_id = cat_ofertas_missoes, campanha_missionaria = 'nacionais'
   WHERE id = '397913c3-dd5f-45d4-8d5d-dd230d1eba86' AND tipo = 'entrada' AND valor = 70.00
     AND categoria_id IS DISTINCT FROM cat_ofertas_missoes;

  -- C2 — só a categoria; a campanha dela vem pelo "Classificar em lote" (sugestão por ciclo, com a confirmação dela).
  UPDATE public.fin_lancamentos
     SET categoria_id = cat_ofertas_missoes
   WHERE id = '4be7491f-57d1-4a7d-9544-60f6373d2a75' AND tipo = 'entrada' AND valor = 250.00
     AND categoria_id IS DISTINCT FROM cat_ofertas_missoes;

  -- S1 — as 21 prebendas do pastor missionário. Guarda: ainda sem categoria E sem centro.
  UPDATE public.fin_lancamentos AS l
     SET categoria_id = cat_prebenda, centro_custo_id = c_sustento
    FROM (VALUES
      ('86e0c427-2513-41dd-bc87-931688492c91'::uuid, 2101.85), ('d81e1a54-9d12-422b-9d34-697306596d38'::uuid, 2101.85),
      ('ea6f2ed9-40ae-497c-bdd6-33bd9fbed074'::uuid, 2101.85), ('1e512a78-d693-49f2-adbb-051caaa9ebbf'::uuid, 2101.85),
      ('8bb39d3a-75ec-4712-ab69-363270fbb5ce'::uuid, 2101.85), ('23c2a55c-dab8-4006-84e1-87f1a5ac56bb'::uuid, 2101.85),
      ('223eee8d-4e98-49d3-af74-371e89d6eccf'::uuid, 2101.85), ('f2d31215-d314-4aec-97c5-166f047a3960'::uuid, 2101.85),
      ('b63c691d-1702-4587-85da-a45c70a82498'::uuid, 2101.85), ('6c5598da-ba13-4ee8-ba71-6ae6d7944fee'::uuid, 2101.85),
      ('6eee58e6-225a-4a6a-b645-b536d3b3e6b5'::uuid, 2101.85), ('2f5134f5-5e0c-4351-a52f-4b9092619630'::uuid, 2606.33),
      ('d5834dd1-ca9d-4c55-b895-cd17d8d25c36'::uuid, 2228.00), ('bdfa3de4-d10b-446d-9ade-e95d26999f1d'::uuid, 2228.00),
      ('03172759-5b6e-48f3-9464-cf9f1c4ddb00'::uuid, 2228.00), ('b2113238-1174-4dc1-9cea-9829db20ac7b'::uuid, 2228.00),
      ('36ceb7d8-2d21-48fe-8d99-95edbb7f630f'::uuid, 2228.00), ('c48fa9b3-4cf5-4719-aade-61d539d7eb34'::uuid, 2228.00),
      ('178361ec-8b07-4db7-8de1-3fb21f4b0c72'::uuid, 2228.00), ('16481ba8-35a0-4af5-864b-22b4e6ad6689'::uuid, 2228.00),
      ('73b1c8f7-c46d-425e-9bb5-9d6f8b3e29e7'::uuid, 2228.00)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'saida'
     AND l.categoria_id IS NULL AND l.centro_custo_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 21) THEN
    RAISE EXCEPTION 'Esperava classificar 21 prebendas (ou 0, se já rodou); classifiquei % — desfazendo.', n;
  END IF;

  -- M1–M5 — despesas da feira e do preletor missionário → Mobilização Missionária.
  -- M1 segurança da feira (R$ 300) · M2 suporte da feira (R$ 127) · M3 banner da feira (R$ 314): só o centro; a categoria fica.
  UPDATE public.fin_lancamentos AS l SET centro_custo_id = c_mobilizacao
    FROM (VALUES
      ('eb678363-054d-43a1-a718-9b0df2686049'::uuid, 300.00),
      ('580a32f9-aab6-4271-b9b6-9fb63602cf87'::uuid, 127.00),
      ('af03745d-8d9a-425c-9f32-76aacc2add40'::uuid, 314.00)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'saida' AND l.centro_custo_id IS DISTINCT FROM c_mobilizacao;

  -- M4 material da Feira das Nações 2024 (R$ 214,00 + R$ 29,40): estavam sem categoria e sem centro → papelaria = Material de Consumo.
  UPDATE public.fin_lancamentos AS l SET categoria_id = cat_consumo, centro_custo_id = c_mobilizacao
    FROM (VALUES
      ('864433f8-ae5a-473b-8f54-4d6c25f36a7e'::uuid, 214.00),
      ('b74af91b-9338-4f4f-9b10-ce4a257a4700'::uuid, 29.40)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'saida' AND l.categoria_id IS NULL AND l.centro_custo_id IS NULL;

  -- M5 oferta ao preletor missionário (R$ 150,00): é oferta a preletor, não sustento.
  UPDATE public.fin_lancamentos
     SET categoria_id = cat_preletores, centro_custo_id = c_mobilizacao
   WHERE id = '1bf5cd83-f698-4ce6-97db-96d85c0e7f94' AND tipo = 'saida' AND valor = 150.00
     AND centro_custo_id IS DISTINCT FROM c_mobilizacao;

  -- Conferência final: o estado auditado tem de ter sido alcançado.
  SELECT count(*) INTO n FROM public.fin_lancamentos
   WHERE id IN ('86e0c427-2513-41dd-bc87-931688492c91','73b1c8f7-c46d-425e-9bb5-9d6f8b3e29e7','397913c3-dd5f-45d4-8d5d-dd230d1eba86',
                '4be7491f-57d1-4a7d-9544-60f6373d2a75','eb678363-054d-43a1-a718-9b0df2686049','1bf5cd83-f698-4ce6-97db-96d85c0e7f94')
     AND (categoria_id IN (cat_ofertas_missoes, cat_prebenda, cat_preletores) OR centro_custo_id = c_mobilizacao);
  IF n <> 6 THEN
    RAISE EXCEPTION 'Verificação por amostra falhou (% de 6) — desfazendo.', n;
  END IF;
END $$;
