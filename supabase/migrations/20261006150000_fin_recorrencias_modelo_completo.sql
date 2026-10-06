-- ─── Recorrência como MODELO completo de lançamento ──────────────────────────────
--
-- Pedido da Telma (06/10/2026): "hoje a recorrência é basicamente uma descrição textual
-- ('RPA Carlos Eduardo') que não cria relacionamento com o cadastro real; estou cadastrando só
-- um lembrete". E: "recorrências de 3, 4, 5, 12 parcelas só geram até dezembro de 2026".
--
-- MEDIDO em produção antes de escrever (06/10/2026): as 10 recorrências ativas têm
-- `fornecedor_id` NULO (nenhuma ligada a cadastro), e `fin_recorrencias` não tem como apontar
-- para uma PESSOA (membro) — só para fornecedor, mas quem recebe um RPA/salário/côngrua é, em
-- geral, uma pessoa do catálogo. Os 111 lançamentos previstos não sabem de qual recorrência
-- nasceram (nem pelo `lancamento_pai_id`, que é de transferência).
--
-- O que muda:
--   1. `fin_recorrencias.pessoa_id` — o favorecido pode ser uma pessoa do catálogo (membros).
--   2. `fin_recorrencias.tipo_recorrencia` ('continua' | 'parcelamento'), `total_parcelas`,
--      `parcela_inicial` — parcelamento é uma série com fim contado, não uma data de fim.
--   3. `fin_lancamentos.recorrencia_id` — o vínculo que faltava (propagar mudança, mostrar
--      "parcela 4/12", evitar duplicar) —, `parcela_numero` e `parcela_total`.
--   4. Preenche `recorrencia_id` nos previstos que já existem, SÓ onde a ligação é inequívoca
--      (mesma descrição + conta + tipo e uma única recorrência assim). Nada é adivinhado.
--
-- A geração dos previstos (que causava o corte em dezembro: horizonte fixo de 90 dias, início
-- ignorado, sem contagem de parcelas) passou para o app — ver src/lib/recorrencia.ts. A função
-- `fin_gerar_recorrencias` continua existindo, mas o app não a chama mais.

ALTER TABLE public.fin_recorrencias
  ADD COLUMN IF NOT EXISTS pessoa_id uuid REFERENCES public.membros(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_recorrencia text NOT NULL DEFAULT 'continua',
  ADD COLUMN IF NOT EXISTS total_parcelas integer,
  ADD COLUMN IF NOT EXISTS parcela_inicial integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_recorrencias_tipo_recorrencia_check') THEN
    ALTER TABLE public.fin_recorrencias ADD CONSTRAINT fin_recorrencias_tipo_recorrencia_check
      CHECK (tipo_recorrencia IN ('continua','parcelamento'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_recorrencias_parcelas_check') THEN
    ALTER TABLE public.fin_recorrencias ADD CONSTRAINT fin_recorrencias_parcelas_check
      CHECK (
        (tipo_recorrencia = 'continua' AND total_parcelas IS NULL)
        OR (tipo_recorrencia = 'parcelamento' AND total_parcelas IS NOT NULL AND total_parcelas >= 2
            AND parcela_inicial >= 1 AND parcela_inicial <= total_parcelas)
      );
  END IF;
END $$;

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid REFERENCES public.fin_recorrencias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parcela_numero integer,
  ADD COLUMN IF NOT EXISTS parcela_total integer;

CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_recorrencia
  ON public.fin_lancamentos (recorrencia_id, data) WHERE recorrencia_id IS NOT NULL;

-- liga os previstos que já existem às recorrências de que nasceram — só onde há UMA candidata
UPDATE public.fin_lancamentos l
   SET recorrencia_id = r.id
  FROM public.fin_recorrencias r
 WHERE l.recorrencia_id IS NULL
   AND l.origem = 'recorrencia'
   AND l.descricao = r.descricao
   AND l.conta_id = r.conta_id
   AND l.tipo = r.tipo
   AND (SELECT count(*) FROM public.fin_recorrencias r2
         WHERE r2.descricao = l.descricao AND r2.conta_id = l.conta_id AND r2.tipo = l.tipo) = 1;
