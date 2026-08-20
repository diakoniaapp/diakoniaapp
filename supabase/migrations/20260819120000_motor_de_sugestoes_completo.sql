-- ---------------------------------------------------------------------------
-- Sprint 3: o motor de sugestoes passa a usar o que a Sprint 2 coletou
-- ---------------------------------------------------------------------------
--
-- A migration 20260819100000 fez a funcao voltar a rodar. Esta faz ela
-- responder direito. Tres defeitos, todos revelados ao testar com dados
-- plantados numa transacao desfeita.
--
-- ── 1. `p_dia_semana` E `p_turno` ERAM ACEITOS E IGNORADOS ─────────────────
--
-- A assinatura promete filtrar por disponibilidade. O corpo nao mencionava
-- nenhum dos dois parametros. Sem isto, a Sprint 2 coletaria dias e turnos que
-- o motor nunca leria.
--
-- A regra do filtro NAO e "quem nao marcou o dia esta fora". E:
--
--   tem perfil E marcou dias E o dia pedido nao esta neles  -> indisponivel
--   nao tem perfil, ou nao marcou dia nenhum                -> nao da para dizer
--
-- A diferenca importa: 74 voluntarios e 8 perfis. Tratar "ninguem perguntou"
-- como "nao pode" esvaziaria a lista inteira e faria o motor parecer quebrado
-- justamente quando comecou a funcionar.
--
-- `dia_todo` satisfaz qualquer turno pedido.
--
-- ── 2. O LIMITE ESCONDIA OS INDISPONIVEIS ──────────────────────────────────
--
-- Com `ORDER BY disponivel DESC` e `LIMIT 8`, quem esta de descanso cai para o
-- fim e, havendo candidatos suficientes, nunca aparece. Medido na simulacao:
-- Ana Paula (em descanso) e Andreia (no limite) sumiam da lista de 8.
--
-- O lider nao descobria POR QUE fulano nao foi sugerido — e "nao aparece" e
-- indistinguivel de "nao existe". Agora o limite vale para cada grupo
-- separadamente: os melhores disponiveis E os indisponiveis mais relevantes,
-- cada um com seu motivo escrito.
--
-- ── 3. O BONUS SATURAVA CEDO DEMAIS ────────────────────────────────────────
--
-- `LEAST(30, dias * 0.5)` chega ao teto em 60 dias, e quem nunca serviu
-- entrava com o mesmo 60 por COALESCE. Resultado medido: quem nunca serviu e
-- quem serviu ha 91 dias marcavam identicos 80.
--
-- O teto sobe para 40 (chega aos 80 dias) e quem nunca serviu entra no teto.
-- O empate no topo agora e DELIBERADO: quem nunca serviu e quem sumiu ha tres
-- meses merecem a mesma prioridade — as duas sao chamadas a incluir alguem.
-- O que nao pode e alguem de 61 dias empatar com alguem de 200.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sugerir_voluntarios_escala(
  p_area_id     uuid,
  p_data_evento date,
  p_dia_semana  text DEFAULT NULL::text,
  p_turno       text DEFAULT NULL::text,
  p_limite      integer DEFAULT 10
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
  base AS (
    SELECT
      m.id            AS pessoa_id,
      m.nome_completo,

      -- ── Choca com o dia pedido? ────────────────────────────────────────
      -- Só é TRUE quando há informação suficiente para afirmar. Perfil
      -- ausente, ou lista de dias vazia, devolve FALSE: não sabemos.
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

      ROUND(
        GREATEST(0, LEAST(100,
          50.0
          -- Teto de 40, alcançado aos 80 dias. Quem nunca serviu entra no
          -- teto (o COALESCE de 90 dias * 0.5 = 45, cortado em 40).
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
  ),
  julgada AS (
    SELECT b.*,
      (b.em_descanso = false
       AND b.ja_esta = false
       AND b.total_escalas_mes < b.max_mes
       AND b.fora_do_dia = false
       AND b.fora_do_turno = false
      ) AS disp,
      CASE
        WHEN b.em_descanso              THEN 'Em período de descanso'
        WHEN b.ja_esta                  THEN 'Já escalado para este evento'
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
  -- O limite passa a valer POR GRUPO: os melhores disponíveis e os
  -- indisponíveis mais relevantes. Antes, um bloqueava o outro.
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
