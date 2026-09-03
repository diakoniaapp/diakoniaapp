-- ═══════════════════════════════════════════════════════════════════════════
-- Introdução e Recepção são uma equipe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE FOI MEDIDO, E O QUE A IGREJA CONFIRMOU ────────────────────────────
--
-- Duas áreas do mesmo ministério, os mesmos 5 eventos, nenhum checklist em
-- nenhuma das duas, e só 2 das 45 pessoas servindo nas duas ao mesmo tempo —
-- o retrato de duas equipes separadas. Mas a igreja respondeu à pergunta que
-- decide: "eles coordenam a mesma escala." Henrique (Introdução) e Ana Paula
-- (Recepção) não são dois times independentes — são uma equipe com dois
-- nomes.
--
-- E "Acolhida de visitante", semeado ontem como POSTO de Recepção, já dizia
-- em uma frase o que a área Introdução inteira existe para fazer. Duas
-- modelagens do mesmo fato, uma em cada nível.
--
-- ── ÁREA ABSORVE MAIS DO QUE ATENDER O VISITANTE ────────────────────────────
--
-- A igreja também contou o que Recepção faz e não é atender ninguém: preparar
-- o kit do visitante, sinalizar falta de material (canetas), manter limpos os
-- jalecos. Isso não é posto — ninguém "ocupa o cargo de jaleco limpo" — é
-- checklist: tarefa da ÁREA, conferida a cada escala, e é exatamente para
-- isso que `checklist_area` existe. Estava vazia nas duas áreas; não porque
-- não houvesse tarefa, mas porque ninguém tinha perguntado.
--
-- Isso resolve a dúvida do dia inteiro: postos descrevem o que uma PESSOA faz
-- quando serve; checklist descreve o que a ÁREA precisa, sirva quem servir.
-- Recepção "abrange mais tarefas" — só que pelo eixo certo, que não é posto.
--
-- ── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--
--   1. Recepção ganha Henrique como co-líder — ninguém perde liderança,
--      os dois passam a responder pela mesma área.
--   2. Os 18 vínculos de Introdução sem par em Recepção migram de área.
--      Os 2 que já serviam nas duas (Ana Paula, Hugo) têm o vínculo de
--      Introdução ENCERRADO, não duplicado — o de Recepção já existia e
--      continua de pé.
--   3. As 5 linhas de evento_areas de Introdução saem: Recepção já cobre os
--      mesmos 5 eventos, e mantê-las duplicaria o pedido de apoio.
--   4. Introdução é DESATIVADA — não apagada. O histórico de quem serviu ali
--      continua legível; só deixa de aceitar gente nova.
--   5. Recepção ganha as três tarefas de checklist que a igreja descreveu.
--
-- O catálogo de postos de Introdução era vazio — nada a migrar ali. Se o
-- trabalho de orientar quem chega precisar de um posto próprio, distinto de
-- "Acolhida de visitante", é a liderança da Recepção que o cria — o mesmo
-- catálogo, a mesma tela, ferramenta já pronta desde a migration anterior.

BEGIN;

DO $migracao$
DECLARE
  v_introducao uuid;
  v_recepcao   uuid;
  v_henrique   uuid;
BEGIN
  SELECT a.id INTO v_introducao FROM public.areas a
   WHERE a.nome = 'Introdução'
     AND a.ministerio_id = (SELECT id FROM public.ministerios WHERE nome LIKE 'Comunh%');
  SELECT a.id INTO v_recepcao FROM public.areas a
   WHERE a.nome = 'Recepção'
     AND a.ministerio_id = (SELECT id FROM public.ministerios WHERE nome LIKE 'Comunh%');
  SELECT lider_id INTO v_henrique FROM public.areas WHERE id = v_introducao;

  IF v_introducao IS NULL OR v_recepcao IS NULL THEN
    RAISE EXCEPTION 'Introdução ou Recepção não encontradas — nada foi alterado.';
  END IF;

  -- 1. Henrique passa a co-liderar Recepção.
  UPDATE public.areas SET co_lider_id = v_henrique WHERE id = v_recepcao;

  -- 2a. Quem já está nas duas: encerra o vínculo de Introdução, mantém o de
  -- Recepção — que já é o vínculo de verdade.
  UPDATE public.area_voluntarios
     SET status = 'encerrada', data_fim = current_date
   WHERE area_id = v_introducao AND status = 'ativa'
     AND membro_id IN (
       SELECT membro_id FROM public.area_voluntarios
        WHERE area_id = v_recepcao AND status = 'ativa'
     );

  -- 2b. Quem só estava em Introdução: muda de área, sem apagar histórico
  -- nenhum — data_inicio, função, tudo continua igual, só o endereço muda.
  UPDATE public.area_voluntarios
     SET area_id = v_recepcao, ministerio_id = (SELECT ministerio_id FROM public.areas WHERE id = v_recepcao)
   WHERE area_id = v_introducao AND status = 'ativa';

  -- 3. Pedido de apoio duplicado sai — Recepção já cobre os mesmos eventos.
  DELETE FROM public.evento_areas WHERE area_id = v_introducao;

  -- 4. Introdução para de aceitar gente nova. O nome e o histórico continuam
  -- legíveis; só sai da lista de áreas ativas.
  UPDATE public.areas SET ativo = false WHERE id = v_introducao;

  -- 5. As tarefas que a igreja descreveu — trabalho da área, não de pessoa.
  INSERT INTO public.checklist_area (area_id, nome_tarefa, ordem, obrigatoria)
  VALUES
    (v_recepcao, 'Preparar o kit do visitante', 1, false),
    (v_recepcao, 'Sinalizar falta de material (ex.: canetas)', 2, false),
    (v_recepcao, 'Organizar e manter limpos os jalecos da recepção', 3, false);
END
$migracao$;

COMMIT;
