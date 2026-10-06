-- ─── Missões, parte 3 de 3 — CAMPANHA DAS REMESSAS e AJUSTE HISTÓRICO ───
--
-- Requer a parte 1 (campo campanha_missionaria e tabela de ajustes). Cada linha foi decidida
-- por ela em 06/10/2026, com o histórico da Junta de Missões Mundiais e os comprovantes da
-- Junta Nacional em mãos (docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md).
--
-- A campanha de cada remessa vem da JUNTA DE DESTINO (fornecedor), não do centro gravado:
-- em 5 das 13 remessas o centro/descrição do Omie estavam trocados. A Junta Mundial confirma
-- as 4 remessas dela de 2024–2025 ao centavo e prova que as pagas à Nacional não passaram por ela.
--
-- As 648 ENTRADAS NÃO são classificadas aqui: ela pediu que nada fosse classificado
-- automaticamente. Elas vão em lote pela tela ("Ofertas missionárias sem classificação"),
-- com a regra do ciclo como sugestão a confirmar.
--
-- A remessa de R$ 337,00 (NF de revistas) não entra: foi reclassificada na parte 2.

UPDATE public.fin_lancamentos AS l SET campanha_missionaria = v.campanha
  FROM (VALUES
    ('0cbe1da1-5e24-4486-8a53-a184be368a2f'::uuid, 10327.58, 'nacionais'),  -- 12/07/2024 JMN (sem arrecadação de 2024; ver ajuste)
    ('7f39009c-5035-4fdf-928a-357ecaee1ba1'::uuid,  1551.32, 'mundiais'),   -- 12/07/2024 JMM (confirmada pela Junta)
    ('fa5a0467-efa4-4d87-aac9-9b68d1b790b7'::uuid, 25955.20, 'mundiais'),   -- 27/08/2024 JMM (confirmada)
    ('6e8decd5-8559-4e13-bf6e-97d9631f7f53'::uuid,  4050.00, 'nacionais'),  -- 19/12/2024 JMN
    ('e65db633-e3eb-4ad8-addf-1d729f0ed06d'::uuid, 20000.00, 'nacionais'),  -- 30/12/2024 JMN
    ('9f172950-bea8-4de6-a109-53491741bd6d'::uuid,  5000.00, 'nacionais'),  -- 27/02/2025 JMN (decisão dela)
    ('e96d4253-8e88-4ded-b404-98bb323f9bd3'::uuid,  4493.56, 'nacionais'),  -- 27/05/2025 JMN "REPASSE CAMPANHA JMN"
    ('2641f689-bd6f-403e-b441-22c29fcd7c29'::uuid, 34216.42, 'mundiais'),   -- 22/07/2025 JMM (confirmada)
    ('623c289f-1572-4cac-a6d7-6f552676a55d'::uuid,   783.58, 'mundiais'),   -- 19/09/2025 JMM (confirmada; o centro dizia Nacionais)
    ('5ecb5c32-a261-4fcf-bc1a-2d0157b21104'::uuid,  1000.00, 'especial'),   -- 10/12/2025 oferta à JMN (panetones da Cristolândia) = campanha avulsa
    ('77b88b7f-b5f3-4d5f-a294-104b02978ffb'::uuid, 28180.00, 'nacionais'),  -- 29/12/2025 JMN
    ('98abdceb-ec82-4ff6-a968-5027d94b9928'::uuid, 26660.23, 'mundiais')    -- 07/07/2026 JMM (ainda não validada pela Junta)
  ) AS v(id, valor, campanha)
 WHERE l.id = v.id AND l.valor = v.valor;     -- guarda: só grava se o id AINDA tem esse valor

-- Ajuste histórico (visão gerencial; NÃO altera nenhum lançamento). R$ 12.032,69 = o quanto os
-- envios do primeiro ciclo de 2024 excedem as ofertas registradas desde 02/01/2024.
INSERT INTO public.fin_ajustes_fundo_missionario (data_referencia, descricao, valor, justificativa)
SELECT DATE '2024-08-27',
       'Primeiro ciclo de 2024: campanhas anteriores ao Omie',
       12032.69,
       'Remessas de jul–ago/2024 (Junta Mundial 27.506,52 + Junta Nacional 10.327,58 = 37.834,10) excedem as ofertas registradas desde 02/01/2024 (25.801,41). Compatível com saldo de campanha de 2023, anterior à implantação do Omie e não importado. A Junta Mundial confirma que nada de Mundiais estava pendente; a parcela da Junta Nacional (10.327,58) depende de confirmação dela. Visão gerencial: não altera lançamentos, extratos nem contabilidade.'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.fin_ajustes_fundo_missionario
    WHERE descricao = 'Primeiro ciclo de 2024: campanhas anteriores ao Omie');
