-- 1) Garantir RLS habilitado e FORCE em todas as tabelas sensíveis
ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membros FORCE ROW LEVEL SECURITY;
ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familias FORCE ROW LEVEL SECURITY;
ALTER TABLE public.vinculos_familiares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vinculos_familiares FORCE ROW LEVEL SECURITY;
ALTER TABLE public.area_voluntarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_voluntarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerio_membros FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ministerios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ministerios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.evento_ministerios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_ministerios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.evento_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evento_areas FORCE ROW LEVEL SECURITY;
ALTER TABLE public.congregacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.congregacoes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.historico_membro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_membro FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- 2) Bloquear explicitamente o papel anônimo (defesa em profundidade)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'membros','familias','vinculos_familiares','area_voluntarios',
    'ministerio_membros','ministerios','areas','eventos',
    'evento_ministerios','evento_areas','congregacoes','historico_membro',
    'profiles','user_roles'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Bloqueia anon" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Bloqueia anon" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;

-- 3) Remover EXECUTE público de funções SECURITY DEFINER internas (apenas trigger)
REVOKE ALL ON FUNCTION public.prevent_membros_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_evento_ministerios() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;