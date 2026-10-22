-- Reverte a migration 20261022200000 (resumo semanal configurável): remove as escolhas salvas e as funções novas e devolve o digest ao de 20260909190000.
-- A Edge Function NOVA precisa ser desfeita antes (volte a implantar a versão anterior) — ela depende destas funções.
DROP FUNCTION IF EXISTS public.sistema_resumo_semanal_salvar_config(jsonb);
DROP FUNCTION IF EXISTS public.sistema_resumo_semanal_pessoas();
DROP FUNCTION IF EXISTS public.resumo_semanal_destinatarios_v2();
DROP FUNCTION IF EXISTS public.resumo_semanal_pessoas_por_perfil();
DROP TABLE IF EXISTS public.resumo_semanal_blocos;
DROP TABLE IF EXISTS public.resumo_semanal_perfis;

CREATE OR REPLACE FUNCTION public.resumo_semanal_digest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pastoral        jsonb;
  v_secretaria      jsonb;
  v_tesouraria      jsonb;
  v_fiscal          record;
  v_prox_domingo    date;
  v_dias_cobertura  int;
BEGIN
  v_prox_domingo   := CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7);
  v_dias_cobertura := (v_prox_domingo - CURRENT_DATE) + 6;

  SELECT jsonb_build_object(
    'aniversarios_semana', (SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p WHERE p.tipo = 'aniversario' AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6),
    'bodas_semana', (SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p WHERE p.tipo = 'casamento' AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6),
    'visitantes_sem_contato', (SELECT count(*) FROM membros WHERE tipo_pessoa = 'visitante' AND status = 'ativo' AND (ultimo_contato_em IS NULL OR ultimo_contato_em < now() - interval '7 days')),
    'candidatos_batismo', (SELECT count(*) FROM membros WHERE tipo_pessoa = 'congregado' AND status = 'ativo' AND data_nascimento IS NOT NULL AND date_part('year', age(data_nascimento)) >= 9)
  ) INTO v_pastoral;

  SELECT jsonb_build_object(
    'sem_telefone', (SELECT count(*) FROM membros WHERE status = 'ativo' AND (telefone_celular IS NULL OR telefone_celular = '') AND COALESCE(telefone_dispensado, false) = false),
    'membresia_em_andamento', (SELECT count(*) FROM solicitacoes_membresia WHERE status IN ('rascunho', 'aguardando_documento', 'pronta_assembleia')),
    'atas_pendentes', (SELECT count(*) FROM gov_reunioes WHERE status = 'concluida' AND ata_url IS NULL),
    'pautas_rascunho', (SELECT count(*) FROM gov_pautas WHERE status = 'rascunho')
  ) INTO v_secretaria;

  SELECT * INTO v_fiscal FROM fiscal_resumo_dashboard();

  SELECT jsonb_build_object(
    'fiscal_atrasados', COALESCE(v_fiscal.total_atrasados, 0),
    'fiscal_urgentes',  COALESCE(v_fiscal.total_urgentes, 0),
    'caixas_abertos', (SELECT count(*) FROM arr_caixas WHERE estado = 'aberto' AND arquivado_em IS NULL),
    'aprovacoes_pendentes', (SELECT count(*) FROM fin_lancamentos WHERE status = 'aguardando_aprovacao'),
    'centros_criticos', (SELECT count(*) FROM fin_alertas_centros() WHERE tipo_alerta = 'acima_orcamento')
  ) INTO v_tesouraria;

  RETURN jsonb_build_object('pastoral', v_pastoral, 'secretaria', v_secretaria, 'tesouraria', v_tesouraria, 'gerado_em', now());
END;
$$;
REVOKE ALL ON FUNCTION public.resumo_semanal_digest() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_digest() TO service_role;
-- a função interna das obrigações em aberto só existia para o digest novo
DROP FUNCTION IF EXISTS public.resumo_semanal_obrigacoes_abertas();
