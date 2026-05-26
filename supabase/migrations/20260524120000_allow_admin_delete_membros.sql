-- ============================================================
-- FASE DE TESTES: Permitir DELETE real na tabela membros
-- apenas para usuários com role = admin
-- ============================================================
-- Substitui o trigger que bloqueava TODOS os deletes
-- (prevent_membros_delete criado em 20260512005549)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_membros_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ADMIN pode excluir; demais roles são bloqueados
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN OLD;  -- permite o DELETE prosseguir
  END IF;

  RAISE EXCEPTION 'Apenas administradores podem excluir contatos. Utilize o status para inativar.';
END;
$$;

-- Recriar o trigger com a nova função
DROP TRIGGER IF EXISTS trg_prevent_membros_delete ON public.membros;
CREATE TRIGGER trg_prevent_membros_delete
  BEFORE DELETE ON public.membros
  FOR EACH ROW EXECUTE FUNCTION public.prevent_membros_delete();

-- Garantir que a RLS policy de DELETE permite admin
-- (a policy "Admin/Sec gerenciam membros" FOR ALL já cobre DELETE,
--  mas vamos garantir explicitamente)
DROP POLICY IF EXISTS "Admin deleta membros" ON public.membros;
CREATE POLICY "Admin deleta membros"
  ON public.membros
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
