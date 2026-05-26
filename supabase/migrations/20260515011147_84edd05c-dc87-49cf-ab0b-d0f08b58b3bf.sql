
DO $$ BEGIN
  CREATE TYPE public.local_localizacao_interna AS ENUM ('frente','fundos','lado_esquerdo','lado_direito','centro','area_externa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.local_restricao_acesso AS ENUM ('livre','restrito','tecnico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.locais
  ADD COLUMN IF NOT EXISTS localizacao_interna public.local_localizacao_interna,
  ADD COLUMN IF NOT EXISTS area_m2 numeric(8,2),
  ADD COLUMN IF NOT EXISTS acessibilidade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricao_acesso public.local_restricao_acesso NOT NULL DEFAULT 'livre',
  ADD COLUMN IF NOT EXISTS referencia_visual text,
  ADD COLUMN IF NOT EXISTS mapa_url text,
  ADD COLUMN IF NOT EXISTS permite_agendamento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tipos_evento_permitidos public.evento_tipo[] NOT NULL DEFAULT '{}'::public.evento_tipo[],
  ADD COLUMN IF NOT EXISTS nome_completo text;

CREATE OR REPLACE FUNCTION public.locais_set_nome_completo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.nome_completo :=
    NEW.nome
    || COALESCE(' - ' || NEW.pavimento::text, '')
    || COALESCE(' - ' || NEW.localizacao_interna::text, '');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_locais_nome_completo ON public.locais;
CREATE TRIGGER trg_locais_nome_completo
  BEFORE INSERT OR UPDATE ON public.locais
  FOR EACH ROW EXECUTE FUNCTION public.locais_set_nome_completo();

UPDATE public.locais SET nome = nome;

INSERT INTO storage.buckets (id, name, public)
VALUES ('locais-mapas', 'locais-mapas', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Mapas locais publicos leitura"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'locais-mapas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin/Sec enviam mapas locais"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'locais-mapas' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin/Sec atualizam mapas locais"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'locais-mapas' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admin/Sec removem mapas locais"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'locais-mapas' AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
