-- ─── As bodas registradas na PESSOA nunca chegavam ao Painel Pastoral ───────
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- `vw_agenda_pastoral` lia data de casamento de UM lugar só: `familias`. A
-- tela de Agenda (`/eventos`) lê de OUTRO: `membros.data_casamento`. As duas
-- telas mostravam listas diferentes da mesma igreja, e ninguém percebia
-- porque cada uma parecia completa sozinha.
--
-- Medido em produção, 26/08/2026:
--
--   membros.data_casamento preenchido ......... 57  (todos com status ativo)
--   familias.data_casamento preenchido .........  5
--
--   dos 57: sem família com data de casamento .. 49   ← nunca apareciam
--           com família que já tinha a data ....  8   ← já apareciam
--
-- Ou seja: no ano inteiro o Painel Pastoral anunciava 5 bodas, e a igreja tem
-- 57 registradas. O pastor titular abria o painel e não via as bodas de 49
-- casais.
--
-- ── POR QUE NÃO BASTA SOMAR AS DUAS FONTES ─────────────────────────────────
--
-- Bodas são de um CASAL, e o banco guarda a data em cada cônjuge:
--
--   casais com mesma família e mesma data ...... 19
--
-- Somar `membros` a `familias` faria cada uma dessas 19 bodas aparecer DUAS
-- vezes, uma com o nome do marido e outra com o da esposa. Por isso o ramo
-- novo agrupa por (família, data) antes de virar linha, e o título sai com os
-- dois primeiros nomes — "João e Maria" —, do mesmo jeito que o ramo antigo
-- de `familias` já fazia.
--
-- Três detalhes que a medição obrigou a tratar:
--
--   membros com mais de um vínculo familiar ....  4  → `DISTINCT ON` escolhe
--                                                      um: o vínculo em que a
--                                                      pessoa é responsável.
--   casados ativos sem vínculo nenhum ..........  3  → agrupam por si mesmos;
--                                                      um `GROUP BY` por
--                                                      família nula juntaria
--                                                      os três numa linha só.
--   membro e família divergindo na data ........  1  → a família vence: o ramo
--                                                      antigo continua
--                                                      mandando onde existe.
--
-- ── O QUE NÃO MUDOU ────────────────────────────────────────────────────────
--
-- Nome, tipo e ordem das 12 colunas: `CREATE OR REPLACE VIEW` só aceita coluna
-- nova no fim, e não há coluna nova. Os ramos de aniversário, membresia e
-- pastorado estão copiados de `pg_get_viewdef` sem uma letra trocada — o único
-- ramo reescrito é o de casamento.
--
-- Uma diferença de comportamento, deliberada: o ramo antigo devolve
-- `pessoa_id` nulo para bodas, porque não havia pessoa, só família. O ramo
-- novo devolve a pessoa — o cônjuge responsável, ou o primeiro nome em ordem.
-- Assim o clique no nome abre a ficha e o link do WhatsApp tem para quem
-- apontar, que é o que o painel já faz com as outras celebrações.

create or replace view public.vw_agenda_pastoral as
with conjuges as (
  -- Uma linha por pessoa casada, com O vínculo familiar dela.
  --
  -- `DISTINCT ON` porque 4 pessoas aparecem em mais de uma família, e sem ele
  -- o `LEFT JOIN` multiplicaria a mesma pessoa — a boda sairia repetida por
  -- família, que é exatamente o defeito que esta migration conserta.
  select distinct on (m.id)
         m.id,
         m.nome_completo,
         m.data_casamento,
         m.telefone_celular,
         vf.familia_id,
         coalesce(vf.responsavel_familia, false) as responsavel
    from public.membros m
    left join public.vinculos_familiares vf on vf.membro_id = m.id
   where m.status = 'ativo'::membro_status
     and m.data_casamento is not null
   order by m.id, coalesce(vf.responsavel_familia, false) desc, vf.familia_id
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
 -- ── RAMO NOVO: a data que mora na pessoa ─────────────────────────────────
 -- O `not exists` deixa a família vencer onde ela tem a data, para a boda não
 -- sair pelos dois ramos ao mesmo tempo (são 8 pessoas nessa situação).
 select 'casamento'::text as tipo,
    -- `min(c.id::text)`, e não `min(c.id)`: o Postgres não tem agregado `min`
    -- para uuid. O texto ordena igual para o efeito aqui, que é só escolher
    -- um representante estável do grupo.
    'mc:'::text || coalesce(c.familia_id::text, min(c.id::text)) || ':'::text || c.data_casamento::text as ref_id,
    (array_agg(c.id order by c.responsavel desc, c.nome_completo))[1] as pessoa_id,
    c.familia_id,
    string_agg(split_part(c.nome_completo, ' '::text, 1), ' e '::text order by c.responsavel desc, c.nome_completo) as titulo,
    string_agg(c.nome_completo, ' e '::text order by c.responsavel desc, c.nome_completo) as subtitulo,
    c.data_casamento as data_origem,
    proximo_aniversario(c.data_casamento) as proxima_data,
    date_part('year'::text, age(current_date::timestamp with time zone, c.data_casamento::timestamp with time zone))::integer as anos_vai_completar,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[1] as telefone,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[2] as telefone_secundario,
    null::tipo_pessoa as tipo_pessoa
   from conjuges c
  where not exists (
    select 1 from public.familias f2
     where f2.id = c.familia_id and f2.data_casamento is not null
  )
  -- A chave é (família, data). Sem família, a própria pessoa é a chave —
  -- senão os 3 sem vínculo nenhum cairiam todos no mesmo grupo nulo.
  group by coalesce(c.familia_id::text, c.id::text), c.familia_id, c.data_casamento
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
