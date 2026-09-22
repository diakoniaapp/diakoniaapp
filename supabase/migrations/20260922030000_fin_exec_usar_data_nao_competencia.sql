-- Item 8 (22/09/2026): "Visão Executiva" aparecia com Fluxo de Caixa,
-- Indicadores Eclesiásticos, Dízimos, Ofertas, Top Centros de Custo e o
-- alerta de orçamento estourado sempre zerados/vazios — mesmo com dado
-- real no sistema (13.157 lançamentos realizados/conciliados).
--
-- Causa raiz, a MESMA nas quatro funções: `fin_exec_fluxo_12m`,
-- `fin_exec_centros_ano`, `fin_exec_indicadores_eclesiasticos` e o bloco
-- de alerta de orçamento em `fin_exec_alertas` filtravam/agrupavam por
-- `l.data_competencia` — uma coluna que existe em `fin_lancamentos` mas
-- NENHUM caminho de escrita do app preenche. Medido antes desta migration:
-- `select count(data_competencia) from fin_lancamentos where status in
-- ('realizado','conciliado')` = 0 de 13.157. `date_trunc`/`extract` sobre
-- uma coluna sempre NULL nunca bate com nenhum mês/ano de verdade — cada
-- soma vira `coalesce(..., 0)` e cada filtro `where ... = ano` fica sem
-- linha nenhuma. `fin_exec_saldo_consolidado` (Saldo Total/Previsões) e o
-- bloco "caixa" de `fin_exec_alertas` (contas com saldo crítico) nunca
-- usaram essa coluna — por isso só esses dois apareciam certos na tela.
--
-- Correção: trocar `l.data_competencia` por `l.data` — a coluna que todo
-- o resto do sistema (extrato, DRE, relatórios) já usa como data real do
-- lançamento. Sem mudança de schema, só das 4 funções.
--
-- Bônus em `fin_exec_fluxo_12m`: rótulo do eixo X vinha em inglês
-- ("Oct/25", "Nov/25" — `to_char(..,'Mon/YY')` depende do locale do
-- servidor, que não é pt_BR) — trocado por um `CASE` fixo com abreviação
-- em português, mesmo padrão que o resto do app usa via
-- `toLocaleDateString("pt-BR", ...)` no cliente.

CREATE OR REPLACE FUNCTION public.fin_exec_fluxo_12m()
 RETURNS TABLE(mes date, rotulo text, entradas numeric, saidas numeric, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_mes date;
  v_meses_pt text[] := array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
begin
  v_mes := date_trunc('month', current_date - interval '11 months')::date;
  for i in 0..11 loop
    return query
    select
      v_mes,
      v_meses_pt[extract(month from v_mes)::int] || '/' || to_char(v_mes, 'YY'),
      coalesce(sum(case when l.tipo='entrada' then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='saida'   then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='entrada' then l.valor else -l.valor end), 0)::numeric(12,2)
    from fin_lancamentos l
    where l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and date_trunc('month', l.data) = v_mes;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
end; $function$;

CREATE OR REPLACE FUNCTION public.fin_exec_centros_ano()
 RETURNS TABLE(centro_id uuid, nome text, realizado numeric, orcado numeric, percentual numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_ano int := extract(year from current_date)::int;
begin
  return query
  with realizados as (
    select cc.id, cc.nome,
      coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_centros_custo cc
    left join fin_lancamentos l on l.centro_custo_id = cc.id
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and extract(year from l.data) = v_ano
    group by cc.id, cc.nome
  ),
  com_orcamento as (
    select r.id as centro_id, r.nome, r.total as realizado,
      coalesce((select sum(o.valor_planejado) from fin_orcamentos o
                where o.centro_custo_id = r.id and o.ano = v_ano), 0)::numeric(12,2) as orcado
    from realizados r
  )
  select
    c.centro_id, c.nome, c.realizado, c.orcado,
    case when c.orcado > 0 then round(c.realizado / c.orcado * 100, 1)
         else null end as percentual
  from com_orcamento c
  where c.realizado > 0
  order by c.realizado desc
  limit 5;
end; $function$;

CREATE OR REPLACE FUNCTION public.fin_exec_indicadores_eclesiasticos()
 RETURNS TABLE(indicador text, total_ano numeric, total_mes_atual numeric, total_mes_anterior numeric, variacao_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_ano int := extract(year from current_date)::int;
begin
  return query
  with cats as (
    select
      case
        when c.nome ilike '%dizimo%' or c.nome ilike '%dízimo%' then 'Dízimos'
        when c.nome ilike '%oferta%' then 'Ofertas'
        when c.nome ilike '%missao%' or c.nome ilike '%missão%' or c.nome ilike '%missões%' or c.nome ilike '%missoes%' then 'Missões'
        else null
      end as indicador,
      c.id
    from fin_categorias c
    where c.tipo = 'entrada'
  ),
  base as (
    select
      ct.indicador,
      l.data,
      l.valor
    from fin_lancamentos l
    join cats ct on ct.id = l.categoria_id
    where ct.indicador is not null
      and l.status in ('realizado','conciliado')
  ),
  agregado as (
    select
      b.indicador,
      sum(case when extract(year from b.data) = v_ano then b.valor else 0 end)::numeric(12,2) as total_ano,
      sum(case when date_trunc('month', b.data) = date_trunc('month', current_date)
                then b.valor else 0 end)::numeric(12,2) as total_mes_atual,
      sum(case when date_trunc('month', b.data) = date_trunc('month', current_date - interval '1 month')
                then b.valor else 0 end)::numeric(12,2) as total_mes_anterior
    from base b
    group by b.indicador
  )
  select
    a.indicador, a.total_ano, a.total_mes_atual, a.total_mes_anterior,
    case when a.total_mes_anterior > 0
      then round((a.total_mes_atual - a.total_mes_anterior) / a.total_mes_anterior * 100, 1)
      else null end as variacao_pct
  from agregado a
  order by a.total_ano desc;
end; $function$;

CREATE OR REPLACE FUNCTION public.fin_exec_alertas()
 RETURNS TABLE(severidade text, categoria text, mensagem text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_ano int := extract(year from current_date)::int;
begin
  -- Contas com saldo crítico (< R$ 5000)
  return query
  select
    'alta'::text, 'caixa'::text,
    format('%s tem saldo crítico', c.nome) as mensagem,
    format('Saldo: R$ %s', public.fmt_brl(c.saldo_inicial +
      coalesce((select sum(case when tipo='entrada' then valor else -valor end)
                from fin_lancamentos l
                where l.conta_id = c.id and l.status in ('realizado','conciliado')), 0)
    ))::text as detalhe
  from fin_contas c
  where c.saldo_inicial +
    coalesce((select sum(case when tipo='entrada' then valor else -valor end)
              from fin_lancamentos l
              where l.conta_id = c.id and l.status in ('realizado','conciliado')), 0) < 5000;

  -- Centros que ultrapassaram o orçamento anual
  return query
  with realiz as (
    select cc.id, cc.nome,
      coalesce(sum(l.valor), 0) as total,
      coalesce((select sum(o.valor_planejado) from fin_orcamentos o
                where o.centro_custo_id = cc.id and o.ano = v_ano), 0) as orcado
    from fin_centros_custo cc
    left join fin_lancamentos l on l.centro_custo_id = cc.id
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and extract(year from l.data) = v_ano
    group by cc.id, cc.nome
  )
  select
    case when r.total / nullif(r.orcado, 0) > 1 then 'alta' else 'media' end,
    'orcamento'::text,
    format('Orçamento %s', r.nome),
    format('R$ %s realizado de R$ %s (%s%%)',
      public.fmt_brl(r.total),
      public.fmt_brl(r.orcado),
      public.fmt_brl(r.total / nullif(r.orcado, 0) * 100, 1))
  from realiz r
  where r.orcado > 0 and r.total / r.orcado > 0.9;

  -- Obrigações fiscais atrasadas
  begin
    return query
    select
      'alta'::text, 'fiscal'::text,
      format('%s obrigação(ões) fiscal(is) ATRASADA(S)', count(*)::text),
      'Veja em /financas/fiscal'::text
    from fiscal_agenda
    where status = 'atrasado'
    having count(*) > 0;
  exception when others then null;
  end;
end; $function$;
