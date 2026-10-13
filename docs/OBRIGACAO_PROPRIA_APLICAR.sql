-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela. GRAVA (cria 1 gatilho, 1 view e troca 1 função; NENHUM dado existente muda).
-- Idêntico a supabase/migrations/20261013100000_fin_obrigacao_propria_nas_linhas_novas.sql. Pode rodar mais de uma vez. Para desfazer: docs/OBRIGACAO_PROPRIA_ROLLBACK.sql.
-- ─── D1 (versão leve): toda linha NOVA de fin_lancamentos nasce com `obrigacao_id` = o próprio id ──────────────────────────────────────────────
-- Decisão dela (13/10/2026): "a despesa é a obrigação". Hoje só 40 de 15.661 linhas têm `obrigacao_id` (as que passaram por liquidação); nas outras a identidade é
-- implícita (as views e funções já leem COALESCE(obrigacao_id, id)). Aqui a identidade passa a ser explícita para tudo o que for criado DAQUI EM DIANTE.
-- NÃO preenche as 15.621 linhas antigas (decisão dela: validar a arquitetura antes de qualquer operação grande no histórico) — elas continuam lidas como
-- COALESCE(obrigacao_id, id), exatamente como hoje.
--
-- O que muda:
--   1. gatilho BEFORE INSERT: se a linha nova chegar sem `obrigacao_id`, recebe o próprio `id`. Quem já informa (fin_liquidar nas parcelas) não é tocado.
--   2. view `vw_fin_obrigacao_filhas`: as linhas que são PARCELAS de outra (obrigacao_id ≠ id). Com o gatilho, "tem obrigacao_id" deixou de significar "passou por
--      liquidação"; o app (grupoDaObrigacaoService) lia as linhas com obrigacao_id preenchido — com a view lê só as parcelas, que continuam poucas.
--   3. `fin_liquidar_com_pagamento_existente`: recusava "pagamento com obrigacao_id preenchido". Um pagamento novo agora tem obrigacao_id = id e é TÃO solto
--      quanto antes; a recusa passa a valer só para quem é parcela de OUTRA obrigação (obrigacao_id ≠ id). O resto da função é idêntico.
-- Nenhum dado existente é alterado. Valor, status, saldo, extrato e DRE não mudam (o gatilho só preenche uma coluna que nenhum cálculo usa).
-- Reversível: docs/OBRIGACAO_PROPRIA_ROLLBACK.sql (remove gatilho e view, devolve a função anterior). As linhas criadas enquanto o gatilho existia ficam com
-- obrigacao_id = id — inofensivo: é exatamente o que o app já lê como "obrigação de uma linha só".

-- ── 1) o gatilho ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_lanc_obrigacao_propria() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.obrigacao_id IS NULL THEN NEW.obrigacao_id := NEW.id; END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_obrigacao_propria ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_obrigacao_propria BEFORE INSERT ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_obrigacao_propria();

-- ── 2) as parcelas (linhas que pertencem a uma obrigação de outra linha) ──────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_obrigacao_filhas WITH (security_invoker = true) AS
SELECT l.id, l.obrigacao_id
  FROM public.fin_lancamentos l
 WHERE l.obrigacao_id IS NOT NULL AND l.obrigacao_id <> l.id;

COMMENT ON VIEW public.vw_fin_obrigacao_filhas IS 'As linhas de fin_lancamentos que são PARCELAS de uma obrigação cuja raiz é outra linha (obrigacao_id ≠ id). A raiz é a linha apontada. security_invoker: vale a RLS de fin_lancamentos.';
GRANT SELECT ON public.vw_fin_obrigacao_filhas TO authenticated;

-- ── 3) a fusão não pode tratar a identidade própria como "já ligado a outra obrigação" ────────────────────────────
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
  -- (D1) obrigacao_id = o próprio id é a identidade de uma linha solta; só ser parcela de OUTRA obrigação impede a fusão
  IF pg.liquidacao_id IS NOT NULL OR (pg.obrigacao_id IS NOT NULL AND pg.obrigacao_id <> pg.id) OR pg.recorrencia_id IS NOT NULL THEN
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

REVOKE EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) TO authenticated;
