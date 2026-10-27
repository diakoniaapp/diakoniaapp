# Central de Inteligência de Contribuições — análise, arquitetura e roadmap antes de implementar

27/10/2026. **Nada foi implementado nesta rodada.** Este documento responde ao pedido consolidado ("analise toda a implementação atual… não criar funcionalidades duplicadas… primeiro apresentar") e **substitui como visão geral** `PROPOSTA_CONSTRUTOR_DE_RELATORIO_E_PENDENTES_2026-10-27.md`, que continua valendo nos detalhes de Pendentes. Base: o código publicado até `b3f07eb` (a correção `6bf94a3` está só local) e o que já está no ar.

## 1. Em uma página

- **Uma parte grande do pedido já existe.** Dos ~35 itens do texto, **17 estão prontos** (seção 2), **8 existem em parte** e **10 são novos**. Os novos que mais pesam: **filtro de base analisada**, **filtro de categorias**, **cabeçalho obrigatório**, **ordenação e Top N**, **construtor de relatório dentro da tela Doadores** (hoje o construtor só existe na gaveta de e-mail) e a aba **Pendentes de Identificação**.
- **Um conflito precisa da sua decisão antes de qualquer código.** O texto diz: *"Por padrão, e-mails enviam apenas dados agregados. Dados nominais e dados financeiros individuais exigem permissão; a liberação para e-mail será feita separadamente"* e o modelo Pastor lista só agregados. **Mas o modelo Pastor que está no ar hoje (publicado hoje) leva nomes, sem valores**, por causa do texto que você colou antes. Proponho **tirar os blocos com nomes do padrão do Pastor** (continuam existindo, desligados, com ⚠ e registro), até você liberar. Decisão 1.
- **Outro choque com decisão antiga:** o pedido põe a ordem padrão por **total contribuído (decrescente)** e um bloco **Top 10/20/50**. Em 12/09/2026 a tela foi desenhada para ordenar por **nome** ("não virar ranking de doadores"). É escolha sua; proponho aceitar, **só dentro do sistema, para quem já vê as contribuições, com registro de acesso**, e **nunca por e-mail**. Decisão 4.
- **Ordem recomendada:** R1 filtros globais + cabeçalho (base e categorias) → R2 construtor dentro da tela + ordenação/Top N → R3 Pendentes de Identificação → R4 tendências e Excel da Tesouraria. **~19–22 dias, em fatias.**

## 2. O que já existe (inventário)

| Pedido | Situação | Onde |
|---|---|---|
| Piso de 01/01/2026; nunca dizer "nunca contribuiu na vida" | **pronto** | `PISO_DE_IDENTIFICACAO`; texto "Nenhuma desde 01/01/2026" |
| Filtro de período (30 dias, 90, 6 meses, 12 meses, ano, personalizado) | **pronto** (90 dias, 6 e 12 meses, ano, desde o piso, personalizado). **Falta "Últimos 30 dias"** | `PRESETS_DE_PERIODO` |
| Filtro de **base analisada** (membros / +congregados / +visitantes) | **novo** — hoje a base é fixa: membros e congregados ativos | `analisarSemContribuicao` |
| Filtro de **contribuições consideradas** (Dízimos / Ofertas / Missões, cumulativo) | **em parte** — só existe "dízimo ou qualquer" na aba Sem contribuição; o painel soma as três | `tipoDaContribuicao` |
| **Cabeçalho obrigatório** (período, base, contribuições, pessoas consideradas) | **em parte** — o período aparece; base e contribuições não são declaradas | tela, Excel, e-mail |
| Bloco Critérios da análise | **novo** | — |
| Indicadores principais (total, contribuintes, média por contribuinte, média mensal, novos, recorrentes) | **pronto** | painel e e-mail |
| Saúde da base (ativos, contribuíram, sem contribuição, adesão, novos, recorrentes) | **pronto** no e-mail e na aba Sem contribuição; **falta o card fixo no painel** | `blocoSaudeDaBase` |
| Não contribuíram (nenhuma desde o piso, antes e não agora, >30/60/90/180 dias) | **pronto** (aba Sem contribuição e dentro do bloco Saúde da base no e-mail); **falta ser bloco próprio** | `resumirBase` |
| Gráficos: evolução, curva de adesão, distribuição mensal; destaques | **pronto** | painel; e-mail (barras em tabela) |
| Listas nominais: nome, última, quantidade, status | **pronto** (abas Pessoas e Sem contribuição; e-mail no modelo Pastor) | `nominal.ts` |
| Status: recorrente, novo, sem contribuição no período, >90, >180 | **pronto** | `nominal.ts` |
| Dados financeiros individuais: total, média mensal, valor médio | **em parte** — total por pessoa existe na aba Pessoas; **média mensal e valor médio individuais não** | `resumirPessoas` |
| Regra de governança (e-mail só agregado por padrão; nominal e financeiro com permissão) | **em parte** — o servidor recusa valor individual por e-mail; nomes por e-mail estão **ligados no Pastor** (ver seção 1) | `validarBlocos` |
| Ordenação (total ↓ padrão, ↑, frequência, última, A–Z, Z–A, tempo sem contribuir) | **em parte** — só nome e valor (padrão: nome) | `ListaDePessoas` |
| Top 10/20/50/Todos | **novo** | — |
| Modelos Pastor / Diretoria / Tesouraria | **pronto no e-mail**, com conteúdo diferente do pedido (Diretoria sem "tendências"; Tesouraria sem "valores/Excel") | `MODELOS_DE_RELATORIO` |
| Prévia invalidada por período, bloco, base e contribuições | **em parte** — invalida por período e bloco; base e contribuições ainda não existem | gaveta |
| Renomear para Comunicação e Relatórios; 5 abas | **pronto** | `/comunicacao` |
| Remetentes `resumo@` e `relatorios@`; Reply-To da Identidade; nunca `nao-responda@` | **pronto** | `remetente.ts`, `contribuicoes-enviar` |
| Saldos: diário não mostra; semanal só se extrato ≤ 3 dias, com justificativa | **pronto** | `decidirSaldos` |
| Pendentes de Identificação (fila, ações, taxa, meta 95%, sugestões) | **novo** | — |
| Identificação reflete em painel, Excel, CSV, indicadores, relatórios e envios | **por construção**: vincular grava `pessoa_id`, e tudo lê o mesmo cálculo | `analisarContribuicoes` |

## 3. Arquitetura proposta

**Princípio:** um registro de **blocos** com **três saídas** (tela, Excel, e-mail) e **um só cálculo**. Hoje há duas saídas (tela com abas fixas e e-mail com blocos); o construtor atual só existe no e-mail.

```
 Filtros globais (período · base · contribuições)  ──►  carregar() + analisar()   ◄── o MESMO código na tela e na função
                                                          │
        Registro de blocos (id, nível, onde pode sair) ───┼──► tela (blocos na página / impressão)
        Modelos = listas de blocos                        ├──► Excel (uma aba por bloco)
                                                          └──► e-mail (só blocos agregados, salvo liberação)
```

### 3.1 Filtros globais
- **Período** (já existe) + **"Últimos 30 dias"**.
- **Base analisada:** `membros` | `membros+congregados` (padrão de hoje) | `membros+congregados+visitantes`. Sempre **ativos**; menores de 18 anos continuam fora por padrão (opção).
- **Contribuições consideradas:** caixas Dízimos / Ofertas / Ofertas para Missões, cumulativas. Padrão: as três.
- Tudo na URL (`useEstadoNaUrl`), como já é.
- **Regra de negócio nova que muda números:** com base escolhida, **só contam como contribuintes as pessoas da base**; quem contribuiu e está fora dela (inativo, ex-membro, visitante quando não incluído) aparece numa linha à parte ("fora da base: N"). Hoje o painel conta qualquer pessoa identificada (medido: 4 pessoas fora da base em 2026).
- Se **Dízimos não** estiver marcado, "dizimistas", "recorrentes" e "novos dizimistas" ficam "não se aplica" (ficam definidos pelo dízimo).
- **Impacto técnico:** `analisarContribuicoes`, `resumirPessoas` e `analisarSemContribuicao` ganham dois parâmetros (`categorias`, `base`); o painel passa a carregar a base de pessoas (hoje só a aba Sem contribuição carrega). A função `contribuicoes-enviar` recebe e **valida** os mesmos parâmetros por lista permitida.

### 3.2 Cabeçalho obrigatório e bloco "Critérios da análise"
Um **cabeçalho único**, gerado do mesmo objeto de filtros, em **todas** as saídas (tela, Excel, e-mail, impressão):
`Período: 28/04/2026 a 27/10/2026 · Base: membros e congregados ativos · Contribuições: dízimos, ofertas, missões · Pessoas na base: 257 (139 contribuíram)`.
O bloco "Critérios da análise" é esse cabeçalho com a definição de cada critério e o piso. *"Quantidade de pessoas consideradas"* tem duas leituras (tamanho da base × quem contribuiu): proponho mostrar as duas (decisão 2).

### 3.3 Blocos (registro único, `blocos.ts`)

| Bloco | Nível | Tela | Excel | E-mail |
|---|---|---|---|---|
| Critérios da análise | agregado | ✔ | ✔ | ✔ (sempre) |
| Resumo executivo | agregado | ✔ | ✔ | ✔ |
| Indicadores principais | agregado | ✔ | ✔ | ✔ |
| Saúde da base | agregado | ✔ (card fixo, antes dos gráficos) | ✔ | ✔ |
| **Não contribuíram (quantidades)** — separado da saúde da base | agregado | ✔ | ✔ | ✔ |
| Evolução / Curva de adesão / Distribuição mensal / Destaques | agregado | ✔ | ✔ | ✔ |
| **Tendências** (Diretoria) | agregado | ✔ | ✔ | ✔ |
| Quem contribuiu — nomes | **nominal** | ✔ + registro | ✔ + registro | ⚠ só com liberação |
| Quem não contribuiu — nomes | **nominal** | ✔ + registro | ✔ + registro | ⚠ só com liberação |
| **Top contribuintes (10/20/50/Todos)** | nominal + financeiro | ✔ + registro | ✔ + registro | ✘ |
| **Valores individuais** (total, média mensal, valor médio) | financeiro | ✔ + registro | ✔ + registro | ✘ |

### 3.4 Governança (matriz saída × nível de dado)

| | Tela | Excel/CSV | E-mail |
|---|---|---|---|
| Agregado | ✔ | ✔ | ✔ |
| Nominal (nomes, última, frequência, status) | ✔ com registro | ✔ com registro | ⚠ desligado por padrão; liberação à parte |
| Financeiro individual | ✔ com registro | ✔ com registro | ✘ |

Controle de permissão: a tela Doadores já é fechada a `ROLES_DOADORES` (admin, diakonia, tesouraria). Para **financeiro individual** proponho a mesma regra, com o registro de acesso que já existe; se quiser mais estreito (só admin e diakonia), é um portão a mais (decisão 5).

### 3.5 Ordenação e Top N
Ordenar por: total (↓ padrão, ↑), frequência, última contribuição, nome A–Z e Z–A, tempo sem contribuir. Top 10/20/50/Todos é bloco opcional **só dentro do sistema** (ver conflito na seção 1). A ordenação vale na tela e no Excel.

### 3.6 Modelos
- **Pastor:** resumo executivo, saúde da base, não contribuíram, recorrentes e novos (agregados). *(Os blocos com nomes saem do padrão, se você aceitar a decisão 1.)*
- **Diretoria:** indicadores, gráficos, arrecadação por categoria, **tendências**.
- **Tesouraria:** indicadores, gráficos, **valores** e exportação Excel — valores só na tela e no Excel, nunca no e-mail.

### 3.7 Onde o construtor mora (sem criar área nova)
Um botão **"Montar relatório"** no cabeçalho da tela Doadores abre a **mesma gaveta** que hoje existe na Central, agora com os filtros globais, os blocos, os modelos e **quatro saídas**: ver na tela, imprimir/PDF, Excel, e-mail. A Central de Comunicação continua sendo a casa dos envios, agendamentos e histórico. Uma só gaveta, dois pontos de entrada.

## 4. Wireframes

**Tela Doadores (barra global + card fixo):**
```
Doadores                                 [ Montar relatório ] [ Enviar ] [ Excel ]
Período [90d|6m|12m|Ano|Desde o piso|Personalizado]
Base    (•) Membros  ( ) Membros e congregados  ( ) + visitantes
Contribuições  ☑ Dízimos  ☑ Ofertas  ☑ Ofertas para Missões
Período analisado: 28/04 a 27/10/2026 · Base: 257 · Contribuições: 3 categorias · Cobertura 91,2%
┌ SAÚDE DA BASE ─────────────────────────────────────────────┐
│ Ativos 257 · Contribuíram 124 · Sem contribuição 133 · Adesão 48% │
│ Sem contribuir há mais de: 30 d: 21 · 60 d: 12 · 90 d: 7 · 180 d: 3 │
└────────────────────────────────────────────────────────────┘
 Painel | Pessoas | Sem contribuição | Pendentes de identificação
```
**Gaveta "Montar relatório":** filtros → modelo (Pastor/Diretoria/Tesouraria/Personalizado) → blocos (⚠ nos nominais, 🔒 nos financeiros) → saída (tela/PDF/Excel/e-mail) → prévia obrigatória → gerar.

**Pendentes de Identificação:**
```
Identificação: 91,2% ████████░░ meta 95%
Identificadas 91,2% · Anônimas 0% · Ignoradas 0% · Pendentes 8,8% (273 · R$ 41.760,83)
Data   Valor    Categoria  Descrição/nome do extrato   Sugestão
27/09  R$ 150   Dízimo     "FULANO DE TAL PIX"          Fulano de Tal (92%)  [Aceitar] [Vincular pessoa] [Família] [Anônimo] [Ignorar]
```
Ações com **Desfazer** (nova linha, nunca apagar). A fila diminui conforme se identifica; mostrar a curva da fila ao longo do tempo.

## 5. Fluxo de navegação
Menu Tesouraria › **Doadores** (aba Painel) → ajusta período/base/contribuições → Pessoas | Sem contribuição | Pendentes → **Montar relatório** (gaveta) → ver na tela / Excel / e-mail → o envio e o histórico ficam em **Comunicação e Relatórios › Relatórios / Histórico**. Voltar devolve filtros e aba (estado na URL, como hoje).

## 6. Regras de negócio (resumo)
1. Piso 01/01/2026 para tudo; nunca "nunca contribuiu".
2. Contribuição = Dízimos, Ofertas, Ofertas para Missões; filtros cumulativos; transferências e rendimentos fora.
3. Base = ativos do vínculo escolhido; menores de 18 fora por padrão.
4. Só contribuintes da base entram nos indicadores; "fora da base" é mostrado à parte.
5. "Identificada" = tem `pessoa_id`. Anônimo e ignorado **não** contam como identificadas (taxa separada em quatro partes).
6. E-mail: só agregados por padrão; nominal exige liberação; financeiro individual nunca por e-mail.
7. Toda consulta nominal/financeira (tela, Excel, e-mail) é registrada: quem, quando, filtros, quantas pessoas.
8. Qualquer mudança de período, base, contribuições ou bloco invalida a prévia.
9. Vincular pessoa/família grava `pessoa_id` (e `familia_id`); a trilha `fin_lancamento_historico` registra quem mudou.

## 7. Impacto na estrutura atual
- **Núcleo** (`_shared/contribuicoes/analise.ts`): parâmetros `categorias` e `base`; resumo por pessoa com média mensal e valor médio; tendências. Testes novos e ajustes dos atuais (números do painel mudam com a regra "só da base").
- **Blocos** (`blocos.ts`): separar "Não contribuíram" da "Saúde da base"; blocos novos (Critérios, Tendências, Top, Valores individuais); nível "financeiro".
- **Tela** (`FinancasDoadores.tsx` e `components/contribuicoes/`): barra global de filtros, card fixo, ordenação, Top N, aba Pendentes; **edição mínima** no arquivo da página (a outra sessão também mexe nele).
- **Gaveta** (`EnviarRelatorioDeContribuicoes.tsx`): vira o construtor geral com quatro saídas.
- **Função** `contribuicoes-enviar`: recebe `base` e `categorias`, valida por lista permitida, cabeçalho obrigatório no e-mail. **Reimplantar a cada rodada.**
- **Banco:** tabela de triagem para anônimo/ignorado (migration); ampliar o CHECK de `contribuicoes_acessos` para exportações novas (migration pequena). **Nada** muda em `fin_lancamentos`.
- **Prestação de Contas** ainda conta dizimistas por nome normalizado: continua divergindo até você decidir migrá-la (decisão 8 da análise de 27/10).

## 8. Esforço e roadmap

| Fase | Entrega | Esforço |
|---|---|---|
| **R0** | Decisões da seção 9 (principalmente nomes por e-mail e ranking) | — |
| **R1** | Filtros globais (base + contribuições + "30 dias"), cabeçalho obrigatório, bloco Critérios, card fixo Saúde da base no painel, separar "Não contribuíram" | **4–5 d** |
| **R2** | Construtor dentro da tela com quatro saídas (tela, impressão/PDF, Excel, e-mail), ordenação completa, Top N, valores individuais com registro | **5–6 d** |
| **R3** | Pendentes de Identificação: fila + indicadores (P1), vincular pessoa (P2), anônimo/ignorar/desfazer (P3, migration), família, sugestões | **9–10 d** |
| **R4** | Tendências (Diretoria), modelos ajustados, Excel da Tesouraria | **2–3 d** |
| Total | | **~20–24 d** |

**Dependências técnicas:** (1) R1 antes de R2 (o construtor usa os filtros); (2) R3 independe de R1/R2 e pode andar em paralelo por outra sessão, **desde que não edite os mesmos arquivos ao mesmo tempo**; (3) migrations (triagem; CHECK de acessos) aplicadas por você; (4) cada mudança na função exige **token novo** para implantar; (5) "Tendências" precisa de período que caiba **depois** do piso (comparar com o período anterior só quando ele também começa em 01/01/2026 ou depois; senão a tendência é a inclinação da série).

## 9. Decisões que dependem dela
1. **Nomes por e-mail:** tirar os blocos com nomes do **padrão** do modelo Pastor (continuam disponíveis, desligados, com ⚠ e registro, até a "liberação separada")? *(recomendado: sim — o pedido de hoje diz que o padrão é só agregado.)*
2. **"Quantidade de pessoas consideradas":** tamanho da base, quem contribuiu, ou os dois? *(recomendado: os dois.)*
3. **Visitantes na base:** incluir só os **ativos**; quem contribuiu e está fora da base aparece em "fora da base: N", sem entrar nos indicadores. Combinado?
4. **Ordem padrão por total (↓) e Top N:** aceitar **só dentro do sistema**, com registro, nunca por e-mail? *(a nota de privacidade de 12/09 dizia "nome, não valor"; a decisão é sua.)*
5. **Valores individuais (total, média mensal, valor médio):** mesmos papéis de hoje (admin, diakonia, tesouraria) ou só admin e diakonia?
6. **Tendências (Diretoria):** definição proposta — comparação com o período anterior equivalente quando ele cabe depois de 01/01/2026; senão, inclinação mensal da série. Serve?
7. **Saídas do construtor:** tela, impressão/PDF (do navegador), Excel e e-mail. PDF anexado a e-mail continua fora (é o item caro).
8. **Ordem de trabalho:** R1 → R2 → R3 → R4 (recomendado) ou Pendentes antes? Meta de identificação **95%** (já definida).
9. **Menores de 18 anos** na base: continuam fora por padrão, com interruptor?
