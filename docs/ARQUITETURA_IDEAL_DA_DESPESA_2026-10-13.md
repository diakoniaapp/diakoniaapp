# Arquitetura ideal da despesa — uma identidade, oito estados

Proposta **conceitual** de 13/10/2026, sem código. Parte da análise de [ANALISE_CICLO_DA_DESPESA_2026-10-13.md](ANALISE_CICLO_DA_DESPESA_2026-10-13.md) e do que a Fase A (já no ar) deixou pronto. Cada afirmação sobre o estado atual vem dessa análise ou do código lido; o que não verifiquei está marcado **(não verificado)**.

---

## 0. As decisões que esta proposta pede a você

| # | Decisão | Minha recomendação |
|---|---|---|
| D1 | A identidade da despesa é a **obrigação**; cada linha de `fin_lancamentos` é uma **parcela de pagamento** dela | **Sim** — e *não* separar em duas tabelas agora (ver §2.3) |
| D2 | O estado da despesa é **derivado de fatos**, nunca digitado | **Sim** — com um único lugar que o calcula |
| D3 | OFX só **evolui** a despesa existente — **sempre com um clique de confirmação** quando há candidata (decidido); linha sem candidata nasce como despesa **já paga**, aberta à fusão tardia | **Sim** |
| D4 | **Conferida** (um humano atestou) ≠ **Conciliada** (há vínculo com a linha do banco) | **Sim** — e o histórico do Omie vira "Conferida (histórico)" |
| D5 | **Pronta para Malote** nasce sozinha quando documento + comprovante + liquidação + conciliação existem | **Sim**, com 2 dispensas explícitas (§6.2) |
| D6 | **Enviada ao Malote** congela a despesa; **Arquivada** = enviada + mês aprovado | **Sim** — mudar depois exige "reabrir" com motivo |
| D7 | Documento pertence à **obrigação**; comprovante pertence ao **pagamento**; o dossiê junta os dois | **Sim** — com a exceção "um comprovante para vários documentos" (§7) |

---

## 1. Princípios

1. **Uma despesa nasce uma vez.** Quem a faz nascer é a recorrência, o tesoureiro (despesa avulsa) ou — quando só existe o pagamento — a linha do banco. Nunca dois deles para o mesmo fato.
2. **Tudo o que acontece depois é um fato que se acumula sobre ela**, não um registro novo: um pagamento, uma liquidação, um vínculo com o extrato, um documento, uma conferência, um envio.
3. **O estado é a leitura dos fatos.** Se um fato some (o documento é removido, a conciliação é desfeita), o estado recua sozinho. Ninguém "empurra" a despesa para a frente.
4. **Cada fato tem evidência.** "Conciliada" exige a linha do banco; "Pronta" exige os arquivos; "Enviada" exige o envio registrado. Sem evidência, o estado não avança.
5. **O que já foi enviado à contabilidade não muda em silêncio.**

---

## 2. O modelo conceitual

### 2.1 As peças

```
CONTRATO (recorrência)  ──gera──►  OBRIGAÇÃO  ◄── identidade da despesa ──┐
                                      │ 1 ... n                             │
                                      ▼                                     │
                                  PAGAMENTOS (parcelas)                     │
                                      │ cada um pode ter                    │
                                      ├─► LIQUIDAÇÃO (o ato de pagar)       │
                                      └─► VÍNCULO com a linha do extrato    │
                                                                            │
DOCUMENTOS (boleto, guia, DARF, FGTS, XML, fatura) ─── pertencem à ─────────┤
COMPROVANTES (PIX, TED, recibo) ─────── pertencem ao PAGAMENTO ─────────────┤
                                                                            ▼
                                  DOSSIÊ da obrigação (tudo acima, reunido)
                                      │
                                      ▼
                                  ENVIO (malote)  ─►  PERÍODO (aprovado/arquivado)
```

### 2.2 O que é "a despesa"
É a **obrigação**. Uma despesa comum tem **um** pagamento e a distinção some: a mesma linha é obrigação e pagamento (como hoje). Quando há **pagamento parcial**, a obrigação passa a ter mais de um pagamento; ela continua sendo **uma** despesa, com um estado só.

### 2.3 Como isso se guarda — três caminhos
| Caminho | O que é | Vantagem | Custo |
|---|---|---|---|
| **A. Duas tabelas** (obrigação + pagamento) | Pureza do modelo | Identidade explícita | Reescrever saldo, extrato, DRE, gatilhos, relatórios: **todos** leem `fin_lancamentos` como "o dinheiro". Risco alto, ganho só conceitual |
| **B. Uma tabela, `obrigacao_id` obrigatório** (**recomendado**) | A linha é a parcela; `obrigacao_id` aponta a raiz (a própria linha quando é única) | O dinheiro continua em um lugar; a identidade vira garantida; a view `vw_fin_obrigacoes` já existe e vira **a leitura oficial da despesa** | Fazer o campo valer sempre (hoje às vezes é nulo) e ensaiar |
| **C. Como hoje** | `obrigacao_id` só aparece no parcial | Zero mudança | A identidade continua implícita: depende de cada tela lembrar de olhar o grupo |

Recomendo **B**: ele dá a identidade que você quer sem mexer em nada do que calcula saldo.

---

## 3. Os oito estados

A despesa é lida **como obrigação** (todas as parcelas juntas). Entradas e transferências não têm este ciclo.

| # | Estado | Está nele quando… | Evidência | Quem faz avançar |
|---|---|---|---|---|
| 1 | **Prevista** | existe, venceu ou vence adiante, e ainda não pede ação (fora da janela operacional) | a própria ocorrência | gerador da recorrência / lançamento avulso |
| 2 | **Em Aberto** | entrou na janela de ação (vence em até N dias) ou venceu sem pagamento | vencimento + nenhum pagamento | o calendário |
| 3 | **Pagamento Realizado** | há pagamento (todo o valor) e **ainda não existe** extrato que cubra a data | liquidação / pagamento + data | "Pagar", débito automático, lançamento manual confirmado |
| 4 | **Aguardando Conciliação** | pago, o extrato já cobre a data, e **nenhuma** linha do banco está ligada | pagamento + extrato importado até a data | importação do OFX (que então decide ligar ou não) |
| 5 | **Conciliada** | **todas** as parcelas pagas estão ligadas a uma linha do banco | vínculo com o FITID | OFX (automático ou confirmado) |
| 6 | **Pronta para Malote** | Conciliada **e** documento **e** comprovante **e** classificação (categoria + centro) | os quatro fatos juntos | **nasce sozinha** (§6) |
| 7 | **Enviada ao Malote** | consta de um envio registrado | item do envio | gerar/registrar o malote do mês |
| 8 | **Arquivada** | enviada **e** o mês foi aprovado | envio + fechamento do período | aprovar o período |

Mais dois destinos que não são degraus: **Cancelada** e **Pago parcialmente** (ver abaixo).

### 3.1 Regras que fecham as pontas
- **Pagamento parcial.** "Pago parcialmente" é um **modificador**, não um estado: a obrigação continua **Em Aberto** pelo saldo, mostrando "pago R$ 1.358 de R$ 1.438". Só quando o saldo zera ela segue.
- **Mais de uma parcela.** O estado da obrigação é o da parcela **menos avançada**: uma parcela conciliada e outra só paga deixam a obrigação em *Aguardando Conciliação*.
- **Conta sem extrato** (caixinha, envelopes, cartão). A etapa de conciliação **não se aplica**: o pagamento leva direto de 3 a 6, sujeito à *conferência* (§5) como substituto declarado.
- **Despesa nascida do banco** (linha do extrato sem obrigação prévia). Nasce **já paga e já ligada**: entra direto no estado 5, pulando 1–4.
- **Regressão.** Desfazer a conciliação volta a 4; remover um documento volta a 5; descartar uma parcela volta ao saldo. **Depois de 7, nada regride sozinho** — só por "reabrir" explícito, com motivo e quem fez.

### 3.2 O que hoje já faz isto
`lib/cicloDaDespesa.ts` calcula 1–6 (e Cancelada) a partir dos fatos; falta 7 e 8, e a leitura por **obrigação** (hoje ele lê a linha aberta — a Fase A corrigiu só o **detalhe**).

---

## 4. OFX: evoluir, nunca duplicar

### 4.1 A regra
> Ao encontrar uma obrigação compatível, o OFX **não cria lançamento**. Ele **acrescenta o fato** (pagamento + vínculo) à despesa que já existe.

### 4.2 Camadas, da mais certa à menos certa
| Camada | Situação da linha do banco | O que o sistema faz | Quem decide |
|---|---|---|---|
| 0 | O FITID já está ligado a algo | Nada (já registrada) | — |
| 1 | Débito automático **previsto** com valor e janela compatíveis | Evolui a despesa existente (paga + ligada) | ninguém — automático, **desfazível** |
| 2 | Obrigação aberta do **mesmo favorecido**, **valor exato**, uma só candidata | **Proposta já preenchida**: a linha do banco aparece ligada à despesa, e um clique confirma | tesouraria, **sempre um clique** (decisão dela, 13/10/2026) |
| 3 | Candidata com valor diferente (juros, multa, desconto, parcial, estimativa) | **Proposta** com a diferença explicada — **nunca** cria linha por conta própria | tesouraria, num clique |
| 4 | Há **mais de uma** candidata (duas mensalidades, dois contratos) | Proposta com a lista | tesouraria |
| 5 | Nenhuma candidata | Nasce uma despesa **já paga e ligada** — uma só, sem obrigação anterior | automático (tarifa, PIX avulso) ou revisão |

**A mudança de comportamento em relação a hoje:** a camada 3 deixa de ser "dica opcional" — a opção "registrar como novo" passa a pedir confirmação explícita *quando existe candidata* (hoje basta o clique, e foi assim que Ana/Carlos/Denise duplicaram).

### 4.3 O sentido inverso — obrigação que nasce *depois* do pagamento
Foi a causa de Ana/Carlos/Denise: a recorrência gerou a ocorrência de 05/10 em 08/10, com o PIX de 02/10 já no banco. Por isso **o gerador também é uma porta**: antes de criar uma ocorrência que já passou, procura pagamento solto compatível e **a cria já paga e ligada** (ou propõe). O "Contas já pagas" continua como rede de segurança.

### 4.4 Fusão tardia
Enquanto a despesa **não** está *Pronta para Malote*, qualquer despesa nascida do banco (camada 5) pode ser **fundida** a uma obrigação que apareça depois (já existe: `fin_liquidar_com_pagamento_existente`). A obrigação sobrevive; o registro duplicado desaparece; anexos e comprovantes acompanham.

---

## 5. Conferida × Conciliada

| | **Conferida** | **Conciliada** |
|---|---|---|
| O que atesta | Um **humano** olhou e disse "bate" | O banco **confirmou**: há vínculo com a linha do extrato |
| Evidência | Quem, quando, e (opcional) a nota | O identificador da linha do banco (FITID) |
| Quando existe | Qualquer conta, a qualquer momento | Só conta com extrato, depois de importado |
| Pode avançar a despesa? | **Sozinha, não.** Só substitui a conciliação onde ela *não é possível* (caixinha, cartão, histórico anterior ao OFX) | **Sim** |
| Reversível | Sim | Sim (desconciliar) |

**Por que separar.** Hoje `conciliado` é as duas coisas: só **336 dos 13.147** têm vínculo com o banco; o resto é histórico do Omie ou marcação manual. Quem lê o extrato vê o mesmo selo para provas muito diferentes.

**O histórico.** Os ~12.800 sem vínculo viram *Conferida (histórico)* — são fatos reais e aceitos, mas **não** podem ser vendidos como "conciliados com o banco". Isso não os tira do malote dos meses antigos (decisão sua, §9, Q3).

---

## 6. Pronta para Malote

### 6.1 Nasce sozinha — sim
A condição é de **fatos**, não de ação:

> **Liquidação** (houve pagamento) **+ Conciliação** (ou Conferida onde não há extrato) **+ Documento original + Comprovante + Classificação** (categoria e centro).

Por que automática: um botão "marcar como pronta" seria a pessoa **afirmando** o que o sistema pode **ver** — e é exatamente o tipo de marca que depois diverge (como o `conciliado` de hoje).

### 6.2 Duas dispensas explícitas
1. **Categorias sem documento** (tarifa bancária, IOF, juros): o extrato é o documento e o comprovante (já existe `dispensaDocumento`).
2. **Conta sem extrato**: a *Conferida* substitui a *Conciliada*.

Qualquer outra falta **aparece como pendência nomeada** ("falta comprovante"), nunca como estado vago.

### 6.3 Regride sozinha, até ser enviada
Se o comprovante for apagado ou a conciliação desfeita, a despesa **sai** de *Pronta* e volta ao estado que os fatos indicam — o malote do mês nunca inclui algo que deixou de estar completo.

### 6.4 Enviada e Arquivada
- **Enviada** nasce quando o envio é **registrado** (hoje o ZIP é baixado e o sistema não sabe; a tabela de envios tem 0 linhas). O envio passa a listar **quais despesas** levou. Daí em diante a despesa **fica congelada** (valor, documentos, categoria).
- **Arquivada** = enviada **e** o período aprovado/travado. É o ponto em que vira **só histórico**.
- **Reabrir** é um ato próprio, com motivo, autoria e aviso de que o mês já foi enviado.

---

## 7. Anexos: continuam presos à despesa original?

**Princípio proposto:** o **documento** pertence à **obrigação**; o **comprovante** pertence ao **pagamento**; o **dossiê** é a leitura dos dois juntos. Nada é copiado — o dossiê *aponta*.

| Cenário | O que deve acontecer | Hoje | Situação |
|---|---|---|---|
| **Pagamento parcial** (Denise: 1.358 + 80) | Boleto/fatura na obrigação; comprovante de cada parcela na parcela; o dossiê mostra tudo | Anexos presos à **linha**. **Detalhe da despesa** já lê o grupo (Fase A-2). Pacote Contábil, cobertura da Mesa, "Ciclo do mês", Painel e Central de Documentos ainda contam **por linha** | **Parcial** — falta o resto dos leitores |
| **Liquidação parcial** (mesma coisa pelo ato de pagar) | O comprovante pertence ao **ato** (a liquidação) e vale para todas as parcelas que ele pagou | `fin_liquidar` guarda o comprovante na liquidação **e o copia** na coluna de cada documento pago | **Funciona**, por cópia de referência |
| **Um PIX pagando vários documentos** | Um comprovante, vários documentos — N obrigações apontam para **o mesmo comprovante** | Cobertura pela coluna copiada; **por anexo**, o comprovante fica numa linha só e as outras aparecem "sem comprovante" **(não verificado com caso real)** | **Lacuna provável** |
| **Um documento cobrindo várias obrigações** (guia de FGTS/GPS da folha) | O documento aponta para todas | Anexado a **uma** (ou repetido) | **Lacuna** — hoje é relação 1 para 1 |
| **Fusão** (obrigação aberta + pagamento existente) | Tudo acompanha a obrigação; o registro duplicado some | A função move **anexos e comprovante** para a obrigação | **Funciona** (aplicada e testada) |
| **Conciliação** | Não mexe em anexo — só acrescenta o vínculo | Idem | **Funciona** |
| **Envio ao malote** | O pacote leva o **dossiê da obrigação** (documento + todos os comprovantes) | Pacote lê anexos da **linha** | **Parcial** (mesma lacuna do primeiro item) |

**Conclusão:** os anexos **continuam presos à despesa original** nos casos comuns e na fusão. Quebram em três situações — parcial lido por quem só olha a linha, um comprovante para vários documentos, e um documento para várias obrigações. As duas últimas pedem uma **relação N para N** entre documento e obrigação (conceitualmente, um *documento* como peça própria, ligado a quantas obrigações precisar). Não é urgente: hoje há **1** grupo parcial no banco e nenhum anexo nele.

---

## 8. Invariantes — o que nunca pode acontecer

| # | Invariante | Onde se garante hoje | Onde deveria se garantir |
|---|---|---|---|
| I1 | Uma ocorrência de recorrência existe **uma vez** (série + data) | Disciplina do gerador (0 duplicadas medidas) | **Banco** (índice único parcial) |
| I2 | Uma linha do banco (FITID) liga a **uma** despesa | Marcador em texto + índices | **Tabela de vínculos** única por conta + FITID |
| I3 | Um pagamento quita **uma** obrigação (ou várias, mas por uma liquidação) | Fusão atômica; varredura | Banco (a liquidação é o ato) |
| I4 | Nenhuma porta de pagamento cria registro sem **procurar** obrigação aberta | OFX e lançamento manual (Fase A-1) | + gerador, + importações |
| I5 | `obrigacao_id` sempre preenchido | Só quando há baixa parcial | **Banco** (padrão = o próprio id) |
| I6 | Estado **calculado em um só lugar** | `lib/cicloDaDespesa.ts` (telas diferentes ainda recalculam critérios) | Uma leitura oficial (view) + a lib como espelho testado |
| I7 | Enviada ⇒ congelada | Nada | Banco (travar edição de item enviado) |

---

## 9. Perguntas que só você responde

- **Q1.** *Prevista* × *Em Aberto*: quantos dias antes do vencimento a despesa entra em "Em Aberto"? (Hoje a regra é "venceu"; a Mesa mostra 7 dias — proponho **7**, o mesmo da Mesa.)
- **Q2. RESPONDIDA (13/10):** o OFX **sempre pede um clique** quando há candidata — nenhuma camada liga sozinha. (O débito automático previsto de valor e janela compatíveis, camada 1, já era conciliado com um clique na importação.)
- **Q3.** O histórico do Omie (≈12.800 conciliados sem vínculo) entra nos malotes dos meses antigos como *Conferida (histórico)* — aceito pela contabilidade?
- **Q4.** Conta sem extrato (caixinha, envelopes, cartão): a *Conferida* basta para chegar a *Pronta*?
- **Q5.** *Enviada* trava a despesa. Quem pode **reabrir**, e com que registro?
- **Q6. RESPONDIDA (13/10):** **não são casos frequentes.** O N para N entre documento e obrigação **sai do caminho**: continua 1 documento por obrigação; nos casos raros, o anexo é repetido (referência) e a tesouraria é avisada.

---

## 10. Do que existe ao ideal — o caminho, sem código ainda

| Passo | O que muda | Já pronto? |
|---|---|---|
| 1 | Portas de entrada procuram obrigação (OFX, manual) | ✅ Fase A-1 (manual); OFX camada 3 e **gerador** a fazer |
| 2 | Detalhe lê o grupo da obrigação | ✅ Fase A-2 |
| 3 | **Todos** os leitores de anexo leem o grupo (Pacote, Mesa, Ciclo do mês, Painel, Central) | ❌ |
| 4 | `obrigacao_id` sempre preenchido; índice único da ocorrência | ❌ (migration, com ensaio) |
| 5 | Tabela de vínculos do extrato; "Conferida" separada de "Conciliada" | ❌ (migration + classificação do histórico) |
| 6 | Itens do malote por despesa; estados *Enviada* e *Arquivada*; travar enviada | ❌ |
| 7 | Leitura oficial do estado (view) com os oito estados | ❌ |
| 8 | Documento como peça própria (N para N) | ⛔ **descartado** (Q6: casos raros) |

**O que eu faria a seguir** (nesta ordem): o passo 3 e o gerador do passo 1 — não precisam de migration e fecham as duas lacunas que ainda produzem duplicidade e dossiê incompleto —; depois, o desenho detalhado dos passos 4–6 para você aprovar **antes** de qualquer migration.
