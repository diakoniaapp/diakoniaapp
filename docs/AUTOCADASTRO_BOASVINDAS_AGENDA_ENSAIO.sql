-- ─── ENSAIO da migration 20261008130000_boasvindas_agenda_automatica.sql — roda DEPOIS dela, na MESMA transação ────
-- Monta-se: BEGIN; + migration + este arquivo + ROLLBACK;   "Success. No rows returned" = todos os casos passaram. Nada fica gravado.
-- Cria no meio da transação uma agenda de teste (títulos com "ZZ") com datas relativas a HOJE e confere a expansão das regras:
-- semanal (dias e intervalo), mensal, diário, fim por data e por contagem, exceção cancelada, exceção remarcada, avulsos,
-- prioridade, os dois modos, o limite, o rótulo dos dias e o que o anônimo pode chamar.

DO $ensaio$
DECLARE
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  dom date; d1 date; d2 date; r record; n int; caso text := '0'; ctx text; recusou boolean; v jsonb;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s7 uuid; a1 uuid; a2 uuid;
  titulos text[];
  quinzena_dow int := extract(dow FROM hoje)::int;
BEGIN
  IF to_regprocedure('public.visitante_agenda_itens(date, int)') IS NULL THEN RAISE EXCEPTION 'Ensaio: a migration não rodou antes do teste — cole o texto INTEIRO.'; END IF;
  dom := hoje + ((7 - extract(dow FROM hoje)::int) % 7);          -- o próximo domingo (hoje, se for domingo)

  -- ── 1: os rótulos ──────────────────────────────────────────────────────────────────────────────────────
  caso := '1';
  IF public.visitante_dias_label(ARRAY[1,2,3,4,5]) <> 'Segunda a sexta' OR public.visitante_dias_label(ARRAY[0]) <> 'Domingo'
     OR public.visitante_dias_label(ARRAY[0,6]) <> 'Domingo e sábado' OR public.visitante_dias_label(ARRAY[1,2]) <> 'Segunda e terça'
     OR public.visitante_dias_label(ARRAY[1,2,3,4]) <> 'Segunda a quinta' OR public.visitante_dias_label(ARRAY[0,2,4]) <> 'Domingo, terça e quinta'
     OR public.visitante_hora_label(TIME '09:00') <> '09h00' OR public.visitante_hora_label(TIME '19:30') <> '19h30'
     OR public.visitante_quando_pontual(DATE '2026-10-24', TIME '19:00') <> 'Sábado, 24/10 · 19h00' THEN
    RAISE EXCEPTION '1: rótulo de dias/hora inesperado: % | % | % | %', public.visitante_dias_label(ARRAY[1,2,3,4,5]), public.visitante_dias_label(ARRAY[0,6]),
      public.visitante_dias_label(ARRAY[0,2,4]), public.visitante_quando_pontual(DATE '2026-10-24', TIME '19:00');
  END IF;

  -- ── a agenda de teste ──────────────────────────────────────────────────────────────────────────────────
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra, local)
    VALUES ('Escola Bíblica ZZ | MINISTÉRIO X', 'curso', hoje - 60, TIME '09:00', jsonb_build_object('freq', 'semanal', 'intervalo', 1, 'dias_semana', jsonb_build_array(0), 'fim', jsonb_build_object('tipo', 'nunca')), 'Templo Principal - andares_superiores') RETURNING id INTO s1;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)
    VALUES ('ZZ Culto Noite', 'culto', hoje - 60, TIME '18:30', jsonb_build_object('freq', 'semanal', 'intervalo', 1, 'dias_semana', jsonb_build_array(0), 'fim', jsonb_build_object('tipo', 'data', 'data', to_char(hoje + 200, 'YYYY-MM-DD')))) RETURNING id INTO s2;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)
    VALUES ('ZZ Live', 'live', hoje - 60, TIME '06:30', jsonb_build_object('freq', 'semanal', 'intervalo', 1, 'dias_semana', jsonb_build_array(1,2,3,4,5), 'fim', jsonb_build_object('tipo', 'nunca'))) RETURNING id INTO s3;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)
    VALUES ('ZZ Mensal', 'outro', make_date(extract(year FROM hoje - 100)::int, extract(month FROM hoje - 100)::int, 15), TIME '19:30', jsonb_build_object('freq', 'mensal', 'intervalo', 1, 'fim', jsonb_build_object('tipo', 'nunca'))) RETURNING id INTO s4;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)   -- encerrada ontem
    VALUES ('ZZ Encerrada', 'culto', hoje - 60, TIME '10:00', jsonb_build_object('freq', 'semanal', 'intervalo', 1, 'dias_semana', jsonb_build_array(0,1,2,3,4,5,6), 'fim', jsonb_build_object('tipo', 'data', 'data', to_char(hoje - 1, 'YYYY-MM-DD'))));
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)   -- por contagem: 2 ocorrências, ambas já passaram
    VALUES ('ZZ Contagem', 'culto', hoje - 28, TIME '10:00', jsonb_build_object('freq', 'semanal', 'intervalo', 2, 'dias_semana', jsonb_build_array(quinzena_dow), 'fim', jsonb_build_object('tipo', 'ocorrencias', 'n', 2)));
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra)   -- quinzenal que começou semana passada: a próxima é daqui a 7 dias
    VALUES ('ZZ Quinzenal', 'outro', hoje - 7, TIME '20:00', jsonb_build_object('freq', 'semanal', 'intervalo', 2, 'dias_semana', jsonb_build_array(quinzena_dow), 'fim', jsonb_build_object('tipo', 'nunca'))) RETURNING id INTO s7;
  UPDATE public.eventos SET recorrencia_id = id WHERE id IN (s1, s2, s3, s4, s7) OR titulo IN ('ZZ Encerrada', 'ZZ Contagem');

  -- exceções do Culto Noite: o próximo domingo CANCELADO; o seguinte REMARCADO para 20:00
  d1 := dom; d2 := dom + 7;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, is_excecao, serie_origem_id, ocorrencia_original_data, status, recorrencia_id)
    VALUES ('ZZ Culto Noite', 'culto', d1, TIME '18:30', true, s2, d1, 'cancelado', s2);
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, is_excecao, serie_origem_id, ocorrencia_original_data, status, recorrencia_id)
    VALUES ('ZZ Culto Noite', 'culto', d2, TIME '20:00', true, s2, d2, 'agendado', s2);

  -- avulsos
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio) VALUES ('ZZ Culto Especial', 'culto', hoje + 5, TIME '19:00') RETURNING id INTO a1;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio) VALUES ('ZZ Almoço', 'outro', hoje + 3, TIME '12:00') RETURNING id INTO a2;
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, status) VALUES ('ZZ Cancelado', 'culto', hoje + 4, TIME '19:00', 'cancelado');
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio) VALUES ('ZZ Distante', 'culto', hoje + 120, TIME '19:00');
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio) VALUES ('ZZ Passado', 'culto', hoje - 3, TIME '19:00');

  -- ── 2: a expansão ──────────────────────────────────────────────────────────────────────────────────────
  caso := '2a';   -- EBD: semanal aos domingos, sem fim; prioridade 1 pelo título; o local sai sem os andares
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = s1;
  IF r.chave IS NULL OR r.quando <> 'Domingo · 09h00' OR r.proxima <> dom OR r.prioridade <> 1 OR NOT r.padrao OR r.titulo <> 'Escola Bíblica ZZ' OR r.local <> 'Templo Principal' OR NOT r.recorrente THEN
    RAISE EXCEPTION '2a: EBD errada: %', row_to_json(r);
  END IF;
  caso := '2b';   -- exceção cancelada some; exceção remarcada vira a próxima ocorrência, com a hora nova
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = s2;
  IF r.chave IS NULL OR r.proxima <> d2 OR r.quando <> public.visitante_quando_pontual(d2, TIME '20:00') OR r.prioridade <> 1 THEN
    RAISE EXCEPTION '2b: o culto com exceções deveria ser a data remarcada (%): %', d2, row_to_json(r);
  END IF;
  caso := '2c';   -- segunda a sexta, recorrente não-culto: prioridade 2, fora do padrão
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = s3;
  IF r.quando <> 'Segunda a sexta · 06h30' OR r.prioridade <> 2 OR r.padrao THEN RAISE EXCEPTION '2c: live errada: %', row_to_json(r); END IF;
  caso := '2d';   -- mensal
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = s4;
  IF r.quando <> 'Todo dia 15 · 19h30' OR extract(day FROM r.proxima) <> 15 OR r.proxima < hoje OR r.proxima > hoje + 31 THEN RAISE EXCEPTION '2d: mensal errada: %', row_to_json(r); END IF;
  caso := '2e';   -- encerrada (fim por data) e por contagem esgotada não aparecem
  IF EXISTS (SELECT 1 FROM public.visitante_agenda_itens(hoje) WHERE titulo IN ('ZZ Encerrada', 'ZZ Contagem')) THEN RAISE EXCEPTION '2e: série encerrada apareceu.'; END IF;
  caso := '2f';   -- quinzenal: respeita o intervalo
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = s7;
  IF r.proxima <> hoje + 7 OR r.quando NOT LIKE 'A cada 2 semanas: %' THEN RAISE EXCEPTION '2f: quinzenal errada: %', row_to_json(r); END IF;
  caso := '2g';   -- avulsos: culto = prioridade 1; almoço = 3; cancelado, distante e passado ficam de fora
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = a1;
  IF r.prioridade <> 1 OR NOT r.padrao OR r.recorrente OR r.proxima <> hoje + 5 THEN RAISE EXCEPTION '2g: culto avulso errado: %', row_to_json(r); END IF;
  SELECT * INTO r FROM public.visitante_agenda_itens(hoje) WHERE chave = a2;
  IF r.prioridade <> 3 OR r.padrao THEN RAISE EXCEPTION '2g: almoço avulso errado: %', row_to_json(r); END IF;
  IF EXISTS (SELECT 1 FROM public.visitante_agenda_itens(hoje) WHERE titulo IN ('ZZ Cancelado', 'ZZ Distante', 'ZZ Passado')) THEN RAISE EXCEPTION '2g: avulso que não vale apareceu.'; END IF;
  caso := '2i';   -- série DUPLICADA (mesmo título e horário em duas séries) aparece uma vez só
  INSERT INTO public.eventos (titulo, tipo, data, hora_inicio, recorrencia_regra) SELECT titulo, tipo, data + 1, hora_inicio, recorrencia_regra FROM public.eventos WHERE id = s3;
  UPDATE public.eventos SET recorrencia_id = id WHERE titulo = 'ZZ Live' AND recorrencia_id IS NULL;
  SELECT count(*) INTO n FROM public.visitante_agenda_itens(hoje) WHERE titulo = 'ZZ Live';
  IF n <> 1 THEN RAISE EXCEPTION '2i: a série duplicada apareceu % vezes.', n; END IF;
  caso := '2h';   -- cada série é UM item
  SELECT count(*) INTO n FROM public.visitante_agenda_itens(hoje) WHERE chave = s1;
  IF n <> 1 THEN RAISE EXCEPTION '2h: a EBD apareceu % vezes.', n; END IF;

  -- ── 3: os modos, como o visitante os vê ────────────────────────────────────────────────────────────────
  caso := '3a';   -- automático: o grupo 1 por padrão; a administração liga a live; a ordem é cultos → recorrentes → especiais
  UPDATE public.visitante_boasvindas SET eventos_modo = 'automatico', eventos_mostrar = true, eventos_max = 10, agenda_incluidos = ARRAY[s3], agenda_ocultos = '{}';
  SET LOCAL ROLE anon;
  v := public.visitante_boasvindas();
  RESET ROLE;
  SELECT array_agg(e->>'titulo' ORDER BY o) INTO titulos FROM jsonb_array_elements(v->'eventos') WITH ORDINALITY t(e, o) WHERE e->>'titulo' LIKE '%ZZ%';
  -- (a ordem entre os cultos depende do dia da semana de hoje; o que não varia: a live, que é prioridade 2, vem DEPOIS de todos os cultos)
  IF (SELECT array_agg(x ORDER BY x) FROM unnest(titulos) x) IS DISTINCT FROM ARRAY['Escola Bíblica ZZ', 'ZZ Culto Especial', 'ZZ Culto Noite', 'ZZ Live']
     OR titulos[array_length(titulos, 1)] <> 'ZZ Live' THEN
    RAISE EXCEPTION '3a: ordem/seleção do automático errada: %', titulos;
  END IF;
  caso := '3b';   -- ocultar uma série padrão tira ela
  UPDATE public.visitante_boasvindas SET agenda_ocultos = ARRAY[s1], agenda_incluidos = '{}';
  v := public.visitante_boasvindas();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'eventos') e WHERE e->>'titulo' = 'Escola Bíblica ZZ') OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v->'eventos') e WHERE e->>'titulo' = 'ZZ Culto Noite') THEN
    RAISE EXCEPTION '3b: ocultar não funcionou: %', v->'eventos';
  END IF;
  caso := '3c';   -- manual: só o que foi marcado + o digitado; o resto da agenda não aparece
  UPDATE public.visitante_boasvindas SET eventos_modo = 'manual', agenda_incluidos = ARRAY[s4], agenda_ocultos = '{}',
         eventos = jsonb_build_array(jsonb_build_object('titulo', 'ZZ Digitado', 'quando', 'Quando eu quiser', 'ativo', true, 'data', '', 'local', '', 'link', ''));
  v := public.visitante_boasvindas();
  SELECT array_agg(e->>'titulo' ORDER BY o) INTO titulos FROM jsonb_array_elements(v->'eventos') WITH ORDINALITY t(e, o);
  IF titulos IS DISTINCT FROM ARRAY['ZZ Mensal', 'ZZ Digitado'] THEN RAISE EXCEPTION '3c: manual errado: %', titulos; END IF;
  caso := '3d';   -- no automático o digitado é ignorado
  UPDATE public.visitante_boasvindas SET eventos_modo = 'automatico', agenda_incluidos = '{}';
  v := public.visitante_boasvindas();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'eventos') e WHERE e->>'titulo' = 'ZZ Digitado') THEN RAISE EXCEPTION '3d: o digitado apareceu no automático.'; END IF;
  caso := '3e';   -- o limite e o "mostrar"
  UPDATE public.visitante_boasvindas SET eventos_max = 2;
  v := public.visitante_boasvindas();
  IF jsonb_array_length(v->'eventos') <> 2 THEN RAISE EXCEPTION '3e: o limite de 2 não foi respeitado: %', jsonb_array_length(v->'eventos'); END IF;
  UPDATE public.visitante_boasvindas SET eventos_mostrar = false;
  v := public.visitante_boasvindas();
  IF jsonb_array_length(v->'eventos') <> 0 THEN RAISE EXCEPTION '3e: "mostrar" desligado deveria dar lista vazia.'; END IF;
  caso := '3f';   -- nada de link no item da agenda; o modo é validado
  UPDATE public.visitante_boasvindas SET eventos_mostrar = true, eventos_max = 10;
  v := public.visitante_boasvindas();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v->'eventos') e WHERE e->>'link' IS NOT NULL AND e->>'titulo' LIKE 'ZZ%') THEN RAISE EXCEPTION '3f: item da agenda não deveria ter link.'; END IF;
  recusou := false;
  BEGIN UPDATE public.visitante_boasvindas SET eventos_modo = 'qualquer'; EXCEPTION WHEN OTHERS THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '3f: aceitou um modo inválido.'; END IF;

  -- ── 4: permissões ──────────────────────────────────────────────────────────────────────────────────────
  caso := '4';
  IF has_function_privilege('anon', 'public.visitante_agenda_itens(date, int)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.visitante_agenda_itens(date, int)', 'EXECUTE') THEN
    RAISE EXCEPTION '4: visitante_agenda_itens é interna: ninguém de fora chama.';
  END IF;
  IF has_function_privilege('anon', 'public.visitante_agenda_candidatos()', 'EXECUTE') THEN RAISE EXCEPTION '4: anon não pode ver a lista inteira da agenda.'; END IF;
  IF NOT has_function_privilege('anon', 'public.visitante_boasvindas()', 'EXECUTE') THEN RAISE EXCEPTION '4: anon precisa chamar visitante_boasvindas().'; END IF;
  recusou := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.visitante_agenda_candidatos();   -- sem papel de administração
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  RESET ROLE;
  IF NOT recusou THEN RAISE EXCEPTION '4: quem não é da administração conseguiu ler a lista da agenda.'; END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
