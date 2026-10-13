# Especificação funcional: compras por terceiros, reembolsos e doações

> **Para aprovação. Versão 2 (13/10/2026).** **Sem código, sem migration, sem telas, sem protótipo.** Nada foi alterado no app.
>
> **O que a versão 2 incorpora:** o [Adendo sobre Responsável e Intenção da Quitação](ADENDO_RESPONSAVEL_E_INTENCAO_DA_QUITACAO_2026-10-13.md), aprovado, com estas decisões: Responsável = **Pessoa, Empresa ou Entidade**; Intenção = **Reembolso, Oferta, Compensação de adiantamento ou Não declarada**; Grau de prova = **Formal, Relatado ou Nenhum**; e a regra do grau **Relatado** deixa de depender só do valor e passa a ser a **Matriz de suficiência da prova** (seção 3.6), que pesa natureza da operação, patrimônio, lastro de NF e risco da relação.
>
> Ele transforma a arquitetura aprovada em regras de funcionamento: o que acontece, quem faz, quais documentos existem, em que estado cada coisa fica e o que chega à contabilidade. As escolhas de política contábil ficam **parametrizáveis** e estão listadas na seção 14, com a recomendação padrão.
>
> **Limite:** é uma especificação de produto, não um parecer contábil. O que depende do contador está marcado **[confirmar]**.

---

## Sumário

0. Escopo
1. A regra fundamental e a árvore de decisão
2. Vocabulário
3. Modelo conceitual
4. Estados e transições
5. Papéis e aprovações
6. Catálogo de documentos
7. Os seis cenários (A a F)
8. Adiantamento e prestação de contas
9. Regras transversais
10. Malote contábil
11. Efeitos nos números
12. Reaproveitamento: o que existe, o que criar, o que alterar
13. Compatibilidade com a arquitetura aprovada (D1 a D7) e critérios de aceite
14. Decisões pendentes
15. Ordem de implantação
16. Recomendação única

---

## 0. Escopo

**Dentro:** compra feita por terceiro com reembolso (A); compra ofertada (B); pagamento direto por membro (C); doação direta de bem (D) e de consumo (E); serviço gratuito (F); adiantamento com prestação de contas; a situação "a esclarecer"; o cancelamento de NF.

**Fora (outras frentes):** política contábil (conta, receita imediata ou diferida, depreciação); recibo para Imposto de Renda; folha e prebenda (Conta Corrente de Sustento); a regularização do histórico (especificação própria, depois da política).

**Objetivo verificável:** nenhum fato que não movimentou dinheiro da igreja pode gerar entrada, transferência ou saída em conta nenhuma.

---

## 1. A regra fundamental e a árvore de decisão

### 1.1 A pergunta que abre tudo

> **A igreja é a compradora?**

| Resposta | Critério | Consequência |
|---|---|---|
| **Sim** | Há documento fiscal no **CNPJ da igreja** (NF-e, NFS-e, cupom com CNPJ) **ou** houve contratação formal prévia (pedido aprovado, contrato, RPA) | **Nasce uma OBRIGAÇÃO**, independentemente do item |
| **Não** | O documento está em nome de **outra pessoa ou entidade**, ou não há documento e nada foi contratado | **Não nasce obrigação.** Se algo foi entregue de graça, é **Doação direta**, e nasce já extinta |

**O tipo do item não define o fluxo.** Alimento, limpeza, equipamento, ação social e patrimônio seguem o mesmo caminho. O item define o **destino** (despesa, estoque, ficha do bem) e alguns documentos extras, nunca o fluxo.

### 1.2 As três perguntas seguintes (só quando há obrigação)

| Pergunta | Respostas possíveis |
|---|---|
| **Quem quitou?** (Responsável pela Quitação) | Igreja · **Pessoa · Empresa · Entidade** · Ninguém ainda · Não localizado |
| **Se foi um terceiro, qual a intenção?** (Intenção da Quitação) | Reembolso · Oferta · Compensação de adiantamento · **Não declarada = A esclarecer** |
| **Que prova existe?** (Grau de prova, para os dois fatos) | **Formal · Relatado · Nenhum**, com a suficiência medida pela matriz da seção 3.6 |
| *(à parte)* A obrigação foi cancelada? | Desfecho **Cancelada**, com prova. Não é uma quitação |

### 1.3 Quadro de decisão completo

| A igreja é a compradora? | Quem quitou | Intenção | Resultado |
|---|---|---|---|
| Sim | Igreja | n/a | **Pago pela Igreja** (fluxo de hoje) |
| Sim | Terceiro | Reembolso | **Cenário A.** Obrigação com a pessoa até pagar |
| Sim | Terceiro | Oferta | **Cenário B.** Obrigação extinta na declaração |
| Sim | Terceiro | **Não declarada** | **A esclarecer.** Fila obrigatória; nada se presume |
| Sim | Terceiro | Compensação de adiantamento | **Compensada por Adiantamento** (seção 8) |
| Sim | Ninguém ainda | n/a | **Em Aberto** (conta a pagar normal) |
| Sim | **Não localizado** | n/a | **Sem quitação localizada.** Fila Investigar |
| Sim | NF cancelada pelo emitente | n/a | **Cancelado** (com prova) |
| Não | Alguém entregou de graça | n/a | **Doação direta** (D, E ou F) |
| Não | Alguém pediu ressarcimento de gasto em seu nome | n/a | **Exceção**: não é reembolso. Exige decisão do Administrador (seção 9, R6) |

### 1.4 Casos de borda que o quadro precisa responder

| Situação | Como se resolve |
|---|---|
| **NF no CPF do membro** | A igreja **não** é a compradora. Se o bem foi entregue de graça: Doação direta. Se o membro quer ser ressarcido: exceção (R6) |
| **NF sem destinatário ou "consumidor final" sem CNPJ** | A igreja não está provada como compradora. Exige declaração de compra em nome da igreja, aprovada pelo Administrador, ou vira Doação direta |
| **NF em nome de outra entidade** (convenção, ministério) | Não é obrigação da igreja. Registra-se como informação, sem fluxo |
| **NF mista** (itens da igreja e pessoais) | A NF é a obrigação inteira; a parte pessoal vira **dívida da pessoa com a igreja** ou reduz o reembolso. Exige Administrador |
| **Compra no cartão de crédito da igreja por um colaborador** | Não é terceiro: é **Pago pela Igreja**, via fatura do cartão |
| **Compra no cartão pessoal do membro com NF no CNPJ da igreja** | É **terceiro**: segue A, B ou C |

---

## 2. Vocabulário

| Termo | Significado |
|---|---|
| **Obrigação** | O que a igreja deve por ter comprado ou contratado. Já existe (`obrigacao_id`) e **nunca muda de identidade**. |
| **Emitente** | Quem emitiu o documento fiscal (o fornecedor). **Fixo.** |
| **Credor atual** | **Derivado.** A quem a igreja deve **agora**. Começa como o emitente. Se um terceiro quitou com intenção de reembolso, passa a ser o **terceiro**. Se foi oferta, compensação ou cancelamento, deixa de existir. |
| **Responsável pela Quitação** | **Fato guardado.** Quem fez a obrigação com o emitente deixar de existir: **Igreja, Pessoa, Empresa ou Entidade** (ou "Ninguém ainda" / "Não localizado"). Pessoa, Empresa e Entidade são sempre **cadastros**, nunca texto livre. |
| **Intenção da Quitação** | **Fato guardado.** Por que o terceiro pagou, nas palavras dele: **Reembolso, Oferta, Compensação de adiantamento ou Não declarada**. Só existe quando o responsável não é a igreja. **Nunca presumida.** |
| **Grau de prova** | **Fato guardado**, para o responsável e para a intenção: **Formal** (documento assinado ou comprovante do pagamento), **Relatado** (informação registrada por terceiro, sem documento) ou **Nenhum**. A suficiência é medida pela matriz da seção 3.6. |
| **Extinção** | **Derivada** do par (responsável, intenção): Pago pela Igreja · Extinta por terceiro como oferta · Dívida com o terceiro (reembolso) · Compensada por adiantamento. **Cancelada** é um desfecho à parte, sem quitação. |
| **Declaração do Terceiro** | Documento único, datado e assinado pelo terceiro, que diz **o que ele pagou e qual a sua intenção** (reembolso ou oferta). O Pedido de Reembolso é essa mesma declaração acrescida dos dados bancários e da lista de NFs. |
| **Doação direta** | Bem, consumo ou serviço recebido de graça, **sem aquisição da igreja**. Não há obrigação. |
| **Adiantamento** | Dinheiro da igreja entregue **antes** de existir a NF, com prestação de contas pendente. |
| **A esclarecer** | A obrigação existe, um terceiro identificado a pagou, mas a **intenção não foi declarada** (Intenção = Não declarada). É uma das quatro filas de pendência (seção 4.4). |
| **Natureza do item** | Consumo, estoque, bem durável ou serviço. Define o destino, **não** o fluxo. |
| **Valor justo** | Valor de mercado do bem ou serviço quando não há NF (com a base documentada). |

---

## 3. Modelo conceitual

### 3.1 O que a Obrigação passa a registrar

Já existem: valor, data, emitente, documentos do grupo, comprovante da linha, estados. **Passam a ser guardados quatro fatos**:

| Fato guardado | Valores | Observação |
|---|---|---|
| **Comprador** | Igreja por documento no CNPJ · Igreja por contratação prévia | Preenchido automaticamente quando o destinatário da NF-e é o CNPJ da igreja |
| **Natureza do item** | Consumo · Estoque · Bem durável · Serviço | Define destino, documentos extras e entra na matriz de suficiência da prova |
| **Quitação** | Ver 3.1.1 | O coração do modelo: responsável, intenção e grau de prova, com data, valor e histórico |
| **Aprovação** | Quem, quando, decisão, motivo | Independente do pagamento |

**Não são mais guardados, passam a ser derivados:** a forma de extinção, o credor atual, o estado, os indicadores, a fila, a pasta do malote, os documentos exigidos e se a operação mexe no caixa.

#### 3.1.1 A Quitação

| Componente | Valores | Regras |
|---|---|---|
| **Responsável pela Quitação** | **Igreja** · **Pessoa** · **Empresa** · **Entidade** · Ninguém ainda · Não localizado | Pessoa, Empresa e Entidade são **cadastros** (Pessoas; Favorecido com CNPJ para Empresa e Entidade). Nunca texto livre. "Não localizado" confessa que falta informação e tem fila própria |
| **Intenção da Quitação** | **Reembolso** · **Oferta** · **Compensação de adiantamento** · **Não declarada** | Só existe quando o responsável **não é a Igreja**; quando é a Igreja, fica marcada **"não se aplica"**. **Nunca presumida.** Compensação de adiantamento se prova pelo **vínculo explícito** com o adiantamento (nunca por coincidência de valor), e **não admite grau Relatado** |
| **Grau de prova** (de cada um dos dois fatos) | **Formal** · **Relatado** · **Nenhum** | Se qualquer dos dois estiver em "Nenhum", a quitação **não é suficiente**. Nos demais casos, vale a matriz da seção 3.6 |
| **Declarante e registrador** | Duas pessoas distintas no histórico | Quem declara a intenção é sempre o **terceiro**; quem registra é a Tesouraria |
| **Datas** | Do pagamento e da declaração | Declaração posterior ao fato fica marcada **"declarada depois"** e entra na matriz |
| **Valor** | Parte da NF que esta quitação extinguiu | A soma das quitações nunca passa do valor da NF (R4). **Primeira entrega: uma quitação por terceiro por obrigação**, além dos pagamentos da igreja, que já podem ser vários |
| **Histórico** | Mudança de intenção ou de responsável **acrescenta**, não apaga | Com motivo, quem e quando. Depois de Enviada, só por reabertura (R7) |

**Cancelamento** (NF cancelada pelo emitente) **não é quitação**: ninguém quitou, a obrigação deixou de existir. É um **desfecho separado**, com a prova de cancelamento.

### 3.2 A linha do tempo da obrigação

Todo evento fica com **quem e quando**, no padrão da reabertura e da conta auditada:

1. **Registro** da NF (e a avaliação automática de "a igreja é a compradora?").
2. **Aprovação** (prévia ou posterior), ou recusa com motivo.
3. **Quitação** (responsável, data, valor, grau de prova do pagamento).
4. **Declaração da intenção** (data, declarante, registrador, documento, grau de prova).
5. **Liquidação do reembolso**, uma ou mais (dinheiro da igreja saindo para o terceiro). É uma **segunda camada**, distinta da quitação: a quitação extingue a dívida com o emitente; a liquidação extingue a dívida com o terceiro.
6. **Conferência** humana.
7. **Aviso de extinção** e **envio** no malote.
8. **Reabertura** auditada, se houver.

### 3.3 A Doação direta (entidade nova)

Não é obrigação. Nasce **já extinta**. Registra: doador (Pessoa), natureza, descrição, quantidade, **valor justo e base**, destino (estoque, patrimônio, uso imediato, distribuição), documentos, aceite da igreja.

### 3.4 A Ficha do Bem (entidade nova, mínima)

Vale para **todo bem durável**, qualquer que seja o caminho: comprado e pago pela igreja, ofertado por terceiro ou doado direto. Guarda: descrição, número de série, valor (NF ou valor justo), data, origem, doador, responsável, local e baixa. **Não calcula depreciação:** isso continua com o escritório.

### 3.5 Relações

- Obrigação **1 : N** Documentos (do grupo) e **1 : N** Liquidações (do reembolso, inclusive parciais).
- Obrigação **0..1** Declaração de intenção, **0..N** Adiantamentos compensados, **0..1** Ficha do Bem.
- Doação direta **1 : N** Documentos, **0..1** Ficha do Bem, **0..N** Movimentos de estoque.

### 3.6 Suficiência da prova: quando o grau Relatado basta

**Princípio.** "Relatado" não é aceitável nem inaceitável por si. Depende do que está em jogo. Por isso a regra **não pode ser o valor**: R$ 40 de reembolso são dinheiro saindo da igreja; R$ 400 de consumo ofertado por quem está fora do circuito não mexem em caixa nenhum.

**Como funciona.** A quitação (os dois fatos, avaliados pelo mais fraco dos dois graus) recebe um **nível de risco** (Baixo, Médio ou Alto), dado por **quatro eixos**. **O pior eixo manda.** Depois, os moduladores podem subir o nível. **O valor nunca rebaixa o risco: só pode elevá-lo.**

#### Eixo 1: natureza da operação (o que a intenção faz acontecer)

| Nível | Quando |
|---|---|
| **Baixo** | Oferta de material de consumo ou serviço, sem destinação patrimonial |
| **Médio** | Oferta com condição, destinação restrita (campanha, ação social, fundo restrito) ou que gera declaração de recebimento ao doador |
| **Alto** | **Reembolso** (dinheiro da igreja vai sair) · qualquer operação que **altera competência já Enviada ou Arquivada** · Compensação de adiantamento (esta nunca aceita Relatado) |

#### Eixo 2: patrimônio

| Nível | Quando |
|---|---|
| **Baixo** | Não gera ativo (consumo, serviço, despesa corrente) |
| **Médio** | Bem durável abaixo do limite de capitalização (vai à Ficha do Bem, sem capitalização) **[confirmar o limite com o escritório]** |
| **Alto** | Bem durável acima do limite · veículo, imóvel ou bem registrável · bem com encargo ou restrição · qualquer coisa que aumente patrimônio social ou fundo |

#### Eixo 3: lastro de nota fiscal

| Nível | Quando |
|---|---|
| **Baixo** | NF-e ou NFS-e no CNPJ da igreja, com chave de acesso conferida e valor igual ao quitado |
| **Médio** | Documento fiscal no CNPJ sem chave, cupom com CNPJ legível, ou **divergência** entre o valor da NF e o valor quitado |
| **Alto** | Sem documento fiscal no CNPJ da igreja (a obrigação vem de contratação formal prévia, sem NF ainda) · documento ilegível, rasurado ou em nome diferente |

#### Eixo 4: risco da relação (quem é o terceiro)

| Nível | Quando |
|---|---|
| **Baixo** | Pessoa fora do circuito da operação, sem interesse econômico na igreja |
| **Médio** | Ministro, diretor ou membro de conselho **fora** do circuito desta operação · Entidade ligada à igreja (convenção, associação) · terceiro com intenção alterada recentemente |
| **Alto** | Terceiro **participa do circuito** da operação (aprova, registra, concilia ou paga) · **Empresa** fornecedora, prestadora ou locatária da igreja, ou que recebe pagamentos regulares dela · terceiro que pede recibo com efeito fiscal · parentesco declarado com quem aprova |

#### Moduladores (cada um sobe um nível, no máximo dois níveis ao todo)

| # | Modulador | Parâmetro sugerido |
|---|---|---|
| **M1** | Intenção **declarada depois** do prazo contado do pagamento | 30 dias |
| **M2** | Valor da operação acima do **teto 1** | R$ 500,00 |
| **M3** | Valor acumulado do mesmo terceiro no ano acima do teto anual, ou 3 ou mais operações Relatadas do mesmo terceiro no trimestre | R$ 2.000,00 e 3 |
| **M4** | Mês de competência com **fechamento já aprovado** | n/a |

#### O que cada nível significa para o grau Relatado

| Nível | O Relatado vale? | Fila | Bloqueia malote e fechamento? | No malote |
|---|---|---|---|---|
| **Baixo** | **Sim.** Avança normalmente | Formalização **recomendada**, com prazo (sugestão: 30 dias) | Não | Vai Pronto, com selo **"Relatado"** e nota "formalização pendente" |
| **Médio** | **Só com aprovação do Administrador**, com motivo registrado | **Formalizar** | **Sim, até a aprovação.** Aprovado, não bloqueia | Vai Pronto, com selo e nota |
| **Alto** | **Não.** Exige grau **Formal** | **Formalizar** | **Sim** | Não vai |

**Formalização vencida sobe um nível.** Passado o prazo sem o documento assinado, o item sobe um nível: o que era Baixo passa a exigir aprovação do Administrador; o que era Médio passa a exigir Formal. O tempo não "regulariza" nada.

#### Regras duras (que a matriz já produz, ditas à parte para não haver dúvida)

1. **Reembolso nunca é pago com base em Relatado.** O eixo 1 o coloca em Alto: dinheiro da igreja só sai com a intenção **Formal**.
2. **Compensação de adiantamento não aceita Relatado.** Sua prova é o vínculo explícito com o adiantamento.
3. **Se o grau do responsável (quem pagou) for "Nenhum", a quitação nunca é suficiente**, qualquer que seja o nível.
4. **"Não declarada" não é Relatado: é Nenhum.** Vai para a fila A esclarecer.
5. **Converter oferta em reembolso depois do fato** exige grau Formal, qualquer que seja o nível.

#### Exemplos de leitura (ilustrativos, não são regra)

| Situação | Eixos (natureza · patrimônio · NF · relação) | Resultado |
|---|---|---|
| Consumo de R$ 60, NF com chave, terceiro fora do circuito, oferta relatada na hora | Baixo · Baixo · Baixo · Baixo | **Baixo.** Relatado vale; formalizar em até 30 dias |
| A mesma compra, mas o terceiro é quem **aprova** | Baixo · Baixo · Baixo · **Alto** | **Alto.** Exige Formal |
| Cabo de R$ 90 que vai à Ficha do Bem, NF com chave | Baixo · **Médio** · Baixo · Baixo | **Médio.** Relatado só com aprovação do Administrador |
| Oferta de R$ 50 de uma **empresa fornecedora** da igreja | Baixo · Baixo · Baixo · **Alto** | **Alto.** O valor baixo não salva |
| Reembolso de R$ 40, relatado | **Alto** · Baixo · Baixo · Baixo | **Alto.** Exige Formal |
| D Flesh (NF 25597, R$ 137,28): oferta relatada pelo Pr. Patrick, declarada ~2 anos depois | Baixo · Baixo · Médio (chave ainda pendente) · a conferir | **Mínimo Médio** (M1 sobe um nível). Se o Pr. Patrick estiver no circuito de aprovação, **Alto**. O termo assinado já prometido ao escritório resolve de vez |

**Parametrização.** Tetos, prazos, limite de capitalização e a lista de "circuito" são **parâmetros** do Administrador, definidos com o escritório **[confirmar]**. Toda mudança de parâmetro é auditada e **não reclassifica retroativamente** itens já Enviados.

---

## 4. Estados e transições

### 4.1 Princípio

Os **8 estados aprovados não mudam de nome nem de ordem.** O que muda é o **significado de "Pagamento Realizado"**: passa a ser "obrigação extinta", seja qual for o meio. O estado continua **derivado dos fatos**, como hoje.

### 4.2 Que estados cada quitação percorre

Em vez de uma matriz por forma de extinção, **uma regra e uma tabela curta**, ambas geradas pelo par (responsável, intenção):

> **Os estados bancários (Aguardando Conciliação, Conciliada) só existem quando a igreja mexeu em conta. Se não mexeu, a quitação termina em Conferida.**

| Responsável · Intenção | Estado em que fica | Quando avança |
|---|---|---|
| **Igreja** · n/a | Fluxo de hoje: Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada (conta com extrato) ou Conferida (conta sem extrato) → Pronta → Enviada → Arquivada | Como hoje |
| **Terceiro** · Reembolso | **Em Aberto** (indicador "Reembolso a pagar"; credor = o terceiro) | **Pagamento Realizado** quando a igreja reembolsa; depois, Conciliada (reembolso pelo banco) ou Conferida (em espécie) |
| **Terceiro** · Oferta | Em Aberto só até a declaração | **Pagamento Realizado** no ato da declaração (rótulo "Quitada por terceiro") → **Conferida** (nunca Conciliada) → Pronta |
| **Terceiro** · Compensação de adiantamento | Em Aberto até o vínculo | **Pagamento Realizado** quando a NF compensa o adiantamento → Conferida (ou herda a conciliação do adiantamento) → Pronta |
| **Terceiro** · Não declarada | **Em Aberto, bloqueado** (fila A esclarecer) | Não avança até a intenção ser declarada |
| **Terceiro** · intenção declarada, prova **insuficiente** pela matriz 3.6 | Em Aberto, bloqueado (fila Formalizar) | Quando houver documento Formal, ou aprovação do Administrador no nível Médio |
| **Não localizado** · n/a | Em Aberto (envelhecida; fila Investigar) | Quando alguém identificar o responsável |
| **Desfecho Cancelada** | Cancelada (com prova) | Não vai ao malote regular; só como registro |

### 4.3 A regra de ouro da conferência

**Conciliada** continua significando vínculo bancário válido. Extinção por terceiro **nunca é Conciliada**: termina em **Conferida**, que é a validação humana prevista para conta sem extrato (documento, comprovante e conferência). Nada muda na definição, só na aplicação.

### 4.4 Indicadores (não são estados novos)

São também as **quatro filas de pendência** do modelo, cada uma respondendo a uma pergunta:

| Fila | Condição | A pergunta | Bloqueia fechamento e malote? |
|---|---|---|---|
| **Investigar** | Responsável = Não localizado | Quem pagou? | Não por si (é conta em aberto), mas aparece no relatório de pendências e envelhece |
| **A esclarecer** | Terceiro identificado, intenção Não declarada | Qual era a intenção? | **Sim** |
| **Formalizar** | Intenção declarada, mas prova insuficiente pela matriz 3.6 (ou formalização vencida) | Falta o documento assinado, ou a aprovação do Administrador? | **Sim** |
| **Reembolso a pagar** | Intenção = Reembolso Formal, sem liquidação completa | Quando a igreja paga? | Não (dívida legítima); vai ao malote como informativo |

| Indicador | Aparece quando |
|---|---|
| **Reembolso a pagar** | Em Aberto com credor = o terceiro |
| **A esclarecer** | Terceiro identificado sem intenção declarada |
| **Formalizar** | Prova insuficiente ou formalização vencida |
| **Investigar** | Responsável = Não localizado |
| **Relatado** | Quitação aceita com grau Relatado (selo visível no malote) |
| **Atrasada** | Passou do vencimento (regra atual) ou do prazo de reembolso |
| **Adiantamento vencido** | Prestação de contas fora do prazo |
| **Sem documento** | Falta documento exigido (visível antes do malote) |

### 4.5 Guardas

1. **Não chega a Pronta** sem o documento exigido do cenário **e** a conferência.
2. **As filas A esclarecer e Formalizar não deixam fechar o mês** para itens com data a partir da vigência (seção 9, R14).
3. **Depois de Enviada**, a intenção e a forma de extinção ficam congeladas; mudar exige **reabertura auditada** (Administrador ou Tesouraria, com motivo).
4. Congelamento estreito da Enviada: valor, data, categoria, centro, favorecido e documento principal já congelam hoje; **intenção** e **extinção** entram na lista.

---

## 5. Papéis e aprovações

### 5.1 Quem faz o quê

O app **não tem acesso para o membro comum** (a base de usuários é a administração). Então a **Tesouraria registra em nome da pessoa**, e a pessoa assina a **declaração** em papel, PDF ou outro canal aceito (decisão 3 da seção 14).

| Ação | Quem |
|---|---|
| Registrar NF, pedido, doação | Tesouraria (ou Secretaria) |
| Declarar intenção (oferta ou reembolso) | O terceiro (documento assinado), registrado pela Tesouraria |
| Aprovar reembolso, aceite de doação, adiantamento | Conforme alçada (5.2) |
| Pagar reembolso | Tesouraria |
| Conferir | Tesouraria, **diferente de quem aprovou** quando possível |
| Reabrir depois de Enviada | Administrador ou Tesouraria, com motivo |

### 5.2 Alçadas (parâmetros)

| Situação | Aprovação recomendada |
|---|---|
| Reembolso até o **teto 1** | Tesouraria |
| Reembolso acima do teto 1 | **Administrador** |
| Reembolso para **a própria pessoa que aprova** | **Outro aprovador**, sempre |
| Compra prévia (G) | **Antes** da compra, acima do teto 1; opcional abaixo |
| Aceite de doação de bem durável | Administrador (e diretoria, se a igreja quiser) |
| Aceite de doação de consumo | Tesouraria |
| Exceção de documento (R6) | Administrador |

### 5.3 O que o app já tem e precisa mudar

O status `aguardando_aprovacao` e as ações de aprovar e rejeitar **já existem**. **Mas hoje "aprovar" significa "pagar"**: a função marca o lançamento como realizado e carimba a data de pagamento; rejeitar cancela e guarda o motivo no texto. Para este modelo, **a aprovação precisa ser uma decisão separada do pagamento** (quem, quando, motivo), sem mexer em dinheiro. Isso é uma **alteração**, descrita na seção 12.

### 5.4 Quando a igreja recusa um reembolso

Não se pode deixar a NF solta. A recusa gera **uma de três saídas**, todas registradas:

1. a pessoa **converte em oferta** (declaração formal);
2. a **NF é cancelada** com o emitente (devolução);
3. o Administrador **assume a dívida** e o reembolso volta ao fluxo.

---

## 6. Catálogo de documentos

Os tipos de anexo **já existentes** (nota fiscal, comprovante, boleto, fatura, guia, contrato, RPA, RSP, DPS, documento, outro) continuam. Os **novos** estão marcados.

| Documento | Quem emite | Conteúdo mínimo | Exigido em | Fica no grupo da obrigação ou na linha |
|---|---|---|---|---|
| **Documento fiscal** (NF-e, NFS-e, cupom com CNPJ) | Emitente | CNPJ do destinatário = igreja, valor, data, chave de acesso quando houver | A, B, C (e pago pela igreja) | Grupo (existente) |
| **Solicitação de Aprovação de Compra** (novo) | Solicitante | Objeto, valor estimado, fornecedor, centro de custo, justificativa, data | G; recomendada acima do teto 1 | Grupo |
| **Declaração do Terceiro** (novo, **documento único**) | O terceiro (Pessoa, Empresa ou Entidade) | Declarante e documento (CPF ou CNPJ), NF(s), valor, data do pagamento, **uma** das frases ("ofereço sem direito a reembolso" ou "solicito reembolso"), data da declaração, assinatura. **Prova a Intenção** | A, B, C | Grupo |
| **Pedido de Reembolso** (novo, é a **Declaração do Terceiro na versão reembolso**) | O terceiro | A Declaração do Terceiro acrescida de **chave PIX ou dados bancários**, **lista das NFs** (número, emitente, valor) e declaração de que pagou com recurso próprio e não recebeu outra restituição | A | Grupo |
| **Prova do pagamento do terceiro** (novo tipo) | O terceiro | Cupom, fatura do cartão ou comprovante PIX/TED mostrando valor e data. **Prova o Responsável** (grau Formal) | A, B, C | Grupo |
| **Comprovante do reembolso** (existente) | Banco ou recibo assinado (se espécie) | Valor, data, favorecido | A | **Linha** da liquidação |
| **Declaração de Doação de Consumo** (novo, **mesmo componente da Declaração do Terceiro**, com lista de itens) | O doador | Doador, itens e quantidades, valor justo e base, data, destino, aceite da igreja | E | Doação direta |
| **Termo de Doação Patrimonial** (novo) | Doador e igreja | Descrição, série, estado, valor justo e base (NF original, avaliação ou pesquisa de preço), condições ou restrições, data, assinaturas, foto | D | Doação direta |
| **Termo de Adesão ao Serviço Voluntário** (novo) | Voluntário e igreja | Objeto, período, gratuidade, ausência de vínculo, assinaturas (Lei 9.608/1998) | F | Doação direta |
| **Registro do serviço prestado** (novo) | Tesouraria ou responsável | Descrição, data, horas, local | F | Doação direta |
| **Registro de entrega** (novo) | Responsável | Itens, quantidade, data, responsável. **Sem dados pessoais dos beneficiários** | E, quando o destino é distribuição | Doação direta |
| **Prova de cancelamento** (novo) | Emitente | Nota de cancelamento, evento na NF-e ou e-mail | Cancelado | Grupo |
| **Termo de Prestação de Contas** (novo) | A pessoa | NFs que comprovam o adiantamento, saldo devolvido ou descontado | Adiantamento | Grupo |
| **Ficha do Bem** (gerada pelo sistema) | App | Dados da seção 3.4, a partir do termo ou da NF | D e bem durável em A, B, C | Ficha |

### 6.1 Quanto de prova basta

**Não depende só do valor.** A suficiência do grau **Relatado** é decidida pela **Matriz de suficiência da prova** (seção 3.6): natureza da operação, patrimônio, lastro de NF e risco da relação, com o valor apenas como modulador que sobe o nível, nunca que o reduz.

Em todos os casos, vale que a **NF no CNPJ da igreja já prova a compra**; a Declaração do Terceiro prova só a **intenção**, e a prova do pagamento do terceiro prova o **responsável**.

Quando a matriz aceita o grau Relatado, o documento exigido pode ser **declaração simples** (texto com nome, CPF ou CNPJ, valor e data, registrado pela Tesouraria), com a Declaração do Terceiro assinada como **formalização recomendada** dentro do prazo.

---

## 7. Os seis cenários

> **Convenção:** "o app" é o DiakoniaApp; "contabilidade" é o escritório. As sugestões de lançamento são **informativas**: o escritório decide a conta.
>
> **Em termos da Quitação:** o Cenário A é **Responsável = Terceiro, Intenção = Reembolso**; o B é **Terceiro + Oferta**; o C é **Terceiro + Não declarada** (até alguém declarar, quando vira A ou B). O "Pedido de Reembolso" e a "Declaração de Intenção" citados abaixo são a **Declaração do Terceiro** (versão reembolso e versão oferta). Em todos, o grau de prova é medido pela matriz da seção 3.6.

### Cenário A: compra com reembolso

**Exemplo.** O pastor compra material. NF no CNPJ da igreja. A igreja devolve o dinheiro.

#### Fluxo operacional

| # | Quem | O que acontece | Estado da obrigação |
|---|---|---|---|
| 1 | Pastor | Compra com dinheiro próprio e entrega a NF, a prova do pagamento e, se houver, o Pedido de Reembolso | n/a |
| 2 | Tesouraria | Registra a NF. O app lê o destinatário: **CNPJ da igreja ⇒ a igreja é a compradora** | **Em Aberto**, credor = emitente |
| 3 | Tesouraria | Registra **Responsável = o terceiro** (Pessoa, Empresa ou Entidade) e **Intenção = Reembolso**, com o Pedido de Reembolso. **O reembolso exige grau Formal** (a matriz o coloca em Alto): sem o documento assinado, o item fica na fila Formalizar | Em Aberto, credor = **o terceiro** (**surge a dívida com o terceiro**) |
| 4 | Aprovador | Aprova, recusa (5.4) ou pede ajuste. Sem alçada, a Tesouraria aprova | Em Aberto, "Reembolso a pagar" |
| 5 | Tesouraria | **Aviso de extinção** no malote da competência (seção 10) | Em Aberto |
| 6 | Tesouraria | Paga a pessoa: **liquidação** (PIX, TED ou espécie), parcial ou total | **Pagamento Realizado** |
| 7 | Tesouraria | Concilia com o extrato (se bancário) ou confere (se espécie) | Conciliada ou **Conferida** |
| 8 | Sistema | Documentos completos | **Pronta para Malote** |
| 9 | Tesouraria | Envia o malote do mês | **Enviada** |
| 10 | Sistema | Fechamento aprovado cobrindo o mês | **Arquivada** |

#### Como surge a obrigação e a dívida com a pessoa
- **Obrigação:** nasce no passo 2, **por causa da NF no CNPJ da igreja**, e não depende de quem pagou.
- **Dívida com a pessoa:** nasce no passo 3. Quando o pastor paga o fornecedor, a dívida **com o fornecedor** se extingue, e a igreja passa a dever **o mesmo valor ao pastor**. É a **mesma obrigação**, com outro credor atual. Não se cria lançamento novo nem movimento de dinheiro.

#### Liquidação
É a liquidação comum, com **favorecido do pagamento = pessoa** e **documento = NF do fornecedor**. Aceita parcial. **Um PIX que paga várias NFs** usa a liquidação de várias despesas já existente (a linha do banco fica registrada na liquidação, como hoje).

#### Aprovação
Pedido simples: aprovação **posterior** (decisão sobre aceitar a dívida). Compra prévia (G): aprovação **antes**, pela Solicitação de Aprovação. As alçadas estão na seção 5.2.

#### Documentos que exigem
NF (CNPJ da igreja), prova do pagamento do pastor, Pedido de Reembolso, aprovação, comprovante do reembolso. Com G, a Solicitação de Aprovação também.

#### Como aparece para a contabilidade
- **Fato econômico:** a igreja adquiriu o bem ou serviço na data da NF.
- **Fato financeiro:** o reembolso, na data em que for pago.
- **Passivo:** reembolso a pagar à pessoa, entre a quitação e o reembolso.
- *Sugestão informativa:* na NF, despesa (ou estoque, ou imobilizado) contra "reembolso a pagar"; no pagamento, baixa do passivo contra banco ou caixa. **[confirmar]**

#### Malote
Duas etapas (seção 10): o **Aviso de extinção** (NF, prova do pagamento do pastor, Pedido, aprovação) na competência; o **comprovante do reembolso** no mês do pagamento.

#### Exceções
- **Reembolso ao pastor:** continua **separado do sustento** (prebenda tem regra própria).
- **NF mista** ou em CPF: seção 1.4.
- **Valor pago pelo pastor maior que a NF:** o excedente **não** é reembolso; precisa de declaração de oferta ou de devolução.

---

### Cenário B: compra ofertada à igreja

**Exemplo.** O pastor compra material, NF no CNPJ da igreja, não quer reembolso e considera oferta.

#### Fluxo

| # | Quem | O que acontece | Estado |
|---|---|---|---|
| 1 | Pastor | Entrega a NF, a prova do pagamento e a **Declaração de Intenção** ("ofereço sem direito a reembolso") | n/a |
| 2 | Tesouraria | Registra a NF; a igreja é a compradora | **Em Aberto** (credor = emitente) |
| 3 | Tesouraria | Registra **Responsável = o terceiro** e **Intenção = Oferta**, com a declaração. A matriz (3.6) decide se o grau **Relatado** basta ou se exige **Formal** | Credor = nenhum. **A obrigação se extingue** (se a prova for suficiente) |
| 4 | Sistema | Extinção por terceiro, sem conta | **Pagamento Realizado** (rótulo "Quitada por terceiro") |
| 5 | Tesouraria | **Confere** (não há extrato) | **Conferida** |
| 6 | Sistema | Documentos completos | **Pronta para Malote** |
| 7 | Tesouraria | Envia | **Enviada**, depois **Arquivada** |

#### Declaração de intenção
Formal, datada, assinada, com **a frase de oferta**. Se a declaração for **posterior** à compra, o app guarda as **duas datas** (compra e declaração). Isso protege contra oferta declarada depois, só para evitar o reembolso.

#### Como extingue a obrigação
Na declaração. **Sem declaração, não extingue**: fica **A esclarecer**.

#### Como aparece para a contabilidade
- **Fato econômico:** a igreja recebeu o bem ou serviço sem suportar o custo; a obrigação com o fornecedor foi quitada por um terceiro **por liberalidade**.
- **Fato financeiro:** **nenhum** na igreja. Sem caixa, sem banco.
- *Sugestão informativa:* despesa (ou estoque, ou imobilizado) e receita de doação não monetária, de mesmo valor; na DFC, só nota explicativa. **[confirmar]**
- O escritório recebe o **pacote**: NF, declaração, prova do pagamento do doador.

#### Malote
Uma etapa, na competência: NF, Declaração de Intenção, prova do pagamento do pastor. **Nada de comprovante bancário** (não houve).

#### Exceções
- **Mudar de oferta para reembolso** (ou o contrário) **antes** do envio: permitido, com motivo, quem e quando. **Depois**: só por reabertura.
- Bem durável: gera **Ficha do Bem** (seção 3.4).

---

### Cenário C: membro paga diretamente uma compra da igreja

**Exemplo.** O fornecedor emite NF para a igreja. O membro paga direto.

É **o cenário das 13 NFs sem rastro**. O app **não escolhe** entre A e B.

#### Árvore

| O que existe | Resultado |
|---|---|
| Declaração: **reembolso** | Vai para o fluxo do **Cenário A** |
| Declaração: **oferta** | Vai para o fluxo do **Cenário B** |
| **Nenhuma declaração** | **A esclarecer** |

#### Como registrar a intenção
Pela mesma Declaração de Intenção. Se o membro **não pode ser localizado**, a intenção continua **A esclarecer**: o Administrador decide uma das três saídas da seção 5.4. **Nunca** se escolhe oferta por conveniência.

#### As filas deste cenário
O Cenário C deixa de ser um caso à parte: é o estado **"Intenção = Não declarada"**. Há duas filas possíveis, conforme o que se sabe:
- **A esclarecer:** sabe-se quem pagou, não a intenção.
- **Investigar:** não se sabe nem quem pagou (Responsável = Não localizado). É o caso das **13 NFs sem rastro**.

Ambas: lista ordenada pela idade da NF; mostram emitente, valor, data, quem a igreja acha que pagou e o que falta; têm **dono** (Tesouraria) e **alerta** de prazo. **A esclarecer bloqueia** o fechamento e o malote para NFs a partir da vigência; Investigar aparece no relatório de pendências e envelhece.

#### Como extingue
Só depois da declaração, e o caminho é o de A (credor passa a ser a pessoa) ou o de B (extinta no ato).

---

### Cenário D: doação direta de bem

**Exemplo.** Notebook, projetor, impressora, móveis. Sem compra da igreja.

#### Quando é doação direta
A igreja **não** é a compradora: não há NF no CNPJ dela nem contratação prévia.

#### Fluxo

| # | Quem | O que acontece | Estado da doação |
|---|---|---|---|
| 1 | Doador | Entrega o bem e assina o **Termo de Doação Patrimonial** (com a base do valor justo: NF original, avaliação ou pesquisa de preço) | n/a |
| 2 | Tesouraria | Registra a **Doação direta**, natureza "bem durável" | **Registrada** |
| 3 | Aprovador | **Aceita** a doação (condições, restrições, estado do bem) | **Aceita** |
| 4 | Sistema | Gera a **Ficha do Bem** (descrição, série, valor justo, doador, local) | Aceita |
| 5 | Tesouraria | Confere os documentos | **Conferida** |
| 6 | Sistema | Documentos completos | **Pronta para Malote** |
| 7 | Tesouraria | Envia | **Enviada**, depois **Arquivada** |

#### Integração com Patrimônio
**O app não tem módulo de Patrimônio.** Existem só categorias de despesa ("Móveis e Equipamentos em Geral", "Manutenção de Imobilizado"); o imobilizado e a depreciação estão no escritório. Esta especificação cria o **mínimo**: a **Ficha do Bem** (3.4), com tombamento (número interno), responsável e local, e uma **relação de bens recebidos** para o escritório. A depreciação **continua com o escritório**.

#### Documentação mínima
Termo de Doação Patrimonial assinado, base do valor justo, foto. **Sem base de valor, o bem não passa de Registrada.**

#### Fluxo de aprovação
O aceite é do **Administrador** (e da diretoria, se assim a igreja decidir). Bem **com encargo ou restrição** (por exemplo, "só para a EBD") exige o aceite escrito dessas condições.

#### Como aparece para a contabilidade
- **Fato econômico:** a igreja recebeu um bem durável.
- **Financeiro:** nenhum.
- *Sugestão informativa:* ativo imobilizado pelo valor justo e receita de doação (imediata ou diferida); se o doador estipulou capital, patrimônio social. **[confirmar]**

---

### Cenário E: doação direta de material de consumo

**Exemplo.** Alimentos, refrigerantes, material de limpeza. Sem aquisição prévia da igreja.

#### Fluxo

| # | Quem | O que acontece | Estado |
|---|---|---|---|
| 1 | Doador | Entrega os itens e preenche a **Declaração de Doação de Consumo** (itens, quantidades, valor justo) | n/a |
| 2 | Tesouraria | Registra a Doação direta, natureza "consumo" e **destino** | Registrada |
| 3 | Aprovador | Aceita (Tesouraria, abaixo do teto) | Aceita |
| 4 | Sistema | Dá **entrada no estoque** (sem valor financeiro, valor justo informativo) | Aceita |
| 5 | Responsável | Registra a **entrega** (se houver distribuição) | Aceita |
| 6 | Tesouraria | Confere | **Conferida** |
| 7 | Sistema | Documentos completos | **Pronta**, depois Enviada e Arquivada |

#### Destino do item
| Destino | O que registrar |
|---|---|
| **Estoque** | Entrada em estoque (já existe). Saída quando for usado |
| **Uso imediato** | Entrada e saída no mesmo ato |
| **Distribuição** (ação social) | Registro de entrega: itens, quantidade, data e responsável, **sem dados dos beneficiários** |

#### A distinção que importa
Se o membro **comprou com NF no CNPJ da igreja** e entregou a NF, **não é doação direta**: é o **Cenário B** (compra ofertada), mesmo que o destino seja a ação social.

---

### Cenário F: serviço gratuito

**Exemplo.** Eletricista, designer, advogado, pedreiro, sem contratação da igreja.

#### Fluxo

| # | Quem | O que acontece | Estado |
|---|---|---|---|
| 1 | Voluntário e igreja | Assinam o **Termo de Adesão ao Serviço Voluntário** (Lei 9.608/1998), antes ou no início | n/a |
| 2 | Tesouraria | Registra a Doação direta, natureza "serviço" | Registrada |
| 3 | Responsável | Registra o serviço prestado (descrição, data, horas) | Registrada |
| 4 | Aprovador | Aceita | Aceita |
| 5 | Tesouraria | Confere | **Conferida** |
| 6 | Sistema | Documentos completos | **Pronta**, Enviada, Arquivada |

#### Tratamento recomendado, **sem assumir política contábil**
O app oferece **três níveis**, definidos pela igreja com o escritório (decisão 2):

| Nível | O que o app faz |
|---|---|
| **0: só registro** (**padrão recomendado até a decisão**) | Registra o fato, o termo e as horas. Aparece em **nota explicativa** no malote. **Nenhum valor** |
| **1: com valor justo** | Exige a base do valor justo. Aparece como receita e despesa de mesmo valor, se o escritório decidir **[confirmar]** |
| **2: só para o que tiver NF** | Quando há cobrança, **não é F**: é obrigação normal |

#### Documentação
Termo de adesão (obrigatório), registro do serviço, e, no nível 1, a **base do valor justo** (tabela, orçamento semelhante).

#### Cuidados que o app aponta
- Serviço **habitual e subordinado** pode configurar vínculo: o app acusa recorrência (mais de N serviços do mesmo voluntário por mês).
- Serviço de **empresa** (com NF) é oferta (B) ou obrigação, nunca F.
- **Ajuda ao ministro** que seria remuneração fica fora do F.

---

## 8. Adiantamento e prestação de contas

### 8.1 O que é
Dinheiro da igreja entregue a uma pessoa **antes** da NF. É **fato financeiro sem fato econômico ainda**. Hoje é o que o escritório chama de "Adiantamentos" (R$ 51.938,29) e "Ativo em Processamento".

### 8.2 Fluxo

| # | O que acontece |
|---|---|
| 1 | Aprovação do adiantamento (valor, finalidade, prazo) |
| 2 | Pagamento (liquidação comum, conciliada com o extrato) |
| 3 | **Aguardando prestação de contas**, com prazo |
| 4 | A pessoa entrega as NFs e o Termo de Prestação de Contas |
| 5 | Cada NF **compensa** o adiantamento (extinção "Compensado por adiantamento") |
| 6 | O que **sobrou** volta por **devolução** (entrada real) ou **desconto** (Sustento, no caso de prebenda) |

### 8.3 Regras
- **Sem prestação de contas no prazo**, o adiantamento aparece como **vencido** e entra no fechamento.
- Pagamento a pessoa **sem NF e sem adiantamento aprovado** é **"falta documento"**, não "pago".
- Adiantamento de **prebenda** segue a Conta Corrente de Sustento (competência, desconto).

---

## 9. Regras transversais

| # | Regra |
|---|---|
| **R1** | **A intenção nunca se presume.** Sem declaração, a Intenção é "Não declarada" e a situação é "A esclarecer". Vale para todo terceiro que pagou (Pessoa, Empresa ou Entidade). Propriedade do fato, não regra de tela. |
| **R2** | **Prazo de esclarecimento.** Alerta depois de N dias da NF (decisão 5). As filas A esclarecer, Formalizar e Investigar nunca somem sozinhas. |
| **R3** | **Segregação de funções.** Quem aprova não é o favorecido. Quem paga prefere ser diferente de quem aprova. |
| **R4** | **Valor da NF e valor quitado.** O reembolso nunca passa do valor da NF. O excedente exige declaração de oferta ou devolução. |
| **R5** | **Duplicidade.** A mesma NF (pela chave de acesso ou por emitente, número e valor) não entra duas vezes. O mesmo comprovante de reembolso não paga duas NFs. |
| **R6** | **Documento fora do CNPJ da igreja.** Reembolso de NF em CPF ou sem identificação **não é regra**. É exceção do **Administrador**, tratada como adiantamento a regularizar, com motivo e prazo. Risco de remuneração disfarçada (IRRF e INSS) indicado na tela. |
| **R7** | **Mudança de intenção** antes do envio: permitida, com motivo, quem e quando. Depois: **reabertura auditada**. |
| **R8** | **Reembolso parcial:** aceito. O saldo continua "a pagar". |
| **R9** | **Vários itens num pedido:** o Pedido de Reembolso agrupa NFs de uma pessoa. O pagamento único se liga à liquidação, não a uma NF só. |
| **R10** | **Pastor e prebenda:** o reembolso de despesa nunca se mistura com o sustento. |
| **R11** | **Doação com condição ou encargo:** exige o aceite escrito das condições e guarda a restrição na ficha. |
| **R12** | **LGPD:** declarações e termos têm CPF. Acesso só para as funções do financeiro. Registro de entrega sem dados de beneficiários. |
| **R13** | **Proibição do fluxo fictício.** Nenhuma operação deste modelo cria **entrada, transferência ou saída** para representar um fato sem dinheiro. **Entrada em espécie exige contagem do envelope** (Caixa de Envelopes). **Transferência só entre contas reais.** O sistema **detecta o padrão antigo** (entrada em ofertas, transferência e saída de mesmo valor no mesmo período) e avisa. |
| **R14** | **Vigência.** Os bloqueios (a esclarecer, documento, adiantamento vencido) valem para NFs a partir da **data de entrada em produção**. O histórico anterior segue a regularização (seção 15, fase 7). |
| **R15** | **Nada se reescreve em silêncio.** Qualquer correção do passado é auditada (padrão da reabertura e da conta auditada). |
| **R16** | **O grau Relatado só vale se a matriz da seção 3.6 o aceitar.** A decisão pesa natureza da operação, patrimônio, lastro de NF e risco da relação; o pior eixo manda; o valor só eleva o risco, nunca o reduz. Formalização vencida sobe um nível. |
| **R17** | **Reembolso nunca é pago com base em Relatado.** Dinheiro da igreja só sai com intenção Formal. Compensação de adiantamento também não aceita Relatado. |
| **R18** | **Quem declara não é quem registra.** O declarante é sempre o terceiro; a Tesouraria registra. O terceiro não pode aprovar nem registrar a própria quitação. |
| **R19** | **Responsável é sempre um cadastro** (Pessoa, Empresa ou Entidade), nunca texto livre. Empresa e Entidade exigem CNPJ. |

---

## 10. Malote contábil

### 10.1 Princípio

> **Nada vai ao malote sem lastro.** Não se envia comprovante de pagamento que não houve.

### 10.2 Por que o malote precisa de duas etapas no reembolso

O escritório **já recebe as NFs pelo próprio sistema fiscal**: elas entram na contabilidade como "fornecedores a pagar". Se a igreja não avisa **quem as pagou**, a NF fica aberta para sempre. É exatamente o que a auditoria encontrou nas contas 211005 e 211006.

Por isso, no Cenário A, o malote tem **dois momentos**:

| Etapa | O que vai | Quando |
|---|---|---|
| **1. Aviso de extinção** | NF, prova do pagamento do terceiro, Pedido de Reembolso, aprovação | No mês da NF (competência) |
| **2. Liquidação do reembolso** | Comprovante do reembolso | No mês em que a igreja reembolsa |

Entre as duas, a obrigação aparece no malote como **"obrigação com pessoa em aberto"** (informativa, sem congelar), e o escritório reclassifica o fornecedor para "reembolso a pagar".

### 10.3 O que segue em cada cenário

| Cenário | Documentos | Pasta sugerida | Quando |
|---|---|---|---|
| **Pago pela igreja** | NF, comprovante (extrato ou conferência) | Pagamentos (existente) | Mês do pagamento |
| **A: reembolso** | **Etapa 1:** NF, prova do pagamento do pastor, Pedido, aprovação · **Etapa 2:** comprovante do reembolso | **Reembolsos** | Etapa 1 na competência, etapa 2 no mês do pagamento |
| **B: oferta** | NF, Declaração de Intenção, prova do pagamento do doador | **Compras ofertadas** | Competência (uma etapa) |
| **C: membro paga direto** | Os de A ou B, conforme a declaração | Reembolsos ou Compras ofertadas | Idem |
| **D: doação de bem** | Termo de Doação Patrimonial, base do valor justo, foto, Ficha do Bem | **Patrimônio recebido** | Mês do aceite |
| **E: doação de consumo** | Declaração de Doação, registro de entrada em estoque, registro de entrega | **Doações de consumo** | Mês do aceite |
| **F: serviço gratuito** | Termo de adesão, registro do serviço, base do valor (nível 1) | **Serviços voluntários** | Mês do serviço |
| **Compensado por adiantamento** | NF, Termo de Prestação de Contas, referência ao adiantamento | Adiantamentos | Mês da prestação |
| **Cancelado** | NF, prova do cancelamento | **NFs canceladas** | Mês do cancelamento |
| **A esclarecer / Formalizar** | **Nada** (não está pronto) | Relatório de pendências | Lista informativa mensal |
| **Investigar** (Responsável = Não localizado) | **Nada** (conta em aberto) | Relatório de pendências | Lista informativa mensal, com a idade da NF |
| **Quitação aceita com grau Relatado** (níveis Baixo e Médio aprovado) | Os do cenário, **com selo "Relatado"** e nota "formalização pendente" | A do cenário | Na competência; a formalização posterior segue em complemento |

### 10.4 O que não muda
Lote mensal, **Enviar Malote** captura as Prontas do mês naquele momento, Enviada congela só os campos já definidos, **Arquivada** exige fechamento aprovado, mês antigo não vira Enviado automaticamente, reabertura só Administrador e Tesouraria com motivo.

---

## 11. Efeitos nos números

| Cenário | Saldo e fluxo de caixa | Despesa no DRE | Receita de doação no DRE | Passivo | Estoque ou patrimônio |
|---|---|---|---|---|---|
| **Pago pela igreja** | sai | sim | não | não | conforme a natureza |
| **A: reembolso** | sai **só no reembolso** | sim (competência da NF) | não | **sim**, até pagar | conforme a natureza |
| **B: oferta** | **não muda** | sim | **sim**, pareada | não | conforme a natureza |
| **C** | conforme A ou B | idem | idem | idem | idem |
| **D: bem** | **não muda** | não (vira ativo) | sim **[confirmar]** | não | **Ficha do Bem** |
| **E: consumo** | **não muda** | ao consumir ou distribuir | sim, com restrição se ação social | não | **estoque** |
| **F: serviço** | **não muda** | só no nível 1 | só no nível 1 | não | não |

**Consequências para os relatórios:**
- **Saldo e fluxo de caixa** só se movem com dinheiro da igreja. Acaba o saldo inflado.
- **Ofertas e dízimos** voltam a ser **só dinheiro contado**.
- **DRE** ganha uma linha de receita "doações não monetárias" **pareada** com a despesa correspondente, e o resultado do consumo fica neutro.
- **Fechamento do mês** passa a conferir: "a esclarecer", reembolsos a pagar, adiantamentos vencidos, itens sem documento.

---

## 12. Reaproveitamento: o que existe, o que criar, o que alterar

| Parte do sistema | Já existe | Reutilizar | **Criar** | **Alterar** |
|---|---|---|---|---|
| **Obrigação** (`obrigacao_id`, grupo, parcelas) | Sim (D1) | Identidade e documentos do grupo | Fatos: comprador, natureza do item, **Quitação** (responsável, intenção, grau de prova, histórico) e aprovação. Extinção e credor atual são **derivados** | Nada na identidade |
| **Ciclo e estados** (view e biblioteca) | Sim (8 estados, derivação por fatos) | Todos os estados e a lógica de derivação | Indicadores (reembolso a pagar, a esclarecer, adiantamento vencido) | O significado de "Pagamento Realizado" (extinção); "Conferida" para extinção não bancária |
| **Lançamento realizado e saldo** | Sim: realizado exige conta e mexe no saldo | Tudo, para o que é dinheiro | — | **Ponto central:** a extinção por terceiro **não pode exigir conta nem mexer em saldo.** É a maior alteração; a forma técnica será decidida no desenho técnico, e este requisito é inegociável |
| **Aprovação** (`aguardando_aprovacao`, aprovar e rejeitar) | Sim, mas **aprovar = pagar** | O conceito e a fila "Aprovar pendências" | Decisão registrada: quem, quando, motivo, sem pagar | **Separar aprovação de pagamento** |
| **Liquidação** (parcial, vários itens, pagamento existente) | Sim | Reembolso parcial, várias NFs e PIX único | — | Favorecido do pagamento diferente do emitente |
| **Extrato, OFX, PDF, vínculo único** | Sim (D4) | Integral | — | Nada |
| **Conciliada × Conferida** | Sim | Integral | — | Nada na definição |
| **Anexos e documentos** | Sim (tipos, dispensa, documento do grupo e comprovante da linha) | Tipos atuais e as regras de grupo e linha | **Tipos novos** (6.): declaração, pedido, termos, registros, prova de cancelamento, termo de prestação | Regra de "documento exigido" por cenário |
| **Favorecido e Pessoas** | Sim (favorecido ligado a Pessoas, com CNPJ/CPF; chave PIX da pessoa) | Pessoa como responsável, doador e beneficiário; Favorecido com CNPJ para **Empresa** e **Entidade** | O papel de **credor atual** (derivado) e o vínculo "responsável pela quitação" | O pagamento do reembolso usa o terceiro, não o emitente |
| **Matriz de suficiência da prova** | Não existe | Parâmetros e auditoria no padrão da conta auditada | **Matriz 3.6**: eixos, moduladores, tetos e prazos parametrizáveis; selo "Relatado" | — |
| **Mesa de Operações e Contas a pagar** | Sim | Estrutura e filtros | **Filas**: reembolsos a pagar, a esclarecer, adiantamentos a prestar contas | — |
| **Malote** (lote, Enviada, Arquivada, reabertura, congelamento) | Sim (D6) | Integral | **Aviso de extinção**, pastas novas, relatório de pendências | Lista de campos congelados inclui intenção e extinção |
| **Estoque** (itens e movimentos) | Sim | Movimentos | Entrada "por doação" sem valor financeiro | — |
| **Patrimônio** | **Não existe** | — | **Ficha do Bem** mínima e a relação de bens recebidos | — |
| **Sustento** (competência, adiantamento, desconto) | Sim | Padrão para adiantamento de prebenda | — | Garantir separação entre reembolso e sustento |
| **Arrecadação** (`reembolso_pessoa`, `abate_compra_cnpj`) | Sim, **no módulo de aluguel de espaços** | Aprendizado | — | **Absorver** o conceito para não haver duas ideias de reembolso |
| **Leitura de documentos** (boleto, guia, fatura, QR) | Sim | Estrutura de leitura e o aprendizado | Leitura de **NF-e/DANFE**: destinatário, valor, **chave de acesso** | Avaliar "a igreja é a compradora?" automaticamente |
| **Ofertas e envelopes** | Sim | Dinheiro contado | Contagem obrigatória na entrada em espécie | — |
| **Fechamento e Pacote Contábil** | Sim | Estrutura | Conferências novas (a esclarecer, reembolso, adiantamento) | — |
| **DRE e categorias** | Sim | Estrutura | Categorias de receita "doações não monetárias" (e "trabalho voluntário", se o nível 1 for adotado) | Linha pareada |
| **Conta auditada, reabertura, backup de limpeza** | Sim | Padrão para auditar mudanças | — | Aplicar a mudança de intenção |
| **`fin_solicitacoes`** (solicitações por ministério) | Tabela antiga **sem uso** na tela | — | — | **Decisão técnica:** reaproveitar ou ignorar. Recomendação: não reaproveitar, porque não tem auditoria nem vínculo com a obrigação |

---

## 13. Compatibilidade com a arquitetura aprovada e critérios de aceite

### 13.1 Compatibilidade

| Pilar aprovado | Como o modelo o respeita |
|---|---|
| **Obrigação como identidade** (D1) | Reembolso, oferta e adiantamento são **destinos da mesma obrigação**; nenhuma entidade nova substitui a obrigação |
| **Estados derivados e "Atrasada" visual** (D2 e D5) | Os 8 estados ficam; as novidades são **indicadores**, como já é a atrasada |
| **Gerador de recorrências e leitores de anexo** (D3 e D7) | Os leitores já olham o grupo inteiro; as declarações e termos entram no grupo |
| **Vínculo bancário único e conferência** (D4) | Extinção por terceiro termina em Conferida; um PIX liga a uma só despesa (vários itens usam a liquidação) |
| **Malote com Enviada e Arquivada** (D6) | Inalterado, com pastas e campos congelados a mais |
| **Conta auditada** | O mesmo padrão audita a intenção |
| **Mesa de Operações** | Ganha filas, sem mudar a lógica |

### 13.2 Critérios de aceite (resumo)

**Globais**
1. Nenhuma operação deste modelo cria entrada, transferência ou saída em conta.
2. O saldo de qualquer conta só muda quando há liquidação com dinheiro da igreja.
3. Toda NF com intenção não declarada aparece em "A esclarecer" e **não** chega a Pronta.
4. Toda mudança de intenção ou de responsável fica com quem, quando e motivo, **acrescentada ao histórico**, sem apagar a anterior.
5. **Extinção, credor atual, estado, fila e pasta do malote são derivados** do par (responsável, intenção): não existe campo para editá-los diretamente.
6. **Reembolso só é pago com intenção Formal.** Dado um reembolso com intenção em grau Relatado, quando se tenta pagar, então o app recusa e a NF vai para a fila Formalizar.
7. **Dado o mesmo grau Relatado em situações diferentes, o resultado difere conforme a matriz.** Oferta de consumo de R$ 60 com NF e terceiro fora do circuito é aceita; a mesma oferta com o terceiro sendo quem aprova exige Formal; oferta de empresa fornecedora de R$ 50 exige Formal.
8. **Formalização vencida sobe um nível** (Baixo passa a exigir o Administrador; Médio passa a exigir Formal).
9. **O valor nunca rebaixa o nível.** Dado um item de valor baixo em eixo Alto, o nível é Alto.

**Cenário A**
- Dado uma NF no CNPJ da igreja paga por um pastor com pedido aprovado, quando a Tesouraria registra, então a obrigação fica Em Aberto com credor = pessoa e sem movimento de saldo.
- Quando o reembolso é pago e conciliado, então vai a Conciliada e Pronta, e o saldo da conta cai uma vez só.
- Quando a NF pertence à competência de agosto e o reembolso é pago em setembro, então o aviso vai no malote de agosto e o comprovante no de setembro.

**Cenário B**
- Dado uma NF com Declaração de Oferta, quando a Tesouraria registra, então a obrigação se extingue, **não há** conta nem saldo, e o item vai a Conferida.
- Dado uma declaração **posterior** à compra, então ficam registradas as duas datas.

**Cenário C**
- Dado uma NF paga por membro sem declaração, então o item aparece em "A esclarecer", ordenado pela idade, e **bloqueia** o fechamento do mês (para NFs a partir da vigência).

**Cenário D**
- Dado um bem doado sem base de valor, então a doação **não passa** de Registrada.
- Dado um bem aceito, então existe uma Ficha do Bem e a relação para o escritório.

**Cenário E**
- Dado alimento doado para ação social, então entra no estoque **sem valor financeiro** e a entrega é registrada **sem dados dos beneficiários**.
- Dado alimento comprado com NF no CNPJ da igreja, então **não é doação direta** (é o Cenário B).

**Cenário F**
- Dado um serviço voluntário sem termo de adesão, então a doação **não passa** de Registrada.
- No nível 0, **nenhum valor** aparece nos números.

---

## 14. Decisões pendentes

| # | Decisão | Quem | Recomendação padrão |
|---|---|---|---|
| 1 | **Parâmetros da Matriz de suficiência da prova** (seção 3.6): teto 1 (M2), prazo de declaração (M1), teto anual e quantidade (M3), limite de capitalização (eixo 2), quem compõe o "circuito" (eixo 4) e prazo de formalização | Igreja e escritório | Teto 1 de R$ 500,00; M1 de 30 dias; M3 de R$ 2.000,00 e 3 operações no trimestre; formalização em 30 dias; limite de capitalização **[confirmar]**. **Substitui o antigo "limite pequeno" de R$ 100**: o valor sozinho não decide mais |
| 2 | **Trabalho voluntário**: nível 0, 1 ou 2 | Igreja e escritório | Nível 0 até o escritório decidir |
| 3 | **Formalidade da declaração**: assinatura manuscrita (foto ou PDF), assinatura eletrônica externa, ou mensagem de WhatsApp com print | Igreja | Assinada (foto ou PDF) para o grau Formal; mensagem de WhatsApp com print vale como **Relatado**, e só onde a matriz 3.6 aceitar esse grau |
| 4 | **Alçadas**: teto 1 de reembolso e quem aprova acima | Igreja | Teto 1 de R$ 500,00; Administrador acima; nunca o próprio favorecido |
| 5 | **Prazos**: esclarecimento de "a esclarecer", reembolso, prestação de contas | Igreja | 30 dias para esclarecer; 10 dias para reembolsar; 30 dias para prestar contas |
| 6 | **Bem durável**: limite de capitalização; receita imediata ou diferida; quando vai a patrimônio social | Escritório | **[confirmar]** |
| 7 | **Contas da doação não monetária** e do voluntariado | Escritório | **[confirmar]** |
| 8 | **Aviso de extinção na competência** (recomendado) ou NF só depois do reembolso | Escritório | Aviso na competência (a NF já chega ao escritório pelo sistema fiscal) |
| 9 | **Reembolso ao pastor** e prebenda: lista do que se pode reembolsar | Igreja e escritório | Sempre separados |
| 10 | **Recibo ao doador**: a igreja emite? Com que texto? | Igreja | Declaração de recebimento, **sem** efeito para Imposto de Renda |
| 11 | **Aprovação de aceite de bem**: Administrador sozinho ou com a diretoria | Igreja | Administrador; diretoria acima de R$ 2.000,00 |
| 12 | **ITCMD** sobre doação recebida (imunidade dos templos) | Escritório | **[confirmar]** |
| 13 | **Vigência**: data a partir da qual valem os bloqueios | Igreja | Primeiro dia do mês seguinte à entrada em produção |

---

## 15. Ordem de implantação

Só a ordem, as entregas e as dependências. Cada fase termina em algo verificável.

| Fase | Entrega | Depende de | O que **não** faz |
|---|---|---|---|
| **0** | Aprovação desta especificação e das decisões 1 a 13 (reunião com o escritório) | — | Nada no sistema |
| **1** | **Quitação como fato e as quatro filas**: responsável, intenção, grau de prova, matriz de suficiência, filas Investigar, A esclarecer, Formalizar e Reembolso a pagar, aviso do padrão antigo (R13). Dá nome às **13 NFs** | Fase 0 | Não muda saldo nem estados |
| **2** | **Extinção por terceiro**: oferta e reembolso (declaração, aprovação separada do pagamento, sem conta) | Fase 1 | Não paga reembolso ainda |
| **3** | **Liquidação do reembolso**: credor diferente do emitente, PIX da pessoa, várias NFs, parcial | Fase 2 | — |
| **4** | **Doação direta** (consumo, bem, serviço), Ficha do Bem, estoque | Fase 0 | Não calcula depreciação |
| **5** | **Adiantamento e prestação de contas** com compensação | Fases 2 e 3 | Não mexe no Sustento |
| **6** | **Malote, fechamento, DRE e indicadores** com as pastas e os avisos | Fases 2 a 5 | — |
| **7** | **Regularização do histórico** (entradas fictícias, adiantamentos antigos), com estorno **auditado** e combinado com o escritório | Todas e a política | Nada em silêncio |

---

## 16. Recomendação arquitetural única

> **Adotar o Modelo C: Aquisição, Extinção e Doação direta, sobre a obrigação que já existe.**

**Em uma frase:** a igreja é a compradora quando há NF no CNPJ dela ou contratação prévia; então nasce **uma obrigação** que responde a duas perguntas, **quem quitou** (Igreja, Pessoa, Empresa ou Entidade) e **por quê** (Reembolso, Oferta ou Compensação de adiantamento), cada uma com seu **grau de prova**; tudo o mais (extinção, credor, estado, fila, malote) é **consequência** desse par, e **só um dos resultados** mexe no caixa; se a igreja não comprou, a doação **nasce já extinta**; a intenção do terceiro **nunca se presume**; e o grau **Relatado** só vale quando a **matriz de suficiência** o aceita, nunca por causa só do valor.

**Por que esta e não outra:**
1. **Reaproveita quase tudo** (obrigação, 8 estados, liquidação, vínculo bancário, conferência, documentos, malote). A obra já feita é **completada**, não contornada.
2. **Mata o dinheiro fictício na origem.** Sem conta, sem saldo, sem extrato para o que não foi dinheiro.
3. **Resolve a causa das pendências**: o escritório recebe as NFs sozinho e **nunca soube quem as pagou**. O Aviso de extinção fecha essa lacuna.
4. **Mantém a contabilidade como dona da política.** O app guarda fatos e provas e deixa o tratamento paramétrico.
5. **Cabe numa igreja pequena.** Para cada NF, o tesoureiro responde a três perguntas: quem pagou, qual a intenção, qual a prova.

**As quatro alterações que merecem atenção na aprovação:**
- A **extinção por terceiro não pode exigir conta nem mexer em saldo** (hoje o lançamento realizado faz as duas coisas).
- A **aprovação precisa deixar de ser sinônimo de pagamento**.
- O **malote ganha dois momentos** no reembolso (aviso na competência, comprovante no pagamento).
- **Não existe Patrimônio**: cria-se só a Ficha do Bem; a depreciação fica com o escritório.
