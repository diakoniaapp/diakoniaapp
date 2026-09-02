-- ═══════════════════════════════════════════════════════════════════════════
-- As quatro permissões que nunca existiram
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- O módulo do Bazar e da Cantina (`arr_*`) é o ÚNICO do sistema em que a RLS
-- consulta permissão de verdade: 15 políticas chamam `tem_permissao()`. É o
-- desenho certo, e é por isso que ele foi apontado como o exemplo a seguir.
--
-- Só que os códigos que elas consultam **não estão cadastrados**:
--
--   ver_arrecadacao          citado por políticas · AUSENTE de `permissoes`
--   ver_arrecadacao_admin    citado por políticas · AUSENTE
--   gerenciar_arrecadacao    citado por políticas · AUSENTE
--   operar_caixa             citado por políticas · AUSENTE
--   ver_manutencao           citado por políticas · existe (admin, diakonia)
--
-- `tem_permissao(p_codigo)` é um EXISTS sobre `user_roles ⋈ role_permissoes`.
-- Código que não está lá devolve **false para todo mundo, sempre**.
--
-- ── O QUE ISSO CAUSOU, MEDIDO EM 02/09/2026 ────────────────────────────────
--
--                              Telma   Lourdes   Lúcio   Caio (lidera a
--                              admin   secret.   pastor  Administração)
--   arr_caixas    (11 linhas)      0        0        0        0
--   arr_vendas     (7 linhas)      0        0        0        0
--   arr_reservas  (17 linhas)     17        0        0        0
--   arr_problemas  (5 linhas)      5        0        5        0
--
-- Onze caixas e sete vendas são invisíveis para **todas as contas do
-- sistema**. Não é "a liderança não vê": ninguém vê.
--
-- As 17 reservas aparecem para a Telma por um motivo que não é permissão: a
-- política tem um `OR solicitada_por = auth.uid()`, e foi ela quem criou
-- todas as 17. Trocada a conta, some.
--
-- ── O QUE ESTA MIGRATION FAZ, E O QUE DEIXA PARA A IGREJA ──────────────────
--
-- Faz o que é defeito, não escolha: **cadastra os quatro códigos**. Uma
-- política que pergunta por um código inexistente é uma porta murada, e isso
-- não depende de decisão nenhuma.
--
-- E concede às duas funções que já cuidam de dinheiro nesta igreja — `admin`
-- e `secretaria`. É o mesmo critério do resto do sistema: o menu de
-- `/financas` e `/arrecadacao` já é delas.
--
-- **NÃO decide quem opera o caixa do Bazar.** Se a igreja quiser que quem
-- lidera o Ministério de Administração abra caixa e venda — o que faz todo
-- sentido, é a bancada dele —, isso é uma concessão a mais, e é uma decisão
-- de quem responde pelo dinheiro. Fica registrada aqui como pergunta em
-- aberto, e não resolvida por mim no meio de um conserto.

BEGIN;

-- ── Os códigos ─────────────────────────────────────────────────────────────

-- `permissoes` tem três colunas e nenhuma se chama `nome`: codigo, modulo e
-- descricao, as três obrigatórias. É a descrição que a tela de perfis mostra.

INSERT INTO public.permissoes (codigo, modulo, descricao)
VALUES
  ('ver_arrecadacao',       'arrecadacao',
   'Abrir o Bazar e a Cantina e ver espaços, produtos e reservas'),
  ('ver_arrecadacao_admin', 'arrecadacao',
   'Ver o caixa, as vendas e a conciliação do Bazar e da Cantina'),
  ('gerenciar_arrecadacao', 'arrecadacao',
   'Cadastrar espaços e produtos, definir taxas e aprovar reservas'),
  ('operar_caixa',          'arrecadacao',
   'Abrir e fechar caixa, e registrar vendas no PDV')
ON CONFLICT (codigo) DO NOTHING;

-- ── As concessões ──────────────────────────────────────────────────────────
--
-- Só admin e secretaria, que é quem já cuida de dinheiro. O `ON CONFLICT`
-- existe porque `role_permissoes` tem chave em (role, permissao_codigo) e a
-- migration precisa poder rodar duas vezes sem estragar nada.

INSERT INTO public.role_permissoes (role, permissao_codigo)
SELECT r.role, c.codigo
  FROM (VALUES ('admin'::app_role), ('secretaria'::app_role)) AS r(role)
 CROSS JOIN (VALUES ('ver_arrecadacao'), ('ver_arrecadacao_admin'),
                    ('gerenciar_arrecadacao'), ('operar_caixa')) AS c(codigo)
ON CONFLICT DO NOTHING;

COMMIT;
