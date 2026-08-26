-- ─── Painel de acompanhamento da EBD ────────────────────────────────────────
--
-- ── O QUE ESTA MIGRATION CRIA ───────────────────────────────────────────────
--
-- Quatro funcoes de leitura que alimentam a tela `/ebd/acompanhamento`:
-- frequencia, quantidade de alunos, faixa etaria mais presente e mais ausente,
-- e a divisao entre homens e mulheres.
--
-- Nenhuma delas escreve. Nenhuma altera objeto existente.
--
-- ── A DECISAO QUE DEFINE TODO O CALCULO ─────────────────────────────────────
--
-- **Aula sem nenhuma linha em `ebd_presencas` e chamada nao feita — nao e
-- "todos faltaram".** As duas coisas sao indistinguiveis no dado bruto, e
-- trata-las igual faz o painel anunciar frequencia proxima de zero.
--
-- Medido em producao em 26/08/2026, e por isso o cuidado nao e teorico:
--
--   ebd_aulas      12   (07/06/2026 a 23/08/2026)
--   ebd_presencas   8
--
-- Se as 12 aulas entrassem no denominador, a taxa cairia para perto de 1%, e a
-- tela acusaria uma evasao que nao aconteceu. O que aconteceu foi a chamada
-- nao ter sido registrada.
--
-- Por isso **toda taxa aqui usa apenas aulas com chamada** — as que tem ao
-- menos uma linha de presenca. E `aulas_sem_chamada` volta como numero
-- proprio, porque essa lacuna e, ela mesma, informacao pastoral: mostra onde a
-- classe parou de registrar.
--
-- ── VISITANTE NAO ENTRA NA TAXA ─────────────────────────────────────────────
--
-- `ebd_presencas.eh_visitante` marca quem assistiu sem estar matriculado. O
-- denominador da frequencia e a matricula ativa, entao contar visitante no
-- numerador produziria taxa acima de 100%. Ele e contado a parte.
--
-- ── FAIXA ETARIA E A IDADE DA PESSOA, NAO A DA CLASSE ───────────────────────
--
-- `ebd_classes` tem `idade_min`/`idade_max`, mas um aluno pode estar numa
-- classe fora da propria faixa — e justamente isso que
-- `vw_ebd_alertas_idade` existe para apontar. Agrupar pela faixa da classe
-- esconderia esse caso. As faixas abaixo saem de `membros.data_nascimento`.
--
-- **49 dos 68 congregados ativos nao tem data de nascimento** (medido em
-- 26/08/2026). Por isso 'Sem data de nascimento' e uma faixa visivel, e nao um
-- registro descartado no meio do caminho.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · Resumo geral ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ebd_painel_resumo()
 RETURNS TABLE(
   classes_ativas          integer,
   alunos_matriculados     integer,
   alunos_sem_data_nasc    integer,
   aulas_total             integer,
   aulas_com_chamada       integer,
   aulas_sem_chamada       integer,
   primeira_aula           date,
   ultima_aula             date,
   presencas_registradas   integer,
   presentes               integer,
   visitantes              integer,
   taxa_presenca           numeric,
   homens_matriculados     integer,
   mulheres_matriculadas   integer,
   homens_presentes        integer,
   mulheres_presentes      integer
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH mat AS (
    SELECT m.id AS pessoa_id, m.sexo, m.data_nascimento, em.classe_id
      FROM public.ebd_matriculas em
      JOIN public.membros m ON m.id = em.pessoa_id
      JOIN public.ebd_classes c ON c.id = em.classe_id
     WHERE em.ativo AND c.ativo
  ),
  -- Aula so entra na conta de frequencia se a chamada foi feita.
  aulas AS (
    SELECT a.id, a.data, a.classe_id,
           EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id) AS tem_chamada
      FROM public.ebd_aulas a
      JOIN public.ebd_classes c ON c.id = a.classe_id
     WHERE c.ativo
  ),
  pres AS (
    SELECT p.*, m.sexo
      FROM public.ebd_presencas p
      JOIN aulas a ON a.id = p.aula_id
      LEFT JOIN public.membros m ON m.id = p.pessoa_id
  ),
  -- Denominador: para cada aula com chamada, quantos estavam matriculados na
  -- classe dela. Sem isso a taxa compararia presencas com o total da igreja.
  esperados AS (
    SELECT COALESCE(SUM((SELECT count(*) FROM mat WHERE mat.classe_id = a.classe_id)), 0) AS n
      FROM aulas a WHERE a.tem_chamada
  )
  SELECT
    (SELECT count(*)::int FROM public.ebd_classes WHERE ativo),
    (SELECT count(*)::int FROM mat),
    (SELECT count(*)::int FROM mat WHERE data_nascimento IS NULL),
    (SELECT count(*)::int FROM aulas),
    (SELECT count(*)::int FROM aulas WHERE tem_chamada),
    (SELECT count(*)::int FROM aulas WHERE NOT tem_chamada),
    (SELECT min(data) FROM aulas),
    (SELECT max(data) FROM aulas),
    (SELECT count(*)::int FROM pres),
    (SELECT count(*)::int FROM pres WHERE presente AND NOT COALESCE(eh_visitante,false)),
    (SELECT count(*)::int FROM pres WHERE COALESCE(eh_visitante,false)),
    CASE WHEN (SELECT n FROM esperados) > 0
      THEN ROUND(100.0 * (SELECT count(*) FROM pres WHERE presente AND NOT COALESCE(eh_visitante,false))
                       / (SELECT n FROM esperados), 1)
      ELSE NULL END,
    (SELECT count(*)::int FROM mat WHERE sexo = 'masculino'),
    (SELECT count(*)::int FROM mat WHERE sexo = 'feminino'),
    (SELECT count(*)::int FROM pres WHERE presente AND NOT COALESCE(eh_visitante,false) AND sexo = 'masculino'),
    (SELECT count(*)::int FROM pres WHERE presente AND NOT COALESCE(eh_visitante,false) AND sexo = 'feminino');
$function$;

-- ── 2 · Por faixa etaria ────────────────────────────────────────────────────
-- Ordenada pela idade minima da faixa, com 'Sem data' por ultimo (ordem 99).
CREATE OR REPLACE FUNCTION public.ebd_painel_por_faixa()
 RETURNS TABLE(
   faixa         text,
   ordem         integer,
   matriculados  integer,
   presencas     integer,
   ausencias     integer,
   taxa          numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
  ),
  aulas AS (
    SELECT a.id, a.classe_id
      FROM public.ebd_aulas a
      JOIN public.ebd_classes c ON c.id = a.classe_id
     WHERE c.ativo
       AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)
  ),
  -- Uma linha por (aluno, aula com chamada da classe dele): o universo do que
  -- poderia ter sido presenca. Ausencia e a linha sem marca de presente.
  esperado AS (
    SELECT mat.faixa, mat.ordem, mat.pessoa_id, a.id AS aula_id
      FROM mat JOIN aulas a ON a.classe_id = mat.classe_id
  ),
  oportunidade AS (
    SELECT e.faixa,
           count(*)                                              AS total,
           count(*) FILTER (WHERE p.presente)                     AS presencas,
           count(*) FILTER (WHERE p.presente IS DISTINCT FROM true) AS ausencias
      FROM esperado e
      LEFT JOIN public.ebd_presencas p
             ON p.aula_id = e.aula_id AND p.pessoa_id = e.pessoa_id
     GROUP BY e.faixa
  )
  -- A lista de faixas sai de `mat`, nao de `esperado`.
  --
  -- Sair de `esperado` era o defeito: ele exige aula com chamada, entao a
  -- faixa cujos alunos estao todos em classes que nunca registraram chamada
  -- desaparecia da tabela inteira — e com ela a contagem de alunos.
  --
  -- Medido em producao em 26/08/2026: 77 matriculados, e a versao anterior
  -- somava 68 nas linhas. Os 9 que faltavam estavam em classes sem chamada.
  -- "Quantos alunos existem" nao pode depender de alguem ter feito chamada.
  SELECT m.faixa,
         m.ordem,
         count(DISTINCT m.pessoa_id)::int,
         COALESCE(o.presencas, 0)::int,
         COALESCE(o.ausencias, 0)::int,
         CASE WHEN COALESCE(o.total, 0) > 0
           THEN ROUND(100.0 * o.presencas / o.total, 1)
           ELSE NULL END
    FROM mat m
    LEFT JOIN oportunidade o ON o.faixa = m.faixa
   GROUP BY m.faixa, m.ordem, o.presencas, o.ausencias, o.total
   ORDER BY m.ordem;
$function$;

-- ── 3 · Por classe ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ebd_painel_por_classe()
 RETURNS TABLE(
   classe_id         uuid,
   classe            text,
   cor               text,
   matriculados      integer,
   homens            integer,
   mulheres          integer,
   aulas_com_chamada integer,
   aulas_sem_chamada integer,
   presencas         integer,
   taxa              numeric,
   ultima_aula       date
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT c.id,
         c.nome,
         c.cor,
         (SELECT count(*)::int FROM public.ebd_matriculas em WHERE em.classe_id = c.id AND em.ativo),
         (SELECT count(*)::int FROM public.ebd_matriculas em JOIN public.membros m ON m.id = em.pessoa_id
           WHERE em.classe_id = c.id AND em.ativo AND m.sexo = 'masculino'),
         (SELECT count(*)::int FROM public.ebd_matriculas em JOIN public.membros m ON m.id = em.pessoa_id
           WHERE em.classe_id = c.id AND em.ativo AND m.sexo = 'feminino'),
         (SELECT count(*)::int FROM public.ebd_aulas a WHERE a.classe_id = c.id
            AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)),
         (SELECT count(*)::int FROM public.ebd_aulas a WHERE a.classe_id = c.id
            AND NOT EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)),
         (SELECT count(*)::int FROM public.ebd_presencas p JOIN public.ebd_aulas a ON a.id = p.aula_id
           WHERE a.classe_id = c.id AND p.presente AND NOT COALESCE(p.eh_visitante,false)),
         -- Denominador: matriculados x aulas com chamada daquela classe.
         CASE WHEN (SELECT count(*) FROM public.ebd_aulas a WHERE a.classe_id = c.id
                      AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id))
                   * (SELECT count(*) FROM public.ebd_matriculas em WHERE em.classe_id = c.id AND em.ativo) > 0
           THEN ROUND(100.0
                * (SELECT count(*) FROM public.ebd_presencas p JOIN public.ebd_aulas a ON a.id = p.aula_id
                    WHERE a.classe_id = c.id AND p.presente AND NOT COALESCE(p.eh_visitante,false))
                / ((SELECT count(*) FROM public.ebd_aulas a WHERE a.classe_id = c.id
                      AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id))
                   * (SELECT count(*) FROM public.ebd_matriculas em WHERE em.classe_id = c.id AND em.ativo)), 1)
           ELSE NULL END,
         (SELECT max(a.data) FROM public.ebd_aulas a WHERE a.classe_id = c.id)
    FROM public.ebd_classes c
   WHERE c.ativo
   ORDER BY c.ordem NULLS LAST, c.nome;
$function$;

-- ── 4 · Alunos mais ausentes ────────────────────────────────────────────────
-- So considera quem teve ao menos uma aula com chamada na propria classe;
-- quem nunca teve chamada nao "faltou", so nao foi registrado.
CREATE OR REPLACE FUNCTION public.ebd_painel_alunos_ausentes(p_limite integer DEFAULT 12)
 RETURNS TABLE(
   pessoa_id     uuid,
   nome          text,
   classe        text,
   sexo          text,
   idade         integer,
   oportunidades integer,
   presencas     integer,
   ausencias     integer,
   taxa          numeric
 )
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH aulas AS (
    SELECT a.id, a.classe_id
      FROM public.ebd_aulas a
      JOIN public.ebd_classes c ON c.id = a.classe_id
     WHERE c.ativo
       AND EXISTS (SELECT 1 FROM public.ebd_presencas p WHERE p.aula_id = a.id)
  ),
  esperado AS (
    SELECT em.pessoa_id, c.nome AS classe, a.id AS aula_id
      FROM public.ebd_matriculas em
      JOIN public.ebd_classes c ON c.id = em.classe_id
      JOIN aulas a ON a.classe_id = em.classe_id
     WHERE em.ativo AND c.ativo
  )
  SELECT e.pessoa_id,
         m.nome_completo,
         e.classe,
         m.sexo::text,
         CASE WHEN m.data_nascimento IS NULL THEN NULL
              ELSE date_part('year', age(current_date, m.data_nascimento))::int END,
         count(*)::int,
         count(*) FILTER (WHERE p.presente)::int,
         count(*) FILTER (WHERE p.presente IS DISTINCT FROM true)::int,
         ROUND(100.0 * count(*) FILTER (WHERE p.presente) / count(*), 1)
    FROM esperado e
    JOIN public.membros m ON m.id = e.pessoa_id
    LEFT JOIN public.ebd_presencas p
           ON p.aula_id = e.aula_id AND p.pessoa_id = e.pessoa_id
   GROUP BY e.pessoa_id, m.nome_completo, e.classe, m.sexo, m.data_nascimento
  HAVING count(*) FILTER (WHERE p.presente IS DISTINCT FROM true) > 0
   ORDER BY count(*) FILTER (WHERE p.presente IS DISTINCT FROM true) DESC,
            m.nome_completo
   LIMIT p_limite;
$function$;

-- ── Concessoes ──────────────────────────────────────────────────────────────
-- O Postgres concede EXECUTE a PUBLIC em funcao nova. Estas quatro sao de
-- leitura e SECURITY INVOKER (a RLS de cada tabela continua valendo), mas
-- `anon` nao tem por que enxerga-las.
REVOKE ALL ON FUNCTION public.ebd_painel_resumo()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ebd_painel_por_faixa()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ebd_painel_por_classe()              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ebd_painel_alunos_ausentes(integer)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ebd_painel_resumo()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.ebd_painel_por_faixa()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.ebd_painel_por_classe()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.ebd_painel_alunos_ausentes(integer) TO authenticated;
