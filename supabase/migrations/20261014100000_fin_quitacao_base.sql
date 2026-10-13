-- ─── Fase 1A (1/3): a QUITAÇÃO — quem pagou a obrigação e por quê — como FATO; as tabelas, os parâmetros e as colunas ──────────────────────────────────────
-- Política de Compras por Terceiros, Reembolsos e Doações (docs/POLITICA_*, docs/ESPECIFICACAO_FUNCIONAL_*, docs/ADENDO_RESPONSAVEL_E_INTENCAO_DA_QUITACAO_*,
-- docs/FASE1_PROPOSTA_TECNICA_QUITACAO_*). Aprovada por ela em 13/10/2026: Responsável (Pessoa, Empresa, Entidade), Intenção (Reembolso, Oferta, Compensação de
-- adiantamento, Não declarada) e Grau de Prova (Formal, Relatado, Nenhum) como FATOS; estado, fila, malote, extinção e credor atual DERIVADOS, sem campo redundante.
--
-- O que esta migration cria (nenhum lançamento existente é alterado; as colunas novas nascem nulas):
--   1. duas funções puras de validação: `fin_cnpj_valido` e `fin_nfe_chave_valida` (módulo 11) — usadas nas CHECK abaixo e pelas funções da migration seguinte;
--   2. 3 colunas OPCIONAIS em `fin_lancamentos`: `comprador` (a igreja é a compradora por documento no CNPJ ou por contratação prévia), `natureza_item`
--      (consumo, estoque, bem durável, serviço) e `nf_chave_acesso` (44 dígitos, com dígito verificador);
--   3. `fin_quitacao_parametros`: UMA linha com tetos, prazos e a VIGÊNCIA. Vigência NULA = a Política está DESLIGADA e nada bloqueia o fechamento nem o malote;
--   4. `fin_quitacoes`: a quitação por terceiro (Pessoa, Empresa ou Entidade) ou a marcação "Não localizado". UMA por obrigação nesta entrega. NÃO guarda grau de prova,
--      nível de risco, suficiência, fila, extinção nem credor: tudo isso se deriva (migration 20261014110000/20261014120000). "Igreja" e "Ninguém ainda" também são deduzidos;
--   5. `fin_quitacao_eventos`: o histórico, SÓ ACRESCENTA (gatilho recusa alterar e apagar): registrada, alterada, removida, aprovações e mudança de parâmetros.
--      Um gatilho em `fin_quitacoes` o alimenta SEMPRE — nenhuma escrita escapa — e exige motivo para alterar ou remover;
--   6. os tipos de anexo `declaracao_terceiro`, `pedido_reembolso` e `prova_pagamento_terceiro` (provam a quitação; não contam como "documento original" da despesa).
-- Só LEITURA para o app (RLS sem política de escrita): quem escreve são as funções (SECURITY DEFINER) da migration seguinte.
-- Reversível: docs/QUITACAO_ROLLBACK.sql remove funções, gatilhos e visões; por padrão MANTÉM as tabelas e as colunas (o histórico não se perde).

-- ── 1) validações puras ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_cnpj_valido(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE d text := regexp_replace(COALESCE(p, ''), '\D', '', 'g'); s int; r int; d1 int; d2 int; i int;
  p1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  p2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
  IF length(d) <> 14 OR d ~ '^(\d)\1{13}$' THEN RETURN false; END IF;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::int * p1[i]; END LOOP;
  r := s % 11; d1 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  s := 0; FOR i IN 1..12 LOOP s := s + substr(d, i, 1)::int * p2[i]; END LOOP;
  s := s + d1 * p2[13];
  r := s % 11; d2 := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
  RETURN d1 = substr(d, 13, 1)::int AND d2 = substr(d, 14, 1)::int;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_nfe_chave_valida(p text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE peso int := 2; soma int := 0; i int; r int; dv int;
BEGIN
  IF p IS NULL OR p !~ '^[0-9]{44}$' THEN RETURN false; END IF;
  FOR i IN REVERSE 43..1 LOOP
    soma := soma + substr(p, i, 1)::int * peso;
    peso := CASE WHEN peso = 9 THEN 2 ELSE peso + 1 END;
  END LOOP;
  r := soma % 11; dv := CASE WHEN r = 0 OR r = 1 THEN 0 ELSE 11 - r END;
  RETURN dv = substr(p, 44, 1)::int;
END
$fn$;

-- ── 2) colunas opcionais no lançamento ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS comprador       text,
  ADD COLUMN IF NOT EXISTS natureza_item   text,
  ADD COLUMN IF NOT EXISTS nf_chave_acesso text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_comprador_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_comprador_check CHECK (comprador IS NULL OR comprador IN ('cnpj_igreja', 'contratacao_previa'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_natureza_item_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_natureza_item_check CHECK (natureza_item IS NULL OR natureza_item IN ('consumo', 'estoque', 'duravel', 'servico'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_nf_chave_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_nf_chave_check CHECK (nf_chave_acesso IS NULL OR public.fin_nfe_chave_valida(nf_chave_acesso));
  END IF;
END $$;
COMMENT ON COLUMN public.fin_lancamentos.comprador IS 'A igreja é a compradora por documento fiscal no CNPJ dela (cnpj_igreja) ou por contratação formal prévia (contratacao_previa). Nulo = ainda não informado.';
COMMENT ON COLUMN public.fin_lancamentos.natureza_item IS 'consumo, estoque, duravel ou servico. Define o destino contábil e entra na Matriz de suficiência da prova; NÃO define o fluxo.';
COMMENT ON COLUMN public.fin_lancamentos.nf_chave_acesso IS 'Chave de acesso da NF-e (44 dígitos, só números, dígito verificador conferido). Os dígitos 7 a 20 são o CNPJ do emitente.';

-- ── 3) parâmetros da Política (uma linha) ──────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_quitacao_parametros (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  vigencia                  date,                                                          -- NULA = Política desligada: nada bloqueia fechamento nem malote
  teto_1                    numeric(14,2) NOT NULL DEFAULT 500  CHECK (teto_1 >= 0),
  prazo_declaracao_dias     int           NOT NULL DEFAULT 30   CHECK (prazo_declaracao_dias >= 0),
  teto_anual_terceiro       numeric(14,2) NOT NULL DEFAULT 2000 CHECK (teto_anual_terceiro >= 0),
  qtd_relatadas_trimestre   int           NOT NULL DEFAULT 3    CHECK (qtd_relatadas_trimestre >= 1),
  prazo_formalizacao_dias   int           NOT NULL DEFAULT 30   CHECK (prazo_formalizacao_dias >= 0),
  prazo_esclarecimento_dias int           NOT NULL DEFAULT 30   CHECK (prazo_esclarecimento_dias >= 0),
  prazo_reembolso_dias      int           NOT NULL DEFAULT 10   CHECK (prazo_reembolso_dias >= 0),
  limite_capitalizacao      numeric(14,2) CHECK (limite_capitalizacao IS NULL OR limite_capitalizacao > 0),   -- NULO = o escritório não definiu: todo bem durável conta como Alto
  atualizado_em             timestamptz,
  atualizado_por            uuid
);
INSERT INTO public.fin_quitacao_parametros (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.fin_quitacao_parametros IS 'Tetos, prazos e vigência da Política de Compras por Terceiros. Uma linha. Vigência nula = desligada. Só o Administrador altera, pela função fin_quitacao_parametros_alterar (cada mudança fica no histórico).';

-- ── 4) a quitação ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_quitacoes (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obrigacao_id              uuid NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE RESTRICT,   -- a obrigação-raiz
  responsavel_tipo          text NOT NULL CHECK (responsavel_tipo IN ('pessoa', 'empresa', 'entidade', 'nao_localizado')),
  responsavel_pessoa_id     uuid REFERENCES public.membros(id),
  responsavel_fornecedor_id uuid REFERENCES public.fin_fornecedores(id),
  intencao                  text NOT NULL CHECK (intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica')),
  pago_em                   date,                         -- quando o terceiro pagou
  declarado_em              date,                         -- quando o terceiro declarou a intenção (nulo = não declarada)
  condicao                  text CHECK (condicao IS NULL OR btrim(condicao) <> ''),   -- oferta com condição ou destinação restrita (eixo 1 da Matriz)
  pede_recibo               boolean NOT NULL DEFAULT false,   -- o terceiro pede recibo com efeito fiscal (eixo 4 da Matriz)
  registrado_por            uuid DEFAULT auth.uid(),
  registrado_em             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_quitacoes_coerencia CHECK (
       (responsavel_tipo = 'pessoa'  AND responsavel_pessoa_id IS NOT NULL AND responsavel_fornecedor_id IS NULL AND intencao <> 'nao_se_aplica' AND pago_em IS NOT NULL)
    OR (responsavel_tipo IN ('empresa', 'entidade') AND responsavel_fornecedor_id IS NOT NULL AND responsavel_pessoa_id IS NULL AND intencao <> 'nao_se_aplica' AND pago_em IS NOT NULL)
    OR (responsavel_tipo = 'nao_localizado' AND responsavel_pessoa_id IS NULL AND responsavel_fornecedor_id IS NULL AND intencao = 'nao_se_aplica'
        AND pago_em IS NULL AND declarado_em IS NULL AND condicao IS NULL AND NOT pede_recibo)),
  CONSTRAINT fin_quitacoes_declaracao CHECK ((intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento')) = (declarado_em IS NOT NULL))
);
-- UMA quitação por obrigação nesta entrega (a lista de quitações parciais fica para uma fase futura, se aparecer caso real)
CREATE UNIQUE INDEX IF NOT EXISTS fin_quitacoes_obrigacao_unica ON public.fin_quitacoes (obrigacao_id);
CREATE INDEX IF NOT EXISTS fin_quitacoes_pessoa_idx ON public.fin_quitacoes (responsavel_pessoa_id) WHERE responsavel_pessoa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_quitacoes_fornecedor_idx ON public.fin_quitacoes (responsavel_fornecedor_id) WHERE responsavel_fornecedor_id IS NOT NULL;
COMMENT ON TABLE public.fin_quitacoes IS 'Quem quitou a obrigação com o emitente (Pessoa, Empresa ou Entidade) e a intenção declarada; ou a marcação "Não localizado". Só FATOS: o grau de prova, o nível de risco, a suficiência, a fila, a extinção e o credor atual são derivados (vw_fin_quitacao). Igreja e Ninguém ainda não têm linha: o sistema os deduz do pagamento.';

-- ── 5) o histórico (só acrescenta) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_quitacao_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quitacao_id  uuid,                                       -- sem FK: é história (a quitação pode ser removida)
  obrigacao_id uuid,
  evento       text NOT NULL CHECK (evento IN ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros')),
  decisao      text CHECK (decisao IS NULL OR decisao IN ('aprovada', 'recusada')),
  de           jsonb,
  para         jsonb,
  motivo       text,
  por          uuid,
  em           timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS fin_quitacao_eventos_quitacao_idx ON public.fin_quitacao_eventos (quitacao_id, em) WHERE quitacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_quitacao_eventos_obrigacao_idx ON public.fin_quitacao_eventos (obrigacao_id, em) WHERE obrigacao_id IS NOT NULL;
COMMENT ON TABLE public.fin_quitacao_eventos IS 'Histórico da quitação, SÓ ACRESCENTA: registro, alterações (com o antes e o depois), remoção, as decisões de aprovação (reembolso e Relatado) e as mudanças de parâmetro. Quem, quando e por quê.';

CREATE OR REPLACE FUNCTION public.fin_quitacao_eventos_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'O histórico da quitação só acrescenta: não se altera nem se apaga.'; END $fn$;
DROP TRIGGER IF EXISTS fin_quitacao_eventos_imutavel ON public.fin_quitacao_eventos;
CREATE TRIGGER fin_quitacao_eventos_imutavel BEFORE UPDATE OR DELETE ON public.fin_quitacao_eventos FOR EACH ROW EXECUTE FUNCTION public.fin_quitacao_eventos_imutavel();

-- o histórico é alimentado por gatilho: nenhuma escrita em fin_quitacoes escapa dele, venha de onde vier; alterar e remover exigem motivo (a função que escreve o informa em qibrj.motivo)
CREATE OR REPLACE FUNCTION public.fin_quitacao_registra_evento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE motivo text := NULLIF(btrim(COALESCE(current_setting('qibrj.motivo', true), '')), '');
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, motivo, por) VALUES (NEW.id, NEW.obrigacao_id, 'registrada', to_jsonb(NEW), motivo, auth.uid());
    RETURN NEW;
  END IF;
  IF motivo IS NULL OR char_length(motivo) < 5 THEN
    RAISE EXCEPTION 'Toda alteração ou remoção de quitação exige o motivo (pelo menos 5 caracteres).';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, para, motivo, por) VALUES (NEW.id, NEW.obrigacao_id, 'alterada', to_jsonb(OLD), to_jsonb(NEW), motivo, auth.uid());
    RETURN NEW;
  END IF;
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, motivo, por) VALUES (OLD.id, OLD.obrigacao_id, 'removida', to_jsonb(OLD), motivo, auth.uid());
  RETURN OLD;
END
$fn$;
DROP TRIGGER IF EXISTS fin_quitacoes_historico ON public.fin_quitacoes;
CREATE TRIGGER fin_quitacoes_historico AFTER INSERT OR UPDATE OR DELETE ON public.fin_quitacoes FOR EACH ROW EXECUTE FUNCTION public.fin_quitacao_registra_evento();

-- ── 6) segurança: só LEITURA para a equipe do financeiro ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_quitacao_parametros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_quitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_quitacao_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_quitacao_parametros_leitura ON public.fin_quitacao_parametros;
CREATE POLICY fin_quitacao_parametros_leitura ON public.fin_quitacao_parametros FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_quitacoes_leitura ON public.fin_quitacoes;
CREATE POLICY fin_quitacoes_leitura ON public.fin_quitacoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_quitacao_eventos_leitura ON public.fin_quitacao_eventos;
CREATE POLICY fin_quitacao_eventos_leitura ON public.fin_quitacao_eventos FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de escrita: só as funções SECURITY DEFINER escrevem; a API não adultera nem a quitação, nem o histórico, nem os parâmetros

-- ── 7) os tipos de anexo que PROVAM a quitação ────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  -- derruba QUALQUER CHECK de tipo (o nome já variou entre as migrations) e recria a lista completa
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_lancamento_anexos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%' LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_lancamento_anexos ADD CONSTRAINT fin_lancamento_anexos_tipo_check CHECK (tipo IN (
    'nota_fiscal', 'boleto', 'guia', 'comprovante', 'fatura', 'contrato',
    'xml', 'rpa', 'rsp', 'dps', 'outro',
    'documento',                                                                      -- antigo: aceito, não mais oferecido pela tela
    'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro'));         -- Política de Compras por Terceiros
END $$;
