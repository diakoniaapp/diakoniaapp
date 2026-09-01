-- ═══════════════════════════════════════════════════════════════════════════
-- O Painel Pastoral passa a ser do pastor titular
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O PEDIDO ───────────────────────────────────────────────────────────────
--
-- "O acesso deve ser para quem tem o perfil de PASTOR TITULAR", com a
-- separação dita em seguida: "ADMINISTRAÇÃO dono do sistema".
--
-- O código já foi estreitado: `ROLES_PAINEL_PASTORAL` passou de
-- `[admin, pastor, diakonia, lideranca]` para `[diakonia, admin]`, e o desvio
-- do login deixou de mandar `pastor` para lá.
--
-- ── POR QUE O BANCO PRECISA ACOMPANHAR ─────────────────────────────────────
--
-- São dois portões diferentes, e eles governam coisas diferentes:
--
--   ROLES_PAINEL_PASTORAL (código)  menu, guarda de rota, paleta Ctrl+K
--   ver_painel_pastoral   (banco)   o cartão da Home e as ações rápidas
--
-- Com o código estreitado e o banco não, um usuário `pastor` vê o cartão
-- "Painel Pastoral" na Home e, ao clicar, é devolvido para `/`. Conferido na
-- tela com o "Ver como pastor": barra lateral sem o item (certo), cartão
-- presente (errado), clique voltando para a Home.
--
-- Um cartão que não leva a lugar nenhum é pior que a ausência dele: quem
-- clica conclui que o sistema está quebrado, e está.
--
-- ── O QUE ISTO CUSTA HOJE ──────────────────────────────────────────────────
--
-- Nada. Medido em 01/09/2026: **nenhuma conta tem o papel `pastor`**. As três
-- do sistema são admin, secretaria e lideranca. Esta linha é uma concessão a
-- um papel que ninguém exerce.
--
-- ── POR QUE `pastor` NÃO É O PASTOR TITULAR ────────────────────────────────
--
-- É o engano fácil, e o CLAUDE.md o registra com medição: `diakonia` está no
-- enum desde a primeira migration e tem 62 combinações tabela+operação;
-- `pastor` veio depois e tem 34. `pastor` sozinho não enxerga famílias,
-- vínculos familiares, visitas nem histórico de membresia — metade do que o
-- Painel Pastoral mostra.
--
-- Ou seja: mesmo antes deste DELETE, ele abria a tela e via buracos.
--
-- ── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
--
-- `ver_painel_admin` continua com os três (admin, diakonia, pastor). Ela
-- governa outra coisa — insights do sistema — e não foi o que se pediu.

BEGIN;

DELETE FROM public.role_permissoes
 WHERE permissao_codigo = 'ver_painel_pastoral'
   AND role = 'pastor';

COMMIT;
