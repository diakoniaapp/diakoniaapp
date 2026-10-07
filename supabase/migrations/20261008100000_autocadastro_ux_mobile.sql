-- ─── (APLICADA em 07/10/2026 após ensaio) AutoCadastro de Visitantes — revisão de UX no celular (ver docs/AUTOCADASTRO_UX_MOBILE.md) ───────────────
-- O que muda no banco (o formulário passa a ter 3 passos e URL limpa, /bemvindo):
--   1. E-MAIL opcional: gravado em membros.email só quando a ficha ainda não tem (mesma regra dos demais campos).
--   2. CONTATO PASTORAL com canal (whatsapp | ligacao) e horário (manha | tarde | noite): vão para o check-in, para a fila
--      pastoral e para o texto do acompanhamento. Só valem quando o visitante marcou "deseja contato".
--   3. URL LIMPA: `p_codigo` vazio = "o ponto ativo". Se existir EXATAMENTE UM ponto ativo ele é usado; zero ou mais de um =
--      erro (a função não adivinha qual porta). Link antigo com `?p=<código>` continua funcionando como antes.
--   4. MEDIÇÃO sem dado pessoal: `visitante_funil` guarda, por preenchimento (um uuid sorteado no navegador, sem ligação com a
--      pessoa), até qual passo chegou, se concluiu e em quantos segundos. `vw_visitante_funil_diario` resume por dia.
-- Alternativa descartada para a medição: gravar IP/aparelho — é dado pessoal e não é preciso para saber "onde desistem".
-- Segurança: anon continua só com EXECUTE nas funções públicas; as tabelas e a view seguem fechadas para ele.

-- ── 1) colunas novas no check-in ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.visitante_checkins ADD COLUMN IF NOT EXISTS canal_contato   text;
ALTER TABLE public.visitante_checkins ADD COLUMN IF NOT EXISTS horario_contato text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitante_checkins_canal_contato_ck') THEN
    ALTER TABLE public.visitante_checkins ADD CONSTRAINT visitante_checkins_canal_contato_ck
      CHECK (canal_contato IS NULL OR canal_contato IN ('whatsapp', 'ligacao'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visitante_checkins_horario_contato_ck') THEN
    ALTER TABLE public.visitante_checkins ADD CONSTRAINT visitante_checkins_horario_contato_ck
      CHECK (horario_contato IS NULL OR horario_contato IN ('manha', 'tarde', 'noite'));
  END IF;
END $$;

-- ── 2) o funil: por preenchimento, sem nada que identifique a pessoa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visitante_funil (
  sessao_id     uuid PRIMARY KEY,                          -- sorteado no navegador; não liga a ninguém
  ponto_id      uuid REFERENCES public.visitante_pontos(id) ON DELETE SET NULL,
  data          date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  passo_max     smallint NOT NULL DEFAULT 1 CHECK (passo_max BETWEEN 1 AND 3),   -- o passo mais adiante que apareceu na tela
  concluiu      boolean  NOT NULL DEFAULT false,
  duracao_s     integer  CHECK (duracao_s IS NULL OR duracao_s BETWEEN 0 AND 3600),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visitante_funil_data_idx ON public.visitante_funil (data DESC);

-- O Supabase concede por padrão privilégios de tabela ao anon; a RLS já o barra, e aqui o privilégio também sai (cinto e suspensório).
-- Vale para as tabelas do AutoCadastro: o anônimo só entra pelas funções.
REVOKE ALL ON public.visitante_funil, public.visitante_pontos, public.visitante_sessoes, public.visitante_checkins FROM PUBLIC, anon;

ALTER TABLE public.visitante_funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitante_funil FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bloqueia anon" ON public.visitante_funil;
CREATE POLICY "Bloqueia anon" ON public.visitante_funil AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Equipe de acolhimento" ON public.visitante_funil;
CREATE POLICY "Equipe de acolhimento" ON public.visitante_funil FOR ALL TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'pastor'::app_role]))
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'secretaria'::app_role, 'diakonia'::app_role, 'pastor'::app_role]));

CREATE OR REPLACE VIEW public.vw_visitante_funil_diario WITH (security_invoker = true) AS
SELECT f.data,
       count(*)                                         AS abriram,        -- viram o passo 1
       count(*) FILTER (WHERE f.passo_max >= 2)         AS chegaram_passo_2,
       count(*) FILTER (WHERE f.passo_max >= 3)         AS chegaram_passo_3,
       count(*) FILTER (WHERE f.concluiu)               AS concluiram,
       round(avg(f.duracao_s) FILTER (WHERE f.concluiu))::int AS tempo_medio_s,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY f.duracao_s) FILTER (WHERE f.concluiu))::int AS tempo_mediano_s
  FROM public.visitante_funil f
 GROUP BY f.data
 ORDER BY f.data DESC;
REVOKE ALL ON public.vw_visitante_funil_diario FROM PUBLIC, anon;
GRANT SELECT ON public.vw_visitante_funil_diario TO authenticated;

-- ── 3) qual ponto vale: o do código, ou — sem código — o único ativo ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.visitante_ponto_resolver(p_codigo text)
RETURNS public.visitante_pontos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE v public.visitante_pontos%ROWTYPE; n int;
BEGIN
  IF nullif(btrim(coalesce(p_codigo, '')), '') IS NOT NULL THEN
    SELECT * INTO v FROM public.visitante_pontos WHERE codigo = p_codigo AND ativo;
    IF FOUND THEN RETURN v; END IF;
    RAISE EXCEPTION 'Este link de cadastro não está mais ativo. Procure a recepção.';
  END IF;
  SELECT count(*) INTO n FROM public.visitante_pontos WHERE ativo;
  IF n <> 1 THEN RAISE EXCEPTION 'Este link de cadastro não está mais ativo. Procure a recepção.'; END IF;   -- 0 = desligado; 2+ = ambíguo
  SELECT * INTO v FROM public.visitante_pontos WHERE ativo;
  RETURN v;
END
$f$;
REVOKE ALL ON FUNCTION public.visitante_ponto_resolver(text) FROM PUBLIC, anon, authenticated;   -- só as funções abaixo (dono) a chamam

-- ── 4) o registro do funil (público, nunca falha para o visitante) ──────────────────────────────────────────
-- Devolve {ok:true} ou {ok:false}; jamais lança erro: medir não pode atrapalhar quem está preenchendo.
CREATE OR REPLACE FUNCTION public.visitante_funil_passo(p_codigo text, p_sessao uuid, p_passo int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE v_ponto public.visitante_pontos%ROWTYPE;
BEGIN
  IF p_sessao IS NULL OR p_passo IS NULL OR p_passo NOT BETWEEN 1 AND 3 THEN RETURN jsonb_build_object('ok', false); END IF;
  BEGIN v_ponto := public.visitante_ponto_resolver(p_codigo);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false); END;
  -- freio: o link é público; no máximo 400 sessões novas por 10 minutos
  IF NOT EXISTS (SELECT 1 FROM public.visitante_funil WHERE sessao_id = p_sessao)
     AND (SELECT count(*) FROM public.visitante_funil WHERE criado_em > now() - interval '10 minutes') >= 400 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  INSERT INTO public.visitante_funil (sessao_id, ponto_id, passo_max) VALUES (p_sessao, v_ponto.id, p_passo)
  ON CONFLICT (sessao_id) DO UPDATE SET passo_max = greatest(public.visitante_funil.passo_max, EXCLUDED.passo_max), atualizado_em = now();
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok', false);
END
$f$;
REVOKE ALL ON FUNCTION public.visitante_funil_passo(text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitante_funil_passo(text, uuid, int) TO anon, authenticated;

-- ── 5) a porta única, agora com e-mail, canal/horário do contato, código opcional e medição ─────────────────
-- p_dados (jsonb): nome, data_nascimento (AAAA-MM-DD), telefone, whatsapp, email, endereco, como_conheceu, como_conheceu_outro,
--   quem_convidou, oracao_familia, oracao_saude, oracao_trabalho, oracao_outro (texto), primeira_visita, deseja_contato,
--   canal_contato, horario_contato, deseja_informacoes, lgpd_aceito, sessao_id (uuid do funil), duracao_s.
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
  v_email  text := lower(nullif(btrim(left(coalesce(p_dados->>'email', ''), 160)), ''));
  v_end    text := nullif(btrim(left(coalesce(p_dados->>'endereco', ''), 300)), '');
  v_como   text := nullif(p_dados->>'como_conheceu', '');
  v_como_o text := nullif(btrim(left(coalesce(p_dados->>'como_conheceu_outro', ''), 200)), '');
  v_quem   text := nullif(btrim(left(coalesce(p_dados->>'quem_convidou', ''), 120)), '');
  v_or_out text := nullif(btrim(left(coalesce(p_dados->>'oracao_outro', ''), 500)), '');
  v_quer   boolean := coalesce(p_dados->>'deseja_contato', 'false') = 'true';
  v_canal  text := nullif(p_dados->>'canal_contato', '');
  v_hora   text := nullif(p_dados->>'horario_contato', '');
  v_sessao_f uuid; v_dur int;
  v_culto  text; v_evento uuid; v_sessao public.visitante_sessoes%ROWTYPE;
  v_m      public.membros%ROWTYPE; v_novo boolean := false; v_visita uuid; v_n int; v_acao boolean; v_passo text;
  v_dias   text[] := ARRAY['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
BEGIN
  v_ponto := public.visitante_ponto_resolver(p_codigo);   -- com código: o dele; sem código: o único ativo

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

  -- e-mail é opcional: formato inválido é descartado (não derruba um cadastro que já tem o essencial)
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN v_email := NULL; END IF;

  IF v_como IS NOT NULL AND v_como NOT IN ('amigo_familiar', 'redes_sociais', 'evento_igreja', 'vizinhanca', 'outros') THEN v_como := NULL; END IF;
  IF v_como IS DISTINCT FROM 'amigo_familiar' THEN v_quem := NULL; END IF;
  IF v_como IS DISTINCT FROM 'outros' THEN v_como_o := NULL; END IF;

  -- canal e horário só fazem sentido para quem pediu contato; valor fora da lista é descartado
  IF NOT v_quer OR v_canal NOT IN ('whatsapp', 'ligacao') THEN v_canal := NULL; END IF;
  IF NOT v_quer OR v_hora NOT IN ('manha', 'tarde', 'noite') THEN v_hora := NULL; END IF;

  BEGIN v_sessao_f := (p_dados->>'sessao_id')::uuid; EXCEPTION WHEN OTHERS THEN v_sessao_f := NULL; END;
  BEGIN v_dur := least(greatest((p_dados->>'duracao_s')::numeric, 0), 3600)::int; EXCEPTION WHEN OTHERS THEN v_dur := NULL; END;

  -- culto/evento: o que a recepção marcou para hoje; senão deduzido do dia e da hora
  SELECT * INTO v_sessao FROM public.visitante_sessoes WHERE data = v_hoje AND ativo ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN v_culto := v_sessao.culto; v_evento := v_sessao.evento_id;
  ELSE
    SELECT a.culto, a.evento_id INTO v_culto, v_evento FROM public.visitante_culto_agora(v_agora) a;
    -- nenhum culto/evento da agenda neste horário: rótulo genérico (a visita é registrada do mesmo jeito)
    IF v_culto IS NULL THEN v_culto := 'Visita de ' || v_dias[extract(dow FROM v_agora)::int + 1] || ' (fora de culto na agenda)'; END IF;
  END IF;

  -- quem já existe? o telefone (ou o WhatsApp) pelos últimos 11 dígitos E o mesmo primeiro nome, qualquer vínculo (visitante,
  -- congregado, membro). Telefone igual com primeiro nome diferente = outra pessoa da família: cria um novo visitante.
  SELECT * INTO v_m FROM public.membros m
   WHERE ( right(regexp_replace(coalesce(m.telefone_celular, ''), '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11))
        OR right(regexp_replace(coalesce(m.telefone_e164, ''),    '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11)) )
     AND public.visitante_primeiro_nome(m.nome_completo) = public.visitante_primeiro_nome(v_nome)
   ORDER BY (m.tipo_pessoa = 'visitante') DESC, m.created_at LIMIT 1;

  IF FOUND THEN
    -- o MESMO preenchimento enviado duas vezes no mesmo dia/culto não vira duas visitas
    SELECT count(*) INTO v_n FROM public.visitante_checkins
     WHERE membro_id = v_m.id AND data_visita = v_hoje AND culto IS NOT DISTINCT FROM v_culto;
    IF v_n > 0 THEN
      IF v_sessao_f IS NOT NULL THEN
        INSERT INTO public.visitante_funil (sessao_id, ponto_id, passo_max, concluiu, duracao_s) VALUES (v_sessao_f, v_ponto.id, 3, true, v_dur)
        ON CONFLICT (sessao_id) DO UPDATE SET passo_max = 3, concluiu = true, duracao_s = COALESCE(public.visitante_funil.duracao_s, EXCLUDED.duracao_s), atualizado_em = now();
      END IF;
      RETURN jsonb_build_object('ok', true, 'visita', v_m.numero_visitas, 'novo', false);
    END IF;

    IF v_m.tipo_pessoa = 'visitante' THEN
      INSERT INTO public.visitas (membro_id, data, origem, observacoes) VALUES (v_m.id, v_hoje, 'qr_code', v_culto) RETURNING id INTO v_visita;
      UPDATE public.membros SET
          numero_visitas   = COALESCE(numero_visitas, 1) + 1,
          -- só PREENCHE o que estava vazio: quem sabe o telefone de um visitante não pode reescrever os dados dele
          data_nascimento  = COALESCE(data_nascimento, v_nasc),
          email            = COALESCE(nullif(btrim(email), ''), v_email),
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
                                telefone_celular, whatsapp_celular, email, data_nascimento, endereco,
                                como_conheceu, como_conheceu_descricao, convidado_nome, lgpd_aceito, data_aceite_lgpd)
    VALUES (v_nome, 'visitante', 'ativo', 'novo', 1, 'qr_code',
            v_tel, v_zap, v_email, v_nasc, v_end, v_como, v_como_o, v_quem, true, now())
    RETURNING * INTO v_m;
    INSERT INTO public.visitas (membro_id, data, origem, observacoes) VALUES (v_m.id, v_hoje, 'qr_code', v_culto) RETURNING id INTO v_visita;
    v_n := 1;
  END IF;

  INSERT INTO public.visitante_checkins (membro_id, visita_id, ponto_id, data_visita, culto, evento_id, novo_cadastro, tipo_pessoa_na_hora,
      primeira_visita, deseja_contato, canal_contato, horario_contato, deseja_informacoes, oracao_familia, oracao_saude, oracao_trabalho, oracao_outro,
      como_conheceu, quem_convidou, whatsapp)
  VALUES (v_m.id, v_visita, v_ponto.id, v_hoje, v_culto, v_evento, v_novo, v_m.tipo_pessoa::text,
      CASE WHEN p_dados->>'primeira_visita' IN ('true', 'false') THEN (p_dados->>'primeira_visita')::boolean END,
      v_quer, v_canal, v_hora, coalesce(p_dados->>'deseja_informacoes', 'false') = 'true',
      coalesce(p_dados->>'oracao_familia', 'false') = 'true', coalesce(p_dados->>'oracao_saude', 'false') = 'true',
      coalesce(p_dados->>'oracao_trabalho', 'false') = 'true', v_or_out,
      v_como, v_quem, v_zap);

  -- O aceite LGPD fica provado no próprio check-in (aceite_texto_versao + criado_em) e em membros.lgpd_aceito/data_aceite_lgpd.
  -- (A tabela `consentimento` NÃO serve aqui: sua chave pessoa_id aponta para `pessoas`, outra tabela, e não para `membros`.)

  -- "Acompanhamento Pastoral": quem pediu oração ou contato entra como pendente (a tela de acompanhamento já existente)
  v_acao := v_quer OR coalesce(p_dados->>'oracao_familia', 'false') = 'true'
         OR coalesce(p_dados->>'oracao_saude', 'false') = 'true' OR coalesce(p_dados->>'oracao_trabalho', 'false') = 'true' OR v_or_out IS NOT NULL;
  IF v_acao AND v_m.tipo_pessoa = 'visitante' AND NOT EXISTS (
       SELECT 1 FROM public.acompanhamentos_visitante WHERE membro_id = v_m.id AND status IN ('pendente', 'em_andamento')) THEN
    v_passo := 'Visitante pediu oração ou contato pastoral pelo cadastro do QR Code';
    IF v_canal IS NOT NULL OR v_hora IS NOT NULL THEN
      v_passo := v_passo || ' (prefere ' || CASE v_canal WHEN 'whatsapp' THEN 'WhatsApp' WHEN 'ligacao' THEN 'ligação' ELSE 'contato' END
                         || CASE v_hora WHEN 'manha' THEN ', de manhã' WHEN 'tarde' THEN ', à tarde' WHEN 'noite' THEN ', à noite' ELSE '' END || ')';
    END IF;
    INSERT INTO public.acompanhamentos_visitante (membro_id, status, proximo_passo) VALUES (v_m.id, 'pendente', v_passo);
  END IF;

  IF v_sessao_f IS NOT NULL THEN   -- a medição: concluiu, em quantos segundos (nenhum dado da pessoa)
    INSERT INTO public.visitante_funil (sessao_id, ponto_id, passo_max, concluiu, duracao_s) VALUES (v_sessao_f, v_ponto.id, 3, true, v_dur)
    ON CONFLICT (sessao_id) DO UPDATE SET passo_max = 3, concluiu = true, duracao_s = COALESCE(public.visitante_funil.duracao_s, EXCLUDED.duracao_s), atualizado_em = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'visita', v_n, 'novo', v_novo);
END
$fn$;

COMMENT ON FUNCTION public.visitante_autocadastro IS 'Porta única do AutoCadastro por QR Code. Chamável por anon; valida tudo; devolve só {ok, visita, novo}. Nunca revela se o telefone já existia. p_codigo vazio = o único ponto ativo.';

REVOKE ALL ON FUNCTION public.visitante_autocadastro(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitante_autocadastro(text, jsonb) TO anon, authenticated;

-- ── 6) fila pastoral: o canal, o horário e o e-mail (colunas novas SEMPRE no fim da view) ───────────────────
CREATE OR REPLACE VIEW public.vw_visitantes_aguardando_contato WITH (security_invoker = true) AS
SELECT c.id AS checkin_id, c.membro_id, m.nome_completo, m.telefone_celular, COALESCE(m.whatsapp_celular, m.telefone_celular) AS whatsapp,
       m.numero_visitas, m.status_acolhimento, c.data_visita, c.culto, c.criado_em, c.prioridade,
       c.deseja_contato, c.deseja_informacoes, c.oracao_familia, c.oracao_saude, c.oracao_trabalho, c.oracao_outro, c.primeira_visita,
       c.canal_contato, c.horario_contato, m.email
  FROM public.visitante_checkins c JOIN public.membros m ON m.id = c.membro_id
 WHERE m.tipo_pessoa = 'visitante' AND c.tratado_em IS NULL
   AND (m.ultimo_contato_em IS NULL OR m.ultimo_contato_em < c.criado_em)
 ORDER BY c.prioridade, c.criado_em;
REVOKE ALL ON public.vw_visitantes_aguardando_contato FROM PUBLIC, anon;
GRANT SELECT ON public.vw_visitantes_aguardando_contato TO authenticated;
