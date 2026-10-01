-- ─── fin_exec_fluxo_12m ganha período personalizado ─────────────────────
--
-- Pedido dela (01/10/2026): o gráfico "Fluxo de Caixa" da Visão Executiva
-- estava preso a "últimos 12 meses", sem jeito de analisar um intervalo
-- maior (ex.: 01/01/2023 a 31/12/2025). Medido antes de mexer: não existia
-- filtro NENHUM na tela pra essa janela ignorar — a função nem aceitava
-- parâmetro de data, era um loop fixo de 12 iterações a partir de
-- `current_date - 11 months`. Não era bug, era funcionalidade que faltava.
--
-- `p_de`/`p_ate` entram como OPCIONAIS, default `null` nos dois — sem
-- filtro, o comportamento continua idêntico ao de hoje (últimos 12 meses
-- terminando no mês atual), pra não quebrar quem já chama sem argumento.
-- Com os dois preenchidos, itera mês a mês de `date_trunc('month', p_de)`
-- até `date_trunc('month', p_ate)` — qualquer tamanho, não só 12.
-- `fin_exec_fluxo_12m(p_de, p_ate)` tem assinatura DIFERENTE da função
-- antiga `fin_exec_fluxo_12m()` (zero parâmetros) — `CREATE OR REPLACE`
-- sozinho criaria uma SEGUNDA função (sobrecarga), não substituiria a
-- primeira, e como os dois novos parâmetros têm `DEFAULT NULL`, uma
-- chamada sem argumento nenhum (`supabase.rpc("fin_exec_fluxo_12m")`, o
-- uso de hoje) ficaria ambígua entre as duas — "function is not unique".
-- O DROP explícito evita isso: só sobra uma função com este nome.
DROP FUNCTION IF EXISTS public.fin_exec_fluxo_12m();

CREATE OR REPLACE FUNCTION public.fin_exec_fluxo_12m(
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
 RETURNS TABLE(mes date, rotulo text, entradas numeric, saidas numeric, saldo numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_mes date;
  v_mes_fim date;
  v_meses_pt text[] := array['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
begin
  v_mes := date_trunc('month', coalesce(p_de, current_date - interval '11 months'))::date;
  v_mes_fim := date_trunc('month', coalesce(p_ate, current_date))::date;

  while v_mes <= v_mes_fim loop
    return query
    select
      v_mes,
      v_meses_pt[extract(month from v_mes)::int] || '/' || to_char(v_mes, 'YY'),
      coalesce(sum(case when l.tipo='entrada' then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='saida'   then l.valor else 0 end), 0)::numeric(12,2),
      coalesce(sum(case when l.tipo='entrada' then l.valor else -l.valor end), 0)::numeric(12,2)
    from fin_lancamentos l
    where l.status in ('realizado','conciliado')
      and l.origem is distinct from 'transferencia'
      and date_trunc('month', l.data) = v_mes;
    v_mes := (v_mes + interval '1 month')::date;
  end loop;
end; $function$;

-- `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
-- (20260818050000_revoga_anon_security_definer.sql) tira o EXECUTE que uma
-- função SUBSTITUÍDA (mesmo nome, assinatura nova por causa dos parâmetros)
-- não herda sozinha — mesmo cuidado já documentado em outras migrations
-- deste arquivo (ex.: fin_movimento_antes_de).
GRANT EXECUTE ON FUNCTION public.fin_exec_fluxo_12m(date, date) TO authenticated;
