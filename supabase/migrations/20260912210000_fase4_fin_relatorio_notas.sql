-- ─── Fase 4 do projeto Tesouraria: fin_relatorio_notas ─────────────────────
--
-- docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §5.2. O equivalente
-- estruturado do comentário 💬 que hoje mora numa célula do Excel — sem
-- busca, sem autor, sem data. Exemplo real da planilha (2T/2025, Sustento
-- Pastoral): "Abril e Maio: Sustento com impacto do Dissídio... Junho: foi
-- adiantado todo o salário..." — uma nota só, cobrindo dois meses e vários
-- lançamentos ao mesmo tempo. Por isso a granularidade é por MÊS, não por
-- lançamento: `categoria_id` e `centro_custo_id` são os dois opcionais e
-- independentes (uma nota pode explicar a categoria inteira no mês, o
-- centro inteiro, os dois juntos, ou nenhum dos dois — nota geral do mês).
--
-- Só a tabela e o índice nesta migration — sem tela, sem ligação com o
-- relatório ainda (isso é Fase 5). RLS segue o mesmo padrão de todo o
-- módulo financeiro (fin_categorias, fin_centros_custo, fin_lancamentos,
-- fin_orcamentos): `auth.role() = 'authenticated'`, sem granularidade por
-- papel na política — o portão fino é a tela, como o restante do módulo.
--
-- `updated_at` (não `atualizado_em`, como o rascunho do projeto sugeria) —
-- para reaproveitar o trigger genérico `touch_fin_updated_at()` que já
-- existe e já serve fin_contas/fin_lancamentos/fin_orcamentos/etc, em vez
-- de escrever um trigger novo só para um nome de coluna diferente.
--
-- `criado_por` referencia `profiles(id)`, não `auth.users(id)` — é essa a
-- tabela que `fin_lancamentos.audit_user_id` já usa (conferido no schema
-- antes de escrever esta migration); manter o mesmo padrão em vez de
-- introduzir uma segunda convenção no mesmo módulo.

create table public.fin_relatorio_notas (
  id              uuid primary key default gen_random_uuid(),
  ano             int not null check (ano >= 2020 and ano <= 2099),
  mes             int not null check (mes between 1 and 12),
  categoria_id    uuid references public.fin_categorias(id) on delete cascade,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete cascade,
  nota            text not null check (btrim(nota) <> ''),
  criado_por      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_fin_notas_periodo on public.fin_relatorio_notas(ano, mes);
create index idx_fin_notas_categoria on public.fin_relatorio_notas(categoria_id);
create index idx_fin_notas_centro on public.fin_relatorio_notas(centro_custo_id);

create trigger fin_notas_touch before update on public.fin_relatorio_notas
  for each row execute function public.touch_fin_updated_at();

alter table public.fin_relatorio_notas enable row level security;

create policy fin_notas_all on public.fin_relatorio_notas as permissive for all to public
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);
