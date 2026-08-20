-- ---------------------------------------------------------------------------
-- A maquina de sugestao de voluntarios volta a rodar
-- ---------------------------------------------------------------------------
--
-- `sugerir_voluntarios_escala` existe no banco desde que a estrutura de
-- escalas foi criada, com o motor completo: score composto, penalidade por
-- sobrecarga, bonus por tempo sem servir, area preferida, area a evitar, e um
-- `motivo` legivel por pessoa.
--
-- Ela NUNCA rodou. Toda chamada, em toda area, morria em:
--
--   invalid input value for enum atuacao_status: "ativo"
--
-- O enum `atuacao_status` tem dois valores: `ativa` e `encerrada`. O corpo da
-- funcao compara com 'ativo'.
--
-- A troca e de uma letra, e a armadilha e que os dois estao no mesmo SELECT:
--
--   av.status = 'ativo'   -- atuacao_status  -> ERRADO, e 'ativa'
--   m.status  = 'ativo'   -- membro_status   -> CERTO, esse enum tem 'ativo'
--
-- `membro_status` e `ativo | inativo | transferido | falecido | desligado`.
-- `atuacao_status` e `ativa | encerrada`. Duas colunas chamadas `status`, dois
-- enums, generos diferentes. So a primeira muda.
--
-- Por que o erro passou despercebido: valor invalido de enum nao filtra a
-- menos — o Postgres rejeita a consulta INTEIRA. Como nenhuma tela chamava a
-- funcao, ninguem viu o erro. O motor estava escrito, testado no papel, e
-- inalcancavel.
--
-- Este arquivo NAO muda mais nada da funcao. Ha uma segunda lacuna conhecida
-- — `p_dia_semana` e `p_turno` sao aceitos e nunca usados no corpo — e ela
-- fica para uma migration propria, porque acrescentar filtro e decisao de
-- produto, nao correcao de defeito.
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
  v_mes_atual  DATE := date_trunc('month', p_data_evento)::DATE;
  v_mes_fim    DATE := (date_trunc('month', p_data_evento) + interval '1 month - 1 day')::DATE;
BEGIN
  RETURN QUERY
  WITH
  -- Voluntários cadastrados nessa área
  voluntarios_area AS (
    SELECT av.membro_id AS pid
    FROM area_voluntarios av
    WHERE av.area_id = p_area_id
      AND av.status = 'ativa'          -- <<< era 'ativo'; atuacao_status é ativa|encerrada
      AND av.data_fim IS NULL
  ),
  -- Escalas do mês corrente por pessoa
  escalas_mes AS (
    SELECT ev.pessoa_id, count(*) AS total_mes
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE e.area_id = p_area_id
      AND e.data_evento BETWEEN v_mes_atual AND v_mes_fim
      AND ev.status NOT IN ('recusado')
    GROUP BY ev.pessoa_id
  ),
  -- Última escala servida
  ultima_escala AS (
    SELECT ev.pessoa_id,
           max(e.data_evento) AS ultima_data
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE ev.status IN ('confirmado','presente')
    GROUP BY ev.pessoa_id
  ),
  -- Já escalado para este evento
  ja_escalado AS (
    SELECT ev.pessoa_id
    FROM escala_voluntarios ev
    JOIN escalas e ON e.id = ev.escala_id
    WHERE e.area_id = p_area_id
      AND e.data_evento = p_data_evento
      AND ev.status != 'recusado'
  )
  SELECT
    m.id                          AS pessoa_id,
    m.nome_completo,
    -- Score composto (0-100)
    ROUND(
      GREATEST(0, LEAST(100,
        -- Base: 50 pts
        50.0
        -- Bonus por dias sem servir (max +30)
        + LEAST(30.0, COALESCE((p_data_evento - ue.ultima_data), 60) * 0.5)
        -- Penalidade por sobrecarga
        - COALESCE(ps.nivel_sobrecarga, 0) * 3.0
        -- Penalidade por escalas no mês
        - COALESCE(em.total_mes, 0) * 8.0
        -- Bonus por ser voluntário da área preferida
        + CASE WHEN p_area_id = ANY(COALESCE(ps.areas_preferidas, '{}')) THEN 10.0 ELSE 0 END
        -- Penalidade área a evitar
        - CASE WHEN p_area_id = ANY(COALESCE(ps.areas_evitar, '{}')) THEN 20.0 ELSE 0 END
      ))
    , 2) AS score,
    -- Motivo legível
    CASE
      WHEN ps.em_descanso = true THEN 'Em período de descanso'
      WHEN ja_escalado.pessoa_id IS NOT NULL THEN 'Já escalado para este evento'
      WHEN COALESCE(em.total_mes, 0) >= COALESCE(ps.max_escalas_mes, 4) THEN 'Atingiu limite mensal'
      WHEN COALESCE(ps.nivel_sobrecarga, 0) >= 7 THEN 'Carga elevada — revisão pastoral recomendada'
      WHEN COALESCE(ps.nivel_sobrecarga, 0) >= 4 THEN 'Carga moderada — usar com cuidado'
      WHEN ue.ultima_data IS NULL THEN 'Nunca serviu — ótima oportunidade de incluir'
      WHEN (p_data_evento - ue.ultima_data) > 30 THEN 'Disponível há muito tempo — priorizar'
      ELSE 'Disponível'
    END AS motivo,
    ue.ultima_data                AS ultima_escala_em,
    COALESCE(em.total_mes, 0)    AS total_escalas_mes,
    COALESCE(ps.carga_atual_mes, 0) AS carga_atual,
    COALESCE(ps.nivel_sobrecarga, 0) AS nivel_sobrecarga,
    -- Disponível = não está de descanso, não atingiu limite, não já escalado
    (COALESCE(ps.em_descanso, false) = false
     AND ja_escalado.pessoa_id IS NULL
     AND COALESCE(em.total_mes, 0) < COALESCE(ps.max_escalas_mes, 4)
    ) AS disponivel,
    COALESCE(ps.em_descanso, false) AS em_descanso
  FROM voluntarios_area va
  JOIN membros m ON m.id = va.pid AND m.status = 'ativo'   -- membro_status: 'ativo' está certo
  LEFT JOIN perfil_servico ps ON ps.pessoa_id = va.pid AND ps.ativo = true
  LEFT JOIN escalas_mes em ON em.pessoa_id = va.pid
  LEFT JOIN ultima_escala ue ON ue.pessoa_id = va.pid
  LEFT JOIN ja_escalado ON ja_escalado.pessoa_id = va.pid
  -- Desempate por nome: sem ele, duas chamadas iguais podem devolver a mesma
  -- gente em ordem diferente, e uma sugestao que dança a cada abertura de tela
  -- deixa de parecer confiavel.
  ORDER BY disponivel DESC, score DESC, m.nome_completo ASC
  LIMIT p_limite;
END;
$function$;
