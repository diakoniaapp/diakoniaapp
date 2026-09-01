-- ═══════════════════════════════════════════════════════════════════════════
-- Pedir recuperação de senha sem estar logado
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE A MEDIÇÃO MOSTROU ────────────────────────────────────────────────
--
-- `Auth.tsx`, em `onRecuperar`, faz isto antes de registrar o pedido:
--
--   supabase.from("membros").select("id, nome_completo")
--           .eq("telefone_celular", digits).maybeSingle()
--
-- Só que quem está nessa tela ESQUECEU A SENHA — ou seja, não está logada.
-- E medido contra o banco, com a identidade `anon`:
--
--   anon lê membros → BARRADO: permission denied for table membros
--
-- Então `membro` é sempre null, e todo pedido entra na fila com `nome` e
-- `pessoa_id` vazios. A admin abre `/admin/recuperacao-senha` e vê só um
-- email sintético — `5521983991229@app.diakonia` —, sem saber de quem é.
--
-- Há um comentário no código dizendo que isso já foi consertado ("consultando
-- o nome errado, a query falhava"). O nome da coluna realmente estava errado
-- e foi corrigido, mas não era essa a causa: mesmo com a coluna certa, a
-- pessoa deslogada não alcança `membros`. O conserto foi real e insuficiente.
--
-- ── O CONSERTO ────────────────────────────────────────────────────────────
--
-- Quem procura o nome passa a ser o BANCO, não o navegador. `pedir_
-- recuperacao_senha` é SECURITY DEFINER: ela lê `membros` com os poderes de
-- quem a criou, monta a linha completa e insere. O navegador deslogado nunca
-- toca em `membros`.
--
-- Três cuidados que vêm de graça por estar do lado de cá:
--
--   1. Ela NÃO RETORNA NADA. Se devolvesse "achei" ou "não achei", viraria um
--      oráculo de telefones: qualquer pessoa, sem login, descobriria quem é
--      da igreja testando números. Retornando `void`, o pedido de um telefone
--      cadastrado e o de um telefone inventado são indistinguíveis de fora.
--
--   2. Um pedido pendente por email a cada hora. A tabela aceita INSERT sem
--      login — é o que faz a tela funcionar —, e sem essa trava dá para
--      encher a fila da admin com milhares de linhas. Repetir dentro da hora
--      simplesmente não cria linha nova, e de fora isso também é silencioso.
--
--   3. `status` nasce 'pendente' e sem assinatura, o que já é o WITH CHECK da
--      política de INSERT (migration 20260901220000).
--
-- ── UMA DUPLICAÇÃO QUE FICA REGISTRADA ─────────────────────────────────────
--
-- A regra do telefone canônico (tira o que não é dígito; 10 ou 11 dígitos
-- ganham '55' na frente; valida `^55[0-9]{10,11}$`) está escrita em três
-- lugares: `lib/telefone.ts`, dentro de `salvar_meus_dados` e agora aqui.
--
-- Esta migration cria `telefone_canonico()` e passa a usá-la, mas NÃO mexe em
-- `salvar_meus_dados` — reescrever uma função de 12 argumentos para
-- economizar cinco linhas é trocar um risco pequeno por um grande. Fica
-- anotado: quando `salvar_meus_dados` precisar de outra alteração, ela deve
-- passar a chamar `telefone_canonico()` também.

BEGIN;

-- ── A regra do telefone, num lugar só ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.telefone_canonico(p_telefone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tel text;
BEGIN
  v_tel := nullif(regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g'), '');
  IF v_tel IS NULL THEN
    RETURN NULL;
  END IF;
  IF length(v_tel) IN (10, 11) THEN
    v_tel := '55' || v_tel;
  END IF;
  IF v_tel !~ '^55[0-9]{10,11}$' THEN
    RETURN NULL;
  END IF;
  RETURN v_tel;
END;
$$;

COMMENT ON FUNCTION public.telefone_canonico(text) IS
  'Telefone no formato do banco: 55 + DDD + numero. NULL se nao der para normalizar.';

-- ── O pedido de recuperação ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pedir_recuperacao_senha(p_telefone text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel    text;
  v_email  text;
  v_nome   text;
  v_pessoa uuid;
  v_ja     boolean;
BEGIN
  v_tel := public.telefone_canonico(p_telefone);

  -- Telefone que nem chega a ser telefone: sai calada, como em todo o resto
  -- desta função. Quem está de fora não distingue este caso dos outros.
  IF v_tel IS NULL THEN
    RETURN;
  END IF;

  v_email := v_tel || '@app.diakonia';

  -- Já existe pedido pendente recente para este email? Então não faz nada.
  SELECT EXISTS (
    SELECT 1 FROM public.recuperacao_senha
     WHERE email = v_email
       AND status = 'pendente'
       AND solicitado_em > now() - interval '1 hour'
  ) INTO v_ja;

  IF v_ja THEN
    RETURN;
  END IF;

  -- Aqui está o ponto da função: esta leitura é impossível para quem não
  -- está logado, e é justamente quem não está logado que precisa dela.
  SELECT m.id, m.nome_completo
    INTO v_pessoa, v_nome
    FROM public.membros m
   WHERE m.telefone_celular = v_tel
   LIMIT 1;

  INSERT INTO public.recuperacao_senha (email, nome, pessoa_id, status, origem)
  VALUES (v_email, v_nome, v_pessoa, 'pendente', 'app');
END;
$$;

COMMENT ON FUNCTION public.pedir_recuperacao_senha(text) IS
  'Registra pedido de recuperacao de senha com o nome da pessoa resolvido no banco. Nao retorna nada de proposito: nao serve como oraculo de telefones cadastrados.';

REVOKE ALL ON FUNCTION public.pedir_recuperacao_senha(text) FROM public;
GRANT EXECUTE ON FUNCTION public.pedir_recuperacao_senha(text) TO anon, authenticated;

COMMIT;
