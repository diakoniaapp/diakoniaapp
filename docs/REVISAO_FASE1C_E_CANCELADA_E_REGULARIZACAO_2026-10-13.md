# Fase 1C-e — Cancelada, "Não localizado" na NF, aviso na tela Pagar e ferramentas de regularização (para revisão, NADA aplicado)

> Regra mantida: **sem prova suficiente → A esclarecer.** **Nenhuma decisão foi tomada** sobre as entradas 1, 2, 4, 7 e 8, nem sobre Del Castilho e Accor. Esta entrega traz **ferramentas**; nenhum caso real é regularizado.

## O que entra

| Item | Como funciona |
|---|---|
| **Cancelada** (desfecho próprio) | Novo tipo de anexo **Prova de cancelamento**. `fin_cancelar_obrigacao` só cancela despesa **em aberto**, **sem quitação** (quem quer cancelar uma nota já extinta por oferta remove a quitação antes, com motivo — "cancelada não é quitada"), **sem pagamento**, **não enviada** e **com a prova anexada**. Sem prova: a nota continua A esclarecer. Fica no histórico (usuário, data, hora) e dá para desfazer (`fin_desfazer_cancelamento`, com motivo). Usa o status `cancelado` que já existia — não nasce status novo. `vw_fin_canceladas` lista as canceladas formalmente. Tela: botão "Nota cancelada com o emitente…" no cartão Quitação |
| **"Não sei quem pagou" na NF** | O diálogo "Registrar NF já quitada por terceiro" passa a aceitar essa opção: a nota entra **em aberto, na fila Investigar**, sem presumir nada (as 13 NFs sem rastro entram assim, quando você mandar) |
| **Aviso na tela Pagar** | Se a descrição da conta fala em **reembolso** e não há quitação registrada, o diálogo "Confirmar pagamento" mostra o alerta: "confirme se um terceiro já pagou antes de pagar o fornecedor". **Só avisa; não bloqueia nada.** Vale para as 3 contas em aberto de reembolso |
| **Ferramenta: candidatas** | `vw_fin_oferta_de_nf_candidatas` **só lê**: cada entrada "Oferta de NF" com as saídas candidatas e as pernas da transferência, todas marcadas **A esclarecer** |
| **Ferramenta: regularizar um caso** | `fin_regularizar_oferta_de_nf` (**só Administrador**, tudo ou nada): guarda os 4 lançamentos na tabela de backup, remove a entrada e as duas pernas da transferência, devolve a saída a obrigação em aberto e registra a quitação de **oferta**. **Recusa** (e manda regularizar à mão) se não achar exatamente 1 perna de cada lado, se houver vínculo com extrato bancário, período fechado, envio ao malote ou quitação existente. Exige motivo com a referência dos documentos validados |

## Impacto esperado
- **Nenhum dado existente muda; nenhum caso real é regularizado.** As funções só agem quando alguém as chamar.
- Quando você validar os documentos e o Administrador regularizar um caso: o **saldo de cada conta fica idêntico** (a entrada e a transferência se anulam na origem; a transferência e a saída se anulam no destino), as **ofertas deixam de ser receita** e a despesa passa a ter a oferta como origem. **Isso altera o resultado de meses passados** — por isso só depois da validação do escritório (hoje: 0 fechamentos e 0 envios, então tecnicamente é possível).

## Resultado do ensaio (banco de teste local): TUDO OK
- Nada existente mudou; a visão de candidatas e o backup nascem vazios/de leitura.
- **E1** sem prova não cancela; com prova cancela, fica no histórico e em `vw_fin_canceladas`; desfazer reabre. **E2** nota com quitação não se cancela. **E3** caso **sintético** de "Oferta de NF": a visão o enxerga com as duas pernas como A esclarecer; a regularização deixa o **saldo de TODAS as contas idêntico ao de antes de o caso existir**, remove a entrada e as pernas (nenhuma entrada fica), guarda os 4 lançamentos no backup e registra a quitação (situação "previsto": **a prova não foi presumida**).
- APLICAR duas vezes, ROLLBACK e reaplicar: ok. Tipos limpos; suíte de testes: 1.290 passam (a única falha, `navConfig.test.ts` "/financas/reunioes", já existia antes e é de outro assunto).

## Rollback (`docs/QUITACAO_1C_E_ROLLBACK.sql`)
Remove as 3 funções e as 2 visões; mantém a tabela de backup se tiver linhas. O tipo de anexo e os eventos novos continuam aceitos (histórico só acrescenta). Notas já canceladas continuam canceladas.

## Fica de fora, de propósito
- **O carregador das 17 NFs** (script que registraria uma linha por NF): não foi gerado. Depende de você confirmar Del Castilho e Accor pelos documentos e de decidir o destino de cada grupo.
- **As 3 despesas de reembolso em aberto** continuam intocadas (apenas ganham o aviso na tela Pagar).
- **Cancelada como `resultado` em `vw_fin_ciclo`**: a visão do ciclo já mostra o estado "Cancelada" para o status `cancelado`; não mexi nela para não ampliar o risco. Se quiser a coluna `resultado = 'cancelada'` ali, é um ajuste pequeno e separado.
