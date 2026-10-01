-- ─── Indicador por Centro de Custo (Dashboard Executivo) ─────────────────
--
-- Pedido dela (01/10/2026): um bloco no Dashboard que deixe escolher
-- QUALQUER Centro de Custo e ver quanto foi gasto nele, com Subcentro,
-- evolução mensal, Top Fornecedores e Top Despesas, respeitando o período
-- escolhido — e abrir o lançamento direto pra corrigir.
--
-- Medido antes de escrever: a spec original presumia filtros globais
-- (Período/Conta/Congregação/Projeto/Centro de Resultado) já aplicados ao
-- dashboard inteiro — não existem; só o Fluxo de Caixa (migration
-- 20261001101000) tem período, e é local daquele card. "Congregação" não
-- existe no financeiro (igreja mono-inquilino, AD-3 do CLAUDE.md).
-- "Centro de Resultado" não existe em tabela nenhuma. "Subcentro" existe,
-- é `fin_centros_custo.centro_pai_id` auto-referenciado, já em uso real
-- (Administração tem 4 subcentros). Achado mais importante: 80,6% dos
-- 5.020 lançamentos de saída realizados/conciliados NÃO têm
-- `centro_custo_id` (972 de 5.020) — bate com a auditoria já registrada em
-- 20260922060000 (13.158 históricos, maioria sem centro). Por isso
-- `total_classificado` abaixo soma só quem TEM centro — é o denominador
-- certo pra "participação", não o total de despesas da igreja (que
-- incluiria 80% de lançamentos nenhum centro reivindica).
--
-- Só esta função nasce nova — a composição por Subcentro, evolução mensal,
-- Top Fornecedores e Top Despesas são computados no cliente a partir de
-- UMA busca já filtrada por centro+subcentros+período (volume pequeno por
-- centro, não pede RPC por gráfico); o número que de fato varre a tabela
-- inteira (`total_classificado`, pra comparar contra TODOS os centros)
-- fica aqui, agregado no banco.
CREATE OR REPLACE FUNCTION public.fin_centro_resumo(
  p_centro_id uuid,
  p_de date,
  p_ate date
)
 RETURNS TABLE(executado numeric, periodo_anterior numeric, total_classificado numeric)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  ),
  anterior as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l, dias
    where l.centro_custo_id in (select id from escopo)
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between (p_de - dias.qtd) and (p_de - 1)
  ),
  classificado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.centro_custo_id is not null
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  )
  select e.total, a.total, c.total
  from executado e, anterior a, classificado c;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_centro_resumo(uuid, date, date) TO authenticated;
