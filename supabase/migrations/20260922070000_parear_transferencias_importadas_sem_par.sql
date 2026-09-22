-- Pedido da Telma (22/09/2026): "encontre uma solução para extratos
-- importados que trazem transferências entre contas" — a importação do
-- Omie já marcava cada perna com `origem='transferencia'` (função
-- `ehTransferencia`, `omieImportService.ts`), mas sem ligar as duas
-- pernas entre si: cada rodada de importação só enxerga o arquivo de UMA
-- conta por vez, então não tem como saber o id da perna irmã na hora de
-- gravar — diferente do botão "Transferir" manual, que cria as duas
-- pernas numa tacada só e já grava `lancamento_pai_id` simétrico (Item 7,
-- 22/09/2026).
--
-- MEDIDO em produção antes desta migration: 2.570 lançamentos
-- `origem='transferencia'` sem `lancamento_pai_id`, de 2.984 no total (os
-- outros 414 são do "Transferir" manual, já pareados). Sem o par,
-- `EditarTransferenciaForm.tsx` só deixa editar o lado da própria perna, e
-- excluir uma não arrasta a outra — cada metade fica órfã.
--
-- REGRA DE PAREAMENTO, só a SEGURA: agrupa as sem-par por (data, valor);
-- liga automaticamente só quando o grupo tem EXATAMENTE 2 linhas — uma
-- entrada, uma saída, em contas DIFERENTES. Grupo com mais de 2 linhas
-- (duas transferências de mesmo valor no mesmo dia, en algum lugar do
-- histórico) fica de fora de propósito: juntar errado corrompe o
-- histórico pior que deixar sem par. Medido: 1.089 grupos assim (2.178
-- linhas, 84,7% das sem-par) — o resto (392 linhas, 377 grupos) continua
-- sem par, em grande parte porque só UM lado da conta foi importado até
-- aqui (a outra conta nunca teve seu próprio arquivo do Omie trazido).
with sem_par as (
  select id, conta_id, data, tipo, valor
  from public.fin_lancamentos
  where origem = 'transferencia' and lancamento_pai_id is null
),
baldes_seguros as (
  select data, valor
  from sem_par
  group by data, valor
  having count(*) = 2
     and count(*) filter (where tipo = 'entrada') = 1
     and count(*) filter (where tipo = 'saida') = 1
     and count(distinct conta_id) = 2
),
pares as (
  select e.id as id_entrada, s.id as id_saida
  from baldes_seguros bs
  join sem_par e on e.data = bs.data and e.valor = bs.valor and e.tipo = 'entrada'
  join sem_par s on s.data = bs.data and s.valor = bs.valor and s.tipo = 'saida'
)
update public.fin_lancamentos l
set lancamento_pai_id = case when l.id = p.id_entrada then p.id_saida else p.id_entrada end
from pares p
where l.id in (p.id_entrada, p.id_saida);
