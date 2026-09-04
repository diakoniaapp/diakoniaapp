-- ═══════════════════════════════════════════════════════════════════════════
-- Relatório geral da EBD: de "só mês" para semana/mês/ano
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela: "transforme a que já existe (EbdRelatorioMensalGeral.tsx) num
-- seletor de período (semana/mês/ano) no lugar do campo de mês que já tem
-- lá". As duas RPCs da migration 20260904270000
-- (`ebd_relatorio_mensal_geral_resumo`/`_por_classe`) recebiam `(p_ano int,
-- p_mes int)` e filtravam com `EXTRACT(YEAR...)/EXTRACT(MONTH...)` — só
-- serve pra mês. Trocado por `(p_inicio date, p_fim date)`, intervalo
-- meio-aberto `[inicio, fim)`: o mesmo par de funções agora atende semana,
-- mês OU ano, dependendo só do intervalo que o front calcula. Precisa de
-- `DROP FUNCTION` porque mudar o tipo dos parâmetros não é um `CREATE OR
-- REPLACE` válido (mesma armadilha já registrada em `esperados_da_classe`,
-- migration 20260904280000).
--
-- As três regras de sempre continuam valendo, agora sobre o intervalo
-- escolhido em vez de "o mês": aula sem chamada não conta como "todos
-- faltaram"; professor não conta como aluno matriculado; a oportunidade de
-- presença é matriculados × aulas-com-chamada, calculada POR CLASSE.

BEGIN;

DROP FUNCTION IF EXISTS public.ebd_relatorio_mensal_geral_resumo(int, int);
DROP FUNCTION IF EXISTS public.ebd_relatorio_mensal_geral_por_classe(int, int);

CREATE FUNCTION public.ebd_relatorio_geral_resumo(p_inicio date, p_fim date)
RETURNS TABLE (
  classes_ativas    int,
  aulas_total       int,
  aulas_com_chamada int,
  matriculados      int,
  presentes         int,
  ausentes          int,
  visitantes        int,
  /** Nulo quando não há nenhuma oportunidade de presença no período. */
  taxa_presenca     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_classes_ativas    int;
  v_aulas_total       int;
  v_aulas_com_chamada int;
  v_matriculados      int;
  v_presentes         int;
  v_visitantes        int;
  v_oportunidades     int;
BEGIN
  SELECT count(*) INTO v_classes_ativas FROM public.ebd_classes WHERE ativo;

  SELECT count(*) INTO v_aulas_total
    FROM public.ebd_aulas a JOIN public.ebd_classes c ON c.id = a.classe_id
   WHERE c.ativo AND a.data >= p_inicio AND a.data < p_fim;

  SELECT count(*) INTO v_aulas_com_chamada
    FROM public.ebd_aulas a JOIN public.ebd_classes c ON c.id = a.classe_id
   WHERE c.ativo AND a.data >= p_inicio AND a.data < p_fim
     AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id);

  SELECT count(*) INTO v_matriculados
    FROM public.ebd_matriculas em
    JOIN public.membros m ON m.id = em.pessoa_id
    JOIN public.ebd_classes c ON c.id = em.classe_id
   WHERE em.ativo AND c.ativo AND m.status = 'ativo'
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_professores epr
        WHERE epr.classe_id = em.classe_id AND epr.pessoa_id = em.pessoa_id AND epr.ativo
     );

  SELECT count(*) INTO v_presentes
    FROM public.ebd_presencas p
    JOIN public.ebd_aulas a ON a.id = p.aula_id
    JOIN public.ebd_classes c ON c.id = a.classe_id
   WHERE c.ativo AND a.data >= p_inicio AND a.data < p_fim
     AND p.presente AND NOT p.eh_visitante
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_professores epr
        WHERE epr.classe_id = a.classe_id AND epr.pessoa_id = p.pessoa_id AND epr.ativo
     );

  SELECT count(DISTINCT p.pessoa_id) INTO v_visitantes
    FROM public.ebd_presencas p
    JOIN public.ebd_aulas a ON a.id = p.aula_id
    JOIN public.ebd_classes c ON c.id = a.classe_id
   WHERE c.ativo AND a.data >= p_inicio AND a.data < p_fim
     AND p.eh_visitante AND p.presente;

  SELECT COALESCE(SUM(
    (SELECT count(*) FROM public.ebd_matriculas em2
       JOIN public.membros m2 ON m2.id = em2.pessoa_id
      WHERE em2.classe_id = c.id AND em2.ativo AND m2.status = 'ativo'
        AND NOT EXISTS (SELECT 1 FROM public.ebd_professores epr2
                         WHERE epr2.classe_id = c.id AND epr2.pessoa_id = em2.pessoa_id AND epr2.ativo))
    *
    (SELECT count(*) FROM public.ebd_aulas a2
      WHERE a2.classe_id = c.id
        AND a2.data >= p_inicio AND a2.data < p_fim
        AND EXISTS (SELECT 1 FROM public.ebd_presencas p2 WHERE p2.aula_id = a2.id))
  ), 0) INTO v_oportunidades
  FROM public.ebd_classes c WHERE c.ativo;

  RETURN QUERY SELECT
    v_classes_ativas, v_aulas_total, v_aulas_com_chamada, v_matriculados,
    v_presentes, GREATEST(v_oportunidades - v_presentes, 0), v_visitantes,
    CASE WHEN v_oportunidades = 0 THEN NULL ELSE round(100.0 * v_presentes / v_oportunidades, 1) END;
END;
$$;

CREATE FUNCTION public.ebd_relatorio_geral_por_classe(p_inicio date, p_fim date)
RETURNS TABLE (
  classe_id         uuid,
  classe_nome       text,
  matriculados      int,
  aulas_total       int,
  aulas_com_chamada int,
  presentes         int,
  /** Nulo quando a classe não teve aula com chamada, ou não tem matriculado. */
  taxa              numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH classes AS (
    SELECT id, nome, ordem FROM public.ebd_classes WHERE ativo
  ),
  matriculados_por_classe AS (
    SELECT em.classe_id, count(*) AS n
      FROM public.ebd_matriculas em
      JOIN public.membros m ON m.id = em.pessoa_id
     WHERE em.ativo AND m.status = 'ativo'
       AND NOT EXISTS (SELECT 1 FROM public.ebd_professores epr
                        WHERE epr.classe_id = em.classe_id AND epr.pessoa_id = em.pessoa_id AND epr.ativo)
     GROUP BY em.classe_id
  ),
  aulas_do_periodo AS (
    SELECT a.classe_id, a.id,
           EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id) AS tem_chamada
      FROM public.ebd_aulas a
     WHERE a.data >= p_inicio AND a.data < p_fim
  ),
  aulas_por_classe AS (
    SELECT classe_id, count(*) AS total, count(*) FILTER (WHERE tem_chamada) AS com_chamada
      FROM aulas_do_periodo
     GROUP BY classe_id
  ),
  presentes_por_classe AS (
    SELECT a.classe_id, count(*) AS n
      FROM public.ebd_presencas p
      JOIN aulas_do_periodo a ON a.id = p.aula_id AND a.tem_chamada
     WHERE p.presente AND NOT p.eh_visitante
       AND NOT EXISTS (SELECT 1 FROM public.ebd_professores epr
                        WHERE epr.classe_id = a.classe_id AND epr.pessoa_id = p.pessoa_id AND epr.ativo)
     GROUP BY a.classe_id
  )
  SELECT
    c.id, c.nome,
    COALESCE(mc.n, 0)::int,
    COALESCE(ac.total, 0)::int,
    COALESCE(ac.com_chamada, 0)::int,
    COALESCE(pc.n, 0)::int,
    CASE WHEN COALESCE(ac.com_chamada, 0) = 0 OR COALESCE(mc.n, 0) = 0 THEN NULL
         ELSE round(100.0 * COALESCE(pc.n, 0) / (mc.n * ac.com_chamada), 1)
    END
  FROM classes c
  LEFT JOIN matriculados_por_classe mc ON mc.classe_id = c.id
  LEFT JOIN aulas_por_classe ac ON ac.classe_id = c.id
  LEFT JOIN presentes_por_classe pc ON pc.classe_id = c.id
  ORDER BY c.ordem, c.nome;
$$;

COMMIT;
