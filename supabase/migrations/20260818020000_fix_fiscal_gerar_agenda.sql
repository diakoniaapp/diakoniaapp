-- ---------------------------------------------------------------------------
-- fiscal_gerar_agenda: corrige ambiguidade que impedia gerar a agenda fiscal
-- ---------------------------------------------------------------------------
--
-- SINTOMA
--
-- A igreja tem 7 obrigacoes fiscais ativas e a tabela fiscal_agenda esta
-- vazia. Por isso o widget "Agenda fiscal" anuncia "Tudo em ordem -- nada
-- fiscal pendente" todo dia: nao ha nada agendado para vencer, porque nunca
-- foi possivel agendar.
--
-- CAUSA
--
-- A funcao declara RETURNS TABLE(codigo, competencia, vencimento, novo), e
-- esses nomes viram variaveis de saida. No INSERT:
--
--     on conflict (codigo_obrigacao, competencia) do nothing
--
-- "competencia" e ao mesmo tempo a variavel de saida e a coluna da tabela. O
-- Postgres recusa:
--
--     ERROR 42702: column reference "competencia" is ambiguous
--
-- A funcao falha na primeira iteracao do laco, sempre. Nunca gerou uma linha.
--
-- CORRECAO
--
-- Troca ON CONFLICT por WHERE NOT EXISTS com a tabela apelidada. Toda
-- referencia a coluna passa a ser qualificada (fa.competencia), e some a
-- ambiguidade sem mexer na assinatura -- os nomes das colunas devolvidas
-- continuam os mesmos, entao nenhum chamador precisa mudar.
--
-- O resto do corpo esta reproduzido sem alteracao.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fiscal_gerar_agenda(p_inicio date, p_fim date)
 RETURNS TABLE(codigo text, competencia date, vencimento date, novo boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $fn$
declare
  v_obrig record;
  v_mes date;
  v_vencimento date;
  v_dia smallint;
  v_inseriu boolean;
begin
  for v_obrig in
    select t.*, coalesce(a.dia_vencimento_custom, t.dia_vencimento) as dia_efetivo
    from fiscal_tipos_obrigacao t
    join fiscal_obrigacoes_ativas a on a.codigo_obrigacao = t.codigo
    where a.ativa = true
      and (t.requer_funcionarios = false
           or (select possui_funcionarios from fiscal_config where id = 1))
  loop
    if v_obrig.periodicidade = 'mensal' then
      v_mes := date_trunc('month', p_inicio)::date;
      while v_mes <= p_fim loop
        v_dia := coalesce(v_obrig.dia_efetivo, 15);
        v_vencimento := make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, v_dia);
        -- vencimento e sempre no mes SEGUINTE a competencia (regime padrao)
        v_vencimento := v_vencimento + interval '1 month';
        -- ajuste para dia util seguinte se cair em fim de semana
        while extract(dow from v_vencimento) in (0,6) loop
          v_vencimento := v_vencimento + interval '1 day';
        end loop;

        insert into fiscal_agenda(codigo_obrigacao, competencia, vencimento)
        select v_obrig.codigo, v_mes, v_vencimento
         where not exists (
           select 1 from fiscal_agenda fa
            where fa.codigo_obrigacao = v_obrig.codigo
              and fa.competencia      = v_mes
         );
        v_inseriu := found;

        codigo := v_obrig.codigo;
        competencia := v_mes;
        vencimento := v_vencimento;
        novo := v_inseriu;
        return next;

        v_mes := (v_mes + interval '1 month')::date;
      end loop;

    elsif v_obrig.periodicidade = 'anual' then
      for v_dia in extract(year from p_inicio)::int .. extract(year from p_fim)::int loop
        -- DIRF: ultimo dia util de fevereiro do ano subsequente
        v_vencimento := make_date(v_dia, coalesce(v_obrig.mes_anual, 2)::int, 28);
        while extract(dow from v_vencimento) in (0,6) loop
          v_vencimento := v_vencimento - interval '1 day';
        end loop;
        v_mes := make_date(v_dia - 1, 1, 1);  -- competencia = ano anterior

        insert into fiscal_agenda(codigo_obrigacao, competencia, vencimento)
        select v_obrig.codigo, v_mes, v_vencimento
         where not exists (
           select 1 from fiscal_agenda fa
            where fa.codigo_obrigacao = v_obrig.codigo
              and fa.competencia      = v_mes
         );
        v_inseriu := found;

        codigo := v_obrig.codigo;
        competencia := v_mes;
        vencimento := v_vencimento;
        novo := v_inseriu;
        return next;
      end loop;
    end if;
  end loop;
end;
$fn$;
