-- Pedido da Telma (22/09/2026), vendo o extrato real: "Ofertas e Dízimos
-- devem vir marcados sempre para o centro de custo Min. Administração, e o
-- usuário desejando faz a alteração" — muitos lançamentos de Ofertas
-- apareciam com centro de custo "—" (vazio).
--
-- O mecanismo de sugestão já existe e já está plugado no formulário
-- (`sugerirCentroPorCategoria` → RPC `fin_sugerir_centro_por_categoria`,
-- chamada em `LancamentoForm.tsx` sempre que a categoria muda e o centro
-- ainda está vazio) — só sugeria pelo HISTÓRICO (centro mais usado nos
-- últimos 180 dias). Sem histórico suficiente, ou em caso de empate, não
-- sugeria nada, e a pessoa seguia sem preencher.
--
-- Corrigido com uma regra fixa: para as categorias "Dizimos" e "Ofertas"
-- (nomes exatos medidos no banco — "Dizimos" sem acento), a sugestão é
-- sempre "Min. Administração", sem depender de histórico. Para as demais
-- categorias, nada muda — continua a sugestão por frequência de uso.
-- Continua sendo SUGESTÃO, não trava: o campo no formulário permanece
-- editável, "o usuário desejando faz a alteração".
CREATE OR REPLACE FUNCTION public.fin_sugerir_centro_por_categoria(p_categoria_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select coalesce(
    -- Regra fixa: Dízimos e Ofertas sempre sugerem Min. Administração.
    (
      select cc.id
      from public.fin_categorias c
      join public.fin_centros_custo cc on cc.nome = 'Min. Administração' and cc.ativo
      where c.id = p_categoria_id and c.nome in ('Dizimos', 'Ofertas')
      limit 1
    ),
    -- Senão, centro de custo mais usado para essa categoria (excluindo "geral") — regra original.
    (
      select l.centro_custo_id
      from public.fin_lancamentos l
      join public.fin_centros_custo cc on cc.id = l.centro_custo_id
      where l.categoria_id = p_categoria_id
        and l.centro_custo_id is not null
        and cc.vinculo_tipo <> 'geral'
        and l.status in ('realizado','conciliado')
        and l.data >= current_date - interval '180 days'
      group by l.centro_custo_id
      order by count(*) desc
      limit 1
    )
  );
$function$;
