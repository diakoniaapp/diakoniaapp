-- ─── Transferência entre contas: NULL-safe + Visão Executiva ─────────────
--
-- Pedido da Telma: "verifique em todo o sistema financeiro se há este bug
-- em outras telas" (o bug de 12/09/2026: transferência entre contas
-- contando como receita/despesa real, já corrigido em vw_fin_resumo_mes,
-- dreService.gerarDRE, resumoMensal e FinancasDoacoes).
--
-- Auditoria de hoje (13/09/2026) leu as 9 funções fin_*/fin_exec_* que
-- alimentam Insights e Visão Executiva via pg_get_functiondef (nenhuma
-- tem migration própria no repositório — puro drift, mesmo achado já
-- registrado no roadmap). Resultado:
--
--   fin_anomalias_mes               SEGURO — exige categoria_id (transferência não tem)
--   fin_exec_alertas                SEGURO — a parte de orçamento exige centro_custo_id
--   fin_exec_centros_ano            SEGURO — exige centro_custo_id
--   fin_exec_indicadores_eclesiasticos SEGURO — exige categoria_id
--   fin_exec_saldo_consolidado      SEGURO — soma TODAS as contas juntas, as duas pernas se cancelam
--   fin_previsao_caixa              SEGURO — só olha status='previsto'; transferência nasce 'realizado'
--   fin_top_fornecedores            SEGURO — exige fornecedor_id
--   fin_comparativo_meses           ⚠ BUG — soma entrada/saída por mês sem nenhum dos filtros acima
--   fin_exec_fluxo_12m              ⚠ BUG — mesmo formato, alimenta o gráfico de 12 meses da Visão Executiva
--
-- Corrigidas as duas. De brinde, `l.origem <> 'transferencia'` (usado
-- aqui e em vw_fin_resumo_mes desde 12/09) não é NULL-safe: `origem` É
-- nullable (conferido: `is_nullable = YES`, default `'manual'`), e um
-- valor NULL futuro sumiria da soma em vez de contar como lançamento
-- normal. Hoje as 8 linhas de produção não têm NULL (6 'manual' + 2
-- 'transferencia'), então não mudou nada agora — mas trocado por
-- `IS DISTINCT FROM` nas três funções (as duas novas + vw_fin_resumo_mes)
-- pra não vazar o mesmo defeito de novo no futuro.
--
-- Ensaiado com BEGIN...ROLLBACK antes de aplicar; conferido ao vivo:
-- fin_comparativo_meses(3) caiu de entradas=4222,00/saidas=2050,00 pra
-- 2222,00/50,00 em setembro/2026, batendo com a DRE e o malote já
-- corrigidos.

CREATE OR REPLACE VIEW public.vw_fin_resumo_mes AS
 WITH mes_atual AS (
         SELECT date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date AS ini,
            (date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) + '1 mon -1 days'::interval)::date AS fim
        )
 SELECT ( SELECT COALESCE(sum(fin_contas.saldo_atual), 0::numeric) AS "coalesce"
           FROM fin_contas
          WHERE fin_contas.ativo) AS saldo_total,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'entrada'::fin_movimento_tipo AND l.origem IS DISTINCT FROM 'transferencia'::text AND l.data >= m.ini AND l.data <= m.fim AND (l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status]))) AS entradas_mes,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'saida'::fin_movimento_tipo AND l.origem IS DISTINCT FROM 'transferencia'::text AND l.data >= m.ini AND l.data <= m.fim AND (l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status]))) AS saidas_mes,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'saida'::fin_movimento_tipo AND l.status = 'previsto'::fin_lancamento_status AND l.data >= CURRENT_DATE AND l.data <= m.fim) AS previstas_mes;

CREATE OR REPLACE FUNCTION public.fin_comparativo_meses(p_n integer DEFAULT 6)
 RETURNS TABLE(ano integer, mes integer, rotulo text, entradas numeric, saidas numeric, resultado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
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
               and l.tipo = 'entrada' and l.status in ('realizado','conciliado')
               and l.origem is distinct from 'transferencia'), 0) as entradas,
           coalesce((select sum(l.valor) from public.fin_lancamentos l
             where l.data >= m.ini and l.data < (m.ini + interval '1 month')
               and l.tipo = 'saida' and l.status in ('realizado','conciliado')
               and l.origem is distinct from 'transferencia'), 0) as saidas
    from meses m
  )
  select ano, mes, rotulo, entradas, saidas, (entradas - saidas) as resultado
  from agreg
  order by ini;
$function$;

CREATE OR REPLACE FUNCTION public.fin_exec_fluxo_12m()
 RETURNS TABLE(mes date, rotulo text, entradas numeric, saidas numeric, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_mes date;
begin
  v_mes := date_trunc('month', current_date - interval '11 months')::date;
  for i in 0..11 loop
    return query
    select
      v_mes,
      to_char(v_mes, 'Mon/YY'),
      coalesce(sum(case when l.tipo='entrada' then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='saida'   then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='entrada' then l.valor else -l.valor end), 0)::numeric(12,2)
    from fin_lancamentos l
    where l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and date_trunc('month', l.data_competencia) = v_mes;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
end; $function$;
