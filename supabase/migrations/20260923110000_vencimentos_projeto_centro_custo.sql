-- ─── vw_fin_proximos_vencimentos — projeto e centro de custo ────────────
--
-- Fase 12 (Workspace Financeiro), revisão da Central de Pagamentos
-- (23/09/2026), pedido dela: "a Central deve responder quem recebe, por
-- qual motivo, qual centro de custo, qual projeto". MEDIDO antes de
-- alterar: `fin_lancamentos` já tem `projeto_id` e `centro_custo_id` —
-- a view só não os repassava. `pg_get_viewdef` conferido ao vivo antes de
-- escrever isto, transformado (não redigitado) — colunas novas só no
-- FIM, nome/tipo/ordem das existentes intocados, como o §6.3 do
-- CLAUDE.md exige pra `CREATE OR REPLACE VIEW`.
CREATE OR REPLACE VIEW public.vw_fin_proximos_vencimentos AS
 SELECT l.id,
    l.data,
    l.tipo,
    l.status,
    l.valor,
    l.descricao,
    l.conta_id,
    c.nome AS conta_nome,
    l.categoria_id,
    k.nome AS categoria_nome,
    k.cor AS categoria_cor,
    l.fornecedor_id,
    f.nome AS fornecedor_nome,
    l.data - CURRENT_DATE AS dias_para_vencer,
        CASE
            WHEN l.data < CURRENT_DATE THEN 'vencido'::text
            WHEN l.data = CURRENT_DATE THEN 'vence_hoje'::text
            WHEN l.data <= (CURRENT_DATE + '3 days'::interval) THEN 'urgente'::text
            WHEN l.data <= (CURRENT_DATE + '7 days'::interval) THEN 'esta_semana'::text
            ELSE 'futuro'::text
        END AS urgencia,
    l.projeto_id,
    p.nome AS projeto_nome,
    l.centro_custo_id,
    cc.nome AS centro_custo_nome
   FROM fin_lancamentos l
     LEFT JOIN fin_contas c ON c.id = l.conta_id
     LEFT JOIN fin_categorias k ON k.id = l.categoria_id
     LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
     LEFT JOIN fin_projetos p ON p.id = l.projeto_id
     LEFT JOIN fin_centros_custo cc ON cc.id = l.centro_custo_id
  WHERE l.status = 'previsto'::fin_lancamento_status;
