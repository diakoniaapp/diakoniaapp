-- ─── O rótulo diz a área, e não o ministério ───────────────────────────────
--
-- Telma Rodrigues de Souza aparecia DUAS VEZES no conselho, com o mesmo texto:
--
--     Telma Rodrigues de Souza · Líder de Área · Administração
--     Telma Rodrigues de Souza · Líder de Área · Administração
--
-- Ela lidera o Bazar E o Apoio Adm, as duas do ministério de Administração. As
-- linhas estavam certas — são dois assentos, por dois cargos —, mas o rótulo
-- mostrava o ministério e não distinguia uma da outra. Lido de fora, parecia
-- registro duplicado.
--
-- O contexto de um líder de área é a ÁREA. Do líder de ministério continua
-- sendo o ministério, porque é o que ele lidera.
--
-- A coluna passa a se chamar `contexto`, e não `ministerio_nome`: com nome de
-- ministério guardando nome de área, o próximo a ler esta view teria de
-- descobrir sozinho que o nome mente.

drop view if exists public.v_conselho_da_igreja;

create view public.v_conselho_da_igreja as
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
        null::text as contexto
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
 -- Área, e não ministério: é o que distingue o Bazar do Apoio Adm.
 select m.id, m.nome_completo, m.foto_url,
        'Líder de Área'::text, 20, 'area'::text, a.nome
   from areas a
   join membros m on m.id = a.lider_id
  where a.ativo = true and a.lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Co-líder de Área'::text, 21, 'area'::text, a.nome
   from areas a
   join membros m on m.id = a.co_lider_id
  where a.ativo = true and a.co_lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Diácono'::text, 30, 'diacono'::text, null::text
   from membros m
  where m.status = 'ativo'::membro_status
    and m.funcoes_ministeriais && array['diacono']::funcao_ministerial[];
