-- SOMENTE LEITURA. Despesas que a regra ANTIGA mostrava como pendentes na Mesa/Prontidão e que a regra de 28/10/2026 passa a dar como em ordem.
-- Rodar no SQL Editor do Supabase. Não altera nada.

-- 1) Reembolsos pagos (ou avisados) em conta tipo caixa ou forma = dinheiro — antes pediam "Comprovante do PIX da igreja"
select 'reembolso em especie' as grupo, l.id, l.data, l.valor, l.descricao, c.nome as conta, l.forma_pagamento, l.status
from fin_lancamentos l
join fin_contas c on c.id = l.conta_id
join vw_fin_quitacao q on q.obrigacao_id = coalesce(l.obrigacao_id, l.id)
where l.tipo = 'saida' and l.status in ('previsto', 'realizado', 'conciliado')
  and q.intencao = 'reembolso'
  and (c.tipo in ('caixa', 'envelope') or l.forma_pagamento = 'dinheiro')
  and not exists (select 1 from fin_lancamento_anexos a where a.lancamento_id = l.id and a.tipo = 'comprovante')
order by l.data desc;

-- 2) Despesas de Caixinha/espécie COM Nota Fiscal anexada — a NF agora basta, qualquer que seja a categoria
select 'caixinha com NF' as grupo, l.id, l.data, l.valor, l.descricao, c.nome as conta, cat.nome as categoria
from fin_lancamentos l
join fin_contas c on c.id = l.conta_id
left join fin_categorias cat on cat.id = l.categoria_id
where l.tipo = 'saida' and l.status in ('realizado', 'conciliado')
  and (c.tipo in ('caixa', 'envelope') or l.forma_pagamento = 'dinheiro')
  and exists (select 1 from fin_lancamento_anexos a where a.lancamento_id = coalesce(l.obrigacao_id, l.id) and a.tipo = 'nota_fiscal')
order by l.data desc;

-- 3) Débito automático (e PIX recorrente / transferência programada) com a marca [ofx:...] mas SEM vínculo ativo — antes "Falta Confirmação bancária"
select 'debito automatico com marca ofx' as grupo, l.id, l.data, l.valor, l.descricao, l.forma_liquidacao, l.observacoes
from fin_lancamentos l
where l.tipo = 'saida' and l.status in ('realizado', 'conciliado')
  and l.forma_liquidacao in ('debito_automatico', 'pix_recorrente', 'transferencia_programada')
  and l.observacoes like '%[ofx:%'
  and not exists (select 1 from fin_extrato_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null)
order by l.data desc;

-- 4) O que continua pendente de verdade: débito automático pago, sem vínculo e sem marca (ex.: Light R$ 321,37)
select 'debito automatico sem confirmacao' as grupo, l.id, l.data, l.valor, l.descricao, l.forma_liquidacao
from fin_lancamentos l
join fin_contas c on c.id = l.conta_id and c.tipo = 'banco'
where l.tipo = 'saida' and l.status in ('realizado', 'conciliado')
  and l.forma_liquidacao in ('debito_automatico', 'pix_recorrente', 'transferencia_programada')
  and coalesce(l.observacoes, '') not like '%[ofx:%'
  and not exists (select 1 from fin_extrato_vinculos v where v.lancamento_id = l.id and v.desfeito_em is null)
order by l.data desc;
