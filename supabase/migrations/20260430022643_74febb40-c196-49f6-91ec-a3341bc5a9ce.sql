-- Enum de parentesco
DO $$ BEGIN
  CREATE TYPE public.parentesco_tipo AS ENUM ('pai_mae','conjuge','filho','avo','enteado','tutelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.vinculos_familiares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id uuid NOT NULL REFERENCES public.familias(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  parentesco public.parentesco_tipo NOT NULL,
  responsavel_familia boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (familia_id, membro_id)
);

-- Apenas um responsável por família
CREATE UNIQUE INDEX IF NOT EXISTS vinculos_familiares_unico_responsavel
  ON public.vinculos_familiares (familia_id)
  WHERE responsavel_familia = true;

CREATE INDEX IF NOT EXISTS idx_vinculos_familia ON public.vinculos_familiares(familia_id);
CREATE INDEX IF NOT EXISTS idx_vinculos_membro ON public.vinculos_familiares(membro_id);

ALTER TABLE public.vinculos_familiares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem vinculos_familiares"
ON public.vinculos_familiares FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Sec gerenciam vinculos_familiares"
ON public.vinculos_familiares FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]));

CREATE TRIGGER vinculos_familiares_updated_at
BEFORE UPDATE ON public.vinculos_familiares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();