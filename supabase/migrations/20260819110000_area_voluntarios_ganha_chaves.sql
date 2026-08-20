-- ---------------------------------------------------------------------------
-- area_voluntarios ganha chaves estrangeiras (e perde os orfaos)
-- ---------------------------------------------------------------------------
--
-- `area_voluntarios` nunca declarou chave estrangeira nenhuma. O resultado,
-- medido em 19/08/2026: dos 113 vinculos, 36 apontavam para pessoa, area ou
-- ministerio que nao existem mais.
--
-- ── DE ONDE VIERAM OS ORFAOS ───────────────────────────────────────────────
--
-- Em 31/05/2026, entre 23h22 e 06h42, houve uma limpeza manual de 157 pessoas
-- (log_exclusoes, usuario telma@diakoniaapp.com.br). Na mesma data uma area e
-- um ministerio foram apagados -- esses dois SEM registro no log, entao nao ha
-- como saber que area era.
--
-- Os 35 vinculos apontavam todos para essa area sem nome. Todos com
-- `funcao: voluntario` e `data_inicio: 2026-05-31` -- a data da propria
-- importacao. Sem observacao, sem habilidade, sem data real de inicio.
--
-- 30 dessas pessoas EXISTEM hoje, com id novo: foram apagadas e reimportadas.
-- 28 delas nao tem nenhum outro vinculo de voluntario. Perder o registro nao e
-- de graca -- e por isso a exclusao abaixo grava tudo antes.
--
-- Decisao tomada pela Telma em 19/08/2026, com esses numeros na frente.
--
-- ── POR QUE NAO DAVA PARA SALVAR ───────────────────────────────────────────
--
-- `area_id` e `ministerio_id` sao NOT NULL. Nao ha como manter o vinculo sem
-- area. E recriar a area com nome inventado poria uma area falsa no
-- organograma por tempo indeterminado. O registro que se perde afirma que 28
-- pessoas servem numa area que nao existe -- e isso nao e verdade hoje.
--
-- ── O QUE ESTE ARQUIVO FAZ ─────────────────────────────────────────────────
--
--   1. grava os 36 vinculos em log_exclusoes, com a linha inteira e o nome da
--      pessoa recuperado de membros_excluidos_backup
--   2. apaga os 36
--   3. cria as tres chaves
--
-- O passo 1 usa o mecanismo que o proprio sistema ja tem para isto. Os nomes
-- ficam recuperaveis por consulta, nao por backup externo.
-- ---------------------------------------------------------------------------

-- ── 1. Registrar antes de apagar ──────────────────────────────────────────
INSERT INTO public.log_exclusoes
  (tipo, tabela, registro_id, dados_antes, motivo, usuario_email, quantidade)
SELECT
  'limpeza_orfaos',
  'area_voluntarios',
  av.id,
  to_jsonb(av) || jsonb_build_object(
    'nome_da_pessoa', COALESCE(b.dados->>'nome_completo', '(não identificada)'),
    'pessoa_existe_hoje_com_outro_id',
      EXISTS (SELECT 1 FROM membros mv
              WHERE lower(trim(mv.nome_completo)) = lower(trim(b.dados->>'nome_completo')))
  ),
  'Vinculo orfao: apontava para pessoa, area ou ministerio inexistente. '
  || 'Criado pela importacao de 31/05/2026 e orfanado no mesmo dia pela '
  || 'limpeza de 157 pessoas. Removido em 19/08/2026 para permitir a criacao '
  || 'das chaves estrangeiras.',
  'sistema (migration 20260819110000)',
  1
FROM public.area_voluntarios av
LEFT JOIN public.membros m  ON m.id  = av.membro_id
LEFT JOIN public.areas a    ON a.id  = av.area_id
LEFT JOIN public.ministerios mn ON mn.id = av.ministerio_id
LEFT JOIN public.membros_excluidos_backup b ON b.membro_id = av.membro_id
WHERE m.id IS NULL OR a.id IS NULL OR mn.id IS NULL;

-- ── 2. Apagar ─────────────────────────────────────────────────────────────
DELETE FROM public.area_voluntarios av
USING (
  SELECT av2.id
  FROM public.area_voluntarios av2
  LEFT JOIN public.membros m  ON m.id  = av2.membro_id
  LEFT JOIN public.areas a    ON a.id  = av2.area_id
  LEFT JOIN public.ministerios mn ON mn.id = av2.ministerio_id
  WHERE m.id IS NULL OR a.id IS NULL OR mn.id IS NULL
) alvo
WHERE av.id = alvo.id;

-- ── 3. As chaves ──────────────────────────────────────────────────────────
--
-- O ON DELETE de cada uma e uma decisao, nao um padrao:
--
-- membro_id -> CASCADE. A tela de exclusao de pessoa JA avisa "o que se
--   perde" antes de confirmar (MembroForm.levantarVinculos). Com o aviso
--   completo, apagar em cascata e o comportamento honesto: a pessoa foi
--   avisada e confirmou. RESTRICT aqui so faria a exclusao falhar com uma
--   mensagem sobre chave estrangeira, depois de a pessoa ja ter confirmado.
--
-- area_id e ministerio_id -> RESTRICT. Apagar uma area com voluntarios
--   dentro e exatamente o que aconteceu em 31/05, e e o que nao pode voltar a
--   acontecer em silencio. Nao ha tela que apague area hoje, entao o RESTRICT
--   nao custa nada agora e barra o problema quando essa tela existir: primeiro
--   se move os voluntarios, depois se apaga a area.

ALTER TABLE public.area_voluntarios
  ADD CONSTRAINT area_voluntarios_membro_id_fkey
  FOREIGN KEY (membro_id) REFERENCES public.membros(id) ON DELETE CASCADE;

ALTER TABLE public.area_voluntarios
  ADD CONSTRAINT area_voluntarios_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE RESTRICT;

ALTER TABLE public.area_voluntarios
  ADD CONSTRAINT area_voluntarios_ministerio_id_fkey
  FOREIGN KEY (ministerio_id) REFERENCES public.ministerios(id) ON DELETE RESTRICT;
