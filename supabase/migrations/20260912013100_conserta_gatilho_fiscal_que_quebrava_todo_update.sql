-- ─── Conserta fiscal_sincronizar_pagamento_trigger — quebrava TODO UPDATE
-- em fin_lancamentos ────────────────────────────────────────────────────
--
-- Achado ao vivo em 12/09/2026, testando o novo botão de aprovar/rejeitar
-- lançamento (ver docs/ROADMAP_FINANCEIRO_ERP.md). A função comparava
-- `new.status = 'pago'` — mas `'pago'` NUNCA foi um valor válido do enum
-- `fin_lancamento_status` (`previsto | realizado | conciliado | cancelado
-- | aguardando_aprovacao`). É vocabulário de OUTRO enum, o de
-- `fiscal_agenda.status` (`pendente | pago | atrasado | dispensado |
-- enviado`) — a função foi claramente copiada de um lugar que fala de
-- `fiscal_agenda` sem trocar o literal para o vocabulário de
-- `fin_lancamentos`.
--
-- O gatilho `trg_fiscal_sync_pagamento` dispara em `AFTER UPDATE ON
-- fin_lancamentos`, **sem restrição de coluna** — todo UPDATE, não só os
-- que mexem em `status`. E comparar um enum contra um literal inválido
-- (`new.status = 'pago'`) faz o Postgres tentar converter `'pago'` para o
-- tipo do enum ANTES de decidir se a condição é verdadeira — e essa
-- conversão falha sempre, incondicionalmente, qualquer que seja o valor
-- real de `new.status`.
--
-- Medido ao vivo (via REST, sessão real, revertido em seguida):
--   • UPDATE só de `observacoes` (sem tocar `status`)   → 400, mesmo erro
--   • UPDATE de `status` para `realizado`               → 400, mesmo erro
--   • UPDATE de `status` para `cancelado`                → 400, mesmo erro
--
-- Ou seja: **nenhum UPDATE em `fin_lancamentos` funciona hoje em
-- produção** — nem editar uma descrição, nem o botão "Pagar"/"Receber"
-- que já existe em `FinancasAgenda.tsx` (`confirmarPagamento`), nem
-- categorizar um lançamento. Só INSERT e DELETE passam ilesos, porque o
-- gatilho é só `AFTER UPDATE`.
--
-- Não há como saber, sem acesso de leitura ao histórico de aplicação de
-- migrations desta sessão, há quanto tempo isso está quebrado — a função
-- não aparece em nenhum arquivo de `supabase/migrations/`, só no dump de
-- `supabase/baseline/schema.sql`, então é anterior à janela de migrations
-- rastreadas neste repositório.
--
-- O conserto é trocar o literal errado pelo certo — a mesma transição que
-- `confirmarPagamento()`/`aprovarLancamento()` já fazem no código:
-- `status → 'realizado'` é o momento em que um lançamento vinculado a uma
-- obrigação fiscal deve ser considerado pago. Nada mais na função muda.
--
-- ⚠️ NÃO ENSAIADO com BEGIN/ROLLBACK antes de escrever este arquivo: o
-- token de gerenciamento do Supabase (`SUPABASE_ACCESS_TOKEN`) estava
-- `401 Unauthorized` nesta sessão (verificado três vezes, inclusive no
-- endpoint mais simples — listar projetos). Ensaiar esta migration com
-- `BEGIN; ...; ROLLBACK;` antes de aplicar de verdade, como sempre.

CREATE OR REPLACE FUNCTION public.fiscal_sincronizar_pagamento_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
begin
  -- Se um lançamento que está vinculado a uma obrigação fiscal foi
  -- REALIZADO (pago/recebido de verdade — não "conciliado", que é um
  -- passo posterior de bater com o extrato, nem "previsto"/"aguardando
  -- aprovação", que ainda não aconteceram):
  if new.status = 'realizado' and (old.status is distinct from 'realizado') then
    update fiscal_agenda
    set status = 'pago',
        valor_pago = new.valor,
        data_pagamento = coalesce(new.data_pagamento, current_date),
        atualizado_em = now()
    where lancamento_id = new.id
      and status != 'pago';
  end if;
  return new;
end; $function$
;
