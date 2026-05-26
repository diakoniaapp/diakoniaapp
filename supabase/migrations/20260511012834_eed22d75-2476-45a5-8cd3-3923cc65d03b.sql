
DO $$ BEGIN
  CREATE TYPE public.atuacao_status AS ENUM ('ativa', 'encerrada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.area_voluntarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL,
  ministerio_id uuid NOT NULL,
  membro_id uuid NOT NULL,
  funcao text NOT NULL,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date,
  status public.atuacao_status NOT NULL DEFAULT 'ativa',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_area_voluntarios_area ON public.area_voluntarios(area_id);
CREATE INDEX IF NOT EXISTS idx_area_voluntarios_membro ON public.area_voluntarios(membro_id);
CREATE INDEX IF NOT EXISTS idx_area_voluntarios_min ON public.area_voluntarios(ministerio_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_area_voluntarios_ativa
  ON public.area_voluntarios(membro_id, area_id, funcao)
  WHERE status = 'ativa';

ALTER TABLE public.area_voluntarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Sec gerenciam area_voluntarios"
ON public.area_voluntarios FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]));

CREATE POLICY "Autenticados leem area_voluntarios"
ON public.area_voluntarios FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_area_voluntarios_updated
BEFORE UPDATE ON public.area_voluntarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
