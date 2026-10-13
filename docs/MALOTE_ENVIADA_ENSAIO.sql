-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261013130000 (D6: Enviada, Arquivada, bloqueio estreito e reabertura) contra os dados REAIS ─────────────────────────────
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda a migration inteira e confere que (1) nenhum lançamento mudou e vw_fin_ciclo devolve o MESMO
-- resultado de antes (hoje há 0 envios); (2) um envio de teste de um mês real captura exatamente as Prontas daquele mês; (3) a despesa enviada fica ENVIADA e
-- o valor dela NÃO pode ser alterado (a mensagem diz o campo e o malote) enquanto observação e conferência continuam livres; (4) reabrir deixa o rastro; (5) um
-- período aprovado a transforma em ARQUIVADA. O teste usa um administrador real para as funções e é desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; envios_antes bigint;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; itens_depois bigint;
  mes_alvo date; ano_a int; mes_a int; prontas_antes bigint; envio uuid; capturadas bigint; enviadas_view bigint; alvo uuid; msg text;
  per_id uuid; estado_apos text; log_n bigint; novo_estado text; arquivadas bigint; obs_ok boolean := false;
BEGIN
  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*) INTO envios_antes FROM public.fin_malote_envios;
  rel := format('ANTES: %s lançamentos; %s saídas na vw_fin_ciclo; %s envios de malote registrados.', n_lanc_antes, n_ciclo_antes, envios_antes);

  -- ── a migration inteira ──
  -- comando 1 de 39 da migration
  EXECUTE $m1$ALTER TABLE public.fin_malote_envios ADD COLUMN IF NOT EXISTS despesas int NOT NULL DEFAULT 0 CHECK (despesas >= 0);$m1$;
  -- comando 2 de 39 da migration
  EXECUTE $m2$COMMENT ON COLUMN public.fin_malote_envios.despesas IS 'Quantas despesas "Prontas para Malote" este envio capturou (ficam Enviadas). 0 nos envios registrados antes do D6.';$m2$;
  -- comando 3 de 39 da migration
  EXECUTE $m3$CREATE TABLE IF NOT EXISTS public.fin_malote_itens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id         uuid NOT NULL REFERENCES public.fin_malote_envios(id) ON DELETE RESTRICT,
  lancamento_id    uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,   -- some se a despesa for excluída DEPOIS de reaberta; o item fica
  obrigacao_id     uuid,                                                           -- a identidade da despesa (sem FK: é história)
  ano              int  NOT NULL,
  mes              int  NOT NULL,
  valor            numeric(14,2) NOT NULL,
  data             date NOT NULL,
  categoria_id     uuid,
  centro_custo_id  uuid,
  fornecedor_id    uuid,
  pessoa_id        uuid,
  incluido_em      timestamptz NOT NULL DEFAULT now(),
  incluido_por     uuid,
  reaberto_em      timestamptz,
  reaberto_por     uuid,
  reaberto_motivo  text,
  CHECK ((reaberto_em IS NULL) = (reaberto_motivo IS NULL) AND (reaberto_em IS NULL) = (reaberto_por IS NULL))
);$m3$;
  -- comando 4 de 39 da migration
  EXECUTE $m4$CREATE UNIQUE INDEX IF NOT EXISTS fin_malote_itens_ativo_idx ON public.fin_malote_itens (lancamento_id) WHERE reaberto_em IS NULL AND lancamento_id IS NOT NULL;$m4$;
  -- comando 5 de 39 da migration
  EXECUTE $m5$CREATE INDEX IF NOT EXISTS fin_malote_itens_envio_idx ON public.fin_malote_itens (envio_id);$m5$;
  -- comando 6 de 39 da migration
  EXECUTE $m6$CREATE INDEX IF NOT EXISTS fin_malote_itens_obrigacao_idx ON public.fin_malote_itens (obrigacao_id) WHERE obrigacao_id IS NOT NULL;$m6$;
  -- comando 7 de 39 da migration
  EXECUTE $m7$COMMENT ON TABLE public.fin_malote_itens IS 'As despesas capturadas por cada envio do malote (ficam ENVIADAS enquanto o item estiver ativo). Foto dos campos congelados. Nunca apagada: ao reabrir, o item é marcado (reaberto_*).';$m7$;
  -- comando 8 de 39 da migration
  EXECUTE $m8$CREATE TABLE IF NOT EXISTS public.fin_reaberturas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid REFERENCES public.fin_malote_itens(id) ON DELETE SET NULL,
  lancamento_id    uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  obrigacao_id     uuid,
  envio_id         uuid,
  motivo           text NOT NULL CHECK (char_length(btrim(motivo)) >= 5),
  reaberto_em      timestamptz NOT NULL DEFAULT now(),
  reaberto_por     uuid,
  estado_anterior  text NOT NULL,
  estado_novo      text NOT NULL
);$m8$;
  -- comando 9 de 39 da migration
  EXECUTE $m9$CREATE INDEX IF NOT EXISTS fin_reaberturas_lancamento_idx ON public.fin_reaberturas (lancamento_id) WHERE lancamento_id IS NOT NULL;$m9$;
  -- comando 10 de 39 da migration
  EXECUTE $m10$CREATE INDEX IF NOT EXISTS fin_reaberturas_obrigacao_idx ON public.fin_reaberturas (obrigacao_id) WHERE obrigacao_id IS NOT NULL;$m10$;
  -- comando 11 de 39 da migration
  EXECUTE $m11$COMMENT ON TABLE public.fin_reaberturas IS 'Cada reabertura de despesa enviada: motivo, data/hora, usuário, estado anterior e estado novo. Só as funções fin_reabrir_* escrevem aqui.';$m11$;
  -- comando 12 de 39 da migration
  EXECUTE $m12$ALTER TABLE public.fin_malote_itens ENABLE ROW LEVEL SECURITY;$m12$;
  -- comando 13 de 39 da migration
  EXECUTE $m13$ALTER TABLE public.fin_reaberturas ENABLE ROW LEVEL SECURITY;$m13$;
  -- comando 14 de 39 da migration
  EXECUTE $m14$DROP POLICY IF EXISTS fin_malote_itens_leitura ON public.fin_malote_itens;$m14$;
  -- comando 15 de 39 da migration
  EXECUTE $m15$CREATE POLICY fin_malote_itens_leitura ON public.fin_malote_itens FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m15$;
  -- comando 16 de 39 da migration
  EXECUTE $m16$DROP POLICY IF EXISTS fin_reaberturas_leitura ON public.fin_reaberturas;$m16$;
  -- comando 17 de 39 da migration
  EXECUTE $m17$CREATE POLICY fin_reaberturas_leitura ON public.fin_reaberturas FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m17$;
  -- comando 18 de 39 da migration
  EXECUTE $m18$CREATE OR REPLACE FUNCTION public.fin_despesa_enviada(p_lancamento uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT EXISTS (SELECT 1 FROM public.fin_malote_itens i WHERE i.lancamento_id = p_lancamento AND i.reaberto_em IS NULL) $f$;$m18$;
  -- comando 19 de 39 da migration
  EXECUTE $m19$CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE it record; campos text[] := '{}';
BEGIN
  SELECT i.ano, i.mes INTO it FROM public.fin_malote_itens i WHERE i.lancamento_id = OLD.id AND i.reaberto_em IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e não pode ser excluída. Para isso, um Administrador ou a Tesouraria precisa reabri-la, com motivo.', lpad(it.mes::text, 2, '0'), it.ano;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN campos := array_append(campos, 'valor'); END IF;
  IF OLD.data IS DISTINCT FROM NEW.data THEN campos := array_append(campos, 'data (vencimento)'); END IF;
  IF OLD.categoria_id IS DISTINCT FROM NEW.categoria_id THEN campos := array_append(campos, 'categoria'); END IF;
  IF OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id THEN campos := array_append(campos, 'centro de custo'); END IF;
  IF OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN campos := array_append(campos, 'favorecido'); END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN campos := array_append(campos, 'tipo'); END IF;
  IF OLD.status::text IN ('realizado', 'conciliado') AND NEW.status::text NOT IN ('realizado', 'conciliado') THEN campos := array_append(campos, 'situação do pagamento'); END IF;
  IF array_length(campos, 1) IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e está congelada: não se altera %. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)',
    lpad(it.mes::text, 2, '0'), it.ano, array_to_string(campos, ', ');
END
$fn$;$m19$;
  -- comando 20 de 39 da migration
  EXECUTE $m20$DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;$m20$;
  -- comando 21 de 39 da migration
  EXECUTE $m21$CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado') AND NEW.status::text NOT IN ('realizado', 'conciliado')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();$m21$;
  -- comando 22 de 39 da migration
  EXECUTE $m22$DROP TRIGGER IF EXISTS fin_lanc_congela_apagar ON public.fin_lancamentos;$m22$;
  -- comando 23 de 39 da migration
  EXECUTE $m23$CREATE TRIGGER fin_lanc_congela_apagar BEFORE DELETE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_congela_enviada();$m23$;
  -- comando 24 de 39 da migration
  EXECUTE $m24$CREATE OR REPLACE FUNCTION public.fin_anexo_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF OLD.tipo::text <> 'comprovante' AND public.fin_despesa_enviada(OLD.lancamento_id) THEN
    RAISE EXCEPTION 'O documento desta despesa já foi enviado à contabilidade e não pode ser removido nem trocado. Anexe um documento complementar, ou peça a um Administrador ou à Tesouraria que reabra a despesa, com motivo.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$fn$;$m24$;
  -- comando 25 de 39 da migration
  EXECUTE $m25$DROP TRIGGER IF EXISTS fin_anexo_congela ON public.fin_lancamento_anexos;$m25$;
  -- comando 26 de 39 da migration
  EXECUTE $m26$CREATE TRIGGER fin_anexo_congela BEFORE DELETE OR UPDATE OF url, tipo, lancamento_id ON public.fin_lancamento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.fin_anexo_congela_enviada();$m26$;
  -- comando 27 de 39 da migration
  EXECUTE $m27$CREATE OR REPLACE FUNCTION public.fin_enviar_malote(p_ano int, p_mes int, p_dossies int DEFAULT 0, p_pendencias int DEFAULT 0, p_observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ini date; fim date; envio uuid; n int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar o envio do malote.';
  END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano NOT BETWEEN 2020 AND 2099 THEN RAISE EXCEPTION 'Período inválido: %/%.', p_mes, p_ano; END IF;
  ini := make_date(p_ano, p_mes, 1); fim := (ini + interval '1 month' - interval '1 day')::date;

  INSERT INTO public.fin_malote_envios (ano, mes, dossies, pendencias_documentos, observacao, enviado_por)
  VALUES (p_ano, p_mes, GREATEST(COALESCE(p_dossies, 0), 0), GREATEST(COALESCE(p_pendencias, 0), 0), p_observacao, (SELECT auth.uid()))
  RETURNING id INTO envio;

  INSERT INTO public.fin_malote_itens (envio_id, lancamento_id, obrigacao_id, ano, mes, valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, incluido_por)
  SELECT envio, l.id, COALESCE(l.obrigacao_id, l.id), p_ano, p_mes, l.valor, l.data, l.categoria_id, l.centro_custo_id, l.fornecedor_id, l.pessoa_id, (SELECT auth.uid())
    FROM public.vw_fin_ciclo v
    JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
   WHERE v.estado = 'pronta_para_malote'
     AND ((l.data_pagamento BETWEEN ini AND fim) OR (l.data_pagamento IS NULL AND l.data BETWEEN ini AND fim))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.fin_malote_envios SET despesas = n WHERE id = envio;
  RETURN envio;
END
$fn$;$m27$;
  -- comando 28 de 39 da migration
  EXECUTE $m28$CREATE OR REPLACE FUNCTION public.fin_reabrir_despesa_enviada(p_lancamento uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE it public.fin_malote_itens%ROWTYPE; anterior text; novo text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Só o Administrador e a Tesouraria podem reabrir uma despesa enviada.';
  END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da reabertura (pelo menos 5 caracteres).'; END IF;

  SELECT * INTO it FROM public.fin_malote_itens WHERE lancamento_id = p_lancamento AND reaberto_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta despesa não está enviada ao malote — não há o que reabrir.'; END IF;

  SELECT estado INTO anterior FROM public.vw_fin_ciclo WHERE lancamento_id = p_lancamento;
  IF anterior = 'arquivada' THEN
    RAISE EXCEPTION 'Esta despesa está ARQUIVADA (o período foi aprovado). Reabra o período antes de reabrir a despesa.';
  END IF;

  UPDATE public.fin_malote_itens SET reaberto_em = now(), reaberto_por = (SELECT auth.uid()), reaberto_motivo = btrim(p_motivo) WHERE id = it.id;
  SELECT estado INTO novo FROM public.vw_fin_ciclo WHERE lancamento_id = p_lancamento;   -- agora derivado dos fatos (em geral volta a "pronta_para_malote")

  INSERT INTO public.fin_reaberturas (item_id, lancamento_id, obrigacao_id, envio_id, motivo, reaberto_por, estado_anterior, estado_novo)
  VALUES (it.id, p_lancamento, it.obrigacao_id, it.envio_id, btrim(p_motivo), (SELECT auth.uid()), COALESCE(anterior, 'enviada'), COALESCE(novo, 'desconhecido'));
END
$fn$;$m28$;
  -- comando 29 de 39 da migration
  EXECUTE $m29$CREATE OR REPLACE FUNCTION public.fin_reabrir_envio(p_envio uuid, p_motivo text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record; n int := 0;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Só o Administrador e a Tesouraria podem reabrir um envio.';
  END IF;
  FOR r IN SELECT lancamento_id FROM public.fin_malote_itens WHERE envio_id = p_envio AND reaberto_em IS NULL AND lancamento_id IS NOT NULL ORDER BY id LOOP
    PERFORM public.fin_reabrir_despesa_enviada(r.lancamento_id, p_motivo);
    n := n + 1;
  END LOOP;
  RETURN n;
END
$fn$;$m29$;
  -- comando 30 de 39 da migration
  EXECUTE $m30$REVOKE EXECUTE ON FUNCTION public.fin_enviar_malote(int, int, int, int, text) FROM PUBLIC, anon;$m30$;
  -- comando 31 de 39 da migration
  EXECUTE $m31$REVOKE EXECUTE ON FUNCTION public.fin_reabrir_despesa_enviada(uuid, text) FROM PUBLIC, anon;$m31$;
  -- comando 32 de 39 da migration
  EXECUTE $m32$REVOKE EXECUTE ON FUNCTION public.fin_reabrir_envio(uuid, text) FROM PUBLIC, anon;$m32$;
  -- comando 33 de 39 da migration
  EXECUTE $m33$REVOKE EXECUTE ON FUNCTION public.fin_despesa_enviada(uuid) FROM PUBLIC, anon;$m33$;
  -- comando 34 de 39 da migration
  EXECUTE $m34$GRANT EXECUTE ON FUNCTION public.fin_enviar_malote(int, int, int, int, text) TO authenticated;$m34$;
  -- comando 35 de 39 da migration
  EXECUTE $m35$GRANT EXECUTE ON FUNCTION public.fin_reabrir_despesa_enviada(uuid, text) TO authenticated;$m35$;
  -- comando 36 de 39 da migration
  EXECUTE $m36$GRANT EXECUTE ON FUNCTION public.fin_reabrir_envio(uuid, text) TO authenticated;$m36$;
  -- comando 37 de 39 da migration
  EXECUTE $m37$GRANT EXECUTE ON FUNCTION public.fin_despesa_enviada(uuid) TO authenticated;$m37$;
  -- comando 38 de 39 da migration
  EXECUTE $m38$CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
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
envios AS (
  SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, i.envio_id, e.enviado_em, i.ano, i.mes
    FROM public.fin_malote_itens i
    JOIN public.fin_malote_envios e ON e.id = i.envio_id
   WHERE i.reaberto_em IS NULL AND i.lancamento_id IS NOT NULL
   ORDER BY i.lancamento_id, e.enviado_em DESC
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
         l.conferido_em, l.conferido_por, vc.origem AS vinculo_origem, vc.fitid AS vinculo_fitid,
         en.envio_id, en.enviado_em, en.ano AS envio_ano, en.mes AS envio_mes,
         COALESCE((SELECT true FROM public.fin_fechamentos_periodo f
                    WHERE f.status = 'aprovado' AND en.ano IS NOT NULL
                      AND (en.ano * 12 + en.mes) >= (f.ano_inicio * 12 + f.mes_inicio)
                      AND (en.ano * 12 + en.mes) <  (f.ano_inicio * 12 + f.mes_inicio + f.qtd_meses) LIMIT 1), false) AS periodo_aprovado
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    LEFT JOIN envios en ON en.lancamento_id = l.id
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
         WHEN d.envio_id IS NOT NULL AND d.paga THEN CASE WHEN d.periodo_aprovado THEN 'arquivada' ELSE 'enviada' END
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid,
       d.envio_id, d.enviado_em, d.envio_ano, d.envio_mes
  FROM decididos d;$m38$;
  -- comando 39 de 39 da migration
  EXECUTE $m39$GRANT SELECT ON public.vw_fin_ciclo TO authenticated;$m39$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*) INTO itens_depois FROM public.fin_malote_itens;
  IF n_lanc_depois <> n_lanc_antes OR h_lanc_depois IS DISTINCT FROM h_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento mudou.'; END IF;
  IF n_ciclo_depois <> n_ciclo_antes OR h_ciclo_depois IS DISTINCT FROM h_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou de resultado.'; ELSE rel := rel || ' Sem nenhum envio, vw_fin_ciclo devolve exatamente o mesmo resultado de antes e nenhum lançamento mudou.'; END IF;
  IF itens_depois <> 0 THEN ok := false; rel := rel || ' FALHOU: já nasceram itens de envio.'; END IF;

  -- ── o teste ao vivo, com um administrador real (desfeito no fim) ──
  SELECT user_id INTO uid FROM public.user_roles WHERE role::text = 'admin' LIMIT 1;
  IF uid IS NULL THEN
    rel := rel || ' (nenhum administrador encontrado: o teste ao vivo das funções ficou de fora).';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

    -- o mês com mais despesas Prontas
    SELECT date_trunc('month', COALESCE(l.data_pagamento, l.data))::date, count(*) INTO mes_alvo, prontas_antes
      FROM public.vw_fin_ciclo v JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
     WHERE v.estado = 'pronta_para_malote' GROUP BY 1 ORDER BY 2 DESC LIMIT 1;
    IF mes_alvo IS NULL THEN
      rel := rel || ' (nenhuma despesa Pronta no banco: o teste do envio ficou de fora).';
    ELSE
      ano_a := EXTRACT(year FROM mes_alvo)::int; mes_a := EXTRACT(month FROM mes_alvo)::int;
      envio := public.fin_enviar_malote(ano_a, mes_a, 0, 0, 'ENSAIO D6');
      SELECT count(*) INTO capturadas FROM public.fin_malote_itens WHERE envio_id = envio;
      SELECT count(*) INTO enviadas_view FROM public.vw_fin_ciclo WHERE estado = 'enviada' AND envio_id = envio;
      rel := rel || format(' ENVIO DE TESTE %s/%s: %s despesas Prontas no mês → %s capturadas → %s aparecem Enviadas na view.', lpad(mes_a::text, 2, '0'), ano_a, prontas_antes, capturadas, enviadas_view);
      IF capturadas <> prontas_antes OR enviadas_view <> capturadas THEN ok := false; rel := rel || ' FALHOU: o envio não capturou exatamente as Prontas do mês.'; END IF;

      SELECT lancamento_id INTO alvo FROM public.fin_malote_itens WHERE envio_id = envio ORDER BY id LIMIT 1;
      BEGIN
        UPDATE public.fin_lancamentos SET valor = valor + 1 WHERE id = alvo;
        ok := false; rel := rel || ' FALHOU: foi possível alterar o valor de uma despesa enviada.';
      EXCEPTION WHEN OTHERS THEN
        msg := SQLERRM;
        IF msg LIKE '%já foi enviada à contabilidade%' AND msg LIKE '%valor%' THEN rel := rel || ' O valor da despesa enviada foi BLOQUEADO ("' || left(msg, 120) || '…").';
        ELSE ok := false; rel := rel || ' FALHOU: bloqueio com outra mensagem: ' || msg; END IF;
      END;
      UPDATE public.fin_lancamentos SET observacoes = COALESCE(observacoes, '') || ' ' WHERE id = alvo;
      obs_ok := true;
      rel := rel || ' Acrescentar observação continuou permitido.';

      -- período aprovado cobrindo o mês → ARQUIVADA
      INSERT INTO public.fin_fechamentos_periodo (ano_inicio, mes_inicio, qtd_meses, status) VALUES (ano_a, mes_a, 1, 'aprovado') RETURNING id INTO per_id;
      SELECT count(*) INTO arquivadas FROM public.vw_fin_ciclo WHERE estado = 'arquivada' AND envio_id = envio;
      IF arquivadas <> capturadas THEN ok := false; rel := rel || format(' FALHOU: com o período aprovado só %s de %s ficaram Arquivadas.', arquivadas, capturadas); ELSE rel := rel || ' Com o período aprovado, todas ficaram ARQUIVADAS.'; END IF;
      DELETE FROM public.fin_fechamentos_periodo WHERE id = per_id;

      -- reabrir
      PERFORM public.fin_reabrir_despesa_enviada(alvo, 'ENSAIO D6 — motivo de teste');
      SELECT count(*) INTO log_n FROM public.fin_reaberturas WHERE lancamento_id = alvo AND estado_anterior = 'enviada';
      SELECT estado INTO novo_estado FROM public.vw_fin_ciclo WHERE lancamento_id = alvo;
      IF log_n <> 1 OR novo_estado <> 'pronta_para_malote' THEN ok := false; rel := rel || format(' FALHOU: reabertura (registros: %s; estado depois: %s).', log_n, novo_estado);
      ELSE rel := rel || ' A reabertura deixou o rastro (motivo, usuário, estado anterior "enviada" → novo "pronta_para_malote").'; END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
