-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela e do ensaio TUDO OK.
-- CORREÇÃO da CBD de 30/09 (R$ 260,00) duplicada: a tela antiga importou a linha do extrato como "nova" hoje às 10:03, ao lado da CBD verdadeira (recorrência, liquidada,
-- com o boleto). Guarda o backup da duplicada em fin_limpeza_backup, apaga SÓ ela (o vínculo dela é fechado, não apagado) e põe a marca do banco [ofx:N11A51] na CBD verdadeira
-- (o gatilho cria o vínculo): ela vira Conciliada. Se qualquer uma das duas mudou, aborta SEM alterar nada. Para desfazer: docs/CBD_DUPLICATA_ROLLBACK.sql.
CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
  id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)

DO $correcao$
DECLARE
  manter constant uuid := 'b97e3f51-415d-4d19-a66e-f4432aa130a7';     -- a CBD de 30/09 (recorrência, liquidada, com o boleto): fica
  sobra constant uuid := 'f9be2e2e-7013-4058-b36e-f005dd004be5';      -- a mesma CBD criada hoje às 10:03 como "nova" pela tela antiga: sai
  marca constant text := '[ofx:N11A51]'; n bigint;
  lote_nome constant text := 'cbd-duplicata-20261013';
BEGIN
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
  RAISE NOTICE 'Correção aplicada: a CBD duplicada saiu e a verdadeira está ligada ao extrato; backup no lote %.', lote_nome;
END
$correcao$;
