# Revisão da Fase 1B: a Oferta, a quitação por terceiro e "registrar NF já quitada" (para a sua revisão, antes de qualquer aplicação)

> **Nada da 1B foi aplicado no banco.** As migrations estão no repositório como **PREPARADAS** e o aplicativo funciona antes e depois delas. A 1B **depende da 1A**, que você aprovou e ainda vai aplicar.
>
> Segue: Especificação v2, Adendo, Proposta da Fase 1, Revisão da 1A e as suas decisões de 13/10: aprovar o status `quitado_terceiro`; **quem registra pode aprovar, mas com auditoria completa (usuário, data e hora)**; as 17 NFs exigem o fluxo "registrar NF já quitada por terceiro"; ajustar a `vw_fin_obrigacoes`.

## 0. O resultado do ensaio da 1A em produção (a condição que você pôs)

Rodei o `QUITACAO_ENSAIO.sql` **em produção**, com o token que você colou, e ele terminou com **TUDO OK, pode aplicar**. Conferi depois, por leitura, que **nada ficou criado** (tabela, visão, colunas e funções: zero) e que os lançamentos continuam **13.932**.

| Verificação (dados reais) | Resultado |
|---|---|
| Lançamentos antes e depois das 3 migrations | 13.932, **idênticos** (hash de todos) |
| `vw_fin_ciclo` | 4.037 saídas, **idênticas** em estado, atraso e conferência |
| Tempo de ler a `vw_fin_ciclo` inteira | **0,25 s antes, 0,06 s depois** |
| Saldos das 6 contas | **idênticos** em todo o ensaio |
| Entradas (8.356) e vínculos bancários (382) | **inalterados**; nenhuma entrada, transferência ou saída criada |
| 15 casos (T1 a T15) | **todos OK** |

Segundo a sua regra ("se o ensaio reproduzir o comportamento esperado sem alterar dados, considero a 1A aprovada para aplicação"), ela está pronta: **`docs/QUITACAO_APLICAR.sql` já está na sua área de transferência**. Eu não a apliquei: a aplicação é sua.

## 1. Ordem de aplicação

| # | Arquivo | O que é |
|---|---|---|
| 1 | `docs/QUITACAO_APLICAR.sql` | A **1A** (já aprovada, ensaio em produção OK) |
| 2 | `docs/QUITACAO_1B_M0_APLICAR.sql` | **Sozinho.** Só acrescenta o valor `quitado_terceiro` ao enum. Inofensivo: nada usa o valor ainda. Precisa ser separado porque um valor novo de enum **não pode ser usado na mesma transação em que nasce** |
| 3 | `docs/QUITACAO_1B_ENSAIO.sql` | O ensaio da 1B em produção (desfaz tudo no fim; só roda depois de 1 e 2) |
| 4 | `docs/QUITACAO_1B_APLICAR.sql` | A **1B**, depois do seu "pode aplicar" |

## 2. O que a 1B faz

**A regra (Política, seção 6):** NF no CNPJ da igreja + responsável Pessoa, Empresa ou Entidade + intenção **Oferta** + prova **suficiente** pela Matriz ⇒ a obrigação **se extingue**: o status do lançamento vira `quitado_terceiro`. **Sem lançamento novo, sem conta, sem saldo, sem liquidação, sem vínculo bancário.**

| Peça | O que faz |
|---|---|
| **`fin_quitacao_sincronizar`** | Põe e tira o status `quitado_terceiro` conforme a Matriz diz que a prova basta. **Ninguém "marca" a extinção:** o sistema a deduz. Não toca despesa Enviada |
| **Quando roda sozinho** | Ao registrar, alterar, remover ou decidir a quitação; ao **anexar ou remover** a declaração, a prova do pagamento ou a nota (gatilho nos anexos); ao **alterar um parâmetro**; e ao **abrir a Mesa** (porque "formalização vencida" é um fato do tempo) |
| **Guarda de integridade** | `quitado_terceiro` só entra e sai pelo sincronizador. **Nunca vira `realizado` ou `conciliado`**, e não nasce por `INSERT`. É isso que impede o botão "Conferir" de pôr a oferta no saldo |
| **Conferir** | No app, `conciliarLancamento` passou a **só carimbar** quem conferiu e quando quando a obrigação é `quitado_terceiro` (o status não troca) |
| **Congelamento D6** | `quitado_terceiro` conta como "situação paga": uma oferta **enviada** ao malote não regride; alterar a quitação dela exige reabertura |
| **`fin_registrar_nf_quitada_por_terceiro`** | Cria a **NF e a quitação na mesma operação** (ou nada nasce). É o caminho das 17 NFs. Recusa nota duplicada (mesmo fornecedor, número e valor) |
| **`vw_fin_obrigacoes`** | Ganha a situação `quitada_por_terceiro`; o saldo pendente desconta o que o terceiro pagou. **Sem isso a oferta apareceria "em aberto"** |
| **`vw_fin_ciclo`** | `quitado_terceiro` conta como paga, **não espera extrato**, nasce em "Pagamento realizado" (rótulo "Quitada por terceiro"), vai a **Conferida** e a **Pronta** com nota + classificação + conferência (**o comprovante da igreja não se aplica**) |
| **Histórico** | Dois eventos novos, `extinta_por_oferta` e `extincao_desfeita`, cada um com **usuário, data e hora** |
| **`vw_fin_quitacao_dessincronizadas`** | A rede de segurança: o que está com status diferente do que a Matriz manda |

### Telas
- **Cartão "Quem pagou"**: mostra "Quitada por terceiro", o aviso de que **nenhum saldo mudou**, o botão **Conferir** (e "Desmarcar conferência"), e agora **quem registrou, quem decidiu e quando, com data e hora**. Corrigir e Remover seguem valendo enquanto a despesa não foi enviada.
- **Diálogo "Quem pagou"**: a **Oferta** passa a ser liberada (assim que o status existe no banco), com os campos **condição/destinação restrita** e **pede recibo com efeito fiscal** (que elevam o risco). Compensação de adiantamento segue desabilitada.
- **Mesa, "NF já quitada por terceiro"**: novo diálogo para a nota que o aplicativo não tinha (fornecedor, nº, chave, data, valor, conta, categoria e centro opcionais, mais quem pagou e a intenção).
- **Mesa, "Quitações a resolver"**: ao abrir, realinha as ofertas (formalização vencida).
- **Chips** "Quitado por terceiro" no extrato e na conta; o formulário de lançamento **nunca oferece** esse status.
- **Fila de saneamento cadastral** (já no ar): 42 empresas sem CNPJ válido.

## 3. Impacto esperado em produção

| Pergunta | Resposta |
|---|---|
| Algum lançamento existente muda? | **Não.** O ensaio compara o hash de todos antes e depois |
| `vw_fin_ciclo` e `vw_fin_obrigacoes` mudam para o que já existe? | **Não.** O ensaio compara estado, atraso, conferência, situação, saldo e total pago de cada uma |
| Algum saldo muda? | **Não**, em nenhum momento (o ensaio compara o saldo de todas as contas no fim) |
| Alguém é bloqueado? | **Não.** A vigência segue desligada |
| Alguma obrigação vira "quitada por terceiro" sozinha? | **Não.** Só quem tem quitação de oferta registrada e prova suficiente. Hoje não há nenhuma |
| O status novo vaza para outros relatórios? | Os de **caixa** (saldo, extrato, previsão) o ignoram sozinhos. Os de **despesa por competência** (DRE, orçamento, centros) ainda não o contam: é a **1C**, e por ora só existiria oferta pós-aplicação |
| Gatilho fiscal | Conferi o código real em produção: `fiscal_sincronizar_pagamento_trigger` só age em `status = 'realizado'`. O novo status **não** marca obrigação fiscal como paga |
| Período fechado | `fin_bloqueia_lancamento_fechado` impede mudar lançamento de período fechado; se o sincronismo bater nele, **o anexo é gravado mesmo assim** (aviso) e a obrigação aparece na rede de segurança |

## 4. O que o ensaio local provou (Postgres 18, com os arquivos reais)

| Caso | Resultado |
|---|---|
| **O1** oferta de risco baixo, Relatada ⇒ extingue; saldo idêntico; ficou o evento com usuário e hora | ✔ |
| **O1b** `vw_fin_obrigacoes`: quitada por terceiro, saldo pendente 0, nada pago pela igreja | ✔ |
| **O1c** ciclo: "Pagamento realizado" = Quitada por terceiro, sem esperar extrato | ✔ |
| **O2** conferir só carimba ⇒ **Pronta**; o status continua `quitado_terceiro` | ✔ |
| **O3/O4/O5** conciliar a oferta, trocar o status à mão e nascer já quitado: **recusados** | ✔ |
| **O6** oferta de risco médio (destinação restrita) só relatada **não** extingue; o Administrador aprovando o Relatado a extingue | ✔ |
| **O7** terceiro no circuito ⇒ risco alto ⇒ só a prova Formal basta; **anexar extingue sozinho; remover desfaz**, com evento | ✔ |
| **O8** mudar para reembolso desfaz a extinção; **voltar a oferta com a intenção mudada há pouco é risco Médio e pede o Administrador** | ✔ |
| **O9** a quitada, Pronta, entra no malote e fica **Enviada**; alterar a quitação e o valor: **recusados**; reabrir: volta a Pronta, com rastro | ✔ |
| **O10** remover a quitação de despesa enviada exige reabertura; removida, a obrigação volta a "em aberto" com o saldo cheio | ✔ |
| **O11** a nota e a quitação **nascem juntas**; sem nota anexada a oferta relatada não extingue; com nota, prova e declaração, extingue; **a mesma nota não se registra duas vezes**; quitação inválida ⇒ **a nota não nasce** (tudo ou nada) | ✔ |
| **O12** sincronismo geral, rede de segurança vazia, parâmetro novo sincroniza | ✔ |
| **Garantias** | nenhuma entrada, transferência ou vínculo criado; saldo de todas as contas idêntico |
| `vw_fin_ciclo` do banco × ciclo da biblioteca TypeScript | ✔ 32 combinações de despesa quitada por terceiro, **0 divergências** |
| APLICAR duas vezes; ROLLBACK; APLICAR de novo | ✔ |

**Testes do aplicativo:** 1.278 passam (14 do cartão, 6 do ciclo da oferta). **1 falha** em `navConfig.test.ts`, **anterior** a estas entregas (confirmado no código limpo). `tsc` sem erros; `vite build` ok.

**Duas coisas que o ensaio ensinou e que você precisa saber:**
1. **Mudar de ideia custa confiança.** Uma intenção alterada há menos de 30 dias eleva o risco da relação para Médio (a regra aprovada). Então "era oferta, virou reembolso, voltou a oferta" **não extingue sozinha**: pede o Administrador. É o desenho, mas surpreende.
2. **O tempo mexe na prova.** Uma oferta aceita como Relatado deixa de bastar quando o prazo de formalização (30 dias) vence: sobe um nível e a extinção é desfeita até o documento chegar. O realinhamento acontece **quando alguém abre a Mesa** (ou altera algo). Não há tarefa agendada: se você quiser, eu proponho um agendamento no banco.

## 5. Rollback

`docs/QUITACAO_1B_ROLLBACK.sql`: devolve a **`previsto`** toda obrigação que estava quitada por terceiro (as já **enviadas** exigem reabertura antes: o script avisa e para), remove gatilhos e funções novos, **devolve as funções da 1A, o congelamento do D6, a `vw_fin_ciclo` da 1A e a `vw_fin_obrigacoes` anterior**. Mantém quitações e histórico.
**Uma limitação do PostgreSQL:** o valor `quitado_terceiro` **não se remove** do enum. Fica sem uso e sem efeito.

## 6. Decisões que tomei e que você pode querer mudar

| # | O que decidi | Por quê |
|---|---|---|
| 1 | A obrigação extinta por oferta **dispensa o comprovante** para ficar Pronta | A igreja não pagou: não há comprovante dela. A prova está na quitação, e o grau Relatado aparece como selo |
| 2 | A Pronta exige **nota fiscal anexada** (documento original) | Sem a nota, o escritório não tem o que lançar. A declaração e a prova do terceiro **não** a substituem |
| 3 | O realinhamento do tempo é **ao abrir a Mesa** | Sem agendamento. Alternativa: tarefa no banco |
| 4 | Registrar NF já quitada **exige escolher uma conta** | `conta_id` é obrigatório no lançamento. A oferta não mexe nela; o diálogo explica |
| 5 | A nota registrada ganha `origem = 'nf_quitada_por_terceiro'` | Para você encontrar depois, na regularização |
| 6 | Nota sem anexo ⇒ lastro **Alto** ⇒ oferta só com prova **Formal** | Padrão conservador que você aprovou |
| 7 | **Quem registra pode aprovar** (só o favorecido não) | Decisão sua de hoje; o histórico guarda usuário, data e hora de cada ato |

## 7. O que ainda falta (1C)

Pagamento do **reembolso** (a liquidação com a pessoa como beneficiária), **bloqueios** de fechamento e malote (atrás da vigência), as duas etapas do malote (aviso na competência, comprovante no pagamento), os **consumidores de despesa** (DRE, orçamento, centros, prestação de contas) e a **regularização do histórico** (as 8 entradas "Oferta de NF", as 17 NFs e as 3 solicitações de reembolso).
