-- SOMENTE LEITURA. Despesas pagas em conta de BANCO, com a linha do extrato ligada (vínculo ativo OU marca [ofx:...]), SEM comprovante anexado:
-- era o que a regra antiga mostrava como "Falta Comprovante de pagamento" (ex.: Verisure R$ 291,31) e que a regra de 28/10/2026 dá como pago.
-- Rodar no SQL Editor do Supabase. Não altera nada.
with conf as (
  select l.id,
         case when exists (select 1 from fin_extrato_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null) then 'vinculo'
              when l.observacoes like '%[ofx:%' then 'marca ofx'
              when exists (select 1 from fin_liquidacoes q where q.id = l.liquidacao_id and q.ofx_fitid is not null) then 'liquidacao com fitid'
         end as confirmacao
  from fin_lancamentos l
  where l.tipo = 'saida' and l.status in ('realizado', 'conciliado')
)
select l.id, l.data, l.valor, l.descricao, c.nome as conta, cat.nome as categoria, l.forma_liquidacao, l.forma_pagamento, conf.confirmacao,
       exists (select 1 from fin_lancamento_anexos a where a.lancamento_id = coalesce(l.obrigacao_id, l.id)
               and a.tipo in ('nota_fiscal', 'fatura', 'boleto', 'guia', 'dps', 'rsp', 'rpa', 'contrato')) as tem_documento_de_origem
from fin_lancamentos l
join conf on conf.id = l.id and conf.confirmacao is not null
join fin_contas c on c.id = l.conta_id and c.tipo = 'banco'
left join fin_categorias cat on cat.id = l.categoria_id
where l.origem is distinct from 'transferencia'
  and l.comprovante_url is null
  and not exists (select 1 from fin_lancamento_anexos a where a.lancamento_id = l.id and a.tipo = 'comprovante')
order by tem_documento_de_origem desc, l.data desc;
-- tem_documento_de_origem = true  → a despesa SAI das pendências (fica completa);
-- tem_documento_de_origem = false → continua pendente, mas pela falta do documento de origem (nota/fatura/guia…), não do comprovante.
