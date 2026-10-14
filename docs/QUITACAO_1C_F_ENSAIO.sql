-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1C-f da Quitação (migration 20261015140000) contra os dados REAIS — os relatórios de COMPETÊNCIA contam a oferta; o CAIXA não muda ───────────────────────────────────
-- PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- Dentro de uma transação que será desfeita: (1) fotografa o resultado de TODAS as funções e visões que a migration toca e de três de CAIXA (controle), roda a migration e confere que NADA mudou (hoje
-- não há oferta no banco); (2) cria uma oferta sintética de R$ 321,45 (prova Formal, extinta) e confere que a despesa por categoria, por centro, o ranking, o top de fornecedores e a visão de centros
-- sobem EXATAMENTE 321,45; (3) confere que o CAIXA (comparativo de meses, fluxo de 12 meses, resumo do mês e o saldo de todas as contas) fica IDÊNTICO. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; st text; n bigint;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; cat uuid; centro uuid; l1 uuid; q1 uuid;
  d0 date := date_trunc('month', current_date)::date; d1 date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  a text; b text; c text; d text; e text; f text; g text; h text; i text; j text; k text;
  a2 text; b2 text; c2 text; d2 text; e2 text; f2 text; g2 text; h2 text; i2 text; j2 text; k2 text;
  cat0 numeric; cen0 numeric; rank0 numeric; top0 numeric; gm0 numeric; cat1 numeric; cen1 numeric; rank1 numeric; top1 numeric; gm1 numeric;
  cx0 text; cx1 text; cy0 text; cy1 text; cz0 text; cz1 text; sd0 text; sd1 text;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 1B ainda não foi aplicada: rode docs/QUITACAO_1B_APLICAR.sql antes deste ensaio.'; END IF;

  -- um calculador de hash do resultado de uma consulta (existe só dentro da transação)
  EXECUTE $f$CREATE FUNCTION pg_temp.hq(q text) RETURNS text LANGUAGE plpgsql AS $x$
    DECLARE r text; BEGIN EXECUTE 'SELECT md5(coalesce(string_agg(t::text, ''|'' ORDER BY t::text), '''')) FROM (' || q || ') t' INTO r; RETURN r; END $x$$f$;

  -- ── antes: o resultado de cada peça que a migration toca ──
  a := pg_temp.hq('SELECT * FROM public.fin_categorias_ranking(date ''2000-01-01'', date ''2099-12-31'')');
  b := pg_temp.hq('SELECT * FROM public.fin_top_fornecedores(500, 20000)');
  c := pg_temp.hq('SELECT * FROM public.fin_alertas_centros()');
  d := pg_temp.hq('SELECT * FROM public.fin_exec_alertas()');
  e := pg_temp.hq('SELECT * FROM public.fin_exec_centros_ano()');
  f := pg_temp.hq('SELECT * FROM public.fin_anomalias_mes(NULL, NULL)');
  g := pg_temp.hq('SELECT * FROM public.vw_fin_centros_resumo');
  h := pg_temp.hq('SELECT * FROM public.vw_fin_orcamento_vs_real');
  i := pg_temp.hq('SELECT r.* FROM public.fin_categorias k, LATERAL public.fin_categoria_resumo(k.id, date ''2000-01-01'', date ''2099-12-31'') r WHERE k.tipo::text = ''saida''');
  j := pg_temp.hq('SELECT r.* FROM public.fin_centros_custo k, LATERAL public.fin_centro_resumo(k.id, date ''2000-01-01'', date ''2099-12-31'') r');
  cx0 := pg_temp.hq('SELECT * FROM public.fin_comparativo_meses(12)');
  cy0 := pg_temp.hq('SELECT * FROM public.vw_fin_resumo_mes');
  cz0 := pg_temp.hq('SELECT * FROM public.fin_exec_fluxo_12m(NULL, NULL)');
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO sd0 FROM public.fin_contas;

  -- ── a migration inteira ──
  -- comando 1 de 10 da migration
  EXECUTE $m1$CREATE OR REPLACE FUNCTION public.fin_alertas_centros()
 RETURNS TABLE(centro_id uuid, centro_nome text, tipo_alerta text, titulo text, descricao text, severidade text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select o.centro_custo_id, o.centro_nome, 'acima_orcamento',
         'Acima do orçamento',
         o.centro_nome || ': ' || public.fmt_brl(o.percentual_consumido, 1) || '% do orçamento (R$ ' ||
           public.fmt_brl(o.valor_real) || ' de R$ ' || public.fmt_brl(o.valor_planejado) || ')',
         'critico'
  from public.vw_fin_orcamento_vs_real o
  where o.percentual_consumido >= 100

  union all

  select o.centro_custo_id, o.centro_nome, 'orcamento_atencao',
         'Orçamento em alerta',
         o.centro_nome || ': ' || public.fmt_brl(o.percentual_consumido, 1) || '% consumido',
         'atencao'
  from public.vw_fin_orcamento_vs_real o
  where o.percentual_consumido >= 80 and o.percentual_consumido < 100

  union all

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
$function$;$m1$;
  -- comando 2 de 10 da migration
  EXECUTE $m2$CREATE OR REPLACE FUNCTION public.fin_anomalias_mes(p_ano integer DEFAULT NULL::integer, p_mes integer DEFAULT NULL::integer)
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
  atual as (
    select l.categoria_id, k.nome, k.tipo::text,
           sum(l.valor) as valor_mes
    from public.fin_lancamentos l
    join base b on l.data between b.ini_mes and b.fim_mes
    left join public.fin_categorias k on k.id = l.categoria_id
    where (l.status in ('realizado','conciliado') or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida')) and l.categoria_id is not null
    group by l.categoria_id, k.nome, k.tipo
  ),
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
$function$;$m2$;
  -- comando 3 de 10 da migration
  EXECUTE $m3$CREATE OR REPLACE FUNCTION public.fin_categoria_resumo(p_categoria_id uuid, p_de date, p_ate date)
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
$function$;$m3$;
  -- comando 4 de 10 da migration
  EXECUTE $m4$CREATE OR REPLACE FUNCTION public.fin_categorias_ranking(p_de date, p_ate date)
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
$function$;$m4$;
  -- comando 5 de 10 da migration
  EXECUTE $m5$CREATE OR REPLACE FUNCTION public.fin_centro_resumo(p_centro_id uuid, p_de date, p_ate date)
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
$function$;$m5$;
  -- comando 6 de 10 da migration
  EXECUTE $m6$CREATE OR REPLACE FUNCTION public.fin_top_fornecedores(p_n integer DEFAULT 10, p_dias integer DEFAULT 90)
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
$function$;$m6$;
  -- comando 7 de 10 da migration
  EXECUTE $m7$CREATE OR REPLACE FUNCTION public.fin_exec_centros_ano()
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
end; $function$;$m7$;
  -- comando 8 de 10 da migration
  EXECUTE $m8$CREATE OR REPLACE FUNCTION public.fin_exec_alertas()
 RETURNS TABLE(severidade text, categoria text, mensagem text, detalhe text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_ano int := extract(year from current_date)::int;
begin
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
end; $function$;$m8$;
  -- comando 9 de 10 da migration
  EXECUTE $m9$CREATE OR REPLACE VIEW public.vw_fin_centros_resumo AS  SELECT id,
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
  WHERE ativo;$m9$;
  -- comando 10 de 10 da migration
  EXECUTE $m10$CREATE OR REPLACE VIEW public.vw_fin_orcamento_vs_real AS  WITH mes_atual AS (
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
  WHERE (((o.mes IS NULL) OR (o.mes = ma.mes)) AND (o.ano = ma.ano));$m10$;

  -- ── depois: nada mudou (hoje não há oferta no banco) ──
  a2 := pg_temp.hq('SELECT * FROM public.fin_categorias_ranking(date ''2000-01-01'', date ''2099-12-31'')');
  b2 := pg_temp.hq('SELECT * FROM public.fin_top_fornecedores(500, 20000)');
  c2 := pg_temp.hq('SELECT * FROM public.fin_alertas_centros()');
  d2 := pg_temp.hq('SELECT * FROM public.fin_exec_alertas()');
  e2 := pg_temp.hq('SELECT * FROM public.fin_exec_centros_ano()');
  f2 := pg_temp.hq('SELECT * FROM public.fin_anomalias_mes(NULL, NULL)');
  g2 := pg_temp.hq('SELECT * FROM public.vw_fin_centros_resumo');
  h2 := pg_temp.hq('SELECT * FROM public.vw_fin_orcamento_vs_real');
  i2 := pg_temp.hq('SELECT r.* FROM public.fin_categorias k, LATERAL public.fin_categoria_resumo(k.id, date ''2000-01-01'', date ''2099-12-31'') r WHERE k.tipo::text = ''saida''');
  j2 := pg_temp.hq('SELECT r.* FROM public.fin_centros_custo k, LATERAL public.fin_centro_resumo(k.id, date ''2000-01-01'', date ''2099-12-31'') r');
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE status::text = 'quitado_terceiro';
  IF a = a2 AND b = b2 AND c = c2 AND d = d2 AND e = e2 AND f = f2 AND g = g2 AND h = h2 AND i = i2 AND j = j2 THEN
    rel := format('ANTES e DEPOIS da migration: os 10 resultados (ranking de categorias, top fornecedores, alertas de centro, alertas executivos, centros do ano, anomalias, resumo de centros, orçamento × real, resumo por categoria e por centro) são IDÊNTICOS — hoje há %s obrigação(ões) quitada(s) por terceiro no banco.', n);
  ELSE ok := false; rel := format('FALHOU: algum resultado mudou sem haver oferta (ranking %s, top %s, alertas centro %s, alertas exec %s, centros ano %s, anomalias %s, resumo centros %s, orçamento %s, categoria %s, centro %s).', a = a2, b = b2, c = c2, d = d2, e = e2, f = f2, g = g2, h = h2, i = i2, j = j2); END IF;

  -- ── o teste ao vivo, com um administrador real (desfeito no fim) ──
  SELECT ur.user_id INTO uid FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id WHERE ur.role::text = 'admin' AND pr.pessoa_id IS NOT NULL LIMIT 1;
  IF uid IS NULL THEN SELECT user_id INTO uid FROM public.user_roles WHERE role::text = 'admin' LIMIT 1; END IF;
  IF uid IS NULL THEN
    rel := rel || ' (nenhum administrador encontrado: o teste ao vivo ficou de fora).';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    SELECT pessoa_id INTO pessoa_adm FROM public.profiles WHERE id = uid;
    SELECT id INTO conta FROM public.fin_contas ORDER BY id LIMIT 1;
    SELECT id INTO emit FROM public.fin_fornecedores ORDER BY id LIMIT 1;
    SELECT id INTO cat FROM public.fin_categorias WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;
    SELECT id INTO centro FROM public.fin_centros_custo WHERE ativo ORDER BY id LIMIT 1;
    SELECT m.id INTO pessoa_x FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm ORDER BY m.id LIMIT 1;

    SELECT executado INTO cat0 FROM public.fin_categoria_resumo(cat, d0, d1);
    SELECT executado INTO cen0 FROM public.fin_centro_resumo(centro, d0, d1);
    SELECT COALESCE(sum(valor), 0) INTO rank0 FROM public.fin_categorias_ranking(d0, d1) WHERE categoria_id = cat;
    SELECT COALESCE(sum(total), 0) INTO top0 FROM public.fin_top_fornecedores(500, 40) WHERE fornecedor_id = emit;
    SELECT COALESCE(gasto_mes, 0) INTO gm0 FROM public.vw_fin_centros_resumo WHERE id = centro;
    cx0 := pg_temp.hq('SELECT * FROM public.fin_comparativo_meses(12)');
    cy0 := pg_temp.hq('SELECT * FROM public.vw_fin_resumo_mes');
    cz0 := pg_temp.hq('SELECT * FROM public.fin_exec_fluxo_12m(NULL, NULL)');
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO sd0 FROM public.fin_contas;

    -- a oferta: R$ 321,45, prova Formal (nota + comprovante do terceiro + declaração) ⇒ extinta (quitado_terceiro)
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date, 321.45, 'ENSAIO 1C-f oferta', emit, 'manual', cat, centro) RETURNING id INTO l1;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf.pdf'), (l1, 'prova_pagamento_terceiro', 'p.pdf'), (l1, 'declaracao_terceiro', 'd.pdf');
      q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_x, NULL, 'oferta', current_date - 3, current_date - 2, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
      IF st <> 'quitado_terceiro' THEN ok := false; rel := rel || format(' FALHOU na montagem: a oferta Formal não extinguiu (status %s).', st); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU na montagem: ' || SQLERRM; END;

    SELECT executado INTO cat1 FROM public.fin_categoria_resumo(cat, d0, d1);
    SELECT executado INTO cen1 FROM public.fin_centro_resumo(centro, d0, d1);
    SELECT COALESCE(sum(valor), 0) INTO rank1 FROM public.fin_categorias_ranking(d0, d1) WHERE categoria_id = cat;
    SELECT COALESCE(sum(total), 0) INTO top1 FROM public.fin_top_fornecedores(500, 40) WHERE fornecedor_id = emit;
    SELECT COALESCE(gasto_mes, 0) INTO gm1 FROM public.vw_fin_centros_resumo WHERE id = centro;
    IF cat1 - cat0 = 321.45 AND cen1 - cen0 = 321.45 AND rank1 - rank0 = 321.45 AND top1 - top0 = 321.45 AND gm1 - gm0 = 321.45 THEN
      rel := rel || ' COMPETÊNCIA ok (a oferta de 321,45 entrou, e só ela, na despesa por categoria, por centro, no ranking de categorias, no top de fornecedores e no gasto do mês do centro).';
    ELSE ok := false; rel := rel || format(' FALHOU competência: categoria %s, centro %s, ranking %s, top fornecedores %s, gasto do mês %s (esperado +321,45 em cada).', cat1 - cat0, cen1 - cen0, rank1 - rank0, top1 - top0, gm1 - gm0); END IF;

    cx1 := pg_temp.hq('SELECT * FROM public.fin_comparativo_meses(12)');
    cy1 := pg_temp.hq('SELECT * FROM public.vw_fin_resumo_mes');
    cz1 := pg_temp.hq('SELECT * FROM public.fin_exec_fluxo_12m(NULL, NULL)');
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO sd1 FROM public.fin_contas;
    IF cx0 = cx1 AND cy0 = cy1 AND cz0 = cz1 AND sd0 = sd1 THEN
      rel := rel || ' CAIXA ok (comparativo de meses, resumo do mês, fluxo de 12 meses e o saldo de TODAS as contas ficaram IDÊNTICOS com a oferta no banco).';
    ELSE ok := false; rel := rel || format(' FALHOU caixa: comparativo %s, resumo do mês %s, fluxo %s, saldos %s.', cx0 = cx1, cy0 = cy1, cz0 = cz1, sd0 = sd1); END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
