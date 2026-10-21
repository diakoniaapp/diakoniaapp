# Extrato da conta — análise de UX (21/10/2026)

**Só análise. Nada foi implementado.** Medições feitas na tela real (Bradesco, 01/09–31/10, viewport 1600 × 1010 e 375 × 812) e no código de `src/pages/FinancasConta.tsx`. Desenho: `docs/proposta-extrato-da-conta/index.html`.

## 1. O uso real dos filtros — o que dá e o que não dá para provar

**Não existe telemetria no sistema**: nenhuma tela registra quais filtros alguém usa. Então "uso real" medido, de verdade, eu não tenho — e não vou inventar um percentual. O que há são evidências indiretas, e todas apontam na mesma direção da sua percepção:

| Evidência | O que mostra |
|---|---|
| **Favoritos salvos** (`fin_favoritos`): 4, todos de relatórios/centro; **nenhum Extrato filtrado** | Ninguém fixou um extrato com categoria/centro/favorecido |
| **Entradas para o Extrato** com filtro vindo de outra tela: só `?periodo=…&de=…&ate=…` (o "continuar de onde parei" do hub e o redirecionamento da antiga Auditoria) | Nenhuma tela leva a pessoa ao Extrato já filtrada por categoria, centro ou favorecido |
| **Favorecido**: 333 favorecidos num `<select>` sem busca | Praticamente inutilizável como lista; e a **Busca já acha pelo nome do favorecido** (`idsPorNomeFornecedorOuPessoa`) — é o mesmo filtro por outro caminho |
| **Projeto**: 1 projeto cadastrado | Um filtro com 1 opção |
| **Categoria**: 42 ativas · **Centro**: 44 ativos | Seletores longos, para uso eventual |
| **Data e Valor já têm filtro no cabeçalho da coluna** (`CabecalhoFiltro`), além de "Data específica" e "Valor mín/máx" no código | Duplicidade: o mesmo filtro em dois lugares |
| **Período**: 14 opções (`PERIODO_PRESET_ORDEM`); as datas livres só aparecem em "Período personalizado" | O caminho mais usado (datas) fica escondido atrás de um seletor, e o seletor ocupa o lugar que a data usaria |
| **Resumido/Analítico**: você alterna entre os dois (as duas telas que enviou) | Os dois modos têm uso, mas a diferença é pequena |

Se você quiser **prova**, dá para medir uma semana: um contador local por filtro (sem dados pessoais) e eu volto com os números. Minha recomendação é **não esperar**: a evidência estrutural (333 opções sem busca, 1 projeto, favorecido = busca, nenhum favorito/link com filtro) já basta para tirar os filtros do caminho — e "Filtros avançados" não os elimina, só os guarda.

## 2. Onde o espaço se perde (medido em 1600 × 1010)

| Faixa | Altura |
|---|---|
| Cabeçalho + conta + ações + abas (Extrato · Conciliação · Diagnóstico · Importações) | 216 px |
| **Filtros** (8 controles em 2 linhas) | **160 px** (+14 de respiro) |
| **Resumo do período** (5 cartões) | **64 px** (+14) |
| Cabeçalho da tabela | 39 px |
| **A lista** (área rolável, até o pé da tela) | **493 px ≈ 10 linhas** (45 px cada) |

**A lista começa em y = 495** — quase metade da tela. **No celular é pior**: o card de filtros tem 398 px, os cartões 205 px, e a primeira linha só aparece em y = 1.147 — **abaixo da tela de 812 px**: ninguém vê um lançamento sem rolar.

Também vi nas suas capturas: a área rolável é **interna** à página (rolagem dupla) e o cabeçalho da tabela, ao rolar, deixa o texto da 1ª linha aparecer por trás dele (fundo translúcido). Entram no pacote.

## 3. Layout proposto

1. **Uma barra de cabeçalho**: `$ Bradesco ▾ saldo · Extrato · Conciliação · Diagnóstico · Importações ········ Importar OFX · Transferir · Imprimir · + Novo lançamento` (hoje são 2 linhas + abas).
2. **Uma barra de consulta**: `Data inicial – Data final · [Hoje] [Semana] [Mês] [30 dias] · 🔍 Buscar descrição ou favorecido · ⚙ Filtros (n) · ⚙ Colunas · ↻`.
3. **⚙ Filtros avançados** (popover): Tipo, Categoria, Centro de custo (com busca nos seletores), Situação (inclui "só vencidos em aberto" = o antigo "Atrasados"), Valor de/até, Data exata. **Favorecido e Projeto saem**: a busca cobre o favorecido; Projeto (1 só) vira texto na busca/coluna. Quando há filtro ativo, **aparecem chips removíveis logo abaixo** ("Categoria: Dízimos ✕") — nunca fica um filtro escondido filtrando sem aviso.
4. **Resumo em uma linha** (`Saldo inicial · Entradas · Saídas · Movimento · Saldo final`), mantendo as cores de entrada/saída.
5. **A lista ocupa o resto da tela**, com **uma rolagem só** e cabeçalho opaco.

### O espaço ganho

| | Hoje | Proposto |
|---|---|---|
| Onde a lista começa (1600×1010) | 495 px | ≈ 222 px (−273) |
| Altura da lista | 493 px ≈ **10 linhas** | ≈ 766 px ≈ **16 linhas** (+55%, +6) |
| Celular: 1ª linha | y = 1.147 (fora da tela) | ≈ y 400 (**~8 linhas** na 1ª tela) |

(Hoje: medido. Proposto: estimativa a partir de componentes que já existem; eu confirmo medindo depois de construído.)

## 4. Período, atalhos e a regra das datas

- **Remover o seletor "Período"**; ficam **Data inicial**, **Data final** e os atalhos **Hoje · Semana · Mês · 30 dias**, que só preenchem as datas. "Ontem", "7/15 dias", "mês/semana/ano anterior", "ano atual" e "exercício" saem (continuam possíveis digitando). O atalho é só um preenchimento: **não vira estado** — o que vale são as duas datas.
- **Atrasados** não é um período, é um **filtro de situação** (previstos já vencidos, sem data mínima): vira uma opção em Filtros avançados ("Só vencidos em aberto") — a função não se perde.
- A URL continua espelhando `de`/`ate`; links antigos com `?periodo=mes_atual` seguem funcionando (o sistema converte para datas ao abrir). O "continuar de onde parei" guarda as datas.

### Regra das datas (a que você descreveu)

> Alterar a **Data inicial** só mexe na **Data final** se a final ficar **menor** que a inicial; nesse caso a final passa a ser igual à inicial.

**Atenção, uma contradição com o histórico:** em 29/09/2026 foi você quem pediu o oposto no Extrato ("quando alterar a data inicial, corrija imediatamente a data final" — hoje `SeletorPeriodo` faz `onDataInicioChange(v); onDataFimChange(v)`). A regra nova substitui essa; confirmo que vale também a simetria (final alterada para antes da inicial → inicial = final).

**Onde a regra tem que entrar** (cada tela hoje tem o seu próprio tratamento, e várias nem corrigem a inversão):

| Tela | Hoje |
|---|---|
| Extrato da conta (`SeletorPeriodo`) | **realinha a final = inicial** (o defeito descrito) |
| Extrato de Obrigações | `mudar({inicio})` só grava; sem correção |
| Prestação de Contas | trabalha por mês/ano (`mudarInicio`/`mudarFim`) — regra própria |
| Fluxo de caixa (`FluxoCaixaCard`, usado no Painel Executivo) | cada data independente |
| Liquidações do período | cada data independente |
| Indicadores Missionários · Painel da Tesouraria (Extrato consolidado) | cada data independente |

Proposta: **uma função única** (`lib/intervaloDeDatas.ts`: `aoMudarInicio(ini, fim)` / `aoMudarFim(ini, fim)`, testada) e um componente de par de datas que todas as telas financeiras usam. É a parte menos arriscada e mais valiosa — posso fazê-la primeiro, separada do layout.

## 5. Resumido × Analítico × Colunas

**O que cada modo faz hoje** (`modoResumido` aparece em 25 pontos do código): Resumido = Data · Descrição · Valor. Analítico = + Categoria · Centro · **Saldo** (+ Conta em "todas as contas") + linha de apoio + detalhe de juros/multa. Ou seja: **o Resumido esconde o Saldo** — justamente o que mais se espera de um extrato bancário. Favorecido e Projeto **não são colunas em nenhum dos dois** (o favorecido é a própria descrição; o projeto é um ícone); Documento só aparece dentro de "Detalhes".

| | Manter os dois modos (B) | **⚙ Colunas (A)** |
|---|---|---|
| Resolve "ver Saldo sem Categoria"? | só se redefinir os modos | sim |
| Favorecido, Projeto, Documento como coluna | só no Analítico | sim, em qualquer combinação |
| Celular | modo fixo | padrão **Compacto** lembrado no aparelho |
| Manutenção | 2 modos × 25 ramificações | uma lista de colunas |
| Risco | baixo | médio (reescrever 25 pontos de `modoResumido`) |

**Recomendação: Opção A.** ⚙ Colunas com **Data, Descrição e Valor fixas** e Saldo, Categoria, Centro, Favorecido, Projeto, Documento ligáveis; dois atalhos ("Compacto": Data·Descrição·Valor·Saldo — o Resumido da sua Opção B — e "Completo") que **só marcam as caixas**. A escolha fica no aparelho (`localStorage`), com o padrão de celular em Compacto. A Opção B repete o problema de hoje (dois modos fixos que a pessoa não consegue ajustar).

## 6. Riscos e o que preservar

- **Impressão/PDF** do extrato lê a tela: colunas e filtros ativos precisam sair no papel (cabeçalho "filtros: …").
- **Seleção em lote** (checkbox) e as ações por linha (anexos, detalhes, editar, excluir) ficam como estão.
- **Contexto lembrado** (conta + datas) e links antigos com `periodo=`: compatibilidade mantida.
- **Filtro invisível** é o maior risco do "Filtros avançados": por isso os chips de filtro ativo + contador no botão ("⚙ Filtros 2").
- **Sem mexer em dados**: é só interface; nenhuma migration.

## 7. Ordem sugerida (cada etapa publicável sozinha)

1. **Regra das datas** — `lib/intervaloDeDatas.ts` + par de datas único, nas 7 telas (pequena, testável, sem mudar layout).
2. **Barra única + atalhos + Filtros avançados + resumo em linha** (o ganho de espaço).
3. **⚙ Colunas** (substitui Resumido/Analítico).
4. Rolagem única da lista e cabeçalho opaco; revisão do celular.

## 8. Decisões que preciso de você

1. Confirma a **Opção A (⚙ Colunas)** com os atalhos Compacto/Completo?
2. Confirma que **Favorecido e Projeto saem dos filtros** (a busca cobre o favorecido)? Ou prefere manter Favorecido dentro de Filtros avançados com busca?
3. **"Atrasados"** como opção de situação em Filtros avançados — ok?
4. A regra das datas **substitui** a de 29/09 também no Extrato — ok? E vale a simetria (final antes da inicial → inicial = final)?
5. Começo pela etapa 1 (datas), que posso publicar sem esperar o resto?
