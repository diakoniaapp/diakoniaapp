-- ─── CONTA CORRENTE DE SUSTENTO — Fase 1 (tabelas + visão de leitura) ────────────────────────────────────────────
-- Pedido dela (08/10/2026), a partir do Recibo de Sustento Pastoral (RSP) de setembro/2026 do Pastor Titular e do Pastor
-- Missionário: sustento − IRRF − adiantamentos = líquido a pagar, por COMPETÊNCIA mensal. Em vez de uma recorrência de valor
-- estimado (que o RSP sempre desmentia), cada competência tem a sua apuração, os pagamentos ligados a ela e um SALDO A PAGAR calculado.
-- Documento de modelagem: docs/privado/MODELAGEM_CONTA_CORRENTE_DE_SUSTENTO_2026-10-08.md.
--
-- O QUE ESTA MIGRATION FAZ — e só isto:
--   · cria 4 tabelas e 1 visão, todas novas e vazias;
--   · NÃO altera nenhum lançamento, nenhum saldo, nenhuma recorrência, nenhum OFX; NÃO apaga nem recalcula nada.
--   · `fin_lancamentos` continua sendo a verdade do DINHEIRO. Estas tabelas só dizem a que COMPETÊNCIA cada pagamento pertence,
--     que tipo de pagamento é, e quanto a apuração prevê. Por isso `sustento_pagamentos.lancamento_id` é só uma referência.
--   · reversível por inteiro: DROP VIEW vw_sustento_conta_corrente; DROP TABLE sustento_pagamentos, sustento_itens,
--     sustento_competencias, sustento_beneficiarios; (ninguém mais depende delas).
--
-- QUEM USA A CONTA CORRENTE — decidido pela FORMA DE RECEBER, não pelo cargo (revisão dela em 08/10/2026):
--   `controle_por_competencia` (padrão: não). Ligado, o beneficiário passa a ter competência mensal, adiantamentos, complementos e
--   saldo a pagar; desligado, ele continua sendo pago pelas recorrências e lançamentos de sempre. Qualquer tipo pode ligar —
--   pastor, funcionário, missionário, bolsista, PAM, convênio — basta a igreja começar a trabalhar com adiantamento, complemento
--   ou saldo residual. O `tipo` é só rótulo. (A versão anterior deste arquivo amarrava o comportamento ao tipo — pastor_titular
--   avançado, os demais simples — e tinha as colunas modo_manual*; foi trocada antes de ser aplicada.)
-- TIPO DE CONTROLE — com o controle ligado, a igreja escolhe como administrar aquele compromisso (pedido dela, 08/10/2026):
--   `tipo_controle`: automatico (padrão) | simples | avancado.
--     simples  = valor previsto, valor pago e saldo; sem IRRF, adiantamento, complemento ou rubricas.
--     avancado = sustento bruto, IRRF, outros descontos, adiantamentos, complementos e líquido (as rubricas do RSP).
--     automatico = o app sugere o mais adequado pelo histórico do beneficiário (adiantamentos/rubricas regulares → avançado;
--                  sem histórico, o rótulo do tipo serve de ponto de partida) — src/lib/sustento.ts: sugerirModo.
--   A troca vale SÓ PARA NOVAS COMPETÊNCIAS: cada competência guarda o modo com que nasceu (`sustento_competencias.modo`) e o banco
--   recusa mudá-lo depois que ela tem rubricas ou pagamentos. Nada é reinterpretado nem recalculado.
--   Quem e quando: o gatilho `sustento_registrar_controle` grava cada mudança de controle ou de tipo de controle em
--   `sustento_controle_historico` (nome de quem alterou incluído, porque a tesouraria não lê o perfil dos outros usuários). A
--   tabela só tem política de LEITURA — ninguém escreve nela, só o gatilho; e não há UPDATE nem DELETE.
--
-- ACESSO: remuneração de pastor é dado sensível. Só administração e tesouraria (pedido dela: "Tesouraria, Administração.
-- Avalie posteriormente liberar visualização para perfis específicos"). Sem `diakonia` e sem `secretaria` de propósito — a malha
-- aqui é MAIS ESTREITA que a do financeiro. FORCE ROW LEVEL SECURITY + política restritiva contra anon, como fin_extrato_ignorados.
-- A visão é `security_invoker`: sem isso ela rodaria com os direitos do dono e furaria a RLS das tabelas.

-- 1. quem é sustentado (um cadastro por pessoa/contrato)
CREATE TABLE IF NOT EXISTS public.sustento_beneficiarios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text NOT NULL CHECK (tipo IN ('pastor_titular', 'pastor_missionario', 'funcionario', 'missionario_sustentado', 'pam', 'convenio_missionario', 'prebenda', 'bolsa', 'ajuda_de_custo')),
  nome_exibicao   text NOT NULL CHECK (length(btrim(nome_exibicao)) > 0),
  -- "Controle por competência": ( ) Não utilizar  ( ) Utilizar Conta Corrente de Sustento. Desligar não apaga competência nenhuma:
  -- o histórico fica guardado e a tela o mostra como histórico.
  controle_por_competencia boolean NOT NULL DEFAULT false,
  tipo_controle   text NOT NULL DEFAULT 'automatico' CHECK (tipo_controle IN ('automatico', 'simples', 'avancado')),
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
  -- aberta  = a competência corre (já recebe adiantamentos); a apuração ainda não saiu
  -- fechada = o RSP saiu: a apuração está conferida e o saldo a pagar vira OBRIGAÇÃO PREVISTA
  -- paga    = saldo a pagar zerado
  status           text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada', 'paga')),
  -- O modo com que a competência NASCEU (o app resolve o "automático" no momento de criar). Sem DEFAULT de propósito: quem cria
  -- a competência decide; um padrão silencioso reinterpretaria o histórico. Imutável depois que há rubricas ou pagamentos.
  modo             text NOT NULL CHECK (modo IN ('simples', 'avancado')),
  -- Sem rubricas: só o valor previsto do mês (`valor_previsto`); `confirmada_em` = o valor foi confirmado e a obrigação nasce.
  -- Com rubricas (sustento_itens, as linhas do RSP): o líquido vem delas e a obrigação nasce no fechamento.
  valor_previsto   numeric(14, 2) CHECK (valor_previsto IS NULL OR valor_previsto >= 0),
  confirmada_em    timestamptz,
  rsp_url          text,                                                   -- o PDF do RSP (armazenamento)
  fechada_em       timestamptz,
  obrigacao_id     uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,  -- o lançamento PREVISTO do saldo a pagar (Fase 2)
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

-- 4. os pagamentos, classificados e atribuídos a uma competência (o dinheiro é o lançamento real, que não é tocado)
CREATE TABLE IF NOT EXISTS public.sustento_pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id  uuid NOT NULL REFERENCES public.sustento_competencias(id) ON DELETE RESTRICT,
  lancamento_id   uuid NOT NULL UNIQUE REFERENCES public.fin_lancamentos(id) ON DELETE RESTRICT,   -- um pagamento pertence a UMA competência
  tipo            text NOT NULL CHECK (tipo IN ('adiantamento', 'pagamento_final', 'complemento', 'pagamento')),   -- 'pagamento' = pagamento do líquido sem distinguir adiantamento de pagamento final
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sustento_competencias_beneficiario_idx ON public.sustento_competencias (beneficiario_id, competencia DESC);
CREATE INDEX IF NOT EXISTS sustento_itens_competencia_idx         ON public.sustento_itens (competencia_id);
CREATE INDEX IF NOT EXISTS sustento_pagamentos_competencia_idx    ON public.sustento_pagamentos (competencia_id);

-- 5. a conta corrente: o que a tela mostra, calculado (nada é digitado duas vezes)
CREATE OR REPLACE VIEW public.vw_sustento_conta_corrente WITH (security_invoker = true) AS
SELECT c.id AS competencia_id, c.beneficiario_id, b.nome_exibicao, b.tipo, b.controle_por_competencia, c.competencia, c.status, c.modo,
       c.valor_previsto, c.confirmada_em, c.fechada_em, c.rsp_url, c.obrigacao_id,
       i.n_itens, i.sustento, i.outros_proventos, i.proventos,
       i.irrf, i.outros_descontos, i.descontos,
       CASE WHEN i.n_itens > 0 THEN i.proventos - i.descontos ELSE coalesce(c.valor_previsto, 0) END AS liquido_previsto,
       p.adiantamentos, p.pagamentos_finais, p.complementos, p.pagamentos_simples,
       (CASE WHEN i.n_itens > 0 THEN i.proventos - i.descontos ELSE coalesce(c.valor_previsto, 0) END)
         - p.adiantamentos - p.pagamentos_finais - p.complementos - p.pagamentos_simples AS saldo_a_pagar
  FROM public.sustento_competencias c
  JOIN public.sustento_beneficiarios b ON b.id = c.beneficiario_id
  LEFT JOIN LATERAL (
    SELECT count(*)                                                                                  AS n_itens,
           COALESCE(sum(valor) FILTER (WHERE rubrica = 'sustento'), 0)                               AS sustento,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'provento' AND rubrica <> 'sustento'), 0)    AS outros_proventos,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'provento'), 0)                              AS proventos,
           COALESCE(sum(valor) FILTER (WHERE rubrica = 'irrf'), 0)                                   AS irrf,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'desconto' AND rubrica <> 'irrf'), 0)        AS outros_descontos,
           COALESCE(sum(valor) FILTER (WHERE natureza = 'desconto'), 0)                              AS descontos
      FROM public.sustento_itens WHERE competencia_id = c.id) i ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'adiantamento'), 0)     AS adiantamentos,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'pagamento_final'), 0)  AS pagamentos_finais,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'complemento'), 0)      AS complementos,
           COALESCE(sum(l.valor) FILTER (WHERE sp.tipo = 'pagamento'), 0)        AS pagamentos_simples
      FROM public.sustento_pagamentos sp
      JOIN public.fin_lancamentos l ON l.id = sp.lancamento_id AND l.status IN ('realizado', 'conciliado')
     WHERE sp.competencia_id = c.id) p ON true;

-- 5b. quem mudou o controle, e quando (append-only: só o gatilho escreve)
CREATE TABLE IF NOT EXISTS public.sustento_controle_historico (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id        uuid NOT NULL REFERENCES public.sustento_beneficiarios(id) ON DELETE RESTRICT,
  controle_anterior      boolean,                 -- nulo no cadastro inicial
  controle_novo          boolean NOT NULL,
  tipo_controle_anterior text,
  tipo_controle_novo     text NOT NULL,
  alterado_por           uuid,                    -- auth.uid(); nulo quando a mudança vem do SQL Editor
  alterado_por_nome      text,
  alterado_em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sustento_controle_historico_idx ON public.sustento_controle_historico (beneficiario_id, alterado_em DESC);

CREATE OR REPLACE FUNCTION public.sustento_registrar_controle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE v_nome text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.controle_por_competencia IS NOT DISTINCT FROM OLD.controle_por_competencia
                      AND NEW.tipo_controle IS NOT DISTINCT FROM OLD.tipo_controle THEN
    RETURN NEW;
  END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.sustento_controle_historico
    (beneficiario_id, controle_anterior, controle_novo, tipo_controle_anterior, tipo_controle_novo, alterado_por, alterado_por_nome)
  VALUES (NEW.id,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.controle_por_competencia END, NEW.controle_por_competencia,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.tipo_controle END, NEW.tipo_controle,
          auth.uid(), v_nome);
  RETURN NEW;
END
$f$;
REVOKE ALL ON FUNCTION public.sustento_registrar_controle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sustento_registrar_controle ON public.sustento_beneficiarios;
CREATE TRIGGER trg_sustento_registrar_controle
  AFTER INSERT OR UPDATE OF controle_por_competencia, tipo_controle ON public.sustento_beneficiarios
  FOR EACH ROW EXECUTE FUNCTION public.sustento_registrar_controle();

-- o modo de uma competência com movimento não se reinterpreta
CREATE OR REPLACE FUNCTION public.sustento_proteger_modo() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF NEW.modo IS DISTINCT FROM OLD.modo
     AND (EXISTS (SELECT 1 FROM public.sustento_itens WHERE competencia_id = OLD.id)
          OR EXISTS (SELECT 1 FROM public.sustento_pagamentos WHERE competencia_id = OLD.id)) THEN
    RAISE EXCEPTION 'O modo de uma competência com rubricas ou pagamentos não pode ser alterado (a troca vale só para novas competências).';
  END IF;
  RETURN NEW;
END
$f$;
DROP TRIGGER IF EXISTS trg_sustento_proteger_modo ON public.sustento_competencias;
CREATE TRIGGER trg_sustento_proteger_modo BEFORE UPDATE OF modo ON public.sustento_competencias
  FOR EACH ROW EXECUTE FUNCTION public.sustento_proteger_modo();

-- 6. acesso
ALTER TABLE public.sustento_beneficiarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_competencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_itens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_pagamentos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_controle_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_controle_historico FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_beneficiarios FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_competencias  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_itens         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sustento_pagamentos    FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.sustento_beneficiarios, public.sustento_competencias, public.sustento_itens, public.sustento_pagamentos,
              public.sustento_controle_historico, public.vw_sustento_conta_corrente FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Bloqueia anon" ON public.sustento_beneficiarios;
CREATE POLICY "Bloqueia anon" ON public.sustento_beneficiarios AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Bloqueia anon" ON public.sustento_competencias;
CREATE POLICY "Bloqueia anon" ON public.sustento_competencias AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Bloqueia anon" ON public.sustento_itens;
CREATE POLICY "Bloqueia anon" ON public.sustento_itens AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Bloqueia anon" ON public.sustento_pagamentos;
CREATE POLICY "Bloqueia anon" ON public.sustento_pagamentos AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Bloqueia anon" ON public.sustento_controle_historico;
CREATE POLICY "Bloqueia anon" ON public.sustento_controle_historico AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
-- só LEITURA: quem escreve é o gatilho (SECURITY DEFINER). Sem política de INSERT/UPDATE/DELETE, o histórico não se forja nem se apaga.
DROP POLICY IF EXISTS "Sustento le" ON public.sustento_controle_historico;
CREATE POLICY "Sustento le" ON public.sustento_controle_historico FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));

DROP POLICY IF EXISTS "Sustento" ON public.sustento_beneficiarios;
CREATE POLICY "Sustento" ON public.sustento_beneficiarios FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS "Sustento" ON public.sustento_competencias;
CREATE POLICY "Sustento" ON public.sustento_competencias FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS "Sustento" ON public.sustento_itens;
CREATE POLICY "Sustento" ON public.sustento_itens FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS "Sustento" ON public.sustento_pagamentos;
CREATE POLICY "Sustento" ON public.sustento_pagamentos FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sustento_beneficiarios, public.sustento_competencias, public.sustento_itens, public.sustento_pagamentos TO authenticated;
GRANT SELECT ON public.vw_sustento_conta_corrente, public.sustento_controle_historico TO authenticated;

-- ─── Conferência (setembro/2026 do Pastor Titular, a partir do RSP) — o que a visão deve devolver depois da carga ──
--   sustento 17.451,84 · outros proventos 0,48 (arredondamento) → proventos 17.452,32
--   IRRF 3.723,55 · outros descontos 0,77 (arredondamento)     → descontos 3.724,32
--   líquido previsto 13.728,00 · adiantamentos 8.000,00 (dois PIX de 4.000: 09/09 e 15/09) → saldo a pagar 5.728,00
