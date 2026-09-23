-- ─── fin_exec_saldo_consolidado — parava de duplicar a fórmula do saldo ──
--
-- Auditoria completa de saldos (23/09/2026), item 6 do pedido dela:
-- "lógica duplicada, consultas diferentes retornando valores diferentes".
-- ACHADO ao investigar o bug do saldo_atual: esta função (Visão Executiva)
-- NUNCA leu `fin_contas.saldo_atual` — ela recalculava a mesma fórmula do
-- zero (`sum(saldo_inicial) + soma de lançamentos de TODAS as contas`),
-- por conta própria. Duas fórmulas iguais, escritas duas vezes.
--
-- Consequência prática, medida: enquanto `saldo_atual` estava travado
-- (bug corrigido na migration anterior, 20260923130000), a Visão
-- Executiva por acaso continuava mostrando o valor CERTO — porque não
-- dependia do campo quebrado — enquanto o Painel da Tesouraria e Contas
-- Correntes mostravam o valor ERRADO. Duas telas do mesmo sistema, dois
-- números diferentes, ao mesmo tempo, pro mesmo dado. É exatamente o
-- "consultas diferentes retornando valores diferentes" que ela pediu pra
-- verificar.
--
-- Corrigido pra ler `sum(saldo_atual)` — mesma fonte que `vw_fin_resumo_mes`
-- (o "Saldo total" do Painel) já usa — e filtrar `where ativo`, que esta
-- função não fazia (somava conta inativa junto; `vw_fin_resumo_mes` não
-- soma). Sem essa segunda conserto, mesmo com `saldo_atual` certo, uma
-- conta desativada no futuro faria os dois números voltarem a divergir.
-- Resultado numérico HOJE não muda (as 5 contas reais estão todas
-- ativas) — a mudança é só parar de ter dois jeitos de calcular a mesma
-- coisa.
CREATE OR REPLACE FUNCTION public.fin_exec_saldo_consolidado()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_saldo_atual numeric := 0;
  v_a_pagar_30 numeric := 0;
  v_a_receber_30 numeric := 0;
  v_a_pagar_60 numeric := 0;
  v_a_pagar_90 numeric := 0;
  v_qtd_contas int := 0;
begin
  -- Fonte única: fin_contas.saldo_atual, mantido pelos gatilhos
  -- fin_lanc_saldo (em fin_lancamentos) e fin_contas_saldo_inicial (em
  -- fin_contas) — não recalcula mais nada aqui.
  select coalesce(sum(c.saldo_atual), 0), count(*)
    into v_saldo_atual, v_qtd_contas
  from fin_contas c
  where c.ativo;

  select coalesce(sum(valor), 0) into v_a_pagar_30
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 30;

  select coalesce(sum(valor), 0) into v_a_pagar_60
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 60;

  select coalesce(sum(valor), 0) into v_a_pagar_90
  from fin_lancamentos
  where status = 'previsto' and tipo = 'saida'
    and data between current_date and current_date + 90;

  select coalesce(sum(valor), 0) into v_a_receber_30
  from fin_lancamentos
  where status = 'previsto' and tipo = 'entrada'
    and data between current_date and current_date + 30;

  return jsonb_build_object(
    'saldo_atual', v_saldo_atual,
    'qtd_contas', v_qtd_contas,
    'a_pagar_30d', v_a_pagar_30,
    'a_receber_30d', v_a_receber_30,
    'previsao_30d', v_saldo_atual + v_a_receber_30 - v_a_pagar_30,
    'previsao_60d', v_saldo_atual - v_a_pagar_60,
    'previsao_90d', v_saldo_atual - v_a_pagar_90
  );
end; $function$;
