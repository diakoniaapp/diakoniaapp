-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA — Sistema de Permissões + Painel Inteligente
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Tabela de permissões (catálogo) ────────────────────────────────
create table if not exists public.permissoes (
  codigo      text primary key,
  modulo      text not null,
  descricao   text not null,
  created_at  timestamptz not null default now()
);

-- ─── 2) M2M role x permissão ──────────────────────────────────────────
create table if not exists public.role_permissoes (
  role            app_role not null,
  permissao_codigo text not null references public.permissoes(codigo) on delete cascade,
  primary key (role, permissao_codigo),
  created_at      timestamptz not null default now()
);

-- ─── 3) Seed catálogo de permissões ───────────────────────────────────
insert into public.permissoes (codigo, modulo, descricao) values
  -- Pessoas / Famílias / Áreas
  ('ver_pessoas',           'pessoas', 'Ver lista e detalhes de pessoas'),
  ('criar_pessoa',          'pessoas', 'Cadastrar nova pessoa'),
  ('editar_pessoa',         'pessoas', 'Editar dados de pessoas'),
  ('excluir_pessoa',        'pessoas', 'Excluir pessoa (admin)'),
  ('ver_familias',          'familias', 'Ver lista de famílias'),
  ('gerenciar_familias',    'familias', 'Criar/editar famílias e vínculos'),
  ('ver_areas',             'areas',    'Ver áreas e ministérios'),
  ('gerenciar_areas',       'areas',    'Editar áreas e ministérios'),

  -- EBD
  ('ver_ebd',               'ebd', 'Ver classes EBD'),
  ('gerenciar_ebd',         'ebd', 'CRUD de classes, chamadas, campanhas'),

  -- PGM
  ('ver_pgm',               'pgm', 'Ver pequenos grupos'),
  ('gerenciar_pgm',         'pgm', 'CRUD de grupos e encontros'),

  -- Financeiro
  ('ver_financeiro',        'financeiro', 'Ver dashboard e contas'),
  ('lancar_financeiro',     'financeiro', 'Registrar lançamentos'),
  ('gerenciar_financeiro',  'financeiro', 'Configurar contas/categorias/centros'),
  ('ver_folha',             'financeiro', 'Ver folha de pagamento'),
  ('aprovar_pagamentos',    'financeiro', 'Aprovar pagamentos acima do limite'),
  ('ver_relatorios_executivos', 'financeiro', 'Ver dashboard executivo'),

  -- Membresia
  ('ver_membresia',         'membresia', 'Ver solicitações de membresia'),
  ('criar_solicitacao',     'membresia', 'Criar pedido de entrada/saída'),
  ('aprovar_membresia',     'membresia', 'Aprovar em assembleia'),
  ('gerar_carta',           'membresia', 'Gerar cartas de membresia'),
  ('ver_painel_secretaria', 'membresia', 'Ver Painel da Secretaria'),

  -- Governança
  ('ver_governanca',        'governanca', 'Ver reuniões e pautas'),
  ('criar_reuniao',         'governanca', 'Cadastrar reunião'),
  ('criar_pauta',           'governanca', 'Cadastrar pauta'),
  ('votar_assembleia',      'governanca', 'Votar em assembleia'),

  -- Assuntos
  ('ver_assuntos',          'assuntos', 'Ver assuntos administrativos'),
  ('gerenciar_assuntos',    'assuntos', 'CRUD de assuntos'),

  -- Painéis
  ('ver_painel_pastoral',   'painel', 'Ver painel pastoral'),
  ('ver_painel_admin',      'painel', 'Ver painel administrativo'),
  ('ver_painel_tesouraria', 'painel', 'Ver painel da tesouraria'),

  -- Sistema
  ('configurar_sistema',    'sistema', 'Configurações globais (admin)'),
  ('ver_audit_log',         'sistema', 'Ver audit log'),
  ('gerenciar_usuarios',    'sistema', 'Gerenciar acessos e roles')
on conflict (codigo) do nothing;

-- ─── 4) Seed: roles → permissões padrão ────────────────────────────────

-- ADMIN: tudo
insert into public.role_permissoes (role, permissao_codigo)
select 'admin'::app_role, codigo from public.permissoes
on conflict do nothing;

-- PASTOR: visão pastoral + leitura geral
insert into public.role_permissoes (role, permissao_codigo) values
  ('pastor', 'ver_pessoas'),
  ('pastor', 'ver_familias'),
  ('pastor', 'gerenciar_familias'),
  ('pastor', 'ver_areas'),
  ('pastor', 'ver_ebd'),
  ('pastor', 'ver_pgm'),
  ('pastor', 'ver_financeiro'),
  ('pastor', 'ver_relatorios_executivos'),
  ('pastor', 'ver_membresia'),
  ('pastor', 'aprovar_membresia'),
  ('pastor', 'ver_governanca'),
  ('pastor', 'criar_reuniao'),
  ('pastor', 'criar_pauta'),
  ('pastor', 'votar_assembleia'),
  ('pastor', 'ver_assuntos'),
  ('pastor', 'ver_painel_pastoral'),
  ('pastor', 'ver_painel_admin')
on conflict do nothing;

-- DIAKONIA (mesma cobertura pastoral)
insert into public.role_permissoes (role, permissao_codigo)
select 'diakonia'::app_role, permissao_codigo from public.role_permissoes
where role = 'pastor' on conflict do nothing;

-- SECRETARIA: pessoas + membresia + governança + assuntos
insert into public.role_permissoes (role, permissao_codigo) values
  ('secretaria', 'ver_pessoas'),
  ('secretaria', 'criar_pessoa'),
  ('secretaria', 'editar_pessoa'),
  ('secretaria', 'ver_familias'),
  ('secretaria', 'gerenciar_familias'),
  ('secretaria', 'ver_areas'),
  ('secretaria', 'ver_ebd'),
  ('secretaria', 'gerenciar_ebd'),
  ('secretaria', 'ver_pgm'),
  ('secretaria', 'gerenciar_pgm'),
  ('secretaria', 'ver_financeiro'),
  ('secretaria', 'lancar_financeiro'),
  ('secretaria', 'gerenciar_financeiro'),
  ('secretaria', 'ver_folha'),
  ('secretaria', 'ver_relatorios_executivos'),
  ('secretaria', 'ver_membresia'),
  ('secretaria', 'criar_solicitacao'),
  ('secretaria', 'gerar_carta'),
  ('secretaria', 'ver_painel_secretaria'),
  ('secretaria', 'ver_governanca'),
  ('secretaria', 'criar_reuniao'),
  ('secretaria', 'criar_pauta'),
  ('secretaria', 'ver_assuntos'),
  ('secretaria', 'gerenciar_assuntos'),
  ('secretaria', 'ver_painel_admin'),
  ('secretaria', 'ver_painel_tesouraria')
on conflict do nothing;

-- LIDERANCA: visão limitada da sua área
insert into public.role_permissoes (role, permissao_codigo) values
  ('lideranca', 'ver_pessoas'),
  ('lideranca', 'ver_familias'),
  ('lideranca', 'ver_areas'),
  ('lideranca', 'ver_ebd'),
  ('lideranca', 'ver_pgm'),
  ('lideranca', 'ver_governanca'),
  ('lideranca', 'ver_assuntos')
on conflict do nothing;

-- VOLUNTARIO: básico
insert into public.role_permissoes (role, permissao_codigo) values
  ('voluntario', 'ver_pessoas'),
  ('voluntario', 'ver_areas')
on conflict do nothing;

-- ─── 5) RPC: permissoes do usuário atual ───────────────────────────────
create or replace function public.minhas_permissoes()
returns table (codigo text, modulo text)
language sql stable security definer set search_path = public as $$
  select distinct rp.permissao_codigo, p.modulo
  from public.user_roles ur
  join public.role_permissoes rp on rp.role = ur.role
  join public.permissoes p on p.codigo = rp.permissao_codigo
  where ur.user_id = auth.uid();
$$;

-- ─── 6) RPC helper: verifica permissão ─────────────────────────────────
create or replace function public.tem_permissao(p_codigo text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissoes rp on rp.role = ur.role
    where ur.user_id = auth.uid()
      and rp.permissao_codigo = p_codigo
  );
$$;

-- ─── 7) RLS ────────────────────────────────────────────────────────────
alter table public.permissoes      enable row level security;
alter table public.role_permissoes enable row level security;

drop policy if exists "permissoes_read" on public.permissoes;
drop policy if exists "role_perm_read"  on public.role_permissoes;

-- Leitura aberta (todos podem saber quais permissões existem)
create policy "permissoes_read" on public.permissoes
  for select using (auth.role() = 'authenticated');

-- Leitura aberta (todos podem saber quem tem o que)
create policy "role_perm_read" on public.role_permissoes
  for select using (auth.role() = 'authenticated');

comment on table public.permissoes      is 'Catalogo de permissoes granulares';
comment on table public.role_permissoes is 'M2M: role -> permissoes que a role concede';
