-- ─── O gatilho de saldo não precisa recalcular a conta a cada lançamento PREVISTO ───────────────────────────────
-- `fin_atualiza_saldo` (gatilho `fin_lanc_saldo`, por linha) chama `fin_recalc_saldo_conta` — um SUM sobre TODOS os lançamentos da
-- conta — a cada INSERT, UPDATE e DELETE, mesmo de um lançamento previsto. Mas o saldo (`saldo_inicial` + Σ realizado/conciliado)
-- não depende de previsto, cancelado nem aguardando aprovação. Medido em 08/10/2026: gerar 880 previstos de uma recorrência (ou
-- editá-los, ou apagá-los) fazia 880 varreduras da conta (39 mil linhas no Bradesco) → "canceling statement due to statement timeout".
-- Agora só recalcula quando a linha, antes ou depois da mudança, conta no saldo. O resultado do saldo é idêntico.

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
