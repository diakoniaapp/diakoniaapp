-- ─── Forma de liquidação: débito automático como fluxo próprio ───────────────────
--
-- Pedido da Telma (06/10/2026): hoje toda recorrência vira "conta para pagar", e a tesouraria
-- abre o item e o marca pago. Na rotina real muita despesa (plano de saúde, seguro, consórcio)
-- é debitada sozinha pelo banco: o trabalho é ACOMPANHAR, CONCILIAR e CONFERIR depois.
--
-- MEDIDO antes de escrever (06/10/2026, produção): 10 recorrências ativas, 111 lançamentos
-- previstos de saída — nenhum com marca de como será liquidado. `fin_recorrencias.valor_variavel`
-- JÁ existia (a tela tem o checkbox "valor varia mês a mês"); `fin_lancamentos` não tinha nada
-- equivalente e `fin_gerar_recorrencias` não copiava nem isso.
--
-- O que muda:
--   1. `fin_recorrencias.forma_liquidacao` e `fin_lancamentos.forma_liquidacao`
--      (manual | boleto_fatura | debito_automatico | pix_recorrente | transferencia_programada),
--      default 'manual' — nada que já existe muda de comportamento.
--   2. `fin_lancamentos.valor_variavel` — o previsto de uma conta variável (energia, água) é só
--      uma estimativa; a importação do extrato precisa saber disso para aceitar a diferença.
--   3. `fin_gerar_recorrencias` passa a copiar as duas marcas para cada previsto gerado.
--      Corpo = o da baseline (supabase/baseline/schema.sql), só com as colunas novas no INSERT.
--   4. `vw_fin_proximos_vencimentos` expõe as duas (colunas novas só no FIM — §6.3 do CLAUDE.md).
--
-- Alternativa descartada: guardar o vínculo lançamento → recorrência (FK). Seria o desenho mais
-- limpo, mas os 111 previstos de hoje não têm esse vínculo e um backfill por descrição é frágil;
-- copiar a marca para o lançamento funciona para os antigos (a tela propaga a mudança) e para os
-- novos (o gerador copia).

ALTER TABLE public.fin_recorrencias
  ADD COLUMN IF NOT EXISTS forma_liquidacao text NOT NULL DEFAULT 'manual';
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS forma_liquidacao text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS valor_variavel boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_recorrencias_forma_liquidacao_check') THEN
    ALTER TABLE public.fin_recorrencias ADD CONSTRAINT fin_recorrencias_forma_liquidacao_check
      CHECK (forma_liquidacao IN ('manual','boleto_fatura','debito_automatico','pix_recorrente','transferencia_programada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_forma_liquidacao_check') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_forma_liquidacao_check
      CHECK (forma_liquidacao IN ('manual','boleto_fatura','debito_automatico','pix_recorrente','transferencia_programada'));
  END IF;
END $$;

-- índice parcial: "débitos automáticos do mês" lê só o que NÃO é manual
CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_liquidacao_automatica
  ON public.fin_lancamentos (data)
  WHERE forma_liquidacao <> 'manual';

CREATE OR REPLACE FUNCTION public.fin_gerar_recorrencias(p_ate_data date DEFAULT NULL::date, p_recorrencia_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_recorrencia record;
  v_ate date := coalesce(p_ate_data, current_date + interval '90 days');
  v_data date;
  v_count int := 0;
begin
  for v_recorrencia in
    select * from public.fin_recorrencias
    where ativo
      and (p_recorrencia_id is null or id = p_recorrencia_id)
  loop
    -- ponto de partida
    if v_recorrencia.ultimo_gerado_ate is null then
      -- primeira vez: começa do mês corrente
      v_data := date_trunc('month', current_date)::date +
                (least(v_recorrencia.dia_vencimento,
                       extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int) - 1);
      -- Se a data já passou, pula pra próxima
      if v_data < current_date then
        v_data := public.fin_calc_proxima_data(v_data, v_recorrencia.dia_vencimento, v_recorrencia.frequencia);
      end if;
    else
      v_data := public.fin_calc_proxima_data(v_recorrencia.ultimo_gerado_ate, v_recorrencia.dia_vencimento, v_recorrencia.frequencia);
    end if;

    -- gera enquanto não passa do limite e da data_fim (se houver)
    while v_data <= v_ate and (v_recorrencia.data_fim is null or v_data <= v_recorrencia.data_fim) loop
      insert into public.fin_lancamentos(
        data, tipo, status, conta_id, categoria_id, centro_custo_id, fornecedor_id,
        valor, descricao, origem, data_competencia, forma_liquidacao, valor_variavel
      ) values (
        v_data, v_recorrencia.tipo, 'previsto', v_recorrencia.conta_id,
        v_recorrencia.categoria_id, v_recorrencia.centro_custo_id, v_recorrencia.fornecedor_id,
        v_recorrencia.valor, v_recorrencia.descricao, 'recorrencia',
        date_trunc('month', v_data)::date, v_recorrencia.forma_liquidacao, v_recorrencia.valor_variavel
      );
      v_count := v_count + 1;
      update public.fin_recorrencias set ultimo_gerado_ate = v_data where id = v_recorrencia.id;
      v_data := public.fin_calc_proxima_data(v_data, v_recorrencia.dia_vencimento, v_recorrencia.frequencia);
    end loop;
  end loop;

  return v_count;
end;$function$;

CREATE OR REPLACE VIEW public.vw_fin_proximos_vencimentos AS
 SELECT l.id,
    l.data,
    l.tipo,
    l.status,
    l.valor,
    l.descricao,
    l.conta_id,
    c.nome AS conta_nome,
    l.categoria_id,
    k.nome AS categoria_nome,
    k.cor AS categoria_cor,
    l.fornecedor_id,
    f.nome AS fornecedor_nome,
    l.data - CURRENT_DATE AS dias_para_vencer,
        CASE
            WHEN l.data < CURRENT_DATE THEN 'vencido'::text
            WHEN l.data = CURRENT_DATE THEN 'vence_hoje'::text
            WHEN l.data <= (CURRENT_DATE + '3 days'::interval) THEN 'urgente'::text
            WHEN l.data <= (CURRENT_DATE + '7 days'::interval) THEN 'esta_semana'::text
            ELSE 'futuro'::text
        END AS urgencia,
    l.projeto_id,
    p.nome AS projeto_nome,
    l.centro_custo_id,
    cc.nome AS centro_custo_nome,
    l.forma_liquidacao,
    l.valor_variavel
   FROM fin_lancamentos l
     LEFT JOIN fin_contas c ON c.id = l.conta_id
     LEFT JOIN fin_categorias k ON k.id = l.categoria_id
     LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
     LEFT JOIN fin_projetos p ON p.id = l.projeto_id
     LEFT JOIN fin_centros_custo cc ON cc.id = l.centro_custo_id
  WHERE l.status = 'previsto'::fin_lancamento_status;
