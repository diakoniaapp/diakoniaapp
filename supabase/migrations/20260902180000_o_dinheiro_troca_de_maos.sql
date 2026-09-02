-- ═══════════════════════════════════════════════════════════════════════════
-- O dinheiro troca de mãos: sai o pastor, entra a tesouraria
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── DUAS CORREÇÕES NA MESMA LINHA ──────────────────────────────────────────
--
-- As 28 tabelas do Grupo A — financeiro, fiscal e governança — foram
-- fechadas em 20260901210000 com `['admin','secretaria','pastor','lideranca']`.
-- Duas coisas naquele array estão erradas hoje, e pelo mesmo motivo: eu
-- escrevi 'pastor' entendendo-o como "pastor de conselho", e nunca houve uma
-- conta com esse papel para me contradizer.
--
--   sai `pastor`       porque ele passa a ser o PASTOR TITULAR
--                      (20260902190000), e a regra da igreja é clara desde
--                      01/09: "o pastor deve visualizar só o que estiver no
--                      painel pastoral". Medido: sem esta migration, mover o
--                      Lúcio para `pastor` lhe DARIA lançamento financeiro e
--                      governança — o oposto do pretendido.
--
--   entra `tesouraria` porque ela nasceu em 20260902150000 com as permissões
--                      da operação, e permissão sem RLS é decoração. Medido
--                      no ensaio: uma conta de tesouraria lia **0** linhas de
--                      `fin_lancamentos`.
--
-- ── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
--
-- `admin` continua, porque configura o plano de contas e precisa ver o que
-- configurou. `lideranca` continua, porque era assim e a igreja não pediu
-- para mexer — fica anotado como pergunta em aberto: um líder de ministério
-- precisa mesmo alcançar o financeiro da igreja?
--
-- E o Grupo B (15 tabelas: PGM, assuntos, membresia, checklist) não é tocado.
-- Lá `pastor` deve mesmo estar — é o conteúdo do painel pastoral.

BEGIN;

DROP POLICY IF EXISTS "fin_categorias_equipe" ON public.fin_categorias;
CREATE POLICY "fin_categorias_equipe" ON public.fin_categorias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_centros_custo_equipe" ON public.fin_centros_custo;
CREATE POLICY "fin_centros_custo_equipe" ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_contas_equipe" ON public.fin_contas;
CREATE POLICY "fin_contas_equipe" ON public.fin_contas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_contratados_equipe" ON public.fin_contratados;
CREATE POLICY "fin_contratados_equipe" ON public.fin_contratados
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_decisoes_reuniao_equipe" ON public.fin_decisoes_reuniao;
CREATE POLICY "fin_decisoes_reuniao_equipe" ON public.fin_decisoes_reuniao
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_estoque_itens_equipe" ON public.fin_estoque_itens;
CREATE POLICY "fin_estoque_itens_equipe" ON public.fin_estoque_itens
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_estoque_movimentos_equipe" ON public.fin_estoque_movimentos;
CREATE POLICY "fin_estoque_movimentos_equipe" ON public.fin_estoque_movimentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_folha_competencias_equipe" ON public.fin_folha_competencias;
CREATE POLICY "fin_folha_competencias_equipe" ON public.fin_folha_competencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_folha_lancamentos_equipe" ON public.fin_folha_lancamentos;
CREATE POLICY "fin_folha_lancamentos_equipe" ON public.fin_folha_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_fornecedores_equipe" ON public.fin_fornecedores;
CREATE POLICY "fin_fornecedores_equipe" ON public.fin_fornecedores
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_lancamento_rateio_equipe" ON public.fin_lancamento_rateio;
CREATE POLICY "fin_lancamento_rateio_equipe" ON public.fin_lancamento_rateio
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_lancamentos_equipe" ON public.fin_lancamentos;
CREATE POLICY "fin_lancamentos_equipe" ON public.fin_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_orcamentos_equipe" ON public.fin_orcamentos;
CREATE POLICY "fin_orcamentos_equipe" ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_recorrencias_equipe" ON public.fin_recorrencias;
CREATE POLICY "fin_recorrencias_equipe" ON public.fin_recorrencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_reunioes_financeiras_equipe" ON public.fin_reunioes_financeiras;
CREATE POLICY "fin_reunioes_financeiras_equipe" ON public.fin_reunioes_financeiras
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_tabela_inss_empregado_equipe" ON public.fin_tabela_inss_empregado;
CREATE POLICY "fin_tabela_inss_empregado_equipe" ON public.fin_tabela_inss_empregado
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_tabela_irrf_equipe" ON public.fin_tabela_irrf;
CREATE POLICY "fin_tabela_irrf_equipe" ON public.fin_tabela_irrf
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_agenda_equipe" ON public.fiscal_agenda;
CREATE POLICY "fiscal_agenda_equipe" ON public.fiscal_agenda
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_config_equipe" ON public.fiscal_config;
CREATE POLICY "fiscal_config_equipe" ON public.fiscal_config
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_documentos_equipe" ON public.fiscal_documentos;
CREATE POLICY "fiscal_documentos_equipe" ON public.fiscal_documentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_obrigacoes_ativas_equipe" ON public.fiscal_obrigacoes_ativas;
CREATE POLICY "fiscal_obrigacoes_ativas_equipe" ON public.fiscal_obrigacoes_ativas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_assembleia_presentes_equipe" ON public.gov_assembleia_presentes;
CREATE POLICY "gov_assembleia_presentes_equipe" ON public.gov_assembleia_presentes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_assembleias_equipe" ON public.gov_assembleias;
CREATE POLICY "gov_assembleias_equipe" ON public.gov_assembleias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_historico_equipe" ON public.gov_historico;
CREATE POLICY "gov_historico_equipe" ON public.gov_historico
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_participantes_equipe" ON public.gov_participantes;
CREATE POLICY "gov_participantes_equipe" ON public.gov_participantes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_pautas_equipe" ON public.gov_pautas;
CREATE POLICY "gov_pautas_equipe" ON public.gov_pautas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_reunioes_equipe" ON public.gov_reunioes;
CREATE POLICY "gov_reunioes_equipe" ON public.gov_reunioes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_votos_equipe" ON public.gov_votos;
CREATE POLICY "gov_votos_equipe" ON public.gov_votos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role, 'lideranca'::app_role]));

COMMIT;
