-- Migração: habilita RLS no módulo de Arrecadação (Bazar/Cantina)
-- Contexto: Security Advisor do Supabase apontava 11 tabelas do módulo arr_*
-- sem Row Level Security habilitado. arr_reservas já tinha políticas prontas,
-- só faltava ligar o RLS. As outras 10 tabelas não tinham nenhuma política —
-- foram criadas seguindo o mesmo padrão de permissões já usado no sistema
-- (tem_permissao()). Testar em ambiente de homologação antes de aplicar em
-- produção; rollback documentado no final deste arquivo (comentado).

-- ============================================================
-- BLOCO 1 — arr_reservas (políticas já existiam, só faltava o RLS)
-- ============================================================
ALTER TABLE public.arr_reservas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BLOCO 2 — tabelas de catálogo/configuração: leitura ampla, escrita restrita
-- ============================================================
ALTER TABLE public.arr_produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_espacos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_checklist_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY arr_produtos_sel ON public.arr_produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY arr_produtos_mod ON public.arr_produtos FOR ALL TO authenticated USING (tem_permissao('gerenciar_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));

CREATE POLICY arr_espacos_sel ON public.arr_espacos FOR SELECT TO authenticated USING (true);
CREATE POLICY arr_espacos_mod ON public.arr_espacos FOR ALL TO authenticated USING (tem_permissao('gerenciar_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));

CREATE POLICY arr_checklist_template_sel ON public.arr_checklist_template FOR SELECT TO authenticated USING (true);
CREATE POLICY arr_checklist_template_mod ON public.arr_checklist_template FOR ALL TO authenticated USING (tem_permissao('gerenciar_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));

-- Tabelas operacionais (ligadas a reserva/caixa): mesmo padrão de acesso do arr_reservas
ALTER TABLE public.arr_caixas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_caixa_operadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_itens_venda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_estoque_movimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arr_reserva_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY arr_caixas_all ON public.arr_caixas FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_caixa_operadores_all ON public.arr_caixa_operadores FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_movimentos_all ON public.arr_movimentos FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_vendas_all ON public.arr_vendas FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_itens_venda_all ON public.arr_itens_venda FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_estoque_movimentos_all ON public.arr_estoque_movimentos FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));
CREATE POLICY arr_reserva_checklist_all ON public.arr_reserva_checklist FOR ALL TO authenticated USING (tem_permissao('ver_arrecadacao_admin') OR tem_permissao('gerenciar_arrecadacao') OR tem_permissao('ver_arrecadacao')) WITH CHECK (tem_permissao('gerenciar_arrecadacao'));

-- ============================================================
-- ROLLBACK (não execute junto — só se precisar desfazer)
-- ============================================================
-- ALTER TABLE public.arr_reservas DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS arr_produtos_sel ON public.arr_produtos;
-- DROP POLICY IF EXISTS arr_produtos_mod ON public.arr_produtos;
-- DROP POLICY IF EXISTS arr_espacos_sel ON public.arr_espacos;
-- DROP POLICY IF EXISTS arr_espacos_mod ON public.arr_espacos;
-- DROP POLICY IF EXISTS arr_checklist_template_sel ON public.arr_checklist_template;
-- DROP POLICY IF EXISTS arr_checklist_template_mod ON public.arr_checklist_template;
-- DROP POLICY IF EXISTS arr_caixas_all ON public.arr_caixas;
-- DROP POLICY IF EXISTS arr_caixa_operadores_all ON public.arr_caixa_operadores;
-- DROP POLICY IF EXISTS arr_movimentos_all ON public.arr_movimentos;
-- DROP POLICY IF EXISTS arr_vendas_all ON public.arr_vendas;
-- DROP POLICY IF EXISTS arr_itens_venda_all ON public.arr_itens_venda;
-- DROP POLICY IF EXISTS arr_estoque_movimentos_all ON public.arr_estoque_movimentos;
-- DROP POLICY IF EXISTS arr_reserva_checklist_all ON public.arr_reserva_checklist;
--
-- ALTER TABLE public.arr_produtos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_espacos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_checklist_template DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_caixas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_caixa_operadores DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_movimentos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_vendas DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_itens_venda DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_estoque_movimentos DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.arr_reserva_checklist DISABLE ROW LEVEL SECURITY;
