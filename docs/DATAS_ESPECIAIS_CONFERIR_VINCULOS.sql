-- Datas Especiais — conferir os vínculos da Identidade ANTES de publicar
-- 22/10/2026 · só leitura, não altera nada.
--
-- Desde esta versão, as datas denominacionais só aparecem na Agenda se a igreja
-- estiver VINCULADA à instituição na Identidade da Igreja (CBB liga as 38 datas
-- da CBB; JMM e JMN ligam as delas). Se a QIBRJ não tiver o vínculo com a CBB
-- gravado, as datas da CBB SOMEM da Agenda ao publicar.
--
-- O esperado: uma linha com sigla CBB e vinculada = true.
-- A sigla precisa ser exatamente "CBB" (maiúsculas/espaços não importam).

select i.nome,
       i.sigla,
       i.ativo,
       (ii.igreja_id is not null) as vinculada
from public.instituicoes i
left join public.igreja_instituicoes ii
       on ii.instituicao_id = i.id
      and ii.igreja_id = (select id from public.identidade_igreja where ativa limit 1)
where upper(trim(coalesce(i.sigla, ''))) in ('CBB', 'JMM', 'JMN', 'CBERJ')
order by i.sigla;

-- E a data de fundação, para o aniversário da igreja (categoria Institucionais):
select nome_igreja, fundada_em from public.identidade_igreja where ativa;
