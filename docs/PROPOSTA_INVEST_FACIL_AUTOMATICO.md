# Proposta — registrar aplicações e resgates do Invest Fácil quase sem trabalho (08/10/2026)

Pedido: ao importar OFX + PDF, as aplicações viram sugestão de **Transferência Conta Corrente → Aplicação**, os resgates **Aplicação → Conta Corrente**, o tesoureiro só confirma, e a auditoria avisa na hora quando o PDF tem aplicação/resgate sem transferência no sistema.

**Veredito: é possível, com pouco risco, e quase tudo já existe.** Nada disto grava sozinho: cada transferência continua pedindo o clique do tesoureiro.

## 1. O que medi (extrato de 01/09 a 05/10, 375 linhas)

| Fato | Por que importa |
|---|---|
| O PDF traz 35 linhas do Invest Fácil: 17 históricos de aplicação/resgate em 6 formas de texto (`APLIC.INVEST FACIL`, `TRANSF PGTO PIX APLIC.INVEST…`, `LIQUIDACAO QRCODE PIX APLIC…`, `RESGATE INVEST FACIL`, `RESGATE … DEP DINHEIRO ATM`, `RESG.AUTOM.INVEST FACIL*`) | Reconhecer por texto é determinístico: aplicação = `APLIC.INVEST` (sempre débito); resgate = `RESGATE INVEST`/`RESG.AUTOM.INVEST` (sempre crédito). Nenhuma ambiguidade nas 35 |
| A leitura do PDF fecha sozinha: cadeia de saldos sem quebra e totais iguais ao impresso | Dá para **recusar** um PDF mal lido em vez de sugerir lixo |
| O banco **varre a conta corrente para R$ 1,00 todo dia com movimento** (23 de 24 dias fecharam em R$ 1,00; o 24º, 05/10, ainda não tinha sido varrido) | Mesmo SEM o PDF, o saldo do dia no sistema diz quanto falta: saldo do dia − R$ 1,00 = aplicação (ou resgate) que não foi registrada |
| O OFX traz só `RENTAB.INVEST` (centavos), nunca aplicação/resgate | Sem o PDF não há como saber as linhas; só o total do dia |
| O sistema já tem o mecanismo: `registrarTransferenciaDoExtrato` cria as duas pernas de uma vez (todas ou nenhuma), com marca `[ofx:FITID]` que a reimportação reconhece, e devolve um "Desfazer" | É a mesma coisa que o tesoureiro já faz à mão; só falta alimentá-la |
| O PDF traz o **saldo do Invest Fácil dia a dia** (a auditoria já compara com a Caixa de Aplicação) | Controle independente: se o saldo do banco ≠ saldo da conta de aplicação, falta (ou sobra) uma perna |

## 2. A proposta, em três camadas

### Camada A — o PDF entra na Mesa de Conciliação (sem migration)
1. A Mesa ganha um segundo campo: **"Extrato consolidado em PDF (opcional, recomendado)"**. Com ele, as linhas de aplicação e resgate aparecem como **cartões de Transferência já preenchidos**: "Bradesco → Caixa de Aplicação · R$ 5.936,77 · APLIC.INVEST lote 1067645", confiança 98% (faixa "identificadas"), com o botão **Confirmar** de sempre e **"Confirmar todas as do Invest Fácil (n)"** em lote.
2. **Marca própria de idempotência**: cada linha do PDF recebe uma chave estável (`PDF:data:lote:valor`) gravada na perna da corrente como `[ofx:PDF:…]`. Reimportar o mesmo PDF não duplica nada, e a auditoria passa a ligar linha ↔ transferência pela marca, sem adivinhar por valor e dia.
3. **Transferências já feitas à mão** (como as de 01–08/09) não geram sugestão nova: a Mesa reconhece o par pelo mesmo valor em até 5 dias entre as duas contas (`acharContrapartes`, que já existe) e oferece só **"vincular"** — carimba a chave do PDF no lançamento existente, sem criar nem apagar nada.
4. O PDF que não fechar a cadeia de saldos é **recusado com o motivo** (nunca se sugere a partir de leitura duvidosa).
5. **Rendimento** (`RENTAB.INVEST`) já vem no OFX e já é importado; segue como está.

### Camada B — o alerta imediato (sem migration)
- **Com PDF** (importação ou auditoria): faixa no topo — *"3 resgates e 2 aplicações do extrato ainda não têm transferência no sistema (R$ 12.410,33 em aplicações, R$ 34.861,54 em resgates)"*, com atalho para criá-las. A auditoria já sabe calcular isto; falta só destacar e linkar.
- **Sem PDF** — a **Conferência diária do R$ 1,00**: para cada dia já importado, se a conta corrente do sistema não fecha em R$ 1,00 (tolerância R$ 0,05), o Painel da Tesouraria avisa: *"Em 18/09 a Bradesco fechou em R$ 7.197,03: falta uma aplicação de R$ 7.196,03 (ou lançamentos do extrato do dia ainda não confirmados)"*. Só avalia dias até a última importação do OFX, para não alarmar por extrato ainda não trazido. É o que impede o esquecimento mesmo quando ninguém lembra de anexar o PDF.
- **Controle do saldo do Invest Fácil**: com o PDF, qualquer dia em que o saldo do banco difere da Caixa de Aplicação em mais de R$ 1,00 vira alerta (já está na auditoria; vira aviso na Mesa).

### Camada C — acabamento (migration pequena, depois)
- Coluna `fin_contas.aplicacao_vinculada_id`: a Bradesco "sabe" qual é a sua conta de aplicação (hoje a tela escolhe por nome, "Caixa de Aplicação"). Aditiva, sem tocar em dado.
- A perna da Aplicação nasce **conciliada** quando o saldo diário do Invest Fácil do PDF confere (hoje as pernas manuais ficam "realizado").
- Item no **checklist do fechamento mensal**: "Invest Fácil conciliado com o extrato consolidado".
- Opcional: sugestão **líquida do dia** quando só há OFX (uma transferência com o total do dia). Perde as linhas do banco, então só como último recurso e marcada como tal.

## 3. Decisões que preciso de você

| # | Decisão | Minha recomendação |
|---|---|---|
| 1 | Uma transferência **por linha do banco** ou **uma por dia (líquido)**? | Por linha: espelha o extrato, a Caixa de Aplicação passa a bater centavo a centavo com o saldo do Invest Fácil, e o líquido some detalhe que a auditoria usa |
| 2 | A perna da Aplicação nasce **conciliada** ou **realizada**? | Conciliada, quando o saldo do Invest Fácil do PDF confere naquele dia; realizada se não houver PDF |
| 3 | Onde mostrar o alerta? | Painel da Tesouraria + faixa na Mesa e na Auditoria; semanal por e-mail só se você quiser |
| 4 | Posso começar pela Camada A + B (sem migration)? | Sim; a C vem depois do uso real |

## 4. O que NÃO muda (garantias)
- Nada é gravado sem o clique do tesoureiro; em lote, é um clique que mostra a lista antes.
- Cada transferência cria **as duas pernas ou nenhuma**, e tem "Desfazer".
- Saldos de outras contas, previstos, recorrências e OFX existentes não são tocados.
- Se o PDF mudar de layout, a conferência de saldos reprova a leitura e a Mesa continua funcionando só com o OFX.

## 5. Esforço e ordem
1. Camada A (PDF na Mesa, cartões de transferência, chave de idempotência, vincular às manuais, lote) — a maior parte; reaproveita o parser e a auditoria já prontos.
2. Camada B (faixa de alerta + Conferência diária do R$ 1,00 no Painel).
3. Teste contra o extrato real de setembro/outubro: as 28 linhas sugeridas devem fechar a conta corrente em R$ 1,00 em 30/09 e R$ 7.388,75 em 05/10.
4. Camada C, se aprovada.

## 6. Riscos e como estão tratados
- **Linha lida errada** → cadeia de saldos + totais impressos reprovam o PDF antes de qualquer sugestão.
- **Duplicar uma transferência** → chave estável por linha + reconhecimento dos pares manuais.
- **Dia sem varredura** (feriado, falha do banco) → o alerta diário diz "fechou em X"; a tesouraria vê, não é erro do sistema. Por isso o alerta informa, não bloqueia.
- **Aplicação por PIX/QR automático** (`LIQUIDACAO QRCODE PIX APLIC…`): é o banco aplicando o saldo; entra como aplicação normal.
