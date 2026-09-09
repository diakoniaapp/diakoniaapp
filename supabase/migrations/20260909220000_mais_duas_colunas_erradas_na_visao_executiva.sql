-- ─── Visão Executiva: mais três erros que a migration anterior não pegou ───
--
-- A migration 20260909210000 corrigiu `fin_exec_alertas()` (coluna
-- `o.valor` → `o.valor_planejado`) e, com isso, a tela deixou de renderizar
-- com TUDO em zero em silêncio. Só que renderizar de verdade revelou outros
-- erros que estavam escondidos atrás do mesmo `Promise.all` sem `.catch` —
-- agora substituído por `Promise.allSettled` no componente, que isola cada
-- fonte e avisa quando uma falha em vez de apagar a tela inteira. Achados
-- um a um, ensaiando cada correção com BEGIN/ROLLBACK antes de aplicar.
--
-- 1) `fin_exec_centros_ano()` — MESMO erro da migration anterior, função
--    diferente: `select sum(o.valor) from fin_orcamentos o` — a coluna
--    certa é `valor_planejado`. Alimenta "Top 5 centros de custo".
--
-- 2) `fin_exec_saldo_consolidado()` — `status = 'a_pagar'`, um valor que
--    não existe em `fin_lancamento_status` (os valores reais são
--    `previsto, realizado, conciliado, cancelado, aguardando_aprovacao`,
--    conferido ao vivo). `fin_alertas_financeiros()` já usa `'previsto'`
--    pra dizer exatamente "conta prevista, ainda não paga" — é o mesmo
--    conceito, com o nome certo.
--
-- 3) Na mesma função, `data_vencimento` — coluna que não existe em
--    `fin_lancamentos` (a data ali é só `data`, a mesma que
--    `fin_alertas_financeiros()` já usa pra "vencimentos próximos"). Só
--    apareceu na segunda rodada de ensaio, depois de corrigir o `status` —
--    o erro anterior escondia este.
--
-- As duas juntas alimentavam "Saldo total" e as três previsões (30/60/90
-- dias) do topo da tela.

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
      and extract(year from l.data_competencia) = v_ano
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

CREATE OR REPLACE FUNCTION public.fin_exec_saldo_consolidado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_saldo_atual numeric := 0;
  v_a_pagar_30 numeric := 0;
  v_a_receber_30 numeric := 0;
  v_a_pagar_60 numeric := 0;
  v_a_pagar_90 numeric := 0;
  v_qtd_contas int := 0;
begin
  -- saldo somando todas as contas (saldo_inicial + realizados/conciliados)
  select coalesce(sum(c.saldo_inicial), 0) into v_saldo_atual from fin_contas c;
  select v_saldo_atual + coalesce(sum(case when tipo='entrada' then valor else -valor end), 0)
    into v_saldo_atual
  from fin_lancamentos
  where status in ('realizado','conciliado');

  -- contagens pra previsão
  select count(*) into v_qtd_contas from fin_contas;

  select coalesce(sum(valor), 0) into v_a_pagar_30
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 30;

  select coalesce(sum(valor), 0) into v_a_pagar_60
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 60;

  select coalesce(sum(valor), 0) into v_a_pagar_90
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 90;

  select coalesce(sum(valor), 0) into v_a_receber_30
  from fin_lancamentos
  where status = 'previsto' and tipo = 'entrada'
    and data between current_date and current_date + 30;

  return jsonb_build_object(
    'saldo_atual', v_saldo_atual,
    'qtd_contas', v_qtd_contas,
    'a_pagar_30d', v_a_pagar_30,
    'a_receber_30d', v_a_receber_30,
    'previsao_30d', v_saldo_atual + v_a_receber_30 - v_a_pagar_30,
    'previsao_60d', v_saldo_atual - v_a_pagar_60,
    'previsao_90d', v_saldo_atual - v_a_pagar_90
  );
end; $function$;
