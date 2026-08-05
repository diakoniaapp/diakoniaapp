-- Migration: Fix Function Search Path Mutable + Security Definer Views
-- Aplicado manualmente via Supabase SQL Editor em 2026-08-05, versionado aqui para histórico.
-- Resolve os alertas do Supabase Security Advisor:
--   1) Function Search Path Mutable (35 funções da aplicação no schema public)
--      Nota: outras 219 funções sinalizadas pertencem às extensões btree_gist e
--      pg_trgm e foram deixadas intocadas de propósito (são de propriedade das
--      extensões, não do código da aplicação; alterá-las é desnecessário e
--      arrisca quebrar os índices GiST usados por reservas/agenda).
--   2) Security Definer View (13 views de relatório no schema public)

-- 1) Fixa o search_path das funções da aplicação para evitar schema hijacking
ALTER FUNCTION public.anonimizar_pessoa(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.arr_categorizar_problema(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.arr_produto_check_acervo_campanha() SET search_path = public, pg_temp;
ALTER FUNCTION public.arr_produto_check_reserva_espaco() SET search_path = public, pg_temp;
ALTER FUNCTION public.arr_produtos_vendaveis(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.autocomplete_instituicoes(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.baixar_estoque() SET search_path = public, pg_temp;
ALTER FUNCTION public.buscar_estrutura_documento(text,text,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.buscar_instituicao_similar(text,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.buscar_modelo_ministerio(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.buscar_secoes_por_tag(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.calcular_score_engajamento(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.domingo_da_semana(date) SET search_path = public, pg_temp;
ALTER FUNCTION public.fin_atualiza_saldo() SET search_path = public, pg_temp;
ALTER FUNCTION public.fin_calc_proxima_data(date,integer,fin_frequencia) SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_atualizar_contato() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_atualizar_membro_por_tarefa() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_auto_status_por_visitas() SET search_path = public, pg_temp;
ALTER FUNCTION public.fn_status_por_visitas() SET search_path = public, pg_temp;
ALTER FUNCTION public.gerar_notificacoes_campanha(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.incrementa_vezes_discutido() SET search_path = public, pg_temp;
ALTER FUNCTION public.normalizar_site(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.normalizar_telefone(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.registrar_exportacao(text,text,integer,text,text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.registrar_financeiro_pdv(uuid,numeric,numeric,text,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.registrar_historico_documento(uuid,text,text,text,text,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.resumo_meus_dados() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.solicitar_lgpd(text,text,text) SET search_path = public, pg_temp;
ALTER FUNCTION public.sugerir_identidade_por_tag(text,integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_assuntos() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_fin_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_gov() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_pgm_grupos() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_solicitacao_membresia() SET search_path = public, pg_temp;

-- 2) Faz as views de relatório respeitarem a RLS de quem consulta, em vez do dono da view
ALTER VIEW public.v_meu_contexto SET (security_invoker = true);
ALTER VIEW public.vw_agenda_pastoral SET (security_invoker = true);
ALTER VIEW public.vw_arr_reservas_publica SET (security_invoker = true);
ALTER VIEW public.vw_assuntos_dashboard SET (security_invoker = true);
ALTER VIEW public.vw_ebd_alertas_idade SET (security_invoker = true);
ALTER VIEW public.vw_fin_centros_resumo SET (security_invoker = true);
ALTER VIEW public.vw_fin_estoque_alertas SET (security_invoker = true);
ALTER VIEW public.vw_fin_orcamento_vs_real SET (security_invoker = true);
ALTER VIEW public.vw_fin_proximos_vencimentos SET (security_invoker = true);
ALTER VIEW public.vw_fin_resumo_mes SET (security_invoker = true);
ALTER VIEW public.vw_gov_convocacao_lista SET (security_invoker = true);
ALTER VIEW public.vw_pgm_grupos_resumo SET (security_invoker = true);
ALTER VIEW public.vw_pgm_proxima_reuniao SET (security_invoker = true);

-- Rollback (caso alguma view/relatório apresente regressão):
-- ALTER VIEW public.<nome_da_view> SET (security_invoker = false);
