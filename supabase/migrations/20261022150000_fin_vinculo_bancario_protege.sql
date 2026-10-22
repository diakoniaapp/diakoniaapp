-- ─── Lançamento com vínculo bancário ATIVO não muda de valor, tipo, status nem data de pagamento — e a marca do extrato não sai à mão (22/10/2026) ───────────────────────────────────────
--
-- O defeito (caso Light, 21/10/2026): o OFX criou dois lançamentos CONCILIADOS com os valores do banco (R$ 3.583,22 e R$ 603,29) e guardou o vínculo FITID → lançamento. Depois o formulário
-- "Editar lançamento" trocou o VALOR dos dois (para 2.110,12 e 313,77) e os devolveu a PREVISTO — com o vínculo ainda ativo. Resultado impossível: o OFX diz "já registrado" (olha o vínculo) e a Mesa
-- diz "em aberto, atrasada" (olha o status). Nada no banco impedia: o congelamento que existe (`fin_lanc_congela_atualizar`) só vale depois do envio à contabilidade, e a troca de CONTA ou a retirada da
-- marca `[ofx:…]` apenas fechavam o vínculo em silêncio.
--
-- A regra (decisão dela, 22/10/2026): se existe vínculo bancário ativo,
--   · NÃO pode mudar o VALOR, o TIPO (entrada/saída), a DATA DE PAGAMENTO;
--   · o STATUS só pode ir para realizado ou conciliado (nunca de volta a previsto, cancelado, aguardando aprovação…) — conferir e desconferir (conciliado ↔ realizado) continuam livres;
--   · a MARCA `[ofx:…]` das observações não pode ser retirada.
--   A FORMA de pagamento NÃO é protegida (não muda o dinheiro). Categoria, centro, favorecido, projeto, descrição, documento e anexos também seguem livres.
-- O caminho para mudar o que está protegido é explícito: `fin_desvincular_do_extrato(lançamento, motivo)` — motivo obrigatório (5+ letras), fecha o vínculo com o motivo e grava a trilha
-- (fin_lancamento_historico, campo 'vinculo_extrato'). Depois o lançamento volta a ser editável como qualquer outro. A linha do banco fica livre para ser ligada de novo.
--
-- O que esta migration NÃO faz: não corrige nenhum caso histórico (os da Light seguem como estão — o gatilho olha só mudanças DE AGORA em diante; um lançamento já inconsistente continua podendo
-- ir para realizado/conciliado, que é o caminho de volta). Não mexe em valores, status ou vínculos existentes.
-- Escape para manutenção por SQL: `SET LOCAL qibrj.vinculo_livre = 'on'` na própria transação (documentado aqui, não usado pelo app).
-- Reverter: docs/VINCULO_BANCARIO_PROTEGE_ROLLBACK.sql. Ensaio: docs/VINCULO_BANCARIO_PROTEGE_ENSAIO.mjs.

-- 1) a trilha ganha o campo 'vinculo_extrato'
ALTER TABLE public.fin_lancamento_historico DROP CONSTRAINT IF EXISTS fin_lancamento_historico_campo_check;
ALTER TABLE public.fin_lancamento_historico ADD CONSTRAINT fin_lancamento_historico_campo_check
  CHECK (campo IN ('valor', 'data', 'fornecedor', 'favorecido', 'categoria', 'centro_custo', 'projeto', 'conta', 'documento_numero', 'nf_chave_acesso', 'vinculo_extrato'));

-- 2) o gatilho de proteção
CREATE OR REPLACE FUNCTION public.fin_lanc_protege_vinculo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  ativas text[];
  dica constant text := 'Para mudar, use "Desvincular do extrato" no lançamento (com o motivo): isso solta a linha do banco e libera a edição.';
BEGIN
  IF current_setting('qibrj.vinculo_livre', true) = 'on' THEN RETURN NEW; END IF;

  SELECT array_agg(v.fitid) INTO ativas
    FROM public.fin_extrato_vinculos v
   WHERE v.lancamento_id = OLD.id AND v.desfeito_em IS NULL;
  IF ativas IS NULL THEN RETURN NEW; END IF;

  IF NEW.valor IS DISTINCT FROM OLD.valor THEN
    RAISE EXCEPTION 'Este lançamento está ligado a uma linha do extrato do banco (%): o valor não pode ser alterado.', array_to_string(ativas, ', ') USING HINT = dica;
  END IF;
  IF NEW.tipo::text IS DISTINCT FROM OLD.tipo::text THEN
    RAISE EXCEPTION 'Este lançamento está ligado a uma linha do extrato do banco (%): o sentido (entrada/saída) não pode ser alterado.', array_to_string(ativas, ', ') USING HINT = dica;
  END IF;
  IF NEW.data_pagamento IS DISTINCT FROM OLD.data_pagamento THEN
    RAISE EXCEPTION 'Este lançamento está ligado a uma linha do extrato do banco (%): a data do pagamento é a do banco e não pode ser alterada.', array_to_string(ativas, ', ') USING HINT = dica;
  END IF;
  IF NEW.status::text IS DISTINCT FROM OLD.status::text AND NEW.status::text NOT IN ('realizado', 'conciliado') THEN
    RAISE EXCEPTION 'Este lançamento está ligado a uma linha do extrato do banco (%): não pode voltar para "%". O dinheiro já saiu (ou entrou) no banco.', array_to_string(ativas, ', '), NEW.status USING HINT = dica;
  END IF;
  IF NOT (ativas <@ public.fin_marcas_do_extrato(NEW.observacoes)) THEN
    RAISE EXCEPTION 'Este lançamento está ligado a uma linha do extrato do banco (%): a marca [ofx:…] não pode ser retirada das observações à mão.', array_to_string(ativas, ', ') USING HINT = dica;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_protege_vinculo ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_protege_vinculo BEFORE UPDATE OF valor, tipo, status, data_pagamento, observacoes ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_protege_vinculo();

-- 3) o caminho explícito: desvincular, com motivo e trilha
CREATE OR REPLACE FUNCTION public.fin_desvincular_do_extrato(p_lancamento uuid, p_motivo text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  uid uuid := (SELECT auth.uid());
  nome text;
  l public.fin_lancamentos%ROWTYPE;
  v record;
  n integer := 0;
  obs text;
BEGIN
  IF uid IS NULL OR NOT public.has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para desvincular um lançamento do extrato.';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo (pelo menos 5 caracteres) para desvincular o lançamento do extrato.';
  END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
  nome := COALESCE(public.fin_nome_do_usuario(uid), 'usuário sem nome cadastrado');

  obs := l.observacoes;
  FOR v IN SELECT id, fitid FROM public.fin_extrato_vinculos WHERE lancamento_id = p_lancamento AND desfeito_em IS NULL LOOP
    -- 1º fecha o vínculo COM o motivo (o gatilho de marcas só fecharia com o motivo genérico) e deixa a trilha
    UPDATE public.fin_extrato_vinculos SET desfeito_em = now(), desfeito_por = uid, desfeito_motivo = btrim(p_motivo) WHERE id = v.id;
    INSERT INTO public.fin_lancamento_historico (lancamento_id, campo, antes, depois, motivo, por, por_nome)
    VALUES (p_lancamento, 'vinculo_extrato', v.fitid, NULL, btrim(p_motivo), uid, nome);
    -- 2º tira a marca da observação (com o vínculo já fechado, o gatilho de proteção deixa passar)
    obs := btrim(replace(COALESCE(obs, ''), '[ofx:' || v.fitid || ']', ''));
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Este lançamento não tem vínculo ativo com o extrato.'; END IF;
  UPDATE public.fin_lancamentos SET observacoes = NULLIF(obs, ''), audit_user_id = uid, audit_em = now() WHERE id = p_lancamento;
  RETURN n;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_desvincular_do_extrato(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_desvincular_do_extrato(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.fin_desvincular_do_extrato IS 'Solta um lançamento da linha do extrato do banco, com motivo obrigatório e trilha (fin_lancamento_historico, campo vinculo_extrato). É o único caminho para mudar valor, tipo, status ou data de pagamento de um lançamento com vínculo bancário ativo.';
