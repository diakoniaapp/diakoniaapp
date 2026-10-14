-- APLICAÇÃO DEFINITIVA — Projeto na "NF já quitada por terceiro". Só depois do "TUDO OK, pode aplicar" do ensaio. PRÉ-REQUISITO: Fase 1D-a aplicada.
-- Idêntico a supabase/migrations/20261016110000. Pode rodar mais de uma vez. Para desfazer: docs/QUITACAO_PROJETO_NA_NF_ROLLBACK.sql.
-- TRAVA: se faltar a 1D-a, ou se a função viva não for mais a da 1D-a, este arquivo para no primeiro bloco e NÃO grava nada.
-- ─── Projeto na "NF já quitada por terceiro": o projeto é uma dimensão da OBRIGAÇÃO, ao lado de categoria e centro ─────────────────────────────
-- Depende da 1D-a (aplicada ANTES). Decisão aprovada em 14/10/2026: o formulário "Registrar NF já quitada por terceiro" ganha "Projeto (opcional)",
-- com o mesmo comportamento do lançamento comum. O projeto fica na obrigação (fin_lancamentos.projeto_id, coluna que já existe, FK ON DELETE SET NULL),
-- NÃO na quitação: a quitação diz quem pagou; o projeto diz para onde foi a despesa — como categoria e centro.
--
-- O que muda (e só isso):
--   1. fin_registrar_nf_quitada_por_terceiro ganha p_projeto uuid DEFAULT NULL, no fim. A chamada sem ele continua valendo (projeto nulo).
--      Definição = a da 1D-a (supabase/migrations/20261015150000), TRANSFORMADA, com três mudanças cirúrgicas: o parâmetro novo, a recusa de projeto
--      inexistente e a coluna projeto_id no INSERT. A trava abaixo confere que a definição viva ainda é a da 1D-a antes de substituí-la.
--   2. fin_nf_quitada_aceita_projeto(): sondagem para o aplicativo só mostrar o campo quando o banco já o aceita — sem ela, o app mandaria um
--      parâmetro que a função não conhece (erro) ou o descartaria em silêncio (projeto escolhido e não gravado).
-- Nenhum dado existente é alterado. Nenhuma tabela muda. Nenhum relatório do banco muda: a prestação de contas do projeto é calculada na tela
-- (FinancasProjetoDetalhe.tsx), que passa a mostrar as ofertas de terceiros em seção própria, fora do saldo.
-- Ensaio: docs/QUITACAO_PROJETO_NA_NF_ENSAIO.sql. Reversível: docs/QUITACAO_PROJETO_NA_NF_ROLLBACK.sql.

DO $pre$
DECLARE src text;
BEGIN
  -- já aplicada: rodar de novo só reescreve a mesma definição
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NOT NULL THEN RETURN; END IF;
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar a Fase 1D-a antes desta (a função de registrar a NF quitada ainda não tem a forma de pagamento do terceiro): rode docs/QUITACAO_1D_A_APLICAR.sql. Nada foi gravado.';
  END IF;
  -- a definição abaixo é a da 1D-a com três mudanças; se a VIVA não for mais aquela, não sobrescrever às cegas
  SELECT prosrc INTO src FROM pg_proc WHERE oid = to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)')::oid;
  IF position('INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes)' IN src) = 0 OR position('PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);' IN src) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_registrar_nf_quitada_por_terceiro não é mais a da 1D-a (alguém a alterou depois): NÃO aplique esta migration sem revê-la. Nada foi gravado.';
  END IF;
END $pre$;

-- ── 1) a função de registrar, com o projeto ──────────────────────────────────────────────────────────────────────────────
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
DROP FUNCTION IF EXISTS public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text);
REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text, uuid) TO authenticated;

-- ── 2) a sondagem do aplicativo ───────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_nf_quitada_aceita_projeto() RETURNS boolean
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT true $$;
COMMENT ON FUNCTION public.fin_nf_quitada_aceita_projeto() IS 'Sondagem do aplicativo: existe enquanto fin_registrar_nf_quitada_por_terceiro aceita p_projeto. O rollback a remove. Não lê nem grava nada.';
REVOKE EXECUTE ON FUNCTION public.fin_nf_quitada_aceita_projeto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_nf_quitada_aceita_projeto() TO authenticated;

NOTIFY pgrst, 'reload schema';
