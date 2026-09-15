-- ─── fin_movimento_antes_de — soma no banco, sem o teto de 300 linhas ─────
--
-- Defeito achado em 15/09/2026, a partir de uma pergunta da Telma ("mas pq
-- aparece 332,55 na direita do valor de lançamento?"): a coluna "Saldo"
-- (acumulado) do extrato de conta (FinancasConta.tsx) e a "Saldo Anterior"
-- da Prestação de Contas usam `prestacaoContasService.saldoAcumuladoAntesDe`,
-- que somava `saldo_inicial` + movimento buscando os lançamentos ANTES da
-- data com `listarLancamentos` — e essa função tem um teto de 300 linhas
-- (`finService.ts`, `.limit(300)`, ordenado do mais recente pro mais
-- antigo). O próprio comentário do arquivo já avisava disso: "se a igreja
-- acumular mais de 300 lançamentos históricos antes do período, este saldo
-- passa a truncar e precisa virar uma soma no banco (RPC), não em memória."
--
-- Medido ao vivo na conta "Caixinha Administrativo": com filtro de 2024 a
-- 2026 (300 lançamentos = teto batido), o saldo acumulado exibido na última
-- linha (15/09/26) terminava em R$ 2.162,01, contra o saldo real da conta
-- (`fin_contas.saldo_atual`, mantido pelo gatilho `fin_recalc_saldo_conta`,
-- nunca sujeito a este teto) de R$ 208,74 — diferença de R$ 1.953,27, o
-- efeito líquido dos lançamentos mais antigos que ficaram de fora da soma
-- em memória. Mesmo no filtro padrão (mês corrente, só 18 linhas — bem
-- abaixo do teto), o "saldo antes do período" em si já vinha errado por
-- R$ 1.706,42, porque ele é calculado chamando `saldoAcumuladoAntesDe` com
-- `dataLimiteExclusiva` = início do mês, e o histórico da conta ANTES
-- dessa data (jan/2024 em diante) já passava de 300 lançamentos.
--
-- Esta função faz a mesma soma (`entrada` soma, `saida` subtrai, só
-- `realizado`/`conciliado` contam — mesma regra do gatilho
-- `fin_recalc_saldo_conta`) só que agregada pelo Postgres, sem buscar linha
-- nenhuma pro cliente — não tem teto de 300 porque não é a API REST
-- paginada, é `SUM()` direto na tabela.
create or replace function fin_movimento_antes_de(
  p_data_limite_exclusiva date,
  p_conta_id uuid default null
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
  from fin_lancamentos
  where data < p_data_limite_exclusiva
    and status in ('realizado', 'conciliado')
    and (p_conta_id is null or conta_id = p_conta_id);
$$;

comment on function fin_movimento_antes_de(date, uuid) is
  'Movimento (entradas − saídas, só realizado/conciliado) de fin_lancamentos antes de uma data, somado no banco — sem o teto de 300 linhas de listarLancamentos(). Usado por prestacaoContasService.saldoAcumuladoAntesDe.';

-- `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
-- (20260818050000_revoga_anon_security_definer.sql) tira o EXECUTE que toda
-- função nova ganharia por padrão — sem este GRANT, a chamada via
-- `supabase.rpc()` de um usuário autenticado normal (não-definer, não-admin)
-- voltaria "permission denied for function".
GRANT EXECUTE ON FUNCTION fin_movimento_antes_de(date, uuid) TO authenticated;
