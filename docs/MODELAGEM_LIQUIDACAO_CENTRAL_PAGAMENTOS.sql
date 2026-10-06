-- ─── RASCUNHO PARA REVISÃO — liquidação real da Central de Pagamentos ───────────────────────────────────────
--
-- NÃO É UMA MIGRATION: está em docs/ de propósito. Só vira migration (supabase/migrations/…) depois da sua aprovação,
-- e então é ensaiada com BEGIN/ROLLBACK, como as outras. NÃO ENSAIADA e NÃO APLICADA (o token de gerenciamento está sem acesso).
-- Modelagem, cenários e impacto: docs/MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS.md
--
-- PRINCÍPIO: nada do que existe muda de significado. Um lançamento continua sendo "dinheiro que circulou" (realizado/
-- conciliado) ou "obrigação prevista"; saldo das contas, DRE, extratos, Fechamento e OFX seguem lendo `valor` e `status`
-- como hoje. As colunas novas são todas opcionais: os 13 mil lançamentos atuais ficam como estão e são lidos como
-- "Pago integralmente, sem diferença" (valor_original NULL = igual ao valor).
--
-- O QUE ENTRA
--   1. fin_lancamentos: valor_original · desconto · obrigacao_id · liquidacao_id · componente
--   2. fin_liquidacoes: o ATO de pagar (uma saída do banco = uma linha) — é a unidade que se compara com o OFX
--   3. vw_fin_obrigacoes: a situação de cada obrigação (Previsto, Em Aberto, Pago Parcialmente, Pago Integralmente,
--      Pago com Diferença, Cancelado) CALCULADA a partir dos lançamentos — nenhum status novo no enum
--   4. fin_liquidar(): grava tudo numa transação só (baixa parcial, juros, multa, desconto, vários documentos)

-- ── 1) colunas novas, todas opcionais ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS valor_original numeric(14,2),          -- valor da OBRIGAÇÃO (o que o documento diz); NULL = igual a `valor`
  ADD COLUMN IF NOT EXISTS desconto       numeric(14,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  ADD COLUMN IF NOT EXISTS obrigacao_id   uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,  -- agrupa as fatias/encargos da mesma obrigação (= id do lançamento-raiz)
  ADD COLUMN IF NOT EXISTS liquidacao_id  uuid,                    -- FK abaixo, depois de criar a tabela
  ADD COLUMN IF NOT EXISTS componente     text NOT NULL DEFAULT 'principal';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_componente_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_componente_check
      CHECK (componente IN ('principal', 'juros', 'multa', 'complemento', 'ajuste'));
  END IF;
END $$;

COMMENT ON COLUMN public.fin_lancamentos.valor_original IS 'Valor da obrigação conforme o documento (boleto/guia/fatura). NULL = igual a valor. Quando há desconto ou baixa parcial, `valor` passa a ser o que saiu do caixa e este guarda o original.';
COMMENT ON COLUMN public.fin_lancamentos.componente IS 'principal = a obrigação; juros/multa = encargos criados na liquidação; complemento = pago a mais, voluntário; ajuste = diferença sem outra explicação (exige motivo).';

CREATE INDEX IF NOT EXISTS fin_lancamentos_obrigacao_idx  ON public.fin_lancamentos (obrigacao_id) WHERE obrigacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_lancamentos_liquidacao_idx ON public.fin_lancamentos (liquidacao_id) WHERE liquidacao_id IS NOT NULL;

-- ── 2) o ato de pagar ───────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_liquidacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id        uuid NOT NULL REFERENCES public.fin_contas(id),
  data_pagamento  date NOT NULL,
  forma_pagamento public.fin_forma_pagamento,
  valor_total     numeric(14,2) NOT NULL CHECK (valor_total > 0),   -- o que SAIU do banco; é o número que o OFX mostra
  comprovante_url text,
  ofx_fitid       text,                                             -- preenchido quando a liquidação nasce (ou é ligada) de uma linha do extrato
  observacoes     text,
  criado_por      uuid DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fin_liquidacoes_ofx_unico ON public.fin_liquidacoes (conta_id, ofx_fitid) WHERE ofx_fitid IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_liquidacao_fk') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_liquidacao_fk
      FOREIGN KEY (liquidacao_id) REFERENCES public.fin_liquidacoes(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.fin_liquidacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_liquidacoes_equipe ON public.fin_liquidacoes;
CREATE POLICY fin_liquidacoes_equipe ON public.fin_liquidacoes
  FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

-- ── 3) a situação de cada obrigação, calculada ──────────────────────────────────────────────────────────────
-- Uma obrigação = o lançamento-raiz e tudo que aponta para ele (obrigacao_id). Lançamento antigo, sem obrigacao_id, é
-- a sua própria obrigação. "Em Aberto" = sem nada pago e vencimento já passou; "Previsto" = sem nada pago e a vencer.
CREATE OR REPLACE VIEW public.vw_fin_obrigacoes AS
WITH base AS (
  SELECT COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.*
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
),
agg AS (
  SELECT obrigacao_id,
         COALESCE(MAX(valor_original) FILTER (WHERE componente = 'principal'),
                  SUM(valor + desconto) FILTER (WHERE componente = 'principal' AND status <> 'cancelado'), 0)       AS valor_original,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0) AS pago_principal,
         COALESCE(SUM(desconto) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0) AS desconto,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'juros'       AND status IN ('realizado','conciliado')), 0) AS juros,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'multa'       AND status IN ('realizado','conciliado')), 0) AS multa,
         COALESCE(SUM(valor)    FILTER (WHERE componente IN ('complemento','ajuste') AND status IN ('realizado','conciliado')), 0) AS complemento,
         MIN(data) FILTER (WHERE componente = 'principal' AND status = 'previsto')                                    AS vencimento_pendente,
         MIN(data) FILTER (WHERE componente = 'principal')                                                            AS vencimento,
         BOOL_AND(status = 'cancelado')                                                                               AS tudo_cancelado,
         MAX(data_pagamento)                                                                                          AS ultimo_pagamento
    FROM base GROUP BY obrigacao_id
)
SELECT a.*,
       GREATEST(a.valor_original - a.pago_principal - a.desconto, 0)                       AS saldo_pendente,
       a.pago_principal + a.juros + a.multa + a.complemento                                AS total_pago,
       CASE
         WHEN a.tudo_cancelado THEN 'cancelado'
         WHEN a.pago_principal = 0 AND a.juros + a.multa + a.complemento = 0
              THEN CASE WHEN COALESCE(a.vencimento_pendente, a.vencimento) < CURRENT_DATE THEN 'em_aberto' ELSE 'previsto' END
         WHEN a.valor_original - a.pago_principal - a.desconto > 0.009                      THEN 'pago_parcialmente'
         WHEN a.desconto + a.juros + a.multa + a.complemento > 0                            THEN 'pago_com_diferenca'
         ELSE 'pago_integralmente'
       END AS situacao
  FROM agg a;

COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar, calculada dos lançamentos: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, cancelado. Lançamento antigo = obrigação própria, sem diferença.';

-- ── 4) liquidar: tudo ou nada ───────────────────────────────────────────────────────────────────────────────
-- p_itens     = [{"lancamento_id": "...", "valor_pago": 1418.00, "desconto": 0}]       (um por documento/obrigação)
-- p_encargos  = [{"tipo": "juros|multa|complemento|ajuste", "valor": 80.00, "lancamento_id": "...", "motivo": "..."}]
--               (lancamento_id = a obrigação a que o encargo se refere; `ajuste` exige motivo)
-- p_valor_total = o que saiu do banco (ou o que o OFX mostra). A função RECUSA se itens + encargos não fecharem com ele:
--               diferença sem explicação não liquida sozinha — é o "motivo da diferença" da tela.
CREATE OR REPLACE FUNCTION public.fin_liquidar(
  p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor_total numeric,
  p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  liq uuid; it jsonb; en jsonb; l public.fin_lancamentos%ROWTYPE; ref public.fin_lancamentos%ROWTYPE;
  v_pago numeric; v_desc numeric; v_saldo numeric; v_orig numeric; v_raiz uuid; v_total numeric := 0; n int;
  v_cat uuid; v_tipo text; v_valor numeric;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'Informe ao menos um documento a pagar.'; END IF;

  INSERT INTO public.fin_liquidacoes (conta_id, data_pagamento, forma_pagamento, valor_total, comprovante_url, ofx_fitid, observacoes)
  VALUES (p_conta_id, p_data, p_forma, p_valor_total, p_comprovante_url, p_ofx_fitid, p_observacoes)
  RETURNING id INTO liq;

  -- documentos: baixa total ou parcial, com desconto
  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = (it->>'lancamento_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento % não encontrado.', it->>'lancamento_id'; END IF;
    IF l.tipo <> 'saida' OR l.status <> 'previsto' THEN RAISE EXCEPTION 'O lançamento % não está previsto para pagamento (status %).', l.id, l.status; END IF;
    v_pago := (it->>'valor_pago')::numeric; v_desc := COALESCE((it->>'desconto')::numeric, 0);
    IF v_pago IS NULL OR v_pago <= 0 THEN RAISE EXCEPTION 'Valor pago inválido para o lançamento %.', l.id; END IF;
    v_saldo := l.valor - v_pago - v_desc;
    IF v_saldo < -0.004 THEN RAISE EXCEPTION 'Pago (%) + desconto (%) passa do valor da obrigação (%): o que passa é juros, multa ou complemento — informe como encargo.', v_pago, v_desc, l.valor; END IF;
    v_orig := COALESCE(l.valor_original, l.valor); v_raiz := COALESCE(l.obrigacao_id, l.id);

    IF v_saldo > 0.004 THEN  -- baixa parcial: o que falta continua previsto, com a mesma classificação e o mesmo vencimento
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_competencia, valor, valor_original, descricao, categoria_id,
        centro_custo_id, projeto_id, fornecedor_id, pessoa_id, forma_pagamento, documento_numero, observacoes, origem, campanha_missionaria,
        obrigacao_id, componente)
      VALUES (l.conta_id, 'saida', 'previsto', l.data, l.data_competencia, round(v_saldo, 2), v_orig, l.descricao, l.categoria_id,
        l.centro_custo_id, l.projeto_id, l.fornecedor_id, l.pessoa_id, l.forma_pagamento, l.documento_numero, l.observacoes, l.origem, l.campanha_missionaria,
        v_raiz, 'principal');
      -- (recorrencia_id/parcela_* NÃO são copiados: o gerador de recorrências continua vendo o mês como já gerado pelo lançamento pago)
    END IF;

    UPDATE public.fin_lancamentos
       SET status = 'realizado', data_pagamento = p_data, valor = round(v_pago, 2), desconto = round(v_desc, 2),
           valor_original = v_orig, obrigacao_id = v_raiz, liquidacao_id = liq, componente = 'principal',
           conta_id = p_conta_id,
           forma_pagamento = COALESCE(p_forma, forma_pagamento), comprovante_url = COALESCE(p_comprovante_url, comprovante_url)
     WHERE id = l.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Não consegui gravar a baixa do lançamento % (permissão?).', l.id; END IF;
    v_total := v_total + round(v_pago, 2);
  END LOOP;

  -- encargos: juros, multa, complemento, ajuste — viram DESPESAS ligadas à mesma obrigação, centro e fornecedor
  FOR en IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    v_tipo := en->>'tipo'; v_valor := round((en->>'valor')::numeric, 2);
    IF v_tipo NOT IN ('juros', 'multa', 'complemento', 'ajuste') THEN RAISE EXCEPTION 'Tipo de encargo desconhecido: %.', v_tipo; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de % inválido.', v_tipo; END IF;
    IF v_tipo = 'ajuste' AND COALESCE(btrim(en->>'motivo'), '') = '' THEN RAISE EXCEPTION 'Ajuste manual exige o motivo da diferença.'; END IF;
    SELECT * INTO ref FROM public.fin_lancamentos WHERE id = (en->>'lancamento_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obrigação de referência do % não encontrada.', v_tipo; END IF;
    v_cat := CASE v_tipo
      WHEN 'juros' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Juros'  AND tipo = 'saida' LIMIT 1)
      WHEN 'multa' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Multas' AND tipo = 'saida' LIMIT 1)
      ELSE ref.categoria_id END;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Categoria de % não encontrada no plano de contas.', v_tipo; END IF;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, descricao, categoria_id, centro_custo_id, projeto_id,
      fornecedor_id, pessoa_id, forma_pagamento, observacoes, origem, obrigacao_id, liquidacao_id, componente)
    VALUES (p_conta_id, 'saida', 'realizado', p_data, p_data, v_valor,
      initcap(v_tipo) || ' — ' || COALESCE(ref.descricao, 'pagamento'), v_cat, ref.centro_custo_id, ref.projeto_id,
      ref.fornecedor_id, ref.pessoa_id, p_forma, NULLIF(btrim(en->>'motivo'), ''), 'liquidacao', COALESCE(ref.obrigacao_id, ref.id), liq, v_tipo);
    v_total := v_total + v_valor;
  END LOOP;

  IF abs(v_total - round(p_valor_total, 2)) > 0.004 THEN
    RAISE EXCEPTION 'Documentos + encargos somam % e o pagamento foi de %: explique a diferença (% ).', v_total, round(p_valor_total, 2), round(p_valor_total, 2) - v_total;
  END IF;
  RETURN liq;
END
$fn$;

COMMENT ON FUNCTION public.fin_liquidar IS 'Liquida um ou mais documentos de uma vez: baixa total/parcial, desconto, juros, multa, complemento e ajuste (com motivo). Tudo ou nada; recusa se a soma não fechar com o valor pago.';

-- Relatórios (viram telas na fase 5; a base já responde):
--   juros do mês:        SELECT sum(valor) FROM fin_lancamentos WHERE componente = 'juros'  AND status IN ('realizado','conciliado') AND date_trunc('month', data_pagamento) = ...
--   multas:              idem com 'multa'
--   encargos financeiros:juros + multa (+ a categoria 'IOF' e tarifas, que já existem no plano de contas)
--   parcialmente pagas:  SELECT * FROM vw_fin_obrigacoes WHERE situacao = 'pago_parcialmente'
--   com desconto / economia: SELECT * FROM vw_fin_obrigacoes WHERE desconto > 0  ·  sum(desconto)
