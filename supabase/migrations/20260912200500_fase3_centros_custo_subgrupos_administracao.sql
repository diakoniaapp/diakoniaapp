-- ─── Fase 3 (2/2): os 5 subgrupos contábeis de Ministério de Administração ──
--
-- docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §3.2. Depende da migration
-- anterior (20260912200000) já ter commitado o valor 'subgrupo_administracao'
-- do enum fin_centro_vinculo — por isso é um arquivo separado.
--
-- Reaproveita centro_pai_id, que já existe em fin_centros_custo desde a
-- Fase 7 do Financeiro — nenhuma coluna nova. Nomeados exatamente como na
-- planilha real (Pessoal · Serviços · Ornamentação · Consumo · Patrimônio),
-- prefixados "Administração ·" para bater com o padrão dos filhos que já
-- existem (ex. "Administração · Bazar").

-- "Administração · Ornamentação" JÁ EXISTE como área (vinculo_tipo='area',
-- seed da Fase 7) — mesmo nome do subgrupo contábil por coincidência (ver
-- comentário no topo deste arquivo). O guard `not exists` abaixo por nome
-- pegou essa colisão no ensaio e descartou a linha em silêncio; por isso o
-- subgrupo de Ornamentação leva um sufixo que o distingue na lista.
insert into public.fin_centros_custo (nome, vinculo_tipo, centro_pai_id, descricao)
select v.nome, 'subgrupo_administracao'::public.fin_centro_vinculo, m.id, v.descricao
from (values
  ('Administração · Pessoal',      'Subgrupo contábil — folha, encargos e benefícios da Administração.'),
  ('Administração · Serviços',     'Subgrupo contábil — serviços prestados (PF/PJ) contratados pela Administração.'),
  ('Administração · Ornamentação (subgrupo contábil)', 'Subgrupo contábil do Plano de Contas Oficial — não confundir com a área "Administração · Ornamentação" (quem faz o trabalho); este é como o gasto se classifica.'),
  ('Administração · Consumo',      'Subgrupo contábil — material de consumo e operacional da Administração.'),
  ('Administração · Patrimônio',   'Subgrupo contábil — manutenção de imobilizado e patrimônio da Administração.')
) as v(nome, descricao)
cross join (
  select id from public.fin_centros_custo
  where vinculo_tipo = 'ministerio' and vinculo_nome = 'Administração' limit 1
) as m
where not exists (
  select 1 from public.fin_centros_custo existing where existing.nome = v.nome
);
