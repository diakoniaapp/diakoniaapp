-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE 6 — Insights inteligentes + Previsão
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) RPC: anomalias do mês (comparação com média 6 meses) ─────────────
create or replace function public.fin_anomalias_mes(p_ano int default null, p_mes int default null)
returns table (
  categoria_id uuid,
  categoria_nome text,
  tipo text,
  valor_mes numeric,
  media_6m numeric,
  variacao_pct numeric,
  severidade text
)
language sql stable security definer set search_path = public as $$
  with periodo_atual as (
    select coalesce(p_ano, extract(year from current_date)::int) as ano,
           coalesce(p_mes, extract(month from current_date)::int) as mes
  ),
  base as (
    select pa.ano, pa.mes,
           make_date(pa.ano, pa.mes, 1) as ini_mes,
           (make_date(pa.ano, pa.mes, 1) + interval '1 month - 1 day')::date as fim_mes
    from periodo_atual pa
  ),
  -- Total atual por categoria
  atual as (
    select l.categoria_id, k.nome, k.tipo::text,
           sum(l.valor) as valor_mes
    from public.fin_lancamentos l
    join base b on l.data between b.ini_mes and b.fim_mes
    left join public.fin_categorias k on k.id = l.categoria_id
    where l.status in ('realizado','conciliado') and l.categoria_id is not null
    group by l.categoria_id, k.nome, k.tipo
  ),
  -- Média dos 6 meses anteriores
  historico as (
    select l.categoria_id,
           sum(l.valor) / 6.0 as media_6m
    from public.fin_lancamentos l, base b
    where l.status in ('realizado','conciliado') and l.categoria_id is not null
      and l.data >= b.ini_mes - interval '6 months'
      and l.data <  b.ini_mes
    group by l.categoria_id
  )
  select a.categoria_id, a.nome, a.tipo, a.valor_mes,
         coalesce(h.media_6m, 0) as media_6m,
         case when coalesce(h.media_6m, 0) = 0 then null
              else round(100.0 * (a.valor_mes - h.media_6m) / h.media_6m, 1)
         end as variacao_pct,
         case
           when coalesce(h.media_6m, 0) = 0 then 'novo'
           when abs(a.valor_mes - h.media_6m) / h.media_6m >= 0.5 then 'critico'
           when abs(a.valor_mes - h.media_6m) / h.media_6m >= 0.3 then 'atencao'
           else 'normal'
         end as severidade
  from atual a
  left join historico h on h.categoria_id = a.categoria_id
  order by abs(a.valor_mes - coalesce(h.media_6m, 0)) desc;
$$;

-- ─── 2) RPC: previsão de caixa próximos 90 dias ───────────────────────────
create or replace function public.fin_previsao_caixa()
returns table (
  saldo_atual numeric,
  entradas_previstas_30d numeric,
  saidas_previstas_30d numeric,
  saldo_projetado_30d numeric,
  entradas_previstas_60d numeric,
  saidas_previstas_60d numeric,
  saldo_projetado_60d numeric,
  entradas_previstas_90d numeric,
  saidas_previstas_90d numeric,
  saldo_projetado_90d numeric
)
language sql stable security definer set search_path = public as $$
  with saldo as (
    select coalesce(sum(saldo_atual), 0) as total
    from public.fin_contas where ativo
  ),
  previstos as (
    select
      sum(valor) filter (where tipo = 'entrada' and data <= current_date + interval '30 days') as ent_30,
      sum(valor) filter (where tipo = 'saida'   and data <= current_date + interval '30 days') as sai_30,
      sum(valor) filter (where tipo = 'entrada' and data <= current_date + interval '60 days') as ent_60,
      sum(valor) filter (where tipo = 'saida'   and data <= current_date + interval '60 days') as sai_60,
      sum(valor) filter (where tipo = 'entrada' and data <= current_date + interval '90 days') as ent_90,
      sum(valor) filter (where tipo = 'saida'   and data <= current_date + interval '90 days') as sai_90
    from public.fin_lancamentos
    where status = 'previsto'
      and data >= current_date
  )
  select
    s.total,
    coalesce(p.ent_30, 0), coalesce(p.sai_30, 0), s.total + coalesce(p.ent_30, 0) - coalesce(p.sai_30, 0),
    coalesce(p.ent_60, 0), coalesce(p.sai_60, 0), s.total + coalesce(p.ent_60, 0) - coalesce(p.sai_60, 0),
    coalesce(p.ent_90, 0), coalesce(p.sai_90, 0), s.total + coalesce(p.ent_90, 0) - coalesce(p.sai_90, 0)
  from saldo s, previstos p;
$$;

-- ─── 3) RPC: comparativo mensal (resumo dos últimos 6 meses) ─────────────
create or replace function public.fin_comparativo_meses(p_n int default 6)
returns table (
  ano int,
  mes int,
  rotulo text,
  entradas numeric,
  saidas numeric,
  resultado numeric
)
language sql stable security definer set search_path = public as $$
  with meses as (
    select generate_series(
      date_trunc('month', current_date)::date - (p_n - 1) * interval '1 month',
      date_trunc('month', current_date)::date,
      interval '1 month'
    )::date as ini
  ),
  agreg as (
    select m.ini,
           extract(year from m.ini)::int as ano,
           extract(month from m.ini)::int as mes,
           to_char(m.ini, 'TMMon/YY') as rotulo,
           coalesce((select sum(l.valor) from public.fin_lancamentos l
             where l.data >= m.ini and l.data < (m.ini + interval '1 month')
               and l.tipo = 'entrada' and l.status in ('realizado','conciliado')), 0) as entradas,
           coalesce((select sum(l.valor) from public.fin_lancamentos l
             where l.data >= m.ini and l.data < (m.ini + interval '1 month')
               and l.tipo = 'saida' and l.status in ('realizado','conciliado')), 0) as saidas
    from meses m
  )
  select ano, mes, rotulo, entradas, saidas, (entradas - saidas) as resultado
  from agreg
  order by ini;
$$;

-- ─── 4) RPC: top fornecedores (últimos 90 dias) ─────────────────────────
create or replace function public.fin_top_fornecedores(p_n int default 10, p_dias int default 90)
returns table (
  fornecedor_id uuid,
  fornecedor_nome text,
  total numeric,
  qtd_lancamentos int
)
language sql stable security definer set search_path = public as $$
  select
    l.fornecedor_id,
    f.nome,
    sum(l.valor) as total,
    count(l.id)::int as qtd
  from public.fin_lancamentos l
  join public.fin_fornecedores f on f.id = l.fornecedor_id
  where l.tipo = 'saida'
    and l.status in ('realizado','conciliado')
    and l.data >= current_date - (p_dias || ' days')::interval
  group by l.fornecedor_id, f.nome
  order by total desc
  limit p_n;
$$;

-- ─── 5) RPC: alertas pastorais consolidados (resumo Dashboard) ──────────
create or replace function public.fin_alertas_financeiros()
returns table (
  tipo text,
  titulo text,
  descricao text,
  severidade text,
  link text
)
language sql stable security definer set search_path = public as $$
  -- 1) Contas vencidas
  select 'conta_vencida', 'Conta vencida',
         count(*) || ' lançamento(s) vencido(s) totalizando R$ ' || to_char(sum(valor), 'FM9999999.99'),
         'critico', '/financas/agenda'
  from public.fin_lancamentos
  where status = 'previsto' and tipo = 'saida' and data < current_date
  having count(*) > 0

  union all

  -- 2) Vencendo nos proximos 5 dias
  select 'conta_proxima', 'Vencimentos próximos',
         count(*) || ' conta(s) para os próximos 5 dias totalizando R$ ' || to_char(sum(valor), 'FM9999999.99'),
         'atencao', '/financas/agenda'
  from public.fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + interval '5 days'
  having count(*) > 0

  union all

  -- 3) Saldo previsto negativo em 30d
  select 'saldo_negativo_30d', 'Atenção: saldo projetado negativo em 30 dias',
         'Considere adiar pagamentos ou buscar receita extra',
         'critico', '/financas/insights'
  where (
    select saldo_projetado_30d from public.fin_previsao_caixa()
  ) < 0;
$$;
