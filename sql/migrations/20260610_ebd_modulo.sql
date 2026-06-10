-- ─── EBD Fase A: schema + funções ────────────────────────────────────────────
-- Cria 6 tabelas: ebd_classes, ebd_matriculas, ebd_aulas, ebd_presencas,
-- ebd_campanhas, ebd_entradas (estas 4 ultimas em stub, populadas nas fases B/C).
-- Cria RPCs sugerir_classe_ebd, esperados_da_classe, resumo_campanha_ebd.
-- Seed inicial com 9 classes padrao da igreja brasileira.

BEGIN;

-- ── 1. CLASSES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ebd_classes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL UNIQUE,
  idade_min    int,
  idade_max    int,
  genero       text NOT NULL DEFAULT 'misto' CHECK (genero IN ('masculino','feminino','misto')),
  descricao    text,
  cor          text DEFAULT '#cfa451',
  ordem        int NOT NULL DEFAULT 0,
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── 2. MATRÍCULAS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ebd_matriculas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id       uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  classe_id       uuid NOT NULL REFERENCES public.ebd_classes(id) ON DELETE CASCADE,
  data_matricula  date NOT NULL DEFAULT CURRENT_DATE,
  ativo           boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ebd_matricula_ativa
  ON public.ebd_matriculas (pessoa_id, classe_id) WHERE ativo = true;
CREATE INDEX IF NOT EXISTS ix_ebd_matricula_classe ON public.ebd_matriculas(classe_id) WHERE ativo = true;

-- ── 3. AULAS (stub p/ Fase B) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ebd_aulas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id     uuid NOT NULL REFERENCES public.ebd_classes(id) ON DELETE CASCADE,
  data          date NOT NULL,
  professor_id  uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  tema          text,
  foto_url      text,
  observacoes   text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (classe_id, data)
);

-- ── 4. PRESENÇAS (stub p/ Fase B) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ebd_presencas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id         uuid NOT NULL REFERENCES public.ebd_aulas(id) ON DELETE CASCADE,
  pessoa_id       uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  presente        boolean NOT NULL DEFAULT true,
  eh_visitante    boolean NOT NULL DEFAULT false,
  observacao      text,
  registrado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (aula_id, pessoa_id)
);

-- ── 5. CAMPANHAS (stub p/ Fase C) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ebd_campanhas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classe_id      uuid REFERENCES public.ebd_classes(id) ON DELETE CASCADE,
  nome           text NOT NULL,
  descricao      text,
  data_inicio    date NOT NULL,
  data_fim       date NOT NULL,
  meta_valor     numeric(12,2) NOT NULL CHECK (meta_valor > 0),
  ativo          boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ebd_entradas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id     uuid NOT NULL REFERENCES public.ebd_campanhas(id) ON DELETE CASCADE,
  data            date NOT NULL DEFAULT CURRENT_DATE,
  valor           numeric(12,2) NOT NULL CHECK (valor > 0),
  tipo            text NOT NULL CHECK (tipo IN ('oferta','evento','produto')),
  forma           text NOT NULL CHECK (forma IN ('pix','envelope','outro')),
  descricao       text,
  registrado_por  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

-- ── RPC: sugerir classe baseado em data_nascimento + sexo ─────────────────
CREATE OR REPLACE FUNCTION public.sugerir_classe_ebd(
  p_data_nascimento date,
  p_sexo            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH calc AS (
    SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_data_nascimento))::int AS idade
  )
  SELECT c.id
    FROM public.ebd_classes c, calc
   WHERE c.ativo = true
     AND (c.idade_min IS NULL OR calc.idade >= c.idade_min)
     AND (c.idade_max IS NULL OR calc.idade <= c.idade_max)
     AND (c.genero = 'misto'
          OR (p_sexo IS NOT NULL AND c.genero = p_sexo))
   ORDER BY 
     (c.genero <> 'misto') DESC,  -- prefere classe específica de gênero
     COALESCE(c.idade_max - c.idade_min, 999) ASC,
     c.ordem ASC
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.sugerir_classe_ebd(date, text) TO authenticated;

-- ── RPC: esperados de uma classe ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.esperados_da_classe(p_classe_id uuid)
RETURNS TABLE(
  pessoa_id        uuid,
  nome_completo    text,
  sexo             text,
  data_nascimento  date,
  idade            int,
  ja_matriculado   boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT * FROM public.ebd_classes WHERE id = p_classe_id
  )
  SELECT m.id, m.nome_completo, m.sexo::text, m.data_nascimento,
         EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int AS idade,
         EXISTS (SELECT 1 FROM public.ebd_matriculas em
                  WHERE em.pessoa_id = m.id AND em.classe_id = p_classe_id AND em.ativo) AS ja_matriculado
    FROM public.membros m, c
   WHERE m.status = 'ativo'
     AND m.tipo_pessoa IN ('membro','congregado')
     AND m.data_nascimento IS NOT NULL
     AND (c.idade_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) >= c.idade_min)
     AND (c.idade_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) <= c.idade_max)
     AND (c.genero = 'misto' OR (m.sexo IS NOT NULL AND c.genero = m.sexo::text))
   ORDER BY m.nome_completo;
$$;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO authenticated;

-- ── RPC: resumo de campanha (para Fase C, criando ja) ────────────────────
CREATE OR REPLACE FUNCTION public.resumo_campanha_ebd(p_campanha_id uuid)
RETURNS TABLE(
  meta              numeric,
  arrecadado        numeric,
  percentual        numeric,
  dias_decorridos   int,
  dias_totais       int,
  meta_diaria       numeric,
  esperado_ate_hoje numeric,
  status            text
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c     public.ebd_campanhas%ROWTYPE;
  v_total numeric;
BEGIN
  SELECT * INTO v_c FROM public.ebd_campanhas WHERE id = p_campanha_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(SUM(valor), 0) INTO v_total
    FROM public.ebd_entradas WHERE campanha_id = p_campanha_id;

  meta              := v_c.meta_valor;
  arrecadado        := v_total;
  percentual        := CASE WHEN v_c.meta_valor > 0 THEN ROUND((v_total / v_c.meta_valor) * 100, 1) ELSE 0 END;
  dias_decorridos   := GREATEST(0, LEAST(CURRENT_DATE - v_c.data_inicio, v_c.data_fim - v_c.data_inicio));
  dias_totais       := GREATEST(1, v_c.data_fim - v_c.data_inicio);
  meta_diaria       := ROUND(v_c.meta_valor / dias_totais, 2);
  esperado_ate_hoje := ROUND(meta_diaria * dias_decorridos, 2);
  status := CASE
    WHEN v_total >= v_c.meta_valor       THEN 'meta_atingida'
    WHEN v_total >= esperado_ate_hoje*1.10 THEN 'acima_esperado'
    WHEN v_total <= esperado_ate_hoje*0.50 THEN 'muito_abaixo'
    WHEN v_total <= esperado_ate_hoje*0.85 THEN 'abaixo_esperado'
    ELSE 'no_ritmo'
  END;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resumo_campanha_ebd(uuid) TO authenticated;

-- ── VIEW: alertas de idade (para Fase D, criando ja) ─────────────────────
CREATE OR REPLACE VIEW public.vw_ebd_alertas_idade AS
SELECT em.pessoa_id, m.nome_completo, m.sexo::text AS sexo, m.data_nascimento,
       EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int AS idade_atual,
       em.classe_id AS classe_atual_id, c.nome AS classe_atual,
       public.sugerir_classe_ebd(m.data_nascimento, m.sexo::text) AS classe_sugerida_id
  FROM public.ebd_matriculas em
  JOIN public.membros m ON m.id = em.pessoa_id
  JOIN public.ebd_classes c ON c.id = em.classe_id
 WHERE em.ativo = true
   AND m.data_nascimento IS NOT NULL
   AND ((c.idade_min IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) < c.idade_min)
     OR (c.idade_max IS NOT NULL AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) > c.idade_max));
GRANT SELECT ON public.vw_ebd_alertas_idade TO authenticated;

-- ── Seed: 9 classes padrão ────────────────────────────────────────────────
INSERT INTO public.ebd_classes (nome, idade_min, idade_max, genero, ordem) VALUES
  ('Berçário',     0,    2,     'misto',     10),
  ('Maternal',     3,    5,     'misto',     20),
  ('Primários',    6,    8,     'misto',     30),
  ('Juniores',     9,   11,     'misto',     40),
  ('Adolescentes', 12,  15,     'misto',     50),
  ('Juvenis',      16,  25,     'misto',     60),
  ('Adultos',      26,  59,     'misto',     70),
  ('Mulheres',     20,  NULL,   'feminino',  75),
  ('Idosos',       60,  NULL,   'misto',     80)
ON CONFLICT (nome) DO NOTHING;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.ebd_classes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebd_matriculas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebd_aulas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebd_presencas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebd_campanhas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebd_entradas     ENABLE ROW LEVEL SECURITY;

-- Helper inline pra reduzir repetição
DO $body$
DECLARE
  v_tabela text;
BEGIN
  FOREACH v_tabela IN ARRAY ARRAY['ebd_classes','ebd_matriculas','ebd_aulas',
                                  'ebd_presencas','ebd_campanhas','ebd_entradas']
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
        v_tabela || '_select', v_tabela);
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ('
        || 'EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() '
        || 'AND ur.role::text IN (''admin'',''secretaria'',''pastor'',''diakonia'',''lideranca''))'
        || ') WITH CHECK (true)',
        v_tabela || '_modify_lider', v_tabela);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END$body$;

NOTIFY pgrst, 'reload schema';

COMMIT;
