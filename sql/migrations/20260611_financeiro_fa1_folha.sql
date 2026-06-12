-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE FA1 — Folha de Pagamento & Encargos
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Cadastro de contratados (CLT, MEI, RPA, Prebenda, estagio, voluntario)
-- 2) Tabelas de IRRF e INSS por ano vigente (atualizar quando mudar)
-- 3) Folha mensal (competencia + lancamentos individuais)
-- 4) Seed das tabelas 2025
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type fin_vinculo_tipo as enum ('clt','mei','rpa','prebenda','estagio','voluntario_remunerado');
exception when duplicate_object then null; end $$;

-- ─── 1) Contratados ───────────────────────────────────────────────────────
create table if not exists public.fin_contratados (
  id              uuid primary key default gen_random_uuid(),
  pessoa_id       uuid references public.membros(id) on delete set null,
  nome            text not null,              -- snapshot, mesmo se pessoa for excluida
  cpf             text,
  vinculo         fin_vinculo_tipo not null,
  cargo           text,
  data_inicio     date not null default current_date,
  data_fim        date,
  ativo           boolean not null default true,

  -- CLT
  salario_base    numeric(14,2),
  jornada_horas_semana int,
  num_dependentes int default 0,
  vale_alimentacao_dia numeric(10,2),
  vale_transporte_dias int default 22,
  vt_passagem_valor numeric(10,2),

  -- MEI
  cnpj            text,
  mei_atividade   text,
  mei_valor_mensal numeric(14,2),

  -- RPA
  rpa_valor_padrao numeric(14,2),

  -- Prebenda
  prebenda_valor  numeric(14,2),
  prebenda_aux_aluguel numeric(14,2) default 0,
  prebenda_aux_outros numeric(14,2) default 0,

  -- Encargos
  igreja_tem_cebas boolean not null default false,
  pastor_contribui_inss boolean default true,

  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fin_cont_ativo on public.fin_contratados(ativo);
create index if not exists idx_fin_cont_vinculo on public.fin_contratados(vinculo);

drop trigger if exists fin_cont_touch on public.fin_contratados;
create trigger fin_cont_touch before update on public.fin_contratados
  for each row execute function public.touch_fin_updated_at();

-- ─── 2) Tabelas IRRF / INSS (configuráveis por vigência) ──────────────────
create table if not exists public.fin_tabela_inss_empregado (
  id          uuid primary key default gen_random_uuid(),
  vigencia    date not null,
  ordem       int not null,
  faixa_min   numeric(10,2) not null,
  faixa_max   numeric(10,2),
  aliquota    numeric(5,2) not null,  -- em %
  unique (vigencia, ordem)
);

create table if not exists public.fin_tabela_irrf (
  id            uuid primary key default gen_random_uuid(),
  vigencia      date not null,
  ordem         int not null,
  faixa_min     numeric(10,2) not null,
  faixa_max     numeric(10,2),
  aliquota      numeric(5,2) not null,
  parcela_deduzir numeric(10,2) not null default 0,
  deducao_dependente numeric(10,2) not null default 0,
  unique (vigencia, ordem)
);

-- ─── 3) Folha: competências e lançamentos ────────────────────────────────
create table if not exists public.fin_folha_competencias (
  id              uuid primary key default gen_random_uuid(),
  ano             int not null,
  mes             int not null check (mes between 1 and 12),
  status          text not null default 'aberta' check (status in ('aberta','calculada','paga','fechada')),
  data_processamento timestamptz,
  processado_por  uuid references public.profiles(id) on delete set null,
  observacao      text,
  created_at      timestamptz not null default now(),
  unique (ano, mes)
);

create table if not exists public.fin_folha_lancamentos (
  id               uuid primary key default gen_random_uuid(),
  competencia_id   uuid not null references public.fin_folha_competencias(id) on delete cascade,
  contratado_id    uuid not null references public.fin_contratados(id) on delete restrict,
  vinculo_snapshot fin_vinculo_tipo not null,

  -- Bases
  base_calculo     numeric(14,2),

  -- Proventos
  salario_base     numeric(14,2) default 0,
  vale_alimentacao numeric(14,2) default 0,
  vale_transporte  numeric(14,2) default 0,
  outros_proventos numeric(14,2) default 0,

  -- Descontos
  inss_empregado   numeric(14,2) default 0,
  irrf             numeric(14,2) default 0,
  vt_desconto      numeric(14,2) default 0,
  outros_descontos numeric(14,2) default 0,

  -- Encargos empresa
  inss_patronal    numeric(14,2) default 0,
  fgts             numeric(14,2) default 0,
  rat              numeric(14,2) default 0,
  terceiros        numeric(14,2) default 0,

  total_proventos  numeric(14,2) default 0,
  total_descontos  numeric(14,2) default 0,
  liquido          numeric(14,2) default 0,
  custo_total      numeric(14,2) default 0,

  pago             boolean not null default false,
  data_pagamento   date,
  lancamento_id    uuid references public.fin_lancamentos(id) on delete set null,

  observacoes      text,
  created_at       timestamptz not null default now()
);

-- ─── 4) RLS ──────────────────────────────────────────────────────────────
alter table public.fin_contratados             enable row level security;
alter table public.fin_tabela_inss_empregado   enable row level security;
alter table public.fin_tabela_irrf             enable row level security;
alter table public.fin_folha_competencias      enable row level security;
alter table public.fin_folha_lancamentos       enable row level security;

drop policy if exists "fin_cont_all"    on public.fin_contratados;
drop policy if exists "fin_inss_all"    on public.fin_tabela_inss_empregado;
drop policy if exists "fin_irrf_all"    on public.fin_tabela_irrf;
drop policy if exists "fin_folha_c_all" on public.fin_folha_competencias;
drop policy if exists "fin_folha_l_all" on public.fin_folha_lancamentos;

create policy "fin_cont_all" on public.fin_contratados for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_inss_all" on public.fin_tabela_inss_empregado for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_irrf_all" on public.fin_tabela_irrf for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_folha_c_all" on public.fin_folha_competencias for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_folha_l_all" on public.fin_folha_lancamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── 5) SEED — Tabelas vigentes (atualização 2025) ───────────────────────
-- INSS Empregado 2025 (Portaria MTE)
insert into public.fin_tabela_inss_empregado (vigencia, ordem, faixa_min, faixa_max, aliquota) values
  ('2025-01-01', 1, 0,       1518.00, 7.5),
  ('2025-01-01', 2, 1518.01, 2793.88, 9),
  ('2025-01-01', 3, 2793.89, 4190.83, 12),
  ('2025-01-01', 4, 4190.84, 8157.41, 14)
on conflict (vigencia, ordem) do nothing;

-- IRRF 2024 (vigência Fev/2024+ — atualizar quando reforma sair)
insert into public.fin_tabela_irrf (vigencia, ordem, faixa_min, faixa_max, aliquota, parcela_deduzir, deducao_dependente) values
  ('2024-02-01', 1, 0,        2259.20, 0,    0,      189.59),
  ('2024-02-01', 2, 2259.21,  2826.65, 7.5,  169.44, 189.59),
  ('2024-02-01', 3, 2826.66,  3751.05, 15,   381.44, 189.59),
  ('2024-02-01', 4, 3751.06,  4664.68, 22.5, 662.77, 189.59),
  ('2024-02-01', 5, 4664.69,  null,    27.5, 896.00, 189.59)
on conflict (vigencia, ordem) do nothing;

comment on table public.fin_contratados is 'Pessoas que recebem da igreja: CLT, MEI, RPA, Prebenda';
comment on table public.fin_folha_competencias is 'Mês de processamento de folha';
comment on table public.fin_folha_lancamentos is 'Detalhe da folha por contratado';
