# Matriz de exigências documentais da Tesouraria — 28/10/2026

Regra única: `src/lib/documentacaoExigida.ts` (`documentacaoDaSaida`). Mesa, Auditoria, Prontidão do malote, Fechamento, Ciclo da despesa, Extrato de Obrigações e o ZIP contábil leem dela — mudar a regra aqui muda todos.

## O que a auditoria achou

1. **Reembolso exigia PIX sempre.** O modelo "reembolso" tinha o "Comprovante do PIX da igreja" fixo, mesmo quando a Caixinha pagou em espécie. É o caso **Giovanelli (R$ 767,10)** da Mesa.
2. **Caixinha já dispensava o comprovante, mas a NF só valia onde a categoria aceitava NF.** Uma despesa de Caixinha em categoria que pede Guia/Apólice/Boleto ficava pendente mesmo com a Nota Fiscal.
3. **A marca `[ofx:…]` nas observações (conciliação anterior aos vínculos) não contava como confirmação bancária.** Débito automático conciliado do jeito antigo aparecia como "Falta Confirmação bancária" mesmo com a linha do banco ligada.
4. **Cartão em conta de banco (`cartao_debito`/`cartao_credito`)** pedia comprovante de banco que não existe.
5. **O caso Light (R$ 321,37)** é pendência **legítima**: débito automático, conta Bradesco, sem vínculo, sem marca e sem liquidação com FITID. Some quando a linha do OFX/PDF for ligada.

## A matriz (o que a regra faz hoje)

O **meio de pagamento** vem, nesta ordem: tipo da conta (Caixinha/Envelopes = espécie) → forma de liquidação (débito automático, PIX recorrente, transferência programada) → forma de pagamento do lançamento.

| Situação | Documento obrigatório | Documento opcional | Quando a pendência é removida |
|---|---|---|---|
| **Espécie / Caixinha** (conta caixa/envelope, ou forma = dinheiro) | Nota Fiscal (vale para qualquer categoria) | Comprovante, recibo | Ao anexar a Nota Fiscal. Nunca exige comprovante bancário |
| **PIX** (conta de banco, paga) | Documento de origem da categoria (NF, Fatura, Guia, RPA, RSP, DPS…) + Comprovante de pagamento | Confirmação OFX/PDF | Ao anexar origem **e** comprovante |
| **TED / transferência** | Igual ao PIX | Idem | Idem |
| **Boleto / guia / fatura** (conta de banco, paga) | Origem da categoria (o boleto/guia pode ser a origem) + Comprovante | Idem | Idem |
| **Débito automático** (também PIX recorrente e transferência programada) | Fatura/origem + **Confirmação bancária** (vínculo OFX/PDF, liquidação com FITID ou marca `[ofx:…]`) | Comprovante anexado à mão (também vale) | Ao ligar a linha do banco. O comprovante **não** é exigido |
| **Cartão** (conta cartão, ou forma cartão débito/crédito) | Nota Fiscal / origem da categoria | Fatura do cartão | Ao anexar a origem. Nunca exige comprovante |
| **Reembolso em espécie** (pago pela Caixinha, ou forma = dinheiro) | Nota Fiscal + Declaração do Terceiro | Recibo de Reembolso | Ao anexar NF e Declaração. **Não** pede PIX nem TED |
| **Reembolso por PIX** | Nota Fiscal + Declaração + Comprovante do PIX da igreja | Recibo | Ao anexar o comprovante do PIX (aviso "ainda não pago" até o pagamento) |
| **Reembolso por TED** | Nota Fiscal + Declaração + Comprovante da TED da igreja | Recibo | Ao anexar o comprovante da TED |
| **Reembolso, conta de banco sem forma informada** | Como PIX (comportamento de antes) | — | Idem PIX |
| **Compra ofertada por terceiro** | Nota Fiscal + Declaração do Terceiro | — | Ao anexar os dois. Nunca exige comprovante da igreja |
| **Obrigação ainda não paga** | Só o documento de origem | — | Ao anexar a origem. Comprovante só existe depois de pagar |
| **Tarifas, IOF, juros, rendimentos, investimentos, Invest Fácil, capitalização** | Nenhum (dispensa) | O que houver | Não há pendência |

Pendências **administrativas** (🔵: categoria, centro de custo, nº do documento, conferência do pagamento) continuam como antes: não rebaixam a documentação.

## Decisões minhas a confirmar

- **"Conciliado" sem vínculo** (histórico do Omie) em débito automático **continua pedindo a confirmação**: o histórico não passou por extrato. Se quiser aceitar, é uma linha.
- **Caixa de Envelopes** foi tratada como espécie (já não exigia comprovante).
- **Cartão em conta de banco** não exige comprovante; se a contabilidade quiser a fatura do cartão como obrigatória, é um documento a acrescentar.

## Como achar o que está indevidamente na Mesa (somente leitura)

Rodar `docs/CONSULTA_MESA_PENDENCIAS_INDEVIDAS_2026-10-28.sql` no SQL Editor. Ela lista, só leitura, os três grupos que a regra antiga mostrava a mais: reembolso pago/previsto pela Caixinha, despesa de Caixinha com Nota Fiscal e débito automático com marca `[ofx:…]`.

## Reembolso: um documento só (Solicitação e Recibo) — 28/10/2026

A Declaração do Terceiro **do reembolso** passou a se chamar **SOLICITAÇÃO E RECIBO DE REEMBOLSO** (a da oferta continua "Declaração do Terceiro"). O PDF (A4, duas vias A5) agora traz:

- os dados da compra, com "Pago ao fornecedor por/em" (para não se confundir com o pagamento do reembolso);
- o bloco **RECIBO DE REEMBOLSO**: "Declaro que recebi da Quarta Igreja Batista do Rio de Janeiro o valor de R$ … referente ao reembolso", forma (Espécie/PIX/Transferência/Outro) e "Valor recebido" à mão;
- no pé: **"Pago em ___/___/___"** e **"Assinatura do recebedor"**.

Fluxo: gerar → imprimir na hora do pagamento → a igreja paga, o recebedor preenche e assina → anexar a via assinada. Em **espécie** essa via é o comprovante: a Mesa não pede PIX, TED nem comprovante de banco. Em PIX/TED o comprovante do banco continua. O botão do diálogo "Pagar reembolso" passa a baixar esse mesmo documento (o "Recibo avulso" só aparece quando a Declaração ainda não foi gerada).

Não incluí "Data da solicitação": o PDF pode ser baixado de novo depois, e a data mudaria. Se quiser, guardo a data de geração da via no banco.

## Conciliação bancária = pagamento comprovado (28/10/2026, caso Verisure)

Em conta de **banco**, quando há a **linha do extrato ligada** ao lançamento — vínculo ativo com o OFX/PDF, liquidação com FITID, ou a marca `[ofx:…]` das conciliações antigas —, o comprovante de pagamento **não é mais exigido**, em **qualquer** meio (PIX, TED, boleto, débito automático, cobrança automática). A confirmação do banco ocupa o lugar dele ("Confirmação bancária (OFX ou PDF)", já atendida). Vale também para reembolso por PIX/TED depois de pago.

- Sem a linha do banco ligada, o comprovante continua exigido (exceto débito automático, que exige a confirmação).
- A confirmação **não** substitui o documento de origem: sem a Nota/Fatura/Guia, a despesa segue pendente.
- Reembolso ainda **não pago** nunca é dado como confirmado.
- Lista do que muda: `docs/CONSULTA_PENDENTES_SO_POR_COMPROVANTE_COM_CONCILIACAO_2026-10-28.sql`.
