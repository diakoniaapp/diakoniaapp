-- ─── Pagamentos inteligentes: tipo GUIA, leitura guardada no anexo e memória do que a tesouraria ensinou ───
--
-- Pedido dela (06/10/2026): ao anexar boleto, guia, DARF, FGTS, INSS ou fatura, o sistema LÊ o documento
-- (valor, vencimento, beneficiário, linha digitável, Pix), sugere fornecedor/categoria/centro e aprende com as
-- correções. O leitor (`lib/documentos/pagamento.ts`) e a sugestão (`sugestaoPagamento.ts`) já existem e rodam
-- sem esta migration; ela entrega as 3 peças que dependem do banco. O código JÁ cita este número
-- (finService.adicionarAnexo: "o banco ainda não aceita o tipo Guia — falta aplicar a migration 20261006160000").
--
-- 1) TIPO `guia` nos anexos. Guia de Recolhimento (ISS, IPTU, DARF, GPS, FGTS, taxas) não é boleto nem fatura.
--    Mesma técnica da migration 20261002200000 (aplicada, medido: há anexos rpa/rsp/dps): derruba o CHECK que cita
--    `tipo` — sem apostar no nome — e recria com a lista completa + `guia`. `documento` (antigo) continua aceito.
--
-- 2) `dados_extraidos jsonb` no anexo: o que o leitor achou (valor, vencimento, beneficiário, CNPJ, linha digitável,
--    Pix copia e cola, confiança) — só o que serve para PAGAR depois, não o texto inteiro (`dadosParaGuardar`).
--    Coluna nova e opcional: nenhum anexo existente muda.
--
-- 3) `fin_documento_conhecimento`: a memória. Uma linha por CHAVE de documento — CNPJ do beneficiário, convênio de
--    arrecadação, tipo de guia (ex.: `iss`, `irrf:1708`) ou nome normalizado do beneficiário — guardando o que a
--    tesouraria ESCOLHEU da última vez (fornecedor, categoria, centro, projeto) e quantas vezes (`usos`). A correção
--    vence a sugestão: ao salvar um lançamento feito a partir de um documento lido, a linha é regravada com a escolha
--    dela. Por que uma tabela e não só o "padrão do fornecedor": guias (DARF, FGTS, DARM) não têm fornecedor
--    cadastrado, e o mesmo fornecedor pode cair em categorias diferentes conforme o documento.
--    Dado de operação financeira, sem dado pessoal: permissão = a de todas as tabelas fin_* (admin, diakonia,
--    secretaria, tesouraria).
--
-- Aditiva e repetível (IF NOT EXISTS / DROP IF EXISTS): rodar duas vezes dá o mesmo resultado.
-- A tela funciona sem esta migration: o leitor lê e sugere; só não grava a leitura nem aprende, e avisa.

-- ── 1) tipo guia ─────────────────────────────────────────────────────────────
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
    'nota_fiscal', 'boleto', 'guia', 'comprovante', 'fatura', 'contrato',
    'xml', 'rpa', 'rsp', 'dps', 'outro',
    'documento'   -- antigo: aceito, não mais oferecido pela tela
  ));

-- ── 2) leitura guardada no anexo ─────────────────────────────────────────────
ALTER TABLE public.fin_lancamento_anexos
  ADD COLUMN IF NOT EXISTS dados_extraidos jsonb;

COMMENT ON COLUMN public.fin_lancamento_anexos.dados_extraidos IS
  'Leitura do documento de pagamento (boleto/guia/fatura/Pix): valor, vencimento, beneficiário, CNPJ, linha digitável, Pix copia e cola, confiança. Só o que serve para pagar depois; nunca o texto inteiro.';

-- ── 3) a memória do que a tesouraria ensinou ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_documento_conhecimento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_tipo      text NOT NULL CHECK (chave_tipo IN ('cnpj', 'convenio', 'guia', 'beneficiario')),
  chave           text NOT NULL CHECK (length(btrim(chave)) > 0),
  fornecedor_id   uuid REFERENCES public.fin_fornecedores(id)  ON DELETE SET NULL,
  categoria_id    uuid REFERENCES public.fin_categorias(id)    ON DELETE SET NULL,
  centro_custo_id uuid REFERENCES public.fin_centros_custo(id) ON DELETE SET NULL,
  projeto_id      uuid REFERENCES public.fin_projetos(id)      ON DELETE SET NULL,
  usos            int  NOT NULL DEFAULT 1 CHECK (usos >= 1),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (chave_tipo, chave)
);

ALTER TABLE public.fin_documento_conhecimento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_documento_conhecimento_equipe ON public.fin_documento_conhecimento;
CREATE POLICY fin_documento_conhecimento_equipe ON public.fin_documento_conhecimento
  AS PERMISSIVE FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));

COMMENT ON TABLE public.fin_documento_conhecimento IS
  'O que a tesouraria escolheu da última vez para um documento de pagamento, por CNPJ / convênio / tipo de guia / beneficiário. Alimenta a sugestão de fornecedor, categoria e centro; a correção dela sobrescreve.';
