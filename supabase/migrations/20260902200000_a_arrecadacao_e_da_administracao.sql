-- ═══════════════════════════════════════════════════════════════════════════
-- A arrecadação é da Administração, não da tesouraria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── ONDE DUAS REGRAS DA IGREJA SE CRUZARAM ─────────────────────────────────
--
-- Na manhã de 02/09/2026:
--   "Ministério de Administração e Perfil Administração APENAS verão as
--    arrecadações"
--
-- À tarde do mesmo dia:
--   "vendi esse sistema e o admin vai precisar configurá-lo do zero. esse é
--    o papel do admin"  → configurar ≠ operar
--
-- Seguindo a segunda, eu dei `ver_arrecadacao`, `ver_arrecadacao_admin` e
-- `operar_caixa` à `tesouraria` em 20260902170000, junto com o resto da
-- operação financeira. O ensaio mostrou o resultado: **uma conta de
-- tesouraria enxergava os 11 caixas do Bazar** — o que a regra da manhã
-- proíbe em palavras diretas.
--
-- ── COMO AS DUAS SE ENCAIXAM ───────────────────────────────────────────────
--
-- Regra específica manda em regra geral. "Arrecadação é da Administração" é
-- específica; "admin não opera" é geral. E as duas se encaixam sem sobra
-- quando se lê o que a igreja já decidiu sobre o Bazar:
--
--   o MINISTÉRIO de Administração opera o Bazar   — é a bancada dele, e
--       20260902140000 já lhe deu leitura de caixa e vendas pelo cadastro
--   o PERFIL Administração vê e mantém o caixa    — conferência, e por
--       enquanto operação, porque não há mais ninguém
--   a TESOURARIA cuida do dinheiro da igreja      — e não do Bazar
--
-- Dinheiro de dízimo e dinheiro de bazar são caixas diferentes, cuidados por
-- gente diferente. A separação que sai daqui é mais fiel à igreja do que a
-- minha simetria de ontem.
--
-- ── O QUE FICA EM ABERTO, E É PERGUNTA PARA A IGREJA ───────────────────────
--
-- `operar_caixa` volta para o `admin` porque, sem ele, **ninguém no sistema
-- consegue abrir um caixa** — a tesouraria não deve, e o líder do ministério
-- só recebeu leitura, que foi a palavra usada ("deve enxergar caixa e
-- vendas").
--
-- É a única coisa que o admin faz aqui que é operação e não configuração, e
-- fica registrada como tal. O lugar natural dela é o Ministério de
-- Administração, no dia em que a igreja disser que ele opera, e não só vê.

BEGIN;

-- A tesouraria larga o Bazar — o dinheiro dela é outro.
DELETE FROM public.role_permissoes
 WHERE role = 'tesouraria'::app_role
   AND permissao_codigo IN ('ver_arrecadacao', 'ver_arrecadacao_admin', 'operar_caixa');

-- E o admin recupera a chave do caixa, na falta de outra mão.
INSERT INTO public.role_permissoes (role, permissao_codigo)
VALUES ('admin'::app_role, 'operar_caixa')
ON CONFLICT DO NOTHING;

COMMIT;
