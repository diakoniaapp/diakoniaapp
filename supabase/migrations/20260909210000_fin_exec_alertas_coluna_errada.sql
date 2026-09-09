-- ─── fin_exec_alertas: coluna errada travava a Visão Executiva inteira ─────
--
-- Achado ao continuar a verificação de outros painéis (09/09/2026): a Visão
-- Executiva (/financas/executivo) abria com TUDO zerado — "Saldo total
-- R$ 0,00", "Sem dados ainda" no fluxo de caixa, "Nenhuma categoria
-- identificada" nos indicadores, "Tudo em ordem — sem alertas críticos" —
-- mesmo com lançamentos reais no banco.
--
-- A causa: `fin_exec_alertas()` referenciava `o.valor` em `fin_orcamentos o`,
-- e essa coluna não existe — o nome real é `valor_planejado`. A RPC
-- devolvia erro 400 ("column o.valor does not exist"), e
-- `dashboardExecutivoService.buscarAlertasExecutivos()` propaga esse erro
-- (`if (error) throw error`). Como `DashboardExecutivo.tsx` chama as cinco
-- fontes da tela num `Promise.all` sem `.catch`, UM erro rejeitava o
-- `Promise.all` inteiro — nenhum dos outros `then(setX)` rodava, e a tela
-- renderizava só com o estado inicial (tudo em zero/vazio), sem avisar que
-- havia um erro. "Tudo em ordem" não era verdade: era a tela nem ter
-- carregado.
--
-- Esta migration corrige só a coluna. A resiliência do `Promise.all` (pra
-- um erro futuro não voltar a apagar a tela inteira em silêncio) é consertada
-- no componente, não no banco — ver o commit que acompanha esta migration.

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
      and extract(year from l.data_competencia) = v_ano
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
