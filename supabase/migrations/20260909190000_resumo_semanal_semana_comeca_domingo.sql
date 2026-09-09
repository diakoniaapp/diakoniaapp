-- ─── resumo_semanal_digest(): "semana" vira domingo–sábado ─────────────────
--
-- Pedido dela em 09/09/2026: "a semana deve começar no domingo".
--
-- `aniversarios_semana`/`bodas_semana` vinham de `resumo_painel_pastoral()`,
-- que por sua vez usa `agenda_pastoral_proximos_dias(7)` — uma janela MÓVEL,
-- hoje + os 7 dias seguintes, sem relação com domingo nenhum. Faz sentido lá:
-- é a mesma função que alimenta a tira "Sete dias" da Home e do Painel
-- Pastoral, pensada pra responder "o que vem por aí a partir de agora",
-- não "o que tem nesta semana do calendário" — e ela continua exatamente
-- assim, sem mudança nenhuma aqui.
--
-- O resumo semanal por e-mail é outra pergunta. Ele sai toda sexta às 18h —
-- ver a migration 20260909181500 — "antes do culto, tempo de agir sobre o
-- que o resumo apontar até domingo". A semana que ele deveria descrever não
-- é "os próximos 7 dias corridos a partir de sexta", é a semana litúrgica
-- que começa dali a dois dias: domingo a sábado.
--
-- ── A CONTA ──────────────────────────────────────────────────────────────
--
-- `EXTRACT(DOW FROM data)` no Postgres já numera domingo como 0 — a mesma
-- convenção que se está pedindo, embutida na função nativa, então não há
-- tabela de dias pra escrever à mão. `(7 - DOW) % 7` dá quantos dias faltam
-- até o PRÓXIMO domingo, e é 0 quando hoje já é domingo (não "daqui a uma
-- semana"). Funciona pra qualquer dia em que a função rodar, não só sexta —
-- o agendamento pode mudar sem que esta conta precise mudar junto.
--
-- `agenda_pastoral_proximos_dias(p_dias)` filtra `data_evento BETWEEN
-- current_date AND current_date + p_dias` — para cobrir do domingo até
-- domingo+6, `p_dias` tem que alcançar pelo menos esse fim, daí o cálculo
-- de `v_dias_cobertura` em vez de um número fixo: cobre certo não importa
-- em que dia da semana a função for chamada.
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

  -- ── Pastoral ──────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'aniversarios_semana', (
      SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p
       WHERE p.tipo = 'aniversario'
         AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6
    ),
    'bodas_semana', (
      SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p
       WHERE p.tipo = 'casamento'
         AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6
    ),
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

REVOKE ALL ON FUNCTION public.resumo_semanal_digest() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_digest() TO service_role;
