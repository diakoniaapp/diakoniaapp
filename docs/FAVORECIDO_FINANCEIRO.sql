-- ─── RASCUNHO PARA REVISÃO — "Favorecido Financeiro" no lugar de "Fornecedor" ────────────────────────────────
--
-- NÃO É UMA MIGRATION: está em docs/ de propósito. Só vira migration depois da sua aprovação. Ensaiado com BEGIN/ROLLBACK
-- (docs/FAVORECIDO_FINANCEIRO_ENSAIO_FUNCIONAL.sql). Modelagem, números e decisões: docs/FAVORECIDO_FINANCEIRO.md
--
-- PRINCÍPIO: ninguém é recadastrado nem muda de lugar. O cadastro financeiro que hoje se chama "fornecedor"
-- (`fin_fornecedores`: 326 linhas, 9.558 lançamentos, 6 recorrências, estoque, memória de documentos) PASSA A SER o cadastro de
-- Favorecidos. Uma pessoa da igreja vira favorecido ao ser VINCULADA (coluna nova `pessoa_id`), sem duplicar e sem mexer em
-- nenhum lançamento. O nome técnico da tabela não muda (só o que a pessoa lê na tela): renomear a tabela quebraria 14 arquivos,
-- 5 chaves estrangeiras e a memória de aprendizado para ganho nenhum.
--
-- O QUE ENTRA
--   1. fin_fornecedores.pessoa_id (FK membros, única): a ponte entre o favorecido e o Cadastro de Pessoas
--   2. vw_favorecidos: a leitura unificada (nome vindo da pessoa quando há vínculo; natureza pessoa/pessoa_fisica/empresa)
--   3. fin_favorecido_candidatos(pessoa): cadastros financeiros EXISTENTES que parecem ser a mesma pessoa (para vincular, não duplicar)
--   4. fin_vincular_pessoa_favorecido(pessoa, [cadastro]): cria ou liga — idempotente
--   5. vw_lancamento_favorecido: de QUALQUER lançamento (fornecedor_id OU pessoa_id) até o favorecido, para extratos e Pix
-- Não toca em: fin_lancamentos, fin_recorrencias, estoque, fin_documento_conhecimento, fin_pessoa_pix (vazia), fin_contratados (vazia).

-- ── 1) a ponte ───────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_fornecedores
  ADD COLUMN IF NOT EXISTS pessoa_id uuid REFERENCES public.membros(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fin_fornecedores_pessoa_unico
  ON public.fin_fornecedores (pessoa_id) WHERE pessoa_id IS NOT NULL;

COMMENT ON COLUMN public.fin_fornecedores.pessoa_id IS
  'Favorecido que é uma PESSOA do cadastro (membro, congregado, pastor, funcionário, missionário…). Nulo = empresa ou pessoa física sem cadastro de pessoa. Única: uma pessoa, um favorecido.';

-- ── 2) a leitura unificada ───────────────────────────────────────────────────────────────────────────────
-- natureza: 'pessoa' (vinculada ao Cadastro de Pessoas) · 'pessoa_fisica' (física, ainda sem cadastro de pessoa) · 'empresa'
CREATE OR REPLACE VIEW public.vw_favorecidos WITH (security_invoker = true) AS
SELECT f.id,
       COALESCE(m.nome_completo, f.nome)                                  AS nome,
       f.nome                                                             AS nome_no_cadastro_financeiro,
       CASE WHEN f.pessoa_id IS NOT NULL THEN 'pessoa'
            WHEN f.tipo = 'fisica'       THEN 'pessoa_fisica'
            ELSE 'empresa' END                                            AS natureza,
       f.pessoa_id,
       m.tipo_pessoa::text                                                AS vinculo_na_igreja,
       COALESCE(f.cnpj_cpf, m.cpf)                                        AS documento,
       f.chave_pix, f.tipo_chave_pix, f.banco_nome, f.agencia, f.conta,
       f.categoria_padrao_id, f.centro_custo_padrao_id,
       f.ativo
  FROM public.fin_fornecedores f
  LEFT JOIN public.membros m ON m.id = f.pessoa_id;

REVOKE ALL ON public.vw_favorecidos FROM PUBLIC, anon;
GRANT SELECT ON public.vw_favorecidos TO authenticated;

-- ── 3) candidatos: já existe cadastro financeiro desta pessoa? ───────────────────────────────────────────
-- Mesmo CPF, ou mesmo nome (sem acento, ignorando o prefixo de CNPJ de MEI: "47.354.609 Daniel Alves Souza").
-- Só devolve quem ainda NÃO está vinculado a outra pessoa.
CREATE OR REPLACE FUNCTION public.fin_favorecido_candidatos(p_pessoa_id uuid)
RETURNS TABLE (id uuid, nome text, tipo text, cnpj_cpf text, lancamentos bigint, motivo text)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $f$
  WITH p AS (
    SELECT m.id, regexp_replace(coalesce(m.cpf, ''), '\D', '', 'g') AS cpf,
           lower(translate(btrim(m.nome_completo), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')) AS nome
      FROM public.membros m WHERE m.id = p_pessoa_id
  )
  SELECT f.id, f.nome, f.tipo, f.cnpj_cpf,
         (SELECT count(*) FROM public.fin_lancamentos l WHERE l.fornecedor_id = f.id),
         CASE WHEN p.cpf <> '' AND regexp_replace(coalesce(f.cnpj_cpf, ''), '\D', '', 'g') = p.cpf THEN 'mesmo CPF' ELSE 'mesmo nome' END
    FROM public.fin_fornecedores f, p
   WHERE f.pessoa_id IS NULL
     AND ( (p.cpf <> '' AND regexp_replace(coalesce(f.cnpj_cpf, ''), '\D', '', 'g') = p.cpf)
        OR lower(translate(regexp_replace(btrim(f.nome), '^[0-9. /-]+', ''),
             'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc')) = p.nome )
   ORDER BY 6 DESC, 5 DESC;
$f$;

-- ── 4) vincular (ou criar) — idempotente ─────────────────────────────────────────────────────────────────
-- · a pessoa JÁ é favorecida                    → devolve o favorecido que existe (nunca duplica);
-- · p_fornecedor_id informado (cadastro existente) → LIGA aquele cadastro à pessoa (exige que ele ainda não seja de outra pessoa);
-- · senão                                          → cria o favorecido com o nome e o CPF da pessoa; PIX e banco vêm depois.
CREATE OR REPLACE FUNCTION public.fin_vincular_pessoa_favorecido(p_pessoa_id uuid, p_fornecedor_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_id uuid; v_m public.membros%ROWTYPE; v_f public.fin_fornecedores%ROWTYPE; n int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para cadastrar favorecidos.';
  END IF;
  SELECT * INTO v_m FROM public.membros WHERE id = p_pessoa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa não encontrada no Cadastro de Pessoas.'; END IF;

  SELECT id INTO v_id FROM public.fin_fornecedores WHERE pessoa_id = p_pessoa_id;
  IF FOUND THEN RETURN v_id; END IF;

  IF p_fornecedor_id IS NOT NULL THEN
    SELECT * INTO v_f FROM public.fin_fornecedores WHERE id = p_fornecedor_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cadastro financeiro não encontrado.'; END IF;
    IF v_f.pessoa_id IS NOT NULL THEN RAISE EXCEPTION 'Este cadastro financeiro já está vinculado a outra pessoa.'; END IF;
    UPDATE public.fin_fornecedores SET pessoa_id = p_pessoa_id, tipo = 'fisica',
           cnpj_cpf = COALESCE(NULLIF(cnpj_cpf, ''), v_m.cpf) WHERE id = p_fornecedor_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Não consegui vincular (permissão?).'; END IF;
    RETURN p_fornecedor_id;
  END IF;

  INSERT INTO public.fin_fornecedores (nome, tipo, cnpj_cpf, telefone, email, pessoa_id, ativo)
  VALUES (v_m.nome_completo, 'fisica', v_m.cpf, v_m.telefone_celular, v_m.email, p_pessoa_id, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_favorecido_candidatos(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_vincular_pessoa_favorecido(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_favorecido_candidatos(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fin_vincular_pessoa_favorecido(uuid, uuid) TO authenticated;

-- ── 5) de qualquer lançamento ao favorecido ──────────────────────────────────────────────────────────────
-- Hoje um lançamento aponta para fornecedor_id (9.558) OU para pessoa_id (3.588), nunca os dois. Esta view resolve os dois
-- caminhos para o MESMO favorecido: "tudo que a Telma recebeu" junta o que está como fornecedor e o que está como pessoa.
CREATE OR REPLACE VIEW public.vw_lancamento_favorecido WITH (security_invoker = true) AS
SELECT l.id AS lancamento_id,
       COALESCE(l.fornecedor_id, fp.id) AS favorecido_id,
       CASE WHEN l.fornecedor_id IS NOT NULL THEN 'fornecedor_id' WHEN fp.id IS NOT NULL THEN 'pessoa_id' END AS ligado_por
  FROM public.fin_lancamentos l
  LEFT JOIN public.fin_fornecedores fp ON fp.pessoa_id = l.pessoa_id AND l.fornecedor_id IS NULL;

REVOKE ALL ON public.vw_lancamento_favorecido FROM PUBLIC, anon;
GRANT SELECT ON public.vw_lancamento_favorecido TO authenticated;
