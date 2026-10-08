# Conciliação bancária — Omie × DiakoniaApp, e a proposta de uma central de decisões para a tesouraria

> Análise de 08/10/2026. Não copia o Omie: usa o que ele faz bem como ponto de comparação e mede o DiakoniaApp **com dado real**.
> Nada foi alterado no sistema para produzir este relatório (a medição usou um teste temporário, já apagado).

## 0. O achado que muda a conversa

O pedido descreve um sistema que "só importa a movimentação e pede para completar tudo à mão". **Isso já não é verdade desde 06/10/2026**:
o DiakoniaApp já lê o OFX, reconhece a pessoa pelo nome, sugere categoria e centro, dá confiança com motivos, separa em
*identificadas / precisam de revisão / não identificadas*, aplica a regra do dízimo, encontra débito automático previsto e documento a
pagar, evita duplicidade pelo FITID e grava em lote com "Desfazer". **O que falta não é "começar a inteligência": é (1) fechar quatro lacunas
medidas e (2) transformar a tela em uma fila de decisões.** O resto deste documento prova isso com números.

## 1. Como foi medido (e o que não foi)

**Backtest no OFX real de setembro** (`Bradesco_05102026`, 353 movimentos, 01/09 a 05/10). Simulei uma importação "às cegas":
o motor de sugestão recebeu **só o histórico anterior a setembro** (lançamentos realizados e conciliados desde 07/2024) e foi comparado com o que a
tesouraria **de fato lançou** em setembro. Parear movimento com lançamento por tipo + valor + janela de 5 dias deu **205 pares seguros**
(58%); 38 ficaram ambíguos (valor/data repetidos) e 110 não têm lançamento correspondente (ver §6). Os percentuais abaixo valem para os 205 pares.

**Omie**: só o que aparece nas **4 telas** que você mandou (importar extrato, análise do extrato, tela "Extrato para Conciliação" com linha
conciliada e com linha "não encontrada"). **Os cliques do Omie são estimativas** a partir dessas telas — não vi o formulário "Adicionar como novo
lançamento" aberto, e o contei como o de um lançamento comum (cliente, categoria, departamento, salvar). **Cliques do DiakoniaApp** foram contados
no código da tela (`ConciliacaoOFXDialog.tsx`), um clique = um toque em controle (digitação e janela do sistema operacional não contam).

## 2. O que o Omie faz (como se vê nas telas)

| Conceito | Como aparece | Vale absorver? |
|---|---|---|
| Extrato vira **fila de trabalho** | Lista "Lançamentos Importados" com Data, Lançamento, Valor e **Situação** (ícone de barras = força do casamento), filtros em cada coluna, 50 por página (201–250 de 353) | Sim — a fila e a situação por linha |
| **Mestre-detalhe** | Lista à esquerda; à direita, "Informações do Lançamento para Conciliação" da linha escolhida | Sim — um lugar só para decidir, sem formulário em cima de formulário |
| **O que achou / não achou** | "Lançamento conciliado: conciliado com o lançamento do dia 01/09, valor, categoria Dízimos, cliente, nº do documento" × "Lançamento não encontrado. Selecione uma das opções abaixo…" | Sim — dizer o que encontrou **e por quê** |
| **Seis ações na linha** | Conciliar este lançamento · Adicionar como novo lançamento · Nova transferência entre contas · Nova conta a receber · **Buscar e associar a um lançamento que já existe** · **Ignorar este lançamento** | Sim, principalmente "buscar e associar" e "ignorar" (o Diakonia não tem os dois) |
| Barra de progresso na análise | "Extrato importado: analisando os movimentos agora" | Já temos texto equivalente |
| **Omie.Cash** | Faixa fixa: "Quero ativar a conciliação bancária **automática**" | Não: é um produto à parte. O modo manual do Omie é lento *por desenho* |

**Onde o Omie é mais fraco para uma igreja** (nas próprias telas):
- Quando não encontra, **não sugere nada**: devolve seis botões genéricos. Cada PIX de dízimo vira um formulário em branco.
- Casa **por valor e data**, não por pessoa. Na tela "conciliada", o extrato diz *VANESSA DO NASCIMENTO … R$ 500,00* e o lançamento ligado mostra
  *Cliente: VANESSA ALVES DE MEIRELES PIMENTEL* — nomes diferentes (o cadastro da igreja tem **três** Vanessas). Pode ser outra pessoa pagando, mas é
  exatamente o tipo de ligação que, num dízimo, manda o recibo para a pessoa errada. (Vale conferir esse caso.)
- O Omie também não achou o `PIX QR CODE … MARIO ALBERTO BARBOSA R$ 10,10`: terminado em ",10", e ficou como exceção.

## 3. O que o DiakoniaApp já faz melhor

1. **Reconhece quem é pelo nome**, não só por valor: `PIX RECEBIDO REM: VANESSA DO NASCIMENTO` → *Vanessa Do Nascimento Oliveira*, e **recusa** nome só parecido
   sem pedir confirmação (teto de 80%).
2. **Confiança com motivos por extenso** ("2 de 3 lançamentos dela foram dízimo") e três faixas — o que você pediu como "fila" já existe como filtros.
3. **Regra do dízimo** (cadastrada + mais de 3 dízimos + mesma faixa de valor + mensal → automático, 96%).
4. **Nada grava sem clique, em lote, com "Desfazer este lote"** e FITID gravado (importar o mesmo arquivo duas vezes não duplica).
5. **Débito automático previsto** e **documento a pagar** encontrados no extrato, com fluxo de diferença (juros, multa, desconto) — o Omie só oferece "buscar e associar".
6. **Aprendizado pelo próprio histórico**: cada correção salva pesa na próxima (os 3 lançamentos mais recentes pesam 5, 4 e 3).
7. Sem custo adicional por "conciliação automática".

## 4. O que a medição mostra do motor atual (backtest de setembro)

| | Movimentos | Categoria certa | Pessoa/fornecedor sugerido certo | Centro certo |
|---|---|---|---|---|
| **Identificadas** (≥ 85) | 150 de 353 (**42,5%**) — 118 com gabarito | **118 de 118 (100%)** | 66 de 68 (97%) | 72 de 72 (100%) |
| **Precisam de revisão** (60–84) | 158 (**44,8%**) — 46 com gabarito | 19 de 46 (**41%**) | 14 de 19 | 8 de 15 |
| **Não identificadas** (< 60) | 45 (**12,7%**) — 41 com gabarito | 3 de 41 (**7%**) | 8 de 8 | 5 de 5 |
| Entradas (120 pares) | | 77% | | |
| Saídas (85 pares) | | **56%** | 14 de 14 | |

**Leitura:** a faixa "identificada" é **segura** (nenhum erro de categoria em 118) — dá para confirmar em massa. O trabalho humano está nos 203 que sobram,
e ele se concentra em **saídas** (56% de acerto) e em **entradas ambíguas entre Dízimo e Oferta** (das 46 entradas fora da faixa automática, 26 eram Oferta e 20 Dízimo).

## 5. Quatro lacunas reais (todas medidas)

### 5.1 Despesas: o favorecido existe, mas o sistema não o sugere
Das 40 saídas fora da faixa automática, **28 (70%) têm fornecedor real no lançamento** — e o motor sugeriu fornecedor nenhum. Os casos que você citou:

| Texto do banco | Sugestão hoje | O que a tesouraria lançou |
|---|---|---|
| CONTA DE AGUA **AGUAS DO RIO** (R$ 1.570,14 e R$ 1.479,65) | nada (30%) | Água e Esgoto, com fornecedor |
| CONTA DE TELEFONE **CLARO** (R$ 257,96) | nada (30%) | Internet e Telefonia, com fornecedor |
| PAGTO ELETRON COBRANCA **AMIL** (R$ 3.140,36) | nada (30%) | Benefícios, com fornecedor |
| CONTA DE LUZ **LIGHT** (R$ 456,38) | nada (30%) | (sem gabarito no período) |
| DARF · FGTS · INSS · ISS | não sugere fornecedor — o texto "guia" é marcado como *sem nome* de propósito | Impostos e Encargos, mas hoje fica em branco |

Causa: o motor procura **nome de pessoa** no texto; "conta de água águas do rio" não casa com o fornecedor "Águas do Rio", e guia de tributo é descartada
antes de qualquer busca. O histórico do **favorecido** (categoria, centro, subcentro que ele recebeu nos últimos meses) existe — só não é consultado por palavra-chave.

### 5.2 Boleto genérico: confiança falsa
`PAGTO ELETRON COBRANCA PAG COBRANCA NET EMPR` aparece **14 vezes** em setembro (de R$ 37,80 a R$ 2.944,00). O motor sugere *Material de Consumo* (69%) para todas;
a única com gabarito foi **Locação de Equipamentos** (R$ 2.803,26). O texto é do banco, não do favorecido: a pista certa é o **documento a pagar** da Central de
Pagamentos (valor + vencimento), não o histórico do texto. Uma sugestão "69%" aqui induz ao erro.

### 5.3 O ",10" não existe no motor
A regra operacional é real e forte. Desde 07/2024, **156 entradas terminam em ",10"** (de 5.656):

| | Quantidade |
|---|---|
| Rendimento de R$ 0,10 (texto do banco) | 13 — excluir |
| **Ofertas para Missões** | **122 (85% dos 143 restantes)** |
| Ofertas | 15 |
| Dízimos | 6 |

Por faixa de valor, a precisão fica entre 75% e 96% (96% entre R$ 20 e R$ 100). **Sinal para revisar:** os 3 PIX ",10" de setembro (R$ 162,10 em 03/09,
R$ 10,10 em 14/09, R$ 325,10 em 27/09) estão hoje como *Ofertas*, contra a regra. Podem ser ofertas comuns; a regra serviria justamente para perguntar.
Como a governança missionária proíbe reclassificar sozinho, o ",10" deve gerar **"⚠ Possível oferta missionária"** (sugestão forte, 1 clique para confirmar), nunca categoria automática.

### 5.4 A tela ainda é uma lista de formulários, não uma fila de decisões
Do código da tela (`ConciliacaoOFXDialog.tsx`):
- só **categoria e centro** são editáveis na linha; **trocar a pessoa** exige abrir o formulário completo ("Editar");
- não há **"Ignorar"** nem **"Buscar e associar a um lançamento que já existe"** (só "Lançar" na linha ambígua);
- não mostra o **histórico da pessoa** na linha (o motivo está no texto do chip, escondido em tooltip);
- não há decisão **por grupo** ("7 PIX da Cielo", "14 boletos genéricos", "6 PIX de *Quarta Igreja Batista*") — cada um é uma decisão;
- sem **subcentro** na linha (o plano de contas de Missões agora tem 4);
- o "aprendizado" é só o histórico: ela não consegue dizer "isto é uma regra".

## 6. Classes que se repetem — o que pede decisão de grupo, não de linha
Nas **110 linhas sem lançamento correspondente** em setembro, os maiores blocos são: tarifa bancária (16), boleto genérico `PAGTO ELETRON COBRANCA…` (13),
PIX por QR Code de um mesmo remetente (7), PIX de um mesmo remetente recorrente (6), depósito em dinheiro no caixa eletrônico (5), PIX da própria tesoureira (4) e rendimento de aplicação (2).
E entre as linhas **com** gabarito que o motor não resolveu sozinho aparecem outras duas classes: **PIX da Cielo** (7; repasse de cartão, mistura dízimo e oferta) e
**PIX de *Quarta Igreja Batista…*** (6; movimento entre contas da própria igreja).
Cada uma é uma **classe**: decidir a classe uma vez resolve todas as linhas dela.
*(110 sem correspondência pode ser lançamento ainda não feito, ou valor/data diferentes do extrato — não é erro do motor, mas é onde a fila humana cresce.)*

## 7. Quantificação — cliques

Definição: clique = toque em controle. Cenário: **um mês novo inteiro (353 movimentos), nada registrado antes** (o pior caso para os dois).

| Etapa | Omie (estimado das telas) | DiakoniaApp hoje (contado no código) | Proposta (projeção) |
|---|---|---|---|
| Importar o arquivo | 3–4 (abrir, conta, "Importar agora", arquivo) | 2 (botão, arquivo) | 2 (ou arrastar) |
| Linha já existente / conciliar | ~2 por linha (selecionar + "Conciliar") | **1 para todas** ("Conciliar N") | 1 para todas |
| Identificadas (150) | ~10 por linha | **2 no total** ("Confirmar identificadas" + confirmar) | **1** + olhar uma amostra |
| Precisam de revisão (158) | ~10 por linha (não sugere nada) | 1 se aceita; **5** se corrige categoria e centro; ~11 se a pessoa está errada ("Editar") | **1** por linha (Confirmar) · 2 se troca por uma alternativa · 1 por **grupo** |
| Não identificadas (45) | ~10 por linha | ~5–11 por linha | 1–3 por linha · 1 por grupo |
| Transferência entre contas | ~6 | ~5 | 1 (par detectado) |
| Despesa que quita documento | 3–4 ("Buscar e associar") | 1–3 ("Liquidar"/"Explicar diferença") | 1 |
| **Total do mês (353 linhas)** | **≈ 2.800 a 3.500** | **≈ 760** (2 + 2 + 158 × 3,4 + 45 × 4,7, com as taxas de acerto do backtest) | **≈ 130 a 250** (projeção, ver abaixo) |

*O total do Omie assume que quase tudo é "não encontrado" (um extrato de igreja não tem contas a receber pré-cadastradas) e a faixa de 8–10 cliques por formulário; ele
próprio oferece a saída paga (Omie.Cash). O total do DiakoniaApp usa as taxas medidas (41% e 7% de acerto de categoria nas faixas revisar e não identificada).*

**Projeção da proposta (não medida — depende de construir):** tirar do trabalho individual (a) boletos genéricos e utilidades (≈ 30 linhas, resolvidos pelo documento a pagar ou
pela palavra-chave do favorecido), (b) classes repetidas por grupo (≈ 25 linhas em 6 grupos), (c) entradas com histórico da pessoa à vista e 1 clique de confirmação (≈ 60 linhas),
(d) ",10" como pergunta de 1 clique (≈ 3–10 linhas por mês). Sobrariam ≈ 90 a 110 decisões individuais a ≈ 1,3 clique cada, mais os grupos e o fixo.

## 8. O que o DiakoniaApp deve absorver do Omie
1. **Mestre-detalhe**: lista à esquerda com a *situação* por linha; à direita, um **cartão de decisão** com "o que encontrei" e "o que não encontrei".
2. **Ignorar este lançamento** (com motivo): hoje não existe, e linha ignorada precisa ficar registrada para não voltar na próxima importação.
3. **Buscar e associar a um lançamento que já existe** (busca por valor, data, pessoa).
4. Filtro por coluna e contagem por situação (já temos os filtros por situação; faltam por coluna).
5. **Mostrar o que foi conciliado** (categoria, pessoa, documento) — rastreabilidade na própria linha.

## 9. O que deve ser diferente por sermos uma igreja
- **Pessoa antes de valor.** Dízimo é pessoa + recibo: casar por nome e histórico, nunca só por valor/data (o caso Vanessa).
- **Dízimo × Oferta × Missões é a decisão central** — e é de *intenção*, não de contabilidade. O sistema mostra a evidência (últimos lançamentos da pessoa, o texto, o centavo) e **nunca decide missões sozinho**.
- **O centavo é informação** (",10"). Ele vira *sinal*, com regra visível e editável pela tesouraria, não código escondido.
- **Campanhas** (Mundiais, Nacionais): a oferta missionária sugere a campanha em andamento.
- **Anônimo, cartão (Cielo) e envelope no caixa**: classes próprias, sem tentar achar pessoa.
- **Poucos operadores, muita sazonalidade**: a ferramenta precisa ser rápida em lotes (fim de mês, campanha) e **explicar** cada sugestão.
- **Prestação de contas**: toda decisão fica rastreável (quem confirmou, o que o sistema sugeriu, o que mudou).

## 10. Proposta: a Mesa de Conciliação (fila de decisões)

### 10.1 A fila, em três pilhas (o que você pediu)
```
✓ Identificados automaticamente   150   [ Confirmar todos ]   (amostra de 5 para conferir)
⚠ Precisam de revisão             158   → cartões, um por vez, ou em grupo
❌ Não identificados               45   → agrupados por padrão do texto
   + Transferências · Débitos automáticos · Documentos a pagar · Já registradas (ficam recolhidas)
```

### 10.2 O cartão de decisão (por linha) — o exemplo da Vanessa
```
PIX RECEBIDO REM: VANESSA DO NASCIMENTO       R$ 500,00   01/09
Identifiquei:  Vanessa Do Nascimento Oliveira  (membro)
Histórico:     Dízimo 500 (08/26) · Dízimo 500 (07/26) · Oferta 100 (06/26)
Sugestão:      Dízimo · Centro Administração · confiança 66%  — "2 de 3 lançamentos dela foram dízimo"
[ Confirmar ]   [ Oferta ] [ Missões ] [ Outra… ]   [ Não é ela ]   [ Ignorar ]   [ Transferência ]
```
Mesma lógica para "R$ 500,10" → **⚠ Possível oferta missionária** (".10 é a marca da tesouraria; 85% das vezes foi Missões") com [ Confirmar missões · Campanha Nacionais 2026 ] e [ É oferta comum ].

### 10.3 Despesas pelo favorecido e pelo documento
1. **Primeiro o documento a pagar** da Central de Pagamentos (valor + vencimento) — já existe; passa a ser a primeira pergunta de toda saída.
2. **Depois a palavra-chave → favorecido** (Light, Águas do Rio, Amil, Vivo/Claro, DARF, FGTS, INSS, ISS), por tabela editável de *regras da tesouraria*.
3. **Depois o histórico do favorecido**: categoria, centro **e subcentro** dos últimos pagamentos.
4. Texto genérico de banco (`PAGTO ELETRON COBRANCA…`) **não sugere categoria** — pede o documento. Fim da "confiança falsa".

### 10.4 Regras da tesouraria (explícitas, auditáveis)
Uma pequena tabela legível — *"terminado em ,10 + PIX → possível oferta missionária"*, *"AGUAS DO RIO → fornecedor Águas do Rio, Água e Esgoto"*,
*"tarifa bancária → Tarifas"* — com o botão **"aprender com esta decisão"** em cada cartão. Substitui o aprendizado invisível por um que a tesouraria enxerga, edita e desliga.

### 10.5 Decisão por grupo
Linhas com o mesmo padrão viram **um** cartão: "7 PIX da Cielo · R$ 4.120,00 · decidir como … para todas". Cobre tarifa, repasse de cartão, depósito no caixa eletrônico, PIX entre contas da igreja.

### 10.6 Segurança (não muda)
Nada grava sem clique; confirmação em lote mostra o total; **Desfazer lote**; FITID evita duplicidade; **faixa automática só entra no lote se a regra for explícita**;
missões **nunca** é automática.

### 10.7 Indicadores da própria conciliação
% de linhas automáticas · correções do mês (onde o sistema errou) · tempo até zerar a fila. É como se mede se a automação está melhorando — hoje não se mede.

## 11. Ordem sugerida (e o que cada fase entrega)

| Fase | O que entra | Por que primeiro | Esforço |
|---|---|---|---|
| **A — as quatro lacunas** | regra ",10" como *possível missões*; palavra-chave → favorecido (inclui guias); boleto genérico sem sugestão falsa; trocar **pessoa** na linha; histórico da pessoa visível | maior ganho por menor obra: mexe no motor e na linha, não na tela inteira | pequeno–médio |
| **B — regras e grupos** | tabela de regras da tesouraria + "aprender com esta decisão"; decisão por grupo; **Ignorar** e **buscar e associar** | tira da fila as classes repetidas | médio |
| **C — a Mesa** | mestre-detalhe com cartão de decisão, atalhos de teclado, três pilhas, indicadores | transforma a experiência; depende de A e B para valer | médio–grande |

## 12. Decisões que preciso de você
1. **Fase A agora?** (é o que mais reduz cliques; não muda a tela, só o que ela sugere).
2. **",10"**: confirma que deve virar *"⚠ possível oferta missionária"* (nunca automática)? E os 3 PIX ",10" de setembro hoje como Ofertas: quer que eu os liste para você conferir?
3. **Palavras-chave de despesa**: além de Light, Águas do Rio, Amil, Vivo/Claro, DARF, FGTS, INSS e ISS, há outros favorecidos de peso que sempre aparecem?
4. **Ignorar**: quais motivos (duplicado, devolvido, não é da igreja…)? Aparece em relatório?
5. **Cielo**: o repasse do cartão mistura dízimo e oferta; existe o relatório da operadora com o detalhe, ou a tesouraria divide à mão?
6. **Caso Vanessa no Omie**: o extrato é "Vanessa do Nascimento" e o lançamento ligado é "Vanessa Alves de Meireles Pimentel" — confere se é a mesma pessoa pagando pela outra, ou se o Omie ligou errado.
