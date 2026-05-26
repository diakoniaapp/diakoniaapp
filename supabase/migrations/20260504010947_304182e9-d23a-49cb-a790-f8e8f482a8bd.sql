
ALTER TABLE public.ministerios ADD COLUMN IF NOT EXISTS co_lider_id uuid;

CREATE TABLE IF NOT EXISTS public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministerio_id uuid NOT NULL REFERENCES public.ministerios(id) ON DELETE CASCADE,
  nome text NOT NULL,
  sigla text,
  descricao text,
  lider_id uuid,
  co_lider_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_areas_ministerio ON public.areas(ministerio_id);

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Sec gerenciam areas" ON public.areas
  FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]));

CREATE POLICY "Autenticados leem areas" ON public.areas
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER areas_updated_at
  BEFORE UPDATE ON public.areas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
