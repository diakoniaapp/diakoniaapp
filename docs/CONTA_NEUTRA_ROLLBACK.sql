-- ROLLBACK da conta neutra: devolve a regra antiga do registro, devolve as ofertas à conta anterior (da auditoria fin_conta_alteracoes) e remove a conta neutra, as travas e a restrição.
-- O valor 'nao_aplicavel' do enum permanece (o Postgres não remove valor de enum); sem uso, é inofensivo.
-- 1) as travas saem primeiro (senão o gatilho mandaria as ofertas de volta para a conta neutra)
DROP TRIGGER IF EXISTS fin_lanc_conta_neutra ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_conta_neutra_protege ON public.fin_contas;
-- 2) as ofertas voltam à conta em que estavam (a última mudança para a conta neutra guarda a conta anterior)
UPDATE public.fin_lancamentos l SET conta_id = a.conta_anterior_id
  FROM (SELECT DISTINCT ON (lancamento_id) lancamento_id, conta_anterior_id FROM public.fin_conta_alteracoes
         WHERE conta_nova_id = '00000000-0000-4000-8000-0000000000a1'::uuid ORDER BY lancamento_id, alterado_em DESC) a
 WHERE l.id = a.lancamento_id AND l.conta_id = '00000000-0000-4000-8000-0000000000a1'::uuid;
-- 3) a função de registro volta à definição de antes
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
  IF p_conta IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta) THEN RAISE EXCEPTION 'Escolha a conta em que a obrigação ficará registrada (a oferta não mexe nela).'; END IF;
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

-- 4) a conta e as restrições (só sai se nenhuma despesa ficou nela)
DO $rb$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE conta_id = '00000000-0000-4000-8000-0000000000a1'::uuid) THEN
    RAISE EXCEPTION 'Ainda há despesas na conta neutra e não se sabe a conta anterior delas: devolva-as à mão antes de remover a conta.';
  END IF;
  ALTER TABLE public.fin_contas DROP CONSTRAINT IF EXISTS fin_contas_nao_aplicavel_chk;
  DELETE FROM public.fin_contas WHERE id = '00000000-0000-4000-8000-0000000000a1'::uuid;
END
$rb$;
DROP FUNCTION IF EXISTS public.fin_conta_neutra_guarda();
DROP FUNCTION IF EXISTS public.fin_conta_neutra_protege();
