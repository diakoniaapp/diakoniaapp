# Auditoria da conta Investimento — 06/10/2026

**Conta no sistema:** "Caixa de Aplicação" (Invest Fácil do Bradesco). **Período:** 02/01/2024 a 31/08/2026.
**Método:** somente leitura. Extratos do banco (PDF de jan/2024 e de set/2026, OFX de ago–out/2026), exportações do
Omie (a origem da importação) e o banco de produção. Nada foi alterado; o saldo inicial não foi tocado.

> **Em uma frase.** O saldo inicial do sistema (R$ 2.962,22) está **R$ 32,20 abaixo** do real (R$ 2.994,42, provado pelo
> extrato de jan/2024); janeiro/2024 e agosto/2026 **batem com o banco**; e o erro que o ajuste manual escondeu (+R$ 33,20
> nos movimentos) está **entre fev/2024 e jul/2026** — onde não há extrato para provar — mas já dá para dizer onde ele **não**
> está e quais lançamentos estão errados de data, de texto ou de vínculo.

---

## 1. Os números pedidos

| | Banco | Sistema | Diferença |
|---|---|---|---|
| **Saldo inicial** (02/01/2024, antes da 1ª aplicação) | **R$ 2.994,42** ¹ | R$ 2.962,22 | **−R$ 32,20** |
| **Saldo final em 31/08/2026** | **R$ 15.191,83** ² | R$ 15.192,83 | **+R$ 1,00** |
| Movimento líquido (aplicações − resgates) no período | R$ 12.197,41 | R$ 12.230,61 | **+R$ 33,20** |

¹ Saldo do Invest Fácil em 02/01/2024 (R$ 8.589,47, tabela "Saldos Invest Fácil" do extrato) menos a aplicação do próprio dia
(R$ 5.595,05). Confere com os quatro lotes antigos resgatados em 03/01 (R$ 152,29 + 1.532,72 + 1.259,23 + 50,25 = R$ 2.994,49,
já com 1 dia de rendimento).
² Soma dos três lotes abertos em 31/08/2026, pelo extrato de set/2026: lote 1027249 (R$ 1.857,08, resgatado 01/09), lote
2331344 (R$ 1.634,76, resgatado 01/09) e lote 6519000 (R$ 11.699,99 = R$ 9.321,63 resgatados em 01/09 + R$ 2.378,36 em 09/09).
Pela tabela de saldos diários (R$ 2.378,38 em 01/09 + R$ 12.813,47 resgatados no dia) dá R$ 15.191,85 (2 centavos de rendimento).

**A conta fecha pelos números dela:** `2.962,22 + 12.230,61 = 15.192,83` — ou seja, o saldo inicial foi reduzido em R$ 32,20 para
absorver um excesso de **R$ 33,20** nos movimentos, e o R$ 1,00 que sobra é provavelmente o R$ 1,00 que o banco deixa na conta
corrente ("Total" do extrato = C/C R$ 1,00 + Invest Fácil R$ 15.191,83 = R$ 15.192,83) e que o Bradesco já guarda como o próprio saldo.

## 2. A primeira divergência

**02/01/2024 — o saldo inicial.** No primeiro saldo diário do banco (02/01/2024) o sistema está R$ 32,20 abaixo. Não é um
lançamento: é o saldo inicial alterado à mão. **Nenhum lançamento diverge em janeiro/2024:**

- 30 de 30 aplicações/resgates do extrato estão no sistema, com a mesma data, valor e sentido (0 faltando, 0 sobrando);
- na conta corrente, as 216 linhas de janeiro somam **R$ 108.969,51 de créditos e R$ 108.969,51 de débitos — igual ao
  "Total" do extrato**; e os saldos de fim de dia (−623,89 em 03/01; 1.351,00 em 08/01; 0,10 em 11/01; 401,00 em 22/01) são os do banco;
- a distância entre o saldo do banco e o do sistema vai de −R$ 32,20 (02/01) a −R$ 38,13 (31/01): os R$ 5,93 a mais são
  **rendimento do Invest Fácil embutido nos resgates** de janeiro (o resgate do lote 7147255 foi R$ 5.595,17 para uma aplicação
  de R$ 5.595,05, e assim por diante). Em jan/2024 o rendimento vinha dentro do valor do resgate; a partir de fev/2024 aparecem créditos à parte
  (`RENTAB.INVEST FACILCRED`, que o Omie lança como "Rendimentos de Aplicações"), mas ainda em mar/2024 há resgates com rendimento
  embutido (R$ 1.045,92 para uma aplicação de R$ 1.045,90; R$ 773,03 para R$ 773,00) — o formato mudou aos poucos.

## 3. O que a investigação provou sobre o resto do histórico

### 3.1 O erro **não** está em janeiro/2024 nem em agosto/2026
- **Agosto/2026:** o OFX do banco soma **R$ 38,44** de movimento na conta corrente (3–31/08); o sistema também. Dia a dia
  só diferem por um deslocamento de 1 dia (R$ 786,00 entre 03 e 04/08). As aplicações e resgates de agosto são as mesmas do Omie
  (117 de 117 lançamentos), e os dois lotes de 27 e 31/08 (R$ 1.634,76 e R$ 11.699,99) são **exatamente** os lotes abertos do banco.
- **Importação do Omie para o sistema, conta Bradesco:** de 8.992 linhas realizadas do Omie, o sistema reproduz tudo; a
  diferença são só 26 linhas do Omie × 41 do sistema, e todas se explicam por **(a)** rateio dízimo/oferta em duas linhas e
  **(b)** transferências com a **data trocada** (3.1.2). Os dois lados somam o mesmo (R$ 14.404,82).

### 3.2 Lançamentos de transferência com data trocada pela importação (causa raiz dos saldos intermediários errados)
O Omie tem a data certa (o saldo diário do Omie na conta corrente fica em R$ 1,00 o tempo todo); a importação pareou as duas
pernas e gravou **a data da outra ponta**. Resultado no sistema: a conta corrente fica "parada" em R$ 1.164,78 / R$ 10.785,86
de **10/02/2025 a 09/10/2025** (o Omie mostra R$ 1,00), e o fundo vai a **−R$ 10.696,85 em 20/03/2025** — impossível no banco.

| Lançamento | Data correta (Omie) | Data no sistema | Efeito |
|---|---|---|---|
| Resgate R$ 9.621,08 | **20/05/2025** | 20/02/2025 | fundo e conta corrente trocados por 3 meses |
| Resgate R$ 1.163,78 | **10/10/2025** | 10/02/2025 | idem por 8 meses (existe aplicação de mesmo valor em 09/09/2025) |
| Cartão R$ 3.770,49 | 10/09/2024 | 11/09/2024 | 1 dia |
| Pagamento R$ 9.237,96 | 03/01/2025 | 02/01/2025 | 1 dia |
| R$ 1.332,50 | 03/04/2025 | 01/04/2025 | 2 dias |
| R$ 406,02 | 29/04/2025 | 28/04/2025 | 1 dia |
| Cartão R$ 1.905,82 | 11/03/2024 | 10/03/2024 (domingo) | 1 dia |
| R$ 10,00 | 21/01/2026 | 22/01/2026 | 1 dia |
| R$ 6.127,29 | 05/03/2026 | 06/03/2026 | 1 dia |
| R$ 374,00 e R$ 412,00 | 04/08/2026 | 03/08/2026 | 1 dia |

Esses erros **não mudam o saldo de 31/08/2026** (se anulam), mas tornam falsos os saldos do Investimento e do Bradesco entre
fev/2024 e out/2025 e quebram qualquer relatório "posição em uma data". **Correção recomendada:** corrigir a data das duas pernas
de cada um (a do 9.621,08 e a do 1.163,78 primeiro). SQL de correção pode ser gerado depois que você confirmar as datas.

### 3.3 Transferências: verificação das seis perguntas
Em 2.988 lançamentos de transferência do sistema (962 no Investimento):

1. **Uma ponta só:** nenhuma no Investimento. Há **uma** com vínculo de volta ausente: a aplicação de **R$ 11.699,99 de 31/08/2026**
   (correção feita em 30/09; a perna do Bradesco não aponta de volta para a do Investimento). Valor e data estão certos (= lote 6519000).
2. **Duplicada:** nenhuma (mesmo dia + mesmo sentido + mesmo valor: 0 casos).
3. **Importada como receita / 4. como despesa:** nenhuma no Investimento (todos os 962 são `origem = transferencia`, sentidos coerentes).
5. **Criada à mão e de novo pelo OFX:** não há; a conta nunca recebeu OFX (todo o histórico é do Omie: 7.859 lançamentos do Bradesco
   `importado_omie`, 1.223 `transferencia`). O OFX do Bradesco **não traz aplicação nem resgate** — só o rendimento.
6. **Valores diferentes nas duas pontas:** nenhum (962 de 962 iguais, mesma data e sentidos opostos).

**Textos que contradizem as contas** (afetam leitura, não saldo — o sentido dos lançamentos foi conferido pelo saldo diário do banco):

| Lançamento | O que está errado |
|---|---|
| R$ 4.677,81 em 10/01/2025 | O texto diz "→ Caixa de Aplicação", mas a outra ponta é o **Cartão de Crédito**. É o pagamento da fatura (todo dia 10); não é aplicação. Corrigir o texto. |
| R$ 1.053,53 em 13/03/2025 | O texto diz "Bradesco → Caixa de Aplicação", mas as pontas estão **invertidas** (Bradesco recebe, Investimento paga). Conferir com o extrato de mar/2025 qual é o sentido real. |
| R$ 6.694,00 em 31/03/2026 (`realizado`) | O texto diz "Caixa de Aplicação → Bradesco", mas é uma **aplicação** (saldo diário do Bradesco = R$ 1,00 confirma). Texto errado e ainda sem conciliar. |
| R$ 8.853,64 em 19/01/2024 | Texto com "(entrada) (saída)" duplicado. Valor, data e sentido **batem** com o banco. |
| R$ 170,57 em 27/04/2025 | Texto "Caixa de Envelopes → Bradesco", mas a entrada está na **Caixinha Administrativo**. Não é do Investimento. |

### 3.4 Rendimentos
- O Omie lança **R$ 1.227,60** em "Rendimentos de Aplicações" (458 linhas; 2024: R$ 1.094,43 — dos quais R$ 1.008,71 só em jul/2024 —, 2025: R$ 123,59, 2026: R$ 9,58) como receita **na conta corrente**.
  Em jan/2024 o rendimento está **dentro** dos resgates e **não** foi lançado como receita: por isso o Investimento ficou
  R$ 5,93 abaixo do banco só em janeiro. O rendimento embutido nos resgates de 2024 também nunca foi lançado — e é por isso que o fundo do sistema chega a **−R$ 46,58 em 20/03/2024** (resgate de R$ 5.842,82 sobre um saldo de R$ 5.796,29 + novas aplicações): um fundo não fica negativo.
- Em set/2026 o banco mostra 16 créditos de `RENTAB` (R$ 0,01 a R$ 0,14); como o sistema ainda não tem setembro, não foram comparados.

### 3.5 Importação OFX
Não há OFX do Investimento (nem existe: o banco não o gera). As lacunas reais são de **extrato**, não de OFX: só existem para
conferência jan/2024 (PDF) e ago–out/2026 (OFX + PDF). **Fevereiro/2024 a julho/2026 não têm extrato bancário nenhum no sistema** —
tudo vem do Omie, que é uma digitação/importação, não o banco.

### 3.6 Mudança de conta bancária (a conferir)
O extrato de jan/2024 é da **Ag. 1125 / CC 0061094-1**; o de set/2026 é da **Ag. 2013 / CC 0199094-2** (e o cartão já debitava
em 2013/199094-2 em mai/2024). O sistema tem **uma** conta Bradesco e **um** Investimento para as duas. Houve migração de conta
e de fundo em algum mês entre jan/2024 e mai/2024; se o saldo do Invest Fácil antigo foi para o novo, o Omie precisa ter esse
movimento — e é um candidato natural ao R$ 33,20.

## 4. O que NÃO consegui provar (e por quê)
O excesso de **R$ 33,20** nos movimentos (o motivo do ajuste manual) está em algum mês **entre fev/2024 e jul/2026**. Não dá
para apontar o lançamento sem o extrato do banco desses meses: o Omie e o sistema concordam entre si (a importação é fiel),
então só o banco diz qual dos dois está errado. O que já se sabe:

- não é duplicidade, perna faltando nem valor diferente entre pontas (itens 1–6 acima);
- não é o rendimento (o rendimento embutido faz o sistema ficar **abaixo** do banco, não acima — sinal contrário);
- as 4 correções retroativas de 30/09/2026 (R$ 11.699,99 de 31/08 e três resgates de abril: R$ 1.371,62 + 2.498,18 + 2.824,20) foram
  feitas por reconstrução; a de 31/08 está **provada** pelo banco, as de abril ainda **não**;
- o **Omie** (conta Invest, "Bradesco 111795") fecha ago/2026 em R$ 1.363,27 — R$ 13.828,56 abaixo do banco (R$ 11.699,99 pela
  aplicação que faltava e **R$ 2.128,57 de resto não explicado**). Ou seja, a conta Investimento **do Omie** também nunca bateu
  com o banco; o sistema só ficou próximo porque as pernas foram tiradas do lado do Bradesco.

## 5. Recomendação (sem tocar no saldo inicial)

1. **Corrigir o saldo inicial para R$ 2.994,42** (o do extrato) **só depois** de achar os R$ 33,20 — senão o ajuste volta a ser escondido
   em outro lugar. Enquanto isso, deixar o ajuste documentado (esta nota) é mais honesto do que ele estar "silencioso".
2. **Corrigir as datas** das duas transferências de 2025 (R$ 9.621,08 → 20/05/2025; R$ 1.163,78 → 10/10/2025) e das oito de 1–2 dias.
3. **Corrigir os textos** das cinco transferências acima e ligar a perna do Bradesco da aplicação de 31/08/2026.
4. **Trazer os extratos mensais do Bradesco de fev/2024 a jul/2026** (PDF "Extrato Mensal / Por Período", contendo a tabela
   "Saldos Invest Fácil / Plus"; das duas contas, 1125/0061094-1 e 2013/0199094-2). Com eles, as ferramentas em
   `scripts/auditoria-investimento/` cruzam, mês a mês, aplicação/resgate/rendimento e o saldo diário do fundo com o sistema, e o
   primeiro mês em que a diferença deixa de ser de −R$ 32,20 aponta o lançamento (o método já funcionou em jan/2024 e ago/2026).
5. **Importar setembro pelo OFX** só depois de corrigir as datas acima (senão o saldo diário de out/2026 herda a distorção), e
   passar a lançar o **rendimento** do Invest Fácil (RENTAB) como receita à parte, sempre.
6. **Prevenção:** a importação do Omie deve **manter a data de cada perna** (o pareamento hoje descarta a da conta corrente) e o
   sistema deve oferecer o "Extrato do fundo" (leitura do PDF do banco) para o Investimento — uma única fonte de verdade.

## 6. Resultado esperado × entregue
| Pedido | Situação |
|---|---|
| 1. Saldo inicial do banco | R$ 2.994,42 (provado) |
| 2. Saldo final em 31/08/2026 | R$ 15.191,83 (provado pelo extrato de set/2026) |
| 3. Saldo do sistema | R$ 15.192,83 |
| 4. Diferença | +R$ 1,00 no final; −R$ 32,20 no início; +R$ 33,20 nos movimentos |
| 5. Primeira divergência | 02/01/2024 — o saldo inicial (−R$ 32,20); jan/2024 e ago/2026 sem nenhum lançamento divergente |
| 6. Lançamentos problemáticos | §3.2 (datas trocadas, 11) e §3.3 (textos/vínculo, 6) |
| 7. Correção | §5 |
| Origem do R$ 33,20 | **Pendente**: precisa dos extratos de fev/2024–jul/2026 (§4) |
