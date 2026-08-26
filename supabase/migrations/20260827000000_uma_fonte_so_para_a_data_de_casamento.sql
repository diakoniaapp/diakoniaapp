-- ─── Uma fonte só para a data de casamento ─────────────────────────────────
--
-- A data de casamento existia em DOIS lugares — `familias.data_casamento` e
-- `membros.data_casamento` — e as duas discordavam. Esta migration move as 5
-- famílias que ainda usavam a primeira para a segunda, esvazia a coluna e
-- tira o ramo dela da `vw_agenda_pastoral`.
--
-- O campo já saiu da tela de Famílias no commit anterior. Com ele fora, essas
-- 5 datas ficaram sem nenhuma interface que as editasse: se uma estivesse
-- errada, só o banco corrigiria. É isso que acaba aqui.
--
-- ── O ESTADO DAS 5, MEDIDO EM 26/08/2026 ───────────────────────────────────
--
--   família              data da família   responsável        cônjuge
--   ─────────────────────────────────────────────────────────────────────────
--   Cavalcante Dias      16/10/2010        16/09/2010  ⚠️     16/10/2010
--   Lourenço             01/10/1988        01/10/1988         VAZIO
--   Moraes               18/09/2000        VAZIO              18/09/2000
--   Rodrigues de Souza   17/12/2025        17/12/2025         17/12/2025
--   Santos               06/12/2008        06/12/2008         06/12/2008
--
-- Três já concordam e não precisam de nada. Duas precisam de cópia. Uma —
-- Cavalcante Dias — tem uma divergência de verdade, e é o único ponto desta
-- migration que decide algo em vez de copiar.
--
-- ── PASSO 1: completar quem está vazio ─────────────────────────────────────
--
-- Elizabeth (Lourenço) e Kleber (Moraes) não têm data no cadastro. Sem esta
-- cópia os dois casais perderiam metade do nome no painel: o título sai de
-- quem TEM data, então "Alexandre e Elizabeth" viraria "Alexandre".
--
-- No caso de Kleber é pior: ele é o RESPONSÁVEL. Sem data, a regra do
-- responsável cai para a esposa e o título inverte para "Adriana e Kleber".
--
-- ── PASSO 2: a divergência do Cavalcante Dias ──────────────────────────────
--
-- Gustavo (responsável) tem 16/09/2010. A família e a esposa dele, Gabriela,
-- têm 16/10/2010. Dois registros independentes contra um, e o 16/10 é o que
-- o painel mostra hoje.
--
-- **Esta migration alinha Gustavo ao 16/10.** É uma decisão, não uma cópia,
-- e vale dizer o que ela custa: se o certo for o 16/09 dele, o erro passa a
-- estar em três lugares em vez de um. A alternativa era não mexer e deixar a
-- boda pular de outubro para setembro sozinha quando a coluna esvaziasse —
-- uma mudança de comportamento silenciosa, que é pior.
--
-- A condição é uma regra, não um id fixo: só alinha o responsável quando ele
-- discorda da família E outro cônjuge da mesma família concorda com ela.
-- Hoje isso descreve exatamente uma linha.
--
-- ── PASSO 3: esvaziar e desligar ───────────────────────────────────────────
--
-- A coluna fica no lugar, vazia e marcada como obsoleta — derrubá-la exigiria
-- regenerar `integrations/supabase/types.ts` e mexer em `familiaService`, sem
-- ganho nenhum. O que importa é que ninguém mais a lê: `vw_agenda_pastoral`
-- era o único consumidor no banco inteiro (medido: nenhuma função, nenhuma
-- outra view), e a tela parou de escrevê-la.

-- ── PASSO 1 ────────────────────────────────────────────────────────────────
update public.membros m
   set data_casamento = f.data_casamento
  from public.vinculos_familiares vf
  join public.familias f on f.id = vf.familia_id
 where vf.membro_id = m.id
   and f.data_casamento is not null
   and m.data_casamento is null
   and m.status = 'ativo'::membro_status
   and vf.parentesco = any (array['conjuge'::parentesco_tipo, 'pai_mae'::parentesco_tipo]);

-- ── PASSO 2 ────────────────────────────────────────────────────────────────
update public.membros m
   set data_casamento = f.data_casamento
  from public.vinculos_familiares vf
  join public.familias f on f.id = vf.familia_id
 where vf.membro_id = m.id
   and vf.responsavel_familia
   and f.data_casamento is not null
   and m.data_casamento is distinct from f.data_casamento
   and m.status = 'ativo'::membro_status
   -- Só quando OUTRO cônjuge da mesma família confirma a data da família.
   -- Sem esta linha, qualquer discordância seria resolvida em favor da
   -- família, e a família é justamente a fonte que estamos aposentando.
   and exists (
     select 1
       from public.vinculos_familiares vf2
       join public.membros m2 on m2.id = vf2.membro_id
      where vf2.familia_id = f.id
        and vf2.membro_id <> m.id
        and m2.status = 'ativo'::membro_status
        and m2.data_casamento = f.data_casamento
   );

-- ── PASSO 3 ────────────────────────────────────────────────────────────────
update public.familias set data_casamento = null where data_casamento is not null;

comment on column public.familias.data_casamento is
  'OBSOLETA desde 27/08/2026. A data de casamento mora em membros.data_casamento, '
  'lida do responsável pela família (ver vw_agenda_pastoral). Esvaziada por '
  '20260827000000_uma_fonte_so_para_a_data_de_casamento.sql. Não voltar a gravar aqui: '
  'nada lê esta coluna.';

-- ── A view, agora sem o ramo da família ────────────────────────────────────
create or replace view public.vw_agenda_pastoral as
with resp_data as (
  -- A data de casamento do responsável de cada família.
  --
  -- Serve para reconhecer o cônjuge dele mesmo quando o parentesco registrado
  -- não diz "cônjuge" — Andrea e Roger, da família Paixão, estão os dois como
  -- `avo` e casaram no mesmo dia. Mesma família e mesma data é o mesmo
  -- casamento. Um filho casado não cai aqui porque a data dele é outra.
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
  -- Uma linha por CASAMENTO. `order by c.responsavel desc` dentro de cada
  -- agregado é o que faz a regra valer: o responsável é o primeiro do array,
  -- então a data, a pessoa e o telefone principal saem dele.
  --
  -- O `not exists` contra `familias.data_casamento` saiu junto com o ramo:
  -- a coluna está vazia e obsoleta, e não há mais o que desempatar.
  select
    coalesce(c.familia_do_casal::text, c.id::text) as chave,
    c.familia_do_casal,
    (array_agg(c.data_casamento   order by c.responsavel desc, c.nome_completo))[1] as data_casamento,
    (array_agg(c.id               order by c.responsavel desc, c.nome_completo))[1] as pessoa_id,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[1] as telefone,
    (array_agg(c.telefone_celular order by c.responsavel desc, c.nome_completo))[2] as telefone_secundario,
    string_agg(split_part(c.nome_completo, ' '::text, 1), ' e '::text order by c.responsavel desc, c.nome_completo) as titulo,
    string_agg(c.nome_completo, ' e '::text order by c.responsavel desc, c.nome_completo) as subtitulo
   from conjuges c
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
