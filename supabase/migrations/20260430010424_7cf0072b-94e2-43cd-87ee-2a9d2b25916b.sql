DO $$ BEGIN
  CREATE TYPE public.tipo_pessoa AS ENUM ('membro','congregado','visitante','ex_membro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS tipo_pessoa public.tipo_pessoa NOT NULL DEFAULT 'membro';

CREATE INDEX IF NOT EXISTS idx_membros_tipo_pessoa ON public.membros(tipo_pessoa);