-- ═══════════════════════════════════════════════════════════════════════════
-- PGM — Pequenos Grupos Multiplicadores — FASE A
-- Schema: grupos + membros + trigger principal único + view com contagem
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Tabela: grupos PGM ─────────────────────────────────────────────────
create table if not exists public.pgm_grupos (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,

  -- Quando e onde se reúne
  dia_semana      smallint check (dia_semana between 0 and 6), -- 0=domingo
  horario         time,
  endereco        text,
  bairro          text,
  cidade          text,

  -- Liderança
  lider_id        uuid references public.membros(id) on delete set null,
  co_lider_id     uuid references public.membros(id) on delete set null,
  anfitriao_id    uuid references public.membros(id) on delete set null,

  -- Multiplicação (Fase C ativa o badge)
  grupo_pai_id    uuid references public.pgm_grupos(id) on delete set null,
  multiplicado_em date,

  -- WhatsApp link (chat.whatsapp.com/...)
  whatsapp_link   text,

  -- Status
  ativo           boolean not null default true,
  data_inicio     date default current_date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  igreja_id       uuid default '00000000-0000-0000-0000-000000000001'::uuid
);

create index if not exists idx_pgm_grupos_ativo on public.pgm_grupos(ativo);
create index if not exists idx_pgm_grupos_lider on public.pgm_grupos(lider_id);
create index if not exists idx_pgm_grupos_pai   on public.pgm_grupos(grupo_pai_id);
create index if not exists idx_pgm_grupos_bairro on public.pgm_grupos(lower(bairro));

-- ─── 2) Tabela: vínculos pessoa↔grupo ──────────────────────────────────────
do $$ begin
  create type pgm_papel as enum ('participante', 'lider', 'colider', 'anfitriao');
exception when duplicate_object then null; end $$;

create table if not exists public.pgm_membros (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.pgm_grupos(id) on delete cascade,
  pessoa_id     uuid not null references public.membros(id)    on delete cascade,
  papel         pgm_papel not null default 'participante',
  principal     boolean not null default false, -- grupo principal da pessoa
  data_entrada  date not null default current_date,
  data_saida    date,
  ativo         boolean not null default true,
  observacao    text,
  created_at    timestamptz not null default now(),

  unique (grupo_id, pessoa_id)
);

create index if not exists idx_pgm_membros_grupo  on public.pgm_membros(grupo_id);
create index if not exists idx_pgm_membros_pessoa on public.pgm_membros(pessoa_id);

-- ─── 3) Trigger: só 1 grupo "principal" por pessoa ─────────────────────────
create or replace function public.pgm_garante_principal_unico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.principal then
    update public.pgm_membros
       set principal = false
     where pessoa_id = new.pessoa_id
       and id <> new.id;
  end if;
  return new;
end;$$;

drop trigger if exists pgm_principal_unico on public.pgm_membros;
create trigger pgm_principal_unico
  after insert or update of principal on public.pgm_membros
  for each row execute function public.pgm_garante_principal_unico();

-- ─── 4) Trigger: updated_at automático ──────────────────────────────────────
create or replace function public.touch_pgm_grupos()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists pgm_grupos_touch on public.pgm_grupos;
create trigger pgm_grupos_touch
  before update on public.pgm_grupos
  for each row execute function public.touch_pgm_grupos();

-- ─── 5) View: grupos com contagem de membros ativos ────────────────────────
create or replace view public.vw_pgm_grupos_resumo as
select
  g.*,
  (select count(*) from public.pgm_membros m
    where m.grupo_id = g.id and m.ativo) as qtd_membros,
  (select count(*) from public.pgm_grupos f
    where f.grupo_pai_id = g.id and f.ativo) as qtd_filhos,
  m_lider.nome_completo  as lider_nome,
  m_colider.nome_completo as co_lider_nome,
  m_anfitri.nome_completo as anfitriao_nome
from public.pgm_grupos g
left join public.membros m_lider   on m_lider.id  = g.lider_id
left join public.membros m_colider on m_colider.id = g.co_lider_id
left join public.membros m_anfitri on m_anfitri.id = g.anfitriao_id;

-- ─── 6) RLS — autenticado pode ler/escrever (refinar quando entrar multi-tenant) ─
alter table public.pgm_grupos  enable row level security;
alter table public.pgm_membros enable row level security;

drop policy if exists "pgm_grupos_all"  on public.pgm_grupos;
drop policy if exists "pgm_membros_all" on public.pgm_membros;

create policy "pgm_grupos_all"  on public.pgm_grupos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "pgm_membros_all" on public.pgm_membros
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.pgm_grupos  is 'PGM — Pequenos Grupos Multiplicadores';
comment on table public.pgm_membros is 'Vinculo pessoa↔PGM (multi-grupo permitido, 1 principal)';
