-- ═══════════════════════════════════════════════════════════════════════════
-- Ordem alfabética na chamada, como no relatório
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido dela: "a lista de chamada, assim como no relatório, deve ficar em
-- ordem alfabética". Achado ao medir: a migration anterior
-- (20260904240000, professor à parte) reescreveu `ebd_chamada_view` em três
-- SELECTs unidos por UNION ALL e **perdeu o `ORDER BY` que a versão antiga
-- tinha** (`ORDER BY tipo, nome`) — regressão minha, não pedido novo.
-- `diaconia_chamada_view` já ordenava (`ORDER BY p.nome_completo`) e PGM já
-- ordena no serviço (`listarPresencas`, `pgmService.ts`) — só EBD quebrou.
--
-- Devolve o ORDER BY aqui, e a ordenação de verdade (acento-consciente, pt-BR)
-- fica garantida de novo no `chamadaView()` de `ebdService.ts` e
-- `diaconiaService.ts` — mesmo padrão que `pessoasDaArea`/`listarPresencas`
-- já usam, porque `ORDER BY` puro do Postgres não necessariamente ordena
-- "Éder" e "Eduarda" do jeito que uma pessoa brasileira leria.

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
  SELECT * FROM (
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
     WHERE ep.aula_id = p_aula_id AND ep.eh_visitante = true
  ) t
  ORDER BY tipo, nome_completo;
$function$;

COMMIT;
