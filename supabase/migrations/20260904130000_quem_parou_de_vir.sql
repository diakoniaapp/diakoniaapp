-- ═══════════════════════════════════════════════════════════════════════════
-- Quem parou de vir
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ela contou a origem do problema: "estas cestas começaram a ser doadas na
-- época da pandemia, com a intenção de auxiliar por 3 meses, e não houve
-- acompanhamento... desde então não tem sido feito um trabalho de
-- acompanhamento contínuo das famílias, até pra saber se pode continuar ou
-- se já não precisa de ajuda."
--
-- ── O CRITÉRIO É DELA, E NÃO PRECISA DE CAMPO NOVO ──────────────────────────
--
-- "Não veio 2 meses seguidos" — e a chamada já grava quem foi confirmado em
-- cada ocasião. Em vez de pedir que alguém digite uma data de reavaliação
-- (mais um campo pra esquecer de preencher), a pendência é CALCULADA: para
-- cada vínculo, olha as ocasiões mais recentes que já aconteceram naquela
-- área e conta faltas seguidas a partir de hoje para trás. Duas seguidas,
-- entra na lista.
--
-- "Ocasiões que já aconteceram" é sobre chamadas que ALGUÉM realmente abriu
-- — se o líder pulou um mês sem abrir a chamada, não há como saber se a
-- pessoa viria ou não, e esse mês não conta nem a favor nem contra.
--
-- ── O ENCERRAMENTO REAPROVEITA O `ativo` QUE JÁ EXISTE ───────────────────────
--
-- Pesquisado (PAIF/CRAS): todo acompanhamento familiar continuado tem um
-- "encerramento formal" como registro obrigatório — não é só desmarcar
-- alguém da lista, é dizer POR QUÊ. `diaconia_vinculos.ativo` já existia;
-- ganha só `encerrado_em`/`motivo_encerramento` para guardar a decisão, sem
-- tabela nova. A porta é a estrita (`diaconia_lidera_area`) — decidir que
-- alguém não precisa mais é a mesma categoria de decisão que preencher a
-- ficha, não a chamada do dia a dia.

BEGIN;

ALTER TABLE public.diaconia_vinculos
  ADD COLUMN encerrado_em timestamptz,
  ADD COLUMN motivo_encerramento text,
  ADD COLUMN encerrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.diaconia_encerrar_vinculo(p_vinculo_id uuid, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_area_id uuid;
BEGIN
  SELECT area_id INTO v_area_id FROM public.diaconia_vinculos WHERE id = p_vinculo_id;
  IF v_area_id IS NULL OR NOT public.diaconia_lidera_area(v_area_id) THEN
    RAISE EXCEPTION 'Só a liderança da Diaconia encerra um acompanhamento.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.diaconia_vinculos
     SET ativo = false, encerrado_em = now(), motivo_encerramento = nullif(btrim(p_motivo), ''), encerrado_por = auth.uid()
   WHERE id = p_vinculo_id;
END;
$$;

-- O caminho de volta, para o engano de clique — mesma porta.
CREATE OR REPLACE FUNCTION public.diaconia_reabrir_vinculo(p_vinculo_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_area_id uuid;
BEGIN
  SELECT area_id INTO v_area_id FROM public.diaconia_vinculos WHERE id = p_vinculo_id;
  IF v_area_id IS NULL OR NOT public.diaconia_lidera_area(v_area_id) THEN
    RAISE EXCEPTION 'Só a liderança da Diaconia reabre um acompanhamento.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.diaconia_vinculos
     SET ativo = true, encerrado_em = NULL, motivo_encerramento = NULL, encerrado_por = NULL
   WHERE id = p_vinculo_id;
END;
$$;

COMMIT;
