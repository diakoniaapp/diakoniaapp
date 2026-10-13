-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261013120000 (D4: vínculos com o banco + conferência) contra os dados REAIS ───────────────────────────────────────
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda a migration inteira e confere que (1) cada marca [ofx:…] existente virou UM vínculo
-- (e a contagem OFX × PDF bate); (2) NENHUM lançamento mudou; (3) a conferência está vazia em todos; (4) vw_fin_ciclo devolve o mesmo resultado de antes;
-- (5) o gatilho cria o vínculo de uma linha nova e RECUSA a mesma linha do banco em outra despesa, dizendo qual a usa; (6) apagar a despesa FECHA o vínculo
-- sem apagar o registro. Se algo divergir, a mensagem diz FALHOU e você NÃO aplica.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true;
  marcas_antes bigint; marcas_ofx bigint; marcas_pdf bigint; n_lanc_antes bigint; h_lanc_antes text; h_ciclo_antes text; n_ciclo_antes bigint;
  n_vinc bigint; v_ofx bigint; v_pdf bigint; v_ativos bigint; v_sem_obrigacao bigint; marcas_sem_vinculo bigint;
  n_lanc_depois bigint; h_lanc_depois text; h_ciclo_depois text; n_ciclo_depois bigint; conf_preenchida bigint;
  modelo_id uuid; id_a uuid; id_b uuid; msg text; vinc_a bigint; vinc_fechado bigint; vinc_orfao bigint;
BEGIN
  -- ── antes ──
  SELECT count(*) INTO marcas_antes FROM public.fin_lancamentos WHERE observacoes LIKE '%[ofx:%';
  SELECT count(*) INTO marcas_pdf FROM public.fin_lancamentos WHERE observacoes LIKE '%[ofx:PDF:%';
  marcas_ofx := marcas_antes - marcas_pdf;
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(tem_vinculo, false)::text, '|' ORDER BY lancamento_id))
    INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  rel := format('ANTES: %s lançamentos; %s com marca [ofx:…] (%s OFX + %s PDF); %s saídas na vw_fin_ciclo.', n_lanc_antes, marcas_antes, marcas_ofx, marcas_pdf, n_ciclo_antes);

  -- ── a migration inteira ──
  -- comando 1 de 24 da migration
  EXECUTE $m1$CREATE TABLE IF NOT EXISTS public.fin_extrato_vinculos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid NOT NULL REFERENCES public.fin_contas(id),
  fitid            text NOT NULL CHECK (btrim(fitid) <> ''),
  origem           text NOT NULL CHECK (origem IN ('ofx', 'pdf')),
  lancamento_id    uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,   -- some se a despesa for excluída; o registro fica (fechado)
  obrigacao_id     uuid,                                                           -- a identidade da despesa no momento da ligação (sem FK: é história)
  vinculado_em     timestamptz NOT NULL DEFAULT now(),
  vinculado_por    uuid,
  desfeito_em      timestamptz,
  desfeito_por     uuid,
  desfeito_motivo  text,
  nota             text,
  CHECK ((desfeito_em IS NULL) = (desfeito_motivo IS NULL))
);$m1$;
  -- comando 2 de 24 da migration
  EXECUTE $m2$CREATE UNIQUE INDEX IF NOT EXISTS fin_extrato_vinculos_ativo_idx ON public.fin_extrato_vinculos (conta_id, fitid) WHERE desfeito_em IS NULL;$m2$;
  -- comando 3 de 24 da migration
  EXECUTE $m3$CREATE INDEX IF NOT EXISTS fin_extrato_vinculos_lancamento_idx ON public.fin_extrato_vinculos (lancamento_id) WHERE lancamento_id IS NOT NULL;$m3$;
  -- comando 4 de 24 da migration
  EXECUTE $m4$CREATE INDEX IF NOT EXISTS fin_extrato_vinculos_obrigacao_idx ON public.fin_extrato_vinculos (obrigacao_id) WHERE obrigacao_id IS NOT NULL;$m4$;
  -- comando 5 de 24 da migration
  EXECUTE $m5$COMMENT ON TABLE public.fin_extrato_vinculos IS 'O vínculo entre uma despesa e a linha do banco (OFX ou PDF). Patrimônio histórico: nunca é apagado — ao sair a marca ou ser excluída a despesa, é FECHADO (desfeito_*). Única por conta+FITID enquanto ativo. Mantida por gatilho a partir da marca [ofx:…] em fin_lancamentos.observacoes.';$m5$;
  -- comando 6 de 24 da migration
  EXECUTE $m6$ALTER TABLE public.fin_extrato_vinculos ENABLE ROW LEVEL SECURITY;$m6$;
  -- comando 7 de 24 da migration
  EXECUTE $m7$DROP POLICY IF EXISTS fin_extrato_vinculos_leitura ON public.fin_extrato_vinculos;$m7$;
  -- comando 8 de 24 da migration
  EXECUTE $m8$CREATE POLICY fin_extrato_vinculos_leitura ON public.fin_extrato_vinculos
  FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m8$;
  -- comando 9 de 24 da migration
  EXECUTE $m9$ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS conferido_em     timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por    uuid,
  ADD COLUMN IF NOT EXISTS conferencia_nota text;$m9$;
  -- comando 10 de 24 da migration
  EXECUTE $m10$COMMENT ON COLUMN public.fin_lancamentos.conferido_em IS 'Quando alguém conferiu o lançamento à mão (Conferida ≠ Conciliada: a conciliação exige vínculo com o banco). Nulo no histórico.';$m10$;
  -- comando 11 de 24 da migration
  EXECUTE $m11$COMMENT ON COLUMN public.fin_lancamentos.conferido_por IS 'Quem conferiu à mão.';$m11$;
  -- comando 12 de 24 da migration
  EXECUTE $m12$INSERT INTO public.fin_extrato_vinculos (conta_id, fitid, origem, lancamento_id, obrigacao_id, vinculado_em, vinculado_por, nota)
SELECT l.conta_id, m.fitid, CASE WHEN m.fitid LIKE 'PDF:%' THEN 'pdf' ELSE 'ofx' END, l.id, COALESCE(l.obrigacao_id, l.id),
       COALESCE(l.created_at, now()), l.audit_user_id,
       'Preenchido a partir da marca [ofx:…] que já existia (migration 20261013120000); a data é a da criação do lançamento — aproximada.'
  FROM public.fin_lancamentos l
 CROSS JOIN LATERAL (SELECT (regexp_matches(l.observacoes, '\[ofx:([^\]]+)\]', 'g'))[1] AS fitid) m
 WHERE l.observacoes LIKE '%[ofx:%'
ON CONFLICT DO NOTHING;$m12$;
  -- comando 13 de 24 da migration
  EXECUTE $m13$CREATE OR REPLACE FUNCTION public.fin_marcas_do_extrato(obs text) RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $f$ SELECT COALESCE(array_agg(m[1]), '{}') FROM regexp_matches(COALESCE(obs, ''), '\[ofx:([^\]]+)\]', 'g') AS m $f$;$m13$;
  -- comando 14 de 24 da migration
  EXECUTE $m14$CREATE OR REPLACE FUNCTION public.fin_vinculos_apos_gravar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  novas text[] := fin_marcas_do_extrato(NEW.observacoes);
  f text; h record;
BEGIN
  UPDATE public.fin_extrato_vinculos
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = 'A marca do extrato saiu da despesa (ou ela mudou de conta)'
   WHERE lancamento_id = NEW.id AND desfeito_em IS NULL AND (conta_id <> NEW.conta_id OR NOT (fitid = ANY (novas)));

  FOREACH f IN ARRAY novas LOOP
    IF EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.conta_id = NEW.conta_id AND v.fitid = f AND v.desfeito_em IS NULL AND v.lancamento_id = NEW.id) THEN
      CONTINUE;
    END IF;
    SELECT v.id, v.lancamento_id, v.vinculado_em, l.descricao, l.data, l.valor, l.status INTO h
      FROM public.fin_extrato_vinculos v LEFT JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
     WHERE v.conta_id = NEW.conta_id AND v.fitid = f AND v.desfeito_em IS NULL
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Esta linha do banco (%) já está ligada a outra despesa: % — % de %, R$ % (lançamento %). Uma linha do extrato só pode pertencer a uma despesa.',
        f, COALESCE(h.descricao, '(sem descrição)'), COALESCE(h.status::text, '?'), to_char(h.data, 'DD/MM/YYYY'), COALESCE(h.valor::text, '?'), h.lancamento_id
        USING HINT = 'Desfaça o vínculo anterior (ou use a despesa que já está ligada) antes de ligar esta linha do banco a outra despesa.';
    END IF;
    INSERT INTO public.fin_extrato_vinculos (conta_id, fitid, origem, lancamento_id, obrigacao_id, vinculado_por)
    VALUES (NEW.conta_id, f, CASE WHEN f LIKE 'PDF:%' THEN 'pdf' ELSE 'ofx' END, NEW.id, COALESCE(NEW.obrigacao_id, NEW.id), auth.uid());
  END LOOP;
  RETURN NULL;
END
$fn$;$m14$;
  -- comando 15 de 24 da migration
  EXECUTE $m15$CREATE OR REPLACE FUNCTION public.fin_vinculos_antes_de_apagar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE public.fin_extrato_vinculos
     SET desfeito_em = now(), desfeito_por = auth.uid(), desfeito_motivo = 'A despesa foi excluída (ou fundida a outra)'
   WHERE lancamento_id = OLD.id AND desfeito_em IS NULL;
  RETURN OLD;
END
$fn$;$m15$;
  -- comando 16 de 24 da migration
  EXECUTE $m16$DROP TRIGGER IF EXISTS fin_lanc_vinculos_gravar ON public.fin_lancamentos;$m16$;
  -- comando 17 de 24 da migration
  EXECUTE $m17$DROP TRIGGER IF EXISTS fin_lanc_vinculos_inserir ON public.fin_lancamentos;$m17$;
  -- comando 18 de 24 da migration
  EXECUTE $m18$DROP TRIGGER IF EXISTS fin_lanc_vinculos_atualizar ON public.fin_lancamentos;$m18$;
  -- comando 19 de 24 da migration
  EXECUTE $m19$CREATE TRIGGER fin_lanc_vinculos_inserir AFTER INSERT ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_apos_gravar();$m19$;
  -- comando 20 de 24 da migration
  EXECUTE $m20$CREATE TRIGGER fin_lanc_vinculos_atualizar AFTER UPDATE OF observacoes, conta_id ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.observacoes LIKE '%[ofx:%' OR OLD.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_apos_gravar();$m20$;
  -- comando 21 de 24 da migration
  EXECUTE $m21$DROP TRIGGER IF EXISTS fin_lanc_vinculos_apagar ON public.fin_lancamentos;$m21$;
  -- comando 22 de 24 da migration
  EXECUTE $m22$CREATE TRIGGER fin_lanc_vinculos_apagar BEFORE DELETE ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.observacoes LIKE '%[ofx:%')
  EXECUTE FUNCTION public.fin_vinculos_antes_de_apagar();$m22$;
  -- comando 23 de 24 da migration
  EXECUTE $m23$CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC
),
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo <> 'comprovante'
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
vinculos AS (
  SELECT DISTINCT ON (lancamento_id) lancamento_id, origem, fitid
    FROM public.fin_extrato_vinculos
   WHERE desfeito_em IS NULL AND lancamento_id IS NOT NULL
   ORDER BY lancamento_id, vinculado_em
),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (vc.lancamento_id IS NOT NULL) AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje,
         l.conferido_em, l.conferido_por, vc.origem AS vinculo_origem, vc.fitid AS vinculo_fitid
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    CROSS JOIN hoje h
   WHERE l.tipo = 'saida' AND l.origem <> 'transferencia'
),
fatos AS (
  SELECT b.*,
         (b.status IN ('realizado', 'conciliado')) AS paga,
         CASE WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid
  FROM decididos d;$m23$;
  -- comando 24 de 24 da migration
  EXECUTE $m24$GRANT SELECT ON public.vw_fin_ciclo TO authenticated;$m24$;

  -- ── depois ──
  SELECT count(*), count(*) FILTER (WHERE origem = 'ofx'), count(*) FILTER (WHERE origem = 'pdf'), count(*) FILTER (WHERE desfeito_em IS NULL), count(*) FILTER (WHERE obrigacao_id IS NULL OR lancamento_id IS NULL)
    INTO n_vinc, v_ofx, v_pdf, v_ativos, v_sem_obrigacao FROM public.fin_extrato_vinculos;
  SELECT count(*) INTO marcas_sem_vinculo FROM public.fin_lancamentos l
   WHERE l.observacoes LIKE '%[ofx:%' AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.lancamento_id = l.id AND v.desfeito_em IS NULL);
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(tem_vinculo, false)::text, '|' ORDER BY lancamento_id))
    INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*) INTO conf_preenchida FROM public.fin_lancamentos WHERE conferido_em IS NOT NULL OR conferido_por IS NOT NULL OR conferencia_nota IS NOT NULL;
  rel := rel || format(' DEPOIS: %s vínculos (%s OFX + %s PDF), %s ativos, %s sem lançamento/obrigação; %s marcas sem vínculo ativo; conferência preenchida em %s linhas.', n_vinc, v_ofx, v_pdf, v_ativos, v_sem_obrigacao, marcas_sem_vinculo, conf_preenchida);
  IF n_vinc <> marcas_antes OR v_ofx <> marcas_ofx OR v_pdf <> marcas_pdf THEN ok := false; rel := rel || ' FALHOU: os vínculos não batem com as marcas existentes.'; END IF;
  IF v_ativos <> n_vinc OR v_sem_obrigacao > 0 OR marcas_sem_vinculo > 0 THEN ok := false; rel := rel || ' FALHOU: algum vínculo ficou inativo ou sem despesa.'; END IF;
  IF n_lanc_depois <> n_lanc_antes OR h_lanc_depois IS DISTINCT FROM h_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento mudou.'; END IF;
  IF conf_preenchida > 0 THEN ok := false; rel := rel || ' FALHOU: a conferência deveria estar vazia no histórico.'; END IF;
  IF n_ciclo_depois <> n_ciclo_antes OR h_ciclo_depois IS DISTINCT FROM h_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou de resultado.'; ELSE rel := rel || ' vw_fin_ciclo devolve exatamente o mesmo resultado de antes.'; END IF;

  -- ── o gatilho, ao vivo (dentro da transação que será desfeita) ──
  CREATE TEMP TABLE ensaio_modelo ON COMMIT DROP AS SELECT * FROM public.fin_lancamentos WHERE status = 'previsto' AND tipo = 'saida' LIMIT 1;
  IF (SELECT count(*) FROM ensaio_modelo) = 0 THEN
    rel := rel || ' (nenhum previsto para copiar: o teste do gatilho ficou de fora).';
  ELSE
    SELECT id INTO modelo_id FROM ensaio_modelo;
    UPDATE ensaio_modelo SET id = gen_random_uuid(), obrigacao_id = NULL, recorrencia_id = NULL, liquidacao_id = NULL, lancamento_pai_id = NULL,
           observacoes = '[ofx:ENSAIO-D4-1]', descricao = 'ENSAIO D4 A', created_at = now();
    INSERT INTO public.fin_lancamentos SELECT * FROM ensaio_modelo RETURNING id INTO id_a;
    SELECT count(*) INTO vinc_a FROM public.fin_extrato_vinculos WHERE lancamento_id = id_a AND desfeito_em IS NULL AND fitid = 'ENSAIO-D4-1' AND origem = 'ofx' AND obrigacao_id = id_a;
    IF vinc_a <> 1 THEN ok := false; rel := rel || ' FALHOU: a linha nova com marca não ganhou o vínculo.'; ELSE rel := rel || ' A linha nova com marca ganhou o vínculo.'; END IF;

    UPDATE ensaio_modelo SET id = gen_random_uuid(), descricao = 'ENSAIO D4 B';
    BEGIN
      INSERT INTO public.fin_lancamentos SELECT * FROM ensaio_modelo RETURNING id INTO id_b;
      ok := false; rel := rel || ' FALHOU: a mesma linha do banco foi ligada a DUAS despesas.';
    EXCEPTION WHEN OTHERS THEN
      msg := SQLERRM;
      IF msg LIKE '%já está ligada a outra despesa%' AND msg LIKE '%ENSAIO D4 A%' THEN rel := rel || ' A segunda ligação foi RECUSADA, dizendo qual despesa usa a linha: "' || msg || '".';
      ELSE ok := false; rel := rel || ' FALHOU: a recusa veio com outra mensagem: ' || msg; END IF;
    END;

    DELETE FROM public.fin_lancamentos WHERE id = id_a;
    SELECT count(*) INTO vinc_fechado FROM public.fin_extrato_vinculos WHERE fitid = 'ENSAIO-D4-1' AND desfeito_em IS NOT NULL AND lancamento_id IS NULL AND obrigacao_id = id_a;
    SELECT count(*) INTO vinc_orfao FROM public.fin_extrato_vinculos WHERE fitid = 'ENSAIO-D4-1' AND desfeito_em IS NULL;
    IF vinc_fechado <> 1 OR vinc_orfao <> 0 THEN ok := false; rel := rel || ' FALHOU: apagar a despesa não fechou o vínculo mantendo o registro.'; ELSE rel := rel || ' Apagar a despesa fechou o vínculo e manteve o registro.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
