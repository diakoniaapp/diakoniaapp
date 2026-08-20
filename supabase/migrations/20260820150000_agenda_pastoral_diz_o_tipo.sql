-- ─── A agenda pastoral passa a dizer de que tipo é cada pessoa ──────────────
--
-- A Telma perguntou se o painel mostra aniversariantes membros, congregados e
-- visitantes. Mostra: o filtro da view sempre incluiu os três. Mas não havia
-- como VER isso na tela — o bloco lista nome e idade, e nada distingue um
-- congregado de um membro.
--
-- Sem essa distinção a pergunta não tem resposta olhando. Com ela, tem.
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--
-- Uma coluna a mais, `tipo_pessoa`, no fim da view e da RPC dos próximos dias.
-- Nula no ramo de casamento, que é da família e não de uma pessoa.
--
-- Nada é removido nem reordenado: quem já consome a view e a RPC continua
-- recebendo as mesmas colunas, nas mesmas posições. A RPC precisa de
-- DROP+CREATE porque mudar o RETURNS TABLE não cabe num CREATE OR REPLACE —
-- e por isso tudo vai numa transação só, para não existir um instante em que
-- a função não exista.
--
-- ── O QUE ISTO NÃO RESOLVE ─────────────────────────────────────────────────
--
-- O motivo de congregados e visitantes quase não aparecerem não é código, é
-- cadastro. Medido hoje, entre pessoas ativas:
--
--   membro ....... 156, sendo 94 com data de nascimento (60%)
--   congregado ... 122, sendo 11 com data de nascimento (9%)
--   visitante .....  2, sendo  0 com data de nascimento (0%)
--
-- Um visitante sem data de nascimento não tem aniversário para a igreja
-- lembrar. Isso se resolve preenchendo a ficha, não mexendo na consulta.

BEGIN;

CREATE OR REPLACE VIEW public.vw_agenda_pastoral AS
SELECT 'aniversario'::text AS tipo,
    m.id::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_nascimento AS data_origem,
    proximo_aniversario(m.data_nascimento) AS proxima_data,
    date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, m.data_nascimento::timestamp with time zone))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE m.status = 'ativo'::membro_status AND m.data_nascimento IS NOT NULL AND (m.tipo_pessoa = ANY (ARRAY['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa]))
UNION ALL
 SELECT 'casamento'::text AS tipo,
    f.id::text AS ref_id,
    NULL::uuid AS pessoa_id,
    f.id AS familia_id,
    COALESCE(( SELECT string_agg(split_part(m2.nome_completo, ' '::text, 1), ' e '::text ORDER BY vf.responsavel_familia DESC, m2.nome_completo) AS string_agg
           FROM vinculos_familiares vf
             JOIN membros m2 ON m2.id = vf.membro_id
          WHERE vf.familia_id = f.id AND (vf.parentesco = ANY (ARRAY['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])) AND m2.status = 'ativo'::membro_status), 'Família '::text || f.nome_familia) AS titulo,
    'Família '::text || f.nome_familia AS subtitulo,
    f.data_casamento AS data_origem,
    proximo_aniversario(f.data_casamento) AS proxima_data,
    date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, f.data_casamento::timestamp with time zone))::integer AS anos_vai_completar,
    ( SELECT m3.telefone_celular
           FROM vinculos_familiares vf3
             JOIN membros m3 ON m3.id = vf3.membro_id
          WHERE vf3.familia_id = f.id AND vf3.responsavel_familia = true
         LIMIT 1) AS telefone,
    ( SELECT m4.telefone_celular
           FROM vinculos_familiares vf4
             JOIN membros m4 ON m4.id = vf4.membro_id
          WHERE vf4.familia_id = f.id AND vf4.responsavel_familia = false AND (vf4.parentesco = ANY (ARRAY['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo]))
          ORDER BY m4.nome_completo
         LIMIT 1) AS telefone_secundario,
    NULL::tipo_pessoa AS tipo_pessoa
   FROM familias f
  WHERE f.data_casamento IS NOT NULL
UNION ALL
 SELECT 'membresia'::text AS tipo,
    m.id::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_entrada AS data_origem,
    proximo_aniversario(m.data_entrada) AS proxima_data,
    date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, m.data_entrada::timestamp with time zone))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE m.status = 'ativo'::membro_status AND m.data_entrada IS NOT NULL AND m.tipo_pessoa = 'membro'::tipo_pessoa
UNION ALL
 SELECT 'pastorado'::text AS tipo,
    m.id::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_consagracao_pastoral AS data_origem,
    proximo_aniversario(m.data_consagracao_pastoral) AS proxima_data,
    date_part('year'::text, age(CURRENT_DATE::timestamp with time zone, m.data_consagracao_pastoral::timestamp with time zone))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE m.status = 'ativo'::membro_status AND m.data_consagracao_pastoral IS NOT NULL AND m.funcoes_ministeriais && ARRAY['pastor'::funcao_ministerial, 'presidente'::funcao_ministerial, 'pastor_auxiliar'::funcao_ministerial, 'pastor_missionario'::funcao_ministerial];;


DROP FUNCTION IF EXISTS public.agenda_pastoral_proximos_dias(integer);

CREATE FUNCTION public.agenda_pastoral_proximos_dias(p_dias integer DEFAULT 7)
 RETURNS TABLE(tipo text, ref_id text, pessoa_id uuid, familia_id uuid, titulo text, subtitulo text, data_evento date, anos_completar integer, dias_ate_evento integer, telefone text, telefone_secundario text, tipo_pessoa tipo_pessoa)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  with base as (
    select v.tipo, v.ref_id, v.pessoa_id, v.familia_id, v.titulo, v.subtitulo,
           v.data_origem, v.telefone, v.telefone_secundario, v.tipo_pessoa,
           -- Este ano se ainda não passou; senão, o ano que vem.
           case
             when public.proximo_aniversario(v.data_origem) >= current_date
               then public.proximo_aniversario(v.data_origem)
             else public.proximo_aniversario(v.data_origem, date_part('year', current_date)::int + 1)
           end as data_evento
      from public.vw_agenda_pastoral v
  )
  select b.tipo, b.ref_id, b.pessoa_id, b.familia_id, b.titulo, b.subtitulo,
         b.data_evento,
         date_part('year', age(b.data_evento, b.data_origem))::int as anos_completar,
         (b.data_evento - current_date) as dias_ate_evento,
         b.telefone, b.telefone_secundario, b.tipo_pessoa
    from base b
   where b.data_evento between current_date and current_date + p_dias
   order by b.data_evento, b.titulo;
$function$;

COMMENT ON COLUMN public.vw_agenda_pastoral.tipo_pessoa IS
  'membro, congregado ou visitante. Nula no ramo de casamento, que pertence a uma familia. Existe para a tela poder mostrar de quem e a data — sem isso nao ha como conferir, olhando, que os tres tipos aparecem.';

COMMIT;
