-- ═══════════════════════════════════════════════════════════════════════════
-- Uma linha por pessoa no alerta de família
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── COMO ISTO APARECEU ─────────────────────────────────────────────────────
--
-- Um aviso do React no console do Painel Pastoral: "Encountered two children
-- with the same key". A chave repetida era uma pessoa — Ana Lucia Simas da
-- Silva — no cartão "Possíveis vínculos familiares".
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- A função junta pessoa e família pelo sobrenome:
--
--   LEFT JOIN familias_por_sobrenome fps ON fps.fam_sobrenome = sf.sobrenome
--
-- Quem se chama "Silva" casa com TODA família cujo sobrenome extraído é
-- "Silva" — e há cinco delas: Dias Silva, Silva, Gomes da Silva, Pinto Da
-- Silva, Mendes da Silva. A Ana Lucia saía cinco vezes.
--
-- Medido: **11 sobrenomes têm mais de uma família** — silva 5, souza 3,
-- barbosa 3, e mais oito com duas.
--
-- ── O ESTRAGO ERA MAIOR QUE O AVISO ────────────────────────────────────────
--
-- A função termina com `LIMIT 50`, e as duplicatas o consumiam:
--
--   79   pessoas ativas sem vínculo familiar
--   51   das quais o alerta deveria mostrar
--   10   quantas ele mostrava — 50 linhas ÷ 5 repetições
--   50   o número que o cartão anunciava
--
-- Dois números errados na mesma tela: dizia "50" e mostrava 10, de 51. As
-- outras 41 pessoas nunca chegavam a ser sugeridas a ninguém, porque as
-- repetições da Ana Lucia ocupavam o lugar delas.
--
-- ── A CORREÇÃO ─────────────────────────────────────────────────────────────
--
-- `DISTINCT ON (pessoa)`, escolhendo a família com MAIS MEMBROS entre as que
-- casam. É o palpite melhor: entre cinco "Silva", a que já reuniu mais gente
-- é a mais provável — e continua sendo palpite, que é o que o cartão promete
-- ("Possíveis vínculos", "Sobrenomes em comum não vinculados").
--
-- O `LIMIT 50` fica, e agora limita PESSOAS. As colunas não mudam: quem
-- chama continua recebendo o mesmo formato.
--
-- ── O QUE ISTO NÃO RESOLVE ─────────────────────────────────────────────────
--
-- A sugestão continua sendo por sobrenome, e sobrenome não é parentesco: as
-- cinco famílias "Silva" desta igreja não são a mesma família. O cartão leva
-- a `/familias` para uma pessoa decidir, e é assim que tem de ser. O que
-- muda aqui é que ele para de gritar cinco vezes o nome de quem já sugeriu.

BEGIN;

CREATE OR REPLACE FUNCTION public.pessoas_sem_familia_sobrenome_conhecido()
RETURNS TABLE(pessoa_id uuid, nome_completo text, sobrenome text,
              qtd_pessoas_mesmo_sobrenome integer,
              familia_sugerida_id uuid, familia_sugerida_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH
  -- Pessoas ativas e seu sobrenome
  pessoas AS (
    SELECT m.id, m.nome_completo, public.extrair_sobrenome(m.nome_completo) AS sobrenome
    FROM public.membros m
    WHERE m.status = 'ativo'
      AND m.tipo_pessoa IN ('membro','congregado')
  ),
  -- Pessoas SEM vínculo familiar
  sem_familia AS (
    SELECT p.* FROM pessoas p
    LEFT JOIN public.vinculos_familiares vf ON vf.membro_id = p.id
    WHERE vf.id IS NULL
      AND p.sobrenome IS NOT NULL
      AND length(p.sobrenome) >= 3
  ),
  -- Familias existentes com sobrenome correspondente (via primeiro membro)
  familias_por_sobrenome AS (
    SELECT f.id, f.nome_familia,
           public.extrair_sobrenome(f.nome_familia) AS fam_sobrenome,
           COUNT(vf.id) AS qtd_membros
    FROM public.familias f
    LEFT JOIN public.vinculos_familiares vf ON vf.familia_id = f.id
    GROUP BY f.id, f.nome_familia
    HAVING COUNT(vf.id) > 0
  ),
  -- Contar quantas pessoas têm o mesmo sobrenome (pra mostrar urgência)
  contagem AS (
    SELECT sobrenome, COUNT(*) AS qtd FROM pessoas GROUP BY sobrenome
  ),
  -- ── UMA LINHA POR PESSOA ────────────────────────────────────────────
  --
  -- Era aqui que a mesma pessoa saía uma vez por família homônima. Entre as
  -- que casam, fica a que já reuniu mais gente; o desempate por nome existe
  -- só para o resultado não mudar de uma consulta para outra.
  melhor AS (
    SELECT DISTINCT ON (sf.id)
           sf.id, sf.nome_completo, sf.sobrenome,
           c.qtd AS qtd_mesmo_sobrenome,
           fps.id AS fam_id,
           fps.nome_familia AS fam_nome
    FROM sem_familia sf
    LEFT JOIN contagem c ON c.sobrenome = sf.sobrenome
    LEFT JOIN familias_por_sobrenome fps ON fps.fam_sobrenome = sf.sobrenome
    WHERE (c.qtd >= 2 OR fps.id IS NOT NULL)
    ORDER BY sf.id,
             (fps.id IS NOT NULL) DESC,
             fps.qtd_membros DESC NULLS LAST,
             fps.nome_familia
  )
  SELECT m.id, m.nome_completo, m.sobrenome,
         m.qtd_mesmo_sobrenome::int,
         m.fam_id,
         m.fam_nome
  FROM melhor m
  ORDER BY
    (m.fam_id IS NOT NULL) DESC,
    m.qtd_mesmo_sobrenome DESC NULLS LAST,
    m.nome_completo
  -- ── O TETO SOBE DE 50 PARA 200 ──────────────────────────────────────
  --
  -- Com as duplicatas, 50 LINHAS eram 10 pessoas. Sem elas, 50 linhas são 50
  -- pessoas — e são 51 as elegíveis nesta igreja. O cartão continuaria a
  -- mentir, agora por um em vez de por quarenta.
  --
  -- 200 não é generosidade: é um teto que não corta ninguém numa igreja de
  -- 297 e continua sendo teto se ela crescer. O cartão mostra três nomes e
  -- diz "e mais N" — é esse N que precisa ser verdade.
  LIMIT 200;
$function$;

COMMIT;
