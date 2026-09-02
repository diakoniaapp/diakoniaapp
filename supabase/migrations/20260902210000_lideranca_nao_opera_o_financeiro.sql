-- ═══════════════════════════════════════════════════════════════════════════
-- Liderança não opera o financeiro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── A REGRA ────────────────────────────────────────────────────────────────
--
-- Ditada pela igreja em 02/09/2026, em quatro palavras: "liderança nao opera
-- o financeiro".
--
-- `lideranca` estava no Grupo A desde 20260901210000 porque era assim antes
-- e eu não tinha ordem para mexer. Era a última pergunta que restava daquela
-- migration, e agora tem resposta.
--
-- ── O QUE É "FINANCEIRO", E O QUE NÃO É ────────────────────────────────────
--
-- O Grupo A juntava três famílias porque eu as empacotei juntas em 01/09:
--
--   fin_*      17 tabelas   dinheiro da igreja
--   fiscal_*    4 tabelas   obrigações, DARF, FGTS — trabalho de tesouraria
--   gov_*       7 tabelas   reuniões, atas, assembleias e votos
--
-- Esta migration tira `lideranca` das **21 primeiras**. Governança fica
-- como está, e por uma razão: ata de assembleia e voto não são dinheiro, e
-- quem lidera um ministério pode legitimamente participar de assembleia. Se a
-- igreja quiser tirá-la de lá também, é a mesma migration com outra lista —
-- mas é outra pergunta, e ninguém a fez.
--
-- ── E `diakonia` ENTRA ─────────────────────────────────────────────────────
--
-- De passagem, e porque faltava: o dono do sistema vê tudo, e estas 21
-- políticas foram escritas antes de ele existir como tal. Sem isto, a conta
-- construtora dependeria de carregar `admin` junto para alcançá-las — o que
-- ela carrega hoje, mas por conveniência, não por definição.

BEGIN;

DROP POLICY IF EXISTS "fin_categorias_equipe" ON public.fin_categorias;
CREATE POLICY "fin_categorias_equipe" ON public.fin_categorias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_centros_custo_equipe" ON public.fin_centros_custo;
CREATE POLICY "fin_centros_custo_equipe" ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_contas_equipe" ON public.fin_contas;
CREATE POLICY "fin_contas_equipe" ON public.fin_contas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_contratados_equipe" ON public.fin_contratados;
CREATE POLICY "fin_contratados_equipe" ON public.fin_contratados
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_decisoes_reuniao_equipe" ON public.fin_decisoes_reuniao;
CREATE POLICY "fin_decisoes_reuniao_equipe" ON public.fin_decisoes_reuniao
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_estoque_itens_equipe" ON public.fin_estoque_itens;
CREATE POLICY "fin_estoque_itens_equipe" ON public.fin_estoque_itens
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_estoque_movimentos_equipe" ON public.fin_estoque_movimentos;
CREATE POLICY "fin_estoque_movimentos_equipe" ON public.fin_estoque_movimentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_folha_competencias_equipe" ON public.fin_folha_competencias;
CREATE POLICY "fin_folha_competencias_equipe" ON public.fin_folha_competencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_folha_lancamentos_equipe" ON public.fin_folha_lancamentos;
CREATE POLICY "fin_folha_lancamentos_equipe" ON public.fin_folha_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_fornecedores_equipe" ON public.fin_fornecedores;
CREATE POLICY "fin_fornecedores_equipe" ON public.fin_fornecedores
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_lancamento_rateio_equipe" ON public.fin_lancamento_rateio;
CREATE POLICY "fin_lancamento_rateio_equipe" ON public.fin_lancamento_rateio
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_lancamentos_equipe" ON public.fin_lancamentos;
CREATE POLICY "fin_lancamentos_equipe" ON public.fin_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_orcamentos_equipe" ON public.fin_orcamentos;
CREATE POLICY "fin_orcamentos_equipe" ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_recorrencias_equipe" ON public.fin_recorrencias;
CREATE POLICY "fin_recorrencias_equipe" ON public.fin_recorrencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_reunioes_financeiras_equipe" ON public.fin_reunioes_financeiras;
CREATE POLICY "fin_reunioes_financeiras_equipe" ON public.fin_reunioes_financeiras
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_tabela_inss_empregado_equipe" ON public.fin_tabela_inss_empregado;
CREATE POLICY "fin_tabela_inss_empregado_equipe" ON public.fin_tabela_inss_empregado
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fin_tabela_irrf_equipe" ON public.fin_tabela_irrf;
CREATE POLICY "fin_tabela_irrf_equipe" ON public.fin_tabela_irrf
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fiscal_agenda_equipe" ON public.fiscal_agenda;
CREATE POLICY "fiscal_agenda_equipe" ON public.fiscal_agenda
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fiscal_config_equipe" ON public.fiscal_config;
CREATE POLICY "fiscal_config_equipe" ON public.fiscal_config
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fiscal_documentos_equipe" ON public.fiscal_documentos;
CREATE POLICY "fiscal_documentos_equipe" ON public.fiscal_documentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "fiscal_obrigacoes_ativas_equipe" ON public.fiscal_obrigacoes_ativas;
CREATE POLICY "fiscal_obrigacoes_ativas_equipe" ON public.fiscal_obrigacoes_ativas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMIT;
