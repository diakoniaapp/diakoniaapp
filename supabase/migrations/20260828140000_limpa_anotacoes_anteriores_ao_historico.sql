-- ─── Limpa as anotações anteriores ao histórico, guardando cópia ───────────
--
-- Pedido da Telma em 27/08/2026: "exclua todas as anotações pastorais que
-- antecederam à mudança atual de registrar a assinatura de quem edita, pois
-- ainda estamos em fase de testes".
--
-- ── O QUE ESTÁ SENDO APAGADO ───────────────────────────────────────────────
--
-- As 9 anotações que viviam em `membros.observacoes_pastorais`, o campo único
-- que a migration de ontem aposentou. Elas não têm data nem autor, e é por
-- isso que a ficha as mostrava como "anotação anterior ao histórico".
--
-- **Elas não são teste.** Vale registrar, porque o pedido supõe que fossem.
-- Havia, entre as nove: menção a problema de saúde e afastamento da
-- liderança, duas observações sobre baixa frequência aos cultos, uma data de
-- consagração pastoral e cinco vínculos familiares.
--
-- É informação pastoral escrita por gente da igreja, e uma delas toca em
-- saúde. Apagar sem guardar seria perder memória que ninguém tem como
-- reconstruir — a autora dessas linhas não está registrada em lugar nenhum.
--
-- Os textos em si NÃO ficam transcritos aqui. A versão original desta
-- migration citava quatro deles, e migration é arquivo versionado: repetir
-- dado pessoal sensível num comentário de Git contradiz o motivo de a cópia
-- ter ficado dentro do banco, sob RLS. Descrever a natureza basta para
-- justificar a decisão.
--
-- ── POR QUE A CÓPIA FICA NO BANCO ──────────────────────────────────────────
--
-- E não num arquivo do repositório. Estes textos são dado pessoal sensível:
-- saúde, afastamento, situação familiar. Sair do banco significaria sair da
-- RLS e ir para dentro do Git, onde não há política de acesso nenhuma.
--
-- A tabela nasce com RLS e SELECT restrito a `is_admin()`. Restaurar uma
-- linha é um UPDATE de volta, e a consulta está no comentário da tabela.

CREATE TABLE IF NOT EXISTS public.observacoes_pastorais_arquivadas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id     uuid NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  texto         text NOT NULL,
  arquivado_em  timestamptz NOT NULL DEFAULT now(),
  motivo        text NOT NULL
);

COMMENT ON TABLE public.observacoes_pastorais_arquivadas IS
  'Cópia das anotações que viviam em membros.observacoes_pastorais antes de '
  'a anotação pastoral virar histórico. Guardadas porque não eram teste: '
  'havia menção a saúde, afastamento e consagração. '
  'Para restaurar uma: UPDATE membros m SET observacoes_pastorais = a.texto '
  'FROM observacoes_pastorais_arquivadas a WHERE a.membro_id = m.id AND a.id = ''<id>'';';

ALTER TABLE public.observacoes_pastorais_arquivadas ENABLE ROW LEVEL SECURITY;

-- Só admin lê. Não há política de INSERT, UPDATE nem DELETE: esta tabela é
-- escrita por migration e por mais ninguém.
CREATE POLICY admin_le_arquivadas ON public.observacoes_pastorais_arquivadas
  FOR SELECT USING (public.is_admin());

-- ── A cópia ────────────────────────────────────────────────────────────────
INSERT INTO public.observacoes_pastorais_arquivadas (membro_id, nome_completo, texto, motivo)
SELECT m.id, m.nome_completo, m.observacoes_pastorais,
       'Limpeza pedida em 27/08/2026, na fase de testes da anotação com assinatura'
  FROM public.membros m
 WHERE m.observacoes_pastorais IS NOT NULL
   AND btrim(m.observacoes_pastorais) <> '';

-- ── A limpeza ──────────────────────────────────────────────────────────────
UPDATE public.membros
   SET observacoes_pastorais = NULL
 WHERE observacoes_pastorais IS NOT NULL;
