-- ============================================================
-- DiakoniaApp — Limpeza da tabela profiles
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. DIAGNÓSTICO: ver o que está inconsistente ANTES de alterar ─────────────
SELECT
  id,
  nome,
  telefone,
  role,
  CASE
    WHEN nome IS NULL              THEN 'nome nulo'
    WHEN trim(nome) = ''          THEN 'nome vazio'
    WHEN nome ~ '^\d+$'          THEN 'nome é só números (telefone?)'
    WHEN nome LIKE '%@%'          THEN 'nome contém @ (email?)'
    ELSE 'ok'
  END AS situacao_nome
FROM profiles
WHERE
  nome IS NULL
  OR trim(nome) = ''
  OR nome ~ '^\d+$'
  OR nome LIKE '%@%'
ORDER BY situacao_nome, nome;


-- ── 2. CORRIGIR: nome nulo ou vazio ──────────────────────────────────────────
UPDATE profiles
SET nome = 'Sem nome'
WHERE nome IS NULL
   OR trim(nome) = '';


-- ── 3. CORRIGIR: nome preenchido apenas com números (telefone no campo nome) ──
-- Regex ^\d+$ → string composta somente de dígitos 0-9
UPDATE profiles
SET nome = 'Sem nome'
WHERE nome ~ '^\d+$';


-- ── 4. CORRIGIR: nome contém @ (email cadastrado no campo nome) ──────────────
UPDATE profiles
SET nome = 'Sem nome'
WHERE nome LIKE '%@%';


-- ── 5. VERIFICAÇÃO FINAL: deve retornar 0 linhas se tudo foi corrigido ────────
SELECT count(*) AS registros_ainda_inconsistentes
FROM profiles
WHERE
  nome IS NULL
  OR trim(nome) = ''
  OR nome ~ '^\d+$'
  OR nome LIKE '%@%';


-- ── 6. RECUPERAR TELEFONE dos registros que estão sem telefone ───────────────
-- Funciona para usuários criados com email padrão {telefone}@app.diakonia
-- Execute APÓS os UPDATEs acima.

UPDATE profiles p
SET telefone = split_part(u.email, '@', 1)
FROM auth.users u
WHERE p.id = u.id
  AND p.telefone IS NULL
  AND u.email LIKE '%@app.diakonia'
  AND length(split_part(u.email, '@', 1)) >= 10
  AND split_part(u.email, '@', 1) ~ '^\d+$';


-- ── 7. VERIFICAR telefones recuperados ────────────────────────────────────────
SELECT id, nome, telefone
FROM profiles
WHERE telefone IS NOT NULL
ORDER BY nome;


-- ── NOTAS ─────────────────────────────────────────────────────────────────────
-- • Os registros com nome = 'Sem nome' aparecem na tela com ícone de aviso ⚠
-- • Para corrigir o nome real de um usuário, execute:
--   UPDATE profiles SET nome = 'Nome Correto' WHERE id = 'uuid-aqui';
-- • O passo 6 recupera o telefone automaticamente do email @app.diakonia.
-- • Este script pode ser executado múltiplas vezes com segurança (idempotente).
