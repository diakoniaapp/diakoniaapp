-- Item 8 (refinamento, 22/09/2026): a variação % de Dízimos/Ofertas
-- comparava MÊS FECHADO (agosto, 31 dias) contra MÊS EM ANDAMENTO
-- (setembro, só até o dia de hoje) — mostrava "-42,5%" quando, medido
-- justo (mesmo número de dias decorridos em cada mês), a queda real era
-- de ~-18%. Achado ao vivo pela Telma perguntando "a queda de dizimista
-- é com base no extrato de setembro?" — a resposta era "compara 22 dias
-- contra 31", não uma queda real do tamanho mostrado.
--
-- Medido antes desta correção: setembro (dia 1 a 22) = R$ 36.928,76;
-- agosto inteiro = R$ 64.220,06 (dá -42,5%); agosto só até o dia 22 =
-- R$ 44.969,44 (dá -17,9%, a comparação correta).
--
-- Correção: `total_mes_anterior` passa a somar só do dia 1 até o MESMO
-- dia do mês corrente (`current_date - interval '1 month'`), em vez do
-- mês anterior inteiro. `total_mes_atual` não muda — já era naturalmente
-- "do dia 1 até hoje", porque não existe lançamento no futuro.
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
      sum(case when b.data >= date_trunc('month', current_date - interval '1 month')
                 and b.data <= (current_date - interval '1 month')
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
