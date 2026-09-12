-- ─── Fase 2: fecha os 2 itens "a confirmar" que sobraram da Fase 1 ─────────
--
-- docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §2, itens ainda abertos depois
-- da Fase 1 (Doações e Diaconia/Missões já resolvidos lá). Perguntado à
-- Telma em 12/09/2026:
--
--  1) "Eventos" (receita) — mantida fora do Plano Oficial, resposta "manter
--     fora do relatório oficial". Sem mudança de dado: já é esse o estado
--     desde a Fase 1 (nunca teve classificacao_dre). Fase 2 só fecha a
--     pergunta, não grava nada novo pra este item.
--
--  2) "Construção / reforma" (despesa) — a Fase 1 tinha descontinuado sem
--     saber pra onde mapear. Resposta: usar a categoria oficial "Manutenção
--     de Imobilizado" já existente — mesmo tratamento dado a "Material de
--     som" na Fase 1 (fusão em categoria oficial, não categoria nova).
--     Sem lançamento real usando "Construção / reforma" (medido na Fase 1);
--     ainda assim repointa por defesa, mesmo padrão da Fase 1.

update public.fin_lancamentos set categoria_id = (
    select id from public.fin_categorias where nome = 'Manutenção de Imobilizado' and tipo = 'saida' limit 1
  )
  where categoria_id = (select id from public.fin_categorias where nome = 'Construção / reforma' limit 1);

update public.fin_categorias set
  observacao = 'Fundida em "Manutenção de Imobilizado" — decisão da Telma (12/09/2026, Fase 2). Ao lançar reforma/construção, usar a categoria oficial "Manutenção de Imobilizado".'
  where nome = 'Construção / reforma';
