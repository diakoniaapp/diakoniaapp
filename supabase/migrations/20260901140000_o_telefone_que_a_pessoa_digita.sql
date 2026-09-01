-- ═══════════════════════════════════════════════════════════════════════════
-- `salvar_meus_dados` passa a aceitar o telefone como a pessoa o escreve
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── COMO ISTO APARECEU ─────────────────────────────────────────────────────
--
-- Ensaiando a função recém-criada com `BEGIN … ROLLBACK` e a identidade de um
-- usuário real, a gravação foi recusada:
--
--   ERROR 23514: new row for relation "membros" violates check constraint
--   "membros_telefone_celular_formato"
--
-- O ensaio passou o número como alguém o escreveria — "21999998888" — e a
-- coluna exige DDI:
--
--   CHECK (telefone_celular IS NULL OR telefone_celular ~ '^55[0-9]{10,11}$')
--
-- Sem este conserto, a primeira pessoa que corrigisse o próprio celular
-- digitando "(21) 98399-1229" receberia essa linha de erro na tela. Não é
-- hipótese: é o formato em que gente escreve telefone.
--
-- ── POR QUE NA FUNÇÃO, E NÃO SÓ NA TELA ────────────────────────────────────
--
-- A tela também foi corrigida — o projeto já tinha o padrão escrito em
-- `lib/telefone.ts`: "UI exibe +55 (DDD) NNNNN-NNNN, banco grava 5521…", e o
-- formulário novo não o seguia.
--
-- Mas a tela não pode ser a única guarda. Esta função é a PORTA ÚNICA por onde
-- a pessoa escreve na própria ficha, e uma porta que só funciona se quem bate
-- souber a senha não é uma porta — é uma armadilha para o próximo chamador.
-- Aqui a regra vale para qualquer um que chame a função.
--
-- ── O QUE ELA ACEITA ───────────────────────────────────────────────────────
--
--   (21) 98399-1229   →  5521983991229
--   21983991229       →  5521983991229
--   +55 21 98399-1229 →  5521983991229
--   5521983991229     →  5521983991229   (já canônico)
--
-- As mesmas quatro formas que `normalizarTelefone` aceita no TypeScript. As
-- duas implementações precisam concordar, e é por isso que os exemplos estão
-- escritos aqui: são o contrato entre elas.
--
-- Qualquer outra coisa vira mensagem em português, e não código de erro.

BEGIN;

CREATE OR REPLACE FUNCTION public.salvar_meus_dados(
  p_nome_completo     text,
  p_data_nascimento   date,
  p_data_casamento    date,
  p_telefone_celular  text,
  p_email             text,
  p_cep               text,
  p_endereco          text,
  p_numero            text,
  p_complemento       text,
  p_bairro            text,
  p_cidade            text,
  p_uf                text
)
RETURNS TABLE (id uuid, nome_completo text, atualizado_em timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pessoa uuid := public.minha_pessoa_id();
  v_nome   text := nullif(btrim(p_nome_completo), '');
  v_uf     text := nullif(upper(btrim(p_uf)), '');
  v_email  text := nullif(btrim(p_email), '');
  v_tel    text;
BEGIN
  -- Sem ficha ligada não há o que salvar. Acontece com conta criada antes de
  -- a pessoa existir no cadastro — a mensagem diz o que fazer, porque quem
  -- vai lê-la é a pessoa, e não quem programou.
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Sua conta ainda nao esta ligada a uma ficha de cadastro. Fale com a secretaria.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'O nome nao pode ficar em branco.' USING ERRCODE = '22023';
  END IF;

  -- ── O telefone, como a pessoa escreve ────────────────────────────────
  v_tel := nullif(regexp_replace(coalesce(p_telefone_celular, ''), '[^0-9]', '', 'g'), '');
  IF v_tel IS NOT NULL THEN
    -- 10 ou 11 dígitos é DDD + número, sem o país. É como se anota telefone
    -- no Brasil, e é o caso mais comum de quem digita.
    IF length(v_tel) IN (10, 11) THEN
      v_tel := '55' || v_tel;
    END IF;
    IF v_tel !~ '^55[0-9]{10,11}$' THEN
      RAISE EXCEPTION 'Confira o telefone: informe DDD e numero, como (21) 98399-1229.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Nascimento no futuro é sempre digitação errada, e 130 anos também. O
  -- limite de baixo pega o ano trocado (1025 em vez de 2025), que é o engano
  -- mais comum em campo de data digitada.
  IF p_data_nascimento IS NOT NULL
     AND (p_data_nascimento > current_date
          OR p_data_nascimento < current_date - interval '130 years') THEN
    RAISE EXCEPTION 'Confira a data de nascimento: % nao parece certa.', p_data_nascimento
      USING ERRCODE = '22023';
  END IF;

  IF p_data_casamento IS NOT NULL AND p_data_casamento > current_date THEN
    RAISE EXCEPTION 'A data de casamento esta no futuro.' USING ERRCODE = '22023';
  END IF;

  IF v_uf IS NOT NULL AND length(v_uf) <> 2 THEN
    RAISE EXCEPTION 'O estado deve ter duas letras (RJ, SP, MG...).' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'O e-mail % nao parece valido.', v_email USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.membros m
     SET nome_completo      = v_nome,
         data_nascimento    = p_data_nascimento,
         -- O CHECK membros_nascimento_uma_fonte_so proíbe os dois juntos.
         -- Quem informa o ano fecha a pendência, e o meio-registro sai.
         nascimento_dia_mes = CASE WHEN p_data_nascimento IS NOT NULL
                                   THEN NULL ELSE m.nascimento_dia_mes END,
         data_casamento     = p_data_casamento,
         telefone_celular   = v_tel,
         email              = v_email,
         cep                = nullif(btrim(p_cep), ''),
         endereco           = nullif(btrim(p_endereco), ''),
         numero             = nullif(btrim(p_numero), ''),
         complemento        = nullif(btrim(p_complemento), ''),
         bairro             = nullif(btrim(p_bairro), ''),
         cidade             = nullif(btrim(p_cidade), ''),
         uf                 = v_uf,
         updated_at         = now()
   WHERE m.id = v_pessoa
  RETURNING m.id, m.nome_completo, m.updated_at;
END;
$fn$;

COMMIT;
