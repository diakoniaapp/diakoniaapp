-- ================================================================
-- CORREÇÃO DEFINITIVA — Tabelas LGPD
-- Projeto: prjoftmlkusbjoeptabp
-- Aplicar no SQL Editor do Supabase Dashboard
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TABELA consentimento
--    Problema original: pessoa_id NOT NULL FK para membros.id
--    Correção: pessoa_id nullable + auth_user_id FK para auth.users
-- ----------------------------------------------------------------

-- Criar tabela do zero com estrutura correta
CREATE TABLE IF NOT EXISTS public.consentimento (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pessoa_id     UUID        REFERENCES public.membros(id) ON DELETE SET NULL,
  tipo          TEXT        NOT NULL DEFAULT 'politica_privacidade',
  base_legal    TEXT        NOT NULL DEFAULT 'consentimento',
  aceito        BOOLEAN     NOT NULL DEFAULT false,
  texto_versao  TEXT        NOT NULL DEFAULT '1.0',
  finalidade    TEXT,
  canal         TEXT        NOT NULL DEFAULT 'web_app',
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em   TIMESTAMPTZ
);

-- Se a tabela já existe com estrutura antiga, aplicar alterações:
DO $$
BEGIN
  -- Adicionar auth_user_id se não existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'consentimento'
      AND column_name  = 'auth_user_id'
  ) THEN
    ALTER TABLE public.consentimento
      ADD COLUMN auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Tornar pessoa_id nullable se não for
  ALTER TABLE public.consentimento
    ALTER COLUMN pessoa_id DROP NOT NULL;

EXCEPTION WHEN OTHERS THEN
  -- Tabela não existe ainda — foi criada acima
  NULL;
END $$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_consentimento_auth_user  ON public.consentimento(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_consentimento_pessoa      ON public.consentimento(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_consentimento_tipo_aceito ON public.consentimento(tipo, aceito);

-- RLS
ALTER TABLE public.consentimento ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas conflitantes
DROP POLICY IF EXISTS "insert_proprio_consentimento"     ON public.consentimento;
DROP POLICY IF EXISTS "select_proprio_consentimento"     ON public.consentimento;
DROP POLICY IF EXISTS "admin_select_consentimento"       ON public.consentimento;
DROP POLICY IF EXISTS "Autenticados inserem consentimento" ON public.consentimento;

-- Usuário autenticado insere APENAS seu próprio registro
CREATE POLICY "consentimento_insert_proprio"
  ON public.consentimento
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Usuário autenticado lê seus próprios registros
CREATE POLICY "consentimento_select_proprio"
  ON public.consentimento
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Admin e secretaria leem todos
CREATE POLICY "consentimento_admin_select"
  ON public.consentimento
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'secretaria')
    )
  );

-- ----------------------------------------------------------------
-- 2. TABELA log_auditoria
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.log_auditoria (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela        TEXT        NOT NULL,
  registro_id   UUID,
  acao          TEXT        NOT NULL,
  usuario_email TEXT,
  campos_alt    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_auditoria_acao  ON public.log_auditoria(acao, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_email ON public.log_auditoria(usuario_email);

ALTER TABLE public.log_auditoria ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_log_auditoria"      ON public.log_auditoria;
DROP POLICY IF EXISTS "admin_select_log_auditoria" ON public.log_auditoria;

-- Qualquer autenticado insere
CREATE POLICY "log_auditoria_insert"
  ON public.log_auditoria
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Admin e secretaria leem
CREATE POLICY "log_auditoria_admin_select"
  ON public.log_auditoria
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'secretaria')
    )
  );

-- ----------------------------------------------------------------
-- 3. TABELA politica_privacidade
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.politica_privacidade (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  versao       TEXT        NOT NULL UNIQUE,
  titulo       TEXT        NOT NULL DEFAULT 'Política de Privacidade',
  conteudo     TEXT        NOT NULL,
  vigente      BOOLEAN     NOT NULL DEFAULT false,
  publicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.politica_privacidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_politica"       ON public.politica_privacidade;
DROP POLICY IF EXISTS "admin_manage_politica" ON public.politica_privacidade;

CREATE POLICY "politica_select_autenticado"
  ON public.politica_privacidade
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "politica_admin_manage"
  ON public.politica_privacidade
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Política padrão (versão 1.0)
INSERT INTO public.politica_privacidade (versao, titulo, conteudo, vigente)
VALUES (
  '1.0',
  'Política de Privacidade — DiakoniaApp',
  '**1. Quais dados coletamos?**
O DiakoniaApp coleta dados pessoais fornecidos voluntariamente pelos membros e lideranças da Igreja, como nome completo, telefone, e-mail, endereço, data de nascimento e informações de participação ministerial.

**2. Para que usamos seus dados?**
Os dados são utilizados exclusivamente para fins ministeriais e administrativos internos. Não compartilhamos informações com terceiros sem consentimento expresso.

**3. Base legal — LGPD (Lei 13.709/2018)**
O tratamento fundamenta-se no consentimento do titular (Art. 7º, I) e no legítimo interesse da instituição religiosa (Art. 7º, IX).

**4. Seus direitos**
Você tem direito a acessar, corrigir, portar, anonimizar ou solicitar a exclusão dos seus dados. Para exercer qualquer direito, entre em contato com a secretaria da Igreja.

**5. Segurança**
Seus dados são armazenados com criptografia e acesso restrito aos responsáveis autorizados pelo sistema.

**6. Contato**
Dúvidas sobre privacidade: secretaria@qibrj.org.br',
  true
)
ON CONFLICT (versao) DO NOTHING;

-- ----------------------------------------------------------------
-- Verificação final
-- ----------------------------------------------------------------
SELECT 'consentimento' as tabela, count(*) as policies
  FROM pg_policies WHERE tablename = 'consentimento'
UNION ALL
SELECT 'log_auditoria', count(*)
  FROM pg_policies WHERE tablename = 'log_auditoria'
UNION ALL
SELECT 'politica_privacidade', count(*)
  FROM pg_policies WHERE tablename = 'politica_privacidade';
