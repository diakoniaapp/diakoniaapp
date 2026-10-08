-- DESFAZER a serialização do saldo (supabase/migrations/20261008190000_fin_recalc_saldo_serializa_por_conta.sql). Um comando só; não toca em dado.
-- Devolve o corpo anterior de fin_recalc_saldo_conta, idêntico ao de supabase/baseline/schema.sql (sem o travamento prévio da linha da conta).
-- Efeito de desfazer: volta a janela de corrida entre duas gravações simultâneas na mesma conta (ver docs/PARECER_SALDO_CONCORRENCIA.md).
CREATE OR REPLACE FUNCTION public.fin_recalc_saldo_conta(p_conta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.fin_contas c
     set saldo_atual = c.saldo_inicial + coalesce((
       select sum(case when l.tipo = 'entrada' then l.valor else -l.valor end)
       from public.fin_lancamentos l
       where l.conta_id = c.id
         and l.status in ('realizado','conciliado')
     ), 0)
   where c.id = p_conta_id;
end;$function$;
