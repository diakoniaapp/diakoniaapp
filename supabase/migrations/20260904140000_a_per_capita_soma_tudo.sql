-- ═══════════════════════════════════════════════════════════════════════════
-- A per capita soma tudo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pergunta dela: "como calcular a per capita? soma-se renda + benefício?
-- como saber o valor do benefício?" — e a resposta é sim, é assim que o
-- próprio CadÚnico calcula: renda FAMILIAR é a soma de toda fonte de renda
-- (trabalho, benefício, aposentadoria), não só uma. `qual_beneficio` já
-- dizia QUAL benefício, nunca QUANTO — sem o valor, a per capita ficava
-- sistematicamente subestimada para quem recebe Bolsa Família ou BPC mas
-- não tem renda de trabalho: aparecia "sem renda" quando na verdade tinha.
--
-- `valor_beneficio` entra ao lado de `qual_beneficio`. A per capita, em
-- `diaconiaService.ts`, passa a somar `renda_mensal` (trabalho) +
-- `valor_beneficio` (benefício) — cada um só entra na soma quando o
-- respectivo booleano (`possui_renda`/`recebe_beneficio_social`) é
-- verdadeiro, e "sem dado" só quando os DOIS booleanos nunca foram
-- respondidos.

BEGIN;

ALTER TABLE public.diaconia_fichas_socioeconomicas
  ADD COLUMN valor_beneficio numeric(10,2) CHECK (valor_beneficio IS NULL OR valor_beneficio >= 0);

CREATE OR REPLACE FUNCTION public.diaconia_salvar_ficha(
  p_pessoa_assistida_id uuid,
  p_dados               jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    situacao_moradia, familiares, sustento_familia, maior_necessidade, observacoes, preenchido_por
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
    nullif(btrim(p_dados->>'observacoes'), ''), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMIT;
