-- ─── Fase 1D-a: a DECLARAÇÃO DO TERCEIRO gerada pelo sistema — dados, documento e assinatura (a Matriz do reembolso é a 1D-b) ───────────────────────────────────────────
-- Depende da 1A, do M0, da 1B e da 1C-a (aplicadas ANTES). NENHUM comportamento da Matriz muda aqui: nível, suficiência, fila e resultado continuam saindo das mesmas regras. Nenhum dado existente é alterado.
--
-- Decisão (Adendo 2, aprovado em 14/10/2026): a intenção continua OBRIGATÓRIA e NUNCA presumida; o documento que a prova passa a ser UM só, a Declaração do Terceiro, GERADA PELO SISTEMA a partir do que
-- já está cadastrado. O usuário não a escreve. Cada via imprime só a frase da intenção registrada (sem caixas para marcar), com número e código de verificação. Esta migration entrega a base:
--   1. `fin_quitacoes.forma_pagamento_terceiro` (dinheiro, pix, cartao_credito, cartao_debito, transferencia, outro): o único fato novo. Nulo em quem já existe e em "Não localizado"; a obrigatoriedade na
--      REGISTRO entra na 1D-b, junto com a tela (a tela já passa a pedir o campo nesta entrega).
--   2. a data da declaração deixa de ser obrigatória no registro: ela nasce quando a via ASSINADA chega (a regra "intenção declarada ⇔ data da declaração" é relaxada; as funções de registro ainda a pedem até a 1D-b).
--   3. `fin_declaracoes_terceiro`: o que foi gerado (número, versão, conteúdo, código/hash) e a via assinada. Só acrescenta; só a assinatura é gravada depois. O conteúdo declarado NÃO inclui centro de custo
--      nem categoria (são informativos: reclassificar não invalida a assinatura).
--   4. `fin_declaracao_conteudo`, `fin_declaracao_hash`, `fin_gerar_declaracao_terceiro` (idempotente: o mesmo conteúdo devolve a mesma via; mudou o conteúdo, nasce a próxima versão),
--      `fin_registrar_assinatura_declaracao` (a via assinada e a data da assinatura) e `fin_declaracao_estado` (sem_declaracao · aguardando_assinatura · assinada · desatualizada · externa).
--   5. `fin_quitacao_parametros` ganha os limites do reembolso (nível Baixo até R$ 300,00; Médio até R$ 1.500,00; inclusivos), alteráveis só pelo Administrador, com histórico. Ainda NÃO são usados (1D-b).
--   6. `fin_registrar_quitacao` e `fin_registrar_nf_quitada_por_terceiro` ganham o parâmetro opcional da forma de pagamento e `fin_alterar_quitacao` passa a aceitá-la (com motivo e histórico); `fin_quitacao_parametros_alterar` aceita os dois limites.
-- Definições das quatro funções: as VIVAS do banco (pg_get_functiondef, 14/10/2026), com mudanças cirúrgicas. Reversível: docs/QUITACAO_1D_A_ROLLBACK.sql.

-- ── 1) o fato novo e a data da declaração opcional ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_quitacoes ADD COLUMN IF NOT EXISTS forma_pagamento_terceiro text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_forma_pagamento_check') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_forma_pagamento_check
      CHECK (forma_pagamento_terceiro IS NULL OR forma_pagamento_terceiro IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_forma_coerente') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_forma_coerente CHECK (responsavel_tipo <> 'nao_localizado' OR forma_pagamento_terceiro IS NULL);
  END IF;
  -- a data da declaração só existe para as intenções que se declaram; mas pode faltar até a via assinada chegar
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_declaracao') THEN
    ALTER TABLE public.fin_quitacoes DROP CONSTRAINT fin_quitacoes_declaracao;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_declaracao_data') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_declaracao_data
      CHECK (declarado_em IS NULL OR intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento'));
  END IF;
END $$;
COMMENT ON COLUMN public.fin_quitacoes.forma_pagamento_terceiro IS 'Como o TERCEIRO pagou o fornecedor: dinheiro, pix, cartao_credito, cartao_debito, transferencia ou outro. Impressa na Declaração do Terceiro. Nulo em "Não localizado" e nas quitações anteriores à Fase 1D.';

-- ── 2) os limites do reembolso (ainda não usados pela Matriz: 1D-b) ───────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_quitacao_parametros
  ADD COLUMN IF NOT EXISTS reembolso_teto_baixo numeric(14,2) NOT NULL DEFAULT 300   CHECK (reembolso_teto_baixo > 0),
  ADD COLUMN IF NOT EXISTS reembolso_teto_medio numeric(14,2) NOT NULL DEFAULT 1500  CHECK (reembolso_teto_medio > 0);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacao_parametros_reembolso_faixas') THEN
    ALTER TABLE public.fin_quitacao_parametros ADD CONSTRAINT fin_quitacao_parametros_reembolso_faixas CHECK (reembolso_teto_medio >= reembolso_teto_baixo);
  END IF;
END $$;
COMMENT ON COLUMN public.fin_quitacao_parametros.reembolso_teto_baixo IS 'Reembolso até este valor (inclusive) é nível Baixo na Matriz do reembolso (valor da nota).';
COMMENT ON COLUMN public.fin_quitacao_parametros.reembolso_teto_medio IS 'Reembolso até este valor (inclusive) é nível Médio; acima, Alto.';

-- ── 3) o histórico ganha os dois eventos do documento ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada'));
END $$;

-- ── 4) o que foi gerado (só acrescenta; só a assinatura se grava depois) ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_declaracoes_terceiro (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                       int  NOT NULL,
  seq                       int  NOT NULL,
  numero                    text NOT NULL,                                   -- DT-AAAA-NNNN: o mesmo número em todas as versões da mesma quitação
  versao                    int  NOT NULL CHECK (versao >= 1),
  quitacao_id               uuid NOT NULL,                                   -- sem FK: é história (a quitação pode ser removida)
  obrigacao_id              uuid NOT NULL,
  intencao                  text NOT NULL CHECK (intencao IN ('reembolso', 'oferta')),
  conteudo                  jsonb NOT NULL,                                  -- { declarado: {...}, informativo: {...} }; o hash cobre só "declarado"
  hash                      text NOT NULL,
  gerada_em                 timestamptz NOT NULL DEFAULT now(),
  gerada_por                uuid DEFAULT auth.uid(),
  assinada_anexo_id         uuid REFERENCES public.fin_lancamento_anexos(id) ON DELETE SET NULL,
  assinada_em               date,                                            -- a data escrita na via assinada
  assinatura_registrada_em  timestamptz,
  assinatura_registrada_por uuid,
  UNIQUE (quitacao_id, versao)
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_declaracoes_terceiro_numero_idx ON public.fin_declaracoes_terceiro (ano, seq) WHERE versao = 1;
CREATE INDEX IF NOT EXISTS fin_declaracoes_terceiro_obrigacao_idx ON public.fin_declaracoes_terceiro (obrigacao_id);
COMMENT ON TABLE public.fin_declaracoes_terceiro IS 'Cada via gerada da Declaração do Terceiro: número, versão, conteúdo e hash (o que o terceiro assinou) e a via assinada. Só as funções escrevem; só a assinatura muda depois de gerada.';

CREATE OR REPLACE FUNCTION public.fin_declaracoes_terceiro_protege() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A Declaração do Terceiro gerada faz parte do histórico: não se apaga.'; END IF;
  IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.ano IS DISTINCT FROM OLD.ano OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.versao IS DISTINCT FROM OLD.versao
     OR NEW.quitacao_id IS DISTINCT FROM OLD.quitacao_id OR NEW.obrigacao_id IS DISTINCT FROM OLD.obrigacao_id OR NEW.intencao IS DISTINCT FROM OLD.intencao
     OR NEW.conteudo IS DISTINCT FROM OLD.conteudo OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.gerada_em IS DISTINCT FROM OLD.gerada_em OR NEW.gerada_por IS DISTINCT FROM OLD.gerada_por THEN
    RAISE EXCEPTION 'O que foi gerado na Declaração do Terceiro não se altera: gere uma nova versão.';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_declaracoes_terceiro_protege ON public.fin_declaracoes_terceiro;
CREATE TRIGGER fin_declaracoes_terceiro_protege BEFORE UPDATE OR DELETE ON public.fin_declaracoes_terceiro FOR EACH ROW EXECUTE FUNCTION public.fin_declaracoes_terceiro_protege();

ALTER TABLE public.fin_declaracoes_terceiro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_declaracoes_terceiro_leitura ON public.fin_declaracoes_terceiro;
CREATE POLICY fin_declaracoes_terceiro_leitura ON public.fin_declaracoes_terceiro FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de escrita: só as funções SECURITY DEFINER escrevem

-- ── 5) o conteúdo declarado, o código e a geração ────────────────────────────────────────────────────────────────────────────────────────────────────
-- "declarado" = o que o TERCEIRO assina (entra no código de verificação). "informativo" = a classificação da igreja (centro, categoria): NÃO entra, para que reclassificar não invalide a assinatura.
CREATE OR REPLACE FUNCTION public.fin_declaracao_conteudo(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; forn public.fin_fornecedores%ROWTYPE; resp public.fin_fornecedores%ROWTYPE; m public.membros%ROWTYPE;
  d_nome text; d_doc text; pix text; pixtipo text; centro text; cat text;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  IF q.responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Só há Declaração do Terceiro quando se sabe quem pagou.'; END IF;
  IF q.intencao NOT IN ('reembolso', 'oferta') THEN RAISE EXCEPTION 'A Declaração do Terceiro existe para reembolso e oferta; a intenção desta quitação é "%".', q.intencao; END IF;
  IF q.forma_pagamento_terceiro IS NULL THEN RAISE EXCEPTION 'Informe a forma de pagamento usada pelo terceiro antes de gerar a Declaração.'; END IF;
  IF q.pago_em IS NULL THEN RAISE EXCEPTION 'Informe a data em que o terceiro pagou antes de gerar a Declaração.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO forn FROM public.fin_fornecedores WHERE id = l.fornecedor_id;
  IF q.responsavel_tipo = 'pessoa' THEN
    SELECT * INTO m FROM public.membros WHERE id = q.responsavel_pessoa_id;
    d_nome := m.nome_completo; d_doc := m.cpf;
  ELSE
    SELECT * INTO resp FROM public.fin_fornecedores WHERE id = q.responsavel_fornecedor_id;
    d_nome := resp.nome; d_doc := resp.cnpj_cpf;
  END IF;
  IF q.intencao = 'reembolso' THEN
    IF q.responsavel_tipo = 'pessoa' THEN
      SELECT f.chave_pix, f.tipo_chave_pix INTO pix, pixtipo FROM public.fin_fornecedores f WHERE f.pessoa_id = q.responsavel_pessoa_id AND f.chave_pix IS NOT NULL LIMIT 1;
      IF pix IS NULL THEN SELECT p.chave_pix, p.tipo_chave_pix INTO pix, pixtipo FROM public.fin_pessoa_pix p WHERE p.pessoa_id = q.responsavel_pessoa_id; END IF;
    ELSE
      pix := resp.chave_pix; pixtipo := resp.tipo_chave_pix;
    END IF;
    -- a chave PIX é "quando aplicável": quem recebe em espécie (com recibo assinado) ou por TED não precisa ter chave; a forma de pagar o reembolso se decide no pagamento (cláusula 5.5)
  END IF;
  SELECT cc.nome INTO centro FROM public.fin_centros_custo cc WHERE cc.id = l.centro_custo_id;
  SELECT ct.nome INTO cat FROM public.fin_categorias ct WHERE ct.id = l.categoria_id;
  RETURN jsonb_build_object(
    'declarado', jsonb_build_object(
      'intencao', q.intencao, 'declarante_tipo', q.responsavel_tipo, 'declarante_id', COALESCE(q.responsavel_pessoa_id, q.responsavel_fornecedor_id), 'declarante_nome', d_nome, 'declarante_documento', d_doc,
      'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', forn.nome, 'fornecedor_documento', forn.cnpj_cpf,
      'nota_numero', l.documento_numero, 'nota_chave', l.nf_chave_acesso, 'nota_data', l.data, 'valor', COALESCE(l.valor_original, l.valor),
      'forma_pagamento', q.forma_pagamento_terceiro, 'data_pagamento', q.pago_em, 'chave_pix', pix, 'tipo_chave_pix', pixtipo),
    'informativo', jsonb_build_object('centro', centro, 'categoria', cat));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_declaracao_hash(p_declarado jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$ SELECT encode(sha256(convert_to(p_declarado::text, 'UTF8')), 'hex') $fn$;

CREATE OR REPLACE FUNCTION public.fin_gerar_declaracao_terceiro(p_quitacao uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; c jsonb; h text; ult public.fin_declaracoes_terceiro%ROWTYPE; novo uuid; v_ano int; v_seq int; v_num text; v_versao int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para gerar a Declaração do Terceiro.';
  END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não se gera nova Declaração.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: só a reabertura permite nova Declaração.'; END IF;
  c := public.fin_declaracao_conteudo(q.id);
  h := public.fin_declaracao_hash(c->'declarado');
  SELECT * INTO ult FROM public.fin_declaracoes_terceiro WHERE quitacao_id = q.id ORDER BY versao DESC LIMIT 1;
  IF FOUND AND ult.hash = h THEN RETURN ult.id; END IF;                       -- o mesmo conteúdo: a mesma via (nada de versão repetida)
  IF FOUND THEN
    v_ano := ult.ano; v_seq := ult.seq; v_num := ult.numero; v_versao := ult.versao + 1;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('fin_declaracao_numero'));
    v_ano := EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
    SELECT COALESCE(max(seq), 0) + 1 INTO v_seq FROM public.fin_declaracoes_terceiro WHERE ano = v_ano;
    v_num := 'DT-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0'); v_versao := 1;
  END IF;
  INSERT INTO public.fin_declaracoes_terceiro (ano, seq, numero, versao, quitacao_id, obrigacao_id, intencao, conteudo, hash)
  VALUES (v_ano, v_seq, v_num, v_versao, q.id, q.obrigacao_id, q.intencao, c, h) RETURNING id INTO novo;
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, por)
  VALUES (q.id, q.obrigacao_id, 'declaracao_gerada', jsonb_build_object('numero', v_num, 'versao', v_versao, 'intencao', q.intencao, 'codigo', left(h, 12)), (SELECT auth.uid()));
  RETURN novo;
END
$fn$;

-- o estado da Declaração de uma quitação. "desatualizada": o que o terceiro declarou mudou depois de gerada (a via assinada não vale mais para o registro atual)
CREATE OR REPLACE FUNCTION public.fin_declaracao_estado(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; ult public.fin_declaracoes_terceiro%ROWTYPE; atual text;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO ult FROM public.fin_declaracoes_terceiro WHERE quitacao_id = q.id ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
                WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND a.tipo IN ('declaracao_terceiro', 'pedido_reembolso')) THEN RETURN 'externa'; END IF;
    RETURN 'sem_declaracao';
  END IF;
  BEGIN
    atual := public.fin_declaracao_hash((public.fin_declaracao_conteudo(q.id))->'declarado');
  EXCEPTION WHEN OTHERS THEN atual := NULL;                                   -- dado incompleto: a via gerada já não corresponde ao registro
  END;
  IF atual IS NULL OR atual <> ult.hash THEN RETURN 'desatualizada'; END IF;
  IF ult.assinada_anexo_id IS NULL THEN RETURN 'aguardando_assinatura'; END IF;
  RETURN 'assinada';
END
$fn$;

-- a via assinada: o anexo (tipo declaracao_terceiro) e a data escrita nela. Só vale para a versão mais nova e ainda atual.
CREATE OR REPLACE FUNCTION public.fin_registrar_assinatura_declaracao(p_declaracao uuid, p_anexo uuid, p_data_assinatura date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE d public.fin_declaracoes_terceiro%ROWTYPE; q public.fin_quitacoes%ROWTYPE; a public.fin_lancamento_anexos%ROWTYPE; x public.fin_lancamentos%ROWTYPE; uid uuid := (SELECT auth.uid());
        hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para registrar a assinatura.'; END IF;
  SELECT * INTO d FROM public.fin_declaracoes_terceiro WHERE id = p_declaracao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declaração não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_declaracoes_terceiro n WHERE n.quitacao_id = d.quitacao_id AND n.versao > d.versao) THEN RAISE EXCEPTION 'Há uma versão mais nova desta Declaração: a assinada deve ser a da versão mais nova.'; END IF;
  IF public.fin_declaracao_estado(d.quitacao_id) <> 'aguardando_assinatura' THEN
    RAISE EXCEPTION 'Esta via não está aguardando assinatura (estado: %). Se os dados mudaram, gere uma nova via e colha nova assinatura.', public.fin_declaracao_estado(d.quitacao_id);
  END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = d.quitacao_id FOR UPDATE;
  SELECT * INTO a FROM public.fin_lancamento_anexos WHERE id = p_anexo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anexo não encontrado.'; END IF;
  IF a.tipo <> 'declaracao_terceiro' THEN RAISE EXCEPTION 'O anexo da via assinada deve ser do tipo "Declaração do terceiro".'; END IF;
  SELECT * INTO x FROM public.fin_lancamentos WHERE id = a.lancamento_id;
  IF COALESCE(x.obrigacao_id, x.id) <> d.obrigacao_id THEN RAISE EXCEPTION 'O anexo não pertence a esta obrigação.'; END IF;
  IF p_data_assinatura IS NULL OR p_data_assinatura > hoje THEN RAISE EXCEPTION 'A data da assinatura é obrigatória e não pode ser futura.'; END IF;
  IF p_data_assinatura < q.pago_em THEN RAISE EXCEPTION 'A assinatura não pode ser anterior ao pagamento do terceiro (%).', to_char(q.pago_em, 'DD/MM/YYYY'); END IF;
  UPDATE public.fin_declaracoes_terceiro SET assinada_anexo_id = p_anexo, assinada_em = p_data_assinatura, assinatura_registrada_em = now(), assinatura_registrada_por = uid WHERE id = d.id;
  PERFORM set_config('qibrj.motivo', 'Declaração do Terceiro ' || d.numero || ' (versão ' || d.versao || ') assinada em ' || to_char(p_data_assinatura, 'DD/MM/YYYY'), true);
  UPDATE public.fin_quitacoes SET declarado_em = p_data_assinatura WHERE id = q.id AND declarado_em IS DISTINCT FROM p_data_assinatura;
  PERFORM set_config('qibrj.motivo', '', true);
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, por)
  VALUES (q.id, q.obrigacao_id, 'declaracao_assinada', jsonb_build_object('numero', d.numero, 'versao', d.versao, 'assinada_em', p_data_assinatura, 'anexo', p_anexo), uid);
  BEGIN PERFORM public.fin_quitacao_sincronizar(d.obrigacao_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Assinatura gravada, mas não consegui sincronizar a obrigação %: %', d.obrigacao_id, SQLERRM; END;
END
$fn$;

-- ── 6) as três funções existentes, transformadas a partir da definição viva ───────────────────────────────────────────────────────────────────────────
-- (a versão antiga de fin_registrar_quitacao, sem o parâmetro novo, sai: duas versões deixariam a chamada ambígua)
CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(p_lancamento uuid, p_responsavel text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_natureza_item text DEFAULT NULL::text, p_comprador text DEFAULT NULL::text, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_forma_pagamento_terceiro IS NOT NULL THEN
    IF p_forma_pagamento_terceiro NOT IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento do terceiro inválida: %.', p_forma_pagamento_terceiro; END IF;
    IF p_responsavel = 'nao_localizado' THEN RAISE EXCEPTION 'Quando não se sabe quem pagou, não há forma de pagamento do terceiro.'; END IF;
  END IF;

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
  INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, pago_em, declarado_em, condicao, pede_recibo, forma_pagamento_terceiro)
  VALUES (l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em, NULLIF(btrim(COALESCE(p_condicao, '')), ''), COALESCE(p_pede_recibo, false), p_forma_pagamento_terceiro)
  RETURNING id INTO novo;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- oferta com prova suficiente ⇒ a obrigação se extingue
  RETURN novo;
END
$function$;
DROP FUNCTION IF EXISTS public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; k text; permitidas text[] := ARRAY['responsavel_tipo', 'responsavel_pessoa_id', 'responsavel_fornecedor_id', 'intencao', 'pago_em', 'declarado_em', 'condicao', 'pede_recibo', 'forma_pagamento_terceiro'];
        n_tipo text; n_pessoa uuid; n_forn uuid; n_int text; n_pago date; n_decl date; n_cond text; n_recibo boolean; n_forma text;
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
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se altera mais.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: a quitação só muda com a reabertura (Administrador ou Tesouraria, com motivo).'; END IF;

  n_tipo  := COALESCE(p_patch->>'responsavel_tipo', q.responsavel_tipo);
  n_pessoa := CASE WHEN p_patch ? 'responsavel_pessoa_id' THEN NULLIF(p_patch->>'responsavel_pessoa_id', '')::uuid ELSE q.responsavel_pessoa_id END;
  n_forn  := CASE WHEN p_patch ? 'responsavel_fornecedor_id' THEN NULLIF(p_patch->>'responsavel_fornecedor_id', '')::uuid ELSE q.responsavel_fornecedor_id END;
  n_int   := COALESCE(p_patch->>'intencao', q.intencao);
  n_pago  := CASE WHEN p_patch ? 'pago_em' THEN NULLIF(p_patch->>'pago_em', '')::date ELSE q.pago_em END;
  n_decl  := CASE WHEN p_patch ? 'declarado_em' THEN NULLIF(p_patch->>'declarado_em', '')::date ELSE q.declarado_em END;
  n_cond  := CASE WHEN p_patch ? 'condicao' THEN NULLIF(btrim(COALESCE(p_patch->>'condicao', '')), '') ELSE q.condicao END;
  n_recibo := CASE WHEN p_patch ? 'pede_recibo' THEN COALESCE((p_patch->>'pede_recibo')::boolean, false) ELSE q.pede_recibo END;
  n_forma := CASE WHEN p_patch ? 'forma_pagamento_terceiro' THEN NULLIF(btrim(COALESCE(p_patch->>'forma_pagamento_terceiro', '')), '') ELSE q.forma_pagamento_terceiro END;
  IF n_tipo = 'nao_localizado' THEN n_forma := NULL; END IF;
  IF n_forma IS NOT NULL AND n_forma NOT IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento do terceiro inválida: %.', n_forma; END IF;
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo, forma_pagamento_terceiro = n_forma WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- a mudança pode extinguir a oferta ou desfazer a extinção
END
$function$;
CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k text; antes jsonb; depois jsonb; permitidas text[] := ARRAY['vigencia', 'teto_1', 'prazo_declaracao_dias', 'teto_anual_terceiro', 'qtd_relatadas_trimestre', 'prazo_formalizacao_dias', 'prazo_esclarecimento_dias', 'prazo_reembolso_dias', 'limite_capitalizacao', 'reembolso_teto_baixo', 'reembolso_teto_medio'];
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
    reembolso_teto_baixo = COALESCE((p_patch->>'reembolso_teto_baixo')::numeric, reembolso_teto_baixo),
    reembolso_teto_medio = COALESCE((p_patch->>'reembolso_teto_medio')::numeric, reembolso_teto_medio),
    atualizado_em = now(), atualizado_por = (SELECT auth.uid())
  WHERE id;
  SELECT to_jsonb(p) INTO depois FROM public.fin_quitacao_parametros p;
  INSERT INTO public.fin_quitacao_eventos (evento, de, para, motivo, por) VALUES ('parametros', antes, depois, btrim(p_motivo), (SELECT auth.uid()));
  PERFORM public.fin_quitacao_sincronizar_todas();      -- um novo teto, prazo ou limite pode mudar quais ofertas a prova sustenta
END
$function$;
CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text, p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text, p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE novo uuid; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; forn public.fin_fornecedores%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar uma nota quitada por terceiro.';
  END IF;
  IF p_responsavel NOT IN ('pessoa', 'empresa', 'entidade', 'nao_localizado') THEN RAISE EXCEPTION 'Informe quem pagou a nota (pessoa, empresa, entidade ou não localizado).'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor da nota.'; END IF;
  IF p_data IS NULL OR p_data > hoje THEN RAISE EXCEPTION 'A data da nota é obrigatória e não pode ser futura.'; END IF;
  IF p_conta IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta) THEN RAISE EXCEPTION 'Escolha a conta em que a obrigação ficará registrada (a oferta não mexe nela).'; END IF;
  SELECT * INTO forn FROM public.fin_fornecedores WHERE id = p_fornecedor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolha o fornecedor que emitiu a nota.'; END IF;
  IF p_chave IS NOT NULL AND btrim(p_chave) <> '' AND NOT public.fin_nfe_chave_valida(btrim(p_chave)) THEN RAISE EXCEPTION 'A chave de acesso da nota não confere (44 dígitos, só números, com o dígito verificador correto).'; END IF;
  IF p_documento_numero IS NOT NULL AND btrim(p_documento_numero) <> '' AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = p_fornecedor AND x.documento_numero = btrim(p_documento_numero) AND x.tipo::text = 'saida' AND abs(x.valor - p_valor) < 0.005) THEN
    RAISE EXCEPTION 'Já existe uma despesa deste fornecedor com a nota nº % e este valor: não se registra duas vezes a mesma nota.', btrim(p_documento_numero);
  END IF;

  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes)
  VALUES (p_conta, 'saida', 'previsto', p_data, p_valor, COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), 'Nota de ' || forn.nome), NULLIF(btrim(COALESCE(p_documento_numero, '')), ''), p_fornecedor, p_categoria, p_centro,
          NULLIF(btrim(COALESCE(p_chave, '')), ''), 'nf_quitada_por_terceiro', 'Registrada já quitada por terceiro (a nota o aplicativo ainda não tinha).')
  RETURNING id INTO novo;

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);
  RETURN novo;
END
$function$;
DROP FUNCTION IF EXISTS public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text);

-- ── 7) permissões ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_declaracao_conteudo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_gerar_declaracao_terceiro(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_declaracao_estado(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_registrar_assinatura_declaracao(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_declaracao_conteudo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_gerar_declaracao_terceiro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_declaracao_estado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_registrar_assinatura_declaracao(uuid, uuid, date) TO authenticated;
