-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA — GOVERNANÇA: Reuniões + Pautas + Assembleias + Votos
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Enums ──────────────────────────────────────────────────────────
do $$ begin
  create type gov_reuniao_tipo as enum ('diretoria','lideranca','conselho','extraordinaria','outra');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gov_reuniao_status as enum ('agendada','em_andamento','concluida','cancelada','adiada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gov_pauta_classificacao as enum ('informativa','deliberativa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gov_pauta_status as enum ('rascunho','aprovada_em_pauta','para_assembleia','aprovada_assembleia','rejeitada','adiada','executada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gov_pauta_vinculo as enum ('solicitacao_membresia','compra','financeiro','administrativo','espiritual','outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gov_voto as enum ('sim','nao','abstencao','impedimento');
exception when duplicate_object then null; end $$;

-- ─── 2) Reuniões ──────────────────────────────────────────────────────
create table if not exists public.gov_reunioes (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  tipo            gov_reuniao_tipo not null default 'diretoria',
  status          gov_reuniao_status not null default 'agendada',

  data_reuniao    date not null,
  horario         time,
  local           text,
  online          boolean not null default false,
  link_online     text,

  presidente_id   uuid references public.membros(id) on delete set null,
  presidente_nome text,
  secretaria_id   uuid references public.membros(id) on delete set null,
  secretaria_nome text,

  ata_url         text,
  ata_versao      int not null default 0,

  -- Origem (se foi gerada por recorrencia)
  recorrencia_id  uuid,
  proxima_sugerida date,

  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_gov_reun_status on public.gov_reunioes(status);
create index if not exists idx_gov_reun_data   on public.gov_reunioes(data_reuniao desc);

create or replace function public.touch_gov()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists gov_reun_touch on public.gov_reunioes;
create trigger gov_reun_touch before update on public.gov_reunioes
  for each row execute function public.touch_gov();

-- ─── 3) Participantes ─────────────────────────────────────────────────
create table if not exists public.gov_participantes (
  id              uuid primary key default gen_random_uuid(),
  reuniao_id      uuid not null references public.gov_reunioes(id) on delete cascade,
  pessoa_id       uuid references public.membros(id) on delete set null,
  pessoa_nome     text not null,
  papel           text default 'membro',         -- 'diretoria','lider_min','lider_area','convidado'
  convocado       boolean not null default true,
  presente        boolean not null default false,
  justificativa   text,
  created_at      timestamptz not null default now(),
  unique (reuniao_id, pessoa_id)
);
create index if not exists idx_gov_part_reun on public.gov_participantes(reuniao_id);

-- ─── 4) Pautas ────────────────────────────────────────────────────────
create table if not exists public.gov_pautas (
  id              uuid primary key default gen_random_uuid(),
  reuniao_id      uuid references public.gov_reunioes(id) on delete cascade,
  assembleia_id   uuid, -- preenchido quando vai pra assembleia
  ordem           int default 0,
  titulo          text not null,
  descricao       text,
  classificacao   gov_pauta_classificacao not null default 'informativa',
  status          gov_pauta_status not null default 'rascunho',

  -- Vínculo com outras entidades do sistema
  vinculo_tipo    gov_pauta_vinculo,
  vinculo_id      uuid,
  vinculo_nome    text, -- snapshot

  proposto_por_id uuid references public.membros(id) on delete set null,
  proposto_por    text,

  -- Resultado
  decisao         text,
  votos_sim       int default 0,
  votos_nao       int default 0,
  votos_abstencao int default 0,
  votos_impedimento int default 0,
  data_decisao    date,
  observacao_decisao text,

  -- Execução
  executada       boolean not null default false,
  data_execucao   timestamptz,
  observacao_execucao text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_gov_pauta_reun on public.gov_pautas(reuniao_id);
create index if not exists idx_gov_pauta_asse on public.gov_pautas(assembleia_id);
create index if not exists idx_gov_pauta_stat on public.gov_pautas(status);
create index if not exists idx_gov_pauta_vinc on public.gov_pautas(vinculo_tipo, vinculo_id);

drop trigger if exists gov_pauta_touch on public.gov_pautas;
create trigger gov_pauta_touch before update on public.gov_pautas
  for each row execute function public.touch_gov();

-- ─── 5) Assembleias ──────────────────────────────────────────────────
create table if not exists public.gov_assembleias (
  id              uuid primary key default gen_random_uuid(),
  reuniao_origem_id uuid references public.gov_reunioes(id) on delete set null,
  titulo          text not null,
  data_assembleia date not null,
  horario         time,
  local           text,

  status          gov_reuniao_status not null default 'agendada',

  -- Quórum
  quorum_minimo_pct numeric(5,2) default 33.3,   -- % do estatuto
  total_membros_aptos int,
  total_presentes int default 0,
  quorum_atingido boolean default false,

  presidente_id   uuid references public.membros(id) on delete set null,
  presidente_nome text,
  secretaria_id   uuid references public.membros(id) on delete set null,
  secretaria_nome text,

  ata_url         text,
  ata_versao      int not null default 0,
  convocacao_enviada boolean not null default false,

  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_gov_asse_data on public.gov_assembleias(data_assembleia desc);
create index if not exists idx_gov_asse_status on public.gov_assembleias(status);

drop trigger if exists gov_asse_touch on public.gov_assembleias;
create trigger gov_asse_touch before update on public.gov_assembleias
  for each row execute function public.touch_gov();

-- ─── 6) Presentes na assembleia (controle de quórum) ─────────────────
create table if not exists public.gov_assembleia_presentes (
  id              uuid primary key default gen_random_uuid(),
  assembleia_id   uuid not null references public.gov_assembleias(id) on delete cascade,
  pessoa_id       uuid not null references public.membros(id) on delete cascade,
  pessoa_nome     text not null,
  presente        boolean not null default false,
  hora_chegada    time,
  observacao      text,
  created_at      timestamptz not null default now(),
  unique (assembleia_id, pessoa_id)
);
create index if not exists idx_gov_pres_asse on public.gov_assembleia_presentes(assembleia_id);

-- ─── 7) Votos individuais (opcional - votação aberta vs secreta) ─────
create table if not exists public.gov_votos (
  id              uuid primary key default gen_random_uuid(),
  pauta_id        uuid not null references public.gov_pautas(id) on delete cascade,
  pessoa_id       uuid references public.membros(id) on delete set null,
  voto            gov_voto not null,
  registrado_em   timestamptz not null default now(),
  unique (pauta_id, pessoa_id)
);
create index if not exists idx_gov_voto_pauta on public.gov_votos(pauta_id);

-- ─── 8) Histórico (audit log) ─────────────────────────────────────────
create table if not exists public.gov_historico (
  id              uuid primary key default gen_random_uuid(),
  entidade_tipo   text not null,           -- 'reuniao','pauta','assembleia'
  entidade_id     uuid not null,
  acao            text not null,
  descricao       text,
  user_id         uuid references public.profiles(id) on delete set null,
  user_nome       text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_gov_hist_ent on public.gov_historico(entidade_tipo, entidade_id);

-- ─── 9) Trigger: histórico automático ─────────────────────────────────
create or replace function public.gov_registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user_nome text;
  v_entidade text;
begin
  v_entidade := tg_table_name;
  if auth.uid() is not null then
    select coalesce(nome, email) into v_user_nome from public.profiles where id = auth.uid();
  end if;

  if tg_op = 'INSERT' then
    insert into public.gov_historico(entidade_tipo, entidade_id, acao, descricao, user_id, user_nome)
    values (
      case v_entidade
        when 'gov_reunioes' then 'reuniao'
        when 'gov_pautas' then 'pauta'
        when 'gov_assembleias' then 'assembleia'
        else v_entidade
      end,
      new.id, 'criada',
      case v_entidade
        when 'gov_reunioes' then 'Reunião criada: ' || coalesce(new.titulo, '?')
        when 'gov_pautas' then 'Pauta criada: ' || coalesce(new.titulo, '?')
        when 'gov_assembleias' then 'Assembleia criada: ' || coalesce(new.titulo, '?')
        else 'Criada'
      end,
      auth.uid(), v_user_nome
    );
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      insert into public.gov_historico(entidade_tipo, entidade_id, acao, descricao, user_id, user_nome)
      values (
        case v_entidade
          when 'gov_reunioes' then 'reuniao'
          when 'gov_pautas' then 'pauta'
          when 'gov_assembleias' then 'assembleia'
          else v_entidade
        end,
        new.id, 'status_alterado',
        'Status: ' || old.status::text || ' → ' || new.status::text,
        auth.uid(), v_user_nome
      );
    end if;
  end if;
  return null;
end;$$;

drop trigger if exists gov_reun_hist on public.gov_reunioes;
create trigger gov_reun_hist after insert or update on public.gov_reunioes
  for each row execute function public.gov_registrar_historico();

drop trigger if exists gov_pauta_hist on public.gov_pautas;
create trigger gov_pauta_hist after insert or update on public.gov_pautas
  for each row execute function public.gov_registrar_historico();

drop trigger if exists gov_asse_hist on public.gov_assembleias;
create trigger gov_asse_hist after insert or update on public.gov_assembleias
  for each row execute function public.gov_registrar_historico();

-- ─── 10) RPC: sugerir participantes automaticamente ──────────────────
create or replace function public.gov_sugerir_participantes(p_reuniao_id uuid)
returns table (pessoa_id uuid, pessoa_nome text, papel text)
language sql stable security definer set search_path = public as $$
  -- Líderes de ministérios
  select distinct m.id, m.nome_completo, 'lider_min'
  from public.ministerios mi
  join public.membros m on m.id = mi.lider_id
  where mi.ativo and m.status = 'ativo'

  union

  -- Líderes de áreas
  select distinct m.id, m.nome_completo, 'lider_area'
  from public.areas a
  join public.membros m on m.id = a.lider_id
  where a.ativo and m.status = 'ativo'

  union

  -- Pastor (role)
  select distinct m.id, m.nome_completo, 'diretoria'
  from public.membros m
  join public.profiles p on p.pessoa_id = m.id
  join public.user_roles ur on ur.user_id = p.id
  where ur.role::text in ('pastor','diakonia') and m.status = 'ativo';
$$;

-- ─── 11) RPC: sugerir pautas (a partir de pendências) ─────────────────
create or replace function public.gov_sugerir_pautas()
returns table (
  vinculo_tipo gov_pauta_vinculo,
  vinculo_id uuid,
  titulo text,
  descricao text,
  classificacao gov_pauta_classificacao
)
language sql stable security definer set search_path = public as $$
  -- 1) Solicitações de membresia esperando assembleia
  select 'solicitacao_membresia'::gov_pauta_vinculo, s.id,
         coalesce(s.pessoa_nome, '?') || ' — ' || replace(s.tipo::text, '_', ' '),
         coalesce(s.motivo, '(sem motivo informado)') ||
           case when s.igreja_destino is not null then ' · Destino: ' || s.igreja_destino else '' end,
         'deliberativa'::gov_pauta_classificacao
  from public.solicitacoes_membresia s
  where s.status in ('aguardando_documento','pronta_assembleia');
$$;

-- ─── 12) RLS ──────────────────────────────────────────────────────────
alter table public.gov_reunioes              enable row level security;
alter table public.gov_participantes         enable row level security;
alter table public.gov_pautas                enable row level security;
alter table public.gov_assembleias           enable row level security;
alter table public.gov_assembleia_presentes  enable row level security;
alter table public.gov_votos                 enable row level security;
alter table public.gov_historico             enable row level security;

drop policy if exists "gov_reun_all"   on public.gov_reunioes;
drop policy if exists "gov_part_all"   on public.gov_participantes;
drop policy if exists "gov_pauta_all"  on public.gov_pautas;
drop policy if exists "gov_asse_all"   on public.gov_assembleias;
drop policy if exists "gov_pres_all"   on public.gov_assembleia_presentes;
drop policy if exists "gov_voto_all"   on public.gov_votos;
drop policy if exists "gov_hist_all"   on public.gov_historico;

create policy "gov_reun_all"  on public.gov_reunioes for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_part_all"  on public.gov_participantes for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_pauta_all" on public.gov_pautas for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_asse_all"  on public.gov_assembleias for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_pres_all"  on public.gov_assembleia_presentes for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_voto_all"  on public.gov_votos for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "gov_hist_all"  on public.gov_historico for all using (auth.role()='authenticated') with check (auth.role()='authenticated');

comment on table public.gov_reunioes is 'Reuniões de diretoria, liderança, conselho';
comment on table public.gov_pautas is 'Itens de pauta - informativos ou deliberativos (vao pra assembleia)';
comment on table public.gov_assembleias is 'Assembleias de membros - controle de quorum e votacao';
