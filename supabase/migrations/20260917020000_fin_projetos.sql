-- ─── Fase 6 do ERP financeiro: Projetos (iniciativas) ───────────────────────
--
-- Pedido da Telma (17/09/2026, papel de PO/arquiteta/controladoria):
-- acompanhar financeiramente iniciativas como "120 Anos", "Reforma e
-- Restauração do Templo", "Congresso de Casais", "Missões Mundiais" — hoje
-- em planilha externa. Inspirado no conceito de Projeto do Omie: campo
-- opcional no lançamento, complementa Categoria e Centro de Custo, não
-- substitui nenhum dos dois. Análise completa (auditoria + decisão +
-- arquitetura) em docs/ROADMAP_FINANCEIRO_ERP.md, Fase 6.
--
-- ── POR QUE NÃO É UM CENTRO DE CUSTO ─────────────────────────────────────
-- `fin_centros_custo.vinculo_tipo` aceita 'campanha' no enum, mas em
-- 15/09/2026 (migration 20260915140000_seed_centros_custo_so_ministerio.sql)
-- a criação automática de centro de custo por campanha foi removida de
-- propósito, porque poluía a lista oficial que precisa casar com a aba
-- "Plano de Contas" dos 4 relatórios trimestrais impressos. Uma tabela
-- nova, ortogonal, evita reabrir esse problema: Centro de Custo continua
-- fechado (Plano de Contas Oficial); Projeto é uma dimensão a mais, opcional,
-- que qualquer lançamento pode carregar independente do centro de custo.
--
-- ── POR QUE NÃO É `campanhas` NEM `ebd_campanhas` ────────────────────────
-- `campanhas` (Campanhas Espirituais) é conteúdo devocional preso a um
-- ministério, sem nenhum campo financeiro (medido: 1 linha em produção,
-- colunas `contexto_espiritual`/`origem_identidade`). `ebd_campanhas` tem
-- `meta_valor` (mais parecido), mas é presa a `classe_id` (só EBD) e sua
-- tabela de movimento (`ebd_entradas`) só registra entrada, nunca despesa,
-- e nunca fala com `fin_lancamentos`. Nenhuma das duas serve sem forçar um
-- significado que a tabela não tem.
--
-- ── RLS ────────────────────────────────────────────────────────────────
-- Mesmo padrão de todo o módulo financeiro (ver `fin_fechamentos_periodo`,
-- 20260912220000): uma política só, permissiva, para qualquer autenticado
-- — quem restringe visibilidade é a tela (`ROLES_FINANCEIRO` em
-- `navConfig.ts`), não RLS. Trocar por políticas separadas por papel aqui
-- destoaria do resto do módulo sem necessidade concreta.

create table public.fin_projetos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  meta_valor  numeric(14,2),
  data_inicio date,
  data_fim    date,
  status      text not null default 'ativo' check (status in ('ativo', 'encerrado')),
  cor         text,
  created_at  timestamptz not null default now()
);

create index idx_fin_projetos_status on public.fin_projetos(status);

alter table public.fin_projetos enable row level security;
create policy fin_projetos_all on public.fin_projetos as permissive for all to public
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

alter table public.fin_lancamentos
  add column if not exists projeto_id uuid references public.fin_projetos(id) on delete set null;

create index idx_fin_lanc_projeto on public.fin_lancamentos(projeto_id);
