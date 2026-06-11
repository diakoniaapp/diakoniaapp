-- ═══════════════════════════════════════════════════════════════════════════
-- PGM — FASE D — Dashboard + Resumo Geral
-- ═══════════════════════════════════════════════════════════════════════════

-- RPC: resumo geral pra o dashboard
create or replace function public.pgm_resumo_geral()
returns table (
  total_grupos       int,
  grupos_ativos      int,
  multiplicadores    int,
  total_membros      int,
  reunioes_semana    int,
  presenca_media_pct numeric,
  pedidos_ativos     int
)
language sql stable security definer set search_path = public as $$
  with sm as (
    select avg(percentual) as media
    from public.pgm_resumo_presenca('00000000-0000-0000-0000-000000000000'::uuid, 0)
    -- placeholder: vamos calcular real abaixo
  ),
  rs as (
    select
      r.id,
      (select count(*) from public.pgm_presencas p where p.reuniao_id = r.id) as total,
      (select count(*) from public.pgm_presencas p where p.reuniao_id = r.id and p.presente) as presentes
    from public.pgm_reunioes r
    where r.data >= current_date - interval '30 days'
  )
  select
    (select count(*) from public.pgm_grupos)::int,
    (select count(*) from public.pgm_grupos where ativo)::int,
    (select count(distinct grupo_pai_id) from public.pgm_grupos where grupo_pai_id is not null)::int,
    (select count(*) from public.pgm_membros where ativo)::int,
    (select count(*) from public.pgm_reunioes
      where data between (current_date - extract(dow from current_date)::int)
                     and (current_date - extract(dow from current_date)::int + 6))::int,
    coalesce((select round(avg(case when total = 0 then 0
                                    else 100.0 * presentes / total end), 0)
              from rs), 0),
    (select count(*) from public.pgm_pedidos_oracao where status = 'ativo')::int;
$$;

-- RPC: alunos próximos ao aniversário do grupo (próxima reunião)
-- (já temos rpc geral de aniversariantes — não precisa duplicar)

-- View: próxima reunião por grupo (calcula baseado no dia_semana)
create or replace view public.vw_pgm_proxima_reuniao as
select
  g.id as grupo_id, g.nome, g.dia_semana, g.horario, g.bairro,
  case
    when g.dia_semana is null then null
    else current_date + ((g.dia_semana - extract(dow from current_date)::int + 7) % 7)::int
  end as proxima_data
from public.pgm_grupos g
where g.ativo;
