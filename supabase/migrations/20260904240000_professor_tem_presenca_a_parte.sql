-- ═══════════════════════════════════════════════════════════════════════════
-- Professor tem presença à parte
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela: "os professores deveriam entrar com presença à parte... nao
-- listado junto com os alunos". Achado real, no próprio relatório que acabou
-- de sair no ar: Elizabeth Aganetti Monteiro Gonçalves é a professora
-- responsável da Classe Edna E TAMBÉM aparece matriculada como aluna —
-- `ebd_chamada_view` não distinguia professor de aluno, então ela caía na
-- lista de "Ausentes" junto com as 22 outras, e a assinatura do relatório
-- dizia "responsável" por alguém que o próprio relatório contava como falta.
--
-- `ebd_chamada_view` ganha um terceiro grupo, 'professor': todo mundo em
-- `ebd_professores` ativo da classe, com presença própria (mesma tabela
-- `ebd_presencas`, mesmo mecanismo de sempre — não precisa de tabela nova).
-- Quem é professor E matriculado (como a Elizabeth) sai da lista de
-- 'matriculado' — aparece uma vez só, no grupo certo.

BEGIN;

CREATE OR REPLACE FUNCTION public.ebd_chamada_view(p_aula_id uuid)
RETURNS TABLE(pessoa_id uuid, nome_completo text, idade integer, presente boolean, eh_visitante boolean, tipo text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  WITH aula AS (
    SELECT * FROM public.ebd_aulas WHERE id = p_aula_id
  ),
  professores_da_classe AS (
    SELECT epr.pessoa_id
      FROM public.ebd_professores epr, aula a
     WHERE epr.classe_id = a.classe_id AND epr.ativo
  )
  -- Professores ativos da classe — presença própria, nunca junto dos alunos
  SELECT m.id, m.nome_completo,
         CASE WHEN m.data_nascimento IS NOT NULL
              THEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int
              ELSE NULL END AS idade,
         COALESCE(ep.presente, false) AS presente,
         false AS eh_visitante,
         'professor'::text AS tipo
    FROM aula a
    JOIN professores_da_classe pc ON true
    JOIN public.membros m ON m.id = pc.pessoa_id
    LEFT JOIN public.ebd_presencas ep ON ep.aula_id = a.id AND ep.pessoa_id = m.id
   WHERE m.status = 'ativo'

  UNION ALL

  -- Matriculados ativos da classe — quem também é professor sai daqui
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
     AND m.id NOT IN (SELECT pessoa_id FROM professores_da_classe)

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
   WHERE ep.aula_id = p_aula_id AND ep.eh_visitante = true;
$function$;

COMMIT;
