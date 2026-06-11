-- ═══════════════════════════════════════════════════════════════════════════
-- PGM — Endereço inteligente (CEP, número, complemento, UF)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.pgm_grupos
  add column if not exists cep         text,
  add column if not exists numero      text,
  add column if not exists complemento text,
  add column if not exists uf          text;

-- Atualizar a view de resumo para incluir os novos campos
create or replace view public.vw_pgm_grupos_resumo as
select
  g.*,
  (select count(*) from public.pgm_membros m
    where m.grupo_id = g.id and m.ativo) as qtd_membros,
  (select count(*) from public.pgm_grupos f
    where f.grupo_pai_id = g.id and f.ativo) as qtd_filhos,
  m_lider.nome_completo  as lider_nome,
  m_colider.nome_completo as co_lider_nome,
  m_anfitri.nome_completo as anfitriao_nome
from public.pgm_grupos g
left join public.membros m_lider   on m_lider.id  = g.lider_id
left join public.membros m_colider on m_colider.id = g.co_lider_id
left join public.membros m_anfitri on m_anfitri.id = g.anfitriao_id;
