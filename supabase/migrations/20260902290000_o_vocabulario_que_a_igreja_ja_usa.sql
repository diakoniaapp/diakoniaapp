-- ═══════════════════════════════════════════════════════════════════════════
-- O vocabulário que a igreja já usa
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ninguém começa de tela em branco. Os 18 vínculos que carregam função de
-- verdade viram os postos iniciais das suas próprias áreas — Baterista e
-- Guitarrista nascem em Músicos, Cozinha no Projeto Social, Transmissão na
-- Live Orando Sobre a Palavra. O catálogo não é um formulário a preencher: é
-- o que a igreja já vinha escrevendo à mão, agora com lugar.
--
-- ── O QUE NÃO É SEMEADO, E POR QUÊ ─────────────────────────────────────────
--
--   84  "Voluntário" e vazios      nunca foram informação. Não migram, e
--                                  passam a ser o que sempre foram: ausência.
--   21  nome da própria área       "Recepção" na área Recepção não diz nada
--                                  que a linha já não dissesse. O gatilho
--                                  criado em 20260902270000 recusa isso
--                                  agora na origem.
--    9  "Líder" / "Co-líder"       liderança é fato da ÁREA, em lider_id e
--                                  co_lider_id. Os 9 conferidos: todos batem
--                                  com a coluna. E há 12 líderes que a
--                                  coluna conhece e o texto não — mais uma
--                                  prova de que a segunda fonte só perde.
--
-- ── A BARRA NO MEIO DO TEXTO ───────────────────────────────────────────────
--
-- Um vínculo diz "Tecladista/Trompetista". É uma pessoa que faz duas coisas,
-- espremida num campo que só aceitava uma. Vira dois postos e duas linhas —
-- que é a razão de a ligação ser N-para-N.
--
-- O primeiro escrito fica como principal. Quem escreveu pôs o instrumento
-- principal na frente, e é a única ordem que o dado oferece.
--
-- ── SÓ VÍNCULOS ATIVOS ─────────────────────────────────────────────────────
--
-- Os encerrados guardam o texto antigo em `area_voluntarios.funcao`, que esta
-- migration não toca. Histórico não se reescreve para caber em tabela nova.

BEGIN;

-- Um vínculo por posto escrito, já separado na barra e com a posição
-- preservada — é a posição que decide qual é o principal.
CREATE TEMP TABLE _postos_escritos ON COMMIT DROP AS
SELECT av.id        AS vinculo_id,
       av.area_id   AS area_id,
       btrim(p.posto) AS posto,
       p.pos        AS pos
  FROM public.area_voluntarios av
  JOIN public.areas a ON a.id = av.area_id
  CROSS JOIN LATERAL unnest(regexp_split_to_array(av.funcao, '\s*/\s*'))
       WITH ORDINALITY AS p(posto, pos)
 WHERE av.status = 'ativa'
   AND btrim(coalesce(av.funcao, '')) <> ''
   -- genérico é ausência
   AND lower(btrim(av.funcao)) NOT IN
       ('voluntário','voluntario','membro')
   -- liderança já está modelada em areas.lider_id / co_lider_id
   AND lower(btrim(av.funcao)) NOT IN
       ('líder','lider','co-líder','co-lider')
   -- nome da própria área é ruído
   AND lower(btrim(av.funcao)) <> lower(btrim(a.nome))
   AND btrim(p.posto) <> '';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. O catálogo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `ordem` alfabética para nascer previsível; a área reordena quando quiser.
-- `min_por_escala` fica em zero: quantos de cada a escala precisa é decisão
-- da liderança, e inventar um número aqui seria fingir que alguém decidiu.

INSERT INTO public.area_funcoes (area_id, nome, ordem)
SELECT area_id,
       -- O nome como a igreja escreveu. Entre duas grafias do mesmo posto na
       -- mesma área, a primeira em ordem alfabética — o índice único não
       -- deixaria as duas entrarem de qualquer forma.
       min(posto) AS nome,
       row_number() OVER (PARTITION BY area_id ORDER BY lower(min(posto)))
  FROM _postos_escritos
 GROUP BY area_id, lower(posto);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Quem ocupa cada posto
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `origem = 'lideranca'` e já confirmada: isto não é autodeclaração, é o que
-- a igreja registou. Confirmar de novo o que ela já disse seria criar uma
-- fila de 18 aprovações inúteis no primeiro dia.

INSERT INTO public.area_voluntario_funcoes
       (area_voluntario_id, area_funcao_id, principal, origem, confirmada_em)
SELECT pe.vinculo_id,
       af.id,
       pe.pos = 1,
       'lideranca',
       now()
  FROM _postos_escritos pe
  JOIN public.area_funcoes af
    ON af.area_id = pe.area_id
   AND lower(btrim(af.nome)) = lower(pe.posto);

COMMIT;
