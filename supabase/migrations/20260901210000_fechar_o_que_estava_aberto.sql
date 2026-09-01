-- ═══════════════════════════════════════════════════════════════════════════
-- Fechar as políticas abertas a qualquer pessoa logada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE FOI MEDIDO ───────────────────────────────────────────────────────
--
-- Perguntando "o pastor titular vê algo fora do painel dele?", a resposta veio
-- pior do que a pergunta. Simulando a identidade real dele contra o banco:
--
--   fin_lancamentos, fin_contas       lançamentos e contas bancárias
--   gov_reunioes, gov_pautas          reuniões e atas da igreja
--   arr_espacos, arr_produtos         Bazar e Cantina
--   profiles                          as quatro contas do sistema
--
-- E não é vazamento de LEITURA. **43 tabelas têm política `ALL` com
-- `auth.role() = 'authenticated'`** — qualquer pessoa logada pode ler,
-- alterar e APAGAR. Inclui o módulo financeiro inteiro (17 tabelas), o fiscal
-- (4), a governança (7) e os Pequenos Grupos (7).
--
-- Esconder o item do menu não protege nada: o endereço da API responde
-- direto, e o CLAUDE.md já diz por quê — "a segurança é 100% da RLS; o React
-- decide o que OFERECER, o banco decide o que PERMITIR".
--
-- ── POR QUE A TROCA É LIMPA ────────────────────────────────────────────────
--
-- Medido: **42 das 43 têm a política aberta como ÚNICA política**. Não há
-- outra regra por baixo para conflitar, e não há como trocar e deixar alguém
-- sem o que já tinha por outro caminho. A exceção é `checklist_execucao`, que
-- tem quatro — e por isso entra aqui com o mesmo critério das irmãs, sem
-- mexer nas outras três.
--
-- ── O CRITÉRIO ─────────────────────────────────────────────────────────────
--
-- Cada tabela recebe os papéis que o MENU já dá à tela que a usa. Não é regra
-- nova: é a mesma que `navConfig.ts` aplica desde 01/09, agora valendo também
-- no banco — que é onde ela precisa valer.
--
--   Grupo A  admin, secretaria, pastor, liderança
--            dinheiro, fiscal e governança. Sem o pastor titular, porque
--            "o pastor deve visualizar só o que estiver no painel pastoral".
--
--   Grupo B  os mesmos MAIS o pastor titular
--            Pequenos Grupos, assuntos, membresia e o checklist — tudo isto
--            é conteúdo do painel dele.
--
-- Ninguém que hoje usa o sistema perde acesso: as quatro contas são admin,
-- secretaria, liderança e pastor titular, e as duas primeiras estão nos dois
-- grupos.
--
-- ── O QUE ESTA MIGRATION NÃO FAZ ───────────────────────────────────────────
--
-- Não distingue leitura de escrita. As políticas trocadas eram `ALL` e
-- continuam `ALL` — só que para quem trabalha ali, e não para qualquer pessoa
-- logada. Separar quem lê de quem escreve dentro de cada módulo é outro
-- trabalho, e mais fino: exige saber, por tabela, quem edita o quê.
--
-- O que muda aqui é o tamanho da porta, não o número de fechaduras.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- GRUPO A — dinheiro, fiscal e governança (sem o pastor titular)
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "fin_categorias_all" ON public.fin_categorias;
CREATE POLICY "fin_categorias_equipe" ON public.fin_categorias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_cc_all" ON public.fin_centros_custo;
CREATE POLICY "fin_centros_custo_equipe" ON public.fin_centros_custo
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_contas_all" ON public.fin_contas;
CREATE POLICY "fin_contas_equipe" ON public.fin_contas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_cont_all" ON public.fin_contratados;
CREATE POLICY "fin_contratados_equipe" ON public.fin_contratados
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_dec_rw" ON public.fin_decisoes_reuniao;
CREATE POLICY "fin_decisoes_reuniao_equipe" ON public.fin_decisoes_reuniao
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_est_itens_all" ON public.fin_estoque_itens;
CREATE POLICY "fin_estoque_itens_equipe" ON public.fin_estoque_itens
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_est_mov_all" ON public.fin_estoque_movimentos;
CREATE POLICY "fin_estoque_movimentos_equipe" ON public.fin_estoque_movimentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_folha_c_all" ON public.fin_folha_competencias;
CREATE POLICY "fin_folha_competencias_equipe" ON public.fin_folha_competencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_folha_l_all" ON public.fin_folha_lancamentos;
CREATE POLICY "fin_folha_lancamentos_equipe" ON public.fin_folha_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_forn_all" ON public.fin_fornecedores;
CREATE POLICY "fin_fornecedores_equipe" ON public.fin_fornecedores
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_rateio_all" ON public.fin_lancamento_rateio;
CREATE POLICY "fin_lancamento_rateio_equipe" ON public.fin_lancamento_rateio
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_lanc_all" ON public.fin_lancamentos;
CREATE POLICY "fin_lancamentos_equipe" ON public.fin_lancamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_orc_all" ON public.fin_orcamentos;
CREATE POLICY "fin_orcamentos_equipe" ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_rec_all" ON public.fin_recorrencias;
CREATE POLICY "fin_recorrencias_equipe" ON public.fin_recorrencias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_reun_rw" ON public.fin_reunioes_financeiras;
CREATE POLICY "fin_reunioes_financeiras_equipe" ON public.fin_reunioes_financeiras
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_inss_all" ON public.fin_tabela_inss_empregado;
CREATE POLICY "fin_tabela_inss_empregado_equipe" ON public.fin_tabela_inss_empregado
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fin_irrf_all" ON public.fin_tabela_irrf;
CREATE POLICY "fin_tabela_irrf_equipe" ON public.fin_tabela_irrf
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_agenda_rw" ON public.fiscal_agenda;
CREATE POLICY "fiscal_agenda_equipe" ON public.fiscal_agenda
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_config_admin_rw" ON public.fiscal_config;
CREATE POLICY "fiscal_config_equipe" ON public.fiscal_config
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_docs_rw" ON public.fiscal_documentos;
CREATE POLICY "fiscal_documentos_equipe" ON public.fiscal_documentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "fiscal_ativas_rw" ON public.fiscal_obrigacoes_ativas;
CREATE POLICY "fiscal_obrigacoes_ativas_equipe" ON public.fiscal_obrigacoes_ativas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_pres_all" ON public.gov_assembleia_presentes;
CREATE POLICY "gov_assembleia_presentes_equipe" ON public.gov_assembleia_presentes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_asse_all" ON public.gov_assembleias;
CREATE POLICY "gov_assembleias_equipe" ON public.gov_assembleias
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_hist_all" ON public.gov_historico;
CREATE POLICY "gov_historico_equipe" ON public.gov_historico
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_part_all" ON public.gov_participantes;
CREATE POLICY "gov_participantes_equipe" ON public.gov_participantes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_pauta_all" ON public.gov_pautas;
CREATE POLICY "gov_pautas_equipe" ON public.gov_pautas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_reun_all" ON public.gov_reunioes;
CREATE POLICY "gov_reunioes_equipe" ON public.gov_reunioes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

DROP POLICY IF EXISTS "gov_voto_all" ON public.gov_votos;
CREATE POLICY "gov_votos_equipe" ON public.gov_votos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role]));

-- ══════════════════════════════════════════════════════════════════════════
-- GRUPO B — conteúdo do painel pastoral (com o pastor titular)
-- ══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "assin_all" ON public.assinaturas_oficiais;
CREATE POLICY "assinaturas_oficiais_equipe" ON public.assinaturas_oficiais
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "assuntos_all" ON public.assuntos;
CREATE POLICY "assuntos_equipe" ON public.assuntos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "assuntos_hist_all" ON public.assuntos_historico;
CREATE POLICY "assuntos_historico_equipe" ON public.assuntos_historico
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "chkex_write" ON public.checklist_execucao;
CREATE POLICY "checklist_execucao_equipe" ON public.checklist_execucao
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_grupos_all" ON public.pgm_grupos;
CREATE POLICY "pgm_grupos_equipe" ON public.pgm_grupos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_marcos_all" ON public.pgm_marcos_discipulado;
CREATE POLICY "pgm_marcos_discipulado_equipe" ON public.pgm_marcos_discipulado
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_membros_all" ON public.pgm_membros;
CREATE POLICY "pgm_membros_equipe" ON public.pgm_membros
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_oracao_all" ON public.pgm_pedidos_oracao;
CREATE POLICY "pgm_pedidos_oracao_equipe" ON public.pgm_pedidos_oracao
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_presencas_all" ON public.pgm_presencas;
CREATE POLICY "pgm_presencas_equipe" ON public.pgm_presencas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_reunioes_all" ON public.pgm_reunioes;
CREATE POLICY "pgm_reunioes_equipe" ON public.pgm_reunioes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "pgm_visitas_all" ON public.pgm_visitas;
CREATE POLICY "pgm_visitas_equipe" ON public.pgm_visitas
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "reu_ass_all" ON public.reuniao_assuntos;
CREATE POLICY "reuniao_assuntos_equipe" ON public.reuniao_assuntos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "sol_doc_all" ON public.solicitacoes_documentos;
CREATE POLICY "solicitacoes_documentos_equipe" ON public.solicitacoes_documentos
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "sol_hist_all" ON public.solicitacoes_historico;
CREATE POLICY "solicitacoes_historico_equipe" ON public.solicitacoes_historico
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

DROP POLICY IF EXISTS "sol_memb_all" ON public.solicitacoes_membresia;
CREATE POLICY "solicitacoes_membresia_equipe" ON public.solicitacoes_membresia
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'pastor'::app_role, 'lideranca'::app_role, 'diakonia'::app_role]));

-- ══════════════════════════════════════════════════════════════════════════
-- profiles — e a política chamada "liberar tudo temporario"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Ela existe, com `USING (true)`, e o nome diz que era para sair. Ao lado,
-- "Usuarios autenticados podem ler profiles", também `true`. As duas juntas
-- deixam qualquer pessoa logada ler o nome, o telefone e o papel das outras.
--
-- Medido em como o código lê esta tabela: de 26 chamadas, quase todas são
-- `.eq("id", user.id)` — o próprio perfil. As exceções são o Painel de
-- Acessos e o diálogo de novo acesso, telas de admin e secretaria.
--
-- Então: o próprio, mais admin e secretaria. `minha_pessoa_id()` não é
-- afetada — é SECURITY DEFINER e não passa por RLS, que é justamente por que
-- ela foi criada assim.

DROP POLICY IF EXISTS "liberar tudo temporario" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios autenticados podem ler profiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios veem proprio perfil" ON public.profiles;

CREATE POLICY "Usuarios veem proprio perfil" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role])
  );

COMMIT;
