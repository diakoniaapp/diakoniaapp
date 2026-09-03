-- ═══════════════════════════════════════════════════════════════════════════
-- O Bazar começa do zero
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O CRITÉRIO ─────────────────────────────────────────────────────────────
--
-- Em 20260902250000 saíram as reservas cujo nome começava por "test". Sobraram
-- sete com nome plausível — Aniversário da igreja, Aniversário 120 Anos, bazar
-- 120 anos, Obras, Oferta Família Machado, "Oferta para o ministério de
-- administração" e "Reveter para administração".
--
-- A igreja respondeu que **todas são testes**: o sistema ainda não entrou no
-- ar, e o que parecia registro é ensaio com nome bonito. Um nome plausível não
-- prova que o fato aconteceu.
--
-- ── O QUE SAI, E O QUE FICA ────────────────────────────────────────────────
--
-- Sai o MOVIMENTO: reservas, caixas, vendas, itens, movimentos de dinheiro,
-- operadores, checklists preenchidos, problemas de manutenção e movimentos de
-- estoque. É tudo o que registra algo que teria acontecido.
--
-- Fica a CONFIGURAÇÃO, que é trabalho de montagem e não de ensaio:
--
--   arr_espacos             Bazar e Cantina
--   arr_produtos            o catálogo (Almondegas, Camiseta JMM)
--   arr_checklist_template  os 12 itens de conferência de entrega
--   arr_acordo_template     o modelo de acordo de uso
--
-- É a mesma linha que separa `admin` de `tesouraria` desde ontem: quem monta
-- a casa deixa a casa montada; quem a usa começa com ela vazia.
--
-- ── DEPOIS DISTO ───────────────────────────────────────────────────────────
--
-- A bancada da Administração para de anunciar caixa aberto há 79 dias e
-- reserva vencida. O primeiro uso de verdade do Bazar será o primeiro
-- registro do módulo — e o ciclo já foi provado ponta a ponta em
-- 20260902250000: reservar, abrir caixa, vender, conferir, fechar, encerrar.

BEGIN;

-- A ordem é a das 40 chaves estrangeiras levantadas: de dentro para fora.
DELETE FROM public.arr_itens_venda;
DELETE FROM public.arr_vendas;
DELETE FROM public.arr_movimentos;
DELETE FROM public.arr_caixa_operadores;
DELETE FROM public.arr_caixas;

-- Manutenção pende da reserva E do item de checklist: sai antes dos dois.
DELETE FROM public.arr_problemas_manutencao;
DELETE FROM public.arr_reserva_checklist;

-- Estoque pende do produto, e o produto de ensaio pende da reserva. O
-- catálogo (produto sem reserva) fica.
DELETE FROM public.arr_estoque_movimentos;
DELETE FROM public.arr_produtos WHERE reserva_id IS NOT NULL;

DELETE FROM public.arr_reservas;

COMMIT;
