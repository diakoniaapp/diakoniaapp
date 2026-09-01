-- ═══════════════════════════════════════════════════════════════════════════
-- Cada um passa a poder cuidar da própria ficha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- Existem duas políticas com o nome exato do que a igreja queria:
--
--   membro_ve_proprio    SELECT  … AND id = auth.uid()
--   membro_edita_proprio UPDATE  … AND id = auth.uid()
--
-- E nenhuma das duas jamais liberou uma linha. Elas comparam `membros.id`
-- com `auth.uid()`, que são identificadores de tabelas diferentes: um é a
-- ficha da pessoa, o outro é a conta de acesso. Medido em produção:
--
--   297 fichas · 3 contas · fichas cujo id é também id de conta: ZERO
--
-- O elo verdadeiro existe e se chama `profiles.pessoa_id` — preenchido para
-- as 3 contas, e consultado por nenhuma política do banco.
--
-- Consequência prática, hoje: a única pessoa que consegue corrigir a própria
-- ficha é quem é admin ou secretaria — e essa, na verdade, corrige a dos 297.
-- O Bruno, que é liderança, não altera nem o próprio telefone.
--
-- ── POR QUE FUNÇÃO E NÃO POLÍTICA ──────────────────────────────────────────
--
-- Consertar `membro_edita_proprio` para apontar ao elo certo resolveria a
-- linha e abriria a LINHA INTEIRA. RLS decide QUAIS linhas, nunca QUAIS
-- COLUNAS: a mesma política que deixa a pessoa corrigir o CEP deixaria ela
-- mudar `tipo_pessoa` de visitante para membro, alterar `status` e escrever
-- em `observacoes_pastorais`.
--
-- Privilégio por coluna (`GRANT UPDATE(cep, bairro…)`) existe no Postgres,
-- mas mora fora da tabela, não aparece em `pg_policies`, e ninguém que ler
-- este esquema daqui a um ano vai encontrá-lo.
--
-- Uma função nomeia o que é editável em UM lugar, legível, com a validação
-- junto. É a mesma escolha que o banco já fez para `revogar_acesso()`.
--
-- ── O QUE FICA DE FORA, E POR QUÊ ──────────────────────────────────────────
--
-- Vínculo (`tipo_pessoa`), situação (`status`), funções ministeriais e
-- observações pastorais. Nenhum deles é dado que a pessoa TEM; são todos
-- decisão que a igreja TOMOU sobre ela. Quem os edita é a secretaria.
--
-- ── A ARMADILHA DO TELEFONE ────────────────────────────────────────────────
--
-- `membros.telefone_celular` NÃO é o login. O acesso usa um e-mail fabricado
-- uma vez a partir dos dígitos — 5521983991229@app.diakonia — e guardado em
-- `auth.users`. Trocar o celular na ficha atualiza o cadastro e não move o
-- login: a pessoa continua entrando pelo número antigo. A tela avisa isso em
-- voz alta; o banco não tem como.
--
-- ── A ARMADILHA DO NASCIMENTO ──────────────────────────────────────────────
--
-- `membros_nascimento_uma_fonte_so` proíbe `data_nascimento` e
-- `nascimento_dia_mes` preenchidos ao mesmo tempo. A função limpa o meio ao
-- receber a data inteira — e é justamente esse o caminho que interessa: são
-- 10 fichas com dia e mês e sem ano, e quem sabe o próprio ano é a pessoa.

BEGIN;

-- ── O elo, finalmente com nome ─────────────────────────────────────────────
--
-- SECURITY DEFINER porque `profiles` tem RLS: dentro de uma política de
-- `membros`, a consulta a `profiles` precisa valer sem disparar a RLS de lá.
CREATE OR REPLACE FUNCTION public.minha_pessoa_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT pessoa_id FROM public.profiles WHERE id = (SELECT auth.uid());
$fn$;

COMMENT ON FUNCTION public.minha_pessoa_id() IS
  'A ficha em membros de quem esta logado. O elo e profiles.pessoa_id — NAO membros.id = auth.uid(), que nunca casou com nada.';

-- ── A leitura da própria ficha ─────────────────────────────────────────────
--
-- Trocada, não apagada: continua servindo aos papéis 'membro' e 'voluntario'
-- (hoje zero contas), agora mirando no lugar certo.
DROP POLICY IF EXISTS membro_ve_proprio ON public.membros;
CREATE POLICY membro_ve_proprio ON public.membros
  FOR SELECT
  USING (id = public.minha_pessoa_id());

-- ── A edição da própria ficha ──────────────────────────────────────────────
--
-- Esta some. Não estava permitindo nada — só prometendo. O que ela prometia
-- passa a ser feito por `salvar_meus_dados`, coluna por coluna.
DROP POLICY IF EXISTS membro_edita_proprio ON public.membros;

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
         telefone_celular   = nullif(btrim(p_telefone_celular), ''),
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

COMMENT ON FUNCTION public.salvar_meus_dados IS
  'Autoatendimento: grava SO os campos que a pessoa tem direito de corrigir na propria ficha. Vinculo, situacao, funcoes e observacoes pastorais ficam de fora — sao decisao da igreja, nao dado da pessoa.';

REVOKE ALL ON FUNCTION public.salvar_meus_dados(
  text, date, date, text, text, text, text, text, text, text, text, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.salvar_meus_dados(
  text, date, date, text, text, text, text, text, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.minha_pessoa_id() TO authenticated;

COMMIT;
