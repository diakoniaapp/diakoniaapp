-- ============================================================
-- DiakoniaApp — Migração de Domínio: Pessoa → Acesso
-- Execute no Supabase Dashboard → SQL Editor
-- Esta migração é ADITIVA: não remove nada, só acrescenta.
-- ============================================================

-- ── 1. Vincular profiles com a entidade Pessoa (membros) ──────────────────────
-- Adiciona FK opcional: uma pessoa PODE ter acesso, mas não é obrigatório.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pessoa_id UUID REFERENCES membros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_pessoa_id ON profiles(pessoa_id);


-- ── 2. Vincular automaticamente registros existentes ──────────────────────────
-- Tenta casar profiles existentes com membros pelo número de telefone.
-- Só vincula se houver exatamente 1 match para evitar ambiguidade.

UPDATE profiles p
SET pessoa_id = m.id
FROM membros m
WHERE p.pessoa_id IS NULL
  AND p.telefone IS NOT NULL
  AND m.telefone_celular = p.telefone
  AND m.tipo_pessoa IN ('membro', 'congregado')
  -- garante que o telefone seja único na tabela membros
  AND (
    SELECT count(*) FROM membros m2
    WHERE m2.telefone_celular = p.telefone
      AND m2.tipo_pessoa IN ('membro', 'congregado')
  ) = 1;


-- ── 3. Tabela de log de auditoria ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_evento  TEXT        NOT NULL,           -- 'acesso_criado', 'senha_resetada', 'login', etc.
  pessoa_id    UUID        REFERENCES membros(id)    ON DELETE SET NULL,
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  executado_por UUID       REFERENCES auth.users(id) ON DELETE SET NULL,  -- quem fez a ação
  detalhes     JSONB,                          -- dados extras (ex: { "role": "membro" })
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_pessoa_id  ON audit_logs(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- RLS: somente admin e secretaria podem ler logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'secretaria')
    )
  );


-- ── 4. Função RPC: registrar log de auditoria ──────────────────────────────────
-- Chamada pelo frontend sem precisar de service role key.

CREATE OR REPLACE FUNCTION registrar_audit_log(
  p_tipo_evento  TEXT,
  p_pessoa_id    UUID DEFAULT NULL,
  p_user_id      UUID DEFAULT NULL,
  p_detalhes     JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO audit_logs (tipo_evento, pessoa_id, user_id, executado_por, detalhes)
  VALUES (p_tipo_evento, p_pessoa_id, p_user_id, auth.uid(), p_detalhes);
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_audit_log TO authenticated;


-- ── 5. Verificação final ──────────────────────────────────────────────────────

SELECT 'profiles com pessoa_id vinculado' AS info,
       count(*) AS total
FROM profiles
WHERE pessoa_id IS NOT NULL;

SELECT 'profiles sem vínculo' AS info,
       count(*) AS total
FROM profiles
WHERE pessoa_id IS NULL;
