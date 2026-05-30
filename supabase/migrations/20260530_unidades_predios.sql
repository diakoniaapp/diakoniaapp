-- ============================================================
-- Diakonia App — Estrutura fisica: unidades + predios
-- Migration: 20260530_unidades_predios.sql
-- Hierarquia: congregacoes (unidades) → predios → locais
-- ============================================================

-- 1. Enum: tipo de unidade organizacional
DO $$ BEGIN
  CREATE TYPE public.unidade_tipo AS ENUM
    ('sede','congregacao','missao','ponto_de_pregacao','outro');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Enum: tipo de predio
DO $$ BEGIN
  CREATE TYPE public.predio_tipo AS ENUM
    ('templo','anexo','residencia_pastoral','administrativo','apoio','outro');
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Tabela: unidades
-- Representa a divisao organizacional: Sede, Congregacoes, Missoes
-- Reutiliza congregacoes existentes como fonte de dados
CREATE TABLE IF NOT EXISTS public.unidades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  tipo             public.unidade_tipo NOT NULL DEFAULT 'sede',
  responsavel_id   uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  congregacao_id   uuid REFERENCES public.congregacoes(id) ON DELETE SET NULL,
  ativa            boolean NOT NULL DEFAULT true,
  descricao        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades FORCE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon unidades"
  ON public.unidades AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Staff leem unidades"
  ON public.unidades FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role,'diakonia'::app_role,'lideranca'::app_role]));

CREATE POLICY "Admin/Sec gerenciam unidades"
  ON public.unidades FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role]));

CREATE TRIGGER trg_unidades_updated
  BEFORE UPDATE ON public.unidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_unidades_tipo ON public.unidades(tipo);
CREATE INDEX IF NOT EXISTS idx_unidades_ativa ON public.unidades(ativa);

-- 4. Tabela: predios
-- Endereco fisico real. Uma unidade pode ter N predios.
CREATE TABLE IF NOT EXISTS public.predios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id     uuid NOT NULL REFERENCES public.unidades(id) ON DELETE RESTRICT,
  nome           text NOT NULL,
  tipo           public.predio_tipo NOT NULL DEFAULT 'templo',
  sigla          text,
  logradouro     text,
  numero         text,
  complemento    text,
  bairro         text,
  cidade         text,
  estado         text,
  cep            text,
  referencia     text,
  ativo          boolean NOT NULL DEFAULT true,
  descricao      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.predios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.predios FORCE ROW LEVEL SECURITY;

CREATE POLICY "Bloqueia anon predios"
  ON public.predios AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "Staff leem predios"
  ON public.predios FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role,'diakonia'::app_role,'lideranca'::app_role]));

CREATE POLICY "Admin/Sec gerenciam predios"
  ON public.predios FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(),
    ARRAY['admin'::app_role,'secretaria'::app_role]));

CREATE TRIGGER trg_predios_updated
  BEFORE UPDATE ON public.predios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_predios_unidade ON public.predios(unidade_id);
CREATE INDEX IF NOT EXISTS idx_predios_tipo    ON public.predios(tipo);
CREATE INDEX IF NOT EXISTS idx_predios_ativo   ON public.predios(ativo);

-- 5. Adicionar predio_id em locais (FK para predios, nullable inicialmente)
ALTER TABLE public.locais
  ADD COLUMN IF NOT EXISTS predio_id uuid REFERENCES public.predios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_locais_predio_id
  ON public.locais(predio_id) WHERE predio_id IS NOT NULL;

-- 6. View hierarquica completa: unidade → predio → local
CREATE OR REPLACE VIEW public.v_estrutura_fisica AS
SELECT
  u.id            AS unidade_id,
  u.nome          AS unidade_nome,
  u.tipo          AS unidade_tipo,
  p.id            AS predio_id,
  p.nome          AS predio_nome,
  p.tipo          AS predio_tipo,
  p.logradouro,
  p.numero,
  p.bairro,
  p.cidade,
  l.id            AS local_id,
  l.nome          AS local_nome,
  l.nome_completo AS local_nome_completo,
  l.status_operacional,
  l.capacidade,
  l.permite_agendamento,
  l.proxima_manutencao
FROM public.unidades u
LEFT JOIN public.predios   p ON p.unidade_id = u.id AND p.ativo = true
LEFT JOIN public.locais    l ON l.predio_id  = p.id AND l.status <> 'inativo'
WHERE u.ativa = true
ORDER BY u.nome, p.nome, l.nome;

-- 7. View: resumo de ocupacao por predio
CREATE OR REPLACE VIEW public.v_predios_resumo AS
SELECT
  p.id,
  p.nome,
  p.tipo,
  p.unidade_id,
  u.nome          AS unidade_nome,
  COUNT(l.id)     AS total_locais,
  COUNT(l.id) FILTER (WHERE l.status_operacional = 'disponivel')    AS disponiveis,
  COUNT(l.id) FILTER (WHERE l.status_operacional = 'em_manutencao') AS em_manutencao,
  COUNT(l.id) FILTER (WHERE l.status_operacional = 'interditado')   AS interditados
FROM public.predios p
JOIN public.unidades u ON u.id = p.unidade_id
LEFT JOIN public.locais l ON l.predio_id = p.id
WHERE p.ativo = true AND u.ativa = true
GROUP BY p.id, p.nome, p.tipo, p.unidade_id, u.nome
ORDER BY u.nome, p.nome;
