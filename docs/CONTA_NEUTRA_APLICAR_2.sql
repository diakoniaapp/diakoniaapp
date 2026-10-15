-- APLICAR 2 de 2 — a conta neutra, as travas e a regra da oferta (depois do passo 1 e do ensaio TUDO OK). Pode rodar duas vezes.
-- Rollback: docs/CONTA_NEUTRA_ROLLBACK.sql.

-- 1) a conta estrutural (id fixo: o código e o banco a reconhecem por ele)
INSERT INTO public.fin_contas (id, nome, tipo, saldo_inicial, saldo_atual, ativo, ordem, observacao, is_principal,
                               aceita_receitas, aceita_despesas, aceita_transferencia_entrada, aceita_transferencia_saida)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Não Aplicável (Compras Pagas por Terceiros)', 'nao_aplicavel', 0, 0, false, 9999,
        'Conta ESTRUTURAL, não financeira: abriga só as obrigações pagas por terceiros (oferta). Nunca recebe dinheiro, saldo ou transferência. Invisível nos seletores.', false,
        false, false, false, false)
ON CONFLICT (id) DO NOTHING;

-- 2) a conta neutra é sempre inativa, de saldo zero e não aceita movimento; e só ela pode ter este tipo
ALTER TABLE public.fin_contas DROP CONSTRAINT IF EXISTS fin_contas_nao_aplicavel_chk;
ALTER TABLE public.fin_contas ADD CONSTRAINT fin_contas_nao_aplicavel_chk CHECK (
  ((tipo = 'nao_aplicavel'::public.fin_conta_tipo) = (id = '00000000-0000-4000-8000-0000000000a1'::uuid))
  AND (tipo <> 'nao_aplicavel'::public.fin_conta_tipo OR (ativo = false AND saldo_inicial = 0 AND saldo_atual = 0
        AND aceita_receitas = false AND aceita_despesas = false AND aceita_transferencia_entrada = false AND aceita_transferencia_saida = false)));

CREATE OR REPLACE FUNCTION public.fin_conta_neutra_protege() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  RAISE EXCEPTION 'A conta "Não Aplicável (Compras Pagas por Terceiros)" é estrutural e não pode ser apagada.';
END
$fn$;
DROP TRIGGER IF EXISTS fin_conta_neutra_protege ON public.fin_contas;
CREATE TRIGGER fin_conta_neutra_protege BEFORE DELETE ON public.fin_contas
  FOR EACH ROW WHEN (OLD.id = '00000000-0000-4000-8000-0000000000a1'::uuid) EXECUTE FUNCTION public.fin_conta_neutra_protege();

-- 3) o que a conta neutra aceita: só obrigação (saída) em previsto, quitado_terceiro ou cancelado; e toda oferta vive nela
CREATE OR REPLACE FUNCTION public.fin_conta_neutra_guarda() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
DECLARE neutra constant uuid := '00000000-0000-4000-8000-0000000000a1';
BEGIN
  -- a obrigação extinta por oferta nunca fica em conta financeira real
  IF NEW.status::text = 'quitado_terceiro' AND NEW.conta_id IS DISTINCT FROM neutra THEN NEW.conta_id := neutra; END IF;
  IF NEW.conta_id = neutra THEN
    IF NEW.status::text NOT IN ('previsto', 'quitado_terceiro', 'cancelado') THEN
      RAISE EXCEPTION 'Esta despesa está na conta "Não Aplicável" (compra paga por terceiro) e não tem conta financeira. Para pagá-la com dinheiro da igreja, use "Pagar" e escolha a conta de onde sai o pagamento (situação pedida: %).', NEW.status;
    END IF;
    IF NEW.tipo::text <> 'saida' OR NEW.origem IS NOT DISTINCT FROM 'transferencia' THEN
      RAISE EXCEPTION 'A conta "Não Aplicável" só abriga a obrigação (a nota) de uma compra paga por terceiro: não recebe entrada, saída de caixa nem transferência.';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_conta_neutra ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_conta_neutra BEFORE INSERT OR UPDATE OF conta_id, status, tipo, origem ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text = 'quitado_terceiro' OR NEW.conta_id = '00000000-0000-4000-8000-0000000000a1'::uuid) EXECUTE FUNCTION public.fin_conta_neutra_guarda();

-- 4) registrar a nota quitada por terceiro: a oferta nasce na conta neutra (reembolso e relatado seguem pedindo conta)
DO $pre$
BEGIN
  -- a definição abaixo parte da VIVA de 14/10/2026 (com o projeto, p_projeto); se alguém a mudou depois, não sobrescrever às cegas
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'A função fin_registrar_nf_quitada_por_terceiro (com o projeto) não existe: aplique antes a migration 20261016110000_fin_nf_quitada_com_projeto. Nada foi gravado.';
  END IF;
  IF position('oferta nunca se liga a uma conta financeira real' IN lower(pg_get_functiondef(to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)')))) = 0
     AND position('IF p_conta IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta) THEN RAISE EXCEPTION' IN pg_get_functiondef(to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)'))) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_registrar_nf_quitada_por_terceiro mudou depois de 14/10/2026: NÃO aplique este passo sem rever a função. Nada foi gravado.';
  END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text, p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text, p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text, p_projeto uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE novo uuid; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; forn public.fin_fornecedores%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar uma nota quitada por terceiro.';
  END IF;
  IF p_responsavel NOT IN ('pessoa', 'empresa', 'entidade', 'nao_localizado') THEN RAISE EXCEPTION 'Informe quem pagou a nota (pessoa, empresa, entidade ou não localizado).'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor da nota.'; END IF;
  IF p_data IS NULL OR p_data > hoje THEN RAISE EXCEPTION 'A data da nota é obrigatória e não pode ser futura.'; END IF;
  -- OFERTA nunca se liga a uma conta financeira real (14/10/2026): a obrigação nasce na conta neutra "Não Aplicável". Os outros casos (reembolso, relatado) seguem exigindo conta.
  IF p_intencao = 'oferta' THEN
    p_conta := '00000000-0000-4000-8000-0000000000a1'::uuid;
  ELSIF p_conta IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta) THEN
    RAISE EXCEPTION 'Escolha a conta em que a obrigação ficará registrada.';
  END IF;
  SELECT * INTO forn FROM public.fin_fornecedores WHERE id = p_fornecedor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolha o fornecedor que emitiu a nota.'; END IF;
  IF p_projeto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_projetos WHERE id = p_projeto) THEN RAISE EXCEPTION 'O projeto escolhido não existe mais (pode ter sido excluído): escolha outro ou deixe sem projeto.'; END IF;
  IF p_chave IS NOT NULL AND btrim(p_chave) <> '' AND NOT public.fin_nfe_chave_valida(btrim(p_chave)) THEN RAISE EXCEPTION 'A chave de acesso da nota não confere (44 dígitos, só números, com o dígito verificador correto).'; END IF;
  IF p_documento_numero IS NOT NULL AND btrim(p_documento_numero) <> '' AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = p_fornecedor AND x.documento_numero = btrim(p_documento_numero) AND x.tipo::text = 'saida' AND abs(x.valor - p_valor) < 0.005) THEN
    RAISE EXCEPTION 'Já existe uma despesa deste fornecedor com a nota nº % e este valor: não se registra duas vezes a mesma nota.', btrim(p_documento_numero);
  END IF;

  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes, projeto_id)
  VALUES (p_conta, 'saida', 'previsto', p_data, p_valor, COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), 'Nota de ' || forn.nome), NULLIF(btrim(COALESCE(p_documento_numero, '')), ''), p_fornecedor, p_categoria, p_centro,
          NULLIF(btrim(COALESCE(p_chave, '')), ''), 'nf_quitada_por_terceiro', 'Registrada já quitada por terceiro (a nota o aplicativo ainda não tinha).', p_projeto)
  RETURNING id INTO novo;

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);
  RETURN novo;
END
$function$;

-- 5) as ofertas que já existem (hoje: 1, R$ 117,90) saem da conta financeira: o saldo de nenhuma conta muda (oferta nunca teve efeito no saldo)
UPDATE public.fin_lancamentos SET conta_id = '00000000-0000-4000-8000-0000000000a1'::uuid WHERE status::text = 'quitado_terceiro' AND conta_id <> '00000000-0000-4000-8000-0000000000a1'::uuid;

-- conferência: a conta, as ofertas e os totais
SELECT c.nome, c.tipo::text AS tipo, c.ativo, c.saldo_atual,
       (SELECT count(*) FROM public.fin_lancamentos WHERE conta_id = c.id) AS lancamentos_na_conta,
       (SELECT count(*) FROM public.fin_lancamentos WHERE status::text = 'quitado_terceiro' AND conta_id <> c.id) AS ofertas_fora_da_conta_neutra,
       (SELECT count(*) FROM public.fin_lancamentos) AS lancamentos_total
FROM public.fin_contas c WHERE c.id = '00000000-0000-4000-8000-0000000000a1';
