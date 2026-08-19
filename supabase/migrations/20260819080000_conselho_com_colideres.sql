-- ─── Co-líder também lidera ────────────────────────────────────────────────
--
-- A view do conselho lia `lider_id` e ignorava `co_lider_id` e `vice_lider_id`.
-- Cinco pessoas ficavam de fora, embora estejam nomeadas no cadastro:
--
--   Bazar                            Telma Rodrigues  · co-líder Patricia Oliveira
--   Feira Missionária                Patrick Gayer    · co-líder Laura Dantas
--   Juventude                        Ulisses Pires    · co-líder Helena Silva
--   Palestrante                      Sidney Vieira    · co-líder Ana Cristina Vilela
--   Pequenos Grupos Multiplicadores  Daniel Alves     · co-líder Telma Rodrigues
--
-- Não é detalhe de exibição: se o conselho é composto por quem lidera, quem
-- co-lidera lidera. A pessoa estava cadastrada, a coluna existia, e a
-- composição do conselho saía errada por causa de um JOIN que faltava.
--
-- Vice-líder de ministério entra pelo mesmo motivo, embora hoje não haja
-- nenhum: a coluna existe e o dia em que alguém for nomeado é o dia em que
-- ninguém vai lembrar de mexer nesta view.
--
-- Os níveis ficam logo abaixo do titular — 11 para vice de ministério, 21 para
-- co-líder de área —, o que os agrupa junto na ordenação sem confundir com
-- quem responde pela área.

create or replace view public.v_conselho_da_igreja as
 select m.id as pessoa_id, m.nome_completo, m.foto_url,
        case f
          when 'presidente'        then 'Presidente'
          when 'vice_presidente_1' then '1º Vice Presidente'
          when 'vice_presidente_2' then '2º Vice Presidente'
          when 'secretaria_1'      then '1ª Secretária'
          when 'secretaria_2'      then '2ª Secretária'
          when 'secretario'        then 'Secretário'
          when 'tesoureiro_1'      then '1º Tesoureiro'
          when 'tesoureiro_2'      then '2º Tesoureiro'
          when 'tesoureiro'        then 'Tesoureiro'
          when 'auditor'           then 'Auditor(a)'
        end as cargo,
        case f
          when 'presidente'        then 1
          when 'vice_presidente_1' then 2
          when 'vice_presidente_2' then 2
          when 'secretaria_1'      then 3
          when 'secretaria_2'      then 3
          when 'secretario'        then 3
          when 'tesoureiro_1'      then 4
          when 'tesoureiro_2'      then 4
          when 'tesoureiro'        then 4
          when 'auditor'           then 5
        end as nivel_cargo,
        'diretoria'::text as tipo_participacao,
        null::text as ministerio_nome
   from membros m
   cross join lateral unnest(m.funcoes_ministeriais) as f
  where m.status = 'ativo'::membro_status
    and f in ('presidente','vice_presidente_1','vice_presidente_2',
              'secretaria_1','secretaria_2','secretario',
              'tesoureiro_1','tesoureiro_2','tesoureiro','auditor')
union all
 select m.id, m.nome_completo, m.foto_url,
        'Líder de Ministério'::text, 10, 'ministerio'::text, mi.nome
   from ministerios mi
   join membros m on m.id = mi.lider_id
  where mi.ativo = true and mi.lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Vice-líder de Ministério'::text, 11, 'ministerio'::text, mi.nome
   from ministerios mi
   join membros m on m.id = mi.vice_lider_id
  where mi.ativo = true and mi.vice_lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Líder de Área'::text, 20, 'area'::text, mi.nome
   from areas a
   join ministerios mi on mi.id = a.ministerio_id
   join membros m on m.id = a.lider_id
  where a.ativo = true and a.lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Co-líder de Área'::text, 21, 'area'::text, mi.nome
   from areas a
   join ministerios mi on mi.id = a.ministerio_id
   join membros m on m.id = a.co_lider_id
  where a.ativo = true and a.co_lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Diácono'::text, 30, 'diacono'::text, null::text
   from membros m
  where m.status = 'ativo'::membro_status
    and m.funcoes_ministeriais && array['diacono']::funcao_ministerial[];
