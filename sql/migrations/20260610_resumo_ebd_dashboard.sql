-- ─── Dashboard: Resumo EBD ─────────────────────────────────────────────────

-- Função helper: domingo da semana de uma data
CREATE OR REPLACE FUNCTION public.domingo_da_semana(p_data date)
RETURNS date
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (p_data - (EXTRACT(DOW FROM p_data)::int) * INTERVAL '1 day')::date;
$$;

-- RPC: resumo geral da EBD para o dashboard
CREATE OR REPLACE FUNCTION public.resumo_ebd_dashboard()
RETURNS TABLE(
  total_alunos              int,
  total_classes_ativas      int,
  ultimo_domingo            date,
  domingo_anterior          date,
  classes_com_aula_ult      int,
  presentes_ult             int,
  matriculados_classes_ult  int,
  taxa_presenca_ult         numeric,
  presentes_ant             int,
  matriculados_classes_ant  int,
  taxa_presenca_ant         numeric,
  variacao_presenca         numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH 
  ultima_data AS (
    SELECT public.domingo_da_semana(CURRENT_DATE) AS d
  ),
  anterior_data AS (
    SELECT (SELECT d FROM ultima_data) - INTERVAL '7 days' AS d
  ),
  aulas_ult AS (
    SELECT a.id, a.classe_id 
      FROM public.ebd_aulas a, ultima_data
     WHERE a.data = (SELECT d FROM ultima_data)
  ),
  aulas_ant AS (
    SELECT a.id, a.classe_id 
      FROM public.ebd_aulas a, anterior_data
     WHERE a.data = ((SELECT d FROM anterior_data))::date
  ),
  presencas_ult AS (
    SELECT COUNT(*)::int AS qtd FROM public.ebd_presencas ep
     WHERE ep.aula_id IN (SELECT id FROM aulas_ult)
       AND ep.presente = true
  ),
  presencas_ant AS (
    SELECT COUNT(*)::int AS qtd FROM public.ebd_presencas ep
     WHERE ep.aula_id IN (SELECT id FROM aulas_ant)
       AND ep.presente = true
  ),
  matric_classes_ult AS (
    SELECT COUNT(*)::int AS qtd FROM public.ebd_matriculas em
     WHERE em.ativo = true 
       AND em.classe_id IN (SELECT classe_id FROM aulas_ult)
  ),
  matric_classes_ant AS (
    SELECT COUNT(*)::int AS qtd FROM public.ebd_matriculas em
     WHERE em.ativo = true 
       AND em.classe_id IN (SELECT classe_id FROM aulas_ant)
  )
  SELECT
    (SELECT COUNT(*)::int FROM public.ebd_matriculas WHERE ativo = true),
    (SELECT COUNT(*)::int FROM public.ebd_classes WHERE ativo = true),
    (SELECT d FROM ultima_data),
    ((SELECT d FROM anterior_data))::date,
    (SELECT COUNT(*)::int FROM aulas_ult),
    (SELECT qtd FROM presencas_ult),
    (SELECT qtd FROM matric_classes_ult),
    CASE WHEN (SELECT qtd FROM matric_classes_ult) > 0 
         THEN ROUND(100.0 * (SELECT qtd FROM presencas_ult) / (SELECT qtd FROM matric_classes_ult), 1)
         ELSE 0 END,
    (SELECT qtd FROM presencas_ant),
    (SELECT qtd FROM matric_classes_ant),
    CASE WHEN (SELECT qtd FROM matric_classes_ant) > 0
         THEN ROUND(100.0 * (SELECT qtd FROM presencas_ant) / (SELECT qtd FROM matric_classes_ant), 1)
         ELSE 0 END,
    -- variacao = ult - ant em pontos percentuais
    CASE WHEN (SELECT qtd FROM matric_classes_ant) > 0 AND (SELECT qtd FROM matric_classes_ult) > 0
         THEN ROUND(
           (100.0 * (SELECT qtd FROM presencas_ult) / NULLIF((SELECT qtd FROM matric_classes_ult),0)) -
           (100.0 * (SELECT qtd FROM presencas_ant) / NULLIF((SELECT qtd FROM matric_classes_ant),0))
         , 1)
         ELSE 0 END;
$$;
GRANT EXECUTE ON FUNCTION public.resumo_ebd_dashboard() TO authenticated;

-- RPC: classes com baixa presença (% media nas ultimas 4 aulas < 60%)
CREATE OR REPLACE FUNCTION public.ebd_classes_baixa_presenca()
RETURNS TABLE(
  classe_id           uuid,
  classe_nome         text,
  qtd_aulas_recentes  int,
  taxa_media          numeric,
  total_matriculados  int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH 
  ultimas_aulas AS (
    SELECT a.id, a.classe_id, a.data,
           ROW_NUMBER() OVER (PARTITION BY a.classe_id ORDER BY a.data DESC) AS rn
      FROM public.ebd_aulas a
     WHERE a.data <= CURRENT_DATE
  ),
  recentes AS (
    SELECT * FROM ultimas_aulas WHERE rn <= 4
  ),
  matric AS (
    SELECT classe_id, COUNT(*)::int AS qtd 
      FROM public.ebd_matriculas WHERE ativo = true GROUP BY classe_id
  ),
  presenca_por_aula AS (
    SELECT r.classe_id, r.id AS aula_id, m.qtd AS matriculados,
           (SELECT COUNT(*)::int FROM public.ebd_presencas ep 
             WHERE ep.aula_id = r.id AND ep.presente = true) AS presentes
      FROM recentes r
      JOIN matric m ON m.classe_id = r.classe_id
  )
  SELECT 
    p.classe_id,
    c.nome,
    COUNT(*)::int AS qtd_aulas_recentes,
    ROUND(AVG(100.0 * p.presentes / NULLIF(p.matriculados, 0)), 1) AS taxa_media,
    MAX(p.matriculados)
  FROM presenca_por_aula p
  JOIN public.ebd_classes c ON c.id = p.classe_id AND c.ativo = true
  GROUP BY p.classe_id, c.nome
  HAVING ROUND(AVG(100.0 * p.presentes / NULLIF(p.matriculados, 0)), 1) < 60
     AND COUNT(*) >= 2  -- precisa de ao menos 2 aulas pra ser representativo
  ORDER BY taxa_media ASC
  LIMIT 10;
$$;
GRANT EXECUTE ON FUNCTION public.ebd_classes_baixa_presenca() TO authenticated;

NOTIFY pgrst, 'reload schema';
