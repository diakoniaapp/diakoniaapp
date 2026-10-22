-- ─── Resumo semanal CONFIGURÁVEL: quem recebe, o que recebe e em que ordem — decididos pela igreja, sem mexer em código (22/10/2026) ───────────────────────────────────────────────
--
-- Pedido dela (22/10/2026): até aqui o conteúdo era fixo, escrito na Edge Function (`resumo-semanal`): a Tesouraria recebia UMA frase com cinco contagens (fiscal legado vazio, caixas, aprovações que
-- não existem mais, centros acima do orçamento) e nada do que a Tesouraria vive — contas atrasadas, vencimentos, débitos automáticos, reembolsos, saldo. A administração passa a escolher, POR PERFIL
-- (Tesouraria, Secretaria, Pastoral, Administração): se o perfil recebe, quais blocos entram e em que ordem.
--
-- O QUE ESTA MIGRATION FAZ
--   1) `resumo_semanal_perfis` e `resumo_semanal_blocos`: SÓ as escolhas salvas (sobrescrevem o padrão que mora no código). Sem nada salvo, vale o padrão do catálogo
--      (supabase/functions/_shared/resumoSemanal/catalogo.ts). Leitura: admin e diakonia. Escrita: só pela função abaixo.
--   2) `sistema_resumo_semanal_salvar_config(jsonb)`: grava a configuração inteira, tudo ou nada, com a mesma guarda das outras funções de configuração (admin ou diakonia).
--   3) `resumo_semanal_pessoas_por_perfil()` / `resumo_semanal_destinatarios_v2()` / `sistema_resumo_semanal_pessoas()`: quem tem cada perfil e o e-mail real (membros.email), agora incluindo
--      Administração (papéis admin e diakonia). A função ANTIGA `resumo_semanal_destinatarios()` NÃO muda — a Edge Function que está no ar hoje continua funcionando até a nova ser implantada.
--   4) `resumo_semanal_obrigacoes_abertas()` (interna) e `resumo_semanal_digest()` ACRESCENTADA: as chaves antigas continuam idênticas; entram os números dos blocos novos da Tesouraria — contas
--      atrasadas, vencimentos até sábado, débitos automáticos, reembolsos a pagar e saldo das contas — com as mesmas definições do Painel da Tesouraria (ver abaixo).
--
-- AS DEFINIÇÕES (iguais às do painel, para o e-mail não contradizer a tela)
--   · Obrigação em aberto = lançamento de saída PREVISTO, fora transferência (a parte que falta de um pagamento parcial é uma linha prevista própria).
--   · Conta atrasada = em aberto com vencimento antes de hoje e que NÃO é pagamento automático (esses viram "possível falha" no bloco de débitos). Inclui o reembolso a pagar, como o painel.
--   · Vencimentos da semana = em aberto, não automático, de HOJE até o sábado da semana do resumo (domingo a sábado, como o resto do resumo).
--   · Débito automático = forma de liquidação debito_automatico, pix_recorrente ou transferencia_programada. Venceu há até 3 dias e segue previsto = aguardando o banco; passou de 3 dias = possível
--     falha (a tolerância de `DIAS_DE_TOLERANCIA_DO_DEBITO`, lib/formaLiquidacao.ts).
--   · Reembolso a pagar = `vw_fin_quitacao` na fila `reembolso_a_pagar`, pelo saldo a reembolsar.
--   · Saldo das contas = soma de `fin_contas.saldo_atual` das contas ativas (o "Saldo nas contas" do painel), com cada conta.
--
-- O QUE FICA DE FORA, DE PROPÓSITO (blocos "em preparação" no catálogo): Prontidão do Malote, Documentos pendentes e Recursos reservados. A regra de completude documental e o Fundo Missionário vivem em
-- TypeScript no app; reescrevê-las em SQL criaria uma segunda regra que um dia diverge da tela. Entram numa próxima etapa, lendo o MESMO cálculo.
--
-- ORDEM DE APLICAÇÃO: 1º esta migration, 2º implantar a Edge Function (`supabase functions deploy resumo-semanal --no-verify-jwt`). Aplicada sozinha ela não muda nada do que já sai por e-mail.
-- Reverter: docs/RESUMO_SEMANAL_CONFIGURAVEL_ROLLBACK.sql. Ensaio: docs/RESUMO_SEMANAL_CONFIGURAVEL_ENSAIO.mjs.

-- 1) as escolhas salvas ---------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resumo_semanal_perfis (
  perfil         text PRIMARY KEY CHECK (perfil IN ('tesouraria', 'secretaria', 'pastoral', 'administracao')),
  ativo          boolean NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
CREATE TABLE IF NOT EXISTS public.resumo_semanal_blocos (
  perfil text NOT NULL REFERENCES public.resumo_semanal_perfis (perfil) ON DELETE CASCADE,
  bloco  text NOT NULL CHECK (length(btrim(bloco)) BETWEEN 1 AND 60),
  ativo  boolean NOT NULL DEFAULT true,
  ordem  integer NOT NULL CHECK (ordem BETWEEN 0 AND 1000),
  PRIMARY KEY (perfil, bloco)
);
COMMENT ON TABLE public.resumo_semanal_perfis IS 'Escolhas da administração para o resumo semanal por e-mail: o perfil recebe ou não. Sem linha = padrão do catálogo (recebe).';
COMMENT ON TABLE public.resumo_semanal_blocos IS 'Escolhas da administração: quais blocos entram no resumo de cada perfil e em que ordem. Sem linhas = padrão do catálogo (supabase/functions/_shared/resumoSemanal/catalogo.ts).';

ALTER TABLE public.resumo_semanal_perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumo_semanal_blocos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumo_semanal_perfis, public.resumo_semanal_blocos FROM PUBLIC, anon;
GRANT SELECT ON public.resumo_semanal_perfis, public.resumo_semanal_blocos TO authenticated;
DROP POLICY IF EXISTS "Ver config do resumo" ON public.resumo_semanal_perfis;
CREATE POLICY "Ver config do resumo" ON public.resumo_semanal_perfis FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'diakonia'::app_role));
DROP POLICY IF EXISTS "Ver config do resumo" ON public.resumo_semanal_blocos;
CREATE POLICY "Ver config do resumo" ON public.resumo_semanal_blocos FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'admin'::app_role) OR has_role((SELECT auth.uid()), 'diakonia'::app_role));

-- 2) salvar a configuração inteira (tudo ou nada) -------------------------------------------------------------------------------------------------------------------------------------
-- p_perfis = [{"perfil":"tesouraria","ativo":true,"blocos":[{"bloco":"contas_atrasadas","ativo":true,"ordem":1}, ...]}, ...]
CREATE OR REPLACE FUNCTION public.sistema_resumo_semanal_salvar_config(p_perfis jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p jsonb; b jsonb; v_perfil text;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF p_perfis IS NULL OR jsonb_typeof(p_perfis) <> 'array' THEN RAISE EXCEPTION 'Configuração inválida: esperava uma lista de perfis.'; END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(p_perfis) LOOP
    v_perfil := p->>'perfil';
    IF v_perfil IS NULL OR v_perfil NOT IN ('tesouraria', 'secretaria', 'pastoral', 'administracao') THEN
      RAISE EXCEPTION 'Perfil desconhecido: %.', COALESCE(v_perfil, '(vazio)');
    END IF;
    IF jsonb_typeof(COALESCE(p->'blocos', '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Os blocos do perfil % precisam ser uma lista.', v_perfil; END IF;

    INSERT INTO public.resumo_semanal_perfis (perfil, ativo, atualizado_em, atualizado_por)
    VALUES (v_perfil, COALESCE((p->>'ativo')::boolean, true), now(), auth.uid())
    ON CONFLICT (perfil) DO UPDATE SET ativo = EXCLUDED.ativo, atualizado_em = now(), atualizado_por = auth.uid();

    DELETE FROM public.resumo_semanal_blocos WHERE perfil = v_perfil;
    FOR b IN SELECT * FROM jsonb_array_elements(COALESCE(p->'blocos', '[]'::jsonb)) LOOP
      INSERT INTO public.resumo_semanal_blocos (perfil, bloco, ativo, ordem)
      VALUES (v_perfil, btrim(b->>'bloco'), COALESCE((b->>'ativo')::boolean, true), (b->>'ordem')::int);
    END LOOP;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.sistema_resumo_semanal_salvar_config(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_semanal_salvar_config(jsonb) TO authenticated;

-- 3) quem tem cada perfil ---------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Administração = papéis admin e diakonia; Pastoral = papel pastor. O e-mail é o REAL (membros.email): o de `auth.users` é fabricado do telefone (CLAUDE.md §5.1).
CREATE OR REPLACE FUNCTION public.resumo_semanal_pessoas_por_perfil()
RETURNS TABLE(perfil text, nome text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- DISTINCT: quem tem admin E diakonia (a Telma) é UMA pessoa do perfil Administração, não duas
  SELECT DISTINCT CASE ur.role::text WHEN 'tesouraria' THEN 'tesouraria' WHEN 'secretaria' THEN 'secretaria' WHEN 'pastor' THEN 'pastoral' ELSE 'administracao' END,
         COALESCE(m.nome_completo, pr.nome, '(sem nome)'),
         NULLIF(btrim(m.email), '')
    FROM user_roles ur
    JOIN profiles pr ON pr.id = ur.user_id
    LEFT JOIN membros m ON m.id = pr.pessoa_id
   WHERE ur.role::text IN ('tesouraria', 'secretaria', 'pastor', 'admin', 'diakonia');
$$;
REVOKE ALL ON FUNCTION public.resumo_semanal_pessoas_por_perfil() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_pessoas_por_perfil() TO service_role;

-- quem RECEBE: tem e-mail e o perfil está ligado (sem linha salva = ligado)
CREATE OR REPLACE FUNCTION public.resumo_semanal_destinatarios_v2()
RETURNS TABLE(perfil text, email text, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.perfil, p.email, p.nome
    FROM public.resumo_semanal_pessoas_por_perfil() p
   WHERE p.email IS NOT NULL
     AND COALESCE((SELECT s.ativo FROM public.resumo_semanal_perfis s WHERE s.perfil = p.perfil), true);
$$;
REVOKE ALL ON FUNCTION public.resumo_semanal_destinatarios_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_destinatarios_v2() TO service_role;

-- para a tela: TODAS as pessoas de cada perfil, inclusive quem está sem e-mail (para a administração ver quem não recebe e por quê)
CREATE OR REPLACE FUNCTION public.sistema_resumo_semanal_pessoas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'diakonia'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('perfil', x.perfil, 'nome', x.nome, 'email', x.email) ORDER BY x.perfil, x.nome)
                     FROM (SELECT DISTINCT perfil, nome, email FROM public.resumo_semanal_pessoas_por_perfil()) x), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.sistema_resumo_semanal_pessoas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sistema_resumo_semanal_pessoas() TO authenticated;

-- 4) os números dos blocos novos ----------------------------------------------------------------------------------------------------------------------------------------------------------
-- As obrigações em aberto (saída prevista, fora transferência), com quem é o favorecido e se o pagamento é automático. Interna: só a função do resumo a chama.
CREATE OR REPLACE FUNCTION public.resumo_semanal_obrigacoes_abertas()
RETURNS TABLE(id uuid, data date, valor numeric, quem text, automatica boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" = 'America/Sao_Paulo'
AS $$
  SELECT l.id, l.data, l.valor,
         COALESCE(NULLIF(btrim(f.nome), ''), NULLIF(btrim(m.nome_completo), ''), NULLIF(btrim(l.descricao), ''), 'Sem favorecido'),
         COALESCE(l.forma_liquidacao::text, 'manual') IN ('debito_automatico', 'pix_recorrente', 'transferencia_programada')
    FROM fin_lancamentos l
    LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
    LEFT JOIN membros m ON m.id = l.pessoa_id
   WHERE l.tipo::text = 'saida' AND l.status::text = 'previsto' AND l.origem::text IS DISTINCT FROM 'transferencia';
$$;
REVOKE ALL ON FUNCTION public.resumo_semanal_obrigacoes_abertas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_obrigacoes_abertas() TO service_role;

-- O digest: as chaves antigas IDÊNTICAS às da 20260909190000; acrescenta as da Tesouraria. `TimeZone` fixo em Brasília: CURRENT_DATE passa a ser a data de Brasília (a do banco é UTC).
CREATE OR REPLACE FUNCTION public.resumo_semanal_digest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET "TimeZone" = 'America/Sao_Paulo'
AS $$
DECLARE
  v_pastoral        jsonb;
  v_secretaria      jsonb;
  v_tesouraria      jsonb;
  v_fiscal          record;
  v_prox_domingo    date;
  v_dias_cobertura  int;
  v_sabado          date;
BEGIN
  v_prox_domingo   := CURRENT_DATE + ((7 - EXTRACT(DOW FROM CURRENT_DATE)::int) % 7);
  v_dias_cobertura := (v_prox_domingo - CURRENT_DATE) + 6;
  v_sabado         := v_prox_domingo + 6;

  -- ── Pastoral ──────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'aniversarios_semana', (
      SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p
       WHERE p.tipo = 'aniversario'
         AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6
    ),
    'bodas_semana', (
      SELECT count(*)::int FROM agenda_pastoral_proximos_dias(v_dias_cobertura) p
       WHERE p.tipo = 'casamento'
         AND p.data_evento BETWEEN v_prox_domingo AND v_prox_domingo + 6
    ),
    'visitantes_sem_contato', (
      SELECT count(*) FROM membros
      WHERE tipo_pessoa = 'visitante' AND status = 'ativo'
        AND (ultimo_contato_em IS NULL OR ultimo_contato_em < now() - interval '7 days')
    ),
    'candidatos_batismo', (
      SELECT count(*) FROM membros
      WHERE tipo_pessoa = 'congregado' AND status = 'ativo'
        AND data_nascimento IS NOT NULL
        AND date_part('year', age(data_nascimento)) >= 9
    )
  ) INTO v_pastoral;

  -- ── Secretaria ────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'sem_telefone', (
      SELECT count(*) FROM membros
      WHERE status = 'ativo'
        AND (telefone_celular IS NULL OR telefone_celular = '')
        AND COALESCE(telefone_dispensado, false) = false
    ),
    'membresia_em_andamento', (
      SELECT count(*) FROM solicitacoes_membresia
      WHERE status IN ('rascunho', 'aguardando_documento', 'pronta_assembleia')
    ),
    'atas_pendentes', (
      SELECT count(*) FROM gov_reunioes WHERE status = 'concluida' AND ata_url IS NULL
    ),
    'pautas_rascunho', (
      SELECT count(*) FROM gov_pautas WHERE status = 'rascunho'
    )
  ) INTO v_secretaria;

  -- ── Tesouraria ────────────────────────────────────────────────────
  SELECT * INTO v_fiscal FROM fiscal_resumo_dashboard();

  SELECT jsonb_build_object(
    'fiscal_atrasados', COALESCE(v_fiscal.total_atrasados, 0),
    'fiscal_urgentes',  COALESCE(v_fiscal.total_urgentes, 0),
    'caixas_abertos', (
      SELECT count(*) FROM arr_caixas WHERE estado = 'aberto' AND arquivado_em IS NULL
    ),
    'aprovacoes_pendentes', (
      SELECT count(*) FROM fin_lancamentos WHERE status = 'aguardando_aprovacao'
    ),
    'centros_criticos', (
      SELECT count(*) FROM fin_alertas_centros() WHERE tipo_alerta = 'acima_orcamento'
    ),
    -- contas atrasadas: em aberto, venceram antes de hoje, não são pagamento automático (esses são "possível falha")
    'contas_atrasadas', (
      SELECT jsonb_build_object(
        'n', count(*), 'total', COALESCE(sum(o.valor), 0),
        'itens', COALESCE((SELECT jsonb_agg(jsonb_build_object('quem', t.quem, 'vencimento', t.data, 'valor', t.valor) ORDER BY t.data, t.valor DESC)
                             FROM (SELECT * FROM resumo_semanal_obrigacoes_abertas() x WHERE NOT x.automatica AND x.data < CURRENT_DATE ORDER BY x.data, x.valor DESC LIMIT 5) t), '[]'::jsonb))
        FROM resumo_semanal_obrigacoes_abertas() o WHERE NOT o.automatica AND o.data < CURRENT_DATE
    ),
    -- vencimentos: de hoje até o sábado da semana do resumo, não automáticos
    'vencimentos_semana', (
      SELECT jsonb_build_object(
        'ate', v_sabado, 'n', count(*), 'total', COALESCE(sum(o.valor), 0),
        'itens', COALESCE((SELECT jsonb_agg(jsonb_build_object('quem', t.quem, 'vencimento', t.data, 'valor', t.valor) ORDER BY t.data, t.valor DESC)
                             FROM (SELECT * FROM resumo_semanal_obrigacoes_abertas() x WHERE NOT x.automatica AND x.data BETWEEN CURRENT_DATE AND v_sabado ORDER BY x.data, x.valor DESC LIMIT 5) t), '[]'::jsonb))
        FROM resumo_semanal_obrigacoes_abertas() o WHERE NOT o.automatica AND o.data BETWEEN CURRENT_DATE AND v_sabado
    ),
    -- débitos automáticos: previstos até sábado; venceu há até 3 dias = aguardando o banco; mais que isso = possível falha
    'debitos_automaticos', (
      SELECT jsonb_build_object(
        'ate', v_sabado,
        'previstos_n', count(*) FILTER (WHERE o.data BETWEEN CURRENT_DATE AND v_sabado),
        'previstos_total', COALESCE(sum(o.valor) FILTER (WHERE o.data BETWEEN CURRENT_DATE AND v_sabado), 0),
        'aguardando_n', count(*) FILTER (WHERE o.data < CURRENT_DATE AND o.data + 3 >= CURRENT_DATE),
        'possivel_falha_n', count(*) FILTER (WHERE o.data + 3 < CURRENT_DATE),
        'possivel_falha_total', COALESCE(sum(o.valor) FILTER (WHERE o.data + 3 < CURRENT_DATE), 0),
        'itens', COALESCE((SELECT jsonb_agg(jsonb_build_object('quem', t.quem, 'vencimento', t.data, 'valor', t.valor) ORDER BY t.data)
                             FROM (SELECT * FROM resumo_semanal_obrigacoes_abertas() x WHERE x.automatica AND x.data + 3 < CURRENT_DATE ORDER BY x.data LIMIT 5) t), '[]'::jsonb))
        FROM resumo_semanal_obrigacoes_abertas() o WHERE o.automatica
    ),
    -- reembolsos que a igreja ainda deve (fila "reembolso a pagar" da Quitação)
    'reembolsos', (
      SELECT jsonb_build_object('n', count(*), 'total', COALESCE(sum(COALESCE(q.saldo_a_reembolsar, q.valor_obrigacao)), 0))
        FROM vw_fin_quitacao q WHERE q.fila = 'reembolso_a_pagar'
    ),
    -- saldo das contas ativas (o "Saldo nas contas" do painel), com cada conta
    'saldo_contas', (
      SELECT jsonb_build_object(
        'total', COALESCE(sum(c.saldo_atual), 0),
        'contas', COALESCE(jsonb_agg(jsonb_build_object('nome', c.nome, 'saldo', c.saldo_atual) ORDER BY c.ordem, c.nome), '[]'::jsonb))
        FROM fin_contas c WHERE c.ativo
    )
  ) INTO v_tesouraria;

  RETURN jsonb_build_object(
    'pastoral', v_pastoral,
    'secretaria', v_secretaria,
    'tesouraria', v_tesouraria,
    'gerado_em', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resumo_semanal_digest() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.resumo_semanal_digest() TO service_role;
