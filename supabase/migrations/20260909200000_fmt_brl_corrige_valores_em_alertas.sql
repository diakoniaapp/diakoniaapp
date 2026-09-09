-- ─── fmt_brl(): moeda em português, sem depender do locale do banco ────────
--
-- ── O QUE ESTAVA ERRADO ──────────────────────────────────────────────────
--
-- Achado ao verificar outros painéis (09/09/2026): "Vencimentos próximos"
-- no Painel da Tesouraria dizia "1 conta(s) para os próximos 5 dias
-- totalizando R$ 37.8" — ponto em vez de vírgula, e faltando o zero final.
--
-- A causa: `to_char(valor, 'FM9999999.99')`. `FM` (Fill Mode) suprime não
-- só os espaços à esquerda como também o zero final dos dois "9" depois do
-- ponto — 37.80 vira "37.8" — e o separador decimal do padrão `'9.99'` é
-- sempre ponto, format americano, não brasileiro.
--
-- Duas outras funções tentavam o caminho "certo", com `G`/`D` (que pedem ao
-- Postgres o separador de milhar/decimal do LOCALE da sessão) — mas
-- `lc_numeric` neste banco é `en_US.UTF-8` (conferido ao vivo), então
-- `to_char(1234.5, 'FM999G999D90')` também sai errado: "1,234.50",
-- exatamente ao contrário do que o Brasil espera.
--
-- Quatro funções, sete números, todas com uma das duas versões do mesmo
-- problema: `fin_alertas_financeiros` (Painel da Tesouraria — "Conta
-- vencida", "Vencimentos próximos"), `fin_alertas_centros` (mesmo painel —
-- "Acima do orçamento"), `fin_exec_alertas` (Painel Executivo — saldo
-- crítico, orçamento anual) e `fiscal_inconsistencias` (Fiscal — valor
-- pago fora do padrão).
--
-- ── A CORREÇÃO NÃO DEPENDE DE LOCALE ─────────────────────────────────────
--
-- `fmt_brl` monta o separador de milhar (".") e o decimal (",") na mão,
-- dígito a dígito — o mesmo resultado em qualquer banco, com qualquer
-- `lc_numeric`, hoje ou depois de uma migração de servidor.
--
-- `casas` é parametrizável porque duas das sete chamadas formatam
-- PERCENTUAL, não dinheiro ("103,2%", uma casa) — o mesmo defeito de
-- separador valia pra elas também, e a mesma função resolve as duas.

CREATE OR REPLACE FUNCTION public.fmt_brl(v numeric, casas int DEFAULT 2)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  n        numeric := round(coalesce(v, 0), casas);
  eh_neg   boolean := n < 0;
  abs_n    numeric := abs(n);
  parte_i  text := floor(abs_n)::bigint::text;
  parte_d  text := '';
  agrupado text := '';
  i        int;
  len      int := length(parte_i);
begin
  if casas > 0 then
    parte_d := to_char(round((abs_n - floor(abs_n)) * (10 ^ casas)), 'FM' || repeat('0', casas));
  end if;

  -- Separador de milhar a cada 3 dígitos, da direita para a esquerda —
  -- sem tocar no ÚLTIMO grupo (i <> len), que não leva ponto antes de si.
  for i in 1..len loop
    agrupado := substr(parte_i, len - i + 1, 1) || agrupado;
    if i % 3 = 0 and i <> len then
      agrupado := '.' || agrupado;
    end if;
  end loop;

  return (case when eh_neg then '-' else '' end)
    || agrupado
    || (case when casas > 0 then ',' || parte_d else '' end);
end;
$function$;

COMMENT ON FUNCTION public.fmt_brl(numeric, int) IS
  'Formata um número no padrão brasileiro (ponto de milhar, vírgula '
  'decimal) sem depender do lc_numeric da sessão. casas=2 para dinheiro '
  '("1.234,50"), casas=1 para percentual ("103,2"). Ver a migration '
  '20260909200000 para o porquê de existir.';

-- ─── fin_alertas_financeiros: as duas linhas de "R$ 37.8" ──────────────────
CREATE OR REPLACE FUNCTION public.fin_alertas_financeiros()
 RETURNS TABLE(tipo text, titulo text, descricao text, severidade text, link text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  -- 1) Contas vencidas
  select 'conta_vencida', 'Conta vencida',
         count(*) || ' lançamento(s) vencido(s) totalizando R$ ' || public.fmt_brl(sum(valor)),
         'critico', '/financas/agenda'
  from public.fin_lancamentos
  where status = 'previsto' and tipo = 'saida' and data < current_date
  having count(*) > 0

  union all

  -- 2) Vencendo nos proximos 5 dias
  select 'conta_proxima', 'Vencimentos próximos',
         count(*) || ' conta(s) para os próximos 5 dias totalizando R$ ' || public.fmt_brl(sum(valor)),
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
$function$;

-- ─── fin_alertas_centros: valor real/planejado, e o percentual junto ───────
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
$function$;

-- ─── fin_exec_alertas: saldo crítico e orçamento anual, Painel Executivo ───
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
      coalesce((select sum(o.valor) from fin_orcamentos o
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

-- ─── fiscal_inconsistencias: valor pago x média histórica ──────────────────
CREATE OR REPLACE FUNCTION public.fiscal_inconsistencias()
 RETURNS TABLE(tipo text, severidade text, agenda_id uuid, codigo_obrigacao text, nome_obrigacao text, competencia date, mensagem text, detalhes jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
begin
  -- 1) Valor anômalo (fora de 30% da média)
  return query
  with hist as (select * from fiscal_historico_medio())
  select
    'valor_anomalo'::text as tipo,
    (case
       when abs(a.valor_pago - h.media_paga) / nullif(h.media_paga, 0) > 0.5 then 'alta'
       else 'media'
     end)::text as severidade,
    a.id as agenda_id,
    a.codigo_obrigacao,
    t.nome as nome_obrigacao,
    a.competencia,
    format('Pago R$ %s — média histórica R$ %s (%s %s de variação)',
      public.fmt_brl(a.valor_pago),
      public.fmt_brl(h.media_paga),
      public.fmt_brl(abs(a.valor_pago - h.media_paga) / h.media_paga * 100, 1),
      '%') as mensagem,
    jsonb_build_object(
      'valor_pago', a.valor_pago,
      'media_historica', h.media_paga,
      'desvio_padrao', h.desvio_padrao,
      'qtd_pagamentos_base', h.qtd_pagamentos
    ) as detalhes
  from fiscal_agenda a
  join fiscal_tipos_obrigacao t on t.codigo = a.codigo_obrigacao
  join hist h on h.codigo_obrigacao = a.codigo_obrigacao
  where a.status = 'pago'
    and a.valor_pago is not null
    and a.data_pagamento >= current_date - interval '60 days'
    and abs(a.valor_pago - h.media_paga) / nullif(h.media_paga, 0) > 0.3;

  -- 2) Obrigação paga SEM documento anexado
  return query
  select
    'sem_documento'::text as tipo,
    'media'::text as severidade,
    a.id as agenda_id,
    a.codigo_obrigacao,
    t.nome as nome_obrigacao,
    a.competencia,
    format('%s de %s consta como paga mas não tem comprovante anexado',
      t.nome,
      to_char(a.competencia, 'MM/YYYY')) as mensagem,
    jsonb_build_object('data_pagamento', a.data_pagamento, 'valor_pago', a.valor_pago) as detalhes
  from fiscal_agenda a
  join fiscal_tipos_obrigacao t on t.codigo = a.codigo_obrigacao
  where a.status = 'pago'
    and a.data_pagamento >= current_date - interval '90 days'
    and not exists (select 1 from fiscal_documentos d where d.agenda_id = a.id);

  -- 3) Obrigação do mês anterior sem nenhum movimento (esperada mas não criada)
  -- (já coberto pela RPC fiscal_marcar_atrasados na FB-2, mas trazemos aqui)
  return query
  select
    'sem_movimento'::text as tipo,
    'alta'::text as severidade,
    a.id as agenda_id,
    a.codigo_obrigacao,
    t.nome as nome_obrigacao,
    a.competencia,
    format('%s da competência %s está ATRASADA há %s dia(s)',
      t.nome,
      to_char(a.competencia, 'MM/YYYY'),
      (current_date - a.vencimento)::text) as mensagem,
    jsonb_build_object('vencimento', a.vencimento, 'dias_atraso', current_date - a.vencimento) as detalhes
  from fiscal_agenda a
  join fiscal_tipos_obrigacao t on t.codigo = a.codigo_obrigacao
  where a.status in ('pendente','atrasado')
    and a.vencimento < current_date;
end; $function$;
