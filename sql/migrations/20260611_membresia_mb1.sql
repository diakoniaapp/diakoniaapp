-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA — MEMBRESIA: Mb1 + Mb2
-- Solicitacoes de entrada/saida/transferencia + Painel da Secretaria
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Enums ──────────────────────────────────────────────────────────
do $$ begin
  create type tipo_solicitacao_membresia as enum (
    'entrada_batismo',
    'entrada_profissao_fe',
    'entrada_aclamacao',
    'transferencia_recebida',
    'transferencia_emitida',
    'desligamento_pedido',
    'desligamento_disciplinar',
    'falecimento'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_solicitacao_membresia as enum (
    'rascunho',
    'aguardando_documento',
    'pronta_assembleia',
    'aprovada',
    'rejeitada',
    'concluida',
    'cancelada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type prioridade_alerta as enum ('urgente','atencao','informativo');
exception when duplicate_object then null; end $$;

-- ─── 2) Solicitações ──────────────────────────────────────────────────
create table if not exists public.solicitacoes_membresia (
  id                uuid primary key default gen_random_uuid(),
  pessoa_id         uuid references public.membros(id) on delete set null,
  pessoa_nome       text not null,                  -- snapshot
  tipo              tipo_solicitacao_membresia not null,
  status            status_solicitacao_membresia not null default 'rascunho',

  -- Datas relevantes
  data_solicitacao  date not null default current_date,
  data_assembleia   date,
  data_aprovacao    date,
  data_conclusao    date,

  -- Detalhes
  motivo            text,
  igreja_origem     text,
  igreja_destino    text,
  observacoes       text,
  observacao_aprovacao text,
  observacao_rejeicao  text,

  -- Pastor assinante
  pastor_assinante_id  uuid references public.membros(id) on delete set null,
  pastor_assinante_nome text,
  secretaria_assinante_id uuid references public.membros(id) on delete set null,
  secretaria_assinante_nome text,

  -- Carta final
  carta_url         text,
  carta_versao_atual int default 0,

  -- Auditoria
  solicitado_por    uuid references public.profiles(id) on delete set null,
  aprovado_por      uuid references public.profiles(id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_sol_memb_status on public.solicitacoes_membresia(status);
create index if not exists idx_sol_memb_pessoa on public.solicitacoes_membresia(pessoa_id);
create index if not exists idx_sol_memb_data   on public.solicitacoes_membresia(data_solicitacao desc);
create index if not exists idx_sol_memb_assembleia on public.solicitacoes_membresia(data_assembleia);

create or replace function public.touch_solicitacao_membresia()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;$$;

drop trigger if exists sol_memb_touch on public.solicitacoes_membresia;
create trigger sol_memb_touch before update on public.solicitacoes_membresia
  for each row execute function public.touch_solicitacao_membresia();

-- ─── 3) Documentos (pedido, carta, declaração) ────────────────────────
create table if not exists public.solicitacoes_documentos (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references public.solicitacoes_membresia(id) on delete cascade,
  tipo            text not null check (tipo in ('pedido','carta','declaracao','identidade','outro')),
  arquivo_url     text not null,
  arquivo_nome    text,
  mime            text,
  versao          int not null default 1,
  observacao      text,
  enviado_por     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_sol_doc_solic on public.solicitacoes_documentos(solicitacao_id);
create index if not exists idx_sol_doc_tipo  on public.solicitacoes_documentos(tipo);

-- ─── 4) Histórico (audit log da solicitação) ──────────────────────────
create table if not exists public.solicitacoes_historico (
  id              uuid primary key default gen_random_uuid(),
  solicitacao_id  uuid not null references public.solicitacoes_membresia(id) on delete cascade,
  acao            text not null,            -- 'criada', 'documento_anexado', 'aprovada', etc.
  descricao       text,
  user_id         uuid references public.profiles(id) on delete set null,
  user_nome       text,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_sol_hist_solic on public.solicitacoes_historico(solicitacao_id);

-- ─── 5) Assinaturas oficiais (secretárias/pastores) ───────────────────
create table if not exists public.assinaturas_oficiais (
  id              uuid primary key default gen_random_uuid(),
  pessoa_id       uuid references public.membros(id) on delete set null,
  pessoa_nome     text not null,
  cargo           text not null,            -- 'Secretária', 'Pastor Titular', 'Pastor Auxiliar'
  imagem_url      text,                     -- assinatura escaneada (PNG transparente)
  ordem           int default 0,
  ativo           boolean not null default true,
  observacao      text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_assin_ativo on public.assinaturas_oficiais(ativo);

-- ─── 6) Trigger: registra histórico automaticamente ───────────────────
create or replace function public.registrar_historico_solicitacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_acao text;
  v_desc text;
  v_user_nome text;
begin
  -- pega nome do user que fez a ação
  if auth.uid() is not null then
    select coalesce(nome, email) into v_user_nome from public.profiles where id = auth.uid();
  end if;

  if tg_op = 'INSERT' then
    v_acao := 'criada';
    v_desc := 'Solicitação criada (tipo: ' || new.tipo::text || ')';
  elsif tg_op = 'UPDATE' then
    if old.status <> new.status then
      v_acao := 'status_alterado';
      v_desc := 'Status: ' || old.status::text || ' → ' || new.status::text;
    end if;
    if old.data_assembleia is distinct from new.data_assembleia and new.data_assembleia is not null then
      v_acao := 'assembleia_agendada';
      v_desc := 'Assembleia agendada para ' || new.data_assembleia::text;
    end if;
    if old.carta_url is distinct from new.carta_url and new.carta_url is not null then
      v_acao := 'carta_gerada';
      v_desc := 'Carta gerada (v' || coalesce(new.carta_versao_atual, 1) || ')';
    end if;
  end if;

  if v_acao is not null then
    insert into public.solicitacoes_historico(solicitacao_id, acao, descricao, user_id, user_nome)
    values (
      case when tg_op = 'INSERT' then new.id else new.id end,
      v_acao, v_desc, auth.uid(), v_user_nome
    );
  end if;
  return null;
end;$$;

drop trigger if exists sol_memb_hist on public.solicitacoes_membresia;
create trigger sol_memb_hist after insert or update on public.solicitacoes_membresia
  for each row execute function public.registrar_historico_solicitacao();

-- ─── 7) Storage bucket privado ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('membresia-docs', 'membresia-docs', false)
on conflict (id) do nothing;

drop policy if exists "membresia-docs-select" on storage.objects;
drop policy if exists "membresia-docs-insert" on storage.objects;
drop policy if exists "membresia-docs-update" on storage.objects;
drop policy if exists "membresia-docs-delete" on storage.objects;
create policy "membresia-docs-select" on storage.objects for select
  using (bucket_id = 'membresia-docs' and auth.role() = 'authenticated');
create policy "membresia-docs-insert" on storage.objects for insert
  with check (bucket_id = 'membresia-docs' and auth.role() = 'authenticated');
create policy "membresia-docs-update" on storage.objects for update
  using (bucket_id = 'membresia-docs' and auth.role() = 'authenticated');
create policy "membresia-docs-delete" on storage.objects for delete
  using (bucket_id = 'membresia-docs' and auth.role() = 'authenticated');

-- ─── 8) RPC: Painel da Secretaria — Alertas consolidados ───────────────
create or replace function public.secretaria_alertas()
returns table (
  prioridade prioridade_alerta,
  tipo text,
  titulo text,
  descricao text,
  acao_sugerida text,
  link text,
  solicitacao_id uuid
)
language sql stable security definer set search_path = public as $$
  -- 1) URGENTE: Solicitações sem documento
  select 'urgente'::prioridade_alerta, 'sem_documento',
         pessoa_nome || ' não tem documento anexado',
         pessoa_nome || ' solicitou ' || replace(tipo::text, '_', ' ') ||
           ' há ' || (current_date - data_solicitacao) || ' dias',
         'Anexar documento',
         '/membresia/' || id::text, id
  from public.solicitacoes_membresia
  where status in ('rascunho','aguardando_documento')
    and not exists (
      select 1 from public.solicitacoes_documentos
      where solicitacao_id = solicitacoes_membresia.id and tipo = 'pedido'
    )

  union all

  -- 2) URGENTE: Aprovadas sem carta gerada
  select 'urgente'::prioridade_alerta, 'sem_carta',
         pessoa_nome || ' aprovado(a) mas sem carta gerada',
         'Aprovada em ' || coalesce(data_aprovacao::text, '?') || ' — carta pendente',
         'Gerar carta',
         '/membresia/' || id::text, id
  from public.solicitacoes_membresia
  where status = 'aprovada' and carta_url is null

  union all

  -- 3) ATENÇÃO: Prontas para assembleia (com documento) mas sem data agendada
  select 'atencao'::prioridade_alerta, 'sem_assembleia',
         pessoa_nome || ' pronta para assembleia',
         'Documento anexado. Falta agendar para uma assembleia.',
         'Agendar assembleia',
         '/membresia/' || id::text, id
  from public.solicitacoes_membresia
  where status = 'pronta_assembleia' and data_assembleia is null

  union all

  -- 4) ATENÇÃO: Assembleia próxima (≤ 14 dias) com solicitações pendentes
  select 'atencao'::prioridade_alerta, 'assembleia_proxima',
         'Assembleia em ' || (data_assembleia - current_date) || ' dia(s)',
         pessoa_nome || ' — confirmar tudo pronto',
         'Ver solicitação',
         '/membresia/' || id::text, id
  from public.solicitacoes_membresia
  where status = 'pronta_assembleia'
    and data_assembleia is not null
    and data_assembleia between current_date and current_date + interval '14 days'

  union all

  -- 5) INFO: Solicitações antigas (>30d) sem mudança
  select 'informativo'::prioridade_alerta, 'antiga_parada',
         pessoa_nome || ' sem movimento há ' || (current_date - updated_at::date) || ' dias',
         'Status: ' || status::text || ' · Talvez precise de atenção',
         'Ver solicitação',
         '/membresia/' || id::text, id
  from public.solicitacoes_membresia
  where status not in ('concluida','rejeitada','cancelada')
    and updated_at::date < current_date - interval '30 days'

  order by 1, 2;
$$;

-- ─── 9) RLS ────────────────────────────────────────────────────────────
alter table public.solicitacoes_membresia    enable row level security;
alter table public.solicitacoes_documentos   enable row level security;
alter table public.solicitacoes_historico    enable row level security;
alter table public.assinaturas_oficiais      enable row level security;

drop policy if exists "sol_memb_all"    on public.solicitacoes_membresia;
drop policy if exists "sol_doc_all"     on public.solicitacoes_documentos;
drop policy if exists "sol_hist_all"    on public.solicitacoes_historico;
drop policy if exists "assin_all"       on public.assinaturas_oficiais;

create policy "sol_memb_all" on public.solicitacoes_membresia for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "sol_doc_all" on public.solicitacoes_documentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "sol_hist_all" on public.solicitacoes_historico for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "assin_all" on public.assinaturas_oficiais for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.solicitacoes_membresia is 'Pedidos de entrada/saida/transferencia de membresia';
comment on table public.solicitacoes_documentos is 'Documentos anexados a cada solicitação (pedido, carta, declaração)';
comment on table public.solicitacoes_historico  is 'Histórico de ações na solicitação (audit log)';
comment on table public.assinaturas_oficiais    is 'Assinaturas escaneadas para uso em cartas geradas';
