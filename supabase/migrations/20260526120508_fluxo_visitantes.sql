-- ============================================================
-- FLUXO DE CUIDADO DE VISITANTES
-- View: v_fluxo_visitantes
-- Função: atualizar_status_visitantes()
-- ============================================================

-- 1. VIEW PRINCIPAL -----------------------------------------
CREATE OR REPLACE VIEW public.v_fluxo_visitantes AS
SELECT
  id,
  nome_completo,
  telefone_celular                               AS telefone,
  COALESCE(numero_visitas, 1)                    AS numero_visitas,
  status_acolhimento,
  ultimo_contato_em,
  created_at,

  DATE_PART('day', NOW() - created_at)::INTEGER  AS dias_desde_cadastro,

  CASE
    WHEN COALESCE(numero_visitas, 1) >= 2                                        THEN 'retornou'
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at <= INTERVAL '1 day'   THEN 'boas_vindas'
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at <= INTERVAL '3 days'  THEN 'incentivo'
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at <= INTERVAL '7 days'  THEN 'cuidado'
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at >  INTERVAL '15 days' THEN 'nao_voltou'
    ELSE 'em_acompanhamento'
  END                                            AS etapa_fluxo,

  CASE
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at > INTERVAL '15 days' THEN 'alta'
    WHEN COALESCE(numero_visitas, 1) = 1 AND NOW() - created_at > INTERVAL '7 days'  THEN 'media'
    ELSE 'baixa'
  END                                            AS prioridade,

  CASE
    WHEN ultimo_contato_em IS NULL                              THEN true
    WHEN NOW() - ultimo_contato_em > INTERVAL '2 days'         THEN true
    ELSE false
  END                                            AS precisa_acao

FROM public.membros
WHERE tipo_pessoa = 'visitante';

-- Grant acesso à role autenticada
GRANT SELECT ON public.v_fluxo_visitantes TO authenticated;
GRANT SELECT ON public.v_fluxo_visitantes TO anon;


-- 2. FUNÇÃO DE AUTO-UPDATE DIÁRIO ---------------------------
CREATE OR REPLACE FUNCTION public.atualizar_status_visitantes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Visitante não voltou em mais de 15 dias → nao_retornou
  UPDATE public.membros
  SET
    status_acolhimento = 'nao_retornou'
  WHERE
    tipo_pessoa        = 'visitante'
    AND COALESCE(numero_visitas, 1) = 1
    AND NOW() - created_at > INTERVAL '15 days'
    AND COALESCE(status_acolhimento, '') NOT IN
        ('nao_retornou', 'integrado', 'retornou', 'inativo');

  -- Visitante retornou → retornou
  UPDATE public.membros
  SET
    status_acolhimento = 'retornou'
  WHERE
    tipo_pessoa        = 'visitante'
    AND COALESCE(numero_visitas, 1) >= 2
    AND COALESCE(status_acolhimento, '') NOT IN
        ('integrado', 'retornou');
END;
$$;

-- Permissão para service_role executar
GRANT EXECUTE ON FUNCTION public.atualizar_status_visitantes() TO service_role;

-- Comentário
COMMENT ON FUNCTION public.atualizar_status_visitantes() IS
  'Atualiza status_acolhimento dos visitantes com base nas regras de tempo de retorno. Execute diariamente via pg_cron ou Supabase Edge Function.';
