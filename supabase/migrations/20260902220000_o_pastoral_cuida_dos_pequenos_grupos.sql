-- ═══════════════════════════════════════════════════════════════════════════
-- O Pastoral cuida dos Pequenos Grupos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Terceira e última bancada dos módulos que já existiam no sistema, pelo
-- mesmo mecanismo das duas primeiras: uma linha em `ministerios.modulo`
-- (20260902100000), e a tela desenha o resto.
--
-- O Ministério Pastoral tem uma única área, e o nome dela diz o trabalho:
-- **Pequenos Grupos Multiplicadores**.
--
-- ── O QUE A BANCADA MOSTRA, MEDIDO EM 02/09/2026 ───────────────────────────
--
--   4 grupos — 3 ativos, 1 inativo
--   TODOS os quatro em Praça da Bandeira
--   6 pessoas em grupo, de 297 membros da igreja
--   3 dos 4 nunca registraram reunião, e o único registro é do inativo
--   PGO Mães Unidas em Oração: 0 membros
--
-- ── A PERGUNTA QUE SÓ ESTE MÓDULO FAZ ──────────────────────────────────────
--
-- A Escola Bíblica olha para quem já está nela; o Bazar, para o que já foi
-- reservado. Um ministério de grupos MULTIPLICADORES existe para multiplicar,
-- e por isso esta bancada mede também o que ainda não existe:
--
--   Maracanã       40 membros da igreja, nenhum grupo
--   Tijuca         18
--   Rio Comprido   10
--   Santo Cristo    5
--
-- Isso também explica um limite do convite que a Home faz desde ontem —
-- "um Pequeno Grupo perto da sua casa". Ele só encontra grupo para quem mora
-- em Praça da Bandeira; para os outros 28 bairros, cai no recuo de "todos os
-- grupos ativos", que é melhor que nada e ainda assim é atravessar a cidade.
--
-- A bancada diz junto quantas fichas não têm bairro preenchido, porque sem
-- isso a lista de bairros afirmaria mais do que sabe.

BEGIN;

UPDATE public.ministerios
   SET modulo = 'pgm'
 WHERE ativo AND nome = 'Pastoral';

COMMIT;
