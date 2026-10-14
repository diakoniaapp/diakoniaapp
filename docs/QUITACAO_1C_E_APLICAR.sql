-- APLICAÇÃO DEFINITIVA da Fase 1C-e (CANCELADA como desfecho próprio e FERRAMENTAS de regularização) — só depois do "pode aplicar" dela. PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- GRAVA: o tipo de anexo "prova_cancelamento", 3 eventos novos no histórico, 3 funções (cancelar, desfazer cancelamento, regularizar "Oferta de NF" — esta SÓ roda quando o Administrador a chamar), 2 visões
-- (canceladas; candidatas à regularização, SOMENTE LEITURA) e 1 tabela de backup (vazia). NENHUM lançamento existente é alterado e NENHUM caso real é regularizado.
-- Idêntico a supabase/migrations/20261015130000. Pode rodar mais de uma vez. Para desfazer: docs/QUITACAO_1C_E_ROLLBACK.sql.
-- Antes de rodar: rode docs/QUITACAO_1C_E_ENSAIO.sql e confira "TUDO OK, pode aplicar".
-- TRAVA DE PRÉ-REQUISITOS: se faltar alguma fase anterior, este arquivo para aqui, com a mensagem do que aplicar antes, e NÃO grava nada.
DO $pre$ BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1A antes desta: rode docs/QUITACAO_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1B antes desta: rode docs/QUITACAO_1B_M0_APLICAR.sql (sozinho) e depois docs/QUITACAO_1B_APLICAR.sql.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'Falta aplicar a Fase 1C-a antes desta: rode docs/QUITACAO_1C_A_APLICAR.sql.'; END IF;
END $pre$;

-- ─── Fase 1C-e: CANCELADA como desfecho próprio e as FERRAMENTAS de regularização histórica (nada é regularizado aqui) ──────────────────────────────────────────
-- Depende da 1A, do M0, da 1B e da 1C-a (aplicadas ANTES). Nenhum dado existente é alterado.
--
-- 1. CANCELADA (aprovado em 13/10/2026): uma nota cancelada com o emitente NÃO é "quitada" e NÃO é "não localizada": é um desfecho próprio, que exige PROVA (o documento do cancelamento, tipo de anexo novo
--    `prova_cancelamento`). `fin_cancelar_obrigacao` só cancela despesa em aberto, sem quitação (R6: quem quer cancelar uma nota já extinta por oferta remove a quitação antes, com motivo), sem pagamento e
--    não enviada, e só com a prova anexada. Desfazer é possível (`fin_desfazer_cancelamento`), com motivo. Tudo no histórico (usuário, data e hora). Usa o status `cancelado` que já existia: não nasce status novo.
--    `vw_fin_canceladas` lista as canceladas formalmente.
-- 2. FERRAMENTAS de regularização (aprovado como FERRAMENTA, NÃO como decisão): o padrão "entrada Oferta de NF + transferência + saída real" é três lançamentos para um fato que nunca moveu dinheiro da igreja.
--    · `vw_fin_oferta_de_nf_candidatas` só LÊ: mostra cada entrada "Oferta de NF" e as saídas candidatas, marcadas A ESCLARECER (a documentação ainda não foi validada por ela);
--    · `fin_regularizar_oferta_de_nf` (SÓ Administrador, tudo ou nada) refaz UM caso: guarda tudo em `fin_quitacao_regularizacoes` (reversível), remove a entrada e as duas pernas da transferência, devolve a
--      saída a obrigação em aberto e registra a quitação de oferta. O SALDO DE CADA CONTA FICA IDÊNTICO (entrada +X e transferência −X na origem; transferência +X e saída −X no destino: tudo se anula) —
--      o ensaio prova. NENHUM caso real é regularizado por esta migration: a função só roda quando o Administrador a chamar, depois de validar os documentos.
-- Reversível: docs/QUITACAO_1C_E_ROLLBACK.sql.

-- ── 1) os novos tipos e eventos ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_lancamento_anexos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%' LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_lancamento_anexos ADD CONSTRAINT fin_lancamento_anexos_tipo_check CHECK (tipo IN (
    'nota_fiscal', 'boleto', 'guia', 'comprovante', 'fatura', 'contrato',
    'xml', 'rpa', 'rsp', 'dps', 'outro',
    'documento',
    'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro',
    'prova_cancelamento'));                                                           -- o documento do cancelamento da nota com o emitente
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta'));
END $$;

-- ── 2) cancelar com prova ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_cancelar_obrigacao(p_obrigacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para cancelar uma nota.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'Só uma despesa (saída) se cancela.'; END IF;
  IF COALESCE(l.obrigacao_id, l.id) <> l.id THEN RAISE EXCEPTION 'Cancele a obrigação principal, não uma das suas parcelas.'; END IF;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'Esta despesa não está em aberto (situação: %). Só se cancela a nota que ainda não foi paga nem extinta.', l.status; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = l.id) THEN
    RAISE EXCEPTION 'Esta despesa tem uma quitação registrada (quem pagou). Remova a quitação, com motivo, antes de cancelar a nota: cancelada não é quitada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id AND x.id <> l.id AND x.status::text IN ('realizado', 'conciliado', 'quitado_terceiro')) THEN
    RAISE EXCEPTION 'Esta obrigação já teve pagamento: não se cancela.';
  END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: reabra-a antes de cancelar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id WHERE COALESCE(x.obrigacao_id, x.id) = l.id AND a.tipo = 'prova_cancelamento') THEN
    RAISE EXCEPTION 'Sem a prova do cancelamento não há cancelamento: anexe o documento (tipo "Prova de cancelamento") e tente de novo. Sem prova suficiente, a nota continua A esclarecer.';
  END IF;
  UPDATE public.fin_lancamentos SET status = 'cancelado' WHERE id = l.id;
  INSERT INTO public.fin_quitacao_eventos (obrigacao_id, evento, motivo, por) VALUES (l.id, 'cancelada', btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;

CREATE OR REPLACE FUNCTION public.fin_desfazer_cancelamento(p_obrigacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para desfazer o cancelamento.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND OR l.status::text <> 'cancelado' THEN RAISE EXCEPTION 'Esta despesa não está cancelada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento = 'cancelada') THEN
    RAISE EXCEPTION 'Esta despesa foi cancelada fora da Política (sem prova registrada): reative-a pela tela de lançamentos.';
  END IF;
  UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = l.id;
  INSERT INTO public.fin_quitacao_eventos (obrigacao_id, evento, motivo, por) VALUES (l.id, 'cancelamento_desfeito', btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;

CREATE OR REPLACE VIEW public.vw_fin_canceladas WITH (security_invoker = true) AS
SELECT l.id AS obrigacao_id, l.data, l.valor, l.descricao, l.fornecedor_id, l.documento_numero,
       c.em AS cancelada_em, c.por AS cancelada_por, c.motivo,
       EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id WHERE COALESCE(x.obrigacao_id, x.id) = l.id AND a.tipo = 'prova_cancelamento') AS tem_prova
  FROM public.fin_lancamentos l
  JOIN LATERAL (SELECT e.em, e.por, e.motivo FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento IN ('cancelada', 'cancelamento_desfeito') ORDER BY e.em DESC LIMIT 1) c ON true
  JOIN LATERAL (SELECT e.evento FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento IN ('cancelada', 'cancelamento_desfeito') ORDER BY e.em DESC LIMIT 1) u ON u.evento = 'cancelada'
 WHERE l.status::text = 'cancelado';
GRANT SELECT ON public.vw_fin_canceladas TO authenticated;
COMMENT ON VIEW public.vw_fin_canceladas IS 'Notas canceladas com o emitente pela Política (com a prova do cancelamento): desfecho próprio, nem quitada nem não localizada.';

-- ── 3) regularização histórica: só a ferramenta ───────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_quitacao_regularizacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote        uuid NOT NULL,                       -- uma regularização = um lote
  tabela      text NOT NULL,
  linha       jsonb NOT NULL,                      -- o lançamento como era, inteiro
  removido_em timestamptz NOT NULL DEFAULT now(),
  por         uuid
);
CREATE INDEX IF NOT EXISTS fin_quitacao_regularizacoes_lote_idx ON public.fin_quitacao_regularizacoes (lote);
ALTER TABLE public.fin_quitacao_regularizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_quitacao_regularizacoes_leitura ON public.fin_quitacao_regularizacoes;
CREATE POLICY fin_quitacao_regularizacoes_leitura ON public.fin_quitacao_regularizacoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
COMMENT ON TABLE public.fin_quitacao_regularizacoes IS 'Cópia integral do que a regularização de uma "Oferta de NF" removeu (a entrada e as duas pernas da transferência), por lote. Só as funções escrevem.';

-- só LÊ: o que parece "Oferta de NF" no histórico e as saídas candidatas. Nada é decidido: situacao é sempre "a_esclarecer" até a documentação ser validada.
CREATE OR REPLACE VIEW public.vw_fin_oferta_de_nf_candidatas WITH (security_invoker = true) AS
SELECT e.id AS entrada_id, e.data AS data_entrada, e.valor, e.status::text AS status_entrada, e.descricao AS descricao_entrada, e.observacoes AS observacoes_entrada, ce.nome AS conta_entrada,
       s.id AS saida_id, s.data AS data_saida, s.status::text AS status_saida, cs.nome AS conta_saida, f.nome AS fornecedor_saida, s.documento_numero AS nota_saida,
       (SELECT count(*) FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = e.valor AND p.tipo::text = 'saida' AND p.conta_id = e.conta_id AND abs(p.data - e.data) <= 20) AS pernas_de_saida,
       (SELECT count(*) FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = e.valor AND p.tipo::text = 'entrada' AND p.conta_id = s.conta_id AND abs(p.data - s.data) <= 20) AS pernas_de_entrada,
       'a_esclarecer'::text AS situacao
  FROM public.fin_lancamentos e
  JOIN public.fin_contas ce ON ce.id = e.conta_id
  LEFT JOIN public.fin_lancamentos s ON s.tipo::text = 'saida' AND s.valor = e.valor AND abs(s.data - e.data) <= 20 AND s.id <> e.id AND s.origem IS DISTINCT FROM 'transferencia'
  LEFT JOIN public.fin_contas cs ON cs.id = s.conta_id
  LEFT JOIN public.fin_fornecedores f ON f.id = s.fornecedor_id
 WHERE e.tipo::text = 'entrada' AND e.descricao ~* 'oferta de nf|oferta nf|nf ofertada';
GRANT SELECT ON public.vw_fin_oferta_de_nf_candidatas TO authenticated;

CREATE OR REPLACE FUNCTION public.fin_regularizar_oferta_de_nf(
  p_entrada uuid, p_saida uuid, p_responsavel_tipo text, p_pessoa uuid, p_fornecedor uuid, p_pago_em date, p_declarado_em date,
  p_natureza_item text, p_comprador text, p_motivo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ent public.fin_lancamentos%ROWTYPE; sai public.fin_lancamentos%ROWTYPE; p_out public.fin_lancamentos%ROWTYPE; p_in public.fin_lancamentos%ROWTYPE;
        lote uuid := gen_random_uuid(); q uuid; uid uuid := (SELECT auth.uid()); n int;
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'Só o Administrador regulariza o histórico.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 10 THEN RAISE EXCEPTION 'Informe o motivo da regularização, com a referência dos documentos validados (pelo menos 10 caracteres).'; END IF;
  IF p_responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Informe quem pagou a nota (pessoa, empresa ou entidade). Sem saber, a nota fica A esclarecer: não se regulariza.'; END IF;

  SELECT * INTO ent FROM public.fin_lancamentos WHERE id = p_entrada FOR UPDATE;
  SELECT * INTO sai FROM public.fin_lancamentos WHERE id = p_saida FOR UPDATE;
  IF ent.id IS NULL OR ent.tipo::text <> 'entrada' OR ent.status::text NOT IN ('realizado', 'conciliado') THEN RAISE EXCEPTION 'A entrada informada não existe ou não é uma entrada realizada.'; END IF;
  IF sai.id IS NULL OR sai.tipo::text <> 'saida' OR sai.status::text NOT IN ('realizado', 'conciliado') OR sai.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'A saída informada não existe ou não é uma saída realizada.'; END IF;
  IF ent.valor <> sai.valor THEN RAISE EXCEPTION 'A entrada (%) e a saída (%) têm valores diferentes: não é o padrão "Oferta de NF".', ent.valor, sai.valor; END IF;
  IF COALESCE(sai.obrigacao_id, sai.id) <> sai.id OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = sai.id AND x.id <> sai.id) THEN RAISE EXCEPTION 'A saída é parte de uma obrigação paga em parcelas: regularize à mão.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = sai.id) THEN RAISE EXCEPTION 'A saída já tem uma quitação registrada.'; END IF;
  IF ent.fechamento_id IS NOT NULL OR sai.fechamento_id IS NOT NULL THEN RAISE EXCEPTION 'Um dos lançamentos pertence a um período fechado: reabra o período antes.'; END IF;
  IF public.fin_despesa_enviada(sai.id) THEN RAISE EXCEPTION 'A saída já foi enviada à contabilidade: reabra-a antes.'; END IF;

  SELECT count(*) INTO n FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'saida' AND p.conta_id = ent.conta_id AND abs(p.data - ent.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF n <> 1 THEN RAISE EXCEPTION 'Não identifiquei UMA perna de saída da transferência na conta da entrada (achei %): regularize à mão.', n; END IF;
  SELECT * INTO p_out FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'saida' AND p.conta_id = ent.conta_id AND abs(p.data - ent.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  SELECT count(*) INTO n FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'entrada' AND p.conta_id = sai.conta_id AND abs(p.data - sai.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF n <> 1 THEN RAISE EXCEPTION 'Não identifiquei UMA perna de entrada da transferência na conta da saída (achei %): regularize à mão.', n; END IF;
  SELECT * INTO p_in FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'entrada' AND p.conta_id = sai.conta_id AND abs(p.data - sai.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF p_out.fechamento_id IS NOT NULL OR p_in.fechamento_id IS NOT NULL THEN RAISE EXCEPTION 'Uma das pernas da transferência pertence a um período fechado: reabra o período antes.'; END IF;
  -- a entrada, as duas pernas e a saída têm de fechar o círculo: a saída sai da conta onde a transferência entrou
  IF p_out.conta_id = p_in.conta_id THEN RAISE EXCEPTION 'As pernas da transferência estão na mesma conta: não é o padrão esperado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.desfeito_em IS NULL AND v.lancamento_id IN (ent.id, sai.id, p_out.id, p_in.id)) THEN
    RAISE EXCEPTION 'Algum dos lançamentos está vinculado a uma linha de extrato bancário: desfaça o vínculo antes (a regularização não mexe em conciliação).';
  END IF;

  -- 1) guarda tudo (reversível), 2) remove a entrada e as duas pernas, 3) devolve a saída a obrigação em aberto, 4) registra a quitação de oferta
  INSERT INTO public.fin_quitacao_regularizacoes (lote, tabela, linha, por)
  VALUES (lote, 'entrada', to_jsonb(ent), uid), (lote, 'perna_saida', to_jsonb(p_out), uid), (lote, 'perna_entrada', to_jsonb(p_in), uid), (lote, 'saida_antes', to_jsonb(sai), uid);
  DELETE FROM public.fin_lancamentos WHERE id IN (ent.id, p_out.id, p_in.id);
  UPDATE public.fin_lancamentos SET status = 'previsto', data_pagamento = NULL, conferido_em = NULL, conferido_por = NULL,
         observacoes = trim(both E'\n' from COALESCE(observacoes, '') || E'\n[Regularizada como oferta de NF — lote ' || lote::text || ']')
   WHERE id = sai.id;
  q := public.fin_registrar_quitacao(sai.id, p_responsavel_tipo, p_pessoa, p_fornecedor, 'oferta', p_pago_em, p_declarado_em, p_natureza_item, p_comprador, NULL, false, p_motivo);
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, motivo, por)
  VALUES (q, sai.id, 'regularizada_oferta', jsonb_build_object('lote', lote, 'entrada', ent.id, 'perna_saida', p_out.id, 'perna_entrada', p_in.id, 'valor', ent.valor), btrim(p_motivo), uid);
  RETURN q;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_cancelar_obrigacao(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_desfazer_cancelamento(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_regularizar_oferta_de_nf(uuid, uuid, text, uuid, uuid, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_cancelar_obrigacao(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_desfazer_cancelamento(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_regularizar_oferta_de_nf(uuid, uuid, text, uuid, uuid, date, date, text, text, text) TO authenticated;

