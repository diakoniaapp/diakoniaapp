DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_acolhimento_enum') THEN
    CREATE TYPE public.status_acolhimento_enum AS ENUM (
      'novo','contatar','contatado','retornou',
      'em_relacionamento','em_acompanhamento','congregado','membro'
    );
  END IF;
END $$;

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS status_acolhimento public.status_acolhimento_enum DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS como_conheceu TEXT,
  ADD COLUMN IF NOT EXISTS quem_convidou_id UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS como_conheceu_descricao TEXT;

CREATE INDEX IF NOT EXISTS idx_membros_status_acolhimento ON public.membros(status_acolhimento);