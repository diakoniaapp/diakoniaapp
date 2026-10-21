-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- APLICAR — apaga os 33 lançamentos DUPLICADOS de hoje (os 33 originais de 08–14/10 ficam)
-- Só apaga se TODAS as conferências passarem (33 de 33). Se qualquer uma falhar, não apaga nada e o resultado mostra apagados = 0 e o motivo em `problemas`.
-- Rode antes o ENSAIO. O vínculo de cada apagado é fechado no histórico (o gatilho do banco), não apagado. Depois, rode o CONFERENCIA.
-- Os 19 que pedem revisão e a transferência de R$ 250,00 NÃO entram aqui.
-- É UMA ÚNICA INSTRUÇÃO (sem BEGIN/COMMIT e sem tabela temporária): o editor do Supabase pode enviar o texto em partes, e uma tabela temporária não sobrevive entre elas.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

WITH dup (hoje, antigo, dia, tipo, valor, fitid_hoje, fitid_antigo) AS (
  VALUES
    ('bd34c247-a2fa-4925-b63f-59237666ec13'::uuid, '31db5fa2-e40f-4b97-93f6-5d53560f89e5'::uuid, DATE '2026-10-01', 'entrada', 300.00::numeric, 'N10127', 'N11B01'),
    ('c3e0b17e-f9a7-4651-95e4-1a6fd34c4c7c'::uuid, 'b4806bda-528e-49be-a28f-e81fc3e78c9f'::uuid, DATE '2026-10-01', 'entrada', 650.00::numeric, 'N101D7', 'N11BB1'),
    ('35291ee7-f07e-4d9a-b36e-4d56c5debdc6'::uuid, 'e2aedd98-ae26-4bc6-b2b5-5a339bf9edfb'::uuid, DATE '2026-10-02', 'entrada', 4500.00::numeric, 'N1022F', 'N11C2F'),
    ('41730edd-777e-42b6-aa72-083bd12fc685'::uuid, '2619966e-2760-47e7-9899-0925b74c40ee'::uuid, DATE '2026-10-02', 'entrada', 200.00::numeric, 'N10271', 'N11C71'),
    ('29a5a040-e00f-42ae-b651-651c6c9adc6e'::uuid, '50abca4f-b933-48eb-85bb-d271d065abc5'::uuid, DATE '2026-10-05', 'entrada', 5.00::numeric, 'N10503', 'N11E69'),
    ('a9551825-51c1-4379-be19-8e7471a4b3bc'::uuid, '21b520ee-23f8-4da8-a131-f5da2d31cad9'::uuid, DATE '2026-10-05', 'entrada', 10.00::numeric, 'N10545', 'N11EAB'),
    ('272c939c-a025-4f21-ae3f-7e95702c4933'::uuid, 'c5ccc033-f99a-4599-9bf6-37a5b0e35dcf'::uuid, DATE '2026-10-01', 'entrada', 14.60::numeric, 'N1013D', 'N11B17'),
    ('b5f6f0cc-194b-4fac-a925-1d5990bafe04'::uuid, 'd3d73624-8270-4899-a0f9-91e8d89dfc54'::uuid, DATE '2026-10-01', 'entrada', 294.00::numeric, 'N1017F', 'N11B59'),
    ('2d4291c4-a0e0-4355-b3f8-48335d8fefaa'::uuid, '21438aad-502c-4032-8baa-a443812e284c'::uuid, DATE '2026-10-01', 'entrada', 1070.00::numeric, 'N10195', 'N11B6F'),
    ('0c21aa4b-6246-4b5a-b365-4db494357533'::uuid, '6a40c63c-d5f2-433c-918a-96d2bf70f6ec'::uuid, DATE '2026-10-01', 'saida', 1479.65::numeric, 'N10203', 'N11BDD'),
    ('1737226e-c618-4f69-806f-d3f4174187ad'::uuid, 'b53fce6c-fc51-44e5-84ec-1bfb79c7ad3c'::uuid, DATE '2026-10-02', 'entrada', 219.00::numeric, 'N10219', 'N11C19'),
    ('9391e610-673b-48e9-9787-0e39b56fdebf'::uuid, '21480063-7171-4bf7-be67-3f981c21e141'::uuid, DATE '2026-10-02', 'entrada', 300.05::numeric, 'N10245', 'N11C45'),
    ('d0775eb6-25f2-4254-8b25-08dbf0a9a7ee'::uuid, 'c3f16ce8-37f5-4c8c-8fc4-0af9c9b3dfaa'::uuid, DATE '2026-10-02', 'entrada', 470.00::numeric, 'N1025B', 'N11C5B'),
    ('28e4bb58-f7be-4cf2-ae60-118f51d75c03'::uuid, '511b8296-645c-4be8-bce0-c4a1c0ecdc43'::uuid, DATE '2026-10-02', 'entrada', 400.00::numeric, 'N10287', 'N11C87'),
    ('281254ac-b240-49dd-9714-0f02e5f497be'::uuid, '2edd037b-f24f-421d-ae22-45ed9ebbcc44'::uuid, DATE '2026-10-02', 'entrada', 1000.00::numeric, 'N1029D', 'N11C9D'),
    ('c3b7a8fd-43ad-482b-a318-83bca5321f0b'::uuid, 'b2c81d1c-d06c-433e-b79e-49d4f9af5aef'::uuid, DATE '2026-10-02', 'saida', 4138.00::numeric, 'N102DD', 'N11CDD'),
    ('e1b9345a-d767-428a-864f-9aa1d86f817a'::uuid, 'f581a8f7-13ce-47d3-8c21-048e98b80a34'::uuid, DATE '2026-10-02', 'saida', 1875.00::numeric, 'N102F3', 'N11CF3'),
    ('e9174f77-b034-4cd1-a3e4-0943d271fdd7'::uuid, 'ea629633-ab4c-4061-94d9-a5514cacfb99'::uuid, DATE '2026-10-02', 'saida', 1923.00::numeric, 'N10309', 'N11D09'),
    ('4b635f2c-bb9f-467b-b10f-9e24af1adfb2'::uuid, '67176c5e-6fa3-4216-b911-9f1397be368e'::uuid, DATE '2026-10-02', 'saida', 760.00::numeric, 'N10335', 'N11D35'),
    ('f98b8b8a-cf7a-43ea-a4f2-cdd9051ea34a'::uuid, 'fb67de76-3493-4386-82b2-32dc79661abf'::uuid, DATE '2026-10-02', 'saida', 1630.00::numeric, 'N1034B', 'N11D4B'),
    ('4248f74c-0e04-4221-8a72-6e77db9150e5'::uuid, '7417fa90-b6ff-401b-85d1-f7766e24a967'::uuid, DATE '2026-10-02', 'saida', 600.00::numeric, 'N10361', 'N11D61'),
    ('bee57171-787c-419e-830f-dd973faf5d92'::uuid, '081f28d4-231e-4bbc-b88c-b4dc14bae556'::uuid, DATE '2026-10-05', 'entrada', 830.00::numeric, 'N10377', 'N11F9B'),
    ('43c1be34-cb5d-4bd6-95b6-16210d28fdce'::uuid, '89d0524b-0038-48b7-9116-99a51dc21094'::uuid, DATE '2026-10-05', 'entrada', 152.00::numeric, 'N103A3', 'N11D77'),
    ('aee79117-37a3-4785-be48-4c879511cfa4'::uuid, '07c690fc-5a15-43ac-a729-cb87a04f56ed'::uuid, DATE '2026-10-05', 'entrada', 1300.00::numeric, 'N103E5', 'N11DA3'),
    ('1294915f-2e88-4ddc-bc57-4c60af99eacb'::uuid, 'e540c092-455c-4d75-b4cd-74aa65a38749'::uuid, DATE '2026-10-05', 'entrada', 1000.00::numeric, 'N10411', 'N11DCF'),
    ('12e8fda8-e5ff-4579-9a32-b94ef1fc91d1'::uuid, '10eda10d-fcd9-4fe4-8859-bcb095dbfc22'::uuid, DATE '2026-10-05', 'entrada', 65.00::numeric, 'N1043D', 'N11F6F'),
    ('a688e90e-9f19-4ed1-bc59-234047bdf115'::uuid, '909613c0-8e70-4de9-b719-fc2789129c09'::uuid, DATE '2026-10-05', 'entrada', 155.00::numeric, 'N10453', 'N11F85'),
    ('6396426a-d715-4a40-bd31-8ad0d2e01e6a'::uuid, '36868f64-8f65-4220-b67d-67e4142a803c'::uuid, DATE '2026-10-05', 'entrada', 637.00::numeric, 'N104C1', 'N11E27'),
    ('59e30ba5-4122-46f6-bd62-5b62153876f3'::uuid, 'ecea67e7-90a9-49dd-82fc-eada4b5e57e9'::uuid, DATE '2026-10-05', 'entrada', 1500.00::numeric, 'N104ED', 'N11E53'),
    ('c880068b-093e-48da-a17c-6bb5e6df8c9c'::uuid, 'eba80457-0602-4167-a567-0ceb78f62b83'::uuid, DATE '2026-10-05', 'entrada', 100.00::numeric, 'N1055B', 'N11EC1'),
    ('57764b56-d5ac-4040-80af-2a95b4796396'::uuid, 'b404b041-79b2-47fb-8e55-555440a62675'::uuid, DATE '2026-10-05', 'saida', 291.31::numeric, 'N1059D', 'N11F2D'),
    ('237aa538-bbe9-4934-adcf-ca469c389c64'::uuid, '9919551e-7e12-4766-bc50-157ccb08dea9'::uuid, DATE '2026-10-05', 'saida', 278.22::numeric, 'N105B3', 'N11F17'),
    ('cbbd3343-2380-4a41-8254-9c3ba94f95f4'::uuid, '9912111b-9db6-419e-b0f6-78eb6c6d90f7'::uuid, DATE '2026-10-05', 'saida', 114.72::numeric, 'N105C9', 'N11F03')
),
checagem AS (
  SELECT d.*,
    -- o de HOJE é exatamente o que foi conferido: importado do OFX, conciliado, criado hoje, com a marca desta exportação, sem nada pendurado nele
    EXISTS (SELECT 1 FROM public.fin_lancamentos h
             WHERE h.id = d.hoje AND h.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND h.origem = 'importado_ofx' AND h.status::text = 'conciliado'
               AND h.tipo::text = d.tipo AND h.valor = d.valor AND h.created_at >= timestamptz '2026-10-20 00:00:00-03'
               AND h.observacoes LIKE '%[ofx:' || d.fitid_hoje || ']%'
               AND h.liquidacao_id IS NULL AND h.lancamento_pai_id IS NULL AND (h.obrigacao_id IS NULL OR h.obrigacao_id = h.id)) AS hoje_confere,
    NOT EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> d.hoje AND (f.lancamento_pai_id = d.hoje OR f.obrigacao_id = d.hoje)) AS sem_filhos,
    NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = d.hoje) AS sem_anexo,
    -- o ANTIGO (o que fica) existe, é de antes de hoje, tem a marca do outro arquivo e é o mesmo movimento
    EXISTS (SELECT 1 FROM public.fin_lancamentos a
             WHERE a.id = d.antigo AND a.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND a.tipo::text = d.tipo AND a.valor = d.valor
               AND a.status::text IN ('conciliado', 'realizado') AND a.created_at < timestamptz '2026-10-20 00:00:00-03'
               AND a.observacoes LIKE '%[ofx:' || d.fitid_antigo || ']%'
               AND (COALESCE(a.data_pagamento, a.data) = d.dia OR a.data = d.dia)) AS antigo_confere,
    -- nunca abaixo do extrato do banco: nesta chave (sentido + valor + dia) o extrato tem 1 linha e o sistema tem exatamente 2
    (SELECT count(*) FROM public.fin_lancamentos x
      WHERE x.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND x.tipo::text = d.tipo AND x.valor = d.valor AND x.status <> 'previsto' AND COALESCE(x.data_pagamento, x.data) = d.dia) = 2 AS chave_com_dois
  FROM dup d
),
resumo AS (
  SELECT count(*) AS pares,
         count(*) FILTER (WHERE hoje_confere AND sem_filhos AND sem_anexo AND antigo_confere AND chave_com_dois) AS pares_ok,
         COALESCE(string_agg(hoje::text || ': ' || concat_ws(', ',
            CASE WHEN NOT hoje_confere THEN 'o lançamento de hoje não confere' END, CASE WHEN NOT sem_filhos THEN 'tem filho/obrigação ligada' END,
            CASE WHEN NOT sem_anexo THEN 'tem anexo' END, CASE WHEN NOT antigo_confere THEN 'o antigo não confere' END,
            CASE WHEN NOT chave_com_dois THEN 'a chave não tem exatamente 2 lançamentos' END), ' | ')
           FILTER (WHERE NOT (hoje_confere AND sem_filhos AND sem_anexo AND antigo_confere AND chave_com_dois)), '') AS problemas
    FROM checagem
),
saldo AS (
  SELECT COALESCE(SUM(CASE WHEN l.tipo::text = 'entrada' THEN l.valor ELSE -l.valor END), 0) AS atual, count(*) AS movimentos
    FROM public.fin_lancamentos l
   WHERE l.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND l.status <> 'previsto' AND COALESCE(l.data_pagamento, l.data) BETWEEN DATE '2026-10-01' AND DATE '2026-10-19'
),
apagar AS (
  DELETE FROM public.fin_lancamentos
   WHERE id IN (SELECT hoje FROM dup)
     AND (SELECT r.pares = 33 AND r.pares_ok = 33 FROM resumo r)
  RETURNING id
)
SELECT (SELECT count(*) FROM apagar) AS apagados, (r.pares = 33 AND r.pares_ok = 33) AS conferencias_ok, r.problemas
  FROM resumo r;
