-- ─── fin_lancamento_anexos — anexo múltiplo por lançamento ──────────────
--
-- Fase 7 do roadmap Financeiro (docs/ROADMAP_FINANCEIRO_ERP.md), pedido
-- dela (22/09/2026, "Central Financeira Diakonia"): documento + XML +
-- comprovante juntos, tudo visualizável sem sair do sistema.
--
-- MEDIDO antes de construir: `fin_lancamentos.comprovante_url` já existe
-- e já funciona (upload, bucket `fin-comprovantes`, signed URL) — mas é
-- UM arquivo por lançamento. 0 de 179 lançamentos em produção têm esse
-- campo preenchido (medido em 22/09/2026): o campo está pronto, o hábito
-- nunca se formou, porque nada pede mais de um anexo por vez (a nota
-- fiscal em XML e a foto do comprovante do pagamento são dois arquivos
-- diferentes do MESMO lançamento).
--
-- Não substitui `comprovante_url` — essa coluna continua existindo e
-- funcionando para quem já a usa. Esta tabela é a extensão: N arquivos
-- por lançamento, cada um com seu tipo.
CREATE TABLE public.fin_lancamento_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id uuid NOT NULL REFERENCES public.fin_lancamentos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('documento', 'xml', 'comprovante', 'outro')),
  -- Caminho dentro do bucket `fin-comprovantes` (mesmo bucket de
  -- `comprovante_url` — mesma política de LGPD já estabelecida pra dado
  -- financeiro sensível, não uma nova).
  url text NOT NULL,
  nome text,
  enviado_por uuid REFERENCES public.profiles(id),
  enviado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fin_lancamento_anexos_lancamento_id_idx ON public.fin_lancamento_anexos(lancamento_id);

ALTER TABLE public.fin_lancamento_anexos ENABLE ROW LEVEL SECURITY;

-- Mesma malha de `fin_lancamentos`/`fin_fornecedores`/`fin_lancamento_rateio`
-- (conferido ao vivo via pg_policies em 22/09/2026: as três usam a mesma
-- função `has_any_role`, mesmos quatro papéis — ROLES_FINANCEIRO no front).
CREATE POLICY fin_lancamento_anexos_equipe ON public.fin_lancamento_anexos
  FOR ALL
  USING (has_any_role(auth.uid(), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria']::app_role[]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin', 'diakonia', 'secretaria', 'tesouraria']::app_role[]));

COMMENT ON TABLE public.fin_lancamento_anexos IS
  'Anexos de um lançamento financeiro (documento, XML de NF, comprovante de '
  'pagamento) — N por lançamento, mesmo bucket de storage de comprovante_url.';
