-- ════════════════════════════════════════════════════════════════════════════
-- SEMENTE DE VALIDACAO — Onda 1
--
-- Dados ficticios para exercitar as 13 correcoes do WAVE1_IMPLEMENTATION_REPORT.
-- Nomes inventados. Telefones na faixa (21) 9xxxx de teste. Nenhum dado real.
--
-- Inclui os DOIS CASOS DE BORDA que motivaram nao aplicar conferir() em duas
-- linhas do codigo:
--   - familia SEM responsavel definido  -> VinculosDialog.tsx:117
--   - familia SEM vinculos              -> Familias.tsx:210
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Usuarios de teste ────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', '5521900000001@app.diakonia'),
  ('22222222-2222-2222-2222-222222222222', '5521900000002@app.diakonia'),
  ('33333333-3333-3333-3333-333333333333', '5521900000003@app.diakonia')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, nome, telefone) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ana Administradora', '5521900000001'),
  ('22222222-2222-2222-2222-222222222222', 'Bruno Secretaria',   '5521900000002'),
  ('33333333-3333-3333-3333-333333333333', 'Carla Lideranca',    '5521900000003')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'secretaria'),
  ('33333333-3333-3333-3333-333333333333', 'lideranca')
ON CONFLICT DO NOTHING;

-- ── 1b. A igreja ancora do mono-inquilino ───────────────────────────────────
-- src/lib/igreja.ts fixa este UUID, e 11 tabelas tem FK para c&. Sem esta linha
-- o sistema nao aceita nenhum cadastro.
INSERT INTO public.igrejas (id, nome) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Quarta Igreja Batista do Rio de Janeiro')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Pessoas ──────────────────────────────────────────────────────────────
INSERT INTO public.membros (id, nome_completo, tipo_pessoa, status, telefone_celular) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Joana Ficticia da Silva',  'membro',     'ativo', '5521911110001'),
  ('a0000000-0000-0000-0000-000000000002', 'Pedro Ficticio Ramos',     'membro',     'ativo', '5521911110002'),
  ('a0000000-0000-0000-0000-000000000003', 'Marta Ficticia Ramos',     'membro',     'ativo', '5521911110003'),
  ('a0000000-0000-0000-0000-000000000004', 'Lucas Ficticio Ramos',     'congregado', 'ativo', '5521911110004'),
  ('a0000000-0000-0000-0000-000000000005', 'Beatriz Ficticia Nunes',   'visitante',  'ativo', '5521911110005'),
  ('a0000000-0000-0000-0000-000000000006', 'Rafael Ficticio Nunes',    'visitante',  'ativo', '5521911110006')
ON CONFLICT (id) DO NOTHING;

-- ── 3. Familias ─────────────────────────────────────────────────────────────
INSERT INTO public.familias (id, nome_familia, bairro) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Ramos',   'Tijuca'),
  ('b0000000-0000-0000-0000-000000000002', 'Nunes',   'Vila Isabel'),
  ('b0000000-0000-0000-0000-000000000003', 'Vazia',   'Maracana')   -- CASO DE BORDA: sem vinculos
ON CONFLICT (id) DO NOTHING;

-- ── 4. Vinculos familiares ──────────────────────────────────────────────────
-- Familia Ramos: COM responsavel
INSERT INTO public.vinculos_familiares (id, familia_id, membro_id, parentesco, responsavel_familia) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'pai_mae', true),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'conjuge', false),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'filho',   false),
-- Familia Nunes: CASO DE BORDA — nenhum responsavel marcado
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'pai_mae', false),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006', 'filho',   false)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Visitas ──────────────────────────────────────────────────────────────
INSERT INTO public.visitas (id, membro_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000006')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Solicitacoes LGPD ────────────────────────────────────────────────────
INSERT INTO public.solicitacoes_lgpd (id, email_solicitante, tipo, status) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'joana.ficticia@exemplo.invalido', 'acesso',    'pendente'),
  ('e0000000-0000-0000-0000-000000000002', 'pedro.ficticio@exemplo.invalido', 'exclusao',  'pendente')
ON CONFLICT (id) DO NOTHING;

SELECT
  (SELECT count(*) FROM auth.users)                  AS usuarios,
  (SELECT count(*) FROM public.user_roles)           AS papeis,
  (SELECT count(*) FROM public.membros)              AS membros,
  (SELECT count(*) FROM public.familias)             AS familias,
  (SELECT count(*) FROM public.vinculos_familiares)  AS vinculos,
  (SELECT count(*) FROM public.visitas)              AS visitas,
  (SELECT count(*) FROM public.solicitacoes_lgpd)    AS lgpd;

-- ── 7. Perfis pastorais — comparacao pastor x diakonia ──────────────────────
-- Medido em 26/08/2026: `pastor` sozinho NAO enxerga familias, vinculos,
-- visitas, historico de membresia, acompanhamento, locais nem membros de
-- ministerio. `diakonia` enxerga tudo isso. A interface rotula os dois como
-- "Pastor" (AppLayout.tsx:156).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
       email_change, email_change_token_current, phone_change, phone_change_token,
       reauthentication_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, crypt('Teste@2026', gen_salt('bf')), now(),
       '','','','','','','','', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
  ('44444444-4444-4444-4444-444444444444'::uuid, '5521900000004@app.diakonia'),
  ('55555555-5555-5555-5555-555555555555'::uuid, '5521900000005@app.diakonia'),
  ('66666666-6666-6666-6666-666666666666'::uuid, '5521900000006@app.diakonia')
) v(id,email) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub',u.id::text,'email',u.email,'email_verified',true,'phone_verified',false),
       'email', now(), now(), now()
FROM auth.users u
WHERE u.email IN ('5521900000004@app.diakonia','5521900000005@app.diakonia','5521900000006@app.diakonia')
  AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id=u.id);

INSERT INTO public.profiles (id, nome, telefone) VALUES
  ('44444444-4444-4444-4444-444444444444','Pedro Pastor (so pastor)','5521900000004'),
  ('55555555-5555-5555-5555-555555555555','Davi Diakonia (so diakonia)','5521900000005'),
  ('66666666-6666-6666-6666-666666666666','Samuel Titular (pastor+diakonia)','5521900000006')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('44444444-4444-4444-4444-444444444444','pastor'),
  ('55555555-5555-5555-5555-555555555555','diakonia'),
  ('66666666-6666-6666-6666-666666666666','pastor'),
  ('66666666-6666-6666-6666-666666666666','diakonia')
ON CONFLICT DO NOTHING;
