
-- Enum de frequência de recorrência
DO $$ BEGIN
  CREATE TYPE public.evento_recorrencia_freq AS ENUM ('diario','semanal','mensal','anual','personalizado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Novos campos em eventos
ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS cor text,
  ADD COLUMN IF NOT EXISTS ministerio_principal_id uuid,
  ADD COLUMN IF NOT EXISTS local_id uuid,
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid,
  ADD COLUMN IF NOT EXISTS recorrencia_regra jsonb,
  ADD COLUMN IF NOT EXISTS is_excecao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocorrencia_original_data date,
  ADD COLUMN IF NOT EXISTS serie_origem_id uuid;

CREATE INDEX IF NOT EXISTS idx_eventos_data_local ON public.eventos(data, local_id);
CREATE INDEX IF NOT EXISTS idx_eventos_recorrencia ON public.eventos(recorrencia_id);
CREATE INDEX IF NOT EXISTS idx_eventos_ministerio_principal ON public.eventos(ministerio_principal_id);
CREATE INDEX IF NOT EXISTS idx_eventos_serie_origem ON public.eventos(serie_origem_id);

-- Trigger: validar local (ativo + permite_agendamento)
CREATE OR REPLACE FUNCTION public.validate_evento_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status local_status;
  v_permite boolean;
BEGIN
  IF NEW.local_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status, permite_agendamento INTO v_status, v_permite
  FROM public.locais WHERE id = NEW.local_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Local informado não existe.';
  END IF;
  IF v_status <> 'ativo' THEN
    RAISE EXCEPTION 'Local inativo não pode ser usado em eventos.';
  END IF;
  IF v_permite = false THEN
    RAISE EXCEPTION 'Este local não permite agendamento.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eventos_validate_local ON public.eventos;
CREATE TRIGGER trg_eventos_validate_local
BEFORE INSERT OR UPDATE OF local_id, status ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.validate_evento_local();

-- Trigger: validar conflito de horário no mesmo local
CREATE OR REPLACE FUNCTION public.validate_evento_conflito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflito_titulo text;
  v_conflito_inicio time;
  v_conflito_fim time;
BEGIN
  IF NEW.status = 'cancelado' OR NEW.local_id IS NULL
     OR NEW.hora_inicio IS NULL OR NEW.hora_fim IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT titulo, hora_inicio, hora_fim
    INTO v_conflito_titulo, v_conflito_inicio, v_conflito_fim
  FROM public.eventos
  WHERE id <> NEW.id
    AND local_id = NEW.local_id
    AND data = NEW.data
    AND status <> 'cancelado'
    AND hora_inicio IS NOT NULL AND hora_fim IS NOT NULL
    AND NEW.hora_inicio < hora_fim
    AND NEW.hora_fim > hora_inicio
  LIMIT 1;

  IF v_conflito_titulo IS NOT NULL THEN
    RAISE EXCEPTION 'Este local já está reservado neste horário (conflito com "%": %–%).',
      v_conflito_titulo, v_conflito_inicio, v_conflito_fim;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_eventos_validate_conflito ON public.eventos;
CREATE TRIGGER trg_eventos_validate_conflito
BEFORE INSERT OR UPDATE OF data, hora_inicio, hora_fim, local_id, status ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.validate_evento_conflito();
