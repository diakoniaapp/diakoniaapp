-- DESFAZER a migration 20261008210000 (ordem do extrato do banco). Um comando só (transação única). Remove a coluna `ordem_banco` e a função que a grava
-- e devolve o gatilho de saldo da versão anterior (que recalcula em qualquer UPDATE de lançamento realizado/conciliado — a de 20261008150000).
-- Efeito: o extrato volta a ordenar por data → entrada antes de saída → created_at → id. A ordem gravada se perde (dá para gravar de novo com a sincronização).
DROP FUNCTION IF EXISTS public.fin_gravar_ordem_banco(jsonb);
ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS ordem_banco;

CREATE OR REPLACE FUNCTION public.fin_atualiza_saldo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.status in ('realizado','conciliado') then
      perform public.fin_recalc_saldo_conta(new.conta_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status in ('realizado','conciliado') or new.status in ('realizado','conciliado') then
      perform public.fin_recalc_saldo_conta(new.conta_id);
      if old.conta_id <> new.conta_id then
        perform public.fin_recalc_saldo_conta(old.conta_id);
      end if;
    end if;
  else -- DELETE
    if old.status in ('realizado','conciliado') then
      perform public.fin_recalc_saldo_conta(old.conta_id);
    end if;
  end if;
  return null;
end;$function$;
