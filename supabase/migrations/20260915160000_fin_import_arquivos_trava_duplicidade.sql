-- ─── Trava de duplicidade na importação do Omie ────────────────────────────
--
-- Pedido da Telma em 15/09/2026, depois de um incidente real: o histórico de
-- 2025 do Bradesco foi importado DUAS VEZES (dois lotes de
-- `omieImportService.ts`, criados com 24 segundos de diferença, 3.641
-- linhas idênticas cada) — achado só numa auditoria manual comparando
-- lançamento a lançamento. A causa mais provável, medida pelo intervalo
-- curto entre os dois lotes: a tela de importação (`ImportacaoOmieDialog.
-- tsx`) não se fecha nem reseta sozinha depois de importar — fica esperando
-- um clique manual no X — e nada no código impedia escolher o MESMO
-- arquivo de novo e confirmar de novo.
--
-- Isto aqui é a camada de banco da correção (a camada de tela está em
-- `ImportacaoOmieDialog.tsx`/`omieImportService.ts`, do mesmo commit).
-- Sozinha a tela não bastava: um clique duplo, uma corrida entre dois
-- cliques antes do React re-renderizar o botão desabilitado, ou reabrir a
-- tela e escolher o mesmo arquivo de novo — nenhum desses é impedido só
-- com estado de componente. Precisa de uma trava que o BANCO garanta,
-- não a tela.
--
-- ── O QUE ESTA TABELA FAZ ────────────────────────────────────────────────
-- Cada arquivo .xlsx importado com sucesso grava aqui o hash SHA-256 do
-- próprio arquivo (calculado no navegador, `omieImport.ts`) junto da conta
-- em que foi importado. `unique (conta_id, arquivo_hash)` faz o PRÓPRIO
-- INSERT falhar (`23505`) se alguém tentar importar o mesmo arquivo
-- inteiro na mesma conta outra vez — `confirmarImportacaoOmie` grava esta
-- linha ANTES de inserir os lançamentos, exatamente pra pegar uma corrida
-- de clique duplo antes de qualquer lançamento ser criado, não depois.
--
-- Não impede reimportar um arquivo DIFERENTE que cubra o mesmo período
-- (hash diferente) — esse caso é responsabilidade da checagem de
-- sobreposição de datas, feita na tela antes de confirmar (avisa, não
-- bloqueia, porque um período parcial reimportado de propósito é um uso
-- legítimo).
create table public.fin_import_arquivos (
  id             uuid primary key default gen_random_uuid(),
  conta_id       uuid not null references public.fin_contas(id) on delete cascade,
  arquivo_hash   text not null,
  arquivo_nome   text,
  qtd_linhas     int not null,
  data_min       date,
  data_max       date,
  lote_tag       text not null,
  importado_por  uuid references public.profiles(id) on delete set null,
  importado_em   timestamptz not null default now(),
  unique (conta_id, arquivo_hash)
);

create index idx_fin_import_arquivos_conta on public.fin_import_arquivos(conta_id);

alter table public.fin_import_arquivos enable row level security;

-- Mesma malha de escrita do resto do módulo financeiro (`fin_lanc_all`) —
-- este é só um log de apoio à importação, não dado financeiro em si.
create policy fin_import_arquivos_all on public.fin_import_arquivos as permissive for all to public
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);
