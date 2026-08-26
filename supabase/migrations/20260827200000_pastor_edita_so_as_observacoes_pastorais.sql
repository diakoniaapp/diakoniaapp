-- ─── O pastor titular passa a editar SÓ as observações pastorais ───────────
--
-- Fecha o que a migration de hoje mais cedo
-- (`20260827180000_quem_edita_pessoa...`) deixou aberto de propósito: lá o
-- pastor titular ficou podendo editar a ficha INTEIRA, porque ele precisa
-- gravar `observacoes_pastorais` e RLS é por LINHA, não por coluna.
--
-- A regra que a Telma queria desde o começo é "apenas admin e secretaria
-- editam pessoas". Isto a cumpre, com a exceção mínima que o trabalho
-- pastoral exige.
--
-- ── POR QUE PRECISA DE GATILHO ─────────────────────────────────────────────
--
-- Não há como uma política dizer "pode dar UPDATE nesta linha, mas só nesta
-- coluna". Privilégio de coluna existe no Postgres (`GRANT UPDATE(col)`), mas
-- é por papel do BANCO, e aqui todo mundo compartilha o `authenticated` — o
-- papel da igreja vive em `user_roles`, que só uma função enxerga.
--
-- Então: a política deixa o pastor escrever na linha, e o gatilho recusa se
-- ele mexer em qualquer outra coisa.
--
-- ── AS QUATRO COLUNAS IGNORADAS, E POR QUE ─────────────────────────────────
--
-- O formulário de pessoa manda a LINHA INTEIRA a cada save, não só o que
-- mudou. Um gatilho ingênuo — "nada além da observação pode diferir" —
-- recusaria o pastor por colunas que ele nunca viu:
--
--   observacoes_pastorais  é o que ele pode mudar; o motivo de tudo isto
--   updated_at             `trg_updated_at_membros` reescreve sozinho
--   funcao_ministerial     `trg_funcao_principal` deriva do array; muda como
--                          consequência, não como escolha
--   perfil_acesso          COLUNA LEGADA. O formulário grava `null` nela em
--                          TODO save, de propósito (o acesso vive em
--                          `user_roles`). Medido em 26/08/2026: 45 pessoas
--                          ainda têm resíduo da importação de junho. Sem
--                          esta linha, o pastor abriria a ficha de qualquer
--                          uma dessas 45, escreveria uma observação e levaria
--                          um erro por causa de um campo morto.
--
-- A comparação é por VALOR (`to_jsonb(NEW) - colunas` contra o mesmo de OLD),
-- e não por "quais colunas apareceram no SET". Assim o formulário pode
-- reenviar o telefone igual ao que já estava sem que isso conte como
-- alteração — e uma coluna NOVA no futuro entra automaticamente na proibição,
-- que é o padrão seguro.
--
-- ── O QUE ISTO NÃO FAZ ─────────────────────────────────────────────────────
--
-- Não mexe em leitura. `membros_by_igreja` já dá SELECT a qualquer
-- autenticado da igreja, e as observações pastorais sempre foram legíveis por
-- todos — inclusive pela liderança e pelos voluntários. Fechar isso é outro
-- assunto, e o lugar é aquela política.

-- ── 1. A ficha volta a ser de admin e secretaria ───────────────────────────
DROP POLICY IF EXISTS staff_update_membros ON public.membros;

CREATE POLICY staff_update_membros ON public.membros
  FOR UPDATE
  USING (
    public.has_any_role(
      (SELECT auth.uid()),
      ARRAY['admin', 'secretaria']::app_role[]
    )
  );

COMMENT ON POLICY staff_update_membros ON public.membros IS
  'Edita a ficha de uma pessoa: admin e secretaria. O pastor titular entra '
  'pela política pastor_acessa_obs_pastorais e o gatilho '
  'trg_pastor_so_observacoes o limita à coluna observacoes_pastorais.';

DROP POLICY IF EXISTS staff_insert_membros ON public.membros;

CREATE POLICY staff_insert_membros ON public.membros
  FOR INSERT
  WITH CHECK (
    public.has_any_role(
      (SELECT auth.uid()),
      ARRAY['admin', 'secretaria']::app_role[]
    )
  );

-- ── 2. O gatilho que separa a coluna ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pastor_so_observacoes()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY DEFINER para poder ler `user_roles`, que o próprio usuário não
-- alcança por RLS.
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ignoradas text[] := ARRAY[
    'observacoes_pastorais', 'updated_at', 'funcao_ministerial', 'perfil_acesso'
  ];
BEGIN
  -- Quem edita a ficha inteira passa direto.
  IF public.has_any_role(
       (SELECT auth.uid()),
       ARRAY['admin', 'secretaria']::app_role[]
     ) THEN
    RETURN NEW;
  END IF;

  -- Migration, script e qualquer coisa sem usuário logado passam. Sem isto,
  -- uma correção de dados feita pelo `service_role` seria recusada por um
  -- gatilho pensado para gente.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - ignoradas) IS DISTINCT FROM (to_jsonb(OLD) - ignoradas) THEN
    RAISE EXCEPTION
      'Pastor titular altera apenas as observações pastorais. Peça à secretaria para mudar o resto da ficha.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pastor_so_observacoes ON public.membros;

-- `zzz_` no nome para rodar por ÚLTIMO entre os BEFORE UPDATE: o Postgres
-- dispara gatilhos de mesmo tempo em ordem alfabética, e `trg_funcao_principal`
-- precisa já ter derivado `funcao_ministerial` antes de eu comparar as linhas.
CREATE TRIGGER zzz_pastor_so_observacoes
  BEFORE UPDATE ON public.membros
  FOR EACH ROW
  EXECUTE FUNCTION public.pastor_so_observacoes();

-- ── 3. A tela precisa poder dizer isto ─────────────────────────────────────
--
-- Sem uma permissão própria, "o pastor escreve observação" não existiria em
-- lugar nenhum que a igreja possa ler — e a tabela de perfis voltaria a
-- descrever o sistema pela metade, que é o defeito que passamos o dia
-- consertando.
INSERT INTO public.permissoes (codigo, modulo, descricao)
VALUES ('editar_obs_pastorais', 'pessoas',
        'Escrever observações pastorais na ficha (sem poder alterar o resto)')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.role_permissoes (role, permissao_codigo)
VALUES ('admin', 'editar_obs_pastorais'), ('secretaria', 'editar_obs_pastorais'),
       ('diakonia', 'editar_obs_pastorais'), ('pastor', 'editar_obs_pastorais')
ON CONFLICT DO NOTHING;

-- E `editar_pessoa` volta a ser o que a Telma disse: admin e secretaria.
DELETE FROM public.role_permissoes
 WHERE role IN ('diakonia', 'pastor')
   AND permissao_codigo IN ('editar_pessoa', 'criar_pessoa');
