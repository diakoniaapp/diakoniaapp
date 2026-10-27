# Doadores, dizimistas e relatórios — análise antes de implementar

Análise de **27/10/2026**. Só leitura: código (`FinancasDoadores`, `FinancasDoadorDetalhe`, `doadorService`, Prestação de Contas, Indicadores, `xlsxSimples`, `SeletorPeriodo`, Edge Functions de e-mail) e uma consulta **somente leitura** a `fin_lancamentos`/`membros` pela sessão dela no navegador (nenhum dado foi gravado; nenhum nome aparece neste documento). **Nada foi implementado.** Esta análise é a metade "análise de contribuições" de um par: a metade "como entregar por e-mail e guardar o histórico" está em `ANALISE_CENTRAL_DE_COMUNICACAO_E_RELATORIOS_2026-10-27.md`.

## 1. Em uma página

- **Evoluir a tela Doadores, não criar outra.** Ela já tem o dado certo (entradas com `pessoa_id`), o acesso certo (`ROLES_DOADORES`: admin, diakonia, tesouraria) e as rotas certas. Falta tudo o que é *análise*: não há gráfico, nem período livre, nem grupos, nem exportação, nem envio. A "Central de Relatórios" nova não deve ser uma segunda tela de doadores: é a **entrega** (enviar, agendar, histórico) e mora na Central de Comunicação.
- **Quase tudo se reaproveita**: Excel/CSV/PDF (`xlsxSimples`, `downloadCSV`, impressão com perfis), gráficos (recharts + `ui/chart.tsx` e gráficos SVG próprios), período na URL (`useEstadoNaUrl` + `SeletorPeriodo`), e-mail (Resend nas Edge Functions, moldura única `_shared/email/desenho.ts`, textos `_shared/email/textos.ts`).
- **O que NÃO existe e precisa nascer**: (1) um **cálculo único** das contribuições (puro, testado, usado pela tela, pela exportação e pelo e-mail); (2) períodos "últimos 90 dias / 6 meses / 12 meses"; (3) envio sob demanda com anexo e **histórico** de envios (solicitante, destinatários, remetente).
- **O achado que muda o desenho — qualidade da identificação.** Em 2025 só **~30–35%** dos dízimos têm uma pessoa ligada; de **jan/2026** em diante, **~92% das entradas (93–98% do valor)**. Qualquer indicador que olhe antes de 2026 (novos dizimistas, recorrência de 12 meses, "sem contribuição recente") fica **errado de um jeito que parece certo**. O painel precisa mostrar uma **cobertura de identificação** e tratar jan/2026 como o piso confiável.
- **A decisão de privacidade vem antes de qualquer tela**: o pastor **não** está em `ROLES_DOADORES`. O relatório que ele pediu leva nomes e valores individuais? Quem pode receber isso por e-mail? (seção 6)

## 2. O que já existe (inventário)

### 2.1 Telas e serviço de doadores

| O quê | Onde | Estado |
|---|---|---|
| Lista de doadores | `/financas/doadores` (`FinancasDoadores.tsx`, 178 linhas) | ano + mês opcional, busca sem acento, ordem nome/valor (**padrão por nome, não por valor** — "não virar ranking"), estado na URL |
| Histórico de uma pessoa | `/financas/doadores/:pessoaId` (209 linhas) | contribuições da pessoa por ano |
| Serviço | `services/doadorService.ts` | `listarDoadoresComResumo(ano, mes?)` — consulta paginada de 1.000 em 1.000 (`tipo=entrada`, `pessoa_id` não nulo, `realizado/conciliado`), total/quantidade/última por pessoa |
| Acesso | `ROLES_DOADORES` = admin, diakonia, tesouraria (mais estreito que `ROLES_FINANCEIRO`) | decisão dela: "tesoureiros e administrador podem ver tudo sobre as doações" |
| "Doações" | `/financas/doacoes` (`FinancasDoacoes.tsx`, 309 linhas) | **"quanto entrou, de que jeito e o que é recorrente"**: entradas por forma de pagamento (Pix, dinheiro, cartão, transferência, envelope) e recorrência — acompanhamento do mês. **Sobrepõe** em parte o que se pede aqui (total arrecadado, recorrência); a Central de Contribuições deve **linkar** para ela (forma de pagamento) em vez de refazê-la, ou absorvê-la como uma aba. |

**Lacunas da tela atual:** sem gráficos; só ano ou mês (nada de "últimos 6 meses" nem período livre); sem categoria (dízimo × oferta × missões); sem tipo de pessoa; sem família/ministério; colunas fixas; sem exportar; sem enviar.

### 2.2 Dados (o que as consultas já enxergam)

- `fin_lancamentos`: `tipo='entrada'`, `pessoa_id` (quem deu), `categoria_id` (**"Dizimos"** — sem acento no cadastro —, "Ofertas", "Ofertas para Missões"…), `data`, `valor`, `status`. As **transferências entre contas não têm categoria** (são ~957–1.535 "entradas" sem categoria, `origem='transferencia'`): precisam ficar de fora; a consulta atual já as exclui por exigir `pessoa_id`.
- `membros`: `tipo_pessoa` (membro/congregado/visitante), `status`, `telefone_celular`, `email`, `nascimento…`; **família** pelos vínculos (`vinculos_familiares`/`familias`, **não** por `familia_id` na pessoa — nas 97 pessoas medidas a coluna veio vazia); **ministério** via áreas (`area_voluntarios` → `areas` → `ministerios`).
- **Já existe um conceito de dizimista, DIFERENTE, em `lib/prestacaoIndicadores.ts`** (`IndicadoresDeDizimos`: `dizimistasUnicos` — "por nome normalizado" —, `valorTotal`, `valorNaoIdentificado`, `valorMedio`), usado na **Prestação de Contas** que vai à Diretoria/Conselho. Ele conta pelo **texto do nome**; a tela Doadores conta por **`pessoa_id`**. Hoje, num mesmo período, os dois números podem divergir. A Central de Contribuições tem de **escolher uma definição** (recomendo `pessoa_id`, mais confiável) e **fazer a Prestação de Contas usar o mesmo cálculo**, ou o pastor verá dois "dizimistas" diferentes. Também existe a arrecadação por categoria nos Indicadores Eclesiásticos (aba "Gestão").

### 2.3 Gráficos

| Componente | Biblioteca | Serve para |
|---|---|---|
| `FluxoCaixaCard`, `IndicadorPorCategoria`, `IndicadorCentroCusto`, `PainelEstrategico`, `FinancasProjetoDetalhe` | **recharts 2.15** (via `ui/chart.tsx`) | linhas/barras/áreas com tooltip |
| `PrestacaoFluxoDeCaixa` (Auto/Diário/Semanal/Mensal) | SVG próprio | fluxo para PDF/impressão |
| `DonutChart`, `IndicadoresMissionarios` (período × fundo × gráfico) | SVG próprio | donut e série acumulada |

→ **Para a tela:** recharts (já carregado, com tooltip e tema). **Para PDF/impressão:** o padrão SVG próprio (recharts não imprime bem). **Para e-mail:** nenhum dos dois (cliente de e-mail não roda JS/SVG): barras em HTML de tabela (ver Comunicação, seção 7).

### 2.4 Exportação e compartilhamento

| Formato | O que existe | Reuso |
|---|---|---|
| **Excel** | `lib/xlsxSimples.ts` (gera `.xlsx` real com `jszip`: abas, moeda, data, negrito, largura, filtro, linha fixa) | direto |
| **CSV** | `downloadCSV` em `finService`; `gerarCSVDoExtrato` | direto |
| **PDF (tela)** | impressão do navegador (`window.print` + `.relatorio-page`, perfis de impressão em `perfilDeImpressaoDoExtrato`) | direto para "Gerar PDF" |
| **PDF (arquivo)** | `pdf-lib` já no projeto (`resumoDoLotePdf`, dossiê do malote) | **necessário se o PDF for anexo de e-mail** — impressão do navegador não gera arquivo |
| **ZIP** | `jszip` + `file-saver` | n/a |
| **WhatsApp / e-mail** | `lib/whatsapp.ts` (link `wa.me`), `mailto` do envio de pagamentos | só texto curto — não para relatório com nomes |

O **Extrato de Obrigações** (`FinancasExtratoObrigacoes.tsx`) é o modelo: período + filtros + Excel/PDF/CSV + colunas configuráveis (`CAMPOS_DA_TELA`) + modelos de impressão. Copiar esse padrão.

### 2.5 Período

`SeletorPeriodo` tem hoje: hoje, ontem, últimos 7/15/**30**, mês atual/anterior, semana atual/anterior, ano atual/anterior, exercício, atrasados, personalizado. **Faltam "últimos 90 dias", "últimos 6 meses" e "últimos 12 meses"** (pedidos dela). É um acréscimo de presets (e testes), não um componente novo. O período já vai na URL.

### 2.6 E-mail

Resend, nas Edge Functions: `resumo-diario`, `resumo-semanal` (+ `-previa`), `alerta-ata-atrasada`, `alerta-visitante-esfriando`, `visitante-mensagem-teste`. Todas com **remetente fixo** `Diakonia <resumo@diakoniaapp.com.br>` repetido em cada arquivo, **sem Reply-To**, e **sem envio sob demanda com anexo**. A moldura (`desenho.ts`: cabeçalho, cartões, rodapé, paleta) e os textos institucionais são únicos e têm teste de consistência (`emailDesignSystem.test.ts`). Detalhe e proposta de arquitetura: documento da Central de Comunicação.

## 3. O que os dados reais dizem (medição de hoje, só leitura)

**Qualidade da identificação (dízimos com pessoa ligada), por trimestre:**

| 2025 T1–T4 | 2026 T1 | T2 | T3 | T4 (até 25/10) |
|---|---|---|---|---|
| 32% · 30% · 33% · 31% das entradas (32% · 29% · 35% · 32% do valor) | 92% (93% do valor) | 90% (95%) | 93% (98%) | 91% (97%) |

Causa provável: a importação histórica (Omie, set/2026) trouxe 2025 sem a pessoa; de 2026 em diante a identificação passou a ser feita na entrada. **Consequência:** "novo dizimista" calculado com histórico de 2025 marca como *novo* quem simplesmente não tinha sido identificado.

**Fotografia dos últimos 6 meses (26/04 a 25/10/2026), dízimos:** 550 entradas, **97 pessoas distintas**, **R$ 374,5 mil identificados de R$ 388,6 mil (96%)**; 31 contribuíram em **todos** os 6 meses (recorrentes); dos 97, 86 são membros ativos, 3 membros inativos e 8 congregados; 88 têm celular e 56 têm e-mail cadastrado. A **adesão semanal** (dizimistas distintos por semana) varia de **7 a 38** e tem **padrão mensal claro**: picos na primeira semana do mês (33, 31, 34, 38…) e vales no meio (7–9) — o que justifica o gráfico "curva de adesão" e o destaque automático da "semana de maior adesão".

> Estes números são **exemplos de plausibilidade**, não o relatório. Os "novos" e o "sem contribuição recente" calculados sobre histórico que vai a 2025 **não** devem ser usados antes da regra do piso (seção 4.3).

## 4. Análise funcional

### 4.1 Os indicadores pedidos — definição exata

| Indicador | Definição proposta | Atenção |
|---|---|---|
| Dizimistas únicos | pessoas distintas com ≥1 entrada na categoria Dízimos no período | só conta quem tem `pessoa_id`; mostrar "N sem identificação" |
| Total de doadores | pessoas distintas com ≥1 entrada **qualquer** categoria de doação (dízimos, ofertas, missões) | exclui transferências e rendimentos |
| Total arrecadado | soma das entradas do período, **por categoria** | mostrar também o valor **não identificado** |
| Média mensal | total ÷ nº de meses do período | período parcial: dividir por meses *decorridos* |
| Média por doador | total identificado ÷ doadores | |
| Frequência média | contribuições por doador no período (e/ou por mês ativo) | |
| % de recorrência | dizimistas com contribuição em **todos** os meses do período ÷ dizimistas | meses incompletos do começo/fim contam? (decisão) |
| Novos dizimistas | 1ª contribuição **identificada** dentro do período e **depois do piso (jan/2026)** | sem o piso, falso positivo |
| Sem contribuição recente | contribuíram antes e não nos últimos 30/60/90 dias | exclui falecidos/transferidos/desligados e inativos |

### 4.2 Gráficos (os quatro pedidos)

1. **Evolução das contribuições** — linha (total por semana ou por mês, o seletor decide), com linha de tendência e seta de alta/queda no período. recharts.
2. **Curva de adesão** — contribuintes **distintos** por semana (não valor). É o gráfico que mostra engajamento; no dado real aparece o ciclo mensal. recharts (barras ou área).
3. **Distribuição mensal** — barras por mês, com **comparação** de dois períodos (ex.: últimos 6 meses × 6 meses anteriores). recharts.
4. **Semanas de destaque** — cartões automáticos: maior adesão, maior arrecadação, maior crescimento sobre a semana anterior (cálculo puro, sem gráfico novo).

### 4.3 Grupos automáticos

- **Recorrentes:** contribuíram em todos os meses do período.
- **Novos:** primeira contribuição identificada no período **e** posterior ao piso de identificação (parâmetro: `PISO_DE_IDENTIFICACAO = 2026-01-01`, mostrado na tela).
- **Em acompanhamento (30/60/90):** contribuíram antes do período/janela e não contribuem desde N dias; **fora** deste grupo: falecidos, transferidos, desligados.
- Cada grupo é um **filtro da lista**, não uma tela à parte (chip com contador).
- ⚠ **Relacionamento, não cobrança.** "Em acompanhamento" deve levar a *cuidado pastoral* (o app já tem a Central de Acolhimento e tarefas), não a uma lista de inadimplentes. Texto e cor da interface importam: neutros, nada de vermelho.

### 4.4 Filtros e colunas

- **Filtros:** categoria (dízimo/oferta/missões — substitui "apenas dizimistas/ofertantes"), tipo de pessoa (membro/congregado/visitante — `membros.tipo_pessoa`), primeira contribuição, recorrente, sem contribuição recente, faixa de valor, família, ministério. Tudo na URL (padrão `useEstadoNaUrl`).
- **Colunas configuráveis:** nome, família, telefone, e-mail, ministério, última contribuição, nº de contribuições, total, média mensal, frequência — padrão do `CAMPOS_DA_TELA` do Extrato (escolha salva por usuário). **Telefone e e-mail** só para quem já vê `membros` (a RLS manda).

## 5. Arquitetura

### 5.1 Evoluir Doadores × Central de Relatórios nova

| Opção | Veredito |
|---|---|
| **A. Evoluir `/financas/doadores`** (painel executivo + Pessoas + exportar/enviar) | **Recomendada.** Mesmo dado, mesma permissão, mesma rota; o pastor/tesoureiro já sabem onde fica. Nome do menu: "Doadores" → **"Contribuições"** (a avaliar: o pastor pediu "dizimistas", a tela vai além de doadores). |
| B. Nova "Central de Relatórios" com um relatório de dizimistas | Duplica consulta, filtros e permissão; esconde a análise dentro de "relatório". |
| **C. Central de Comunicação e Relatórios** como camada de **entrega** | **Sim, mas só para enviar/agendar/histórico** (documento irmão). O botão "Enviar relatório" da tela de Contribuições abre essa camada. |

### 5.2 Camadas (a lição dos e-mails: "o MESMO cálculo")

1. **`_shared/contribuicoes/analise.ts` (puro, testado)** — recebe linhas mínimas (`pessoa_id, data, valor, categoria`) + o cadastro mínimo e devolve indicadores, grupos, semanas e destaques. Mora em `supabase/functions/_shared/` e é **re-exportado** em `src/lib/` (precedente: `assinaturaDoSistema`, `mensagensVisitante`). Assim **a tela, o Excel e o e-mail dizem exatamente o mesmo número** — o defeito que adiou os blocos "Prontidão" e "Documentos" do resumo semanal.
2. **`services/contribuicoesService.ts`** — a consulta paginada que já existe (`listarDoadoresComResumo`), generalizada: traz `categoria_id` e `data`, **sem agregar no banco**. Escala: ~5,5 mil entradas em 21 meses = 6 páginas de 1.000; cabe em memória no cliente. Para o e-mail (Edge Function), o ideal é uma RPC `contribuicoes_do_periodo(p_ini, p_fim)` `SECURITY DEFINER` com **guarda de papel** que devolve só as linhas mínimas (evita duplicar a regra de acesso na função).
3. **Tela** — componentes novos pequenos sobre o que existe: cartões de indicador (padrão dos cartões do Painel), gráficos recharts, lista com chips e colunas configuráveis.
4. **Exportação** — `xlsxSimples` (abas: Resumo · Pessoas · Semanas), CSV, PDF por impressão; PDF **anexável** só na Fase 4 (pdf-lib).
5. **Entrega** — Edge Function única de envio sob demanda (documento da Comunicação).

### 5.3 O que muda no sistema atual

- `doadorService.listarDoadoresComResumo` continua (a tela atual e o detalhe dependem dele) até a migração; depois vira um *uso* do serviço novo.
- Rota, permissão (`ROLES_DOADORES`) e favoritos **não mudam**; o rótulo do menu muda (`navegacao.ts`/`navConfig.ts`).
- Sem migration na Fase 1 (só leitura). Migrations só nas fases de envio/histórico.
- Teste de rotas (`TELAS` × `App.tsx`) e o teste do design system de e-mail passam a cobrir os novos pontos.

## 6. Privacidade — a decisão que vem primeiro

Contribuição individual é **dado financeiro e, indiretamente, de convicção religiosa** (LGPD: dado sensível). O próprio comentário do `doadorService` registra o risco pastoral de virar "ranking de doadores". E há um fato novo: o **pastor não está em `ROLES_DOADORES`**.

| Nível | O pastor recebe | Risco |
|---|---|---|
| **A. Agregado** (padrão recomendado) | indicadores, gráficos e semanas, **sem nomes nem valores individuais** (nº de dizimistas, recorrência, curva de adesão, total) | mínimo; responde "como está o engajamento?" |
| **B. Nominal só no app** | lista com nomes **dentro do sistema**, para quem tem papel autorizado | o acesso fica no login e no controle de papéis |
| **C. Nominal por e-mail (PDF/Excel)** | arquivo com nomes e valores circulando em caixas de e-mail | vaza; sem controle depois do envio |

**Recomendação:** o e-mail leva **A** (corpo com indicadores + gráficos agregados); a lista nominal fica em **B** (app); **C** só se ela decidir, com: confirmação explícita ("este arquivo contém nomes e valores"), só para destinatários da lista autorizada, **registro no histórico**, e valores individuais **em faixas** por padrão (valor exato opcional). Qualquer das três exige decidir **se o pastor passa a ter acesso nominal** (hoje não tem) — uma decisão de governança dela e da liderança, não do código.

## 7. Experiência (wireframes)

### 7.1 Painel executivo — `/financas/doadores`

```
Contribuições                                     [ Enviar relatório ]  [ Exportar ▾ ]
Período:  Últimos 30 · 90 · [6 meses] · 12 meses · Ano · Personalizado       Categoria: [Dízimos ▾]
Cobertura de identificação: 96% do valor (jan/2026 em diante)   ⓘ

┌ Dizimistas ┐ ┌ Doadores ┐ ┌ Arrecadado ┐ ┌ Média mensal ┐ ┌ Média/doador ┐
│     97     │ │   110    │ │ R$ 388,6 mil│ │  R$ 64,8 mil │ │   R$ 3.860   │
└────────────┘ └──────────┘ └─────────────┘ └──────────────┘ └──────────────┘
┌ Recorrência ┐ ┌ Freq. média ┐ ┌ Novos ┐ ┌ Sem contrib. (60 d) ┐
│    32%      │ │ 5,2 / pessoa│ │  …    │ │          …          │
└─────────────┘ └─────────────┘ └───────┘ └─────────────────────┘

 Evolução (linha)            │  Curva de adesão (dizimistas por semana)
 ~~~~/\~~/\~~~~/\~           │  ▂▇▃▂▁▆▃▂▁▅▃  ← pico na 1ª semana do mês
 Distribuição mensal (barras, vs período anterior)
 ▇ ▆ ▇ ▅ ▇ ▆
 Destaques:  maior adesão: sem. 30/08 (38)  ·  maior arrecadação: sem. …  ·  maior crescimento: …
```

### 7.2 Pessoas — mesma rota, aba "Pessoas"

```
Grupos:  (Todos 97) (Recorrentes 31) (Novos …) (Em acompanhamento 30/60/90 …)
Filtros: Tipo ▾  Família ▾  Ministério ▾  Faixa de valor ▾  [Colunas ▾]
Nome ........ Última ... Nº ... Total ... Média/mês ... Freq.
(... linhas ...)     ordem padrão: NOME (não valor)
```
Celular: indicadores empilhados em 2 colunas, gráficos um abaixo do outro, lista em cartões (padrão de `Membros.tsx`).

### 7.3 Enviar relatório (gaveta)
Escolher modelo (Dizimistas — agregado/nominal) → destinatários (lista autorizada + e-mail avulso) → **pré-visualização obrigatória** → Enviar. Detalhe na Central de Comunicação.

### 7.4 Fluxo
Menu Tesouraria › **Contribuições** → período → painel → (Pessoas | Exportar | Enviar). O detalhe da pessoa (`/financas/doadores/:id`) ganha um mini gráfico por mês. Voltar devolve período e filtros (estado na URL).

## 8. E-mail e histórico (resumo; o resto na Central de Comunicação)

- **Remetente `relatorios@`:** é só trocar o `from` (o Resend verifica o **domínio**, não cada caixa; `resumo@` já funciona). Vale para qualquer endereço do domínio; falta decidir **onde caem as respostas** (Reply-To da igreja).
- **Corpo do e-mail** (como ela pediu): período, total, nº de contribuintes, semana de maior adesão, indicadores, resumo executivo — **sem nomes** no padrão. Gráficos como barras em HTML de tabela. Anexos: Excel (pronto) e PDF (precisa de gerador pdf-lib).
- **Histórico:** tabela nova (`comunicacao_envios`: relatório, parâmetros, remetente, Reply-To, destinatários, solicitante, data/hora, origem, anexos [nome/tamanho], resultado por destinatário). **Não guardar o conteúdo nominal**; guardar o que foi pedido e o resumo agregado. Hoje só existem as execuções do agendador e `resumo_diario_enviados` (itens listados), **sem solicitante nem destinatários**.

## 9. Roadmap

| Fase | Entrega | Esforço |
|---|---|---|
| **0** | Decisões da seção 11 + `PISO_DE_IDENTIFICACAO`; ver por que 2025 não foi identificado e se dá para completar (fora do código) | 0,5 d + trabalho dela |
| **1** | Cálculo puro + serviço + painel executivo (indicadores, 4 gráficos, destaques, presets 90 d/6 m/12 m); **só leitura, sem migration** | 4–5 d |
| **2** | Aba Pessoas: grupos, filtros, colunas configuráveis, detalhe com gráfico | 3 d |
| **3** | Exportar Excel/CSV/PDF (impressão) | 1,5 d |
| **4** | Enviar por e-mail (corpo agregado + Excel) + histórico — depende da Central de Comunicação (Fases 1–2 dela) | 3–4 d |
| **5** | Relatório mensal automático ao pastor (agendado) e PDF anexável (pdf-lib) | 2–3 d |

Total aproximado: **14–17 dias** de trabalho, entregue em fatias úteis (a Fase 1 já responde ao pedido do pastor *dentro do app*).

## 10. Para o pedido imediato do pastor

Antes de qualquer fase: o relatório "dizimistas dos últimos 6 meses" já é **possível hoje** com os dados que existem — como um arquivo gerado uma vez (sem tela), no nível **A (agregado)**, ou **B/C** se ela decidir que ele recebe nomes. Mesmo cálculo, mesmo número que a Fase 1 vai mostrar. Digo quanto antes para ele não esperar o módulo inteiro.

## 11. Decisões que dependem dela

1. **O pastor passa a ter acesso nominal às contribuições?** (hoje não tem). Se não: relatório agregado (A). Se sim: por qual canal (app, e-mail) e com que registro.
2. **Valor individual no relatório nominal:** exato, ou em faixas?
3. **Nome do menu:** "Contribuições" (recomendado), "Doadores e Dizimistas" ou manter "Doadores".
4. **Piso de identificação:** aceitar **jan/2026** como início confiável (e mostrar a cobertura), ou tentar completar a identificação de 2025 antes?
5. **"Dizimista" = quem tem Dízimos no período** (recomendado) ou quem contribui com dízimo **e** é membro?
6. **Recorrência:** contar meses incompletos do começo/fim do período?
7. **"Em acompanhamento":** 30/60/90 dias, e o destino da lista (tarefa de acolhimento? lista para a liderança?).
8. **Quem pode usar "Enviar relatório":** `ROLES_DOADORES` (admin, diakonia, tesouraria) ou só administração.
9. **Primeiro entregável:** o relatório avulso do pastor (agora) e/ou começar pela Fase 1.
10. **Prestação de Contas:** passar a usar o **mesmo cálculo** de dizimistas (por `pessoa_id`), em vez do contador por nome normalizado de hoje? (muda o número que a Diretoria e o Conselho veem).

## 12. Riscos

- **Número que parece certo e não é** (identificação antes de 2026) — mitigado por piso + cobertura visível.
- **Ranking e constrangimento** — mitigado por ordem padrão por nome, agregados no e-mail, faixas de valor e linguagem neutra em "acompanhamento".
- **Dado sensível por e-mail** — mitigado por nível A como padrão, confirmação e histórico.
- **Duas verdades** (Prestação de Contas × painel novo) — mitigado por **um** cálculo compartilhado e por revisar `prestacaoIndicadores` junto.
- **Peso da consulta** — hoje 6 páginas; cresce ~3 mil entradas/ano; se passar de ~20 mil, mover a agregação para uma RPC.

## 13. Decisões dela (27/10/2026) e o bloco "Não contribuíram no período"

### 13.1 O que ela decidiu

- **Doadores evolui** (Fase 3); nenhuma tela nova. Reaproveitar filtros, Excel/CSV, gráficos, períodos e e-mail.
- **Piso analítico oficial: 01/01/2026** para todo relatório de doadores/dizimistas. Antes disso a identificação por pessoa é de ~30–35% e qualquer "novo", "recorrente" ou "nunca contribuiu" seria falso.
- **Pastor:** por e-mail recebe só o relatório **agregado** (período, dizimistas identificados, total, média mensal, maior semana de adesão, novos, recorrentes). A **lista nominal** fica **só dentro do sistema**, para usuários autorizados, com **registro de quem visualizou** (a trilha de visualização vira requisito, não opcional).
- O pastor hoje **não** está em `ROLES_DOADORES`: dar-lhe acesso é parte da decisão e deve nascer junto com a trilha de visualização.

### 13.2 Novo bloco: quem NÃO contribuiu no período filtrado

Pedido: apresentar também os **nomes dos membros que não contribuíram nenhuma vez** no período filtrado.

**Indicadores (sempre agregados, aparecem no e-mail do pastor sem nome):**

| Indicador | Definição |
|---|---|
| Base | membros e congregados **ativos** no fim do período (visitantes fora; `status` ≠ ativo fora: inativo, transferido, desligado, falecido) |
| Contribuíram | pessoas da base com ≥1 entrada **identificada** (dízimo ou oferta/missões, como o filtro escolher) no período |
| Não contribuíram | base − contribuíram |
| Adesão | contribuíram ÷ base |
| Nunca contribuíram (desde o piso) | sem nenhuma entrada identificada desde 01/01/2026. **Nunca** se afirma "nunca na vida": antes do piso o dado não permite |
| Já contribuíram, mas não no período | tinham entrada identificada desde o piso, nenhuma no período |
| Sem contribuição há 30 / 60 / 90 / 180 dias | faixas a partir da última entrada identificada (só dentro do piso) |

**Lista nominal (somente dentro do sistema, com trilha de visualização):** nome, tipo (membro/congregado), última contribuição identificada (data) ou "nenhuma desde 01/01/2026", classificação (nunca / já contribuiu / faixa de dias), vínculo familiar quando houver. **Sem valores** — quem não contribuiu não tem valor, e a lista não deve virar ranking. Ordem padrão: alfabética. Filtros: tipo de pessoa, categoria de contribuição, faixa de dias, e "mostrar só quem não tem outra pessoa da família contribuindo".

**Ressalvas que a tela precisa dizer (o número engana sem elas):**

1. **Identificação incompleta:** 7–10% dos dízimos de 2026 não têm pessoa ligada; parte de quem "não contribuiu" pode estar nesse resíduo. Mostrar "N entradas sem identificação (R$ X)" ao lado da lista.
2. **Famílias e casais:** quem contribui pelo cônjuge/responsável aparece como "não contribuiu". O vínculo vem de `vinculos_familiares` (não de `familia_id`); oferecer o marcador "família contribui" para não acusar quem contribui por outra pessoa.
3. **Menores de idade** e dependentes: excluir da base por padrão (opção para incluir).
4. **Envelope em espécie / oferta sem identificação:** invisível ao cálculo.
5. **Período antes do piso:** a tela recusa ("dados de identificação confiáveis a partir de 01/01/2026") em vez de calcular.
6. **Linguagem neutra:** o título é "Sem contribuição registrada", nunca "inadimplentes" ou "faltosos"; a finalidade é o cuidado pastoral.

**Privacidade:** a lista de quem **não** contribui é tão sensível quanto a de quem contribui. Mesmas regras: só dentro do sistema, só papéis autorizados, cada visualização/exportação registrada (quem, quando, filtros usados). Nunca em e-mail com nomes.

**Reuso:** o mesmo cálculo único (seção 5.2) alimenta tela, exportação e o agregado do e-mail, para o número do pastor ser o mesmo da tela. `prestacaoIndicadores` (que conta por nome normalizado) deve passar a usar esse cálculo antes de este bloco ir ao ar, ou os dois relatórios discordarão.

**Medição pendente:** quantos membros/congregados ativos existem por tipo e quantos têm entrada identificada desde 01/01/2026 (contagens, sem listar nomes) — a fazer, só leitura, antes da Fase 3.
