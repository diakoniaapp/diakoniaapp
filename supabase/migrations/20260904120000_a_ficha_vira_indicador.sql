-- ═══════════════════════════════════════════════════════════════════════════
-- A ficha vira indicador
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ela apontou uma redundância real: a ficha pedia as faixas etárias (Q6) E a
-- lista de quem mora na casa (Q7) — a mesma informação duas vezes. Quem
-- preenche a lista completa já deu tudo que a contagem precisa; o sistema
-- soma sozinho. `criancas_ate_11`/`adolescentes_12_18`/`adultos_19_59`/
-- `idosos_60_mais` saem da tabela — a contagem passa a vir de `familiares`
-- (idade de cada morador) mais a idade da própria pessoa, calculada no
-- front-end a partir de `data_nascimento`. Uma fonte, não duas que podem
-- discordar.
--
-- ── O PISO PARA A PER CAPITA ─────────────────────────────────────────────────
--
-- Ela pediu um piso. A linha certa não é um número inventado pela igreja do
-- zero — é a que o governo já usa e atualiza todo ano com o salário mínimo:
-- extrema pobreza até R$218/pessoa/mês, pobreza (CadÚnico) até meio salário
-- mínimo (R$810,50 em 2026, com o mínimo em R$1.621). Guardar esses dois
-- números FIXOS no código seria condená-los a ficar errados a cada reajuste
-- — por isso viram configuração, numa tabela pequena, editável por quem
-- lidera a Diaconia (ou admin/secretaria), não uma constante no front-end.
--
-- ── O QUE ISTO NÃO FAZ ────────────────────────────────────────────────────
--
-- O piso CLASSIFICA — mostra "extrema pobreza"/"pobreza"/"acima da linha" ao
-- lado da per capita — e não DECIDE. Continua exatamente o princípio que a
-- igreja já tinha fixado para a ficha inteira em 03/09: "um parâmetro que
-- orienta a decisão humana, não decide sozinho".

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tira a redundância — a contagem some, a lista de moradores continua dona do dado
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.diaconia_fichas_socioeconomicas
  DROP COLUMN criancas_ate_11,
  DROP COLUMN adolescentes_12_18,
  DROP COLUMN adultos_19_59,
  DROP COLUMN idosos_60_mais;

-- `diaconia_salvar_ficha` já recebe `p_dados jsonb` — não muda de assinatura,
-- só para de gravar as quatro colunas que saíram.
CREATE OR REPLACE FUNCTION public.diaconia_salvar_ficha(
  p_pessoa_assistida_id uuid,
  p_dados               jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pode boolean; v_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_lidera_area(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Só a liderança da Diaconia preenche a ficha.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.diaconia_fichas_socioeconomicas (
    pessoa_assistida_id, possui_deficiencia, qual_deficiencia, possui_renda, renda_mensal,
    recebe_beneficio_social, qual_beneficio, ja_trabalhou_clt, tempo_clt, atuacao_clt,
    situacao_moradia, familiares, sustento_familia, maior_necessidade, observacoes, preenchido_por
  ) VALUES (
    p_pessoa_assistida_id,
    (p_dados->>'possui_deficiencia')::boolean, nullif(btrim(p_dados->>'qual_deficiencia'), ''),
    (p_dados->>'possui_renda')::boolean, (p_dados->>'renda_mensal')::numeric,
    (p_dados->>'recebe_beneficio_social')::boolean, nullif(btrim(p_dados->>'qual_beneficio'), ''),
    (p_dados->>'ja_trabalhou_clt')::boolean, nullif(btrim(p_dados->>'tempo_clt'), ''),
    nullif(btrim(p_dados->>'atuacao_clt'), ''),
    nullif(btrim(p_dados->>'situacao_moradia'), ''),
    COALESCE(p_dados->'familiares', '[]'::jsonb),
    nullif(btrim(p_dados->>'sustento_familia'), ''), nullif(btrim(p_dados->>'maior_necessidade'), ''),
    nullif(btrim(p_dados->>'observacoes'), ''), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- O piso — configurável, não fixo no código
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.diaconia_config (
  chave         text PRIMARY KEY,
  valor         numeric(10,2) NOT NULL,
  descricao     text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.diaconia_config (chave, valor, descricao) VALUES
  ('limite_extrema_pobreza', 218.00,
   'Renda per capita mensal (R$) — referência oficial de extrema pobreza (Bolsa Família), 2026.'),
  ('limite_pobreza', 810.50,
   'Renda per capita mensal (R$) — meio salário mínimo, referência de elegibilidade do CadÚnico, 2026.');

ALTER TABLE public.diaconia_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bloqueia_anon_diaconia_config" ON public.diaconia_config
  FOR ALL TO anon USING (false);

-- Leitura: qualquer conta autenticada — são só dois números de referência
-- pública (o próprio governo publica), não dado de ninguém.
CREATE POLICY "autenticados_leem_diaconia_config" ON public.diaconia_config
  FOR SELECT TO authenticated USING (true);

-- Escrita: admin/secretaria, ou quem lidera o MINISTÉRIO da Diaconia — não
-- qualquer área, o piso vale para o ministério inteiro.
CREATE POLICY "diaconia_lidera_ministerio_edita_config" ON public.diaconia_config
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role((SELECT auth.uid()), ARRAY['admin','secretaria']::app_role[])
    OR (public.has_role((SELECT auth.uid()), 'lideranca')
        AND EXISTS (
          SELECT 1 FROM public.ministerios m
           WHERE m.modulo = 'diaconia' AND m.id IN (SELECT public.fn_meus_ministerios())
        ))
  );

COMMIT;
