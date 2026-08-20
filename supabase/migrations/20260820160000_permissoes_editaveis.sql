-- ─── As permissões dos perfis passam a ser editáveis pela tela ──────────────
--
-- Pedido da Telma: uma tela de caixas de seleção em Usuários, porque "um cargo
-- de liderança não consegue editar uma pessoa no catálogo".
--
-- ── O QUE JÁ EXISTIA, E QUAL DOS DOIS MODELOS MANDA ────────────────────────
--
-- O banco tem DOIS sistemas de permissão, e só um está ligado:
--
--   VIVO   `permissoes` (39 códigos, 12 módulos) + `role_permissoes` (108
--          concessões). Alimenta `minhas_permissoes()`, que o React consome
--          em `usePermissoes`, e `tem_permissao()`, usada por 15 políticas.
--
--   MORTO  `permissoes_modulo` (72 linhas) + `fn_permissao`,
--          `fn_contexto_usuario`, `fn_minha_permissao`,
--          `fn_todas_minhas_permissoes`. Zero políticas e zero código chamam
--          qualquer uma delas.
--
-- A tela edita o VIVO. Uma tela sobre o modelo morto teria caixas que não
-- mudam nada — e é exatamente esse tipo de mentira silenciosa que este sistema
-- vem gastando semanas para tirar.
--
-- ── 1. NINGUÉM PODIA ESCREVER, NEM O ADMIN ────────────────────────────────
--
-- `role_permissoes` tem RLS ligada e só uma política, de SELECT. A tela não
-- teria como salvar. Entram INSERT e DELETE, restritos a admin: quem concede
-- permissão a um perfil está mexendo em quem pode o quê no sistema inteiro.
--
-- Não entra UPDATE: a linha é (role, permissao_codigo) e nada mais. Conceder é
-- inserir, revogar é apagar. Um UPDATE aqui só serviria para transformar uma
-- concessão em outra, que é conceder e revogar ao mesmo tempo — e apareceria
-- na auditoria como uma coisa só.

ALTER TABLE public.role_permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_concede_permissao ON public.role_permissoes;
CREATE POLICY admin_concede_permissao ON public.role_permissoes
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS admin_revoga_permissao ON public.role_permissoes;
CREATE POLICY admin_revoga_permissao ON public.role_permissoes
  FOR DELETE USING (is_admin());

-- ── 2. LIDERANÇA PASSA A EDITAR E CADASTRAR PESSOA ────────────────────────
--
-- O terceiro e último lugar que dizia não. Os outros dois já cairam hoje:
-- a política RLS de `membros` (migration 20260820140000) e o portão da tela
-- (`podeEditarPessoas`). Faltava a permissão em si.
--
-- `excluir_pessoa` NÃO entra — segue só de admin, igual à política de DELETE.
INSERT INTO public.role_permissoes (role, permissao_codigo)
VALUES ('lideranca'::app_role, 'editar_pessoa'),
       ('lideranca'::app_role, 'criar_pessoa')
ON CONFLICT DO NOTHING;

-- ── 3. O modelo morto para de contradizer o vivo ──────────────────────────
--
-- `permissoes_modulo` não é lida por ninguém, mas dizia `pode_editar = false`
-- para liderança em `pessoas`. Deixar duas tabelas discordando é preparar a
-- próxima hora perdida: quem abrir aquela vai acreditar nela.
UPDATE public.permissoes_modulo
   SET pode_editar = true, pode_criar = true
 WHERE modulo = 'pessoas' AND role = 'lideranca'::app_role;

COMMENT ON TABLE public.role_permissoes IS
  'Quem pode o que, por perfil. Modelo VIVO: alimenta minhas_permissoes() (React) e tem_permissao() (15 politicas). Editavel pela tela de Usuarios. Nao confundir com permissoes_modulo, que nao e lida por ninguem.';

COMMENT ON TABLE public.permissoes_modulo IS
  'MODELO PARALELO SEM USO. Nenhuma politica e nenhum codigo le esta tabela nem as funcoes fn_permissao / fn_contexto_usuario / fn_minha_permissao / fn_todas_minhas_permissoes. O modelo em vigor e role_permissoes. Mantida em sincronia so para nao contradizer.';
