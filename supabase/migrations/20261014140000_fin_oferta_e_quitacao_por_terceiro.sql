-- ─── Fase 1B (2/3): a OFERTA — a obrigação extinta por um terceiro, sem caixa, sem banco, sem extrato — e o "registrar NF já quitada por terceiro" ───────────
-- Depende de 20261014100000/110000/120000 (Fase 1A, aplicada) e de 20261014130000 (o valor `quitado_terceiro` do enum, aplicado ANTES, em separado). Nenhum dado existente é alterado.
--
-- A regra (Política, seção 6; Adendo): NF no CNPJ da igreja + Responsável = Pessoa, Empresa ou Entidade + Intenção = Oferta + prova suficiente pela Matriz ⇒ a obrigação se EXTINGUE.
-- A extinção NÃO cria lançamento, NÃO cria conta, NÃO mexe em saldo, NÃO gera liquidação nem vínculo bancário: só o status do lançamento da própria obrigação vira `quitado_terceiro`.
-- É o que o sistema DEDUZ — ninguém "marca": `fin_quitacao_sincronizar` põe e tira o status conforme a Matriz diz que a prova basta, e roda sozinha quando muda a quitação, um anexo,
-- uma decisão do Administrador ou um parâmetro. O que a Tesouraria faz é só registrar quem pagou, a intenção e anexar as provas.
--
-- O que esta migration faz:
--   1. o histórico ganha dois eventos: `extinta_por_oferta` e `extincao_desfeita` (quem, quando e por quê — usuário, data e hora);
--   2. `fin_quitacao_sincronizar` (uma obrigação) e `fin_quitacao_sincronizar_todas` (todas; a Mesa a chama ao abrir, porque a "formalização vencida" é um fato do TEMPO);
--   3. GUARDA de integridade: `quitado_terceiro` só entra e sai pelo sincronizador; ele nunca vira `realizado`/`conciliado` (é isso que impede o botão "Conferir" de colocar a oferta no saldo);
--   4. o congelamento da Enviada (D6) passa a tratar `quitado_terceiro` como "situação paga": uma oferta enviada ao malote não regride;
--   5. as funções de registrar, alterar, remover e decidir passam a sincronizar (e a aceitar a despesa já quitada por oferta, desde que NÃO enviada); alterar parâmetros sincroniza tudo;
--   6. um gatilho nos anexos: anexar ou remover a declaração, a prova do pagamento ou a nota sincroniza a oferta (a prova Formal extingue; sem ela, o Relatado só vale no nível Baixo);
--   7. `fin_registrar_nf_quitada_por_terceiro`: cria a obrigação (a NF) E a quitação na MESMA operação — para as notas que o escritório conhece e o aplicativo nunca teve (as 17 NFs);
--   8. `vw_fin_quitacao_dessincronizadas`: o que está com o status diferente do que a Matriz manda (a rede de segurança).
-- Reversível: docs/QUITACAO_1B_ROLLBACK.sql.

-- ── 1) o histórico ganha os eventos da extinção ──────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita'));
END $$;

-- ── 2) o sincronizador ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Devolve true quando a obrigação ficou (ou já estava) extinta por oferta. Não toca despesa Enviada (congelada: só a reabertura mexe) nem despesa já paga pela igreja.
CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar(p_obrigacao uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; qid uuid; inten text; deve boolean := false; a jsonb;
BEGIN
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND OR l.tipo::text <> 'saida' THEN RETURN false; END IF;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RETURN false; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RETURN l.status::text = 'quitado_terceiro'; END IF;
  SELECT q.id, q.intencao INTO qid, inten FROM public.fin_quitacoes q WHERE q.obrigacao_id = l.id;
  IF FOUND AND inten = 'oferta' THEN
    a := public.fin_quitacao_avaliar(public.fin_quitacao_entrada(qid));
    deve := COALESCE((a->>'suficiente')::boolean, false);
  END IF;
  IF deve AND l.status::text = 'previsto' THEN
    PERFORM set_config('qibrj.sync', 'on', true);
    UPDATE public.fin_lancamentos SET status = 'quitado_terceiro' WHERE id = l.id;
    PERFORM set_config('qibrj.sync', '', true);
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, motivo, por)
    VALUES (qid, l.id, 'extinta_por_oferta', jsonb_build_object('nivel', a->>'nivel', 'grau_conjunto', a->>'grau_conjunto'), 'A prova da oferta é suficiente: a obrigação se extingue, sem caixa e sem banco.', (SELECT auth.uid()));
    RETURN true;
  ELSIF NOT deve AND l.status::text = 'quitado_terceiro' THEN
    PERFORM set_config('qibrj.sync', 'on', true);
    UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = l.id;
    PERFORM set_config('qibrj.sync', '', true);
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, motivo, por)
    VALUES (qid, l.id, 'extincao_desfeita', CASE WHEN qid IS NULL THEN 'A quitação foi removida.' ELSE 'A prova deixou de ser suficiente (ou a intenção deixou de ser oferta).' END, (SELECT auth.uid()));
    RETURN false;
  END IF;
  RETURN deve;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar_todas() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record; mudou int := 0; antes text; depois text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RETURN 0; END IF;
  FOR r IN SELECT q.obrigacao_id AS id FROM public.fin_quitacoes q WHERE q.intencao = 'oferta'
           UNION SELECT l.id FROM public.fin_lancamentos l WHERE l.status::text = 'quitado_terceiro' LOOP
    SELECT status::text INTO antes FROM public.fin_lancamentos WHERE id = r.id;
    BEGIN
      PERFORM public.fin_quitacao_sincronizar(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Não consegui sincronizar a obrigação %: %', r.id, SQLERRM;   -- ex.: período fechado; fica visível em vw_fin_quitacao_dessincronizadas
    END;
    SELECT status::text INTO depois FROM public.fin_lancamentos WHERE id = r.id;
    IF antes IS DISTINCT FROM depois THEN mudou := mudou + 1; END IF;
  END LOOP;
  RETURN mudou;
END
$fn$;

-- ── 3) a guarda de integridade ───────────────────────────────────────────────────────────────────────────────────────────────────────────
-- `quitado_terceiro` só entra e sai pelo sincronizador (que liga qibrj.sync). Nunca vira realizado/conciliado: conferir uma oferta só carimba quem conferiu, não troca o status.
CREATE OR REPLACE FUNCTION public.fin_lanc_quitado_terceiro_integridade() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'O status "quitado por terceiro" só nasce de uma quitação do tipo oferta com prova suficiente: registre a quitação, não o lançamento.';
  END IF;
  IF NEW.status::text = OLD.status::text THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('qibrj.sync', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.status::text = 'quitado_terceiro' THEN
    RAISE EXCEPTION 'A obrigação só fica "quitada por terceiro" quando existe uma quitação do tipo oferta com prova suficiente: registre a quitação, não o status.';
  END IF;
  RAISE EXCEPTION 'Esta despesa foi quitada por um terceiro (oferta): o pagamento não passou pelo banco nem pelo caixa da igreja. Para mudar, corrija ou remova a quitação (com motivo). Conferir não troca o status.';
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_quitado_terceiro_novo ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitado_terceiro_novo BEFORE INSERT ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text = 'quitado_terceiro') EXECUTE FUNCTION public.fin_lanc_quitado_terceiro_integridade();
DROP TRIGGER IF EXISTS fin_lanc_quitado_terceiro_muda ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_quitado_terceiro_muda BEFORE UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.status::text = 'quitado_terceiro' OR NEW.status::text = 'quitado_terceiro') EXECUTE FUNCTION public.fin_lanc_quitado_terceiro_integridade();

-- ── 4) o congelamento da Enviada (D6) conhece o novo status ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE it record; campos text[] := '{}';
BEGIN
  SELECT i.ano, i.mes INTO it FROM public.fin_malote_itens i WHERE i.lancamento_id = OLD.id AND i.reaberto_em IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e não pode ser excluída. Para isso, um Administrador ou a Tesouraria precisa reabri-la, com motivo.', lpad(it.mes::text, 2, '0'), it.ano;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN campos := array_append(campos, 'valor'); END IF;
  IF OLD.data IS DISTINCT FROM NEW.data THEN campos := array_append(campos, 'data (vencimento)'); END IF;
  IF OLD.categoria_id IS DISTINCT FROM NEW.categoria_id THEN campos := array_append(campos, 'categoria'); END IF;
  IF OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id THEN campos := array_append(campos, 'centro de custo'); END IF;
  IF OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN campos := array_append(campos, 'favorecido'); END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN campos := array_append(campos, 'tipo'); END IF;
  IF OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro') THEN campos := array_append(campos, 'situação do pagamento'); END IF;
  IF array_length(campos, 1) IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e está congelada: não se altera %. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)',
    lpad(it.mes::text, 2, '0'), it.ano, array_to_string(campos, ', ');
END
$fn$;
DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();

-- ── 5) registrar, alterar, remover, decidir e parâmetros agora sincronizam ───────────────────────────────────────────────────────────────────
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
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- oferta com prova suficiente ⇒ a obrigação se extingue
  RETURN novo;
END
$fn$;

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
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- a mudança pode extinguir a oferta ou desfazer a extinção
END
$fn$;

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
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se remove mais. Para mudar algo, reabra a despesa.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: a quitação só se remove com a reabertura (Administrador ou Tesouraria, com motivo).'; END IF;
  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  DELETE FROM public.fin_quitacoes WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- sem quitação, a oferta deixa de estar extinta: a obrigação volta a ficar em aberto
END
$fn$;

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
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não há o que decidir.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: só a reabertura permite uma nova decisão.'; END IF;
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
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- aprovar o Relatado pode extinguir a oferta
END
$fn$;

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
  PERFORM public.fin_quitacao_sincronizar_todas();      -- um novo teto, prazo ou limite pode mudar quais ofertas a prova sustenta
END
$fn$;

-- ── 6) os anexos sincronizam a oferta ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Anexar a declaração, a prova do pagamento ou a nota (ou removê-las) muda o grau de prova, e com ele a suficiência. Uma falha aqui (ex.: período fechado) NUNCA impede o anexo:
-- fica o aviso, e a obrigação aparece em vw_fin_quitacao_dessincronizadas até alguém reabrir o período ou a Mesa sincronizar de novo.
CREATE OR REPLACE FUNCTION public.fin_anexo_sincroniza_quitacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE alvos uuid[] := '{}'; id_ uuid; raiz uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN alvos := alvos || NEW.lancamento_id; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN alvos := alvos || OLD.lancamento_id; END IF;
  FOREACH id_ IN ARRAY alvos LOOP
    SELECT COALESCE(l.obrigacao_id, l.id) INTO raiz FROM public.fin_lancamentos l WHERE l.id = id_;
    IF raiz IS NOT NULL AND (EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.intencao = 'oferta')
                             OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = raiz AND x.status::text = 'quitado_terceiro')) THEN
      BEGIN
        PERFORM public.fin_quitacao_sincronizar(raiz);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Anexo gravado, mas não consegui sincronizar a quitação da obrigação %: %', raiz, SQLERRM;
      END;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$fn$;
DROP TRIGGER IF EXISTS fin_anexo_quitacao ON public.fin_lancamento_anexos;
CREATE TRIGGER fin_anexo_quitacao AFTER INSERT OR DELETE OR UPDATE OF tipo, lancamento_id ON public.fin_lancamento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.fin_anexo_sincroniza_quitacao();

-- ── 7) registrar NF já quitada por terceiro (a nota nasce JUNTO com a quitação) ──────────────────────────────────────────────────────────────
-- Para a nota que o escritório conhece e o aplicativo nunca teve (as 17 NFs da auditoria). Cria a obrigação (a NF) e a quitação NA MESMA OPERAÇÃO: se qualquer parte falhar, nada é criado — não
-- fica uma conta "a pagar" ao fornecedor que um terceiro já pagou. A conta (`p_conta`) é só onde a obrigação mora: a oferta não mexe nela. Não cria entrada, transferência nem saída realizada.
CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(
  p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text,
  p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text,
  p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date,
  p_condicao text DEFAULT NULL, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo);
  RETURN novo;
END
$fn$;

-- ── 8) a rede de segurança ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Despesas cujo status diverge do que a Matriz manda (só pode acontecer se um sincronismo falhou, ex.: período fechado, ou se o tempo mudou a prova). A Mesa as sincroniza ao abrir.
CREATE OR REPLACE VIEW public.vw_fin_quitacao_dessincronizadas WITH (security_invoker = true) AS
SELECT q.quitacao_id, q.obrigacao_id, l.status::text AS status_atual,
       CASE WHEN q.intencao = 'oferta' AND q.suficiente THEN 'quitado_terceiro' ELSE 'previsto' END AS status_esperado
  FROM public.vw_fin_quitacao q
  JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
 WHERE l.status::text IN ('previsto', 'quitado_terceiro')
   AND NOT public.fin_despesa_enviada(l.id)
   AND l.status::text <> CASE WHEN q.intencao = 'oferta' AND q.suficiente THEN 'quitado_terceiro' ELSE 'previsto' END;
GRANT SELECT ON public.vw_fin_quitacao_dessincronizadas TO authenticated;

-- ── 9) permissões ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_todas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text) FROM PUBLIC, anon;
-- (a função de UMA obrigação é interna: só as outras funções e os gatilhos a chamam; o app chama a das todas)
GRANT EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_todas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text) TO authenticated;
