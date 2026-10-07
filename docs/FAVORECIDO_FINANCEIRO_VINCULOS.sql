-- ─── PASSO B (depois da migration, só com a sua aprovação) — liga os cadastros financeiros que JÁ são pessoas da igreja ───
-- Critério: o nome do cadastro financeiro (sem o prefixo de CNPJ de MEI e sem acento) é IGUAL ao de UMA única pessoa, e nenhum
-- outro cadastro financeiro tem esse nome. Fora daqui, de propósito: Tayane Claudio Rezende de Souza (a pessoa está DUPLICADA no
-- cadastro de pessoas: 'TAYANE...' e 'Tayane...') - junte as duas fichas primeiro. Nada de lançamento muda; só se preenche pessoa_id.
UPDATE public.fin_fornecedores f SET pessoa_id = v.mid, tipo = 'fisica'
  FROM (VALUES
    ('81adb05e-dfca-4d69-9228-88ee82ba8902'::uuid, 'ff684f91-9819-4dd5-990b-73e18888ab79'::uuid),
    ('6c94470e-0834-4634-bbfb-df59ef471a97'::uuid, '46cf64c8-9654-4019-b42d-f16dbb854469'::uuid),
    ('8a539bf0-05d5-4a26-8fe3-46c42cfb4264'::uuid, '9e7a5042-fff2-4f42-bf0e-d4c408772af8'::uuid),
    ('85bc8068-6758-4608-94f7-9a50d8bb8e7a'::uuid, '7ed4e855-1352-4b37-a13d-7a65c856bd39'::uuid),
    ('fed9670e-a293-427b-b294-e41570e4e345'::uuid, '66319fb1-b5fe-41c5-b2ca-6e18b69241b2'::uuid),
    ('fb315437-d175-48ea-b9b7-1befc520602c'::uuid, 'd18cca04-435a-4a9b-9ea9-2f599248859d'::uuid),
    ('888ad516-6004-469b-9e92-fca6ea5688da'::uuid, 'bdba2bfe-753b-4002-ba55-bef8deb8ed94'::uuid),
    ('4289f46f-1f68-44ba-8677-6bc49efca635'::uuid, '1a30c411-28d1-4d0e-8850-3c8dbdf29d97'::uuid),
    ('71ee6954-b7c3-4a42-a16c-2179dc874a54'::uuid, '68e1f694-04a2-4643-bc32-95403097aac9'::uuid),
    ('bcfb552c-7760-4b6b-a027-045260d49211'::uuid, 'b6ac9fbe-a1c5-4c5a-8932-f2f138b3a1ec'::uuid),
    ('fbb8c757-c65b-4f26-bb66-256a2146f6dc'::uuid, 'e3f1cfde-85a2-4ef1-b9ab-83afffad085e'::uuid),
    ('4c6770ec-8cea-4310-9c36-c7b38710d35e'::uuid, 'f8ff3b0f-d244-4be6-b5b4-392019f85196'::uuid),
    ('16a4d8a9-fdb1-4c12-98d6-afa947119ad9'::uuid, '1e607dda-8408-41e3-8ba6-99869bbe1b09'::uuid),
    ('69333767-ed3b-441d-9a6c-945c2d06b7e1'::uuid, 'a9691c6e-a5bc-4388-9ec0-4edd29b9ff85'::uuid),
    ('1eef5bc8-5470-4b8e-9178-b68cb342f286'::uuid, '27897bdf-4924-4b7b-baf4-9e90a17c921b'::uuid)
  ) AS v(fid, mid)
 WHERE f.id = v.fid AND f.pessoa_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.fin_fornecedores o WHERE o.pessoa_id = v.mid);
-- esperado: 15 linhas