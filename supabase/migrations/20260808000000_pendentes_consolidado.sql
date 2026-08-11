-- ============================================================
-- 20260808000000_pendentes_consolidado.sql
--
-- Consolida as tres migrations que existem no repositorio e nunca
-- foram aplicadas em producao. Gerado por concatenacao dos arquivos
-- originais, sem reescrita manual do DDL.
--
-- Alteracao aplicada: cada CREATE POLICY recebeu um DROP POLICY IF
-- EXISTS antes. Nos originais isso faltava, e uma policy ja existente
-- abortaria a migration no meio, deixando aplicacao parcial.
-- ============================================================

-- ############ origem: 20260528_estrutura_organizacional.sql ############
-- ============================================================
-- REESTRUTURAÃ‡ÃƒO ORGANIZACIONAL COMPLETA
-- Diakonia App v3.0 â€” Estrutura Oficial da Igreja
-- ============================================================
-- Camadas: Assembleia â†’ Diretoria â†’ Conselho â†’ MinistÃ©rios
--          â†’ Ãreas â†’ Setores â†’ Pessoas â†’ Escalas
-- ============================================================

-- â”€â”€ 1. Aprimorar ministerios com tipo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ALTER TABLE public.ministerios
  ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'operacional'
    CHECK (tipo IN ('operacional', 'governanca'));

ALTER TABLE public.ministerios
  ADD COLUMN IF NOT EXISTS cor TEXT;   -- ex: '#7C3AED' para identificaÃ§Ã£o visual

-- Seed: ministÃ©rios oficiais (ON CONFLICT Ã© por nome)
INSERT INTO public.ministerios (nome, tipo, ativo, cor) VALUES
  ('Celebrando a TransformaÃ§Ã£o', 'operacional', true, '#7C3AED'),
  ('Pastoral',                   'operacional', true, '#2563EB'),
  ('AdministraÃ§Ã£o',              'operacional', true, '#0891B2'),
  ('ComunicaÃ§Ã£o',                'operacional', true, '#7C3AED'),
  ('Diaconia e AÃ§Ã£o Social',     'operacional', true, '#DC2626'),
  ('EducaÃ§Ã£o CristÃ£',            'operacional', true, '#D97706'),
  ('MÃºsica',                     'operacional', true, '#7C3AED'),
  ('MissÃµes e Evangelismo',      'operacional', true, '#059669'),
  ('ComunhÃ£o e IntegraÃ§Ã£o',      'operacional', true, '#DB2777'),
  ('FamÃ­lias',                   'operacional', true, '#EA580C'),
  ('OraÃ§Ã£o',                     'operacional', true, '#6D28D9')
ON CONFLICT (nome) DO NOTHING;

-- â”€â”€ 2. Cargos EstatutÃ¡rios (Diretoria â€” NUNCA Ã© ministÃ©rio) â”€â”€
CREATE TABLE IF NOT EXISTS public.cargos_estatutarios (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT    NOT NULL UNIQUE,
  nivel      INTEGER NOT NULL DEFAULT 1 CHECK (nivel IN (1,2,3,4)),
  -- 1=Presidente, 2=Vice-presidente, 3=SecretÃ¡rio, 4=Tesoureiro
  descricao  TEXT,
  ativo      BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.cargos_estatutarios (nome, nivel, descricao) VALUES
  ('Presidente',      1, 'Representa legalmente a Igreja'),
  ('Vice-presidente', 2, 'Substitui o Presidente em suas ausÃªncias'),
  ('SecretÃ¡rio',      3, 'ResponsÃ¡vel pela documentaÃ§Ã£o oficial'),
  ('2Âº SecretÃ¡rio',   3, 'Auxilia o SecretÃ¡rio'),
  ('Tesoureiro',      4, 'GestÃ£o financeira e patrimonial'),
  ('2Âº Tesoureiro',   4, 'Auxilia o Tesoureiro')
ON CONFLICT (nome) DO NOTHING;

-- â”€â”€ 3. Pessoa â†” Cargo EstatutÃ¡rio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.pessoa_cargo_estatutario (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id   UUID NOT NULL REFERENCES public.membros(id)              ON DELETE CASCADE,
  cargo_id    UUID NOT NULL REFERENCES public.cargos_estatutarios(id)  ON DELETE CASCADE,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim    DATE,
  mandato     TEXT,   -- ex: '2024-2026'
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pessoa_id, cargo_id, data_inicio)
);

-- â”€â”€ 4. Ãreas (subdivisÃµes de um ministÃ©rio) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.areas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministerio_id UUID NOT NULL REFERENCES public.ministerios(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  lider_id      UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  vice_lider_id UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  cor           TEXT,
  ativo         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- â”€â”€ 5. Setores (subdivisÃµes de uma Ã¡rea) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.setores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id     UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  lider_id    UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- â”€â”€ 6. ParticipaÃ§Ã£o flexÃ­vel (pessoa â†” ministÃ©rio/Ã¡rea/setor) â”€
--   Permite mÃºltiplos vÃ­nculos simultÃ¢neos por pessoa
CREATE TABLE IF NOT EXISTS public.pessoa_participacao (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id     UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  ministerio_id UUID REFERENCES public.ministerios(id) ON DELETE CASCADE,
  area_id       UUID REFERENCES public.areas(id)        ON DELETE CASCADE,
  setor_id      UUID REFERENCES public.setores(id)      ON DELETE CASCADE,
  funcao        TEXT NOT NULL DEFAULT 'voluntario'
    CHECK (funcao IN (
      'lider', 'co_lider', 'secretario', 'tesoureiro',
      'voluntario', 'diacono', 'obreiro', 'colaborador', 'outro'
    )),
  data_inicio   DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim      DATE,
  ativo         BOOLEAN DEFAULT true,
  observacao    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  -- exige pelo menos um vÃ­nculo
  CONSTRAINT fk_vinculo_obrigatorio CHECK (
    ministerio_id IS NOT NULL OR area_id IS NOT NULL OR setor_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_participacao_pessoa
  ON public.pessoa_participacao(pessoa_id) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_participacao_ministerio
  ON public.pessoa_participacao(ministerio_id) WHERE ativo = true;

-- â”€â”€ 7. Escalas (cabeÃ§alho) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.escalas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministerio_id UUID REFERENCES public.ministerios(id) ON DELETE SET NULL,
  area_id       UUID REFERENCES public.areas(id)        ON DELETE SET NULL,
  nome          TEXT NOT NULL,
  data_inicio   DATE NOT NULL,
  data_fim      DATE,
  descricao     TEXT,
  ativo         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- â”€â”€ 8. Escala â†” Participantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS public.escala_participantes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id  UUID NOT NULL REFERENCES public.escalas(id) ON DELETE CASCADE,
  pessoa_id  UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  funcao     TEXT,
  data_slot  DATE,
  confirmado BOOLEAN DEFAULT NULL,   -- NULL=aguardando, true=confirmado, false=recusou
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(escala_id, pessoa_id, data_slot)
);

-- â”€â”€ RLS em todas as tabelas novas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'cargos_estatutarios', 'pessoa_cargo_estatutario',
    'areas', 'setores', 'pessoa_participacao',
    'escalas', 'escala_participantes'
  ] LOOP
    EXECUTE format(
      'DO $inner$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_policies
           WHERE tablename = %L AND policyname = %L
         ) THEN
           EXECUTE ''ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY'';
           EXECUTE ''CREATE POLICY "read_%s" ON public.%I FOR SELECT USING (auth.role() = ''''authenticated'''')'';
           EXECUTE ''CREATE POLICY "ins_%s" ON public.%I FOR INSERT WITH CHECK (auth.role() = ''''authenticated'''')'';
           EXECUTE ''CREATE POLICY "upd_%s" ON public.%I FOR UPDATE USING (auth.role() = ''''authenticated'''')'';
         END IF;
       END $inner$'',
      tbl, ''read_''||tbl, tbl, tbl, tbl, tbl, tbl, tbl
    );
  END LOOP;
END $$;

-- â”€â”€ VIEW: Conselho da Igreja (calculado) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE VIEW public.v_conselho_da_igreja AS

-- Diretoria estatutÃ¡ria
SELECT
  m.id                        AS pessoa_id,
  m.nome_completo,
  m.foto_url,
  ce.nome                     AS cargo,
  ce.nivel                    AS nivel_cargo,
  'diretoria'                 AS tipo_participacao,
  NULL::TEXT                  AS ministerio_nome
FROM public.pessoa_cargo_estatutario pce
JOIN public.membros m             ON m.id  = pce.pessoa_id
JOIN public.cargos_estatutarios ce ON ce.id = pce.cargo_id
WHERE pce.ativo = true

UNION ALL

-- LÃ­deres de ministÃ©rio operacional
SELECT
  m.id,
  m.nome_completo,
  m.foto_url,
  'LÃ­der de MinistÃ©rio'       AS cargo,
  10                          AS nivel_cargo,
  'ministerio'                AS tipo_participacao,
  mi.nome                     AS ministerio_nome
FROM public.ministerios mi
JOIN public.membros m ON m.id = mi.lider_id
WHERE mi.ativo = true AND mi.lider_id IS NOT NULL

UNION ALL

-- LÃ­deres de Ã¡rea
SELECT
  m.id,
  m.nome_completo,
  m.foto_url,
  'LÃ­der de Ãrea'             AS cargo,
  20                          AS nivel_cargo,
  'area'                      AS tipo_participacao,
  mi.nome                     AS ministerio_nome
FROM public.areas a
JOIN public.ministerios mi ON mi.id = a.ministerio_id
JOIN public.membros m      ON m.id  = a.lider_id
WHERE a.ativo = true AND a.lider_id IS NOT NULL

UNION ALL

-- DiÃ¡conos
SELECT
  m.id,
  m.nome_completo,
  m.foto_url,
  'DiÃ¡cono'                   AS cargo,
  30                          AS nivel_cargo,
  'diacono'                   AS tipo_participacao,
  mi.nome                     AS ministerio_nome
FROM public.pessoa_participacao pp
JOIN public.membros m              ON m.id  = pp.pessoa_id
LEFT JOIN public.ministerios mi    ON mi.id = pp.ministerio_id
WHERE pp.funcao = 'diacono' AND pp.ativo = true;


-- ############ origem: 20260528_visita_historico.sql ############
-- ============================================================
-- Sprint A â€” Log imutÃ¡vel de contatos e interaÃ§Ãµes pastorais
-- ============================================================

-- Tabela principal de histÃ³rico
CREATE TABLE IF NOT EXISTS visita_historico (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitante_id  UUID NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN (
                  'whatsapp',
                  'ligacao',
                  'visita_presencial',
                  'email',
                  'retorno_culto',
                  'evento',
                  'observacao',
                  'cadastro',
                  'promocao_congregado',
                  'promocao_membro'
                )),
  observacao    TEXT,
  registrado_por UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE visita_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_historico" ON visita_historico;
CREATE POLICY "auth_select_historico"
  ON visita_historico FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "auth_insert_historico" ON visita_historico;
CREATE POLICY "auth_insert_historico"
  ON visita_historico FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Ãndice para busca por visitante ordenada cronologicamente
CREATE INDEX IF NOT EXISTS idx_visita_historico_visitante
  ON visita_historico(visitante_id, created_at DESC);

-- ============================================================
-- Seed automÃ¡tico: criar entrada de "cadastro" para visitantes
-- jÃ¡ existentes (executa uma vez)
-- ============================================================
INSERT INTO visita_historico (visitante_id, tipo, observacao, created_at)
SELECT
  id,
  'cadastro',
  'Primeiro culto â€” cadastro inicial',
  created_at
FROM membros
WHERE tipo_pessoa IN ('visitante', 'congregado', 'membro')
ON CONFLICT DO NOTHING;


-- ############ origem: 20260604000000_storage_documentos.sql ############
-- ============================================================
-- 20260604000000_storage_documentos.sql
-- Bucket de storage para documentos institucionais
-- Adiciona campos de ingestÃ£o na tabela documentos
-- ============================================================

-- 1. Criar bucket "documentos" (publico=false, tamanho max 20MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Politicas de acesso ao bucket
-- Admin e Secretaria podem fazer upload, download e delete
DROP POLICY IF EXISTS "Admin/Sec upload documentos" ON storage.objects;
CREATE POLICY "Admin/Sec upload documentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

DROP POLICY IF EXISTS "Admin/Sec download documentos" ON storage.objects;
CREATE POLICY "Admin/Sec download documentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

DROP POLICY IF EXISTS "Admin/Sec delete documentos" ON storage.objects;
CREATE POLICY "Admin/Sec delete documentos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

DROP POLICY IF EXISTS "Admin/Sec update documentos" ON storage.objects;
CREATE POLICY "Admin/Sec update documentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

-- 3. Adicionar colunas de ingestao na tabela documentos
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS arquivo_storage_path text,
  ADD COLUMN IF NOT EXISTS arquivo_nome          text,
  ADD COLUMN IF NOT EXISTS arquivo_mime          text,
  ADD COLUMN IF NOT EXISTS arquivo_tamanho_bytes bigint,
  ADD COLUMN IF NOT EXISTS texto_extraido        text,
  ADD COLUMN IF NOT EXISTS ingestao_status       text DEFAULT 'pendente'
    CHECK (ingestao_status IN ('pendente', 'processando', 'concluido', 'erro')),
  ADD COLUMN IF NOT EXISTS ingestao_erro         text,
  ADD COLUMN IF NOT EXISTS ingestao_em           timestamptz;

COMMENT ON COLUMN public.documentos.arquivo_storage_path IS 'Caminho no bucket documentos';
COMMENT ON COLUMN public.documentos.texto_extraido IS 'Texto completo extraido do PDF/DOCX para busca e parser';
COMMENT ON COLUMN public.documentos.ingestao_status IS 'pendente | processando | concluido | erro';



-- ############ origem: sql/migrations/20260610_ebd_esperados_outra_classe.sql ############
-- Aplicado parcialmente em producao: esperados_da_classe existe, mover_aluno_classe nao.
-- Ambas usam CREATE OR REPLACE, entao reexecutar o arquivo inteiro e seguro.
-- ─── EBD: esperados_da_classe agora retorna info de outra matricula ──────────

DROP FUNCTION IF EXISTS public.esperados_da_classe(uuid);

CREATE OR REPLACE FUNCTION public.esperados_da_classe(p_classe_id uuid)
RETURNS TABLE(
  pessoa_id            uuid,
  nome_completo        text,
  sexo                 text,
  data_nascimento      date,
  idade                int,
  ja_matriculado       boolean,
  matricula_id         uuid,
  outra_classe_id      uuid,
  outra_classe_nome    text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH c AS (
    SELECT * FROM public.ebd_classes WHERE id = p_classe_id
  ),
  outras_mat AS (
    -- Para cada pessoa, qual classe ela está hoje (se nao for a atual)
    SELECT em.pessoa_id, em.classe_id, em.id AS matricula_id, cl.nome AS classe_nome
      FROM public.ebd_matriculas em
      JOIN public.ebd_classes cl ON cl.id = em.classe_id
     WHERE em.ativo = true
  )
  SELECT m.id AS pessoa_id,
         m.nome_completo,
         m.sexo::text,
         m.data_nascimento,
         EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento))::int AS idade,
         (om.classe_id = p_classe_id) AS ja_matriculado,
         CASE WHEN om.classe_id = p_classe_id THEN om.matricula_id ELSE NULL END AS matricula_id,
         CASE WHEN om.classe_id IS NOT NULL AND om.classe_id <> p_classe_id THEN om.classe_id ELSE NULL END AS outra_classe_id,
         CASE WHEN om.classe_id IS NOT NULL AND om.classe_id <> p_classe_id THEN om.classe_nome ELSE NULL END AS outra_classe_nome
    FROM public.membros m
    CROSS JOIN c
    LEFT JOIN outras_mat om ON om.pessoa_id = m.id
   WHERE m.status = 'ativo'
     AND m.tipo_pessoa IN ('membro','congregado')
     AND m.data_nascimento IS NOT NULL
     -- Exclui professores ativos em qualquer classe (professor nao eh aluno)
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_professores ep
        WHERE ep.pessoa_id = m.id AND ep.ativo = true
     )
     -- Exclui quem ja esta matriculado em outra classe ativa
     AND NOT EXISTS (
       SELECT 1 FROM public.ebd_matriculas em2
        WHERE em2.pessoa_id = m.id 
          AND em2.classe_id <> p_classe_id
          AND em2.ativo = true
     )
     AND (c.idade_min IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) >= c.idade_min)
     AND (c.idade_max IS NULL OR EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.data_nascimento)) <= c.idade_max)
     AND (c.genero = 'misto' OR (m.sexo IS NOT NULL AND c.genero = m.sexo::text))
   ORDER BY m.nome_completo;
$$;
GRANT EXECUTE ON FUNCTION public.esperados_da_classe(uuid) TO authenticated;

-- ─── RPC: mover pessoa entre classes (desativa outras e cria nova) ───────────
CREATE OR REPLACE FUNCTION public.mover_aluno_classe(
  p_pessoa_id    uuid,
  p_classe_nova  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nova_mat_id uuid;
BEGIN
  -- 1. Desativar todas as matriculas ativas da pessoa
  UPDATE public.ebd_matriculas
     SET ativo = false, updated_at = NOW()
   WHERE pessoa_id = p_pessoa_id AND ativo = true;

  -- 2. Inserir nova matricula
  INSERT INTO public.ebd_matriculas (pessoa_id, classe_id, ativo)
       VALUES (p_pessoa_id, p_classe_nova, true)
       RETURNING id INTO v_nova_mat_id;

  RETURN v_nova_mat_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mover_aluno_classe(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

