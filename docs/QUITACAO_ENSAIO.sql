-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1A da Quitação (migrations 20261014100000, 20261014110000 e 20261014120000) contra os dados REAIS ──────────────────────────────────────────
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda as três migrations e confere que (1) nenhum lançamento mudou e vw_fin_ciclo devolve
-- o MESMO resultado de antes para as despesas que já existem; (2) a quitação se registra, vira Formalizar, Aprovar reembolso e Reembolso a pagar conforme os anexos e a
-- aprovação; (3) a APROVAÇÃO não paga nada (saldo de todas as contas idêntico); (4) pagar o fornecedor de uma obrigação já quitada por terceiro é RECUSADO; (5) Empresa sem
-- CNPJ, aprovar o próprio reembolso, alterar sem motivo, a oferta (entrega 1B) e a compensação (fase futura) são RECUSADOS; (6) a API não escreve nas tabelas novas e o histórico
-- só acrescenta; (7) NENHUMA entrada, transferência ou saída fictícia nasce. O teste usa um administrador real e dados sintéticos, tudo desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_entradas_antes bigint; n_vinc_antes bigint; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; h_saldos_depois text; n_entradas_depois bigint; n_vinc_depois bigint;
  conta uuid; emit uuid; emp uuid; forn_ruim uuid; pessoa_a uuid; pessoa_adm uuid;
  l1 uuid; l2 uuid; l3 uuid; l4 uuid; l5 uuid; lctl uuid; q5 uuid; q1 uuid; q2 uuid; q3 uuid;
  v record; n bigint; st text; saldo_conta_antes numeric; saldo_conta_depois numeric; ev_registrada bigint; ev_alterada bigint; ev_aprov bigint; ev_removida bigint;
  parametros_ok boolean; t0 timestamptz; dur_antes numeric; dur_depois numeric;
BEGIN
  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  t0 := clock_timestamp();
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  dur_antes := EXTRACT(epoch FROM clock_timestamp() - t0);
  SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
  SELECT count(*) INTO n_vinc_antes FROM public.fin_extrato_vinculos;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  rel := format('ANTES: %s lançamentos; %s saídas na vw_fin_ciclo; %s entradas; %s vínculos bancários.', n_lanc_antes, n_ciclo_antes, n_entradas_antes, n_vinc_antes);

  -- ── as três migrations inteiras ──
  -- comando 1 de 76 das migrations
  EXECUTE $m1$CREATE OR REPLACE FUNCTION public.fin_cnpj_valido(p text) RETURNS boolean
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
$fn$;$m1$;
  -- comando 2 de 76 das migrations
  EXECUTE $m2$CREATE OR REPLACE FUNCTION public.fin_nfe_chave_valida(p text) RETURNS boolean
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
$fn$;$m2$;
  -- comando 3 de 76 das migrations
  EXECUTE $m3$ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS comprador       text,
  ADD COLUMN IF NOT EXISTS natureza_item   text,
  ADD COLUMN IF NOT EXISTS nf_chave_acesso text;$m3$;
  -- comando 4 de 76 das migrations
  EXECUTE $m4$DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_comprador_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_comprador_check CHECK (comprador IS NULL OR comprador IN ('cnpj_igreja', 'contratacao_previa'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_natureza_item_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_natureza_item_check CHECK (natureza_item IS NULL OR natureza_item IN ('consumo', 'estoque', 'duravel', 'servico'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_nf_chave_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_nf_chave_check CHECK (nf_chave_acesso IS NULL OR public.fin_nfe_chave_valida(nf_chave_acesso));
  END IF;
END $$;$m4$;
  -- comando 5 de 76 das migrations
  EXECUTE $m5$COMMENT ON COLUMN public.fin_lancamentos.comprador IS 'A igreja é a compradora por documento fiscal no CNPJ dela (cnpj_igreja) ou por contratação formal prévia (contratacao_previa). Nulo = ainda não informado.';$m5$;
  -- comando 6 de 76 das migrations
  EXECUTE $m6$COMMENT ON COLUMN public.fin_lancamentos.natureza_item IS 'consumo, estoque, duravel ou servico. Define o destino contábil e entra na Matriz de suficiência da prova; NÃO define o fluxo.';$m6$;
  -- comando 7 de 76 das migrations
  EXECUTE $m7$COMMENT ON COLUMN public.fin_lancamentos.nf_chave_acesso IS 'Chave de acesso da NF-e (44 dígitos, só números, dígito verificador conferido). Os dígitos 7 a 20 são o CNPJ do emitente.';$m7$;
  -- comando 8 de 76 das migrations
  EXECUTE $m8$CREATE TABLE IF NOT EXISTS public.fin_quitacao_parametros (
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
);$m8$;
  -- comando 9 de 76 das migrations
  EXECUTE $m9$INSERT INTO public.fin_quitacao_parametros (id) VALUES (true) ON CONFLICT (id) DO NOTHING;$m9$;
  -- comando 10 de 76 das migrations
  EXECUTE $m10$COMMENT ON TABLE public.fin_quitacao_parametros IS 'Tetos, prazos e vigência da Política de Compras por Terceiros. Uma linha. Vigência nula = desligada. Só o Administrador altera, pela função fin_quitacao_parametros_alterar (cada mudança fica no histórico).';$m10$;
  -- comando 11 de 76 das migrations
  EXECUTE $m11$CREATE TABLE IF NOT EXISTS public.fin_quitacoes (
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
);$m11$;
  -- comando 12 de 76 das migrations
  EXECUTE $m12$CREATE UNIQUE INDEX IF NOT EXISTS fin_quitacoes_obrigacao_unica ON public.fin_quitacoes (obrigacao_id);$m12$;
  -- comando 13 de 76 das migrations
  EXECUTE $m13$CREATE INDEX IF NOT EXISTS fin_quitacoes_pessoa_idx ON public.fin_quitacoes (responsavel_pessoa_id) WHERE responsavel_pessoa_id IS NOT NULL;$m13$;
  -- comando 14 de 76 das migrations
  EXECUTE $m14$CREATE INDEX IF NOT EXISTS fin_quitacoes_fornecedor_idx ON public.fin_quitacoes (responsavel_fornecedor_id) WHERE responsavel_fornecedor_id IS NOT NULL;$m14$;
  -- comando 15 de 76 das migrations
  EXECUTE $m15$COMMENT ON TABLE public.fin_quitacoes IS 'Quem quitou a obrigação com o emitente (Pessoa, Empresa ou Entidade) e a intenção declarada; ou a marcação "Não localizado". Só FATOS: o grau de prova, o nível de risco, a suficiência, a fila, a extinção e o credor atual são derivados (vw_fin_quitacao). Igreja e Ninguém ainda não têm linha: o sistema os deduz do pagamento.';$m15$;
  -- comando 16 de 76 das migrations
  EXECUTE $m16$CREATE TABLE IF NOT EXISTS public.fin_quitacao_eventos (
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
);$m16$;
  -- comando 17 de 76 das migrations
  EXECUTE $m17$CREATE INDEX IF NOT EXISTS fin_quitacao_eventos_quitacao_idx ON public.fin_quitacao_eventos (quitacao_id, em) WHERE quitacao_id IS NOT NULL;$m17$;
  -- comando 18 de 76 das migrations
  EXECUTE $m18$CREATE INDEX IF NOT EXISTS fin_quitacao_eventos_obrigacao_idx ON public.fin_quitacao_eventos (obrigacao_id, em) WHERE obrigacao_id IS NOT NULL;$m18$;
  -- comando 19 de 76 das migrations
  EXECUTE $m19$COMMENT ON TABLE public.fin_quitacao_eventos IS 'Histórico da quitação, SÓ ACRESCENTA: registro, alterações (com o antes e o depois), remoção, as decisões de aprovação (reembolso e Relatado) e as mudanças de parâmetro. Quem, quando e por quê.';$m19$;
  -- comando 20 de 76 das migrations
  EXECUTE $m20$CREATE OR REPLACE FUNCTION public.fin_quitacao_eventos_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$ BEGIN RAISE EXCEPTION 'O histórico da quitação só acrescenta: não se altera nem se apaga.'; END $fn$;$m20$;
  -- comando 21 de 76 das migrations
  EXECUTE $m21$DROP TRIGGER IF EXISTS fin_quitacao_eventos_imutavel ON public.fin_quitacao_eventos;$m21$;
  -- comando 22 de 76 das migrations
  EXECUTE $m22$CREATE TRIGGER fin_quitacao_eventos_imutavel BEFORE UPDATE OR DELETE ON public.fin_quitacao_eventos FOR EACH ROW EXECUTE FUNCTION public.fin_quitacao_eventos_imutavel();$m22$;
  -- comando 23 de 76 das migrations
  EXECUTE $m23$CREATE OR REPLACE FUNCTION public.fin_quitacao_registra_evento() RETURNS trigger
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
$fn$;$m23$;
  -- comando 24 de 76 das migrations
  EXECUTE $m24$DROP TRIGGER IF EXISTS fin_quitacoes_historico ON public.fin_quitacoes;$m24$;
  -- comando 25 de 76 das migrations
  EXECUTE $m25$CREATE TRIGGER fin_quitacoes_historico AFTER INSERT OR UPDATE OR DELETE ON public.fin_quitacoes FOR EACH ROW EXECUTE FUNCTION public.fin_quitacao_registra_evento();$m25$;
  -- comando 26 de 76 das migrations
  EXECUTE $m26$ALTER TABLE public.fin_quitacao_parametros ENABLE ROW LEVEL SECURITY;$m26$;
  -- comando 27 de 76 das migrations
  EXECUTE $m27$ALTER TABLE public.fin_quitacoes ENABLE ROW LEVEL SECURITY;$m27$;
  -- comando 28 de 76 das migrations
  EXECUTE $m28$ALTER TABLE public.fin_quitacao_eventos ENABLE ROW LEVEL SECURITY;$m28$;
  -- comando 29 de 76 das migrations
  EXECUTE $m29$DROP POLICY IF EXISTS fin_quitacao_parametros_leitura ON public.fin_quitacao_parametros;$m29$;
  -- comando 30 de 76 das migrations
  EXECUTE $m30$CREATE POLICY fin_quitacao_parametros_leitura ON public.fin_quitacao_parametros FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m30$;
  -- comando 31 de 76 das migrations
  EXECUTE $m31$DROP POLICY IF EXISTS fin_quitacoes_leitura ON public.fin_quitacoes;$m31$;
  -- comando 32 de 76 das migrations
  EXECUTE $m32$CREATE POLICY fin_quitacoes_leitura ON public.fin_quitacoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m32$;
  -- comando 33 de 76 das migrations
  EXECUTE $m33$DROP POLICY IF EXISTS fin_quitacao_eventos_leitura ON public.fin_quitacao_eventos;$m33$;
  -- comando 34 de 76 das migrations
  EXECUTE $m34$CREATE POLICY fin_quitacao_eventos_leitura ON public.fin_quitacao_eventos FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m34$;
  -- comando 35 de 76 das migrations
  EXECUTE $m35$DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_lancamento_anexos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%' LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_lancamento_anexos ADD CONSTRAINT fin_lancamento_anexos_tipo_check CHECK (tipo IN (
    'nota_fiscal', 'boleto', 'guia', 'comprovante', 'fatura', 'contrato',
    'xml', 'rpa', 'rsp', 'dps', 'outro',
    'documento',                                                                      -- antigo: aceito, não mais oferecido pela tela
    'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro'));         -- Política de Compras por Terceiros
END $$;$m35$;
  -- comando 36 de 76 das migrations
  EXECUTE $m36$CREATE OR REPLACE FUNCTION public.fin_quitacao_graus(p_responsavel text, p_intencao text, p_anexos text[]) RETURNS jsonb
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
$fn$;$m36$;
  -- comando 37 de 76 das migrations
  EXECUTE $m37$CREATE OR REPLACE FUNCTION public.fin_quitacao_avaliar(p jsonb) RETURNS jsonb
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
  nat := CASE WHEN inten IN ('reembolso', 'compensacao_adiantamento', 'nao_declarada', 'nao_se_aplica') THEN 2 WHEN COALESCE((p->>'oferta_com_condicao')::boolean, false) THEN 1 ELSE 0 END;
  pat := CASE WHEN natit IS NULL THEN 2 WHEN natit <> 'duravel' THEN 0 WHEN limite IS NULL OR valor >= limite THEN 2 ELSE 1 END;
  las := CASE WHEN NOT COALESCE((p->>'tem_nota_anexada')::boolean, false) THEN 2
              WHEN COALESCE((p->>'comprador_cnpj_igreja')::boolean, false) AND COALESCE((p->>'chave_valida')::boolean, false) AND COALESCE((p->>'chave_confere_com_emitente')::boolean, false) THEN 0
              ELSE 1 END;
  rel := CASE resp
    WHEN 'pessoa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'terceiro_no_circuito')::boolean, false) THEN 2
                            WHEN COALESCE((p->>'terceiro_ministro')::boolean, false) OR COALESCE((p->>'intencao_alterada_recentemente')::boolean, false) THEN 1 ELSE 0 END
    WHEN 'empresa' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) OR COALESCE((p->>'empresa_com_pagamentos_12m')::boolean, false) THEN 2 ELSE 1 END
    WHEN 'entidade' THEN CASE WHEN COALESCE((p->>'pede_recibo_fiscal')::boolean, false) THEN 2 ELSE 1 END
    ELSE 0 END;

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
$fn$;$m37$;
  -- comando 38 de 76 das migrations
  EXECUTE $m38$CREATE OR REPLACE FUNCTION public.fin_quitacao_resultado(p jsonb) RETURNS jsonb
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
$fn$;$m38$;
  -- comando 39 de 76 das migrations
  EXECUTE $m39$CREATE OR REPLACE FUNCTION public.fin_quitacao_aprovacoes(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ultima_mudanca timestamptz; r text; a text;
BEGIN
  SELECT max(e.em) INTO ultima_mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('registrada', 'alterada');
  SELECT e.decisao INTO r FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_reembolso' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  SELECT e.decisao INTO a FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_relatado' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  RETURN jsonb_build_object('reembolso', to_jsonb(r), 'relatado', to_jsonb(a));
END
$fn$;$m39$;
  -- comando 40 de 76 das migrations
  EXECUTE $m40$CREATE OR REPLACE FUNCTION public.fin_quitacao_grau_conjunto(p_quitacao uuid) RETURNS text
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
$fn$;$m40$;
  -- comando 41 de 76 das migrations
  EXECUTE $m41$CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid) RETURNS jsonb
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
$fn$;$m41$;
  -- comando 42 de 76 das migrations
  EXECUTE $m42$CREATE OR REPLACE FUNCTION public.fin_quitacao_validar_campos(p_lancamento uuid, p_tipo text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago date, p_declarado date) RETURNS void
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
  IF p_intencao = 'compensacao_adiantamento' THEN RAISE EXCEPTION 'A compensação de adiantamento será liberada numa fase futura: ela exige o vínculo com o adiantamento anterior.'; END IF;
  IF p_intencao = 'oferta' AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'fin_lancamento_status' AND e.enumlabel = 'quitado_terceiro') THEN
    RAISE EXCEPTION 'A oferta será liberada na entrega 1B (precisa do status "quitado por terceiro"). Por enquanto registre Não declarada ou Reembolso.';
  END IF;
END
$fn$;$m42$;
  -- comando 43 de 76 das migrations
  EXECUTE $m43$CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(
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
$fn$;$m43$;
  -- comando 44 de 76 das migrations
  EXECUTE $m44$CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text) RETURNS void
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
$fn$;$m44$;
  -- comando 45 de 76 das migrations
  EXECUTE $m45$CREATE OR REPLACE FUNCTION public.fin_remover_quitacao(p_quitacao uuid, p_motivo text) RETURNS void
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
$fn$;$m45$;
  -- comando 46 de 76 das migrations
  EXECUTE $m46$CREATE OR REPLACE FUNCTION public.fin_decidir_quitacao(p_quitacao uuid, p_tipo text, p_decisao text, p_motivo text DEFAULT NULL) RETURNS void
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
$fn$;$m46$;
  -- comando 47 de 76 das migrations
  EXECUTE $m47$CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text) RETURNS void
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
$fn$;$m47$;
  -- comando 48 de 76 das migrations
  EXECUTE $m48$CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento() RETURNS trigger
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
$fn$;$m48$;
  -- comando 49 de 76 das migrations
  EXECUTE $m49$DROP TRIGGER IF EXISTS fin_lanc_quitacao_pagamento ON public.fin_lancamentos;$m49$;
  -- comando 50 de 76 das migrations
  EXECUTE $m50$CREATE TRIGGER fin_lanc_quitacao_pagamento BEFORE INSERT OR UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text IN ('realizado', 'conciliado')) EXECUTE FUNCTION public.fin_lanc_quitacao_bloqueia_pagamento();$m50$;
  -- comando 51 de 76 das migrations
  EXECUTE $m51$CREATE OR REPLACE FUNCTION public.fin_lanc_quitacao_protege_apagar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = OLD.id) THEN
    RAISE EXCEPTION 'Esta despesa tem uma quitação por terceiro registrada. Remova a quitação (com motivo) antes de excluí-la.';
  END IF;
  RETURN OLD;
END
$fn$;$m51$;
  -- comando 52 de 76 das migrations
  EXECUTE $m52$DROP TRIGGER IF EXISTS fin_lanc_quitacao_apagar ON public.fin_lancamentos;$m52$;
  -- comando 53 de 76 das migrations
  EXECUTE $m53$CREATE TRIGGER fin_lanc_quitacao_apagar BEFORE DELETE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_quitacao_protege_apagar();$m53$;
  -- comando 54 de 76 das migrations
  EXECUTE $m54$REVOKE EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) FROM PUBLIC, anon;$m54$;
  -- comando 55 de 76 das migrations
  EXECUTE $m55$REVOKE EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) FROM PUBLIC, anon;$m55$;
  -- comando 56 de 76 das migrations
  EXECUTE $m56$REVOKE EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) FROM PUBLIC, anon;$m56$;
  -- comando 57 de 76 das migrations
  EXECUTE $m57$REVOKE EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) FROM PUBLIC, anon;$m57$;
  -- comando 58 de 76 das migrations
  EXECUTE $m58$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) FROM PUBLIC, anon;$m58$;
  -- comando 59 de 76 das migrations
  EXECUTE $m59$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) FROM PUBLIC, anon;$m59$;
  -- comando 60 de 76 das migrations
  EXECUTE $m60$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) FROM PUBLIC, anon;$m60$;
  -- comando 61 de 76 das migrations
  EXECUTE $m61$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) FROM PUBLIC, anon;$m61$;
  -- comando 62 de 76 das migrations
  EXECUTE $m62$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) FROM PUBLIC, anon;$m62$;
  -- comando 63 de 76 das migrations
  EXECUTE $m63$GRANT EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text) TO authenticated;$m63$;
  -- comando 64 de 76 das migrations
  EXECUTE $m64$GRANT EXECUTE ON FUNCTION public.fin_alterar_quitacao(uuid, jsonb, text) TO authenticated;$m64$;
  -- comando 65 de 76 das migrations
  EXECUTE $m65$GRANT EXECUTE ON FUNCTION public.fin_remover_quitacao(uuid, text) TO authenticated;$m65$;
  -- comando 66 de 76 das migrations
  EXECUTE $m66$GRANT EXECUTE ON FUNCTION public.fin_decidir_quitacao(uuid, text, text, text) TO authenticated;$m66$;
  -- comando 67 de 76 das migrations
  EXECUTE $m67$GRANT EXECUTE ON FUNCTION public.fin_quitacao_parametros_alterar(jsonb, text) TO authenticated;$m67$;
  -- comando 68 de 76 das migrations
  EXECUTE $m68$GRANT EXECUTE ON FUNCTION public.fin_quitacao_entrada(uuid) TO authenticated;$m68$;
  -- comando 69 de 76 das migrations
  EXECUTE $m69$GRANT EXECUTE ON FUNCTION public.fin_quitacao_aprovacoes(uuid) TO authenticated;$m69$;
  -- comando 70 de 76 das migrations
  EXECUTE $m70$GRANT EXECUTE ON FUNCTION public.fin_quitacao_grau_conjunto(uuid) TO authenticated;$m70$;
  -- comando 71 de 76 das migrations
  EXECUTE $m71$GRANT EXECUTE ON FUNCTION public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date) TO authenticated;$m71$;
  -- comando 72 de 76 das migrations
  EXECUTE $m72$CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
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
 CROSS JOIN public.fin_quitacao_parametros p;$m72$;
  -- comando 73 de 76 das migrations
  EXECUTE $m73$GRANT SELECT ON public.vw_fin_quitacao TO authenticated;$m73$;
  -- comando 74 de 76 das migrations
  EXECUTE $m74$COMMENT ON VIEW public.vw_fin_quitacao IS 'A quitação registrada e tudo o que dela se DERIVA: graus de prova (dos anexos), nível de risco, suficiência, aprovação vigente, resultado, credor atual, fila e bloqueio de fechamento. Nada aqui é digitado.';$m74$;
  -- comando 75 de 76 das migrations
  EXECUTE $m75$CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
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
         WHEN d.envio_id IS NOT NULL AND d.paga THEN CASE WHEN d.periodo_aprovado THEN 'arquivada' ELSE 'enviada' END
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
       d.quitacao_id,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_responsavel IS NOT NULL THEN d.q_responsavel WHEN d.paga THEN 'igreja' ELSE 'ninguem_ainda' END AS responsavel,
       COALESCE(d.q_intencao, 'nao_se_aplica') AS intencao,
       d.q_grau AS grau_conjunto,
       d.q_nivel AS nivel_risco,
       d.q_fila AS fila,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_resultado IS NOT NULL THEN d.q_resultado WHEN d.paga THEN 'pago_pela_igreja' ELSE 'em_aberto' END AS resultado,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_credor IS NOT NULL THEN d.q_credor WHEN d.paga THEN 'nenhum' ELSE 'emitente' END AS credor_atual,
       COALESCE(d.q_bloqueia, false) AS bloqueia_fechamento
  FROM decididos d;$m75$;
  -- comando 76 de 76 das migrations
  EXECUTE $m76$GRANT SELECT ON public.vw_fin_ciclo TO authenticated;$m76$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  t0 := clock_timestamp();
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  dur_depois := EXTRACT(epoch FROM clock_timestamp() - t0);
  rel := rel || format(' Tempo de ler a vw_fin_ciclo inteira: %s s antes, %s s depois.', round(dur_antes, 2), round(dur_depois, 2));
  IF dur_depois > dur_antes * 3 + 2 THEN ok := false; rel := rel || ' FALHOU: a vw_fin_ciclo ficou muito mais lenta.'; END IF;
  IF n_lanc_depois <> n_lanc_antes OR h_lanc_depois IS DISTINCT FROM h_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF n_ciclo_depois <> n_ciclo_antes OR h_ciclo_depois IS DISTINCT FROM h_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou de resultado para despesas que já existiam.';
  ELSE rel := rel || format(' Depois das migrations: os %s lançamentos e as %s saídas do ciclo seguem IDÊNTICOS (estado, atraso e conferência).', n_lanc_depois, n_ciclo_depois); END IF;
  SELECT (SELECT count(*) FROM public.fin_quitacoes) = 0 AND (SELECT count(*) FROM public.fin_quitacao_eventos) = 0 AND (SELECT vigencia IS NULL FROM public.fin_quitacao_parametros) INTO parametros_ok;
  IF NOT parametros_ok THEN ok := false; rel := rel || ' FALHOU: as tabelas novas não nasceram vazias ou a vigência não nasceu desligada.'; ELSE rel := rel || ' Tabelas novas vazias; vigência DESLIGADA.'; END IF;

  -- ── o teste ao vivo, com um administrador real (desfeito no fim) ──
  SELECT ur.user_id INTO uid FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id WHERE ur.role::text = 'admin' AND pr.pessoa_id IS NOT NULL LIMIT 1;
  IF uid IS NULL THEN SELECT user_id INTO uid FROM public.user_roles WHERE role::text = 'admin' LIMIT 1; END IF;
  IF uid IS NULL THEN
    rel := rel || ' (nenhum administrador encontrado: o teste ao vivo das funções ficou de fora).';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    SELECT pessoa_id INTO pessoa_adm FROM public.profiles WHERE id = uid;
    SELECT id INTO conta FROM public.fin_contas ORDER BY id LIMIT 1;
    SELECT id INTO emit FROM public.fin_fornecedores WHERE public.fin_cnpj_valido(cnpj_cpf) ORDER BY id LIMIT 1;
    SELECT id INTO emp FROM public.fin_fornecedores WHERE public.fin_cnpj_valido(cnpj_cpf) AND id <> emit ORDER BY id LIMIT 1;
    SELECT id INTO forn_ruim FROM public.fin_fornecedores WHERE NOT public.fin_cnpj_valido(cnpj_cpf) ORDER BY id LIMIT 1;
    SELECT m.id INTO pessoa_a FROM public.membros m WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.pessoa_id = m.id) ORDER BY m.id LIMIT 1;
    IF pessoa_a IS NULL THEN SELECT id INTO pessoa_a FROM public.membros WHERE id IS DISTINCT FROM pessoa_adm ORDER BY id LIMIT 1; END IF;
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;

    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO quitação 1', emit, 'manual') RETURNING id INTO l1;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO quitação 2', emit, 'manual') RETURNING id INTO l2;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO quitação 3', emit, 'manual') RETURNING id INTO l3;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO quitação 4', emit, 'manual') RETURNING id INTO l4;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO controle', emit, 'manual') RETURNING id INTO lctl;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem) VALUES (conta, 'saida', 'previsto', current_date + 30, 900, 'ENSAIO valor alto', emit, 'manual') RETURNING id INTO l5;
    SELECT saldo_atual INTO saldo_conta_antes FROM public.fin_contas WHERE id = conta;

    -- T1: registrar um reembolso SEM anexo: o grau é Relatado ⇒ A formalizar. A obrigação de data futura vira Em aberto (o fornecedor já foi pago); a de controle continua Prevista.
    BEGIN
      q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_a, NULL, 'reembolso', current_date - 3, current_date - 2, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      SELECT estado INTO st FROM public.vw_fin_ciclo WHERE lancamento_id = l1;
      IF v.fila = 'formalizar' AND v.resultado = 'a_formalizar' AND v.grau_conjunto = 'relatado' AND v.credor_atual = 'em_analise' AND st = 'em_aberto' THEN
        rel := rel || ' T1 ok (reembolso sem anexo ⇒ Formalizar; despesa futura já Em aberto).';
      ELSE ok := false; rel := rel || format(' FALHOU T1: fila=%s resultado=%s grau=%s credor=%s estado=%s.', v.fila, v.resultado, v.grau_conjunto, v.credor_atual, st); END IF;
      SELECT estado INTO st FROM public.vw_fin_ciclo WHERE lancamento_id = lctl;
      IF st <> 'prevista' THEN ok := false; rel := rel || ' FALHOU T1b: a despesa de controle deveria continuar Prevista.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T1: ' || SQLERRM; END;

    -- T2: os anexos da quitação tornam a prova Formal ⇒ Aprovar reembolso; e NÃO contam como "documento original"
    BEGIN
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'prova_pagamento_terceiro', 'ensaio-prova.pdf'), (l1, 'pedido_reembolso', 'ensaio-pedido.pdf');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      IF v.suficiente AND v.fila = 'aprovar_reembolso' AND v.grau_conjunto = 'formal' THEN rel := rel || ' T2 ok (anexos ⇒ Formal ⇒ Aprovar reembolso).';
      ELSE ok := false; rel := rel || format(' FALHOU T2: suficiente=%s fila=%s grau=%s.', v.suficiente, v.fila, v.grau_conjunto); END IF;
      IF (SELECT tem_documento FROM public.vw_fin_ciclo WHERE lancamento_id = l1) THEN ok := false; rel := rel || ' FALHOU T2b: a prova da quitação foi contada como documento original da despesa.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T2: ' || SQLERRM; END;

    -- T3: aprovar é um evento próprio, que NÃO paga: o credor passa a ser o terceiro e o saldo de TODAS as contas fica idêntico
    BEGIN
      PERFORM public.fin_decidir_quitacao(q1, 'reembolso', 'aprovada', 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_depois FROM public.fin_contas;
      SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
      IF v.fila = 'reembolso_a_pagar' AND v.credor_atual = 'terceiro' AND v.resultado = 'divida_com_terceiro' AND st = 'previsto' AND h_saldos_depois = h_saldos_antes THEN
        rel := rel || ' T3 ok (aprovar NÃO paga: despesa continua prevista e nenhum saldo mudou).';
      ELSE ok := false; rel := rel || format(' FALHOU T3: fila=%s credor=%s status=%s saldos iguais=%s.', v.fila, v.credor_atual, st, h_saldos_depois = h_saldos_antes); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T3: ' || SQLERRM; END;

    -- T4: pagar o FORNECEDOR de uma obrigação já quitada por terceiro é RECUSADO (senão pagaria duas vezes)
    BEGIN
      UPDATE public.fin_lancamentos SET status = 'realizado', data_pagamento = current_date WHERE id = l1;
      ok := false; rel := rel || ' FALHOU T4: foi possível marcar paga uma obrigação já quitada por terceiro.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%já foi paga ao fornecedor por um terceiro%' THEN rel := rel || ' T4 ok (pagar o fornecedor de novo foi recusado).';
      ELSE ok := false; rel := rel || ' FALHOU T4: recusa com outra mensagem: ' || SQLERRM; END IF;
    END;

    -- T5: alterar sem motivo é recusado; com motivo vale, grava o antes e o depois, e a aprovação anterior PERDE a validade
    BEGIN
      BEGIN
        PERFORM public.fin_alterar_quitacao(q1, jsonb_build_object('pago_em', (current_date - 4)::text), '');
        ok := false; rel := rel || ' FALHOU T5: alterou sem motivo.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%motivo%' THEN rel := rel || ' T5a ok (alterar sem motivo recusado).'; ELSE ok := false; rel := rel || ' FALHOU T5a: ' || SQLERRM; END IF;
      END;
      PERFORM public.fin_alterar_quitacao(q1, jsonb_build_object('pago_em', (current_date - 4)::text), 'ENSAIO: corrigir a data');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      IF v.fila = 'aprovar_reembolso' AND v.aprovacao_reembolso IS NULL THEN rel := rel || ' T5b ok (a aprovação perdeu a validade após a alteração).';
      ELSE ok := false; rel := rel || format(' FALHOU T5b: fila=%s aprovação=%s.', v.fila, v.aprovacao_reembolso); END IF;
      PERFORM public.fin_decidir_quitacao(q1, 'reembolso', 'aprovada', 'ENSAIO de novo');
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T5: ' || SQLERRM; END;

    -- T6: a oferta (entrega 1B) e a compensação (fase futura) são recusadas por enquanto
    BEGIN
      PERFORM public.fin_registrar_quitacao(l2, 'pessoa', pessoa_a, NULL, 'oferta', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU T6: a oferta foi aceita antes da entrega 1B.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%entrega 1B%' THEN rel := rel || ' T6a ok (oferta recusada até a 1B).'; ELSE ok := false; rel := rel || ' FALHOU T6a: ' || SQLERRM; END IF;
    END;
    BEGIN
      PERFORM public.fin_registrar_quitacao(l2, 'pessoa', pessoa_a, NULL, 'compensacao_adiantamento', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU T6b: a compensação foi aceita.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%compensação de adiantamento%' THEN rel := rel || ' T6b ok (compensação recusada).'; ELSE ok := false; rel := rel || ' FALHOU T6b: ' || SQLERRM; END IF;
    END;

    -- T7: Empresa só com CNPJ válido; o próprio emitente não pode ser o terceiro
    IF forn_ruim IS NOT NULL THEN
      BEGIN
        PERFORM public.fin_registrar_quitacao(l2, 'empresa', NULL, forn_ruim, 'nao_declarada', current_date - 1, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        ok := false; rel := rel || ' FALHOU T7a: aceitou Empresa sem CNPJ válido.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CNPJ válido%' THEN rel := rel || ' T7a ok (Empresa sem CNPJ válido recusada).'; ELSE ok := false; rel := rel || ' FALHOU T7a: ' || SQLERRM; END IF;
      END;
    ELSE rel := rel || ' (T7a de fora: todos os fornecedores têm CNPJ válido).'; END IF;
    BEGIN
      PERFORM public.fin_registrar_quitacao(l2, 'empresa', NULL, emit, 'nao_declarada', current_date - 1, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU T7b: o emitente foi aceito como terceiro.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%emitente%' THEN rel := rel || ' T7b ok (o emitente não pode ser o terceiro).'; ELSE ok := false; rel := rel || ' FALHOU T7b: ' || SQLERRM; END IF;
    END;
    IF emp IS NOT NULL THEN
      BEGIN
        q2 := public.fin_registrar_quitacao(l2, 'empresa', NULL, emp, 'nao_declarada', current_date - 1, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q2;
        IF v.fila = 'a_esclarecer' AND v.grau_intencao = 'nenhum' AND NOT v.suficiente THEN rel := rel || ' T7c ok (Empresa com CNPJ, intenção não declarada ⇒ A esclarecer).';
        ELSE ok := false; rel := rel || format(' FALHOU T7c: fila=%s grau=%s suficiente=%s.', v.fila, v.grau_intencao, v.suficiente); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T7c: ' || SQLERRM; END;
    END IF;

    -- T8: ninguém aprova o próprio reembolso
    IF pessoa_adm IS NOT NULL THEN
      BEGIN
        q3 := public.fin_registrar_quitacao(l3, 'pessoa', pessoa_adm, NULL, 'reembolso', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l3, 'prova_pagamento_terceiro', 'p.pdf'), (l3, 'pedido_reembolso', 'q.pdf');
        PERFORM public.fin_decidir_quitacao(q3, 'reembolso', 'aprovada', 'ENSAIO');
        ok := false; rel := rel || ' FALHOU T8: o aprovador aprovou o próprio reembolso.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%próprio reembolso%' THEN rel := rel || ' T8 ok (ninguém aprova o próprio reembolso).'; ELSE ok := false; rel := rel || ' FALHOU T8: ' || SQLERRM; END IF;
      END;
    ELSE rel := rel || ' (T8 de fora: o administrador do teste não tem pessoa no cadastro).'; END IF;

    -- T9: "Não localizado" ⇒ Investigar; se a igreja paga, a marcação some sozinha, com o motivo no histórico
    BEGIN
      PERFORM public.fin_registrar_quitacao(l4, 'nao_localizado', NULL, NULL, 'nao_se_aplica', NULL, NULL, NULL, NULL, NULL, false, 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE obrigacao_id = l4;
      IF v.fila = 'investigar' AND v.resultado = 'sem_quitacao_localizada' THEN rel := rel || ' T9a ok (Não localizado ⇒ Investigar).';
      ELSE ok := false; rel := rel || format(' FALHOU T9a: fila=%s resultado=%s.', v.fila, v.resultado); END IF;
      UPDATE public.fin_lancamentos SET status = 'realizado', data_pagamento = current_date WHERE id = l4;
      SELECT count(*) INTO n FROM public.fin_quitacoes WHERE obrigacao_id = l4;
      SELECT count(*) INTO ev_removida FROM public.fin_quitacao_eventos WHERE obrigacao_id = l4 AND evento = 'removida';
      IF n = 0 AND ev_removida = 1 THEN rel := rel || ' T9b ok (a igreja pagou: a marcação saiu e ficou o rastro).';
      ELSE ok := false; rel := rel || format(' FALHOU T9b: quitações restantes=%s eventos de remoção=%s.', n, ev_removida); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T9: ' || SQLERRM; END;

    -- T10: excluir despesa com quitação é recusado, com mensagem clara
    BEGIN
      DELETE FROM public.fin_lancamentos WHERE id = l1;
      ok := false; rel := rel || ' FALHOU T10: excluiu uma despesa com quitação.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%tem uma quitação por terceiro registrada%' THEN rel := rel || ' T10 ok (despesa com quitação não se exclui).'; ELSE ok := false; rel := rel || ' FALHOU T10: ' || SQLERRM; END IF;
    END;

    -- T11: a API (papel authenticated) NÃO escreve nas tabelas novas
    BEGIN
      SET LOCAL ROLE authenticated;
      BEGIN
        INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, intencao) VALUES (lctl, 'nao_localizado', 'nao_se_aplica');
        RESET ROLE; ok := false; rel := rel || ' FALHOU T11: a API conseguiu inserir em fin_quitacoes.';
      EXCEPTION WHEN OTHERS THEN RESET ROLE; rel := rel || ' T11a ok (a API não escreve em fin_quitacoes).'; END;
      SET LOCAL ROLE authenticated;
      BEGIN
        UPDATE public.fin_quitacao_parametros SET teto_1 = 1;
        GET DIAGNOSTICS n = ROW_COUNT;
        RESET ROLE;
        IF n <> 0 THEN ok := false; rel := rel || ' FALHOU T11b: a API alterou os parâmetros.'; ELSE rel := rel || ' T11b ok (a API não altera os parâmetros).'; END IF;
      EXCEPTION WHEN OTHERS THEN RESET ROLE; rel := rel || ' T11b ok (a API não altera os parâmetros).'; END;
    EXCEPTION WHEN OTHERS THEN RESET ROLE;
      IF SQLERRM ILIKE '%set role%' THEN rel := rel || ' (T11 de fora: este usuário não pode trocar de papel no editor).'; ELSE ok := false; rel := rel || ' FALHOU T11: ' || SQLERRM; END IF;
    END;

    -- T12: o histórico só acrescenta
    BEGIN
      DELETE FROM public.fin_quitacao_eventos WHERE quitacao_id = q1;
      ok := false; rel := rel || ' FALHOU T12: apagou histórico.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%só acrescenta%' THEN rel := rel || ' T12 ok (o histórico não se apaga).'; ELSE ok := false; rel := rel || ' FALHOU T12: ' || SQLERRM; END IF;
    END;
    SELECT count(*) FILTER (WHERE evento = 'registrada'), count(*) FILTER (WHERE evento = 'alterada'), count(*) FILTER (WHERE evento = 'aprovacao_reembolso')
      INTO ev_registrada, ev_alterada, ev_aprov FROM public.fin_quitacao_eventos WHERE quitacao_id = q1;
    IF ev_registrada = 1 AND ev_alterada = 1 AND ev_aprov = 2 THEN rel := rel || ' Histórico da quitação 1: 1 registro, 1 alteração, 2 aprovações.';
    ELSE ok := false; rel := rel || format(' FALHOU: histórico da quitação 1 (registros %s, alterações %s, aprovações %s).', ev_registrada, ev_alterada, ev_aprov); END IF;

    -- T13: remover (com motivo) libera a despesa; depois disso a igreja pode pagar o fornecedor normalmente
    BEGIN
      BEGIN
        PERFORM public.fin_remover_quitacao(q1, '');
        ok := false; rel := rel || ' FALHOU T13a: removeu sem motivo.';
      EXCEPTION WHEN OTHERS THEN rel := rel || ' T13a ok (remover sem motivo recusado).'; END;
      PERFORM public.fin_remover_quitacao(q1, 'ENSAIO: registrada por engano');
      UPDATE public.fin_lancamentos SET status = 'realizado', data_pagamento = current_date WHERE id = l1;
      SELECT responsavel, resultado INTO v FROM public.vw_fin_ciclo WHERE lancamento_id = l1;
      IF v.responsavel = 'igreja' AND v.resultado = 'pago_pela_igreja' THEN rel := rel || ' T13b ok (sem quitação, a igreja paga e o sistema deduz Responsável = Igreja).';
      ELSE ok := false; rel := rel || format(' FALHOU T13b: responsável=%s resultado=%s.', v.responsavel, v.resultado); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T13: ' || SQLERRM; END;

    -- T14: o parâmetro de vigência: desligado não bloqueia; ligado bloqueia A esclarecer e Formalizar a partir da data
    BEGIN
      IF q2 IS NOT NULL THEN
        SELECT bloqueia_fechamento INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q2;
        IF v.bloqueia_fechamento THEN ok := false; rel := rel || ' FALHOU T14a: bloqueou com a vigência desligada.'; ELSE rel := rel || ' T14a ok (vigência desligada: nada bloqueia).'; END IF;
        PERFORM public.fin_quitacao_parametros_alterar(jsonb_build_object('vigencia', (current_date - 10)::text), 'ENSAIO');
        SELECT bloqueia_fechamento INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q2;
        IF v.bloqueia_fechamento THEN rel := rel || ' T14b ok (vigência ligada: A esclarecer bloqueia).'; ELSE ok := false; rel := rel || ' FALHOU T14b: não bloqueou com a vigência ligada.'; END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T14: ' || SQLERRM; END;

    -- T15: os moduladores: valor acima do teto 1 (M2) e declaração 40 dias depois do pagamento (M1) elevam o nível; o valor nunca rebaixa
    BEGIN
      q5 := public.fin_registrar_quitacao(l5, 'pessoa', pessoa_a, NULL, 'reembolso', current_date - 50, current_date - 10, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q5;
      IF v.moduladores @> '["M1"]'::jsonb AND v.moduladores @> '["M2"]'::jsonb AND v.nivel_risco = 'alto' THEN rel := rel || ' T15 ok (M1 e M2 acionados; nível Alto).';
      ELSE ok := false; rel := rel || format(' FALHOU T15: moduladores=%s nível=%s.', v.moduladores, v.nivel_risco); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU T15: ' || SQLERRM; END;

    -- ── as garantias finais ──
    SELECT count(*) INTO n_entradas_depois FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT count(*) INTO n_vinc_depois FROM public.fin_extrato_vinculos;
    IF n_entradas_depois <> n_entradas_antes OR n_vinc_depois <> n_vinc_antes THEN ok := false; rel := rel || ' FALHOU: nasceu entrada ou vínculo bancário durante o ensaio.';
    ELSE rel := rel || ' GARANTIA: nenhuma entrada, transferência ou vínculo bancário foi criado.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
