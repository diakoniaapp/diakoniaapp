-- ─── EBD: esperados_da_classe agora retorna info de outra matricula ──────────

DROP FUNCTION IF EXISTS public.esperados_da_classe(uuid);

CREATE OR REPLACE FUNCTION public.esperados_da_classe(p_classe_id uuid)
RETURNS TABLE(
  pessoa_id            uuid,
  nome_completo        text,
  sexo                 text,
  data_nascimento      date,
  idade                int,
  ja_matriculado       boolean,
  matricula_id         uuid,
  outra_classe_id      uuid,
  outra_classe_nome    text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT * FROM public.ebd_classes WHERE id = p_classe_id
  ),
  outras_mat AS (
    -- Para cada pessoa, qual classe ela está hoje (se nao for a atual)
    SELECT em.pessoa_id, em.classe_id, em.id AS matricula_id, cl.nome AS classe_nome
      FROM public.ebd_matriculas em
      JOIN public.ebd_classes cl ON cl.id = em.classe_id
     WHERE em.ativo = true
  )
  SELECT m.id AS pessoa_id,
         m.nome_completo,
         m.sexo::text,
         m.data_nascimento,
         EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int AS idade,
         (om.classe_id = p_classe_id) AS ja_matriculado,
         CASE WHEN om.classe_id = p_classe_id THEN om.matricula_id ELSE NULL END AS matricula_id,
         CASE WHEN om.classe_id IS NOT NULL AND om.classe_id <> p_classe_id THEN om.classe_id ELSE NULL END AS outra_classe_id,
         CASE WHEN om.classe_id IS NOT NULL AND om.classe_id <> p_classe_id THEN om.classe_nome ELSE NULL END AS outra_classe_nome
    FROM public.membros m
    CROSS JOIN c
    LEFT JOIN outras_mat om ON om.pessoa_id = m.id
   WHERE m.status = 'ativo'
     AND m.tipo_pessoa IN ('membro','congregado')
     AND m.data_nascimento IS NOT NULL
     -- Exclui professores ativos em qualquer classe (professor nao eh aluno)
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_professores ep
        WHERE ep.pessoa_id = m.id AND ep.ativo = true
     )
     -- Exclui quem ja esta matriculado em outra classe ativa
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_matriculas em2
        WHERE em2.pessoa_id = m.id 
          AND em2.classe_id <> p_classe_id
          AND em2.ativo = true
     )
     AND (c.idade_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) >= c.idade_min)
     AND (c.idade_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) <= c.idade_max)
     AND (c.genero = 'misto' OR (m.sexo IS NOT NULL AND c.genero = m.sexo::text))
   ORDER BY m.nome_completo;
$$;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO authenticated;

-- ─── RPC: mover pessoa entre classes (desativa outras e cria nova) ───────────
CREATE OR REPLACE FUNCTION public.mover_aluno_classe(
  p_pessoa_id    uuid,
  p_classe_nova  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nova_mat_id uuid;
BEGIN
  -- 1. Desativar todas as matriculas ativas da pessoa
  UPDATE public.ebd_matriculas
     SET ativo = false, updated_at = NOW()
   WHERE pessoa_id = p_pessoa_id AND ativo = true;

  -- 2. Inserir nova matricula
  INSERT INTO public.ebd_matriculas (pessoa_id, classe_id, ativo)
       VALUES (p_pessoa_id, p_classe_nova, true)
       RETURNING id INTO v_nova_mat_id;

  RETURN v_nova_mat_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mover_aluno_classe(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
