-- ═══════════════════════════════════════════════════════════════════════════
-- Limpeza: o que foi teste sai
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O CRITÉRIO, DADO PELA IGREJA EM 02/09/2026 ─────────────────────────────
--
--   "considero todos como teste pois nao estamos em produção ainda"
--
-- O sistema ainda não entrou no ar para a QIBRJ. O que se quer entregar é uma
-- base limpa, e não um histórico preservado de ensaios.
--
-- ── ANTES DE APAGAR, PROVAR QUE O CAMINHO FUNCIONA ─────────────────────────
--
-- O dado de teste do Bazar era a única evidência de que o módulo funciona.
-- Apagá-lo sem antes exercitar o ciclo trocaria uma prova por um vazio.
--
-- Exercitado com a identidade real da administradora, em transação desfeita:
--
--   reservar o espaço          OK
--   cadastrar produto          OK
--   abrir o caixa              OK
--   registrar a venda          OK
--   lançar o item da venda     OK
--   itens somam o total        R$ 10,00 = R$ 10,00  ✓
--   fechar o caixa             OK
--   encerrar a reserva         OK
--
-- ── E QUEM PODE O QUÊ, TESTADO E NÃO LIDO ──────────────────────────────────
--
--                          ler    incluir/editar   excluir
--   Telma (admin)          tudo        sim         a FK protege
--   Lourdes (secretaria)   nada        não         não
--   Caio (lidera Adm.)     tudo        não         não
--
-- Dois "não pode" do primeiro levantamento eram falso negativo do MEU teste:
-- incluir produto falhava por `categoria` NOT NULL que eu não preenchi, e
-- excluir falhava por chave estrangeira de `arr_itens_venda`. Produto que foi
-- vendido não se apaga — e é assim que tem de ser.
--
-- ── A ORDEM É A DAS CHAVES ESTRANGEIRAS ────────────────────────────────────
--
-- Levantadas as 40 chaves do módulo antes de escrever: itens → vendas →
-- movimentos → caixas, e produtos, checklist e problemas antes das reservas.
-- Fora de ordem, ou falha, ou deixa órfão.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. As reservas de teste do Bazar, e tudo o que pende delas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 9 reservas, 7 caixas — três deles entre os quatro que estavam abertos desde
-- junho —, 4 vendas somando R$ 117,50 e 108 linhas de checklist.
--
-- Depois disto a bancada mostra o real: 1 caixa aberto e 5 reservas por
-- encerrar (Aniversário da igreja, Aniversário 120 Anos, bazar 120 anos,
-- Oferta Família Machado, Obras).

-- `test` e não `teste`: o ensaio mostrou uma reserva chamada "testab=ndo"
-- sobrevivendo ao padrão mais estreito. Nenhuma finalidade legítima desta
-- igreja começa com "test".
CREATE TEMP TABLE _reservas_teste ON COMMIT DROP AS
  SELECT id FROM public.arr_reservas WHERE finalidade ~* '^\s*test';

CREATE TEMP TABLE _caixas_teste ON COMMIT DROP AS
  SELECT id FROM public.arr_caixas WHERE reserva_id IN (SELECT id FROM _reservas_teste);

CREATE TEMP TABLE _vendas_teste ON COMMIT DROP AS
  SELECT id FROM public.arr_vendas WHERE caixa_id IN (SELECT id FROM _caixas_teste);

DELETE FROM public.arr_itens_venda      WHERE venda_id IN (SELECT id FROM _vendas_teste);
DELETE FROM public.arr_vendas           WHERE id       IN (SELECT id FROM _vendas_teste);
DELETE FROM public.arr_movimentos       WHERE caixa_id IN (SELECT id FROM _caixas_teste);
DELETE FROM public.arr_caixa_operadores WHERE caixa_id IN (SELECT id FROM _caixas_teste);
DELETE FROM public.arr_caixas           WHERE id       IN (SELECT id FROM _caixas_teste);

-- Problema de manutenção aponta para a reserva E para o item de checklist:
-- os dois caminhos, antes de qualquer um dos dois sumir.
DELETE FROM public.arr_problemas_manutencao
 WHERE reserva_id IN (SELECT id FROM _reservas_teste)
    OR reserva_checklist_id IN (
         SELECT id FROM public.arr_reserva_checklist
          WHERE reserva_id IN (SELECT id FROM _reservas_teste));

DELETE FROM public.arr_reserva_checklist WHERE reserva_id IN (SELECT id FROM _reservas_teste);

DELETE FROM public.arr_estoque_movimentos
 WHERE produto_id IN (SELECT id FROM public.arr_produtos
                       WHERE reserva_id IN (SELECT id FROM _reservas_teste));
DELETE FROM public.arr_produtos WHERE reserva_id IN (SELECT id FROM _reservas_teste);

DELETE FROM public.arr_reservas WHERE id IN (SELECT id FROM _reservas_teste);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. As campanhas de EBD duplicadas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três campanhas com o nome "Alvo da Classe | Campanha JMM 2026", criadas em
-- 11/06 20:15, 28/06 02:15 e 28/06 07:35 — as duas últimas com 3 e 1
-- lançamento, contra 57 da primeira. É o padrão de clique repetido.
--
-- Fica a de 11/06, que é onde a campanha realmente aconteceu, e some o resto.
-- "Farinha Enriquecida | Missões Mundiais 2026" não é duplicata e não é
-- tocada.

-- ── `ctid` NÃO É IDADE, E ISSO QUASE CUSTOU CARO ────────────────────
--
-- A primeira versão desta migration escolhia a sobrevivente por
-- `min(ctid)`. `ctid` é o ENDEREÇO FÍSICO da linha no arquivo, não a
-- ordem em que ela nasceu — e o ensaio mostrou o estrago: sobrava a
-- campanha de 3 lançamentos e sumia a de 57, levando junto R$ 5.600 dos
-- R$ 7.204 da EBD.
--
-- O critério certo não é nem idade: é ONDE A CAMPANHA ACONTECEU. Fica a
-- que tem mais lançamentos; entre empates, a mais antiga.
CREATE TEMP TABLE _campanhas_dup ON COMMIT DROP AS
  SELECT id FROM (
    SELECT c.id,
           row_number() OVER (
             PARTITION BY c.nome
             ORDER BY (SELECT count(*) FROM public.ebd_entradas e WHERE e.campanha_id = c.id) DESC,
                      c.created_at
           ) AS posicao
      FROM public.ebd_campanhas c
  ) x WHERE x.posicao > 1;

DELETE FROM public.ebd_entradas  WHERE campanha_id IN (SELECT id FROM _campanhas_dup);
DELETE FROM public.ebd_campanhas WHERE id          IN (SELECT id FROM _campanhas_dup);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Os modelos de ministério triplicados
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 30 linhas para 10 nomes. Nenhuma tabela os referencia, e nenhum dos dez
-- arquétipos genéricos casa com a estrutura real da QIBRJ. Fica um de cada.

-- Pela data de criação, e não por `ctid` — mesmo motivo do bloco acima.
-- Aqui as três cópias são idênticas e a escolha não muda nada, mas usar o
-- endereço físico como se fosse ordem é o hábito que quase apagou R$ 5.600.
DELETE FROM public.modelos_ministerio m
 WHERE m.id NOT IN (
   SELECT DISTINCT ON (x.nome) x.id FROM public.modelos_ministerio x
    ORDER BY x.nome, x.created_at
 );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. O modelo de permissões que ninguém lê
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 72 linhas, zero políticas de RLS, zero código, zero chaves estrangeiras.
-- A forma dela — pode_ver / pode_criar / pode_editar / pode_excluir — é
-- bonita e convida a mexer, sem que mexer mude coisa alguma. Foi documentada
-- como armadilha há duas semanas; sai agora, antes de alguém cair nela.

DROP TABLE IF EXISTS public.permissoes_modulo;

COMMIT;
