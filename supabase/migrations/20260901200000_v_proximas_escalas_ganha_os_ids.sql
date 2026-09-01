-- ═══════════════════════════════════════════════════════════════════════════
-- `v_proximas_escalas` ganha o id do ministério e o da área
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── POR QUE ────────────────────────────────────────────────────────────────
--
-- A view já contava escalados, confirmados, pendentes e recusados por escala —
-- e o Painel de Ministério, escrito em 01/09, refez essa contagem à mão porque
-- ninguém a consultou primeiro. A view é melhor: separa pendente de recusado,
-- e a minha juntava os dois.
--
-- O que impedia a troca é que ela expõe `ministerio_nome` e não
-- `ministerio_id`. Filtrar o painel de um ministério pelo NOME seria frágil —
-- dois ministérios podem repetir nome, e renomear um quebraria a tela em
-- silêncio.
--
-- ── COMO ───────────────────────────────────────────────────────────────────
--
-- A definição abaixo foi obtida com `pg_get_viewdef()` e TRANSFORMADA, não
-- redigitada: as duas colunas entram no FIM da projeção, como manda a regra do
-- projeto — `CREATE OR REPLACE VIEW` só aceita coluna nova no fim, mantendo
-- nome, tipo e ordem das que já existem.
--
-- `area_id` entra junto pelo mesmo motivo: quem filtra por ministério cedo ou
-- tarde filtra por área, e a view já faz o JOIN com `areas`.

BEGIN;

CREATE OR REPLACE VIEW public.v_proximas_escalas AS
SELECT e.id,
    e.titulo,
    e.data_evento,
    e.hora_inicio,
    e.hora_fim,
    e.local,
    e.status,
    a.nome AS area_nome,
    a.cor_identidade AS area_cor,
    mn.nome AS ministerio_nome,
    count(ev.id) AS total_escalados,
    sum(
        CASE
            WHEN ev.status = 'confirmado'::status_presenca_escala THEN 1
            ELSE 0
        END) AS confirmados,
    sum(
        CASE
            WHEN ev.status = 'pendente'::status_presenca_escala THEN 1
            ELSE 0
        END) AS pendentes,
    sum(
        CASE
            WHEN ev.status = 'recusado'::status_presenca_escala THEN 1
            ELSE 0
        END) AS recusados,
    e.ministerio_id,
    e.area_id
   FROM escalas e
     JOIN areas a ON a.id = e.area_id
     LEFT JOIN ministerios mn ON mn.id = e.ministerio_id
     LEFT JOIN escala_voluntarios ev ON ev.escala_id = e.id
  WHERE e.data_evento >= CURRENT_DATE
  GROUP BY e.id, a.nome, a.cor_identidade, mn.nome
  ORDER BY e.data_evento, e.hora_inicio;

COMMIT;
