-- Enum para tipos de local
DO $$ BEGIN
  CREATE TYPE public.local_tipo AS ENUM ('templo','sala','gabinete','auditorio','area_externa','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.local_status AS ENUM ('ativo','inativo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.locais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo public.local_tipo NOT NULL DEFAULT 'outro',
  capacidade integer,
  status public.local_status NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locais_capacidade_positiva CHECK (capacidade IS NULL OR capacidade > 0)
);

ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;

-- Bloqueia anon
CREATE POLICY "Bloqueia anon" ON public.locais
  AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Staff (admin/secretaria/diakonia) podem ler
CREATE POLICY "Staff leem locais" ON public.locais
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role,'diakonia'::app_role]));

-- Admin/Secretaria gerenciam (insert/update); SEM delete
CREATE POLICY "Admin/Sec inserem locais" ON public.locais
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

CREATE POLICY "Admin/Sec atualizam locais" ON public.locais
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

-- Trigger que IMPEDE exclusão de locais (preserva histórico)
CREATE OR REPLACE FUNCTION public.prevent_locais_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Locais não podem ser excluídos. Utilize o status (ativo/inativo).';
END;
$$;

CREATE TRIGGER trg_prevent_locais_delete
  BEFORE DELETE ON public.locais
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locais_delete();

-- updated_at
CREATE TRIGGER trg_locais_updated_at
  BEFORE UPDATE ON public.locais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_locais_status ON public.locais(status);
CREATE INDEX IF NOT EXISTS idx_locais_tipo ON public.locais(tipo);
