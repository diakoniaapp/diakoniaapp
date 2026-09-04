-- ═══════════════════════════════════════════════════════════════════════════
-- esperados_da_classe ganha tipo_pessoa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela, no Painel da EBD: "porcentagem de faixa etária mais ausente
-- da EBD (membros apenas)". A função já devolvia todo mundo elegível pela
-- idade/gênero da classe (membro OU congregado — ver WHERE), mas não dizia
-- qual das duas coisas cada linha era. Sem isso, o front não consegue medir
-- "só membro" — precisaria adivinhar ou trazer outra consulta.
--
-- Um campo a mais no SELECT, o resto da função INTOCADO — mesmo filtro,
-- mesma regra de elegibilidade, mesma ordem.

BEGIN;

-- Muda o tipo de retorno (uma coluna nova no meio da tabela) — CREATE OR
-- REPLACE sozinho não troca a assinatura, precisa do DROP explícito antes
-- (lição já registrada nesta sessão, em diaconia_atualizar_pessoa).
DROP FUNCTION IF EXISTS public.esperados_da_classe(uuid);

CREATE FUNCTION public.esperados_da_classe(p_classe_id uuid)
RETURNS TABLE(
  pessoa_id uuid, nome_completo text, sexo text, data_nascimento date, idade integer,
  tipo_pessoa text,
  ja_matriculado boolean, matricula_id uuid,
  outra_classe_id uuid, outra_classe_nome text, outra_classe_papel text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  WITH c AS (
    SELECT * FROM public.ebd_classes WHERE id = p_classe_id
  ),
  vinculo AS (
    SELECT em.pessoa_id, em.classe_id, cl.nome AS classe_nome,
           'aluno'::text AS papel, em.id AS matricula_id
      FROM public.ebd_matriculas em
      JOIN public.ebd_classes cl ON cl.id = em.classe_id
     WHERE em.ativo = true
    UNION ALL
    SELECT ep.pessoa_id, ep.classe_id, cl.nome,
           'professor'::text, NULL::uuid
      FROM public.ebd_professores ep
      JOIN public.ebd_classes cl ON cl.id = ep.classe_id
     WHERE ep.ativo = true
  ),
  escolhido AS (
    SELECT DISTINCT ON (v.pessoa_id) v.*
      FROM vinculo v
     ORDER BY v.pessoa_id, (v.classe_id = p_classe_id) DESC, v.papel, v.classe_nome
  )
  SELECT m.id AS pessoa_id,
         m.nome_completo,
         m.sexo::text,
         m.data_nascimento,
         EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int AS idade,
         m.tipo_pessoa::text,
         COALESCE(e.classe_id = p_classe_id AND e.papel = 'aluno', false) AS ja_matriculado,
         CASE WHEN e.classe_id = p_classe_id AND e.papel = 'aluno' THEN e.matricula_id END AS matricula_id,
         CASE WHEN e.classe_id <> p_classe_id THEN e.classe_id   END AS outra_classe_id,
         CASE WHEN e.classe_id <> p_classe_id THEN e.classe_nome END AS outra_classe_nome,
         CASE WHEN e.classe_id <> p_classe_id THEN e.papel       END AS outra_classe_papel
    FROM public.membros m
    CROSS JOIN c
    LEFT JOIN escolhido e ON e.pessoa_id = m.id
   WHERE m.status = 'ativo'
     AND m.tipo_pessoa IN ('membro','congregado')
     AND m.data_nascimento IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_professores ep2
        WHERE ep2.pessoa_id = m.id
          AND ep2.classe_id = p_classe_id
          AND ep2.ativo = true
     )
     AND (c.idade_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) >= c.idade_min)
     AND (c.idade_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) <= c.idade_max)
     AND (c.genero = 'misto' OR (m.sexo IS NOT NULL AND c.genero = m.sexo::text))
   ORDER BY m.nome_completo;
$function$;

COMMIT;
