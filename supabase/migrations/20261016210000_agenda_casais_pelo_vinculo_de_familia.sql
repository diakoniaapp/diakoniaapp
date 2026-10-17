-- ─── Casamentos na Agenda: o casal pelo vínculo de FAMÍLIA, com os dois nomes juntos ─────────────────────────────────────────────────────────────
--
-- Pedido dela (16/10/2026): "o evento de aniversário de casamento está trazendo os nomes separadamente... quero o nome dos cônjuges juntos".
--
-- ── O DEFEITO ────────────────────────────────────────────────────────────
-- A Agenda só juntava duas pessoas num casamento quando as DUAS tinham exatamente a mesma `data_casamento`. Medido na tela de Famílias (27/08/2026): em 2 famílias os cônjuges têm
-- datas diferentes (março contra maio; 2018 contra 2020 — com cara de erro de digitação) e em 3 famílias só o cônjuge tem a data. Nesses casos a agenda mostrava o mesmo casamento
-- duas vezes, um nome em cada.
--
-- ── A CORREÇÃO ───────────────────────────────────────────────────────────
-- A função `agenda_aniversarios_casamentos` passa a entregar também QUEM É O CÔNJUGE de cada pessoa, pelo vínculo de família (as duas pessoas da mesma família com parentesco
-- `pai_mae` ou `conjuge` — o mesmo critério da tela de Famílias): `conjuge_id`, `conjuge_nome` e `responsavel_familia`. A tela junta o casal por aí (com uma trava no código: só se
-- fundem datas de mesmo dia e mês) e escreve os dois nomes no mesmo evento.
--
-- Continua entregando SÓ nome, datas e vínculo — telefone, endereço e observação não saem daqui. Mesma lista de papéis da versão anterior.
--
-- O tipo de retorno muda (colunas novas), e `CREATE OR REPLACE` não aceita isso: por isso o DROP antes. A tela funciona com a função antiga e com a nova.
--
-- Reversível: docs/AGENDA_CASAIS_ROLLBACK.sql (volta à versão de 6 colunas).

DROP FUNCTION IF EXISTS public.agenda_aniversarios_casamentos();

CREATE FUNCTION public.agenda_aniversarios_casamentos()
 RETURNS TABLE(id uuid, nome_completo text, data_nascimento date, nascimento_dia_mes date, data_casamento date, tipo_pessoa public.tipo_pessoa, conjuge_id uuid, conjuge_nome text, responsavel_familia boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT COALESCE(public.has_any_role((SELECT auth.uid()), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria', 'pastor', 'lideranca', 'voluntario']::public.app_role[]), false) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT m.id, m.nome_completo, m.data_nascimento, m.nascimento_dia_mes, m.data_casamento, m.tipo_pessoa, c.cid, c.cnome, COALESCE(r.eh, false)
    FROM public.membros AS m
    LEFT JOIN LATERAL (
      SELECT mc.id AS cid, mc.nome_completo AS cnome
        FROM public.vinculos_familiares AS v1
        JOIN public.vinculos_familiares AS v2 ON v2.familia_id = v1.familia_id AND v2.membro_id <> v1.membro_id AND v2.parentesco IN ('pai_mae', 'conjuge')
        JOIN public.membros AS mc ON mc.id = v2.membro_id
       WHERE v1.membro_id = m.id AND v1.parentesco IN ('pai_mae', 'conjuge')
       ORDER BY v2.responsavel_familia DESC, mc.nome_completo
       LIMIT 1
    ) AS c ON true
    LEFT JOIN LATERAL (
      SELECT bool_or(v.responsavel_familia) AS eh FROM public.vinculos_familiares AS v WHERE v.membro_id = m.id
    ) AS r ON true
   WHERE m.tipo_pessoa IN ('membro', 'congregado')
     AND (m.data_nascimento IS NOT NULL OR m.nascimento_dia_mes IS NOT NULL OR m.data_casamento IS NOT NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.agenda_aniversarios_casamentos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_aniversarios_casamentos() TO authenticated;

COMMENT ON FUNCTION public.agenda_aniversarios_casamentos() IS
  'Nome, datas de nascimento/casamento, vínculo e cônjuge (pelo vínculo de família) de membros e congregados, para a camada de aniversários e casamentos da Agenda. Só para papéis de trabalho (inclui voluntario). Sem telefone nem endereço.';
