-- ═══════════════════════════════════════════════════════════════════════════
-- Recepção dita os seus postos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Recepção é a maior equipe da igreja — 25 voluntários — e estava entre as 13
-- áreas sem catálogo, medidas em A·4. Diferente das 18 sementes de
-- 20260902290000, que vieram de texto já escrito no vínculo, estas quatro não
-- tinham de onde ser extraídas: os 25 vínculos de Recepção diziam só
-- "Voluntário".
--
-- A igreja ditou os quatro em 03/09/2026: Abertura, Atendimento, Acolhida de
-- visitante, Acompanhamento. Não são inferência — é o dado.
--
-- Ninguém é ligado a nenhum dos quatro por esta migration. Ligar é escolha de
-- quem serve ou de quem lidera, feita na tela — agora com botão de editar e
-- de acrescentar, e não só o de criar o primeiro.

BEGIN;

INSERT INTO public.area_funcoes (area_id, nome, ordem)
SELECT 'd3a7a0ef-8b9d-46a6-a073-49c746fa830e', nome, ordem
  FROM (VALUES
    ('Abertura', 1),
    ('Atendimento', 2),
    ('Acolhida de visitante', 3),
    ('Acompanhamento', 4)
  ) AS postos(nome, ordem)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.area_funcoes af
    WHERE af.area_id = 'd3a7a0ef-8b9d-46a6-a073-49c746fa830e'
      AND lower(btrim(af.nome)) = lower(btrim(postos.nome))
 );

COMMIT;
