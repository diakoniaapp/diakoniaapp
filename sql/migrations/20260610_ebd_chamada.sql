-- ─── EBD Fase B: chamada + visitante + foto ─────────────────────────────────

-- ── Storage bucket para fotos das aulas ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ebd-aulas', 'ebd-aulas', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS storage: leitura pública, escrita autenticada
DROP POLICY IF EXISTS "ebd_aulas_read"   ON storage.objects;
DROP POLICY IF EXISTS "ebd_aulas_write"  ON storage.objects;

CREATE POLICY "ebd_aulas_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'ebd-aulas');

CREATE POLICY "ebd_aulas_write" ON storage.objects
  FOR ALL TO authenticated 
  USING (bucket_id = 'ebd-aulas') 
  WITH CHECK (bucket_id = 'ebd-aulas');

-- ── RPC: criar ou carregar aula numa data ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.ebd_obter_ou_criar_aula(
  p_classe_id uuid,
  p_data      date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id 
    FROM public.ebd_aulas 
   WHERE classe_id = p_classe_id AND data = p_data;
  IF v_id IS NULL THEN
    INSERT INTO public.ebd_aulas (classe_id, data, created_by)
         VALUES (p_classe_id, p_data, auth.uid())
         RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ebd_obter_ou_criar_aula(uuid, date) TO authenticated;

-- ── RPC: marcar presença (upsert) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ebd_marcar_presenca(
  p_aula_id      uuid,
  p_pessoa_id    uuid,
  p_presente     boolean,
  p_eh_visitante boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.ebd_presencas (aula_id, pessoa_id, presente, eh_visitante, registrado_por)
  VALUES (p_aula_id, p_pessoa_id, p_presente, p_eh_visitante, auth.uid())
  ON CONFLICT (aula_id, pessoa_id) DO UPDATE
     SET presente       = EXCLUDED.presente,
         eh_visitante   = EXCLUDED.eh_visitante,
         registrado_por = EXCLUDED.registrado_por
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ebd_marcar_presenca(uuid, uuid, boolean, boolean) TO authenticated;

-- ── RPC: visão da chamada — uma linha por matriculado + por visitante ─────
CREATE OR REPLACE FUNCTION public.ebd_chamada_view(p_aula_id uuid)
RETURNS TABLE(
  pessoa_id      uuid,
  nome_completo  text,
  idade          int,
  presente       boolean,
  eh_visitante   boolean,
  tipo           text  -- 'matriculado' ou 'visitante'
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH aula AS (
    SELECT * FROM public.ebd_aulas WHERE id = p_aula_id
  )
  -- Matriculados ativos da classe
  SELECT m.id, m.nome_completo,
         CASE WHEN m.data_nascimento IS NOT NULL
              THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int
              ELSE NULL END AS idade,
         COALESCE(ep.presente, false) AS presente,
         false AS eh_visitante,
         'matriculado'::text AS tipo
    FROM aula a
    JOIN public.ebd_matriculas em ON em.classe_id = a.classe_id AND em.ativo
    JOIN public.membros m ON m.id = em.pessoa_id
    LEFT JOIN public.ebd_presencas ep ON ep.aula_id = a.id AND ep.pessoa_id = m.id
   WHERE m.status = 'ativo'

  UNION ALL

  -- Visitantes marcados nesta aula
  SELECT m.id, m.nome_completo,
         CASE WHEN m.data_nascimento IS NOT NULL
              THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int
              ELSE NULL END AS idade,
         ep.presente,
         true AS eh_visitante,
         'visitante'::text AS tipo
    FROM public.ebd_presencas ep
    JOIN public.membros m ON m.id = ep.pessoa_id
   WHERE ep.aula_id = p_aula_id AND ep.eh_visitante = true
   ORDER BY 6, 2;  -- tipo, depois nome
$$;
GRANT EXECUTE ON FUNCTION public.ebd_chamada_view(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
