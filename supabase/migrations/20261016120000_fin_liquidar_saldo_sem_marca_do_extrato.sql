-- ─── Pagamento parcial travava: o saldo pendente herdava a marca da linha do banco ─────────────────────────────────────────────────
-- Achado ao vivo em 14/10/2026 ("Confirmar pagamento", R$ 1.438,00 pagos R$ 1.358,00 como parcial): o banco recusava com
--   "Esta linha do banco (N11D1F) já está ligada a outra despesa: (sem descrição) — previsto de 05/10/2026, R$ 1438.00 (lançamento d538…)".
-- A "outra despesa" era a MESMA: na baixa parcial, fin_liquidar cria a linha do saldo pendente copiando `l.observacoes` da obrigação — inclusive a
-- marca [ofx:FITID]. O gatilho dos vínculos (D4, 20261013120000) vê a linha do banco já ligada ao lançamento que está sendo pago (ainda 'previsto'
-- naquele instante, porque o INSERT do saldo vem antes do UPDATE da baixa) e recusa; a transação inteira volta e o pagamento não grava.
--
-- A regra certa: a linha do banco pertence ao que FOI PAGO. O saldo pendente não foi pago por linha nenhuma — nasce sem as marcas [ofx:…] e com o
-- resto da observação intacto. O lançamento pago (o mesmo id) continua com a marca e com o vínculo. Só a baixa PARCIAL muda; a total não cria linha.
--
-- O que muda (e só isso):
--   1. função nova fin_sem_marcas_do_extrato(text): a observação sem as marcas [ofx:…] (nulo se não sobrar nada). Imutável, sem acesso a tabela.
--   2. fin_liquidar: no INSERT do saldo pendente, `l.observacoes` vira `public.fin_sem_marcas_do_extrato(l.observacoes)`. A definição é a VIVA do banco
--      (pg_get_functiondef), transformada aqui mesmo com essa única troca — nada é redigitado. Se o trecho não estiver lá exatamente uma vez, para e
--      não grava nada. Se já estiver trocado, não faz nada (pode rodar mais de uma vez).
-- Nenhum dado existente é alterado. Ensaio: docs/LIQUIDAR_SALDO_SEM_MARCA_ENSAIO.sql. Reversível: docs/LIQUIDAR_SALDO_SEM_MARCA_ROLLBACK.sql.

CREATE OR REPLACE FUNCTION public.fin_sem_marcas_do_extrato(obs text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $f$ SELECT NULLIF(btrim(regexp_replace(COALESCE(obs, ''), '\s*\[ofx:[^\]]+\]', '', 'g')), '') $f$;
COMMENT ON FUNCTION public.fin_sem_marcas_do_extrato(text) IS 'A observação sem as marcas [ofx:FITID] (nulo se não sobrar nada). Usada no saldo pendente da baixa parcial: a linha do banco pertence ao que foi pago.';

DO $mig$
DECLARE
  fn regprocedure := to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)');
  def text; n int;
  antes  CONSTANT text := 'l.documento_numero, l.observacoes, l.origem';
  depois CONSTANT text := 'l.documento_numero, public.fin_sem_marcas_do_extrato(l.observacoes), l.origem';
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'fin_liquidar não existe com a assinatura esperada: NÃO aplique sem revisar. Nada foi gravado.'; END IF;
  def := pg_get_functiondef(fn);
  IF position(depois IN def) > 0 THEN RAISE NOTICE 'fin_liquidar já está corrigida: nada a fazer.'; RETURN; END IF;
  n := (length(def) - length(replace(def, antes, ''))) / length(antes);
  IF n <> 1 THEN
    RAISE EXCEPTION 'O trecho "%" aparece % vez(es) na fin_liquidar viva (esperado: 1). Alguém a alterou: NÃO aplique sem revisar. Nada foi gravado.', antes, n;
  END IF;
  EXECUTE replace(def, antes, depois);
END
$mig$;
