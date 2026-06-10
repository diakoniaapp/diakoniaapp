-- ─── Famílias Fase A: schema mínimo + função de sugestão por sobrenome ──────

-- 1. data_casamento na família (para "João e Maria — 10 anos de casamento")
ALTER TABLE public.familias 
  ADD COLUMN IF NOT EXISTS data_casamento date;

COMMENT ON COLUMN public.familias.data_casamento IS
  'Data do casamento do casal responsavel pela familia. Usado pra calcular bodas e gerar evento de aniversario de casamento';

-- 2. Novos valores no enum parentesco_tipo (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
     WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'parentesco_tipo')
       AND enumlabel = 'irmao'
  ) THEN
    ALTER TYPE parentesco_tipo ADD VALUE 'irmao';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
     WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'parentesco_tipo')
       AND enumlabel = 'outro'
  ) THEN
    ALTER TYPE parentesco_tipo ADD VALUE 'outro';
  END IF;
END$$;

-- 3. Função: extrair sobrenome canônico (ignora sufixos e preposições)
CREATE OR REPLACE FUNCTION public.extrair_sobrenome(p_nome text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_partes text[];
  v_idx    int;
  v_palavra text;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RETURN NULL; END IF;
  v_partes := regexp_split_to_array(lower(trim(p_nome)), E'\\s+');
  
  FOR v_idx IN REVERSE array_length(v_partes, 1)..1 LOOP
    v_palavra := v_partes[v_idx];
    -- Pula sufixos pessoais
    IF v_palavra IN ('filho','filha','junior','jr','jr.','neto','neta','sobrinho','sobrinha','iii','ii') THEN CONTINUE; END IF;
    -- Pula preposicoes e artigos
    IF v_palavra IN ('da','de','do','das','dos','e','dei','del','le','la') THEN CONTINUE; END IF;
    -- Tamanho minimo (evita iniciais "M.")
    IF length(v_palavra) < 3 THEN CONTINUE; END IF;
    -- Tira pontuacao residual
    v_palavra := regexp_replace(v_palavra, '[\.,;:]', '', 'g');
    RETURN v_palavra;
  END LOOP;
  
  RETURN v_partes[array_length(v_partes, 1)]; -- fallback: ultima palavra
END;
$$;
GRANT EXECUTE ON FUNCTION public.extrair_sobrenome(text) TO authenticated, anon;

-- 4. RPC: sugerir vínculos familiares por sobrenome
CREATE OR REPLACE FUNCTION public.sugerir_vinculos_familiares(
  p_pessoa_id     uuid DEFAULT NULL,
  p_nome_completo text DEFAULT NULL
)
RETURNS TABLE(
  pessoa_id     uuid,
  nome_completo text,
  sobrenome     text,
  familia_id    uuid,
  familia_nome  text,
  parentesco    text,
  responsavel   boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT public.extrair_sobrenome(
      COALESCE(p_nome_completo, (SELECT nome_completo FROM public.membros WHERE id = p_pessoa_id))
    ) AS sobrenome_base
  )
  SELECT 
    m.id,
    m.nome_completo,
    public.extrair_sobrenome(m.nome_completo) AS sobrenome,
    vf.familia_id,
    f.nome_familia,
    vf.parentesco::text,
    COALESCE(vf.responsavel_familia, false) AS responsavel
  FROM public.membros m
  LEFT JOIN public.vinculos_familiares vf ON vf.membro_id = m.id
  LEFT JOIN public.familias f             ON f.id = vf.familia_id
  WHERE m.id IS DISTINCT FROM p_pessoa_id
    AND m.status = 'ativo'
    AND m.tipo_pessoa IN ('membro','congregado','visitante')
    AND public.extrair_sobrenome(m.nome_completo) = (SELECT sobrenome_base FROM base)
    AND (SELECT sobrenome_base FROM base) IS NOT NULL
    AND length((SELECT sobrenome_base FROM base)) >= 3
  ORDER BY 
    (vf.familia_id IS NOT NULL) DESC,
    COALESCE(vf.responsavel_familia, false) DESC,
    m.nome_completo
  LIMIT 30;
$$;
GRANT EXECUTE ON FUNCTION public.sugerir_vinculos_familiares(uuid, text) TO authenticated;

-- 5. RPC: vincular pessoa a familia (cria vinculo, opcionalmente marca responsavel)
CREATE OR REPLACE FUNCTION public.vincular_pessoa_familia(
  p_familia_id    uuid,
  p_pessoa_id     uuid,
  p_parentesco    text,
  p_responsavel   boolean DEFAULT false,
  p_copiar_endereco_para_familia boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vinculo_id uuid;
  v_pessoa     public.membros%ROWTYPE;
BEGIN
  -- Se for responsavel, desmarca outros responsaveis dessa familia
  IF p_responsavel THEN
    UPDATE public.vinculos_familiares SET responsavel_familia = false 
     WHERE familia_id = p_familia_id;
  END IF;

  -- UPSERT do vinculo (uma pessoa so pode ter 1 vinculo ativo numa familia)
  INSERT INTO public.vinculos_familiares (familia_id, membro_id, parentesco, responsavel_familia)
  VALUES (p_familia_id, p_pessoa_id, p_parentesco::parentesco_tipo, p_responsavel)
  ON CONFLICT (familia_id, membro_id) DO UPDATE 
     SET parentesco = EXCLUDED.parentesco,
         responsavel_familia = EXCLUDED.responsavel_familia,
         updated_at = NOW()
  RETURNING id INTO v_vinculo_id;

  -- Se pediu pra copiar endereco
  IF p_copiar_endereco_para_familia THEN
    SELECT * INTO v_pessoa FROM public.membros WHERE id = p_pessoa_id;
    UPDATE public.familias SET
      endereco    = v_pessoa.endereco,
      numero      = v_pessoa.numero,
      complemento = v_pessoa.complemento,
      bairro      = v_pessoa.bairro,
      cidade      = v_pessoa.cidade,
      cep         = v_pessoa.cep,
      updated_at  = NOW()
     WHERE id = p_familia_id;
  END IF;

  RETURN v_vinculo_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.vincular_pessoa_familia(uuid, uuid, text, boolean, boolean) TO authenticated;

-- Garante UNIQUE pra UPSERT funcionar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
     WHERE conname = 'vinculos_familiares_familia_membro_uniq'
  ) THEN
    ALTER TABLE public.vinculos_familiares
      ADD CONSTRAINT vinculos_familiares_familia_membro_uniq UNIQUE (familia_id, membro_id);
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
