-- ═══════════════════════════════════════════════════════════════════════════
-- Relatório mensal da EBD, com indicadores
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela, na sequência do relatório por aula: "gere também a opção de
-- relatório mensal, com indicadores". O relatório por aula (`EbdAulaRelatorio`)
-- já existia; este soma o mês inteiro de uma classe: quantas aulas
-- aconteceram, presença média, e a frequência de cada matriculado.
--
-- Duas regras que já valiam no painel geral de acompanhamento
-- (`ebd_painel_resumo`, migration 20260826140000) valem aqui também, pelo
-- mesmo motivo:
--
-- 1. **"Aula sem nenhuma presença registrada é chamada não feita, não
--    'todos faltaram'."** Só aulas com pelo menos uma presença lançada
--    entram no denominador da taxa — senão um mês com 4 domingos e só 1
--    chamada feita acusaria 75% de falta que não existe.
-- 2. **Professor não conta como aluno na frequência** (achado real,
--    migration 20260904240000: uma professora também matriculada caía
--    contada como falta). A mesma exclusão de `ebd_chamada_view` se repete
--    aqui — quem lidera a classe não entra no cálculo de quem frequenta.
--
-- Duas RPCs, mesmo padrão de `ebd_painel_resumo`/`ebd_painel_alunos_ausentes`
-- (funções separadas, cada uma devolvendo uma tabela): uma pro resumo do
-- mês, outra pra frequência por pessoa (já em ordem alfabética, pedido dela
-- na mensagem anterior).

BEGIN;

CREATE OR REPLACE FUNCTION public.ebd_relatorio_mensal_resumo(p_classe_id uuid, p_ano int, p_mes int)
RETURNS TABLE (
  aulas_total       int,
  aulas_com_chamada int,
  matriculados      int,
  presentes         int,
  ausentes          int,
  visitantes        int,
  /** Nulo quando não há aula com chamada ou não há matriculado — não há taxa a calcular. */
  taxa_presenca     numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_aulas_total       int;
  v_aulas_com_chamada int;
  v_matriculados      int;
  v_presentes         int;
  v_visitantes        int;
BEGIN
  SELECT count(*) INTO v_aulas_total
    FROM public.ebd_aulas a
   WHERE a.classe_id = p_classe_id
     AND EXTRACT(YEAR FROM a.data) = p_ano AND EXTRACT(MONTH FROM a.data) = p_mes;

  SELECT count(*) INTO v_aulas_com_chamada
    FROM public.ebd_aulas a
   WHERE a.classe_id = p_classe_id
     AND EXTRACT(YEAR FROM a.data) = p_ano AND EXTRACT(MONTH FROM a.data) = p_mes
     AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id);

  SELECT count(*) INTO v_matriculados
    FROM public.ebd_matriculas em
    JOIN public.membros m ON m.id = em.pessoa_id
   WHERE em.classe_id = p_classe_id AND em.ativo AND m.status = 'ativo'
     AND em.pessoa_id NOT IN (
       SELECT pessoa_id FROM public.ebd_professores WHERE classe_id = p_classe_id AND ativo
     );

  SELECT count(*) INTO v_presentes
    FROM public.ebd_presencas p
    JOIN public.ebd_aulas a ON a.id = p.aula_id
   WHERE a.classe_id = p_classe_id
     AND EXTRACT(YEAR FROM a.data) = p_ano AND EXTRACT(MONTH FROM a.data) = p_mes
     AND p.presente AND NOT p.eh_visitante
     AND p.pessoa_id NOT IN (
       SELECT pessoa_id FROM public.ebd_professores WHERE classe_id = p_classe_id AND ativo
     );

  SELECT count(DISTINCT p.pessoa_id) INTO v_visitantes
    FROM public.ebd_presencas p
    JOIN public.ebd_aulas a ON a.id = p.aula_id
   WHERE a.classe_id = p_classe_id
     AND EXTRACT(YEAR FROM a.data) = p_ano AND EXTRACT(MONTH FROM a.data) = p_mes
     AND p.eh_visitante AND p.presente;

  RETURN QUERY SELECT
    v_aulas_total,
    v_aulas_com_chamada,
    v_matriculados,
    v_presentes,
    GREATEST(v_matriculados * v_aulas_com_chamada - v_presentes, 0),
    v_visitantes,
    CASE WHEN v_aulas_com_chamada = 0 OR v_matriculados = 0 THEN NULL
         ELSE round(100.0 * v_presentes / (v_matriculados * v_aulas_com_chamada), 1)
    END;
END;
$$;

CREATE OR REPLACE FUNCTION public.ebd_relatorio_mensal_frequencia(p_classe_id uuid, p_ano int, p_mes int)
RETURNS TABLE (
  pessoa_id      uuid,
  nome_completo  text,
  oportunidades  int,
  presencas      int,
  /** Nulo quando não há aula com chamada no mês — não há taxa a calcular. */
  taxa           numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH aulas_com_chamada AS (
    SELECT a.id FROM public.ebd_aulas a
     WHERE a.classe_id = p_classe_id
       AND EXTRACT(YEAR FROM a.data) = p_ano AND EXTRACT(MONTH FROM a.data) = p_mes
       AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)
  ),
  matriculados_sem_professor AS (
    SELECT em.pessoa_id, m.nome_completo
      FROM public.ebd_matriculas em
      JOIN public.membros m ON m.id = em.pessoa_id
     WHERE em.classe_id = p_classe_id AND em.ativo AND m.status = 'ativo'
       AND em.pessoa_id NOT IN (
         SELECT pessoa_id FROM public.ebd_professores WHERE classe_id = p_classe_id AND ativo
       )
  )
  SELECT
    ms.pessoa_id,
    ms.nome_completo,
    (SELECT count(*) FROM aulas_com_chamada)::int AS oportunidades,
    count(p.id) FILTER (WHERE p.presente)::int AS presencas,
    CASE WHEN (SELECT count(*) FROM aulas_com_chamada) = 0 THEN NULL
         ELSE round(100.0 * count(p.id) FILTER (WHERE p.presente) / (SELECT count(*) FROM aulas_com_chamada), 1)
    END AS taxa
  FROM matriculados_sem_professor ms
  LEFT JOIN public.ebd_presencas p
         ON p.pessoa_id = ms.pessoa_id AND p.aula_id IN (SELECT id FROM aulas_com_chamada)
  GROUP BY ms.pessoa_id, ms.nome_completo
  ORDER BY ms.nome_completo;
$$;

COMMIT;
