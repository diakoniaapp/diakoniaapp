-- ENSAIO — aposentar o estado "aguardando_aprovacao". NADA FICA GRAVADO: o bloco termina de propósito com
-- um erro ("RESULTADO DO ENSAIO ..."), e o erro desfaz tudo. O que importa é a mensagem: cole-a de volta.
-- (Um único comando: o editor do Supabase não mantém tabela temporária entre comandos.)
DO $ens$
DECLARE
  rel text := ''; ok boolean := true;
  antes bigint; aguardando bigint; id1 uuid; falhou boolean := false; msg text; st text; depois bigint;
BEGIN
  SELECT count(*) INTO antes FROM public.fin_lancamentos;
  SELECT count(*) INTO aguardando FROM public.fin_lancamentos WHERE status::text = 'aguardando_aprovacao';
  IF aguardando = 0 THEN rel := rel || ' 0 ok (nenhum lançamento "aguardando" hoje).';
  ELSE ok := false; rel := rel || ' FALHOU 0: há ' || aguardando || ' lançamento(s) "aguardando".'; END IF;

  -- o corpo da migration
  ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS fin_lancamentos_sem_aprovacao_legada;
  ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_sem_aprovacao_legada CHECK (status::text <> 'aguardando_aprovacao');
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_sem_aprovacao_legada') THEN rel := rel || ' 1 ok (restrição criada).';
  ELSE ok := false; rel := rel || ' FALHOU 1: restrição não criada.'; END IF;

  -- tentar gravar "aguardando" tem de ser recusado
  SELECT id INTO id1 FROM public.fin_lancamentos WHERE status::text = 'previsto' AND tipo::text = 'saida' LIMIT 1;
  BEGIN
    UPDATE public.fin_lancamentos SET status = 'aguardando_aprovacao' WHERE id = id1;
  EXCEPTION WHEN check_violation THEN falhou := true; msg := SQLERRM;
  END;
  IF falhou THEN rel := rel || ' 2 ok (gravar "aguardando" foi recusado).';
  ELSE ok := false; rel := rel || ' FALHOU 2: o banco aceitou gravar "aguardando".'; END IF;

  -- os estados de verdade continuam gravando
  UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = id1;
  SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = id1;
  IF st = 'previsto' THEN rel := rel || ' 3 ok (os outros estados seguem valendo).';
  ELSE ok := false; rel := rel || ' FALHOU 3: estado ' || coalesce(st, 'nulo') || '.'; END IF;

  -- nada mudou nos dados
  SELECT count(*) INTO depois FROM public.fin_lancamentos;
  IF depois = antes THEN rel := rel || ' 4 ok (' || antes || ' lançamentos, nenhum criado ou apagado).';
  ELSE ok := false; rel := rel || ' FALHOU 4: ' || antes || ' antes, ' || depois || ' depois.'; END IF;

  RAISE EXCEPTION 'RESULTADO DO ENSAIO (nada foi gravado): %', CASE WHEN ok THEN 'TUDO OK.' ELSE 'HÁ FALHAS.' END || rel;
END
$ens$;
