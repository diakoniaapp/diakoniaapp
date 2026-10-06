# Proposta — simplificar o centro "Min. Evangelismo e Missões" em 4 subcentros

Levantamento de **06/10/2026**, somente leitura. **Nada foi aplicado.** SQL em rascunho:
[PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.sql](PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.sql) (fica em `docs/`, não em `migrations/`, até a sua aprovação; **não ensaiado**).
Substitui, se aprovada, a estrutura de 3 subcentros do [GOVERNANCA_MISSIONARIA.md](GOVERNANCA_MISSIONARIA.md) §1.

## 1. A resposta curta

**A proposta é boa e responde exatamente às 4 perguntas.** Cada pergunta passa a ter **um subcentro** (ou o Fundo) como resposta, sem conta de cabeça.
Ajustei três pontos com as suas decisões de hoje (§2) e achei duas coisas no banco que precisam da sua atenção (§6).

| Pergunta | Onde está a resposta |
|---|---|
| Quanto investimos em **sustento** missionário? | subcentro **Sustento Missionário** |
| Quanto **arrecadamos e enviamos** em campanhas? | **Fundo** (Ofertas para Missões − Repasses) + subcentro **Campanhas de Missões**, por campanha (campo) |
| Quanto investimos em **projetos** missionários? | subcentro **Projetos Missionários** (e cada projeto) |
| Quanto **entregamos diretamente** a missionários? | subcentro **Ofertas Missionárias** |

## 2. As suas decisões de hoje

| Pergunta | Decisão |
|---|---|
| Os 29 pagamentos de R$ 300 "Carreta Missionária" (R$ 8.700,00) | **Projetos Missionários — Carreta** (projeto novo) |
| Despesas da feira e de eventos (R$ 984,40) | **Campanhas de Missões** |
| Nome do 4º subcentro | **Ofertas Missionárias** (reaproveita o centro antigo de mesmo nome) |

## 3. A estrutura

Filhos de **Min. Evangelismo e Missões**:

| Subcentro | O que entra | Vem de |
|---|---|---|
| **Sustento Missionário** | prebenda do pastor missionário, PAM, missionários sustentados, convênios permanentes | o que já existe |
| **Campanhas de Missões** | repasses às Juntas (Mundiais e Nacionais) e o custo de arrecadá-las (feira, banner, material) | **Envios Missionários, renomeado** (mesmo id) |
| **Projetos Missionários** | Cristolândia, Carreta, projetos específicos — um projeto por iniciativa, sem ano | **novo** |
| **Ofertas Missionárias** | missionários visitantes, quem prega na igreja, ajuda pontual, vocacionados | o centro antigo de mesmo nome, só com saídas |

**Mantém-se, separado:** o campo **Campanha missionária** (Mundiais · Nacionais · Especial). O subcentro diz a *natureza* do gasto; o campo diz *qual campanha*.
O **Envio Oficial** continua definido pela **categoria** *Repasses Missionários* (não pelo subcentro), então colocar o custo da feira em Campanhas **não suja** o Envio Oficial.

## 4. O que se move (medido hoje)

| Para | O quê | Qtd | R$ |
|---|---|---|---|
| Projetos Missionários | 29 pagamentos "Carreta Missionária" (do Sustento) | 29 | 8.700,00 |
| Projetos Missionários | panetones Cristolândia (do centro-pai) | 2 | 5.050,00 |
| Campanhas de Missões | segurança, suporte, banner, papelaria da feira (da Mobilização) | 5 | 984,40 |
| Ofertas Missionárias | oferta ao preletor (da Mobilização) | 1 | 150,00 |
| Sustento Missionário | 2 prebendas (jul/ago 2026) que estão no centro antigo "Pastor Missionário" | 2 | 4.724,00 |
| Centro-pai | 5 **entradas** que estão em subcentros de saída (1 em Envios, 4 em Ofertas Missionárias) | 5 | — |

Depois de vazios, ficam **inativos** (nunca apagados): Mobilização Missionária, Pastor Missionário e Missões Nacionais. Não há lançamentos **previstos** nesses centros nem recorrências de missões.

## 5. Antes e depois (só saídas realizadas)

| Subcentro | Hoje | Depois |
|---|---|---|
| Sustento Missionário | 79.292,93 *(74.568,93 + 4.724,00 do centro antigo)* | **70.592,93** |
| Campanhas de Missões *(hoje Envios)* | 157.167,89 | **158.152,29** |
| Projetos Missionários | — *(Cristolândia 5.050,00 solto no centro-pai)* | **13.750,00** |
| Ofertas Missionárias | — | **150,00** |
| Mobilização Missionária | 1.134,40 | **0,00** *(inativa)* |
| **Esforço Total** | 237.595,22 | **242.645,22** |

**Duas mudanças de definição que você precisa saber:**

1. **O Esforço Total passa a incluir os projetos** (+ R$ 5.050,00 da Cristolândia, que hoje fica de fora). Ele vira simplesmente "tudo que sai do centro de Missões" = a soma dos 4 subcentros. Mais fácil de explicar.
2. **O Fundo não muda:** continua **−7.830,22** (é por categoria: Ofertas para Missões − Repasses). Nenhuma das 4 perguntas depende de mexer nele.

## 6. O que achei no banco hoje (preciso que você me diga se foi proposital)

- **O centro "Missões Mundiais" foi excluído** e as **224 ofertas** do fundo que tinham esse centro ficaram **sem centro** (agora 647 de 653). O saldo do fundo não mudou. Mas o **Fechamento mensal bloqueia o malote** por "entrada sem centro de custo". O rascunho traz um passo **opcional** que põe essas 647 no centro-pai (que é o centro padrão da categoria), sem alterar valor nem saldo.
- **"Pastor Missionário" e "Missões Nacionais" estão ativos de novo** (a migration anterior os havia desativado), e as **2 prebendas de jul/ago 2026** foram salvas em "Pastor Missionário" hoje às 16:00 e 16:12. Se foi você, tudo bem: a proposta as leva para o Sustento e desativa o centro antigo. Se não foi, vale saber quem mexeu.

## 7. O que muda no sistema (depois da aprovação)

- `lib/missoesModelo.ts`: `classeDoCentro` passa a reconhecer os 4 (sustento · campanhas · projetos · ofertas), mantendo Mobilização como "legado" enquanto a migration não rodar.
- **Painel de Indicadores Missionários:** quatro cartões com as 4 perguntas; o Esforço Total passa a ser a soma deles.
- `GOVERNANCA_MISSIONARIA.md` §1 e §3: estrutura e tabela de classificação.
- Os testes de `missoesModelo` que citam Mobilização são atualizados.

## 8. Riscos

- **A Carreta como projeto** é uma leitura da *descrição* "Carreta Missionária"; o boleto da JMN é de "parceria". Se o extrato da JMN mostrar que são PAM, voltam ao Sustento **por reclassificação** (um UPDATE), sem perda.
- Renomear o Envios mantém o mesmo id, então nenhum relatório que já aponta para ele quebra; só o **nome** muda na tela.
- A migration **não foi ensaiada** (token sem acesso): rodar primeiro dentro de `BEGIN; … ROLLBACK;`. Ela tem contagem e **soma** esperadas por subcentro e desfaz tudo se algo não bater.

## 9. Ordem sugerida

1. Você revisa este documento e o SQL (e responde §6).
2. Eu transformo o rascunho em migration, publico o código compatível com os dois estados e te passo o ensaio.
3. Você aplica (ensaio → valer), conferindo: Sustento **70.592,93** · Campanhas **158.152,29** · Projetos **13.750,00** · Ofertas **150,00** · Fundo **−7.830,22**.
