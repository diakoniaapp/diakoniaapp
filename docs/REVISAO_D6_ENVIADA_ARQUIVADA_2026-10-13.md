# D6 — Enviada e Arquivada: revisão antes de aplicar (13/10/2026)

Nada foi aplicado. Arquivos: migration `supabase/migrations/20261013130000_fin_malote_enviada_arquivada.sql` · `docs/MALOTE_ENVIADA_ENSAIO.sql` · `docs/MALOTE_ENVIADA_APLICAR.sql` · `docs/MALOTE_ENVIADA_ROLLBACK.sql`.
Testado em Postgres real (esquema de teste): envio, bloqueio, reabertura, arquivamento, aplicar duas vezes e reverter; e a view comparada com a lib em 900 cenários com **os nove estados**, 0 divergências.

## O que cada decisão sua virou

| Decisão | Como ficou |
|---|---|
| **Envio por lote mensal** | `fin_enviar_malote(ano, mês, …)` registra o envio e captura **todas as despesas "Prontas para Malote" do mês naquele instante**; elas ficam **Enviadas**. Nunca despesa por despesa |
| **Meses antigos não nascem Enviados** | Hoje há **0 envios** → nenhuma despesa fica Enviada ou Arquivada ao aplicar. Só passa a existir a partir de um envio feito depois |
| **Arquivada** | Enviada **e** existe `fin_fechamentos_periodo` com status **aprovado** cobrindo o mês do envio (um período de 3 meses cobre os 3; "fechado" ainda **não** é aprovado) |
| **Bloqueio estreito** | Depois de Enviada **não se altera**: valor, data (vencimento), categoria, centro/subcentro, favorecido (fornecedor ou pessoa), o tipo; **nem se desfaz o pagamento, nem se exclui a despesa**; e o **documento principal** não é removido nem substituído |
| **Continua permitido** | conciliar tardiamente · vincular OFX/PDF · registrar conferência · acertar a data de pagamento (o OFX a ajusta) · anexar comprovante ou documento complementar · acrescentar observações · remover um comprovante complementar |
| **Reabrir** | só **Administrador e Tesouraria** (o banco confere); **motivo obrigatório** (≥ 5 caracteres); fica registrado **motivo, data/hora, usuário, estado anterior e estado novo** em `fin_reaberturas`. Despesa **Arquivada** não se reabre sem reabrir o período antes |
| **Nada regride sozinho** | depois de Enviada, se um comprovante for removido ou uma conciliação desfeita, o estado **continua Enviada** e o detalhe diz o que regularizar |
| **Rastro** | o item do envio **nunca é apagado**: ao reabrir é marcado (quando/quem/por quê). O próximo envio captura a despesa corrigida; o item antigo fica na história |

## Mensagens que a pessoa verá
- Alterar valor numa despesa enviada: *"Esta despesa já foi enviada à contabilidade (Malote 10/2026) e está congelada: não se altera valor. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)"* — a mensagem lista **todos** os campos tentados.
- Remover o documento principal: *"O documento desta despesa já foi enviado à contabilidade e não pode ser removido nem trocado. Anexe um documento complementar, ou peça a um Administrador ou à Tesouraria que reabra a despesa, com motivo."*

## Estrutura
- `fin_malote_itens` — um item por despesa enviada: envio, despesa, `obrigacao_id`, mês, e a **foto** do que foi enviado (valor, data, categoria, centro, favorecido). No máximo **um item ativo** por despesa.
- `fin_reaberturas` — o registro de cada reabertura.
- `fin_malote_envios.despesas` — quantas despesas o envio capturou.
- Ambas as tabelas novas são **somente leitura** para o aplicativo (RLS): quem escreve são as funções do banco.
- 3 gatilhos: um em `fin_lancamentos` para alterações dos campos congelados, um para a exclusão e um em `fin_lancamento_anexos` para o documento principal. **Só olham despesas com item ativo** — as demais não sentem nada.
- `vw_fin_ciclo` ganha os estados `enviada` e `arquivada` (e 4 colunas no fim). O aplicativo (`lib/cicloDaDespesa`) tem a mesma regra.

## O que muda nas telas
| Tela | Mudança |
|---|---|
| **Fechamento → "Envio à contabilidade"** | "Registrar envio" agora captura as Prontas do mês; a mensagem diz quantas ficaram Enviadas. Aparece **"Reabrir este envio…"** (só Administrador/Tesouraria). O bloco "Ciclo das despesas" mostra Enviadas/Arquivadas |
| **Detalhe da despesa** | passa a mostrar "Enviada no malote de MM/AAAA" (ou Arquivada), o botão **"Reabrir despesa…"** (Administrador/Tesouraria) e o **histórico de reaberturas** |
| **Cadeia de estados** | os 8 chips: Prevista → Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta → **Enviada** → **Arquivada** |
| **Antes da migration** | tudo continua funcionando como hoje (o registro de envio cai no caminho antigo) |

## Rótulos Conferir × Conciliar (já no código, sem migration)
- Botões de marcação manual do **Extrato**, da **tela da conta** e da **gaveta de Conciliação**: **"Conciliar N" → "Conferir N"**; avisos "conferido(s)".
- A gaveta passou a se chamar **"Conciliar e conferir"**, e o texto explica a diferença (conciliar = prova no banco; conferir = validação humana).
- O status `conciliado` (que cobre as duas coisas) aparece como **"Conferido / conciliado"** nos filtros e dicas. Quem distingue é o vínculo bancário (detalhe da despesa / `vw_fin_ciclo`).
- As telas do **OFX**, a **Mesa de Conciliação** e o **Fechamento** continuam dizendo "Conciliar": ali existe a prova no banco.

## Pontos para você saber antes de aplicar
1. **Enviar um mês antigo congela as Prontas dele.** Hoje há **585** despesas Prontas, quase todas histórico. Se você registrar o envio de agosto, as Prontas de agosto ficam Enviadas e congeladas — **só as Prontas**; as demais continuam abertas e podem ser enviadas depois. Faça isso mês a mês, conscientemente.
2. **Conta, tipo e o valor da data de pagamento:** no bloqueio entram o **tipo** (despesa não vira receita) mas **não** a conta nem a data de pagamento (o OFX precisa acertá-la). Se preferir congelar a conta também, é uma linha.
3. **Reabrir uma despesa não reabre o mês.** Se o período estiver aprovado (Arquivada), primeiro se reabre o período (como já existia).
4. **Risco: Médio** — os gatilhos barram gravações; por isso só atuam em despesas Enviadas. **Reversível:** o rollback remove gatilhos e funções e **mantém** as tabelas (o histórico dos envios não se perde); atenção: sem os gatilhos, as já Enviadas deixam de ser congeladas.

## Resultado esperado do ensaio (no seu banco, desfeito no fim)
> **TUDO OK, pode aplicar:** ANTES: ~15.661 lançamentos; ~5.772 saídas na vw_fin_ciclo; 0 envios. Sem nenhum envio, vw_fin_ciclo devolve exatamente o mesmo resultado e nenhum lançamento mudou. ENVIO DE TESTE MM/AAAA: N despesas Prontas no mês → N capturadas → N aparecem Enviadas na view. O valor da despesa enviada foi BLOQUEADO. Acrescentar observação continuou permitido. Com o período aprovado, todas ficaram ARQUIVADAS. A reabertura deixou o rastro (estado anterior "enviada" → novo "pronta_para_malote").

(O ensaio escolhe o mês com mais Prontas, faz o envio de teste com um administrador real e **desfaz tudo** no fim.)
