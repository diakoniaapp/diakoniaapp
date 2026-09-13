# Roadmap — Financeiro como ERP eclesiástico

> ## ✅ RESOLVIDO em 12/09/2026 — transferência entre contas contando como
> ## receita/despesa em 3 telas
>
> Achado pela Telma olhando a DRE: "ainda mostra a soma de entradas, quando
> na verdade uma parte foi transferência". `transferir()` (finService.ts)
> grava uma transferência como DOIS lançamentos (saída na origem + entrada
> no destino, `origem: "transferencia"`, sem categoria) — e três lugares
> somavam os dois lados como se fossem dinheiro real entrando/saindo da
> igreja, em vez de dinheiro só mudando de bolso: `dreService.gerarDRE`,
> `finService.resumoMensal` (malote contábil) e `FinancasDoacoes.tsx`
> (uma transferência Caixa→Bradesco aparecia como "doação"). Mesma causa
> já corrigida em `vw_fin_resumo_mes` no dia 12/09 mais cedo — não tinha
> sido propagada para estes três.
>
> Corrigido filtrando `origem !== "transferencia"` nos TOTAIS e na quebra
> por categoria dos três; a quebra **por conta** do malote e a **lista de
> lançamentos** continuam mostrando a transferência — ali ela é movimento
> real daquela conta específica, esconder seria o erro oposto. Verificado
> ao vivo com a transferência real de R$2.000 já em produção: DRE caiu de
> R$4.222/R$2.050 para R$2.222/R$50 (receita/despesa corretas, superávit
> não mudou — os R$2.000 inflavam os dois lados igualmente); malote e
> Doações bateram a mesma correção.
>
> **✅ Auditoria concluída em 13/09/2026** — token novo trazido pela
> Telma. Lidas as 9 funções (`fin_anomalias_mes`, `fin_comparativo_meses`,
> `fin_top_fornecedores`, `fin_previsao_caixa`, `fin_exec_saldo_
> consolidado`, `fin_exec_indicadores_eclesiasticos`, `fin_exec_centros_
> ano`, `fin_exec_alertas`, `fin_exec_fluxo_12m`) via `pg_get_functiondef`
> — nenhuma tinha migration própria no repositório (drift confirmado,
> mesmo padrão já visto noutros lugares deste banco). Duas tinham o bug
> (somavam entrada/saída por mês sem exigir categoria/centro/fornecedor,
> que é o que naturalmente excluiria a transferência): `fin_comparativo_
> meses` e `fin_exec_fluxo_12m` (alimenta o gráfico de 12 meses da Visão
> Executiva). As outras 7 são seguras por desenho — exigem `categoria_id`,
> `centro_custo_id` ou `fornecedor_id` (que transferência não tem), somam
> todas as contas juntas (as duas pernas se cancelam), ou só olham
> `status='previsto'` (transferência nasce `'realizado'`).
>
> Corrigidas as duas via `20260913120000_visao_executiva_exclui_
> transferencia_e_null_safe.sql`, ensaiada com `BEGIN...ROLLBACK` e
> aplicada. De brinde: o filtro `origem <> 'transferencia'` usado aqui e
> em `vw_fin_resumo_mes` não era NULL-safe (`origem` é nullable) — trocado
> por `IS DISTINCT FROM` nas três funções, sem mudar nenhum resultado
> hoje (zero linhas com `origem` nulo em produção), só fechando a
> brecha para o futuro. Verificado ao vivo: `fin_comparativo_meses(3)`
> caiu de R$4.222,00/R$2.050,00 pra R$2.222,00/R$50,00 em setembro,
> batendo com a DRE e o malote já corrigidos ontem.

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
| **CRM de doador / histórico de contribuição por pessoa** | ✔ (Conta Azul, Asaas — é modelo "cliente") | 🟡 — `pessoa_id` no lançamento já existe e já é resolvido para nome; **não há relatório "quanto Fulano contribuiu"** | **Decisão de privacidade RESOLVIDA em 12/09/2026 (ver Nota abaixo) — a tela em si continua não construída, ninguém pediu ainda** |
| **Emissão de recibo de doação (dedutibilidade, Lei 9.532)** | ✔ (Asaas tem nativo) | 🔴 | Fora do escopo desta entrega — é feature nova, não gap de UI |
| **Gateway de cobrança (boleto, link de pagamento, PIX cobrança)** | ✔ | 🔴 (o sistema REGISTRA que entrou dinheiro; não GERA cobrança) | Fora do escopo — decisão de produto grande (gateway = contrato, taxa, PCI) |
| **Multi-empresa / centro de lucro consolidado** | ✔ | N/A — mono-igreja por desenho (AD-3 do sistema) | **Não se aplica**, não é gap |
| **Auditoria/trilha de quem alterou o quê** | ✔ | ✔ — **FEITO em 12/09/2026.** `criarLancamento()`/`atualizarLancamento()` (`finService.ts`) agora carimbam `audit_user_id`/`audit_em` em toda escrita que passa por elas — que é hoje todo caminho do app. Sem migration (as colunas já existiam). Cobre app; não cobre SQL direto/RPC futura que contorne estas duas funções — um trigger de banco cobriria isso também, registrado como possível endurecimento futuro se a Telma quiser (precisa de migration e o token de gerenciamento está expirado agora). Verificado ao vivo pela UI real: criar um lançamento carimbou o usuário e o instante certos; editar o mesmo lançamento avançou `audit_em` mantendo o mesmo usuário | pequeno | colunas já existiam, sem migration |

### Nota de privacidade — doador

**RESOLVIDA em 12/09/2026.** A pergunta era: em muitas tradições batistas a
contribuição é vista como ato entre a pessoa e Deus, e expor "ranking de
doadores" ou até um extrato individual sem pedir tem implicação pastoral,
não só técnica — quem pode ver o quê antes de eu desenhar RLS pra isso?

Resposta da Telma: **"os tesoureiros e administrador do sistema podem ver
tudo sobre as doações"** — mesma malha de pessoas que já opera o resto do
financeiro (ver item 8 do roadmap, fechado no mesmo dia com a mesma
resposta: só tesoureiro e administrador do sistema mexem nessa área,
liderança de ministério não entra).

**Construída em 12/09/2026** — `/financas/doadores` (lista, ordenada por
NOME não por valor, de propósito — a nota de privacidade já registrava o
risco pastoral de virar "ranking de doadores") e
`/financas/doadores/:pessoaId` (histórico completo de uma pessoa, mesmo
padrão de impressão/PDF dos outros relatórios, sem assinatura — não é
recibo de doação nem prestação de contas formal, os dois continuam fora
do escopo). `doadorService.ts` reaproveita `fin_lancamentos`/`pessoa_id`
que já existiam — nenhuma tabela nova, nenhuma migration.

**Acesso mais estreito que o resto do financeiro, de propósito**: nova
constante `ROLES_DOADORES` (`admin`, `diakonia`, `tesouraria`) em
`navConfig.ts` — sem `secretaria`, que vê o resto do módulo mas não esta
tela, seguindo a resposta literal da Telma. Link "Por doador" em
`/financas/doacoes` só aparece pra quem tem esse papel (`hasRole`).

Verificado ao vivo com 4 contribuições de teste (2 pessoas): totais,
contagem, média e o agrupamento por pessoa bateram exatamente; CSV e
período (ano/todo o período) testados. Um bug de pluralização
("contribuiçõões") apareceu e foi corrigido antes do commit.

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

1. ~~**"Solicitante" no fluxo de aprovação — quem pode pedir?"**~~
   **RESPONDIDA em 12/09/2026 — NÃO SE APLICA.** A migration
   `20260902210000_lideranca_nao_opera_o_financeiro.sql` fechou de propósito
   o acesso de `lideranca` a `fin_lancamentos`; o fluxo Solicitante→
   Tesouraria→Administração→Pastor da missão original pressupunha que um
   líder de ministério pudesse pedir. A Telma confirmou: "quem opera o
   módulo financeiro são os tesoureiros e administrador do sistema" — não
   existe (nem deve existir) um papel "solicitante" separado; liderança de
   ministério não entra nessa tela, nem pra pedir. A migration que fecha o
   acesso da liderança **continua certa como está**. Item 8 do roadmap
   abaixo fica marcado como não aplicável — nenhuma RLS nova, nenhuma
   tabela nova (`fin_solicitacoes`, achada na auditoria com RLS ligada e
   zero políticas, continua sem uso — não é este o caso dela).
2. ~~**Doador — quem vê o extrato de quem deu?**~~ **RESPONDIDA em
   12/09/2026.** Tesoureiros e administrador do sistema podem ver tudo
   sobre as doações — ver Nota de Privacidade acima.
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
| ~~8~~ | ~~**Fluxo de aprovação multinível**~~ — **NÃO SE APLICA, confirmado em 12/09/2026**. Só tesoureiro e administrador do sistema operam o financeiro da QIBRJ; não existe papel "solicitante" nem líder de ministério pedindo despesa por aqui. A aprovação de um nível já implementada no item "Aprovação de despesas (v1)" (status `aguardando_aprovacao` → tesouraria decide) já é suficiente — nada novo a construir | — | `lideranca_nao_opera_o_financeiro` continua correta como está |

---

## Fase 4 — Fornecedores e despesas (gap Omie, 12/09/2026)

Pedido da Telma: "como será a questão das despesas de fornecedores?"
olhando para o que o Omie resolve — cadastro de fornecedor/prestador,
lançamento manual, importação de NF, leitor de código de barras,
recorrência. Auditoria por leitura direta do código (não suposição):

| Capacidade | Omie | Diakonia hoje | Veredito |
|---|---|---|---|
| Cadastro de prestador/funcionário | módulo de RH separado | `/financas/folha` — CLT/MEI/RPA/prebenda/estágio/voluntário remunerado, com INSS/IRRF | **Já tem** — fora desta fase |
| Lançamento manual de despesa com fornecedor | conta a pagar vinculada | `LancamentoForm.tsx` já busca/cria fornecedor inline | **Já tem** — fora desta fase |
| Despesa recorrente vinculada a fornecedor | parcelamento/repetição automática | `fin_recorrencias.fornecedor_id` já existe no schema e já é preenchível em `RecorrenciaForm.tsx` (linha 108) | **Já tem no banco — falta só na tela, ver 4.4** |
| Cadastro de fornecedores (tela própria) | ficha com histórico de compras | `fin_fornecedores` + `criarFornecedor`/`buscarFornecedorPorCnpj` existem, mas só **embutidos dentro do formulário de lançamento** — nenhuma tela lista, edita ou inativa um fornecedor; não há `atualizarFornecedor` nem `inativarFornecedor` no serviço | 🟡 Gap pequeno — ver 4.1 |
| Leitor de código de barras (boleto) | câmera lê a linha digitável, preenche valor/vencimento/beneficiário | Não existe nada — nem OCR, nem decodificação de linha digitável | 🔴 Gap real, mas barato — ver 4.2 |
| Importação de NF | lê o **XML** da NFe/NFSe (estrutural, sem chute) | Existe só via **OCR de imagem/PDF** (`ocrService.ts`, Tesseract + regex heurística, com nível de confiança reportado porque é probabilístico) | 🟡 Gap de qualidade, não de ausência — ver 4.3 |

Ordem proposta: a mais barata e mais isolada primeiro, a que depende de
decisão da Telma (formato real de NF) por último — mesma disciplina das
fases da Tesouraria: **uma fase por vez, com checkpoint antes da
próxima.**

### ✅ Fase 4.1 — Tela de Fornecedores — FEITO em 12/09/2026

`/financas/fornecedores` (lista com busca por nome/CNPJ, toggle "mostrar
inativos", inativar/reativar por linha) + `/financas/fornecedor/:id`
(ficha: dados cadastrais, dados bancários/Pix, histórico de lançamentos —
`listarLancamentos` ganhou o filtro `fornecedorId` — e recorrências
vinculadas, fechando parte da Fase 4.4 de graça: a lista já mostra o
fornecedor de cada recorrência). `FornecedorForm.tsx` (Dialog) cobre
criar/editar, incluindo `categoria_padrao_id` (já existia na tabela e já
era LIDO pelo fluxo de OCR — nunca tinha tela para SER escrito) e
`banco_nome`/`agencia`/`conta` (existiam na tabela, nem estavam na
interface TypeScript — acrescentados).

`finService.ts`: `atualizarFornecedor` e `buscarFornecedor` novos (sem
migration — `ativo=false` já existia); `listarFornecedores` ganhou
`incluirInativos` e o limite subiu de 50 (pensado pro autocomplete do
lançamento) para 200 (a lista de gestão precisa ver todos). Link
"Fornecedores" acrescentado ao grupo "Relatórios e módulos" do Painel da
Tesouraria, ao lado de "Centros de custo" — mesmo padrão de navegação
(não entra no menu lateral, que não lista Centros/Orçamento também).

Verificado ao vivo: cadastrar um fornecedor de teste (PJ, CNPJ), abrir a
ficha, inativar (AlertDialog, não `confirm()` nativo — banido pelo
[Risco 3 do CLAUDE.md](../CLAUDE.md)), reativar, editar (telefone
persistiu), e apagar o registro de teste via REST antes de encerrar —
produção confirmada limpa depois. `tsc`/`vitest` (218/218)/`vite build`
limpos.

### ✅ Fase 4.2 (parte 1/2) — Decodificação da linha digitável — FEITO em 13/09/2026

Feita a parte que não dependia de decisão nenhuma: `src/lib/boleto.ts`
(função pura, sem React) decodifica banco, valor e vencimento dos 47
dígitos de um boleto de **cobrança** — posições fixas + dígito
verificador módulo 10 em cada um dos 3 primeiros campos, conferido antes
de aceitar o número (rejeita com mensagem clara se algum dígito não
bate, ou se vier 48 dígitos — aí é conta de consumo/convênio, formato
diferente, fora do escopo desta versão). O DV geral (módulo 11, sobre os
44 dígitos do código de barras) fica de fora de propósito — sua regra de
exceção pra resto 0/1/10 é fácil de implementar errado, e os 3 DVs de
campo já pegam a esmagadora maioria dos erros de digitação.

`LancamentoForm.tsx` ganhou o campo "Ler boleto (linha digitável)" —
aparece só numa saída nova (nunca editando, nunca numa entrada). Colar os
números preenche Data e Valor sozinhos assim que reconhece 47 dígitos;
erro de digitação aparece em vermelho na hora, sem tentar adivinhar nada.

7 testes unitários com uma linha digitável montada e conferida à mão
(checksum e fator de vencimento recalculados manualmente, não copiados de
lugar nenhum). Verificado ao vivo: colar a linha de teste preencheu
Valor (R$100,00) e Data (15/01/1998) corretamente; adulterar um dígito
mostrou o erro certo. `tsc`/`vitest` (225/225)/`vite build` limpos.

**Parte 2/2 (câmera) continua em aberto** — decisão pendente da Telma:
vale a pena o leitor por câmera (lib nova tipo `zxing`, mais peso no
bundle) ou colar os números já resolve o essencial (elimina o erro de
digitar valor/data errados, que era o risco real)? Sem essa decisão, não
sigo pra essa parte.

### Fase 4.3 — Importação de XML de NF (NFe/NFSe)

**O que entra.** Upload do arquivo `.xml` da nota (em vez da foto):
parser extrai CNPJ emitente, razão social, valor total, data de emissão
e número — mesmo fluxo que já existe para o OCR (busca fornecedor por
CNPJ, oferece cadastrar se for novo), só que **sem chute**: o XML garante
o valor certo, não "o maior número que parece R$ na imagem".

**Decisão pendente da Telma — importante antes de programar:** NFe
(produto) tem layout nacional único; **NFSe (serviço) não tem** — cada
prefeitura define o próprio XML, e a maior parte das notas que uma
tesouraria de igreja recebe costuma ser de serviço (manutenção,
honorários, eventos), não de produto. Preciso de **um XML real** que a
Diakonia tenha recebido de fornecedor — do jeito que a conciliação OFX
só foi construída depois que você trouxe o extrato real do Bradesco — pra
saber se é NFe nacional (mais simples) ou NFSe do município do Rio
(layout próprio, mais trabalho). Sem isso eu construiria "no escuro" e
arriscaria não bater com a nota real.

**Esforço:** médio (NFe nacional) a médio-alto (se precisar do layout
NFSe-Rio especificamente).

### ✅ Fase 4.4 — "Despesa recorrente" visível por fornecedor — FEITO em 13/09/2026

`listarRecorrencias()` ganhou join manual com `fin_fornecedores` (mesmo
padrão de `listarLancamentos`) e `FinancasRecorrencias.tsx` mostra o nome
do fornecedor na linha, quando houver. A seção "Despesas recorrentes
deste fornecedor" na ficha (Fase 4.1) já cobria a outra ponta. Sem
migration, sem RPC nova — só expondo um dado que já existia. `tsc`
limpo.

---

## ✅ Fase 5 — Cadastro de Contratados — FEITO em 12/09/2026

Achado respondendo a pergunta da Telma "e se a pessoa física [fornecedor]
já for alguém cadastrado no catálogo de pessoas?" — ela esclareceu que o
caso real é **funcionários que são membros** (o eletricista da
congregação, o professor de música que recebe cachê). Isso não é
Fornecedores (Fase 4.1, fechada) — funcionário mora em `fin_contratados`,
a aba "Contratados" de **Folha & Encargos**. Cavando esse módulo achei um
buraco maior que a pergunta original:

- `/financas/folha` é, no subtítulo da própria tela, **"calculadoras
  didáticas pra você acompanhar e aprender"** — CLT/MEI/RPA/Prebenda. A
  aba "Contratados" só **lista** (`ListaContratados`) quem já está na
  tabela `fin_contratados`.
- `criarContratado`/`atualizarContratado`/`desativarContratado` **já
  existem** em `folhaService.ts`, com `conferir()` e tudo — e **nenhuma
  tela em lugar nenhum do sistema as chama**. Quem estiver cadastrado
  hoje entrou por SQL direto, não pela interface. Não dá pra cadastrar
  funcionário nenhum pela tela hoje, membro ou não.
- `fin_contratados.pessoa_id` **já existe** (aponta pra `membros`,
  mesmo desenho de `fin_lancamentos.pessoa_id` que a Doadores usa) e está
  no mesmo estado dormente: schema pronto, zero leitura, zero escrita.

**O que entra nesta fase:**

1. `ContratadoForm.tsx` (Dialog, mesmo padrão de `FornecedorForm.tsx` e
   `RecorrenciaForm.tsx`) — campos comuns (nome, CPF, vínculo, cargo,
   data início/fim) e campos condicionais por `vinculo` (CLT: salário,
   jornada, dependentes, VT/VA; MEI: CNPJ, atividade, valor mensal; RPA:
   valor padrão; Prebenda: valor, auxílio aluguel/outros, CEBAS, INSS do
   pastor) — todos já existem em `FinContratado`, é só expor.
2. **Busca no catálogo já pronta pra reaproveitar**:
   [`src/components/ui/BuscaPessoa.tsx`](../src/components/ui/BuscaPessoa.tsx)
   já é exatamente o componente certo — autocomplete server-side em
   `membros`, devolve `cpf` e `telefone_celular` junto do nome, usado hoje
   em Agenda/Diaconia/Famílias. Selecionar um membro pré-preenche
   nome/CPF e grava `pessoa_id`; deixar em branco cadastra alguém de fora
   do quadro de membros (funcionário nem sempre é da igreja). **Isto
   reduz bastante o esforço** — a peça mais cara (buscar pessoa) já está
   pronta, testada e em produção noutras telas.
3. `FinancasFolha.tsx`: aba "Contratados" ganha botão "Novo" e
   ações editar/desativar por linha (mesmo padrão AlertDialog de
   Fornecedores — nunca `confirm()` nativo).

**Esforço:** médio — o formulário tem mais campos condicionais que
`FornecedorForm`, mas a busca de pessoa (a parte nova de verdade) já
existia pronta. **Decisão pendente:** nenhuma — mesmo caso de
Fornecedores, é composição sobre schema e componentes que já existem.

`ContratadoForm.tsx` cobriu os 3 itens do plano: campos comuns + por
vínculo, `BuscaPessoa` pré-preenchendo nome/CPF e gravando `pessoa_id`,
e a aba Contratados de `FinancasFolha.tsx` ganhou "Novo"/editar/
desativar/reativar (o botão "Novo" já existia, **desabilitado, com o
texto literal "(em breve)"** — só foi ligado).

**Bug de UX encontrado e corrigido no mesmo commit**: `carregar()`
gatilhava `setLoading(true)`/`false` a cada desativar/reativar ou toggle
de "mostrar inativos" — como a tela inteira desmonta em `loading`,
a `Tabs` (não controlada, `defaultValue="calc"`) esquecia que o usuário
estava em "Contratados" e voltava pra "Calculadoras" sozinha. Corrigido
separando o loading da PRIMEIRA carga (bloqueia a página) do refetch
de fundo (não bloqueia nada) — e o mesmo padrão, que já existia em
`FinancasFornecedores.tsx` (Fase 4.1, sem `Tabs` mas com o mesmo
pisca-pisca), foi corrigido lá também de graça. `<p>` com `Badge` dentro
(mesmo bug de HTML inválido já achado em `FinancasRecorrencias.tsx`)
apareceu de novo em `ListaContratados` — trocado por `<div>`.

Verificado ao vivo: cadastrado um contratado de teste (CLT) buscando
"Telma" no catálogo — nome/CPF pré-preenchidos sozinhos; editado (o
`pessoa_id` voltou vinculado corretamente na reedição, confirmado por
REST antes de apagar); desativado e reativado sem a aba resetar; console
limpo em aba nova. Registro de teste apagado, produção conferida limpa
depois. `tsc`/`vitest` (218/218)/`vite build` limpos.

---

## ✅ Fora do roadmap original — Indicadores eclesiásticos no hub da Tesouraria (13/09/2026)

Pedido da Telma ao ver o widget "Campanhas em andamento" (arrecadação de
classes de EBD) aparecendo em `/financas`: "deixe... apenas no módulo de
EBD" — e, no lugar, uma visualização de dízimos/ofertas/missões mensais,
somando todas as contas.

**Widget de EBD removido do hub financeiro** — `widgetRegistry.tsx`
tinha `campanhas-ebd` com `paineis: ["pastoral", "financas"]`; conferido
que `pages/Ebd.tsx` já constrói a própria seção "Campanhas de
arrecadação em andamento" (linha ~895, com todas as classes, não uma
reimportação do widget) — a entrada do registro virou **puramente
duplicada** fora do módulo de EBD. Removida a entrada inteira (não só
`paineis: []`) e apagado `components/dashboard/CampanhasEbd.tsx`, órfão
depois disso (só era importado pelo próprio registro).

**`finService.indicadoresEclesiasticosMensais(meses)`** — nova, sem RPC
nem migration: agrupa `fin_lancamentos` (entrada, realizado/conciliado,
`origem <> 'transferencia'`) por mês e por categoria batendo em
Dízimos/Ofertas/Missões, série de N meses. Existe uma RPC parecida
(`fin_exec_indicadores_eclesiasticos`, Visão Executiva) mas só compara
mês atual × anterior, e fica atrás de `ROLES_PASTORAL_SEM_TITULAR` — mais
restrito que quem acompanha isso todo dia. **Achado no caminho**: essa
RPC testa `'%oferta%'` antes de `'%missao%'` num `CASE`, então "Ofertas
para Missões" (categoria oficial) sempre cai em "Ofertas" — nunca
corrigido na RPC (fora do pedido de hoje), mas a função nova inverte essa
ordem de propósito pra não repetir o desvio.

Renderizado em `Financas.tsx` como tabela simples (categoria × mês),
no lugar exato onde "Campanhas em andamento" aparecia.

**Achado no meio do caminho, não relacionado à tarefa**: `fin_lancamentos`
apareceu com só 1 linha (era pra ter várias, inclusive as que eu tinha
acabado de conferir ao vivo hoje) — a Telma confirmou que apagou os
lançamentos de propósito enquanto testava a lixeira recém-corrigida
(ver commit da correção). Sem ação de recuperação necessária; os
indicadores aparecem zerados hoje porque é isso que o banco tem agora,
não por bug.

`tsc`/`vitest` (225/225)/`vite build` limpos. Verificado ao vivo: seção
renderiza sem os dados de EBD, tabela de indicadores aparece com os 6
meses certos (zerada, refletindo o estado atual do banco); `/ebd` mantém
sua própria seção de campanhas intacta.

---

*Este documento é o plano; `DOCUMENTACAO_SISTEMA.md` continua sendo o
retrato do sistema inteiro. Atualizar os dois quando um item da lista acima
for fechado.*
