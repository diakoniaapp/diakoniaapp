-- ─── RASCUNHO PARA REVISÃO — AutoCadastro de Visitantes por QR Code ──────────────────────────────────────────
--
-- NÃO É UMA MIGRATION: está em docs/ de propósito. Só vira migration depois da sua aprovação, e então é ensaiada com
-- BEGIN/ROLLBACK. NÃO ENSAIADA e NÃO APLICADA. Modelagem, fluxo, riscos e decisões: docs/AUTOCADASTRO_VISITANTES_QR.md
--
-- PRINCÍPIO DE SEGURANÇA: a página é PÚBLICA (o visitante não tem login). O anônimo NÃO ganha acesso a tabela nenhuma —
-- continua bloqueado em membros, visitas, consentimento etc. (RLS). Ele só pode chamar UMA função, `visitante_autocadastro`,
-- que valida tudo, grava e devolve apenas {ok, visita, novo}: nunca id, nunca dado de ninguém, nunca "este telefone já existe".
--
-- O QUE ENTRA
--   1. visitante_pontos      o QR (código aleatório; desligável; trocável se vazar)
--   2. visitante_sessoes     "culto/evento de hoje", escolhido na recepção (opcional)
--   3. visitante_checkins    cada preenchimento do formulário: a visita + o que o visitante pediu (oração, contato…)
--   4. membros.whatsapp_celular  (nova, opcional) para o WhatsApp quando difere do telefone
--   5. visitante_autocadastro()  a porta única
--   6. vw_visitantes_de_hoje / vw_visitantes_aguardando_contato  (painel da recepção e fila pastoral)
-- Reaproveita, sem alterar: membros (tipo_pessoa='visitante'), visitas, acompanhamentos_visitante,
-- normalizar_telefone(), numero_visitas e status_acolhimento (o fluxo de acolhimento existente continua valendo).

-- ── 1) o QR ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_pontos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),   -- 32 hex aleatórios: não se adivinha
  nome       text NOT NULL,                                                            -- ex.: "Recepção — porta principal"
  ativo      boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── 2) culto/evento do dia (opcional; sem isso o culto é deduzido do dia e da hora) ───────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_sessoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data       date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  culto      text NOT NULL,
  evento_id  uuid REFERENCES public.eventos(id) ON DELETE SET NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitante_sessoes_data_idx ON public.visitante_sessoes (data DESC, created_at DESC);

-- ── 3) cada preenchimento ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_checkins (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id          uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  visita_id          uuid REFERENCES public.visitas(id) ON DELETE SET NULL,
  ponto_id           uuid REFERENCES public.visitante_pontos(id) ON DELETE SET NULL,
  data_visita        date NOT NULL,
  culto              text,
  evento_id          uuid REFERENCES public.eventos(id) ON DELETE SET NULL,
  origem             text NOT NULL DEFAULT 'qr_code',
  novo_cadastro      boolean NOT NULL,                       -- true = criou a pessoa; false = visita de quem já existia
  tipo_pessoa_na_hora text,                                  -- visitante | congregado | membro (quem já existia)
  primeira_visita    boolean,                                -- o que o visitante DISSE (não é contagem do sistema)
  deseja_contato     boolean NOT NULL DEFAULT false,
  deseja_informacoes boolean NOT NULL DEFAULT false,
  oracao_familia     boolean NOT NULL DEFAULT false,
  oracao_saude       boolean NOT NULL DEFAULT false,
  oracao_trabalho    boolean NOT NULL DEFAULT false,
  oracao_outro       text,
  como_conheceu      text,
  quem_convidou      text,
  whatsapp           text,
  aceite_texto_versao text NOT NULL DEFAULT 'autocadastro-1.0',   -- a prova do aceite LGPD: qual texto o visitante concordou, e quando (criado_em)
  -- fila pastoral: 1 = pediu oração · 2 = quer contato pastoral · 3 = os demais
  prioridade         smallint GENERATED ALWAYS AS (
                       CASE WHEN oracao_familia OR oracao_saude OR oracao_trabalho OR oracao_outro IS NOT NULL THEN 1
                            WHEN deseja_contato THEN 2 ELSE 3 END) STORED,
  tratado_em         timestamptz,                            -- a equipe pastoral deu retorno
  tratado_por        uuid,
  tratado_obs        text,
  criado_em          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitante_checkins_membro_idx ON public.visitante_checkins (membro_id, data_visita DESC);
CREATE INDEX IF NOT EXISTS visitante_checkins_dia_idx    ON public.visitante_checkins (data_visita DESC, criado_em DESC);
CREATE INDEX IF NOT EXISTS visitante_checkins_fila_idx   ON public.visitante_checkins (prioridade, criado_em) WHERE tratado_em IS NULL;

-- ── 4) WhatsApp separado do telefone (mesma regra de formato de telefone_celular) ──────────────────────────
ALTER TABLE public.membros ADD COLUMN IF NOT EXISTS whatsapp_celular text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_whatsapp_celular_formato') THEN
    ALTER TABLE public.membros ADD CONSTRAINT membros_whatsapp_celular_formato
      CHECK (whatsapp_celular IS NULL OR whatsapp_celular ~ '^55[0-9]{10,11}$');
  END IF;
END $$;

-- ── RLS: anônimo bloqueado em tudo; a equipe lê/gerencia (mesmos papéis que já leem `visitas`) ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['visitante_pontos', 'visitante_sessoes', 'visitante_checkins'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Bloqueia anon" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Bloqueia anon" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
    EXECUTE format('DROP POLICY IF EXISTS "Equipe de acolhimento" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "Equipe de acolhimento" ON public.%I FOR ALL TO authenticated
      USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'pastor'::app_role]))
      WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'pastor'::app_role]))$p$, t);
  END LOOP;
END $$;

-- o QR inicial: um ponto "Recepção", criado uma vez (a tela mostra o código para imprimir)
INSERT INTO public.visitante_pontos (nome) SELECT 'Recepção' WHERE NOT EXISTS (SELECT 1 FROM public.visitante_pontos);

-- ── 5) a porta única ────────────────────────────────────────────────────────────────────────────────────
-- p_dados (jsonb): nome, data_nascimento (AAAA-MM-DD), telefone, whatsapp, endereco, como_conheceu, como_conheceu_outro,
--   quem_convidou, oracao_familia, oracao_saude, oracao_trabalho, oracao_outro (texto), primeira_visita, deseja_contato,
--   deseja_informacoes, lgpd_aceito.
-- Devolve {"ok": true, "visita": N, "novo": true|false}. Erro de preenchimento = exceção com mensagem em português.
CREATE OR REPLACE FUNCTION public.visitante_autocadastro(p_codigo text, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_ponto  public.visitante_pontos%ROWTYPE;
  v_agora  timestamp := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_hoje   date := v_agora::date;
  v_nome   text := btrim(regexp_replace(coalesce(p_dados->>'nome', ''), '\s+', ' ', 'g'));
  v_tel    text := public.normalizar_telefone(p_dados->>'telefone');
  v_zap    text := public.normalizar_telefone(p_dados->>'whatsapp');
  v_nasc   date;
  v_end    text := nullif(btrim(left(coalesce(p_dados->>'endereco', ''), 300)), '');
  v_como   text := nullif(p_dados->>'como_conheceu', '');
  v_como_o text := nullif(btrim(left(coalesce(p_dados->>'como_conheceu_outro', ''), 200)), '');
  v_quem   text := nullif(btrim(left(coalesce(p_dados->>'quem_convidou', ''), 120)), '');
  v_or_out text := nullif(btrim(left(coalesce(p_dados->>'oracao_outro', ''), 500)), '');
  v_culto  text; v_evento uuid; v_sessao public.visitante_sessoes%ROWTYPE;
  v_m      public.membros%ROWTYPE; v_novo boolean := false; v_visita uuid; v_n int; v_acao boolean;
  v_dias   text[] := ARRAY['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
BEGIN
  SELECT * INTO v_ponto FROM public.visitante_pontos WHERE codigo = p_codigo AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Este link de cadastro não está mais ativo. Procure a recepção.'; END IF;

  -- freio contra enxurrada (o link é público): no máximo 40 preenchimentos por 10 minutos, no total
  IF (SELECT count(*) FROM public.visitante_checkins WHERE criado_em > now() - interval '10 minutes') >= 40 THEN
    RAISE EXCEPTION 'Muitos cadastros ao mesmo tempo. Tente novamente em alguns instantes.';
  END IF;

  IF coalesce(p_dados->>'lgpd_aceito', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Para registrar a visita é preciso concordar com o uso dos seus dados.';
  END IF;
  IF length(v_nome) < 3 OR length(v_nome) > 120 OR v_nome !~ '[[:alpha:]]{2}' THEN
    RAISE EXCEPTION 'Informe seu nome completo.';
  END IF;
  v_tel := COALESCE(v_tel, v_zap);
  IF v_tel IS NULL THEN RAISE EXCEPTION 'Informe um telefone ou WhatsApp válido, com DDD.'; END IF;
  v_zap := COALESCE(v_zap, v_tel);   -- um número só: vale para os dois

  BEGIN v_nasc := (p_dados->>'data_nascimento')::date; EXCEPTION WHEN OTHERS THEN v_nasc := NULL; END;
  IF v_nasc IS NOT NULL AND (v_nasc < DATE '1900-01-01' OR v_nasc > v_hoje) THEN v_nasc := NULL; END IF;

  IF v_como IS NOT NULL AND v_como NOT IN ('amigo_familiar', 'redes_sociais', 'evento_igreja', 'vizinhanca', 'outros') THEN v_como := NULL; END IF;
  IF v_como IS DISTINCT FROM 'amigo_familiar' THEN v_quem := NULL; END IF;
  IF v_como IS DISTINCT FROM 'outros' THEN v_como_o := NULL; END IF;

  -- culto/evento: o que a recepção marcou para hoje; senão deduzido do dia e da hora
  SELECT * INTO v_sessao FROM public.visitante_sessoes WHERE data = v_hoje AND ativo ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN v_culto := v_sessao.culto; v_evento := v_sessao.evento_id;
  ELSE v_culto := 'Culto de ' || v_dias[extract(dow FROM v_agora)::int + 1]
                  || CASE WHEN extract(hour FROM v_agora) < 12 THEN ' (manhã)' WHEN extract(hour FROM v_agora) < 18 THEN ' (tarde)' ELSE ' (noite)' END;
  END IF;

  -- quem já existe? o telefone (ou o WhatsApp) pelos últimos 11 dígitos, qualquer vínculo (visitante, congregado, membro)
  SELECT * INTO v_m FROM public.membros m
   WHERE right(regexp_replace(coalesce(m.telefone_celular, ''), '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11))
      OR right(regexp_replace(coalesce(m.telefone_e164, ''),    '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11))
   ORDER BY (m.tipo_pessoa = 'visitante') DESC, m.created_at LIMIT 1;

  IF FOUND THEN
    -- o MESMO preenchimento enviado duas vezes no mesmo dia/culto não vira duas visitas
    SELECT count(*) INTO v_n FROM public.visitante_checkins
     WHERE membro_id = v_m.id AND data_visita = v_hoje AND culto IS NOT DISTINCT FROM v_culto;
    IF v_n > 0 THEN RETURN jsonb_build_object('ok', true, 'visita', v_m.numero_visitas, 'novo', false); END IF;

    IF v_m.tipo_pessoa = 'visitante' THEN
      INSERT INTO public.visitas (membro_id, data, origem, observacoes) VALUES (v_m.id, v_hoje, 'qr_code', v_culto) RETURNING id INTO v_visita;
      UPDATE public.membros SET
          numero_visitas   = COALESCE(numero_visitas, 1) + 1,
          -- só PREENCHE o que estava vazio: quem sabe o telefone de um visitante não pode reescrever os dados dele
          data_nascimento  = COALESCE(data_nascimento, v_nasc),
          endereco         = COALESCE(endereco, v_end),
          whatsapp_celular = COALESCE(whatsapp_celular, v_zap),
          como_conheceu    = COALESCE(como_conheceu, v_como),
          como_conheceu_descricao = COALESCE(como_conheceu_descricao, v_como_o),
          convidado_nome   = COALESCE(convidado_nome, v_quem),   -- (membros.quem_convidou é UUID de membro; o nome livre mora em convidado_nome)
          lgpd_aceito      = true,
          data_aceite_lgpd = COALESCE(data_aceite_lgpd, now())
       WHERE id = v_m.id RETURNING numero_visitas INTO v_n;
    ELSE
      v_n := NULL;   -- congregado/membro preencheu o cartão: fica o registro do check-in, a ficha não muda
    END IF;
  ELSE
    v_novo := true;
    INSERT INTO public.membros (nome_completo, tipo_pessoa, status, status_acolhimento, numero_visitas, origem_cadastro,
                                telefone_celular, whatsapp_celular, data_nascimento, endereco,
                                como_conheceu, como_conheceu_descricao, convidado_nome, lgpd_aceito, data_aceite_lgpd)
    VALUES (v_nome, 'visitante', 'ativo', 'novo', 1, 'qr_code',
            v_tel, v_zap, v_nasc, v_end, v_como, v_como_o, v_quem, true, now())
    RETURNING * INTO v_m;
    INSERT INTO public.visitas (membro_id, data, origem, observacoes) VALUES (v_m.id, v_hoje, 'qr_code', v_culto) RETURNING id INTO v_visita;
    v_n := 1;
  END IF;

  INSERT INTO public.visitante_checkins (membro_id, visita_id, ponto_id, data_visita, culto, evento_id, novo_cadastro, tipo_pessoa_na_hora,
      primeira_visita, deseja_contato, deseja_informacoes, oracao_familia, oracao_saude, oracao_trabalho, oracao_outro,
      como_conheceu, quem_convidou, whatsapp)
  VALUES (v_m.id, v_visita, v_ponto.id, v_hoje, v_culto, v_evento, v_novo, v_m.tipo_pessoa::text,
      CASE WHEN p_dados->>'primeira_visita' IN ('true', 'false') THEN (p_dados->>'primeira_visita')::boolean END,
      coalesce(p_dados->>'deseja_contato', 'false') = 'true', coalesce(p_dados->>'deseja_informacoes', 'false') = 'true',
      coalesce(p_dados->>'oracao_familia', 'false') = 'true', coalesce(p_dados->>'oracao_saude', 'false') = 'true',
      coalesce(p_dados->>'oracao_trabalho', 'false') = 'true', v_or_out,
      v_como, v_quem, v_zap);

  -- O aceite LGPD fica provado no próprio check-in (aceite_texto_versao + criado_em) e em membros.lgpd_aceito/data_aceite_lgpd.
  -- (A tabela `consentimento` NÃO serve aqui: sua chave pessoa_id aponta para `pessoas`, outra tabela, e não para `membros`.)

  -- "Acompanhamento Pastoral": quem pediu oração ou contato entra como pendente (a tela de acompanhamento já existente)
  v_acao := coalesce(p_dados->>'deseja_contato', 'false') = 'true' OR coalesce(p_dados->>'oracao_familia', 'false') = 'true'
         OR coalesce(p_dados->>'oracao_saude', 'false') = 'true' OR coalesce(p_dados->>'oracao_trabalho', 'false') = 'true' OR v_or_out IS NOT NULL;
  IF v_acao AND v_m.tipo_pessoa = 'visitante' AND NOT EXISTS (
       SELECT 1 FROM public.acompanhamentos_visitante WHERE membro_id = v_m.id AND status IN ('pendente', 'em_andamento')) THEN
    INSERT INTO public.acompanhamentos_visitante (membro_id, status, proximo_passo)
    VALUES (v_m.id, 'pendente', 'Visitante pediu oração ou contato pastoral pelo cadastro do QR Code');
  END IF;

  RETURN jsonb_build_object('ok', true, 'visita', v_n, 'novo', v_novo);
END
$fn$;

COMMENT ON FUNCTION public.visitante_autocadastro IS 'Porta única do AutoCadastro por QR Code. Chamável por anon; valida tudo; devolve só {ok, visita, novo}. Nunca revela se o telefone já existia.';

REVOKE ALL ON FUNCTION public.visitante_autocadastro(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitante_autocadastro(text, jsonb) TO anon, authenticated;

-- ── 6) painéis (security_invoker: valem as permissões de quem consulta) ─────────────────────────────────
CREATE OR REPLACE VIEW public.vw_visitantes_de_hoje WITH (security_invoker = true) AS
SELECT c.id AS checkin_id, c.membro_id, m.nome_completo, m.telefone_celular, COALESCE(m.whatsapp_celular, m.telefone_celular) AS whatsapp,
       m.tipo_pessoa, m.numero_visitas, c.novo_cadastro, c.culto, c.data_visita, c.criado_em, c.prioridade,
       c.deseja_contato, c.oracao_familia, c.oracao_saude, c.oracao_trabalho, (c.oracao_outro IS NOT NULL) AS oracao_outro
  FROM public.visitante_checkins c JOIN public.membros m ON m.id = c.membro_id
 WHERE c.data_visita = ((now() AT TIME ZONE 'America/Sao_Paulo')::date)
 ORDER BY c.criado_em DESC;

-- Fila pastoral: quem ainda não recebeu retorno. "Tratado" = marcado pela equipe OU já houve um contato registrado na ficha depois do check-in.
CREATE OR REPLACE VIEW public.vw_visitantes_aguardando_contato WITH (security_invoker = true) AS
SELECT c.id AS checkin_id, c.membro_id, m.nome_completo, m.telefone_celular, COALESCE(m.whatsapp_celular, m.telefone_celular) AS whatsapp,
       m.numero_visitas, m.status_acolhimento, c.data_visita, c.culto, c.criado_em, c.prioridade,
       c.deseja_contato, c.deseja_informacoes, c.oracao_familia, c.oracao_saude, c.oracao_trabalho, c.oracao_outro, c.primeira_visita
  FROM public.visitante_checkins c JOIN public.membros m ON m.id = c.membro_id
 WHERE m.tipo_pessoa = 'visitante' AND c.tratado_em IS NULL
   AND (m.ultimo_contato_em IS NULL OR m.ultimo_contato_em < c.criado_em)
 ORDER BY c.prioridade, c.criado_em;

REVOKE ALL ON public.vw_visitantes_de_hoje, public.vw_visitantes_aguardando_contato FROM PUBLIC, anon;
GRANT SELECT ON public.vw_visitantes_de_hoje, public.vw_visitantes_aguardando_contato TO authenticated;
