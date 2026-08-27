-- ═══════════════════════════════════════════════════════════════════════════
-- Apaga `ebd_mover_aluno`: ela já existia com outro nome
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Criei `ebd_mover_aluno` na migration 20260828220000 para que trazer um aluno
-- de outra classe encerrasse a matrícula anterior em vez de duplicá-la.
--
-- `mover_aluno_classe(p_pessoa_id, p_classe_nova)` já fazia isso, e há tempo:
-- desativa as matrículas ativas da pessoa e insere a nova, na mesma transação.
-- O serviço até já a chamava, em `moverParaClasse`.
--
-- Não conferi antes de criar. O CLAUDE.md abre a seção de sessões justamente
-- com essa regra — "medir antes de concluir: com 143 tabelas e 397 funções, a
-- chance de o que você quer construir já existir é alta", e registra 57
-- objetos que ninguém consulta. Esta seria a de número 58.
--
-- ── A ÚNICA DIFERENÇA, E POR QUE ELA NÃO IMPORTA AQUI ─────────────────────
--
-- A minha pulava a classe de destino: se a pessoa já estivesse nela, devolvia
-- a matrícula existente em vez de encerrar e recriar. A antiga encerra tudo e
-- insere de novo, o que troca a `data_matricula` de quem já estava lá.
--
-- Esse caso não acontece pela tela: o botão "Trazer" só aparece para quem está
-- em OUTRA classe. Guardar uma função inteira por uma diferença inalcançável
-- é o tipo de coisa que vira objeto dormente.

BEGIN;

DROP FUNCTION IF EXISTS public.ebd_mover_aluno(uuid, uuid);

COMMIT;
