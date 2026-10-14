-- Impede NOVAS importações do Omie (decisão da Tesouraria, 14/10/2026: importador aposentado no aplicativo, commit 1a30447).
--
-- O motivo: o Omie foi só uma carga de histórico (142 planilhas, 15 a 30/09/2026). O código que importava saiu do aplicativo; esta
-- trava garante, no banco, que nenhuma tela antiga em cache, script ou conexão direta traga outra carga ou rotule um lançamento como
-- "importado_omie" por engano.
--
-- O que NÃO muda: os 9.867 lançamentos com origem 'importado_omie' (e as 379 pernas de transferência com a marca no texto) continuam
-- exatamente como estão e continuam editáveis — a `vw_fin_ciclo` lê `origem = 'importado_omie'` para a "Conferida (Histórico)".
--
-- Por que GATILHO e não CHECK: `origem` é texto livre, e um CHECK (mesmo NOT VALID) é exigido de novo em todo UPDATE da linha, o que
-- bloquearia editar categoria, centro ou observação de qualquer um dos 9.867 lançamentos antigos. O gatilho olha só a ENTRADA do
-- valor: bloqueia inserir `importado_omie`, bloqueia TROCAR a origem de outra para `importado_omie`, e deixa passar o UPDATE de uma
-- linha que já era `importado_omie` (a origem não muda).
--
-- Duas camadas: `fin_lancamentos` (a origem) e `fin_import_arquivos` (o registro do arquivo, gravado ANTES dos lançamentos por qualquer
-- importação; lote_tag começa com 'omie-'; a importação de fatura usa 'fatura-' e segue livre).
--
-- Alternativa descartada: bloquear pela marca '[lote:omie-' em `observacoes` — um lançamento novo pode legitimamente copiar o texto de
-- um antigo, e a marca sozinha não prova importação.
-- Rollback: docs/BLOQUEIA_OMIE_ROLLBACK.sql.

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
