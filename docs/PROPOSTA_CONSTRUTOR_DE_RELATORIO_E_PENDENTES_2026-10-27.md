# Construtor de relatório (o que mostrar) e aba "Pendentes de Identificação" — proposta antes de implementar

27/10/2026. **Nada foi implementado.** Parte do que está no pedido já existe; o que falta está na seção 1. Base: o código publicado em `6e77429` e `2909642`, e a investigação da aba Pendentes feita na sessão "Alterações no UX".

## 1. Em uma página

- **Ela tem razão: falta escolher o que vai no e-mail.** Hoje a gaveta "Enviar por e-mail" escolhe período e destinatários, mas o conteúdo é fixo (todos os blocos agregados). A proposta é um **construtor por blocos** com **modelos** (Pastor, Diretoria, Tesouraria…).
- **Uma regra que o pedido novo atropela e precisa de decisão:** a decisão de 27/10 foi *agregado por e-mail, nomes só dentro do sistema com registro de quem viu*. O texto colado oferece "Dados nominais" (nomes, valores, telefone, e-mail) **como blocos do relatório enviado**. Proponho manter a regra: **blocos nominais existem no construtor, mas só para tela e exportação dentro do sistema (com registro); por e-mail só agregados**. Se ela quiser nomes por e-mail, é uma exceção explícita (ver decisão 2).
- **Boa parte do "Dados pastorais" cabe no e-mail sem nomes:** *quantos* contribuíram, *quantos* não, *quantos* nunca contribuíram desde 01/01/2026, *quantos* sem contribuição há 30/60/90/180 dias e a adesão em %. O cálculo já existe (`analisarSemContribuicao`); só falta torná-lo bloco.
- **Pendentes de Identificação:** concordo que virou prioridade — todo número de pessoas (dizimistas, novos, recorrência, "não contribuíram") só conta quem foi identificado, e hoje 8,8% do valor (273 entradas, R$ 41,8 mil no período de 6 meses) está fora. Falta onde trabalhar isso. Proposta na seção 3.
- **Os números "211 fáceis / 48 médias / 14 difíceis" do texto colado são ilustrativos: ninguém os mediu.** O real é 273 pendentes (6 meses). A classificação fácil/média/difícil só existe depois de implementar as sugestões automáticas.
- **Ordem recomendada:** (A) construtor com blocos e 3 modelos embutidos (~2 dias, sem migration) → (B) Pendentes de Identificação, fila e ações (~5–6 dias, uma migration) → (C) modelos salvos pelo usuário e blocos nominais para exportação (~3 dias).

## 2. Construtor de relatório

### 2.1 O que já existe e o que falta (contra a lista do pedido)

| Do pedido | Situação | Vai por e-mail? |
|---|---|---|
| Indicadores: total arrecadado, nº de contribuintes, média mensal, média por contribuinte, novos, recorrentes | **existem** (no e-mail são fixos) | sim |
| **Percentual de adesão** (sobre membros e congregados ativos) | existe só na aba Sem contribuição | sim (agregado) |
| Gráficos: evolução, adesão semanal, mensal | existem (no e-mail: barras em tabela) | sim |
| "Contribuintes por período" | é a curva de adesão | sim |
| Dados pastorais **como contagens**: contribuíram, sem contribuição, nunca desde 01/01/2026, contribuíram antes e não no período, 30/60/90/180 dias | cálculo pronto; **falta o bloco no e-mail** | sim (sem nomes) |
| Dados nominais: nome, última contribuição, frequência, quantidade, total contribuído | existem nas abas Pessoas e Sem contribuição, com Excel/CSV | **não** (só no sistema) |
| Contato: telefone, e-mail, ministério, família | **não existem na lista**; faz sentido só no sistema (a RLS de `membros` já controla) | **não** |
| Modelos Pastor / Tesouraria / Diretoria | não existem | — |
| Prévia do que será enviado | existe (obrigatória) | — |
| PDF | não existe como arquivo (só impressão do navegador); Excel existe | Excel sim, PDF depois |

### 2.2 Blocos (cada um independente e ligável)

Registro único em código (`BLOCOS_DE_CONTRIBUICOES`): `id`, título, **nível** (`agregado` | `nominal`), onde pode sair (`email`, `tela`, `excel`).

| Bloco | Nível | E-mail | Observação |
|---|---|---|---|
| Resumo executivo (texto) | agregado | ✔ | já existe |
| Indicadores principais | agregado | ✔ | dizimistas, doadores, arrecadado, médias, frequência |
| Recorrentes e novos | agregado | ✔ | |
| Arrecadação por categoria | agregado | ✔ | |
| Evolução / Curva de adesão / Distribuição mensal | agregado | ✔ | |
| Destaques (semanas) | agregado | ✔ | |
| **Adesão da base** (ativos, contribuíram, não contribuíram, %) | agregado | ✔ | **novo** |
| **Sem contribuição: contagens** (nunca desde o piso; antes e não agora; 30/60/90/180 dias) | agregado | ✔ | **novo** |
| Cobertura da identificação | agregado | ✔ | já existe |
| Lista de pessoas / Sem contribuição nominal / Contato / Valores individuais | **nominal** | ✘ | só tela e Excel, com registro |

### 2.3 UX da gaveta (proposta)

```
Enviar relatório de contribuições
Modelo:  ( Pastor ) ( Diretoria ) ( Tesouraria ) ( Personalizado )
Período: [ 6 meses ▾ ]                 → 28/04/2026 a 27/10/2026
O que mostrar
  Indicadores   ☑ Principais  ☑ Recorrentes e novos  ☑ Por categoria
  Gráficos      ☑ Evolução   ☑ Curva de adesão       ☑ Mensal
  Pastoral      ☑ Adesão da base  ☑ Sem contribuição (quantidades)
  Só no sistema ☐ Nomes · valores individuais · contato   (não vão por e-mail)
Destinatários [ ... ]
[ Visualizar ]  [ Enviar teste ]  [ Enviar ]   ← Enviar só depois da prévia
```

- **Modelos embutidos (v1):** *Pastor* = indicadores + recorrentes/novos + adesão da base + sem contribuição (quantidades) + curva de adesão; sem categorias detalhadas. *Diretoria* = indicadores + categorias + gráficos de evolução e mensal; sem pastoral. *Tesouraria* = tudo agregado.
- **Mudou um bloco depois de visualizar → a prévia perde a validade** (mesma regra do período).
- O histórico passa a registrar **quais blocos** foram (`parametros.blocos`), sem conteúdo.

### 2.4 Arquitetura

- `_shared/contribuicoes/blocos.ts`: registro + `blocosDoModelo(modelo)` + validação (lista permitida; **bloco nominal recusado no e-mail**, também no servidor).
- `montarEmailDeContribuicoes(analise, { blocos, adesaoDaBase })`: monta só o que foi pedido. O módulo continua recebendo **só números** (a garantia de "nenhum nome entra" não muda).
- `contribuicoes-enviar` recebe `blocos: string[]`, valida e, se o bloco de adesão da base for pedido, calcula `analisarSemContribuicao` no servidor (lê `membros` e vínculos só para contar; nenhum nome sai).
- **v1 sem migration** (modelos embutidos em código). **Modelos salvos pelo usuário** (fase C) = tabela `comunicacao_modelos` (nome, finalidade, blocos, criado por), RLS admin/diakonia.
- Esforço: **~2 dias** para v1 (registro, blocos novos, gaveta, testes, reimplantar `contribuicoes-enviar`); **~1,5 dia** para modelos salvos.

## 3. Aba "Pendentes de Identificação" (em `/financas/doadores`)

### 3.1 O que o código já oferece (investigação)
- Pendente = entrada de Dízimos/Ofertas/Missões desde 01/01/2026 **sem `pessoa_id`** (`cobertura.entradasSemPessoa`). Medido hoje: **273** entradas, **R$ 41.760,83** (6 meses).
- `fin_lancamentos.familia_id` **existe**, sem FK e sem uso no app. `pessoa_id` tem FK para `membros`.
- Já existem a busca de pessoa para lançamento (`buscarPessoasParaLancamento`), comparação de nomes (`fuzzyNome`, `favorecidoPorNome`) e a trilha imutável de edição (`fin_lancamento_historico`).

### 3.2 Proposta funcional
- **Fila** das pendentes (período padrão: desde o piso), com data, valor, categoria, descrição/nome do extrato e a **melhor sugestão**.
- **Ações por linha:** Vincular pessoa · Vincular família (escolhe a família e quem é o contribuinte, padrão o responsável) · Aceitar sugestão · Marcar como anônimo · Ignorar · Desfazer.
- **Indicadores de progresso:** identificadas (% do valor e % das entradas), pendentes, classificadas (anônimas + ignoradas), **meta** configurável (ex.: 95%) e a curva da fila ao longo do tempo.
- **Sugestões automáticas (fase 2):** nome na descrição/OFX × membros (fuzzy); mesma descrição e valor já identificados antes; família da pessoa sugerida. Só aí dá para dizer "fáceis/médias/difíceis" — hoje não existe esse número.
- **Regra de taxa:** só "identificada" entra na taxa de identificação; anônimo e ignorado saem da fila mas aparecem à parte ("classificadas"), para não inflar o número.

### 3.3 Impacto na arquitetura
- **Vincular pessoa/família** = gravar `pessoa_id` (e `familia_id`) no lançamento. A trilha `fin_lancamento_historico` já registra quem mudou o quê. **O cálculo único não muda**: painel, Excel e e-mail passam a contar a pessoa automaticamente.
- **Anônimo/ignorado** não têm onde ficar hoje → **tabela nova** `fin_contribuicao_triagem` (lancamento, decisão, motivo, quem, quando), imutável com "desfazer" por nova linha; migration. O app degrada sem ela (como nas outras telas).
- **Escrita com `conferir()`** e permissão do lançamento (a RLS manda; tesouraria/admin/diakonia).
- Arquivos novos (lógica e componentes da aba), com **edição mínima** em `FinancasDoadores.tsx`; a outra sessão tem alterações não commitadas nesses arquivos.
- **Cuidado:** vincular pessoa muda números já enviados/visíveis (taxa e contagens). Mostrar "identificadas hoje" com data na tela e no e-mail.
- Esforço: P1 fila + indicadores só leitura **~2–3 dias**; P2 vincular pessoa **~2**; P3 triagem (anônimo/ignorar/desfazer, migration) **~1,5**; família **~1,5**; sugestões **~2**. Total **~9–10 dias**, em fatias úteis (P1+P2 já dão trabalho real à tesouraria).

## 4. Sobre "Não contribuíram" (o que já está feito)
No ar desde `6e77429`: indicadores, três classificações (nunca desde 01/01/2026, já contribuiu e não no período, faixas 30/60/90/180), filtros (tipo, situação, faixa, esconder quem tem família contribuindo, incluir menores, o que conta como contribuir), lista nominal alfabética com registro de acesso, Excel e CSV. **Não há** telefone, e-mail, ministério e "tempo sem contribuir em meses" na lista — cabem na tela e no Excel (só para quem já vê `membros`), com o mesmo registro de acesso; fica como acréscimo pequeno (~1 dia) se ela quiser.
Duas correções ao texto colado: o banco guarda a **data** do extrato, não a hora (o e-mail semanal diz só a data); e `relatorios@` hoje só envia o relatório de contribuições (visitantes, financeiro, membresia e prestação de contas ainda não enviam por e-mail).

## 5. Decisões que dependem dela
1. **Construtor v1 (blocos + 3 modelos embutidos, sem migration) agora**, antes de Pendentes? (recomendado)
2. **Nomes por e-mail:** manter "só agregados por e-mail; nominal só no sistema" (recomendado) ou abrir uma exceção (quais papéis, com confirmação e registro)?
3. **Adesão da base e quantidades de "sem contribuição" no e-mail do pastor** (agregados, sem nomes): podem entrar? (recomendado: sim)
4. **Menores de 18 anos** na adesão: fora da base por padrão, como na tela? E quem não tem data de nascimento?
5. **Modelos:** os três embutidos bastam na v1, ou ela já quer criar e salvar os seus?
6. **Pendentes:** começar por fila + vincular pessoa (P1+P2)? Meta de identificação: 95%?
7. **Anônimo e ignorado:** contam na taxa ou ficam à parte (recomendado: à parte)?
8. **Contato e ministério** na lista nominal (só dentro do sistema): quer?
9. **Quem atua nas pendentes:** admin, diakonia e tesouraria?

## 6. Decisões dela (27/10/2026) e o que foi implementado

**Decididas:** construtor primeiro (2A), depois Pendentes (2B); **adesão da base entra no e-mail** (agregada); meta de identificação **95%**; anônimo e ignorado **separados** (identificados / anônimos / ignorados / pendentes); contato (telefone/e-mail) **fora por enquanto**; modelos **Pastor, Diretoria e Tesouraria**, sem modelos por usuário nesta fase; novo bloco **"Saúde da base contribuinte"** (contribuíram, não contribuíram, novos, recorrentes, sem contribuir há mais de 30/60/90/180 dias).

**Em aberto — nomes por e-mail:** ela decidiu "não" (agregado) e depois perguntou "por que não posso ter os nomes no e-mail?". A resposta recebida diz que pode, que o cuidado maior é com o **valor individual**, e sugere um modelo Pastor "nominal sem valores". **Não é uma limitação técnica: é uma decisão de governança dela.** Nada nominal foi implementado por e-mail; o construtor foi feito de modo que isso seja um bloco novo, de nível "nominal", com confirmação, registro e papéis — sem brecha no registro atual (a validação do servidor recusa qualquer bloco fora da lista agregada).

**Implementado (2A):** registro de blocos e 3 modelos (`_shared/contribuicoes/blocos.ts`); bloco "Saúde da base contribuinte" só com quantidades (`resumirBase`); validação no servidor; gaveta com modelos e caixas por bloco, prévia que perde a validade se o período OU os blocos mudam; histórico registra quais blocos foram. Sem migration. Falta reimplantar `contribuicoes-enviar`.
