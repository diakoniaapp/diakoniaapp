-- ═══════════════════════════════════════════════════════════════════════════
-- PGM — FASE B — Reuniões + Presença + Visitas + Foto
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pgm_reunioes (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.pgm_grupos(id) on delete cascade,
  data          date not null,
  tema          text,
  texto_base    text,
  observacoes   text,
  local_alterado text,
  foto_url      text,
  fechada       boolean not null default false,
  registrada_por uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (grupo_id, data)
);
create index if not exists idx_pgm_reunioes_grupo on public.pgm_reunioes(grupo_id);
create index if not exists idx_pgm_reunioes_data  on public.pgm_reunioes(data desc);

drop trigger if exists pgm_reunioes_touch on public.pgm_reunioes;
create trigger pgm_reunioes_touch
  before update on public.pgm_reunioes
  for each row execute function public.touch_pgm_grupos();

create table if not exists public.pgm_presencas (
  id          uuid primary key default gen_random_uuid(),
  reuniao_id  uuid not null references public.pgm_reunioes(id) on delete cascade,
  pessoa_id   uuid not null references public.membros(id)      on delete cascade,
  presente    boolean not null default false,
  observacao  text,
  created_at  timestamptz not null default now(),
  unique (reuniao_id, pessoa_id)
);
create index if not exists idx_pgm_presencas_reuniao on public.pgm_presencas(reuniao_id);
create index if not exists idx_pgm_presencas_pessoa  on public.pgm_presencas(pessoa_id);

create table if not exists public.pgm_visitas (
  id            uuid primary key default gen_random_uuid(),
  reuniao_id    uuid not null references public.pgm_reunioes(id) on delete cascade,
  nome          text not null,
  telefone      text,
  bairro        text,
  convidado_por uuid references public.membros(id) on delete set null,
  observacao    text,
  virou_pessoa_id uuid references public.membros(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pgm_visitas_reuniao on public.pgm_visitas(reuniao_id);

-- Storage bucket privado
insert into storage.buckets (id, name, public)
values ('pgm-reunioes', 'pgm-reunioes', false)
on conflict (id) do nothing;

drop policy if exists "pgm-reunioes-select" on storage.objects;
drop policy if exists "pgm-reunioes-insert" on storage.objects;
drop policy if exists "pgm-reunioes-update" on storage.objects;
drop policy if exists "pgm-reunioes-delete" on storage.objects;

create policy "pgm-reunioes-select" on storage.objects for select
  using (bucket_id = 'pgm-reunioes' and auth.role() = 'authenticated');
create policy "pgm-reunioes-insert" on storage.objects for insert
  with check (bucket_id = 'pgm-reunioes' and auth.role() = 'authenticated');
create policy "pgm-reunioes-update" on storage.objects for update
  using (bucket_id = 'pgm-reunioes' and auth.role() = 'authenticated');
create policy "pgm-reunioes-delete" on storage.objects for delete
  using (bucket_id = 'pgm-reunioes' and auth.role() = 'authenticated');

-- RPC: cria reunião e popula presenças com membros ativos
create or replace function public.pgm_iniciar_reuniao(
  p_grupo_id uuid, p_data date, p_tema text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reuniao_id uuid;
begin
  insert into public.pgm_reunioes(grupo_id, data, tema, registrada_por)
  values (p_grupo_id, p_data, p_tema, auth.uid())
  on conflict (grupo_id, data) do update
    set tema = coalesce(excluded.tema, public.pgm_reunioes.tema)
  returning id into v_reuniao_id;

  insert into public.pgm_presencas(reuniao_id, pessoa_id, presente)
  select v_reuniao_id, m.pessoa_id, false
  from public.pgm_membros m
  where m.grupo_id = p_grupo_id and m.ativo
  on conflict (reuniao_id, pessoa_id) do nothing;

  return v_reuniao_id;
end;$$;

-- RPC: resumo de presença das últimas N reuniões
create or replace function public.pgm_resumo_presenca(
  p_grupo_id uuid, p_n int default 4
) returns table (
  reuniao_id uuid, data date, tema text,
  total int, presentes int, percentual numeric
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.data, r.tema,
    count(p.id)::int,
    count(*) filter (where p.presente)::int,
    case when count(p.id) = 0 then 0
         else round(100.0 * count(*) filter (where p.presente) / count(p.id), 0)
    end
  from public.pgm_reunioes r
  left join public.pgm_presencas p on p.reuniao_id = r.id
  where r.grupo_id = p_grupo_id
  group by r.id
  order by r.data desc
  limit p_n;
$$;

-- RLS
alter table public.pgm_reunioes  enable row level security;
alter table public.pgm_presencas enable row level security;
alter table public.pgm_visitas   enable row level security;

drop policy if exists "pgm_reunioes_all"  on public.pgm_reunioes;
drop policy if exists "pgm_presencas_all" on public.pgm_presencas;
drop policy if exists "pgm_visitas_all"   on public.pgm_visitas;

create policy "pgm_reunioes_all"  on public.pgm_reunioes  for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "pgm_presencas_all" on public.pgm_presencas for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "pgm_visitas_all"   on public.pgm_visitas   for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
