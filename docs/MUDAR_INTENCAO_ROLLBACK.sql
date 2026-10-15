-- ROLLBACK — Fase 2B: remove a ação e a guarda. Nenhum dado é tocado. O evento intencao_mudada continua aceito se já houver algum (é história).
DROP TRIGGER IF EXISTS fin_quitacoes_intencao_guarda ON public.fin_quitacoes;
DROP FUNCTION IF EXISTS public.fin_quitacoes_intencao_guarda();
DROP FUNCTION IF EXISTS public.fin_mudar_intencao(uuid, text, text);
DO $rb$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos WHERE evento = 'intencao_mudada') THEN
    ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT IF EXISTS fin_quitacao_eventos_evento_check;
    ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
      ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
       'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada', 'declaracao_invalidada'));
  END IF;
END
$rb$;
