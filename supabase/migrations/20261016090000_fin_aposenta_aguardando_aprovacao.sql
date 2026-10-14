-- Aposenta o estado "aguardando_aprovacao" de fin_lancamentos (decisão da Tesouraria, 14/10/2026).
--
-- O defeito/motivo: o estado existia desde a v1 da aprovação de despesas (12/09/2026), mas ninguém o criava
-- (só a escolha manual da Situação no formulário) e "aprovar" significava "pagar" (baixava o saldo sem conta,
-- forma nem comprovante). Medido em produção em 14/10/2026: 0 lançamentos nesse estado, em 13.939. A aprovação
-- que importa (reembolso) mora na Quitação, com alçada, "outra pessoa aprova" e decisão registrada.
--
-- O que esta migration faz: impede que o estado volte a ser gravado, por engano, por qualquer caminho
-- (tela antiga em cache, script, importação). O valor do enum NÃO é removido (o Postgres não remove valor de
-- enum) e as telas continuam sabendo mostrá-lo; apenas deixa de ser possível gravá-lo.
--
-- Alternativa descartada: ALTER TYPE ... DROP VALUE (não existe) ou recriar o enum (reescreve a coluna de uma
-- tabela de 13 mil linhas com 15 gatilhos, para ganhar nada).
--
-- Trava de segurança: se, entre o ensaio e a aplicação, alguém criar um lançamento nesse estado, a migration
-- PARA com mensagem em português em vez de falhar no meio da validação da restrição.
-- Rollback: docs/APOSENTA_APROVACAO_ROLLBACK.sql.

DO $trava$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE status::text = 'aguardando_aprovacao') THEN
    RAISE EXCEPTION 'Há lançamentos "Aguardando aprovação": decida cada um (pague ou cancele) antes de aposentar o estado.';
  END IF;
END
$trava$;

ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS fin_lancamentos_sem_aprovacao_legada;
ALTER TABLE public.fin_lancamentos
  ADD CONSTRAINT fin_lancamentos_sem_aprovacao_legada CHECK (status::text <> 'aguardando_aprovacao');

COMMENT ON CONSTRAINT fin_lancamentos_sem_aprovacao_legada ON public.fin_lancamentos IS
  'O estado aguardando_aprovacao foi aposentado em 14/10/2026 (ninguém o criava e aprovar era pagar). Aprovação de reembolso: fin_decidir_quitacao.';
