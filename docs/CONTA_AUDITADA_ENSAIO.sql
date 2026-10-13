-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261013140000 (conta auditada + vínculo das liquidações feitas pelo extrato) contra os dados REAIS ──────────────────────
-- Dentro de uma transação que será desfeita: conta quantas liquidações do extrato têm o lançamento SEM a marca do banco, roda a migration e confere que (1) exatamente essas
-- despesas ganharam a marca [ofx:FITID] e o vínculo; (2) NENHUMA outra coluna de lançamento mudou (só observacoes, só nelas); (3) a view as mostra como vinculadas;
-- (4) trocar a conta de uma despesa deixa o registro (quem, quando, de qual para qual). Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true;
  a_corrigir bigint; vinc_antes bigint; vinc_depois bigint; h_outras_antes text; h_outras_depois text; n_lanc_antes bigint; n_lanc_depois bigint;
  sem_marca_depois bigint; ag_antes bigint; ag_depois bigint; mod_id uuid; conta_a uuid; conta_b uuid; aud record; ngr bigint;
BEGIN
  -- ── antes ──
  SELECT count(*) INTO a_corrigir FROM public.fin_liquidacoes q JOIN public.fin_lancamentos l ON l.liquidacao_id = q.id
   WHERE q.ofx_fitid IS NOT NULL AND btrim(q.ofx_fitid) <> '' AND (l.observacoes IS NULL OR l.observacoes NOT LIKE '%[ofx:%') AND l.status IN ('realizado', 'conciliado') AND l.conta_id = q.conta_id
     AND (SELECT count(*) FROM public.fin_lancamentos x WHERE x.liquidacao_id = q.id) = 1
     AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = q.conta_id AND v.fitid = q.ofx_fitid AND v.desfeito_em IS NULL);
  SELECT count(*) INTO vinc_antes FROM public.fin_extrato_vinculos WHERE desfeito_em IS NULL;
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_outras_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*) INTO ag_antes FROM public.vw_fin_ciclo WHERE estado = 'aguardando_conciliacao';
  rel := format('ANTES: %s lançamentos; %s liquidações do extrato com o lançamento SEM a marca do banco; %s vínculos ativos; %s despesas em "aguardando conciliação".', n_lanc_antes, a_corrigir, vinc_antes, ag_antes);

  -- ── a migration inteira ──
  -- comando 1 de 11 da migration
  EXECUTE $m1$CREATE TABLE IF NOT EXISTS public.fin_conta_alteracoes (
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
);$m1$;
  -- comando 2 de 11 da migration
  EXECUTE $m2$CREATE INDEX IF NOT EXISTS fin_conta_alteracoes_lancamento_idx ON public.fin_conta_alteracoes (lancamento_id) WHERE lancamento_id IS NOT NULL;$m2$;
  -- comando 3 de 11 da migration
  EXECUTE $m3$CREATE INDEX IF NOT EXISTS fin_conta_alteracoes_obrigacao_idx ON public.fin_conta_alteracoes (obrigacao_id) WHERE obrigacao_id IS NOT NULL;$m3$;
  -- comando 4 de 11 da migration
  EXECUTE $m4$COMMENT ON TABLE public.fin_conta_alteracoes IS 'Cada troca da conta de um lançamento: quem, quando, conta anterior e nova, e se a despesa estava Enviada. A conta NÃO é congelada pelo envio (é atributo operacional), mas toda troca fica registrada.';$m4$;
  -- comando 5 de 11 da migration
  EXECUTE $m5$ALTER TABLE public.fin_conta_alteracoes ENABLE ROW LEVEL SECURITY;$m5$;
  -- comando 6 de 11 da migration
  EXECUTE $m6$DROP POLICY IF EXISTS fin_conta_alteracoes_leitura ON public.fin_conta_alteracoes;$m6$;
  -- comando 7 de 11 da migration
  EXECUTE $m7$CREATE POLICY fin_conta_alteracoes_leitura ON public.fin_conta_alteracoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m7$;
  -- comando 8 de 11 da migration
  EXECUTE $m8$CREATE OR REPLACE FUNCTION public.fin_lanc_audita_conta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE enviada boolean := false;
BEGIN
  IF to_regprocedure('public.fin_despesa_enviada(uuid)') IS NOT NULL THEN enviada := public.fin_despesa_enviada(NEW.id); END IF;
  INSERT INTO public.fin_conta_alteracoes (lancamento_id, obrigacao_id, conta_anterior_id, conta_nova_id, conta_anterior_nome, conta_nova_nome, despesa_enviada, alterado_por)
  VALUES (NEW.id, COALESCE(NEW.obrigacao_id, NEW.id), OLD.conta_id, NEW.conta_id,
          (SELECT nome FROM public.fin_contas WHERE id = OLD.conta_id), (SELECT nome FROM public.fin_contas WHERE id = NEW.conta_id), enviada, auth.uid());
  RETURN NULL;
END
$fn$;$m8$;
  -- comando 9 de 11 da migration
  EXECUTE $m9$DROP TRIGGER IF EXISTS fin_lanc_conta_auditada ON public.fin_lancamentos;$m9$;
  -- comando 10 de 11 da migration
  EXECUTE $m10$CREATE TRIGGER fin_lanc_conta_auditada AFTER UPDATE OF conta_id ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.conta_id IS DISTINCT FROM NEW.conta_id)
  EXECUTE FUNCTION public.fin_lanc_audita_conta();$m10$;
  -- comando 11 de 11 da migration
  EXECUTE $m11$UPDATE public.fin_lancamentos l
   SET observacoes = btrim(concat_ws(E'\n', l.observacoes, '[ofx:' || q.ofx_fitid || ']'))
  FROM public.fin_liquidacoes q
 WHERE l.liquidacao_id = q.id
   AND q.ofx_fitid IS NOT NULL AND btrim(q.ofx_fitid) <> ''
   AND (l.observacoes IS NULL OR l.observacoes NOT LIKE '%[ofx:%')
   AND l.status IN ('realizado', 'conciliado')
   AND l.conta_id = q.conta_id
   AND (SELECT count(*) FROM public.fin_lancamentos x WHERE x.liquidacao_id = q.id) = 1
   AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = q.conta_id AND v.fitid = q.ofx_fitid AND v.desfeito_em IS NULL);$m11$;

  -- ── depois ──
  SELECT count(*) INTO vinc_depois FROM public.fin_extrato_vinculos WHERE desfeito_em IS NULL;
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_outras_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*) INTO sem_marca_depois FROM public.fin_liquidacoes q JOIN public.fin_lancamentos l ON l.liquidacao_id = q.id
   WHERE q.ofx_fitid IS NOT NULL AND (l.observacoes IS NULL OR l.observacoes NOT LIKE '%[ofx:%') AND (SELECT count(*) FROM public.fin_lancamentos x WHERE x.liquidacao_id = q.id) = 1
     AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = q.conta_id AND v.fitid = q.ofx_fitid AND v.desfeito_em IS NULL);
  SELECT count(*) INTO ag_depois FROM public.vw_fin_ciclo WHERE estado = 'aguardando_conciliacao';
  rel := rel || format(' DEPOIS: %s vínculos ativos (+%s); %s liquidações do extrato ainda sem marca; %s despesas em "aguardando conciliação" (%s a menos).', vinc_depois, vinc_depois - vinc_antes, sem_marca_depois, ag_depois, ag_antes - ag_depois);
  IF vinc_depois - vinc_antes <> a_corrigir THEN ok := false; rel := rel || ' FALHOU: o número de vínculos novos não bate com o de liquidações a corrigir.'; END IF;
  IF sem_marca_depois <> 0 THEN ok := false; rel := rel || ' FALHOU: ficaram liquidações do extrato sem marca.'; END IF;
  IF n_lanc_depois <> n_lanc_antes OR h_outras_depois IS DISTINCT FROM h_outras_antes THEN ok := false; rel := rel || ' FALHOU: alguma coluna além de observacoes mudou, ou o total de lançamentos mudou.'; ELSE rel := rel || ' Nenhuma outra coluna de lançamento mudou.'; END IF;
  IF ag_antes - ag_depois > a_corrigir THEN ok := false; rel := rel || ' FALHOU: mais despesas saíram de "aguardando" do que o esperado.'; END IF;

  -- ── a troca de conta deixa o registro ──
  SELECT l.id, l.conta_id INTO mod_id, conta_a FROM public.fin_lancamentos l WHERE l.tipo = 'saida' AND l.status = 'previsto' LIMIT 1;
  SELECT id INTO conta_b FROM public.fin_contas WHERE id <> conta_a ORDER BY id LIMIT 1;
  IF mod_id IS NULL OR conta_b IS NULL THEN
    rel := rel || ' (sem despesa ou conta para o teste da troca de conta: ficou de fora).';
  ELSE
    UPDATE public.fin_lancamentos SET conta_id = conta_b WHERE id = mod_id;
    SELECT * INTO aud FROM public.fin_conta_alteracoes WHERE lancamento_id = mod_id ORDER BY alterado_em DESC LIMIT 1;
    IF aud.id IS NULL OR aud.conta_anterior_id <> conta_a OR aud.conta_nova_id <> conta_b OR aud.conta_anterior_nome IS NULL OR aud.conta_nova_nome IS NULL THEN ok := false; rel := rel || ' FALHOU: a troca de conta não deixou o registro completo.';
    ELSE rel := rel || format(' A troca de conta ficou registrada: de "%s" para "%s".', aud.conta_anterior_nome, aud.conta_nova_nome); END IF;
    SELECT count(*) INTO ngr FROM public.fin_conta_alteracoes;
    UPDATE public.fin_lancamentos SET valor = valor WHERE id = mod_id;
    IF (SELECT count(*) FROM public.fin_conta_alteracoes) <> ngr THEN ok := false; rel := rel || ' FALHOU: gravar sem trocar a conta gerou auditoria.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
