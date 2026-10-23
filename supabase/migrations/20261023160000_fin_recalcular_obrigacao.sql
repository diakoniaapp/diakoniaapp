-- ─── Recalcular a guia de uma obrigação em aberto (FGTS atrasado) SEM perder a história — 23/10/2026 ──────────────────────────────────────────────────────────────────────────
-- Pedido dela: quando a guia é recalculada por atraso, "alterar o lançamento original, incluindo o valor (taxa) de recálculo, para que fique registrado historicamente nos documentos e seja declarado nos
-- relatórios mensais como um custo extra, não esperado" — em vez de excluir e recriar. Proposta e decisões: docs/PROPOSTA_RECALCULO_DE_OBRIGACAO_2026-10-23.md (Opção 1 aprovada; a Opção 2, lançamento
-- complementar, foi descartada: contraria a Opção A de 13/10, "uma obrigação continua sendo uma obrigação").
--
-- Medido: as colunas `valor_original / juros / multa / complemento / ajuste / desconto / motivo_diferenca` já existem (20261008200000), mas só `fin_liquidar` as preenche, NA HORA DE PAGAR, e as sobrescreve
-- (`juros = v_juros`). Guia recalculada ANTES do pagamento não tinha caminho: editar o valor deixava "1.000 → 1.037,50" na trilha, sem dizer que 37,50 é encargo, e `valor_original` ficava em branco.
--
-- O que esta migration faz (nenhum dado existente é alterado):
--   1. `fin_lancamentos.recalculada_em` — a marca "⚠ Recalculada" (nula em tudo o que existe).
--   2. `fin_obrigacao_recalculos` — UM registro imutável por recálculo: valor antes/depois, juros, multa, correção, motivo, a NOVA GUIA (anexo obrigatório), quem e quando. É a fonte de "por que o FGTS de
--      setembro ficou mais caro?". Não se altera nem se apaga (e a obrigação recalculada não pode ser excluída: o registro a segura — é prova).
--   3. `fin_recalcular_obrigacao(...)` — a ação. Só Administração e Tesouraria. Só despesa PREVISTA, sem quitação por terceiro (a declaração dele fala de outro valor). Exige: novo valor MAIOR que o atual; a quebra
--      juros + multa + correção FECHANDO com a diferença (sem "ajuste sem explicação"); motivo (mín. 5 caracteres); a nova guia anexada a ESTA despesa. Grava `valor_original` uma única vez (na primeira recalculada),
--      acumula os encargos e a trilha existente (`fin_lancamento_historico`) guarda o antes/depois com o motivo. Despesa já enviada à contabilidade continua congelada pelo gatilho `fin_lanc_congela_enviada`: quem
--      precisa recalculá-la reabre o item do malote, com motivo, como já era.
--      CORREÇÃO (atualização monetária) é somada a `juros` na obrigação — as guias (FGTS) trazem "juros e atualização" juntos e os relatórios já têm a coluna Juros; o detalhe fica no registro do recálculo.
--   4. `fin_liquidar` (PAGAR) passa a SOMAR os encargos do pagamento aos já registrados (antes sobrescrevia e zeraria os 37,50) e RECUSA baixa parcial de obrigação recalculada (o encargo já gravado não se divide).
--      Feito como as correções anteriores: a definição VIVA (pg_get_functiondef) é transformada com duas trocas exatas — se o trecho não estiver lá uma vez, para e não grava nada; se já estiver trocado, não faz nada.
-- Efeito conhecido, a conferir na tela: `vw_fin_obrigacoes` (painéis informativos) soma o encargo ao "pago", então uma recalculada AINDA NÃO PAGA mostra saldo = valor original até ser paga; a lista de pagar e o Pagar
-- usam o valor da própria despesa (R$ 1.037,50). Ensaio: docs/RECALCULAR_OBRIGACAO_ENSAIO.mjs. Reverter: DROP FUNCTION fin_recalcular_obrigacao; as trocas de fin_liquidar se desfazem reaplicando 20261008200000.

-- 1) a marca ------------------------------------------------------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS recalculada_em timestamptz;
COMMENT ON COLUMN public.fin_lancamentos.recalculada_em IS 'Quando a guia desta obrigação foi recalculada (encargos por atraso). Nula = nunca. Preenchida por fin_recalcular_obrigacao.';

-- 2) o registro imutável -----------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fin_obrigacao_recalculos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrigacao_id  uuid NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE RESTRICT,
  valor_antes   numeric(14,2) NOT NULL,
  valor_depois  numeric(14,2) NOT NULL,
  juros         numeric(14,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),
  multa         numeric(14,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  correcao      numeric(14,2) NOT NULL DEFAULT 0 CHECK (correcao >= 0),
  motivo        text NOT NULL CHECK (length(btrim(motivo)) >= 5),
  anexo_id      uuid NOT NULL REFERENCES public.fin_lancamento_anexos(id) ON DELETE RESTRICT,
  por           uuid DEFAULT auth.uid(),
  por_nome      text,
  em            timestamptz NOT NULL DEFAULT now(),
  CHECK (valor_depois > valor_antes),
  CHECK (abs((juros + multa + correcao) - (valor_depois - valor_antes)) < 0.005)
);
CREATE INDEX IF NOT EXISTS fin_obrigacao_recalculos_obrigacao_idx ON public.fin_obrigacao_recalculos (obrigacao_id, em);

CREATE OR REPLACE FUNCTION public.fin_obrigacao_recalculos_imutavel() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'O registro de recálculo da guia não se altera nem se apaga: é a prova do custo extra.';
END
$f$;
DROP TRIGGER IF EXISTS fin_obrigacao_recalculos_imutavel ON public.fin_obrigacao_recalculos;
CREATE TRIGGER fin_obrigacao_recalculos_imutavel BEFORE UPDATE OR DELETE ON public.fin_obrigacao_recalculos
  FOR EACH ROW EXECUTE FUNCTION public.fin_obrigacao_recalculos_imutavel();

ALTER TABLE public.fin_obrigacao_recalculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bloqueia anon" ON public.fin_obrigacao_recalculos;
CREATE POLICY "Bloqueia anon" ON public.fin_obrigacao_recalculos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Equipe do financeiro lê" ON public.fin_obrigacao_recalculos;
CREATE POLICY "Equipe do financeiro lê" ON public.fin_obrigacao_recalculos FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- ninguém grava direto: só a função abaixo (SECURITY DEFINER)

-- 3) a ação -------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fin_recalcular_obrigacao(
  p_id uuid, p_novo_valor numeric, p_juros numeric, p_multa numeric, p_correcao numeric, p_motivo text, p_anexo_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  l public.fin_lancamentos%ROWTYPE;
  v_novo numeric := round(COALESCE(p_novo_valor, 0), 2);
  v_j numeric := round(COALESCE(p_juros, 0), 2); v_m numeric := round(COALESCE(p_multa, 0), 2); v_c numeric := round(COALESCE(p_correcao, 0), 2);
  v_dif numeric; v_motivo text := btrim(COALESCE(p_motivo, '')); v_id uuid; v_nome text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Só a Administração e a Tesouraria recalculam a guia de uma obrigação.';
  END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.status::text <> 'previsto' THEN
    RAISE EXCEPTION 'Só uma despesa em aberto (prevista) pode ter a guia recalculada. Esta está como "%".', l.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.vw_fin_quitacao q WHERE q.obrigacao_id = COALESCE(l.obrigacao_id, l.id)) THEN
    RAISE EXCEPTION 'Esta despesa tem quitação por terceiro registrada: a declaração dele fala do valor de antes. Resolva a quitação no detalhe da despesa antes de recalcular.';
  END IF;
  IF v_j < 0 OR v_m < 0 OR v_c < 0 THEN RAISE EXCEPTION 'Juros, multa e correção não podem ser negativos.'; END IF;
  IF v_novo <= l.valor THEN
    RAISE EXCEPTION 'O novo valor da guia (%) precisa ser maior que o atual (%). Para pagar menos, use o desconto no pagamento.', v_novo, l.valor;
  END IF;
  v_dif := round(v_novo - l.valor, 2);
  IF abs((v_j + v_m + v_c) - v_dif) >= 0.005 THEN
    RAISE EXCEPTION 'Juros + multa + correção (%) precisam fechar com a diferença da guia (%): informe de onde vem cada centavo.', round(v_j + v_m + v_c, 2), v_dif;
  END IF;
  IF length(v_motivo) < 5 THEN RAISE EXCEPTION 'Informe o motivo do recálculo (pelo menos 5 caracteres).'; END IF;
  IF p_anexo_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.id = p_anexo_id AND a.lancamento_id = l.id) THEN
    RAISE EXCEPTION 'Anexe a nova guia a esta despesa antes de recalcular: ela é a prova do novo valor.';
  END IF;

  -- `motivo_edicao` é o canal que a trilha (fin_lanc_historico_declaracao) lê no mesmo UPDATE: o antes/depois do valor fica gravado com o motivo
  UPDATE public.fin_lancamentos
     SET valor = v_novo,
         valor_original = COALESCE(valor_original, l.valor),
         juros = l.juros + v_j + v_c,        -- correção (atualização monetária) entra em "juros": as guias trazem os dois juntos; o detalhe fica no registro do recálculo
         multa = l.multa + v_m,
         motivo_diferenca = CASE WHEN COALESCE(btrim(l.motivo_diferenca), '') = '' THEN v_motivo ELSE l.motivo_diferenca || ' · ' || v_motivo END,
         recalculada_em = now(),
         motivo_edicao = v_motivo
   WHERE id = l.id;

  v_nome := public.fin_nome_do_usuario(auth.uid());
  INSERT INTO public.fin_obrigacao_recalculos (obrigacao_id, valor_antes, valor_depois, juros, multa, correcao, motivo, anexo_id, por, por_nome)
  VALUES (l.id, l.valor, v_novo, v_j, v_m, v_c, v_motivo, p_anexo_id, auth.uid(), v_nome)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.fin_recalcular_obrigacao(uuid, numeric, numeric, numeric, numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_recalcular_obrigacao(uuid, numeric, numeric, numeric, numeric, text, uuid) TO authenticated;

-- 4) fin_liquidar: somar aos encargos já registrados; não dividir uma obrigação recalculada ---------------------------------------------------------------------------------
DO $mig$
DECLARE
  fn regprocedure := to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)');
  def text; n int;
  antes1  CONSTANT text := 'juros = v_juros, multa = v_multa,';
  depois1 CONSTANT text := 'juros = l.juros + v_juros, multa = l.multa + v_multa,';
  antes2  CONSTANT text := 'IF v_saldo > 0.004 THEN  -- baixa parcial';
  depois2 CONSTANT text := E'IF v_saldo > 0.004 AND l.recalculada_em IS NOT NULL THEN RAISE EXCEPTION ''A guia desta obrigação foi recalculada (encargos por atraso): pague o valor integral da guia. Se há outro valor, recalcule de novo.''; END IF;\n    IF v_saldo > 0.004 THEN  -- baixa parcial';
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'fin_liquidar não existe com a assinatura esperada: NÃO aplique sem revisar. Nada foi gravado.'; END IF;
  def := pg_get_functiondef(fn);
  IF position(depois1 IN def) > 0 AND position('l.recalculada_em IS NOT NULL' IN def) > 0 THEN RAISE NOTICE 'fin_liquidar já está ajustada: nada a fazer.'; RETURN; END IF;
  FOR n IN 1..2 LOOP
    IF (length(def) - length(replace(def, CASE n WHEN 1 THEN antes1 ELSE antes2 END, ''))) / length(CASE n WHEN 1 THEN antes1 ELSE antes2 END) <> 1 THEN
      RAISE EXCEPTION 'O trecho "%" não aparece exatamente uma vez na fin_liquidar viva. Alguém a alterou: NÃO aplique sem revisar. Nada foi gravado.', CASE n WHEN 1 THEN antes1 ELSE antes2 END;
    END IF;
  END LOOP;
  EXECUTE replace(replace(def, antes1, depois1), antes2, depois2);
END
$mig$;
