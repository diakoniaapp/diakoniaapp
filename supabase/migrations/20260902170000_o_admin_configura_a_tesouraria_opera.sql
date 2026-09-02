-- ═══════════════════════════════════════════════════════════════════════════
-- O admin configura, a tesouraria opera
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── A DEFINIÇÃO, DITADA PELA IGREJA EM 02/09/2026 ──────────────────────────
--
--   "imagine o seguinte: vendi esse sistema e o admin vai precisar
--    configurá-lo do zero. esse é o papel do admin"
--
-- A linha deixa de ser "quanto ele vê" e passa a ser **configurar ≠ operar**.
-- O admin monta a casa; os ministérios moram nela.
--
-- ── O QUE ELE MONTA ────────────────────────────────────────────────────────
--
-- Medido nesta igreja, e numa nova tudo isto começa vazio: identidade e
-- valores, congregações, unidades, prédios e locais, níveis organizacionais,
-- 11 ministérios e 20 áreas, cargos estatutários e institucionais, 8 classes
-- de EBD com faixa e gênero, grupos PGM, 34 categorias financeiras, 31
-- centros de custo, 5 contas bancárias, tipos de obrigação fiscal, espaços e
-- checklist do Bazar, estrutura de documentos, e o próprio catálogo de
-- permissões. **23 superfícies, ~250 linhas, antes de existir uma pessoa
-- cadastrada.**
--
-- Por isso todo `gerenciar_*` continua dele, e o poder de apagar também: quem
-- monta erra e desfaz. Um admin que não pode apagar o ministério que criou
-- errado não consegue configurar nada.
--
-- ── O QUE SAI ──────────────────────────────────────────────────────────────
--
-- Sete permissões que só existem depois que a casa está de pé:
--
--   lancar_financeiro          lançar entrada e saída
--   aprovar_pagamentos         aprovar o que sai
--   ver_folha                  a folha de pagamento
--   ver_fiscal                 acompanhar obrigações vencendo
--   ver_dashboard_executivo    o resultado consolidado
--   ver_painel_tesouraria      a bancada do dinheiro
--   operar_caixa               abrir caixa e vender no PDV
--
-- Ele **cria** o plano de contas; quem **lança** é quem cuida do dinheiro.
--
-- ── O QUE FICA COM O ADMIN, E POR QUÊ ──────────────────────────────────────
--
-- `ver_financeiro`, `gerenciar_financeiro`, `gerenciar_fiscal`,
-- `gerenciar_arrecadacao` e `ver_arrecadacao_admin` continuam dele.
--
-- As três primeiras porque são configuração pura — categorias, centros de
-- custo, contas, tipos de obrigação — e porque quem configura precisa VER o
-- que configurou para saber se funcionou.
--
-- `ver_arrecadacao_admin` é o único item onde duas regras da igreja se
-- cruzam: pela de 02/09 de manhã ("Ministério de Administração e Perfil
-- Administração apenas verão as arrecadações") ele fica; pela linha da tarde,
-- ver caixa seria acompanhar operação. Fica com ele, porque conferir o caixa
-- é conferência, não operação — e porque a regra da manhã é mais específica.
--
-- ── SOBRE A TESOURARIA ESTAR VAZIA ─────────────────────────────────────────
--
-- Ninguém recebe o papel aqui. Isso é deliberado: quem é a tesoureira desta
-- igreja é decisão da igreja, tomada na tela de acessos. O que esta migration
-- garante é que, no dia em que alguém receber, tudo já esteja no lugar.
--
-- ── E QUEM LANÇA DINHEIRO ENQUANTO ISSO? ───────────────────────────────────
--
-- Eu havia escrito aqui que seria a `secretaria`. **O ensaio me desmentiu:**
-- medido, `secretaria` NÃO tem `lancar_financeiro` — nunca teve. Era
-- exclusiva do `admin`.
--
-- Então, tirando do admin, o botão "Lançar" da barra inferior, o atalho da
-- paleta e a tarefa do dia sumiriam para a única pessoa que hoje lança.
--
-- O que salva é a ORDEM: 20260902160000 já deu à conta construtora o papel
-- `diakonia`, com o catálogo inteiro. Ela continua lançando — não como
-- administradora desta igreja, mas como dona do sistema, que é exatamente a
-- distinção que a igreja pediu.
--
-- Para as igrejas que vierem, a leitura é outra e é a certa: o admin que
-- recebe o sistema **não lança dinheiro**. A primeira coisa que ele faz
-- depois de montar o plano de contas é criar a conta da tesouraria.

BEGIN;

-- ── A tesouraria recebe a operação ─────────────────────────────────────────

INSERT INTO public.role_permissoes (role, permissao_codigo)
SELECT 'tesouraria'::app_role, c.codigo
  FROM (VALUES ('ver_financeiro'), ('lancar_financeiro'), ('aprovar_pagamentos'),
               ('ver_folha'), ('ver_fiscal'), ('ver_dashboard_executivo'),
               ('ver_painel_tesouraria'), ('ver_relatorios_executivos'),
               ('ver_arrecadacao'), ('ver_arrecadacao_admin'), ('operar_caixa'),
               ('ver_pessoas')) AS c(codigo)
 WHERE EXISTS (SELECT 1 FROM public.permissoes p WHERE p.codigo = c.codigo)
ON CONFLICT DO NOTHING;

-- ── E o admin larga o que é operação ───────────────────────────────────────

DELETE FROM public.role_permissoes
 WHERE role = 'admin'::app_role
   AND permissao_codigo IN ('lancar_financeiro', 'aprovar_pagamentos', 'ver_folha',
                            'ver_fiscal', 'ver_dashboard_executivo',
                            'ver_painel_tesouraria', 'operar_caixa');

COMMIT;
