-- ─── diaconia_salvar_ficha() passa a aceitar proxima_revisao_em ──────────
--
-- Continuação da migration anterior (20260922120000): a coluna já existe
-- em `diaconia_fichas_socioeconomicas`, mas a função que grava a ficha
-- (chamada via RPC por `diaconiaService.salvarFicha`) ainda não lê essa
-- chave do jsonb — sem isso o campo novo do formulário seria digitado e
-- silenciosamente descartado. Corpo idêntico ao anterior (visto por
-- `pg_get_functiondef` em produção), só a lista de colunas do INSERT
-- ganhou uma entrada.
CREATE OR REPLACE FUNCTION public.diaconia_salvar_ficha(p_pessoa_assistida_id uuid, p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pode boolean; v_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_lidera_area(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Só a liderança da Diaconia preenche a ficha.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.diaconia_fichas_socioeconomicas (
    pessoa_assistida_id, possui_deficiencia, qual_deficiencia, possui_renda, renda_mensal,
    recebe_beneficio_social, qual_beneficio, valor_beneficio, ja_trabalhou_clt, tempo_clt, atuacao_clt,
    situacao_moradia, familiares, sustento_familia, maior_necessidade, observacoes, proxima_revisao_em,
    preenchido_por
  ) VALUES (
    p_pessoa_assistida_id,
    (p_dados->>'possui_deficiencia')::boolean, nullif(btrim(p_dados->>'qual_deficiencia'), ''),
    (p_dados->>'possui_renda')::boolean, (p_dados->>'renda_mensal')::numeric,
    (p_dados->>'recebe_beneficio_social')::boolean, nullif(btrim(p_dados->>'qual_beneficio'), ''),
    (p_dados->>'valor_beneficio')::numeric,
    (p_dados->>'ja_trabalhou_clt')::boolean, nullif(btrim(p_dados->>'tempo_clt'), ''),
    nullif(btrim(p_dados->>'atuacao_clt'), ''),
    nullif(btrim(p_dados->>'situacao_moradia'), ''),
    COALESCE(p_dados->'familiares', '[]'::jsonb),
    nullif(btrim(p_dados->>'sustento_familia'), ''), nullif(btrim(p_dados->>'maior_necessidade'), ''),
    nullif(btrim(p_dados->>'observacoes'), ''), (p_dados->>'proxima_revisao_em')::date,
    auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;
