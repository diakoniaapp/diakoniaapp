-- ─── fin_lancamento_anexos — tipos de documento do Pacote Contábil ──────
--
-- Pedido dela (02/10/2026), ao especificar o Pacote Contábil mensal (ZIP
-- por Conta → dia do pagamento → fornecedor): os tipos passam a ser
-- Nota Fiscal, Boleto, Comprovante, Fatura, Contrato e Outro, mantendo o XML.
--
-- MEDIDO antes de mexer (02/10/2026): a tabela tem 2 linhas, as duas com
-- tipo `documento` (NF em PDF). Por isso `documento` FICA na lista aceita —
-- trocar a constraint sem ele reprovaria essas 2 linhas ao validar, e
-- reescrever o tipo delas seria mexer em dado dela sem pedido. A tela
-- deixa de OFERECER `documento`; o banco continua aceitando.
--
-- Não se sabe o nome da constraint em produção (a tabela veio da migration
-- 20260922140000 com CHECK em linha → nome padrão
-- `fin_lancamento_anexos_tipo_check`, mas isso não foi conferido ao vivo).
-- Em vez de apostar no nome, o bloco abaixo derruba qualquer CHECK da
-- tabela que cite `tipo` e recria com o nome conhecido. Repetível: rodar
-- duas vezes dá o mesmo resultado.
--
-- Alternativa descartada: coluna nova `categoria_documento` ao lado do
-- `tipo` — duas colunas para o mesmo conceito e nada a ganhar.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fin_lancamento_anexos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.fin_lancamento_anexos
  ADD CONSTRAINT fin_lancamento_anexos_tipo_check
  CHECK (tipo IN (
    'nota_fiscal', 'boleto', 'comprovante', 'fatura', 'contrato',
    'xml', 'outro',
    'documento'   -- antigo: aceito, não mais oferecido pela tela
  ));
