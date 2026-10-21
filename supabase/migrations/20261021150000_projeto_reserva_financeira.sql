-- ─── Projeto com Reserva Financeira — recursos que já têm destino (21/10/2026) ───────────────────────────────────────────────────────────────────────
--
-- Pedido dela (21/10/2026): a Juventude e o Ministério de Famílias fazem almoços o ano inteiro (entradas na máquina Cielo da igreja) para pagar o retiro. O dinheiro cai na conta da
-- igreja e o painel mostrava tudo como "Disponível" — mas parte dele já tem dono. A decisão aprovada: o PROJETO ganha uma marca "Projeto com Reserva Financeira"; os projetos marcados
-- acumulam (receitas realizadas − despesas realizadas, do mesmo projeto) e entram no card "Reservado" da Tesouraria (junto com o Fundo Missionário, que tem conta própria).
-- Saldo livre = saldo nas contas − reservado. Sem conta bancária separada, sem movimentação artificial, SEM mudar nada nos lançamentos: é só uma leitura.
--
-- O que esta migration faz — e SÓ isto:
--   · coluna `fin_projetos.reserva_financeira boolean NOT NULL DEFAULT false` — desmarcada por padrão (o 120 Anos e qualquer projeto existente continuam FORA da reserva).
-- NÃO cria projeto nenhum (ela cria os próprios, no cadastro de Projetos, marcando a opção; decisão de 21/10/2026 — a versão anterior criava "Retiro Juventude 2027" e "Retiro Famílias 2027",
-- e ela prefere não ter projetos que não criou). Não mexe em `fin_lancamentos` e não toca em saldo.
-- Reverter: docs/RESERVA_FINANCEIRA_ROLLBACK.sql. Ensaio: docs/RESERVA_FINANCEIRA_ENSAIO.mjs.

ALTER TABLE public.fin_projetos
  ADD COLUMN IF NOT EXISTS reserva_financeira boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fin_projetos.reserva_financeira IS
  'Projeto com Reserva Financeira: as receitas realizadas dele, menos as despesas realizadas do mesmo projeto, ficam RESERVADAS (card "Reservado" da Tesouraria). Não bloqueia pagamento — o dinheiro está na mesma conta bancária.';
