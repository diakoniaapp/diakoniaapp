-- ═══════════════════════════════════════════════════════════════════════════
-- PGM — FASE C — Oração + Multiplicação + Geografia + Discipulado
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Pedidos de oração ──────────────────────────────────────────────────
do $$ begin
  create type pgm_oracao_visibilidade as enum ('privada', 'lideranca', 'grupo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pgm_oracao_status as enum ('ativo', 'respondido', 'arquivado');
exception when duplicate_object then null; end $$;

create table if not exists public.pgm_pedidos_oracao (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.pgm_grupos(id) on delete cascade,
  pessoa_id     uuid references public.membros(id) on delete set null,
  -- pessoa_id pode ser null se for "anônimo" ou de um visitante avulso
  nome_avulso   text,
  texto         text not null,
  visibilidade  pgm_oracao_visibilidade not null default 'lideranca',
  status        pgm_oracao_status not null default 'ativo',
  respondido_em date,
  resposta      text,
  criado_por    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pgm_oracao_grupo  on public.pgm_pedidos_oracao(grupo_id);
create index if not exists idx_pgm_oracao_pessoa on public.pgm_pedidos_oracao(pessoa_id);
create index if not exists idx_pgm_oracao_status on public.pgm_pedidos_oracao(status);

drop trigger if exists pgm_oracao_touch on public.pgm_pedidos_oracao;
create trigger pgm_oracao_touch
  before update on public.pgm_pedidos_oracao
  for each row execute function public.touch_pgm_grupos();

-- ─── 2) Marcos de discipulado ─────────────────────────────────────────────
-- Tabela leve: 1 linha por pessoa com flags de marcos
create table if not exists public.pgm_marcos_discipulado (
  pessoa_id        uuid primary key references public.membros(id) on delete cascade,
  batizado         boolean not null default false,
  data_batismo     date,
  classe_descobrindo boolean not null default false,
  classe_novos_crentes boolean not null default false,
  tem_mentor       boolean not null default false,
  mentor_id        uuid references public.membros(id) on delete set null,
  observacao       text,
  updated_at       timestamptz not null default now()
);

drop trigger if exists pgm_marcos_touch on public.pgm_marcos_discipulado;
create trigger pgm_marcos_touch
  before update on public.pgm_marcos_discipulado
  for each row execute function public.touch_pgm_grupos();

-- ─── 3) RPC: multiplicar grupo (gera filho com membros selecionados) ──────
create or replace function public.pgm_multiplicar_grupo(
  p_pai_id uuid,
  p_nome_filho text,
  p_lider_id uuid,
  p_pessoas_ids uuid[] default '{}'::uuid[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_filho_id uuid;
  v_pessoa_id uuid;
begin
  insert into public.pgm_grupos(nome, lider_id, grupo_pai_id, multiplicado_em)
  values (p_nome_filho, p_lider_id, p_pai_id, current_date)
  returning id into v_filho_id;

  -- Inclui o líder do filho como participante "lider"
  insert into public.pgm_membros(grupo_id, pessoa_id, papel, principal)
  values (v_filho_id, p_lider_id, 'lider', true)
  on conflict (grupo_id, pessoa_id) do update set papel = 'lider';

  -- Transfere as pessoas escolhidas (saem do pai, entram no filho)
  if p_pessoas_ids is not null then
    foreach v_pessoa_id in array p_pessoas_ids loop
      update public.pgm_membros
         set ativo = false, data_saida = current_date
       where grupo_id = p_pai_id and pessoa_id = v_pessoa_id;
      insert into public.pgm_membros(grupo_id, pessoa_id, papel, principal)
      values (v_filho_id, v_pessoa_id, 'participante', true)
      on conflict (grupo_id, pessoa_id) do update set ativo = true, principal = true;
    end loop;
  end if;

  return v_filho_id;
end;$$;

-- ─── 4) RPC: sugerir PGM por bairro ────────────────────────────────────────
drop function if exists public.pgm_sugerir_por_bairro(text);
create function public.pgm_sugerir_por_bairro(p_bairro text)
returns table (
  id uuid, nome text, dia_semana smallint, horario time,
  bairro text, qtd_membros int, lider_nome text
)
language sql stable security definer set search_path = public as $$
  with res as (
    select g.id, g.nome, g.dia_semana, g.horario, g.bairro,
           (select count(*) from public.pgm_membros pm
              where pm.grupo_id = g.id and pm.ativo)::int as qm,
           lider.nome_completo as ln
    from public.pgm_grupos g
    left join public.membros lider on lider.id = g.lider_id
    where g.ativo
      and lower(coalesce(g.bairro, '')) = lower(coalesce(p_bairro, ''))
  )
  select res.id, res.nome, res.dia_semana, res.horario, res.bairro,
         res.qm, res.ln
  from res
  order by res.qm desc;
$$;

-- ─── 5) RPC: alerta de ausência (≥ 3 reuniões consecutivas) ────────────────
create or replace function public.pgm_alertas_ausencia(p_grupo_id uuid default null)
returns table (
  pessoa_id uuid, nome text, grupo_id uuid, grupo_nome text,
  faltas_seguidas int, ultima_presenca date
)
language sql stable security definer set search_path = public as $$
  with ultimas as (
    select r.id as reuniao_id, r.grupo_id, r.data
    from public.pgm_reunioes r
    where r.data >= current_date - interval '60 days'
      and (p_grupo_id is null or r.grupo_id = p_grupo_id)
  ),
  joined as (
    select m.pessoa_id, m.grupo_id,
           u.reuniao_id, u.data,
           coalesce(p.presente, false) as presente
    from public.pgm_membros m
    join ultimas u on u.grupo_id = m.grupo_id
    left join public.pgm_presencas p on p.reuniao_id = u.reuniao_id and p.pessoa_id = m.pessoa_id
    where m.ativo
  ),
  ranks as (
    select pessoa_id, grupo_id, data, presente,
           row_number() over (partition by pessoa_id, grupo_id order by data desc) as rn
    from joined
  ),
  recentes as (
    select pessoa_id, grupo_id,
           bool_or(presente) filter (where rn <= 3) as algum_presente_recente,
           max(data) filter (where presente) as ultima_pres,
           count(*) filter (where rn <= 3) as ult3_count
    from ranks
    group by pessoa_id, grupo_id
  )
  select r.pessoa_id, mem.nome_completo, r.grupo_id, g.nome,
         3::int as faltas_seguidas, r.ultima_pres
  from recentes r
  join public.membros mem on mem.id = r.pessoa_id
  join public.pgm_grupos g on g.id = r.grupo_id
  where r.ult3_count >= 3
    and r.algum_presente_recente = false;
$$;

-- ─── 6) RLS ────────────────────────────────────────────────────────────────
alter table public.pgm_pedidos_oracao     enable row level security;
alter table public.pgm_marcos_discipulado enable row level security;

drop policy if exists "pgm_oracao_all" on public.pgm_pedidos_oracao;
drop policy if exists "pgm_marcos_all" on public.pgm_marcos_discipulado;

create policy "pgm_oracao_all" on public.pgm_pedidos_oracao for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "pgm_marcos_all" on public.pgm_marcos_discipulado for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
