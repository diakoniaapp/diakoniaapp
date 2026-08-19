-- ─── O conselho, lido de onde a igreja preenche ────────────────────────────
--
-- Três defeitos na mesma view, todos visíveis na tela:
--
-- 1. ACENTOS QUEBRADOS
--
--    Os rótulos estavam gravados com bytes inválidos DENTRO da definição da
--    view — alguém criou o objeto com a codificação errada e o erro ficou
--    congelado ali. A tela mostrava, para todo mundo:
--
--        "L?der de Minist?rio"   (23 bytes para 19 caracteres)
--        "L?der de ?rea"
--        "Di?cono"
--
--    Não era problema de fonte nem de navegador: estava no banco.
--
-- 2. A DIRETORIA VINHA DE UMA TABELA VAZIA
--
--    O primeiro ramo lia `pessoa_cargo_estatutario`, que tem zero linhas. O
--    conselho aparecia com 21 participantes e NENHUM da diretoria — o
--    presidente da igreja não constava do conselho dela.
--
--    Agora vem de `membros.funcao_ministerial`, como o organograma e o
--    regimento passaram a vir. Uma verdade só.
--
-- 3. DIÁCONO VINHA DE OUTRO LUGAR AINDA
--
--    O último ramo lia `pessoa_participacao` com `funcao = 'diacono'` — texto
--    livre numa terceira tabela. Hoje diácono é valor do enum na ficha, e são
--    três: Ana Paula, Erivaldo e Gilberto. Nenhum aparecia.
--
-- ── O QUE O CONSELHO É ────────────────────────────────────────────────────
--
-- Não há cadastro de conselho, e é assim de propósito: o assento é
-- consequência do cargo. Quem lidera um ministério está no conselho enquanto
-- liderar; quem sai do cargo sai do conselho no mesmo instante, sem ninguém
-- precisar lembrar de apagar uma linha.

create or replace view public.v_conselho_da_igreja as
-- Diretoria: quem tem função de diretoria na ficha.
 select m.id as pessoa_id,
        m.nome_completo,
        m.foto_url,
        case m.funcao_ministerial
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
        case m.funcao_ministerial
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
  where m.status = 'ativo'::membro_status
    and m.funcao_ministerial in (
      'presidente','vice_presidente_1','vice_presidente_2',
      'secretaria_1','secretaria_2','secretario',
      'tesoureiro_1','tesoureiro_2','tesoureiro','auditor'
    )
union all
-- Líderes de ministério.
 select m.id, m.nome_completo, m.foto_url,
        'Líder de Ministério'::text, 10,
        'ministerio'::text, mi.nome
   from ministerios mi
   join membros m on m.id = mi.lider_id
  where mi.ativo = true and mi.lider_id is not null
union all
-- Líderes de área.
 select m.id, m.nome_completo, m.foto_url,
        'Líder de Área'::text, 20,
        'area'::text, mi.nome
   from areas a
   join ministerios mi on mi.id = a.ministerio_id
   join membros m on m.id = a.lider_id
  where a.ativo = true and a.lider_id is not null
union all
-- Diáconos, agora da ficha e não de `pessoa_participacao`.
 select m.id, m.nome_completo, m.foto_url,
        'Diácono'::text, 30,
        'diacono'::text, null::text
   from membros m
  where m.status = 'ativo'::membro_status
    and m.funcao_ministerial = 'diacono'::funcao_ministerial;
