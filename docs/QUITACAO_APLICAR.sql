-- APLICAÇÃO DEFINITIVA da Fase 1A da Quitação — só depois do "pode aplicar" dela. GRAVA: 3 tabelas novas (fin_quitacao_parametros, fin_quitacoes, fin_quitacao_eventos),
-- 3 colunas OPCIONAIS em fin_lancamentos, 2 tipos de validação, 14 funções, 4 gatilhos, 1 visão nova (vw_fin_quitacao) e a vw_fin_ciclo ampliada (colunas só no fim).
-- NENHUM lançamento existente é alterado, NENHUMA quitação existe, a VIGÊNCIA nasce DESLIGADA (nada bloqueia o fechamento nem o malote).
-- Idêntico a supabase/migrations/20261014100000, 20261014110000 e 20261014120000, em sequência. Pode rodar mais de uma vez. Para desfazer: docs/QUITACAO_ROLLBACK.sql.
-- Antes de rodar: rode docs/QUITACAO_ENSAIO.sql e confira "TUDO OK, pode aplicar".
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


-- ─── Fase 1A (2/3): as FUNÇÕES da Quitação — a Matriz de suficiência, o registro, a alteração, a remoção, a aprovação e as guardas ──────────────────────
-- Depende de 20261014100000. Nenhum dado existente é alterado; só nascem funções e gatilhos.
--
-- O que esta migration cria:
--   1. `fin_quitacao_graus`, `fin_quitacao_avaliar` (a Matriz, cláusula 3.7 da Política) e `fin_quitacao_resultado` (resultado, credor atual e fila): funções PURAS, as mesmas de
--      lib/quitacao.ts (provadas equivalentes em milhares de cenários). O grau de prova NASCE DOS ANEXOS; não é digitado.
--   2. `fin_quitacao_entrada` (monta, de uma quitação, tudo o que a Matriz precisa: anexos, nota, chave, circuito, histórico de pagamentos, moduladores) e `fin_quitacao_aprovacoes`
--      (a decisão vigente de cada tipo, que perde a validade se a quitação mudar depois dela).
--   3. `fin_registrar_quitacao`, `fin_alterar_quitacao`, `fin_remover_quitacao`: quem escreve na tabela. Registram o histórico por gatilho; a alteração e a remoção exigem motivo.
--   4. `fin_decidir_quitacao`: a APROVAÇÃO é um evento próprio. Aprovar o reembolso NÃO paga, NÃO gera liquidação, NÃO mexe em conta nem em saldo: só reconhece que a igreja aceita
--      a despesa e assume a dívida com o terceiro. Alçada por valor (Tesouraria até o teto 1; acima, o Administrador) e nunca o próprio favorecido.
--   5. `fin_quitacao_parametros_alterar`: só o Administrador, com motivo, e fica no histórico.
--   6. DUAS GUARDAS na fin_lancamentos: (a) uma obrigação com quitação por terceiro NÃO pode ser marcada paga pela via comum (evita pagar o fornecedor de novo); só o caminho do reembolso
--      (variável qibrj.reembolso, da entrega 1C) a libera; e a marcação "Não localizado" some sozinha, com rastro, quando a igreja paga; (b) não se exclui despesa que tem quitação.
-- GATES desta entrega (caem sozinhos quando a entrega seguinte for aplicada): a OFERTA só é aceita depois de existir o status `quitado_terceiro` (entrega 1B); a COMPENSAÇÃO DE
-- ADIANTAMENTO exige o vínculo com o adiantamento (fase futura) e hoje é recusada.
-- Padrões conservadores aprovados (13/10/2026): bem durável sem limite de capitalização = Alto · Empresa sem histórico de pagamentos = Médio · reembolso exige Formal ·
-- compensação exige Formal · responsável não identificado nunca é suficiente.
-- Reversível: docs/QUITACAO_ROLLBACK.sql.

-- ── 1) as funções puras ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- o grau nasce dos anexos: terceiro sem anexo = Relatado; prova do pagamento do terceiro = responsável Formal; declaração (ou pedido de reembolso) = intenção Formal
CREATE OR REPLACE FUNCTION public.fin_quitacao_graus(p_responsavel text, p_intencao text, p_anexos text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE gr text; gi text;
BEGIN
  IF p_responsavel NOT IN ('pessoa', 'empresa', 'entidade') THEN RETURN jsonb_build_object('responsavel', 'nenhum', 'intencao', 'nenhum'); END IF;
  gr := CASE WHEN 'prova_pagamento_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END;
  IF p_intencao IN ('nao_declarada', 'nao_se_aplica') THEN gi := 'nenhum';
  ELSIF p_intencao = 'reembolso' THEN gi := CASE WHEN 'pedido_reembolso' = ANY(COALESCE(p_anexos, '{}')) OR 'declaracao_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END;
  ELSE gi := CASE WHEN 'declaracao_terceiro' = ANY(COALESCE(p_anexos, '{}')) THEN 'formal' ELSE 'relatado' END; END IF;
  RETURN jsonb_build_object('responsavel', gr, 'intencao', gi);
END
$fn$;

-- a Matriz de suficiência da prova. Entrada e saída em jsonb (chaves em snake_case, as mesmas de lib/quitacao.ts em camelCase)
CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE
  resp text := p->>'responsavel'; inten text := p->>'intencao';
  gr int; gi int; gc int; nat int; pat int; las int; rel int; base int; passos int; nv int;
  valor numeric := COALESCE((p->>'valor')::numeric, 0); limite numeric := (p->>'limite_capitalizacao')::numeric; natit text := p->>'natureza_item';
  dias int := (p->>'dias_entre_pagamento_e_declaracao')::int;
  mods text[] := '{}'; vencida boolean; nm int;
  suf boolean := false; exige boolean := false; motivo text := NULL; gc_txt text;
  rotulos text[] := ARRAY['baixo', 'medio', 'alto']; graus text[] := ARRAY['nenhum', 'relatado', 'formal'];
BEGIN
  gr := CASE p->>'grau_responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END;
  gi := CASE p->>'grau_intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END;
  gc := LEAST(gr, gi);
  -- eixo 1 — natureza da operação
  nat := CASE WHEN inten IN ('reembolso', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica') THEN 2 WHEN COALESCE((p->>'oferta_com_condicao')::boolean, false) THEN 1 ELSE 0 END;
  -- eixo 2 — patrimônio (sem natureza ou sem limite de capitalização definido: o lado seguro)
  pat := CASE WHEN natit IS NULL THEN 2 WHEN natit <> 'duravel' THEN 0 WHEN limite IS NULL OR valor >= limite THEN 2 ELSE 1 END;
  -- eixo 3 — lastro de nota fiscal
  las := CASE WHEN NOT COALESCE((p->>'tem_nota_anexada')::boolean, false) THEN 2
              WHEN COALESCE((p->>'comprador_cnpj_igreja')::boolean, false) AND COALESCE((p->>'chave_valida')::boolean, false) AND COALESCE((p->>'chave_confere_com_emitente')::boolean, false) THEN 0
              ELSE 1 END;
  -- eixo 4 — risco da relação
  rel := CASE resp
    WHEN 'pessoa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'terceiro_no_circuito')::boolean, false) THEN 2
                            WHEN COALESCE((p->>'terceiro_ministro')::boolean, false) OR COALESCE((p->>'intencao_alterada_recentemente')::boolean, false) THEN 1 ELSE 0 END
    WHEN 'empresa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'empresa_com_pagamentos_12m')::boolean, false) THEN 2 ELSE 1 END
    WHEN 'entidade' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) THEN 2 ELSE 1 END
    ELSE 0 END;

  -- moduladores
  IF dias IS NOT NULL AND dias > COALESCE((p->>'prazo_declaracao_dias')::int, 30) THEN mods := array_append(mods, 'M1'); END IF;
  IF valor > COALESCE((p->>'teto_1')::numeric, 500) THEN mods := array_append(mods, 'M2'); END IF;
  IF COALESCE((p->>'acumulado_ano_do_terceiro')::numeric, 0) > COALESCE((p->>'teto_anual_terceiro')::numeric, 2000)
     OR COALESCE((p->>'qtd_relatadas_no_trimestre')::int, 0) >= COALESCE((p->>'qtd_relatadas_trimestre')::int, 3) THEN mods := array_append(mods, 'M3'); END IF;
  IF COALESCE((p->>'periodo_aprovado')::boolean, false) THEN mods := array_append(mods, 'M4'); END IF;
  vencida := gc = 1 AND COALESCE((p->>'formalizacao_vencida')::boolean, false);
  nm := COALESCE(cardinality(mods), 0);
  IF vencida THEN mods := array_append(mods, 'vencida'); END IF;

  base := GREATEST(nat, pat, las, rel);
  passos := LEAST(2, nm) + CASE WHEN vencida THEN 1 ELSE 0 END;
  nv := LEAST(2, base + passos);

  -- suficiência
  IF inten IN ('nao_declarada', 'nao_se_aplica') THEN motivo := 'A intenção do terceiro não foi declarada.';
  ELSIF gr = 0 THEN motivo := 'Falta identificar quem pagou.';
  ELSIF gi = 0 THEN motivo := 'Falta a declaração da intenção.';
  ELSIF gc = 2 THEN suf := true;
  ELSIF inten = 'reembolso' THEN motivo := 'Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.';
  ELSIF inten = 'compensacao_adiantamento' THEN motivo := 'A compensação de adiantamento exige a prova Formal.';
  ELSIF nv = 0 THEN suf := true;
  ELSIF nv = 1 THEN
    IF COALESCE((p->>'aprovado_pelo_administrador')::boolean, false) THEN suf := true;
    ELSE exige := true; motivo := 'O Relatado, neste nível de risco, precisa da aprovação do Administrador.'; END IF;
  ELSE motivo := 'Neste nível de risco o Relatado não basta: anexe a declaração assinada e a prova do pagamento do terceiro.'; END IF;

  RETURN jsonb_build_object(
    'eixo_natureza', rotulos[nat + 1], 'eixo_patrimonio', rotulos[pat + 1], 'eixo_lastro', rotulos[las + 1], 'eixo_relacao', rotulos[rel + 1],
    'moduladores', to_jsonb(mods), 'nivel', rotulos[nv + 1], 'grau_conjunto', graus[gc + 1], 'suficiente', suf,
    'exige_aprovacao_administrador', exige, 'motivo', to_jsonb(motivo));
END
$fn$;

-- resultado, credor atual e fila — tudo derivado dos fatos
CREATE OR REPLACE FUNCTION public.fin_quitacao_resultado(p jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$
DECLARE resp text := p->>'responsavel'; inten text := p->>'intencao'; suf boolean := COALESCE((p->>'suficiente')::boolean, false);
        aprov text := p->>'aprovacao'; paga boolean := COALESCE((p->>'paga')::boolean, false);
BEGIN
  IF resp = 'igreja' THEN RETURN jsonb_build_object('resultado', 'pago_pela_igreja', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
  IF resp = 'ninguem_ainda' THEN RETURN jsonb_build_object('resultado', 'em_aberto', 'credor_atual', 'emitente', 'fila', NULL); END IF;
  IF resp = 'nao_localizado' THEN RETURN jsonb_build_object('resultado', 'sem_quitacao_localizada', 'credor_atual', 'emitente', 'fila', 'investigar'); END IF;
  IF inten IN ('nao_declarada', 'nao_se_aplica') THEN RETURN jsonb_build_object('resultado', 'a_esclarecer', 'credor_atual', 'em_analise', 'fila', 'a_esclarecer'); END IF;
  IF NOT suf THEN RETURN jsonb_build_object('resultado', 'a_formalizar', 'credor_atual', 'em_analise', 'fila', 'formalizar'); END IF;
  IF inten = 'reembolso' THEN
    IF aprov = 'recusada' THEN RETURN jsonb_build_object('resultado', 'a_esclarecer', 'credor_atual', 'em_analise', 'fila', 'a_esclarecer'); END IF;
    IF aprov IS DISTINCT FROM 'aprovada' THEN RETURN jsonb_build_object('resultado', 'reembolso_em_analise', 'credor_atual', 'em_analise', 'fila', 'aprovar_reembolso'); END IF;
    IF paga THEN RETURN jsonb_build_object('resultado', 'reembolsada', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
    RETURN jsonb_build_object('resultado', 'divida_com_terceiro', 'credor_atual', 'terceiro', 'fila', 'reembolso_a_pagar');
  END IF;
  IF inten = 'oferta' THEN RETURN jsonb_build_object('resultado', 'extinta_como_oferta', 'credor_atual', 'nenhum', 'fila', NULL); END IF;
  RETURN jsonb_build_object('resultado', 'compensada', 'credor_atual', 'nenhum', 'fila', NULL);
END
$fn$;

-- ── 2) o que a Matriz precisa saber de uma quitação ──────────────────────────────────────────────────────────────────────────────────────────
-- as decisões de aprovação vigentes: a mais recente de cada tipo, e só vale se a quitação NÃO mudou depois dela
CREATE OR REPLACE FUNCTION public.fin_quitacao_aprovacoes(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ultima_mudanca timestamptz; r text; a text;
BEGIN
  SELECT max(e.em) INTO ultima_mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('registrada', 'alterada');
  SELECT e.decisao INTO r FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_reembolso' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  SELECT e.decisao INTO a FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_relatado' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  RETURN jsonb_build_object('reembolso', to_jsonb(r), 'relatado', to_jsonb(a));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_grau_conjunto(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; tipos text[]; g jsonb;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  RETURN CASE LEAST(CASE g->>'responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END, CASE g->>'intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END)
              WHEN 2 THEN 'formal' WHEN 1 THEN 'relatado' ELSE 'nenhum' END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; f public.fin_fornecedores%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE;
  tipos text[]; g jsonb; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  acumulado numeric := 0; relatadas int := 0; conj text; ap jsonb; no_circuito boolean := false; ministro boolean := false; com_pagamentos boolean := false;
  alterada boolean := false; periodo boolean := false; chave text; confere boolean := false; vencida boolean := false; r record;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO f FROM public.fin_fornecedores WHERE id = l.fornecedor_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  conj := public.fin_quitacao_grau_conjunto(q.id);
  ap := public.fin_quitacao_aprovacoes(q.id);

  chave := l.nf_chave_acesso;
  IF chave IS NOT NULL AND f.id IS NOT NULL AND f.cnpj_cpf IS NOT NULL THEN
    confere := substr(chave, 7, 14) = regexp_replace(f.cnpj_cpf, '\D', '', 'g');
  END IF;

  IF q.responsavel_tipo = 'pessoa' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id = pr.id
                    WHERE pr.pessoa_id = q.responsavel_pessoa_id AND ur.role::text IN ('admin', 'diakonia', 'secretaria', 'tesouraria')) INTO no_circuito;
    SELECT EXISTS (SELECT 1 FROM public.membros m, unnest(m.funcoes_ministeriais) fn WHERE m.id = q.responsavel_pessoa_id AND fn::text <> 'membro') INTO ministro;
  END IF;
  IF q.responsavel_tipo = 'empresa' THEN
    SELECT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = q.responsavel_fornecedor_id AND x.tipo::text = 'saida' AND x.status::text IN ('realizado', 'conciliado')
                      AND COALESCE(x.data_pagamento, x.data) >= hoje - 365) INTO com_pagamentos;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento = 'alterada' AND (e.de->>'intencao') IS DISTINCT FROM (e.para->>'intencao')
                    AND e.em >= now() - interval '30 days') INTO alterada;
  SELECT EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo fp WHERE fp.status = 'aprovado'
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) >= fp.ano_inicio * 12 + fp.mes_inicio
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) <  fp.ano_inicio * 12 + fp.mes_inicio + fp.qtd_meses) INTO periodo;

  IF q.pago_em IS NOT NULL THEN
    SELECT COALESCE(sum(COALESCE(lo.valor_original, lo.valor)), 0) INTO acumulado
      FROM public.fin_quitacoes q2 JOIN public.fin_lancamentos lo ON lo.id = q2.obrigacao_id
     WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
       AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
       AND EXTRACT(year FROM q2.pago_em) = EXTRACT(year FROM q.pago_em);
    FOR r IN SELECT q2.id FROM public.fin_quitacoes q2
              WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
                AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
                AND date_trunc('quarter', q2.pago_em::timestamp) = date_trunc('quarter', q.pago_em::timestamp) LOOP
      IF public.fin_quitacao_grau_conjunto(r.id) = 'relatado' THEN relatadas := relatadas + 1; END IF;
    END LOOP;
  END IF;

  vencida := conj = 'relatado' AND ((q.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date + par.prazo_formalizacao_dias) < hoje;

  RETURN jsonb_build_object(
    'responsavel', q.responsavel_tipo, 'intencao', q.intencao, 'grau_responsavel', g->>'responsavel', 'grau_intencao', g->>'intencao',
    'natureza_item', to_jsonb(l.natureza_item), 'valor', COALESCE(l.valor_original, l.valor),
    'tem_nota_anexada', ('nota_fiscal' = ANY(tipos) OR 'xml' = ANY(tipos)), 'comprador_cnpj_igreja', (l.comprador = 'cnpj_igreja'),
    'chave_valida', (chave IS NOT NULL AND public.fin_nfe_chave_valida(chave)), 'chave_confere_com_emitente', confere,
    'terceiro_no_circuito', no_circuito, 'terceiro_ministro', ministro, 'empresa_com_pagamentos_12m', com_pagamentos,
    'intencao_alterada_recentemente', alterada, 'pede_recibo_fiscal', q.pede_recibo, 'oferta_com_condicao', (q.condicao IS NOT NULL),
    'dias_entre_pagamento_e_declaracao', CASE WHEN q.declarado_em IS NOT NULL AND q.pago_em IS NOT NULL THEN to_jsonb(q.declarado_em - q.pago_em) ELSE 'null'::jsonb END,
    'acumulado_ano_do_terceiro', acumulado, 'qtd_relatadas_no_trimestre', relatadas, 'periodo_aprovado', periodo, 'formalizacao_vencida', vencida,
    'aprovado_pelo_administrador', (ap->>'relatado' = 'aprovada'),
    'teto_1', par.teto_1, 'prazo_declaracao_dias', par.prazo_declaracao_dias, 'teto_anual_terceiro', par.teto_anual_terceiro,
    'qtd_relatadas_trimestre', par.qtd_relatadas_trimestre, 'limite_capitalizacao', to_jsonb(par.limite_capitalizacao));
END
$fn$;

-- ── 3) validação comum ao registro e à alteração ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_validar_campos(p_lancamento uuid, p_tipo text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago date, p_declarado date) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; f public.fin_fornecedores%ROWTYPE; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento;
  IF p_tipo NOT IN ('pessoa', 'empresa', 'entidade', 'nao_localizado') THEN RAISE EXCEPTION 'Responsável inválido: %. Use pessoa, empresa, entidade ou nao_localizado (Igreja e Ninguém ainda o sistema deduz).', p_tipo; END IF;
  IF p_intencao NOT IN ('reembolso', 'oferta', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica') THEN RAISE EXCEPTION 'Intenção inválida: %.', p_intencao; END IF;
  IF p_tipo = 'nao_localizado' THEN
    IF p_intencao <> 'nao_se_aplica' THEN RAISE EXCEPTION 'Quando não se sabe quem pagou, a intenção não se aplica.'; END IF;
    IF p_pessoa IS NOT NULL OR p_fornecedor IS NOT NULL OR p_pago IS NOT NULL OR p_declarado IS NOT NULL THEN RAISE EXCEPTION 'Não localizado não leva pessoa, empresa, entidade nem datas.'; END IF;
    RETURN;
  END IF;
  IF p_intencao = 'nao_se_aplica' THEN RAISE EXCEPTION 'Escolha a intenção do terceiro, ou marque Não declarada.'; END IF;
  IF p_tipo = 'pessoa' THEN
    IF p_pessoa IS NULL OR p_fornecedor IS NOT NULL THEN RAISE EXCEPTION 'Escolha a pessoa que pagou (e só ela).'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.membros WHERE id = p_pessoa) THEN RAISE EXCEPTION 'Pessoa não encontrada no cadastro.'; END IF;
  ELSE
    IF p_fornecedor IS NULL OR p_pessoa IS NOT NULL THEN RAISE EXCEPTION 'Escolha % que pagou (e só ela).', CASE WHEN p_tipo = 'empresa' THEN 'a empresa' ELSE 'a entidade' END; END IF;
    SELECT * INTO f FROM public.fin_fornecedores WHERE id = p_fornecedor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cadastro não encontrado.'; END IF;
    IF NOT public.fin_cnpj_valido(f.cnpj_cpf) THEN RAISE EXCEPTION 'Empresa e Entidade só podem ser responsáveis com CNPJ válido no cadastro (% está sem CNPJ válido).', f.nome; END IF;
    IF p_fornecedor IS NOT DISTINCT FROM l.fornecedor_id THEN RAISE EXCEPTION 'O próprio emitente da nota não pode ser o terceiro que a quitou.'; END IF;
  END IF;
  IF p_pago IS NULL THEN RAISE EXCEPTION 'Informe a data em que o terceiro pagou.'; END IF;
  IF p_pago > hoje THEN RAISE EXCEPTION 'A data do pagamento do terceiro não pode ser futura.'; END IF;
  IF p_intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento') THEN
    IF p_declarado IS NULL THEN RAISE EXCEPTION 'Informe a data da declaração do terceiro.'; END IF;
    IF p_declarado > hoje THEN RAISE EXCEPTION 'A data da declaração não pode ser futura.'; END IF;
  ELSIF p_declarado IS NOT NULL THEN RAISE EXCEPTION 'Intenção não declarada não tem data de declaração.'; END IF;
  -- os gates desta entrega
  IF p_intencao = 'compensacao_adiantamento' THEN RAISE EXCEPTION 'A compensação de adiantamento será liberada numa fase futura: ela exige o vínculo com o adiantamento anterior.'; END IF;
  IF p_intencao = 'oferta' AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'fin_lancamento_status' AND e.enumlabel = 'quitado_terceiro') THEN
    RAISE EXCEPTION 'A oferta será liberada na entrega 1B (precisa do status "quitado por terceiro"). Por enquanto registre Não declarada ou Reembolso.';
  END IF;
END
$fn$;

-- ── 4) registrar ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(
  p_lancamento uuid, p_responsavel text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date,
  p_natureza_item text DEFAULT NULL, p_comprador text DEFAULT NULL, p_condicao text DEFAULT NULL, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; novo uuid; v_nat text; v_comp text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar a quitação de uma despesa.';
  END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'Só uma despesa (saída) tem quitação.'; END IF;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'Esta despesa não está em aberto (situação: %). A quitação por terceiro só se registra em despesa ainda a pagar.', l.status; END IF;
  IF COALESCE(l.obrigacao_id, l.id) <> l.id THEN RAISE EXCEPTION 'Registre a quitação na obrigação principal, não numa das suas parcelas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id AND x.id <> l.id AND x.status::text IN ('realizado', 'conciliado')) THEN
    RAISE EXCEPTION 'Esta obrigação já teve pagamento parcial; nesta entrega a quitação por terceiro só vale para obrigação ainda sem baixa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = l.id) THEN RAISE EXCEPTION 'Esta obrigação já tem uma quitação registrada: altere ou remova a existente.'; END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em);

  IF p_responsavel <> 'nao_localizado' THEN
    v_nat := COALESCE(p_natureza_item, l.natureza_item); v_comp := COALESCE(p_comprador, l.comprador);
    IF v_nat IS NULL THEN RAISE EXCEPTION 'Informe a natureza do item (consumo, estoque, bem durável ou serviço).'; END IF;
    IF v_nat NOT IN ('consumo', 'estoque', 'duravel', 'servico') THEN RAISE EXCEPTION 'Natureza do item inválida: %.', v_nat; END IF;
    IF v_comp IS NULL THEN RAISE EXCEPTION 'Informe se a igreja é a compradora por documento fiscal no CNPJ dela ou por contratação prévia.'; END IF;
    IF v_comp NOT IN ('cnpj_igreja', 'contratacao_previa') THEN RAISE EXCEPTION 'Comprador inválido: %.', v_comp; END IF;
    IF v_nat IS DISTINCT FROM l.natureza_item OR v_comp IS DISTINCT FROM l.comprador THEN
      UPDATE public.fin_lancamentos SET natureza_item = v_nat, comprador = v_comp WHERE id = l.id;
    END IF;
  END IF;

  PERFORM set_config('qibrj.motivo', COALESCE(p_motivo, ''), true);
  INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, pago_em, declarado_em, condicao, pede_recibo)
  VALUES (l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em, NULLIF(btrim(COALESCE(p_condicao, '')), ''), COALESCE(p_pede_recibo, false))
  RETURNING id INTO novo;
  PERFORM set_config('qibrj.motivo', '', true);
  RETURN novo;
END
$fn$;

-- ── 5) alterar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; k text; permitidas text[] := ARRAY['responsavel_tipo', 'responsavel_pessoa_id', 'responsavel_fornecedor_id', 'intencao', 'pago_em', 'declarado_em', 'condicao', 'pede_recibo'];
        n_tipo text; n_pessoa uuid; n_forn uuid; n_int text; n_pago date; n_decl date; n_cond text; n_recibo boolean;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para alterar a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da alteração (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os campos a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Campo não alterável: %.', k; END IF;
  END LOOP;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se altera mais.', l.status; END IF;

  n_tipo  := COALESCE(p_patch->>'responsavel_tipo', q.responsavel_tipo);
  n_pessoa := CASE WHEN p_patch ? 'responsavel_pessoa_id' THEN NULLIF(p_patch->>'responsavel_pessoa_id', '')::uuid ELSE q.responsavel_pessoa_id END;
  n_forn  := CASE WHEN p_patch ? 'responsavel_fornecedor_id' THEN NULLIF(p_patch->>'responsavel_fornecedor_id', '')::uuid ELSE q.responsavel_fornecedor_id END;
  n_int   := COALESCE(p_patch->>'intencao', q.intencao);
  n_pago  := CASE WHEN p_patch ? 'pago_em' THEN NULLIF(p_patch->>'pago_em', '')::date ELSE q.pago_em END;
  n_decl  := CASE WHEN p_patch ? 'declarado_em' THEN NULLIF(p_patch->>'declarado_em', '')::date ELSE q.declarado_em END;
  n_cond  := CASE WHEN p_patch ? 'condicao' THEN NULLIF(btrim(COALESCE(p_patch->>'condicao', '')), '') ELSE q.condicao END;
  n_recibo := CASE WHEN p_patch ? 'pede_recibo' THEN COALESCE((p_patch->>'pede_recibo')::boolean, false) ELSE q.pede_recibo END;
  -- mudar o tipo de responsável limpa o cadastro do tipo anterior, a menos que o novo venha no mesmo pedido
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
END
$fn$;

-- ── 6) remover ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_remover_quitacao(p_quitacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para remover a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da remoção (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se remove mais. Para mudar algo, reabra a despesa.', l.status; END IF;
  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  DELETE FROM public.fin_quitacoes WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
END
$fn$;

-- ── 7) a APROVAÇÃO — evento próprio, que não paga ─────────────────────────────────────────────────────────────────────────────────────────
-- Fluxo: Documento → Análise → Aprovação → Obrigação com a pessoa → Pagamento → Liquidação. Aprovar NÃO movimenta caixa, NÃO movimenta banco, NÃO gera liquidação, NÃO gera conciliação:
-- só reconhece que a igreja aceita a despesa e assume a dívida com o terceiro. O pagamento é ato posterior (entrega 1C).
CREATE OR REPLACE FUNCTION public.fin_decidir_quitacao(p_quitacao uuid, p_tipo text, p_decisao text, p_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE; a jsonb; uid uuid := (SELECT auth.uid());
        valor numeric; eh_admin boolean; pessoa_aprovador uuid;
BEGIN
  eh_admin := has_any_role(uid, ARRAY['admin'::app_role]);
  IF NOT (eh_admin OR has_any_role(uid, ARRAY['tesouraria'::app_role])) THEN RAISE EXCEPTION 'Só o Administrador e a Tesouraria decidem sobre a quitação.'; END IF;
  IF p_tipo NOT IN ('reembolso', 'relatado') THEN RAISE EXCEPTION 'Tipo de decisão inválido: % (use reembolso ou relatado).', p_tipo; END IF;
  IF p_decisao NOT IN ('aprovada', 'recusada') THEN RAISE EXCEPTION 'Decisão inválida: % (use aprovada ou recusada).', p_decisao; END IF;
  IF p_decisao = 'recusada' AND (p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5) THEN RAISE EXCEPTION 'Recusar exige o motivo (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não há o que decidir.', l.status; END IF;
  a := public.fin_quitacao_avaliar(public.fin_quitacao_entrada(q.id));
  valor := COALESCE(l.valor_original, l.valor);

  IF p_tipo = 'reembolso' THEN
    IF q.intencao <> 'reembolso' THEN RAISE EXCEPTION 'Esta quitação não é um reembolso.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'suficiente')::boolean THEN
      RAISE EXCEPTION 'Não dá para aprovar: %', COALESCE(a->>'motivo', 'a prova ainda não é suficiente.');
    END IF;
    IF valor > par.teto_1 AND NOT eh_admin THEN RAISE EXCEPTION 'Reembolso acima de R$ % só o Administrador aprova.', par.teto_1; END IF;
    SELECT pr.pessoa_id INTO pessoa_aprovador FROM public.profiles pr WHERE pr.id = uid;
    IF pessoa_aprovador IS NOT NULL AND q.responsavel_pessoa_id IS NOT DISTINCT FROM pessoa_aprovador THEN
      RAISE EXCEPTION 'Ninguém aprova o próprio reembolso: peça a outra pessoa.';
    END IF;
  ELSE
    IF NOT eh_admin THEN RAISE EXCEPTION 'Só o Administrador aprova o grau Relatado.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'exige_aprovacao_administrador')::boolean THEN
      RAISE EXCEPTION 'Esta quitação não precisa da aprovação do Administrador (%).', COALESCE(a->>'motivo', 'a prova já é suficiente ou não pode ser aceita como Relatado');
    END IF;
  END IF;

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, decisao, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, CASE p_tipo WHEN 'reembolso' THEN 'aprovacao_reembolso' ELSE 'aprovacao_relatado' END, p_decisao,
          jsonb_build_object('nivel', a->>'nivel', 'grau_conjunto', a->>'grau_conjunto', 'valor', valor), NULLIF(btrim(COALESCE(p_motivo, '')), ''), uid);
END
$fn$;

-- ── 8) parâmetros (só o Administrador, com motivo) ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE k text; antes jsonb; depois jsonb; permitidas text[] := ARRAY['vigencia', 'teto_1', 'prazo_declaracao_dias', 'teto_anual_terceiro', 'qtd_relatadas_trimestre', 'prazo_formalizacao_dias', 'prazo_esclarecimento_dias', 'prazo_reembolso_dias', 'limite_capitalizacao'];
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'Só o Administrador altera os parâmetros da Política.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da mudança (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os parâmetros a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Parâmetro desconhecido: %.', k; END IF;
  END LOOP;
  SELECT to_jsonb(p) INTO antes FROM public.fin_quitacao_parametros p;
  UPDATE public.fin_quitacao_parametros SET
    vigencia = CASE WHEN p_patch ? 'vigencia' THEN NULLIF(p_patch->>'vigencia', '')::date ELSE vigencia END,
    teto_1 = COALESCE((p_patch->>'teto_1')::numeric, teto_1),
    prazo_declaracao_dias = COALESCE((p_patch->>'prazo_declaracao_dias')::int, prazo_declaracao_dias),
    teto_anual_terceiro = COALESCE((p_patch->>'teto_anual_terceiro')::numeric, teto_anual_terceiro),
    qtd_relatadas_trimestre = COALESCE((p_patch->>'qtd_relatadas_trimestre')::int, qtd_relatadas_trimestre),
    prazo_formalizacao_dias = COALESCE((p_patch->>'prazo_formalizacao_dias')::int, prazo_formalizacao_dias),
    prazo_esclarecimento_dias = COALESCE((p_patch->>'prazo_esclarecimento_dias')::int, prazo_esclarecimento_dias),
    prazo_reembolso_dias = COALESCE((p_patch->>'prazo_reembolso_dias')::int, prazo_reembolso_dias),
    limite_capitalizacao = CASE WHEN p_patch ? 'limite_capitalizacao' THEN NULLIF(p_patch->>'limite_capitalizacao', '')::numeric ELSE limite_capitalizacao END,
    atualizado_em = now(), atualizado_por = (SELECT auth.uid())
  WHERE id;
  SELECT to_jsonb(p) INTO depois FROM public.fin_quitacao_parametros p;
  INSERT INTO public.fin_quitacao_eventos (evento, de, para, motivo, por) VALUES ('parametros', antes, depois, btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;

-- ── 9) as guardas na fin_lancamentos ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- (a) uma obrigação cujo fornecedor já foi pago por um terceiro NÃO pode ser marcada paga pela via comum — senão o fornecedor seria pago de novo. Só o caminho do reembolso
--     (entrega 1C, que liga qibrj.reembolso) a libera. Se a marcação era "Não localizado" e a igreja pagou, a marcação perde o sentido: some, com o motivo no histórico.
CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE raiz uuid;
BEGIN
  IF NEW.status::text NOT IN ('realizado', 'conciliado') THEN RETURN NEW; END IF;
  raiz := COALESCE(NEW.obrigacao_id, NEW.id);
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text IN ('realizado', 'conciliado') THEN RETURN NEW; END IF;   -- já era paga: só mudou entre realizado e conciliado
  ELSIF raiz = NEW.id THEN
    RETURN NEW;                                                                    -- despesa nova, obrigação própria: não há quitação possível
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.responsavel_tipo IN ('pessoa', 'empresa', 'entidade'))
     AND COALESCE(current_setting('qibrj.reembolso', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Esta conta já foi paga ao fornecedor por um terceiro (quitação registrada). Não a pague de novo ao fornecedor: pague o reembolso à pessoa, ou remova a quitação (com motivo) se ela foi registrada por engano.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.responsavel_tipo = 'nao_localizado') THEN
    PERFORM set_config('qibrj.motivo', 'Pago pela igreja: a marcação "Não localizado" perdeu o sentido.', true);
    DELETE FROM public.fin_quitacoes WHERE obrigacao_id = raiz AND responsavel_tipo = 'nao_localizado';
    PERFORM set_config('qibrj.motivo', '', true);
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_quitacao_pagamento ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitacao_pagamento BEFORE INSERT OR UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text IN ('realizado', 'conciliado')) EXECUTE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento();

-- (b) não se exclui a despesa que tem quitação (a chave estrangeira já impede; aqui a mensagem é clara)
CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_protege_apagar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = OLD.id) THEN
    RAISE EXCEPTION 'Esta despesa tem uma quitação por terceiro registrada. Remova a quitação (com motivo) antes de excluí-la.';
  END IF;
  RETURN OLD;
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_quitacao_apagar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitacao_apagar BEFORE DELETE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_quitacao_protege_apagar();

-- ── 10) permissões ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) TO authenticated;


-- ─── Fase 1A (3/3): as VISÕES da Quitação — o que se deriva dos fatos (grau, nível, suficiência, resultado, credor, fila) e a vw_fin_ciclo ampliada ────────────
-- Depende de 20261014100000 e 20261014110000. Nenhum dado é alterado.
--
-- `vw_fin_quitacao`: uma linha por quitação registrada, com TUDO o que se deriva dela: o grau de prova de cada fato e do conjunto (nascem dos anexos), o nível de risco da Matriz,
-- a suficiência, a decisão de aprovação vigente, o resultado, o credor atual, a fila e se ela bloqueia o fechamento (só com a vigência ligada e para despesas a partir dela).
--
-- `vw_fin_ciclo` (a visão do estado da despesa, D2/D5/D6) ganha COLUNAS NOVAS SÓ NO FIM (regra do CREATE OR REPLACE VIEW): quitacao_id, responsavel, intencao, grau_conjunto,
-- nivel_risco, fila, resultado, credor_atual, bloqueia_fechamento. As colunas e os estados que já existiam NÃO mudam, com DUAS exceções deliberadas, ambas só para despesa
-- que tem quitação por terceiro (hoje nenhuma: o resultado atual de todas as 4.037 saídas fica idêntico — o ensaio prova):
--   · uma obrigação cujo fornecedor já foi pago por um terceiro é "Em aberto" mesmo antes do vencimento (a dívida com o fornecedor acabou; o que há é a decisão sobre o terceiro);
--   · as provas da quitação (declaracao_terceiro, pedido_reembolso, prova_pagamento_terceiro) NÃO contam como "documento original" da despesa.
-- Igreja e Ninguém ainda não têm linha em fin_quitacoes: a vw_fin_ciclo os DEDUZ (paga ⇒ Igreja; não paga ⇒ Ninguém ainda).
-- Reversível: docs/QUITACAO_ROLLBACK.sql devolve a vw_fin_ciclo do D6.

CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
WITH base AS (
  SELECT q.id AS quitacao_id, q.obrigacao_id, q.responsavel_tipo, q.responsavel_pessoa_id, q.responsavel_fornecedor_id, q.intencao, q.pago_em, q.declarado_em,
         q.condicao, q.pede_recibo, q.registrado_por, q.registrado_em,
         l.data AS data_despesa, l.status::text AS status_despesa, COALESCE(l.valor_original, l.valor) AS valor_obrigacao,
         public.fin_quitacao_entrada(q.id) AS entrada, public.fin_quitacao_aprovacoes(q.id) AS aprovacoes
    FROM public.fin_quitacoes q
    JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
),
avaliadas AS (SELECT b.*, public.fin_quitacao_avaliar(b.entrada) AS a FROM base b),
resolvidas AS (
  SELECT v.*, public.fin_quitacao_resultado(jsonb_build_object(
           'responsavel', v.responsavel_tipo, 'intencao', v.intencao, 'suficiente', (v.a->>'suficiente')::boolean,
           'aprovacao', v.aprovacoes->>'reembolso', 'paga', v.status_despesa IN ('realizado', 'conciliado'))) AS r
    FROM avaliadas v
)
SELECT v.quitacao_id, v.obrigacao_id, v.responsavel_tipo, v.responsavel_pessoa_id, v.responsavel_fornecedor_id, v.intencao, v.pago_em, v.declarado_em,
       v.condicao, v.pede_recibo, v.registrado_por, v.registrado_em, v.data_despesa, v.valor_obrigacao,
       v.entrada->>'grau_responsavel' AS grau_responsavel, v.entrada->>'grau_intencao' AS grau_intencao, v.a->>'grau_conjunto' AS grau_conjunto,
       v.a->>'nivel' AS nivel_risco, (v.a->>'suficiente')::boolean AS suficiente, (v.a->>'exige_aprovacao_administrador')::boolean AS exige_aprovacao_administrador,
       v.a->>'motivo' AS motivo_insuficiencia, v.a->'moduladores' AS moduladores,
       v.aprovacoes->>'reembolso' AS aprovacao_reembolso, v.aprovacoes->>'relatado' AS aprovacao_relatado,
       v.r->>'resultado' AS resultado, v.r->>'credor_atual' AS credor_atual, v.r->>'fila' AS fila,
       (p.vigencia IS NOT NULL AND (v.r->>'fila') IN ('a_esclarecer', 'formalizar') AND v.data_despesa >= p.vigencia) AS bloqueia_fechamento
  FROM resolvidas v
 CROSS JOIN public.fin_quitacao_parametros p;
GRANT SELECT ON public.vw_fin_quitacao TO authenticated;
COMMENT ON VIEW public.vw_fin_quitacao IS 'A quitação registrada e tudo o que dela se DERIVA: graus de prova (dos anexos), nível de risco, suficiência, aprovação vigente, resultado, credor atual, fila e bloqueio de fechamento. Nada aqui é digitado.';

-- ── vw_fin_ciclo (D6) + as colunas da quitação no fim ───────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC
),
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo NOT IN ('comprovante', 'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro')
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
vinculos AS (
  SELECT DISTINCT ON (lancamento_id) lancamento_id, origem, fitid
    FROM public.fin_extrato_vinculos
   WHERE desfeito_em IS NULL AND lancamento_id IS NOT NULL
   ORDER BY lancamento_id, vinculado_em
),
envios AS (
  SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, i.envio_id, e.enviado_em, i.ano, i.mes
    FROM public.fin_malote_itens i
    JOIN public.fin_malote_envios e ON e.id = i.envio_id
   WHERE i.reaberto_em IS NULL AND i.lancamento_id IS NOT NULL
   ORDER BY i.lancamento_id, e.enviado_em DESC
),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (vc.lancamento_id IS NOT NULL) AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje,
         l.conferido_em, l.conferido_por, vc.origem AS vinculo_origem, vc.fitid AS vinculo_fitid,
         en.envio_id, en.enviado_em, en.ano AS envio_ano, en.mes AS envio_mes,
         COALESCE((SELECT true FROM public.fin_fechamentos_periodo f
                    WHERE f.status = 'aprovado' AND en.ano IS NOT NULL
                      AND (en.ano * 12 + en.mes) >= (f.ano_inicio * 12 + f.mes_inicio)
                      AND (en.ano * 12 + en.mes) <  (f.ano_inicio * 12 + f.mes_inicio + f.qtd_meses) LIMIT 1), false) AS periodo_aprovado,
         qv.quitacao_id, qv.responsavel_tipo AS q_responsavel, qv.intencao AS q_intencao, qv.grau_conjunto AS q_grau, qv.nivel_risco AS q_nivel,
         qv.fila AS q_fila, qv.resultado AS q_resultado, qv.credor_atual AS q_credor, qv.bloqueia_fechamento AS q_bloqueia,
         (qv.quitacao_id IS NOT NULL AND qv.responsavel_tipo <> 'nao_localizado') AS terceiro_quitou
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    LEFT JOIN envios en ON en.lancamento_id = l.id
    LEFT JOIN public.vw_fin_quitacao qv ON qv.obrigacao_id = COALESCE(l.obrigacao_id, l.id)
    CROSS JOIN hoje h
   WHERE l.tipo = 'saida' AND l.origem <> 'transferencia'
),
fatos AS (
  SELECT b.*,
         (b.status IN ('realizado', 'conciliado')) AS paga,
         CASE WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         -- ENVIADA e ARQUIVADA: nada regride sozinho depois do envio (os fatos podem mudar; o estado só sai daqui por reabertura explícita)
         WHEN d.envio_id IS NOT NULL AND d.paga THEN CASE WHEN d.periodo_aprovado THEN 'arquivada' ELSE 'enviada' END
         -- um terceiro já pagou o fornecedor: não há mais "a vencer" — a obrigação está em análise/dívida com o terceiro, e isso pede ação
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje OR d.terceiro_quitou THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid,
       d.envio_id, d.enviado_em, d.envio_ano, d.envio_mes,
       -- a Quitação (colunas novas, só no fim). Igreja e Ninguém ainda não têm linha: deduzem-se do pagamento.
       d.quitacao_id,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_responsavel IS NOT NULL THEN d.q_responsavel WHEN d.paga THEN 'igreja' ELSE 'ninguem_ainda' END AS responsavel,
       COALESCE(d.q_intencao, 'nao_se_aplica') AS intencao,
       d.q_grau AS grau_conjunto,
       d.q_nivel AS nivel_risco,
       d.q_fila AS fila,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_resultado IS NOT NULL THEN d.q_resultado WHEN d.paga THEN 'pago_pela_igreja' ELSE 'em_aberto' END AS resultado,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_credor IS NOT NULL THEN d.q_credor WHEN d.paga THEN 'nenhum' ELSE 'emitente' END AS credor_atual,
       COALESCE(d.q_bloqueia, false) AS bloqueia_fechamento
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;

