-- ─── Configuração do resumo semanal — funções de administração ─────────
--
-- Pedido da Telma (22/09/2026), depois de perguntar "onde o relatório
-- semanal é configurado?" e descobrir que era só banco/Edge Function, sem
-- tela nenhuma: "construir uma tela de configuração, para perfil de
-- administrador e dono do sistema" — ou seja, admin + diakonia, NENHUM
-- outro papel (nem secretaria, que normalmente entra em `ROLES_ADMIN` no
-- front — aqui é mais restrito de propósito).
--
-- Três funções, todas SECURITY DEFINER (o job do pg_cron e o schema `cron`
-- não são visíveis via PostgREST comum) com a MESMA guarda de permissão
-- embutida — não dá pra usar `is_admin()` sozinha porque ela só cobre
-- 'admin', não 'diakonia'.
--
-- ── A CONTA DE FUSO ───────────────────────────────────────────────────
--
-- O schedule do pg_cron (`cron.job.schedule`) é um cron de 5 campos em
-- UTC — confirmado batendo o schedule atual (`0 21 * * 5`) contra o
-- comentário da migration que criou o agendamento ("toda sexta às 18h",
-- horário de Brasília, UTC-3: 18+3=21 ✓). Em vez de somar/subtrair 3 horas
-- à mão (e acertar a virada de dia da semana quando isso cruza meia-noite
-- — 21h sexta em UTC é 18h sexta em BRT, mas 22h sexta em UTC já seria
-- 19h sexta, enquanto 2h sábado em UTC é 23h SEXTA em BRT: a linha de
-- virada do dia não é a mesma nos dois fusos), as duas funções abaixo
-- fazem o Postgres calcular isso: constroem um timestamp NAIVE na data de
-- referência (2026-09-20, um domingo, então dia_semana vira literalmente
-- a distância em dias), leem ele "AT TIME ZONE" no fuso de origem pra
-- virar timestamptz, e "AT TIME ZONE" de novo no fuso de destino pra
-- voltar a um timestamp naive — o Postgres resolve a troca de dia
-- sozinho, que é exatamente o tipo de conta que errar não avisa.

-- ── 1. Ler o horário atual + destinatários + últimas execuções ──────────
CREATE OR REPLACE FUNCTION public.sistema_resumo_semanal_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobid bigint;
  v_schedule text;
  v_ativo boolean;
  v_dia_semana int;
  v_hora int;
  v_minuto int;
  v_destinatarios jsonb;
  v_execucoes jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT jobid, schedule, active INTO v_jobid, v_schedule, v_ativo
  FROM cron.job WHERE command ILIKE '%resumo-semanal%' LIMIT 1;

  IF v_jobid IS NOT NULL THEN
    DECLARE
      v_partes text[] := regexp_split_to_array(trim(v_schedule), '\s+');
      v_min_utc int := v_partes[1]::int;
      v_hora_utc int := v_partes[2]::int;
      v_dow_utc int := v_partes[5]::int;
      -- 2026-09-20 é domingo — soma o dow direto vira a data daquele dia
      -- da semana, sem tabela de nomes.
      v_ts_utc timestamp := DATE '2026-09-20' + v_dow_utc + make_interval(hours => v_hora_utc, mins => v_min_utc);
      v_ts_local timestamp := ((v_ts_utc AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo');
    BEGIN
      v_dia_semana := extract(dow from v_ts_local)::int;
      v_hora        := extract(hour from v_ts_local)::int;
      v_minuto      := extract(minute from v_ts_local)::int;
    END;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('papel', papel, 'nome', nome, 'email', email))
    INTO v_destinatarios
  FROM resumo_semanal_destinatarios();

  SELECT jsonb_agg(jsonb_build_object('inicio', j.start_time, 'status', j.status, 'mensagem', j.return_message) ORDER BY j.start_time DESC)
    INTO v_execucoes
  FROM (
    SELECT start_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = v_jobid
    ORDER BY start_time DESC
    LIMIT 10
  ) j;

  RETURN jsonb_build_object(
    'ativo', COALESCE(v_ativo, false),
    'dia_semana', v_dia_semana,
    'hora', v_hora,
    'minuto', v_minuto,
    'destinatarios', COALESCE(v_destinatarios, '[]'::jsonb),
    'execucoes', COALESCE(v_execucoes, '[]'::jsonb)
  );
END;
$$;

-- ── 2. Trocar o horário (dia da semana 0=domingo…6=sábado, hora e minuto
--       em horário de Brasília — o que a pessoa vê e escolhe na tela) ────
CREATE OR REPLACE FUNCTION public.sistema_resumo_semanal_definir_horario(p_dia_semana int, p_hora int, p_minuto int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobid bigint;
  v_ts_local timestamp;
  v_ts_utc timestamp;
  v_cron text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_dia_semana NOT BETWEEN 0 AND 6 THEN RAISE EXCEPTION 'Dia da semana inválido'; END IF;
  IF p_hora NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'Hora inválida'; END IF;
  IF p_minuto NOT BETWEEN 0 AND 59 THEN RAISE EXCEPTION 'Minuto inválido'; END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE command ILIKE '%resumo-semanal%' LIMIT 1;
  IF v_jobid IS NULL THEN RAISE EXCEPTION 'Agendamento do resumo semanal não encontrado'; END IF;

  v_ts_local := DATE '2026-09-20' + p_dia_semana + make_interval(hours => p_hora, mins => p_minuto);
  v_ts_utc := ((v_ts_local AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC');
  v_cron := format('%s %s * * %s',
    extract(minute from v_ts_utc)::int,
    extract(hour from v_ts_utc)::int,
    extract(dow from v_ts_utc)::int);

  PERFORM cron.alter_job(v_jobid, schedule := v_cron);
END;
$$;

-- ── 3. Pausar/retomar sem apagar o agendamento ───────────────────────────
CREATE OR REPLACE FUNCTION public.sistema_resumo_semanal_pausar(p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobid bigint;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  SELECT jobid INTO v_jobid FROM cron.job WHERE command ILIKE '%resumo-semanal%' LIMIT 1;
  IF v_jobid IS NULL THEN RAISE EXCEPTION 'Agendamento do resumo semanal não encontrado'; END IF;
  PERFORM cron.alter_job(v_jobid, active := p_ativo);
END;
$$;

REVOKE ALL ON FUNCTION public.sistema_resumo_semanal_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sistema_resumo_semanal_definir_horario(int, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sistema_resumo_semanal_pausar(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_semanal_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_semanal_definir_horario(int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_semanal_pausar(boolean) TO authenticated;
