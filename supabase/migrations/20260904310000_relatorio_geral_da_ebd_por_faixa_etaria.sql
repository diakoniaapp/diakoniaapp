-- ═══════════════════════════════════════════════════════════════════════════
-- Relatório geral da EBD: gráfico de faixa etária mais presente/mais ausente
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela, olhando o relatório geral recém-ganho de seletor de período
-- (migration 20260904300000): "QURO NO RELATÓRIO, UM GRAFICO MEDINDO A
-- FAICA ETÁRIA MAIS PRESENTE E MAIS AUSENTE".
--
-- Já existe `ebd_painel_por_faixa()` (migration 20260826140000), que agrupa
-- por idade REAL do aluno (não pela classe — importante porque uma faixa
-- etária às vezes tem mais de uma classe, ex.: duas classes de 40+, e olhar
-- só "por classe" esconde isso). Mas ela não recebe período: é sempre
-- "desde sempre". Esta função nova replica a mesma categorização de faixa
-- (0 a 6 / 7 a 9 / 10 a 12 / 13 a 17 / 18 a 29 / 30 a 49 / 50 a 64 / 65+),
-- mas filtrando por `[p_inicio, p_fim)` — o mesmo par de datas que
-- `ebd_relatorio_geral_resumo`/`_por_classe` já usam.
--
-- Aproveitado pra corrigir de uma vez o defeito já registrado sobre a
-- função antiga (CLAUDE.md/memória: "ebd_painel_por_faixa NÃO exclui
-- professor de matriculado"): esta versão nova já exclui, seguindo a mesma
-- regra usada em toda RPC `_geral_*` desta frente.

BEGIN;

CREATE FUNCTION public.ebd_relatorio_geral_por_faixa(p_inicio date, p_fim date)
RETURNS TABLE (
  faixa        text,
  ordem        int,
  matriculados int,
  presentes    int,
  ausentes     int,
  /** Nulo quando a faixa não teve nenhuma oportunidade de presença no período. */
  taxa         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH mat AS (
    SELECT em.pessoa_id, em.classe_id,
           CASE
             WHEN m.data_nascimento IS NULL THEN 'Sem data de nascimento'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 7  THEN '0 a 6 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 10 THEN '7 a 9 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 13 THEN '10 a 12 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 18 THEN '13 a 17 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 30 THEN '18 a 29 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 50 THEN '30 a 49 anos'
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 65 THEN '50 a 64 anos'
             ELSE '65 anos ou mais'
           END AS faixa,
           CASE
             WHEN m.data_nascimento IS NULL THEN 99
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 7  THEN 0
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 10 THEN 7
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 13 THEN 10
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 18 THEN 13
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 30 THEN 18
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 50 THEN 30
             WHEN date_part('year', age(current_date, m.data_nascimento)) < 65 THEN 50
             ELSE 65
           END AS ordem
      FROM public.ebd_matriculas em
      JOIN public.membros m ON m.id = em.pessoa_id
      JOIN public.ebd_classes c ON c.id = em.classe_id
     WHERE em.ativo AND c.ativo
       AND NOT EXISTS (
         SELECT 1 FROM public.ebd_professores epr
          WHERE epr.classe_id = em.classe_id AND epr.pessoa_id = em.pessoa_id AND epr.ativo
       )
  ),
  matriculados_por_faixa AS (
    SELECT faixa, ordem, count(DISTINCT pessoa_id) AS n
      FROM mat
     GROUP BY faixa, ordem
  ),
  aulas_do_periodo AS (
    SELECT a.id, a.classe_id
      FROM public.ebd_aulas a
      JOIN public.ebd_classes c ON c.id = a.classe_id
     WHERE c.ativo
       AND a.data >= p_inicio AND a.data < p_fim
       AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)
  ),
  -- Uma linha por (aluno, aula com chamada da classe dele) no período: o
  -- universo do que poderia ter sido presença. Ausência é a linha sem marca
  -- de presente — mesma regra de sempre (aula sem chamada não conta).
  esperado AS (
    SELECT mat.faixa, mat.pessoa_id, a.id AS aula_id
      FROM mat JOIN aulas_do_periodo a ON a.classe_id = mat.classe_id
  ),
  oportunidade AS (
    SELECT e.faixa,
           count(*) FILTER (WHERE p.presente)                      AS presentes,
           count(*) FILTER (WHERE p.presente IS DISTINCT FROM true) AS ausentes
      FROM esperado e
      LEFT JOIN public.ebd_presencas p
             ON p.aula_id = e.aula_id AND p.pessoa_id = e.pessoa_id
     GROUP BY e.faixa
  )
  SELECT mf.faixa, mf.ordem,
         mf.n::int,
         COALESCE(o.presentes, 0)::int,
         COALESCE(o.ausentes, 0)::int,
         CASE WHEN COALESCE(o.presentes, 0) + COALESCE(o.ausentes, 0) = 0 THEN NULL
              ELSE round(100.0 * COALESCE(o.presentes, 0) / (o.presentes + o.ausentes), 1)
         END
    FROM matriculados_por_faixa mf
    LEFT JOIN oportunidade o ON o.faixa = mf.faixa
   ORDER BY mf.ordem;
$$;

COMMIT;
