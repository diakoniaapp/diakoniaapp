-- Novos enums
DO $$ BEGIN
  CREATE TYPE public.local_predio AS ENUM ('rp', 'sf');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.local_pavimento AS ENUM ('subsolo', 'terreo', 'galeria', 'andares_superiores', 'area_tecnica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.local_ambiente AS ENUM ('templo', 'sala', 'administrativo', 'tecnico', 'area_social', 'circulacao', 'deposito');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.local_uso AS ENUM ('culto', 'ensino', 'musica', 'comunicacao', 'administrativo', 'manutencao', 'apoio_tecnico', 'armazenamento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Novas colunas
ALTER TABLE public.locais
  ADD COLUMN IF NOT EXISTS predio public.local_predio,
  ADD COLUMN IF NOT EXISTS pavimento public.local_pavimento,
  ADD COLUMN IF NOT EXISTS ambiente public.local_ambiente,
  ADD COLUMN IF NOT EXISTS uso_principal public.local_uso,
  ADD COLUMN IF NOT EXISTS descricao text;

-- Índices para filtros
CREATE INDEX IF NOT EXISTS idx_locais_predio ON public.locais(predio);
CREATE INDEX IF NOT EXISTS idx_locais_pavimento ON public.locais(pavimento);
CREATE INDEX IF NOT EXISTS idx_locais_ambiente ON public.locais(ambiente);
CREATE INDEX IF NOT EXISTS idx_locais_uso ON public.locais(uso_principal);
