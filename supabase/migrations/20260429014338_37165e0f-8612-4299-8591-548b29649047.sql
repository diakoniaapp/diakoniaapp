
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS external_id text UNIQUE;
ALTER TABLE public.ministerios ADD COLUMN IF NOT EXISTS external_id text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_membros_external_id ON public.membros(external_id);
CREATE INDEX IF NOT EXISTS idx_ministerios_external_id ON public.ministerios(external_id);
