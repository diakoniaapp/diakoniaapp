-- ─── Indicador por Categoria (Dashboard Executivo) ────────────────────────
--
-- Pedido dela (01/10/2026), depois do Indicador por Centro de Custo
-- (migration 20261001120000): "quanto gastamos com Energia?" não é uma
-- pergunta de ONDE (centro de custo) — é de COM O QUÊ (categoria). Os dois
-- indicadores coexistem (a spec dela dizia "substituir" no título mas
-- "devem coexistir" no fechamento — seguido o fechamento, mais específico).
--
-- Medido antes de escrever: `fin_categorias.pai_id` existe no schema mas
-- NENHUMA das 36 categorias ativas de saída o usa (`pai_id` sempre null,
-- diferente de `fin_centros_custo.centro_pai_id`, que tem 29 subcentros
-- reais) — por isso, ao contrário de `fin_centro_resumo`, não há hierarquia
-- pra somar aqui: é direto `categoria_id = p_categoria_id`. Cobertura de
-- classificação por categoria (50,1% dos lançamentos de saída) é melhor
-- que por centro (19,4%) mas ainda é metade — `total_classificado` abaixo
-- continua somando só quem TEM categoria, pelo mesmo motivo já documentado
-- em `fin_centro_resumo`.
--
-- Duas funções: `fin_categoria_resumo` espelha `fin_centro_resumo` (sem a
-- parte de hierarquia). `fin_categorias_ranking` é nova — alimenta "Top 10
-- Categorias de Despesas" E a colocação ("5ª categoria") da categoria
-- escolhida no resumo executivo, as duas com UMA busca só (`row_number`
-- sobre todas, o cliente corta os 10 primeiros pra exibir a lista e
-- procura a posição da selecionada no array inteiro).
CREATE OR REPLACE FUNCTION public.fin_categoria_resumo(
  p_categoria_id uuid,
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
  with dias as (
    select (p_ate - p_de + 1) as qtd
  ),
  executado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.categoria_id = p_categoria_id
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  ),
  anterior as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l, dias
    where l.categoria_id = p_categoria_id
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between (p_de - dias.qtd) and (p_de - 1)
  ),
  classificado as (
    select coalesce(sum(l.valor), 0)::numeric(12,2) as total
    from fin_lancamentos l
    where l.categoria_id is not null
      and l.tipo = 'saida'
      and l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and l.data between p_de and p_ate
  )
  select e.total, a.total, c.total
  from executado e, anterior a, classificado c;
$function$;

GRANT EXECUTE ON FUNCTION public.fin_categoria_resumo(uuid, date, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_categorias_ranking(
  p_de date,
  p_ate date
)
 RETURNS TABLE(categoria_id uuid, nome text, valor numeric, colocacao bigint)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
      and l.status in ('realizado','conciliado')
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

GRANT EXECUTE ON FUNCTION public.fin_categorias_ranking(date, date) TO authenticated;
