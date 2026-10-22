-- ─── As quatro views financeiras voltam a rodar com os direitos de QUEM CONSULTA (security_invoker) — 22/10/2026 ───────────────────────────────────────────────────────────────────────
--
-- O Advisor de segurança do Supabase marcou 4 alertas CRÍTICOS "Security Definer View": vw_fin_resumo_mes, vw_fin_centros_resumo, vw_fin_orcamento_vs_real e vw_fin_proximos_vencimentos.
-- Uma view "security definer" lê as tabelas com os direitos de quem a CRIOU (o dono, que ignora a RLS) — então qualquer usuário autenticado leria totais e vencimentos do financeiro inteiro,
-- mesmo sem papel de tesouraria.
--
-- Não era assim: a migration 20260805130000 já tinha ligado `security_invoker = true` nas quatro. A opção se perdeu depois, quando cada uma foi REDEFINIDA com `CREATE OR REPLACE VIEW` sem repetir
-- `WITH (security_invoker = true)` (20260912215000 e 20260913120000 para o resumo do mês; 20260917010000 e 20261015140000 para centros; 20260917000000 e 20261015140000 para orçamento; 20260923110000
-- e 20261006120000 para vencimentos). `CREATE OR REPLACE VIEW` sem a opção a zera — é a mesma armadilha que o CLAUDE.md §6.3 registra para as colunas da view.
--
-- O que muda: nada para quem trabalha com o financeiro. As telas que leem estas views (Painel e Mesa da Tesouraria, Contas, Centros de custo, Orçamento) são só de admin/diakonia/secretaria/tesouraria,
-- e a RLS das tabelas de base já deixa esses papéis lerem — enxergam exatamente os mesmos números. Quem não tem papel financeiro passa a receber vazio (o que a RLS já queria).
-- Não altera nenhuma definição, coluna, dado ou permissão de tabela: só a opção da view.
-- Regra daqui em diante: toda `CREATE OR REPLACE VIEW` de view `vw_*` repete `WITH (security_invoker = true)` — há um teste que varre as migrations (viewsSecurityInvoker.test.ts).
-- Reverter: docs/VIEWS_SECURITY_INVOKER_ROLLBACK.sql (devolve ao estado em que o Advisor alertava — só se for preciso). Ensaio: docs/VIEWS_SECURITY_INVOKER_ENSAIO.mjs.

ALTER VIEW public.vw_fin_resumo_mes SET (security_invoker = true);
ALTER VIEW public.vw_fin_centros_resumo SET (security_invoker = true);
ALTER VIEW public.vw_fin_orcamento_vs_real SET (security_invoker = true);
ALTER VIEW public.vw_fin_proximos_vencimentos SET (security_invoker = true);
