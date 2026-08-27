-- ═══════════════════════════════════════════════════════════════════════════
-- "Esperados" passa a mostrar quem já está em outra classe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- A aba "Esperados" respondia "quem cabe nesta classe e ainda não está em
-- nenhuma". Quem já estava em outra classe simplesmente sumia — e sumir é a
-- pior resposta possível para quem coordena a EBD, porque a pergunta real não
-- é "quem está livre", é "onde está cada pessoa que caberia aqui".
--
-- Uma professora que procura um aluno de 12 anos e não o encontra em lugar
-- nenhum não sabe se ele não existe, se está sem data de nascimento, ou se
-- está na classe ao lado. Três situações que pedem coisas diferentes, e a
-- lista dava a mesma resposta para as três: silêncio.
--
-- ── O SINAL DE QUE ISTO ERA PARA SER ASSIM ─────────────────────────────────
--
-- A função JÁ DEVOLVIA `outra_classe_id` e `outra_classe_nome`. E logo abaixo
-- tinha um NOT EXISTS que excluía exatamente as pessoas que preencheriam
-- essas colunas. Elas eram inalcançáveis — o formato foi desenhado para isto
-- e um filtro o tornou impossível. Não é forma nova; é ligar a que já existia.
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--
-- Saem dois NOT EXISTS: o que excluía quem está matriculado em OUTRA classe,
-- e o que excluía professores de QUALQUER classe.
--
-- Entra um só: professor DESTA classe não aparece como aluno dela. Ele já
-- está no cartão de professores logo acima, e listá-lo abaixo como candidato
-- seria a tela se contradizendo.
--
-- Professor de OUTRA classe passa a aparecer, marcado — a pedido, e faz
-- sentido: quem ensina os adolescentes pode perfeitamente estudar na classe
-- de adultos, e o sistema não tem por que decidir isso sozinho.
--
-- Entra a coluna `outra_classe_papel`: 'aluno' ou 'professor'. Sem ela a tela
-- diria "Classe Isac Rodrigues" sem dizer se a pessoa senta ou ensina lá, que
-- é a diferença que decide se faz sentido movê-la.
--
-- Trocar o tipo de retorno exige DROP antes do CREATE: CREATE OR REPLACE não
-- muda assinatura.

BEGIN;

DROP FUNCTION IF EXISTS public.esperados_da_classe(uuid);

CREATE FUNCTION public.esperados_da_classe(p_classe_id uuid)
 RETURNS TABLE(pessoa_id uuid, nome_completo text, sexo text, data_nascimento date, idade integer, ja_matriculado boolean, matricula_id uuid, outra_classe_id uuid, outra_classe_nome text, outra_classe_papel text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  WITH c AS (
    SELECT * FROM public.ebd_classes WHERE id = p_classe_id
  ),
  -- Todo vínculo de EBD que a pessoa tem hoje, como aluno ou como professor.
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
  -- Um vínculo por pessoa. O desta classe manda; entre os outros, o de aluno
  -- vem antes do de professor, porque é o que a tela precisa mostrar para
  -- decidir uma transferência.
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
     -- Professor DESTA classe não é candidato a aluno DELA.
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

REVOKE ALL ON FUNCTION public.esperados_da_classe(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO service_role;

-- ── Mover, e não duplicar ──────────────────────────────────────────────────
--
-- Medido no banco: o índice único de matrícula é
-- (pessoa_id, classe_id) WHERE ativo. Ele impede a mesma pessoa DUAS VEZES na
-- MESMA classe — e permite, sem reclamar, a mesma pessoa ativa em duas
-- classes diferentes. E `matricular()` no cliente é um INSERT puro.
--
-- Era isso que o filtro removido acima protegia: enquanto a pessoa não
-- aparecia na lista, ninguém podia clicar em matricular e criar a matrícula
-- dupla. Mostrando-a, o botão precisa deixar de ser um INSERT e virar uma
-- MUDANÇA — senão a mesma pessoa passa a existir em duas listas de chamada.
--
-- Aqui, e não no cliente, porque são duas escritas que têm de valer juntas.
-- Do lado do navegador seriam dois pedidos: se o segundo falhasse, a pessoa
-- ficaria sem classe nenhuma — pior que o problema que se quer resolver.
CREATE OR REPLACE FUNCTION public.ebd_mover_aluno(
  p_pessoa_id uuid,
  p_classe_destino uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matricula uuid;
BEGIN
  -- Encerra as matrículas ativas em OUTRAS classes. Encerrar, e não apagar:
  -- a convenção do banco é `ativo = false` (40 tabelas com essa coluna contra
  -- 1 com deleted_at), e o histórico de quem passou por onde tem valor.
  UPDATE public.ebd_matriculas
     SET ativo = false, updated_at = now()
   WHERE pessoa_id = p_pessoa_id
     AND ativo = true
     AND classe_id <> p_classe_destino;

  -- Já está na classe de destino? Devolve a matrícula existente em vez de
  -- estourar no índice único.
  SELECT id INTO v_matricula
    FROM public.ebd_matriculas
   WHERE pessoa_id = p_pessoa_id AND classe_id = p_classe_destino AND ativo = true
   LIMIT 1;

  IF v_matricula IS NULL THEN
    INSERT INTO public.ebd_matriculas (pessoa_id, classe_id, ativo)
         VALUES (p_pessoa_id, p_classe_destino, true)
      RETURNING id INTO v_matricula;
  END IF;

  RETURN v_matricula;
END;
$function$;

REVOKE ALL ON FUNCTION public.ebd_mover_aluno(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ebd_mover_aluno(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ebd_mover_aluno(uuid, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.ebd_mover_aluno(uuid, uuid) TO service_role;

COMMIT;
