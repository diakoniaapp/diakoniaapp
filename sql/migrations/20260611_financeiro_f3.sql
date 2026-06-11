-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE 3 — Recorrências + Contas a Pagar/Receber
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type fin_frequencia as enum ('mensal','bimestral','trimestral','semestral','anual');
exception when duplicate_object then null; end $$;

create table if not exists public.fin_recorrencias (
  id              uuid primary key default gen_random_uuid(),
  descricao       text not null,
  tipo            fin_movimento_tipo not null,
  valor           numeric(14,2) not null check (valor > 0),
  valor_variavel  boolean not null default false,   -- ex: energia varia mês a mês
  conta_id        uuid not null references public.fin_contas(id) on delete restrict,
  categoria_id    uuid references public.fin_categorias(id) on delete set null,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  fornecedor_id   uuid references public.fin_fornecedores(id) on delete set null,
  frequencia      fin_frequencia not null default 'mensal',
  dia_vencimento  smallint not null check (dia_vencimento between 1 and 31),
  data_inicio     date not null default current_date,
  data_fim        date,
  ativo           boolean not null default true,
  ajusta_dia_util boolean not null default false,
  lembrar_5d      boolean not null default true,
  lembrar_1d      boolean not null default true,
  lembrar_dia     boolean not null default true,
  ultimo_gerado_ate date,                            -- até onde já criou lançamentos previstos
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_fin_rec_ativo on public.fin_recorrencias(ativo);
create index if not exists idx_fin_rec_conta on public.fin_recorrencias(conta_id);

drop trigger if exists fin_rec_touch on public.fin_recorrencias;
create trigger fin_rec_touch before update on public.fin_recorrencias
  for each row execute function public.touch_fin_updated_at();

-- ─── Helper: calcula próxima data dada a frequência ─────────────────────
create or replace function public.fin_calc_proxima_data(
  p_ultima date, p_dia int, p_freq fin_frequencia
) returns date language plpgsql immutable as $$
declare
  v_meses int;
  v_proximo_mes_inicio date;
  v_dia_max int;
begin
  v_meses := case p_freq
    when 'mensal'     then 1
    when 'bimestral'  then 2
    when 'trimestral' then 3
    when 'semestral'  then 6
    when 'anual'      then 12
    else 1
  end;
  -- 1º dia do mês alvo
  v_proximo_mes_inicio := (date_trunc('month', p_ultima) + (v_meses || ' month')::interval)::date;
  -- último dia do mês alvo
  v_dia_max := extract(day from (date_trunc('month', v_proximo_mes_inicio) + interval '1 month - 1 day'));
  return v_proximo_mes_inicio + (least(p_dia, v_dia_max) - 1);
end;$$;

-- ─── RPC: gera lançamentos previstos pros próximos N meses ──────────────
create or replace function public.fin_gerar_recorrencias(
  p_ate_data date default null,
  p_recorrencia_id uuid default null
)
returns int
language plpgsql security definer set search_path = public as $$
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
        valor, descricao, origem, data_competencia
      ) values (
        v_data, v_recorrencia.tipo, 'previsto', v_recorrencia.conta_id,
        v_recorrencia.categoria_id, v_recorrencia.centro_custo_id, v_recorrencia.fornecedor_id,
        v_recorrencia.valor, v_recorrencia.descricao, 'recorrencia',
        date_trunc('month', v_data)::date
      );
      v_count := v_count + 1;
      update public.fin_recorrencias set ultimo_gerado_ate = v_data where id = v_recorrencia.id;
      v_data := public.fin_calc_proxima_data(v_data, v_recorrencia.dia_vencimento, v_recorrencia.frequencia);
    end loop;
  end loop;

  return v_count;
end;$$;

-- ─── RLS ────────────────────────────────────────────────────────────────
alter table public.fin_recorrencias enable row level security;
drop policy if exists "fin_rec_all" on public.fin_recorrencias;
create policy "fin_rec_all" on public.fin_recorrencias for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─── View: próximos vencimentos (lançamentos previstos com info extra) ──
create or replace view public.vw_fin_proximos_vencimentos as
select
  l.id, l.data, l.tipo, l.status, l.valor, l.descricao,
  l.conta_id, c.nome as conta_nome,
  l.categoria_id, k.nome as categoria_nome, k.cor as categoria_cor,
  l.fornecedor_id, f.nome as fornecedor_nome,
  (l.data - current_date)::int as dias_para_vencer,
  case
    when l.data < current_date then 'vencido'
    when l.data = current_date then 'vence_hoje'
    when l.data <= current_date + interval '3 days' then 'urgente'
    when l.data <= current_date + interval '7 days' then 'esta_semana'
    else 'futuro'
  end as urgencia
from public.fin_lancamentos l
left join public.fin_contas c on c.id = l.conta_id
left join public.fin_categorias k on k.id = l.categoria_id
left join public.fin_fornecedores f on f.id = l.fornecedor_id
where l.status = 'previsto';
