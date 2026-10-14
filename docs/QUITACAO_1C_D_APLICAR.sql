-- APLICAÇÃO DEFINITIVA da Fase 1C-d (PRAZOS DERIVADOS e REALINHAMENTO DIÁRIO) — só depois do "pode aplicar" dela. PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- GRAVA: 1 visão nova (vw_fin_quitacao_prazos), 1 função nova (fin_quitacao_sincronizar_agendada, NÃO exposta à API) e 1 job no pg_cron (quitacao-sincronizar, todo dia às 09:00 de Brasília).
-- NENHUM dado existente é alterado. Idêntico a supabase/migrations/20261015120000. Pode rodar mais de uma vez (o job é regravado pelo nome). Para desfazer: docs/QUITACAO_1C_D_ROLLBACK.sql.
-- Antes de rodar: rode docs/QUITACAO_1C_D_ENSAIO.sql e confira "TUDO OK, pode aplicar".
-- TRAVA DE PRÉ-REQUISITOS: se faltar alguma fase anterior, este arquivo para aqui, com a mensagem do que aplicar antes, e NÃO grava nada.
DO $pre$ BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1A antes desta: rode docs/QUITACAO_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1B antes desta: rode docs/QUITACAO_1B_M0_APLICAR.sql (sozinho) e depois docs/QUITACAO_1B_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1C-a antes desta: rode docs/QUITACAO_1C_A_APLICAR.sql.'; END IF;
END $pre$;

-- ─── Fase 1C-d: a FILA AUTOMÁTICA — prazos derivados e o realinhamento diário, sem depender de alguém abrir uma tela ───────────────────────────────────────────
-- Depende da 1A, do M0, da 1B e da 1C-a (aplicadas ANTES). Nenhum dado existente é alterado.
--
-- O problema (palavras dela, 13/10/2026): "não quero depender de alguém abrir uma tela para que o sistema perceba que uma formalização expirou". Hoje a oferta aceita como Relatado só perde o status
-- `quitado_terceiro` quando a Mesa é aberta (a Mesa chama o sincronizador). Sem ninguém abrir, o tempo passa e o status fica velho.
--
-- O que esta migration faz:
--   1. `vw_fin_quitacao_prazos`: UMA linha por prazo aberto, DERIVADA (nada é guardado, nada é digitado): o limite nasce de datas que já existem + os parâmetros da Política.
--        · formalizacao  — a quitação aceita só como Relatado: registro + prazo_formalizacao_dias (30);
--        · esclarecimento — a intenção não declarada: data da nota + prazo_esclarecimento_dias (30);
--        · reembolso      — o reembolso aprovado e ainda não pago: aprovação + prazo_reembolso_dias (10).
--      Cada linha traz limite, dias_restantes e a situação: VENCIDO (limite passou), VENCE EM ATÉ 7 DIAS ou NO PRAZO. A Mesa e o Painel mostram "Vencidos" e "Vencem em 7 dias".
--   2. `fin_quitacao_sincronizar_agendada()`: o sincronizador SEM teste de papel (o relógio não tem usuário), NÃO exposto à API. Uma obrigação que falha (ex.: período fechado) não derruba as demais.
--   3. O agendamento diário no pg_cron (já instalado em produção: versão 1.6.4): job `quitacao-sincronizar`, todo dia às 09:00 de Brasília (12:00 UTC). Só é criado se o pg_cron existir.
-- Reversível: docs/QUITACAO_1C_D_ROLLBACK.sql (remove o job, a função e a visão).

-- ── 1) os prazos, derivados ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_quitacao_prazos WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
abertos AS (
  SELECT q.quitacao_id, q.obrigacao_id, q.fila, q.resultado, q.intencao, q.valor_obrigacao, q.saldo_a_reembolsar, q.grau_conjunto,
         (q.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date + p.prazo_formalizacao_dias AS limite_formalizacao,
         q.data_despesa + p.prazo_esclarecimento_dias AS limite_esclarecimento,
         (SELECT (max(e.em) AT TIME ZONE 'America/Sao_Paulo')::date + p.prazo_reembolso_dias
            FROM public.fin_quitacao_eventos e
           WHERE e.quitacao_id = q.quitacao_id AND e.evento = 'aprovacao_reembolso' AND e.decisao = 'aprovada') AS limite_reembolso
    FROM public.vw_fin_quitacao q CROSS JOIN public.fin_quitacao_parametros p
),
linhas AS (
  -- formalização: aceita só como Relatado (extinta como oferta) OU ainda na fila Formalizar com prova Relatada
  SELECT a.quitacao_id, a.obrigacao_id, 'formalizacao'::text AS prazo, a.limite_formalizacao AS limite, a.valor_obrigacao AS valor
    FROM abertos a WHERE a.intencao = 'oferta' AND a.grau_conjunto = 'relatado' AND (a.fila = 'formalizar' OR a.resultado = 'extinta_como_oferta')
  UNION ALL
  SELECT a.quitacao_id, a.obrigacao_id, 'esclarecimento', a.limite_esclarecimento, a.valor_obrigacao FROM abertos a WHERE a.fila = 'a_esclarecer'
  UNION ALL
  SELECT a.quitacao_id, a.obrigacao_id, 'reembolso', a.limite_reembolso, COALESCE(a.saldo_a_reembolsar, a.valor_obrigacao) FROM abertos a WHERE a.fila = 'reembolso_a_pagar' AND a.limite_reembolso IS NOT NULL
)
SELECT l.quitacao_id, l.obrigacao_id, l.prazo, l.limite, (l.limite - h.d) AS dias_restantes,
       CASE WHEN l.limite < h.d THEN 'vencido' WHEN l.limite - h.d <= 7 THEN 'vence_em_7_dias' ELSE 'no_prazo' END AS situacao,
       l.valor
  FROM linhas l CROSS JOIN hoje h;
GRANT SELECT ON public.vw_fin_quitacao_prazos TO authenticated;
COMMENT ON VIEW public.vw_fin_quitacao_prazos IS 'Os prazos abertos da Política (formalização, esclarecimento, reembolso a pagar), DERIVADOS das datas da quitação e dos parâmetros: limite, dias restantes e situação (vencido, vence em até 7 dias, no prazo). Nada aqui é digitado.';

-- ── 2) o sincronizador do relógio ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar_agendada() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record; mudou int := 0; antes text; depois text;
BEGIN
  FOR r IN SELECT q.obrigacao_id AS id FROM public.fin_quitacoes q WHERE q.intencao = 'oferta'
           UNION SELECT l.id FROM public.fin_lancamentos l WHERE l.status::text = 'quitado_terceiro' LOOP
    SELECT status::text INTO antes FROM public.fin_lancamentos WHERE id = r.id;
    BEGIN
      PERFORM public.fin_quitacao_sincronizar(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Sincronismo agendado: não consegui sincronizar a obrigação %: %', r.id, SQLERRM;   -- ex.: período fechado; fica em vw_fin_quitacao_dessincronizadas
    END;
    SELECT status::text INTO depois FROM public.fin_lancamentos WHERE id = r.id;
    IF antes IS DISTINCT FROM depois THEN mudou := mudou + 1; END IF;
  END LOOP;
  RETURN mudou;
END
$fn$;
-- só o relógio (dono do banco) e as outras funções chamam: a API não
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_agendada() FROM PUBLIC, anon, authenticated;

-- ── 3) o agendamento diário (09:00 de Brasília = 12:00 UTC), se o pg_cron existir ────────────────────────────────────────────────────────────────
DO $cron$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('quitacao-sincronizar', '0 12 * * *', 'SELECT public.fin_quitacao_sincronizar_agendada()');
  ELSE
    RAISE NOTICE 'pg_cron não está instalado: o realinhamento diário não foi agendado (a Mesa continua realinhando ao abrir).';
  END IF;
END
$cron$;

