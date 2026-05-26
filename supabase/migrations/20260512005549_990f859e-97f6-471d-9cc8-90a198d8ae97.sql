CREATE OR REPLACE FUNCTION public.prevent_membros_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Pessoas não podem ser excluídas. Utilize o status (ativo/inativo/ex_membro).';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_membros_delete ON public.membros;
CREATE TRIGGER trg_prevent_membros_delete
BEFORE DELETE ON public.membros
FOR EACH ROW EXECUTE FUNCTION public.prevent_membros_delete();