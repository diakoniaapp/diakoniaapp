# Roadmap — Financeiro como ERP eclesiástico

> ## ✅ RESOLVIDO em 12/09/2026 — o bug que quebrava todo UPDATE em
> ## `fin_lancamentos`
>
> Achado testando o botão de aprovar/rejeitar desta entrega — mas era
> **independente dela**, pré-existente, e mais grave que tudo o mais
> neste documento: `fiscal_sincronizar_pagamento_trigger()` comparava
> `new.status = 'pago'`, valor que **nunca existiu** no enum
> `fin_lancamento_status` (era vocabulário de `fiscal_agenda.status`,
> copiado pro lugar errado) — e essa comparação falhava **sempre**, em
> **qualquer** UPDATE de `fin_lancamentos`, mesmo editar só `observacoes`.
>
> Token de gerenciamento renovado pela Telma; migration
> `20260912013100_conserta_gatilho_fiscal_que_quebrava_todo_update.sql`
> ensaiada com `BEGIN…ROLLBACK` (rodando os dois UPDATEs que antes
> quebravam, dentro da transação desfeita) e **aplicada em produção**.
> Confirmado ao vivo, duas vezes: direto por REST (editar observações +
> marcar como realizado, sem erro) e pelo botão real "Aprovar" em
> `/financas/agenda` (toast "Aprovado", item some da lista). Lançamentos
> de teste criados e apagados na mesma sessão — produção limpa,
> conferido por busca (`descricao ilike '%TESTE%'` → `[]`).

> Auditoria feita por medição direta (schema gerado, migrations, código —
> **não** pela API de gerenciamento: o token de sessão estava expirado/sem
> escopo em 12/09/2026, `401 Unauthorized`; refazer com token novo se quiser
> confirmar linha a linha em produção). Data: 12/09/2026.
>
> **Achado central da auditoria:** o módulo Financeiro é muito mais completo
> do que a missão original presumia. Não é "construir um ERP do zero sobre uma
> base simples" — é **terminar de ligar um schema que já foi desenhado como
> ERP** e nunca foi totalmente exposto na tela. Boa parte do Gap Analysis
> abaixo é sobre isso: campo/enum/tabela já existe, UI não usa.

---

## Fase 1 — Matriz de auditoria

Legenda: 🟢 EXISTE (schema + RLS + service + tela, em uso) · 🟡 EXISTE PARCIAL
(schema pronto, tela ausente ou incompleta) · 🔴 NÃO EXISTE.

### Tabelas `fin_*` (23) e `fiscal_*` (5)

| Tabela | Estado | Nota |
|---|---|---|
| `fin_contas` | 🟢 | tipo inclui `pix`, `cartao`, `aplicacao`, `cofre` — não só banco/caixa |
| `fin_categorias` | 🟢 | tem `conta_contabil` (código contábil) — **não usado em relatório nenhum ainda** |
| `fin_centros_custo` | 🟢 | `vinculo_tipo`: `ministerio\|area\|ebd_classe\|pgm_grupo\|campanha\|geral` — falta `evento` na tela (existe no enum do banco, o tipo TS não o lista — ver Gap 2.2) |
| `fin_lancamentos` | 🟢 | `pessoa_id` e `familia_id` já linkam o lançamento a quem deu/recebeu; `status` já tem `conciliado` e `aguardando_aprovacao` — **os dois sem ação nenhuma na tela (ver Fase 3, item já implementado)** |
| `fin_lancamento_rateio` | 🟡 | rateio de um lançamento entre centros de custo — schema existe, **não achei tela que o exponha** |
| `fin_orcamentos` | 🟢 | `/financas/orcamento`, planejado × realizado |
| `fin_recorrencias` | 🟢 | `/financas/recorrencias` — genérico, serve dízimo recorrente sem ser rotulado assim |
| `fin_fornecedores` | 🟢 | inclui `chave_pix` |
| `fin_contratados` + `fin_folha_*` + `fin_tabela_inss_empregado` + `fin_tabela_irrf` | 🟢 | `/financas/folha` — CLT completo, calculadora com INSS/IRRF |
| `fin_vinculo_tipo` (enum) | 🟢 | `clt\|mei\|rpa\|prebenda\|estagio\|voluntario_remunerado` — **já cobre prebenda pastoral**, termo eclesiástico específico |
| `fin_estoque_itens/_movimentos` | 🟢 | `/financas/estoque` |
| `fin_reunioes_financeiras` + `fin_decisoes_reuniao` | 🟢 | `/financas/reunioes` |
| `fin_solicitacoes` | 🔴 | **RLS ligada, ZERO políticas — bloqueia tudo.** Colunas: `area_id, ministerio_id, valor, descricao, status, data_solicitacao/aprovacao/pagamento`. Zero código a referencia. É literalmente uma tabela de "solicitação de despesa por área/ministério" pronta e nunca ligada — ver Gap 3.1 |
| `fiscal_obrigacoes_ativas` + `fiscal_agenda` + `fiscal_documentos` + `fiscal_config` + `fiscal_tipos_obrigacao` | 🟢 | `/financas/fiscal` — obrigações, malote mensal, ingestão de nota por OCR |

### Views e RPCs de leitura

| Objeto | Estado | Nota |
|---|---|---|
| `vw_fin_proximos_vencimentos` | 🟢 | alimenta `/financas/agenda` |
| `fin_previsao_caixa` | 🟢 | `/financas/insights` — 30/60/90 dias |
| `fin_alertas_financeiros` / `fin_alertas_centros` | 🟢 | Painel da Tesouraria |
| `fin_comparativo_meses` / `fin_anomalias_mes` | 🟢 | `/financas/insights` |
| `fin_top_fornecedores` | 🟢 | `/financas/insights` |
| `fin_exec_indicadores_eclesiasticos` | 🟡 | **já existe e já roda** na Visão Executiva — dízimo/oferta/missões por categoria de texto, com variação % mês a mês e total do ano. É 70% de uma DRE, mas é uma LISTA de indicadores, não uma demonstração contábil formal (ver Gap 4.4) |
| `fin_exec_saldo_consolidado` / `fin_exec_centros_ano` / `fin_exec_alertas` | 🟢 | Visão Executiva — corrigidos em 09/09/2026 (3 bugs SQL reais) |
| `fiscal_resumo_dashboard` / `fiscal_insights` / `fiscal_historico_medio` | 🟢 | `/financas/fiscal` |

### Telas (`pages/`, `pages/financas/`)

| Tela | Rota | Estado |
|---|---|---|
| Tesouraria (hub) | `/financas` | 🟢 |
| Extrato da conta | `/financas/conta/:id` | 🟢 |
| Agenda (a pagar/receber) | `/financas/agenda` | 🟢 — **agora também "Aguardando aprovação", ver Fase 3** |
| Recorrências | `/financas/recorrencias` | 🟢 |
| Relatório mensal (malote) | `/financas/relatorio` | 🟢 — por categoria, por conta, CSV, impressão |
| Estoque | `/financas/estoque` | 🟢 |
| Insights | `/financas/insights` | 🟢 |
| Centros de custo | `/financas/centros` + `/financas/centro/:id` | 🟢 |
| Orçamento | `/financas/orcamento` | 🟢 |
| Folha & Encargos | `/financas/folha` | 🟢 |
| Módulo Fiscal | `/financas/fiscal` | 🟢 |
| Reuniões financeiras | `/financas/reunioes` | 🟢 |
| Visão Executiva | `/financas/executivo` | 🟢 — dashboard com gráficos (recharts), indicadores eclesiásticos |
| Painel da Tesouraria | `/painel-tesouraria` | 🟢 — 4 sprints, 6 blocos, no ar desde 09/09 |
| **Conciliação bancária** | botão "Conciliar" existe, **leva para `/financas` genérico** | 🔴 |
| **Aprovação de despesas** | — | 🔴 → 🟢 nesta entrega (ver Fase 3) |
| **Doações (tela dedicada)** | `/financas/doacoes`, no menu Financeiro | 🟢 nesta entrega |
| **Prestação de contas exportável** | `/financas/centro/:id/prestacao-contas` — documento formal, imprimível/PDF/CSV | 🟢 nesta entrega |
| **DRE Eclesiástica formal** | Visão Executiva cobre o conteúdo, não o formato | 🟡 |
| **Importação de extrato (OFX/CSV bancário)** | — | 🔴 |

---

## Fase 2 — Gap Analysis (Omie / Conta Azul / ERPNext / Asaas / Dynamics 365 F&O)

Comparação **funcional**, não de nomenclatura — o que essas ferramentas
resolvem que o Diakonia ainda não resolve, e o que **já** resolve por um
caminho diferente (não deve ser reconstruído):

| Capacidade | Nos ERPs comerciais | No Diakonia hoje | Veredito |
|---|---|---|---|
| Lançar receita/despesa, categorizar, vincular a centro de custo | ✔ | ✔ (`fin_lancamentos` + `fin_categorias` + `fin_centros_custo`) | **Já tem** |
| Orçado × realizado | ✔ | ✔ (`/financas/orcamento`) | **Já tem** |
| Fluxo de caixa projetado | ✔ | ✔ (`fin_previsao_caixa`, 30/60/90d) | **Já tem** |
| Contas a pagar/receber com alerta de vencimento | ✔ | ✔ (`/financas/agenda`) | **Já tem** |
| Recorrência de lançamento | ✔ | ✔ (`fin_recorrencias`) | **Já tem** |
| Multi-conta (banco, caixa, PIX, cofre, aplicação) | ✔ | ✔ (`fin_contas.tipo`) | **Já tem** |
| Folha de pagamento CLT | ✔ (módulo à parte, geralmente pago) | ✔ (`/financas/folha`, INSS/IRRF) | **Já tem, e de graça** |
| **Aprovação de despesa antes de pagar** | ✔ (Omie: "aprovação de contas a pagar"; Dynamics: fluxo configurável) | 🔴 até hoje | **Gap real — fechado nesta entrega, versão simples** |
| **Conciliação bancária (importar extrato e casar com lançamento)** | ✔ (todos os 5 comparados) | 🔴 — nem manual existe | **Maior gap técnico real** |
| **DRE / Balancete no formato contábil** (Receita Bruta → Deduções → Despesas por grupo → Resultado) | ✔ | 🟡 — o dado está todo lá (`conta_contabil`, indicadores eclesiásticos), falta o FORMATO da demonstração | **Gap de apresentação, não de dado** |
| **Prestação de contas gerável/exportável por centro** | parcial nos genéricos; **é o diferencial eclesiástico** — igreja presta contas a doadores e à assembleia, empresa não | 🟡 — o detalhe por centro existe na tela, falta virar documento (PDF/impressão) como já existe para o relatório mensal | **Gap pequeno — reaproveita o padrão de impressão que já existe em 7 relatórios do sistema** |
| **CRM de doador / histórico de contribuição por pessoa** | ✔ (Conta Azul, Asaas — é modelo "cliente") | 🟡 — `pessoa_id` no lançamento já existe e já é resolvido para nome; **não há relatório "quanto Fulano contribuiu"** | **Decisão de produto antes de tecnologia — ver Nota de Privacidade abaixo** |
| **Emissão de recibo de doação (dedutibilidade, Lei 9.532)** | ✔ (Asaas tem nativo) | 🔴 | Fora do escopo desta entrega — é feature nova, não gap de UI |
| **Gateway de cobrança (boleto, link de pagamento, PIX cobrança)** | ✔ | 🔴 (o sistema REGISTRA que entrou dinheiro; não GERA cobrança) | Fora do escopo — decisão de produto grande (gateway = contrato, taxa, PCI) |
| **Multi-empresa / centro de lucro consolidado** | ✔ | N/A — mono-igreja por desenho (AD-3 do sistema) | **Não se aplica**, não é gap |
| **Auditoria/trilha de quem alterou o quê** | ✔ | 🟡 — `fin_lancamentos.audit_user_id`/`audit_em` já existem como colunas; não verificado se todo UPDATE os preenche | Vale conferir, baixo esforço |

### Nota de privacidade — doador

Antes de construir "CRM de doador" / relatório "quem deu quanto": em muitas
tradições batistas a contribuição é vista como ato entre a pessoa e Deus, e
expor "ranking de doadores" ou até um extrato individual sem pedir tem
implicação pastoral, não só técnica. O dado técnico já permite (é
`pessoa_id` em `fin_lancamentos`); a pergunta de **quem pode ver o quê** —
só a própria pessoa? só tesouraria para fins de recibo de IR? ninguém além
de quem lançou? — é uma decisão da Telma antes de eu desenhar a RLS.
**Não construído nesta entrega; listado no roadmap como item que precisa de
uma resposta dela primeiro (Fase 3, "Pendente de decisão").**

---

## Fase 3 — Nomenclatura Diakonia (já em vigor na maior parte)

O sistema **já não usa nomenclatura empresarial** — conferido no código, não
suposto:

| Termo empresarial | Termo já usado no Diakonia |
|---|---|
| Cliente | *(não existe o conceito — quem dá é `pessoa_id`, ligado a `membros`)* |
| Projeto / Centro de custo | **Centro de custo** vinculado a `ministerio\|area\|campanha\|ebd_classe\|pgm_grupo` — já usa os nomes reais da igreja, não "projeto 1", "projeto 2" |
| Unidade de negócio | **Ministério** / **Área** |
| Receita (genérico) | A categoria já é livre: "Dízimo", "Oferta", "Missões", etc. — texto, não enum fechado, então a igreja nomeia como quiser |
| Funcionário | `fin_vinculo_tipo` já distingue `clt\|mei\|rpa\|prebenda\|estagio\|voluntario_remunerado` — **"prebenda" é o termo certo para o sustento pastoral**, não "salário" |

**Não há trabalho de renomeação a fazer** — quando cheguei a procurar
"cliente"/"projeto" cru no módulo financeiro, não achei. O sistema já nasceu
com vocabulário de igreja aqui.

---

## Fase 3 — Implementação: o que entra nesta entrega, e o que fica para depois

Dado o tamanho do pedido (8 subsistemas, cada um author-completo — migration,
RLS, service, componente, página, rota, menu, teste, doc), e que isto é um
sistema financeiro de produção **sem ambiente de homologação**, **não vou
gerar as 8 frentes de uma vez sem checkpoint**. Seguindo a própria disciplina
que a missão pede ("para cada recurso: migration → RLS → service → tela →
teste → doc", um recurso de cada vez) e a prática já estabelecida neste
projeto (rehearse com `BEGIN/ROLLBACK`, `tsc`/`vitest` limpos por commit,
commit por mudança lógica):

### ✅ Implementado nesta entrega — Aprovação de despesas (versão 1)

O gap mais barato e mais real: `fin_lancamentos.status` já tem
`aguardando_aprovacao`, o Painel da Tesouraria já LISTA essas pendências
("aguardando aprovação" aparece na seção Pendências) — mas **não existia, em
lugar nenhum do sistema, um botão que aprove ou rejeite**. A própria
`painelTesourariaService.ts` já tinha o comentário: *"'aguardando aprovação'
é decisão — alguém precisa dizer sim ou não"* — e ninguém podia.

- `finService.ts`: `aprovarLancamento(id)` (`status → realizado`, carimba
  `data_pagamento = hoje`) e `rejeitarLancamento(id, motivo)`
  (`status → cancelado`, guarda o motivo em `observacoes`) — os dois via
  `atualizarLancamento()`, que já usa `conferir()`.
- `FinancasAgenda.tsx`: nova seção "Aguardando aprovação", acima dos
  vencimentos por urgência, com os dois botões.
- Corrigido de caminho: o link "Abrir Tesouraria" da seção Pendências do
  Painel da Tesouraria ia para `/financas` (hub genérico, sem filtro nenhum)
  — agora vai para `/financas/agenda`, onde a decisão realmente pode ser
  tomada.

**Sem migration nesta v1 — de propósito.** Escrita a v1 sem acesso de escrita
ao banco (token expirado naquele momento), ela usa só colunas que **já
existem e já funcionam** (`status`, `observacoes`) — o botão aprova/rejeita
de verdade, sem depender de nada novo no banco.

**Achado ao procurar onde carimbar "quem aprovou, quando" (12/09/2026):**
`fin_lancamentos` **já tem** `audit_user_id uuid` (FK para `profiles`) e
`audit_em timestamptz` — colunas de auditoria genérica que existem desde a
criação da tabela e que **nenhuma linha de código do sistema preenche**.
Mesmo padrão de sempre neste projeto: infraestrutura pronta, nunca ligada.
**Não wireei nesta entrega** — são colunas de "quem mexeu por último",
genéricas para QUALQUER escrita, não específicas de aprovação; usá-las só
para aprovar/rejeitar misturaria os dois sentidos (uma edição de descrição
depois da aprovação sobrescreveria o carimbo de quem aprovou). Ligar
`audit_user_id`/`audit_em` direito é trabalho maior — em `atualizarLancamento()`,
para toda escrita, não só a de aprovação — e fica registrado aqui como
achado, não como pendência desta feature.

**Escopo deliberadamente de UM NÍVEL só** (quem tem papel `admin`,
`diakonia`, `secretaria` ou `tesouraria` aprova — o mesmo grupo que já pode
escrever em `fin_lancamentos` hoje). **Não construí o nível "Solicitante"**
(ministério pede, tesouraria aprova) — ver "Pendente de decisão" abaixo, é
uma reversão de uma decisão já tomada neste projeto e precisa da Telma.

### 🔜 Pendente de decisão da Telma antes de eu continuar

1. **"Solicitante" no fluxo de aprovação — quem pode pedir?** A migration
   `20260902210000_lideranca_nao_opera_o_financeiro.sql` fechou de propósito
   o acesso de `lideranca` a `fin_lancamentos` ("liderança não opera o
   financeiro"). Um fluxo Solicitante→Tesouraria→Administração→Pastor, do
   jeito que a missão descreve, **pressupõe que um líder de ministério possa
   pedir** — o que reabre essa porta. Perguntado em 12/09/2026 (item 8 do
   roadmap abaixo):
   - **Cadeia de aprovação: RESPONDIDA.** Solicitante → Tesouraria só
     (tesouraria aprova/rejeita direto — mesmo grupo que já decide
     `aguardando_aprovacao` hoje). **Não** é o fluxo de 4 etapas da missão
     original.
   - **Quem pode solicitar: AINDA EM ABERTO.** A Telma respondeu "ainda não
     sei, quero pensar mais" — não construir nada de item 8 até ela voltar
     com uma resposta (líder de ministério? só quem já opera o financeiro
     hoje? outro grupo?). A pergunta certa a fazer quando ela retomar é só
     essa — a cadeia já está decidida.
2. **Doador — quem vê o extrato de quem deu?** Ver a Nota de Privacidade
   acima.
3. ~~**Conciliação bancária — qual banco, qual formato?**~~ Respondida em
   12/09/2026: a Telma trouxe um extrato real do Bradesco (OFX, exportado
   09/09/2026). Construída no mesmo dia — ver item 7 abaixo.
4. ~~**DRE Eclesiástica formal — qual modelo?**~~ Construída em 12/09/2026
   sem resposta a esta pergunta — "pode seguir" foi entendido como usar um
   modelo genérico em vez de esperar. `FinancasDRE.tsx`/`dreService.ts`
   agrupam por NOME de categoria (Contribuições, Pessoal, Administrativas,
   Instalações, Ministeriais...), não por um plano de contas oficial —
   `conta_contabil` continua NULL em todas as 33 categorias. Se a Telma
   trouxer depois um modelo de referência real (da contabilidade ou da
   convenção — CBB ou outro), o remapeamento é barato: trocar o mapa de
   grupos em `dreService.ts` (ou popular `conta_contabil` e agrupar por
   ele) — nenhum lançamento precisa mudar de lugar.

### 📋 Roadmap do que falta, sem precisar de decisão prévia (posso seguir sozinho quando ela pedir)

Em ordem de esforço crescente:

| # | Item | Esforço | Reaproveita |
|---|---|---|---|
| ~~1~~ | ~~**Prestação de contas exportável por centro de custo**~~ — **FEITO em 12/09/2026**. `FinancasCentroPrestacaoContas.tsx` (`/financas/centro/:id/prestacao-contas`, botão em `FinancasCentroDetalhe.tsx`), mesmo padrão de impressão/PDF dos outros 7 relatórios. Cobre de graça os quatro "Por Ministério/Campanha/Evento/Projeto Social" da missão — são o mesmo relatório sobre o mesmo `fin_centros_custo`, só o `vinculo_tipo` muda o rótulo. Seletor "todo o período" (padrão) ou por ano — um centro de custo não tem data de início/fim guardada. Verificado ao vivo com 3 lançamentos de teste (criados e apagados na sessão): demonstrativo, categorias, tabela e CSV bateram | pequeno | padrão de impressão existente, `fin_centros_custo`, `listarLancamentos` |
| ~~2~~ | ~~**`fin_centro_vinculo` "evento" na UI**~~ — **FEITO em 12/09/2026**. `FinCentroVinculo` (finService.ts) e `VINCULO_LABEL`/`VINCULO_COR` (`FinancasCentros.tsx`, `FinancasCentroPrestacaoContas.tsx`) agora incluem `evento`. Trocado o comentário antigo (que dizia o enum não tinha esse valor — estava errado, conferido direto no Postgres) por um explicando a razão real de nenhum centro `evento` existir ainda: `fin_seed_centros_custo()` — única forma de um centro nascer, não há criação manual — não tem passo para eventos, e decidir quais eventos merecem centro próprio é decisão pastoral/administrativa, não técnica. Sem migration — só front-end, o enum do banco já suportava | pequeno | — |
| ~~3~~ | ~~**Rateio de lançamento entre centros**~~ — **FEITO em 12/09/2026**. `LancamentoForm.tsx`: link "Dividir este valor entre vários centros de custo" troca o Select único por uma lista de linhas (centro + percentual), com indicador ao vivo de "X% de 100%" e validação (mínimo 2 linhas, soma = 100% ±0,01) antes de liberar salvar. O lançamento em si grava `centro_custo_id` = centro de maior percentual ("centro principal", para os relatórios que ainda somam por um único centro); o detalhe completo vai para `fin_lancamento_rateio` via `salvarRateio()` (delete-then-insert). `finService.ts`: `listarRateio`/`salvarRateio` novos. Verificado ao vivo pela UI real (não só REST): saída de R$300 dividida 60%/40% entre dois centros — conferido `centro_custo_id` (venceu o de 60%) e as duas linhas de `fin_lancamento_rateio` (`60%→R$180`, `40%→R$120`) direto no banco | médio | tabela `fin_lancamento_rateio` pronta |
| ~~4~~ | ~~**Tela "Doações"**~~ — **FEITO em 12/09/2026**. `FinancasDoacoes.tsx` (`/financas/doacoes`, no menu Financeiro): total do mês, por forma de pagamento (barra + ícone por PIX/Dinheiro/Cartão/Transferência/Boleto/Envelope), por categoria, recorrentes ativas (`fin_recorrencias` tipo entrada), lista do mês com navegação mês a mês. Estilo bancada de trabalho, não relatório imprimível (esse já existe — Prestação de Contas). Verificado ao vivo com 3 lançamentos + 1 recorrência de teste | médio | tudo já existia, era composição de tela nova |
| ~~5~~ | ~~**DRE Eclesiástica no formato de demonstração**~~ — **FEITO em 12/09/2026**. `FinancasDRE.tsx` (`/financas/dre`, `/financas/dre/:ano`, no menu Financeiro e com atalho na Visão Executiva) — mesmo padrão de impressão/PDF dos outros relatórios, mas no FORMATO de demonstração (Receitas por grupo → Total → Despesas por grupo → Total → Resultado do Período), não a lista solta "por categoria" que o malote e a prestação de contas já mostram. `dreService.ts` novo: agrupa por NOME de categoria (Contribuições, Campanhas e Eventos, Doações, Receitas Financeiras / Despesas com Pessoal, Administrativas, Instalações, Ministeriais), porque `fin_categorias.conta_contabil` está NULL nas 33 categorias em produção — conferido direto no banco — não havia plano de contas oficial pra reaproveitar, e a Telma não trouxe um modelo de referência (item 4 das decisões pendentes, abaixo). Categoria fora do mapa cai em "Outras" — nunca some da demonstração. Sem migration — é agrupamento em memória sobre `fin_lancamentos`/`fin_categorias` que já existem. Anual (não mensal — o malote já cobre o mês). Acesso restrito a `ROLES_PASTORAL_SEM_TITULAR`, mesma malha da Visão Executiva (documento de leitura estratégica, não operação diária de tesouraria). Verificado ao vivo com 7 lançamentos de teste cobrindo os 7 grupos (4 receita + 3 despesa): cada subtotal de grupo, o total de receitas (R$1.400), total de despesas (R$1.020) e o resultado (+R$380) bateram exatamente; navegação entre anos e estado vazio também testados | médio-alto | `fin_lancamentos`, `fin_categorias` — nenhuma RPC nova |
| ~~6~~ | ~~**Conciliação manual**~~ — **FEITO em 12/09/2026**. `FinancasConta.tsx`: badge de situação clicável em cada lançamento `realizado`/`conciliado` (alterna direto, sem diálogo — reversível: "bateu com o extrato" ⇄ "desfazer"). Checkbox por linha (só em `realizado`) + botão "Conciliar N" no cabeçalho para conciliar em lote (`conciliarEmLote()`, usa `conferir()`). `finService.ts`: `conciliarLancamento`, `desconciliarLancamento`, `conciliarEmLote` novos — nenhuma migration, só liberam o status `conciliado` que já existia no enum. Verificado ao vivo: toggle individual ida-e-volta confirmado, e o fluxo em lote (selecionar via checkbox → "Conciliar 1" → toast "1 lançamento conciliado" → status muda, checkbox some) | médio | status `conciliado` já existia no enum |
| ~~7~~ | ~~**Importação de extrato (OFX)**~~ — **FEITO em 12/09/2026**. Extrato real do Bradesco (OFX, exportado 09/09/2026) confirmou o formato: OFX 1.02/SGML, `CHARSET:1252` (Windows-1252 — sem isso, nome com acento vira lixo), `TRNAMT` com vírgula decimal. **Achado no arquivo real**: `DTPOSTED` não é sempre o dia de verdade — o Bradesco agrupa vários dias sob uma única data quando há fim de semana/feriado no meio; o casamento usa uma janela de ±5 dias por causa disso, não igualdade exata. `ofxService.ts` faz o parse e casa cada transação do extrato com um lançamento `realizado` já existente (mesmo tipo, mesmo valor, dentro da janela) — **nunca cria lançamento novo**: categoria e centro de custo são decisão de quem lança, o MEMO do banco não basta pra adivinhar os dois com segurança. `ConciliacaoOFXDialog.tsx` (botão "Importar OFX" em `FinancasConta.tsx`, só em contas `tipo: banco`) mostra o que casou e concilia em lote reaproveitando `conciliarEmLote` do item 6; o que não casou fica listado para lançar/conferir à mão. Sem migration — nenhum FITID é guardado: como só CONCILIA (nunca cria), reimportar um extrato com sobreposição de datas é idempotente por natureza (marcar `conciliado` de novo não faz nada). Limite documentado no código: duas transações de mesmo valor/dia com dois lançamentos iguais no sistema caem em "ambíguo" em vez de casar 1-para-1 — errar para o lado de pedir revisão manual é a escolha certa em dado financeiro. 16 testes automatizados (parse, encoding, casamento, incluindo o caso guloso de duplicata) + verificação à parte contra o arquivo real de produção (156 transações, decodificação correta confirmada, um lançamento de teste casado com a transação certa do banco) — o arquivo real tem nome e valor de doadores de verdade e por isso não virou fixture do repositório | alto | `fin_lancamentos` (`conciliarEmLote`, já existente) — nenhuma migration |
| 8 | **Fluxo de aprovação multinível** | alto (é decisão de RLS nova) | depende do item 1 da lista de decisões |

---

*Este documento é o plano; `DOCUMENTACAO_SISTEMA.md` continua sendo o
retrato do sistema inteiro. Atualizar os dois quando um item da lista acima
for fechado.*
