-- ─── ENSAIO FUNCIONAL do Favorecido Financeiro — roda DEPOIS do SQL da modelagem, na MESMA transação, e desfaz ────
-- Casos: (1) vincular cria o favorecido da pessoa · (2) vincular de novo NÃO duplica · (3) candidatos acham o cadastro
-- financeiro existente (mesmo nome, mesmo com prefixo de CNPJ de MEI) · (4) vincular ao cadastro existente LIGA, não cria ·
-- (5) cadastro já de outra pessoa é recusado · (6) a view diz a natureza certa e resolve lançamento por fornecedor_id e por
-- pessoa_id · (7) o anônimo não lê nada · (8) uma pessoa, um favorecido (índice único).

DO $ensaio$
DECLARE
  uid uuid; p1 uuid; p2 uuid; f_exist uuid; f1 uuid; f1b uuid; f2 uuid; l_for uuid; l_pes uuid; conta uuid; n int; recusou boolean; r record; caso text := '0'; ctx text;
BEGIN
  SELECT user_id INTO uid FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SELECT id INTO conta FROM public.fin_contas ORDER BY created_at LIMIT 1;

  INSERT INTO public.membros (nome_completo, tipo_pessoa, status, cpf, origem_cadastro)
    VALUES ('Zacarias TESTE Favorecido', 'membro', 'ativo', '11122233344', 'sistema') RETURNING id INTO p1;
  INSERT INTO public.membros (nome_completo, tipo_pessoa, status, origem_cadastro)
    VALUES ('Yolanda TESTE Prestadora', 'congregado', 'ativo', 'sistema') RETURNING id INTO p2;
  -- cadastro financeiro JÁ existente, de MEI: nome com prefixo de CNPJ, sem vínculo
  INSERT INTO public.fin_fornecedores (nome, tipo, cnpj_cpf) VALUES ('99.888.777 Yolanda TESTE Prestadora', 'juridica', '99888777000199') RETURNING id INTO f_exist;

  caso := '1';
  f1 := public.fin_vincular_pessoa_favorecido(p1);
  SELECT * INTO r FROM public.fin_fornecedores WHERE id = f1;
  IF r.pessoa_id <> p1 OR r.nome <> 'Zacarias TESTE Favorecido' OR r.tipo <> 'fisica' OR r.cnpj_cpf <> '11122233344' THEN
    RAISE EXCEPTION 'Caso 1: o favorecido não nasceu como esperado: %', row_to_json(r);
  END IF;

  caso := '2';
  f1b := public.fin_vincular_pessoa_favorecido(p1);
  IF f1b <> f1 THEN RAISE EXCEPTION 'Caso 2: vincular de novo criou OUTRO favorecido.'; END IF;
  SELECT count(*) INTO n FROM public.fin_fornecedores WHERE pessoa_id = p1;
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 2: duplicou (%).', n; END IF;

  caso := '3';
  SELECT count(*) INTO n FROM public.fin_favorecido_candidatos(p2) WHERE id = f_exist AND motivo = 'mesmo nome';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 3: o cadastro de MEI com prefixo de CNPJ não apareceu como candidato.'; END IF;
  SELECT count(*) INTO n FROM public.fin_favorecido_candidatos(p1) WHERE id = f1;
  IF n <> 0 THEN RAISE EXCEPTION 'Caso 3: quem já está vinculado não pode ser candidato.'; END IF;

  caso := '4';
  f2 := public.fin_vincular_pessoa_favorecido(p2, f_exist);
  IF f2 <> f_exist THEN RAISE EXCEPTION 'Caso 4: devia ligar o cadastro existente, e criou outro.'; END IF;
  SELECT * INTO r FROM public.fin_fornecedores WHERE id = f_exist;
  IF r.pessoa_id <> p2 OR r.tipo <> 'fisica' OR r.cnpj_cpf <> '99888777000199' THEN RAISE EXCEPTION 'Caso 4: o cadastro ligado mudou de forma inesperada: %', row_to_json(r); END IF;

  caso := '5';
  recusou := false;
  BEGIN PERFORM public.fin_vincular_pessoa_favorecido(p1 /* já tem */, f_exist); EXCEPTION WHEN OTHERS THEN recusou := true; END;
  -- p1 já é favorecido: devolve o dele (não é erro); o erro é ligar um cadastro que é de OUTRA pessoa a quem ainda não tem
  INSERT INTO public.membros (nome_completo, tipo_pessoa, status, origem_cadastro) VALUES ('Xavier TESTE Terceiro', 'membro', 'ativo', 'sistema') RETURNING id INTO p1;
  recusou := false;
  BEGIN PERFORM public.fin_vincular_pessoa_favorecido(p1, f_exist); EXCEPTION WHEN OTHERS THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION 'Caso 5: ligou a uma 2ª pessoa um cadastro que já era de outra.'; END IF;

  caso := '6';
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, valor_variavel)
    VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 10, 'TESTE FAV POR FORNECEDOR', f2, false) RETURNING id INTO l_for;
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, pessoa_id, valor_variavel)
    VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 20, 'TESTE FAV POR PESSOA', p2, false) RETURNING id INTO l_pes;
  IF (SELECT favorecido_id FROM public.vw_lancamento_favorecido WHERE lancamento_id = l_for) IS DISTINCT FROM f2
     OR (SELECT favorecido_id FROM public.vw_lancamento_favorecido WHERE lancamento_id = l_pes) IS DISTINCT FROM f2 THEN
    RAISE EXCEPTION 'Caso 6: os dois caminhos (fornecedor_id e pessoa_id) deveriam chegar ao mesmo favorecido.';
  END IF;
  IF (SELECT natureza FROM public.vw_favorecidos WHERE id = f2) <> 'pessoa'
     OR (SELECT nome FROM public.vw_favorecidos WHERE id = f2) <> 'Yolanda TESTE Prestadora'
     OR (SELECT natureza FROM public.vw_favorecidos WHERE id = (SELECT id FROM public.fin_fornecedores WHERE tipo = 'juridica' LIMIT 1)) <> 'empresa' THEN
    RAISE EXCEPTION 'Caso 6: natureza/nome da view não bate.';
  END IF;

  caso := '8';
  recusou := false;
  BEGIN UPDATE public.fin_fornecedores SET pessoa_id = p2 WHERE id = (SELECT id FROM public.fin_fornecedores WHERE pessoa_id IS NULL LIMIT 1);
  EXCEPTION WHEN unique_violation THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION 'Caso 8: dois favorecidos para a mesma pessoa foram aceitos.'; END IF;

  caso := '7';
  IF has_table_privilege('anon', 'public.vw_favorecidos', 'SELECT') OR has_table_privilege('anon', 'public.vw_lancamento_favorecido', 'SELECT')
     OR has_function_privilege('anon', 'public.fin_vincular_pessoa_favorecido(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fin_favorecido_candidatos(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Caso 7: anon enxerga/chama algo do favorecido.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
