-- ═══════════════════════════════════════════════════════════════════════════
-- DIAKONIA — GOVERNANÇA Gv3
-- Execução automática + Alertas inteligentes + Convocação em massa
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1) Função: executa decisão de pauta vinculada ────────────────────
-- Quando uma pauta vinculada a solicitação de membresia é decidida,
-- automaticamente atualiza a solicitação correspondente.
create or replace function public.gov_executar_pauta(p_pauta_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pauta record;
  v_msg text := '';
begin
  select * into v_pauta from public.gov_pautas where id = p_pauta_id;
  if v_pauta is null then return 'Pauta não encontrada'; end if;
  if v_pauta.executada then return 'Já executada'; end if;
  if v_pauta.status not in ('aprovada_assembleia','rejeitada','adiada') then
    return 'Pauta ainda não decidida';
  end if;

  -- 1) Solicitação de membresia
  if v_pauta.vinculo_tipo = 'solicitacao_membresia' and v_pauta.vinculo_id is not null then
    if v_pauta.status = 'aprovada_assembleia' then
      update public.solicitacoes_membresia
         set status = 'aprovada',
             data_aprovacao = coalesce(data_aprovacao, current_date),
             observacao_aprovacao = coalesce(
               observacao_aprovacao,
               'Aprovada em assembleia: ' || coalesce(v_pauta.observacao_decisao, '')
             )
       where id = v_pauta.vinculo_id;
      v_msg := 'Solicitação aprovada automaticamente';
    elsif v_pauta.status = 'rejeitada' then
      update public.solicitacoes_membresia
         set status = 'rejeitada',
             observacao_rejeicao = coalesce(
               observacao_rejeicao,
               'Rejeitada em assembleia: ' || coalesce(v_pauta.observacao_decisao, '(sem motivo)')
             )
       where id = v_pauta.vinculo_id;
      v_msg := 'Solicitação rejeitada';
    end if;
  end if;

  -- Marca pauta como executada
  update public.gov_pautas
     set executada = true,
         data_execucao = now(),
         observacao_execucao = v_msg,
         status = case when status = 'aprovada_assembleia' then 'executada'::gov_pauta_status else status end
   where id = p_pauta_id;

  return coalesce(v_msg, 'Executada (sem vínculo automatizável)');
end;$$;

-- ─── 2) RPC: executa TODAS as pautas pendentes de uma assembleia ──────
create or replace function public.gov_executar_assembleia(p_assembleia_id uuid)
returns table (pauta_id uuid, titulo text, resultado text)
language plpgsql security definer set search_path = public as $$
declare
  v_pauta record;
  v_resultado text;
begin
  for v_pauta in
    select id, titulo from public.gov_pautas
    where assembleia_id = p_assembleia_id
      and not executada
      and status in ('aprovada_assembleia','rejeitada','adiada')
  loop
    v_resultado := public.gov_executar_pauta(v_pauta.id);
    pauta_id := v_pauta.id;
    titulo := v_pauta.titulo;
    resultado := v_resultado;
    return next;
  end loop;
end;$$;

-- ─── 3) RPC: Alertas inteligentes de governança ──────────────────────
create or replace function public.gov_alertas()
returns table (
  prioridade prioridade_alerta,
  tipo text,
  titulo text,
  descricao text,
  acao_sugerida text,
  link text,
  entidade_id uuid
)
language sql stable security definer set search_path = public as $$
  -- 1) URGENTE: Decisões aprovadas em assembleia, ainda não executadas
  select 'urgente'::prioridade_alerta, 'execucao_pendente',
         'Decisão aprovada aguardando execução',
         titulo || ' — decidida em ' || data_decisao::text,
         'Executar agora',
         '/governanca/assembleia/' || assembleia_id::text, id
  from public.gov_pautas
  where status = 'aprovada_assembleia' and not executada and assembleia_id is not null

  union all

  -- 2) URGENTE: Assembleias em andamento sem quórum
  select 'urgente'::prioridade_alerta, 'sem_quorum',
         a.titulo || ' — em andamento sem quórum',
         a.total_presentes || '/' || coalesce(a.total_membros_aptos, 0) || ' presentes (' ||
           round(100.0 * a.total_presentes / nullif(a.total_membros_aptos, 0), 1)::text || '%)',
         'Ver assembleia',
         '/governanca/assembleia/' || a.id::text, a.id
  from public.gov_assembleias a
  where a.status = 'em_andamento' and not a.quorum_atingido

  union all

  -- 3) ATENÇÃO: Assembleia próxima (≤ 7 dias) sem convocação enviada
  select 'atencao'::prioridade_alerta, 'convocacao_pendente',
         'Assembleia em ' || (data_assembleia - current_date) || ' dia(s) — convocação não enviada',
         titulo,
         'Enviar convocação',
         '/governanca/assembleia/' || id::text, id
  from public.gov_assembleias
  where status = 'agendada'
    and not convocacao_enviada
    and data_assembleia between current_date and current_date + interval '7 days'

  union all

  -- 4) ATENÇÃO: Reuniões em ≤ 3 dias sem participantes confirmados
  select 'atencao'::prioridade_alerta, 'reuniao_proxima',
         'Reunião em ' || (data_reuniao - current_date) || ' dia(s)',
         titulo || ' — confirme participantes e pauta',
         'Ver reunião',
         '/governanca/reuniao/' || id::text, id
  from public.gov_reunioes
  where status = 'agendada'
    and data_reuniao between current_date and current_date + interval '3 days'

  union all

  -- 5) INFO: Pautas em rascunho em reunião concluída
  select 'informativo'::prioridade_alerta, 'pauta_rascunho',
         p.titulo || ' — ainda em rascunho',
         'Reunião já foi concluída · decidir ou mover',
         'Ver reunião',
         '/governanca/reuniao/' || p.reuniao_id::text, p.id
  from public.gov_pautas p
  join public.gov_reunioes r on r.id = p.reuniao_id
  where p.status = 'rascunho' and r.status = 'concluida'

  order by 1, 2;
$$;

-- ─── 4) View: convocação em massa de assembleia ──────────────────────
create or replace view public.vw_gov_convocacao_lista as
select
  ap.assembleia_id,
  ap.pessoa_id,
  ap.pessoa_nome,
  m.telefone_celular,
  m.email
from public.gov_assembleia_presentes ap
left join public.membros m on m.id = ap.pessoa_id;
