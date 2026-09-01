-- ═══════════════════════════════════════════════════════════════════════════
-- `sugerir_voluntarios_escala` passa a ter uma assinatura só
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── COMO ISTO APARECEU ─────────────────────────────────────────────────────
--
-- Instalando a Supabase CLI e gerando o `types.ts` do banco para comparar com
-- o que estava versionado, esta função apareceu no arquivo ATUAL e não no
-- gerado. Investigando: ela existe DUAS vezes.
--
--   5 args  p_area_id, p_data_evento, p_dia_semana, p_turno, p_limite
--   7 args  … mais p_hora_inicio, p_hora_fim
--
-- O gerador de tipos PULA funções sobrecarregadas — não sabe representar duas
-- assinaturas com um nome só. Por isso ela sumia do arquivo gerado, e por isso
-- a regeneração automática ainda não era segura: substituir o `types.ts` teria
-- quebrado a tipagem da chamada em `escalaService.ts`.
--
-- ── POR QUE A DE 5 SAI ─────────────────────────────────────────────────────
--
-- O único chamador do sistema passa os SETE argumentos:
--
--   services/escalaService.ts:208 — sugestoesPara(areaId, dataEvento, hora,
--   limite, horaFim) monta p_hora_inicio e p_hora_fim e chama a RPC.
--
-- A de 5 está dormente. Ela soma-se aos 57 objetos que o CLAUDE.md registra
-- como nunca consultados — com o agravante de que esta não só não é usada
-- como ATRAPALHA: é ela que mantém a sobrecarga, e a sobrecarga é que trava a
-- geração de tipos.
--
-- ── O QUE ISSO DESTRAVA ────────────────────────────────────────────────────
--
-- Com uma assinatura só, `supabase gen types typescript` volta a incluir a
-- função, e o `types.ts` passa a poder ser GERADO em vez de editado à mão.
-- Isso encerra o Risco 9 do CLAUDE.md — o arquivo de 14 mil linhas com
-- entradas manuais que uma regeneração descartaria.
--
-- ── SE PRECISAR VOLTAR ─────────────────────────────────────────────────────
--
-- A sobrecarga de 5 argumentos era um recorte da de 7 sem a janela de
-- horário: mesma consulta, sem `p_hora_inicio`/`p_hora_fim`. Recriá-la é
-- chamar a de 7 com NULL nos dois últimos, o que dá o mesmo resultado — a
-- versão de 7 trata nulo como "sem restrição de horário".
--
-- O DROP é por assinatura: a de 7 argumentos não é tocada.

BEGIN;

DROP FUNCTION IF EXISTS public.sugerir_voluntarios_escala(
  uuid, date, text, text, integer
);

COMMIT;
