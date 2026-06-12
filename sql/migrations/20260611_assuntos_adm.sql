-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA — Sistema de Assuntos Administrativos
-- Reuniões semanais Administração + Pastoral
-- Cada assunto vive entre reuniões até ser concluído
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type assunto_prioridade as enum ('alta','media','baixa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assunto_status as enum ('aberto','em_andamento','concluido','cancelado','aguardando_terceiro');
exception when duplicate_object then null; end $$;

-- ─── 1) Assuntos (entidade VIVA, transita entre reuniões) ──────────────
create table if not exists public.assuntos (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  descricao       text,
  status          assunto_status not null default 'aberto',
  prioridade      assunto_prioridade not null default 'media',

  responsavel_id  uuid references public.membros(id) on delete set null,
  responsavel_nome text,

  prazo           date,
  data_criacao    date not null default current_date,
  data_conclusao  date,

  origem          text not null default 'manual',  -- manual/sistema/reuniao
  reuniao_origem_id uuid references public.gov_reunioes(id) on delete set null,

  -- Vínculo polimórfico com outras entidades (financeiro, membresia, etc.)
  vinculo_tipo    text,
  vinculo_id      uuid,
  vinculo_descricao text,

  observacao_conclusao text,

  -- Metadata
  vezes_discutido int not null default 0,        -- contador
  ultima_atualizacao_em timestamptz,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_assuntos_status      on public.assuntos(status);
create index if not exists idx_assuntos_prioridade  on public.assuntos(prioridade);
create index if not exists idx_assuntos_resp        on public.assuntos(responsavel_id);
create index if not exists idx_assuntos_prazo       on public.assuntos(prazo);

create or replace function public.touch_assuntos()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists assuntos_touch on public.assuntos;
create trigger assuntos_touch before update on public.assuntos
  for each row execute function public.touch_assuntos();

-- ─── 2) Histórico (audit log automático) ──────────────────────────────
create table if not exists public.assuntos_historico (
  id            uuid primary key default gen_random_uuid(),
  assunto_id    uuid not null references public.assuntos(id) on delete cascade,
  acao          text not null,
  descricao     text,
  user_id       uuid references public.profiles(id) on delete set null,
  user_nome     text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_assuntos_hist on public.assuntos_historico(assunto_id, created_at desc);

create or replace function public.registrar_historico_assunto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user_nome text;
  v_acao text;
  v_desc text;
begin
  if auth.uid() is not null then
    select coalesce(nome, email) into v_user_nome from public.profiles where id = auth.uid();
  end if;

  if tg_op = 'INSERT' then
    v_acao := 'criado'; v_desc := 'Assunto criado: ' || new.titulo;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      v_acao := 'status_alterado'; v_desc := 'Status: ' || old.status::text || ' → ' || new.status::text;
      if new.status = 'concluido' then
        update public.assuntos set data_conclusao = coalesce(data_conclusao, current_date) where id = new.id;
      end if;
    elsif old.prioridade is distinct from new.prioridade then
      v_acao := 'prioridade_alterada'; v_desc := 'Prioridade: ' || old.prioridade::text || ' → ' || new.prioridade::text;
    elsif old.responsavel_id is distinct from new.responsavel_id then
      v_acao := 'responsavel_alterado';
      v_desc := 'Responsável: ' || coalesce(old.responsavel_nome, '(ninguém)') || ' → ' || coalesce(new.responsavel_nome, '(ninguém)');
    elsif old.prazo is distinct from new.prazo then
      v_acao := 'prazo_alterado'; v_desc := 'Prazo: ' || coalesce(old.prazo::text, '(sem)') || ' → ' || coalesce(new.prazo::text, '(sem)');
    end if;
  end if;

  if v_acao is not null then
    insert into public.assuntos_historico(assunto_id, acao, descricao, user_id, user_nome)
    values (
      case when tg_op = 'INSERT' then new.id else new.id end,
      v_acao, v_desc, auth.uid(), v_user_nome
    );
    update public.assuntos set ultima_atualizacao_em = now() where id = new.id;
  end if;
  return null;
end;$$;

drop trigger if exists assuntos_hist_trg on public.assuntos;
create trigger assuntos_hist_trg after insert or update on public.assuntos
  for each row execute function public.registrar_historico_assunto();

-- ─── 3) Vinculação Assunto ↔ Reunião (M2M) ──────────────────────────────
create table if not exists public.reuniao_assuntos (
  id              uuid primary key default gen_random_uuid(),
  reuniao_id      uuid not null references public.gov_reunioes(id) on delete cascade,
  assunto_id      uuid not null references public.assuntos(id) on delete cascade,
  ordem           int default 0,
  observacao_reuniao text,
  decisao_reuniao text,
  created_at      timestamptz not null default now(),
  unique (reuniao_id, assunto_id)
);
create index if not exists idx_reu_ass_reu on public.reuniao_assuntos(reuniao_id);
create index if not exists idx_reu_ass_ass on public.reuniao_assuntos(assunto_id);

-- ─── 4) Trigger: incrementa contador "vezes_discutido" ────────────────
create or replace function public.incrementa_vezes_discutido()
returns trigger language plpgsql as $$
begin
  update public.assuntos
     set vezes_discutido = vezes_discutido + 1
   where id = new.assunto_id;
  return new;
end;$$;

drop trigger if exists reu_ass_incrementa on public.reuniao_assuntos;
create trigger reu_ass_incrementa after insert on public.reuniao_assuntos
  for each row execute function public.incrementa_vezes_discutido();

-- ─── 5) RPC: pauta automática (importa assuntos pendentes para a reunião) ─
create or replace function public.assuntos_para_reuniao(p_reuniao_id uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
  v_assunto record;
begin
  -- Pega assuntos abertos/em_andamento NÃO vinculados a esta reunião
  for v_assunto in
    select a.id from public.assuntos a
    where a.status in ('aberto','em_andamento','aguardando_terceiro')
      and not exists (
        select 1 from public.reuniao_assuntos ra
        where ra.reuniao_id = p_reuniao_id and ra.assunto_id = a.id
      )
    order by
      case a.prioridade when 'alta' then 1 when 'media' then 2 else 3 end,
      coalesce(a.prazo, '2099-01-01'::date) asc,
      a.created_at asc
  loop
    insert into public.reuniao_assuntos(reuniao_id, assunto_id)
    values (p_reuniao_id, v_assunto.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;$$;

-- ─── 6) View consolidada: assuntos com info de urgência ────────────────
create or replace view public.vw_assuntos_dashboard as
select
  a.*,
  case
    when a.status = 'concluido' then 'concluido'
    when a.prazo is not null and a.prazo < current_date then 'atrasado'
    when a.prazo is not null and a.prazo <= current_date + interval '3 days' then 'vence_em_breve'
    when a.ultima_atualizacao_em is not null
         and a.ultima_atualizacao_em < now() - interval '7 days' then 'parado'
    else 'normal'
  end as situacao,
  case when a.prazo is null then null
       else (a.prazo - current_date)::int
  end as dias_para_prazo
from public.assuntos a;

-- ─── 7) RPC: alertas de assuntos ──────────────────────────────────────
create or replace function public.assuntos_alertas()
returns table (
  prioridade prioridade_alerta,
  tipo text,
  titulo text,
  descricao text,
  acao_sugerida text,
  link text,
  entidade_id uuid
)
language sql stable security definer set search_path = public as $$
  -- 1) URGENTE: atrasados
  select 'urgente'::prioridade_alerta, 'atrasado',
         titulo,
         'Atrasado há ' || (current_date - prazo) || ' dia(s)' ||
         case when responsavel_nome is not null then ' · Resp: ' || responsavel_nome else '' end,
         'Ver assunto',
         '/assunto/' || id::text, id
  from public.vw_assuntos_dashboard
  where situacao = 'atrasado' and status not in ('concluido','cancelado')

  union all

  -- 2) ATENÇÃO: vence em ≤ 3 dias
  select 'atencao'::prioridade_alerta, 'vence_breve',
         titulo,
         'Vence em ' || dias_para_prazo || ' dia(s)' ||
         case when responsavel_nome is not null then ' · Resp: ' || responsavel_nome else '' end,
         'Ver assunto',
         '/assunto/' || id::text, id
  from public.vw_assuntos_dashboard
  where situacao = 'vence_em_breve' and status not in ('concluido','cancelado')

  union all

  -- 3) INFO: assuntos parados há 7+ dias
  select 'informativo'::prioridade_alerta, 'parado',
         titulo,
         'Sem atualização há ' || (current_date - ultima_atualizacao_em::date) || ' dias',
         'Atualizar',
         '/assunto/' || id::text, id
  from public.vw_assuntos_dashboard
  where situacao = 'parado' and status = 'aberto'

  union all

  -- 4) INFO: gargalo — discutido 3+ vezes sem conclusão
  select 'informativo'::prioridade_alerta, 'gargalo',
         titulo,
         'Discutido ' || vezes_discutido || 'x sem conclusão',
         'Ver assunto',
         '/assunto/' || id::text, id
  from public.vw_assuntos_dashboard
  where vezes_discutido >= 3 and status in ('aberto','em_andamento')

  order by 1;
$$;

-- ─── 8) RPC: resumo por responsável (pra WhatsApp) ──────────────────────
create or replace function public.assuntos_por_responsavel()
returns table (
  responsavel_id uuid,
  responsavel_nome text,
  total_abertos int,
  atrasados int,
  proximos int
)
language sql stable security definer set search_path = public as $$
  select
    responsavel_id,
    responsavel_nome,
    count(*)::int as total,
    count(*) filter (where situacao = 'atrasado')::int as atrasados,
    count(*) filter (where situacao = 'vence_em_breve')::int as proximos
  from public.vw_assuntos_dashboard
  where responsavel_id is not null
    and status not in ('concluido','cancelado')
  group by responsavel_id, responsavel_nome
  order by atrasados desc, total desc;
$$;

-- ─── 9) RLS ──────────────────────────────────────────────────────────────
alter table public.assuntos             enable row level security;
alter table public.assuntos_historico   enable row level security;
alter table public.reuniao_assuntos     enable row level security;

drop policy if exists "assuntos_all"      on public.assuntos;
drop policy if exists "assuntos_hist_all" on public.assuntos_historico;
drop policy if exists "reu_ass_all"       on public.reuniao_assuntos;

create policy "assuntos_all"      on public.assuntos      for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "assuntos_hist_all" on public.assuntos_historico for all using (auth.role()='authenticated') with check (auth.role()='authenticated');
create policy "reu_ass_all"       on public.reuniao_assuntos for all using (auth.role()='authenticated') with check (auth.role()='authenticated');

comment on table public.assuntos is 'Sistema de assuntos administrativos - vive entre reunioes';
comment on table public.reuniao_assuntos is 'Vinculacao M2M: um assunto pode ser discutido em varias reunioes';
