-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE 1 (Fundação)
-- Contas + Categorias + Centros de custo + Lançamentos + Fornecedores
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Tipos enumerados ──────────────────────────────────────────────────
do $$ begin
  create type fin_conta_tipo as enum ('caixa','banco','pix','envelope','cartao','aplicacao','cofre');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fin_movimento_tipo as enum ('entrada','saida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fin_lancamento_status as enum ('previsto','realizado','conciliado','cancelado','aguardando_aprovacao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fin_forma_pagamento as enum ('pix','dinheiro','cartao_debito','cartao_credito','transferencia','boleto','envelope','outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fin_centro_vinculo as enum ('ministerio','area','ebd_classe','pgm_grupo','campanha','geral');
exception when duplicate_object then null; end $$;

-- ─── 2) Tabela: contas (banco, caixa, cartão, etc.) ───────────────────────
create table if not exists public.fin_contas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          fin_conta_tipo not null,
  banco_nome    text,           -- ex: "Bradesco"
  banco_codigo  text,           -- ex: "237"
  agencia       text,
  conta_numero  text,           -- ex: "111342"
  saldo_inicial numeric(14,2) not null default 0,
  saldo_atual   numeric(14,2) not null default 0,
  cor           text default '#cfa451',
  ativo         boolean not null default true,
  ordem         int default 0,
  observacao    text,
  -- cartão: vencimento + fechamento
  dia_vencimento smallint,
  dia_fechamento smallint,
  limite_credito numeric(14,2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_fin_contas_ativo on public.fin_contas(ativo);

-- ─── 3) Tabela: categorias (plano de contas igreja) ──────────────────────
create table if not exists public.fin_categorias (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  tipo            fin_movimento_tipo not null,
  conta_contabil  text,           -- ex: "3.1.01"
  cor             text default '#888',
  icone           text,
  pai_id          uuid references public.fin_categorias(id) on delete set null,
  sistema         boolean not null default false, -- categorias protegidas (não podem deletar)
  ordem           int default 0,
  ativo           boolean not null default true,
  observacao      text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_fin_categorias_tipo on public.fin_categorias(tipo);
create index if not exists idx_fin_categorias_ativo on public.fin_categorias(ativo);

-- ─── 4) Tabela: centros de custo (liga ao Diakonia) ──────────────────────
create table if not exists public.fin_centros_custo (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  vinculo_tipo    fin_centro_vinculo not null default 'geral',
  vinculo_id      uuid,                          -- pode apontar pra ministerios.id, areas.id, etc.
  vinculo_nome    text,                          -- snapshot do nome no momento (debounce)
  orcamento_anual numeric(14,2),
  cor             text default '#888',
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_fin_cc_tipo on public.fin_centros_custo(vinculo_tipo);
create index if not exists idx_fin_cc_vinc on public.fin_centros_custo(vinculo_id);

-- ─── 5) Tabela: fornecedores ─────────────────────────────────────────────
create table if not exists public.fin_fornecedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          text check (tipo in ('juridica','fisica','autonomo','mei','pastor','funcionario')),
  cnpj_cpf      text,
  email         text,
  telefone      text,
  endereco      text,
  bairro        text,
  cidade        text,
  uf            text,
  cep           text,
  chave_pix     text,
  banco_nome    text,
  agencia       text,
  conta         text,
  categoria_padrao_id uuid references public.fin_categorias(id) on delete set null,
  ativo         boolean not null default true,
  observacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_fin_forn_nome on public.fin_fornecedores(lower(nome));
create index if not exists idx_fin_forn_cnpj on public.fin_fornecedores(cnpj_cpf);

-- ─── 6) Tabela: lançamentos (o coração do módulo) ────────────────────────
create table if not exists public.fin_lancamentos (
  id                uuid primary key default gen_random_uuid(),
  data              date not null,
  data_competencia  date,                                       -- mês de referência
  tipo              fin_movimento_tipo not null,
  status            fin_lancamento_status not null default 'realizado',
  conta_id          uuid not null references public.fin_contas(id) on delete restrict,
  categoria_id      uuid references public.fin_categorias(id) on delete set null,
  centro_custo_id   uuid references public.fin_centros_custo(id) on delete set null,
  fornecedor_id     uuid references public.fin_fornecedores(id) on delete set null,
  pessoa_id         uuid references public.membros(id) on delete set null,  -- doador (entradas) ou beneficiario
  familia_id        uuid,                                       -- doador família (opcional)
  valor             numeric(14,2) not null check (valor > 0),
  descricao         text,
  forma_pagamento   fin_forma_pagamento,
  documento_numero  text,                                       -- nº NF, recibo, RPA
  observacoes       text,
  comprovante_url   text,                                       -- path no storage
  lancamento_pai_id uuid references public.fin_lancamentos(id) on delete set null, -- parcelamento/recorrência
  origem            text default 'manual',                      -- manual/ocr/import_ofx/recorrencia/campanha_ebd
  data_pagamento    date,                                       -- quando saiu de fato (pode ≠ data)
  audit_user_id     uuid references public.profiles(id) on delete set null,
  audit_em          timestamptz default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_fin_lanc_conta on public.fin_lancamentos(conta_id);
create index if not exists idx_fin_lanc_data  on public.fin_lancamentos(data desc);
create index if not exists idx_fin_lanc_tipo  on public.fin_lancamentos(tipo);
create index if not exists idx_fin_lanc_cat   on public.fin_lancamentos(categoria_id);
create index if not exists idx_fin_lanc_cc    on public.fin_lancamentos(centro_custo_id);
create index if not exists idx_fin_lanc_status on public.fin_lancamentos(status);

-- ─── 7) Trigger: updated_at automático ──────────────────────────────────
create or replace function public.touch_fin_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists fin_contas_touch on public.fin_contas;
create trigger fin_contas_touch before update on public.fin_contas
  for each row execute function public.touch_fin_updated_at();

drop trigger if exists fin_lanc_touch on public.fin_lancamentos;
create trigger fin_lanc_touch before update on public.fin_lancamentos
  for each row execute function public.touch_fin_updated_at();

drop trigger if exists fin_forn_touch on public.fin_fornecedores;
create trigger fin_forn_touch before update on public.fin_fornecedores
  for each row execute function public.touch_fin_updated_at();

-- ─── 8) Trigger: recalcular saldo_atual da conta ao mudar lançamento ─────
create or replace function public.fin_recalc_saldo_conta(p_conta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l
       where l.conta_id = c.id
         and l.status in ('realizado','conciliado')
     ), 0)
   where c.id = p_conta_id;
end;$$;

create or replace function public.fin_atualiza_saldo()
returns trigger language plpgsql as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    perform public.fin_recalc_saldo_conta(new.conta_id);
    if tg_op = 'UPDATE' and old.conta_id <> new.conta_id then
      perform public.fin_recalc_saldo_conta(old.conta_id);
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.fin_recalc_saldo_conta(old.conta_id);
  end if;
  return null;
end;$$;

drop trigger if exists fin_lanc_saldo on public.fin_lancamentos;
create trigger fin_lanc_saldo after insert or update or delete on public.fin_lancamentos
  for each row execute function public.fin_atualiza_saldo();

-- ─── 9) Storage bucket privado para comprovantes ────────────────────────
insert into storage.buckets (id, name, public)
values ('fin-comprovantes', 'fin-comprovantes', false)
on conflict (id) do nothing;

drop policy if exists "fin-comprovantes-select" on storage.objects;
drop policy if exists "fin-comprovantes-insert" on storage.objects;
drop policy if exists "fin-comprovantes-update" on storage.objects;
drop policy if exists "fin-comprovantes-delete" on storage.objects;

create policy "fin-comprovantes-select" on storage.objects for select
  using (bucket_id = 'fin-comprovantes' and auth.role() = 'authenticated');
create policy "fin-comprovantes-insert" on storage.objects for insert
  with check (bucket_id = 'fin-comprovantes' and auth.role() = 'authenticated');
create policy "fin-comprovantes-update" on storage.objects for update
  using (bucket_id = 'fin-comprovantes' and auth.role() = 'authenticated');
create policy "fin-comprovantes-delete" on storage.objects for delete
  using (bucket_id = 'fin-comprovantes' and auth.role() = 'authenticated');

-- ─── 10) RLS ────────────────────────────────────────────────────────────
alter table public.fin_contas        enable row level security;
alter table public.fin_categorias    enable row level security;
alter table public.fin_centros_custo enable row level security;
alter table public.fin_fornecedores  enable row level security;
alter table public.fin_lancamentos   enable row level security;

drop policy if exists "fin_contas_all"     on public.fin_contas;
drop policy if exists "fin_categorias_all" on public.fin_categorias;
drop policy if exists "fin_cc_all"         on public.fin_centros_custo;
drop policy if exists "fin_forn_all"       on public.fin_fornecedores;
drop policy if exists "fin_lanc_all"       on public.fin_lancamentos;

create policy "fin_contas_all" on public.fin_contas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_categorias_all" on public.fin_categorias for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_cc_all" on public.fin_centros_custo for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_forn_all" on public.fin_fornecedores for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_lanc_all" on public.fin_lancamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── 11) SEED — 5 contas iniciais da QIBRJ ──────────────────────────────
insert into public.fin_contas (nome, tipo, cor, ordem) values
  ('Caixinha Administrativo', 'caixa',     '#10b981', 1),
  ('Caixa de Envelopes',      'envelope',  '#f59e0b', 2),
  ('Bradesco 111342',         'banco',     '#cc0000', 3),
  ('Cartão de Crédito',       'cartao',    '#6366f1', 4),
  ('Caixa de Aplicação',      'aplicacao', '#0ea5e9', 5)
on conflict do nothing;

-- ─── 12) SEED — Categorias básicas (plano de contas) ────────────────────
-- ENTRADAS
insert into public.fin_categorias (nome, tipo, sistema, cor, ordem) values
  ('Dízimos',             'entrada', true, '#10b981', 1),
  ('Ofertas',             'entrada', true, '#34d399', 2),
  ('Ofertas Especiais',   'entrada', false, '#6ee7b7', 3),
  ('Campanhas',           'entrada', true, '#facc15', 4),
  ('Doações',             'entrada', false, '#a3e635', 5),
  ('Eventos',             'entrada', false, '#22d3ee', 6),
  ('Vendas (livraria)',   'entrada', false, '#fb923c', 7),
  ('Rendimento aplicação','entrada', false, '#0ea5e9', 8),
  ('Outras receitas',     'entrada', false, '#888', 99)
on conflict do nothing;

-- SAIDAS
insert into public.fin_categorias (nome, tipo, sistema, cor, ordem) values
  ('Aluguel',                   'saida', true,  '#dc2626', 1),
  ('Energia elétrica',          'saida', true,  '#f97316', 2),
  ('Água e esgoto',             'saida', true,  '#0ea5e9', 3),
  ('Internet/telefone',         'saida', true,  '#6366f1', 4),
  ('Prebenda pastoral',         'saida', true,  '#7c3aed', 5),
  ('Salários CLT',              'saida', true,  '#a855f7', 6),
  ('RPA (autônomos)',           'saida', true,  '#c026d3', 7),
  ('MEI (prestadores)',         'saida', true,  '#db2777', 8),
  ('INSS / FGTS / Encargos',    'saida', true,  '#be185d', 9),
  ('Vale Alimentação',          'saida', false, '#fb923c', 10),
  ('Vale Transporte',           'saida', false, '#fbbf24', 11),
  ('Tarifas bancárias',         'saida', true,  '#737373', 12),
  ('Material de limpeza',       'saida', false, '#84cc16', 20),
  ('Material de escritório',    'saida', false, '#65a30d', 21),
  ('Material de som',           'saida', false, '#16a34a', 22),
  ('Manutenção predial',        'saida', false, '#15803d', 23),
  ('Manutenção equipamentos',   'saida', false, '#166534', 24),
  ('Materiais EBD',             'saida', false, '#eab308', 30),
  ('Eventos / Almoço',          'saida', false, '#f59e0b', 31),
  ('Transporte/combustível',    'saida', false, '#d97706', 32),
  ('Diaconia / assistência',    'saida', true,  '#ec4899', 40),
  ('Missões',                   'saida', true,  '#f43f5e', 41),
  ('Construção / reforma',      'saida', false, '#9f1239', 50),
  ('Impostos / taxas',          'saida', false, '#3f3f46', 60),
  ('Outras despesas',           'saida', false, '#888', 99)
on conflict do nothing;

-- ─── 13) SEED — Centro de Custo "Geral" ─────────────────────────────────
insert into public.fin_centros_custo (nome, vinculo_tipo, ativo) values
  ('Geral / Operacional', 'geral', true)
on conflict do nothing;

-- ─── 14) View: resumo financeiro do mês ─────────────────────────────────
create or replace view public.vw_fin_resumo_mes as
with mes_atual as (
  select date_trunc('month', current_date)::date as ini,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date as fim
)
select
  (select coalesce(sum(saldo_atual), 0) from public.fin_contas where ativo) as saldo_total,
  (select coalesce(sum(valor), 0) from public.fin_lancamentos l, mes_atual m
   where l.tipo = 'entrada' and l.data between m.ini and m.fim
     and l.status in ('realizado','conciliado')) as entradas_mes,
  (select coalesce(sum(valor), 0) from public.fin_lancamentos l, mes_atual m
   where l.tipo = 'saida' and l.data between m.ini and m.fim
     and l.status in ('realizado','conciliado')) as saidas_mes,
  (select coalesce(sum(valor), 0) from public.fin_lancamentos l, mes_atual m
   where l.tipo = 'saida' and l.status = 'previsto'
     and l.data between current_date and m.fim) as previstas_mes;

comment on table public.fin_contas       is 'Contas financeiras da igreja (caixa, banco, cartão, etc.)';
comment on table public.fin_categorias   is 'Plano de contas: entradas e saídas';
comment on table public.fin_centros_custo is 'Centros de custo, podem apontar para ministério/área/EBD/PGM/campanha';
comment on table public.fin_lancamentos  is 'Movimentações financeiras';
