-- ─── (APLICADA em 08/10/2026 após ensaio) Boas-vindas ao Visitante: "Próximos encontros" lidos AUTOMATICAMENTE da Agenda ─────────────────────────────
-- Pedido dela: a seção não pode depender de cadastro manual; deve trazer cultos, EBD, programações recorrentes e eventos
-- especiais, com os próximos cultos primeiro. Dois modos: AUTOMÁTICO (preferido) e MANUAL (a igreja escolhe).
--
-- POR QUE os recorrentes não apareciam (medido na agenda dela em 08/10/2026):
--   1. O botão "Trazer da agenda" filtrava `recorrencia_regra IS NULL` — de propósito, na primeira versão, para não expor
--      a série como uma linha só. Resultado: só 3 eventos avulsos (os "Almoço ..." de ministério) apareciam.
--   2. Mesmo sem esse filtro, uma série é UMA linha-base com `data` no passado (EBD: 04/01/2026; Culto da Noite: 04/01/2026) —
--      qualquer filtro `data >= hoje` a descarta. As datas futuras só existem como REGRA (semanal, dias_semana, fim).
--   3. Exceções (uma data editada ou cancelada) são linhas à parte (`is_excecao`, `serie_origem_id`, `ocorrencia_original_data`)
--      e precisam ser descontadas da série, senão aparece culto cancelado.
--   Na agenda dela: 19 séries (18 semanais com data final, 1 semanal sem fim) + 1 anual sem fim, 0 mensais, 0 por contagem;
--   16 exceções (3 canceladas). Nenhuma série de culto passa de 27/12/2026.
--
-- O que esta migration faz:
--   • `visitante_regra_bate()` e `visitante_agenda_itens()` expandem a regra no banco (diário, semanal com dias e intervalo,
--     mensal, anual, "personalizado", fim por data/nunca/contagem) do mesmo jeito que a Agenda do app (biblioteca rrule), sem
--     as datas substituídas/canceladas por exceção. Cada série vira UM item com a próxima ocorrência e o rótulo do padrão
--     ("Domingo · 09h00"); evento avulso vira "Sábado, 24/10 · 19h00". Horizonte: 60 dias.
--   • Prioridade: 1 = cultos (tipo culto) e Escola Bíblica; 2 = demais programações recorrentes; 3 = eventos especiais
--     (avulsos). Dentro de cada grupo, pela próxima data e hora.
--   • O que o visitante VÊ não é tudo que a agenda tem (há reuniões, ensaios, aulas, lives): no modo automático aparece o
--     grupo 1 por padrão, e a administração liga/desliga qualquer item (`agenda_incluidos` / `agenda_ocultos`, por série).
--     No modo manual aparece só o que ela marcou, mais os itens digitados à mão (que já existiam).
--   • `visitante_agenda_candidatos()` (só administração) entrega a lista inteira com o padrão, para a tela de configuração.
-- Alternativa descartada: marcar cada evento da agenda como "público" — obrigaria mexer no cadastro de eventos e preencher
-- 30 eventos à mão; a regra por tipo + exceções por série resolve sem tocar na Agenda.

-- ── 1) colunas novas da configuração ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.visitante_boasvindas ADD COLUMN IF NOT EXISTS eventos_modo text NOT NULL DEFAULT 'automatico';
ALTER TABLE public.visitante_boasvindas ADD COLUMN IF NOT EXISTS agenda_incluidos uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.visitante_boasvindas ADD COLUMN IF NOT EXISTS agenda_ocultos   uuid[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitante_boasvindas_modo_ck') THEN
    ALTER TABLE public.visitante_boasvindas ADD CONSTRAINT visitante_boasvindas_modo_ck CHECK (eventos_modo IN ('automatico', 'manual'));
  END IF;
END $$;
UPDATE public.visitante_boasvindas SET eventos_max = 6 WHERE eventos_max = 4;   -- o padrão antigo; no automático cabem mais itens

-- ── 2) rótulos (puros) ───────────────────────────────────────────────────────────────────────────────────
-- "Culto da Noite | MINISTÉRIO PASTORAL" → "Culto da Noite" (na agenda dela o título carrega o ministério)
CREATE OR REPLACE FUNCTION public.visitante_titulo_limpo(p_titulo text) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$ SELECT btrim(split_part(p_titulo, ' | ', 1)) $f$;

CREATE OR REPLACE FUNCTION public.visitante_hora_label(p_hora time) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$ SELECT to_char(p_hora, 'HH24"h"MI') $f$;

-- [1,2,3,4,5] → "Segunda a sexta"; [0] → "Domingo"; [0,6] → "Domingo e sábado"
CREATE OR REPLACE FUNCTION public.visitante_dias_label(p_dias int[]) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE
  nomes text[] := ARRAY['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  d int[]; n int; i int := 1; ini int; k int; partes text[] := '{}'; np int; rotulo text;
BEGIN
  SELECT array_agg(DISTINCT x ORDER BY x) INTO d FROM unnest(p_dias) x WHERE x BETWEEN 0 AND 6;
  n := COALESCE(array_length(d, 1), 0);
  IF n = 0 THEN RETURN ''; END IF;
  WHILE i <= n LOOP
    ini := i;
    WHILE i < n AND d[i + 1] = d[i] + 1 LOOP i := i + 1; END LOOP;
    IF i - ini >= 2 THEN partes := partes || (nomes[d[ini] + 1] || ' a ' || lower(nomes[d[i] + 1]));
    ELSE FOR k IN ini..i LOOP partes := partes || nomes[d[k] + 1]; END LOOP;
    END IF;
    i := i + 1;
  END LOOP;
  np := array_length(partes, 1);
  IF np = 1 THEN RETURN partes[1]; END IF;
  rotulo := partes[1];
  FOR k IN 2..np - 1 LOOP rotulo := rotulo || ', ' || lower(partes[k]); END LOOP;
  RETURN rotulo || ' e ' || lower(partes[np]);
END
$f$;

-- "Sábado, 24/10 · 19h00" (uma data só)
CREATE OR REPLACE FUNCTION public.visitante_quando_pontual(p_dia date, p_hora time) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT (ARRAY['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'])[extract(dow FROM p_dia)::int + 1]
         || ', ' || to_char(p_dia, 'DD/MM') || COALESCE(' · ' || public.visitante_hora_label(p_hora), '')
$f$;

-- o padrão da série: "Domingo · 09h00", "Segunda a sexta · 06h30", "Todo dia 15 · 19h30"
CREATE OR REPLACE FUNCTION public.visitante_quando_regra(p_r jsonb, p_ini date, p_hora time, p_proxima date) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE freq text := p_r->>'freq'; i int := GREATEST(1, COALESCE(NULLIF(p_r->>'intervalo', '')::int, 1)); dias int[]; h text := COALESCE(' · ' || public.visitante_hora_label(p_hora), '');
BEGIN
  IF freq = 'semanal' THEN
    SELECT COALESCE(array_agg(x::int), ARRAY[]::int[]) INTO dias FROM jsonb_array_elements_text(COALESCE(p_r->'dias_semana', '[]'::jsonb)) x;
    IF array_length(dias, 1) IS NULL THEN dias := ARRAY[extract(dow FROM p_ini)::int]; END IF;
    RETURN CASE WHEN i > 1 THEN 'A cada ' || i || ' semanas: ' ELSE '' END || public.visitante_dias_label(dias) || h;
  ELSIF freq = 'mensal' THEN
    RETURN CASE WHEN i > 1 THEN 'A cada ' || i || ' meses, dia ' ELSE 'Todo dia ' END || extract(day FROM p_ini)::int || h;
  ELSIF freq IN ('diario', 'personalizado') THEN
    RETURN CASE WHEN i > 1 THEN 'A cada ' || i || ' dias' ELSE 'Todos os dias' END || h;
  END IF;
  RETURN public.visitante_quando_pontual(p_proxima, p_hora);   -- anual: a data da próxima
END
$f$;

-- ── 3) a regra de recorrência: este dia pertence à série? (sem a contagem, que depende de contar desde o início) ──
-- Espelha lib/agenda/recurrence.ts (rrule): semanal conta semanas a partir da segunda-feira da semana do início.
CREATE OR REPLACE FUNCTION public.visitante_regra_bate(p_r jsonb, p_ini date, p_dia date) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $f$
DECLARE freq text := p_r->>'freq'; i int := GREATEST(1, COALESCE(NULLIF(p_r->>'intervalo', '')::int, 1)); dias int[];
BEGIN
  IF p_dia < p_ini THEN RETURN false; END IF;
  IF p_r->'fim'->>'tipo' = 'data' AND p_dia > (p_r->'fim'->>'data')::date THEN RETURN false; END IF;
  IF freq = 'semanal' THEN
    SELECT COALESCE(array_agg(x::int), ARRAY[]::int[]) INTO dias FROM jsonb_array_elements_text(COALESCE(p_r->'dias_semana', '[]'::jsonb)) x;
    IF array_length(dias, 1) IS NULL THEN dias := ARRAY[extract(dow FROM p_ini)::int]; END IF;
    RETURN extract(dow FROM p_dia)::int = ANY (dias)
       AND (((date_trunc('week', p_dia)::date - date_trunc('week', p_ini)::date) / 7) % i) = 0;
  ELSIF freq = 'mensal' THEN
    RETURN extract(day FROM p_dia) = extract(day FROM p_ini)
       AND ((extract(year FROM p_dia) * 12 + extract(month FROM p_dia) - extract(year FROM p_ini) * 12 - extract(month FROM p_ini))::int % i) = 0;
  ELSIF freq = 'anual' THEN
    RETURN extract(day FROM p_dia) = extract(day FROM p_ini) AND extract(month FROM p_dia) = extract(month FROM p_ini)
       AND ((extract(year FROM p_dia) - extract(year FROM p_ini))::int % i) = 0;
  END IF;
  RETURN ((p_dia - p_ini) % i) = 0;   -- diário e personalizado
END
$f$;

-- ── 4) tudo que a agenda tem de futuro, um item por série/evento ───────────────────────────────────────────
-- Interna: ninguém chama direto (REVOKE). A tela pública e a de configuração passam por funções que filtram.
CREATE OR REPLACE FUNCTION public.visitante_agenda_itens(p_hoje date, p_horizonte int DEFAULT 60)
RETURNS TABLE (chave uuid, chaves uuid[], titulo text, tipo text, recorrente boolean, quando text, local text, proxima date, hora time, fim date, prioridade smallint, padrao boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  WITH lim AS (SELECT p_hoje AS hoje, p_hoje + p_horizonte AS ate),
  series AS (   -- as linhas-base: têm regra, não são exceção, estão agendadas
    SELECT e.id, COALESCE(e.recorrencia_id, e.id) AS chave, e.titulo, e.tipo::text AS tipo, e.data AS ini, e.hora_inicio AS hora,
           e.recorrencia_regra AS r, NULLIF(split_part(COALESCE(l.nome, e.local, ''), ' - ', 1), '') AS local
      FROM public.eventos e LEFT JOIN public.locais l ON l.id = e.local_id
     WHERE e.recorrencia_regra IS NOT NULL AND NOT COALESCE(e.is_excecao, false) AND e.status::text = 'agendado'
  ),
  dias AS (     -- cada dia, desde o início da série até o horizonte, que obedece à regra (a contagem exige contar desde o início)
    SELECT s.id, s.chave, s.titulo, s.tipo, s.hora, s.local, s.r, g::date AS dia,
           row_number() OVER (PARTITION BY s.id ORDER BY g) AS n
      FROM series s CROSS JOIN lim, generate_series(s.ini, GREATEST(s.ini, lim.ate), interval '1 day') g
     WHERE public.visitante_regra_bate(s.r, s.ini, g::date)
  ),
  validos AS (  -- futuras, dentro da contagem, e que NÃO foram substituídas ou canceladas por uma exceção
    SELECT d.chave, d.titulo, d.tipo, d.hora, d.local, d.dia, false AS exc
      FROM dias d CROSS JOIN lim
     WHERE d.dia >= lim.hoje AND d.dia <= lim.ate
       AND ( COALESCE(d.r->'fim'->>'tipo', 'nunca') <> 'ocorrencias' OR d.n <= (d.r->'fim'->>'n')::int )
       AND NOT EXISTS (SELECT 1 FROM public.eventos x WHERE COALESCE(x.is_excecao, false) AND x.serie_origem_id = d.chave AND x.ocorrencia_original_data = d.dia)
  ),
  excecoes AS ( -- a data substituída que continua agendada vale como ocorrência da série (pode ter outro dia, hora ou título)
    SELECT x.serie_origem_id AS chave, x.titulo, x.tipo::text AS tipo, x.hora_inicio AS hora,
           NULLIF(split_part(COALESCE(l.nome, x.local, ''), ' - ', 1), '') AS local, x.data AS dia, true AS exc
      FROM public.eventos x LEFT JOIN public.locais l ON l.id = x.local_id CROSS JOIN lim
     WHERE COALESCE(x.is_excecao, false) AND x.status::text = 'agendado' AND x.serie_origem_id IS NOT NULL
       AND x.data BETWEEN lim.hoje AND lim.ate
       AND EXISTS (SELECT 1 FROM series s WHERE s.chave = x.serie_origem_id)
  ),
  proximas AS ( -- a próxima ocorrência de cada série
    SELECT DISTINCT ON (o.chave) o.* FROM (SELECT * FROM validos UNION ALL SELECT * FROM excecoes) o
     ORDER BY o.chave, o.dia, o.hora NULLS LAST
  ),
  recorrentes AS (
    SELECT p.chave, public.visitante_titulo_limpo(p.titulo) AS titulo, p.tipo, true AS recorrente,
           CASE WHEN p.exc THEN public.visitante_quando_pontual(p.dia, p.hora)
                ELSE public.visitante_quando_regra(s.r, s.ini, p.hora, p.dia) END AS quando,
           p.local, p.dia AS proxima, p.hora,
           CASE WHEN s.r->'fim'->>'tipo' = 'data' THEN (s.r->'fim'->>'data')::date END AS fim
      FROM proximas p JOIN series s ON s.chave = p.chave
  ),
  avulsos AS (
    SELECT e.id AS chave, public.visitante_titulo_limpo(e.titulo) AS titulo, e.tipo::text AS tipo, false AS recorrente,
           public.visitante_quando_pontual(e.data, e.hora_inicio) AS quando,
           NULLIF(split_part(COALESCE(l.nome, e.local, ''), ' - ', 1), '') AS local, e.data AS proxima, e.hora_inicio AS hora, NULL::date AS fim
      FROM public.eventos e LEFT JOIN public.locais l ON l.id = e.local_id CROSS JOIN lim
     WHERE e.recorrencia_regra IS NULL AND NOT COALESCE(e.is_excecao, false) AND e.serie_origem_id IS NULL
       AND e.status::text = 'agendado' AND e.data BETWEEN lim.hoje AND lim.ate
  ),
  -- a agenda dela tem séries DUPLICADAS (medido: 'Live Matinal de Oração' e 'Orando sobre a Palavra' aparecem em duas séries com o
  -- mesmo horário, uma de janeiro e outra de setembro): o visitante não pode ver o mesmo encontro duas vezes
  todos AS (SELECT DISTINCT ON (u.titulo, u.quando) u.*, array_agg(u.chave) OVER (PARTITION BY u.titulo, u.quando) AS chaves   -- as chaves de TODAS as duplicatas seguem juntas: ligar ou desligar uma vale para o grupo
                 FROM (SELECT * FROM recorrentes UNION ALL SELECT * FROM avulsos) u ORDER BY u.titulo, u.quando, u.proxima, u.chave::text)
  SELECT t.chave, t.chaves, t.titulo, t.tipo, t.recorrente, t.quando, t.local, t.proxima, t.hora, t.fim,
         (CASE WHEN t.tipo = 'culto' OR t.titulo ~* '^(escola b[ií]blica|ebd)' THEN 1 WHEN t.recorrente THEN 2 ELSE 3 END)::smallint AS prioridade,
         (t.tipo = 'culto' OR t.titulo ~* '^(escola b[ií]blica|ebd)') AS padrao
    FROM todos t
$f$;
REVOKE ALL ON FUNCTION public.visitante_agenda_itens(date, int) FROM PUBLIC, anon, authenticated;

-- ── 5) para a tela de configuração (só administração): a lista inteira, com o padrão ─────────────────────────
CREATE OR REPLACE FUNCTION public.visitante_agenda_candidatos() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para ver a agenda desta tela.';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('chave', i.chave, 'chaves', to_jsonb(i.chaves), 'titulo', i.titulo, 'tipo', i.tipo, 'recorrente', i.recorrente, 'quando', i.quando,
                                        'local', COALESCE(i.local, ''), 'proxima', i.proxima, 'fim', i.fim, 'prioridade', i.prioridade, 'padrao', i.padrao)
                     ORDER BY i.prioridade, i.proxima, i.hora NULLS LAST, i.titulo)
      FROM public.visitante_agenda_itens((now() AT TIME ZONE 'America/Sao_Paulo')::date, 60) i), '[]'::jsonb);
END
$f$;
REVOKE ALL ON FUNCTION public.visitante_agenda_candidatos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitante_agenda_candidatos() TO authenticated;

-- ── 6) o que o visitante vê: agora com a agenda ───────────────────────────────────────────────────────────
-- Automático: itens de prioridade 1 (cultos e EBD) + o que a administração ligou − o que desligou.
-- Manual: só o que ela marcou na agenda + os itens digitados à mão (ainda não vencidos).
-- Ordem: cultos, depois programações recorrentes, depois eventos especiais; em cada grupo, pela próxima data e hora.
CREATE OR REPLACE FUNCTION public.visitante_boasvindas()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT jsonb_build_object(
    'titulo',   b.titulo,
    'mensagem', b.mensagem,
    'banner_url', CASE WHEN b.banner_url ~* '^https?://' THEN b.banner_url END,
    'canais', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('tipo', c->>'tipo', 'url', btrim(c->>'url')) ORDER BY o)
         FROM jsonb_array_elements(b.canais) WITH ORDINALITY AS t(c, o)
        WHERE coalesce(c->>'ativo', 'false') = 'true' AND btrim(coalesce(c->>'url', '')) ~* '^https?://'
          AND c->>'tipo' IN ('instagram', 'facebook', 'youtube', 'site', 'whatsapp')), '[]'::jsonb),
    'links', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('rotulo', left(btrim(l->>'rotulo'), 60), 'url', btrim(l->>'url')) ORDER BY o)
         FROM jsonb_array_elements(b.links) WITH ORDINALITY AS t(l, o)
        WHERE coalesce(l->>'ativo', 'false') = 'true' AND btrim(coalesce(l->>'url', '')) ~* '^https?://' AND btrim(coalesce(l->>'rotulo', '')) <> ''), '[]'::jsonb),
    'eventos_titulo', b.eventos_titulo,
    'eventos', CASE WHEN NOT b.eventos_mostrar THEN '[]'::jsonb ELSE COALESCE((
       SELECT jsonb_agg(z.e ORDER BY z.rn) FROM (
         SELECT q.e, row_number() OVER (ORDER BY q.g, q.p, q.dia NULLS LAST, q.hora NULLS LAST, q.o) AS rn FROM (
           SELECT 0 AS g, i.prioridade::int AS p, i.proxima AS dia, i.hora AS hora, 0::bigint AS o,
                  jsonb_build_object('titulo', i.titulo, 'quando', i.quando, 'local', COALESCE(i.local, ''), 'link', NULL) AS e
             FROM public.visitante_agenda_itens((now() AT TIME ZONE 'America/Sao_Paulo')::date, 60) i
            WHERE CASE b.eventos_modo
                    WHEN 'automatico' THEN (i.padrao AND NOT (i.chaves && b.agenda_ocultos)) OR i.chaves && b.agenda_incluidos
                    ELSE i.chaves && b.agenda_incluidos END
           UNION ALL
           SELECT 1, 9, CASE WHEN coalesce(x->>'data', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (x->>'data')::date END, NULL::time, o,
                  jsonb_build_object('titulo', left(btrim(x->>'titulo'), 100), 'quando', left(btrim(coalesce(x->>'quando', '')), 80),
                                     'local', left(btrim(coalesce(x->>'local', '')), 80),
                                     'link', CASE WHEN btrim(coalesce(x->>'link', '')) ~* '^https?://' THEN btrim(x->>'link') END)
             FROM jsonb_array_elements(b.eventos) WITH ORDINALITY AS t(x, o)
            WHERE b.eventos_modo = 'manual' AND coalesce(x->>'ativo', 'false') = 'true' AND btrim(coalesce(x->>'titulo', '')) <> ''
              AND ( coalesce(x->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (x->>'data')::date >= ((now() AT TIME ZONE 'America/Sao_Paulo')::date) )
         ) q ORDER BY rn LIMIT b.eventos_max) z), '[]'::jsonb) END
  )
  FROM public.visitante_boasvindas b WHERE b.id
$f$;
