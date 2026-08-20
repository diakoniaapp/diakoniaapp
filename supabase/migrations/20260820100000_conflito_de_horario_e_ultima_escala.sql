-- ---------------------------------------------------------------------------
-- Sprint 5: dupla escala no mesmo horario, e o conserto de `ultima_escala_em`
-- ---------------------------------------------------------------------------
--
-- ── 1. A MESMA PESSOA EM DOIS LUGARES AO MESMO TEMPO ──────────────────────
--
-- O motor ja evitava escalar duas vezes na MESMA area do mesmo evento. Nao
-- via nada fora dela: o mesmo voluntario podia ser posto na Recepcao e na
-- Cantina do mesmo culto, e as duas telas mostrariam tudo em ordem.
--
-- Numa igreja isso e comum e nem sempre e erro — servir de manha na EBD e de
-- noite no culto e normal. O que nao pode e SOBREPOR horario. Por isso a
-- checagem usa a hora, e nao a data:
--
--   escalas no mesmo dia cujo intervalo [inicio, fim) cruza o desta
--
-- Quando nao ha horario em nenhum dos lados, cai para "mesmo dia" — sem hora
-- nao da para afirmar sobreposicao, e o aviso vale mais que o silencio.
--
-- Os dois novos parametros entram com DEFAULT NULL: as chamadas que ja
-- existem continuam funcionando sem alteracao, e sem a checagem.
--
-- ── 2. `ultima_escala_em` CARIMBAVA O DIA ERRADO ──────────────────────────
--
-- O gatilho gravava `ultima_escala_em = CURRENT_DATE`: o dia em que o lider
-- CLICOU, nao o dia em que a pessoa serviu. Numa escala montada com duas
-- semanas de antecedencia, "ultima escala" virava a data da confirmacao.
--
-- Registrei isto ontem como decisao de produto — "vale mais quando serviu ou
-- quando confirmou?" — e a resposta e clara quando se olha quem usa a coluna:
--
--   o motor de sugestoes NAO a usa. Calcula por max(e.data_evento), que esta
--   certo, e por isso o score sempre esteve certo.
--
--   o painel de voluntarios USA, e mostra "sem servir ha N dias". Com a data
--   da confirmacao, alguem que confirmou hoje para dali a duas semanas
--   aparecia como "serviu hoje".
--
-- Sao dois numeros com o mesmo nome e definicoes diferentes. Passam a ser um
-- so: a data do evento mais recente JA ACONTECIDO em que a pessoa esteve
-- confirmada ou presente.
--
-- O `<= CURRENT_DATE` e o que impede a coluna de apontar para o futuro. Sem
-- ele, quem esta escalado para o proximo domingo teria "ultima escala" daqui
-- a tres dias, e "sem servir ha -3 dias" na tela.
-- ---------------------------------------------------------------------------

-- ═══ 1. O gatilho ════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_atualizar_carga_voluntario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
DECLARE
  v_mes_inicio DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_mes_fim    DATE := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  v_total_mes  INT;
  v_max_mes    INT;
  v_sobrecarga INT;
  v_area       UUID;
BEGIN
  SELECT count(*) INTO v_total_mes
  FROM escala_voluntarios ev
  JOIN escalas e ON e.id = ev.escala_id
  WHERE ev.pessoa_id = NEW.pessoa_id
    AND ev.status NOT IN ('recusado')
    AND e.data_evento BETWEEN v_mes_inicio AND v_mes_fim;

  SELECT max_escalas_mes INTO v_max_mes
  FROM perfil_servico WHERE pessoa_id = NEW.pessoa_id;
  v_max_mes := COALESCE(v_max_mes, 4);

  v_sobrecarga := LEAST(10, GREATEST(0, ROUND((v_total_mes::NUMERIC / GREATEST(v_max_mes, 1)) * 10)));

  INSERT INTO public.perfil_servico (pessoa_id, carga_atual_mes, nivel_sobrecarga)
  VALUES (NEW.pessoa_id, v_total_mes, v_sobrecarga)
  ON CONFLICT (pessoa_id) DO UPDATE
    SET carga_atual_mes  = v_total_mes,
        nivel_sobrecarga = v_sobrecarga,
        updated_at       = now();

  SELECT e.area_id INTO v_area FROM escalas e WHERE e.id = NEW.escala_id;

  IF v_area IS NOT NULL THEN
    UPDATE public.area_voluntarios av
    SET
      -- A data do EVENTO, e só de evento que já aconteceu. Antes era
      -- CURRENT_DATE: o dia do clique, não o dia do serviço.
      ultima_escala_em = (
        SELECT max(e3.data_evento)
        FROM escala_voluntarios ev3
        JOIN escalas e3 ON e3.id = ev3.escala_id
        WHERE ev3.pessoa_id = NEW.pessoa_id
          AND e3.area_id = v_area
          AND ev3.status IN ('confirmado','presente')
          AND e3.data_evento <= CURRENT_DATE
      ),
      total_escalas = (
        SELECT count(*)
        FROM escala_voluntarios ev2
        JOIN escalas e2 ON e2.id = ev2.escala_id
        WHERE ev2.pessoa_id = NEW.pessoa_id
          AND e2.area_id = v_area
          AND ev2.status IN ('confirmado','presente')
      )
    WHERE av.membro_id = NEW.pessoa_id
      AND av.area_id = v_area;
  END IF;

  RETURN NEW;
END;
$function$;

-- ═══ 2. O motor, com a checagem de horario ═══════════════════════════════
CREATE OR REPLACE FUNCTION public.sugerir_voluntarios_escala(
  p_area_id     uuid,
  p_data_evento date,
  p_dia_semana  text DEFAULT NULL::text,
  p_turno       text DEFAULT NULL::text,
  p_limite      integer DEFAULT 10,
  p_hora_inicio time DEFAULT NULL::time,
  p_hora_fim    time DEFAULT NULL::time
)
RETURNS TABLE(
  pessoa_id         uuid,
  nome_completo     text,
  score             numeric,
  motivo            text,
  ultima_escala_em  date,
  total_escalas_mes bigint,
  carga_atual       integer,
  nivel_sobrecarga  integer,
  disponivel        boolean,
  em_descanso       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mes_atual DATE := date_trunc('month', p_data_evento)::DATE;
  v_mes_fim   DATE := (date_trunc('month', p_data_evento) + interval '1 month - 1 day')::DATE;
BEGIN
  RETURN QUERY
  WITH
  voluntarios_area AS (
    SELECT av.membro_id AS pid
    FROM area_voluntarios av
    WHERE av.area_id = p_area_id
      AND av.status = 'ativa'
      AND av.data_fim IS NULL
  ),
  escalas_mes AS (
    SELECT ev.pessoa_id, count(*) AS total_mes
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE e.area_id = p_area_id
      AND e.data_evento BETWEEN v_mes_atual AND v_mes_fim
      AND ev.status NOT IN ('recusado')
    GROUP BY ev.pessoa_id
  ),
  ultima_escala AS (
    SELECT ev.pessoa_id, max(e.data_evento) AS ultima_data
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE ev.status IN ('confirmado','presente')
      AND e.data_evento <= p_data_evento
    GROUP BY ev.pessoa_id
  ),
  ja_escalado AS (
    SELECT ev.pessoa_id
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE e.area_id = p_area_id
      AND e.data_evento = p_data_evento
      AND ev.status != 'recusado'
  ),
  -- Em OUTRA área, no mesmo dia, com horário que cruza o desta escala.
  -- `tsrange` com limite aberto no fim: 10h–12h e 12h–14h não se cruzam.
  conflito_horario AS (
    SELECT ev.pessoa_id, min(COALESCE(a.nome, e.titulo)) AS onde
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    LEFT JOIN areas a ON a.id = e.area_id
    WHERE e.data_evento = p_data_evento
      AND e.area_id IS DISTINCT FROM p_area_id
      AND ev.status != 'recusado'
      AND (
        p_hora_inicio IS NULL OR e.hora_inicio IS NULL
        OR tsrange(
             (p_data_evento + p_hora_inicio)::timestamp,
             (p_data_evento + COALESCE(p_hora_fim, p_hora_inicio + interval '1 hour'))::timestamp,
             '[)')
           && tsrange(
             (e.data_evento + e.hora_inicio)::timestamp,
             (e.data_evento + COALESCE(e.hora_fim, e.hora_inicio + interval '1 hour'))::timestamp,
             '[)')
      )
    GROUP BY ev.pessoa_id
  ),
  base AS (
    SELECT
      m.id AS pessoa_id,
      m.nome_completo,
      (p_dia_semana IS NOT NULL
        AND ps.dias_disponiveis IS NOT NULL
        AND array_length(ps.dias_disponiveis, 1) > 0
        AND NOT (p_dia_semana::dia_semana = ANY (ps.dias_disponiveis))
      ) AS fora_do_dia,
      (p_turno IS NOT NULL
        AND ps.turnos_disponiveis IS NOT NULL
        AND array_length(ps.turnos_disponiveis, 1) > 0
        AND NOT ('dia_todo'::turno_disponibilidade = ANY (ps.turnos_disponiveis))
        AND NOT (p_turno::turno_disponibilidade = ANY (ps.turnos_disponiveis))
      ) AS fora_do_turno,
      ch.onde AS conflito_com,
      ROUND(
        GREATEST(0, LEAST(100,
          50.0
          + LEAST(40.0, COALESCE((p_data_evento - ue.ultima_data), 90) * 0.5)
          - COALESCE(ps.nivel_sobrecarga, 0) * 3.0
          - COALESCE(em.total_mes, 0) * 8.0
          + CASE WHEN p_area_id = ANY(COALESCE(ps.areas_preferidas, '{}')) THEN 10.0 ELSE 0 END
          - CASE WHEN p_area_id = ANY(COALESCE(ps.areas_evitar, '{}')) THEN 20.0 ELSE 0 END
        ))
      , 2) AS score,
      ue.ultima_data                  AS ultima_escala_em,
      COALESCE(em.total_mes, 0)       AS total_escalas_mes,
      COALESCE(ps.carga_atual_mes, 0) AS carga_atual,
      COALESCE(ps.nivel_sobrecarga,0) AS nivel_sobrecarga,
      COALESCE(ps.em_descanso, false) AS em_descanso,
      (ja_escalado.pessoa_id IS NOT NULL) AS ja_esta,
      COALESCE(ps.max_escalas_mes, 4) AS max_mes,
      (ps.pessoa_id IS NOT NULL)      AS tem_perfil
    FROM voluntarios_area va
    JOIN membros m ON m.id = va.pid AND m.status = 'ativo'
    LEFT JOIN perfil_servico ps ON ps.pessoa_id = va.pid AND ps.ativo = true
    LEFT JOIN escalas_mes em ON em.pessoa_id = va.pid
    LEFT JOIN ultima_escala ue ON ue.pessoa_id = va.pid
    LEFT JOIN ja_escalado ON ja_escalado.pessoa_id = va.pid
    LEFT JOIN conflito_horario ch ON ch.pessoa_id = va.pid
  ),
  julgada AS (
    SELECT b.*,
      (b.em_descanso = false
       AND b.ja_esta = false
       AND b.conflito_com IS NULL
       AND b.total_escalas_mes < b.max_mes
       AND b.fora_do_dia = false
       AND b.fora_do_turno = false
      ) AS disp,
      CASE
        WHEN b.em_descanso              THEN 'Em período de descanso'
        WHEN b.ja_esta                  THEN 'Já escalado para este evento'
        -- Antes de qualquer outra razão: estar em dois lugares ao mesmo tempo
        -- é impossível, e as outras razões são só desaconselhamento.
        WHEN b.conflito_com IS NOT NULL THEN 'Já escalado em ' || b.conflito_com || ' neste horário'
        WHEN b.total_escalas_mes >= b.max_mes THEN 'Atingiu o limite do mês'
        WHEN b.fora_do_dia              THEN 'Não serve neste dia da semana'
        WHEN b.fora_do_turno            THEN 'Não serve neste turno'
        WHEN b.nivel_sobrecarga >= 7    THEN 'Carga elevada — revisão pastoral recomendada'
        WHEN b.nivel_sobrecarga >= 4    THEN 'Carga moderada — usar com cuidado'
        WHEN b.ultima_escala_em IS NULL AND NOT b.tem_perfil
                                        THEN 'Nunca serviu — e ainda não disse quando pode'
        WHEN b.ultima_escala_em IS NULL THEN 'Nunca serviu — ótima oportunidade de incluir'
        WHEN (p_data_evento - b.ultima_escala_em) > 30
                                        THEN 'Sem servir há ' || (p_data_evento - b.ultima_escala_em) || ' dias — priorizar'
        WHEN NOT b.tem_perfil           THEN 'Disponível, mas não informou quando pode servir'
        ELSE 'Disponível'
      END AS razao
    FROM base b
  ),
  ordenada AS (
    SELECT j.*,
      row_number() OVER (PARTITION BY j.disp ORDER BY j.score DESC, j.nome_completo ASC) AS posicao
    FROM julgada j
  )
  SELECT
    o.pessoa_id, o.nome_completo, o.score, o.razao,
    o.ultima_escala_em, o.total_escalas_mes, o.carga_atual,
    o.nivel_sobrecarga, o.disp, o.em_descanso
  FROM ordenada o
  WHERE o.posicao <= p_limite
  ORDER BY o.disp DESC, o.score DESC, o.nome_completo ASC;
END;
$function$;
