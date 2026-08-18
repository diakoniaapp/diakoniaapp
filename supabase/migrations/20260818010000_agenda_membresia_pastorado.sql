-- ---------------------------------------------------------------------------
-- Agenda pastoral ganha duas efemerides: membresia e pastorado
-- ---------------------------------------------------------------------------
--
-- A igreja ja celebrava aniversario de nascimento e de casamento. Faltavam
-- duas datas que sao proprias da vida da igreja:
--
--   membresia  -- anos de entrada no rol de membros (membros.data_entrada)
--   pastorado  -- anos de consagracao (membros.data_consagracao_pastoral)
--
-- NAO foi preciso tocar em nada alem desta view. Todo o motor de recorrencia
-- -- calcular a proxima ocorrencia, quantos anos completa, quantos dias
-- faltam -- vive na funcao agenda_pastoral_proximos_dias, que le desta view e
-- nao conhece os tipos: opera sobre `data_origem`, seja ela qual for. Somar
-- uma efemeride e somar um ramo aqui.
--
-- As duas colunas ja existiam e ja tinham dado: data_entrada em 92 dos 281
-- ativos, data_consagracao_pastoral em 2. Nenhuma coluna foi criada.
--
-- Os dois ramos originais estao reproduzidos sem alteracao -- CREATE OR
-- REPLACE VIEW exige a definicao inteira. As unicas linhas novas sao os dois
-- ultimos UNION ALL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.vw_agenda_pastoral AS
 SELECT 'aniversario'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_nascimento AS data_origem,
    ((date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone) + ((((date_part('doy'::text, m.data_nascimento) - (1)::double precision))::integer)::double precision * '1 day'::interval)))::date AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_nascimento)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status) AND (m.data_nascimento IS NOT NULL) AND (m.tipo_pessoa = ANY (ARRAY['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa])))
UNION ALL
 SELECT 'casamento'::text AS tipo,
    (f.id)::text AS ref_id,
    NULL::uuid AS pessoa_id,
    f.id AS familia_id,
    COALESCE(( SELECT string_agg(split_part(m2.nome_completo, ' '::text, 1), ' e '::text ORDER BY vf.responsavel_familia DESC, m2.nome_completo) AS string_agg
           FROM (vinculos_familiares vf
             JOIN membros m2 ON ((m2.id = vf.membro_id)))
          WHERE ((vf.familia_id = f.id) AND (vf.parentesco = ANY (ARRAY['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])) AND (m2.status = 'ativo'::membro_status))), ('Família '::text || f.nome_familia)) AS titulo,
    ('Família '::text || f.nome_familia) AS subtitulo,
    f.data_casamento AS data_origem,
    ((date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone) + ((((date_part('doy'::text, f.data_casamento) - (1)::double precision))::integer)::double precision * '1 day'::interval)))::date AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (f.data_casamento)::timestamp with time zone)))::integer AS anos_vai_completar,
    ( SELECT m3.telefone_celular
           FROM (vinculos_familiares vf3
             JOIN membros m3 ON ((m3.id = vf3.membro_id)))
          WHERE ((vf3.familia_id = f.id) AND (vf3.responsavel_familia = true))
         LIMIT 1) AS telefone,
    ( SELECT m4.telefone_celular
           FROM (vinculos_familiares vf4
             JOIN membros m4 ON ((m4.id = vf4.membro_id)))
          WHERE ((vf4.familia_id = f.id) AND (vf4.responsavel_familia = false) AND (vf4.parentesco = ANY (ARRAY['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])))
          ORDER BY m4.nome_completo
         LIMIT 1) AS telefone_secundario
   FROM familias f
  WHERE (f.data_casamento IS NOT NULL)

UNION ALL
-- ── NOVO: aniversario de membresia ────────────────────────────────────────
-- So para quem esta no rol de membros. Congregado tem data_entrada tambem,
-- mas "anos de membresia" de quem ainda nao e membro seria contar uma coisa
-- pelo nome de outra.
 SELECT 'membresia'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_entrada AS data_origem,
    ((date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone) + ((((date_part('doy'::text, m.data_entrada) - (1)::double precision))::integer)::double precision * '1 day'::interval)))::date AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_entrada)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status)
     AND (m.data_entrada IS NOT NULL)
     AND (m.tipo_pessoa = 'membro'::tipo_pessoa))

UNION ALL
-- ── NOVO: aniversario de pastorado ────────────────────────────────────────
 SELECT 'pastorado'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_consagracao_pastoral AS data_origem,
    ((date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone) + ((((date_part('doy'::text, m.data_consagracao_pastoral) - (1)::double precision))::integer)::double precision * '1 day'::interval)))::date AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_consagracao_pastoral)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status)
     AND (m.data_consagracao_pastoral IS NOT NULL));
