# Plano de reconstrução de setembro e outubro de 2026 — o que existe, o que sai, o que fica

> **Somente leitura.** Nada foi apagado, recalculado ou alterado. Dados do banco de produção conferidos em 08/10/2026 às 00h07 (iguais aos de 23h53 de ontem).
> Complementa a [auditoria de saldos](AUDITORIA_SALDOS_2026-10-07.md).

> **Atualização (08/10, depois da primeira versão):** a tesouraria apagou os lançamentos de outubro do **Bradesco** (os 21) e a perna de transferência da **Caixa de Aplicação**.
> Conferido no banco: **Bradesco voltou a R$ 1,00** e **Aplicação a R$ 15.192,83** — exatamente os saldos de 31/08. O que ainda existe de set/out está **só em Caixa de Envelopes (47), Caixinha
> Administrativo (33) e Cartão de Crédito (16 + 4 previstos)** — 96 lançamentos ativos. As linhas do Bradesco e da Aplicação, e o par de 01/10 (R$ 1.634,76), abaixo descrevem o que **havia**.

## 1. Visão consolidada — o que ainda existe em cada conta

| Conta | Período | Lançamentos ativos | Entradas | Saídas | Saldo impactado | Origem |
|---|---|---|---|---|---|---|
| Bradesco | Setembro | 0 | — | — | — | — |
| Bradesco | Outubro | 21 | 10.321,44 | 0,00 | **10.321,44** | OFX 19 + Manual 1 + Transferência 1 |
| Caixa de Aplicação | Setembro | 0 | — | — | — | — |
| Caixa de Aplicação | Outubro | 1 | 0,00 | 1.634,76 | **-1.634,76** | Transferência 1 |
| Caixa de Envelopes | Setembro | 41 | 4.935,81 | 2.805,81 | **2.130,00** | Omie (xlsx) 17 + Manual 16 + Transferência 8 |
| Caixa de Envelopes | Outubro | 6 | 834,00 | 200,00 | **634,00** | Manual 5 + Transferência 1 |
| Caixinha Administrativo | Setembro | 29 | 2.805,81 | 3.321,06 | **-515,25** | Omie (xlsx) 14 + Manual 7 + Transferência 8 |
| Caixinha Administrativo | Outubro | 4 | 200,00 | 286,40 | **-86,40** | Manual 3 + Transferência 1 |
| Cartão de Crédito | Setembro | 16 | 0,00 | 8.249,72 | **-8.249,72** | Omie (xlsx) 16 |
| Cartão de Crédito | Outubro | 0 (+4 previstos) | 0,00 | 0,00 | **0,00** | — · previsto: Omie (xlsx) 4.054,06 |
| Poupança | Setembro | 0 | — | — | — | — |
| Poupança | Outubro | 0 | — | — | — | — |
| **Total** | | **118** | 19.097,06 | 16.497,75 | **2.599,31** | |

- **122 lançamentos** de set/out no total: **118 ativos** (realizados/conciliados, que contam no saldo) + **4 previstos** (faturas do Cartão em outubro, vindas do Omie, que não contam no saldo).
- O impacto consolidado é de **+R$ 2.599,31** no caixa total (as transferências se anulam entre as contas). Conferência: soma dos saldos em 31/08 (R$ 24.874,88) + 2.599,31 = soma dos saldos de hoje (R$ 27.474,19).
- Poupança não tem nada em set/out.

## 2. Saldo em 31/08 × saldo atual × o que explica a diferença

Sem recalcular: saldo em 31/08 = saldo inicial cadastrado + movimento até 31/08; saldo atual = o cadastrado hoje.

| Conta | Saldo em 31/08 | Saldo atual | Diferença | Movimentos responsáveis |
|---|---|---|---|---|
| Bradesco | 1,00 | 10.322,44 | **+10.321,44** | OFX +8.666,68 (19) · Manual +20,00 (1) · Transferência +1.634,76 (1: resgate da Aplicação, 01/10) |
| Caixa de Aplicação | 15.192,83 | 13.558,07 | **−1.634,76** | Transferência −1.634,76 (1: o par do resgate acima) |
| Caixa de Envelopes | 0,00 | 2.764,00 | **+2.764,00** | Omie +3.782,71 (17) · Manual +1.987,10 (21) · Transferências −3.005,81 (9) |
| Caixinha Administrativo | 572,95 | −28,70 | **−601,65** | Omie −2.574,67 (14) · Manual −1.032,79 (10) · Transferências +3.005,81 (9) |
| Cartão de Crédito | 0,00 | −8.249,72 | **−8.249,72** | Omie −8.249,72 (16 faturas/compras de setembro) |
| Poupança | 9.108,10 | 9.108,10 | 0,00 | — |

Se tudo de set/out fosse removido, o saldo de cada conta **voltaria exatamente à coluna "Saldo em 31/08"**.

## 3. Transferências

Cada linha é um **par** (perna de saída + perna de entrada). Foram listados os pares de 25/08 em diante; os de agosto aparecem só para mostrar a fronteira.

| Data | Conta origem | Conta destino | Valor | Situação das pernas | Criada em | Ligada a set/out? |
|---|---|---|---|---|---|---|
| 25/08/2026 | Caixa de Aplicação | Bradesco | 4.159,12 | conciliado/conciliado | 30/09 10:20 | não |
| 25/08/2026 | Caixa de Aplicação | Bradesco | 328,37 | conciliado/conciliado | 30/09 10:20 | não |
| 26/08/2026 | Bradesco | Caixa de Aplicação | 2.104,68 | conciliado/conciliado | 30/09 10:18 | não |
| 26/08/2026 | Caixa de Envelopes | Bradesco | 960,00 | conciliado/conciliado | 30/09 10:11 | não |
| 27/08/2026 | Bradesco | Caixa de Aplicação | 1.634,76 | conciliado/conciliado | 30/09 10:18 | não |
| 28/08/2026 | Caixa de Aplicação | Bradesco | 247,60 | conciliado/conciliado | 30/09 10:20 | não |
| 28/08/2026 | Caixa de Aplicação | Bradesco | 1.364,81 | conciliado/conciliado | 30/09 10:20 | não |
| 31/08/2026 | Bradesco | Caixa de Aplicação | 11.699,99 | conciliado/conciliado | 30/09 11:58 | não |
| 31/08/2026 | Caixa de Envelopes | Caixinha Administrativo | 178,05 | conciliado/conciliado | 30/09 10:11 | não |
| 03/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 813,31 | conciliado/conciliado | 30/09 10:11 | **SIM** |
| 05/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 117,90 | conciliado/conciliado | 30/09 10:11 | **SIM** |
| 06/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 310,50 | conciliado/conciliado | 30/09 10:11 | **SIM** |
| 08/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 200,00 | conciliado/conciliado | 30/09 10:11 | **SIM** |
| 13/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 806,00 | conciliado/conciliado | 30/09 10:11 | **SIM** |
| 20/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 201,00 | realizado/conciliado | 01/10 16:29 | **SIM** |
| 20/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 160,00 | realizado/conciliado | 01/10 16:28 | **SIM** |
| 28/09/2026 | Caixa de Envelopes | Caixinha Administrativo | 197,10 | conciliado/conciliado | 30/09 20:49 | **SIM** |
| 01/10/2026 | Caixa de Aplicação | Bradesco | 1.634,76 | realizado/realizado | 07/10 21:13 | **SIM** |
| 04/10/2026 | Caixa de Envelopes | Caixinha Administrativo | 200,00 | realizado/realizado | 06/10 16:49 | **SIM** |

**10 pares ligados a set/out (20 pernas), R$ 4.640,57 no total**:
- **9 pares Caixa de Envelopes → Caixinha Administrativo (R$ 3.005,81)** — movimento interno de dinheiro em espécie. **Não existe em nenhum OFX**: só voltará se for recriado à mão ou vier de novo pelo Omie.
- **1 par Caixa de Aplicação → Bradesco (R$ 1.634,76, 01/10)** — resgate. Criado hoje (21h13). O OFX do Bradesco traz a linha correspondente, que o sistema marca como "transferência entre contas"; as **duas pernas** precisam ser lançadas juntas (Transferência), senão a Aplicação fica sem a saída.
- As transferências de **agosto não entram na limpeza**. Destaque para **31/08 Bradesco → Caixa de Aplicação R$ 11.699,99**: foi criada em **30/09**, não veio do banco — fecha o mês de agosto em zero. Fica.
- Pares com situação mista (realizado/conciliado): 2 em setembro (ambos de 20/09) — sem efeito no saldo.

## 4. Recorrências, prebendas e pagamentos previstos

- **Nenhum lançamento de set/out foi gerado por recorrência** hoje (nenhum com `recorrencia_id`, nenhum com origem `recorrencia`). Também **nenhum** com `obrigacao_id`, `liquidacao_id` ou ligado a folha, agenda fiscal, estoque ou bazar.
- **Existem 37 recorrências ativas** (prebendas, salários, utilidades, impostos, benefícios), todas no Bradesco, **sem nenhuma ocorrência em setembro e em outubro** e com **29.866 ocorrências previstas de novembro em diante** (a maioria até **dezembro de 2099**).
- O marcador `ultimo_gerado_ate` de quase todas já está em **2099**. O gerador entende que **tudo já foi gerado** — então **não vai recriar sozinho** as ocorrências de setembro e outubro.
- Isso importa para a reimportação: ao ler o OFX, o sistema procura o **documento a pagar previsto** (valor + vencimento, janela de ±20 dias) para reconhecer a saída — prebenda, Light, Amil, Claro etc. Sem as ocorrências de set/out, essas saídas chegam como "novas" e dependem só de nome/palavra-chave.

| Favorecido | Valor | Conta | Até | Último gerado | Em setembro | Em outubro | De novembro em diante |
|---|---|---|---|---|---|---|---|
| Flavio Inaldo da Silva | 2.200,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Marco Antonio Herculano | 2.000,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Raquel de Paulo Sepulvida do Amaral | 907,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| ABC - Associação de Benefícios e Convênios | 37,80 | Bradesco | 31/12/2099 | 10/12/2099 | 0 | 0 | 878 |
| Aguas do Rio 4 Spe S.A *(valor variável)* | 1.570,00 | Bradesco | 31/12/2099 | 01/12/2099 | 0 | 0 | 878 |
| Al Contabilidade LTDA | 1.621,00 | Bradesco | 31/12/2099 | 30/12/2099 | 0 | 0 | 878 |
| Alexandre Lourenço Silva | 2.362,00 | Bradesco | 31/12/2026 | 05/12/2026 | 0 | 0 | 2 |
| Amil Assistencia Medica Internacional S.A. | 3.086,32 | Bradesco | 31/12/2099 | 20/12/2099 | 0 | 0 | 878 |
| Ana Patricia da Silva de Lima de Oliveira *(valor variável)* | 380,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Caio Marcelo Mendes da Silva | 4.138,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Carlos Eduardo de Santana *(valor variável)* | 380,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Carreta Missionária | 300,00 | Bradesco | 31/12/2099 | 10/12/2099 | 0 | 0 | 878 |
| Cbd Bilhete Digital S/a *(valor variável)* | 250,00 | Bradesco | 31/12/2099 | 30/12/2099 | 0 | 0 | 878 |
| Claro S.A. *(valor variável)* | 257,96 | Bradesco | 31/12/2099 | 08/12/2099 | 0 | 0 | 878 |
| Companhia Distribuidora de Gás do Rio de Janeiro - CEG *(valor variável)* | 207,00 | Bradesco | 31/12/2099 | 08/12/2099 | 0 | 0 | 878 |
| DARF PREVIDENCIARIO *(valor variável)* | 7.835,46 | Bradesco | sem fim | 20/09/2027 | 0 | 0 | 11 |
| Denise Teixeira Dinis *(valor variável)* | 1.438,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Ecoprint Impressoras Ltda-Me | 360,00 | Bradesco | 31/12/2099 | 20/12/2099 | 0 | 0 | 878 |
| FGTS Digital *(valor variável)* | 713,21 | Bradesco | 31/12/2099 | 20/12/2099 | 0 | 0 | 878 |
| Iguaçu Psique Saude LTDA | 90,00 | Bradesco | 31/12/2099 | 10/12/2099 | 0 | 0 | 878 |
| Light Servicos de Eletricidade S.A *(valor variável)* | 1.489,15 | Bradesco | 31/12/2099 | 15/12/2099 | 0 | 0 | 878 |
| Light Servicos de Eletricidade S.A *(valor variável)* | 456,50 | Bradesco | 31/12/2099 | 15/12/2099 | 0 | 0 | 878 |
| Localiza Fleet S.A. | 2.801,40 | Bradesco | 31/12/2099 | 07/12/2099 | 0 | 0 | 878 |
| Lucio Paulo Paz Barreto *(valor variável)* | 4.000,00 | Bradesco | 31/12/2099 | 15/12/2099 | 0 | 0 | 878 |
| Lucio Paulo Paz Barreto *(valor variável)* | 5.728,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Mantenção Elevador | 350,00 | Bradesco | 31/12/2099 | 10/12/2099 | 0 | 0 | 878 |
| Pluxee Beneficios Brasil S.A. *(valor variável)* | 2.944,00 | Bradesco | 31/12/2099 | 30/12/2099 | 0 | 0 | 878 |
| Precisão Empreendimentos Imobiliários LTDA | 984,72 | Bradesco | 31/12/2099 | 10/12/2099 | 0 | 0 | 878 |
| Prefeitura da Cidade do Rio de Janeiro | 31,51 | Bradesco | 31/12/2099 | 03/12/2099 | 0 | 0 | 878 |
| Prefeitura da Cidade do Rio de Janeiro *(parcelamento 3x)* | 312,70 | Bradesco | 06/11/2026 | 06/11/2026 | 0 | 0 | 1 |
| Prov Telecom LTDA | 99,00 | Bradesco | 31/12/2099 | 20/12/2099 | 0 | 0 | 878 |
| Tayane Claudio Rezende Souza | 1.875,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Telma Rodrigues de Souza | 1.923,00 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Tim S.A | 114,18 | Bradesco | 31/12/2099 | 20/12/2099 | 0 | 0 | 878 |
| Título de Capitalização Bradesco | 114,72 | Bradesco | 31/12/2099 | 03/12/2099 | 0 | 0 | 1756 |
| Verisure Brasil Monitoramento de Alarmes S.A. | 291,31 | Bradesco | 31/12/2099 | 05/12/2099 | 0 | 0 | 878 |
| Verisure Brasil Monitoramento de Alarmes S.A. | 278,22 | Bradesco | 31/12/2099 | nunca | 0 | 0 | 0 |

*Observações:* a recorrência "Verisure" (R$ 278,22) **nunca gerou nada**; "Alexandre Lourenço Silva" tem 2 ocorrências (nov/dez) e termina em 31/12/2026; "DARF PREVIDENCIARIO" não tem data final (gerou 11 ocorrências, até 20/09/2027); "Prefeitura (parcelamento 3x)" gerou 1.

## 5. Respostas diretas

### 5.1 Quais registros precisam ser removidos (para reconstruir do zero)
**118 lançamentos ativos + 4 previstos do Cartão (se quiser)**, identificados por conta e data (01/09 a 31/10), **nunca por "lote"**:

| Conta | Quantidade | O que são |
|---|---|---|
| Bradesco | 21 | 19 OFX · 1 manual (R$ 20,00, 05/10) · 1 perna de transferência |
| Caixa de Aplicação | 1 | a perna de transferência de 01/10 (sai **junto** com a do Bradesco) |
| Caixa de Envelopes | 47 | 17 Omie · 21 manuais · 9 pernas de transferência |
| Caixinha Administrativo | 33 | 14 Omie · 10 manuais · 9 pernas de transferência |
| Cartão de Crédito | 16 (+4 previstos) | 16 Omie (setembro) · 4 faturas previstas de outubro |

**Atenção ao apagar "por lote":** os três lotes do Omie de 30/09 trouxeram **maio a setembro** (e previstos futuros). Envelopes: 62+54+29+50 de maio–agosto **+ 22 de setembro**; Caixinha: 32+27+16+25 **+ 19** (+4 previstos de 2027–2030); Cartão: 25+20+22+24 **+ 16** (+10 previstos). Apagar o lote inteiro destruiria maio–agosto. Tem de ser por data.

### 5.2 Quais devem permanecer
- **Tudo até 31/08**, em todas as contas (inclui as transferências de fim de agosto e o fechamento de 31/08 do Bradesco).
- O **saldo inicial** cadastrado de cada conta (Bradesco R$ 1,00 etc.), até você decidir sobre o do Bradesco.
- Os **previstos de novembro em diante**: as 29.866 ocorrências de recorrência (Bradesco) e os previstos do Omie para 2026–2030 (Cartão 6, Caixinha 4).
- **Recorrências** (as 37 definições), **fornecedores/favorecidos**, categorias, centros.
- **Registros de arquivos do Omie** (`fin_import_arquivos`) — a menos que você queira reimportar o mesmo `.xlsx` (ver §6, Fase 3).

### 5.3 Quais estão vinculados a transferências
**20 lançamentos** (10 pares): 9 pares Envelopes→Caixinha (18 pernas) e 1 par Aplicação→Bradesco (2 pernas). Lista no §3. **Apagar sempre o par inteiro** (a tela de lançamentos já remove as duas pernas; apagar uma só deixaria a outra "sem pai").

### 5.4 Quais estão vinculados a OFX
**19 lançamentos do Bradesco** (todos de 01 a 05/10, criados hoje às 15h50 e 22h02), com a marca `[ofx:FITID]`. Não há mais nada de OFX: nenhum registro de arquivo, nenhuma liquidação (`fin_liquidacoes` vazia), nenhum FITID duplicado. **Reimportar o OFX não esbarra em nenhuma trava**.

### 5.5 Quais estão vinculados a recorrências
**Nenhum lançamento de set/out.** O vínculo que importa é o das **definições**: as 37 recorrências existem e dizem que já geraram até 2099 (§4).

## 6. O que será perdido, o que não dá para refazer a partir do OFX

| Item | Quantidade | Por que é perda |
|---|---|---|
| **Lançamentos manuais** | **32** — Envelopes 21 entradas (R$ 1.987,10: Dízimos 9 = R$ 1.360,00 · Ofertas 12 = R$ 627,10 · Missões 1 = R$ 20,00) · Caixinha 10 saídas (R$ 1.032,79: Material de Consumo 8 = R$ 777,39 · Limpeza 1 · Benefícios 1) · Bradesco 1 (R$ 20,00) | O dinheiro em espécie (envelopes) e a caixinha **não passam pelo banco**: não há OFX deles. Só existem porque alguém digitou. |
| **Pernas Envelopes → Caixinha** | 9 pares, R$ 3.005,81 | Movimento interno em espécie, sem OFX |
| **Importados do Omie (xlsx)** | Envelopes 17 · Caixinha 14 · Cartão 16 (+4 previstos) | Voltam **só** reimportando os mesmos `.xlsx` — e o sistema **recusa o mesmo arquivo** (trava por hash); além disso os arquivos cobrem maio–setembro, e reimportar duplicaria maio–agosto (o sistema avisa, não bloqueia, a sobreposição de período) |
| **Anexos** | 12 lançamentos com anexo: Cartão 6 notas fiscais · Caixinha 4 notas fiscais + 2 documentos | Apagar pela tela remove a linha do anexo **e o arquivo** do armazenamento (a exclusão do app limpa os arquivos sem referência) |
| **Campanha missionária** | 2 lançamentos "nacionais" no Envelopes (06/09 R$ 50,00, Omie · 20/09 R$ 20,00, manual) | A marca de campanha acompanha o lançamento |
| **Trabalho de classificação** | 100 de 122 com categoria e centro de custo; 91 com pessoa/favorecido | Refeito pela Mesa a partir do histórico; o que era manual não tem como ser sugerido |

## 7. Plano de reconstrução, em ordem

> Cada fase só começa depois da anterior e depois do **seu OK**. Nenhuma delas foi executada.

### Fase 0 — Decisões (antes de tudo)
1. Limpar set/out em **todas** as contas ou só no Bradesco/Aplicação? (Hoje só Bradesco foi limpo de setembro.)
2. Para Envelopes/Caixinha/Cartão (sem OFX): as 32 entradas manuais e as importações do Omie **se refazem** de onde? (a) reimportar os `.xlsx` do Omie (exige tratar a trava e a sobreposição), (b) redigitar, (c) manter essas contas como estão e reconstruir só Bradesco/Aplicação.
3. O saldo do **Bradesco** representa a conta-corrente com varredura (R$ 1,00) ou o saldo do banco (OFX: R$ 11.159,60 em 05/10)?
4. As **37 recorrências**: refazer as ocorrências de set/out? E o horizonte de 2099?
5. As **faturas previstas de outubro do Cartão** (4, R$ 4.054,06): manter?

### Fase 1 — Preservar (leitura)
Exportar para planilha os 122 lançamentos (com conta, data, valor, categoria, centro, favorecido, descrição, origem, campanha, anexos) e baixar os arquivos dos 12 anexos. É a única forma de **não perder** o trabalho manual. *Posso gerar essa planilha — é só leitura.*

### Fase 2 — Remover, na ordem
1. Pares de transferência (10), pela tela de lançamentos, **sempre o par inteiro**;
2. manuais; 3. importados do Omie (**por data, nunca por lote**); 4. importados do OFX.
Depois de cada conta, **conferir**: o saldo atual deve igualar a coluna "Saldo em 31/08" do §2 (Bradesco 1,00 · Aplicação 15.192,83 · Envelopes 0,00 · Caixinha 572,95 · Cartão 0,00 · Poupança 9.108,10).

### Fase 3 — Preparar o terreno para o OFX
- **Recorrências**: se decidir refazer set/out, as ocorrências precisam voltar **antes** do OFX (para o sistema reconhecer prebenda, Light, Amil etc. como "documento a pagar"). Hoje o marcador `ultimo_gerado_ate` em 2099 impede a regeneração: é uma alteração de dado (`fin_recorrencias`) a ser decidida.
- **Trava do Omie**: se for reimportar `.xlsx`, os registros de `fin_import_arquivos` dos arquivos de setembro precisam ser tratados.
- **Saldo inicial do Bradesco**: definir (decisão 3) antes de conferir contra o banco.

### Fase 4 — Reimportar o OFX do Bradesco
- Arquivo: `Bradesco_05102026_162604.OFX` (353 movimentos, 01/09 a 05/10). **Não cobre depois de 05/10** — precisa de outro arquivo.
- Pela Mesa: identificados → revisão → não identificados; **medir** (identificados, aceitos sem mudança, corrigidos, manuais).
- As linhas de **aplicação/resgate** (APLIC.INVEST FACIL, RESGATE) viram **Transferência** com as duas pernas (Aplicação ↔ Bradesco); as de rendimento (RENTAB.INVEST) vão para Rendimentos.

### Fase 5 — Contas sem OFX
Envelopes e Caixinha (dinheiro): a fonte definida na decisão 2. **Cartão**: fatura (PDF) ou Omie. **Transferências Envelopes → Caixinha**: por último, depois das duas contas.

### Fase 6 — Conferir antes de dar por encerrado
- Saldo do Bradesco × **saldo do OFX** (R$ 23.134,54 em 04/09; R$ 11.159,60 em 05/10), se a decisão 3 for "saldo do banco";
- líquido das transferências do mês = **0,00**;
- nenhuma perna sem par; nenhum FITID repetido;
- previstos de novembro em diante intactos.

## 8. Riscos
1. Apagar **por lote** destrói maio–agosto (Omie).
2. Apagar **uma perna** de transferência deixa a outra sem par (o vínculo se desfaz) — o saldo das duas contas fica errado sem erro visível.
3. Reimportar OFX **antes** de refazer as ocorrências de set/out: as saídas conhecidas chegam sem "documento a pagar" e dependem só de palavra-chave.
4. O saldo do Bradesco (varredura) **não é** o saldo do banco: a conferência contra o OFX só faz sentido depois da decisão 3.
5. As 29.866 ocorrências previstas até 2099 inflam "previsto/atrasado" e as previsões de 30/60/90 dias.
