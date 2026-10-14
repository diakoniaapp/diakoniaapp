-- APLICAÇÃO DEFINITIVA da Fase 1C-f (DESPESA DE COMPETÊNCIA: a oferta passa a contar nos relatórios de despesa) — só depois do "pode aplicar" dela. PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- GRAVA: atualiza 8 funções e 2 visões de COMPETÊNCIA (despesa por categoria/centro, orçamento × real, top fornecedores, anomalias, alertas), cada uma = a definição viva do banco com UMA mudança (inclui quitado_terceiro como despesa).
-- Os relatórios de CAIXA (saldo, fluxo, comparativo, resumo do mês) NÃO mudam. NENHUM dado é alterado; hoje não há oferta no banco, então todos os resultados atuais ficam idênticos.
-- Idêntico a supabase/migrations/20261015140000. Pode rodar mais de uma vez. Para desfazer: docs/QUITACAO_1C_F_ROLLBACK.sql.
-- Antes de rodar: rode docs/QUITACAO_1C_F_ENSAIO.sql e confira "TUDO OK, pode aplicar".
-- TRAVA DE PRÉ-REQUISITOS: se faltar alguma fase anterior, este arquivo para aqui, com a mensagem do que aplicar antes, e NÃO grava nada.
DO $pre$ BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1A antes desta: rode docs/QUITACAO_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1B antes desta: rode docs/QUITACAO_1B_M0_APLICAR.sql (sozinho) e depois docs/QUITACAO_1B_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1C-a antes desta: rode docs/QUITACAO_1C_A_APLICAR.sql.'; END IF;
END $pre$;

-- ─── Fase 1C-f: os relatórios de COMPETÊNCIA passam a contar a OFERTA como despesa — o caixa não muda ─────────────────────────────────────────────────────────────────────
-- Depende da 1A, do M0, da 1B e da 1C-a (aplicadas ANTES). Nenhum dado existente é alterado.
--
-- A regra (Política, seção 8; aprovada em 13/10/2026): a compra ofertada por um terceiro (`quitado_terceiro`) é despesa da igreja, mas NÃO moveu caixa nem banco. Então:
--   · relatórios de COMPETÊNCIA (despesa por categoria, por centro, orçamento × real, top fornecedores, anomalias, alertas de centro e de orçamento) CONTAM a oferta como despesa;
--   · relatórios de CAIXA (saldo das contas, fluxo de 12 meses, comparativo de meses, resumo do mês, indicadores de receita, Sustento) NÃO mudam: o saldo só soma realizado e conciliado.
--   Nenhuma linha de "receita de doação não monetária" entra em lugar nenhum até a contabilidade definir a conta: o resultado do período fica menor pelo valor das ofertas, sem que o saldo mude.
--
-- Cada função e cada visão abaixo é a definição VIVA do banco (pg_get_functiondef / pg_get_viewdef, lida em 13/10/2026), com UMA mudança cirúrgica: onde o filtro era
--   l.status in ('realizado','conciliado')   (despesa)    passa a ser   … or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida')
-- Nada foi redigitado. Hoje não existe nenhuma oferta no banco, então TODOS os resultados atuais ficam idênticos (o ensaio compara por hash).
-- Fora desta entrega, de propósito: a pauta financeira (mistura caixa e competência; fica para quando houver o primeiro caso real), a prestação de contas (é caixa: tem saldo), e as telas que só leem saldo.
-- Reversível: docs/QUITACAO_1C_F_ROLLBACK.sql (devolve as definições originais).

-- ── funcao_fin_alertas_centros ──
CREATE OR REPLACE FUNCTION public.fin_alertas_centros()
 RETURNS TABLE(centro_id uuid, centro_nome text, tipo_alerta text, titulo text, descricao text, severidade text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  -- 1) Acima do orçamento (≥ 100%)
  select o.centro_custo_id, o.centro_nome, 'acima_orcamento',
         'Acima do orçamento',
         o.centro_nome || ': ' || public.fmt_brl(o.percentual_consumido, 1) || '% do orçamento (R$ ' ||
           public.fmt_brl(o.valor_real) || ' de R$ ' || public.fmt_brl(o.valor_planejado) || ')',
         'critico'
  from public.vw_fin_orcamento_vs_real o
  where o.percentual_consumido >= 100

  union all

  -- 2) 80%+ do orçamento (atenção)
  select o.centro_custo_id, o.centro_nome, 'orcamento_atencao',
         'Orçamento em alerta',
         o.centro_nome || ': ' || public.fmt_brl(o.percentual_consumido, 1) || '% consumido',
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
          and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
          and l.data >= current_date - interval '30 days'
      ), 0) > 1.4 * coalesce((
        select sum(l.valor) / 3.0 from public.fin_lancamentos l
        where l.centro_custo_id = cc.id and l.tipo = 'saida'
          and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
          and l.data >= current_date - interval '120 days'
          and l.data <  current_date - interval '30 days'
      ), 0)
    )
    and coalesce((
      select sum(l.valor) from public.fin_lancamentos l
      where l.centro_custo_id = cc.id and l.tipo = 'saida'
        and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
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
$function$;

-- ── funcao_fin_anomalias_mes ──
CREATE OR REPLACE FUNCTION public.fin_anomalias_mes(p_ano integer DEFAULT NULL::integer, p_mes integer DEFAULT NULL::integer)
 RETURNS TABLE(categoria_id uuid, categoria_nome text, tipo text, valor_mes numeric, media_6m numeric, variacao_pct numeric, severidade text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
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
    where (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida')) and l.categoria_id is not null
    group by l.categoria_id, k.nome, k.tipo
  ),
  -- Média dos 6 meses anteriores
  historico as (
    select l.categoria_id,
           sum(l.valor) / 6.0 as media_6m
    from public.fin_lancamentos l, base b
    where (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida')) and l.categoria_id is not null
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
$function$;

-- ── funcao_fin_categoria_resumo ──
CREATE OR REPLACE FUNCTION public.fin_categoria_resumo(p_categoria_id uuid, p_de date, p_ate date)
 RETURNS TABLE(executado numeric, periodo_anterior numeric, total_classificado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  with dias as (
    select (p_ate - p_de + 1) as qtd
  ),
  executado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.categoria_id = p_categoria_id
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  ),
  anterior as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l, dias
    where l.categoria_id = p_categoria_id
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between (p_de - dias.qtd) and (p_de - 1)
  ),
  classificado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.categoria_id is not null
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  )
  select e.total, a.total, c.total
  from executado e, anterior a, classificado c;
$function$;

-- ── funcao_fin_categorias_ranking ──
CREATE OR REPLACE FUNCTION public.fin_categorias_ranking(p_de date, p_ate date)
 RETURNS TABLE(categoria_id uuid, nome text, valor numeric, colocacao bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  with por_categoria as (
    select
      c.id as categoria_id,
      c.nome,
      coalesce(sum(l.valor), 0)::numeric(12,2) as valor
    from fin_categorias c
    join fin_lancamentos l on l.categoria_id = c.id
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
    where c.tipo = 'saida'
    group by c.id, c.nome
    having coalesce(sum(l.valor), 0) > 0
  )
  select
    categoria_id, nome, valor,
    row_number() over (order by valor desc) as colocacao
  from por_categoria
  order by valor desc;
$function$;

-- ── funcao_fin_centro_resumo ──
CREATE OR REPLACE FUNCTION public.fin_centro_resumo(p_centro_id uuid, p_de date, p_ate date)
 RETURNS TABLE(executado numeric, periodo_anterior numeric, total_classificado numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  with escopo as (
    select id from fin_centros_custo where id = p_centro_id
    union
    select id from fin_centros_custo where centro_pai_id = p_centro_id
  ),
  dias as (
    select (p_ate - p_de + 1) as qtd
  ),
  executado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.centro_custo_id in (select id from escopo)
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  ),
  anterior as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l, dias
    where l.centro_custo_id in (select id from escopo)
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between (p_de - dias.qtd) and (p_de - 1)
  ),
  classificado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.centro_custo_id is not null
      and l.tipo = 'saida'
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  )
  select e.total, a.total, c.total
  from executado e, anterior a, classificado c;
$function$;

-- ── funcao_fin_top_fornecedores ──
CREATE OR REPLACE FUNCTION public.fin_top_fornecedores(p_n integer DEFAULT 10, p_dias integer DEFAULT 90)
 RETURNS TABLE(fornecedor_id uuid, fornecedor_nome text, total numeric, qtd_lancamentos integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select
    l.fornecedor_id,
    f.nome,
    sum(l.valor) as total,
    count(l.id)::int as qtd
  from public.fin_lancamentos l
  join public.fin_fornecedores f on f.id = l.fornecedor_id
  where l.tipo = 'saida'
    and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
    and l.data >= current_date - (p_dias || ' days')::interval
  group by l.fornecedor_id, f.nome
  order by total desc
  limit p_n;
$function$;

-- ── funcao_fin_exec_centros_ano ──
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
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
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

-- ── funcao_fin_exec_alertas ──
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
      and (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida'))
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

-- ── view_vw_fin_centros_resumo ──
CREATE OR REPLACE VIEW public.vw_fin_centros_resumo AS  SELECT id,
    nome,
    vinculo_tipo,
    vinculo_id,
    vinculo_nome,
    centro_pai_id,
    cor,
    ativo,
    COALESCE(( SELECT sum(l.valor) AS sum
           FROM fin_lancamentos l
          WHERE (((l.centro_custo_id = cc.id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = cc.id)))) AND (l.tipo = 'saida'::fin_movimento_tipo) AND ((l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status])) OR (l.status::text = 'quitado_terceiro'::text)) AND (l.data >= (CURRENT_DATE - '90 days'::interval)))), (0)::numeric) AS gasto_90d,
    COALESCE(( SELECT sum(l.valor) AS sum
           FROM fin_lancamentos l
          WHERE (((l.centro_custo_id = cc.id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = cc.id)))) AND (l.tipo = 'entrada'::fin_movimento_tipo) AND (l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status])) AND (l.data >= (CURRENT_DATE - '90 days'::interval)))), (0)::numeric) AS recebido_90d,
    COALESCE(( SELECT sum(l.valor) AS sum
           FROM fin_lancamentos l
          WHERE (((l.centro_custo_id = cc.id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = cc.id)))) AND (l.tipo = 'saida'::fin_movimento_tipo) AND ((l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status])) OR (l.status::text = 'quitado_terceiro'::text)) AND (l.data >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))), (0)::numeric) AS gasto_mes,
    (COALESCE(( SELECT count(l.id) AS count
           FROM fin_lancamentos l
          WHERE (((l.centro_custo_id = cc.id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = cc.id)))) AND (l.data >= (CURRENT_DATE - '90 days'::interval)))), (0)::bigint))::integer AS qtd_lancamentos_90d,
    ( SELECT max(l.data) AS max
           FROM fin_lancamentos l
          WHERE ((l.centro_custo_id = cc.id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = cc.id))))) AS ultima_movimentacao
   FROM fin_centros_custo cc
  WHERE ativo;

-- ── view_vw_fin_orcamento_vs_real ──
CREATE OR REPLACE VIEW public.vw_fin_orcamento_vs_real AS  WITH mes_atual AS (
         SELECT (EXTRACT(year FROM CURRENT_DATE))::integer AS ano,
            (EXTRACT(month FROM CURRENT_DATE))::integer AS mes,
            (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date AS ini,
            ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon -1 days'::interval))::date AS fim
        )
 SELECT o.id,
    o.ano,
    o.mes,
    o.centro_custo_id,
    o.categoria_id,
    cc.nome AS centro_nome,
    o.valor_planejado,
    COALESCE(( SELECT sum(l.valor) AS sum
           FROM fin_lancamentos l,
            mes_atual m
          WHERE (((l.centro_custo_id = o.centro_custo_id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                   FROM fin_centros_custo
                  WHERE (fin_centros_custo.centro_pai_id = o.centro_custo_id)))) AND ((o.categoria_id IS NULL) OR (l.categoria_id = o.categoria_id)) AND (l.tipo = 'saida'::fin_movimento_tipo) AND ((l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status])) OR (l.status::text = 'quitado_terceiro'::text)) AND (l.data >= m.ini) AND (l.data <= m.fim))), (0)::numeric) AS valor_real,
        CASE
            WHEN (o.valor_planejado = (0)::numeric) THEN (0)::numeric
            ELSE round(((100.0 * COALESCE(( SELECT sum(l.valor) AS sum
               FROM fin_lancamentos l,
                mes_atual m
              WHERE (((l.centro_custo_id = o.centro_custo_id) OR (l.centro_custo_id IN ( SELECT fin_centros_custo.id
                       FROM fin_centros_custo
                      WHERE (fin_centros_custo.centro_pai_id = o.centro_custo_id)))) AND ((o.categoria_id IS NULL) OR (l.categoria_id = o.categoria_id)) AND (l.tipo = 'saida'::fin_movimento_tipo) AND ((l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status])) OR (l.status::text = 'quitado_terceiro'::text)) AND (l.data >= m.ini) AND (l.data <= m.fim))), (0)::numeric)) / o.valor_planejado), 1)
        END AS percentual_consumido
   FROM ((fin_orcamentos o
     JOIN fin_centros_custo cc ON ((cc.id = o.centro_custo_id)))
     CROSS JOIN mes_atual ma)
  WHERE (((o.mes IS NULL) OR (o.mes = ma.mes)) AND (o.ano = ma.ano));

