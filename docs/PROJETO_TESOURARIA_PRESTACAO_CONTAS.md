# Projeto Técnico — Tesouraria como sistema oficial da Prestação de Contas Trimestral

> **Status:** Fase 1 aplicada em produção em 12/09/2026 — Plano de Contas Oficial
> seedado, mapeamento executado, verificado ao vivo (`72` categorias, `59`
> classificadas, `8` descontinuadas, `5` fora do Plano Oficial — bate exatamente com
> o previsto). Fases 2–7 seguem como projeto, uma por vez.
>
> **De onde vêm os números deste documento.** Tudo abaixo foi medido, não estimado:
> as 4 planilhas trimestrais de 2025 (`Relatório Financeiro - 01 a 03.2025.xlsm` até
> `11 e 12.2025.xlsm`) baixadas da pasta do Drive indicada pela Telma e lidas célula a
> célula; o schema real do Postgres de produção (`supabase/baseline/schema.sql` +
> consulta direta à API REST em 12/09/2026); e uma contagem ao vivo de
> `fin_lancamentos` em produção no mesmo dia. Onde a fonte é inferência e não medição,
> está marcado **(a confirmar com a tesouraria)**.

---

## Sumário

0. [O achado que organiza todo o resto](#0-o-achado-que-organiza-todo-o-resto)
1. [Plano de Contas Oficial](#1-plano-de-contas-oficial)
2. [Mapeamento: categorias atuais → categorias reais](#2-mapeamento-categorias-atuais--categorias-reais)
3. [Estrutura de centros de custo](#3-estrutura-de-centros-de-custo)
4. [Modelo de dados necessário](#4-modelo-de-dados-necessário)
5. [Tabelas novas](#5-tabelas-novas)
6. [Campos novos em tabelas existentes](#6-campos-novos-em-tabelas-existentes)
7. [Fluxo operacional — do lançamento ao fechamento trimestral](#7-fluxo-operacional--do-lançamento-ao-fechamento-trimestral)
8. [Protótipo das telas](#8-protótipo-das-telas)
9. [Estrutura do relatório trimestral](#9-estrutura-do-relatório-trimestral)
10. [Roadmap em fases](#10-roadmap-em-fases)

---

## 0. O achado que organiza todo o resto

Três medições mudam o tamanho deste projeto, para melhor:

1. **As 4 planilhas de 2025 usam o MESMO plano de contas, sem alterar uma vírgula.**
   Comparei programaticamente as 55 categorias de despesa das 4 abas "Plano de
   Contas" (1T, 2T, 3T+out, nov-dez): **diff vazio nos dois sentidos**. Não é uma
   convenção informal da tesouraria — é uma taxonomia fixa há pelo menos um ano
   inteiro. Isso vira o Plano de Contas Oficial da seção 1, palavra por palavra.

2. **Nenhuma célula do relatório é fórmula.** Testei: `Dizimos`, `Sustento Pastoral`,
   subtotal de `MINISTÉRIO PASTORAL` — todas são números digitados, não cálculos.
   Cruzando com o malote (`01. CAIXA BRADESCO/03.04.2025 - R$575,20 | NF001 |
   TALITA DE OLIVEIRA TRINDADE | PG BANKLINE.pdf` e outros ~15 arquivos do mesmo
   padrão): **o dado nasce estruturado no nome do comprovante, e alguém retotaliza
   à mão todo trimestre.** É esse passo manual que este projeto elimina — não é
   um relatório novo, é a mesma demonstração, sem a retotalização.

3. **Produção tem 7 lançamentos.** `fin_categorias` tem 34 linhas, mas só **4** são
   realmente referenciadas pelos 7 lançamentos reais (`Ofertas` ×1, `Dízimos` ×2,
   `Energia elétrica` ×1; os outros 3 lançamentos não têm categoria ou são
   transferência interna sem categoria). **O risco de migração de dado é
   essencially zero.** Isto muda a Fase 1 do roadmap: não precisa de um script de
   remapeamento cuidadoso linha a linha — dá pra fazer o reseed limpo e corrigir os
   4 lançamentos à mão, em produção, no tempo de um café.

**A estrutura de centros de custo (ministérios) já existe e já bate.** Consultei
`fin_centros_custo` em produção: 11 dos ~13 ministérios do Plano de Contas Oficial
já estão lá, seedados automaticamente a partir da tabela `ministerios` desde a Fase 7
do Financeiro (`Financeiro_F7_CentrosCusto.sql`). **O que falta não é essa estrutura —
é a lista de categorias e a ligação entre categoria e classificação contábil**, que
é exatamente o que a seção 1 e 2 resolvem.

---

## 1. Plano de Contas Oficial

Extraído das 4 planilhas (idêntico nas 4). Três eixos, não dois — este é o ponto que
uma leitura rápida da aba "Plano de Contas" não mostra, porque lá os eixos aparecem
como listas soltas (colunas independentes de um formulário de validação de dados).
**O eixo real só aparece na aba "Relatório"**, onde cada categoria se repete, em
branco, sob cada ministério — confirmando que **Categoria é uma lista plana,
reutilizável por qualquer ministério**, e não uma sub-conta fixa de um ministério
específico.

```
Classificação  →  Grupo (ministério)  →  [Subgrupo, só em Administração]  →  Categoria
```

### 1.1 Receitas

| Classificação | Categoria |
|---|---|
| Receitas Regulares | Dizimos |
| Receitas Regulares | Ofertas |
| Receitas Regulares | Ofertas para Missões |
| Outras Receitas | Descontos Obtidos |
| Outras Receitas | Rendimentos de Aplicações |

Receitas **não são quebradas por ministério** no relatório oficial — só por
classificação. (O sistema pode continuar registrando `centro_custo_id` em entradas
para uso interno — ex.: quanto a EBD Adultos arrecadou — isso já acontece em
produção hoje; só não entra na demonstração trimestral oficial.)

### 1.2 Despesas — a lista plana de 44 categorias

Se repete, idêntica, sob **cada um dos 13 ministérios** (confirmado varrendo as 784
linhas da aba "Relatório": o bloco de 44 nomes abaixo aparece 13 vezes, uma por
ministério, quase todo em branco, só preenchido onde houve gasto):

Salários · Prebenda · Férias · Rescisões · 13º Salário · INSS · FGTS · IRRF · PIS ·
Assessoria Saúde Ocupacional · Vale Transporte · Vale Refeição · Seguro de Vida ·
Sustento Pastoral · Sustento Pastoral Auxiliar · Outros Benefícios · INSS/IRRF ·
Aluguel · Condomínio · Água e Esgoto · Energia Elétrica · Telefonia · Material de
Escritório · Manutenção de Imobilizado · Seguros · IPTU · Contabilidade · Internet ·
Impostos e Taxas · Ofertas Preletores · Limpeza e Dedetização · Material de Consumo ·
Gás · Monitoramento · Serviço Prestado PF · Serviço Prestado PJ · Sistemas de
Informática · Aluguel de Equipamentos · Assinaturas e Mensalidades · Assistente
Musical · Dedetização · Móveis e Equipamentos em Geral · ISS · Outros Repasses
Missionários

### 1.3 Despesas Financeiras (não quebrada por ministério)

Juros · Multas · IOF · Tarifas Bancárias · Tarifa Cartão Crédito

### 1.4 Outras Despesas (não quebrada por ministério)

PENDÊNCIAS FINANCEIRO · Combustível · Assembleia Convenção Batista Brasileira ·
Outros Gastos Cartão · Doações e Contribuições

### 1.5 Os 13 grupos (ministérios) de despesa

Ministério Pastoral · Ministério de Educação Cristã · Ministério de Diaconia e Ação
Social · Ministério de Música · Ministério de Evangelismo e Missões · Ministério de
Comunhão, Integração e Crescimento · Ministério de Famílias · Ministério de Oração ·
Ministério Celebrando a Transformação · Ministério de Comunicação · **Ministério de
Administração** (único com subgrupo — ver 1.6)

> A aba "Plano de Contas" também lista "Ministério de Evangelismo" e "Ministério de
> Missões" como entradas separadas de "Ministério de Evangelismo e Missões" — mas
> nenhum dos dois aparece como cabeçalho de seção na aba "Relatório" nas 4 planilhas.
> Leio isso como resíduo da lista de validação de dados, não como grupo em uso —
> **a confirmar com a tesouraria** antes de descartar de vez.

### 1.6 O caso especial: Ministério de Administração tem 5 subgrupos

Só a Administração quebra o bloco de 44 categorias em 5 blocos menores, um por
subgrupo, cada um com as mesmas 44 categorias por baixo:

**Pessoal** · **Serviços** · **Ornamentação** · **Consumo** · **Patrimônio**

> Atenção a uma armadilha de nome: os "centros de custo" que já existem em produção
> sob `Min. Administração` (`Administração · Apoio Adm`, `Administração · Bazar`,
> `Administração · Cantina`, `Administração · Ornamentação`) são **áreas reais da
> igreja** (a tabela `areas`), e **não são os mesmos 5 subgrupos contábeis** acima —
> é coincidência o nome "Ornamentação" aparecer nos dois. Ver seção 3.3.

---

## 2. Mapeamento: categorias atuais → categorias reais

Produção hoje (`fin_categorias`, 34 linhas) contra o Plano de Contas Oficial (seção
1). Só **4 categorias têm lançamento de verdade hoje** (marcadas ★) — o resto é
mapeamento de baixo risco, não migração de dado histórico.

### 2.1 Receitas (9 atuais → 5 oficiais)

| Categoria atual | Ação | Categoria oficial |
|---|---|---|
| Dízimos ★ | manter (grafia) | Dizimos |
| Ofertas ★ | manter | Ofertas |
| Ofertas para Missões | manter | Ofertas para Missões |
| Rendimento aplicação | renomear | Rendimentos de Aplicações |
| Outras receitas | **descontinuar** — genérica demais, sem equivalente oficial | — |
| Campanhas | **manter fora do Plano Oficial** — usada pelo módulo Arrecadação/Campanhas (Missão 50k etc.), não entra na prestação de contas trimestral | — |
| Doações | **fundir com Ofertas** — decidido pela Telma em 12/09/2026 (executado na Fase 1) | Ofertas |
| Eventos | **manter fora do Plano Oficial** — confirmado pela Telma em 12/09/2026 (Fase 2); não entra na Prestação de Contas trimestral, só uso interno do módulo Arrecadação | — |
| Vendas (livraria) | **manter fora do Plano Oficial** — provável escopo do módulo Bazar/Cantina | — |

### 2.2 Despesas (25 atuais → 44+5+5 oficiais)

| Categoria atual | Ação | Categoria oficial |
|---|---|---|
| Água e esgoto | manter (capitalização) | Água e Esgoto |
| Aluguel | manter | Aluguel |
| Energia elétrica ★ | manter | Energia Elétrica |
| Impostos / taxas | manter | Impostos e Taxas |
| Material de escritório | manter | Material de Escritório |
| Salários CLT | renomear | Salários |
| Vale Transporte | manter | Vale Transporte |
| Tarifas bancárias | manter, mas migra de classificação | Tarifas Bancárias (Despesas Financeiras) |
| Prebenda pastoral | **desmembrar** — oficial trata "Prebenda" e "Sustento Pastoral" como categorias diferentes; hoje o sistema só tem uma | Prebenda **e** Sustento Pastoral |
| INSS / FGTS / Encargos | **desmembrar** — oficial separa INSS, FGTS e INSS/IRRF | INSS · FGTS · INSS/IRRF |
| Internet/telefone | **desmembrar** — oficial separa | Internet · Telefonia |
| Vale Alimentação | renomear (mesmo conceito) | Vale Refeição |
| Manutenção predial | mapear | Manutenção de Imobilizado |
| Manutenção equipamentos | mapear | Móveis e Equipamentos em Geral **ou** Manutenção de Imobilizado — a confirmar |
| Material de limpeza | mapear | Limpeza e Dedetização **ou** Material de Consumo — a confirmar |
| MEI (prestadores) | mapear | Serviço Prestado PJ |
| RPA (autônomos) | mapear | Serviço Prestado PF |
| Transporte/combustível | mapear (parcial) | Combustível (Outras Despesas) — a parte "transporte" que for benefício de funcionário vira Vale Transporte |
| Construção / reforma | **fundir com Manutenção de Imobilizado** — decidido pela Telma em 12/09/2026 (Fase 2) | Manutenção de Imobilizado |
| Diaconia / assistência | **corrigir o modelo, não a categoria** — "Diaconia" já é um centro de custo (`Min. Diaconia e Ação Social`). Isto hoje é usado como categoria quando deveria ser centro de custo; a categoria real seria a que descreve o gasto em si (ex. Material de Consumo, Outros Gastos Cartão) | — |
| Missões | **mesmo problema** — Missões é `Min. Evangelismo e Missões` (centro de custo). Categoria real mais próxima do gasto seria Outros Repasses Missionários | — |
| Materiais EBD | **manter fora do Plano Oficial** — específica do módulo EBD; se entrar no relatório oficial, reclassificar como Material de Consumo | — |
| Material de som | **a confirmar** — Móveis e Equipamentos em Geral, ou tratado como imobilizado fora do relatório corrente | — |
| Eventos / Almoço | **a confirmar** — sem equivalente único; varia por gasto real | — |
| Outras despesas | **manter como fallback controlado**, nunca como categoria-padrão de lançamento novo | — |

**Leitura de conjunto:** a maioria dos itens "a confirmar" restantes (Eventos,
Construção/reforma, e as aproximações documentadas de Manutenção de equipamentos,
Material de limpeza e Material de som) são despesas operacionais pequenas e pouco
frequentes — não travam o projeto, e a Fase 1 já resolve os dois pontos que
importavam de verdade: **Doações funde com Ofertas**, e **"Diaconia" e "Missões"
saem da lista de categoria e passam a existir só como centro de custo** — ambos
decididos pela Telma em 12/09/2026 e aplicados na Fase 1
([FASE1_MAPEAMENTO_CATEGORIAS.md](./FASE1_MAPEAMENTO_CATEGORIAS.md)).

---

## 3. Estrutura de centros de custo

### 3.1 O que já existe e já está certo

`fin_centros_custo` em produção (31 linhas), tipo `ministerio`, batendo com a seção
1.5:

`Min. Pastoral` · `Min. Educação Cristã` · `Min. Diaconia e Ação Social` ·
`Min. Música` · `Min. Evangelismo e Missões` · `Min. Comunhão, Integração e
Crescimento` · `Min. Famílias` · `Min. Oração` · `Min. Celebrando a Transformação` ·
`Min. Comunicação` · `Min. Administração`

**11 de 11 ministérios do Plano de Contas Oficial já têm centro de custo
correspondente.** Nada a criar aqui.

### 3.2 O que falta: os 5 subgrupos de Administração

Não existem hoje. Proposta: 5 novos `fin_centros_custo`, filhos de `Min.
Administração` via `centro_pai_id` (coluna que **já existe** desde a Fase 7 —
zero mudança de schema):

```
Min. Administração
 ├── Administração · Pessoal        (novo)
 ├── Administração · Serviços       (novo)
 ├── Administração · Ornamentação   (novo — accounting, não confundir com a área)
 ├── Administração · Consumo        (novo)
 └── Administração · Patrimônio     (novo)
```

### 3.3 A armadilha de nome: dois conceitos diferentes se chamam parecido

`fin_centros_custo` já tem, sob `Min. Administração`, quatro **áreas reais** vindas
da tabela `areas` (seed automático da Fase 7): `Administração · Apoio Adm`,
`Administração · Bazar`, `Administração · Cantina`, `Administração ·
Ornamentação`. Essas são **quem faz** o trabalho (a área da igreja). Os 5 subgrupos
da seção 3.2 são **como o gasto se classifica contabilmente** (Pessoal, Serviços,
Ornamentação...) — um eixo diferente, que por acaso reusa uma palavra
(`Ornamentação`). Recomendação: não fundir os dois. Manter os subgrupos contábeis
com um `vinculo_tipo` próprio (seção 6.1) para que a tela de lançamento consiga
diferenciar visualmente "área que gastou" de "classificação contábil do gasto" —
hoje `fin_centros_custo` não distingue isso, e são conceitos genuinamente diferentes.

### 3.4 Prioridade

Isto é o item de menor risco do projeto inteiro (a estrutura de 11 ministérios já
existe) e o subgrupo de Administração é o único trabalho novo — e é opcional para o
relatório funcionar: sem ele, o relatório ainda soma certo, só não abre a
Administração em 5 blocos como o Excel faz. Proposta: **entra na Fase 3, não na
Fase 1** (ver roadmap).

---

## 4. Modelo de dados necessário

Vista de conjunto — o que muda e o que não muda. Setas tracejadas são relações que
já existem; as com `(novo)` são as únicas propostas deste documento.

```
fin_contas ──────────┐
                      │
fin_categorias ───┐   │
  + classificacao_dre │            fin_lancamentos
  (novo, enum)     ├──┼──────────→  categoria_id
                    │  │             centro_custo_id
fin_centros_custo ──┘  │             conta_id
  + centro_pai_id      │             fechamento_id (novo) ─────┐
    (já existe)        │                                       │
  + vinculo_tipo        │                                      │
    'subgrupo_          │                                      ▼
     administracao'      │                          fin_fechamentos_trimestre (novo)
    (novo valor enum)    │                             ano, trimestre, status,
                         │                              saldo_anterior, fechado_em...
fin_lancamento_rateio ───┘
  (já existe, sem mudança)

fin_relatorio_notas (novo) ──→ (ano, trimestre, mes, categoria_id?, centro_custo_id?)
  nota narrativa por linha do relatório — o equivalente ao 💬 do Excel
```

**Por que tão pouca coisa nova.** `fin_lancamentos` já tem `categoria_id`,
`centro_custo_id`, `data_competencia`, `observacoes`, `comprovante_url`,
`documento_numero`, `forma_pagamento`, `audit_user_id`/`audit_em` — o schema atual
já foi desenhado prevendo isso (o comentário em `dreService.ts` linha 12 já
antecipava exatamente este dia: *"Se a Telma trouxer um plano de contas oficial
depois, é só popular `conta_contabil`..."*). O trabalho real é dado (seed do Plano
Oficial) e três peças que genuinamente não existem: a classificação fixa da
categoria, o fechamento do trimestre, e a nota narrativa por linha.

---

## 5. Tabelas novas

### 5.1 `fin_fechamentos_trimestre`

Controla o ciclo de vida do trimestre — o "Fechar e aprovar" que hoje é implícito
(a planilha vira PDF e é apresentada, sem estado nenhum no sistema).

```sql
create table public.fin_fechamentos_trimestre (
  id                uuid primary key default gen_random_uuid(),
  ano               int not null check (ano >= 2020 and ano <= 2099),
  trimestre         int not null check (trimestre between 1 and 4),
  status            text not null default 'aberto'
                      check (status in ('aberto','em_revisao','fechado','aprovado')),
  saldo_anterior    numeric(14,2),      -- snapshot do saldo ao abrir o trimestre
  saldo_final       numeric(14,2),      -- snapshot calculado ao fechar
  fechado_em        timestamptz,
  fechado_por       uuid references auth.users(id),
  aprovado_em       timestamptz,
  aprovado_por      uuid references auth.users(id),
  observacao_geral  text,               -- nota livre da diretoria, se houver
  created_at        timestamptz not null default now(),
  unique (ano, trimestre)
);
```

`status`: `aberto` (lançamentos normais) → `em_revisao` (tesouraria terminou de
lançar, revisando antes de fechar — lançamentos ainda editáveis, mas sinalizados) →
`fechado` (trava edição de lançamentos do período — ver seção 6.2) → `aprovado`
(diretoria validou; imutável de vez).

### 5.2 `fin_relatorio_notas`

O equivalente estruturado do comentário 💬 do Excel — hoje preso numa célula, sem
busca, sem histórico de quem escreveu.

```sql
create table public.fin_relatorio_notas (
  id              uuid primary key default gen_random_uuid(),
  ano             int not null,
  mes             int not null check (mes between 1 and 12),
  categoria_id    uuid references public.fin_categorias(id) on delete cascade,
  centro_custo_id uuid references public.fin_centros_custo(id) on delete cascade,
  nota            text not null,
  criado_por      uuid references auth.users(id),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index idx_fin_notas_periodo on public.fin_relatorio_notas(ano, mes);
```

`categoria_id` e `centro_custo_id` são **ambos opcionais e independentes** — uma
nota pode explicar uma categoria inteira no mês (ex. "Sustento Pastoral" em
maio/junho, como no exemplo real da planilha), um centro de custo inteiro, ou as
duas coisas juntas (a célula específica categoria×centro×mês). Não é 1:1 com
lançamento — no exemplo real, uma nota cobria *dois* meses e vários lançamentos ao
mesmo tempo ("Abril e Maio: Sustento com impacto do Dissídio... Junho: foi
adiantado..."), então a granularidade certa é por mês, uma nota por mês, e a
tesouraria escreve de novo se o mês seguinte precisar de outra nota — igual ao
Excel se comporta hoje.

---

## 6. Campos novos em tabelas existentes

### 6.1 `fin_categorias` — classificação contábil fixa

```sql
create type public.fin_classificacao_dre as enum (
  'receitas_regulares', 'outras_receitas',
  'despesas', 'despesas_financeiras', 'outras_despesas'
);

alter table public.fin_categorias
  add column classificacao_dre fin_classificacao_dre;
```

**Por que uma coluna nova, e não reaproveitar `conta_contabil` como o comentário em
`dreService.ts` sugeria.** `conta_contabil` tem nome de código de plano de contas
contábil de verdade (o que a contabilidade terceirizada poderia dar um dia — ex.
"3.1.01.002"), e isso ainda **não existe** aqui. O que temos das planilhas é mais
simples: 5 rótulos fixos de agrupamento do relatório. Usar `conta_contabil` para
isso hoje reservaria o campo certo para o propósito errado — se a contabilidade
trouxer um plano de contas de verdade depois, ele entra em `conta_contabil` sem
conflito nenhum com `classificacao_dre`, que continua servindo só o agrupamento do
relatório trimestral.

### 6.2 `fin_lancamentos` — vínculo com o fechamento

```sql
alter table public.fin_lancamentos
  add column fechamento_id uuid references public.fin_fechamentos_trimestre(id);
```

Nulo enquanto o trimestre estiver aberto. Ao fechar (seção 7.4), todo lançamento
`realizado`/`conciliado` do período recebe o `fechamento_id` correspondente — e uma
policy RLS nova barra `UPDATE`/`DELETE` em lançamento cujo `fechamento_id` aponta
para um fechamento com `status in ('fechado','aprovado')`, exceto para `admin`
(reabertura excepcional, sempre deixando rastro — ver seção 7.5).

### 6.3 `fin_centro_vinculo` — novo valor de enum

```sql
alter type public.fin_centro_vinculo add value if not exists 'subgrupo_administracao';
```

Usado só nos 5 centros de custo da seção 3.2, para a tela conseguir diferenciar
"subgrupo contábil" de "área ministerial" sem heurística de nome. Lembrete do
próprio `CLAUDE.md` (§6.3): `ALTER TYPE ... ADD VALUE` não roda na mesma transação
em que o valor é usado — a migration desta parte precisa ser separada da que insere
os 5 centros novos.

---

## 7. Fluxo operacional — do lançamento ao fechamento trimestral

```
1. LANÇAMENTO DO DIA A DIA
   Tesouraria registra entrada/saída em /financas/conta/:id (já existe)
   ou importa extrato OFX (já existe, Fase 7 do ERP) e concilia.
   → categoria_id + centro_custo_id sempre preenchidos (categoria fica mais
     rica com o Plano Oficial; centro já é bem servido pelos 11 ministérios).
   → comprovante_url recebe o PDF do malote (hoje avulso no Drive).

2. AO LONGO DO TRIMESTRE
   Painel da Tesouraria mostra, por mês, quanto já bate com o que o relatório vai
   precisar — reaproveita resumoFinanceiroMes() e resumoMensal(), já existentes.
   Pendências (sem comprovante, sem categoria, aguardando conciliação) continuam
   aparecendo ali, sem mudança — mas agora "sem categoria" pesa mais, porque
   categoria alimenta direto o relatório oficial.

3. FIM DO TRIMESTRE — REVISÃO
   Tesouraria abre a nova tela "Prestação de Contas Trimestral" (seção 8.3),
   ainda com o fechamento em 'aberto'. Vê a mesma grade do Excel, gerada ao vivo.
   Onde um número foge do padrão do trimestre anterior, escreve a nota (seção 5.2)
   — o equivalente ao 💬 de hoje, mas buscável e datado.
   Corrige o que faltar (lançamento sem categoria, sem comprovante) direto pelos
   links que o Painel da Tesouraria já oferece.

4. FECHAMENTO
   Tesouraria muda o status para 'em_revisao' → confere mais uma vez → 'fechado'.
   Ao fechar: sistema grava saldo_final, carimba fechamento_id em todo lançamento
   do período, e passa a bloquear edição desses lançamentos (seção 6.2).
   O relatório vira PDF (mesmo padrão de impressão já usado em outros documentos
   financeiros do sistema — `.relatorio-page` + `@media print`).

5. APROVAÇÃO
   Admin (ou quem a diretoria delegar) marca 'aprovado' depois de apresentar à
   diretoria. A partir daqui, reabrir exige ação explícita de admin com motivo
   registrado (não um simples toggle) — trimestre aprovado é documento final.

6. TRIMESTRE SEGUINTE
   Sistema já sabe o saldo_anterior (= saldo_final do fechamento anterior) e abre
   um novo fechamento em 'aberto' automaticamente no primeiro lançamento do
   trimestre novo, ou por ação explícita da tesouraria — a confirmar qual dos
   dois combina melhor com a rotina real dela.
```

**O que este fluxo elimina, na prática:** o passo de abrir o Excel, digitar 3 meses
de totais por categoria por ministério, e escrever os comentários de novo — que
hoje é 100% manual, comprovado pela ausência de fórmulas (seção 0). Tudo o resto
(lançar, conciliar, guardar comprovante) já é rotina do sistema hoje.

---

## 8. Protótipo das telas

Três telas novas, uma tabela nova de administração. Wireframes em texto — nada
disto é código, é para validar a forma antes de desenhar de verdade.

### 8.1 `/financas/admin/plano-de-contas` (nova aba dentro da tela de Configurações já existente)

```
┌─ Plano de Contas ──────────────────────────────────── [+ Nova categoria] ─┐
│ Filtro: [Todas ▾] [Receita | Despesa]      Busca: [____________]          │
│                                                                             │
│  RECEITAS REGULARES                                                        │
│    • Dizimos                                              [editar] [•••]  │
│    • Ofertas                                               [editar] [•••]  │
│    • Ofertas para Missões                                  [editar] [•••]  │
│  OUTRAS RECEITAS                                                           │
│    • Descontos Obtidos                                     [editar] [•••]  │
│    • Rendimentos de Aplicações                              [editar] [•••]  │
│  DESPESAS  (44 categorias — recolhido por padrão)          [expandir ▾]   │
│  DESPESAS FINANCEIRAS (5)                                   [expandir ▾]   │
│  OUTRAS DESPESAS (5)                                         [expandir ▾]   │
│                                                                             │
│  ⚠ 5 categorias fora do Plano Oficial (Campanhas, Eventos, Vendas...)      │
│     usadas por outros módulos — não entram na Prestação de Contas.        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 `/financas/fechamentos` (nova rota, papel tesouraria/admin)

```
┌─ Fechamentos Trimestrais ──────────────────────────────────────────────┐
│                                                                          │
│  2026                                                                   │
│  ┌────────────┬────────────┬────────────┬────────────┐                │
│  │ 1º Trim.   │ 2º Trim.   │ 3º Trim.   │ 4º Trim.   │                │
│  │ ● Fechado  │ ● Aprovado │ ○ Em rev.  │ ○ Aberto   │                │
│  │ 12 pend.   │ —          │ 3 pend.    │ 18 lanç.   │                │
│  │ [Ver]      │ [Ver PDF]  │ [Revisar]  │ [Revisar]  │                │
│  └────────────┴────────────┴────────────┴────────────┘                │
│                                                                          │
│  2025                                                                   │
│  1º · 2º · 3º · 4º — todos aprovados, histórico só-leitura             │
└──────────────────────────────────────────────────────────────────────┘
```

### 8.3 `/financas/prestacao-de-contas/:ano/:trimestre` — a tela central deste projeto

Réplica funcional da grade do Excel, gerada ao vivo de `fin_lancamentos`:

```
┌─ Prestação de Contas — 2º Trimestre 2026 ──────────────── [Exportar PDF] ┐
│                                            Abril      Maio      Junho    │
│ Saldo Anterior                          10.988,86  16.924,00  27.294,44 │
│                                                                           │
│ RECEITAS                                                                 │
│  RECEITAS REGULARES                     71.606,42  88.453,26 107.447,40 │
│    Dizimos                              60.564,71  75.540,15  81.179,21 │
│    Ofertas                               9.431,66   9.782,43   4.378,62 │
│    Ofertas para Missões                  1.610,05   3.130,68  21.889,57 │
│  OUTRAS RECEITAS                             2,30       4,39     305,92 │
│    Descontos Obtidos                         0,00       0,00     300,99 💬│
│    Rendimentos de Aplicações                 2,30       4,39       4,93 │
│  TOTAL RECEITAS                         71.608,72  88.457,65 107.753,32 │
│                                                                           │
│ DESPESAS                                                                 │
│  MINISTÉRIO PASTORAL                   -21.040,41 -22.207,33 -28.439,92 │
│    Sustento Pastoral                   -14.528,18 -13.048,09 -19.224,22 💬│
│    Outros Benefícios                    -6.512,23  -9.159,24  -9.215,70 💬│
│  MINISTÉRIO DE ADMINISTRAÇÃO             ...                            │
│    ▸ Pessoal · Serviços · Ornamentação · Consumo · Patrimônio          │
│  ...                                                                     │
│  TOTAL DESPESAS                                                          │
│                                                                           │
│ RESULTADO DO PERÍODO                                                    │
│ SALDO FINAL                                                             │
└──────────────────────────────────────────────────────────────────────┘
```

Cada `💬` abre a nota da seção 5.2 (ler, ou escrever se o trimestre ainda estiver
`aberto`/`em_revisao`). Linhas com valor zero nos 3 meses ficam recolhidas por
padrão — os 44×13 = 572 possíveis cruzamentos categoria×ministério da seção 1 não
cabem numa tela sem isso; o Excel resolve com scroll infinito (784 linhas), a tela
resolve escondendo o que não teve movimento, igual ao padrão "canal de estou vazio"
já usado em outras partes do sistema.

### 8.4 Modal de nota (usado a partir do 💬 da tela 8.3)

```
┌─ Nota — Sustento Pastoral · Junho/2026 ────────────────────┐
│                                                                │
│ [Abril e Maio: Sustento com impacto do Dissídio | Junho:    │
│  foi adiantado todo o salário que parte seria pago no       │
│  início de julho + adto de 1200 reais para exame Patrícia]  │
│                                                                │
│ Telma Silva · 12/09/2026 14:32                               │
│                                        [Cancelar]  [Salvar]  │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. Estrutura do relatório trimestral

Idêntica à planilha real, com uma mudança deliberada: **onde o Excel repete 44
categorias em branco sob cada ministério, o relatório do sistema esconde as que
tiveram valor zero nos 3 meses** — mesma informação, sem os ~500 blocos vazios que
hoje só existem porque uma planilha não sabe se esconder sozinha.

**Ordem e conteúdo, linha a linha:**

1. Cabeçalho: "Prestação de Contas — Nº Trimestre / Ano"
2. Saldo Anterior (3 colunas de mês)
3. **RECEITAS**
   - Grupo "RECEITAS REGULARES" (subtotal) → categorias com valor
   - Grupo "OUTRAS RECEITAS" (subtotal) → categorias com valor
   - **TOTAL RECEITAS**
4. **DESPESAS**
   - Um bloco por ministério com movimento no trimestre (subtotal em negrito) →
     categorias com valor, ordenadas por valor absoluto decrescente (não
     alfabético — é assim que a planilha real prioriza, deixando o que pesa mais
     no topo)
   - Ministério de Administração: mesmo bloco, mas subdividido nos 5 subgrupos
     quando a Fase correspondente (seção 3.2) estiver pronta; até lá, tratado
     como os outros 12
   - **TOTAL DESPESAS**
5. **DESPESAS FINANCEIRAS** (bloco à parte, sem ministério)
6. **OUTRAS DESPESAS** (bloco à parte, sem ministério)
7. **RESULTADO DO PERÍODO** = Total Receitas − Total Despesas − Despesas
   Financeiras − Outras Despesas
8. **SALDO FINAL** = Saldo Anterior + Resultado do Período (por mês, acumulado)

**Exportação:** PDF via o padrão de impressão já usado em outros documentos
financeiros do sistema (`.relatorio-page` + `@media print`) — reaproveitado, não
criado do zero. Uma exportação Excel/CSV é natural de acrescentar (o `dreService.ts`
já tem `gerarCSVDRE` como referência de formato), mas não é o formato que a
diretoria recebe hoje — prioridade é o PDF ficar indistinguível do que ela já
reconhece.

---

## 10. Roadmap em fases

Cada fase é aprovada e testada antes da próxima começar — nenhuma mexe em lançamento
histórico sem necessidade (o risco de dado real é baixo, seção 0.3, mas a disciplina
do projeto continua sendo: ensaiar com `BEGIN;...ROLLBACK;`, medir antes e depois).

| Fase | Entrega | Toca no banco? | Risco |
|---|---|---|---|
| **0** | Este documento, validado pela Telma | Não | — |
| **1** | ✅ **Aplicada 12/09/2026.** Plano de Contas Oficial: seed das 5 receitas + 44+5+5 despesas em `fin_categorias`, coluna `classificacao_dre` criada e populada, "Doações" fundida em "Ofertas", "Diaconia"/"Missões" descontinuadas como categoria. Migration: `20260912190000_fase1_plano_de_contas_oficial.sql` | Sim — 1 coluna + 1 enum + seed | Baixo (7 lançamentos em produção, nenhum quebrado — conferido) |
| **2** | ✅ **Aplicada 12/09/2026.** Eventos confirmado fora do Plano Oficial; Construção/reforma funde com Manutenção de Imobilizado. Migration: `20260912194500_fase2_fecha_mapeamento_eventos_reforma.sql`. Mapeamento da seção 2 fechado por completo. | Sim — 1 UPDATE de observação | Baixíssimo |
| **3** | ✅ **Aplicada 12/09/2026.** 5 subgrupos de Administração + novo valor de enum `subgrupo_administracao` — 2 migrations (o enum não pode ser usado na mesma transação em que nasce). Achado no ensaio: "Administração · Ornamentação" já existia como ÁREA com o nome idêntico — o subgrupo contábil levou o sufixo "(subgrupo contábil)" pra não colidir. `FinCentroVinculo` e os 3 lugares que o mapeiam para rótulo/cor (`FinancasCentros.tsx`, `FinancasCentroPrestacaoContas.tsx`) atualizados — o `tsc` achou os 3 sozinho depois que o tipo mudou. | Sim — 1 valor de enum + 5 linhas | Baixo |
| **4** | `fin_relatorio_notas` — tabela + modal da seção 8.4, sem ligar ainda ao relatório | Sim — 1 tabela nova | Baixo |
| **5** | Tela "Prestação de Contas Trimestral" (seção 8.3) — **somente leitura**, gerada ao vivo, sem fechamento ainda. Rodar em paralelo com a planilha por 1 trimestre real, comparando número a número | Não | — |
| **6** | `fin_fechamentos_trimestre` + fluxo de fechamento/aprovação (seção 7.4–7.5) + bloqueio de edição de lançamento fechado | Sim — 1 tabela + 1 coluna + policy RLS nova | Médio (mexe em regra de escrita) |
| **7** | Exportação PDF idêntica ao padrão apresentado hoje; aposentar a planilha depois de pelo menos 1 trimestre em que os dois bateram | Não | — |

A Fase 5 é o ponto de decisão real: só depois de um trimestre inteiro em que o
relatório do sistema bateu, número por número, com o que a tesouraria montaria à
mão, é que faz sentido confiar no fechamento formal (Fase 6) para valer como
documento oficial.

---

*Próximo passo: validar este documento com a Telma — em especial a seção 2 (os 5
itens "a confirmar") e a decisão da seção 7.6 (abrir trimestre novo automático ou
por ação explícita) — antes de iniciar a Fase 1.*
