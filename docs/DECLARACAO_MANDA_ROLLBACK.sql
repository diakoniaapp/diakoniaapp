-- ROLLBACK — Fase 2A: devolve as funções à definição de antes (aprovações, grau conjunto, entrada da Matriz de Ofertas, congelamento) e remove o que a fase criou.
-- A trilha de edição (fin_lancamento_historico) e os eventos declaracao_invalidada SÃO PROVA: só saem se estiverem vazios; senão ficam (e o aviso diz). Nenhum outro dado é tocado.
-- 1) os gatilhos novos saem primeiro
DROP TRIGGER IF EXISTS fin_lanc_declaracao_sincroniza ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_historico_declaracao ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_quitacao_eventos_sela ON public.fin_quitacao_eventos;

-- 2) as funções de volta ao que eram
CREATE OR REPLACE FUNCTION public.fin_quitacao_aprovacoes(p_quitacao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ultima_mudanca timestamptz; r text; a text;
BEGIN
  SELECT max(e.em) INTO ultima_mudanca FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento IN ('registrada', 'alterada');
  SELECT e.decisao INTO r FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_reembolso' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  SELECT e.decisao INTO a FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = p_quitacao AND e.evento = 'aprovacao_relatado' AND e.em > COALESCE(ultima_mudanca, '-infinity') ORDER BY e.em DESC LIMIT 1;
  RETURN jsonb_build_object('reembolso', to_jsonb(r), 'relatado', to_jsonb(a));
END
$function$
;

CREATE OR REPLACE FUNCTION public.fin_quitacao_grau_conjunto(p_quitacao uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.fin_quitacoes%ROWTYPE; tipos text[]; g jsonb;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  RETURN CASE LEAST(CASE g->>'responsavel' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END, CASE g->>'intencao' WHEN 'formal' THEN 2 WHEN 'relatado' THEN 1 ELSE 0 END)
              WHEN 2 THEN 'formal' WHEN 1 THEN 'relatado' ELSE 'nenhum' END;
END
$function$
;

CREATE OR REPLACE FUNCTION public.fin_quitacao_entrada(p_quitacao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; f public.fin_fornecedores%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE;
  tipos text[]; g jsonb; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  acumulado numeric := 0; relatadas int := 0; conj text; ap jsonb; no_circuito boolean := false; ministro boolean := false; com_pagamentos boolean := false;
  alterada boolean := false; periodo boolean := false; chave text; confere boolean := false; vencida boolean := false; r record;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO f FROM public.fin_fornecedores WHERE id = l.fornecedor_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  SELECT COALESCE(array_agg(DISTINCT a.tipo), '{}') INTO tipos FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
   WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id;
  g := public.fin_quitacao_graus(q.responsavel_tipo, q.intencao, tipos);
  conj := public.fin_quitacao_grau_conjunto(q.id);
  ap := public.fin_quitacao_aprovacoes(q.id);

  chave := l.nf_chave_acesso;
  IF chave IS NOT NULL AND f.id IS NOT NULL AND f.cnpj_cpf IS NOT NULL THEN
    confere := substr(chave, 7, 14) = regexp_replace(f.cnpj_cpf, '\D', '', 'g');
  END IF;

  IF q.responsavel_tipo = 'pessoa' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles pr JOIN public.user_roles ur ON ur.user_id = pr.id
                    WHERE pr.pessoa_id = q.responsavel_pessoa_id AND ur.role::text IN ('admin', 'diakonia', 'secretaria', 'tesouraria')) INTO no_circuito;
    SELECT EXISTS (SELECT 1 FROM public.membros m, unnest(m.funcoes_ministeriais) fn WHERE m.id = q.responsavel_pessoa_id AND fn::text <> 'membro') INTO ministro;
  END IF;
  IF q.responsavel_tipo = 'empresa' THEN
    SELECT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = q.responsavel_fornecedor_id AND x.tipo::text = 'saida' AND x.status::text IN ('realizado', 'conciliado')
                      AND COALESCE(x.data_pagamento, x.data) >= hoje - 365) INTO com_pagamentos;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento = 'alterada' AND (e.de->>'intencao') IS DISTINCT FROM (e.para->>'intencao')
                    AND e.em >= now() - interval '30 days') INTO alterada;
  SELECT EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo fp WHERE fp.status = 'aprovado'
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) >= fp.ano_inicio * 12 + fp.mes_inicio
                    AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) <  fp.ano_inicio * 12 + fp.mes_inicio + fp.qtd_meses) INTO periodo;

  IF q.pago_em IS NOT NULL THEN
    SELECT COALESCE(sum(COALESCE(lo.valor_original, lo.valor)), 0) INTO acumulado
      FROM public.fin_quitacoes q2 JOIN public.fin_lancamentos lo ON lo.id = q2.obrigacao_id
     WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
       AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
       AND EXTRACT(year FROM q2.pago_em) = EXTRACT(year FROM q.pago_em);
    FOR r IN SELECT q2.id FROM public.fin_quitacoes q2
              WHERE q2.responsavel_tipo = q.responsavel_tipo AND q2.responsavel_pessoa_id IS NOT DISTINCT FROM q.responsavel_pessoa_id
                AND q2.responsavel_fornecedor_id IS NOT DISTINCT FROM q.responsavel_fornecedor_id AND q2.pago_em IS NOT NULL
                AND date_trunc('quarter', q2.pago_em::timestamp) = date_trunc('quarter', q.pago_em::timestamp) LOOP
      IF public.fin_quitacao_grau_conjunto(r.id) = 'relatado' THEN relatadas := relatadas + 1; END IF;
    END LOOP;
  END IF;

  vencida := conj = 'relatado' AND ((q.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date + par.prazo_formalizacao_dias) < hoje;

  RETURN jsonb_build_object(
    'responsavel', q.responsavel_tipo, 'intencao', q.intencao, 'grau_responsavel', g->>'responsavel', 'grau_intencao', g->>'intencao',
    'natureza_item', to_jsonb(l.natureza_item), 'valor', COALESCE(l.valor_original, l.valor),
    'tem_nota_anexada', ('nota_fiscal' = ANY(tipos) OR 'xml' = ANY(tipos)), 'comprador_cnpj_igreja', (l.comprador = 'cnpj_igreja'),
    'chave_informada', (chave IS NOT NULL AND btrim(chave) <> ''), 'chave_valida', (chave IS NOT NULL AND public.fin_nfe_chave_valida(chave)), 'chave_confere_com_emitente', confere,
    'terceiro_no_circuito', no_circuito, 'terceiro_ministro', ministro, 'empresa_com_pagamentos_12m', com_pagamentos,
    'intencao_alterada_recentemente', alterada, 'pede_recibo_fiscal', q.pede_recibo, 'oferta_com_condicao', (q.condicao IS NOT NULL),
    'dias_entre_pagamento_e_declaracao', CASE WHEN q.declarado_em IS NOT NULL AND q.pago_em IS NOT NULL THEN to_jsonb(q.declarado_em - q.pago_em) ELSE 'null'::jsonb END,
    'acumulado_ano_do_terceiro', acumulado, 'qtd_relatadas_no_trimestre', relatadas, 'periodo_aprovado', periodo, 'formalizacao_vencida', vencida,
    'aprovado_pelo_administrador', (ap->>'relatado' = 'aprovada'),
    'teto_1', par.teto_1, 'prazo_declaracao_dias', par.prazo_declaracao_dias, 'teto_anual_terceiro', par.teto_anual_terceiro,
    'qtd_relatadas_trimestre', par.qtd_relatadas_trimestre, 'limite_capitalizacao', to_jsonb(par.limite_capitalizacao));
END
$function$;

CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro') THEN campos := array_append(campos, 'situação do pagamento'); END IF;
  IF array_length(campos, 1) IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e está congelada: não se altera %. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)',
    lpad(it.mes::text, 2, '0'), it.ano, array_to_string(campos, ', ');
END
$function$
;

DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;
CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();

-- 3) o que a fase criou
DROP FUNCTION IF EXISTS public.fin_lanc_declaracao_sincroniza();
DROP FUNCTION IF EXISTS public.fin_lanc_historico_declaracao();
DROP FUNCTION IF EXISTS public.fin_quitacao_eventos_sela();
DROP FUNCTION IF EXISTS public.fin_quitacao_tipos_validos(uuid);
DROP FUNCTION IF EXISTS public.fin_quitacao_selo(uuid);
DROP FUNCTION IF EXISTS public.fin_impacto_edicao(uuid, jsonb);
DROP FUNCTION IF EXISTS public.fin_nomes_dos_usuarios(uuid[]);
DROP FUNCTION IF EXISTS public.fin_nome_do_usuario(uuid);
DROP FUNCTION IF EXISTS public.fin_campos_declarados_alterados(public.fin_lancamentos, public.fin_lancamentos);
ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS motivo_edicao;

DO $rb$
DECLARE n bigint; e bigint;
BEGIN
  IF to_regclass('public.fin_lancamento_historico') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.fin_lancamento_historico' INTO n;
    IF n = 0 THEN
      DROP TABLE public.fin_lancamento_historico;
      DROP FUNCTION IF EXISTS public.fin_lancamento_historico_imutavel();
    ELSE
      RAISE NOTICE 'A trilha de edição tem % linha(s): é prova e FICA (a tabela e a imutabilidade seguem; só o gatilho que a alimenta saiu).', n;
    END IF;
  END IF;
  SELECT count(*) INTO e FROM public.fin_quitacao_eventos WHERE evento = 'declaracao_invalidada';
  IF e = 0 THEN
    ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT IF EXISTS fin_quitacao_eventos_evento_check;
    ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
      ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
       'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada'));
  ELSE
    RAISE NOTICE '% evento(s) declaracao_invalidada existem: o evento continua aceito (é história).', e;
  END IF;
END
$rb$;
