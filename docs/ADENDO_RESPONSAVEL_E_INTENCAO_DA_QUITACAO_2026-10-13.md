# Adendo: Responsável pela Quitação e Intenção da Quitação

> Complementa a [Especificação Funcional](ESPECIFICACAO_FUNCIONAL_COMPRAS_POR_TERCEIROS_REEMBOLSOS_E_DOACOES_2026-10-13.md) (13/10/2026). **Sem código, sem migration, sem telas.** Resposta à pergunta: *transformar "quem pagou" e "por qual intenção" em fatos explícitos simplifica a arquitetura?*
>
> **Veredito curto: sim.** Dois fatos substituem cinco formas de extinção, o "credor atual", a fila "A esclarecer" e três documentos. A parte pesada da obra (extinção sem conta/saldo, aprovação separada do pagamento, malote em dois momentos, Ficha do Bem) **não encolhe**: isso está dito com clareza na seção 9.

> **Status: APROVADO e incorporado à Especificação (versão 2).** Decisões aprovadas: Responsável = **Pessoa, Empresa ou Entidade**; Intenção = Reembolso, Oferta, Compensação de adiantamento, Não declarada; Grau de prova = Formal, Relatado, Nenhum. **Ajuste da aprovação:** a regra do grau Relatado **não depende só do valor**. A proposta "só abaixo de R$ 100" da seção 3 e da decisão 1 da seção 10 foi **substituída** pela **Matriz de suficiência da prova** (Especificação, seção 3.6), que pesa natureza da operação, patrimônio, lastro de NF e risco da relação.

---

## 1. Em uma frase

> Toda obrigação responde a duas perguntas, e **todo o resto é consequência delas**:
> **1. Quem quitou?** (Responsável pela Quitação) · **2. Por quê?** (Intenção da Quitação)

É exatamente a informação que o escritório nunca recebeu: a NF chega a eles sozinha, pelo sistema fiscal, e fica aberta nas contas 211005 e 211006 porque ninguém disse *quem* a pagou nem *com que propósito*.

---

## 2. Definições

### 2.1 Responsável pela Quitação

**Quem fez a obrigação com o emitente deixar de existir.** Não é o emitente (quem vendeu) nem o favorecido de um pagamento futuro; é quem, de fato, acertou a conta com o fornecedor.

| Valor | Significa | Exemplo |
|---|---|---|
| **Igreja** | A conta foi paga com recurso da própria igreja (banco, caixa, cartão da igreja) | Boleto pago pela Tesouraria; dinheiro do caixa (Del Castilho, Accor) |
| **Terceiro identificado** | Uma pessoa (ou entidade) que não é a igreja pagou com recurso próprio ou com adiantamento recebido | O pastor pagou no cartão dele |
| **Ninguém ainda** | A obrigação segue aberta | Conta a pagar normal |
| **Não localizado** | Há indício de pagamento ou a NF é antiga, mas **não se sabe** quem pagou | As 13 NFs sem rastro |

Regras:
- O terceiro é sempre um **cadastro** (Pessoas, ou Favorecido se for empresa). Nunca texto livre. É por aí que se acha todas as quitações de uma mesma pessoa.
- "Não localizado" **não é** um terceiro. É a confissão de que falta informação, e tem fila própria (seção 8).
- A quitação pode ser **parcial**: pode haver mais de uma (a igreja paga parte, um membro paga outra), cada uma com seu valor. A soma nunca passa do valor da NF.

### 2.2 Intenção da Quitação

**Por que o terceiro pagou, nas palavras dele.** Só existe quando o responsável **não é a igreja**.

| Valor | Significa | Como se prova |
|---|---|---|
| **Reembolso** | "Paguei e quero ser ressarcido" | Declaração do terceiro (Pedido de Reembolso) |
| **Oferta** | "Paguei e não quero ressarcimento: é uma doação" | Declaração do terceiro (Declaração de Oferta) |
| **Compensação de adiantamento** | "Paguei com dinheiro que a igreja já tinha me adiantado" | O **adiantamento anterior**, ligado explicitamente à NF |
| **Não declarada** | O terceiro pagou, mas ninguém registrou o que ele pretendia | Nada. É o estado "A esclarecer" |

Regras:
- **Nunca presumida.** "Não declarada" é um valor legítimo e visível, não um vazio a preencher por conveniência. O app não escolhe entre reembolso e oferta.
- Quando o responsável é a **Igreja**, a intenção é **"não se aplica"** (não fica em branco: fica marcada como não aplicável, para não confundir com "não declarada").
- A **declaração** é a prova da intenção; **quem declara** é sempre o terceiro; **quem registra** é a Tesouraria. São duas pessoas diferentes no histórico.
- A intenção tem **data**, e o app guarda também a data do pagamento. Declarar "oferta" **depois** do fato fica marcado como "declarada depois" (proteção contra oferta de última hora só para evitar o reembolso).
- Mudar a intenção não apaga a anterior: acrescenta ao histórico, com motivo. Depois de Enviada, só por reabertura.

### 2.3 O que **não** é fato guardado, e sim consequência

Estes itens, que a especificação tratava como atributos, **passam a ser derivados** das duas respostas:

- a **forma de extinção** (as cinco do quadro anterior);
- o **credor atual** (emitente, pessoa ou ninguém);
- o **estado** e os **indicadores** (Reembolso a pagar, A esclarecer);
- a **pasta do malote** e os **documentos exigidos**;
- se aquilo **mexe ou não no caixa**.

---

## 3. Grau de prova (a segunda dimensão que faltava)

Saber que "o pastor pagou" não é o mesmo que ter o comprovante do pagamento. Cada um dos dois fatos carrega o **grau de prova**:

| Grau | Quem pagou | Intenção |
|---|---|---|
| **Formal** | Cupom, fatura do cartão ou comprovante PIX/TED do terceiro anexado | Declaração assinada do terceiro (Pedido de Reembolso ou Declaração de Oferta) |
| **Relatado** | Anotado por alguém da Tesouraria com base numa informação (mensagem, comentário numa planilha) | Registrado por terceiro: "pago pelo Pr. Patrick e ofertado" |
| **Nenhum** | Não se sabe | Não declarada |

**Por que isso importa.** O caso real da D Flesh (NF 25597, R$ 137,28) está exatamente no meio: foi *relatado* que o Pr. Patrick pagou em espécie e ofertou, mas o termo assinado ainda não existe. O modelo permite registrar o fato **com o grau que ele realmente tem**, em vez de escolher entre "ignorar" e "tratar como provado".

~~Regra proposta: Relatado só abaixo do limite pequeno.~~ **Substituída na aprovação:** o valor sozinho não decide. A suficiência do grau Relatado segue a **Matriz de suficiência da prova** (Especificação, seção 3.6): quatro eixos (natureza da operação, patrimônio, lastro de NF, risco da relação), o pior manda, o valor só eleva o risco, e há três desfechos (vale; vale com aprovação do Administrador; exige Formal).

---

## 4. A tabela que gera tudo

### 4.1 Do par (quem, intenção) para o resultado

| Responsável | Intenção | **Resultado** | Credor atual | Mexe no caixa/banco? | Estado | Fila | Documentos exigidos |
|---|---|---|---|---|---|---|---|
| Ninguém ainda | n/a | **Em aberto** | Emitente | Ainda não | Em Aberto | Contas a pagar | (os de hoje) |
| **Igreja** | n/a | **Pago pela Igreja** | Nenhum | **Sim** | Fluxo de hoje, até Arquivada | — | NF + comprovante (existente) |
| Terceiro | **Reembolso** | **Dívida com a pessoa** | **A pessoa** | Só quando a igreja reembolsa | Em Aberto, "Reembolso a pagar" → Pagamento Realizado ao reembolsar | Reembolsos a pagar | NF, prova do pagamento, Pedido de Reembolso, aprovação, comprovante do reembolso |
| Terceiro | **Oferta** | **Extinta por terceiro como oferta** | Nenhum | **Não** | Pagamento Realizado ("Quitada por terceiro") → Conferida → Pronta | — | NF, Declaração de Oferta, prova do pagamento do terceiro |
| Terceiro | **Compensação de adiantamento** | **Compensada** | Nenhum | Não (o dinheiro saiu antes) | Pagamento Realizado → Conferida → Pronta | — | NF, Termo de Prestação de Contas, vínculo com o adiantamento |
| Terceiro | **Não declarada** | **A esclarecer** | Indefinido | **Não** | Em Aberto, bloqueado | A esclarecer | Nenhum: **não pode ir a Pronta** |
| **Não localizado** | n/a | **Sem quitação localizada** | Emitente (provável) | Desconhecido | Em Aberto (envelhecida) | Investigar | Nenhum |

### 4.2 A regra que dispensa a antiga tabela de estados

> **Os estados bancários (Aguardando Conciliação, Conciliada) só existem quando a igreja mexeu em conta. Se não mexeu, a quitação termina em Conferida.**

Isso substitui a grande tabela "que estados cada extinção percorre" (4.2 da especificação) por **uma frase**. O estado continua derivado dos fatos, como já é hoje.

### 4.3 O cancelamento fica de fora, e é correto que fique

A NF cancelada pelo emitente (caso Paulo Cid) **não é uma quitação**: ninguém quitou, a obrigação deixou de existir. Por isso é um **desfecho separado** ("Cancelada", com prova de cancelamento), e não um quinto valor de intenção. Resultado: as cinco formas de extinção viram **quatro resultados de quitação + um cancelamento**, e a distinção fica logicamente limpa.

---

## 5. Reembolso: duas camadas, para nunca contar duas vezes

Esta é a parte mais fácil de errar, e o modelo explícito a protege.

| Camada | O que é | Extingue o quê | Mexe no caixa? |
|---|---|---|---|
| **1. Quitação pelo terceiro** | O pastor paga o fornecedor | A dívida **com o fornecedor** | Não |
| **2. Liquidação do reembolso** | A igreja paga o pastor (PIX, TED, espécie) | A dívida **com o pastor** | **Sim** (liquidação comum de hoje) |

Consequências:
- A NF é reconhecida **uma vez** como despesa (competência da NF) e o dinheiro sai **uma vez** (data do reembolso).
- O reembolso **não** é "forma de pagamento da NF": é o pagamento de uma dívida **nova**, com credor diferente, nascida da camada 1. É a frase que você aprovou: *"Reembolso não é forma de pagamento."*
- A liquidação do reembolso é a que existe hoje, só que com **favorecido = a pessoa** e **referência à quitação que a originou**. Aceita parcial, várias NFs no mesmo PIX e comprovante na linha.

---

## 6. Como ficam os cenários A a F

| Cenário | Como se expressa |
|---|---|
| **A: compra com reembolso** | Responsável = Terceiro; Intenção = **Reembolso** |
| **B: compra ofertada** | Responsável = Terceiro; Intenção = **Oferta** |
| **C: membro paga direto** | Responsável = Terceiro; Intenção = **Não declarada** até alguém declarar, e então vira A ou B. **O cenário C deixa de ser um caso à parte: é o estado "Não declarada".** |
| **Adiantamento** | Responsável = Terceiro; Intenção = **Compensação de adiantamento** |
| **Pago pela igreja** | Responsável = **Igreja** |
| **D, E, F: doação direta** | **Não há obrigação**, portanto não há quitação. Mas o vocabulário é o mesmo: *doador* = terceiro, *intenção* = oferta, provada pelo termo. Dá para usar o mesmo componente de declaração |

---

## 7. Teste com os casos reais (as 17 NFs)

A planilha de decisão que você preencheu já tinha as colunas certas, sem que o modelo existisse. Ela mapeia assim:

| Sua coluna "Situação" | Responsável | Intenção | Campos extras da planilha viram |
|---|---|---|---|
| **Oferta para a Igreja** | Terceiro | Oferta | "Nome do Doador" = o terceiro |
| **Reembolso** | Terceiro | Reembolso | "Pessoa a Reembolsar" = o terceiro; "Pagamento já realizado? Sim/Não" = se a camada 2 já ocorreu |
| **Pago de Outra Forma** | **Igreja** | n/a | "Forma de pagamento" = como a igreja pagou (dinheiro, PIX, cartão) |
| **Precisa Investigar** | **Não localizado** | n/a | — |
| (NF cancelada) | — | — | Desfecho "Cancelada" |

Aplicado aos casos que já temos:

| NF | Responsável | Intenção | Grau de prova | Resultado |
|---|---|---|---|---|
| D Flesh (25597, R$ 137,28) | Terceiro: Pr. Patrick | Oferta | **Relatado** (falta o termo assinado) | Extinta como oferta, **pendente de formalização** |
| Del Castilho (24553) | **Igreja** (dinheiro) | n/a | Formal (documentação na pasta) | Pago pela Igreja (falta lançar no app) |
| Accor (166376) | **Igreja** (dinheiro) | n/a | Formal | Pago pela Igreja (falta lançar no app) |
| Paulo Cid (184) | — | — | — | **Cancelada** |
| As 13 NFs | **Não localizado** | n/a | Nenhum | Sem quitação localizada → fila Investigar |

**O ganho prático:** as 13 NFs deixam de ser "pendência genérica" e passam a ter nome. Para cada uma, a pergunta ao escritório e à igreja é a mesma e curta: *alguém sabe quem pagou? Se foi terceiro, qual foi a intenção?*

---

## 8. As filas de pendência passam a ser derivadas

Em vez de uma lista única "A esclarecer", surgem **quatro filas, cada uma com uma pergunta**:

| Fila | Condição | A pergunta | Bloqueia fechamento/malote? |
|---|---|---|---|
| **Investigar** | Responsável = Não localizado | Quem pagou? | Não bloqueia por si (é conta em aberto), mas **aparece no relatório de pendências** e envelhece |
| **A esclarecer** | Terceiro identificado, intenção Não declarada | Qual era a intenção? | **Sim** |
| **Formalizar** | Intenção em grau Relatado, valor acima do limite pequeno | Falta o documento assinado | **Sim** |
| **Reembolso a pagar** | Intenção = Reembolso, sem liquidação completa | Quando a igreja paga? | Não (é dívida legítima); vai ao malote como informativo |

Mantém o que você aprovou ("A esclarecer bloqueia malote e fechamento"), com duas vantagens: a causa de cada bloqueio fica nomeada, e **"não sei nem se foi paga" deixa de se misturar com "sei quem pagou, falta saber a intenção"**.

---

## 9. Veredito: o que simplifica e o que não

### 9.1 O que simplifica (comprovado pela comparação com a especificação)

| Item da especificação | Antes | Depois |
|---|---|---|
| Atributos novos da obrigação (3.1) | 7 (comprador, natureza, pagador, intenção, extinção, credor atual, aprovação) | **Quitação (responsável + intenção + prova)** + comprador + natureza + aprovação; **extinção e credor atual somem** (derivados) |
| Formas de extinção | 5 | **4 resultados + 1 desfecho (cancelamento)**, todos gerados pelo par |
| Tabela "estados por extinção" (4.2) | Matriz de 6 linhas × 9 estados | **Uma regra** (sem conta ⇒ termina em Conferida) |
| Cenário C | Cenário próprio, com árvore | **Um valor** (Intenção = Não declarada) |
| Documentos do terceiro | Pedido de Reembolso, Declaração de Intenção, Declaração de Doação de Consumo | **Uma "Declaração do Terceiro"** com duas frases (reembolso/oferta); o Pedido de Reembolso é essa mesma declaração + dados bancários + lista de NFs; a de doação de consumo usa o mesmo componente |
| Regras R1, R2, R7 | Três regras soltas | Viram **propriedades do fato** (nunca presumida, prazo, histórico) |
| Filas de pendência | Uma ("A esclarecer"), ambígua | Quatro, cada uma uma pergunta |
| Pergunta ao escritório | Várias | **Duas** |

### 9.2 O que **não** simplifica (é preciso dizer)

1. **A extinção por terceiro continua sem poder exigir conta nem mexer em saldo.** O modelo explicita o fato, mas o ponto técnico do lançamento realizado é o mesmo.
2. **A aprovação continua tendo de deixar de ser sinônimo de pagamento.**
3. **O malote continua com dois momentos no reembolso.**
4. **Não existe Patrimônio.** A Ficha do Bem continua necessária.
5. **A quitação parcial ou múltipla acrescenta complexidade real.** Com "quem" e "intenção" por evento, a obrigação passa a ter *uma lista* de quitações, e não um único atributo. É o preço de não perder o caso "a igreja pagou parte e o pastor pagou o resto". **Mitigação:** a primeira entrega aceita só *uma quitação por terceiro* por obrigação (além dos pagamentos da igreja, que já são múltiplos hoje). A lista completa fica para depois, se aparecer caso real.
6. **A distinção "quem executou" × "de quem era o dinheiro"** aparece só no adiantamento (o terceiro executou, mas o recurso era da igreja). Está resolvida com o valor "Compensação de adiantamento", mas é a única exceção ao "quem pagou é quem pôs o dinheiro".

### 9.3 Ajustes que recomendo na especificação (se você aprovar este adendo)

1. Substituir em 3.1 os atributos *pagador, intenção, extinção, credor atual* por **Quitação (responsável + intenção + grau de prova)**; extinção e credor atual viram derivados.
2. Substituir a tabela 4.2 pela regra de 4.2 deste adendo.
3. Fundir o Pedido de Reembolso, a Declaração de Intenção e a Declaração de Doação de Consumo no catálogo de documentos.
4. Incluir o **grau de prova** (Formal, Relatado, Nenhum) nos critérios de aceite.
5. Trocar a fila única "A esclarecer" pelas quatro filas da seção 8.
6. Acrescentar "Cancelada" como desfecho explícito, separado da quitação.

---

## 10. O que preciso que você decida

| # | Decisão | Recomendação |
|---|---|---|
| 1 | **Grau Relatado basta?** Quando uma informação registrada por terceiro ("pago e ofertado") pode tirar a NF do bloqueio | Só abaixo do limite pequeno (R$ 100,00); acima, exige o documento assinado |
| 2 | **Quem pode ser Responsável?** Só pessoa cadastrada, ou também empresa/entidade (outra igreja, convenção, doador PJ) | Pessoa e Favorecido PJ; ambos como cadastro |
| 3 | **A quitação por terceiro admite várias em uma obrigação** na primeira entrega? | Uma por obrigação na primeira entrega; lista completa depois |
| 4 | **Adiantamento como "intenção"** ou como categoria própria de quitação | Como valor da intenção, com vínculo explícito ao adiantamento (nunca por coincidência de valor) |
| 5 | **Declaração posterior à compra**: aceitar com marca "declarada depois", ou exigir aprovação extra | Aceitar com a marca; exigir Administrador acima do teto 1 |

---

## 11. Conclusão

> **Sim, simplifica.** Quando "quem pagou" e "por quê" viram fatos explícitos, a extinção, o credor, o estado, a fila, a pasta do malote e a leitura contábil **deixam de ser coisas a armazenar e decidir** e passam a ser **consequências** do par.
>
> É também o que fecha a lacuna com o escritório: eles nunca souberam **quem** pagou nem **com que propósito**. A partir daqui, cada NF no CNPJ da igreja responde às duas perguntas, ou aparece numa fila dizendo qual delas está sem resposta.
