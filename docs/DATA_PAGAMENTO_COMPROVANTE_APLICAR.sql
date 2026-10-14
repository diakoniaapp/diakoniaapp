-- ✅ APLICADA EM PRODUÇÃO em 14/10/2026. Ensaio antes: TUDO OK (13.940 lançamentos idênticos; D1–D6 ok).
-- APLICAÇÃO DEFINITIVA — data do pagamento lida do comprovante (auditoria da decisão). Só depois do "TUDO OK, pode aplicar" do ensaio
-- (docs/DATA_PAGAMENTO_COMPROVANTE_ENSAIO.sql). Idêntico a supabase/migrations/20261016130000. Pode rodar mais de uma vez. Para desfazer: docs/DATA_PAGAMENTO_COMPROVANTE_ROLLBACK.sql.
-- ─── A data do pagamento lida do COMPROVANTE: a sugestão e a decisão humana ficam registradas ───────────────────────────────────────
-- Pedido dela (14/10/2026): o "Pagar" gravava a data do registro (hoje), não a do Pix/TED — e o lançamento não batia com o extrato, o OFX,
-- o fechamento e o malote. Agora, com um comprovante, o aplicativo LÊ a data real e a SUGERE; quem decide é a pessoa. Esta tabela guarda,
-- de cada pagamento confirmado com comprovante lido: o que foi sugerido (data, hora, valor, banco, confiança), o que foi escolhido, por quem,
-- quando e — se a pessoa mudou a data — por quê. A data escolhida continua indo para fin_lancamentos.data_pagamento, como sempre.
--
-- O que muda (só nasce coisa nova; NENHUM lançamento é alterado, nenhuma função existente muda):
--   1. tabela fin_data_pagamento_decisoes — histórico só de INCLUSÃO (sem UPDATE/DELETE pela API). As regras da decisão são CHECK:
--      "usou a sugerida" ⇔ data escolhida = sugerida; "alterou" exige motivo; "sem sugestão" ⇔ o comprovante não deu data.
--   2. gatilho: quem decidiu e quando são do BANCO (auth.uid(), now()) — o aplicativo não consegue forjar.
-- Ensaio: docs/DATA_PAGAMENTO_COMPROVANTE_ENSAIO.sql. Reversível: docs/DATA_PAGAMENTO_COMPROVANTE_ROLLBACK.sql.

CREATE TABLE IF NOT EXISTS public.fin_data_pagamento_decisoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id     uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,  -- some se a despesa for excluída; o registro fica
  obrigacao_id      uuid,                                                           -- a identidade da despesa (sem FK: é história)
  liquidacao_id     uuid,
  arquivo_nome      text,
  fonte             text CHECK (fonte IN ('pdf_texto', 'ocr')),
  tipo_operacao     text,
  banco             text,
  e2e               text,
  data_sugerida     date,
  hora_sugerida     text CHECK (hora_sugerida ~ '^\d{2}:\d{2}$'),
  valor_encontrado  numeric(14,2),
  confianca         text CHECK (confianca IN ('alta', 'media', 'baixa')),
  avisos            text[] NOT NULL DEFAULT '{}',
  data_escolhida    date NOT NULL,
  decisao           text NOT NULL CHECK (decisao IN ('usou_sugerida', 'alterou', 'sem_sugestao')),
  motivo            text,
  decidido_por      uuid,
  decidido_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_dpd_sem_sugestao CHECK ((decisao = 'sem_sugestao') = (data_sugerida IS NULL)),
  CONSTRAINT fin_dpd_confianca    CHECK ((data_sugerida IS NULL) = (confianca IS NULL)),
  CONSTRAINT fin_dpd_usou         CHECK (decisao <> 'usou_sugerida' OR data_escolhida = data_sugerida),
  CONSTRAINT fin_dpd_alterou      CHECK (decisao <> 'alterou' OR (data_escolhida <> data_sugerida AND motivo IS NOT NULL AND btrim(motivo) <> ''))
);
CREATE INDEX IF NOT EXISTS fin_dpd_lancamento_idx ON public.fin_data_pagamento_decisoes (lancamento_id);
CREATE INDEX IF NOT EXISTS fin_dpd_obrigacao_idx ON public.fin_data_pagamento_decisoes (obrigacao_id);
COMMENT ON TABLE public.fin_data_pagamento_decisoes IS 'Data do pagamento lida do comprovante: o que o sistema sugeriu (data, hora, valor, banco, confiança) e o que a pessoa escolheu (e por quê, se mudou). Só inclusão.';

CREATE OR REPLACE FUNCTION public.fin_dpd_carimbo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'   -- lê fin_lancamentos para achar a obrigação, independente da permissão de quem grava
AS $fn$
BEGIN
  NEW.decidido_por := (SELECT auth.uid());   -- quem e quando são do banco, não do aplicativo
  NEW.decidido_em := now();
  IF NEW.lancamento_id IS NOT NULL AND NEW.obrigacao_id IS NULL THEN
    NEW.obrigacao_id := (SELECT COALESCE(obrigacao_id, id) FROM public.fin_lancamentos WHERE id = NEW.lancamento_id);
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_dpd_carimbo ON public.fin_data_pagamento_decisoes;
CREATE TRIGGER fin_dpd_carimbo BEFORE INSERT ON public.fin_data_pagamento_decisoes FOR EACH ROW EXECUTE FUNCTION public.fin_dpd_carimbo();

ALTER TABLE public.fin_data_pagamento_decisoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_dpd_leitura ON public.fin_data_pagamento_decisoes;
CREATE POLICY fin_dpd_leitura ON public.fin_data_pagamento_decisoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_dpd_inclusao ON public.fin_data_pagamento_decisoes;
CREATE POLICY fin_dpd_inclusao ON public.fin_data_pagamento_decisoes FOR INSERT TO authenticated
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de UPDATE/DELETE: o histórico não muda pela API
REVOKE ALL ON public.fin_data_pagamento_decisoes FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.fin_data_pagamento_decisoes FROM authenticated;
GRANT SELECT, INSERT ON public.fin_data_pagamento_decisoes TO authenticated;

NOTIFY pgrst, 'reload schema';
