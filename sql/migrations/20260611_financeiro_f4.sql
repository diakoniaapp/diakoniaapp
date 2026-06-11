-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA FINANCEIRO — FASE 4 — Estoque Inteligente + Compras Recorrentes
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin
  create type fin_estoque_movimento_tipo as enum ('entrada','saida','ajuste');
exception when duplicate_object then null; end $$;

-- ─── 1) Itens de estoque ──────────────────────────────────────────────────
create table if not exists public.fin_estoque_itens (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,
  unidade         text not null default 'un',          -- un, kg, L, m, cx, pacote
  categoria       text,                                -- "limpeza", "escritorio", "som", "alimentacao", etc.
  estoque_atual   numeric(14,3) not null default 0,
  estoque_minimo  numeric(14,3) not null default 0,
  ponto_pedido    numeric(14,3),                       -- opcional: quando atingir, sugere comprar
  custo_medio     numeric(14,2),                       -- calculado conforme entradas
  fornecedor_padrao_id uuid references public.fin_fornecedores(id) on delete set null,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete set null,
  imagem_url      text,
  ativo           boolean not null default true,
  observacao      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_fin_est_itens_ativo on public.fin_estoque_itens(ativo);
create index if not exists idx_fin_est_itens_cat   on public.fin_estoque_itens(lower(categoria));

drop trigger if exists fin_est_itens_touch on public.fin_estoque_itens;
create trigger fin_est_itens_touch before update on public.fin_estoque_itens
  for each row execute function public.touch_fin_updated_at();

-- ─── 2) Movimentos de estoque ────────────────────────────────────────────
create table if not exists public.fin_estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid not null references public.fin_estoque_itens(id) on delete cascade,
  data            date not null default current_date,
  tipo            fin_estoque_movimento_tipo not null,
  quantidade      numeric(14,3) not null check (quantidade > 0),
  valor_unitario  numeric(14,2),
  valor_total     numeric(14,2),                       -- = quantidade * valor_unitario
  lancamento_id   uuid references public.fin_lancamentos(id) on delete set null,
  fornecedor_id   uuid references public.fin_fornecedores(id) on delete set null,
  motivo          text,                                -- p/ ajustes: "perda", "inventário", "uso evento"
  user_id         uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_fin_est_mov_item on public.fin_estoque_movimentos(item_id);
create index if not exists idx_fin_est_mov_data on public.fin_estoque_movimentos(data desc);

-- ─── 3) Trigger: atualiza estoque_atual e custo_medio do item ────────────
create or replace function public.fin_atualiza_estoque_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric;
  v_atual numeric;
begin
  if tg_op = 'INSERT' then
    v_delta := case new.tipo
      when 'entrada' then new.quantidade
      when 'saida'   then -new.quantidade
      when 'ajuste'  then new.quantidade  -- ajuste positivo (use negativo no quantidade pra reduzir)
      else 0
    end;
    update public.fin_estoque_itens
       set estoque_atual = estoque_atual + v_delta,
           custo_medio = case
             when new.tipo = 'entrada' and new.valor_unitario is not null then
               -- média ponderada simples
               coalesce(((estoque_atual * coalesce(custo_medio, 0)) + (new.quantidade * new.valor_unitario))
                        / nullif(estoque_atual + new.quantidade, 0), new.valor_unitario)
             else custo_medio
           end
     where id = new.item_id;
  elsif tg_op = 'DELETE' then
    v_delta := case old.tipo
      when 'entrada' then -old.quantidade
      when 'saida'   then old.quantidade
      when 'ajuste'  then -old.quantidade
      else 0
    end;
    update public.fin_estoque_itens
       set estoque_atual = estoque_atual + v_delta
     where id = old.item_id;
  end if;

  -- Calcular valor_total automaticamente
  if tg_op = 'INSERT' and new.valor_unitario is not null then
    update public.fin_estoque_movimentos
       set valor_total = new.quantidade * new.valor_unitario
     where id = new.id;
  end if;

  return null;
end;$$;

drop trigger if exists fin_est_mov_saldo on public.fin_estoque_movimentos;
create trigger fin_est_mov_saldo after insert or delete on public.fin_estoque_movimentos
  for each row execute function public.fin_atualiza_estoque_item();

-- ─── 4) View: itens com risco (estoque baixo / acabando) ─────────────────
create or replace view public.vw_fin_estoque_alertas as
with consumo as (
  -- consumo médio diário dos últimos 90 dias por item
  select
    item_id,
    sum(quantidade) filter (where tipo = 'saida' and data >= current_date - interval '90 days') / 90.0
      as consumo_medio_dia
  from public.fin_estoque_movimentos
  where data >= current_date - interval '90 days'
  group by item_id
)
select
  i.id, i.nome, i.unidade, i.categoria,
  i.estoque_atual, i.estoque_minimo, i.ponto_pedido,
  i.custo_medio, i.fornecedor_padrao_id,
  coalesce(c.consumo_medio_dia, 0) as consumo_medio_dia,
  coalesce(c.consumo_medio_dia * 30, 0) as consumo_medio_mes,
  case
    when coalesce(c.consumo_medio_dia, 0) > 0 then
      floor(i.estoque_atual / c.consumo_medio_dia)::int
    else null
  end as dias_restantes_estimados,
  case
    when i.estoque_atual <= 0 then 'esgotado'
    when i.estoque_atual <= i.estoque_minimo then 'critico'
    when i.ponto_pedido is not null and i.estoque_atual <= i.ponto_pedido then 'comprar'
    when coalesce(c.consumo_medio_dia, 0) > 0
         and floor(i.estoque_atual / c.consumo_medio_dia) <= 15 then 'baixo'
    else 'ok'
  end as urgencia
from public.fin_estoque_itens i
left join consumo c on c.item_id = i.id
where i.ativo;

-- ─── 5) RLS ──────────────────────────────────────────────────────────────
alter table public.fin_estoque_itens      enable row level security;
alter table public.fin_estoque_movimentos enable row level security;

drop policy if exists "fin_est_itens_all" on public.fin_estoque_itens;
drop policy if exists "fin_est_mov_all"   on public.fin_estoque_movimentos;

create policy "fin_est_itens_all" on public.fin_estoque_itens for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "fin_est_mov_all" on public.fin_estoque_movimentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

comment on table public.fin_estoque_itens     is 'Itens controlados no estoque (limpeza, escritório, som, etc.)';
comment on table public.fin_estoque_movimentos is 'Entradas, saídas e ajustes de estoque';
comment on view  public.vw_fin_estoque_alertas is 'Visão consolidada com consumo médio + dias restantes + urgência';
