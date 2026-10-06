-- ─── Missões — bazar de missões: centro do Ministério (opção A, aprovada em 06/10/2026) ───
--
-- Auditoria: docs/auditoria-missoes/INVESTIGACAO_JANELA_BAZAR_E_SIMULACOES.md. A igreja faz bazares de vários
-- ministérios (Ornamentação, Famílias, ADM, Cantina…) e todos entram como "Ofertas" com o centro do ministério
-- dono. O bazar de missões (rótulos "BAZAR MINISTÉRIO DE MISSÕES" e "BAZAR MISSÕES NINA", fev e ago/2025) estava
-- como "Ofertas" SEM centro. Decisão dela: continua "Ofertas" e ganha o centro Min. Evangelismo e Missões.
-- NÃO vai para "Ofertas para Missões" (não entra no Fundo Missionário).
--
-- Só muda o centro de custo de 42 entradas (R$ 2.251,74). Valores, datas, categoria, conta e conciliação ficam
-- como estão. Guardado por id + valor + estado antigo (categoria Ofertas e centro vazio): rodar de novo não faz nada.

DO $$
DECLARE
  cat_ofertas uuid; centro_missoes uuid; n int;
BEGIN
  SELECT id INTO cat_ofertas   FROM public.fin_categorias   WHERE nome = 'Ofertas' AND tipo = 'entrada';
  SELECT id INTO centro_missoes FROM public.fin_centros_custo WHERE nome = 'Min. Evangelismo e Missões';
  IF cat_ofertas IS NULL OR centro_missoes IS NULL THEN
    RAISE EXCEPTION 'Categoria "Ofertas" ou centro "Min. Evangelismo e Missões" não encontrado.';
  END IF;

  UPDATE public.fin_lancamentos AS l SET centro_custo_id = centro_missoes
    FROM (VALUES
      ('17884b29-212f-4d72-af68-766633e93111'::uuid, 3.00),
      ('23c5933c-12b2-45a8-aa68-afd1182dfa64'::uuid, 5.00),
      ('c144fff4-7d08-4f90-a276-8a775aafa9d2'::uuid, 33.52),
      ('17c82a0f-70d0-432a-922b-638b2fb32081'::uuid, 7.88),
      ('dae92056-c390-48ae-9acf-775a8d517a6b'::uuid, 38.26),
      ('ffd29c3f-a801-4d5b-bd2b-f3acdf05431a'::uuid, 32.52),
      ('5a02a55a-2e3d-4c83-8c60-3bc24a029e00'::uuid, 14.35),
      ('8d822352-8ae5-4df1-b43a-49e7388dc55e'::uuid, 226.47),
      ('48f88912-b6f4-4072-8fb3-5604c4ce9cd4'::uuid, 97.54),
      ('7fe8f36f-0488-47bb-8054-1b404002d58d'::uuid, 49.22),
      ('22ec2cf2-4b76-432e-9869-afbc332c5d20'::uuid, 97.10),
      ('5a2295d8-2a33-46c6-8d30-41f53c992d9d'::uuid, 64.40),
      ('6c953643-9835-4832-b416-be834755db75'::uuid, 49.54),
      ('704cb2c9-4519-4121-b64c-d0611c87554a'::uuid, 4.95),
      ('736d9102-23da-4957-8340-70b34f300e61'::uuid, 24.77),
      ('7e22947b-d683-4cd6-984d-5f0051f5a2f6'::uuid, 29.72),
      ('8d4f3042-042b-433c-b964-65a4390e79cc'::uuid, 138.71),
      ('a7bd190d-1e3e-4389-9945-44082cdf654f'::uuid, 99.08),
      ('db54cbf1-aa37-4f35-8ec9-f4b43085f19d'::uuid, 34.68),
      ('1067ad4f-709b-46cc-865c-17ca4a6c7bba'::uuid, 34.00),
      ('1b4d388b-32bc-4bdf-b097-34a5ead81992'::uuid, 59.07),
      ('2d882a3d-8c90-436c-9f1c-6f53c96e9659'::uuid, 14.86),
      ('4c4e52f2-c5e0-42f4-8ac7-4e8e7e45273a'::uuid, 29.72),
      ('5cd7902e-c8ff-43eb-8650-62cf6abc1d05'::uuid, 8.92),
      ('5dc06ad7-efad-4f02-b203-1ab905fbb7cc'::uuid, 14.86),
      ('97f02fa8-2a6a-4c33-a58d-e7a09e84e489'::uuid, 34.68),
      ('ac89a0a2-a05e-4194-b711-3639099f3797'::uuid, 19.82),
      ('c58c2f33-b7cd-462b-9364-06afc18613ad'::uuid, 14.86),
      ('f8d48e6b-dc89-470f-8236-fa07b5506788'::uuid, 142.75),
      ('0f19f9a1-db15-4218-b743-79d7fee63353'::uuid, 29.72),
      ('6278e523-4d24-4459-9867-a68b045170f9'::uuid, 9.91),
      ('72b582e7-d004-4cba-a270-bfe544bc72e8'::uuid, 59.07),
      ('9c15a4df-8e29-42a1-bd49-55c53306ec70'::uuid, 19.69),
      ('b665ae97-10cd-4a04-9c02-dbc82d6aad39'::uuid, 117.70),
      ('cca05bd4-0ba9-4e05-a8ce-a532f0acd1a8'::uuid, 24.77),
      ('d13899de-3ca3-49ae-8c58-ae90118e5799'::uuid, 19.47),
      ('f73fece4-3a84-48bb-8a84-85391a866fbe'::uuid, 59.45),
      ('3e6c139b-93a8-4f52-8a67-87042a6518ed'::uuid, 305.07),
      ('5faf830e-3bd8-4e03-8cea-5751ca18c5a7'::uuid, 22.39),
      ('83a629f6-e8ee-4785-88c5-46b211aee57e'::uuid, 47.26),
      ('959f0420-ae53-4b1a-8441-2cc4b0a6b709'::uuid, 18.83),
      ('ee1ca20d-3e15-4a77-9c33-b99c820f7796'::uuid, 94.16)
    ) AS v(id, valor)
   WHERE l.id = v.id AND l.valor = v.valor AND l.tipo = 'entrada'
     AND l.categoria_id = cat_ofertas AND l.centro_custo_id IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n NOT IN (0, 42) THEN
    RAISE EXCEPTION 'Esperava 42 lançamentos do bazar (ou 0, se já rodou); atualizei % — desfazendo.', n;
  END IF;
END $$;
