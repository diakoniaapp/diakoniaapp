-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio do saldo pendente sem a marca do extrato (migration 20261016120000) contra os dados REAIS ─────────────────────────────────────────
-- Dentro de uma transação que será desfeita, com um administrador real: (B0) REPRODUZ o defeito antes da correção — pagamento parcial de uma despesa
-- com marca [ofx:…] é recusado com "já está ligada a outra despesa"; (M) roda a migration e confere que nenhum lançamento e nenhum vínculo existente
-- mudou; (P1) o mesmo pagamento parcial passa: o pago fica com a marca e o vínculo, o saldo pendente nasce SEM a marca e com o resto da observação;
-- (P2) despesa sem marca: o saldo pendente copia a observação exatamente como antes; (P3) baixa total segue igual; (P4) a troca acontece uma vez só.
-- Leia o fim da mensagem: "TUDO OK, pode aplicar" ou "HÁ FALHAS, NÃO aplique".
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; n int;
  h_lanc_antes text; h_vinc_antes text; h_lanc_depois text; h_vinc_depois text; n_lanc bigint; n_vinc bigint;
  conta uuid; emit uuid; l1 uuid; l2 uuid; l3 uuid; resto uuid; x public.fin_lancamentos%ROWTYPE; r public.fin_lancamentos%ROWTYPE;
  def text;
BEGIN
  IF to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'fin_liquidar não existe com a assinatura esperada: não aplique.';
  END IF;
  IF to_regclass('public.fin_extrato_vinculos') IS NULL THEN RAISE EXCEPTION 'Os vínculos do extrato (D4) não existem: este defeito não acontece neste banco.'; END IF;
  IF position('fin_sem_marcas_do_extrato(l.observacoes)' IN pg_get_functiondef('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)'::regprocedure)) > 0 THEN
    rel := 'AVISO: a correção JÁ está aplicada; o ensaio roda assim mesmo (B0 não vai reproduzir o defeito). ';
  END IF;

  SELECT ur.user_id INTO uid FROM public.user_roles ur WHERE ur.role::text = 'admin' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'Nenhum administrador encontrado: o ensaio precisa de um para chamar fin_liquidar.'; END IF;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SELECT id INTO conta FROM public.fin_contas ORDER BY id LIMIT 1;
  SELECT id INTO emit FROM public.fin_fornecedores ORDER BY id LIMIT 1;

  -- ── antes: a fotografia do que existe (sem as despesas do ensaio) ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, observacoes, obrigacao_id, liquidacao_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_vinc, h_vinc_antes FROM (SELECT id, conta_id, fitid, lancamento_id, desfeito_em FROM public.fin_extrato_vinculos) t;
  rel := rel || format('ANTES: %s lançamentos; %s vínculos com o extrato.', n_lanc, n_vinc);

  -- as despesas do ensaio (desfeitas no fim): uma COM marca do extrato, uma SEM, outra COM para a baixa total
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, observacoes)
  VALUES (conta, 'saida', 'previsto', current_date - 2, 100, 'ENSAIO parcial com marca', emit, 'manual', E'Nota do escritório\n[ofx:ENSAIO-PARCIAL-1]') RETURNING id INTO l1;
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, observacoes)
  VALUES (conta, 'saida', 'previsto', current_date - 2, 100, 'ENSAIO parcial sem marca', emit, 'manual', 'Só texto, sem marca') RETURNING id INTO l2;
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, observacoes)
  VALUES (conta, 'saida', 'previsto', current_date - 2, 100, 'ENSAIO total com marca', emit, 'manual', '[ofx:ENSAIO-TOTAL-1]') RETURNING id INTO l3;

  -- B0: o defeito, ANTES da correção
  BEGIN
    PERFORM public.fin_liquidar(conta, current_date, NULL::public.fin_forma_pagamento, 60, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'valor_pago', 60)), '[]'::jsonb, NULL, NULL, NULL);
    rel := rel || ' B0: o pagamento parcial PASSOU antes da correção (o defeito não se reproduziu neste banco).';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
    IF msg LIKE '%já está ligada a outra despesa%' THEN rel := rel || ' B0 ok (o defeito se reproduz: o pagamento parcial de uma despesa com marca do extrato é recusado).';
    ELSE ok := false; rel := rel || ' FALHOU B0: recusado por outro motivo — ' || msg; END IF;
  END;

  -- ── a migration inteira ──
  EXECUTE $m1$CREATE OR REPLACE FUNCTION public.fin_sem_marcas_do_extrato(obs text) RETURNS text
LANGUAGE sql IMMUTABLE
AS $f$ SELECT NULLIF(btrim(regexp_replace(COALESCE(obs, ''), '\s*\[ofx:[^\]]+\]', '', 'g')), '') $f$;$m1$;
  EXECUTE $m2$DO $mig$
DECLARE
  fn regprocedure := to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)');
  def text; n int;
  antes  CONSTANT text := 'l.documento_numero, l.observacoes, l.origem';
  depois CONSTANT text := 'l.documento_numero, public.fin_sem_marcas_do_extrato(l.observacoes), l.origem';
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'fin_liquidar não existe com a assinatura esperada: NÃO aplique sem revisar. Nada foi gravado.'; END IF;
  def := pg_get_functiondef(fn);
  IF position(depois IN def) > 0 THEN RAISE NOTICE 'fin_liquidar já está corrigida: nada a fazer.'; RETURN; END IF;
  n := (length(def) - length(replace(def, antes, ''))) / length(antes);
  IF n <> 1 THEN
    RAISE EXCEPTION 'O trecho "%" aparece % vez(es) na fin_liquidar viva (esperado: 1). Alguém a alterou: NÃO aplique sem revisar. Nada foi gravado.', antes, n;
  END IF;
  EXECUTE replace(def, antes, depois);
END
$mig$;$m2$;

  -- M: nada existente mudou (fora as 3 despesas do ensaio e seus vínculos)
  SELECT md5(string_agg(t::text, '|' ORDER BY id)) INTO h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, observacoes, obrigacao_id, liquidacao_id FROM public.fin_lancamentos WHERE id NOT IN (l1, l2, l3)) t;
  SELECT md5(string_agg(t::text, '|' ORDER BY id)) INTO h_vinc_depois FROM (SELECT id, conta_id, fitid, lancamento_id, desfeito_em FROM public.fin_extrato_vinculos WHERE fitid NOT LIKE 'ENSAIO-%') t;
  def := pg_get_functiondef('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)'::regprocedure);
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR h_vinc_depois IS DISTINCT FROM h_vinc_antes THEN ok := false; rel := rel || ' FALHOU M: algum lançamento ou vínculo existente mudou.';
  ELSIF position('fin_sem_marcas_do_extrato(l.observacoes)' IN def) = 0 THEN ok := false; rel := rel || ' FALHOU M: a fin_liquidar não foi corrigida.';
  ELSE rel := rel || format(' M ok (fin_liquidar corrigida; os %s lançamentos e %s vínculos que já existiam seguem IDÊNTICOS).', n_lanc, n_vinc); END IF;

  -- P1: o mesmo pagamento parcial, agora
  BEGIN
    PERFORM public.fin_liquidar(conta, current_date, NULL::public.fin_forma_pagamento, 60, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'valor_pago', 60)), '[]'::jsonb, NULL, NULL, NULL);
    SELECT * INTO x FROM public.fin_lancamentos WHERE id = l1;
    SELECT * INTO r FROM public.fin_lancamentos WHERE obrigacao_id = l1 AND id <> l1;
    SELECT count(*) INTO n FROM public.fin_extrato_vinculos WHERE fitid = 'ENSAIO-PARCIAL-1' AND desfeito_em IS NULL AND lancamento_id = l1;
    IF x.status::text = 'realizado' AND x.valor = 60 AND x.observacoes LIKE '%[ofx:ENSAIO-PARCIAL-1]%' AND n = 1
       AND r.status::text = 'previsto' AND r.valor = 40 AND r.observacoes = 'Nota do escritório'
       AND NOT EXISTS (SELECT 1 FROM public.fin_extrato_vinculos WHERE lancamento_id = r.id) THEN
      rel := rel || ' P1 ok (pagamento parcial passa: os R$ 60 pagos ficam com a marca e o vínculo; os R$ 40 pendentes nascem sem a marca, com "Nota do escritório" preservada).';
    ELSE ok := false; rel := rel || format(' FALHOU P1: pago %s/%s/%s vínculos=%s; pendente %s/%s/"%s".', x.status, x.valor, x.observacoes, n, r.status, r.valor, r.observacoes); END IF;
  EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P1: ' || SQLERRM; END;

  -- P2: sem marca, o saldo pendente copia a observação como antes
  BEGIN
    PERFORM public.fin_liquidar(conta, current_date, NULL::public.fin_forma_pagamento, 30, jsonb_build_array(jsonb_build_object('lancamento_id', l2, 'valor_pago', 30)), '[]'::jsonb, NULL, NULL, NULL);
    SELECT * INTO r FROM public.fin_lancamentos WHERE obrigacao_id = l2 AND id <> l2;
    IF r.valor = 70 AND r.observacoes = 'Só texto, sem marca' THEN rel := rel || ' P2 ok (sem marca, o saldo pendente copia a observação exatamente como antes).';
    ELSE ok := false; rel := rel || format(' FALHOU P2: pendente %s/"%s".', r.valor, r.observacoes); END IF;
  EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P2: ' || SQLERRM; END;

  -- P3: baixa total de despesa com marca segue igual (não cria saldo)
  BEGIN
    PERFORM public.fin_liquidar(conta, current_date, NULL::public.fin_forma_pagamento, 100, jsonb_build_array(jsonb_build_object('lancamento_id', l3, 'valor_pago', 100)), '[]'::jsonb, NULL, NULL, NULL);
    SELECT * INTO x FROM public.fin_lancamentos WHERE id = l3;
    IF x.status::text = 'realizado' AND x.observacoes = '[ofx:ENSAIO-TOTAL-1]' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE obrigacao_id = l3 AND id <> l3) THEN
      rel := rel || ' P3 ok (baixa total igual a antes: sem saldo, marca mantida).';
    ELSE ok := false; rel := rel || ' FALHOU P3.'; END IF;
  EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P3: ' || SQLERRM; END;

  -- P4: a troca aparece uma vez só (o APLICAR, rodado de novo, reconhece a função já corrigida e não faz nada)
  IF (length(def) - length(replace(def, 'fin_sem_marcas_do_extrato(', ''))) / length('fin_sem_marcas_do_extrato(') = 1 THEN rel := rel || ' P4 ok (a troca aparece uma vez só, no saldo pendente).';
  ELSE ok := false; rel := rel || ' FALHOU P4: a troca aparece mais de uma vez.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
