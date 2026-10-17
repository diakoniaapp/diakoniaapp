-- Volta a função de aniversários e casamentos da Agenda à versão de 6 colunas (sem o cônjuge pelo vínculo de família). A tela funciona com as duas versões.
DROP FUNCTION IF EXISTS public.agenda_aniversarios_casamentos();

CREATE FUNCTION public.agenda_aniversarios_casamentos()
 RETURNS TABLE(id uuid, nome_completo text, data_nascimento date, nascimento_dia_mes date, data_casamento date, tipo_pessoa public.tipo_pessoa)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT COALESCE(public.has_any_role((SELECT auth.uid()), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria', 'pastor', 'lideranca', 'voluntario']::public.app_role[]), false) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT m.id, m.nome_completo, m.data_nascimento, m.nascimento_dia_mes, m.data_casamento, m.tipo_pessoa FROM public.membros AS m WHERE m.tipo_pessoa IN ('membro', 'congregado') AND (m.data_nascimento IS NOT NULL OR m.nascimento_dia_mes IS NOT NULL OR m.data_casamento IS NOT NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.agenda_aniversarios_casamentos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agenda_aniversarios_casamentos() TO authenticated;
