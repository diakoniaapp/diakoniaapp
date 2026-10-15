-- ROLLBACK dos documentos do fechamento. As tabelas e o bucket SÓ saem se estiverem vazios (um documento anexado é prova: não se perde sem querer).
DO $rb$
DECLARE n bigint := 0; m bigint := 0;
BEGIN
  IF to_regclass('public.fin_fechamento_documentos') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.fin_fechamento_documentos' INTO n; END IF;
  IF to_regclass('public.fin_fechamento_docs_dispensas') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.fin_fechamento_docs_dispensas' INTO m; END IF;
  IF n + m > 0 THEN
    RAISE EXCEPTION 'Há documentos ou dispensas registrados: as tabelas foram mantidas (são prova). Exporte e apague à mão se for mesmo desfazer.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'fin-fechamento-docs') THEN
    RAISE EXCEPTION 'Há arquivos no bucket fin-fechamento-docs: foi mantido.';
  END IF;
  DROP TABLE IF EXISTS public.fin_fechamento_docs_dispensas;
  DROP TABLE IF EXISTS public.fin_fechamento_documentos;
  DELETE FROM storage.buckets WHERE id = 'fin-fechamento-docs';
END
$rb$;
DROP POLICY IF EXISTS fin_fechamento_docs_storage_ler ON storage.objects;
DROP POLICY IF EXISTS fin_fechamento_docs_storage_enviar ON storage.objects;
DROP POLICY IF EXISTS fin_fechamento_docs_storage_apagar ON storage.objects;
DROP FUNCTION IF EXISTS public.fin_fechamento_docs_dispensas_trilha();
DROP FUNCTION IF EXISTS public.fin_fechamento_documentos_trilha();
