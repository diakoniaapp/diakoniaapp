-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE 7 — Centros de Custo Inteligentes
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Hierarquia (pai → filho)
-- 2) Tipo "evento" adicionado ao enum
-- 3) Seed automático (cria centros pra ministérios/áreas/EBD/PGM/campanhas)
-- 4) Tabela orçamento (por mês ou anual)
-- 5) Tabela rateio (multi-centro de custo) — preparado para uso futuro
-- 6) Views: resumo por centro · orçamento vs real
-- 7) RPCs: alertas inteligentes + ranking · sugerir centro por categoria
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Adicionar tipo "evento" ao enum ─────────────────────────────────
do $$ begin
  alter type fin_centro_vinculo add value if not exists 'evento';
exception when others then null; end $$;

-- ─── 2) Hierarquia: pai_id ──────────────────────────────────────────────
alter table public.fin_centros_custo
  add column if not exists centro_pai_id uuid references public.fin_centros_custo(id) on delete set null,
  add column if not exists icone text,
  add column if not exists descricao text;

create index if not exists idx_fin_cc_pai on public.fin_centros_custo(centro_pai_id);

-- ─── 3) Tabela: ORÇAMENTO por centro ───────────────────────────────────
create table if not exists public.fin_orcamentos (
  id              uuid primary key default gen_random_uuid(),
  ano             int not null check (ano >= 2020 and ano <= 2099),
  mes             int check (mes between 1 and 12),  -- null = anual
  centro_custo_id uuid not null references public.fin_centros_custo(id) on delete cascade,
  categoria_id    uuid references public.fin_categorias(id) on delete set null, -- opcional
  valor_planejado numeric(14,2) not null check (valor_planejado > 0),
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (ano, mes, centro_custo_id, categoria_id)
);
create index if not exists idx_fin_orc_centro on public.fin_orcamentos(centro_custo_id);
create index if not exists idx_fin_orc_ano on public.fin_orcamentos(ano, mes);

drop trigger if exists fin_orc_touch on public.fin_orcamentos;
create trigger fin_orc_touch before update on public.fin_orcamentos
  for each row execute function public.touch_fin_updated_at();

-- ─── 4) Tabela: RATEIO (multi-centro de custo) — pré-aprontado ─────────
create table if not exists public.fin_lancamento_rateio (
  id              uuid primary key default gen_random_uuid(),
  lancamento_id   uuid not null references public.fin_lancamentos(id) on delete cascade,
  centro_custo_id uuid not null references public.fin_centros_custo(id) on delete restrict,
  percentual      numeric(5,2) check (percentual > 0 and percentual <= 100),
  valor           numeric(14,2) check (valor >= 0),
  observacao      text
);
create index if not exists idx_fin_rateio_lanc on public.fin_lancamento_rateio(lancamento_id);

-- ─── 5) RPC: seed automático ─ cria centro pra cada ministério/área/etc ──
create or replace function public.fin_seed_centros_custo()
returns table (criados int, ja_existiam int)
language plpgsql security definer set search_path = public as $$
declare
  v_criados int := 0;
  v_existiam int := 0;
  rec record;
begin
  -- 1) Ministérios → centro raiz
  for rec in select id, nome from public.ministerios where ativo loop
    if not exists (
      select 1 from public.fin_centros_custo
      where vinculo_tipo = 'ministerio' and vinculo_id = rec.id
    ) then
      insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome)
      values ('Min. ' || rec.nome, 'ministerio', rec.id, rec.nome);
      v_criados := v_criados + 1;
    else
      v_existiam := v_existiam + 1;
    end if;
  end loop;

  -- 2) Áreas → centro com pai = ministério
  for rec in
    select a.id, a.nome, a.ministerio_id, m.nome as ministerio_nome
    from public.areas a
    left join public.ministerios m on m.id = a.ministerio_id
    where a.ativo
  loop
    if not exists (
      select 1 from public.fin_centros_custo
      where vinculo_tipo = 'area' and vinculo_id = rec.id
    ) then
      insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome, centro_pai_id)
      values (
        coalesce(rec.ministerio_nome || ' · ' || rec.nome, rec.nome),
        'area', rec.id, rec.nome,
        (select id from public.fin_centros_custo
         where vinculo_tipo = 'ministerio' and vinculo_id = rec.ministerio_id limit 1)
      );
      v_criados := v_criados + 1;
    else
      v_existiam := v_existiam + 1;
    end if;
  end loop;

  -- 3) Classes EBD
  for rec in select id, nome from public.ebd_classes where ativo loop
    if not exists (
      select 1 from public.fin_centros_custo
      where vinculo_tipo = 'ebd_classe' and vinculo_id = rec.id
    ) then
      insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome)
      values ('EBD ' || rec.nome, 'ebd_classe', rec.id, rec.nome);
      v_criados := v_criados + 1;
    else
      v_existiam := v_existiam + 1;
    end if;
  end loop;

  -- 4) PGMs
  begin
    for rec in select id, nome from public.pgm_grupos where ativo loop
      if not exists (
        select 1 from public.fin_centros_custo
        where vinculo_tipo = 'pgm_grupo' and vinculo_id = rec.id
      ) then
        insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome)
        values ('PGM ' || rec.nome, 'pgm_grupo', rec.id, rec.nome);
        v_criados := v_criados + 1;
      else
        v_existiam := v_existiam + 1;
      end if;
    end loop;
  exception when others then
    null; -- PGM pode não existir
  end;

  -- 5) Campanhas EBD ativas
  begin
    for rec in select id, nome from public.ebd_campanhas where ativo loop
      if not exists (
        select 1 from public.fin_centros_custo
        where vinculo_tipo = 'campanha' and vinculo_id = rec.id
      ) then
        insert into public.fin_centros_custo (nome, vinculo_tipo, vinculo_id, vinculo_nome)
        values ('Camp. ' || rec.nome, 'campanha', rec.id, rec.nome);
        v_criados := v_criados + 1;
      else
        v_existiam := v_existiam + 1;
      end if;
    end loop;
  exception when others then null;
  end;

  return query select v_criados, v_existiam;
end;$$;

-- ─── 6) View: resumo por centro de custo (90d) ─────────────────────────
create or replace view public.vw_fin_centros_resumo as
select
  cc.id, cc.nome, cc.vinculo_tipo, cc.vinculo_id, cc.vinculo_nome,
  cc.centro_pai_id, cc.cor, cc.ativo,
  -- Totais (apenas realizados/conciliados)
  coalesce((
    select sum(l.valor) from public.fin_lancamentos l
    where l.centro_custo_id = cc.id and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.data >= current_date - interval '90 days'
  ), 0) as gasto_90d,
  coalesce((
    select sum(l.valor) from public.fin_lancamentos l
    where l.centro_custo_id = cc.id and l.tipo = 'entrada'
      and l.status in ('realizado','conciliado')
      and l.data >= current_date - interval '90 days'
  ), 0) as recebido_90d,
  coalesce((
    select sum(l.valor) from public.fin_lancamentos l
    where l.centro_custo_id = cc.id and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.data >= date_trunc('month', current_date)
  ), 0) as gasto_mes,
  coalesce((
    select count(l.id) from public.fin_lancamentos l
    where l.centro_custo_id = cc.id
      and l.data >= current_date - interval '90 days'
  ), 0)::int as qtd_lancamentos_90d,
  -- Última movimentação
  (select max(data) from public.fin_lancamentos
   where centro_custo_id = cc.id) as ultima_movimentacao
from public.fin_centros_custo cc
where cc.ativo;

-- ─── 7) View: Orçamento vs Real (mês atual) ────────────────────────────
create or replace view public.vw_fin_orcamento_vs_real as
with mes_atual as (
  select extract(year from current_date)::int as ano,
         extract(month from current_date)::int as mes,
         date_trunc('month', current_date)::date as ini,
         (date_trunc('month', current_date) + interval '1 month - 1 day')::date as fim
)
select
  o.id, o.ano, o.mes, o.centro_custo_id, o.categoria_id,
  cc.nome as centro_nome,
  o.valor_planejado,
  coalesce((
    select sum(l.valor) from public.fin_lancamentos l, mes_atual m
    where l.centro_custo_id = o.centro_custo_id
      and (o.categoria_id is null or l.categoria_id = o.categoria_id)
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.data between m.ini and m.fim
  ), 0) as valor_real,
  case
    when o.valor_planejado = 0 then 0
    else round(100.0 * coalesce((
      select sum(l.valor) from public.fin_lancamentos l, mes_atual m
      where l.centro_custo_id = o.centro_custo_id
        and (o.categoria_id is null or l.categoria_id = o.categoria_id)
        and l.tipo = 'saida'
        and l.status in ('realizado','conciliado')
        and l.data between m.ini and m.fim
    ), 0) / o.valor_planejado, 1)
  end as percentual_consumido
from public.fin_orcamentos o
join public.fin_centros_custo cc on cc.id = o.centro_custo_id
cross join mes_atual ma
where (o.mes is null or o.mes = ma.mes)
  and o.ano = ma.ano;

-- ─── 8) RPC: alertas inteligentes dos centros ─────────────────────────
create or replace function public.fin_alertas_centros()
returns table (
  centro_id uuid,
  centro_nome text,
  tipo_alerta text,
  titulo text,
  descricao text,
  severidade text
)
language sql stable security definer set search_path = public as $$
  -- 1) Acima do orçamento (≥ 100%)
  select o.centro_custo_id, o.centro_nome, 'acima_orcamento',
         'Acima do orçamento',
         o.centro_nome || ': ' || o.percentual_consumido || '% do orçamento (R$ ' ||
           to_char(o.valor_real, 'FM999999.99') || ' de R$ ' || to_char(o.valor_planejado, 'FM999999.99') || ')',
         'critico'
  from public.vw_fin_orcamento_vs_real o
  where o.percentual_consumido >= 100

  union all

  -- 2) 80%+ do orçamento (atenção)
  select o.centro_custo_id, o.centro_nome, 'orcamento_atencao',
         'Orçamento em alerta',
         o.centro_nome || ': ' || o.percentual_consumido || '% consumido',
         'atencao'
  from public.vw_fin_orcamento_vs_real o
  where o.percentual_consumido >= 80 and o.percentual_consumido < 100

  union all

  -- 3) Crescimento >40% vs trimestre anterior
  select cc.id, cc.nome, 'crescimento',
         'Crescimento atípico',
         cc.nome || ': gasto subiu vs trimestre anterior',
         'atencao'
  from public.fin_centros_custo cc
  where cc.ativo
    and (
      coalesce((
        select sum(l.valor) from public.fin_lancamentos l
        where l.centro_custo_id = cc.id and l.tipo = 'saida'
          and l.status in ('realizado','conciliado')
          and l.data >= current_date - interval '30 days'
      ), 0) > 1.4 * coalesce((
        select sum(l.valor) / 3.0 from public.fin_lancamentos l
        where l.centro_custo_id = cc.id and l.tipo = 'saida'
          and l.status in ('realizado','conciliado')
          and l.data >= current_date - interval '120 days'
          and l.data <  current_date - interval '30 days'
      ), 0)
    )
    and coalesce((
      select sum(l.valor) from public.fin_lancamentos l
      where l.centro_custo_id = cc.id and l.tipo = 'saida'
        and l.status in ('realizado','conciliado')
        and l.data >= current_date - interval '30 days'
    ), 0) > 100  -- ignora ruído

  union all

  -- 4) Centros ativos sem movimento em 60 dias
  select cc.id, cc.nome, 'sem_movimento',
         'Sem movimento recente',
         cc.nome || ': sem lançamentos nos últimos 60 dias',
         'info'
  from public.fin_centros_custo cc
  where cc.ativo
    and cc.vinculo_tipo <> 'geral'
    and not exists (
      select 1 from public.fin_lancamentos l
      where l.centro_custo_id = cc.id
        and l.data >= current_date - interval '60 days'
    );
$$;

-- ─── 9) RPC: sugerir centro de custo a partir do uso histórico ─────────
create or replace function public.fin_sugerir_centro_por_categoria(p_categoria_id uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  -- Centro de custo mais usado para essa categoria (excluindo "geral")
  select l.centro_custo_id
  from public.fin_lancamentos l
  join public.fin_centros_custo cc on cc.id = l.centro_custo_id
  where l.categoria_id = p_categoria_id
    and l.centro_custo_id is not null
    and cc.vinculo_tipo <> 'geral'
    and l.status in ('realizado','conciliado')
    and l.data >= current_date - interval '180 days'
  group by l.centro_custo_id
  order by count(*) desc
  limit 1;
$$;

-- ─── 10) RLS ────────────────────────────────────────────────────────────
alter table public.fin_orcamentos          enable row level security;
alter table public.fin_lancamento_rateio   enable row level security;

drop policy if exists "fin_orc_all"    on public.fin_orcamentos;
drop policy if exists "fin_rateio_all" on public.fin_lancamento_rateio;

create policy "fin_orc_all" on public.fin_orcamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_rateio_all" on public.fin_lancamento_rateio for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── 11) Roda o seed inicial ────────────────────────────────────────────
select * from public.fin_seed_centros_custo();
