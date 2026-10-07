-- ─── ENSAIO da migration 20261008100000_autocadastro_ux_mobile.sql — roda DEPOIS dela, na MESMA transação ────────
-- Monta-se: BEGIN; + migration + este arquivo + AUTOCADASTRO_VISITANTES_QR_ENSAIO_FUNCIONAL.sql (regressão dos 10 casos) + ROLLBACK;
-- "Success. No rows returned" = todos os casos passaram. Nada fica gravado.
--
-- Casos: (A) e-mail gravado, e-mail inválido descartado, ficha existente só ganha e-mail se estava vazio · (B) canal e horário do
-- contato chegam ao check-in, à fila e ao texto do acompanhamento; sem pedir contato ou com valor fora da lista são descartados ·
-- (C) código vazio usa o ÚNICO ponto ativo; com dois ativos ou nenhum, recusa · (D) o funil mede passo e conclusão sem dado
-- pessoal, e o anônimo só chama a função · (E) o código antigo (?p=) continua valendo.

DO $ensaio$
DECLARE
  codigo text; codigo2 text; ativos uuid[]; r jsonb; m record; n int; recusou boolean; caso text := '0'; ctx text; ponto2 uuid; s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
BEGIN
  IF to_regprocedure('public.visitante_funil_passo(text, uuid, int)') IS NULL THEN
    RAISE EXCEPTION 'Ensaio: a migration não rodou antes do teste — cole o texto INTEIRO.';
  END IF;
  SELECT p.codigo INTO codigo FROM public.visitante_pontos p WHERE p.ativo ORDER BY created_at LIMIT 1;

  -- ── A: e-mail ──────────────────────────────────────────────────────────────────────────────────────────
  caso := 'A1';
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro('', jsonb_build_object('nome', 'Zacarias Teste Um', 'telefone', '(21) 99000-0101', 'email', '  Zac.Teste@Exemplo.COM ', 'lgpd_aceito', true));
  RESET ROLE;
  SELECT * INTO m FROM public.membros WHERE telefone_celular = '5521990000101';
  IF m.id IS NULL OR m.email IS DISTINCT FROM 'zac.teste@exemplo.com' THEN RAISE EXCEPTION 'A1: e-mail deveria ser gravado em minúsculas e sem espaços: %', m.email; END IF;

  caso := 'A2';   -- e-mail inválido NÃO derruba o cadastro: só não é gravado
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro('', jsonb_build_object('nome', 'Zenobia Teste Dois', 'telefone', '(21) 99000-0102', 'email', 'isso-nao-e-email', 'lgpd_aceito', true));
  RESET ROLE;
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'A2: o cadastro deveria passar: %', r; END IF;
  IF (SELECT email FROM public.membros WHERE telefone_celular = '5521990000102') IS NOT NULL THEN RAISE EXCEPTION 'A2: e-mail inválido foi gravado.'; END IF;

  caso := 'A3';   -- ficha existente: e-mail só preenche se estava vazio
  UPDATE public.visitante_sessoes SET ativo = false WHERE ativo;
  INSERT INTO public.visitante_sessoes (culto) VALUES ('Culto de TESTE A3');
  SET LOCAL ROLE anon;
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zacarias', 'telefone', '21990000101', 'email', 'outro@exemplo.com', 'lgpd_aceito', true));
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zenobia', 'telefone', '21990000102', 'email', 'novo@exemplo.com', 'lgpd_aceito', true));
  RESET ROLE;
  IF (SELECT email FROM public.membros WHERE telefone_celular = '5521990000101') <> 'zac.teste@exemplo.com' THEN RAISE EXCEPTION 'A3: o e-mail existente foi reescrito.'; END IF;
  IF (SELECT email FROM public.membros WHERE telefone_celular = '5521990000102') IS DISTINCT FROM 'novo@exemplo.com' THEN RAISE EXCEPTION 'A3: o e-mail vazio deveria ter sido preenchido.'; END IF;

  -- ── B: canal e horário do contato ──────────────────────────────────────────────────────────────────────
  caso := 'B1';
  UPDATE public.visitante_sessoes SET ativo = false WHERE ativo;
  INSERT INTO public.visitante_sessoes (culto) VALUES ('Culto de TESTE B');
  SET LOCAL ROLE anon;
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zuleica Teste Tres', 'telefone', '21990000103', 'deseja_contato', true,
      'canal_contato', 'ligacao', 'horario_contato', 'tarde', 'lgpd_aceito', true));
  RESET ROLE;
  SELECT * INTO m FROM public.membros WHERE telefone_celular = '5521990000103';
  IF NOT EXISTS (SELECT 1 FROM public.visitante_checkins WHERE membro_id = m.id AND canal_contato = 'ligacao' AND horario_contato = 'tarde' AND prioridade = 2) THEN
    RAISE EXCEPTION 'B1: canal/horário não chegaram ao check-in (ou a prioridade não é 2).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vw_visitantes_aguardando_contato WHERE membro_id = m.id AND canal_contato = 'ligacao' AND horario_contato = 'tarde') THEN
    RAISE EXCEPTION 'B1: a fila pastoral não mostra canal/horário.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acompanhamentos_visitante WHERE membro_id = m.id AND proximo_passo ILIKE '%prefere ligação, à tarde%') THEN
    RAISE EXCEPTION 'B1: o texto do acompanhamento não traz a preferência: %', (SELECT proximo_passo FROM public.acompanhamentos_visitante WHERE membro_id = m.id LIMIT 1);
  END IF;

  caso := 'B2';   -- sem pedir contato: canal/horário descartados; valor fora da lista: descartado
  SET LOCAL ROLE anon;
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zelia Teste Quatro', 'telefone', '21990000104', 'deseja_contato', false,
      'canal_contato', 'whatsapp', 'horario_contato', 'manha', 'lgpd_aceito', true));
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zoraide Teste Cinco', 'telefone', '21990000105', 'deseja_contato', true,
      'canal_contato', 'pombo-correio', 'horario_contato', 'madrugada', 'lgpd_aceito', true));
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM public.visitante_checkins c JOIN public.membros x ON x.id = c.membro_id
              WHERE x.telefone_celular IN ('5521990000104', '5521990000105') AND (c.canal_contato IS NOT NULL OR c.horario_contato IS NOT NULL)) THEN
    RAISE EXCEPTION 'B2: canal/horário indevidos foram gravados.';
  END IF;

  -- ── C: URL limpa (código vazio) ────────────────────────────────────────────────────────────────────────
  caso := 'C1';   -- um ponto ativo: código vazio e NULL funcionam (A1 já usou '')
  SELECT count(*) INTO n FROM public.visitante_pontos WHERE ativo;
  IF n <> 1 THEN RAISE EXCEPTION 'C1: o ensaio esperava exatamente 1 ponto ativo antes de começar (achei %).', n; END IF;
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro(NULL, jsonb_build_object('nome', 'Zilda Teste Seis', 'telefone', '21990000106', 'lgpd_aceito', true));
  RESET ROLE;
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'C1: código NULL deveria usar o ponto ativo.'; END IF;

  caso := 'C2';   -- dois ativos: ambíguo, recusa (e nada grava)
  INSERT INTO public.visitante_pontos (nome) VALUES ('Ponto de TESTE 2') RETURNING id INTO ponto2;
  recusou := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Ambrosio Teste Sete', 'telefone', '21990000107', 'lgpd_aceito', true));
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  RESET ROLE;
  IF NOT recusou OR EXISTS (SELECT 1 FROM public.membros WHERE telefone_celular = '5521990000107') THEN RAISE EXCEPTION 'C2: com 2 pontos ativos o código vazio deveria ser recusado.'; END IF;
  SELECT p.codigo INTO codigo2 FROM public.visitante_pontos p WHERE p.id = ponto2;   -- (lido ANTES de virar anon: ele não enxerga a tabela)
  SET LOCAL ROLE anon;   -- mas o link com código segue valendo, em qualquer dos dois
  r := public.visitante_autocadastro(codigo2, jsonb_build_object('nome', 'Ambrosio Teste Sete', 'telefone', '21990000107', 'lgpd_aceito', true));
  RESET ROLE;
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'C2: o código explícito deveria funcionar.'; END IF;

  caso := 'C3';   -- nenhum ativo: recusa
  SELECT array_agg(id) INTO ativos FROM public.visitante_pontos WHERE ativo AND id <> ponto2;
  UPDATE public.visitante_pontos SET ativo = false;
  recusou := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zelinda Teste Oito', 'telefone', '21990000108', 'lgpd_aceito', true));
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  RESET ROLE;
  IF NOT recusou THEN RAISE EXCEPTION 'C3: sem ponto ativo, o link deveria estar desligado.'; END IF;
  UPDATE public.visitante_pontos SET ativo = true WHERE id = ANY (ativos);   -- só os que já estavam ativos (pode haver pontos antigos desligados)
  DELETE FROM public.visitante_pontos WHERE id = ponto2;   -- (os check-ins do ponto 2 ficam com ponto_id nulo: ON DELETE SET NULL)

  -- ── D: o funil ─────────────────────────────────────────────────────────────────────────────────────────
  caso := 'D1';
  SET LOCAL ROLE anon;
  PERFORM public.visitante_funil_passo('', s1, 1);
  PERFORM public.visitante_funil_passo('', s1, 2);
  PERFORM public.visitante_funil_passo('', s1, 1);        -- voltar não faz o passo recuar
  PERFORM public.visitante_funil_passo('', s2, 1);
  r := public.visitante_funil_passo('codigo-que-nao-existe', gen_random_uuid(), 1);
  RESET ROLE;
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'D1: código inexistente não deveria registrar.'; END IF;
  IF (SELECT passo_max FROM public.visitante_funil WHERE sessao_id = s1) <> 2 THEN RAISE EXCEPTION 'D1: o passo máximo deveria ser 2.'; END IF;

  caso := 'D2';   -- concluir marca a sessão e o tempo; a visão diária soma
  SET LOCAL ROLE anon;
  PERFORM public.visitante_autocadastro('', jsonb_build_object('nome', 'Zaqueu Teste Nove', 'telefone', '21990000109', 'lgpd_aceito', true,
      'sessao_id', s1::text, 'duracao_s', 47));
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM public.visitante_funil WHERE sessao_id = s1 AND concluiu AND passo_max = 3 AND duracao_s = 47) THEN RAISE EXCEPTION 'D2: a conclusão não foi registrada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vw_visitante_funil_diario WHERE concluiram >= 1 AND abriram >= 2 AND chegaram_passo_2 >= 1) THEN RAISE EXCEPTION 'D2: a visão diária não soma.'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name = 'visitante_funil'
       AND column_name ~* '(nome|telefone|email|ip|membro|pessoa)') > 0 THEN RAISE EXCEPTION 'D2: o funil não pode ter coluna que identifique a pessoa.'; END IF;

  caso := 'D3';   -- sessao_id e duracao_s lixo não derrubam o cadastro
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro('', jsonb_build_object('nome', 'Zebedeu Teste Dez', 'telefone', '21990000110', 'lgpd_aceito', true, 'sessao_id', 'xyz', 'duracao_s', 'abc'));
  RESET ROLE;
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'D3: lixo na medição não pode derrubar o cadastro.'; END IF;

  caso := 'D4';   -- o anônimo só executa; não lê funil nem visão
  IF has_table_privilege('anon', 'public.visitante_funil', 'SELECT') OR has_table_privilege('anon', 'public.vw_visitante_funil_diario', 'SELECT') THEN
    RAISE EXCEPTION 'D4: anon tem SELECT no funil.';
  END IF;
  IF NOT has_function_privilege('anon', 'public.visitante_funil_passo(text, uuid, int)', 'EXECUTE') THEN RAISE EXCEPTION 'D4: anon precisa chamar visitante_funil_passo.'; END IF;
  IF has_function_privilege('anon', 'public.visitante_ponto_resolver(text)', 'EXECUTE') THEN RAISE EXCEPTION 'D4: visitante_ponto_resolver é interna.'; END IF;

  -- ── E: o link antigo (?p=código) continua valendo ──────────────────────────────────────────────────────
  caso := 'E1';
  SET LOCAL ROLE anon;
  r := public.visitante_autocadastro(codigo, jsonb_build_object('nome', 'Zenaide Teste Onze', 'telefone', '21990000111', 'lgpd_aceito', true));
  RESET ROLE;
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'E1: o código antigo deveria continuar valendo.'; END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
