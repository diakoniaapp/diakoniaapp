-- ─── ENSAIO FUNCIONAL do AutoCadastro por QR Code — roda DEPOIS do SQL da modelagem, na MESMA transação ──────
-- Cola-se: BEGIN; + AUTOCADASTRO_VISITANTES_QR.sql + este arquivo + ROLLBACK;  (scripts/copiar-ensaio-autocadastro.ps1 monta tudo)
-- "Success. No rows returned" = todos os casos passaram. Nada fica gravado.
--
-- Casos: (1) visitante novo · (2) o mesmo telefone volta = NOVA VISITA, sem criar pessoa · (3) quem sabe o telefone não reescreve
-- a ficha · (4) membro/congregado preenche o cartão: ficha intocada · (5) entradas inválidas são recusadas · (6) freio contra
-- enxurrada · (7) o ANÔNIMO só chama a função: não lê nenhuma tabela nem view · (8) a fila pastoral prioriza oração.

DO $ensaio$
DECLARE
  codigo text; r jsonb; m record; n int; recusou boolean; membro_tel text; tipo_do_membro text; antes record;
  TEL constant text := '(21) 99000-0001';
  caso text := '0'; ctx text;  -- vira 5521990000001
BEGIN
  -- se isto falhar, o texto colado veio INCOMPLETO (a parte da modelagem não rodou antes do teste): cole tudo de novo
  IF to_regclass('public.visitante_pontos') IS NULL OR to_regprocedure('public.visitante_autocadastro(text, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Ensaio: a modelagem não foi criada antes do teste — cole o texto INTEIRO (Ctrl+A no editor antes de colar).';
  END IF;
  SELECT p.codigo INTO codigo FROM public.visitante_pontos p WHERE p.ativo ORDER BY created_at LIMIT 1;
  IF codigo IS NULL THEN RAISE EXCEPTION 'Ensaio: o ponto "Recepção" não foi criado.'; END IF;

  -- ── caso 1: visitante novo, pedindo oração de saúde e contato ──────────────────────────────────────────
  caso := '1';
  SET LOCAL ROLE anon;       -- é exatamente o que o visitante é: sem login
  r := public.visitante_autocadastro(codigo, jsonb_build_object(
    'nome', '  Maria   de TESTE Silva ', 'data_nascimento', '1990-05-17', 'telefone', TEL, 'whatsapp', '',
    'endereco', 'Rua Teste, 10 - Meier', 'como_conheceu', 'amigo_familiar', 'quem_convidou', 'João da Igreja',
    'oracao_saude', true, 'primeira_visita', true, 'deseja_contato', true, 'deseja_informacoes', true, 'lgpd_aceito', true));
  RESET ROLE;
  IF r->>'ok' <> 'true' OR r->>'novo' <> 'true' OR (r->>'visita')::int <> 1 THEN RAISE EXCEPTION 'Caso 1: resposta inesperada %', r; END IF;
  IF r ? 'id' OR r ? 'membro_id' THEN RAISE EXCEPTION 'Caso 1: a resposta não pode devolver ids: %', r; END IF;
  SELECT * INTO m FROM public.membros WHERE telefone_celular = '5521990000001';
  IF m.id IS NULL OR m.tipo_pessoa::text <> 'visitante' OR m.nome_completo <> 'Maria de TESTE Silva' OR m.numero_visitas <> 1
     OR m.origem_cadastro <> 'qr_code' OR m.status_acolhimento::text <> 'novo' OR m.whatsapp_celular <> '5521990000001'
     OR m.como_conheceu <> 'amigo_familiar' OR m.convidado_nome <> 'João da Igreja' OR NOT m.lgpd_aceito THEN
    RAISE EXCEPTION 'Caso 1: a ficha do visitante não nasceu como esperado: %', row_to_json(m);
  END IF;
  SELECT count(*) INTO n FROM public.visitas WHERE membro_id = m.id AND origem = 'qr_code';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 1: esperava 1 visita; achei %', n; END IF;
  IF (SELECT prioridade FROM public.visitante_checkins WHERE membro_id = m.id) <> 1 THEN RAISE EXCEPTION 'Caso 1: pedido de oração deveria ter prioridade 1.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acompanhamentos_visitante WHERE membro_id = m.id AND status = 'pendente') THEN
    RAISE EXCEPTION 'Caso 1: o acompanhamento pastoral pendente não foi criado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.visitante_checkins WHERE membro_id = m.id AND aceite_texto_versao = 'autocadastro-1.0')
     OR m.data_aceite_lgpd IS NULL THEN
    RAISE EXCEPTION 'Caso 1: o aceite LGPD não foi registrado (check-in e ficha).';
  END IF;

  -- ── caso 2: o mesmo telefone, outro culto = NOVA VISITA (e o mesmo envio repetido NÃO duplica) ───────────
  caso := '2';
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Maria de Teste', 'telefone', '21990000001', 'lgpd_aceito', true));
  RESET ROLE;
  IF (r->>'novo')::boolean OR (r->>'visita')::int <> 1 THEN RAISE EXCEPTION 'Caso 2: reenvio no mesmo culto não pode virar outra visita: %', r; END IF;
  -- (na mesma transação todas as linhas têm o mesmo created_at: desliga a sessão anterior antes de abrir outra)
  UPDATE public.visitante_sessoes SET ativo = false WHERE ativo;
  INSERT INTO public.visitante_sessoes (culto) VALUES ('Culto de TESTE da noite');
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Maria de Teste', 'telefone', '5521990000001', 'lgpd_aceito', true));
  RESET ROLE;
  IF (r->>'novo')::boolean OR (r->>'visita')::int <> 2 THEN RAISE EXCEPTION 'Caso 2: a segunda visita deveria ser a de número 2: %', r; END IF;
  SELECT count(*) INTO n FROM public.membros WHERE telefone_celular = '5521990000001';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 2: criou OUTRA pessoa para o mesmo telefone (%)', n; END IF;
  SELECT count(*) INTO n FROM public.visitas WHERE membro_id = m.id;
  IF n <> 2 THEN RAISE EXCEPTION 'Caso 2: esperava 2 visitas; achei %', n; END IF;

  -- ── caso 3: quem sabe o telefone NÃO reescreve a ficha (só preenche o que estava vazio) ─────────────────
  caso := '3';
  UPDATE public.visitante_sessoes SET ativo = false WHERE ativo;
  INSERT INTO public.visitante_sessoes (culto) VALUES ('Culto de TESTE 3');
  SET LOCAL ROLE anon;
  PERFORM public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Maria OUTRO NOME', 'telefone', TEL, 'endereco', 'Endereço trocado',
      'data_nascimento', '1950-01-01', 'lgpd_aceito', true));
  RESET ROLE;
  SELECT * INTO m FROM public.membros WHERE telefone_celular = '5521990000001';
  IF m.nome_completo <> 'Maria de TESTE Silva' OR m.endereco <> 'Rua Teste, 10 - Meier' OR m.data_nascimento <> DATE '1990-05-17' THEN
    RAISE EXCEPTION 'Caso 3: a ficha foi reescrita por quem só sabia o telefone: %', row_to_json(m);
  END IF;

  -- ── caso 4: membro/congregado preenche o cartão: a ficha dele não muda ──────────────────────────────────
  caso := '4';
  SELECT telefone_celular, tipo_pessoa::text INTO membro_tel, tipo_do_membro FROM public.membros
   WHERE tipo_pessoa::text IN ('membro', 'congregado') AND telefone_celular IS NOT NULL LIMIT 1;
  IF membro_tel IS NOT NULL THEN
    SELECT * INTO antes FROM public.membros WHERE telefone_celular = membro_tel LIMIT 1;
    SET LOCAL ROLE anon;
    r := public.visitante_autocadastro(codigo, jsonb_build_object('nome', split_part(antes.nome_completo, ' ', 1) || ' Sobrenome Qualquer', 'telefone', membro_tel, 'endereco', 'X', 'lgpd_aceito', true));
    RESET ROLE;
    IF (r->>'novo')::boolean THEN RAISE EXCEPTION 'Caso 4: criou visitante para um membro/congregado já cadastrado.'; END IF;
    IF EXISTS (SELECT 1 FROM public.membros x WHERE x.id = antes.id AND (x.numero_visitas IS DISTINCT FROM antes.numero_visitas
        OR x.nome_completo <> antes.nome_completo OR x.tipo_pessoa <> antes.tipo_pessoa OR x.endereco IS DISTINCT FROM antes.endereco)) THEN
      RAISE EXCEPTION 'Caso 4: a ficha do % foi alterada.', tipo_do_membro;
    END IF;
  END IF;

  -- ── caso 10: telefone COMPARTILHADO (família) com OUTRO primeiro nome = outra pessoa; nunca vira "mais uma visita" do membro ──
  caso := '10';
  IF membro_tel IS NOT NULL THEN
    SELECT count(*) INTO n FROM public.membros WHERE telefone_celular = membro_tel;
    SET LOCAL ROLE anon;
    r := public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Zzyzx Parente Da Familia', 'telefone', membro_tel, 'lgpd_aceito', true));
    RESET ROLE;
    IF NOT (r->>'novo')::boolean THEN RAISE EXCEPTION 'Caso 10: um parente com outro nome e o MESMO telefone foi engolido como visita de quem já existia.'; END IF;
    IF (SELECT count(*) FROM public.membros WHERE telefone_celular = membro_tel) <> n + 1 THEN RAISE EXCEPTION 'Caso 10: o parente deveria ter virado uma pessoa nova.'; END IF;
    IF (SELECT tipo_pessoa::text FROM public.membros WHERE nome_completo = 'Zzyzx Parente Da Familia') <> 'visitante' THEN RAISE EXCEPTION 'Caso 10: o parente deveria entrar como visitante.'; END IF;
  END IF;

  -- ── caso 5: entradas inválidas são recusadas (e não gravam nada) ─────────────────────────────────────────
  caso := '5';
  FOR n IN 1..5 LOOP
    recusou := false;
    BEGIN
      SET LOCAL ROLE anon;
      PERFORM public.visitante_autocadastro(
        CASE n WHEN 1 THEN 'codigo-que-nao-existe' ELSE codigo END,
        CASE n WHEN 1 THEN jsonb_build_object('nome', 'Fulano de Tal', 'telefone', '21988887777', 'lgpd_aceito', true)
               WHEN 2 THEN jsonb_build_object('nome', 'Fulano de Tal', 'telefone', '21988887777', 'lgpd_aceito', false)
               WHEN 3 THEN jsonb_build_object('nome', 'Fulano de Tal', 'telefone', '123', 'lgpd_aceito', true)
               WHEN 4 THEN jsonb_build_object('nome', 'F', 'telefone', '21988887777', 'lgpd_aceito', true)
               ELSE jsonb_build_object('nome', 'Fulano de Tal', 'lgpd_aceito', true) END);
    EXCEPTION WHEN OTHERS THEN recusou := true;
    END;
    RESET ROLE;
    IF NOT recusou THEN RAISE EXCEPTION 'Caso 5.%: entrada inválida foi aceita.', n; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.membros WHERE nome_completo = 'Fulano de Tal') THEN RAISE EXCEPTION 'Caso 5: uma entrada inválida gravou pessoa.'; END IF;

  -- ── caso 6: freio contra enxurrada (40 em 10 minutos) ───────────────────────────────────────────────────
  caso := '6';
  INSERT INTO public.visitante_checkins (membro_id, data_visita, novo_cadastro)
    SELECT m.id, CURRENT_DATE, false FROM generate_series(1, 40);
  recusou := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Carlos de Teste', 'telefone', '21977776666', 'lgpd_aceito', true));
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  RESET ROLE;
  IF NOT recusou THEN RAISE EXCEPTION 'Caso 6: o freio contra enxurrada não funcionou.'; END IF;
  DELETE FROM public.visitante_checkins WHERE membro_id = m.id AND novo_cadastro = false AND visita_id IS NULL;

  -- ── caso 8 (antes do 7, que troca o papel): a fila pastoral põe quem pediu oração primeiro ───────────────
  caso := '8';
  IF NOT EXISTS (SELECT 1 FROM public.vw_visitantes_aguardando_contato WHERE membro_id = m.id AND prioridade = 1) THEN
    RAISE EXCEPTION 'Caso 8: quem pediu oração deveria estar na fila pastoral com prioridade 1.';
  END IF;

  -- ── caso 9: o culto vem da AGENDA (depende da agenda de hoje: domingo 11/10/2026 já está dentro das séries até 27/12) ──
  caso := '9';
  IF (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 11:00')) IS DISTINCT FROM 'Culto da Manhã'
     OR (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 18:45')) IS DISTINCT FROM 'Culto da Noite'
     OR (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 09:15')) IS DISTINCT FROM 'Escola Bíblica Dominical'
     OR (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-10 15:00')) IS NOT NULL THEN
    RAISE EXCEPTION 'Caso 9: o culto deduzido da agenda não bate: manhã=%, noite=%, EBD=%, sábado à tarde=%',
      (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 11:00')), (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 18:45')),
      (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-11 09:15')), (SELECT culto FROM public.visitante_culto_agora(TIMESTAMP '2026-10-10 15:00'));
  END IF;

  -- ── caso 7: o ANÔNIMO não lê nada além do que a função devolve ──────────────────────────────────────────
  caso := '7';
  FOR n IN 1..6 LOOP
    DECLARE visto int := 0;
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT count(*) FROM public.%I', (ARRAY['membros', 'visitas', 'consentimento', 'visitante_pontos', 'visitante_checkins', 'vw_visitantes_aguardando_contato'])[n]) INTO visto;
      RESET ROLE;
      IF visto > 0 THEN RAISE EXCEPTION 'Caso 7: anon leu % linhas de %', visto, (ARRAY['membros', 'visitas', 'consentimento', 'visitante_pontos', 'visitante_checkins', 'vw_visitantes_aguardando_contato'])[n]; END IF;
    EXCEPTION WHEN insufficient_privilege THEN RESET ROLE;   -- negar o acesso também vale
    END;
  END LOOP;
  IF has_table_privilege('anon', 'public.vw_visitantes_de_hoje', 'SELECT') OR has_table_privilege('anon', 'public.vw_visitantes_aguardando_contato', 'SELECT') THEN
    RAISE EXCEPTION 'Caso 7: anon tem SELECT numa view do painel.';
  END IF;
  IF NOT has_function_privilege('anon', 'public.visitante_autocadastro(text, jsonb)', 'EXECUTE') THEN RAISE EXCEPTION 'Caso 7: anon não pode chamar a função (o formulário público não funcionaria).'; END IF;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
