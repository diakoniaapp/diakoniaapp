-- ─── Fase 1: Plano de Contas Oficial 2025 em fin_categorias ────────────────
--
-- Projeto: docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
-- Mapeamento linha a linha: docs/FASE1_MAPEAMENTO_CATEGORIAS.md
--
-- Defeito que resolve: `fin_categorias.conta_contabil` está NULL nas 34
-- categorias de produção (medido em 12/09/2026) porque não existia um plano
-- de contas oficial pra popular — o próprio dreService.ts já previa isso
-- ("decisão pendente da Telma... qual modelo?"). O plano oficial veio das 4
-- planilhas trimestrais de 2025 baixadas do Drive: mesmo plano de contas nas
-- 4 (diff vazio nos dois sentidos, comparação programática). Confirmado com a
-- Telma em 12/09/2026: Doações continua categoria de receita independente;
-- Diaconia e Missões deixam de ser categoria (no modelo oficial são centro de
-- custo, não categoria de despesa).
--
-- Por que uma coluna nova (`classificacao_dre`) e não `conta_contabil`:
-- `conta_contabil` tem nome de código contábil de verdade (o que a
-- contabilidade terceirizada poderia dar um dia) — ainda não existe. O plano
-- de contas das planilhas é mais simples: 5 rótulos fixos de agrupamento do
-- relatório trimestral. Reaproveitar `conta_contabil` reservaria o campo
-- certo pro propósito errado.
--
-- Medido em produção antes desta migration: 7 lançamentos, 4 com categoria
-- (Ofertas ×1, Dízimos ×2, Energia elétrica ×1) — nenhuma das 3 é
-- descontinuada aqui, só renomeada no próprio id. Nenhum lançamento usa
-- "Diaconia / assistência" nem "Missões". Risco de migração de dado: nenhum.
--
-- Alternativa descartada: apagar as 34 categorias e recriar do zero.
-- Descartada porque `categoria_id` é referenciado por `fin_lancamentos` e
-- `fin_orcamentos` — um DELETE quebraria a integridade referencial dos 4
-- lançamentos reais à toa, quando UPDATE resolve.
--
-- Ensaiar com BEGIN; ...este arquivo inteiro...; ROLLBACK; antes de rodar de
-- verdade — convenção do projeto (CLAUDE.md §6.3). Este arquivo não abre
-- transação própria porque nenhuma migration deste repositório abre.

-- ── 1) Classificação fixa do relatório trimestral ───────────────────────────
do $$ begin
  create type public.fin_classificacao_dre as enum (
    'receitas_regulares', 'outras_receitas',
    'despesas', 'despesas_financeiras', 'outras_despesas'
  );
exception when duplicate_object then null; end $$;

alter table public.fin_categorias
  add column if not exists classificacao_dre public.fin_classificacao_dre;

comment on column public.fin_categorias.classificacao_dre is
  'Agrupamento fixo do Plano de Contas Oficial 2025 (Receitas Regulares / Outras '
  'Receitas / Despesas / Despesas Financeiras / Outras Despesas), extraído das 4 '
  'planilhas trimestrais reais. NULL = categoria fora do Plano Oficial, mantida '
  'para uso interno de outro módulo (Arrecadação, EBD, Bazar/Cantina). Não '
  'confundir com conta_contabil, reservado para um código contábil real se a '
  'contabilidade terceirizada vier a fornecer um — ver '
  'docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §6.1.';

-- ── 2) Categorias existentes que já são o Plano Oficial — renomear + classificar ──

update public.fin_categorias set nome = 'Dizimos', classificacao_dre = 'receitas_regulares', sistema = true, ordem = 1
  where nome = 'Dízimos' and tipo = 'entrada';
update public.fin_categorias set classificacao_dre = 'receitas_regulares', sistema = true, ordem = 2
  where nome = 'Ofertas' and tipo = 'entrada';
update public.fin_categorias set classificacao_dre = 'receitas_regulares', sistema = true, ordem = 3
  where nome = 'Ofertas para Missões' and tipo = 'entrada';
update public.fin_categorias set nome = 'Rendimentos de Aplicações', classificacao_dre = 'outras_receitas', sistema = true, ordem = 5
  where nome = 'Rendimento aplicação';

update public.fin_categorias set nome = 'Água e Esgoto', classificacao_dre = 'despesas', sistema = true
  where nome = 'Água e esgoto';
update public.fin_categorias set classificacao_dre = 'despesas', sistema = true
  where nome = 'Aluguel' and tipo = 'saida';
update public.fin_categorias set nome = 'Energia Elétrica', classificacao_dre = 'despesas', sistema = true
  where nome = 'Energia elétrica';
update public.fin_categorias set nome = 'Impostos e Taxas', classificacao_dre = 'despesas', sistema = true
  where nome = 'Impostos / taxas';
update public.fin_categorias set nome = 'Material de Escritório', classificacao_dre = 'despesas', sistema = true
  where nome = 'Material de escritório';
update public.fin_categorias set nome = 'Salários', classificacao_dre = 'despesas', sistema = true
  where nome = 'Salários CLT';
update public.fin_categorias set classificacao_dre = 'despesas', sistema = true
  where nome = 'Vale Transporte' and tipo = 'saida';
update public.fin_categorias set nome = 'Vale Refeição', classificacao_dre = 'despesas', sistema = true
  where nome = 'Vale Alimentação';
update public.fin_categorias set nome = 'Manutenção de Imobilizado', classificacao_dre = 'despesas', sistema = true
  where nome = 'Manutenção predial';
update public.fin_categorias set nome = 'Prebenda', classificacao_dre = 'despesas', sistema = true
  where nome = 'Prebenda pastoral';
update public.fin_categorias set nome = 'Serviço Prestado PJ', classificacao_dre = 'despesas', sistema = true
  where nome = 'MEI (prestadores)';
update public.fin_categorias set nome = 'Serviço Prestado PF', classificacao_dre = 'despesas', sistema = true
  where nome = 'RPA (autônomos)';
update public.fin_categorias set nome = 'Limpeza e Dedetização', classificacao_dre = 'despesas', sistema = true
  where nome = 'Material de limpeza';
update public.fin_categorias set nome = 'Móveis e Equipamentos em Geral', classificacao_dre = 'despesas', sistema = true
  where nome = 'Manutenção equipamentos';
update public.fin_categorias set nome = 'Material de Consumo', classificacao_dre = 'despesas', sistema = true
  where nome = 'Eventos / Almoço';
update public.fin_categorias set nome = 'Combustível', classificacao_dre = 'outras_despesas', sistema = true
  where nome = 'Transporte/combustível';
update public.fin_categorias set nome = 'Tarifas Bancárias', classificacao_dre = 'despesas_financeiras', sistema = true
  where nome = 'Tarifas bancárias';

-- "Material de som" funde com "Móveis e Equipamentos em Geral" (linha acima) — não duplica categoria oficial
-- Repointa qualquer lançamento antes de desativar (medido 0 em 12/09/2026, mas a
-- migration não confia só na medição — se algo mudou entre a medição e a
-- aplicação, o repoint cobre).
update public.fin_lancamentos set categoria_id = (
    select id from public.fin_categorias where nome = 'Móveis e Equipamentos em Geral' and tipo = 'saida' limit 1
  )
  where categoria_id = (select id from public.fin_categorias where nome = 'Material de som' limit 1);
update public.fin_categorias set ativo = false,
  observacao = 'Fundida em "Móveis e Equipamentos em Geral" na Fase 1 do Plano de Contas Oficial (12/09/2026).'
  where nome = 'Material de som';

-- "Doações" funde com "Ofertas" — decisão revisada da Telma em 12/09/2026
-- (primeira decisão do dia foi manter independente; corrigida no mesmo dia
-- antes da migration ser aplicada). Mesmo repoint defensivo do bloco acima.
update public.fin_lancamentos set categoria_id = (
    select id from public.fin_categorias where nome = 'Ofertas' and tipo = 'entrada' limit 1
  )
  where categoria_id = (select id from public.fin_categorias where nome = 'Doações' limit 1);
update public.fin_categorias set ativo = false,
  observacao = 'Fundida em "Ofertas" por decisão da Telma (12/09/2026).'
  where nome = 'Doações';

-- ── 3) Categorias que se desmembram em mais de uma oficial ──────────────────
update public.fin_categorias set ativo = false,
  observacao = 'Desmembrada em INSS / FGTS / INSS-IRRF na Fase 1 do Plano de Contas Oficial (12/09/2026).'
  where nome = 'INSS / FGTS / Encargos';
update public.fin_categorias set ativo = false,
  observacao = 'Desmembrada em Internet / Telefonia na Fase 1 do Plano de Contas Oficial (12/09/2026).'
  where nome = 'Internet/telefone';

-- ── 4) Diaconia e Missões deixam de ser categoria — decisão da Telma, 12/09/2026 ──
-- No Plano Oficial elas são centro de custo (Min. Diaconia e Ação Social /
-- Min. Evangelismo e Missões), já existentes em fin_centros_custo — nada a
-- criar ali. Nenhum lançamento em produção referencia estas duas categorias
-- (medido antes desta migration), então não há registro a remapear.
update public.fin_categorias set ativo = false,
  observacao = 'Descontinuada como categoria por decisão da Telma (12/09/2026): no Plano Oficial é centro de custo (Min. Diaconia e Ação Social), não categoria de despesa.'
  where nome = 'Diaconia / assistência';
update public.fin_categorias set ativo = false,
  observacao = 'Descontinuada como categoria por decisão da Telma (12/09/2026): no Plano Oficial é centro de custo (Min. Evangelismo e Missões), não categoria de despesa. Repasse a missões usa a categoria oficial "Outros Repasses Missionários".'
  where nome = 'Missões';

-- ── 5) Sem equivalente oficial, sem uso em produção — descontinuar ──────────
update public.fin_categorias set ativo = false,
  observacao = 'Sem equivalente no Plano de Contas Oficial 2025 — genérica demais. Fase 1, 12/09/2026.'
  where nome = 'Outras receitas';
update public.fin_categorias set ativo = false,
  observacao = 'Sem equivalente no Plano de Contas Oficial 2025 (é capex, não despesa corrente). Revisar se a igreja passar a reformar/construir com frequência. Fase 1, 12/09/2026.'
  where nome = 'Construção / reforma';

-- ── 6) Fora do Plano Oficial, mantidas ativas (outro módulo, ou decisão explícita) ──
update public.fin_categorias set
  observacao = 'Fora do Plano de Contas Oficial 2025 — uso do módulo Arrecadação/Campanhas.'
  where nome = 'Campanhas';
update public.fin_categorias set
  observacao = 'Fora do Plano de Contas Oficial 2025 — uso do módulo Arrecadação/Eventos.'
  where nome = 'Eventos' and tipo = 'entrada';
update public.fin_categorias set
  observacao = 'Fora do Plano de Contas Oficial 2025 — uso do módulo Bazar/Cantina.'
  where nome = 'Vendas (livraria)';
update public.fin_categorias set
  observacao = 'Fora do Plano de Contas Oficial 2025 — uso do módulo EBD.'
  where nome = 'Materiais EBD';
update public.fin_categorias set
  observacao = 'Fallback controlado — não oferecer como 1ª opção em lançamento novo; categoria nova deve ter equivalente no Plano Oficial ou justificativa de módulo específico.'
  where nome = 'Outras despesas';

-- ── 7) Categorias do Plano Oficial sem equivalente atual — criar do zero ────
-- (nomes e ordem exatamente como aparecem nas 4 planilhas de 2025;
-- "Vale Refeição" NÃO entra aqui — já foi criada pelo rename da seção 2)

insert into public.fin_categorias (nome, tipo, classificacao_dre, sistema, ordem) values
  ('Descontos Obtidos', 'entrada', 'outras_receitas', true, 4),

  ('Férias', 'saida', 'despesas', true, 10),
  ('Rescisões', 'saida', 'despesas', true, 11),
  ('13º Salário', 'saida', 'despesas', true, 12),
  ('INSS', 'saida', 'despesas', true, 13),
  ('FGTS', 'saida', 'despesas', true, 14),
  ('IRRF', 'saida', 'despesas', true, 15),
  ('PIS', 'saida', 'despesas', true, 16),
  ('Assessoria Saude Ocupacional', 'saida', 'despesas', true, 17),
  ('Seguro de Vida', 'saida', 'despesas', true, 19),
  ('Sustento Pastoral', 'saida', 'despesas', true, 20),
  ('Sustento Pastoral Auxiliar', 'saida', 'despesas', true, 21),
  ('Outros Benefícios', 'saida', 'despesas', true, 22),
  ('INSS/IRRF', 'saida', 'despesas', true, 23),
  ('Condomínio', 'saida', 'despesas', true, 24),
  ('Telefonia', 'saida', 'despesas', true, 25),
  ('Seguros', 'saida', 'despesas', true, 26),
  ('IPTU', 'saida', 'despesas', true, 27),
  ('Contabilidade', 'saida', 'despesas', true, 28),
  ('Internet', 'saida', 'despesas', true, 29),
  ('Ofertas Preletores', 'saida', 'despesas', true, 30),
  ('Gas', 'saida', 'despesas', true, 31),
  ('Monitoramento', 'saida', 'despesas', true, 32),
  ('Sistemas de Informática', 'saida', 'despesas', true, 33),
  ('Aluguel de Equipamentos', 'saida', 'despesas', true, 34),
  ('Assinaturas e Mensalidades', 'saida', 'despesas', true, 35),
  ('Assistente Musical', 'saida', 'despesas', true, 36),
  ('Dedetização', 'saida', 'despesas', true, 37),
  ('ISS', 'saida', 'despesas', true, 38),
  ('Outros Repasses Missionários', 'saida', 'despesas', true, 39),

  ('Juros', 'saida', 'despesas_financeiras', true, 40),
  ('Multas', 'saida', 'despesas_financeiras', true, 41),
  ('IOF', 'saida', 'despesas_financeiras', true, 42),
  ('Tarifa Cartão Credito', 'saida', 'despesas_financeiras', true, 43),

  ('PENDENCIAS FINANCEIRO', 'saida', 'outras_despesas', true, 44),
  ('Assembleia Convenção Batista Brasileira', 'saida', 'outras_despesas', true, 45),
  ('Outros Gastos Cartão', 'saida', 'outras_despesas', true, 46),
  ('Doações e Contribuições', 'saida', 'outras_despesas', true, 47);

-- ── 8) Verificação — rodar depois de aplicar, conferir contra o esperado ────
-- select count(*) filter (where classificacao_dre is not null) as classificadas,
--        count(*) filter (where classificacao_dre is null and ativo) as fora_do_oficial_ativas,
--        count(*) filter (where not ativo) as descontinuadas,
--        count(*) as total
-- from public.fin_categorias;
-- Esperado: classificadas = 59 (5 receita + 44 despesa + 5 desp. financeira + 5
-- outras despesas) · fora_do_oficial_ativas = 5 · descontinuadas = 8 ·
-- total = 72 (34 originais + 38 novas)
