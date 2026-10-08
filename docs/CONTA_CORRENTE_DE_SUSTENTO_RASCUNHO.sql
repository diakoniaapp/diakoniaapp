-- ─── CONTA CORRENTE DE SUSTENTO — RASCUNHO DE MODELAGEM (NÃO APLICAR, NÃO É MIGRATION) ───────────────────────────
-- Pedido dela (08/10/2026), a partir do Recibo de Sustento Pastoral (RSP) de setembro/2026 do Pastor Titular:
--   Sustento pastoral − IRRF − adiantamentos = valor líquido a pagar, por COMPETÊNCIA mensal.
-- Em vez de uma "conta recorrente" de valor estimado, cada competência tem a sua apuração, os pagamentos classificados
-- (adiantamento / pagamento final / complemento) e um SALDO A PAGAR calculado. Serve ao Pastor Titular, ao Pastor Missionário,
-- a missionários sustentados, prebendas, bolsas e ajudas de custo recorrentes (campo `tipo`).
-- Documento de modelagem: docs/privado/MODELAGEM_CONTA_CORRENTE_DE_SUSTENTO_2026-10-08.md.
--
-- Princípio: `fin_lancamentos` continua sendo a verdade do DINHEIRO. Estas tabelas só dizem a que COMPETÊNCIA cada pagamento
-- pertence, que tipo de pagamento é, e quanto a apuração prevê. Nada aqui altera saldo de conta.

-- 1. quem é sustentado (um cadastro por pessoa/contrato)
CREATE TABLE IF NOT EXISTS public.sustento_beneficiarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('pastor_titular', 'pastor_missionario', 'missionario_sustentado', 'pam', 'convenio_missionario', 'prebenda', 'bolsa', 'ajuda_de_custo')),
  -- O MODO é DEFINIDO PELO TIPO (pastor_titular → avançado; os demais → simples). Só há coluna para a EXCEÇÃO: quando preenchida, vale
  -- a partir de `modo_manual_desde` (competências anteriores não são reinterpretadas) e exige o motivo.
  modo_manual        text CHECK (modo_manual IN ('simples', 'avancado')),
  modo_manual_desde  date,
  modo_manual_motivo text,
  CHECK (modo_manual IS NULL OR (modo_manual_desde IS NOT NULL AND btrim(coalesce(modo_manual_motivo, '')) <> '')),
  nome_exibicao   text NOT NULL,
  pessoa_id       uuid REFERENCES public.membros(id) ON DELETE RESTRICT,
  fornecedor_id   uuid REFERENCES public.fin_fornecedores(id) ON DELETE RESTRICT,
  conta_id        uuid REFERENCES public.fin_contas(id),                 -- conta pagadora habitual
  categoria_id    uuid REFERENCES public.fin_categorias(id),             -- ex.: Prebenda
  centro_custo_id uuid REFERENCES public.fin_centros_custo(id),          -- ex.: Pastoral · Sustento Pastoral
  dia_do_liquido  int CHECK (dia_do_liquido BETWEEN 1 AND 31),           -- dia do mês seguinte em que o líquido vence (ex.: 5)
  ativo           boolean NOT NULL DEFAULT true,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (pessoa_id IS NOT NULL OR fornecedor_id IS NOT NULL)
);

-- 2. a competência: um mês de apuração por beneficiário
CREATE TABLE IF NOT EXISTS public.sustento_competencias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id  uuid NOT NULL REFERENCES public.sustento_beneficiarios(id) ON DELETE RESTRICT,
  competencia      date NOT NULL CHECK (competencia = date_trunc('month', competencia)::date),   -- sempre o dia 1
  status           text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'paga')),
  -- MODO SIMPLES: só o valor previsto do mês; `confirmada_em` = o RSP (ou a confirmação do valor) saiu e a obrigação nasce.
  -- MODO AVANÇADO: o previsto vem das rubricas (sustento_itens) e a obrigação nasce no fechamento (RSP).
  valor_previsto   numeric(14, 2) CHECK (valor_previsto IS NULL OR valor_previsto >= 0),
  confirmada_em    timestamptz,
  -- aberta  = a competência corre (já recebe adiantamentos); a apuração ainda não saiu
  -- fechada = o RSP saiu: a apuração está conferida e o saldo a pagar vira OBRIGAÇÃO PREVISTA
  -- paga    = saldo a pagar zerado
  rsp_url          text,                                                   -- o PDF do RSP (armazenamento)
  fechada_em       timestamptz,
  obrigacao_id     uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,  -- o lançamento PREVISTO do saldo a pagar (aparece na Mesa de Operações)
  observacoes      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (beneficiario_id, competencia)
);

-- 3. as rubricas da apuração (as linhas do RSP, exceto o adiantamento, que vem dos pagamentos)
CREATE TABLE IF NOT EXISTS public.sustento_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id  uuid NOT NULL REFERENCES public.sustento_competencias(id) ON DELETE CASCADE,
  rubrica         text NOT NULL CHECK (rubrica IN ('sustento', 'arredondamento', 'outro_provento', 'irrf', 'inss', 'outro_desconto')),
  codigo          text,                                                    -- o código do RSP (011, 014, 015, 018…)
  descricao       text NOT NULL,
  natureza        text NOT NULL CHECK (natureza IN ('provento', 'desconto')),
  valor           numeric(14, 2) NOT NULL CHECK (valor >= 0),
  ordem           int NOT NULL DEFAULT 0,
  CHECK ((rubrica IN ('sustento', 'outro_provento') AND natureza = 'provento')
      OR (rubrica IN ('irrf', 'inss', 'outro_desconto') AND natureza = 'desconto')
      OR rubrica = 'arredondamento')                                       -- o arredondamento pode ser provento (+0,48) ou desconto (−0,77)
);

-- 4. os pagamentos, classificados e atribuídos a uma competência (o dinheiro é o lançamento real)
CREATE TABLE IF NOT EXISTS public.sustento_pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id  uuid NOT NULL REFERENCES public.sustento_competencias(id) ON DELETE RESTRICT,
  lancamento_id   uuid NOT NULL UNIQUE REFERENCES public.fin_lancamentos(id) ON DELETE RESTRICT,   -- um pagamento pertence a UMA competência
  tipo            text NOT NULL CHECK (tipo IN ('adiantamento', 'pagamento_final', 'complemento', 'pagamento')),   -- 'pagamento' = modo simples
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sustento_itens_competencia_idx     ON public.sustento_itens (competencia_id);
CREATE INDEX IF NOT EXISTS sustento_pagamentos_competencia_idx ON public.sustento_pagamentos (competencia_id);

-- 5. a conta corrente: o que a tela mostra, calculado (nada é digitado duas vezes)
CREATE OR REPLACE VIEW public.vw_sustento_conta_corrente AS
SELECT c.id AS competencia_id, c.beneficiario_id, b.nome_exibicao, b.tipo, c.competencia, c.status,
       i.sustento, i.outros_proventos, i.proventos,
       i.irrf, i.outros_descontos, i.descontos,
       CASE WHEN i.n_itens > 0 THEN i.proventos - i.descontos ELSE coalesce(c.valor_previsto, 0) END AS liquido_previsto,
       p.adiantamentos, p.pagamentos_finais, p.complementos, p.pagamentos_simples,
       (CASE WHEN i.n_itens > 0 THEN i.proventos - i.descontos ELSE coalesce(c.valor_previsto, 0) END)
         - p.adiantamentos - p.pagamentos_finais - p.complementos - p.pagamentos_simples AS saldo_a_pagar,
       CASE   -- o status do MODO SIMPLES; no avançado vale c.status (aberta / fechada / paga)
         WHEN p.adiantamentos + p.pagamentos_finais + p.complementos + p.pagamentos_simples <= 0 THEN 'Previsto'
         WHEN (CASE WHEN i.n_itens > 0 THEN i.proventos - i.descontos ELSE coalesce(c.valor_previsto, 0) END)
              - p.adiantamentos - p.pagamentos_finais - p.complementos - p.pagamentos_simples > 0.004 THEN 'Pago parcialmente'
         ELSE 'Pago integralmente' END AS situacao_simples
  FROM public.sustento_competencias c
  JOIN public.sustento_beneficiarios b ON b.id = c.beneficiario_id
  LEFT JOIN LATERAL (
    SELECT count(*)                                                                                                       AS n_itens,
           COALESCE(sum(valor) FILTER (WHERE rubrica = 'sustento'), 0)                                                  AS sustento,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'provento' AND rubrica <> 'sustento'), 0)                           AS outros_proventos,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'provento'), 0)                                                 AS proventos,
           COALESCE(sum(valor) FILTER (WHERE rubrica = 'irrf'), 0)                                                      AS irrf,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'desconto' AND rubrica <> 'irrf'), 0)                           AS outros_descontos,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'desconto'), 0)                                                 AS descontos
      FROM public.sustento_itens WHERE competencia_id = c.id) i ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'adiantamento'), 0)     AS adiantamentos,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'pagamento_final'), 0)  AS pagamentos_finais,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'complemento'), 0)      AS complementos,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'pagamento'), 0)        AS pagamentos_simples
      FROM public.sustento_pagamentos sp
      JOIN public.fin_lancamentos l ON l.id = sp.lancamento_id AND l.status IN ('realizado', 'conciliado')
     WHERE sp.competencia_id = c.id) p ON true;

-- 6. acesso: remuneração do pastor é dado sensível — só administração e tesouraria (decisão pendente: incluir a diretoria?)
ALTER TABLE public.sustento_beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_competencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_itens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_pagamentos    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sustento_beneficiarios, public.sustento_competencias, public.sustento_itens, public.sustento_pagamentos FROM anon;
CREATE POLICY sustento_beneficiarios_equipe ON public.sustento_beneficiarios FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
CREATE POLICY sustento_competencias_equipe ON public.sustento_competencias FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
CREATE POLICY sustento_itens_equipe ON public.sustento_itens FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
CREATE POLICY sustento_pagamentos_equipe ON public.sustento_pagamentos FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));

-- ─── Regras de classificação do pagamento (aplicadas pelo app, não pelo banco) ─────────────────────────────────────
--   · ADIANTAMENTO (só modo avançado): pagamento até o dia 20 → competência do mês da data; depois do dia 20 → competência seguinte.
--   · PAGAMENTO FINAL (avançado) e PAGAMENTO (simples): a competência mais antiga com saldo a pagar — não a do mês da data
--     (o líquido de agosto é pago no início de setembro). Sempre editável.
--   · Exemplo do Pastor Missionário (RSP de setembro/2026): previsto 2.362,00; IRRF 0,00; sem adiantamento → modo simples.
-- ─── Exemplo de conferência (setembro/2026 do Pastor Titular, do RSP) — o que a visão deve devolver ────────────
--   sustento 17.451,84 · outros proventos 0,48 (arredondamento) → proventos 17.452,32
--   IRRF 3.723,55 · outros descontos 0,77 (arredondamento)     → descontos 3.724,32
--   líquido previsto 13.728,00 · adiantamentos 8.000,00 (dois PIX de 4.000: 09/09 e 15/09) → saldo a pagar 5.728,00
