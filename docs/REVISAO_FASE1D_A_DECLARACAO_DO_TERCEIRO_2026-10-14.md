# Fase 1D-a — Declaração do Terceiro gerada pelo sistema (para revisão, NADA aplicado)

> Entrega **1D-a: dados e documento**. **Não muda nenhum comportamento da Matriz**: nível, suficiência, fila e resultado continuam saindo das mesmas regras. A Matriz escalonada do reembolso e a alçada por nível são a **1D-b**. Nada foi aplicado em produção.
> Migration: `supabase/migrations/20261015150000_fin_declaracao_do_terceiro.sql` · Ensaio: `docs/QUITACAO_1D_A_ENSAIO.sql` · Aplicar: `docs/QUITACAO_1D_A_APLICAR.sql` (com trava de pré-requisitos) · Rollback: `docs/QUITACAO_1D_A_ROLLBACK.sql`.

## 1. O que a migration faz (revisão técnica)

| Peça | O que é | Observação |
|---|---|---|
| `fin_quitacoes.forma_pagamento_terceiro` | Fato novo: dinheiro, pix, cartao_credito, cartao_debito, transferencia, outro | **Nulo** em quem já existe e em "Não localizado" (restrição de coerência). A **obrigatoriedade no registro é da 1D-b** (a tela já pede) |
| Regra "intenção declarada ⇔ data da declaração" | **Relaxada**: a data pode faltar até a via assinada chegar | As funções de registro **ainda a pedem** (comportamento igual); a 1D-b deixa de pedir |
| `fin_quitacao_parametros` | `reembolso_teto_baixo` (300,00) e `reembolso_teto_medio` (1.500,00), com Baixo ≤ Médio garantido pelo banco | **Ainda não usados** pela Matriz (1D-b). Alteráveis só pelo Administrador, com histórico |
| `fin_declaracoes_terceiro` | Cada via gerada: número `DT-AAAA-NNNN` (o mesmo em todas as versões), versão, conteúdo, código (SHA-256) e a via assinada | **Só acrescenta**: o conteúdo não se altera e a linha não se apaga (gatilho); só a assinatura é gravada depois. Sem política de escrita: só as funções gravam |
| `fin_declaracao_conteudo` | Monta o que o terceiro declara a partir do cadastro e separa o **informativo** (centro e categoria) | Recusa, em português: sem forma de pagamento, sem data do pagamento, intenção que não é reembolso nem oferta. **A chave PIX é opcional** (quem recebe em espécie ou por TED não precisa de chave) |
| `fin_gerar_declaracao_terceiro` | Gera; **idempotente** (mesmo conteúdo = mesma via); mudou o conteúdo = **nova versão com o mesmo número** | Só despesa em aberto e não enviada; evento no histórico |
| `fin_registrar_assinatura_declaracao` | Grava o anexo assinado e a **data da assinatura**; só para a versão mais nova e ainda atual | A data não pode ser futura nem anterior ao pagamento do terceiro; atualiza a data da declaração da quitação (com motivo, no histórico) |
| `fin_declaracao_estado` | `sem_declaracao` · `aguardando_assinatura` · `assinada` · `desatualizada` · `externa` | **Derivado** (o código do conteúdo atual × o da via gerada). Reclassificar centro/categoria **não** desatualiza |
| `fin_registrar_quitacao`, `fin_registrar_nf_quitada_por_terceiro` | Parâmetro novo **opcional** (a forma de pagamento) | A chamada antiga continua válida; a versão antiga da assinatura é removida para não haver ambiguidade |
| `fin_alterar_quitacao`, `fin_quitacao_parametros_alterar` | Aceitam a forma de pagamento e os dois limites | Com motivo e histórico, como o resto |

As quatro funções existentes foram **transformadas a partir da definição viva do banco** (lida em 14/10/2026), com mudança cirúrgica e checagem do número de trechos trocados; nada foi redigitado.

## 2. Aplicativo (já no código, escondido até o banco ter a 1D-a)

- **Cartão "Quem pagou":** novo bloco **Declaração do Terceiro**, com o estado, **Gerar Declaração (PDF)**, **Baixar PDF**, **Registrar assinatura** (via assinada + data) e **Gerar nova via** quando desatualizada. Com a 1D-a, saem os botões "Anexar Pedido de Reembolso" e "Anexar declaração do terceiro" (o Pedido de Reembolso deixa de existir como documento à parte).
- **Registro da quitação e "NF já quitada":** campo **Como o terceiro pagou o fornecedor?** (as seis opções aprovadas), obrigatório na tela.
- **PDF:** uma página A4, **uma única frase** (a da intenção registrada), sem caixas de marcar, com número, versão e código de verificação; reembolso leva a chave PIX **quando houver** (sem ela, diz que o recebimento se combina com a Tesouraria: espécie com recibo assinado, ou transferência), oferta não; centro e categoria aparecem como informação da igreja.
- Antes da migration, **nada disso aparece** e a tela segue como hoje (sondagem da tabela). 9 testes novos (texto, PDF, estados do cartão); tipos limpos; suíte: 1.302 passam (a única falha, `navConfig.test.ts`, já existia).

## 3. Impacto esperado

| Item | Impacto |
|---|---|
| Lançamentos, saldos, ciclo, obrigações | **Nenhum** (o ensaio compara por hash) |
| Quitações existentes (há **uma**: Leandro, R$ 1.500) | Nível, suficiência, fila e resultado **idênticos** (o ensaio compara). Ela aparece com a Declaração "**externa**" (tem um Pedido de Reembolso anexado) e a forma de pagamento em branco |
| Registro de quitação pela tela publicada hoje | **Continua funcionando** (a chamada antiga é válida; a forma é opcional no banco) |
| Registro pela tela nova | Passa a pedir e gravar a forma de pagamento |
| Comportamento da Matriz e das filas | **Nenhum** |

## 4. Resultado do ensaio (banco de teste local, cadeia 1A → M0 → 1B → 1C-a → 1D-a): TUDO OK

Nada existente mudou · **A2** a forma é gravada · **A3** forma inexistente e "Não localizado com forma" são recusados · **A4/A12** as chamadas antigas (registrar e NF já quitada, sem o parâmetro) seguem valendo · **A5** sem a forma não se gera a Declaração · **A6** gera `DT-AAAA-NNNN`, é idempotente, um evento no histórico · **A7** o reembolso de quem não tem chave PIX gera a Declaração (recebimento em espécie ou TED); a oferta também · **A8** assinatura anterior ao pagamento é recusada; a via assinada grava a data da assinatura com usuário e hora · **A9** reclassificar **não** invalida; mudar a forma de pagamento declarada **desatualiza**; a versão 2 **mantém o número** · **A10** o gerado não se altera nem se apaga · **A11** os limites só mudam em ordem (Baixo ≤ Médio) · nenhum saldo mudou. APLICAR roda **duas vezes**; ROLLBACK e reaplicar funcionam.
O ensaio **em produção** (que também compara a quitação real que já existe antes e depois) é o passo seguinte, **só com a sua autorização**.

## 5. Estratégia de rollback

`docs/QUITACAO_1D_A_ROLLBACK.sql`, **antes da 1D-b**: devolve as quatro funções à definição de antes (lida do banco), remove as funções novas, remove a tabela das declarações (**mantida se já tiver linhas**: é prova), remove a coluna da forma de pagamento (**mantida se algum valor já foi gravado**) e os dois limites; a regra antiga da data da declaração só volta se nenhuma quitação a violar. Os dois eventos novos continuam aceitos no histórico. A tela volta sozinha ao que era (sondagem).

## 6. Riscos e como estão cobertos

| Risco | Cobertura |
|---|---|
| Trocar a assinatura de `fin_registrar_quitacao` quebrar quem chama | Parâmetro novo **opcional** + versão antiga removida (sem ambiguidade); testado com a chamada antiga |
| Tela nova publicada antes do banco | Tudo atrás da sondagem da tabela; sem a migration a tela não envia o parâmetro novo |
| Tela antiga (publicada hoje) depois do banco | Continua registrando (parâmetro opcional); a obrigatoriedade só entra na 1D-b |
| Via assinada deixar de valer sem ninguém perceber | Estado **desatualizada** derivado; o cartão avisa e oferece nova via |
| Perder prova ao desfazer | Rollback mantém tabela e coluna se tiverem dados |

## 7. Depois da 1D-a

**1D-b** (a Matriz do reembolso: eixo de valor, lastro com cupom até R$ 300, alçada por nível, "desatualizada" derrubando a intenção Formal, data da declaração opcional no registro, forma obrigatória no banco, prazo de formalização do reembolso) e **1D-c** (relatório mensal para o Conselho). A espelho TypeScript da Matriz e o teste de equivalência de 6.000 casos serão reescritos **juntos** na 1D-b.
