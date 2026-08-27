-- ═══════════════════════════════════════════════════════════════════════════
-- O aniversário sem o ano
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- Medido em 27/08/2026, em produção: das 294 pessoas ativas, 53 não têm data
-- de nascimento nenhuma — 41 membros, 9 congregados e 3 visitantes. Não é que
-- a igreja não saiba quando elas nasceram; é que o sistema anterior guardava
-- só o dia e o mês de muita gente, e aqui o campo é um input de data: ou
-- entra a data inteira, ou não entra nada.
--
-- O preço disso não é estatístico, é pastoral. Dessas 53 pessoas, nenhuma
-- está na EBD e 41 já são membros — a IDADE delas não decide nada
-- operacional hoje, alimenta um gráfico. Mas o DIA E O MÊS decidem se a
-- igreja liga no aniversário, e é exatamente isso que se perde: elas estão
-- invisíveis na agenda de aniversários por falta de um número que não muda
-- nada no que a igreja faz naquele dia.
--
-- ── O QUE FOI DESCARTADO ───────────────────────────────────────────────────
--
-- Preencher o ano com um valor de fachada — 1900, 1901. Conferido: hoje não
-- há nenhum ano anterior a 1910 no banco, a base está limpa disso, e vale
-- manter. `idadeEm()` não teria como saber que o ano é inventado: responderia
-- "126 anos" com toda a confiança, e essa idade entra na pirâmide etária e na
-- regra dos 9 anos do batismo. Idade errada é pior que idade ausente, porque
-- a ausência já é tratada certo — o comentário de `lib/idade.ts` diz que nulo
-- "significa não sabemos, e quem chama precisa tratar isso à parte".
--
-- ── A FORMA ESCOLHIDA ──────────────────────────────────────────────────────
--
-- Uma coluna própria, `nascimento_dia_mes`, do tipo `date` com o ano fixado
-- em 2000 por CHECK. Guardar meia data numa data parece esquisito, e resolve
-- três coisas de graça:
--
--   · o Postgres valida a combinação — 31/02 é recusado pelo motor, sem
--     validação escrita à mão;
--   · 29/02 cabe, porque 2000 é bissexto. Um ano fixo qualquer não serviria;
--   · ordenar por "próximo aniversário" continua sendo comparação de data, e
--     `proximo_aniversario()` funciona sem alteração nenhuma.
--
-- O segundo CHECK garante fonte única: as duas colunas nunca preenchidas ao
-- mesmo tempo. Quem tem a data completa não duplica o dia e o mês.
--
-- O risco que sobra, dito na cara: alguém pode um dia calcular idade a partir
-- desta coluna e obter 26 anos para todo mundo. O nome da coluna e o CHECK do
-- ano 2000 são a defesa possível sem inventar um tipo novo.
--
-- ── ISTO É UMA ESTAÇÃO, NÃO UM DESTINO ─────────────────────────────────────
--
-- A regra continua sendo cadastro completo. Esta coluna existe para que uma
-- pendência possa ser resolvida PELA METADE em vez de ficar parada inteira —
-- e para que a metade que falta continue aparecendo como pendência, agora
-- dizendo com precisão o que ainda não dá para fazer com ela.
-- Ver a divisão em duas filas em src/lib/pendenciasCadastro.ts.

BEGIN;

ALTER TABLE public.membros
  ADD COLUMN IF NOT EXISTS nascimento_dia_mes date;

COMMENT ON COLUMN public.membros.nascimento_dia_mes IS
  'Dia e mes de nascimento de quem nao teve o ano registrado. O ano e sempre 2000 e NAO E DADO: nunca calcular idade a partir daqui. Preenchida so quando data_nascimento e nula.';

ALTER TABLE public.membros
  DROP CONSTRAINT IF EXISTS membros_nascimento_dia_mes_ano_fixo;
ALTER TABLE public.membros
  ADD CONSTRAINT membros_nascimento_dia_mes_ano_fixo
  CHECK (nascimento_dia_mes IS NULL OR EXTRACT(YEAR FROM nascimento_dia_mes) = 2000);

ALTER TABLE public.membros
  DROP CONSTRAINT IF EXISTS membros_nascimento_uma_fonte_so;
ALTER TABLE public.membros
  ADD CONSTRAINT membros_nascimento_uma_fonte_so
  CHECK (nascimento_dia_mes IS NULL OR data_nascimento IS NULL);

-- ── A view da agenda pastoral ──────────────────────────────────────────────
--
-- É ela, e não o TypeScript, que decide quem aparece nos aniversários: o
-- Painel Pastoral e o "Ações de hoje" leem daqui, via
-- agenda_pastoral_proximos_dias e resumo_painel_pastoral. Mexer só no
-- birthdays.ts teria consertado a Agenda e deixado o Painel mentindo.
--
-- Definição obtida de information_schema.views e TRANSFORMADA, não
-- redigitada (§6.3). Três trocas, todas no ramo aniversario — o único que
-- cita m.data_nascimento; os ramos de membresia e pastorado usam data_entrada
-- e data_consagracao_pastoral e ficaram intactos.
--
-- `anos_vai_completar` NÃO precisou mudar: age(hoje, NULL) devolve NULL e
-- date_part de NULL devolve NULL. Quem tem só dia e mês chega na tela com
-- anos nulo — e a interface já sabe o que fazer com isso: AcoesDoDia tem
-- `semAnos: "Aniversário"` e a mensagem de WhatsApp tem "(que data
-- especial!)". A capacidade já existia; faltava alguém chegar lá sem ano.

CREATE OR REPLACE VIEW public.vw_agenda_pastoral AS
WITH resp_data AS (
         SELECT DISTINCT ON (vf.familia_id) vf.familia_id,
            m.data_casamento
           FROM (vinculos_familiares vf
             JOIN membros m ON ((m.id = vf.membro_id)))
          WHERE (vf.responsavel_familia AND (m.status = 'ativo'::membro_status) AND (m.data_casamento IS NOT NULL))
          ORDER BY vf.familia_id, m.nome_completo
        ), conjuges AS (
         SELECT DISTINCT ON (m.id) m.id,
            m.nome_completo,
            m.data_casamento,
            m.telefone_celular,
            COALESCE(vf.responsavel_familia, false) AS responsavel,
                CASE
                    WHEN ((vf.familia_id IS NOT NULL) AND (COALESCE(vf.responsavel_familia, false) OR (vf.parentesco = ANY (ARRAY['conjuge'::parentesco_tipo, 'pai_mae'::parentesco_tipo])) OR (m.data_casamento = rd.data_casamento))) THEN vf.familia_id
                    ELSE NULL::uuid
                END AS familia_do_casal
           FROM ((membros m
             LEFT JOIN vinculos_familiares vf ON ((vf.membro_id = m.id)))
             LEFT JOIN resp_data rd ON ((rd.familia_id = vf.familia_id)))
          WHERE ((m.status = 'ativo'::membro_status) AND (m.data_casamento IS NOT NULL))
          ORDER BY m.id, COALESCE(vf.responsavel_familia, false) DESC, vf.familia_id
        ), bodas AS (
         SELECT COALESCE((c.familia_do_casal)::text, (c.id)::text) AS chave,
            c.familia_do_casal,
            (array_agg(c.data_casamento ORDER BY c.responsavel DESC, c.nome_completo))[1] AS data_casamento,
            (array_agg(c.id ORDER BY c.responsavel DESC, c.nome_completo))[1] AS pessoa_id,
            (array_agg(c.telefone_celular ORDER BY c.responsavel DESC, c.nome_completo))[1] AS telefone,
            (array_agg(c.telefone_celular ORDER BY c.responsavel DESC, c.nome_completo))[2] AS telefone_secundario,
            string_agg(split_part(c.nome_completo, ' '::text, 1), ' e '::text ORDER BY c.responsavel DESC, c.nome_completo) AS titulo,
            string_agg(c.nome_completo, ' e '::text ORDER BY c.responsavel DESC, c.nome_completo) AS subtitulo
           FROM conjuges c
          GROUP BY COALESCE((c.familia_do_casal)::text, (c.id)::text), c.familia_do_casal
        )
 SELECT 'aniversario'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    COALESCE(m.data_nascimento, m.nascimento_dia_mes) AS data_origem,
    proximo_aniversario(COALESCE(m.data_nascimento, m.nascimento_dia_mes)) AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_nascimento)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status) AND (COALESCE(m.data_nascimento, m.nascimento_dia_mes) IS NOT NULL) AND (m.tipo_pessoa = ANY (ARRAY['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa])))
UNION ALL
 SELECT 'casamento'::text AS tipo,
    ('mc:'::text || b.chave) AS ref_id,
    b.pessoa_id,
    b.familia_do_casal AS familia_id,
    b.titulo,
    b.subtitulo,
    b.data_casamento AS data_origem,
    proximo_aniversario(b.data_casamento) AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (b.data_casamento)::timestamp with time zone)))::integer AS anos_vai_completar,
    b.telefone,
    b.telefone_secundario,
    NULL::tipo_pessoa AS tipo_pessoa
   FROM bodas b
UNION ALL
 SELECT 'membresia'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_entrada AS data_origem,
    proximo_aniversario(m.data_entrada) AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_entrada)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status) AND (m.data_entrada IS NOT NULL) AND (m.tipo_pessoa = 'membro'::tipo_pessoa))
UNION ALL
 SELECT 'pastorado'::text AS tipo,
    (m.id)::text AS ref_id,
    m.id AS pessoa_id,
    NULL::uuid AS familia_id,
    m.nome_completo AS titulo,
    m.nome_completo AS subtitulo,
    m.data_consagracao_pastoral AS data_origem,
    proximo_aniversario(m.data_consagracao_pastoral) AS proxima_data,
    (date_part('year'::text, age((CURRENT_DATE)::timestamp with time zone, (m.data_consagracao_pastoral)::timestamp with time zone)))::integer AS anos_vai_completar,
    m.telefone_celular AS telefone,
    NULL::text AS telefone_secundario,
    m.tipo_pessoa
   FROM membros m
  WHERE ((m.status = 'ativo'::membro_status) AND (m.data_consagracao_pastoral IS NOT NULL) AND (m.funcoes_ministeriais && ARRAY['pastor'::funcao_ministerial, 'presidente'::funcao_ministerial, 'pastor_auxiliar'::funcao_ministerial, 'pastor_missionario'::funcao_ministerial]));

COMMIT;
