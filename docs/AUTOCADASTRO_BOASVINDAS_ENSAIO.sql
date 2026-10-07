-- ─── ENSAIO da migration 20261008120000_visitante_boasvindas.sql — roda DEPOIS dela, na MESMA transação ──────────
-- Monta-se: BEGIN; + migration + este arquivo + ROLLBACK;   "Success. No rows returned" = todos os casos passaram. Nada fica gravado.
--
-- Casos: (1) a linha inicial existe e a função responde ao anônimo · (2) a função só entrega o que é público: ativo, http(s),
-- tipo conhecido, encontro que não passou, no máximo `eventos_max` · (3) "mostrar encontros" desligado = lista vazia ·
-- (4) o anônimo só executa: não lê a tabela · (5) só existe UMA configuração · (6) o bucket do banner · (7) a administração escreve.

DO $ensaio$
DECLARE
  r jsonb; n int; caso text := '0'; ctx text; recusou boolean;
  ontem text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1, 'YYYY-MM-DD');
  hoje  text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  amanha text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD');
BEGIN
  IF to_regprocedure('public.visitante_boasvindas()') IS NULL THEN RAISE EXCEPTION 'Ensaio: a migration não rodou antes do teste — cole o texto INTEIRO.'; END IF;

  caso := '1';
  SELECT count(*) INTO n FROM public.visitante_boasvindas;
  IF n <> 1 THEN RAISE EXCEPTION '1: deveria existir exatamente 1 configuração (achei %).', n; END IF;
  SET LOCAL ROLE anon;
  r := public.visitante_boasvindas();
  RESET ROLE;
  IF r->>'titulo' IS NULL OR r->>'mensagem' IS NULL OR jsonb_typeof(r->'canais') <> 'array' OR jsonb_typeof(r->'eventos') <> 'array' THEN
    RAISE EXCEPTION '1: a resposta não tem o formato esperado: %', r;
  END IF;

  -- ── 2: só o que é público ──────────────────────────────────────────────────────────────────────────────
  caso := '2';
  UPDATE public.visitante_boasvindas SET
    titulo = 'Título de TESTE', mensagem = 'Mensagem de TESTE', banner_url = 'javascript:alert(1)',
    canais = jsonb_build_array(
      jsonb_build_object('tipo', 'instagram', 'url', 'https://instagram.com/teste', 'ativo', true),
      jsonb_build_object('tipo', 'facebook',  'url', 'https://facebook.com/teste',  'ativo', false),                  -- desligado
      jsonb_build_object('tipo', 'youtube',   'url', 'javascript:alert(1)',          'ativo', true),                   -- esquema perigoso
      jsonb_build_object('tipo', 'site',      'url', '',                              'ativo', true),                   -- vazio
      jsonb_build_object('tipo', 'telegram',  'url', 'https://t.me/teste',            'ativo', true),                   -- tipo desconhecido
      jsonb_build_object('tipo', 'whatsapp',  'url', 'https://wa.me/5521999990000',   'ativo', true)),
    links = jsonb_build_array(
      jsonb_build_object('rotulo', 'Ministérios', 'url', 'https://exemplo.org/ministerios', 'ativo', true),
      jsonb_build_object('rotulo', 'Escondido',   'url', 'https://exemplo.org/x',           'ativo', false),
      jsonb_build_object('rotulo', 'Sem endereço','url', 'data:text/html,x',                'ativo', true)),
    eventos_mostrar = true, eventos_max = 2,
    eventos = jsonb_build_array(
      jsonb_build_object('titulo', 'Já passou',     'data', ontem,  'ativo', true),
      jsonb_build_object('titulo', 'Hoje vale',     'data', hoje,   'ativo', true, 'quando', 'hoje à noite', 'link', 'javascript:x'),
      jsonb_build_object('titulo', 'Desligado',     'data', amanha, 'ativo', false),
      jsonb_build_object('titulo', 'Fixo sem data', 'quando', 'Domingos, 10h30', 'ativo', true),
      jsonb_build_object('titulo', 'Terceiro vale mas passa do máximo', 'data', amanha, 'ativo', true));
  SET LOCAL ROLE anon;
  r := public.visitante_boasvindas();
  RESET ROLE;
  IF r->>'banner_url' IS NOT NULL THEN RAISE EXCEPTION '2: banner com esquema perigoso foi entregue: %', r->>'banner_url'; END IF;
  IF jsonb_array_length(r->'canais') <> 2 OR (r->'canais'->0->>'tipo') <> 'instagram' OR (r->'canais'->1->>'tipo') <> 'whatsapp' THEN
    RAISE EXCEPTION '2: canais públicos errados (esperava instagram e whatsapp): %', r->'canais';
  END IF;
  IF jsonb_array_length(r->'links') <> 1 OR (r->'links'->0->>'rotulo') <> 'Ministérios' THEN RAISE EXCEPTION '2: links públicos errados: %', r->'links'; END IF;
  IF jsonb_array_length(r->'eventos') <> 2 OR (r->'eventos'->0->>'titulo') <> 'Hoje vale' OR (r->'eventos'->1->>'titulo') <> 'Fixo sem data' THEN
    RAISE EXCEPTION '2: encontros errados (esperava "Hoje vale" e "Fixo sem data", máximo 2): %', r->'eventos';
  END IF;
  IF r->'eventos'->0->>'link' IS NOT NULL THEN RAISE EXCEPTION '2: link perigoso do encontro foi entregue.'; END IF;
  IF r->>'titulo' <> 'Título de TESTE' THEN RAISE EXCEPTION '2: o título configurado não chegou.'; END IF;

  -- ── 3: encontros desligados ────────────────────────────────────────────────────────────────────────────
  caso := '3';
  UPDATE public.visitante_boasvindas SET eventos_mostrar = false;
  SET LOCAL ROLE anon;
  r := public.visitante_boasvindas();
  RESET ROLE;
  IF jsonb_array_length(r->'eventos') <> 0 THEN RAISE EXCEPTION '3: com "mostrar encontros" desligado a lista deveria ser vazia: %', r->'eventos'; END IF;

  -- ── 4: o anônimo só executa ────────────────────────────────────────────────────────────────────────────
  caso := '4';
  IF has_table_privilege('anon', 'public.visitante_boasvindas', 'SELECT') THEN RAISE EXCEPTION '4: anon tem SELECT na tabela de configuração.'; END IF;
  IF NOT has_function_privilege('anon', 'public.visitante_boasvindas()', 'EXECUTE') THEN RAISE EXCEPTION '4: anon precisa chamar visitante_boasvindas().'; END IF;
  recusou := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM count(*) FROM public.visitante_boasvindas;
  EXCEPTION WHEN insufficient_privilege THEN recusou := true;
  END;
  RESET ROLE;
  IF NOT recusou THEN RAISE EXCEPTION '4: anon conseguiu ler a tabela.'; END IF;

  -- ── 5: uma configuração só; limites ────────────────────────────────────────────────────────────────────
  caso := '5';
  recusou := false;
  BEGIN INSERT INTO public.visitante_boasvindas (id) VALUES (false);
  EXCEPTION WHEN OTHERS THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '5: aceitou uma segunda configuração.'; END IF;
  recusou := false;
  BEGIN UPDATE public.visitante_boasvindas SET eventos_max = 99;
  EXCEPTION WHEN OTHERS THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '5: aceitou eventos_max = 99.'; END IF;
  recusou := false;
  BEGIN UPDATE public.visitante_boasvindas SET canais = '{"a":1}'::jsonb;
  EXCEPTION WHEN OTHERS THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '5: aceitou canais que não é lista.'; END IF;

  -- ── 6: o bucket do banner ──────────────────────────────────────────────────────────────────────────────
  caso := '6';
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'boasvindas-visitante' AND public AND file_size_limit = 2097152
                  AND allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp'] AND NOT allowed_mime_types && ARRAY['image/svg+xml', 'text/html']) THEN
    RAISE EXCEPTION '6: o bucket do banner não está como esperado (público, 2 MB, só jpeg/png/webp).';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'boasvindas_visitante_%';
  IF n <> 3 THEN RAISE EXCEPTION '6: esperava 3 políticas de escrita do bucket (achei %).', n; END IF;

  -- ── 7: a administração escreve; quem não é da administração não ────────────────────────────────────────
  caso := '7';
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'visitante_boasvindas';
  IF n < 2 THEN RAISE EXCEPTION '7: faltam políticas na tabela (achei %).', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'visitante_boasvindas' AND policyname = 'Administracao'
                  AND qual ILIKE '%admin%' AND qual ILIKE '%secretaria%' AND qual NOT ILIKE '%lideranca%') THEN
    RAISE EXCEPTION '7: a política da administração não está como esperado.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
