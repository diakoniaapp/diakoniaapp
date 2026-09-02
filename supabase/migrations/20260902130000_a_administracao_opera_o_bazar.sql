-- ═══════════════════════════════════════════════════════════════════════════
-- A Administração opera o Bazar
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Segunda bancada, pelo mesmo mecanismo da primeira: uma linha em
-- `ministerios.modulo` (20260902100000), e a tela desenha o resto.
--
-- O Ministério de Administração tem quatro áreas — Apoio Adm, Bazar, Cantina
-- e Ornamentação. Duas delas vivem no módulo `arr_*`, que já tem PDV, caixa,
-- produtos, espaços, reservas e checklist de entrega.
--
-- ── O QUE A BANCADA MOSTRA, MEDIDO EM 02/09/2026 ───────────────────────────
--
--   4 caixas sem fechamento, abertos há 67 a 79 dias
--   9 reservas em aberto, TODAS com o período já vencido
--   2 pendências de manutenção na Cantina
--
-- Nada sobre estoque: os dois produtos têm mínimo 5 e `estoque_atual` nulo,
-- com zero movimentos. Alertar aí seria confundir ausência de dado com
-- problema — o defeito recorrente desta casa.
--
-- ── O QUE CONTINUA EM ABERTO ───────────────────────────────────────────────
--
-- Quem lidera este ministério (hoje o Caio Marcelo) ainda NÃO enxerga caixa
-- nem vendas: as 15 políticas do módulo perguntam por permissão, e
-- 20260902120000 concedeu as quatro só a `admin` e `secretaria`. A igreja
-- decidiu ver a bancada pronta antes de decidir isso.

BEGIN;

UPDATE public.ministerios
   SET modulo = 'arrecadacao'
 WHERE ativo AND nome = 'Administração';

COMMIT;
