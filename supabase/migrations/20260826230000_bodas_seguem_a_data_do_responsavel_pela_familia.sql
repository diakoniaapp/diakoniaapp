-- ─── A boda da família é a data do responsável ─────────────────────────────
--
-- Corrige um defeito introduzido pela migration irmã de hoje
-- (`20260826210000_bodas_registradas_na_pessoa_nunca_apareciam.sql`), que
-- trouxe as bodas de `membros.data_casamento` para o Painel Pastoral e
-- acertou o volume (5 → 37) mas errou o agrupamento.
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- Ela agrupava por (família, DATA). Quando marido e mulher têm datas
-- diferentes — e têm —, cada um virava uma boda separada:
--
--   Vitorino ..... Ricardo 21/03/2015 (responsável) · Eliane 21/05/2015
--   Bittencourt .. Alexandre 15/11/2018 (responsável) · Giselle 15/11/2020
--
-- O painel anunciaria o casal Vitorino em março E em maio, com um nome de
-- cada vez. O pastor mandaria duas felicitações de bodas para o mesmo
-- casamento, em meses diferentes.
--
-- Os dois casos têm cara de erro de digitação (mês trocado num, ano no
-- outro), mas nenhuma regra automática sabe qual dos dois está certo.
--
-- ── A REGRA ────────────────────────────────────────────────────────────────
--
-- **A data do responsável pela família vence.** Uma boda por família, com os
-- dois primeiros nomes no título ("Ricardo e Eliane") e a data do
-- responsável. É previsível: a secretaria sabe onde olhar para corrigir, o
-- que "a maior" ou "a mais antiga" não dariam.
--
-- Medido em produção, 26/08/2026, entre as 70 famílias sem data própria:
--
--   todas têm responsável ativo ................ 70
--   responsável COM data de casamento .......... 24  ← resolve sozinho
--   responsável sem data, mas cônjuge com ......  3  ← a rede abaixo
--   sem responsável e com cônjuge que tem ......  0
--
-- O cônjuge entra só quando o responsável não tem a data. Sem essa queda,
-- 3 famílias continuariam sem bodas.
--
-- ── QUEM NÃO ENTRA NO GRUPO DA FAMÍLIA ─────────────────────────────────────
--
-- 5 casados ativos estão ligados à família com parentesco que não é cônjuge
-- nem pai/mãe — filho casado morando com os pais é o caso típico. A data
-- dele não é a boda daquela família, e juntá-lo ao grupo faria a data do
-- casamento dele disputar com a dos pais.
--
-- Ele não é descartado: vira uma linha própria, com o nome dele. Mesma coisa
-- para os 3 casados que não têm vínculo familiar nenhum. Perder essas bodas
-- para arrumar o agrupamento seria trocar um defeito por outro.
--
-- Onde `familias.data_casamento` está preenchida (5 famílias), ela continua
-- mandando: o ramo antigo é o primeiro e este exclui o que ele já cobre.

create or replace view public.vw_agenda_pastoral as
with resp_data as (
  -- A data de casamento do responsável de cada família.
  --
  -- Serve para reconhecer o cônjuge dele mesmo quando o parentesco
  -- registrado não diz "cônjuge". Ensaiando esta migration apareceu Andrea e
  -- Roger, da família Paixão: os dois casados em 15/12/2000, os dois
  -- registrados como `avo` (são os avós da casa). A regra por parentesco
  -- partia o casal em duas linhas, com a mesma data e um nome em cada.
  --
  -- Mesma família e mesma data é o mesmo casamento. Um filho casado não cai
  -- aqui porque a data dele é outra.
  select distinct on (vf.familia_id) vf.familia_id, m.data_casamento
    from public.vinculos_familiares vf
    join public.membros m on m.id = vf.membro_id
   where vf.responsavel_familia
     and m.status = 'ativo'::membro_status
     and m.data_casamento is not null
   order by vf.familia_id, m.nome_completo
),
conjuges as (
  -- Uma linha por pessoa casada, já classificada: ela forma casal COM a
  -- família (`familia_do_casal` preenchido) ou responde só por si (nulo).
  --
  -- `DISTINCT ON` porque 4 pessoas aparecem em mais de uma família; a ordem
  -- escolhe o vínculo em que a pessoa é responsável.
  select distinct on (m.id)
         m.id,
         m.nome_completo,
         m.data_casamento,
         m.telefone_celular,
         coalesce(vf.responsavel_familia, false) as responsavel,
         case
           when vf.familia_id is not null
            and (coalesce(vf.responsavel_familia, false)
                 or vf.parentesco = any (array['conjuge'::parentesco_tipo, 'pai_mae'::parentesco_tipo])
                 or m.data_casamento = rd.data_casamento)
             then vf.familia_id
         end as familia_do_casal
    from public.membros m
    left join public.vinculos_familiares vf on vf.membro_id = m.id
    left join resp_data rd on rd.familia_id = vf.familia_id
   where m.status = 'ativo'::membro_status
     and m.data_casamento is not null
   order by m.id, coalesce(vf.responsavel_familia, false) desc, vf.familia_id
),
bodas as (
  -- Uma linha por CASAMENTO. A chave é a família quando o casal é dela; sem
  -- família, é a própria pessoa — senão um grupo nulo juntaria numa linha só
  -- os 3 casados sem vínculo.
  --
  -- `order by c.responsavel desc` dentro de cada agregado é o que faz a
  -- regra valer: o responsável é sempre o primeiro do array, então a data,
  -- a pessoa e o telefone principal saem dele.
  select
    coalesce(c.familia_do_casal::text, c.id::text) as chave,
    c.familia_do_casal,
    (array_agg(c.data_casamento  order by c.responsavel desc, c.nome_completo))[1] as data_casamento,
    (array_agg(c.id              order by c.responsavel desc, c.nome_completo))[1] as pessoa_id,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[1] as telefone,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[2] as telefone_secundario,
    string_agg(split_part(c.nome_completo, ' '::text, 1), ' e '::text order by c.responsavel desc, c.nome_completo) as titulo,
    string_agg(c.nome_completo, ' e '::text order by c.responsavel desc, c.nome_completo) as subtitulo
   from conjuges c
   where not exists (
     select 1 from public.familias f2
      where f2.id = c.familia_do_casal and f2.data_casamento is not null
   )
   group by coalesce(c.familia_do_casal::text, c.id::text), c.familia_do_casal
)
 select 'aniversario'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_nascimento as data_origem,
    proximo_aniversario(m.data_nascimento) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, m.data_nascimento::timestamp with time zone))::integer as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario,
    m.tipo_pessoa
   from membros m
  where m.status = 'ativo'::membro_status and m.data_nascimento is not null and (m.tipo_pessoa = any (array['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa]))
union all
 select 'casamento'::text as tipo,
    f.id::text as ref_id,
    null::uuid as pessoa_id,
    f.id as familia_id,
    coalesce(( select string_agg(split_part(m2.nome_completo, ' '::text, 1), ' e '::text order by vf.responsavel_familia desc, m2.nome_completo) as string_agg
           from vinculos_familiares vf
             join membros m2 on m2.id = vf.membro_id
          where vf.familia_id = f.id and (vf.parentesco = any (array['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])) and m2.status = 'ativo'::membro_status), 'Família '::text || f.nome_familia) as titulo,
    'Família '::text || f.nome_familia as subtitulo,
    f.data_casamento as data_origem,
    proximo_aniversario(f.data_casamento) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, f.data_casamento::timestamp with time zone))::integer as anos_vai_completar,
    ( select m3.telefone_celular
           from vinculos_familiares vf3
             join membros m3 on m3.id = vf3.membro_id
          where vf3.familia_id = f.id and vf3.responsavel_familia = true
         limit 1) as telefone,
    ( select m4.telefone_celular
           from vinculos_familiares vf4
             join membros m4 on m4.id = vf4.membro_id
          where vf4.familia_id = f.id and vf4.responsavel_familia = false and (vf4.parentesco = any (array['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo]))
          order by m4.nome_completo
         limit 1) as telefone_secundario,
    null::tipo_pessoa as tipo_pessoa
   from familias f
  where f.data_casamento is not null
union all
 select 'casamento'::text as tipo,
    'mc:'::text || b.chave as ref_id,
    b.pessoa_id,
    b.familia_do_casal as familia_id,
    b.titulo,
    b.subtitulo,
    b.data_casamento as data_origem,
    proximo_aniversario(b.data_casamento) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, b.data_casamento::timestamp with time zone))::integer as anos_vai_completar,
    b.telefone,
    b.telefone_secundario,
    null::tipo_pessoa as tipo_pessoa
   from bodas b
union all
 select 'membresia'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_entrada as data_origem,
    proximo_aniversario(m.data_entrada) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, m.data_entrada::timestamp with time zone))::integer as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario,
    m.tipo_pessoa
   from membros m
  where m.status = 'ativo'::membro_status and m.data_entrada is not null and m.tipo_pessoa = 'membro'::tipo_pessoa
union all
 select 'pastorado'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_consagracao_pastoral as data_origem,
    proximo_aniversario(m.data_consagracao_pastoral) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, m.data_consagracao_pastoral::timestamp with time zone))::integer as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario,
    m.tipo_pessoa
   from membros m
  where m.status = 'ativo'::membro_status and m.data_consagracao_pastoral is not null and m.funcoes_ministeriais && array['pastor'::funcao_ministerial, 'presidente'::funcao_ministerial, 'pastor_auxiliar'::funcao_ministerial, 'pastor_missionario'::funcao_ministerial];
