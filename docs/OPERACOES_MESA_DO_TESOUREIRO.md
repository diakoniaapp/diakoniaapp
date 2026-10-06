# A aba "1 Operações" como mesa de trabalho do tesoureiro

Levantamento de **06/10/2026**, sobre o código e sobre o banco de produção (somente leitura).

## 1. O diagnóstico

A aba tinha três "Centrais" lado a lado:

| Central | O que mostrava | Veredito |
|---|---|---|
| Pagamentos | a pagar em 7 dias, atrasados, vence hoje, "prontos com Pix" | **era a única operacional** — mas só olhava 7 dias e tratava tudo como "pagar à mão" |
| Arrecadação | dízimos + ofertas + missões do período, "tendência" | **indicador**, não tarefa. O tesoureiro não age sobre ele. Já existe em Gestão (Indicadores Eclesiásticos) |
| Conciliação | "N lançamentos pendentes de conciliar" | **medida frágil**: contava os realizados dos últimos dias em conta de banco, não o que de fato falta bater com o extrato. A conciliação real é feita no importador de extrato e no checklist do Fechamento |

Medido em produção em 06/10/2026: 111 saídas previstas (nenhuma atrasada, nenhuma vencendo hoje, 4 nos próximos 7 dias, 107 depois), 10 recorrências ativas, 0 pagamentos no dia, 2 pagamentos recentes sem comprovante, último movimento do Bradesco em 31/08. A Central de Arrecadação mostrava "R$ 0,00 — 0 lançamentos" e a de Conciliação "0": **duas das três centrais estavam vazias justamente na maior parte dos dias**, ocupando 2/3 da tela de trabalho.

## 2. O que é trabalho operacional diário

| Tarefa do tesoureiro | Onde fica agora |
|---|---|
| Ver o que precisa ser pago: atrasadas, hoje, amanhã, 7 dias, 30 dias | **Contas a pagar** |
| Pagar, anexar boleto/fatura/guia | botões **Pagar** e clipe em cada linha |
| Saber se o caixa aguenta a semana | faixa do dia: **Caixa disponível · A pagar · Sobra/Falta** |
| Conferir o que o banco debita sozinho | **Débitos automáticos** |
| Anexar comprovantes dos pagamentos | **Comprovantes pendentes** + **Pagamentos de hoje** |
| Garantir a documentação para a contabilidade | **Documentos para a contabilidade** (mês atual + o mês em fechamento até o dia 20) |
| Saber se o extrato está em dia | checklist **Seu dia** + "Último movimento no banco" |
| Recorrências | contador e atalho |

O **checklist "Seu dia"** reúne sete verificações (atrasadas, vence hoje, débitos a conferir, comprovantes, extrato, aprovações, documentos); cada uma diz o que falta ou que está em dia, e a que exige ação leva direto ao lugar.

## 3. Para onde foi o resto

| Antes em Operações | Agora |
|---|---|
| Central de Arrecadação | **2 Gestão** (Indicadores Eclesiásticos — já existia, com período e tendência). O "Arrecadado" some do cabeçalho só na aba Operações |
| Central de Conciliação | **importador de extrato** (botão "Importar extrato" e o novo painel de identificação) e o **4 Fechamento** (passo 1 do checklist, por conta de banco) |
| "Meu trabalho" e Favoritos | continuam acima de todas as abas |

Indicadores (tendências, comparativos, DRE, missionários) ficam em **Gestão**; o fechamento do mês (conciliar, corrigir, documentar, gerar e enviar o malote), em **Fechamento**. Operações responde só: *o que eu faço hoje?*

## 4. Débito automático como fluxo próprio

Quatro formas de liquidar, escolhidas na recorrência (e no lançamento previsto): **Manual**, **Boleto/Fatura**, **Débito automático**, **PIX recorrente**, **Transferência programada**.

- *A pagar* = manual + boleto/fatura. *Automáticas* = débito automático + PIX recorrente + transferência programada (decisão minha — a lista está em `LIQUIDACAO_AUTOMATICA`, `src/lib/formaLiquidacao.ts`, e muda numa linha).
- Uma conta automática **sai de "Contas a pagar"** e entra em "Débitos automáticos": *Aguardando débito* → *Débito encontrado* (apareceu no extrato) ou *Não encontrado* (3 dias de folga depois do vencimento, por causa de fim de semana).
- **Indicadores**: previstos, encontrados, não encontrados, valor previsto do mês, valor efetivamente debitado.
- **Importação do OFX**: uma saída de mesmo valor, dentro de ±5 dias do vencimento, vira *"Débito automático encontrado"* e concilia com um clique (o previsto passa a conciliado, com o dia e o valor reais do banco). Conta variável aceita até ±35% — mas só com nome em comum. Dois candidatos iguais: o nome decide; sem nome, ninguém (melhor o tesoureiro escolher).
- **Valor fixo × variável** virou escolha explícita (rádio) na recorrência. O campo `valor_variavel` já existia; o gerador passa a copiá-lo para cada previsto.

**Depende da migration** `20261006120000_fin_forma_liquidacao.sql`. Sem ela, o sistema continua funcionando: tudo permanece em "Contas a pagar" e a mesa avisa o motivo.

## 5. Limites conhecidos

- Os 111 previstos de hoje não têm vínculo com a recorrência que os gerou; a mudança de forma de liquidação é propagada por descrição + conta + tipo (de hoje em diante) — nunca ao passado.
- "Pagamentos de hoje" e "Comprovantes pendentes" ignoram transferências entre contas.
- O horizonte do gerador de recorrências (90 dias por padrão) e o teto de dezembro/2026 relatado seguem na fila de revisão do módulo de Recorrências.
