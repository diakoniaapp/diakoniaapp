# Auditoria de saldos financeiros — 07/10/2026 (23h50)

> **Somente leitura.** Nenhum lançamento foi criado, alterado ou apagado, nenhum saldo foi recalculado. Tudo abaixo vem de consultas ao banco de produção
> feitas entre 22h e 23h53; a última conferência (23h53) repetiu os mesmos números.

## 1. A resposta curta

1. **Os saldos cadastrados estão aritmeticamente corretos em todas as 6 contas** (diferença 0,00 entre `fin_contas.saldo_atual` e saldo inicial + movimento
   realizado/conciliado). O gatilho que mantém o saldo está ligado e funcionando. Não há tabela de cache, snapshot nem saldo diário gravado: tudo é calculado na hora.
2. **O que parece "resíduo" é dado de verdade, ainda existente**: setembro/outubro **não estão vazios**. Sobraram **118 lançamentos** (realizados/conciliados) em 5 das 6 contas.
   Só o Bradesco foi limpo de setembro; **outubro do Bradesco tem 21 lançamentos, criados hoje** (07/10, entre 15h50 e 22h02).
3. **De onde vêm os R$ 1,00:** do **cadastro da conta Bradesco** (`fin_contas.saldo_inicial = 1,00`), não de lançamento. O movimento do Bradesco até 31/08 soma exatamente
   0,00 (o banco varre o saldo todo dia para a Caixa de Aplicação), então o saldo em 31/08 é 1,00 + 0,00 = **1,00**. Apagar lançamentos nunca mexe nesse campo.
4. **A tela e o banco discordam num ponto que não consegui explicar só pelo banco:** a tela mostrou 0 lançamentos em 01/09–31/10, e o banco tem 21 só no Bradesco
   (todos de 01 a 05/10). Hipóteses em §6; peço um print da tela (conta, período e filtro de situação) para fechar.

## 2. Tabela final — conta × saldo × resíduo de setembro/outubro

*Saldo correto* = o que o saldo da conta seria **se setembro e outubro estivessem realmente vazios** (saldo inicial cadastrado + movimento até 31/08).
*Saldo exibido* = `fin_contas.saldo_atual` (o que o sistema mostra hoje).

| Conta | Saldo correto (só até 31/08) | Saldo exibido | Diferença | Origem da diferença | Correção recomendada |
|---|---|---|---|---|---|
| **Bradesco** | 1,00 | **10.322,44** | **+10.321,44** | 21 lançamentos de outubro (01–05/10): 19 `importado_ofx` (R$ 8.666,68) + 1 manual (R$ 20,00) + 1 perna de transferência (R$ 1.634,76) — tabela `fin_lancamentos` | apagar os 21 (a perna de transferência junto com a perna da Caixa de Aplicação) **ou** mantê-los como a nova importação |
| **Caixa de Aplicação** | 15.192,83 | 13.558,07 | −1.634,76 | 1 perna de transferência de 01/10 (parceira da entrada do Bradesco) — `fin_lancamentos` | apagar junto com a do Bradesco (são um par) |
| **Caixa de Envelopes** | 0,00 | 2.764,00 | +2.764,00 | **47 lançamentos** de set/out ainda ativos: 17 `importado_omie` (R$ 3.782,71) · 21 manuais (R$ 1.987,10) · 9 pernas de transferência (saídas R$ 2.805,81 + 200,00) | decidir: apagar (se faz parte do recomeço) ou manter |
| **Caixinha Administrativo** | 572,95 | −28,70 | −601,65 | **33 lançamentos** de set/out ainda ativos: 14 `importado_omie` (saídas R$ 2.574,67) · 10 manuais (saídas R$ 1.032,79) · 9 pernas de transferência (entradas R$ 3.005,81) | idem |
| **Cartão de Crédito** | 0,00 | −8.249,72 | −8.249,72 | **16 lançamentos** `importado_omie` de set/out (importados em 30/09, 10h22) | idem |
| **Poupança** | 9.108,10 | 9.108,10 | 0,00 | sem resíduo de set/out | — (ver observação 7.4) |

Nada aqui é "erro de cálculo": cada diferença é a soma de lançamentos que **existem** na tabela. Se a intenção é recomeçar setembro/outubro em todas as contas, o que falta apagar é a coluna
"Origem". Esta auditoria não apagou nada.

## 3. Por conta: cadastrado × calculado × contagens

| Conta | Saldo inicial | Saldo cadastrado | Saldo calculado | Diferença | Lanç. ativos (realiz.+concil.) | Previstos | Cancelados | Pernas de transferência | Conciliados |
|---|---|---|---|---|---|---|---|---|---|
| Caixa de Envelopes | 2.317,46 | 2.764,00 | 2.764,00 | 0,00 | 1.877 | 0 | 0 | 502 | 1.798 |
| Caixinha Administrativo | 0,00 | −28,70 | −28,70 | 0,00 | 815 | 4 | 0 | 272 | 773 |
| Bradesco | **1,00** | 10.322,44 | 10.322,44 | 0,00 | 9.028 | **29.866** | 0 | 1.224 | 8.885 |
| Cartão de Crédito | 0,00 | −8.249,72 | −8.249,72 | 0,00 | 370 | 10 | 0 | 31 | 369 |
| Caixa de Aplicação | 2.962,22 | 13.558,07 | 13.558,07 | 0,00 | 963 | 0 | 0 | 963 | 843 |
| Poupança | 0,00 | 9.108,10 | 9.108,10 | 0,00 | 1 | 0 | 0 | 0 | 1 |

- **"Excluídos logicamente": não existe.** `fin_lancamentos` não tem coluna de exclusão lógica (`deleted_at`); apagar na tela apaga a linha de verdade. O que existe é o status `cancelado`
  (e `aguardando_aprovacao`) — **zero** lançamentos em ambos.
- Lançamentos com valor ≤ 0: 0 · de conta inativa: 0 · sem conta: 0 · FITID de OFX duplicado: nenhum.

## 4. Rastreamento dos R$ 1,00 (Bradesco)

```
fin_contas.saldo_inicial (Bradesco) ........................ 1,00      ← o cadastro da conta
+ movimento realizado/conciliado ATÉ 31/08 (9.007 lanç.) ... 0,00      ← entradas = saídas, mês a mês e dia a dia
= saldo em 31/08 (o "Saldo inicial" do período 01/09) ...... 1,00
+ movimento 01/09 → 31/10 (21 lançamentos, todos de 01–05/10) ... 10.321,44
= saldo atual cadastrado ................................... 10.322,44
```
**Por que o movimento até 31/08 dá exatamente 0,00:** o Bradesco "varre" o saldo para a Caixa de Aplicação. A conta de agosto, por exemplo, tem entradas = saídas = R$ 124.616,88 e o saldo
acumulado volta a 1,00 em todos os dias sem movimento líquido. As pernas "Transferência: Bradesco → Caixa de Aplicação" de fim de mês foram criadas em **30/09** (ex.: 31/08, R$ 11.699,99; 31/07,
R$ 4.244,93; 30/06, R$ 6.514,30) — são elas que fecham cada mês em zero.

**Comparação com o banco (informativa, não é erro provado):** o OFX traz o saldo do banco no dia do arquivo — **29/08: R$ 5.199,33 · 04/09: R$ 23.134,54 · 05/10: R$ 11.159,60**. O Bradesco no DiakoniaApp
mostra 1,00 em 31/08 e 10.322,44 em 05/10 (diferença de R$ 837,16 nesta última data). O saldo "Bradesco" do sistema é um **saldo de conta-movimento com varredura**, não necessariamente o saldo que o banco informa
(que pode incluir a aplicação automática). Vale a tesouraria dizer qual dos dois o "Saldo" da conta deve representar antes da reconciliação de setembro.

## 5. Transferências — íntegras

| Verificação | Resultado |
|---|---|
| Pernas de transferência | 2.992 (2.626 conciliadas, 366 realizadas) |
| Perna órfã (sem par, em qualquer sentido do vínculo) | **0** |
| Par com valor diferente | 0 |
| Par com data diferente | 0 |
| Par com mesmo tipo (deveria ser entrada × saída) | 0 |
| Par na mesma conta | 0 |
| Transferência sem conta | 0 |
| Líquido das transferências por mês (julho, agosto, setembro, outubro) | **0,00** (equilibrado) |
| Par com status diferente (um realizado, outro conciliado) | 24 pares — **não afetam o saldo** (os dois status contam); só inconsistência de situação |

Como o vínculo entre as pernas tem `ON DELETE SET NULL`, apagar uma ponta deixaria a outra "sem pai" — por isso o teste final foi o líquido mensal, que está zerado. Há **um** par em que só um lado aponta
para o outro (31/08, Bradesco → Caixa de Aplicação, R$ 11.699,99) — íntegro, só assimétrico.

## 6. Por que a tela mostra "0 lançamentos" e o banco tem 21

Para o período 01/09–31/10 na conta Bradesco, a tela soma o que `listarLancamentosSemTeto` devolve com os filtros da tela; o saldo inicial vem de `fin_movimento_antes_de(01/09)` = 0,00 + `saldo_inicial` 1,00.
Com 21 lançamentos no banco, a tela só pode mostrar 0 se: (a) a página foi carregada **antes** das importações de hoje (15h50, 21h13 e 22h02) e não foi recarregada; (b) há filtro de situação/tipo/busca ativo na tela
(a lista respeita `statusFiltro`); (c) a conta aberta não é o Bradesco; ou (d) alguém apagou os 21 **depois** das 23h53 (conferido: ainda existem). **Não encontrei no banco nada que esconda esses lançamentos**
(nenhuma coluna de exclusão lógica, nenhum status oculto). Para fechar: um print com conta, período e filtros, depois de recarregar a página (Ctrl+Shift+R).

Os 21 lançamentos (todos `Bradesco`, outubro):

| ID | Data | Origem | Tipo | Valor | Criado em |
|---|---|---|---|---|---|
| 4ab34936-7818-4ed2-bdf6-c4b26483392a | 01/10 | importado_ofx | entrada | 220,00 | 07/10 15:50 |
| f3cd516d-79d7-4540-a9ad-d89713a37bfd | 01/10 | importado_ofx | entrada | 294,00 | 07/10 15:50 |
| cabba2c8-3bc0-4b68-a39c-ec92735a250f | 01/10 | importado_ofx | entrada | 220,00 | 07/10 15:50 |
| c04cbc25-c9be-45e3-82a6-88bdfffb4e81 | 01/10 | importado_ofx | entrada | 1.070,00 | 07/10 15:50 |
| 3eac6d95-b7d8-4a9a-ad7a-d5010cfdb637 | 01/10 | **transferência** (perna) | entrada | 1.634,76 | 07/10 21:13 |
| 5aebe974-b8cb-4142-96fe-7f3706947416 | 01/10 | importado_ofx | entrada | 14,60 | 07/10 22:02 |
| a6f31788-b1f9-489b-b4d9-b3b216b06cd2 | 02/10 | importado_ofx | entrada | 470,00 | 07/10 15:50 |
| 18f135b7-208f-4141-84b3-82f208a5c481 | 02/10 | importado_ofx | entrada | 400,00 | 07/10 15:50 |
| 5f760d64-f783-4747-acc9-814d5b91874d | 02/10 | importado_ofx | entrada | 1.000,00 | 07/10 15:50 |
| 9b691df6-216e-4b4d-80a3-66cf9eabe76c | 02/10 | importado_ofx | entrada | 0,03 | 07/10 15:50 |
| c4b5c51b-94f4-4cc3-9dc8-c4e3041e33d6 | 02/10 | importado_ofx | entrada | 300,05 | 07/10 15:50 |
| 74295fab-a30f-4347-885b-a6ecaabbffa1 | 02/10 | importado_ofx | entrada | 219,00 | 07/10 15:50 |
| 2c04013b-a51d-44f2-9cc7-e9e1f219daba | 05/10 | importado_ofx | entrada | 1.300,00 | 07/10 15:50 |
| 6eee8248-b5da-44cc-af9a-873c26301c6f | 05/10 | importado_ofx | entrada | 637,00 | 07/10 15:50 |
| 46d0f8d7-79f8-4377-ad4a-35b97b1af9b7 | 05/10 | importado_ofx | entrada | 1.500,00 | 07/10 15:50 |
| ee764ceb-b278-4908-a308-b62d35de6eb1 | 05/10 | importado_ofx | entrada | 50,00 | 07/10 15:50 |
| 9f4eb691-1505-4309-b142-2e22e4b076b3 | 05/10 | importado_ofx | entrada | 650,00 | 07/10 15:50 |
| b83da4ff-5a74-4acf-bce9-efc4871b2d60 | 05/10 | importado_ofx | entrada | 150,00 | 07/10 15:50 |
| cfff42a9-96f1-495c-ad6f-f6420018a7f2 | 05/10 | importado_ofx | entrada | 20,00 | 07/10 15:50 |
| 2d8ae00d-67db-4a1d-ac30-4a150ed897c6 | 05/10 | importado_ofx | entrada | 152,00 | 07/10 15:50 |
| 941ebd1d-f9d8-481d-9ade-2869c869d60b | 05/10 | manual | entrada | 20,00 | 07/10 16:16 |

Observação: nenhuma saída de outubro foi importada no Bradesco (só entradas): o OFX de 01–05/10 tem saídas (tarifas, pagamentos) que não aparecem aqui.

## 7. Outras tabelas, caches e resíduos

| O que foi verificado | Resultado |
|---|---|
| **Saldos auxiliares / diários / snapshots / caches / resumos** | **Não existem tabelas** para isso. `fin_exec_saldo_consolidado` e `vw_fin_resumo_mes` somam `fin_contas.saldo_atual` na hora; o fluxo diário é calculado dos lançamentos; não há `cron` de saldo nem view materializada. |
| `fin_contas.saldo_atual` | recalculado por gatilho a cada lançamento/saldo inicial; ligado (`fin_lanc_saldo`, `fin_contas_saldo_inicial`); bate com o cálculo nas 6 contas |
| `fin_fechamentos_periodo`, `fin_reunioes_financeiras` | **vazias** — nenhum fechamento ou reunião guarda saldo de set/out |
| **Importações OFX** | **sem resíduo**: nenhuma linha em tabela de OFX (o OFX não grava arquivo); o controle de duplicidade é a marca `[ofx:FITID]` nos 19 lançamentos acima; `fin_liquidacoes` está vazia (0), então nenhum FITID "fantasma" bloqueia uma nova importação |
| **Importações do Omie (`fin_import_arquivos`)** | **cerca de 150 arquivos registrados** (15/09 a 30/09), inclusive arquivos que cobrem setembro: Bradesco 01/09–31/12 (308 linhas, 15/09), Bradesco 04/05–30/09 (1.416, 30/09), Bradesco 04/05–2030 (1.544), Envelopes 03/05–13/09 (219), Caixinha, Cartão… Essa tabela é a **trava de arquivo repetido**: reimportar o mesmo `.xlsx` do Omie será recusado enquanto o registro existir. **Não afeta o OFX.** |
| Anexos (`fin_lancamento_anexos`) / rateios | 128 anexos (12 de set/out, dos lançamentos que restam); rateios 0. Nenhum órfão (a exclusão do lançamento apaga o anexo em cascata). Arquivos no bucket `fin-comprovantes`: 110 objetos |
| Folha, fiscal, estoque, bazar | nenhum item pago/movimentado sem lançamento em set/out; `arr_movimentos` sem vínculo |
| `fin_ajustes_fundo_missionario` | 1 ajuste de 2024, inativo |
| **Previstos de recorrência** | **29.866 lançamentos `previsto` no Bradesco gerados até 30/12/2099** (de 01/11/2026). **Não afetam saldo** (só realizado/conciliado contam), mas alimentam "previsto/atrasado" e a previsão de 30/60/90 dias. Atrasados hoje: 0 |

### 7.1 Observação (fora do pedido, mas relevante)
**Poupança tem um único lançamento: entrada de R$ 9.108,10 em 01/08/2026, categoria Dízimos, sem descrição.** O valor termina em ",10" e é a única movimentação da conta; vale conferir se é dízimo, oferta missionária
ou saldo de abertura lançado como entrada.

## 8. O que **não** foi feito (como pedido)
Não apaguei nem recriei lançamentos, não recalculei saldos, não alterei `saldo_inicial`, não mexi em `fin_import_arquivos`, não apliquei migrations.

## 9. Perguntas para você decidir antes de qualquer correção
1. Setembro/outubro devem ficar **vazios em todas as contas** (Envelopes, Caixinha, Cartão, Aplicação) ou só no Bradesco? Hoje só o Bradesco foi limpo de setembro.
2. Os 21 lançamentos de outubro do Bradesco (importados hoje) são para **ficar** (nova importação de teste) ou para sair antes de reimportar o OFX completo?
3. O saldo da conta **Bradesco** deve representar a conta-corrente com varredura (1,00) ou o saldo que o banco informa no OFX (R$ 11.159,60 em 05/10)? Isso decide se o `saldo_inicial` de R$ 1,00 está certo.
4. Vai reimportar arquivos **do Omie** (`.xlsx`) de setembro? Se sim, os registros em `fin_import_arquivos` precisam ser tratados antes, senão a importação é recusada como "arquivo repetido".
5. As 29.866 recorrências previstas até 2099: o horizonte é intencional?
