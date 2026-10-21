-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ENSAIO — roda tudo e DESFAZ (ROLLBACK): nada fica no banco
-- Apaga os 33 lançamentos DUPLICADOS (praticamente certos) que a conciliação do OFX de 20/10/2026 gravou hoje; os 33 originais de 08–14/10 ficam.
-- Classificação e prova: docs/CLASSIFICACAO_DUPLICADOS_OFX_2026-10-20.md. Os 19 que pedem revisão e a transferência de R$ 250,00 NÃO entram aqui.
-- Tudo numa transação: as conferências abortam sem alterar nada se qualquer id, marca, vínculo, anexo ou contagem não bater.
-- Passo 1: rode este. A última linha deve dar 33 · 33 · 33 · variação 2081.75. Depois, o APLICAR.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Os 33 pares: o lançamento de HOJE (o duplicado, sai) e o ANTIGO (fica). Ids conferidos em 20/10/2026 contra o banco de produção.
CREATE TEMP TABLE _dup (
  hoje uuid PRIMARY KEY, antigo uuid NOT NULL, dia date NOT NULL, tipo text NOT NULL, valor numeric(14,2) NOT NULL, fitid_hoje text NOT NULL, fitid_antigo text NOT NULL
) ON COMMIT DROP;
INSERT INTO _dup (hoje, antigo, dia, tipo, valor, fitid_hoje, fitid_antigo) VALUES
  ('bd34c247-a2fa-4925-b63f-59237666ec13', '31db5fa2-e40f-4b97-93f6-5d53560f89e5', DATE '2026-10-01', 'entrada', 300.00, 'N10127', 'N11B01'),
  ('c3e0b17e-f9a7-4651-95e4-1a6fd34c4c7c', 'b4806bda-528e-49be-a28f-e81fc3e78c9f', DATE '2026-10-01', 'entrada', 650.00, 'N101D7', 'N11BB1'),
  ('35291ee7-f07e-4d9a-b36e-4d56c5debdc6', 'e2aedd98-ae26-4bc6-b2b5-5a339bf9edfb', DATE '2026-10-02', 'entrada', 4500.00, 'N1022F', 'N11C2F'),
  ('41730edd-777e-42b6-aa72-083bd12fc685', '2619966e-2760-47e7-9899-0925b74c40ee', DATE '2026-10-02', 'entrada', 200.00, 'N10271', 'N11C71'),
  ('29a5a040-e00f-42ae-b651-651c6c9adc6e', '50abca4f-b933-48eb-85bb-d271d065abc5', DATE '2026-10-05', 'entrada', 5.00, 'N10503', 'N11E69'),
  ('a9551825-51c1-4379-be19-8e7471a4b3bc', '21b520ee-23f8-4da8-a131-f5da2d31cad9', DATE '2026-10-05', 'entrada', 10.00, 'N10545', 'N11EAB'),
  ('272c939c-a025-4f21-ae3f-7e95702c4933', 'c5ccc033-f99a-4599-9bf6-37a5b0e35dcf', DATE '2026-10-01', 'entrada', 14.60, 'N1013D', 'N11B17'),
  ('b5f6f0cc-194b-4fac-a925-1d5990bafe04', 'd3d73624-8270-4899-a0f9-91e8d89dfc54', DATE '2026-10-01', 'entrada', 294.00, 'N1017F', 'N11B59'),
  ('2d4291c4-a0e0-4355-b3f8-48335d8fefaa', '21438aad-502c-4032-8baa-a443812e284c', DATE '2026-10-01', 'entrada', 1070.00, 'N10195', 'N11B6F'),
  ('0c21aa4b-6246-4b5a-b365-4db494357533', '6a40c63c-d5f2-433c-918a-96d2bf70f6ec', DATE '2026-10-01', 'saida', 1479.65, 'N10203', 'N11BDD'),
  ('1737226e-c618-4f69-806f-d3f4174187ad', 'b53fce6c-fc51-44e5-84ec-1bfb79c7ad3c', DATE '2026-10-02', 'entrada', 219.00, 'N10219', 'N11C19'),
  ('9391e610-673b-48e9-9787-0e39b56fdebf', '21480063-7171-4bf7-be67-3f981c21e141', DATE '2026-10-02', 'entrada', 300.05, 'N10245', 'N11C45'),
  ('d0775eb6-25f2-4254-8b25-08dbf0a9a7ee', 'c3f16ce8-37f5-4c8c-8fc4-0af9c9b3dfaa', DATE '2026-10-02', 'entrada', 470.00, 'N1025B', 'N11C5B'),
  ('28e4bb58-f7be-4cf2-ae60-118f51d75c03', '511b8296-645c-4be8-bce0-c4a1c0ecdc43', DATE '2026-10-02', 'entrada', 400.00, 'N10287', 'N11C87'),
  ('281254ac-b240-49dd-9714-0f02e5f497be', '2edd037b-f24f-421d-ae22-45ed9ebbcc44', DATE '2026-10-02', 'entrada', 1000.00, 'N1029D', 'N11C9D'),
  ('c3b7a8fd-43ad-482b-a318-83bca5321f0b', 'b2c81d1c-d06c-433e-b79e-49d4f9af5aef', DATE '2026-10-02', 'saida', 4138.00, 'N102DD', 'N11CDD'),
  ('e1b9345a-d767-428a-864f-9aa1d86f817a', 'f581a8f7-13ce-47d3-8c21-048e98b80a34', DATE '2026-10-02', 'saida', 1875.00, 'N102F3', 'N11CF3'),
  ('e9174f77-b034-4cd1-a3e4-0943d271fdd7', 'ea629633-ab4c-4061-94d9-a5514cacfb99', DATE '2026-10-02', 'saida', 1923.00, 'N10309', 'N11D09'),
  ('4b635f2c-bb9f-467b-b10f-9e24af1adfb2', '67176c5e-6fa3-4216-b911-9f1397be368e', DATE '2026-10-02', 'saida', 760.00, 'N10335', 'N11D35'),
  ('f98b8b8a-cf7a-43ea-a4f2-cdd9051ea34a', 'fb67de76-3493-4386-82b2-32dc79661abf', DATE '2026-10-02', 'saida', 1630.00, 'N1034B', 'N11D4B'),
  ('4248f74c-0e04-4221-8a72-6e77db9150e5', '7417fa90-b6ff-401b-85d1-f7766e24a967', DATE '2026-10-02', 'saida', 600.00, 'N10361', 'N11D61'),
  ('bee57171-787c-419e-830f-dd973faf5d92', '081f28d4-231e-4bbc-b88c-b4dc14bae556', DATE '2026-10-05', 'entrada', 830.00, 'N10377', 'N11F9B'),
  ('43c1be34-cb5d-4bd6-95b6-16210d28fdce', '89d0524b-0038-48b7-9116-99a51dc21094', DATE '2026-10-05', 'entrada', 152.00, 'N103A3', 'N11D77'),
  ('aee79117-37a3-4785-be48-4c879511cfa4', '07c690fc-5a15-43ac-a729-cb87a04f56ed', DATE '2026-10-05', 'entrada', 1300.00, 'N103E5', 'N11DA3'),
  ('1294915f-2e88-4ddc-bc57-4c60af99eacb', 'e540c092-455c-4d75-b4cd-74aa65a38749', DATE '2026-10-05', 'entrada', 1000.00, 'N10411', 'N11DCF'),
  ('12e8fda8-e5ff-4579-9a32-b94ef1fc91d1', '10eda10d-fcd9-4fe4-8859-bcb095dbfc22', DATE '2026-10-05', 'entrada', 65.00, 'N1043D', 'N11F6F'),
  ('a688e90e-9f19-4ed1-bc59-234047bdf115', '909613c0-8e70-4de9-b719-fc2789129c09', DATE '2026-10-05', 'entrada', 155.00, 'N10453', 'N11F85'),
  ('6396426a-d715-4a40-bd31-8ad0d2e01e6a', '36868f64-8f65-4220-b67d-67e4142a803c', DATE '2026-10-05', 'entrada', 637.00, 'N104C1', 'N11E27'),
  ('59e30ba5-4122-46f6-bd62-5b62153876f3', 'ecea67e7-90a9-49dd-82fc-eada4b5e57e9', DATE '2026-10-05', 'entrada', 1500.00, 'N104ED', 'N11E53'),
  ('c880068b-093e-48da-a17c-6bb5e6df8c9c', 'eba80457-0602-4167-a567-0ceb78f62b83', DATE '2026-10-05', 'entrada', 100.00, 'N1055B', 'N11EC1'),
  ('57764b56-d5ac-4040-80af-2a95b4796396', 'b404b041-79b2-47fb-8e55-555440a62675', DATE '2026-10-05', 'saida', 291.31, 'N1059D', 'N11F2D'),
  ('237aa538-bbe9-4934-adcf-ca469c389c64', '9919551e-7e12-4766-bc50-157ccb08dea9', DATE '2026-10-05', 'saida', 278.22, 'N105B3', 'N11F17'),
  ('cbbd3343-2380-4a41-8254-9c3ba94f95f4', '9912111b-9db6-419e-b0f6-78eb6c6d90f7', DATE '2026-10-05', 'saida', 114.72, 'N105C9', 'N11F03');

-- o saldo do Bradesco no período, ANTES (entradas − saídas, realizado + conciliado)
CREATE TEMP TABLE _antes ON COMMIT DROP AS
SELECT COALESCE(SUM(CASE WHEN l.tipo::text = 'entrada' THEN l.valor ELSE -l.valor END), 0) AS saldo, count(*) AS movimentos
  FROM public.fin_lancamentos l
 WHERE l.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND l.status <> 'previsto' AND COALESCE(l.data_pagamento, l.data) BETWEEN DATE '2026-10-01' AND DATE '2026-10-19';

-- ── CONFERÊNCIAS: se UMA falhar, nada é alterado ─────────────────────────────────────────────────────────────────────────────────────────────
DO $conf$
DECLARE
  p record; n int; erros text[] := '{}';
  inicio_do_dia CONSTANT timestamptz := timestamptz '2026-10-20 00:00:00-03';
BEGIN
  SELECT count(*) INTO n FROM _dup;
  IF n <> 33 THEN RAISE EXCEPTION 'Esperava 33 pares e a lista tem %: nada foi alterado.', n; END IF;

  FOR p IN SELECT * FROM _dup ORDER BY dia, valor LOOP
    -- o de HOJE é exatamente o que dissemos: importado do OFX, conciliado, criado hoje, com a marca desta exportação e sem NADA pendurado nele
    IF NOT EXISTS (SELECT 1 FROM public.fin_lancamentos h
                    WHERE h.id = p.hoje AND h.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND h.origem = 'importado_ofx' AND h.status::text = 'conciliado'
                      AND h.tipo::text = p.tipo AND h.valor = p.valor AND h.created_at >= inicio_do_dia
                      AND h.observacoes LIKE '%[ofx:' || p.fitid_hoje || ']%'
                      AND h.liquidacao_id IS NULL AND h.lancamento_pai_id IS NULL AND (h.obrigacao_id IS NULL OR h.obrigacao_id = h.id)) THEN
      erros := erros || format('hoje %s (%s %s): não confere com o que foi conferido em 20/10', p.hoje, p.tipo, p.valor);
    END IF;
    IF EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> p.hoje AND (f.lancamento_pai_id = p.hoje OR f.obrigacao_id = p.hoje)) THEN
      erros := erros || format('hoje %s: tem lançamento filho ou ligado à obrigação dele', p.hoje);
    END IF;
    IF EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = p.hoje) THEN
      erros := erros || format('hoje %s: tem anexo', p.hoje);
    END IF;
    -- o ANTIGO (o que fica) existe, é de antes de hoje, tem a marca do outro arquivo e é o mesmo movimento
    IF NOT EXISTS (SELECT 1 FROM public.fin_lancamentos a
                    WHERE a.id = p.antigo AND a.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND a.tipo::text = p.tipo AND a.valor = p.valor
                      AND a.status::text IN ('conciliado', 'realizado') AND a.created_at < inicio_do_dia
                      AND a.observacoes LIKE '%[ofx:' || p.fitid_antigo || ']%'
                      AND (COALESCE(a.data_pagamento, a.data) = p.dia OR a.data = p.dia)) THEN
      erros := erros || format('antigo %s (%s %s): não confere', p.antigo, p.tipo, p.valor);
    END IF;
    -- nunca abaixo do extrato do banco: nesta chave (sentido+valor+dia) o extrato tem 1 linha e o sistema tem exatamente 2
    SELECT count(*) INTO n FROM public.fin_lancamentos x
     WHERE x.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND x.tipo::text = p.tipo AND x.valor = p.valor AND x.status <> 'previsto' AND COALESCE(x.data_pagamento, x.data) = p.dia;
    IF n <> 2 THEN erros := erros || format('chave %s %s %s: o sistema tem %s lançamentos (esperado 2: um do extrato e o duplicado)', p.tipo, p.valor, p.dia, n); END IF;
  END LOOP;

  IF cardinality(erros) > 0 THEN
    RAISE EXCEPTION 'Nada foi alterado. % problema(s): %', cardinality(erros), array_to_string(erros, ' | ');
  END IF;
END
$conf$;

-- ── A CORREÇÃO: apaga SÓ os 33 lançamentos de hoje (o gatilho de vínculo fecha, sem apagar, o vínculo de cada um) ────────────────────────────────
DO $apaga$
DECLARE n int;
BEGIN
  DELETE FROM public.fin_lancamentos WHERE id IN (SELECT hoje FROM _dup);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 33 THEN RAISE EXCEPTION 'Esperava apagar 33 e apaguei %: nada foi alterado.', n; END IF;
END
$apaga$;

-- ── CONFERÊNCIA FINAL (esperado: 33 · 33 · 33 · variação = 2081.75 · diferença 0) ──────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM _dup d WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = d.hoje)) AS apagados,
  (SELECT count(*) FROM _dup d WHERE EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = d.antigo)) AS antigos_preservados,
  (SELECT count(*) FROM _dup d WHERE (SELECT count(*) FROM public.fin_lancamentos x WHERE x.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND x.tipo::text = d.tipo AND x.valor = d.valor
                                         AND x.status <> 'previsto' AND COALESCE(x.data_pagamento, x.data) = d.dia) = 1) AS chaves_com_um_so,
  (SELECT a.saldo FROM _antes a) - COALESCE((SELECT SUM(CASE WHEN l.tipo::text = 'entrada' THEN l.valor ELSE -l.valor END)
        FROM public.fin_lancamentos l WHERE l.conta_id = '9c6730f9-89a5-4112-b040-1cce5a5d77b3' AND l.status <> 'previsto' AND COALESCE(l.data_pagamento, l.data) BETWEEN DATE '2026-10-01' AND DATE '2026-10-19'), 0) AS variacao_do_saldo,
  2081.75::numeric AS variacao_esperada;

ROLLBACK;
