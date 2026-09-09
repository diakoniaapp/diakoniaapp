-- ─── resumo_semanal_digest() ────────────────────────────────────────────
--
-- Fase 4 da Bússola do Diakonia ("Comunicação"). Os números do primeiro
-- resumo semanal por e-mail — chamada pela Edge Function `resumo-semanal`.
--
-- Reaproveita as RPCs que os painéis já usam onde elas existem
-- (resumo_painel_pastoral, fiscal_resumo_dashboard, fin_alertas_centros) —
-- mesma fonte de verdade, sem recontar. O resto é consulta direta, com a
-- MESMA regra que o painel correspondente já usa no cliente:
--
--   visitantes_sem_contato   getResumoVisitantes() (visitanteService.ts)
--   candidatos_batismo       candidatosMembresia() (painelPastoralService.ts)
--   sem_telefone             a entrada `destaque` de PENDENCIAS_CADASTRO
--   membresia/atas/pautas    carregarPainelSecretaria() (painelSecretariaService.ts)
--   caixas/aprovações        painelTesourariaService.ts (Sprints 1-2)
--
-- ── DE PROPÓSITO SEM A DIACONIA ("QUEM PAROU DE VIR") ──────────────────
--
-- carregarPendenciasAcompanhamento() (diaconiaService.ts) conta FALTAS
-- SEGUIDAS por vínculo — lógica procedural, não um filtro simples — e
-- replicá-la em SQL sob pressa arrisca um número sutilmente errado, o
-- mesmo defeito que este projeto já perseguiu a semana toda (agenda
-- anunciando 21 sobre uma lista de 22). Fica de fora do primeiro envio;
-- entra depois, com tempo pra testar contra o resultado real da função
-- TypeScript.
CREATE OR REPLACE FUNCTION public.resumo_semanal_digest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pastoral   jsonb;
  v_secretaria jsonb;
  v_tesouraria jsonb;
  v_fiscal     record;
BEGIN
  -- ── Pastoral ──────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'aniversarios_semana', COALESCE((SELECT aniversarios_semana FROM resumo_painel_pastoral()), 0),
    'bodas_semana',        COALESCE((SELECT bodas_semana        FROM resumo_painel_pastoral()), 0),
    'visitantes_sem_contato', (
      SELECT count(*) FROM membros
      WHERE tipo_pessoa = 'visitante' AND status = 'ativo'
        AND (ultimo_contato_em IS NULL OR ultimo_contato_em < now() - interval '7 days')
    ),
    'candidatos_batismo', (
      SELECT count(*) FROM membros
      WHERE tipo_pessoa = 'congregado' AND status = 'ativo'
        AND data_nascimento IS NOT NULL
        AND date_part('year', age(data_nascimento)) >= 9
    )
  ) INTO v_pastoral;

  -- ── Secretaria ────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'sem_telefone', (
      SELECT count(*) FROM membros
      WHERE status = 'ativo'
        AND (telefone_celular IS NULL OR telefone_celular = '')
        AND COALESCE(telefone_dispensado, false) = false
    ),
    'membresia_em_andamento', (
      SELECT count(*) FROM solicitacoes_membresia
      WHERE status IN ('rascunho', 'aguardando_documento', 'pronta_assembleia')
    ),
    'atas_pendentes', (
      SELECT count(*) FROM gov_reunioes WHERE status = 'concluida' AND ata_url IS NULL
    ),
    'pautas_rascunho', (
      SELECT count(*) FROM gov_pautas WHERE status = 'rascunho'
    )
  ) INTO v_secretaria;

  -- ── Tesouraria ────────────────────────────────────────────────────
  SELECT * INTO v_fiscal FROM fiscal_resumo_dashboard();

  SELECT jsonb_build_object(
    'fiscal_atrasados', COALESCE(v_fiscal.total_atrasados, 0),
    'fiscal_urgentes',  COALESCE(v_fiscal.total_urgentes, 0),
    'caixas_abertos', (
      SELECT count(*) FROM arr_caixas WHERE estado = 'aberto' AND arquivado_em IS NULL
    ),
    'aprovacoes_pendentes', (
      SELECT count(*) FROM fin_lancamentos WHERE status = 'aguardando_aprovacao'
    ),
    'centros_criticos', (
      SELECT count(*) FROM fin_alertas_centros() WHERE tipo_alerta = 'acima_orcamento'
    )
  ) INTO v_tesouraria;

  RETURN jsonb_build_object(
    'pastoral', v_pastoral,
    'secretaria', v_secretaria,
    'tesouraria', v_tesouraria,
    'gerado_em', now()
  );
END;
$$;

-- Só a Edge Function chama isto, com a service role — não expor a
-- authenticated: o resumo cruza dados de três recortes de permissão
-- diferentes (pastoral, secretaria, tesouraria) que hoje nenhum papel único
-- enxerga junto.
REVOKE ALL ON FUNCTION public.resumo_semanal_digest() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_digest() TO service_role;
