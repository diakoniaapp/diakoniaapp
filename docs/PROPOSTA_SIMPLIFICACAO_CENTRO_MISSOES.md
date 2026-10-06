# Proposta — simplificar o centro "Min. Evangelismo e Missões" em 4 subcentros

Levantamento de **06/10/2026** (revisão 2, com as suas respostas), somente leitura. **Nada foi aplicado.** SQL em rascunho:
[PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.sql](PROPOSTA_SIMPLIFICACAO_CENTRO_MISSOES.sql) (fica em `docs/`, não em `migrations/`, até a sua aprovação; **não ensaiado**).
Substitui, se aprovada, a estrutura de 3 subcentros do [GOVERNANCA_MISSIONARIA.md](GOVERNANCA_MISSIONARIA.md) §1.

## 1. A resposta curta

**A proposta é boa e responde exatamente às 4 perguntas.** Cada pergunta passa a ter **um subcentro** (ou o Fundo) como resposta, sem conta de cabeça.

| Pergunta | Onde está a resposta |
|---|---|
| Quanto investimos em **sustento** missionário? | subcentro **Sustento Missionário** |
| Quanto **arrecadamos e enviamos** em campanhas? | subcentro **Campanhas Missionárias**: as ofertas entram e os repasses saem *no mesmo lugar*; por campanha (Mundiais/Nacionais), pelo campo |
| Quanto investimos em **projetos** missionários? | subcentro **Projetos Missionários** (e cada projeto) |
| Quanto **entregamos diretamente** a missionários? | subcentro **Ofertas Missionárias** |

## 2. As suas decisões

| Pergunta | Decisão |
|---|---|
| Os 29 pagamentos de R$ 300 "Carreta Missionária" (R$ 8.700,00) | **Projetos Missionários — Carreta** (projeto novo) |
| Despesas da feira e de eventos (R$ 984,40) | **Campanhas Missionárias** |
| Nome do 4º subcentro | **Ofertas Missionárias** (reaproveita o centro antigo de mesmo nome) |
| Onde moram Missões Mundiais e Nacionais | **Em Campanhas Missionárias** (o centro "Missões Mundiais" você já excluiu; "Missões Nacionais" fica inativo) |
| Prebenda do pastor missionário Alexandre | **Sustento Missionário**, *todas* — "Pastor Missionário" deixa de existir como centro |

**Nome:** usei **Campanhas Missionárias**, como você escreveu na última resposta (na proposta original estava "Campanhas de Missões"). Se preferir o outro, é trocar uma linha do SQL.

## 3. A estrutura

Filhos de **Min. Evangelismo e Missões**:

| Subcentro | O que entra | Vem de |
|---|---|---|
| **Sustento Missionário** | prebenda do pastor missionário, PAM, missionários sustentados, convênios permanentes | o que já existe |
| **Campanhas Missionárias** | **ofertas** das campanhas Mundiais e Nacionais (entrada), **repasses** às Juntas e o custo de arrecadá-las: feira, banner, material (saída) | **Envios Missionários, renomeado** (mesmo id) |
| **Projetos Missionários** | Cristolândia, Carreta, projetos específicos — um projeto por iniciativa, sem ano | **novo** |
| **Ofertas Missionárias** | missionários visitantes, quem prega na igreja, ajuda pontual, vocacionados | o centro antigo de mesmo nome, só com saídas |

**Mantém-se, separado:** o campo **Campanha missionária** (Mundiais · Nacionais · Especial). O subcentro diz a *natureza*; o campo diz *qual campanha*.
O **Envio Oficial** e o **Fundo** continuam definidos pela **categoria** (*Repasses Missionários* e *Ofertas para Missões*), não pelo subcentro. Por isso mover ofertas e despesas entre subcentros **não muda o Fundo**.

## 4. O que se move (medido hoje)

| Para | O quê | Qtd | R$ |
|---|---|---|---|
| Projetos Missionários | 29 pagamentos "Carreta Missionária" (do Sustento) | 29 | 8.700,00 |
| Projetos Missionários | panetones Cristolândia (do centro-pai) | 2 | 5.050,00 |
| Campanhas Missionárias | segurança, suporte, banner, papelaria da feira (da Mobilização) | 5 | 984,40 |
| Ofertas Missionárias | oferta ao preletor (da Mobilização) | 1 | 150,00 |
| Sustento Missionário | prebendas do Alexandre que estavam no centro antigo "Pastor Missionário" (jul/ago 2026) | 2 | 4.724,00 |
| Sustento Missionário | **2 prebendas PREVISTAS** do Alexandre (05/11 e 05/12/2026), sem centro e sem categoria — a categoria vira *Prebenda* | 2 | 4.724,00 *(previsto)* |
| Campanhas Missionárias | **ofertas do Fundo** ("Ofertas para Missões"): 647 sem centro + 4 que estavam em Ofertas Missionárias | 651 | — |

**Só o Alexandre.** O filtro é pelo **fornecedor**, não pela categoria *Prebenda*: o pastor titular e outras pessoas também recebem Prebenda (~35 lançamentos nos centros Pastorais) e **não são tocados**. O Alexandre tem 34 lançamentos: 30 já no Sustento, 2 no centro antigo, 2 previstos.

Depois de vazios, ficam **inativos** (nunca apagados): Mobilização Missionária, Pastor Missionário e Missões Nacionais. As categorias *Ofertas para Missões* (entrada) e *Ofertas à Preletores* passam a ter como centro padrão Campanhas e Ofertas Missionárias, respectivamente; *Repasses Missionários* já aponta para o Envios renomeado.

## 5. Antes e depois (só saídas realizadas)

| Subcentro | Hoje | Depois |
|---|---|---|
| Sustento Missionário | 79.292,93 *(74.568,93 + 4.724,00 do centro antigo)* | **70.592,93** |
| Campanhas Missionárias *(hoje Envios)* | 157.167,89 | **158.152,29** |
| Projetos Missionários | — *(Cristolândia 5.050,00 solto no centro-pai)* | **13.750,00** |
| Ofertas Missionárias | — | **150,00** |
| Mobilização Missionária | 1.134,40 | **0,00** *(inativa)* |
| **Esforço Total** | 237.595,22 | **242.645,22** |

Os 2 previstos não entram nessas somas (só realizado/conciliado), então os números acima não mudam por eles.

**Três coisas que você precisa saber:**

1. **O Esforço Total passa a incluir os projetos** (+ R$ 5.050,00 da Cristolândia, que hoje fica de fora). Ele vira simplesmente "tudo que sai do centro de Missões" = a soma dos 4 subcentros.
2. **O Fundo não muda:** continua **−7.830,22**.
3. **Campanhas passa a mostrar os dois lados:** as 651 ofertas entram nele, então a tela do subcentro mostra *arrecadado × enviado* de uma vez. Isso responde a pergunta 2, mas o **Esforço Total continua sendo só saída** (as entradas não entram nele).

**Efeito colateral bom:** o Fechamento mensal bloqueava o malote por "entrada sem centro de custo", e 647 das 653 ofertas estavam assim (o centro "Missões Mundiais", que guardava 224, foi excluído e o banco as deixou sem centro). Com a mudança, **sobram 0 ofertas do Fundo sem centro**.

## 6. O que ainda preciso que você decida

1. **A oferta em "Min. Administração".** Das 653 ofertas do Fundo, 1 está nesse centro (outra, em Envios, já fica certa). Não mexo sem você dizer: **mover para Campanhas** ou deixar? (É um UPDATE de 1 linha; se eu mover, o Fechamento também deixa de ter exceção.)
2. **Os 2 previstos do Alexandre vêm do Omie** (criados em 30/09, origem `importado_omie`, sem recorrência no sistema). Se a prebenda é mensal e fixa, vale cadastrar a **recorrência** em vez de depender do Omie — tarefa à parte, não está neste SQL.
3. **Quem criou os lançamentos salvos em "Pastor Missionário" hoje** (16:00 e 16:12) e reativou o centro? Se foi você, nada a fazer.

## 7. O que muda no sistema (depois da aprovação)

- `lib/missoesModelo.ts`: `classeDoCentro` passa a reconhecer os 4 (sustento · campanhas · projetos · ofertas), mantendo Mobilização como "legado" enquanto a migration não rodar.
- **Painel de Indicadores Missionários:** quatro cartões com as 4 perguntas; o Esforço Total passa a ser a soma deles.
- `GOVERNANCA_MISSIONARIA.md` §1 e §3: estrutura e tabela de classificação.
- Os testes de `missoesModelo` que citam Mobilização são atualizados.

## 8. Riscos

- **A Carreta como projeto** é uma leitura da *descrição* "Carreta Missionária"; o boleto da JMN é de "parceria". Se o extrato da JMN mostrar que são PAM, voltam ao Sustento **por reclassificação** (um UPDATE), sem perda.
- Renomear o Envios mantém o mesmo id, então nenhum relatório que já aponta para ele quebra; só o **nome** muda na tela.
- A migration **não foi ensaiada** (token sem acesso): rodar primeiro dentro de `BEGIN; … ROLLBACK;`. Ela tem contagem e **soma** esperadas e desfaz tudo se algo não bater (inclusive se o Alexandre tiver algum lançamento além dos 4 esperados).
- As contagens (651 ofertas, 4 do Alexandre) são de hoje: se entrar lançamento novo antes da aplicação, o SQL **para** e eu atualizo o número, em vez de mover algo que você não viu.

## 9. Ordem sugerida

1. Você revisa este documento e o SQL e responde §6.
2. Eu transformo o rascunho em migration, publico o código compatível com os dois estados e te passo o ensaio.
3. Você aplica (ensaio → valer), conferindo: Sustento **70.592,93** · Campanhas **158.152,29** (saídas) · Projetos **13.750,00** · Ofertas **150,00** · Fundo **−7.830,22** · ofertas do Fundo sem centro **0**.
