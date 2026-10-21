-- ─── Projeto com Reserva Financeira — recursos que já têm destino (21/10/2026) ───────────────────────────────────────────────────────────────────────
--
-- Pedido dela (21/10/2026): a Juventude e o Ministério de Famílias fazem almoços o ano inteiro (entradas na máquina Cielo da igreja) para, no fim do ano, pagar o retiro. O dinheiro
-- cai na conta da igreja e o painel mostra tudo como "Disponível" — mas parte dele já tem dono. A decisão aprovada: o PROJETO ganha uma marca "Projeto com Reserva Financeira"; os
-- projetos marcados acumulam (receitas realizadas − despesas realizadas, do mesmo projeto) e entram no card "Reservado" da Tesouraria (junto com o Fundo Missionário, que tem conta própria).
-- Saldo livre = saldo nas contas − reservado. Sem conta bancária separada, sem movimentação artificial, SEM mudar nada nos lançamentos: é só uma leitura.
--
-- O que esta migration faz (e só isso):
--   1. coluna `fin_projetos.reserva_financeira boolean NOT NULL DEFAULT false` — desmarcada por padrão (o 120 Anos e qualquer projeto existente continuam FORA da reserva);
--   2. cria os dois projetos pedidos, já com a reserva marcada: "Retiro Juventude 2027" e "Retiro Famílias 2027" — só se ainda não existirem (pelo nome), então rodar de novo não duplica.
-- Não mexe em `fin_lancamentos`, não marca lançamento nenhum e não toca em saldo. Quem classifica as receitas dos almoços com o projeto é a tesouraria (levantamento em
-- docs/RESERVA_LEVANTAMENTO_SEM_PROJETO.sql mostra quanto hoje ficaria fora da reserva).
-- Reverter: docs/RESERVA_FINANCEIRA_ROLLBACK.sql. Ensaio: docs/RESERVA_FINANCEIRA_ENSAIO.mjs.

ALTER TABLE public.fin_projetos
  ADD COLUMN IF NOT EXISTS reserva_financeira boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fin_projetos.reserva_financeira IS
  'Projeto com Reserva Financeira: as receitas realizadas dele, menos as despesas realizadas do mesmo projeto, ficam RESERVADAS (card "Reservado" da Tesouraria). Não bloqueia pagamento — o dinheiro está na mesma conta bancária.';

INSERT INTO public.fin_projetos (nome, descricao, status, reserva_financeira)
SELECT v.nome, v.descricao, 'ativo', true
  FROM (VALUES
    ('Retiro Juventude 2027', 'Almoços e demais arrecadações da Juventude durante o ano, reservados para o pagamento do retiro.'),
    ('Retiro Famílias 2027',  'Almoços e demais arrecadações do Ministério de Famílias durante o ano, reservados para o pagamento do retiro.')
  ) AS v(nome, descricao)
 WHERE NOT EXISTS (SELECT 1 FROM public.fin_projetos p WHERE p.nome = v.nome);
