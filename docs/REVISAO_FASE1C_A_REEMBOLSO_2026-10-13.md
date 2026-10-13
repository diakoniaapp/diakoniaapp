# Fase 1C-a — Pagar o reembolso (para revisão, NÃO aplicada)

> **Nada foi aplicado em produção.** Este documento traz o que você pediu antes de qualquer migration: **desenho técnico, impacto esperado, resultado do ensaio e estratégia de rollback**.
> Pré-requisitos da aplicação: 1A, M0 e 1B já aplicadas (a sua ordem: `QUITACAO_APLICAR.sql` → `QUITACAO_1B_M0_APLICAR.sql` → ensaio da 1B → aplicar a 1B). O ensaio **em produção** desta entrega só pode ser rodado depois disso; o resultado abaixo é do **ensaio no banco de teste local**, com a cadeia completa 1A → M0 → 1B → 1C-a.

## 1. O problema que esta entrega resolve

A 1A deixou o reembolso **aprovado** numa fila ("Reembolso a pagar"), mas a única forma de pagá-lo era a liquidação comum, que a guarda da 1A **recusa de propósito** (senão o fornecedor seria pago de novo). Faltava o caminho legítimo: pagar **à pessoa que pagou a nota**, parcial ou total, sem inventar nada.

O princípio se mantém: **Quem quitou? e Qual a intenção?** são os dois fatos. O pagamento do reembolso **não é um terceiro fato**: é a *consequência* de "Pessoa + Reembolso + aprovado". Por isso **não há coluna nova**.

## 2. Desenho técnico

| Peça | O que é | O que **não** faz |
|---|---|---|
| `fin_liquidar_reembolso(quitação, conta, data, forma, valor, comprovante, FITID, observação)` | Casca em volta de `fin_liquidar`. Confere: reembolso · aprovação **vigente** · prova suficiente · valor ≤ saldo a reembolsar · data não futura · papel do financeiro. Liga `qibrj.reembolso` (a única variável que a guarda da 1A aceita) e chama `fin_liquidar` | Não cria entrada, transferência nem saída fictícia. Não grava nada em `fin_liquidacoes` além do que a liquidação comum já grava. Não tem juros, multa, desconto nem complemento (reembolso é o que a pessoa pagou) |
| `vw_fin_quitacao` (atualizada) | Olha a **obrigação inteira**: "paga" = raiz paga **e** nenhuma parcela `previsto`. Colunas novas **só no fim**: `reembolsado` e `saldo_a_reembolsar` (só para intenção Reembolso) | Não altera nenhuma coluna existente nem o resultado de nenhuma quitação existente |
| Histórico | Evento `reembolso_pago` (quem, quanto, conta, liquidação, saldo depois) | — |
| Telas | Botão **Pagar** na fila "Reembolso a pagar" (Mesa) e **Pagar reembolso** no cartão da despesa; diálogo `PagarReembolsoDialog` | Não paga sem aprovação; não oferece o Pix do fornecedor (o Pix e o QR são **de quem recebe**) |

**Quem recebe é derivado**, não digitado: é o responsável da quitação. A ligação "esta liquidação reembolsou aquela quitação" também se deduz: a liquidação paga o lançamento da obrigação, e a guarda da 1A impede qualquer outra via.

**Correção que veio junto (achado do desenho):** num pagamento parcial a `fin_liquidar` marca a **raiz** como realizada e cria uma parcela `previsto` com o saldo. A visão da 1A olhava só a raiz e diria "Reembolsada" cedo demais. Agora o resultado "Reembolsada" só aparece quando o saldo zera. O ensaio prova isso (R5).

## 3. Impacto esperado

| Item | Impacto |
|---|---|
| Dados existentes | **Nenhum** lançamento, saldo, quitação ou liquidação muda (o ensaio compara por hash antes e depois) |
| `vw_fin_ciclo`, `vw_fin_obrigacoes` | Resultado **idêntico** para tudo que já existe (hash) |
| Hoje em produção | Não há nenhuma quitação (a 1A ainda nem foi aplicada); o efeito imediato é **zero**. A função só passa a ter uso quando existir um reembolso **aprovado** |
| Os 3 reembolsos em aberto (NF 106, NF 10998, Leandro) | **Intocados.** Continuam como estão até alguém confirmar quem pagou. Nada é convertido |
| Segurança | Função `SECURITY DEFINER` com papel conferido (admin/diakonia/secretaria/tesouraria) e `GRANT` só a `authenticated`. A aprovação continua sendo **de outra pessoa** (ninguém aprova o próprio reembolso) |
| Contabilidade | Ao pagar, o reembolso é uma **saída real** da conta escolhida (mesmo lançamento da despesa, `realizado`), uma única vez |

## 4. Resultado do ensaio (banco de teste local, cadeia completa)

`docs/QUITACAO_1C_A_ENSAIO.sql` → **TUDO OK, pode aplicar**:

- Antes/depois da migration: lançamentos, ciclo, obrigações e quitações **idênticos**.
- **R1** reembolso não aprovado não se paga · **R2** aprovado: dívida com o terceiro, falta 600,00 · **R3** a liquidação comum segue recusada · **R4** valor acima do saldo é recusado · **R5** parcial de 200,00: falta 400,00 na fila e **não** vira "Reembolsada" · **R6** pagar o resto conclui: Reembolsada, fila vazia, credor nenhum · **R7** pagar de novo é recusado · **R8** 2 pagamentos no histórico, com usuário e conta · **R9** quitação que não é reembolso não se paga por aqui.
- **Garantias:** o saldo da conta caiu **exatamente 600,00** (uma saída); nenhuma entrada, transferência ou vínculo bancário nasceu; 2 liquidações criadas (as duas parcelas).
- `APLICAR` roda **duas vezes** sem erro; depois de aplicar, as visões seguem idênticas; `ROLLBACK` roda sem erro; reaplicar funciona.
- Verificação de tipos (`tsc -p tsconfig.app.json`) limpa; 16 testes do cartão da Quitação passam (3 novos).

## 5. Estratégia de rollback

`docs/QUITACAO_1C_A_ROLLBACK.sql`:
1. devolve a regra da 1A em `vw_fin_quitacao` (olha só a raiz). As duas colunas novas **permanecem** na visão (o PostgreSQL não deixa tirar coluna de visão com dependentes) e passam a ser só informativas;
2. remove `fin_liquidar_reembolso`;
3. o evento `reembolso_pago` continua aceito no histórico (o histórico só acrescenta).

Reembolsos **já pagos** continuam pagos (são liquidações comuns com o saldo das contas refletido). Um reembolso que tenha ficado **parcial** só se conclui reativando a 1C-a. Como a função só tem uso depois de uma aprovação, o rollback logo após a aplicação não deixa resíduo.

## 6. O que fica para depois (e por quê)

- **Conciliação do OFX por beneficiário**: a linha do banco traz o **nome da pessoa**, e o lançamento carrega o **fornecedor**. O casamento por valor e data funciona hoje; o ajuste por nome entra quando houver o primeiro reembolso real para medir (decisão: não otimizar às cegas).
- **Malote em duas etapas** e **pacote contábil**: é a **1C-b**, que vem a seguir.

## 7. O que preciso de você

Nada para aplicar agora: a 1C-a só pode ser ensaiada em produção **depois** de você aplicar 1A + M0 + 1B. Quando disser "feito" nos dois primeiros, rodo o ensaio da 1B; depois da sua revisão e aplicação da 1B, rodo o ensaio da 1C-a e lhe devolvo o resultado **antes de qualquer aplicação**.
