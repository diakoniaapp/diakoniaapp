-- ═══════════════════════════════════════════════════════════════════════════
-- O ministério ganha as suas três áreas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Comunhão, Integração e Crescimento" é o nome do ministério desde sempre.
-- Até aqui ele nunca tinha sido lido como estrutura — era só um nome.
-- A igreja pediu, em 03/09/2026, para usá-lo como as três áreas do
-- ministério, e definiu o que cada uma é:
--
--   Comunhão      fica inativa por enquanto — nada a fazer hoje, o nome
--                 existe para quando houver.
--   Integração    Introdução e Recepção — a área que já existia, fundida
--                 ontem, só ganha o nome certo.
--   Crescimento   acompanhamento pós-visita: tudo que ajuda o visitante a
--                 virar congregado, e o congregado a virar membro.
--
-- ── POR QUE "INTRODUÇÃO" VOLTA, E COMO ──────────────────────────────────────
--
-- A igreja insistiu duas vezes que "Introdução existe" — não é sinônimo de
-- "Acolhida de visitante", é uma palavra própria. Ontem a área Introdução foi
-- desativada e seus 20 voluntários migraram para o que hoje passa a se
-- chamar Integração; o nome não desaparece, volta como POSTO — ao lado de
-- Acolhida de visitante, e não no lugar dele. Se as duas acabarem sendo a
-- mesma coisa na prática, é a liderança de Integração quem funde — a mesma
-- tela de sempre.
--
-- ── CRESCIMENTO AINDA NÃO TEM GENTE, E ESTÁ CERTO NÃO TER ───────────────────
--
-- Nasce sem líder e sem voluntário — ninguém foi nomeado, e inventar um piso
-- de voluntários seria inventar um número que ninguém disse. `min_voluntarios
-- = 0` para o aviso "faltam N" não acender sozinho numa área que ainda não
-- começou.
--
-- A ligação entre Crescimento e as tarefas de acolhimento que já existem
-- (`acolhimento_tarefas`, a bancada "porta da frente") não é feita aqui —
-- essas tarefas hoje não têm `area_id` nenhum, e amarrá-las é decisão
-- maior, para quando a área tiver quem a opere.

BEGIN;

DO $migracao$
DECLARE
  v_ministerio uuid;
  v_integracao uuid;
BEGIN
  SELECT id INTO v_ministerio FROM public.ministerios WHERE nome LIKE 'Comunh%';

  -- 1. A área de ontem ganha o nome certo. Mesmo id, mesma gente, mesmo
  -- catálogo, só o nome muda.
  UPDATE public.areas SET nome = 'Integração'
   WHERE nome = 'Recepção' AND ministerio_id = v_ministerio
  RETURNING id INTO v_integracao;

  IF v_integracao IS NULL THEN
    RAISE EXCEPTION 'Área "Recepção" não encontrada — nada foi alterado.';
  END IF;

  -- 2. Introdução volta como posto, ao lado de Acolhida de visitante.
  INSERT INTO public.area_funcoes (area_id, nome, ordem)
  SELECT v_integracao, 'Introdução', 5
   WHERE NOT EXISTS (
     SELECT 1 FROM public.area_funcoes
      WHERE area_id = v_integracao AND lower(btrim(nome)) = 'introdução'
   );

  -- 3. Comunhão nasce, e nasce inativa.
  INSERT INTO public.areas (ministerio_id, nome, ativo, min_voluntarios)
  SELECT v_ministerio, 'Comunhão', false, 0
   WHERE NOT EXISTS (
     SELECT 1 FROM public.areas WHERE ministerio_id = v_ministerio AND nome = 'Comunhão'
   );

  -- 4. Crescimento nasce ativa, com o propósito que a igreja ditou —
  -- palavra por palavra, não inferência minha.
  INSERT INTO public.areas (ministerio_id, nome, ativo, min_voluntarios, descricao)
  SELECT v_ministerio, 'Crescimento', true, 0,
         'Acompanhamento pós-visita: tudo que ajuda o visitante a se tornar ' ||
         'congregado, e o congregado a se tornar membro.'
   WHERE NOT EXISTS (
     SELECT 1 FROM public.areas WHERE ministerio_id = v_ministerio AND nome = 'Crescimento'
   );
END
$migracao$;

COMMIT;
