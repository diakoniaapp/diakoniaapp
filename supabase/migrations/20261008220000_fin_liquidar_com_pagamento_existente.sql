-- ─── Liquidar uma obrigação ABERTA com um pagamento que JÁ está registrado (o ciclo único: obrigação → documentos → liquidação → OFX) ─────────────
-- Defeito (08–09/10/2026, "Verisure, Ana Patrícia, Carlos Eduardo e Denise continuam abertas mesmo havendo pagamento"): o casamento OFX × obrigação só
-- acontece NO MOMENTO em que a linha do extrato é importada. As recorrências de 05/10 (Ana R$ 380, Carlos R$ 380, Denise R$ 1.438) foram geradas em 08/10 às
-- 00:18 — DEPOIS de os PIX de 02/10 (R$ 760, R$ 1.630, R$ 1.358) já estarem importados como lançamentos comuns (origem importado_ofx). Nada voltava a cruzar o
-- pagamento antigo com a obrigação nova: ficaram DUAS linhas para um pagamento só — o lançamento do extrato (conciliado) e a obrigação aberta na Mesa, que
-- seria paga de novo.
--
-- O que faz: funde as duas num REGISTRO ÚNICO, em uma transação (tudo ou nada):
--   · a OBRIGAÇÃO (o lançamento previsto, com a classificação, o contrato, o vencimento e os anexos) é quem sobrevive; vira realizada/conciliada com a data de
--     pagamento do banco; a marca do OFX ([ofx:FITID]) passa para ela;
--   · os ANEXOS e o comprovante do pagamento acompanham a obrigação (nada de "obrigação sem documentos e pagamento separado com documentos");
--   · a LIQUIDAÇÃO é criada pela própria `fin_liquidar` (ato de pagar, casa com o OFX pelo `ofx_fitid`), com as mesmas regras de sempre: juros, multa, desconto,
--     complemento e ajuste (com motivo) explicam a diferença; a soma tem de fechar com o valor pago;
--   · o lançamento duplicado do extrato é apagado — o saldo da conta não muda (sai um, a obrigação ocupa o lugar);
--   · `p_adotar_valor`: quando a obrigação é uma ESTIMATIVA (valor variável), o valor real do pagamento substitui o estimado.
-- Recusa (sem mudar nada) se o pagamento já estiver ligado a algo (liquidação, recorrência, transferência, folha, fiscal, estoque, Sustento, rateio…).
-- Reversível: DROP FUNCTION public.fin_liquidar_com_pagamento_existente(...); a função só cria registros que o app já sabe desfazer (liquidação).
CREATE OR REPLACE FUNCTION public.fin_liquidar_com_pagamento_existente(
  p_previsto uuid, p_pagamento uuid, p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb, p_adotar_valor boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  pr public.fin_lancamentos%ROWTYPE; pg public.fin_lancamentos%ROWTYPE;
  fit text; liq uuid; n int; i jsonb;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF p_previsto = p_pagamento THEN RAISE EXCEPTION 'A obrigação e o pagamento são o mesmo lançamento.'; END IF;

  SELECT * INTO pr FROM public.fin_lancamentos WHERE id = p_previsto FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A obrigação % não foi encontrada.', p_previsto; END IF;
  SELECT * INTO pg FROM public.fin_lancamentos WHERE id = p_pagamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O pagamento % não foi encontrado.', p_pagamento; END IF;

  IF pr.tipo <> 'saida' OR pr.status <> 'previsto' THEN RAISE EXCEPTION 'A obrigação não está em aberto (status %): talvez já tenha sido liquidada.', pr.status; END IF;
  IF pg.tipo <> 'saida' OR pg.status NOT IN ('realizado', 'conciliado') THEN RAISE EXCEPTION 'O pagamento precisa ser uma saída já realizada ou conciliada (status %).', pg.status; END IF;
  IF pg.origem = 'transferencia' OR pg.lancamento_pai_id IS NOT NULL THEN RAISE EXCEPTION 'O pagamento é parte de uma transferência entre contas — não é pagamento de obrigação.'; END IF;
  IF pg.liquidacao_id IS NOT NULL OR pg.obrigacao_id IS NOT NULL OR pg.recorrencia_id IS NOT NULL THEN
    RAISE EXCEPTION 'O pagamento já está ligado a uma obrigação ou liquidação — nada foi alterado.';
  END IF;
  -- tudo o que for tocar o pagamento aponta para a obrigação: se algo mais depende dele, recusa
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id <> pg.id AND (x.lancamento_pai_id = pg.id OR x.obrigacao_id = pg.id))
     OR EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.sustento_pagamentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.sustento_competencias x WHERE x.obrigacao_id = pg.id) THEN
    RAISE EXCEPTION 'O pagamento tem rateio, folha, fiscal, estoque, Sustento ou lançamentos ligados — não dá para fundir com segurança.';
  END IF;
  -- o plano só pode falar da obrigação
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <> 1 OR (p_itens->0->>'lancamento_id')::uuid <> pr.id THEN
    RAISE EXCEPTION 'O plano de liquidação precisa ter exatamente a obrigação % como único documento.', pr.id;
  END IF;
  FOR i IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    IF (i->>'lancamento_id')::uuid <> pr.id THEN RAISE EXCEPTION 'Todo encargo precisa apontar para a obrigação.'; END IF;
  END LOOP;

  fit := substring(pg.observacoes from '\[ofx:([^\]]+)\]');

  -- os documentos do pagamento passam a ser da obrigação
  UPDATE public.fin_lancamento_anexos SET lancamento_id = pr.id WHERE lancamento_id = pg.id;
  IF pr.comprovante_url IS NULL AND pg.comprovante_url IS NOT NULL THEN
    UPDATE public.fin_lancamentos SET comprovante_url = pg.comprovante_url WHERE id = pr.id;
  END IF;
  -- obrigação estimada: o valor real do pagamento substitui o estimado (antes da liquidação, que confere a soma)
  IF p_adotar_valor THEN UPDATE public.fin_lancamentos SET valor = pg.valor WHERE id = pr.id; END IF;

  -- sai o lançamento duplicado (o saldo da conta não muda: a obrigação, ao ser liquidada, ocupa o lugar dele)
  DELETE FROM public.fin_lancamentos WHERE id = pg.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Não consegui retirar o lançamento duplicado do pagamento (permissão?).'; END IF;

  liq := public.fin_liquidar(pg.conta_id, COALESCE(pg.data_pagamento, pg.data), pg.forma_pagamento, pg.valor, p_itens, p_encargos, NULL, fit,
                             'Liquidada com um pagamento que já estava registrado no extrato');

  -- a obrigação herda a situação do pagamento (conciliado) e a marca do banco
  UPDATE public.fin_lancamentos SET status = pg.status WHERE liquidacao_id = liq AND status = 'realizado';
  IF fit IS NOT NULL THEN
    UPDATE public.fin_lancamentos SET observacoes = btrim(concat_ws(' ', observacoes, '[ofx:' || fit || ']')) WHERE id = pr.id;
  END IF;
  RETURN liq;
END
$fn$;

COMMENT ON FUNCTION public.fin_liquidar_com_pagamento_existente IS 'Funde uma obrigação aberta (previsto) com um pagamento já registrado (realizado/conciliado, ex.: importado do OFX): a obrigação vira paga com a data e a marca do banco, os anexos acompanham, a liquidação é criada por fin_liquidar e o lançamento duplicado é apagado. Tudo ou nada.';

REVOKE EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) TO authenticated;
