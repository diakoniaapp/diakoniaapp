-- ─── (1) a CONTA da despesa pode ser corrigida, MEDIANTE AUDITORIA; (2) a liquidação feita pelo extrato passa a deixar o VÍNCULO na despesa ──────────────────
-- Decisão dela (13/10/2026), sobre o congelamento da despesa Enviada: a conta bancária é atributo OPERACIONAL e pode precisar de correção posterior — não congela.
-- Mas toda troca de conta é registrada: usuário, data/hora, conta anterior e conta nova (e se a despesa estava Enviada naquele momento).
--
-- (2) é o que a validação de setembro/2026 achou: uma liquidação feita a partir da linha do extrato (`fin_liquidar` com `p_ofx_fitid`) guardava o identificador do banco
-- só em `fin_liquidacoes.ofx_fitid` — o LANÇAMENTO nunca recebia a marca [ofx:FITID]. Resultado: a despesa estava provada no banco, mas aparecia "Conferida sem vínculo"
-- e ficava em "Aguardando conciliação" (9 despesas de setembro: Localiza, Claro, Tim, Prov, Prefeitura, DARF, Amil, AL Contabilidade e uma de 02/10). O app passa a gravar a
-- marca ao liquidar pelo extrato; aqui se corrige o que JÁ existe.
--
-- O que muda:
--   1. tabela `fin_conta_alteracoes` + gatilho AFTER UPDATE OF conta_id em fin_lancamentos. Só LEITURA para o app (RLS); escreve o gatilho (SECURITY DEFINER).
--   2. preenchimento: para cada liquidação com `ofx_fitid` cujo ÚNICO lançamento ainda não tem marca de extrato, acrescenta `[ofx:FITID]` às observações dele (o gatilho do D4 cria o
--      vínculo). Só liquidações de UM lançamento (hoje nenhuma tem vários) e só se a linha do banco ainda não estiver ligada a outra despesa. Nada além de `observacoes` é tocado.
-- Reversível: docs/CONTA_AUDITADA_ROLLBACK.sql remove o gatilho (a tabela fica). A marca acrescentada é a mesma que as telas já gravam; pode ficar.

-- ── 1) auditoria da troca de conta ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_conta_alteracoes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id       uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  obrigacao_id        uuid,
  conta_anterior_id   uuid NOT NULL,
  conta_nova_id       uuid NOT NULL,
  conta_anterior_nome text,
  conta_nova_nome     text,
  despesa_enviada     boolean NOT NULL DEFAULT false,
  alterado_em         timestamptz NOT NULL DEFAULT now(),
  alterado_por        uuid
);
CREATE INDEX IF NOT EXISTS fin_conta_alteracoes_lancamento_idx ON public.fin_conta_alteracoes (lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_conta_alteracoes_obrigacao_idx ON public.fin_conta_alteracoes (obrigacao_id) WHERE obrigacao_id IS NOT NULL;
COMMENT ON TABLE public.fin_conta_alteracoes IS 'Cada troca da conta de um lançamento: quem, quando, conta anterior e nova, e se a despesa estava Enviada. A conta NÃO é congelada pelo envio (é atributo operacional), mas toda troca fica registrada.';

ALTER TABLE public.fin_conta_alteracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_conta_alteracoes_leitura ON public.fin_conta_alteracoes;
CREATE POLICY fin_conta_alteracoes_leitura ON public.fin_conta_alteracoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de escrita: só o gatilho (SECURITY DEFINER) escreve; a auditoria não pode ser adulterada pela API

CREATE OR REPLACE FUNCTION public.fin_lanc_audita_conta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE enviada boolean := false;
BEGIN
  -- a função do congelamento (D6) pode não existir se só esta migration foi aplicada
  IF to_regprocedure('public.fin_despesa_enviada(uuid)') IS NOT NULL THEN enviada := public.fin_despesa_enviada(NEW.id); END IF;
  INSERT INTO public.fin_conta_alteracoes (lancamento_id, obrigacao_id, conta_anterior_id, conta_nova_id, conta_anterior_nome, conta_nova_nome, despesa_enviada, alterado_por)
  VALUES (NEW.id, COALESCE(NEW.obrigacao_id, NEW.id), OLD.conta_id, NEW.conta_id,
          (SELECT nome FROM public.fin_contas WHERE id = OLD.conta_id), (SELECT nome FROM public.fin_contas WHERE id = NEW.conta_id), enviada, auth.uid());
  RETURN NULL;
END
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_conta_auditada ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_conta_auditada AFTER UPDATE OF conta_id ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.conta_id IS DISTINCT FROM NEW.conta_id)
  EXECUTE FUNCTION public.fin_lanc_audita_conta();

-- ── 2) o vínculo das liquidações feitas pelo extrato ──────────────────────────────────────────────────────────────
UPDATE public.fin_lancamentos l
   SET observacoes = btrim(concat_ws(E'\n', l.observacoes, '[ofx:' || q.ofx_fitid || ']'))
  FROM public.fin_liquidacoes q
 WHERE l.liquidacao_id = q.id
   AND q.ofx_fitid IS NOT NULL AND btrim(q.ofx_fitid) <> ''
   AND (l.observacoes IS NULL OR l.observacoes NOT LIKE '%[ofx:%')
   AND l.status IN ('realizado', 'conciliado')
   AND l.conta_id = q.conta_id
   AND (SELECT count(*) FROM public.fin_lancamentos x WHERE x.liquidacao_id = q.id) = 1
   AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = q.conta_id AND v.fitid = q.ofx_fitid AND v.desfeito_em IS NULL);
