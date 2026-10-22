-- ─── AutoCadastro de visitantes: o TELEFONE deixa de ser obrigatório — 22/10/2026 ──────────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: "tire a obrigatoriedade do telefone no cadastro público de visitantes" (página /bemvindo). Hoje o formulário (3 passos) e esta função recusam o cadastro sem um telefone ou WhatsApp válido.
--
-- O que muda — só CREATE OR REPLACE de `visitante_autocadastro` (a definição vigente é a de 20261008100000; nada mais foi alterado depois):
--   1. sai o `RAISE EXCEPTION 'Informe um telefone ou WhatsApp válido, com DDD.'`: sem número, `telefone_celular` e `whatsapp_celular` ficam NULOS. Já aceitam nulo (a CHECK
--      `membros_telefone_celular_formato` e `membros_whatsapp_celular_formato` só olham valores não nulos; `visitante_checkins.whatsapp` é nula; a fila pastoral já trata WhatsApp ausente).
--      Número informado mas inválido continua sendo descartado pela normalização (vira nulo), como o e-mail inválido.
--   2. o reconhecimento de quem já existe, que SEMPRE passou pelo telefone, ganha um caminho para quem não deixa número: o MESMO NOME COMPLETO (sem diferença de maiúscula ou de espaços) E a MESMA
--      DATA DE NASCIMENTO. O nome sozinho não basta (homônimos): sem número e sem nascimento, cada preenchimento cria um cadastro novo — é o custo aceito de não exigir o telefone.
--      Com número, a regra é exatamente a de antes (últimos 11 dígitos + mesmo primeiro nome).
-- Consequências para quem lê depois: o visitante sem telefone entra em "Sem telefone cadastrado" (Pendências de cadastro e resumo semanal da Secretaria) — é o que a lista diz, e a recepção pode pedir o número;
-- e, se ele pedir contato pastoral, a fila mostra o pedido sem o botão de WhatsApp (a tela pública já avisa para deixar um número). A mesma pessoa que volta sem número e sem nascimento pode duplicar.
-- Reverter: reaplicar a definição de 20261008100000 (o RAISE e o casamento só por telefone). Nenhum dado existente é tocado.

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
  -- o telefone é OPCIONAL (pedido dela, 22/10/2026): um número só vale para os dois; sem número nenhum, ambos ficam nulos e o cadastro segue
  v_tel := COALESCE(v_tel, v_zap);
  v_zap := COALESCE(v_zap, v_tel);

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

  -- quem já existe? COM número: o telefone (ou o WhatsApp) pelos últimos 11 dígitos E o mesmo primeiro nome, qualquer vínculo (visitante,
  -- congregado, membro). Telefone igual com primeiro nome diferente = outra pessoa da família: cria um novo visitante.
  -- SEM número: só o mesmo nome completo (sem diferença de maiúscula/espaço) E a mesma data de nascimento reconhecem quem já existe —
  -- o nome sozinho não basta (homônimos), então sem número e sem nascimento cada preenchimento vira um cadastro novo.
  SELECT * INTO v_m FROM public.membros m
   WHERE ( ( (v_tel IS NOT NULL OR v_zap IS NOT NULL)
             AND ( right(regexp_replace(coalesce(m.telefone_celular, ''), '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11))
                OR right(regexp_replace(coalesce(m.telefone_e164, ''),    '\D', '', 'g'), 11) IN (right(v_tel, 11), right(v_zap, 11)) )
             AND public.visitante_primeiro_nome(m.nome_completo) = public.visitante_primeiro_nome(v_nome) )
        OR ( v_tel IS NULL AND v_zap IS NULL AND v_nasc IS NOT NULL AND m.data_nascimento = v_nasc
             AND lower(btrim(regexp_replace(m.nome_completo, '\s+', ' ', 'g'))) = lower(v_nome) ) )
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

COMMENT ON FUNCTION public.visitante_autocadastro IS 'Porta única do AutoCadastro por QR Code. Chamável por anon; valida tudo; devolve só {ok, visita, novo}. Nunca revela se o telefone já existia. p_codigo vazio = o único ponto ativo. Telefone/WhatsApp opcionais: sem número, quem já existe é reconhecido só por nome completo + data de nascimento.';

REVOKE ALL ON FUNCTION public.visitante_autocadastro(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.visitante_autocadastro(text, jsonb) TO anon, authenticated;
