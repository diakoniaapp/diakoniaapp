-- ─── Juros, multa e complemento deixam de ser lançamentos: viram atributos da OBRIGAÇÃO ──────────────────────────────────────────────
-- Pedido da tesouraria (08/10/2026): "uma obrigação continua sendo uma obrigação; juros, multa e desconto enriquecem a obrigação". Hoje
-- `fin_liquidar` cria, para cada encargo, um lançamento NOVO (componente = 'juros' | 'multa' | 'complemento' | 'ajuste', categoria Juros/Multas),
-- então um IPTU de R$ 1.418 pago com R$ 80 de juros e R$ 40 de multa vira TRÊS lançamentos, e a guia, o boleto e o comprovante ficam espalhados.
--
-- Modelo novo — UM lançamento por obrigação paga, com os componentes como campos dele:
--     valor           = o que SAIU do banco  (= o que o OFX mostra; é o que mexe no saldo)
--     valor_original  = o que o documento diz        [já existia]
--     desconto        = abatimento obtido            [já existia]
--     juros, multa, complemento, ajuste              [novos]   + motivo_diferenca (obrigatório no ajuste)
--   Pagamento integral:  valor = valor_original − desconto + juros + multa + complemento + ajuste.
--   Baixa parcial continua dividindo a obrigação (o que falta segue previsto) — isso não é encargo, é o saldo da dívida.
--
-- O que NÃO muda: a assinatura de `fin_liquidar` (o app continua mandando `p_encargos`), a tabela `fin_liquidacoes` (o ato de pagar, que casa com o
-- OFX), o gatilho de saldo (só olha `valor` e `status`), as colunas `obrigacao_id`/`componente` (a baixa parcial ainda as usa; a coluna `componente`
-- continua aceitando 'juros'/'multa'... só para o legado) e o enum de status.
-- O que muda: (1) 4 colunas + motivo em fin_lancamentos; (2) `fin_liquidar` grava os encargos NO lançamento do documento; (3) `vw_fin_obrigacoes`
-- lê as colunas; (4) os 2 lançamentos de encargo que já existem (juros R$ 1,86 Localiza; multa R$ 12,50 Prefeitura) são incorporados ao documento
-- (o saldo das contas não muda: duas linhas viram uma com a soma).
-- Reversível: docs/ENCARGOS_NA_OBRIGACAO_ROLLBACK.sql devolve a função e a view anteriores; as colunas novas ficam (inofensivas).

-- ── 1) colunas novas ──────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS juros      numeric(14,2) NOT NULL DEFAULT 0 CHECK (juros >= 0),
  ADD COLUMN IF NOT EXISTS multa      numeric(14,2) NOT NULL DEFAULT 0 CHECK (multa >= 0),
  ADD COLUMN IF NOT EXISTS complemento numeric(14,2) NOT NULL DEFAULT 0 CHECK (complemento >= 0),
  ADD COLUMN IF NOT EXISTS ajuste     numeric(14,2) NOT NULL DEFAULT 0 CHECK (ajuste >= 0),
  ADD COLUMN IF NOT EXISTS motivo_diferenca text;

COMMENT ON COLUMN public.fin_lancamentos.juros IS 'Juros pagos junto com esta obrigação (parte de `valor`). Preenchido por fin_liquidar.';
COMMENT ON COLUMN public.fin_lancamentos.multa IS 'Multa paga junto com esta obrigação (parte de `valor`). Preenchido por fin_liquidar.';
COMMENT ON COLUMN public.fin_lancamentos.complemento IS 'Pago a mais, voluntário, junto com esta obrigação (parte de `valor`).';
COMMENT ON COLUMN public.fin_lancamentos.ajuste IS 'Diferença sem outra explicação (parte de `valor`); exige motivo_diferenca.';
COMMENT ON COLUMN public.fin_lancamentos.motivo_diferenca IS 'Por que o valor pago difere do documento (obrigatório quando há ajuste).';

-- ── 2) fin_liquidar: os encargos entram NO lançamento do documento ─────────────────────────────────────────────────
-- p_itens    = [{"lancamento_id": "...", "valor_pago": 1418.00, "desconto": 0}]   valor_pago = a parte do PRINCIPAL que foi paga
-- p_encargos = [{"tipo": "juros|multa|complemento|ajuste", "valor": 80.00, "lancamento_id": "<um dos itens>", "motivo": "..."}]
-- p_valor_total = o que saiu do banco. Tudo ou nada: recusa se itens + encargos não fecharem com ele.
CREATE OR REPLACE FUNCTION public.fin_liquidar(
  p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor_total numeric,
  p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  liq uuid; it jsonb; en jsonb; l public.fin_lancamentos%ROWTYPE;
  v_pago numeric; v_desc numeric; v_saldo numeric; v_orig numeric; v_raiz uuid; v_total numeric := 0; n int;
  v_tipo text; v_valor numeric; v_id uuid;
  v_juros numeric; v_multa numeric; v_compl numeric; v_ajuste numeric; v_motivo text; v_enc numeric;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'Informe ao menos um documento a pagar.'; END IF;

  -- todo encargo precisa apontar para um documento desta mesma liquidação (o encargo é atributo DELE, não um lançamento solto)
  FOR en IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    v_tipo := en->>'tipo'; v_valor := round((en->>'valor')::numeric, 2);
    IF v_tipo NOT IN ('juros', 'multa', 'complemento', 'ajuste') THEN RAISE EXCEPTION 'Tipo de encargo desconhecido: %.', v_tipo; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de % inválido.', v_tipo; END IF;
    IF v_tipo = 'ajuste' AND COALESCE(btrim(en->>'motivo'), '') = '' THEN RAISE EXCEPTION 'Ajuste manual exige o motivo da diferença.'; END IF;
    v_id := (en->>'lancamento_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE (i->>'lancamento_id')::uuid = v_id) THEN
      RAISE EXCEPTION 'O % de % não aponta para nenhum dos documentos desta liquidação.', v_tipo, v_valor;
    END IF;
  END LOOP;

  INSERT INTO public.fin_liquidacoes (conta_id, data_pagamento, forma_pagamento, valor_total, comprovante_url, ofx_fitid, observacoes)
  VALUES (p_conta_id, p_data, p_forma, p_valor_total, p_comprovante_url, p_ofx_fitid, p_observacoes)
  RETURNING id INTO liq;

  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = (it->>'lancamento_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento % não encontrado.', it->>'lancamento_id'; END IF;
    IF l.tipo <> 'saida' OR l.status <> 'previsto' THEN RAISE EXCEPTION 'O lançamento % não está previsto para pagamento (status %).', l.id, l.status; END IF;
    v_pago := (it->>'valor_pago')::numeric; v_desc := COALESCE((it->>'desconto')::numeric, 0);
    IF v_pago IS NULL OR v_pago <= 0 THEN RAISE EXCEPTION 'Valor pago inválido para o lançamento %.', l.id; END IF;
    v_saldo := l.valor - v_pago - v_desc;
    IF v_saldo < -0.004 THEN RAISE EXCEPTION 'Pago (%) + desconto (%) passa do valor da obrigação (%): o que passa é juros, multa ou complemento — informe como encargo.', v_pago, v_desc, l.valor; END IF;
    v_orig := COALESCE(l.valor_original, l.valor); v_raiz := COALESCE(l.obrigacao_id, l.id);

    -- os encargos deste documento
    SELECT COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'juros'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'multa'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'complemento'), 0),
           COALESCE(SUM(round((e->>'valor')::numeric, 2)) FILTER (WHERE e->>'tipo' = 'ajuste'), 0),
           NULLIF(string_agg(NULLIF(btrim(e->>'motivo'), ''), ' · '), '')
      INTO v_juros, v_multa, v_compl, v_ajuste, v_motivo
      FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) e WHERE (e->>'lancamento_id')::uuid = l.id;
    v_enc := v_juros + v_multa + v_compl + v_ajuste;

    IF v_saldo > 0.004 THEN  -- baixa parcial: o que falta continua previsto, com a mesma classificação e o mesmo vencimento
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_competencia, valor, valor_original, descricao, categoria_id,
        centro_custo_id, projeto_id, fornecedor_id, pessoa_id, forma_pagamento, documento_numero, observacoes, origem, campanha_missionaria,
        valor_variavel, obrigacao_id, componente)
      VALUES (l.conta_id, 'saida', 'previsto', l.data, l.data_competencia, round(v_saldo, 2), v_orig, l.descricao, l.categoria_id,
        l.centro_custo_id, l.projeto_id, l.fornecedor_id, l.pessoa_id, l.forma_pagamento, l.documento_numero, l.observacoes, l.origem, l.campanha_missionaria,
        l.valor_variavel, v_raiz, 'principal');
      -- (recorrencia_id/parcela_* NÃO são copiados: o gerador de recorrências continua vendo o mês como já gerado pelo lançamento pago)
    END IF;

    -- UM lançamento por obrigação: `valor` = tudo o que saiu do banco por ela (principal + encargos)
    UPDATE public.fin_lancamentos
       SET status = 'realizado', data_pagamento = p_data, valor = round(v_pago + v_enc, 2), desconto = round(v_desc, 2),
           juros = v_juros, multa = v_multa, complemento = v_compl, ajuste = v_ajuste,
           motivo_diferenca = COALESCE(v_motivo, motivo_diferenca),
           valor_original = v_orig, obrigacao_id = v_raiz, liquidacao_id = liq, componente = 'principal',
           conta_id = p_conta_id,
           forma_pagamento = COALESCE(p_forma, forma_pagamento), comprovante_url = COALESCE(p_comprovante_url, comprovante_url)
     WHERE id = l.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Não consegui gravar a baixa do lançamento % (permissão?).', l.id; END IF;
    v_total := v_total + round(v_pago + v_enc, 2);
  END LOOP;

  IF abs(v_total - round(p_valor_total, 2)) > 0.004 THEN
    RAISE EXCEPTION 'Documentos + encargos somam % e o pagamento foi de %: explique a diferença (% ).', v_total, round(p_valor_total, 2), round(p_valor_total, 2) - v_total;
  END IF;
  RETURN liq;
END
$fn$;

COMMENT ON FUNCTION public.fin_liquidar IS 'Liquida um ou mais documentos: baixa total/parcial e grava desconto, juros, multa, complemento e ajuste (com motivo) COMO CAMPOS do lançamento do documento — um lançamento por obrigação. Tudo ou nada; recusa se a soma não fechar com o valor pago.';

-- ── 3) a situação das obrigações, agora lida dos campos ───────────────────────────────────────────────────────────
-- Soma também o legado (lançamentos de encargo antigos, se algum restar) — por isso o resultado é o mesmo antes e depois da incorporação abaixo.
DROP VIEW IF EXISTS public.vw_fin_obrigacoes;

CREATE VIEW public.vw_fin_obrigacoes WITH (security_invoker = true) AS
WITH base AS (
  SELECT COALESCE(l.obrigacao_id, l.id) AS grupo_id, l.*
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
),
agg AS (
  SELECT grupo_id AS obrigacao_id,
         COALESCE(MAX(valor_original) FILTER (WHERE componente = 'principal'),
                  SUM(valor - juros - multa - complemento - ajuste + desconto) FILTER (WHERE componente = 'principal' AND status <> 'cancelado'), 0) AS valor_original,
         COALESCE(SUM(valor - juros - multa - complemento - ajuste) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0) AS pago_principal,
         COALESCE(SUM(desconto) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)                                    AS desconto,
         COALESCE(SUM(juros)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'juros'       AND status IN ('realizado','conciliado')), 0)                                AS juros,
         COALESCE(SUM(multa)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'multa'       AND status IN ('realizado','conciliado')), 0)                                AS multa,
         COALESCE(SUM(complemento) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'complemento' AND status IN ('realizado','conciliado')), 0)                                AS complemento,
         COALESCE(SUM(ajuste)      FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'ajuste'      AND status IN ('realizado','conciliado')), 0)                                AS ajuste,
         MIN(data) FILTER (WHERE componente = 'principal' AND status = 'previsto')                                                                      AS vencimento_pendente,
         MIN(data) FILTER (WHERE componente = 'principal')                                                                                              AS vencimento,
         BOOL_AND(status = 'cancelado')                                                                                                                 AS tudo_cancelado,
         MAX(data_pagamento)                                                                                                                            AS ultimo_pagamento,
         (ARRAY_AGG(id ORDER BY data) FILTER (WHERE componente = 'principal' AND status = 'previsto'))[1]                                               AS id_pendente
    FROM base GROUP BY grupo_id
)
SELECT a.obrigacao_id,
       a.valor_original, a.pago_principal, a.desconto, a.juros, a.multa, a.complemento, a.ajuste,
       GREATEST(a.valor_original - a.pago_principal - a.desconto, 0)                       AS saldo_pendente,
       a.pago_principal + a.juros + a.multa + a.complemento + a.ajuste                     AS total_pago,
       CASE
         WHEN a.tudo_cancelado THEN 'cancelado'
         WHEN a.pago_principal = 0 AND a.juros + a.multa + a.complemento + a.ajuste = 0
              THEN CASE WHEN COALESCE(a.vencimento_pendente, a.vencimento) < CURRENT_DATE THEN 'em_aberto' ELSE 'previsto' END
         WHEN a.valor_original - a.pago_principal - a.desconto > 0.009                      THEN 'pago_parcialmente'
         WHEN a.desconto + a.juros + a.multa + a.complemento + a.ajuste > 0                 THEN 'pago_com_diferenca'
         ELSE 'pago_integralmente'
       END                                                                                 AS situacao,
       a.vencimento_pendente, a.vencimento, a.ultimo_pagamento, a.id_pendente,
       COALESCE(a.ultimo_pagamento, a.vencimento_pendente, a.vencimento)                   AS referencia,
       r.descricao, r.fornecedor_id, r.categoria_id, r.centro_custo_id, r.conta_id
  FROM agg a
  LEFT JOIN public.fin_lancamentos r ON r.id = a.obrigacao_id;

COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, cancelado. Juros, multa, complemento, ajuste e desconto são CAMPOS do lançamento do documento (soma também lançamentos de encargo legados). security_invoker: vale a RLS de fin_lancamentos.';

REVOKE ALL ON public.vw_fin_obrigacoes FROM PUBLIC, anon;
GRANT SELECT ON public.vw_fin_obrigacoes TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) TO authenticated;

-- ── 4) incorporar os lançamentos de encargo que já existem ao documento a que pertencem ─────────────────────────────────────
-- Cada encargo legado aponta (obrigacao_id) para o grupo do documento e foi criado na MESMA liquidação (liquidacao_id). Ele é somado ao
-- lançamento principal dessa liquidação (valor e campo) e apagado. Se algum não achar o seu documento, o bloco aborta sem mudar nada.
DO $incorporar$
DECLARE c RECORD; alvo uuid; incorporados int := 0;
BEGIN
  FOR c IN SELECT * FROM public.fin_lancamentos WHERE componente IN ('juros', 'multa', 'complemento', 'ajuste') ORDER BY created_at LOOP
    SELECT id INTO alvo FROM public.fin_lancamentos p
     WHERE p.componente = 'principal' AND p.liquidacao_id IS NOT DISTINCT FROM c.liquidacao_id AND c.liquidacao_id IS NOT NULL
       AND COALESCE(p.obrigacao_id, p.id) = COALESCE(c.obrigacao_id, c.id) AND p.status IN ('realizado', 'conciliado')
     ORDER BY p.created_at LIMIT 1;
    IF alvo IS NULL THEN
      RAISE EXCEPTION 'O encargo % (%) não encontrou o documento da sua liquidação — nada foi incorporado.', c.id, c.componente;
    END IF;
    EXECUTE format('UPDATE public.fin_lancamentos SET valor = valor + $1, %I = %I + $1, motivo_diferenca = COALESCE(motivo_diferenca, $2) WHERE id = $3', c.componente, c.componente)
      USING c.valor, c.observacoes, alvo;
    DELETE FROM public.fin_lancamentos WHERE id = c.id;
    incorporados := incorporados + 1;
  END LOOP;
  RAISE NOTICE 'Encargos incorporados ao documento: %', incorporados;
END
$incorporar$;
