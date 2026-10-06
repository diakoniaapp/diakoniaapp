# Investigação — Missões Mundiais 2024 (−R$ 1.705,11) e 2025 (−R$ 5.341,11)

Levantamento de **07/10/2026**, mesma metodologia da JMN: arrecadação, remessas, ciclos, documento externo
(histórico da Junta Mundial) e ofertas classificadas incorretamente. Somente leitura. **Nenhum ajuste foi criado.**
Lançamento a lançamento: [`mundiais-2024-2025-lancamentos.csv`](mundiais-2024-2025-lancamentos.csv) (256 ofertas + 4
remessas, com o saldo de cada ciclo).

## 1. Resposta em uma frase

**Nenhum lançamento isolado do sistema explica as duas diferenças.** Procurei por lançamentos únicos e por pares,
por rótulo, por data, por duplicidade e por classificação: não existe oferta, classificada certa ou errada, cujo valor
feche qualquer das diferenças. O que existe são **remessas maiores do que o arrecadado registrado** — e a investigação
reduz cada diferença a duas peças identificáveis, cada uma com a hipótese mais forte e o documento que a provaria.

| Ciclo | Arrecadado (ofertas) | Remessas (JMM) | Diferença | Peças |
|---|---|---|---|---|
| **Mundiais 2024** (02/01 a 27/08/2024) | 25.801,41 · 131 ofertas | 1.551,32 + 25.955,20 = 27.506,52 | **−1.705,11** | **1.551,32** (remessa de 12/07/2024) + **153,79** (remessa de 27/08 acima das ofertas) |
| **Mundiais 2025** (31/12/2024 a 22/07/2025) | 29.658,89 · 125 ofertas | 34.216,42 + 783,58 = 35.000,00 | **−5.341,11** | **4.557,53** (remessa de 22/07/2025 acima das ofertas) + **783,58** (complemento de 19/09/2025) |

*(O R$ 60,00 de 18/07/2025 já está fora do ciclo: é bazar, sai pela migration `…230000`.)*

## 2. As verificações feitas e o resultado de cada uma

| # | Verificação | Resultado |
|---|---|---|
| 1 | **Remessas × documento da Junta Mundial** | As 4 remessas conferem **ao centavo** (1.551,32 · 25.955,20 · 34.216,42 · 783,58). Nenhuma está duplicada nem ausente |
| 2 | **Ciclo correto?** Rótulos de campanha no texto das ofertas | **Nenhuma** oferta rotulada "Nacionais"/"Regiões" caiu numa janela de Mundiais, e **nenhuma "Mundiais" caiu fora**. A atribuição por ciclo está certa |
| 3 | **A tesouraria somou as ofertas do sistema?** Procurei um intervalo de datas cuja soma fosse igual a cada remessa | **Nenhum** intervalo bate (testei as 10 remessas). Logo as remessas **não foram calculadas** pela soma que o sistema guarda |
| 4 | **Há uma oferta (ou duas) fora do fundo com o valor exato da diferença?** 1.264 entradas avaliadas em 2024 e 1.656 em 2025 (fora do fundo, sem transferências) | **Nenhuma.** Só 2 coincidências para R$ 153,79 em 2024 (Dízimos de R$ 72,79 e R$ 81,00 sem relação entre si): acaso |
| 5 | **Entradas fora do fundo com texto de missões nas janelas** | 2024: nenhuma. 2025: só o **alvo de R$ 206,20** (C3, ainda não aprovado) e o **bazar de fev. de R$ 507,76** (decidido: não é fundo) |
| 6 | **Vendas de cartão fora do fundo nas semanas das feiras** | Junho/2025: 10 lançamentos, R$ 829,43 = **"ALMOÇO JUVENTUDE"** e **"ALMOÇO MINISTÉRIO DE ED CRISTÃ"** — não são missões. Junho/2024: 3 lançamentos, R$ 260,18 (17–18/06), **sem texto** (candidato fraco, ver §3) |
| 7 | **Duplicidades dentro do fundo** | Os valores repetidos (R$ 9,91 · 19,82 · 29,72 · 49,54 · 99,08…) são **vendas de preço fixo** (R$ 10/20/30/50/100 líquidos de ~0,9% de taxa). Sem evidência de dupla importação |
| 8 | **Comparação com a exportação do Omie** | **Inconclusiva**: o arquivo cobre só a conta bancária; o dinheiro da *Caixa de Envelopes* (≈ R$ 5–6 mil/mês de dízimos e ofertas) não está nele, e o Omie difere do banco em milhares todo mês. Não serve de controle de completude |

## 3. Missões Mundiais 2024 — −R$ 1.705,11

### Composição do ciclo
Janeiro 913,20 · março 336,40 · abril 406,50 · maio 945,25 · **junho 21.008,66 (89 lançamentos: 81% do ciclo)** · julho
1.901,40 · agosto 290,00. Os cinco maiores dias são de junho (10/06: 4.854,81; 14/06: 4.350,30; 17/06: 2.320,40…) — a
feira e as ofertas de campanha. Quase tudo **sem rótulo** (129 de 131); só 2 trazem "feira/Mundiais" no texto.

### Peça 1 — R$ 1.551,32 (JMM, 12/07/2024)
- **Não há oferta de 2024 que a sustente**: o ciclo já fecha com a remessa principal de 27/08 (25.955,20 × 25.801,41).
- **Evidências a favor de ser saldo de campanha anterior ao Omie:**
  1. a **Junta Mundial não registra nenhuma remessa entre 21/07/2023 e 12/07/2024** — o que tivesse chegado a Mundiais
     depois de 21/07/2023 só poderia ser remetido em 12/07/2024;
  2. foi enviada **no mesmo dia** do PIX de R$ 10.327,58 à Junta Nacional — duas remessas coordenadas, uma para cada Junta;
  3. a **transição de tesourarias em 2024**, que você descreveu;
  4. a entrada de 10/03/2024 *"SALDO DA CAMPANHA DE MISSÕES NACIONAIS 2023"* (R$ 70,00) mostra que saldos de 2023 estavam
     sendo recolhidos em 2024.
- **Documento que provaria:** a prestação de contas / balancete do **4º trimestre de 2023** (saldo das campanhas
  missionárias em 31/12/2023) e o extrato bancário de dez/2023 a jul/2024.

### Peça 2 — R$ 153,79 (remessa de 27/08/2024 acima do registrado)
É 0,6% da remessa. Nenhuma oferta ou par de ofertas fecha esse valor (verificação 4). Candidato fraco: as 3 vendas de
cartão de 17–18/06/2024 (R$ 260,18, sem texto), logo depois da feira. **Diferença imaterial; não vale ação sem documento.**

### Governança (A–E) — Mundiais 2024
| Peça | A erro de classificação? | B projeto? | C sustento? | D campanha? | E documento? | Decisão |
|---|:-:|:-:|:-:|:-:|:-:|---|
| 1.551,32 | não achado | não | não | **sim — Mundiais, edição 2023 (provável)** | **não** | Classificação provisória; **sem ajuste**. Reclassificar para o ciclo 2023 *não muda o saldo*; só o balancete de 2023 (ou importar a arrecadação de 2023) fecha |
| 153,79 | não | não | não | não aplicável | não | Sem ação |

## 4. Missões Mundiais 2025 — −R$ 5.341,11

### Composição do ciclo
Janeiro 300,30 · fevereiro 197,29 · março 420,00 · abril 1.610,05 · maio 3.130,68 · **junho 21.889,57 (82 lançamentos: 74%)** ·
julho 2.111,00. Por rótulo: **33 lançamentos "alvo" (R$ 15.811,25, dos quais 19 dizem *"CAMPANHA DE MISSÕES
MUNDIAIS"*)**, a **Feira das Nações (R$ 3.073,35 em 2 lançamentos, e provavelmente os lotes de Pix/cartão de 09/06)** e ~90 sem rótulo.

### Peça 1 — R$ 4.557,53 (JMM 22/07/2025: 34.216,42 contra 29.658,89 arrecadados)
Nenhuma oferta explica (verificações 3 a 7). O máximo que a reclassificação poderia cobrir é pequeno:

| Candidato | Valor | Situação |
|---|---|---|
| Alvo de R$ 206,20 (07/02/2025, hoje "Ofertas") — C3 | 206,20 | não aprovado |
| Bazar de missões de fev/2025 (10 lançamentos) | 507,76 | **decidido: não é fundo** |
| **Total possível** | **713,96** | **16% da peça** — restariam **3.843,57** |

### Peça 2 — R$ 783,58 (JMM 19/09/2025, complemento)
O texto da ordem é *"ALVO DE MISSÕES | CAMPANHA MISSÕES MUNDIAIS"*, e **34.216,42 + 783,58 = 35.000,00 exatos**: o
complemento **fecha um total redondo**. As ofertas registradas entre 23/07 e 19/09/2025 somam R$ 445,92 (R$ 426,10 sem o
bazar de R$ 19,82) — cobririam no máximo 54% dele.

### Hipóteses, da mais à menos sustentada
| # | Hipótese | A favor | Contra | Documento que decide |
|---|---|---|---|---|
| H1 | A igreja **completou um valor-alvo de R$ 35.000,00** com o caixa geral | total exato de R$ 35.000,00; texto *"ALVO"* no complemento; o boleto da campanha JMM 2026 que você enviou é uma **"proposta" sem valor fixo** (a igreja escolhe quanto pagar) | em 2026 a igreja enviou **menos** do que arrecadou (26.660,23 × 28.587,10) — não é prática constante | carta/boleto-proposta da JMM de 2025 e a ata/decisão que fixou o valor |
| H2 | **Ofertas em espécie** contadas pela tesouraria e **não lançadas** como missões (*Caixa de Envelopes*) | há muito dinheiro em espécie na igreja; a remessa não coincide com a soma do sistema (verificação 3) | nenhuma entrada em espécie sem classificação aparece com valor compatível | mapa de contagem de envelopes e o caixa da **Feira das Nações 2025** (receita bruta e despesas) |
| H3 | Parte do dinheiro é o excedente de **Nacionais 2024** (+R$ 320,06) usado nas Mundiais | a ordem de pagamento mistura "alvo" e "campanha" | só R$ 320,06 | — |
| H4 | Ofertas de missões lançadas como outra categoria | só os R$ 713,96 acima | pouco valor | — |

### Governança (A–E) — Mundiais 2025
| Peça | A erro de classificação? | B projeto? | C sustento? | D campanha? | E documento? | Decisão |
|---|:-:|:-:|:-:|:-:|:-:|---|
| 4.557,53 | **só R$ 713,96 (e já decidido)** | não | não | sim (é Mundiais) | **não** | Sem ajuste; documentos pendentes |
| 783,58 | não | não | não | sim (texto "alvo/campanha Mundiais") | **não** | Sem ajuste |

## 5. O que sobra, de forma conservadora

| | Diferença | Explicável por reclassificação | Resta |
|---|---|---|---|
| Mundiais 2024 | 1.705,11 | 0 comprovado (260,18 *candidato fraco*) | **1.705,11** |
| Mundiais 2025 | 5.341,11 | 713,96 (C3 + bazar de fev., hoje não aprovados) + 426,10 (ofertas de ago–set) = 1.140,06 | **4.201,05** |

**Em resumo: de R$ 7.046,22, no máximo ~R$ 1,1 mil se explicam por classificação; ≥ R$ 5,9 mil exigem documento.**

## 6. Documentos que fecham o caso (em ordem de utilidade)

1. **Prestação de contas / balancete do 4º trimestre de 2023** (saldo das campanhas Mundiais e Nacionais em 31/12/2023):
   fecha **R$ 1.551,32 (Mundiais)** e, junto com a Junta Nacional, os **R$ 10.327,58**.
2. **Carta ou boleto-proposta da JMM de 2025** (valor sugerido) e a **decisão da liderança/diretoria** sobre quanto
   remeter às Mundiais em 2025: confirma ou descarta H1 (R$ 5.341,11).
3. **Contagem de envelopes e fechamento da Feira das Nações 2025** (maio a julho/2025): confirma ou descarta H2.
4. **Extrato bancário de 12/07/2024 e de 22/07/2025** (as duas remessas) com a descrição original digitada na ordem.

## 7. Decisões que preciso de você
1. Você tem o **balancete do 4º trimestre de 2023** (ou o relatório trimestral impresso daquele período)?
2. Sabe se houve um **valor-alvo de R$ 35.000,00** para as Mundiais em 2025, e quem decidiu?
3. Há **mapa de contagem de envelopes / fechamento da Feira das Nações 2025**?
4. Aprova **C3** (R$ 206,20) como correção de classificação? (Reduz a peça de 2025 em R$ 206,20.)

*Nenhum ajuste foi criado. A regra de governança continua valendo: reclassificar antes de ajustar.*
