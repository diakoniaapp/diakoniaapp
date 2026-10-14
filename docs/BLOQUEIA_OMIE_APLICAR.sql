-- APLICAR - bloquear novas importacoes do Omie (aplicacao direta, sem ensaio em producao, por decisao dela em 14/10/2026).
-- Mesmo conteudo da migration 20261016100000_fin_bloqueia_importacao_omie.sql. Testada em Postgres local (15 verificacoes, TUDO OK).
-- Nao altera nenhum lancamento. Pode rodar duas vezes. Rollback: docs/BLOQUEIA_OMIE_ROLLBACK.sql.

CREATE OR REPLACE FUNCTION public.fin_bloqueia_importacao_omie() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_TABLE_NAME = 'fin_lancamentos' THEN
    -- UPDATE de uma linha que JÁ era do Omie, sem mudar a origem: segue valendo (é o histórico sendo editado)
    IF TG_OP = 'UPDATE' AND OLD.origem IS NOT DISTINCT FROM NEW.origem THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'A importação do Omie foi aposentada (14/10/2026): não se criam nem se marcam lançamentos como "importado_omie". O histórico já importado continua intacto. Para trazer movimento de uma conta, use o OFX (conta de banco), a fatura (cartão) ou o lançamento manual.';
  END IF;
  -- fin_import_arquivos
  RAISE EXCEPTION 'A importação do Omie foi aposentada (14/10/2026): não se registram novos arquivos do Omie. Para trazer movimento de uma conta, use o OFX (conta de banco), a fatura (cartão) ou o lançamento manual.';
END
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_bloqueia_omie ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_bloqueia_omie
  BEFORE INSERT OR UPDATE OF origem ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.origem = 'importado_omie')
  EXECUTE FUNCTION public.fin_bloqueia_importacao_omie();

DROP TRIGGER IF EXISTS fin_import_arquivos_bloqueia_omie ON public.fin_import_arquivos;
CREATE TRIGGER fin_import_arquivos_bloqueia_omie
  BEFORE INSERT ON public.fin_import_arquivos
  FOR EACH ROW WHEN (NEW.lote_tag LIKE 'omie-%')
  EXECUTE FUNCTION public.fin_bloqueia_importacao_omie();

COMMENT ON FUNCTION public.fin_bloqueia_importacao_omie() IS
  'Importador do Omie aposentado em 14/10/2026. Bloqueia inserir/rotular lançamento como importado_omie e registrar arquivo omie-*. O histórico (9.867 lançamentos) segue editável.';

-- conferencia: deve devolver 2 linhas (os dois gatilhos) e os totais abaixo
SELECT t.tgname AS gatilho, t.tgrelid::regclass AS tabela, t.tgenabled AS ativo,
       (SELECT count(*) FROM public.fin_lancamentos) AS lancamentos,
       (SELECT count(*) FROM public.fin_lancamentos WHERE origem = 'importado_omie') AS importado_omie
FROM pg_trigger t WHERE t.tgname IN ('fin_lanc_bloqueia_omie', 'fin_import_arquivos_bloqueia_omie') ORDER BY 1;
