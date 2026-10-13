-- ─── Fase 1C-a: PAGAR O REEMBOLSO — a ponta que faltava entre "aprovado" e "pago", sem coluna nova e sem lançamento fictício ───────────────────────────────
-- Depende da 1A (20261014100000/110000/120000), do M0 (20261014130000) e da 1B (20261014140000/150000), todas aplicadas ANTES. Nenhum dado existente é alterado.
--
-- O problema: a 1A deixou o reembolso aprovado numa fila ("Reembolso a pagar"), mas a única forma de pagá-lo era a liquidação comum — e a guarda da 1A a recusa de propósito (senão
-- o fornecedor seria pago de novo). Faltava o caminho legítimo: pagar À PESSOA, com a mesma liquidação (parcial, vínculo do extrato, FITID único) e sem inventar nada.
--
-- O que esta migration faz (e o que NÃO faz):
--   1. `fin_liquidar_reembolso`: uma CASCA em volta de `fin_liquidar`. Confere as precondições (reembolso, prova suficiente, aprovação VIGENTE, valor ≤ saldo a reembolsar, papel do
--      financeiro), liga a variável `qibrj.reembolso` (a única que a guarda da 1A aceita) e chama `fin_liquidar`. NÃO cria coluna, NÃO cria entrada, NÃO cria transferência, NÃO cria
--      saída fictícia: o dinheiro sai uma vez, pela liquidação de sempre, e quem recebe é o responsável da quitação (derivado, não digitado).
--   2. `vw_fin_quitacao` passa a olhar a OBRIGAÇÃO INTEIRA (a raiz e a parcela que sobra de um pagamento parcial): a quitação só vira "Reembolsada" quando o saldo zera.
--      Antes, um pagamento parcial já marcava a raiz como paga e a visão dizia "Reembolsada" cedo demais. Colunas novas, só no fim: `reembolsado` e `saldo_a_reembolsar`.
--   3. O histórico ganha o evento `reembolso_pago` (quem pagou, quanto, em que conta, em que liquidação).
-- Reversível: docs/QUITACAO_1C_A_ROLLBACK.sql (devolve a visão da 1A e remove a função; o histórico é só-acrescenta e permanece).

-- ── 1) o histórico ganha o evento do pagamento ──────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago'));
END $$;

-- ── 2) vw_fin_quitacao: "paga" é a OBRIGAÇÃO INTEIRA, e o saldo a reembolsar nasce dos lançamentos ─────────────────────────────────────────────────────
-- fin_liquidar, num pagamento parcial, marca a RAIZ como realizada e cria uma parcela `previsto` com o que falta (mesma obrigacao_id). A visão da 1A olhava só a raiz.
-- Agora: reembolsado = soma do que já saiu do banco pela obrigação; saldo_a_reembolsar = o que ainda está previsto; "paga" = raiz paga E nada previsto.
CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
WITH base AS (
  SELECT q.id AS quitacao_id, q.obrigacao_id, q.responsavel_tipo, q.responsavel_pessoa_id, q.responsavel_fornecedor_id, q.intencao, q.pago_em, q.declarado_em,
         q.condicao, q.pede_recibo, q.registrado_por, q.registrado_em,
         l.data AS data_despesa, l.status::text AS status_despesa, COALESCE(l.valor_original, l.valor) AS valor_obrigacao,
         g.pago_total, g.em_aberto,
         public.fin_quitacao_entrada(q.id) AS entrada, public.fin_quitacao_aprovacoes(q.id) AS aprovacoes
    FROM public.fin_quitacoes q
    JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(x.valor) FILTER (WHERE x.status::text IN ('realizado', 'conciliado')), 0) AS pago_total,
             COALESCE(sum(x.valor) FILTER (WHERE x.status::text = 'previsto'), 0) AS em_aberto
        FROM public.fin_lancamentos x
       WHERE x.tipo::text = 'saida' AND (x.id = q.obrigacao_id OR x.obrigacao_id = q.obrigacao_id)) g
),
avaliadas AS (SELECT b.*, public.fin_quitacao_avaliar(b.entrada) AS a FROM base b),
resolvidas AS (
  SELECT v.*, public.fin_quitacao_resultado(jsonb_build_object(
           'responsavel', v.responsavel_tipo, 'intencao', v.intencao, 'suficiente', (v.a->>'suficiente')::boolean,
           'aprovacao', v.aprovacoes->>'reembolso',
           'paga', v.status_despesa IN ('realizado', 'conciliado') AND v.em_aberto < 0.005)) AS r
    FROM avaliadas v
)
SELECT v.quitacao_id, v.obrigacao_id, v.responsavel_tipo, v.responsavel_pessoa_id, v.responsavel_fornecedor_id, v.intencao, v.pago_em, v.declarado_em,
       v.condicao, v.pede_recibo, v.registrado_por, v.registrado_em, v.data_despesa, v.valor_obrigacao,
       v.entrada->>'grau_responsavel' AS grau_responsavel, v.entrada->>'grau_intencao' AS grau_intencao, v.a->>'grau_conjunto' AS grau_conjunto,
       v.a->>'nivel' AS nivel_risco, (v.a->>'suficiente')::boolean AS suficiente, (v.a->>'exige_aprovacao_administrador')::boolean AS exige_aprovacao_administrador,
       v.a->>'motivo' AS motivo_insuficiencia, v.a->'moduladores' AS moduladores,
       v.aprovacoes->>'reembolso' AS aprovacao_reembolso, v.aprovacoes->>'relatado' AS aprovacao_relatado,
       v.r->>'resultado' AS resultado, v.r->>'credor_atual' AS credor_atual, v.r->>'fila' AS fila,
       (p.vigencia IS NOT NULL AND (v.r->>'fila') IN ('a_esclarecer', 'formalizar') AND v.data_despesa >= p.vigencia) AS bloqueia_fechamento,
       -- colunas novas (só no fim): só o reembolso tem pagamento à pessoa; nas demais intenções não se aplicam
       CASE WHEN v.intencao = 'reembolso' THEN v.pago_total END AS reembolsado,
       CASE WHEN v.intencao = 'reembolso' THEN v.em_aberto END AS saldo_a_reembolsar
  FROM resolvidas v
 CROSS JOIN public.fin_quitacao_parametros p;
GRANT SELECT ON public.vw_fin_quitacao TO authenticated;
COMMENT ON VIEW public.vw_fin_quitacao IS 'A quitação registrada e tudo o que dela se DERIVA: graus de prova (dos anexos), nível de risco, suficiência, aprovação vigente, resultado, credor atual, fila, bloqueio de fechamento e, no reembolso, quanto já foi pago à pessoa e quanto falta. Nada aqui é digitado.';

-- ── 3) pagar o reembolso ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O fluxo (Política, seção 6): Documento → Análise → Aprovação → Obrigação com a pessoa → PAGAMENTO → Liquidação. Esta função é o "pagamento". A aprovação é outro ato, de outra pessoa
-- (ninguém aprova o próprio reembolso). Parcial é permitido: sobra uma parcela `previsto` com o saldo, e a fila "Reembolso a pagar" continua até o saldo zerar.
CREATE OR REPLACE FUNCTION public.fin_liquidar_reembolso(
  p_quitacao uuid, p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor numeric,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; v record; x public.fin_lancamentos%ROWTYPE; liq uuid; valor numeric := round(p_valor, 2);
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; uid uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para pagar um reembolso.';
  END IF;
  IF valor IS NULL OR valor <= 0 THEN RAISE EXCEPTION 'Informe o valor a reembolsar.'; END IF;
  IF p_data IS NULL OR p_data > hoje THEN RAISE EXCEPTION 'A data do pagamento é obrigatória e não pode ser futura.'; END IF;
  IF p_conta_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_id) THEN RAISE EXCEPTION 'Escolha a conta de onde o reembolso sai.'; END IF;

  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  IF q.intencao <> 'reembolso' THEN RAISE EXCEPTION 'Esta quitação não é um reembolso: não há o que pagar à pessoa (oferta extingue a conta sem pagamento).'; END IF;
  IF q.responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Não se sabe quem pagou a nota: não há a quem reembolsar.'; END IF;

  SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q.id;
  IF v.resultado IS DISTINCT FROM 'divida_com_terceiro' THEN
    RAISE EXCEPTION '%', CASE v.resultado
      WHEN 'reembolsada' THEN 'Este reembolso já foi pago por inteiro.'
      WHEN 'reembolso_em_analise' THEN 'O reembolso ainda não foi aprovado: aprove-o antes de pagar (aprovar não paga).'
      WHEN 'a_formalizar' THEN 'A prova ainda não é suficiente para pagar: ' || COALESCE(v.motivo_insuficiencia, 'anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.')
      WHEN 'a_esclarecer' THEN 'O reembolso foi recusado ou a intenção não está esclarecida: não há o que pagar.'
      ELSE 'Esta quitação não está em condições de ser paga (situação: ' || COALESCE(v.resultado, '—') || ').' END;
  END IF;
  IF valor > v.saldo_a_reembolsar + 0.004 THEN
    RAISE EXCEPTION 'O valor (%) passa do que falta reembolsar (%). Reembolso não leva juros, multa nem complemento.', valor, v.saldo_a_reembolsar;
  END IF;

  -- a parcela que está em aberto: a raiz (se nada foi pago ainda) ou a que sobrou de um pagamento parcial
  SELECT * INTO x FROM public.fin_lancamentos
   WHERE tipo::text = 'saida' AND status::text = 'previsto' AND (id = q.obrigacao_id OR obrigacao_id = q.obrigacao_id)
   ORDER BY (id = q.obrigacao_id) DESC, data LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não há parcela em aberto nesta obrigação: o reembolso já está pago.'; END IF;

  PERFORM set_config('qibrj.reembolso', 'on', true);
  liq := public.fin_liquidar(p_conta_id, p_data, p_forma, valor,
           jsonb_build_array(jsonb_build_object('lancamento_id', x.id, 'valor_pago', valor, 'desconto', 0)), '[]'::jsonb,
           p_comprovante_url, p_ofx_fitid, p_observacoes);
  PERFORM set_config('qibrj.reembolso', '', true);

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, 'reembolso_pago',
          jsonb_build_object('liquidacao_id', liq, 'valor', valor, 'conta_id', p_conta_id, 'data', p_data, 'saldo_depois', round(v.saldo_a_reembolsar - valor, 2)),
          NULLIF(btrim(COALESCE(p_observacoes, '')), ''), uid);
  RETURN liq;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_liquidar_reembolso(uuid, uuid, date, public.fin_forma_pagamento, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_liquidar_reembolso(uuid, uuid, date, public.fin_forma_pagamento, numeric, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.fin_liquidar_reembolso IS 'Paga (total ou parcialmente) o reembolso APROVADO de uma quitação, à pessoa/empresa/entidade que pagou o fornecedor. Casca sobre fin_liquidar: não cria entrada, transferência nem saída fictícia.';
