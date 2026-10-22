-- ─── Resumo DIÁRIO da Tesouraria: o e-mail com tudo para pagar no dia, enviado sozinho — Fase 1 (22/10/2026) ──────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: substituir o envio MANUAL de pagamentos. Hoje a Tesouraria monta o e-mail "Arquivos de pagamento" no "Preparar envio" e o cola no Gmail; os tesoureiros ainda não usam o sistema.
-- O estudo (docs/ESTUDO_RESUMO_DIARIO_TESOURARIA_2026-10-22.md) mostrou que as peças existem; esta é a FASE 1: o e-mail com os DADOS de pagamento (favorecido, valor, vencimento, linha digitável, Pix e a
-- ORIGEM de cada dado), SEM anexos (PDF resumo e ZIP são a Fase 2), com interruptor próprio — independente do resumo semanal —, horário e destinatários.
--
-- O QUE ESTA MIGRATION FAZ
--   1) `resumo_diario_config` (uma linha só): ligado/desligado (NASCE DESLIGADO), dias da semana, hora e minuto (Brasília), quantos dias à frente além de hoje, e se envia quando não há nada a pagar.
--   2) `resumo_diario_destinatarios`: quem recebe (os tesoureiros do Cadastro de Pessoas — não precisam ter login). Lista própria, separada dos perfis do resumo semanal.
--   3) `resumo_diario_enviados`: o que já foi ENVIADO (lançamento + quando). É o que permite avisar no e-mail "já enviado em 21/10 — confira se já pagou" e evita o pagamento em duplicidade.
--   4) O agendamento: um job do pg_cron PRÓPRIO (`resumo-diario`), criado DESLIGADO. As funções de configuração desta migration o ligam, desligam e remarcam. O resumo semanal tem outro job e não é tocado.
--   5) `resumo_diario_dados()` (só service_role): as obrigações a pagar, com o documento lido, o Pix do favorecido e o último envio — o que a Edge Function `resumo-diario` precisa.
--
-- QUEM ENTRA NO E-MAIL (as regras do "Preparar envio", mantidas)
--   · saída PREVISTA, fora transferência, vencida ou vencendo hoje (mais `janela_dias` dias à frente, se configurado);
--   · FORA: pagamento automático (débito automático, Pix recorrente, transferência programada) e reembolso a pagar — não se paga à mão;
--   · prebenda, folha, Sustento e RPA são sigilosos: a Edge Function os deixa fora do corpo (a regra é `ehSigiloso`, a mesma do envio manual).
--
-- ORDEM DE APLICAÇÃO: 1º esta migration, 2º implantar as funções (`resumo-diario` e `resumo-diario-previa`), 3º publicar o app. Aplicada sozinha NÃO envia nada: nasce desligada.
-- Reverter: docs/RESUMO_DIARIO_ROLLBACK.sql. Ensaio: docs/RESUMO_DIARIO_ENSAIO.mjs.

-- 1) configuração ------------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_diario_config (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ativo                 boolean NOT NULL DEFAULT false,
  dias_semana           integer[] NOT NULL DEFAULT '{1,2,3,4,5}' CHECK (cardinality(dias_semana) BETWEEN 1 AND 7 AND dias_semana <@ ARRAY[0,1,2,3,4,5,6]),
  hora                  integer NOT NULL DEFAULT 7 CHECK (hora BETWEEN 0 AND 23),
  minuto                integer NOT NULL DEFAULT 0 CHECK (minuto BETWEEN 0 AND 59),
  janela_dias           integer NOT NULL DEFAULT 0 CHECK (janela_dias BETWEEN 0 AND 14),
  enviar_sem_pagamentos boolean NOT NULL DEFAULT false,
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_por        uuid
);
INSERT INTO public.resumo_diario_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.resumo_diario_config IS 'Configuração do resumo diário da Tesouraria (linha única). Nasce DESLIGADO. dias_semana: 0=domingo…6=sábado; hora/minuto em Brasília; janela_dias = quantos dias à frente de hoje também entram.';

-- 2) destinatários -----------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_diario_destinatarios (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome      text NOT NULL CHECK (length(btrim(nome)) > 0),
  email     text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  membro_id uuid REFERENCES public.membros (id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resumo_diario_destinatarios_email_idx ON public.resumo_diario_destinatarios (lower(email));
COMMENT ON TABLE public.resumo_diario_destinatarios IS 'Quem recebe o resumo diário da Tesouraria (tesoureiros do Cadastro de Pessoas; não precisam ter login). Independe dos perfis do resumo semanal.';

-- 3) o que já foi enviado ---------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_diario_enviados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  valor         numeric(14, 2),
  vencimento    date,
  destinatarios integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS resumo_diario_enviados_lanc_idx ON public.resumo_diario_enviados (lancamento_id, enviado_em DESC);
COMMENT ON TABLE public.resumo_diario_enviados IS 'Cada obrigação que foi listada num resumo diário enviado (e quando). Serve para avisar "já enviado em dd/mm" e evitar pagamento em duplicidade. Só a Edge Function grava.';

ALTER TABLE public.resumo_diario_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumo_diario_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumo_diario_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumo_diario_config, public.resumo_diario_destinatarios, public.resumo_diario_enviados FROM PUBLIC, anon;
GRANT SELECT ON public.resumo_diario_config, public.resumo_diario_destinatarios, public.resumo_diario_enviados TO authenticated;
DROP POLICY IF EXISTS "Ver resumo diario" ON public.resumo_diario_config;
CREATE POLICY "Ver resumo diario" ON public.resumo_diario_config FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'diakonia'::app_role));
DROP POLICY IF EXISTS "Ver resumo diario" ON public.resumo_diario_destinatarios;
CREATE POLICY "Ver resumo diario" ON public.resumo_diario_destinatarios FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'diakonia'::app_role));
DROP POLICY IF EXISTS "Ver resumo diario" ON public.resumo_diario_enviados;
CREATE POLICY "Ver resumo diario" ON public.resumo_diario_enviados FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'diakonia'::app_role) OR has_role((SELECT auth.uid()), 'tesouraria'::app_role));

-- 4) o agendamento: job PRÓPRIO, criado DESLIGADO --------------------------------------------------------------------------------------------------------------------------------------
DO $job$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resumo-diario') THEN
    PERFORM cron.schedule(
      'resumo-diario',
      '0 10 * * 1-5',   -- seg–sex, 7h de Brasília (10h UTC): o padrão; a tela de configuração remarca
      $cmd$
      SELECT net.http_post(
        url := 'https://prjoftmlkusbjoeptabp.supabase.co/functions/v1/resumo-diario',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $cmd$
    );
  END IF;
  PERFORM cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'resumo-diario'), active := false);
END
$job$;

-- 5) a tela de configuração (admin e diakonia) ------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sistema_resumo_diario_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobid bigint; v_job_ativo boolean; v_cfg jsonb; v_dest jsonb; v_exec jsonb; v_ultimo jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT jobid, active INTO v_jobid, v_job_ativo FROM cron.job WHERE jobname = 'resumo-diario';
  SELECT to_jsonb(c) - 'id' INTO v_cfg FROM resumo_diario_config c WHERE c.id = 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'email', d.email, 'membro_id', d.membro_id) ORDER BY d.nome), '[]'::jsonb) INTO v_dest FROM resumo_diario_destinatarios d;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('inicio', j.start_time, 'status', j.status, 'mensagem', j.return_message) ORDER BY j.start_time DESC), '[]'::jsonb) INTO v_exec
    FROM (SELECT start_time, status, return_message FROM cron.job_run_details WHERE jobid = v_jobid ORDER BY start_time DESC LIMIT 10) j;
  SELECT jsonb_build_object('em', max(e.enviado_em), 'itens', count(*) FILTER (WHERE e.enviado_em >= (SELECT max(enviado_em) FROM resumo_diario_enviados) - interval '5 minutes'))
    INTO v_ultimo FROM resumo_diario_enviados e;

  RETURN jsonb_build_object('config', v_cfg, 'destinatarios', v_dest, 'execucoes', v_exec, 'agendamento_existe', v_jobid IS NOT NULL, 'agendamento_ativo', COALESCE(v_job_ativo, false), 'ultimo_envio', COALESCE(v_ultimo, '{}'::jsonb));
END;
$$;

-- p_config = {"ativo":true,"dias_semana":[1,2,3,4,5],"hora":7,"minuto":0,"janela_dias":0,"enviar_sem_pagamentos":false}
-- p_destinatarios = [{"nome":"Bruno","email":"bruno@x.org","membro_id":"…"}]   (a lista INTEIRA: o que não está nela sai)
CREATE OR REPLACE FUNCTION public.sistema_resumo_diario_salvar(p_config jsonb, p_destinatarios jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo boolean := COALESCE((p_config->>'ativo')::boolean, false);
  v_dias int[]; v_hora int := COALESCE((p_config->>'hora')::int, 7); v_minuto int := COALESCE((p_config->>'minuto')::int, 0);
  v_janela int := COALESCE((p_config->>'janela_dias')::int, 0); v_vazio boolean := COALESCE((p_config->>'enviar_sem_pagamentos')::boolean, false);
  v_jobid bigint; v_cron text; d jsonb; v_email text; v_nome text; v_n int := 0;
  v_dow int[]; v_ts_utc timestamp;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN RAISE EXCEPTION 'Configuração inválida.'; END IF;
  IF p_destinatarios IS NULL OR jsonb_typeof(p_destinatarios) <> 'array' THEN RAISE EXCEPTION 'A lista de destinatários é inválida.'; END IF;

  SELECT COALESCE(array_agg(DISTINCT x::int ORDER BY x::int), '{}') INTO v_dias FROM jsonb_array_elements_text(COALESCE(p_config->'dias_semana', '[]'::jsonb)) x;
  IF cardinality(v_dias) = 0 OR NOT (v_dias <@ ARRAY[0,1,2,3,4,5,6]) THEN RAISE EXCEPTION 'Escolha ao menos um dia da semana (0 = domingo … 6 = sábado).'; END IF;
  IF v_hora NOT BETWEEN 0 AND 23 OR v_minuto NOT BETWEEN 0 AND 59 THEN RAISE EXCEPTION 'Horário inválido.'; END IF;
  IF v_janela NOT BETWEEN 0 AND 14 THEN RAISE EXCEPTION 'A janela à frente vai de 0 a 14 dias.'; END IF;
  IF jsonb_array_length(p_destinatarios) > 20 THEN RAISE EXCEPTION 'No máximo 20 destinatários.'; END IF;

  -- destinatários: a lista inteira substitui a anterior (e-mail único, sem diferença de maiúscula)
  DELETE FROM resumo_diario_destinatarios WHERE lower(email) NOT IN (SELECT lower(btrim(x->>'email')) FROM jsonb_array_elements(p_destinatarios) x);
  FOR d IN SELECT * FROM jsonb_array_elements(p_destinatarios) LOOP
    v_email := btrim(d->>'email'); v_nome := btrim(COALESCE(d->>'nome', ''));
    IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'E-mail inválido: %.', COALESCE(v_email, '(vazio)'); END IF;
    IF v_nome = '' THEN v_nome := v_email; END IF;
    INSERT INTO resumo_diario_destinatarios (nome, email, membro_id)
    VALUES (v_nome, v_email, NULLIF(d->>'membro_id', '')::uuid)
    ON CONFLICT (lower(email)) DO UPDATE SET nome = EXCLUDED.nome, membro_id = EXCLUDED.membro_id;
    v_n := v_n + 1;
  END LOOP;
  IF v_ativo AND v_n = 0 THEN RAISE EXCEPTION 'Cadastre ao menos um destinatário antes de ligar o resumo diário.'; END IF;

  UPDATE resumo_diario_config SET ativo = v_ativo, dias_semana = v_dias, hora = v_hora, minuto = v_minuto, janela_dias = v_janela, enviar_sem_pagamentos = v_vazio,
         atualizado_em = now(), atualizado_por = auth.uid() WHERE id = 1;

  -- o agendamento acompanha: cron em UTC. A conta de fuso é do Postgres (o Brasil não tem horário de verão): cada dia vira o seu dia/hora em UTC, que pode cair no dia seguinte.
  SELECT COALESCE(array_agg(DISTINCT extract(dow FROM ((DATE '2026-09-20' + dia + make_interval(hours => v_hora, mins => v_minuto)) AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC'))::int
                            ORDER BY extract(dow FROM ((DATE '2026-09-20' + dia + make_interval(hours => v_hora, mins => v_minuto)) AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC'))::int), '{}')
    INTO v_dow FROM unnest(v_dias) AS dia;
  v_ts_utc := (DATE '2026-09-20' + make_interval(hours => v_hora, mins => v_minuto)) AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'UTC';
  v_cron := format('%s %s * * %s', extract(minute FROM v_ts_utc)::int, extract(hour FROM v_ts_utc)::int, array_to_string(v_dow, ','));

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'resumo-diario';
  IF v_jobid IS NULL THEN RAISE EXCEPTION 'O agendamento do resumo diário não foi encontrado (job resumo-diario).'; END IF;
  PERFORM cron.alter_job(v_jobid, schedule := v_cron, active := v_ativo);
END;
$$;

-- 6) os dados do dia (só a Edge Function) -------------------------------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resumo_diario_dados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" = 'America/Sao_Paulo'
AS $$
DECLARE
  v_cfg resumo_diario_config; v_itens jsonb; v_dest jsonb;
BEGIN
  SELECT * INTO v_cfg FROM resumo_diario_config WHERE id = 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', l.id, 'data', l.data, 'valor', l.valor, 'dias_para_vencer', (l.data - CURRENT_DATE),
           'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', f.nome, 'pessoa_nome', m.nome_completo, 'descricao', l.descricao,
           'categoria', c.nome, 'centro', ce.nome, 'chave_pix', NULLIF(btrim(f.chave_pix), ''), 'tipo_chave_pix', f.tipo_chave_pix,
           'ultimo_envio', (SELECT max(e.enviado_em) FROM resumo_diario_enviados e WHERE e.lancamento_id = l.id),
           'anexos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'dados', a.dados_extraidos) ORDER BY a.enviado_em DESC)
                                 FROM fin_lancamento_anexos a WHERE a.lancamento_id = l.id), '[]'::jsonb)
         ) ORDER BY l.data, l.valor DESC), '[]'::jsonb)
    INTO v_itens
    FROM fin_lancamentos l
    LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
    LEFT JOIN membros m ON m.id = l.pessoa_id
    LEFT JOIN fin_categorias c ON c.id = l.categoria_id
    LEFT JOIN fin_centros_custo ce ON ce.id = l.centro_custo_id
   WHERE l.tipo::text = 'saida' AND l.status::text = 'previsto' AND l.origem::text IS DISTINCT FROM 'transferencia'
     AND COALESCE(l.forma_liquidacao::text, 'manual') NOT IN ('debito_automatico', 'pix_recorrente', 'transferencia_programada')
     AND l.data <= CURRENT_DATE + v_cfg.janela_dias
     AND NOT EXISTS (SELECT 1 FROM vw_fin_quitacao q WHERE q.obrigacao_id = COALESCE(l.obrigacao_id, l.id) AND q.intencao = 'reembolso');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', d.nome, 'email', d.email) ORDER BY d.nome), '[]'::jsonb) INTO v_dest FROM resumo_diario_destinatarios d;

  RETURN jsonb_build_object(
    'hoje', CURRENT_DATE, 'dow', extract(dow FROM CURRENT_DATE)::int, 'gerado_em', now(),
    'config', to_jsonb(v_cfg) - 'id' - 'atualizado_em' - 'atualizado_por', 'destinatarios', v_dest, 'itens', v_itens,
    -- o último envio de qualquer item: a Edge Function não repete o envio se o agendamento disparar duas vezes (ou alguém chamar a URL de novo)
    'ultimo_envio_geral', (SELECT max(enviado_em) FROM resumo_diario_enviados)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sistema_resumo_diario_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sistema_resumo_diario_salvar(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_diario_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_diario_salvar(jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.resumo_diario_dados() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_diario_dados() TO service_role;
