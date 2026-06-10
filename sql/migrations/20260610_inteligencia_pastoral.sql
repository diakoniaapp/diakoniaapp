-- ─── Inteligência Pastoral: alertas e sugestões ────────────────────────────

-- RPC: famílias sem responsável (com membros, mas nenhum marcado responsavel_familia)
CREATE OR REPLACE FUNCTION public.familias_sem_responsavel()
RETURNS TABLE(
  familia_id    uuid,
  nome_familia  text,
  qtd_membros   bigint,
  primeiro_membro_id   uuid,
  primeiro_membro_nome text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    f.id, 
    f.nome_familia,
    COUNT(vf.id) AS qtd_membros,
    (ARRAY_AGG(vf.membro_id ORDER BY vf.created_at))[1] AS primeiro_membro_id,
    (ARRAY_AGG(m.nome_completo ORDER BY vf.created_at))[1] AS primeiro_membro_nome
  FROM public.familias f
  LEFT JOIN public.vinculos_familiares vf ON vf.familia_id = f.id
  LEFT JOIN public.membros m ON m.id = vf.membro_id
  GROUP BY f.id, f.nome_familia
  HAVING COUNT(vf.id) > 0
     AND COUNT(vf.id) FILTER (WHERE vf.responsavel_familia = true) = 0
  ORDER BY f.nome_familia;
$$;
GRANT EXECUTE ON FUNCTION public.familias_sem_responsavel() TO authenticated;

-- RPC: pessoas com sobrenome de família já existente (mas sem vínculo)
CREATE OR REPLACE FUNCTION public.pessoas_sem_familia_sobrenome_conhecido()
RETURNS TABLE(
  pessoa_id     uuid,
  nome_completo text,
  sobrenome     text,
  qtd_pessoas_mesmo_sobrenome int,
  familia_sugerida_id   uuid,
  familia_sugerida_nome text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH 
  -- Pessoas ativas e seu sobrenome
  pessoas AS (
    SELECT m.id, m.nome_completo, public.extrair_sobrenome(m.nome_completo) AS sobrenome
    FROM public.membros m
    WHERE m.status = 'ativo'
      AND m.tipo_pessoa IN ('membro','congregado')
  ),
  -- Pessoas SEM vínculo familiar
  sem_familia AS (
    SELECT p.* FROM pessoas p
    LEFT JOIN public.vinculos_familiares vf ON vf.membro_id = p.id
    WHERE vf.id IS NULL
      AND p.sobrenome IS NOT NULL
      AND length(p.sobrenome) >= 3
  ),
  -- Familias existentes com sobrenome correspondente (via primeiro membro)
  familias_por_sobrenome AS (
    SELECT f.id, f.nome_familia, 
           public.extrair_sobrenome(f.nome_familia) AS fam_sobrenome,
           COUNT(vf.id) AS qtd_membros
    FROM public.familias f
    LEFT JOIN public.vinculos_familiares vf ON vf.familia_id = f.id
    GROUP BY f.id, f.nome_familia
    HAVING COUNT(vf.id) > 0
  ),
  -- Contar quantas pessoas têm o mesmo sobrenome (pra mostrar urgência)
  contagem AS (
    SELECT sobrenome, COUNT(*) AS qtd FROM pessoas GROUP BY sobrenome
  )
  SELECT 
    sf.id, sf.nome_completo, sf.sobrenome,
    c.qtd::int,
    fps.id,
    fps.nome_familia
  FROM sem_familia sf
  LEFT JOIN contagem c ON c.sobrenome = sf.sobrenome
  LEFT JOIN familias_por_sobrenome fps ON fps.fam_sobrenome = sf.sobrenome
  WHERE 
    (c.qtd >= 2 OR fps.id IS NOT NULL)  -- pelo menos uma referência conhecida
  ORDER BY 
    (fps.id IS NOT NULL) DESC,
    c.qtd DESC NULLS LAST,
    sf.nome_completo
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.pessoas_sem_familia_sobrenome_conhecido() TO authenticated;

-- RPC: resumo do painel pastoral (contagens)
CREATE OR REPLACE FUNCTION public.resumo_painel_pastoral()
RETURNS TABLE(
  aniversarios_hoje    int,
  bodas_hoje           int,
  aniversarios_semana  int,
  bodas_semana         int,
  familias_sem_resp    int,
  pessoas_sem_familia_sugerida int
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.vw_agenda_pastoral v
      WHERE v.tipo = 'aniversario' 
        AND date_part('month', v.data_origem) = date_part('month', CURRENT_DATE)
        AND date_part('day',   v.data_origem) = date_part('day',   CURRENT_DATE)),
    (SELECT COUNT(*)::int FROM public.vw_agenda_pastoral v
      WHERE v.tipo = 'casamento' 
        AND date_part('month', v.data_origem) = date_part('month', CURRENT_DATE)
        AND date_part('day',   v.data_origem) = date_part('day',   CURRENT_DATE)),
    (SELECT COUNT(*)::int FROM public.agenda_pastoral_proximos_dias(7) p
      WHERE p.tipo = 'aniversario'),
    (SELECT COUNT(*)::int FROM public.agenda_pastoral_proximos_dias(7) p
      WHERE p.tipo = 'casamento'),
    (SELECT COUNT(*)::int FROM public.familias_sem_responsavel()),
    (SELECT COUNT(*)::int FROM public.pessoas_sem_familia_sobrenome_conhecido());
$$;
GRANT EXECUTE ON FUNCTION public.resumo_painel_pastoral() TO authenticated;

NOTIFY pgrst, 'reload schema';
