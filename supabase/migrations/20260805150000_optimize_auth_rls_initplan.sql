-- Migration: Otimiza políticas RLS que chamavam auth.uid() sem (select ...)
-- Aplicado manualmente via Supabase SQL Editor em 2026-08-05, versionado aqui para histórico.
-- Resolve o alerta do Supabase Performance Advisor "Auth RLS Initialization Plan":
--   Políticas RLS que chamam auth.uid() diretamente forçam o Postgres a reavaliar
--   a função a cada linha da consulta. Envolver a chamada em (select auth.uid())
--   faz o Postgres avaliar uma única vez por consulta (initplan), melhorando
--   drasticamente a performance em tabelas grandes.
--
-- Escopo: 88 políticas em 63 tabelas do schema public que ainda usavam auth.uid()
-- sem o wrapper (select ...). As demais políticas que já usavam auth.uid() dentro
-- de (select ...) foram deixadas intactas (detectadas e excluídas corretamente
-- do escopo desta migration).
--
-- Rollback: recriar cada política com sua definição original (sem o wrapper select),
-- disponível no histórico do Supabase Advisor / backups do banco.

DROP POLICY "Admin/Sec gerenciam acompanhamentos" ON public.acompanhamentos_visitante;
CREATE POLICY "Admin/Sec gerenciam acompanhamentos" ON public.acompanhamentos_visitante AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem acompanhamentos" ON public.acompanhamentos_visitante;
CREATE POLICY "Staff leem acompanhamentos" ON public.acompanhamentos_visitante AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam area_voluntarios" ON public.area_voluntarios;
CREATE POLICY "Admin/Sec gerenciam area_voluntarios" ON public.area_voluntarios AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem area_voluntarios" ON public.area_voluntarios;
CREATE POLICY "Staff leem area_voluntarios" ON public.area_voluntarios AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam areas" ON public.areas;
CREATE POLICY "Admin/Sec gerenciam areas" ON public.areas AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY arr_reservas_ins ON public.arr_reservas;
CREATE POLICY arr_reservas_ins ON public.arr_reservas AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((tem_permissao('gerenciar_arrecadacao'::text) OR (tem_permissao('ver_arrecadacao'::text) AND (solicitada_por = (select auth.uid())))));

DROP POLICY arr_reservas_sel ON public.arr_reservas;
CREATE POLICY arr_reservas_sel ON public.arr_reservas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((tem_permissao('ver_arrecadacao_admin'::text) OR tem_permissao('gerenciar_arrecadacao'::text) OR (solicitada_por = (select auth.uid())) OR (pessoa_atual() = responsavel_id) OR tem_permissao('ver_arrecadacao'::text)));

DROP POLICY arr_reservas_upd ON public.arr_reservas;
CREATE POLICY arr_reservas_upd ON public.arr_reservas AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((tem_permissao('gerenciar_arrecadacao'::text) OR ((solicitada_por = (select auth.uid())) AND (status = 'solicitada'::arr_reserva_status))))
  WITH CHECK ((tem_permissao('gerenciar_arrecadacao'::text) OR ((solicitada_por = (select auth.uid())) AND (status = 'solicitada'::arr_reserva_status))));

DROP POLICY audit_insert_own ON public.audit_logs;
CREATE POLICY audit_insert_own ON public.audit_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY audit_select_own ON public.audit_logs;
CREATE POLICY audit_select_own ON public.audit_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY mat_write ON public.campanha_materiais;
CREATE POLICY mat_write ON public.campanha_materiais AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY notif_write ON public.campanha_notificacoes;
CREATE POLICY notif_write ON public.campanha_notificacoes AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY camp_write ON public.campanhas;
CREATE POLICY camp_write ON public.campanhas AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY cargos_write ON public.cargos_institucionais;
CREATE POLICY cargos_write ON public.cargos_institucionais AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY "Admin/Sec gerenciam congregacoes" ON public.congregacoes;
CREATE POLICY "Admin/Sec gerenciam congregacoes" ON public.congregacoes AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY consent_admin_read ON public.consentimento;
CREATE POLICY consent_admin_read ON public.consentimento AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY consent_proprio ON public.consentimento;
CREATE POLICY consent_proprio ON public.consentimento AS PERMISSIVE FOR SELECT TO authenticated
  USING ((registrado_por = (select auth.uid())));

DROP POLICY convites_admin_read ON public.convites_acesso;
CREATE POLICY convites_admin_read ON public.convites_acesso AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['admin'::app_role, 'secretaria'::app_role]))))));

DROP POLICY de_write ON public.documento_estrutura;
CREATE POLICY de_write ON public.documento_estrutura AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY doc_write ON public.documentos;
CREATE POLICY doc_write ON public.documentos AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY docs_write ON public.documentos;
CREATE POLICY docs_write ON public.documentos AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY dh_insert ON public.documentos_historico;
CREATE POLICY dh_insert ON public.documentos_historico AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY dh_select ON public.documentos_historico;
CREATE POLICY dh_select ON public.documentos_historico AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY ebd_aulas_modify_lider ON public.ebd_aulas;
CREATE POLICY ebd_aulas_modify_lider ON public.ebd_aulas AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_campanhas_modify_lider ON public.ebd_campanhas;
CREATE POLICY ebd_campanhas_modify_lider ON public.ebd_campanhas AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_classes_modify_lider ON public.ebd_classes;
CREATE POLICY ebd_classes_modify_lider ON public.ebd_classes AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_entradas_modify_lider ON public.ebd_entradas;
CREATE POLICY ebd_entradas_modify_lider ON public.ebd_entradas AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_matriculas_modify_lider ON public.ebd_matriculas;
CREATE POLICY ebd_matriculas_modify_lider ON public.ebd_matriculas AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_presencas_modify_lider ON public.ebd_presencas;
CREATE POLICY ebd_presencas_modify_lider ON public.ebd_presencas AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY ebd_prof_modify ON public.ebd_professores;
CREATE POLICY ebd_prof_modify ON public.ebd_professores AS PERMISSIVE FOR ALL TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = (select auth.uid())) AND ((ur.role)::text = ANY (ARRAY['admin'::text, 'secretaria'::text, 'pastor'::text, 'diakonia'::text, 'lideranca'::text]))))))
  WITH CHECK (true);

DROP POLICY "Admin/Sec gerenciam evento_areas" ON public.evento_areas;
CREATE POLICY "Admin/Sec gerenciam evento_areas" ON public.evento_areas AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Admin/Sec gerenciam evento_ministerios" ON public.evento_ministerios;
CREATE POLICY "Admin/Sec gerenciam evento_ministerios" ON public.evento_ministerios AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Admin/Sec gerenciam eventos" ON public.eventos;
CREATE POLICY "Admin/Sec gerenciam eventos" ON public.eventos AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY exp_insert ON public.exportacoes_log;
CREATE POLICY exp_insert ON public.exportacoes_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY "Admin/Sec gerenciam familias" ON public.familias;
CREATE POLICY "Admin/Sec gerenciam familias" ON public.familias AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem familias" ON public.familias;
CREATE POLICY "Staff leem familias" ON public.familias AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam historico_lideranca" ON public.historico_lideranca;
CREATE POLICY "Admin/Sec gerenciam historico_lideranca" ON public.historico_lideranca AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem historico_lideranca" ON public.historico_lideranca;
CREATE POLICY "Staff leem historico_lideranca" ON public.historico_lideranca AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam historico" ON public.historico_membro;
CREATE POLICY "Admin/Sec gerenciam historico" ON public.historico_membro AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem historico" ON public.historico_membro;
CREATE POLICY "Staff leem historico" ON public.historico_membro AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY identidade_write ON public.identidade_igreja;
CREATE POLICY identidade_write ON public.identidade_igreja AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY iv_write ON public.identidade_valores;
CREATE POLICY iv_write ON public.identidade_valores AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY ii_write ON public.igreja_instituicoes;
CREATE POLICY ii_write ON public.igreja_instituicoes AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY imp_select ON public.importacoes_membros;
CREATE POLICY imp_select ON public.importacoes_membros AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY imp_write ON public.importacoes_membros;
CREATE POLICY imp_write ON public.importacoes_membros AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY inst_write ON public.instituicoes;
CREATE POLICY inst_write ON public.instituicoes AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY lid_write ON public.liderancas;
CREATE POLICY lid_write ON public.liderancas AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Admin/Sec atualizam locais" ON public.locais;
CREATE POLICY "Admin/Sec atualizam locais" ON public.locais AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Admin/Sec inserem locais" ON public.locais;
CREATE POLICY "Admin/Sec inserem locais" ON public.locais AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem locais" ON public.locais;
CREATE POLICY "Staff leem locais" ON public.locais AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin gerenciam historico locais" ON public.locais_historico_operacional;
CREATE POLICY "Admin gerenciam historico locais" ON public.locais_historico_operacional AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem historico locais" ON public.locais_historico_operacional;
CREATE POLICY "Staff leem historico locais" ON public.locais_historico_operacional AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY log_admin_read ON public.log_auditoria;
CREATE POLICY log_admin_read ON public.log_auditoria AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY log_exclusoes_admin_insert ON public.log_exclusoes;
CREATE POLICY log_exclusoes_admin_insert ON public.log_exclusoes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = (select auth.uid())) AND (user_roles.role = 'admin'::app_role)))));

DROP POLICY log_exclusoes_admin_select ON public.log_exclusoes;
CREATE POLICY log_exclusoes_admin_select ON public.log_exclusoes AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = (select auth.uid())) AND (user_roles.role = 'admin'::app_role)))));

DROP POLICY "Admin/Sec gerenciam membros" ON public.membros;
CREATE POLICY "Admin/Sec gerenciam membros" ON public.membros AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem membros" ON public.membros;
CREATE POLICY "Staff leem membros" ON public.membros AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY det_admin_total ON public.membros_detalhes;
CREATE POLICY det_admin_total ON public.membros_detalhes AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY det_diakonia_total ON public.membros_detalhes;
CREATE POLICY det_diakonia_total ON public.membros_detalhes AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'diakonia'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'diakonia'::app_role));

DROP POLICY det_proprio_membro ON public.membros_detalhes;
CREATE POLICY det_proprio_membro ON public.membros_detalhes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (pessoas pe
     JOIN profiles pr ON ((pr.email = pe.email)))
  WHERE ((pe.id = membros_detalhes.pessoa_id) AND (pr.id = (select auth.uid()))))));

DROP POLICY det_secretaria_leitura ON public.membros_detalhes;
CREATE POLICY det_secretaria_leitura ON public.membros_detalhes AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'secretaria'::app_role));

DROP POLICY meb_admin_select ON public.membros_excluidos_backup;
CREATE POLICY meb_admin_select ON public.membros_excluidos_backup AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = (select auth.uid())) AND (user_roles.role = 'admin'::app_role)))));

DROP POLICY "Admin/Sec gerenciam ministerio_membros" ON public.ministerio_membros;
CREATE POLICY "Admin/Sec gerenciam ministerio_membros" ON public.ministerio_membros AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem ministerio_membros" ON public.ministerio_membros;
CREATE POLICY "Staff leem ministerio_membros" ON public.ministerio_membros AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam ministerios" ON public.ministerios;
CREATE POLICY "Admin/Sec gerenciam ministerios" ON public.ministerios AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY modelos_write ON public.modelos_ministerio;
CREATE POLICY modelos_write ON public.modelos_ministerio AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY pessoas_admin_total ON public.pessoas;
CREATE POLICY pessoas_admin_total ON public.pessoas AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY pessoas_diakonia_leitura ON public.pessoas;
CREATE POLICY pessoas_diakonia_leitura ON public.pessoas AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role((select auth.uid()), 'diakonia'::app_role));

DROP POLICY pessoas_lideranca_leitura ON public.pessoas;
CREATE POLICY pessoas_lideranca_leitura ON public.pessoas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role((select auth.uid()), 'lideranca'::app_role) AND (tipo = ANY (ARRAY['visitante'::tipo_pessoa, 'congregado'::tipo_pessoa]))));

DROP POLICY pessoas_proprio_dado ON public.pessoas;
CREATE POLICY pessoas_proprio_dado ON public.pessoas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = (select auth.uid())) AND (p.email = pessoas.email)))));

DROP POLICY pc_write ON public.pessoas_cargos;
CREATE POLICY pc_write ON public.pessoas_cargos AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY "Admin gerenciam predios" ON public.predios;
CREATE POLICY "Admin gerenciam predios" ON public.predios AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem predios" ON public.predios;
CREATE POLICY "Staff leem predios" ON public.predios AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'lideranca'::app_role]));

DROP POLICY "Admin gerencia perfis" ON public.profiles;
CREATE POLICY "Admin gerencia perfis" ON public.profiles AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY "Usuarios atualizam proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios atualizam proprio perfil" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = (select auth.uid())));

DROP POLICY "Usuarios veem proprio perfil" ON public.profiles;
CREATE POLICY "Usuarios veem proprio perfil" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY sec_write ON public.secoes_documento;
CREATE POLICY sec_write ON public.secoes_documento AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY secoes_write ON public.secoes_documento;
CREATE POLICY secoes_write ON public.secoes_documento AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY lgpd_admin_total ON public.solicitacoes_lgpd;
CREATE POLICY lgpd_admin_total ON public.solicitacoes_lgpd AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY "Admin gerenciam unidades" ON public.unidades;
CREATE POLICY "Admin gerenciam unidades" ON public.unidades AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem unidades" ON public.unidades;
CREATE POLICY "Staff leem unidades" ON public.unidades AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'lideranca'::app_role]));

DROP POLICY "Admin gerencia roles" ON public.user_roles;
CREATE POLICY "Admin gerencia roles" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'admin'::app_role));

DROP POLICY "Usuario ve proprios roles" ON public.user_roles;
CREATE POLICY "Usuario ve proprios roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) OR has_role((select auth.uid()), 'admin'::app_role)));

DROP POLICY valores_write ON public.valores_igreja;
CREATE POLICY valores_write ON public.valores_igreja AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'admin'::app_role) OR has_role((select auth.uid()), 'secretaria'::app_role)));

DROP POLICY "Admin/Sec gerenciam vinculos_familiares" ON public.vinculos_familiares;
CREATE POLICY "Admin/Sec gerenciam vinculos_familiares" ON public.vinculos_familiares AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem vinculos_familiares" ON public.vinculos_familiares;
CREATE POLICY "Staff leem vinculos_familiares" ON public.vinculos_familiares AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));

DROP POLICY "Admin/Sec gerenciam visitas" ON public.visitas;
CREATE POLICY "Admin/Sec gerenciam visitas" ON public.visitas AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]))
  WITH CHECK (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role]));

DROP POLICY "Staff leem visitas" ON public.visitas;
CREATE POLICY "Staff leem visitas" ON public.visitas AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_any_role((select auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role]));  
