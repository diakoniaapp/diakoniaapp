DO $$ BEGIN
  CREATE TYPE public.perfil_acesso AS ENUM ('admin','pastor','secretaria','tesoureiro','lideranca','professor_ebd','voluntario','membro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS perfil_acesso public.perfil_acesso NOT NULL DEFAULT 'membro';