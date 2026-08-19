-- ─── Lembrete de ordenação pastoral, e o dia certo para todos os outros ────
--
-- Pedido: que a função PASTOR gere lembrete do aniversário de ordenação.
--
-- Metade já existia. `vw_agenda_pastoral` tinha o ramo "pastorado" desde a
-- migração 20260818010000, e o cliente já sabe desenhá-lo — ícone de igreja,
-- "N anos de pastorado", mensagem pastoral própria em agendaPastoralService.
-- O que faltava era amarrar ao que o pedido diz: a FUNÇÃO.
--
--   antes:  WHERE data_consagracao_pastoral IS NOT NULL
--   agora:  WHERE funcao_ministerial = 'pastor' AND a data preenchida
--
-- Na prática hoje dá no mesmo — as duas pessoas com data de consagração
-- (Daniel Alves Souza, 16/12/1997; Lucio Paulo Paz Barreto, 10/10/1996) já
-- estão marcadas como pastor. A diferença aparece no dia em que alguém deixar
-- o pastorado: a data continua no cadastro, como fato histórico, e o lembrete
-- para de sair — que é o que "lembrete da função de pastor" quer dizer.
--
-- ── E O BUG QUE ESTAVA ATRÁS DISSO ────────────────────────────────────────
--
-- A próxima ocorrência era calculada por DIA DO ANO:
--
--     date_trunc('year', CURRENT_DATE) + (date_part('doy', data) - 1) dias
--
-- Dia do ano não é estável entre anos bissextos e comuns. Quem nasceu em
-- 15/03/2000 tem doy 75, porque 2000 teve 29 de fevereiro; jogar 75 dias sobre
-- 2026, que não teve, cai em 16 de março:
--
--     nasceu 15/03/2000 (bissexto) → lembrete em 2026-03-16   ← um dia atrasado
--     nasceu 15/03/2001 (comum)    → lembrete em 2026-03-15   ← certo
--     casamento 01/12/1996         → lembrete em 2026-12-02   ← um dia atrasado
--
-- Contado no banco: de 204 efemérides cadastradas (nascimento, entrada,
-- consagração e casamento), 41 sairiam no dia errado. Uma em cada cinco.
--
-- Ligar para alguém no dia seguinte ao aniversário é pior do que não ligar:
-- diz que a igreja tentou e errou. E o erro não estava só no ramo novo — os
-- quatro ramos usavam a mesma conta, e a função de listagem tinha ainda uma
-- terceira cópia dela.
--
-- A correção troca dia-do-ano por dia-e-mês, que é como as pessoas contam
-- aniversário. Fica numa função só, usada pela view e pela listagem, para não
-- haver uma quarta cópia amanhã.
--
-- 29 de fevereiro é o único caso que dia-e-mês não resolve sozinho: em ano
-- comum a data não existe e make_date levantaria erro. Cai em 28/02, que é a
-- convenção usual — celebrar antes, e não depois.

create or replace function public.proximo_aniversario(p_data date, p_ano int default null)
returns date
language sql
immutable
set search_path to 'public'
as $$
  select make_date(
    coalesce(p_ano, date_part('year', current_date)::int),
    date_part('month', p_data)::int,
    least(
      date_part('day', p_data)::int,
      -- último dia daquele mês naquele ano: protege 29/02 em ano comum
      date_part('day',
        (make_date(coalesce(p_ano, date_part('year', current_date)::int),
                   date_part('month', p_data)::int, 1) + interval '1 month - 1 day')
      )::int
    )
  );
$$;

comment on function public.proximo_aniversario(date, int) is
  'Data da efeméride no ano indicado (padrão: ano corrente). Usa dia e mês, não dia do ano — doy desloca em um dia quem tem data em ano bissexto depois de fevereiro.';

revoke execute on function public.proximo_aniversario(date, int) from public, anon;
grant  execute on function public.proximo_aniversario(date, int) to authenticated, service_role;

-- ── A view, com o dia certo e o pastorado amarrado à função ───────────────

create or replace view public.vw_agenda_pastoral as
 select 'aniversario'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_nascimento as data_origem,
    public.proximo_aniversario(m.data_nascimento) as proxima_data,
    date_part('year', age(current_date, m.data_nascimento))::int as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_nascimento is not null
    and m.tipo_pessoa = any (array['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa])
union all
 select 'casamento'::text as tipo,
    f.id::text as ref_id,
    null::uuid as pessoa_id,
    f.id as familia_id,
    coalesce((select string_agg(split_part(m2.nome_completo, ' '::text, 1), ' e '::text
                                order by vf.responsavel_familia desc, m2.nome_completo)
                from vinculos_familiares vf
                join membros m2 on m2.id = vf.membro_id
               where vf.familia_id = f.id
                 and vf.parentesco = any (array['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])
                 and m2.status = 'ativo'::membro_status),
             'Família '::text || f.nome_familia) as titulo,
    'Família '::text || f.nome_familia as subtitulo,
    f.data_casamento as data_origem,
    public.proximo_aniversario(f.data_casamento) as proxima_data,
    date_part('year', age(current_date, f.data_casamento))::int as anos_vai_completar,
    (select m3.telefone_celular
       from vinculos_familiares vf3
       join membros m3 on m3.id = vf3.membro_id
      where vf3.familia_id = f.id and vf3.responsavel_familia = true
      limit 1) as telefone,
    (select m4.telefone_celular
       from vinculos_familiares vf4
       join membros m4 on m4.id = vf4.membro_id
      where vf4.familia_id = f.id and vf4.responsavel_familia = false
        and vf4.parentesco = any (array['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])
      order by m4.nome_completo
      limit 1) as telefone_secundario
   from familias f
  where f.data_casamento is not null
union all
 select 'membresia'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_entrada as data_origem,
    public.proximo_aniversario(m.data_entrada) as proxima_data,
    date_part('year', age(current_date, m.data_entrada))::int as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_entrada is not null
    and m.tipo_pessoa = 'membro'::tipo_pessoa
union all
 select 'pastorado'::text as tipo,
    m.id::text as ref_id,
    m.id as pessoa_id,
    null::uuid as familia_id,
    m.nome_completo as titulo,
    m.nome_completo as subtitulo,
    m.data_consagracao_pastoral as data_origem,
    public.proximo_aniversario(m.data_consagracao_pastoral) as proxima_data,
    date_part('year', age(current_date, m.data_consagracao_pastoral))::int as anos_vai_completar,
    m.telefone_celular as telefone,
    null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_consagracao_pastoral is not null
    and m.funcao_ministerial = 'pastor'::funcao_ministerial;   -- o pedido: é da FUNÇÃO

-- ── A listagem, sem a terceira cópia da conta ─────────────────────────────
--
-- CREATE OR REPLACE (e não DROP + CREATE) para preservar os GRANTs: esta
-- função é SECURITY DEFINER e teve o EXECUTE revogado de `anon` na migração
-- 20260818050000. Recriar do zero devolveria o acesso anônimo em silêncio.
--
-- O `SET TimeZone` continua: sem ele, CURRENT_DATE aqui volta a ser a data em
-- UTC, e das 21h à meia-noite o lembrete de amanhã aparece como de hoje.

create or replace function public.agenda_pastoral_proximos_dias(p_dias integer default 7)
returns table(tipo text, ref_id text, pessoa_id uuid, familia_id uuid, titulo text,
              subtitulo text, data_evento date, anos_completar integer,
              dias_ate_evento integer, telefone text, telefone_secundario text)
language sql
stable
security definer
set search_path to 'public'
set "TimeZone" to 'America/Sao_Paulo'
as $function$
  with base as (
    select v.tipo, v.ref_id, v.pessoa_id, v.familia_id, v.titulo, v.subtitulo,
           v.data_origem, v.telefone, v.telefone_secundario,
           -- Este ano se ainda não passou; senão, o ano que vem.
           case
             when public.proximo_aniversario(v.data_origem) >= current_date
               then public.proximo_aniversario(v.data_origem)
             else public.proximo_aniversario(v.data_origem, date_part('year', current_date)::int + 1)
           end as data_evento
      from public.vw_agenda_pastoral v
  )
  select b.tipo, b.ref_id, b.pessoa_id, b.familia_id, b.titulo, b.subtitulo,
         b.data_evento,
         date_part('year', age(b.data_evento, b.data_origem))::int as anos_completar,
         (b.data_evento - current_date) as dias_ate_evento,
         b.telefone, b.telefone_secundario
    from base b
   where b.data_evento between current_date and current_date + p_dias
   order by b.data_evento, b.titulo;
$function$;
