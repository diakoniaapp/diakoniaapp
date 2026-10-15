-- APLICAR — Fase 2B: MUDAR INTENÇÃO. Mesmo conteúdo da migration 20261016180000_fin_mudar_intencao.sql. Pode rodar duas vezes. Rollback: docs/MUDAR_INTENCAO_ROLLBACK.sql.
DO $g$
BEGIN
  IF to_regprocedure('public.fin_quitacao_tipos_validos(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 2A (A Declaração manda) ainda não está aplicada: aplique docs/DECLARACAO_MANDA_APLICAR.sql antes. Nada foi gravado.'; END IF;
  IF to_regclass('public.fin_declaracoes_terceiro') IS NULL THEN RAISE EXCEPTION 'A Declaração do Terceiro (Fase 1D-a) ainda não está aplicada. Nada foi gravado.'; END IF;
END
$g$;

-- ─── Fase 2B: MUDAR INTENÇÃO — Oferta ⇄ Reembolso, como ação própria (não é um "editar" genérico) ─────────────────────────────────────────────────────────────
-- Pedido (Telma, 15/10/2026): a intenção é o fato que a Declaração do Terceiro assina; mudá-la invalida a declaração, derruba toda aprovação, tira o Formal da intenção, reavalia a quitação, gera a
-- nova via e exige nova assinatura. Só com a obrigação em aberto, não enviada à contabilidade e fora de período fechado. Reembolso já pago NÃO volta a Oferta (é caso do futuro estorno).
-- Depende da Fase 2A (fin_quitacao_tipos_validos, selo, trilha) e da 1D-a (Declaração do Terceiro).
--
--   1. `fin_mudar_intencao(quitacao, nova, motivo)`: valida (papel, motivo ≥ 5, só Oferta⇄Reembolso, em aberto, não enviada, período aberto, reembolso sem pagamento), troca a intenção, zera a data da
--      declaração (a data da NOVA via nasce na assinatura), grava o evento `intencao_mudada` (de, para, motivo, quem, quando), reavalia a oferta e GERA a nova via da Declaração (versão seguinte do
--      mesmo número; as vias antigas ficam arquivadas e deixam de valer: o hash do "declarado" inclui a intenção). Devolve o id da nova via (nulo se ainda faltam dados para gerá-la).
--   2. Toda aprovação cai: o gatilho de histórico da quitação já grava `alterada` na troca, e a aprovação só vale se posterior à última mudança e com o mesmo selo (Fase 2A).
--   3. `fin_quitacoes_intencao_guarda` (BEFORE UPDATE OF intencao): a troca Oferta⇄Reembolso só passa por `fin_mudar_intencao` — `fin_alterar_quitacao` deixa de poder fazê-la às escondidas.
--   4. O histórico ganha o evento `intencao_mudada`.
-- Nenhum dado existente é alterado. Reversível: DROP da função e do gatilho (docs/MUDAR_INTENCAO_ROLLBACK.sql).

-- ── 1) o evento ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada', 'declaracao_invalidada', 'intencao_mudada'));
END $$;

-- ── 2) a guarda: Oferta⇄Reembolso só por aqui ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_quitacoes_intencao_guarda() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  IF OLD.intencao IN ('oferta', 'reembolso') AND NEW.intencao IN ('oferta', 'reembolso') AND OLD.intencao <> NEW.intencao
     AND COALESCE(current_setting('qibrj.mudanca_intencao', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Para mudar entre Oferta e Reembolso use a ação "Mudar intenção": ela invalida a declaração e as aprovações e gera a nova via para assinar.';
  END IF;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS fin_quitacoes_intencao_guarda ON public.fin_quitacoes;
CREATE TRIGGER fin_quitacoes_intencao_guarda BEFORE UPDATE OF intencao ON public.fin_quitacoes FOR EACH ROW EXECUTE FUNCTION public.fin_quitacoes_intencao_guarda();

-- ── 3) a ação ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_mudar_intencao(p_quitacao uuid, p_nova text, p_motivo text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; uid uuid := (SELECT auth.uid()); v_decl uuid := NULL; v_motivo text := btrim(COALESCE(p_motivo, ''));
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_rot text;
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para mudar a intenção.'; END IF;
  IF p_nova IS NULL OR p_nova NOT IN ('oferta', 'reembolso') THEN RAISE EXCEPTION 'A intenção só muda entre Oferta e Reembolso.'; END IF;
  IF char_length(v_motivo) < 5 THEN RAISE EXCEPTION 'Informe o motivo da mudança de intenção (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  IF q.intencao NOT IN ('oferta', 'reembolso') THEN RAISE EXCEPTION 'Só se muda a intenção de uma Oferta ou de um Reembolso (a atual é "%").', q.intencao; END IF;
  IF q.intencao = p_nova THEN RAISE EXCEPTION 'A intenção já é %.', CASE p_nova WHEN 'oferta' THEN 'Oferta' ELSE 'Reembolso' END; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a intenção não muda mais.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: a intenção só muda com a reabertura (Administrador ou Tesouraria, com motivo).'; END IF;
  IF (l.fechamento_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo fp WHERE fp.id = l.fechamento_id AND fp.status IN ('fechado', 'aprovado')))
     OR EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo fp WHERE fp.status = 'aprovado'
                  AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) >= fp.ano_inicio * 12 + fp.mes_inicio
                  AND (EXTRACT(year FROM l.data)::int * 12 + EXTRACT(month FROM l.data)::int) <  fp.ano_inicio * 12 + fp.mes_inicio + fp.qtd_meses) THEN
    RAISE EXCEPTION 'O período desta despesa está fechado: reabra o período antes de mudar a intenção.';
  END IF;
  IF q.intencao = 'reembolso' AND (EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.quitacao_id = q.id AND e.evento = 'reembolso_pago')
       OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND x.status::text IN ('realizado', 'conciliado'))) THEN
    RAISE EXCEPTION 'Este reembolso já foi pago (no todo ou em parte): a intenção não volta a ser Oferta. Para desfazer o pagamento use o fluxo de estorno do reembolso.';
  END IF;

  -- a mesma validação do registro, com a data da declaração de hoje só para passar (a data da nova via nasce na assinatura)
  PERFORM public.fin_quitacao_validar_campos(l.id, q.responsavel_tipo, q.responsavel_pessoa_id, q.responsavel_fornecedor_id, p_nova, q.pago_em, COALESCE(q.declarado_em, hoje));

  v_rot := 'Mudança de intenção de ' || CASE q.intencao WHEN 'oferta' THEN 'Oferta' ELSE 'Reembolso' END || ' para ' || CASE p_nova WHEN 'oferta' THEN 'Oferta' ELSE 'Reembolso' END || ': ' || v_motivo;
  PERFORM set_config('qibrj.mudanca_intencao', 'on', true);
  PERFORM set_config('qibrj.motivo', v_rot, true);
  UPDATE public.fin_quitacoes SET intencao = p_nova, declarado_em = NULL WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM set_config('qibrj.mudanca_intencao', '', true);

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, 'intencao_mudada', jsonb_build_object('intencao', q.intencao), jsonb_build_object('intencao', p_nova), v_motivo, uid);

  PERFORM public.fin_quitacao_sincronizar(l.id);                       -- a oferta extinta deixa de estar extinta; o reembolso nasce sem aprovação
  BEGIN
    v_decl := public.fin_gerar_declaracao_terceiro(q.id);              -- a nova via (versão seguinte); as antigas ficam arquivadas
  EXCEPTION WHEN OTHERS THEN
    v_decl := NULL;                                                    -- faltam dados (ex.: a forma de pagamento do terceiro): a tela pede e gera
  END;
  RETURN v_decl;
END
$fn$;

REVOKE EXECUTE ON FUNCTION public.fin_mudar_intencao(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_mudar_intencao(uuid, text, text) TO authenticated;

-- conferência (3 linhas com ok = true)
SELECT * FROM (VALUES
  ('função mudar intenção', to_regprocedure('public.fin_mudar_intencao(uuid,text,text)') IS NOT NULL),
  ('guarda da troca Oferta⇄Reembolso', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'fin_quitacoes_intencao_guarda' AND NOT tgisinternal)),
  ('evento intencao_mudada aceito', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND pg_get_constraintdef(oid) LIKE '%intencao_mudada%'))
) AS t(item, ok);
