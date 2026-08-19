-- ─── A lista de funções da igreja, como ela é de fato ──────────────────────
--
-- A lista antiga era genérica de manual de eclesiologia: lider, tesoureiro,
-- secretario, evangelista, missionario, diacono, presbitero, coordenador,
-- obreiro. A lista real desta igreja distingue o que aquela não distinguia —
-- pastor auxiliar de missionário, 1º de 2º tesoureiro — e não usa metade do
-- resto.
--
-- (O primeiro da lista nasceu aqui como "Pastor Titular" e virou "Presidente"
--  na migração seguinte, 20260819020000.)
--
--   Presidente · Pastor Auxiliar · Pastor Missionário · Pastor · Diácono
--   1º e 2º Vice Presidente · 1º e 2º Tesoureiro · 1ª e 2ª Secretária
--   Ministro(a) · Líder de Área · Professor(a) de EBD · Voluntário · Membro
--
-- ── POR QUE ADICIONAR, E NÃO RECRIAR O TIPO ───────────────────────────────
--
-- PostgreSQL não remove valor de enum; só recriando o tipo. Recriar exigiria
-- reescrever duas views que dependem dele (v_membros_perfil, vw_agenda_pastoral)
-- e converter a coluna — tudo isso para apagar rótulos que doze pessoas já
-- estão usando.
--
-- Os valores aposentados ficam no tipo e somem da lista de escolha, no
-- TypeScript. É o padrão que este repositório já usa em ROLE_LABEL, onde
-- "diakonia" é lido como Pastor mas não é oferecido. Dado antigo continua
-- legível; ninguém escolhe o que saiu.
--
-- ── O QUE FOI MIGRADO, E O QUE NÃO FOI ────────────────────────────────────
--
-- Só o inequívoco:
--
--   lider → lider_area          Adriana Da Penha (1 pessoa)
--
-- NÃO migrado, de propósito:
--
--   tesoureiro   Breno Da Silva Dambacher e Bruno Sepulvida do Amaral
--                São dois, e a lista nova tem 1º e 2º. Chutar quem é o
--                primeiro seria inventar um fato sobre a diretoria.
--   secretario   Lourdes Beatriz Rodrigues Ramos — mesma dúvida, 1ª ou 2ª.
-- Os dois rótulos continuam aparecendo corretamente na tela para essas três
-- pessoas. Só não podem ser escolhidos em cadastro novo, até haver decisão.
--
-- (Diácono chegou a ficar de fora e voltou à lista no mesmo dia, com a data de
--  ordenação diaconal. Ana Paula, Erivaldo e Gilberto seguem como diáconos.)
--
-- ── E O LEMBRETE DE ORDENAÇÃO ─────────────────────────────────────────────
--
-- A view filtrava `funcao_ministerial = 'pastor'`. Com quatro variantes de
-- pastor, três delas ficariam sem lembrete — inclusive quem preside. Passa a
-- valer para as quatro.

-- ── 1. o que dá para migrar sem inventar ─────────────────────────────────
update public.membros
   set funcao_ministerial = 'lider_area'
 where funcao_ministerial = 'lider';

-- ── 2. o lembrete de consagração vale para todo pastor ───────────────────
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
    -- As quatro variantes, e não só 'pastor': o titular é justamente quem
    -- não pode ficar sem o lembrete da própria consagração.
    and m.funcao_ministerial in (
      'pastor'::funcao_ministerial,
      'presidente'::funcao_ministerial,
      'pastor_auxiliar'::funcao_ministerial,
      'pastor_missionario'::funcao_ministerial
    );
