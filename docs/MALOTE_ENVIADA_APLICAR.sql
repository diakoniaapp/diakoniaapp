-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela. GRAVA: 2 tabelas novas (fin_malote_itens, fin_reaberturas), 1 coluna em fin_malote_envios, 4 funções, 3 gatilhos e atualiza a view vw_fin_ciclo.
-- NENHUM lançamento existente é alterado e NENHUMA despesa nasce Enviada ou Arquivada (hoje há 0 envios).
-- Idêntico a supabase/migrations/20261013130000_fin_malote_enviada_arquivada.sql. Pode rodar mais de uma vez. Para desfazer: docs/MALOTE_ENVIADA_ROLLBACK.sql.
-- ─── D6: ENVIADA e ARQUIVADA — o envio do malote por LOTE MENSAL, a despesa congelada (bloqueio estreito) e a reabertura com rastro ───────────────
-- Decisões dela (13/10/2026):
--   · Enviar Malote captura AUTOMATICAMENTE todas as despesas que estão "Prontas para Malote" naquele momento (por lote mensal; nunca despesa por despesa);
--     todas ficam ENVIADAS. Os meses antigos NÃO nascem Enviados nem Arquivados: só passa a existir a partir de um envio feito depois desta migration.
--   · ARQUIVADA = enviada + existe `fin_fechamentos_periodo` APROVADO cobrindo o mês do envio.
--   · Depois de ENVIADA, o bloqueio é ESTREITO. NÃO se altera: valor, data (vencimento), categoria, centro (e subcentro: é o mesmo campo), favorecido (fornecedor ou
--     pessoa), o tipo, nem se desfaz o pagamento ou se exclui a despesa; e o documento principal não é removido nem substituído.
--     CONTINUA PERMITIDO: conciliar tardiamente, vincular OFX/PDF, registrar conferência, anexar comprovante ou documento complementar, mudar a data de pagamento
--     (o OFX a acerta), acrescentar observações. A documentação costuma chegar depois do envio.
--   · REABRIR: só Administrador e Tesouraria, com MOTIVO obrigatório; fica registrado motivo, data, hora, usuário, estado anterior e estado novo.
--   · O estado é DERIVADO (vw_fin_ciclo): o 7º e o 8º degraus nascem do item do envio e do fechamento aprovado — ninguém "marca" despesa por despesa.
--
-- O que muda (nenhum lançamento existente é alterado; hoje há 0 envios e 0 períodos fechados):
--   1. `fin_malote_itens`: uma linha por despesa enviada (envio ↔ lançamento/obrigação), com a FOTO dos campos congelados no momento do envio;
--      uma despesa tem no máximo UM item ATIVO (índice único parcial). `fin_reaberturas`: o registro de cada reabertura. Só LEITURA para o app (RLS):
--      quem escreve são as funções abaixo (SECURITY DEFINER).
--   2. `fin_enviar_malote(ano, mes, dossiês, pendências, observação)`: registra o envio e captura as Prontas do mês. A coluna `despesas` de fin_malote_envios guarda quantas.
--   3. `fin_reabrir_despesa_enviada` e `fin_reabrir_envio`: só admin/tesouraria, com motivo; recusam despesa ARQUIVADA (reabra o período antes).
--   4. gatilhos em fin_lancamentos (UPDATE dos campos congelados e DELETE) e em fin_lancamento_anexos (remover/substituir o documento principal).
--   5. `vw_fin_ciclo` ganha os estados 'enviada' e 'arquivada' e 4 colunas no fim (envio_id, enviado_em, envio_ano, envio_mes).
-- Reversível: docs/MALOTE_ENVIADA_ROLLBACK.sql remove gatilhos e funções e devolve a view anterior; por padrão MANTÉM as tabelas (o histórico dos envios não se perde).

-- ── 1) tabelas ──────────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_malote_envios ADD COLUMN IF NOT EXISTS despesas int NOT NULL DEFAULT 0 CHECK (despesas >= 0);
COMMENT ON COLUMN public.fin_malote_envios.despesas IS 'Quantas despesas "Prontas para Malote" este envio capturou (ficam Enviadas). 0 nos envios registrados antes do D6.';

CREATE TABLE IF NOT EXISTS public.fin_malote_itens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envio_id         uuid NOT NULL REFERENCES public.fin_malote_envios(id) ON DELETE RESTRICT,
  lancamento_id    uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,   -- some se a despesa for excluída DEPOIS de reaberta; o item fica
  obrigacao_id     uuid,                                                           -- a identidade da despesa (sem FK: é história)
  ano              int  NOT NULL,
  mes              int  NOT NULL,
  -- a FOTO do que foi enviado (os campos congelados)
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
);
-- uma despesa tem no máximo UM envio ativo
CREATE UNIQUE INDEX IF NOT EXISTS fin_malote_itens_ativo_idx ON public.fin_malote_itens (lancamento_id) WHERE reaberto_em IS NULL AND lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_malote_itens_envio_idx ON public.fin_malote_itens (envio_id);
CREATE INDEX IF NOT EXISTS fin_malote_itens_obrigacao_idx ON public.fin_malote_itens (obrigacao_id) WHERE obrigacao_id IS NOT NULL;
COMMENT ON TABLE public.fin_malote_itens IS 'As despesas capturadas por cada envio do malote (ficam ENVIADAS enquanto o item estiver ativo). Foto dos campos congelados. Nunca apagada: ao reabrir, o item é marcado (reaberto_*).';

CREATE TABLE IF NOT EXISTS public.fin_reaberturas (
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
);
CREATE INDEX IF NOT EXISTS fin_reaberturas_lancamento_idx ON public.fin_reaberturas (lancamento_id) WHERE lancamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fin_reaberturas_obrigacao_idx ON public.fin_reaberturas (obrigacao_id) WHERE obrigacao_id IS NOT NULL;
COMMENT ON TABLE public.fin_reaberturas IS 'Cada reabertura de despesa enviada: motivo, data/hora, usuário, estado anterior e estado novo. Só as funções fin_reabrir_* escrevem aqui.';

ALTER TABLE public.fin_malote_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reaberturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_malote_itens_leitura ON public.fin_malote_itens;
CREATE POLICY fin_malote_itens_leitura ON public.fin_malote_itens FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
DROP POLICY IF EXISTS fin_reaberturas_leitura ON public.fin_reaberturas;
CREATE POLICY fin_reaberturas_leitura ON public.fin_reaberturas FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));
-- sem política de escrita: só as funções SECURITY DEFINER escrevem

-- ── 2) a despesa está enviada? ──────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_despesa_enviada(p_lancamento uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ SELECT EXISTS (SELECT 1 FROM public.fin_malote_itens i WHERE i.lancamento_id = p_lancamento AND i.reaberto_em IS NULL) $f$;

-- ── 3) os gatilhos do congelamento (bloqueio ESTREITO) ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada() RETURNS trigger
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
$fn$;

DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado') AND NEW.status::text NOT IN ('realizado', 'conciliado')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();
DROP TRIGGER IF EXISTS fin_lanc_congela_apagar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_congela_apagar BEFORE DELETE ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_congela_enviada();

-- o DOCUMENTO PRINCIPAL (tudo que não é comprovante) de uma despesa enviada não é removido nem trocado de despesa; acrescentar continua livre
CREATE OR REPLACE FUNCTION public.fin_anexo_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF OLD.tipo::text <> 'comprovante' AND public.fin_despesa_enviada(OLD.lancamento_id) THEN
    RAISE EXCEPTION 'O documento desta despesa já foi enviado à contabilidade e não pode ser removido nem trocado. Anexe um documento complementar, ou peça a um Administrador ou à Tesouraria que reabra a despesa, com motivo.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$fn$;
DROP TRIGGER IF EXISTS fin_anexo_congela ON public.fin_lancamento_anexos;
CREATE TRIGGER fin_anexo_congela BEFORE DELETE OR UPDATE OF url, tipo, lancamento_id ON public.fin_lancamento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.fin_anexo_congela_enviada();

-- ── 4) ENVIAR o malote do mês: captura as Prontas, por lote ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_enviar_malote(p_ano int, p_mes int, p_dossies int DEFAULT 0, p_pendencias int DEFAULT 0, p_observacao text DEFAULT NULL)
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

  -- as despesas do mês (a mesma regra do Pacote e do "Ciclo do mês": dia do pagamento, senão o vencimento) que estão PRONTAS neste instante
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
$fn$;

-- ── 5) REABRIR: só Administrador e Tesouraria, com motivo, com rastro ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_reabrir_despesa_enviada(p_lancamento uuid, p_motivo text) RETURNS void
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
$fn$;

CREATE OR REPLACE FUNCTION public.fin_reabrir_envio(p_envio uuid, p_motivo text) RETURNS int
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
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_enviar_malote(int, int, int, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_reabrir_despesa_enviada(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_reabrir_envio(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_despesa_enviada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_enviar_malote(int, int, int, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reabrir_despesa_enviada(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_reabrir_envio(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_despesa_enviada(uuid) TO authenticated;

-- ── 6) vw_fin_ciclo ganha ENVIADA e ARQUIVADA ───────────────────────────────────────────────────────────────────────
-- (colunas novas só no FIM: CREATE OR REPLACE VIEW não aceita mudar nome, tipo ou ordem das existentes)
CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
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
         -- ENVIADA e ARQUIVADA: nada regride sozinho depois do envio (os fatos podem mudar; o estado só sai daqui por reabertura explícita)
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
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;
