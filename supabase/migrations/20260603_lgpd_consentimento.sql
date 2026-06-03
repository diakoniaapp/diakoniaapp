-- ============================================================
-- Tabela: consentimento
-- Registra aceite LGPD de membros e usuários do sistema
-- ============================================================

CREATE TABLE IF NOT EXISTS public.consentimento (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id     UUID        REFERENCES public.membros(id) ON DELETE SET NULL,
  auth_user_id  UUID        REFERENCES auth.users(id)    ON DELETE SET NULL,
  tipo          TEXT        NOT NULL DEFAULT 'politica_privacidade',
  base_legal    TEXT        NOT NULL DEFAULT 'consentimento',
  aceito        BOOLEAN     NOT NULL DEFAULT false,
  texto_versao  TEXT        NOT NULL DEFAULT '1.0',
  finalidade    TEXT,
  canal         TEXT        NOT NULL DEFAULT 'web_app',
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consentimento_pessoa   ON public.consentimento(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_consentimento_auth     ON public.consentimento(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_consentimento_tipo     ON public.consentimento(tipo, aceito);

ALTER TABLE public.consentimento ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode inserir seu próprio consentimento
CREATE POLICY "insert_proprio_consentimento"
  ON public.consentimento FOR INSERT TO authenticated
  WITH CHECK (true);

-- Usuário lê seus próprios registros
CREATE POLICY "select_proprio_consentimento"
  ON public.consentimento FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Admin e secretaria leem todos
CREATE POLICY "admin_select_consentimento"
  ON public.consentimento FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- ============================================================
-- Tabela: log_auditoria
-- Registra ações críticas do sistema (TROCA_SENHA, ACEITE_LGPD)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.log_auditoria (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela        TEXT        NOT NULL,
  registro_id   UUID,
  acao          TEXT        NOT NULL,
  usuario_email TEXT,
  campos_alt    JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_auditoria_acao     ON public.log_auditoria(acao, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_auditoria_email    ON public.log_auditoria(usuario_email);

ALTER TABLE public.log_auditoria ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode inserir log
CREATE POLICY "insert_log_auditoria"
  ON public.log_auditoria FOR INSERT TO authenticated
  WITH CHECK (true);

-- Admin e secretaria leem todos os logs
CREATE POLICY "admin_select_log_auditoria"
  ON public.log_auditoria FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- ============================================================
-- Tabela: politica_privacidade
-- Armazena versões da política de privacidade
-- ============================================================

CREATE TABLE IF NOT EXISTS public.politica_privacidade (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  versao       TEXT        NOT NULL UNIQUE,
  titulo       TEXT        NOT NULL DEFAULT 'Política de Privacidade',
  conteudo     TEXT        NOT NULL,
  vigente      BOOLEAN     NOT NULL DEFAULT false,
  publicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.politica_privacidade ENABLE ROW LEVEL SECURITY;

-- Todos autenticados leem
CREATE POLICY "select_politica"
  ON public.politica_privacidade FOR SELECT TO authenticated
  USING (true);

-- Somente admin gerencia
CREATE POLICY "admin_manage_politica"
  ON public.politica_privacidade FOR ALL TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role]));

-- Inserir política padrão inicial
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
