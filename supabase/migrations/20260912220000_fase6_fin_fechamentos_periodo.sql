-- ─── Fase 6 do projeto Tesouraria: fechamento de período (não de trimestre) ──
--
-- docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §5.1 e §7.4-7.5 — revisado em
-- 12/09/2026 por pedido explícito: "não deixar o fechamento por trimestre
-- amarrado, e sim como opção". O desenho original (`fin_fechamentos_
-- trimestre`, chave `ano + trimestre 1-4`) nunca chegou a ser criado —
-- esta migration já nasce no formato certo: um período é `ano_inicio +
-- mes_inicio + qtd_meses`, e "trimestral" é só `qtd_meses = 3`, um preset
-- de tela entre "mensal" (1), "semestral" (6) e "anual" (12) — a mesma
-- mudança que `prestacaoContasService.gerarPrestacaoContas()` já fez do
-- lado da leitura.
--
-- ── O QUE TRAVA ───────────────────────────────────────────────────────────
-- Um trigger em `fin_lancamentos` (não uma política de RLS nova) barra
-- UPDATE/DELETE de qualquer lançamento cujo `fechamento_id` aponte para um
-- fechamento `fechado` ou `aprovado`. Trigger, não RLS, porque a política
-- de escrita do módulo inteiro é hoje uma só (`fin_lanc_all`, qualquer
-- autenticado, FOR ALL) — trocá-la por políticas separadas por operação
-- teria risco de quebrar escrita que já funciona; um trigger novo é aditivo
-- e não toca em nada que já roda.
--
-- ── QUEM FECHA, APROVA, REABRE ────────────────────────────────────────────
-- `fin_fechar_periodo`: qualquer autenticado (mesma malha de escrita do
-- resto do módulo — a tela decide quem vê o botão, via `ROLES_FINANCEIRO`,
-- igual a todo o resto de /financas).
-- `fin_aprovar_periodo` e `fin_reabrir_periodo`: checam `is_admin()` de
-- verdade dentro da função — é a única checagem de papel que existe no
-- banco para todo o módulo financeiro hoje. Não usei um papel "tesouraria"
-- porque ele não existe no enum `app_role` (`admin, secretaria, diakonia,
-- lideranca, operador, voluntario, pastor, membro, visualizador, lider` —
-- conferido no schema antes de escrever isto); "tesouraria" só existe como
-- rótulo de app em `navConfig.ts`, não como papel de banco.
--
-- ── LIMITAÇÃO CONHECIDA, NÃO RESOLVIDA AQUI ──────────────────────────────
-- Períodos flexíveis podem se sobrepor (fechar Setembro sozinho, depois
-- fechar Jul-Set inteiro). `fin_fechar_periodo` só carimba lançamento com
-- `fechamento_id is null` — um lançamento já fechado por um período menor
-- não é re-carimbado por um período maior que o contenha. Isso evita
-- travar duas vezes o mesmo lançamento, mas significa que o "saldo_final"
-- de um fechamento maior pode não refletir sub-períodos já fechados
-- separadamente. Não é um problema que a Telma pediu para resolver agora;
-- registrado para quando (se) a rotina real expuser um caso disso.

-- ── 1) A tabela ──────────────────────────────────────────────────────────
create table public.fin_fechamentos_periodo (
  id                uuid primary key default gen_random_uuid(),
  ano_inicio        int not null check (ano_inicio >= 2020 and ano_inicio <= 2099),
  mes_inicio        int not null check (mes_inicio between 1 and 12),
  qtd_meses         int not null check (qtd_meses between 1 and 24),
  status            text not null default 'aberto'
                      check (status in ('aberto','em_revisao','fechado','aprovado')),
  saldo_anterior    numeric(14,2),
  saldo_final       numeric(14,2),
  fechado_em        timestamptz,
  fechado_por       uuid references public.profiles(id) on delete set null,
  aprovado_em       timestamptz,
  aprovado_por      uuid references public.profiles(id) on delete set null,
  observacao_geral  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (ano_inicio, mes_inicio, qtd_meses)
);

create index idx_fin_fechamentos_status on public.fin_fechamentos_periodo(status);

create trigger fin_fechamentos_touch before update on public.fin_fechamentos_periodo
  for each row execute function public.touch_fin_updated_at();

alter table public.fin_fechamentos_periodo enable row level security;
create policy fin_fechamentos_all on public.fin_fechamentos_periodo as permissive for all to public
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

-- ── 2) fin_lancamentos ganha o vínculo com o fechamento ─────────────────
alter table public.fin_lancamentos
  add column if not exists fechamento_id uuid references public.fin_fechamentos_periodo(id) on delete set null;

create index idx_fin_lanc_fechamento on public.fin_lancamentos(fechamento_id);

-- ── 3) O trigger que trava edição de lançamento fechado ──────────────────
create or replace function public.fin_bloqueia_lancamento_fechado()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  if OLD.fechamento_id is null then
    return coalesce(NEW, OLD);
  end if;

  select status into v_status from public.fin_fechamentos_periodo where id = OLD.fechamento_id;
  if v_status in ('fechado', 'aprovado') then
    raise exception 'Este lançamento pertence a um período % — reabra o período antes de editar ou apagar.', v_status;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger fin_lanc_bloqueio_fechamento
  before update or delete on public.fin_lancamentos
  for each row execute function public.fin_bloqueia_lancamento_fechado();

-- ── 4) Fechar: carimba os lançamentos do período e muda o status ────────
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

-- ── 5) Aprovar: só admin ──────────────────────────────────────────────────
create or replace function public.fin_aprovar_periodo(p_fechamento_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Só administradores podem aprovar um período fechado.';
  end if;

  update public.fin_fechamentos_periodo
    set status = 'aprovado', aprovado_em = now(), aprovado_por = auth.uid()
    where id = p_fechamento_id and status = 'fechado';
  if not found then raise exception 'Fechamento não encontrado ou não está com status ''fechado''.'; end if;
end;
$$;

-- ── 6) Reabrir: só admin, motivo obrigatório, fica registrado ───────────
create or replace function public.fin_reabrir_periodo(p_fechamento_id uuid, p_motivo text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Só administradores podem reabrir um período fechado.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  update public.fin_fechamentos_periodo
    set status = 'aberto',
        observacao_geral = trim(both E'\n' from coalesce(observacao_geral || E'\n', '') ||
          '[Reaberto em ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || '] ' || btrim(p_motivo))
    where id = p_fechamento_id and status in ('fechado', 'aprovado');
  if not found then raise exception 'Fechamento não encontrado ou não está fechado/aprovado.'; end if;
end;
$$;

grant execute on function public.fin_fechar_periodo(uuid) to authenticated;
grant execute on function public.fin_aprovar_periodo(uuid) to authenticated;
grant execute on function public.fin_reabrir_periodo(uuid, text) to authenticated;
