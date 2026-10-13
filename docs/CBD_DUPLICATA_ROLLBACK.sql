-- DESFAZER a correção da CBD duplicada: tira a marca do banco da CBD verdadeira e recria a despesa que veio do extrato a partir do backup (o gatilho reabre o vínculo dela).
-- Pode rodar mais de uma vez. Detalhe: a linha recriada ganha de novo o id de obrigação próprio (o gatilho das linhas novas).
DO $rb$
DECLARE
  manter constant uuid := 'b97e3f51-415d-4d19-a66e-f4432aa130a7';     -- a CBD de 30/09 (recorrência, liquidada, com o boleto): fica
  sobra constant uuid := 'f9be2e2e-7013-4058-b36e-f005dd004be5';      -- a mesma CBD criada hoje às 10:03 como "nova" pela tela antiga: sai
  marca constant text := '[ofx:N11A51]'; n bigint;
  lote_nome constant text := 'cbd-duplicata-20261013';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE EXCEPTION 'Não há backup deste lote: nada a desfazer.'; END IF;
  UPDATE public.fin_lancamentos SET observacoes = NULL WHERE id = manter AND observacoes = marca;
  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  RAISE NOTICE 'Correção desfeita a partir do lote %.', lote_nome;
END
$rb$;
