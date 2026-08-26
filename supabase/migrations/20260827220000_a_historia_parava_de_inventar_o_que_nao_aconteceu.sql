-- ─── A história da pessoa afirmava fatos que ninguém observou ──────────────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- A ficha de Julia Akemi Silva Hosoume mostrava:
--
--   Chegou à igreja ..... 16 de jun. de 2026
--   Primeiro culto ...... 15 de jun. de 2026
--
-- Nenhum dos dois aconteceu. Ela é congregada vinda de outro sistema; 15 de
-- junho é o dia em que a LINHA foi criada no banco, e 16 de junho é o que a
-- importação carimbou em `data_entrada`.
--
-- Medido em 26/08/2026:
--
--   pessoas com o registro "Primeiro culto" ................. 274
--   destas, com a data do contato IGUAL à criação da linha ... 274  (todas)
--   destas, com a observação "Primeiro culto - cadastro
--     inicial" .............................................. 274  (todas)
--
--   congregados ativos ....................................... 65
--   destes, com data_entrada ANTERIOR ao cadastro ............. 0
--   destes, com data_entrada = carimbo do cadastro ........... 25
--   destes, sem data_entrada nenhuma ......................... 40
--
-- Ou seja: "Primeiro culto" nunca foi um culto — é o carimbo de cadastro
-- criado, com um rótulo que afirma um fato religioso que ninguém presenciou.
-- E para congregado, "Chegou à igreja" é falso sempre que existe.
--
-- Isto é pior que um número errado numa lista. É a igreja lendo, na ficha de
-- uma criança de 11 anos, que ela chegou há dois meses — e podendo agir
-- pastoralmente sobre uma informação que o sistema inventou.
--
-- ── POR QUE UMA COLUNA, E NÃO UMA REGRA NA TELA ────────────────────────────
--
-- A tentação é a tela adivinhar: "se `data_entrada` está a menos de uma
-- semana de `created_at`, é carimbo". A heurística erra exatamente onde mais
-- importa acertar — a secretaria cadastra HOJE alguém que chegou HOJE, as
-- duas datas coincidem, e a chegada verdadeira sumiria da ficha.
--
-- Origem do cadastro é um FATO sobre a linha, não uma inferência sobre a
-- pessoa. Gravado uma vez, a tela lê em vez de deduzir.
--
-- ── O RECORTE DA IMPORTAÇÃO ────────────────────────────────────────────────
--
--   criados em 2026-06 .... 271   ← a importação
--   criados em 2026-08 ..... 24   ← cadastrados aqui, por gente
--
-- A separação é limpa: não há cadastro de julho para gerar dúvida. As 158
-- pessoas cuja `data_entrada` é bem anterior ao cadastro continuam com a
-- linha "Chegou à igreja" — aquela data a importação trouxe de verdade, e
-- apagá-la seria trocar uma mentira por outra.

alter table public.membros
  add column if not exists origem_cadastro text not null default 'sistema';

comment on column public.membros.origem_cadastro is
  '"importacao" para quem veio do sistema anterior em junho/2026, "sistema" '
  'para quem foi cadastrado aqui. Serve para a ficha não afirmar como fato o '
  'que é carimbo de importação — ver historiaPessoa.ts.';

update public.membros
   set origem_cadastro = 'importacao'
 where created_at < '2026-07-01'
   and origem_cadastro = 'sistema';

-- ── A observação passa a dizer o que a linha é ─────────────────────────────
--
-- "Primeiro culto - cadastro inicial" descrevia a metade errada. O texto que
-- fica é o que a linha realmente registra: alguém entrou no cadastro naquele
-- dia. A tela também deixa de chamar isto de culto — ver `ROTULO_CONTATO`.
update public.visita_historico v
   set observacao = 'Cadastro criado na importação do sistema anterior'
  from public.membros m
 where m.id = v.visitante_id
   and v.tipo = 'cadastro'
   and v.observacao ILIKE '%cadastro inicial%'
   and m.origem_cadastro = 'importacao';

update public.visita_historico
   set observacao = 'Cadastro criado'
 where tipo = 'cadastro'
   and observacao ILIKE '%cadastro inicial%';
