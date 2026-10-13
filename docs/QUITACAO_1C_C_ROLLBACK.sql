-- DESFAZER a Fase 1C-c (migration 20261015110000): devolve fin_enviar_malote (D6) e fin_fechar_periodo (Fase 6) e remove fin_quitacao_bloqueios.
-- Obrigações quitadas por terceiro que já foram carimbadas por um fechamento continuam carimbadas (travadas enquanto o período estiver fechado); reabrir o período as libera.
CREATE OR REPLACE FUNCTION public.fin_enviar_malote(p_ano int, p_mes int, p_dossies int DEFAULT 0, p_pendencias int DEFAULT 0, p_observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ini date; fim date; envio uuid; n int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar o envio do malote.';
  END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano NOT BETWEEN 2020 AND 2099 THEN RAISE EXCEPTION 'Período inválido: %/%.', p_mes, p_ano; END IF;
  ini := make_date(p_ano, p_mes, 1); fim := (ini + interval '1 month' - interval '1 day')::date;

  INSERT INTO public.fin_malote_envios (ano, mes, dossies, pendencias_documentos, observacao, enviado_por)
  VALUES (p_ano, p_mes, GREATEST(COALESCE(p_dossies, 0), 0), GREATEST(COALESCE(p_pendencias, 0), 0), p_observacao, (SELECT auth.uid()))
  RETURNING id INTO envio;

  -- as despesas do mês (a mesma regra do Pacote e do "Ciclo do mês": dia do pagamento, senão o vencimento) que estão PRONTAS neste instante
  INSERT INTO public.fin_malote_itens (envio_id, lancamento_id, obrigacao_id, ano, mes, valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, incluido_por)
  SELECT envio, l.id, COALESCE(l.obrigacao_id, l.id), p_ano, p_mes, l.valor, l.data, l.categoria_id, l.centro_custo_id, l.fornecedor_id, l.pessoa_id, (SELECT auth.uid())
    FROM public.vw_fin_ciclo v
    JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
   WHERE v.estado = 'pronta_para_malote'
     AND ((l.data_pagamento BETWEEN ini AND fim) OR (l.data_pagamento IS NULL AND l.data BETWEEN ini AND fim))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.fin_malote_envios SET despesas = n WHERE id = envio;
  RETURN envio;
END
$fn$;

create or replace function public.fin_fechar_periodo(p_fechamento_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_fech record;
  v_data_inicio date;
  v_data_fim date;
  v_saldo_inicial numeric(14,2);
  v_movimento numeric(14,2);
begin
  select * into v_fech from public.fin_fechamentos_periodo where id = p_fechamento_id;
  if not found then raise exception 'Fechamento não encontrado'; end if;
  if v_fech.status not in ('aberto', 'em_revisao') then
    raise exception 'Período já está %', v_fech.status;
  end if;

  v_data_inicio := make_date(v_fech.ano_inicio, v_fech.mes_inicio, 1);
  v_data_fim := (v_data_inicio + (v_fech.qtd_meses || ' months')::interval - interval '1 day')::date;

  update public.fin_lancamentos
    set fechamento_id = p_fechamento_id
    where data between v_data_inicio and v_data_fim
      and status in ('realizado', 'conciliado')
      and fechamento_id is null;

  select coalesce(sum(saldo_inicial), 0) into v_saldo_inicial from public.fin_contas;
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0) into v_movimento
    from public.fin_lancamentos
    where data <= v_data_fim and status in ('realizado', 'conciliado');

  update public.fin_fechamentos_periodo
    set status = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
        saldo_final = v_saldo_inicial + v_movimento
    where id = p_fechamento_id;
end;
$$;


DROP FUNCTION IF EXISTS public.fin_quitacao_bloqueios(date, date);
