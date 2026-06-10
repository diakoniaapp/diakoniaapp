-- ─── Agenda Pastoral: eventos automáticos (aniversários + bodas) ───────────

-- View que unifica em um único feed:
--  - Aniversários de pessoas (uma linha por pessoa ativa com data_nascimento)
--  - Aniversários de casamento (uma linha por família com data_casamento)

CREATE OR REPLACE VIEW public.vw_agenda_pastoral AS
SELECT 
  'aniversario'::text          AS tipo,
  m.id::text                   AS ref_id,
  m.id                         AS pessoa_id,
  NULL::uuid                   AS familia_id,
  m.nome_completo              AS titulo,
  m.nome_completo              AS subtitulo,
  m.data_nascimento            AS data_origem,
  -- Próxima ocorrência neste ano (ou no próximo se já passou hoje)
  (date_trunc('year', CURRENT_DATE) 
    + (date_part('doy', m.data_nascimento) - 1)::int * INTERVAL '1 day')::date 
    AS proxima_data,
  date_part('year', AGE(CURRENT_DATE, m.data_nascimento))::int AS anos_vai_completar,
  m.telefone_celular           AS telefone,
  NULL::text                   AS telefone_secundario
FROM public.membros m
WHERE m.status = 'ativo'
  AND m.data_nascimento IS NOT NULL
  AND m.tipo_pessoa IN ('membro','congregado','visitante')

UNION ALL

SELECT 
  'casamento'::text            AS tipo,
  f.id::text                   AS ref_id,
  NULL::uuid                   AS pessoa_id,
  f.id                         AS familia_id,
  -- Título: "João e Maria" (responsáveis da família)
  COALESCE(
    (SELECT string_agg(split_part(m2.nome_completo, ' ', 1), ' e ' 
              ORDER BY vf.responsavel_familia DESC, m2.nome_completo)
       FROM public.vinculos_familiares vf
       JOIN public.membros m2 ON m2.id = vf.membro_id
      WHERE vf.familia_id = f.id
        AND vf.parentesco IN ('pai_mae','conjuge')
        AND m2.status = 'ativo'),
    'Família ' || f.nome_familia
  ) AS titulo,
  'Família ' || f.nome_familia AS subtitulo,
  f.data_casamento             AS data_origem,
  (date_trunc('year', CURRENT_DATE) 
    + (date_part('doy', f.data_casamento) - 1)::int * INTERVAL '1 day')::date 
    AS proxima_data,
  date_part('year', AGE(CURRENT_DATE, f.data_casamento))::int AS anos_vai_completar,
  -- Telefone do responsavel
  (SELECT m3.telefone_celular FROM public.vinculos_familiares vf3
     JOIN public.membros m3 ON m3.id = vf3.membro_id
    WHERE vf3.familia_id = f.id AND vf3.responsavel_familia = true
    LIMIT 1) AS telefone,
  -- Segundo telefone (cônjuge)
  (SELECT m4.telefone_celular FROM public.vinculos_familiares vf4
     JOIN public.membros m4 ON m4.id = vf4.membro_id
    WHERE vf4.familia_id = f.id AND vf4.responsavel_familia = false
      AND vf4.parentesco IN ('pai_mae','conjuge')
    ORDER BY m4.nome_completo LIMIT 1) AS telefone_secundario
FROM public.familias f
WHERE f.data_casamento IS NOT NULL;

GRANT SELECT ON public.vw_agenda_pastoral TO authenticated;

-- RPC: agenda do mês (default = mês atual)
CREATE OR REPLACE FUNCTION public.agenda_pastoral_mes(
  p_ano  int DEFAULT NULL,
  p_mes  int DEFAULT NULL
)
RETURNS TABLE(
  tipo                 text,
  ref_id               text,
  pessoa_id            uuid,
  familia_id           uuid,
  titulo               text,
  subtitulo            text,
  proxima_data         date,
  anos_vai_completar   int,
  telefone             text,
  telefone_secundario  text,
  passou               boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH alvo AS (
    SELECT 
      COALESCE(p_ano, date_part('year', CURRENT_DATE)::int)  AS ano,
      COALESCE(p_mes, date_part('month', CURRENT_DATE)::int) AS mes
  )
  SELECT 
    v.tipo, v.ref_id, v.pessoa_id, v.familia_id,
    v.titulo, v.subtitulo, 
    make_date(alvo.ano, alvo.mes, LEAST(date_part('day', v.data_origem)::int, 28))::date AS proxima_data,
    -- anos no dia da efeméride neste ano
    (alvo.ano - date_part('year', v.data_origem)::int) AS anos_vai_completar,
    v.telefone, v.telefone_secundario,
    (make_date(alvo.ano, alvo.mes, date_part('day', v.data_origem)::int) < CURRENT_DATE) AS passou
    FROM public.vw_agenda_pastoral v, alvo
   WHERE date_part('month', v.data_origem)::int = alvo.mes
   ORDER BY date_part('day', v.data_origem), v.titulo;
$$;
GRANT EXECUTE ON FUNCTION public.agenda_pastoral_mes(int, int) TO authenticated;

-- RPC simplificada: próximos N dias
CREATE OR REPLACE FUNCTION public.agenda_pastoral_proximos_dias(p_dias int DEFAULT 7)
RETURNS TABLE(
  tipo               text,
  ref_id             text,
  pessoa_id          uuid,
  familia_id         uuid,
  titulo             text,
  subtitulo          text,
  data_evento        date,
  anos_completar     int,
  dias_ate_evento    int,
  telefone           text,
  telefone_secundario text
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT 
      v.tipo, v.ref_id, v.pessoa_id, v.familia_id, v.titulo, v.subtitulo,
      v.data_origem, v.telefone, v.telefone_secundario,
      -- Próxima ocorrência: tenta este ano, se já passou aplica próximo ano
      CASE 
        WHEN (date_trunc('year', CURRENT_DATE) 
              + (date_part('doy', v.data_origem) - 1)::int * INTERVAL '1 day')::date >= CURRENT_DATE
        THEN (date_trunc('year', CURRENT_DATE) 
              + (date_part('doy', v.data_origem) - 1)::int * INTERVAL '1 day')::date
        ELSE (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year' 
              + (date_part('doy', v.data_origem) - 1)::int * INTERVAL '1 day')::date
      END AS data_evento
      FROM public.vw_agenda_pastoral v
  )
  SELECT 
    b.tipo, b.ref_id, b.pessoa_id, b.familia_id, b.titulo, b.subtitulo,
    b.data_evento,
    (date_part('year', AGE(b.data_evento, b.data_origem))::int) AS anos_completar,
    (b.data_evento - CURRENT_DATE) AS dias_ate_evento,
    b.telefone, b.telefone_secundario
    FROM base b
   WHERE b.data_evento BETWEEN CURRENT_DATE AND CURRENT_DATE + p_dias
   ORDER BY b.data_evento, b.titulo;
$$;
GRANT EXECUTE ON FUNCTION public.agenda_pastoral_proximos_dias(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
