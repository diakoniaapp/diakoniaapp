-- ─── fin_recalc_saldo_conta: duas gravações simultâneas na mesma conta deixavam saldo_atual sem uma delas ───────────────────────────────
-- Defeito (reproduzido em Postgres 18 real, 08/10/2026 — ver docs/PARECER_SALDO_CONCORRENCIA.md): a função recalcula o saldo com UM comando só,
--   UPDATE fin_contas SET saldo_atual = saldo_inicial + (SELECT SUM(...) FROM fin_lancamentos ...) WHERE id = conta
-- e o gatilho `fin_lanc_saldo` a chama a cada lançamento realizado/conciliado. Com a transação A gravando e a B gravando ao mesmo tempo na MESMA conta,
-- o UPDATE da B espera o travamento da linha da conta (que a A segura); quando a A confirma, a B continua — mas a soma dela usa o retrato tirado
-- ANTES da A confirmar (o READ COMMITTED reavalia a linha travada, não a subconsulta). Resultado: as duas gravações dão certo, os dois lançamentos
-- existem, e `saldo_atual` fica sem o da A. Medido: 5 de 5 tentativas; 200 gravações simultâneas deixaram 200 contra 201 devidos.
-- Quando acontece o saldo errado persiste até o PRÓXIMO lançamento realizado/conciliado da mesma conta (o recálculo é completo, então se corrige sozinho).
--
-- Correção mínima: ANTES do UPDATE, travar a linha da conta num comando separado (`SELECT … FOR NO KEY UPDATE`). A espera acontece nesse comando;
-- o UPDATE que vem depois começa com um retrato NOVO e enxerga o que a outra transação confirmou. Mesma tabela, mesma fórmula, mesma assinatura,
-- nenhuma coluna nova. `NO KEY UPDATE` (e não `UPDATE`) é o mesmo nível de travamento que o UPDATE já pedia: não bloqueia as checagens de chave
-- estrangeira de quem insere lançamentos na conta, então não cria espera nem deadlock novos (medido: 200 gravações simultâneas, 0 deadlocks).
-- Custo: o travamento já era segurado até o fim da transação pelo próprio UPDATE; só passa a ser pedido um comando antes. Nenhum dado muda ao aplicar.
-- Reversível: docs/PARECER_SALDO_ROLLBACK.sql devolve o corpo anterior (idêntico ao de supabase/baseline/schema.sql).
CREATE OR REPLACE FUNCTION public.fin_recalc_saldo_conta(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 1) serializa por conta: espera a outra transação que esteja recalculando a MESMA conta terminar
  perform 1 from public.fin_contas where id = p_conta_id for no key update;
  -- 2) este comando começa DEPOIS da espera, com retrato novo: a soma enxerga tudo o que já foi confirmado
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l
       where l.conta_id = c.id
         and l.status in ('realizado','conciliado')
     ), 0)
   where c.id = p_conta_id;
end;$function$;
