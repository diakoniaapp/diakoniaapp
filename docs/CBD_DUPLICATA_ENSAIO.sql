-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- Roda a correção da CBD duplicada CONTRA OS DADOS REAIS dentro de uma transação que será desfeita: confere que sai só a duplicada, que o vínculo da linha N11A51 passa para a CBD
-- verdadeira (e o antigo fica FECHADO), que a CBD verdadeira vira Conciliada (com vínculo), que o saldo sobe R$ 260,00 e que o ROLLBACK devolve tudo. Se divergir: FALHOU.
DO $ensaio$
DECLARE
  manter constant uuid := 'b97e3f51-415d-4d19-a66e-f4432aa130a7';     -- a CBD de 30/09 (recorrência, liquidada, com o boleto): fica
  sobra constant uuid := 'f9be2e2e-7013-4058-b36e-f005dd004be5';      -- a mesma CBD criada hoje às 10:03 como "nova" pela tela antiga: sai
  marca constant text := '[ofx:N11A51]'; n bigint;
  lote_nome constant text := 'cbd-duplicata-20261013';
  rel text := ''; ok boolean := true; total_antes bigint; total_depois bigint; saldo_antes numeric; saldo_depois numeric; conta uuid; est text; fechados bigint; ativos bigint; ag_antes bigint; ag_depois bigint;
BEGIN
  SELECT count(*) INTO total_antes FROM public.fin_lancamentos;
  SELECT conta_id INTO conta FROM public.fin_lancamentos WHERE id = manter;
  SELECT saldo_atual INTO saldo_antes FROM public.fin_contas WHERE id = conta;
  SELECT count(*) INTO ag_antes FROM public.vw_fin_ciclo WHERE estado = 'aguardando_conciliacao';
  rel := format('ANTES: %s lançamentos; saldo %s; %s despesas aguardando conciliação.', total_antes, saldo_antes, ag_antes);

  CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
    id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE id = sobra;
  IF n = 0 AND EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE NOTICE 'Correção já aplicada: nada a fazer.'; RETURN; END IF;
  -- guarda 1: a duplicada é exatamente a criada pelo OFX hoje: sem liquidação, sem anexo, sem filhas, só com a marca do banco e o lote
  SELECT count(*) INTO n FROM public.fin_lancamentos s
   WHERE s.id = sobra AND s.origem = 'importado_ofx' AND s.valor = 260 AND s.data = '2026-09-30' AND s.liquidacao_id IS NULL AND s.status = 'conciliado'
     AND s.observacoes = marca || ' [lote-ofx:mv6ozhcb]'
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> s.id AND (f.lancamento_pai_id = s.id OR f.obrigacao_id = s.id));
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTADO: a despesa criada pelo extrato mudou (ou não existe). Nada foi alterado.'; END IF;
  -- guarda 2: a original continua igual: mesma conta, mesmo valor/dia, liquidada, SEM marca do banco, e mesma classificação
  SELECT count(*) INTO n FROM public.fin_lancamentos m JOIN public.fin_lancamentos s ON s.id = sobra
   WHERE m.id = manter AND m.conta_id = s.conta_id AND m.valor = 260 AND m.data = '2026-09-30' AND m.liquidacao_id IS NOT NULL AND m.observacoes IS NULL
     AND m.categoria_id IS NOT DISTINCT FROM s.categoria_id AND m.centro_custo_id IS NOT DISTINCT FROM s.centro_custo_id AND m.fornecedor_id IS NOT DISTINCT FROM s.fornecedor_id;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTADO: a CBD original mudou (marca, valor, liquidação ou classificação). Nada foi alterado.'; END IF;

  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_lancamentos', to_jsonb(l) FROM public.fin_lancamentos l WHERE l.id = sobra;
  DELETE FROM public.fin_lancamentos WHERE id = sobra;                       -- o gatilho FECHA o vínculo (o histórico fica)
  UPDATE public.fin_lancamentos SET observacoes = marca WHERE id = manter;   -- o gatilho abre o vínculo da linha do banco com a CBD verdadeira
  SELECT count(*) INTO n FROM public.fin_extrato_vinculos WHERE fitid = 'N11A51' AND desfeito_em IS NULL AND lancamento_id = manter;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTADO: o vínculo não passou para a CBD original (a transação inteira é desfeita).'; END IF;

  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT saldo_atual INTO saldo_depois FROM public.fin_contas WHERE id = conta;
  SELECT estado INTO est FROM public.vw_fin_ciclo WHERE lancamento_id = manter;
  SELECT count(*) INTO fechados FROM public.fin_extrato_vinculos WHERE fitid = 'N11A51' AND desfeito_em IS NOT NULL;
  SELECT count(*) INTO ativos FROM public.fin_extrato_vinculos WHERE fitid = 'N11A51' AND desfeito_em IS NULL;
  SELECT count(*) INTO ag_depois FROM public.vw_fin_ciclo WHERE estado = 'aguardando_conciliacao';
  rel := rel || format(' DEPOIS: %s lançamentos (-%s); saldo %s (+%s); a CBD verdadeira está em "%s"; vínculos da linha N11A51: %s ativo e %s fechado; aguardando conciliação: %s.', total_depois, total_antes - total_depois, saldo_depois, saldo_depois - saldo_antes, est, ativos, fechados, ag_depois);
  IF total_antes - total_depois <> 1 THEN ok := false; rel := rel || ' FALHOU: não saiu exatamente 1 linha.'; END IF;
  IF saldo_depois - saldo_antes <> 260 THEN ok := false; rel := rel || ' FALHOU: o saldo não subiu R$ 260,00.'; END IF;
  IF est NOT IN ('conciliada', 'pronta_para_malote') THEN ok := false; rel := rel || ' FALHOU: a CBD verdadeira não ficou conciliada.'; END IF;
  IF ativos <> 1 OR fechados < 1 THEN ok := false; rel := rel || ' FALHOU: o vínculo não passou (1 ativo, o antigo fechado).'; END IF;
  IF ag_antes - ag_depois <> 1 THEN ok := false; rel := rel || ' FALHOU: o aguardando conciliação não caiu em 1.'; END IF;

  UPDATE public.fin_lancamentos SET observacoes = NULL WHERE id = manter AND observacoes = marca;
  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT saldo_atual INTO saldo_depois FROM public.fin_contas WHERE id = conta;
  IF total_depois <> total_antes OR saldo_depois <> saldo_antes OR NOT EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE id = sobra AND observacoes = marca || ' [lote-ofx:mv6ozhcb]')
     OR (SELECT observacoes FROM public.fin_lancamentos WHERE id = manter) IS NOT NULL
    THEN ok := false; rel := rel || ' FALHOU: o rollback não devolveu tudo como estava.'; ELSE rel := rel || ' O rollback devolve as duas despesas e o saldo como estavam.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
