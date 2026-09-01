-- ═══════════════════════════════════════════════════════════════════════════
-- A fila de recuperação de senha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ESTA TABELA É, E O QUE ELA NÃO É ─────────────────────────────────
--
-- Lida a estrutura antes de mexer: `recuperacao_senha` tem email, nome,
-- pessoa_id, status, solicitado_em, resolvido_em, resolvido_por, origem e
-- observacao. **Não tem token, não tem hash, não tem senha.** Não é o
-- mecanismo de recuperação do Supabase — é uma FILA DE PEDIDOS que alguém
-- resolve à mão em `/admin/recuperacao-senha`.
--
-- Isso muda o tamanho do problema: ninguém rouba credencial por aqui. Mas
-- sobram três buracos reais.
--
-- ── OS TRÊS BURACOS ────────────────────────────────────────────────────────
--
-- 1. `update_autenticado` — `USING (auth.role() = 'authenticated')`, sem
--    WITH CHECK. Qualquer pessoa logada pode marcar o pedido dos OUTROS como
--    resolvido. O pedido some da aba "pendentes" e a admin nunca vê. A pessoa
--    que esqueceu a senha fica esperando um telefonema que não vem.
--
--    E pior: pode TROCAR O EMAIL de um pedido pendente. Quem resolve a fila
--    manda a senha nova para o endereço que está na linha. Trocar esse
--    endereço é redirecionar a senha de outra pessoa. É o único caminho de
--    escalada que achei nesta varredura, e ele não precisa de nada além de um
--    login comum.
--
-- 2. `read_autenticado` — qualquer pessoa logada lê a fila inteira: quem
--    esqueceu a senha, o email e o nome. É pouco, mas não é de ninguém.
--
-- 3. `insert_sem_auth` — `WITH CHECK (true)`. O INSERT sem login é
--    necessário (a pessoa esqueceu a senha, ela não está logada), mas `true`
--    aceita a linha inteira do jeito que vier: dá para inserir um pedido já
--    nascido `resolvido`, ou assinado como `resolvido_por` outra pessoa.
--
-- ── O CRITÉRIO ─────────────────────────────────────────────────────────────
--
-- O mesmo de sempre: quem a TELA já autoriza. `RecuperacaoSenhaAdmin.tsx`
-- faz `hasRole(["admin", "secretaria"])` e `navigate("/")` para o resto, e
-- `navConfig.ts` guarda `/admin` com `ROLES_ADMIN`, que é exatamente
-- ["admin", "secretaria"]. Então ler e resolver é de admin e secretaria.
--
-- O INSERT continua aberto e sem login — é o que faz a tela de recuperação
-- funcionar —, mas agora só aceita nascer PENDENTE e sem assinatura.
--
-- Medido antes de aplicar: a fila está com 0 linhas. Não há pedido em aberto
-- para se perder nesta troca.

BEGIN;

-- ── Ler: quem resolve a fila ───────────────────────────────────────────────

DROP POLICY IF EXISTS "read_autenticado" ON public.recuperacao_senha;

CREATE POLICY "recuperacao_senha_le_quem_resolve" ON public.recuperacao_senha
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- ── Resolver: idem, e sem poder reabrir para si ────────────────────────────

DROP POLICY IF EXISTS "update_autenticado" ON public.recuperacao_senha;

CREATE POLICY "recuperacao_senha_resolve_quem_pode" ON public.recuperacao_senha
  FOR UPDATE TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

-- ── Pedir: sem login, mas nascendo pendente ────────────────────────────────
--
-- `TO public` de propósito: a pessoa que esqueceu a senha não está logada, e
-- é justamente ela quem precisa inserir. O que muda é o WITH CHECK.

DROP POLICY IF EXISTS "insert_sem_auth" ON public.recuperacao_senha;

CREATE POLICY "recuperacao_senha_qualquer_um_pede" ON public.recuperacao_senha
  FOR INSERT TO public
  WITH CHECK (
    status = 'pendente'
    AND resolvido_em IS NULL
    AND resolvido_por IS NULL
  );

COMMIT;
