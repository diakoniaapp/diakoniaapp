# Adendo 2: Declaração do Terceiro gerada pelo sistema e matriz escalonada do reembolso

> **Para aprovação. 14/10/2026.** Este adendo redesenha a regra de reembolso da Fase 1 **antes de qualquer migration ou código**. A especificação (versão 3) e a Política (versão 2) já foram atualizadas. O que este documento acrescenta: a matriz em detalhe, o documento, os impactos, o que muda em cada fase e **quais objetos do banco e do aplicativo precisam ser substituídos**.
>
> **Nada foi alterado no banco nem no aplicativo.** As Fases 1A a 1C estão aplicadas em produção e **não são editadas**: a mudança entra como **nova migration (Fase 1D)**, que substitui as definições vigentes.

## 1. A decisão

| | Antes (versão 2) | Depois (versão 3) |
|---|---|---|
| **Intenção** | Obrigatória, nunca presumida | **Igual.** Continua obrigatória e nunca presumida |
| **Documento da intenção** | Três documentos: Pedido de Reembolso, Declaração de Intenção, Declaração de Oferta | **Um só: Declaração do Terceiro**, **gerada pelo sistema** |
| **Como nasce** | A Tesouraria anexa um papel que alguém redigiu | O sistema monta o documento com o que já está cadastrado; **só a frase da intenção registrada** é impressa, **sem caixas para marcar** |
| **Prova do pagamento do terceiro (reembolso)** | Sempre obrigatória | **Escalonada por risco:** dispensada no Baixo, facultativa no Médio, obrigatória no Alto |
| **Aprovação do reembolso** | Tesouraria até R$ 500; acima, Administrador | **Baixo:** Tesouraria. **Médio e Alto:** Administrador. Sempre outra pessoa que não o favorecido |
| **Oferta** | Matriz escalonada | **Sem mudança** (não foi endurecida) |

Controle que **não muda**, em todos os casos: nota fiscal válida (ou contratação formal) · Declaração do Terceiro assinada · aprovação por pessoa diferente do favorecido · comprovante do pagamento **da igreja** ao terceiro · trava contra pagamento duplicado.

## 2. A matriz do reembolso (nível = o pior de quatro eixos, mais moduladores)

| Eixo | Baixo | Médio | Alto |
|---|---|---|---|
| **1. Valor da nota** | até **R$ 300,00** | **R$ 300,01 a R$ 1.500,00** | acima de **R$ 1.500,00** |
| **2. Natureza do item** | consumo e estoque | bem durável abaixo do limite de capitalização | durável acima do limite (ou limite ainda não definido) · serviço ou prestador · bem registrável · aumento de patrimônio |
| **3. Lastro de NF** | NF-e/NFS-e no CNPJ da igreja, chave conferida, valor igual · **cupom fiscal legível no CNPJ da igreja, até R$ 300,00** | documento fiscal no CNPJ sem chave · cupom legível **acima de R$ 300,00** · valor diferente | contratação formal sem nota ainda · documento ilegível, rasurado ou em nome diferente |
| **4. Relação** | pessoa fora do circuito financeiro | ministro, diretor ou conselheiro fora do circuito · intenção alterada recentemente | terceiro **no circuito** (aprova, registra, concilia, paga) · **Empresa ou Entidade** · pede recibo com efeito fiscal · parentesco com quem aprova |

**Moduladores** (sobem um nível cada; máximo dois ao todo): **M1** Declaração assinada mais de 30 dias depois do pagamento · **M3** acumulado do terceiro acima de R$ 2.000,00 no ano, ou 3 ou mais reembolsos no trimestre sem prova do pagamento · **M4** competência com fechamento aprovado · **formalização vencida** (Declaração não assinada em 30 dias). **M2 deixa de valer para o reembolso**: o valor já é um eixo (contá-lo duas vezes puniria o mesmo fato).

| Nível | Basta | Prova do pagamento do terceiro | Aprova |
|---|---|---|---|
| **Baixo** | NF válida + Declaração assinada | **Dispensada** | Tesouraria |
| **Médio** | NF válida + Declaração assinada + aprovação do Administrador | **Facultativa** | Administrador |
| **Alto** | NF válida + Declaração assinada + prova do pagamento do terceiro | **Obrigatória** | Administrador |

**Casos, para ler a regra na prática** (tudo supõe Declaração assinada e NF no CNPJ da igreja):

| Situação | Nível | O que acontece |
|---|---|---|
| R$ 40 em dinheiro, consumo, NF com chave, pessoa fora do circuito | **Baixo** | Basta a Declaração. Tesouraria aprova. Sem comprovante do terceiro |
| R$ 40 com **cupom fiscal legível** no CNPJ da igreja (sem chave digitada) | **Baixo** (decisão de 14/10) | Basta a Declaração; Tesouraria aprova |
| R$ 450 com cupom legível, sem chave | **Médio** (valor e lastro) | Administrador aprova |
| R$ 280, consumo, quem comprou é pastor/diretor fora do circuito | **Médio** (relação) | Administrador aprova |
| R$ 280, mas quem comprou é quem concilia o financeiro | **Alto** | Comprovante obrigatório |
| R$ 900, consumo | **Médio** | Administrador aprova |
| R$ 1.500,00 / R$ 1.500,01 | **Médio** / **Alto** | O limite de R$ 1.500,00 é inclusivo no Médio |
| R$ 120, bem durável, limite de capitalização ainda não definido | **Alto** | Comprovante obrigatório (o lado seguro) |
| R$ 200, quem pagou foi uma empresa | **Alto** | Comprovante obrigatório |
| 4º reembolso do trimestre da mesma pessoa, R$ 100 | **Médio** (M3 sobe de Baixo) | Administrador aprova: é o controle contra fracionar compras |

**Os 3 reembolsos em aberto hoje:**

| Nota | Situação no banco | Pela nova matriz |
|---|---|---|
| NF 106, Rio Cinelândia (vidros), R$ 220,00 | Sem quitação: "A esclarecer" | Natureza ainda não informada. Se for consumo com NF no CNPJ da igreja: Baixo; se for bem durável: Alto |
| NF 10998, Giovanelli (embalagens), R$ 767,10 | Sem quitação: "A esclarecer" | Se for consumo: **Médio** (Administrador aprova; comprovante facultativo) |
| Leandro, instalação de carpetes, R$ 1.500,00 | **Já tem quitação registrada por você em 13/10 às 23:01**: Pessoa + Reembolso, com **Pedido de Reembolso** e **prova do pagamento** anexados; ainda sem decisão de aprovação | Instalação é **serviço**: nível **Alto**. Já tem o comprovante, então **nada muda na prática**: o Administrador aprova. O Pedido de Reembolso anexado passa a valer como **declaração externa** |

**Nenhuma decisão é tomada sobre os dois primeiros**: continuam "A esclarecer" até alguém confirmar quem pagou.

## 3. A Declaração do Terceiro

**Duas versões do mesmo documento. Cada via imprime só a frase da intenção registrada.**

> **DECLARAÇÃO DO TERCEIRO** · nº DT-2026-0001 · código de verificação a1b2c3d4e5f6
>
> Eu, ________ (nome e CPF/CNPJ do cadastro), declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e **SOLICITO O REEMBOLSO** do valor pago.
>
> Fornecedor · NF (número, chave, data) · Valor · Forma de pagamento · Data do pagamento · **Chave PIX**
> Classificação (informativa): Centro · Categoria
>
> Data da assinatura: ____ · Assinatura: ____

> (versão oferta) ...declaro que realizei o pagamento da(s) despesa(s) abaixo em nome da igreja e **ESTOU OFERTANDO esta despesa, sem solicitar reembolso**. *(sem chave PIX)*

| Dado do documento | De onde vem no sistema |
|---|---|
| Declarante e CPF/CNPJ | Cadastro de pessoa, empresa ou entidade (o **Responsável** da quitação) |
| Fornecedor, NF, data, chave | A nota registrada |
| Valor | Valor da obrigação |
| Centro, categoria | Classificação da despesa (**informativos**) |
| **Forma de pagamento do terceiro** | **Fato novo**, informado ao registrar a quitação (dinheiro, PIX, cartão, transferência, outro). É o único campo novo |
| Data do pagamento | Já existe (data em que o terceiro pagou) |
| Chave PIX | Cadastro da pessoa ou do favorecido (só reembolso). Se não houver, o sistema pede para cadastrar **antes** de gerar |
| Frase da intenção | A intenção registrada: **ela decide qual das duas versões imprime** |
| Número e código | Sequência anual e código de verificação do conteúdo |

**Regras do documento:**
1. **Gerado, nunca digitado.** O usuário não escreve nada.
2. **Sem caixas:** a intenção não pode ser trocada depois da assinatura.
3. **O sistema guarda o que gerou** (número, versão, conteúdo e código). É o que permite provar o que o terceiro assinou.
4. **Assinatura:** original, foto legível ou PDF (cláusula 10.4). Ao anexar a via assinada, informa-se a **data da assinatura**: ela passa a ser a data da declaração. **As duas datas ficam guardadas** (pagamento e declaração), como já era.
5. **Declaração desatualizada:** se mudar declarante, fornecedor, nota, valor, forma ou data de pagamento, chave PIX ou intenção **depois** de gerada, a via assinada **não vale mais** para o registro atual (grau da intenção volta a Relatado; fila Formalizar). **Centro e categoria não invalidam** (reclassificar é rotina e não é o terceiro que declara).
6. **Declaração externa:** as assinadas fora do sistema (as anteriores e os termos históricos, como o do D Flesh) continuam aceitas, marcadas "externa".
7. **Uma declaração por nota** na primeira versão. A declaração agrupada (várias notas de uma pessoa) fica como evolução, decidida à parte.
8. **Assinatura eletrônica:** não nesta fase; só depois de validada pelo escritório.

## 4. Impactos

**1. Matriz de risco.** O reembolso deixa de ser "sempre Alto". Passa a ter eixo de valor e perde o M2. A oferta não muda. A regra "intenção Formal é condição para aprovar e pagar" **fica**, mas a intenção agora nasce da Declaração gerada e assinada.

**2. Auditoria.** Ganha: documento padronizado, numerado e verificável, com o conteúdo guardado; "pagamento declarado" visível; relatório mensal de reembolsos e ofertas **sem comprovante do terceiro** para amostragem. Perde: a prova do pagamento do terceiro nos níveis Baixo e Médio. É a troca consciente. Contra fracionamento: teto por pessoa (M3), aviso de compras repetidas, aprovação sempre por outra pessoa.

**3. Bloqueios.** A lógica por fila **não muda**: A esclarecer e Formalizar bloqueiam (depois da vigência); Reembolso a pagar e Investigar só avisam. **Muda quem cai em Formalizar:** hoje cai o reembolso sem prova do pagamento; passa a cair o reembolso **sem Declaração assinada (ou desatualizada)** e o de nível Alto sem comprovante. Menos itens travados, e por um motivo mais claro.

**4. Malote.** Vai com a Declaração assinada na frente do dossiê. Selo **"pagamento declarado (sem comprovante do terceiro)"** no índice. O Aviso de extinção (etapa 1) passa a ter: NF, Declaração assinada, comprovante do terceiro quando houver, aprovação. A etapa 2 (comprovante do reembolso, mês do pagamento) **não muda**. O nome do documento no pacote passa a ser sempre o mesmo.

**5. Relatórios.** Entra o relatório mensal "reembolsos e ofertas sem comprovante do terceiro" (valor, favorecido, aprovador, nível). `PENDENCIAS_QUITACAO.csv` troca o motivo "falta o Pedido de Reembolso" por "Declaração não assinada / desatualizada". DRE e relatórios de competência **não mudam**.

**6. Filas.**

| Fila | Mudança |
|---|---|
| **A esclarecer** | Nenhuma: intenção não declarada. Continua a regra "sem prova suficiente → A esclarecer" |
| **Formalizar** | Passa a significar: "Declaração gerada e não assinada", "Declaração desatualizada" ou, no nível Alto, "falta a prova do pagamento". O prazo de 30 dias passa a valer também para o reembolso (hoje só para a oferta) |
| **Aprovar reembolso** | A alçada passa a depender do nível: Baixo Tesouraria; Médio e Alto Administrador |
| **Reembolso a pagar** | Nenhuma |
| **Investigar** | Nenhuma |

## 5. O que muda nas fases

| Fase | Situação | O que muda |
|---|---|---|
| **1A / 1B** (aplicadas) | Funções da Matriz, registro, aprovação e visão | Substituídas pela **1D** (lista na seção 6). Nenhum arquivo é editado |
| **1C-a** Pagar reembolso (aplicada) | `fin_liquidar_reembolso` | **Não muda**: ela exige reembolso aprovado e suficiente, e isso continua sendo calculado pela Matriz |
| **1C-b** Pacote (código) | Pastas e índice | Selo "pagamento declarado"; Declaração assinada no dossiê; texto das observações |
| **1C-c** Bloqueios (aplicada) | `fin_quitacao_bloqueios` | **Não muda**; muda só o que cai em Formalizar |
| **1C-d** Prazos (aplicada) | `vw_fin_quitacao_prazos` | Prazo de **formalização** estendido ao reembolso (Declaração não assinada) |
| **1C-e** Cancelada e regularização (aplicada) | `fin_registrar_nf_quitada...`, `fin_regularizar_oferta_de_nf` | Recebem o novo parâmetro (forma de pagamento). Cancelada não muda |
| **1C-f** Competência (aplicada) | DRE e relatórios | **Não muda** |
| **Seguintes** (adiantamentos, doação direta) | Não iniciadas | O **gerador da Declaração** é reaproveitado na Declaração de Doação de Consumo |

## 6. Migrations e código a alterar

**Princípio:** o que está aplicado em produção **não se edita**; a mudança é **nova migration**, com `CREATE OR REPLACE`, ensaio, aplicar e rollback, como nas demais. Hoje há **uma única quitação** no banco (a do reembolso de R$ 1.500,00 descrita na seção 2). Não há dado para **converter**: nível, suficiência, fila e resultado são todos **derivados**, então a nova matriz apenas **recalcula** o que já existe (para essa quitação, o resultado prático é o mesmo). O ensaio da 1D-b compara o resultado antes e depois.

**Objetos substituídos** (e a migration de origem de cada um, só para rastreio):

| Objeto | Origem | Mudança |
|---|---|---|
| `fin_quitacoes` | 1A (`20261014100000`) | **+ coluna** `forma_pagamento_terceiro`; **relaxa** a regra "intenção declarada ⇔ data da declaração" (a data só existe quando a via assinada chega) |
| `fin_quitacao_parametros` | 1A | **+ colunas** `reembolso_teto_baixo` (300), `reembolso_teto_medio` (1.500), editáveis pelo Administrador com histórico |
| `fin_quitacao_avaliar` | 1A (`...110000`) | **Matriz do reembolso** (eixo de valor, sem M2, regras por nível) |
| `fin_quitacao_entrada` | 1A | Novas entradas: faixa de valor, estado da Declaração, forma de pagamento |
| `fin_quitacao_graus`, `fin_quitacao_grau_conjunto` | 1A | Intenção Formal passa a vir da Declaração gerada e assinada **e não desatualizada** (o anexo antigo `pedido_reembolso` segue valendo como "externo") |
| `fin_quitacao_validar_campos` | 1A | Forma de pagamento obrigatória; data da declaração opcional |
| `fin_registrar_quitacao`, `fin_alterar_quitacao` | 1B (`...140000`) | Parâmetro novo; **troca de assinatura**: a versão antiga precisa ser removida para não ficar duplicada |
| `fin_registrar_nf_quitada_por_terceiro`, `fin_regularizar_oferta_de_nf` | 1B, 1C-e | Passam o parâmetro novo |
| `fin_decidir_quitacao` | 1B | **Alçada por nível**, no lugar do teto de R$ 500 |
| `vw_fin_quitacao` | 1C-a (`20261015100000`) | **+ colunas no fim:** forma de pagamento, estado da Declaração |
| `vw_fin_quitacao_prazos` | 1C-d | Formalização também para reembolso |
| **Novos** | | tabela `fin_declaracoes_terceiro` (número, versão, conteúdo, código, via assinada); funções para **gerar** e para **registrar a via assinada**; visão do relatório mensal |

**Proposta de divisão (cada uma com ensaio em produção que sempre desfaz tudo):**
- **1D-a: dados e documento.** Coluna, parâmetros, tabela das declarações, gerar e registrar assinatura, regra de "desatualizada". Não muda nenhum comportamento ainda.
- **1D-b: a Matriz do reembolso e a alçada.** Substitui avaliar, entrada, graus, validar, registrar, alterar, decidir, as duas visões e as duas funções de NF/regularização. É a que muda o comportamento.
- **1D-c: relatório mensal** (visão para o Conselho).

**Aplicativo:**
- `lib/quitacao.ts` (**espelho da Matriz**) e o **teste de equivalência SQL × TypeScript** (hoje 6.000 casos) precisam ser **reescritos junto**: é o que garante que tela e banco decidem igual.
- Telas: o cartão **Quem pagou** (gerar Declaração, anexar via assinada com data, mostrar nível e o que falta), o diálogo de registro (forma de pagamento; sai a data da declaração), `NotaQuitadaDialog`, a fila e o pacote contábil.
- O **PDF** sai com a mesma biblioteca já usada no dossiê (`pdf-lib`).

## 7. Decisões aprovadas (14/10/2026)

| # | Decisão | Efeito |
|---|---|---|
| 1 | **Prestadores = Alto risco** | Serviço contratado e terceiro prestador entram no nível Alto: comprovante obrigatório |
| 2 | **Estoque = consumo (Baixo)** | Reposição de estoque segue as faixas de valor |
| 3 | **Cupom fiscal legível até R$ 300 permanece Baixo** | O lastro Baixo aceita cupom legível no CNPJ da igreja até o limite do nível Baixo; acima disso, Médio |
| 4 | **Limites inclusivos** | R$ 300,00 é Baixo; R$ 1.500,00 é Médio |
| 5 | **Declaração individual por NF** | Agrupar várias notas fica como evolução futura |
| 6 | **Assinatura eletrônica fora desta fase** | Só assinatura manuscrita (papel, foto ou PDF) |
| 7 | **Forma de pagamento do terceiro: campo obrigatório** | Dinheiro · PIX · Cartão de crédito · Cartão de débito · Transferência · Outro |

**Como o campo obrigatório entra, sem derrubar a tela que está no ar:** a tela (1D-a) já pede a forma de pagamento e só a envia quando o banco tem a 1D-a; o banco passa a **exigi-la no registro** na **1D-b**, depois que a tela estiver publicada. A quitação que já existe (Leandro) tem a forma em branco: a tela pede a informação antes de gerar a Declaração.

## 8. Riscos que continuam e como são cobertos

| Risco | Cobertura |
|---|---|
| Compra inventada ou inflada, paga em dinheiro | NF no CNPJ da igreja com chave conferida; teto por pessoa (M3); aprovação por outra pessoa; amostragem pelo Conselho (relatório mensal) |
| Quem controla o financeiro se reembolsa sozinho | Terceiro no circuito é **Alto**: comprovante obrigatório; e nunca aprova o próprio |
| Fracionar para ficar abaixo de R$ 300 | M3 (3 reembolsos no trimestre, ou R$ 2.000 no ano) sobe o nível |
| Trocar a intenção depois de assinada | Sem caixas; conteúdo guardado; desatualizada invalida a via |
| Pagar duas vezes (fornecedor e pessoa) | Trava da Fase 1A, **mantida** |
