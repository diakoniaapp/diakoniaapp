-- ═══════════════════════════════════════════════════════════════════════════
-- A ficha de verdade
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ela mostrou a ficha impressa que a Diaconia usa hoje ("Ficha cadastral do
-- perfil Socioeconômico das famílias assistidas pela QIBRJ") e pediu para
-- melhorar, não só copiar — pesquisando como bancos de alimentos e o CRAS
-- fazem isto. A ficha que eu tinha desenhado em 03/09 era boa demais na
-- direção errada: mais enxuta que a realidade da igreja.
--
-- ── O QUE A FICHA IMPRESSA TEM, E EU NÃO TINHA ───────────────────────────────
--
-- Identidade: data de nascimento, RG, CPF, nacionalidade, naturalidade, sexo,
-- estado civil, profissão, escolaridade — isso é da PESSOA, não da situação,
-- então vai em `diaconia_pessoas_assistidas` (reaproveitando os enums `sexo`
-- e `estado_civil` que `membros` já usa — mesmo vocabulário, não dois).
--
-- Situação: deficiência, renda, benefício, histórico de CLT, tipo de moradia,
-- composição familiar por FAIXA ETÁRIA (crianças/adolescentes/adultos/idosos
-- — não um número solto), a lista de quem mora na casa (nome, idade,
-- parentesco, trabalha, estuda, PcD), sustento da família e maior necessidade
-- — isso muda a cada nova triagem, então continua em
-- `diaconia_fichas_socioeconomicas`, histórico, nunca UPDATE.
--
-- ── A MELHORIA: RENDA MENSAL, PARA A PER CAPITA ──────────────────────────────
--
-- A ficha impressa só pergunta "possui renda? sim/não" — sem valor. Ela viu a
-- ficha e disse "com isto, daria pra fazer a per capita": as faixas etárias
-- (Q6) já dão o denominador. Faltava o numerador. `renda_mensal` (R$) é a
-- única pergunta nova que não está no papel — o resto é o papel, melhor
-- organizado. A per capita em si NÃO é gravada: é `renda_mensal ÷ pessoas na
-- casa`, calculada na tela a partir do que já está salvo — gravar o cálculo
-- ao lado do dado é abrir espaço pra um discordar do outro depois.
--
-- ── OS FAMILIARES VIRAM JSONB, NÃO TABELA PRÓPRIA ────────────────────────────
--
-- A pergunta 7 do papel é uma lista (nome, idade, parentesco, trabalha,
-- estuda, PcD) por pessoa da casa. Uma tabela normalizada seria o certo se
-- alguém fosse um dia perguntar "todas as crianças de todas as fichas" — mas
-- ninguém vai. É lida e escrita inteira, uma ficha de cada vez, junto do
-- resto. `jsonb` evita a dança de RPC com dezenas de parâmetros posicionais
-- para pouco ganho real.
--
-- ── AS RPCs TROCAM PARÂMETROS POSICIONAIS POR jsonb ──────────────────────────
--
-- `diaconia_criar_pessoa`/`diaconia_atualizar_pessoa`/`diaconia_salvar_ficha`
-- ganhavam um parâmetro a cada pedido novo, e cada vez foi preciso `DROP
-- FUNCTION` explícito pra não colidir (achado real em 20260904100000). Com
-- `p_dados jsonb`, o próximo campo não muda a assinatura.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- IDENTIDADE — em diaconia_pessoas_assistidas
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.diaconia_pessoas_assistidas
  ADD COLUMN data_nascimento date,
  ADD COLUMN sexo            public.sexo,
  ADD COLUMN estado_civil    public.estado_civil,
  ADD COLUMN rg              text,
  ADD COLUMN cpf             text,
  ADD COLUMN nacionalidade   text,
  ADD COLUMN naturalidade    text,
  ADD COLUMN profissao       text,
  ADD COLUMN escolaridade    text;

-- ═══════════════════════════════════════════════════════════════════════════
-- SITUAÇÃO — reconstrói diaconia_fichas_socioeconomicas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Tabela vazia (medido antes desta migration: 0 fichas reais) — pode
-- reconstruir a coluna em vez de migrar dado que não existe.

ALTER TABLE public.diaconia_fichas_socioeconomicas
  DROP COLUMN composicao_familiar,
  DROP COLUMN situacao_trabalho;

ALTER TABLE public.diaconia_fichas_socioeconomicas
  ADD COLUMN possui_deficiencia   boolean,
  ADD COLUMN qual_deficiencia     text,
  ADD COLUMN possui_renda         boolean,
  ADD COLUMN renda_mensal         numeric(10,2) CHECK (renda_mensal IS NULL OR renda_mensal >= 0),
  ADD COLUMN ja_trabalhou_clt     boolean,
  ADD COLUMN tempo_clt            text,
  ADD COLUMN atuacao_clt          text,
  ADD COLUMN criancas_ate_11      smallint CHECK (criancas_ate_11 IS NULL OR criancas_ate_11 >= 0),
  ADD COLUMN adolescentes_12_18   smallint CHECK (adolescentes_12_18 IS NULL OR adolescentes_12_18 >= 0),
  ADD COLUMN adultos_19_59        smallint CHECK (adultos_19_59 IS NULL OR adultos_19_59 >= 0),
  ADD COLUMN idosos_60_mais       smallint CHECK (idosos_60_mais IS NULL OR idosos_60_mais >= 0),
  ADD COLUMN familiares           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN sustento_familia     text,
  ADD COLUMN maior_necessidade    text;

COMMENT ON COLUMN public.diaconia_fichas_socioeconomicas.familiares IS
  'Array de {nome, idade, parentesco, trabalha, estuda, pcd, qual_pcd} — a pergunta 7 da ficha impressa. Lido e escrito inteiro, não precisa de tabela própria.';

-- Situação de moradia já existia (migration 20260903220000) — só o rótulo na
-- tela muda pra bater com o papel (Alugado/Próprio/Emprestado/Outros); o
-- valor 'situacao_de_rua' continua fora do papel, de propósito, porque o
-- culto de terça atende quem não tem teto — o papel não previa esse público.

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs — de parâmetros posicionais para jsonb
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.diaconia_criar_pessoa(
  uuid, text, text, uuid, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.diaconia_atualizar_pessoa(
  uuid, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.diaconia_salvar_ficha(
  uuid, smallint, text, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.diaconia_criar_pessoa(
  p_area_id   uuid,
  p_nome      text,
  p_membro_id uuid DEFAULT NULL,
  p_dados     jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_nome text := btrim(p_nome);
  v_id   uuid;
BEGIN
  IF NOT public.diaconia_posso_atender(p_area_id) THEN
    RAISE EXCEPTION 'Você não atende nesta área.' USING ERRCODE = '42501';
  END IF;
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Escreva o nome da pessoa.';
  END IF;

  IF p_membro_id IS NOT NULL THEN
    SELECT nome_completo INTO v_nome FROM public.membros WHERE id = p_membro_id;
  END IF;

  INSERT INTO public.diaconia_pessoas_assistidas
    (membro_id, nome_completo, telefone, cep, endereco, numero, complemento, bairro, cidade, uf,
     data_nascimento, sexo, estado_civil, rg, cpf, nacionalidade, naturalidade, profissao, escolaridade)
  VALUES
    (p_membro_id, v_nome,
     nullif(btrim(p_dados->>'telefone'), ''),
     nullif(btrim(p_dados->>'cep'), ''), nullif(btrim(p_dados->>'endereco'), ''),
     nullif(btrim(p_dados->>'numero'), ''), nullif(btrim(p_dados->>'complemento'), ''),
     nullif(btrim(p_dados->>'bairro'), ''), nullif(btrim(p_dados->>'cidade'), ''),
     nullif(btrim(p_dados->>'uf'), ''),
     (p_dados->>'data_nascimento')::date,
     (p_dados->>'sexo')::public.sexo,
     (p_dados->>'estado_civil')::public.estado_civil,
     nullif(btrim(p_dados->>'rg'), ''), nullif(btrim(p_dados->>'cpf'), ''),
     nullif(btrim(p_dados->>'nacionalidade'), ''), nullif(btrim(p_dados->>'naturalidade'), ''),
     nullif(btrim(p_dados->>'profissao'), ''), nullif(btrim(p_dados->>'escolaridade'), ''))
    RETURNING id INTO v_id;

  INSERT INTO public.diaconia_vinculos (pessoa_assistida_id, area_id)
       VALUES (v_id, p_area_id)
  ON CONFLICT (pessoa_assistida_id, area_id) DO UPDATE SET ativo = true;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.diaconia_atualizar_pessoa(
  p_pessoa_assistida_id uuid,
  p_nome                text,
  p_dados               jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pode boolean; v_nome text := btrim(p_nome);
BEGIN
  IF v_nome IS NULL OR v_nome = '' THEN
    RAISE EXCEPTION 'Escreva o nome da pessoa.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.diaconia_vinculos v
     WHERE v.pessoa_assistida_id = p_pessoa_assistida_id AND v.ativo
       AND public.diaconia_posso_atender(v.area_id)
  ) INTO v_pode;
  IF NOT v_pode THEN
    RAISE EXCEPTION 'Você não atende esta pessoa.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.diaconia_pessoas_assistidas
     SET nome_completo    = v_nome,
         telefone         = nullif(btrim(p_dados->>'telefone'), ''),
         cep              = nullif(btrim(p_dados->>'cep'), ''),
         endereco         = nullif(btrim(p_dados->>'endereco'), ''),
         numero           = nullif(btrim(p_dados->>'numero'), ''),
         complemento      = nullif(btrim(p_dados->>'complemento'), ''),
         bairro           = nullif(btrim(p_dados->>'bairro'), ''),
         cidade           = nullif(btrim(p_dados->>'cidade'), ''),
         uf               = nullif(btrim(p_dados->>'uf'), ''),
         data_nascimento  = (p_dados->>'data_nascimento')::date,
         sexo             = (p_dados->>'sexo')::public.sexo,
         estado_civil     = (p_dados->>'estado_civil')::public.estado_civil,
         rg               = nullif(btrim(p_dados->>'rg'), ''),
         cpf              = nullif(btrim(p_dados->>'cpf'), ''),
         nacionalidade    = nullif(btrim(p_dados->>'nacionalidade'), ''),
         naturalidade     = nullif(btrim(p_dados->>'naturalidade'), ''),
         profissao        = nullif(btrim(p_dados->>'profissao'), ''),
         escolaridade     = nullif(btrim(p_dados->>'escolaridade'), '')
   WHERE id = p_pessoa_assistida_id;
END;
$$;

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
    situacao_moradia, criancas_ate_11, adolescentes_12_18, adultos_19_59, idosos_60_mais,
    familiares, sustento_familia, maior_necessidade, observacoes, preenchido_por
  ) VALUES (
    p_pessoa_assistida_id,
    (p_dados->>'possui_deficiencia')::boolean, nullif(btrim(p_dados->>'qual_deficiencia'), ''),
    (p_dados->>'possui_renda')::boolean, (p_dados->>'renda_mensal')::numeric,
    (p_dados->>'recebe_beneficio_social')::boolean, nullif(btrim(p_dados->>'qual_beneficio'), ''),
    (p_dados->>'ja_trabalhou_clt')::boolean, nullif(btrim(p_dados->>'tempo_clt'), ''),
    nullif(btrim(p_dados->>'atuacao_clt'), ''),
    nullif(btrim(p_dados->>'situacao_moradia'), ''),
    (p_dados->>'criancas_ate_11')::smallint, (p_dados->>'adolescentes_12_18')::smallint,
    (p_dados->>'adultos_19_59')::smallint, (p_dados->>'idosos_60_mais')::smallint,
    COALESCE(p_dados->'familiares', '[]'::jsonb),
    nullif(btrim(p_dados->>'sustento_familia'), ''), nullif(btrim(p_dados->>'maior_necessidade'), ''),
    nullif(btrim(p_dados->>'observacoes'), ''), auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMIT;
