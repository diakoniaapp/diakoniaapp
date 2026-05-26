-- Enums
CREATE TYPE public.evento_tipo AS ENUM ('culto','reuniao','ensaio','acao_social','curso','outro');
CREATE TYPE public.evento_status AS ENUM ('agendado','realizado','cancelado');
CREATE TYPE public.evento_responsabilidade AS ENUM ('principal','apoio');

-- Eventos
CREATE TABLE public.eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  tipo public.evento_tipo NOT NULL DEFAULT 'outro',
  data date NOT NULL,
  hora_inicio time,
  hora_fim time,
  local text,
  descricao text,
  status public.evento_status NOT NULL DEFAULT 'agendado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem eventos" ON public.eventos
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Sec gerenciam eventos" ON public.eventos
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

CREATE TRIGGER trg_eventos_updated_at
BEFORE UPDATE ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Evento - Ministerios
CREATE TABLE public.evento_ministerios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  ministerio_id uuid NOT NULL,
  responsabilidade public.evento_responsabilidade NOT NULL DEFAULT 'principal',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, ministerio_id)
);

ALTER TABLE public.evento_ministerios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem evento_ministerios" ON public.evento_ministerios
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Sec gerenciam evento_ministerios" ON public.evento_ministerios
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

-- Evento - Areas
CREATE TABLE public.evento_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
  area_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, area_id)
);

ALTER TABLE public.evento_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem evento_areas" ON public.evento_areas
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/Sec gerenciam evento_areas" ON public.evento_areas
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'secretaria'::app_role]));

-- Validation: max 2 ministerios per evento, ao menos 1 principal ao remover
CREATE OR REPLACE FUNCTION public.validate_evento_ministerios()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento uuid;
  v_total int;
  v_principais int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_evento := OLD.evento_id;
  ELSE
    v_evento := NEW.evento_id;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE responsabilidade = 'principal')
    INTO v_total, v_principais
  FROM public.evento_ministerios
  WHERE evento_id = v_evento;

  IF v_total > 2 THEN
    RAISE EXCEPTION 'Evento pode ter no máximo 2 ministérios';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER trg_validate_evento_ministerios
AFTER INSERT OR UPDATE OR DELETE ON public.evento_ministerios
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_evento_ministerios();

CREATE INDEX idx_evento_ministerios_evento ON public.evento_ministerios(evento_id);
CREATE INDEX idx_evento_areas_evento ON public.evento_areas(evento_id);
CREATE INDEX idx_eventos_data ON public.eventos(data);