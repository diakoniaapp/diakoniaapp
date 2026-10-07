-- ─── AutoCadastro: telefone compartilhado por família não engole parente (APLICADA em 07/10/2026 após ensaio de 10 casos) ───
-- Só CREATE OR REPLACE: visitante_primeiro_nome(), visitante_culto_agora() e visitante_autocadastro() com o casamento por telefone + primeiro nome.

-- ── 5-) o primeiro nome, sem acento e em minúsculas — para casar quem JÁ existe sem engolir a família ────────────
-- Medido (07/10/2026): 7 telefones são compartilhados por pessoas diferentes (pai e filho "Mario Alberto Barbosa" / "Mario Alberto
-- Siqueira Barbosa" são da mesma família, não duplicata). Casar só pelo telefone faria um parente que visita com o telefone da
-- família virar "mais uma visita" do membro. Agora o telefone precisa vir com o MESMO PRIMEIRO NOME.
CREATE OR REPLACE FUNCTION public.visitante_primeiro_nome(p_nome text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT lower(translate(split_part(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), ' ', 1),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));
$f$;

-- ── 5a) o culto/evento de AGORA, lido da agenda (eventos) ───────────────────────────────────────────────
-- Medido na agenda dela (07/10/2026): Culto da Manhã (dom 10:30–12:30), Culto da Noite (dom 18:30–20:30), Escola Bíblica
-- Dominical (dom 09:00–10:00) — séries semanais guardadas como UMA linha-base + `recorrencia_regra` (freq, dias_semana,
-- intervalo, fim), mais cultos avulsos (Juventude, Vigília…). Aqui a série semanal é avaliada para a data pedida.
-- Vale o evento cuja janela (1 h antes do início até 30 min depois do fim) contém a hora; havendo mais de um, o de início
-- mais próximo. Sem evento na agenda, devolve vazio e a função chamadora usa um rótulo genérico.
-- Limite conhecido: uma ocorrência CANCELADA/remarcada de uma série (linha de exceção) não é descontada da série.
CREATE OR REPLACE FUNCTION public.visitante_culto_agora(p_agora timestamp DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo'))
RETURNS TABLE (culto text, evento_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  WITH hoje AS (SELECT p_agora::date AS d, extract(dow FROM p_agora)::int AS dow),
  cand AS (
    SELECT e.id, btrim(split_part(e.titulo, ' | ', 1)) AS titulo,   -- na agenda dela o título carrega o ministério ("Culto da Noite | MINISTÉRIO PASTORAL")
           hoje.d + e.hora_inicio AS ini,
           hoje.d + COALESCE(e.hora_fim, e.hora_inicio) + CASE WHEN e.hora_fim IS NULL THEN interval '2 hours' ELSE interval '0' END AS fim
      FROM public.eventos e, hoje
     WHERE e.status = 'agendado' AND e.hora_inicio IS NOT NULL
       AND (e.tipo = 'culto' OR e.titulo ILIKE 'Escola Bíblica%')
       AND ( e.data = hoje.d
          OR ( e.recorrencia_regra->>'freq' = 'semanal' AND e.data < hoje.d
               AND hoje.dow IN (SELECT jsonb_array_elements_text(e.recorrencia_regra->'dias_semana')::int)
               AND ( e.recorrencia_regra->'fim'->>'tipo' = 'nunca' OR (e.recorrencia_regra->'fim'->>'data')::date >= hoje.d )
               AND (((hoje.d - e.data) / 7) % COALESCE(NULLIF((e.recorrencia_regra->>'intervalo')::int, 0), 1)) = 0 ) )
  )
  SELECT c.titulo, c.id FROM cand c
   WHERE p_agora BETWEEN c.ini - interval '60 minutes' AND c.fim + interval '30 minutes'
   ORDER BY abs(extract(epoch FROM (p_agora - c.ini))) LIMIT 1
$f$;
REVOKE ALL ON FUNCTION public.visitante_culto_agora(timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitante_culto_agora(timestamp) TO authenticated;

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
