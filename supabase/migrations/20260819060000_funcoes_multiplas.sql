-- ─── Uma pessoa, várias funções ────────────────────────────────────────────
--
-- `funcao_ministerial` guardava um valor só, e a igreja tem gente acumulando:
-- diácono que também é tesoureiro, pastor auxiliar que também é ministro.
-- Escolher uma função apagava a outra, em silêncio.
--
-- ── LISTA, E NÃO TABELA NOVA ──────────────────────────────────────────────
--
-- Decisão tomada com as três opções na mesa. Uma tabela `pessoa_funcoes` daria
-- datas próprias para cada função e o histórico de sucessão de graça — é a
-- modelagem certa para quem precisa disso. Não é o caso hoje, e a diretriz da
-- casa é não criar tabela enquanto o que existe responde.
--
-- ── O QUE ISSO CUSTA, DITO AGORA ──────────────────────────────────────────
--
-- As datas de consagração continuam exatas, porque cada uma pertence a um ato
-- específico e não a uma posição na lista:
--
--     data_consagracao_pastoral    é do pastorado
--     data_ordenacao_diaconal      é do diaconato
--
-- A VIGÊNCIA não. `funcao_inicio` e `funcao_fim` são um par só, e passam a
-- valer para a função PRINCIPAL. Quem acumular dois cargos de mandato — 1º
-- Tesoureiro de 2024 a 2026 e Líder de Área de 2025 a 2027 — vai ter as duas
-- datas descrevendo só o primeiro.
--
-- Hoje ninguém acumula dois cargos de mandato, então isso não mente sobre
-- ninguém. No dia em que alguém acumular, a tabela `pessoa_funcoes` deixa de
-- ser exagero e vira a resposta — e esta coluna é a semente da migração.
--
-- ── A FUNÇÃO PRINCIPAL É A PRIMEIRA DA LISTA ──────────────────────────────
--
-- `funcao_ministerial` continua existindo e passa a ser derivada: é sempre
-- `funcoes_ministeriais[1]`. Serve ao que precisa de UM valor — a coluna
-- Tipo/Função do catálogo, a ordenação daquela coluna — sem que ninguém
-- precise manter dois campos coerentes na mão.
--
-- A ORDEM da lista carrega o significado: quem monta a lista grava já
-- ordenada pela hierarquia de FUNCOES_EM_ORDEM (src/lib/funcaoMinisterial.ts),
-- do pastorado para a diretoria, da diretoria para o serviço. Assim o gatilho
-- não precisa conhecer a hierarquia — ela mora num lugar só, no TypeScript, e
-- não em duas listas que alguém teria de lembrar de sincronizar.

alter table public.membros
  add column if not exists funcoes_ministeriais funcao_ministerial[] not null default '{}';

comment on column public.membros.funcoes_ministeriais is
  'Funções da pessoa na igreja, em ordem de hierarquia. A primeira é a principal e alimenta funcao_ministerial. NÃO é acesso ao sistema — esse vive em user_roles.role.';

-- ── Backfill: o que já estava na coluna única vira lista de um item ───────
update public.membros
   set funcoes_ministeriais = array[funcao_ministerial]
 where funcao_ministerial is not null
   and cardinality(funcoes_ministeriais) = 0;

-- ── A principal acompanha a lista, sempre ─────────────────────────────────
create or replace function public.fn_funcao_principal()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Lista vazia quer dizer "sem função", que neste enum se escreve 'membro'.
  new.funcao_ministerial := coalesce(new.funcoes_ministeriais[1], 'membro'::funcao_ministerial);
  return new;
end;
$$;

drop trigger if exists trg_funcao_principal on public.membros;
create trigger trg_funcao_principal
  before insert or update of funcoes_ministeriais on public.membros
  for each row execute function public.fn_funcao_principal();

-- ── As duas views passam a olhar a lista inteira ──────────────────────────
--
-- `&&` é "as listas se cruzam". Sem isso, um pastor que também é diácono
-- entraria só pela função principal e sumiria do outro quadro — que é
-- exatamente o problema que esta migração existe para resolver.

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
   -- unnest: quem acumula dois cargos de diretoria aparece uma vez por cargo,
   -- que é o que uma lista de diretoria deve mostrar.
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
        'Líder de Área'::text, 20, 'area'::text, mi.nome
   from areas a
   join ministerios mi on mi.id = a.ministerio_id
   join membros m on m.id = a.lider_id
  where a.ativo = true and a.lider_id is not null
union all
 select m.id, m.nome_completo, m.foto_url,
        'Diácono'::text, 30, 'diacono'::text, null::text
   from membros m
  where m.status = 'ativo'::membro_status
    and m.funcoes_ministeriais && array['diacono']::funcao_ministerial[];

-- O lembrete de consagração vale para quem É pastor em qualquer posição da
-- lista — o presidente que também é pastor auxiliar não pode ficar de fora.
create or replace view public.vw_agenda_pastoral as
 select 'aniversario'::text as tipo,
    m.id::text as ref_id, m.id as pessoa_id, null::uuid as familia_id,
    m.nome_completo as titulo, m.nome_completo as subtitulo,
    m.data_nascimento as data_origem,
    public.proximo_aniversario(m.data_nascimento) as proxima_data,
    date_part('year', age(current_date, m.data_nascimento))::int as anos_vai_completar,
    m.telefone_celular as telefone, null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_nascimento is not null
    and m.tipo_pessoa = any (array['membro'::tipo_pessoa, 'congregado'::tipo_pessoa, 'visitante'::tipo_pessoa])
union all
 select 'casamento'::text as tipo,
    f.id::text as ref_id, null::uuid as pessoa_id, f.id as familia_id,
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
    (select m3.telefone_celular from vinculos_familiares vf3
       join membros m3 on m3.id = vf3.membro_id
      where vf3.familia_id = f.id and vf3.responsavel_familia = true limit 1) as telefone,
    (select m4.telefone_celular from vinculos_familiares vf4
       join membros m4 on m4.id = vf4.membro_id
      where vf4.familia_id = f.id and vf4.responsavel_familia = false
        and vf4.parentesco = any (array['pai_mae'::parentesco_tipo, 'conjuge'::parentesco_tipo])
      order by m4.nome_completo limit 1) as telefone_secundario
   from familias f
  where f.data_casamento is not null
union all
 select 'membresia'::text as tipo,
    m.id::text as ref_id, m.id as pessoa_id, null::uuid as familia_id,
    m.nome_completo as titulo, m.nome_completo as subtitulo,
    m.data_entrada as data_origem,
    public.proximo_aniversario(m.data_entrada) as proxima_data,
    date_part('year', age(current_date, m.data_entrada))::int as anos_vai_completar,
    m.telefone_celular as telefone, null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_entrada is not null
    and m.tipo_pessoa = 'membro'::tipo_pessoa
union all
 select 'pastorado'::text as tipo,
    m.id::text as ref_id, m.id as pessoa_id, null::uuid as familia_id,
    m.nome_completo as titulo, m.nome_completo as subtitulo,
    m.data_consagracao_pastoral as data_origem,
    public.proximo_aniversario(m.data_consagracao_pastoral) as proxima_data,
    date_part('year', age(current_date, m.data_consagracao_pastoral))::int as anos_vai_completar,
    m.telefone_celular as telefone, null::text as telefone_secundario
   from membros m
  where m.status = 'ativo'::membro_status
    and m.data_consagracao_pastoral is not null
    and m.funcoes_ministeriais && array['pastor','presidente','pastor_auxiliar','pastor_missionario']::funcao_ministerial[];
