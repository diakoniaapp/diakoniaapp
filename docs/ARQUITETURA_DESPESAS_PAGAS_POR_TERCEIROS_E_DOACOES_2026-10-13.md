# Despesa paga por terceiro, reembolso e doação: o modelo recomendado

> **Somente arquitetura conceitual**, em 13/10/2026. Sem código, sem migrations, sem telas, sem protótipo. Nada foi alterado no app.
>
> **Limite:** é uma análise de produto, não um parecer contábil. O que depende do contador (CRC) está marcado **[confirmar]** e reunido na seção 11.

---

## 1. Resposta em uma página

**O erro de origem.** O fluxo "entrada fictícia, transferência fictícia, saída fictícia" nasceu de uma confusão entre dois fatos que são independentes:

| | Fato econômico | Fato financeiro |
|---|---|---|
| O que é | A igreja **recebeu** um bem ou serviço (ou assumiu uma dívida) | **Dinheiro** da igreja saiu ou entrou |
| Quando | Na data da compra, da NF, do serviço | Na data do pagamento |
| Onde aparece | DRE, balanço, malote | Saldo, extrato, conciliação |

Os sete cenários que você descreveu têm **o mesmo fato econômico** (a igreja recebeu algo) e **fatos financeiros diferentes** (a igreja pagou, deve, ou nunca pagou). O app só sabia representar o fato econômico passando por dinheiro, então inventava dinheiro.

**A recomendação (Modelo C).** Separar, de forma explícita, o que o app já separa pela metade:

1. **A Aquisição** (o que a igreja recebeu: é a obrigação que já existe, com `obrigacao_id`, documentos e estados).
2. **A Extinção** (como essa obrigação deixou de existir). Há **cinco** maneiras, e só uma delas mexe no caixa da igreja:
   - pago pela igreja (banco, caixa ou cartão): **é a liquidação de hoje**;
   - pago por terceiro **como oferta**;
   - pago por terceiro **com direito a reembolso** (a obrigação passa a ser com a pessoa);
   - compensada com um adiantamento;
   - cancelada.
3. **A Doação direta** (bem ou serviço que chega sem fornecedor, como o notebook e o serviço gratuito): é uma Aquisição que **já nasce extinta**, sem fornecedor.

**Três consequências:**
- **Reembolso não é forma de pagamento.** É uma relação de dívida entre a igreja e uma pessoa. O pagamento do reembolso, quando vem, é uma liquidação comum.
- **Doação não é dinheiro.** Nunca passa por conta, saldo, extrato ou conciliação. Aparece no DRE (despesa e receita de doação, pareadas), nunca no fluxo de caixa.
- **O app registra fatos e provas; a contabilidade escolhe a conta.** O app não precisa "saber" se a doação é receita com restrição ou patrimonial: precisa capturar a intenção do doador, a natureza do item, o valor justo e os documentos.

---

## 2. O que o DiakoniaApp já tem e será reaproveitado

| Já existe | Papel no novo modelo |
|---|---|
| **Obrigação e `obrigacao_id`** (parcelas, linhas, documento do grupo, comprovante da linha) | É a **Aquisição**. Não muda de identidade nunca. |
| **Estados da despesa** (Prevista, Em Aberto, Pagamento Realizado, Aguardando Conciliação, Conciliada, Pronta para Malote, Enviada, Arquivada) | Continuam os mesmos. "Pagamento Realizado" passa a significar "obrigação extinta", seja qual for o meio. |
| **Conferida × Conciliada** | Decisiva: **conciliada** é vínculo bancário; **conferida** é validação humana. Extinção por terceiro nunca é conciliada, **só conferida**, e isso já está previsto na regra de conta sem extrato (documento + comprovante + conferência humana). |
| **Liquidação** (parcial, juros, multa, desconto, pagamento já existente) | Paga o **reembolso** à pessoa, inclusive em parcelas. |
| **Extrato, OFX, PDF bancário, vínculo único** | Só para extinção por conta da igreja. O vínculo único impede que o mesmo PIX sirva a dois reembolsos. |
| **Mesa de Operações e Contas a pagar** | Passam a listar "reembolsos a pagar" (para a pessoa) e "adiantamentos a prestar contas". |
| **Anexos e documentos** (NF, fatura, boleto, comprovante, contrato, RPA, guia; dispensa de documento) | Ganham tipos novos (termo de doação, termo de voluntariado, pedido de reembolso, declaração). A regra "documento é do grupo, comprovante da linha" continua. |
| **Favorecido ligado a Pessoas** | Pagador, doador e beneficiário do reembolso são **Pessoas**; o emitente da NF é o fornecedor. |
| **Estoque** (itens e movimentos) | Recebe a entrada de bens de consumo doados (alimentos para ação social), sem valor financeiro. |
| **Conta Corrente de Sustento** (competência, adiantamento, desconto, saldo) | É o **padrão de referência** para adiantamentos a pessoas: o adiantamento só se fecha por compensação, desconto ou devolução. |
| **Leitura de NF e boleto, chave, QR do documento** | Preenche emitente, valor e chave de acesso (e impede NF duplicada). |
| **Malote com Enviada e Arquivada, congelamento estreito e reabertura auditada** | Não muda. Só ganha pastas novas. |
| **Recorrências** | Não se aplicam, exceto patrocínio recorrente por terceiro (raro). |
| **Módulo de Arrecadação** (`reembolso_pessoa` e `abate_compra_cnpj`) | Prova de que o domínio já pedia o conceito, mas **do jeito antigo**: dentro de um módulo, com NF solta. O novo modelo o **absorve**, para não existirem duas ideias de reembolso. |

**O que não existe e é preciso:** (a) a distinção entre **quem emitiu** o documento e **quem recebe o pagamento**; (b) uma Aquisição que se **extingue sem dinheiro**; (c) a **intenção do terceiro** como dado obrigatório; (d) a **ficha do bem** (patrimônio mínimo); (e) tipos de documento de doação.

---

## 3. O vocabulário do modelo (cinco perguntas, sempre as mesmas)

Toda situação que envolve alguém fora da tesouraria se descreve respondendo:

1. **O que a igreja recebeu?** Natureza do item: consumo, estoque, bem durável ou serviço. E o **valor** (NF ou valor justo).
2. **De quem?** Fornecedor (há NF e obrigação) ou doador (não há fornecedor, a Aquisição nasce extinta).
3. **Quem suportou o custo?** A igreja (conta, caixa ou cartão) ou uma pessoa.
4. **Qual era a intenção de quem pagou?** **Oferta** (liberalidade) ou **reembolso** (a restituir). Sem declaração, é **"a esclarecer"**, e nunca se presume oferta.
5. **Que prova existe?** Documento fiscal, comprovante, termo, declaração.

> **Por que a intenção nunca se presume.** O Código Civil (art. 305) dá a quem paga dívida alheia em nome próprio o **direito de reembolso**; a liberalidade (doação, art. 538) precisa ser **expressa**. Logo, uma NF no CNPJ da igreja paga por membro, sem declaração, juridicamente é **dívida da igreja com o membro**, não oferta. Tratar como oferta "para facilitar" é decidir pelo membro.

---

## 4. Os sete cenários, fato a fato

Legenda: **sim**, **não**, **depois** = só quando o reembolso for pago.

| # | Pergunta | A: pastor compra, NF da igreja, **reembolso** | B: pastor compra, NF da igreja, **oferta** | C: membro compra alimentos para **ação social** | D: membro doa **notebook** | E: profissional faz **serviço gratuito** | F: membro **paga o fornecedor direto** | G: igreja **aprova**, colaborador compra, igreja deve |
|---|---|---|---|---|---|---|---|---|
| 3 | Movimenta caixa da igreja? | depois | não | não | não | não | não | depois |
| 4 | Movimenta banco da igreja? | depois (PIX) | não | não | não | não | não | depois |
| 5 | Há receita? | não | **sim** (doação) | **sim** (doação, com restrição) | **sim** (doação) | **sim**, se reconhecida **[confirmar]** | depende da intenção | não |
| 6 | Há despesa? | **sim** | **sim** | **sim**, ao distribuir | não (vira ativo) | **sim**, se reconhecida | **sim** | **sim** |
| 7 | Há obrigação? | **sim**, com a pessoa | não | não | não | não | depende da intenção | **sim**, com a pessoa |
| 8 | Há passivo? | **sim**, até pagar | não | não | não | não | só se reembolso | **sim**, até pagar |

### Cenário A: reembolso com NF no CNPJ da igreja
1. **Fato econômico:** a igreja adquiriu o material na data da NF; o pastor agiu por conta dela.
2. **Fato financeiro:** o reembolso, na data em que for pago, da conta para o pastor.
3. **A contabilidade espera:** despesa na data da NF; dívida com o pastor até o pagamento; baixa da dívida no pagamento. Se a compra e o reembolso caem no mesmo mês, pode ser direto.
4. **Documentos obrigatórios:** NF (CNPJ da igreja), pedido ou aprovação, prova de que o pastor pagou, comprovante do reembolso.
5. **Riscos de auditoria:** reembolso sem NF (pode ser lido como remuneração: IRRF e INSS); reembolso pago duas vezes; reembolso que se arrasta como adiantamento; mistura com a prebenda.

### Cenário B: pastor compra e declara oferta
1. **Fato econômico:** a igreja recebeu um bem ou serviço sem suportar o custo. É uma **doação** (liberalidade) **aplicada direto no pagamento do fornecedor**.
2. **Fato financeiro:** **nenhum** na igreja.
3. **A contabilidade espera:** despesa (ou estoque, ou imobilizado) e receita de doação PF, **sem caixa nem banco**; na DFC, só nota explicativa.
4. **Documentos obrigatórios:** NF no CNPJ da igreja, **termo de doação** datado e assinado ("sem direito a reembolso"), comprovante do pagamento do doador (mostra a origem do recurso e prova que não foi reembolsado).
5. **Riscos:** oferta declarada **depois**, para se esquivar do reembolso (o termo precisa ser datado); o doador querer recibo para o Imposto de Renda (a igreja não deve emitir); oferta de pastor em período de remuneração discutida.

### Cenário C: alimentos para ação social
1. **Fato econômico:** a igreja recebeu bens para distribuição gratuita. Se a NF é do **CNPJ da igreja**, é o cenário B com destino social. Se a NF é do **CPF do membro**, é **doação de bem**.
2. **Fato financeiro:** nenhum.
3. **A contabilidade espera:** receita de doação **com restrição** (ação social); entrada em estoque; despesa quando distribuído (gratuidade concedida).
4. **Documentos:** NF (a de quem for), termo de doação, lista ou registro da entrega.
5. **Riscos:** lista de beneficiários (LGPD); NF em CPF não sustenta despesa da igreja; valor justo sem prova; sobra que vira consumo próprio.

### Cenário D: notebook doado
1. **Fato econômico:** a igreja recebeu um **bem durável**, que vira patrimônio.
2. **Financeiro:** nenhum.
3. **Contabilidade:** ativo imobilizado pelo **valor justo** e receita de doação (imediata ou diferida **[confirmar]**); depreciação depois, pelo escritório. Se o doador **estipulou** que é capital (dotação), pode ir ao patrimônio social **[confirmar]**.
4. **Documentos:** termo de doação do **bem** (descrição, número de série, estado), NF original ou avaliação de valor, foto.
5. **Riscos:** valor justo sem base; bem usado sem avaliação; bem que "some" sem controle patrimonial; doação condicional não registrada.

### Cenário E: serviço gratuito
1. **Fato econômico:** a igreja recebeu um **serviço** sem custo. Na contabilidade de entidades sem fins lucrativos, o trabalho voluntário pode ser reconhecido pelo **valor justo** (receita e despesa iguais) **[confirmar]**; se não for reconhecido, vai em **nota explicativa**.
2. **Financeiro:** nenhum.
3. **Contabilidade:** conforme a política da igreja com o escritório: reconhecer ou só divulgar.
4. **Documentos:** **termo de adesão ao serviço voluntário** (Lei 9.608/1998: escrito, com objeto e condições), base do valor justo se reconhecer. Não há NF.
5. **Riscos:** o "voluntário" que na prática é empregado (habitualidade, subordinação); ministro com ajuda que seria remuneração; serviço voluntário de empresa (que pode ter NF e ser ofertado).

### Cenário F: membro paga o fornecedor direto
1. **Fato econômico:** a igreja adquiriu o bem ou serviço (a NF está no nome dela).
2. **Financeiro:** nenhum para a igreja; do membro, o pagamento ao fornecedor.
3. **Contabilidade:** depende **só da intenção**: oferta (igual ao B) ou reembolso (igual ao A). **Se não houver declaração, o item fica "a esclarecer" e não fecha o mês.** É a situação exata das 13 NFs sem pagamento.
4. **Documentos:** NF, comprovante do membro, e o termo (oferta) ou o pedido (reembolso).
5. **Riscos:** presumir oferta; NF "órfã" que o escritório lança sem baixa e que fica anos aberta.

### Cenário G: igreja aprova, colaborador compra, igreja deve
1. **Fato econômico:** igual ao A, **com aprovação prévia**.
2. **Financeiro:** o reembolso, depois.
3. **Contabilidade:** obrigação com a pessoa desde a NF; é a situação em que o **passivo é visível e acompanhável**.
4. **Documentos:** aprovação (valor e finalidade), NF, comprovante do pagamento do colaborador, comprovante do reembolso.
5. **Riscos:** aprovação verbal; valor comprado maior que o aprovado; passivo esquecido (reembolso que vira ruído).

> **A e G são o mesmo modelo.** A diferença é só a aprovação prévia (G) e o prazo até pagar. O app deve tratar os dois como "reembolso", com a aprovação como dado opcional que aumenta o controle.

---

## 5. Os sete itens que você pediu para modelar

| # | Conceito | Como se representa |
|---|---|---|
| 1 | **Reembolso** | Aquisição com **quem suportou = pessoa** e **intenção = reembolso**. A obrigação passa a ser com a pessoa. O pagamento é uma liquidação comum. |
| 2 | **Compra ofertada** | Aquisição com **quem suportou = pessoa** e **intenção = oferta**. Extinta no ato, sem conta. |
| 3 | **Doação em bem de consumo** | **Doação direta**, natureza **consumo** ou **estoque**. Sem fornecedor. Entra em estoque, se for guardado. |
| 4 | **Doação patrimonial** | **Doação direta**, natureza **bem durável**, com **ficha do bem** (descrição, série, valor justo, doador). |
| 5 | **Doação em serviço** | **Doação direta**, natureza **serviço**, com termo de voluntariado e valor justo. Reconhecimento contábil conforme **política**. |
| 6 | **Pagamento feito por terceiro** | É o **gênero** de 1 e 2 (e de G): a Aquisição existe, quem pagou foi uma pessoa. A **intenção** decide o resto. |
| 7 | **Despesa assumida por terceiro** | Quando o custo é da **missão da igreja**, mas não há obrigação no CNPJ dela (outra entidade paga um evento). Vira **doação direta** (3, 4 ou 5) ou **só nota explicativa**, conforme o reconhecimento adotado. |

**Quatro estados novos de "quem pagou"**, sempre explícitos: *igreja pagou*, *pessoa pagou e quer reembolso*, *pessoa pagou e ofertou*, *pessoa pagou e ainda não disse* (a esclarecer).

---

## 6. Três alternativas (mais uma)

### Modelo A: "Forma de Liquidação ampliada"
Acrescentar "reembolso" e "doação" às formas de liquidação existentes.
- **Vantagens:** o menor esforço; usa as telas de hoje.
- **Desvantagens:** **confunde meio de pagamento com natureza do fato**. "Reembolso" não é um meio (é uma dívida), e "doação" não tem conta. Qualquer liquidação exige conta, então o dinheiro fictício volta pela porta dos fundos. Não existe lugar para a pessoa que pagou nem para a intenção.
- **Complexidade:** baixa agora, alta depois (cada exceção vira regra solta).
- **Aderência contábil:** baixa. **Operacional:** média. **Malote:** o comprovante de pagamento não corresponde a pagamento algum. **Financeiro:** continua contaminado.

### Modelo B: "Par receita e despesa em conta de passagem"
Formalizar o fluxo atual: uma conta transitória em que entram e saem valores iguais.
- **Vantagens:** não exige conceito novo; o DRE fica "certo" no papel.
- **Desvantagens:** é **exatamente o problema atual com outro nome**. O saldo e o fluxo de caixa se inflam; o escritório não consegue conciliar o que nunca foi ao banco; abre espaço para dinheiro fictício disfarçado.
- **Complexidade:** baixa. **Aderência contábil:** **ruim** (cria caixa que não existe). **Operacional:** alta (é o que se faz hoje). **Malote:** documentos sem lastro bancário. **Financeiro:** saldo inflado.

### Modelo C: "Aquisição, Extinção e Doação direta" (recomendado)
O descrito nas seções 1 a 5.
- **Vantagens:** fatos separados; reaproveita obrigação, estados, liquidação, vínculo, documentos e malote; o dinheiro só aparece quando é de verdade; a **intenção** vira dado auditável; o reembolso fica visível como passivo.
- **Desvantagens:** exige 4 a 5 conceitos novos (quem pagou, intenção, extinção sem conta, ficha do bem, tipos de documento); a obrigação precisa poder existir **sem** movimento de caixa (hoje a linha de lançamento faz as duas coisas).
- **Complexidade:** média. **Aderência contábil:** **alta**. **Operacional:** alta (o fluxo é o mesmo que a tesouraria já faz, com perguntas a mais). **Malote:** pastas novas com prova para cada fato. **Financeiro:** nada falso entra.

### Modelo D: "Módulo de Doações paralelo"
Um módulo próprio para doações (doador, termo, recibo), ligado às despesas por referência.
- **Vantagens:** domínio claro, relatórios de doador, facilidade de crescer.
- **Desvantagens:** **duas fontes da verdade** (despesa de um lado, doação de outro); fácil lançar uma sem a outra; duplica documentos e estados; não resolve o reembolso.
- **Complexidade:** alta. **Aderência contábil:** média. **Operacional:** baixa (dois lugares para preencher). **Malote:** duplicação. **Financeiro:** neutro.

| | A: forma de liquidação | B: conta de passagem | **C: aquisição e extinção** | D: módulo paralelo |
|---|---|---|---|---|
| Aderência contábil | baixa | **ruim** | **alta** | média |
| Aderência operacional | média | alta (hoje) | **alta** | baixa |
| Complexidade | baixa | baixa | **média** | alta |
| Impacto no malote | prova sem lastro | prova sem lastro | **prova por fato** | duplicação |
| Impacto no financeiro | contamina | **infla o saldo** | **limpo** | neutro |
| Reaproveita o que existe | pouco | pouco | **quase tudo** | pouco |

---

## 7. Por que o Modelo C

1. **É o único que separa os dois fatos.** Os outros mantêm a fusão entre "o que a igreja recebeu" e "como foi pago".
2. **É o que a arquitetura já vinha construindo.** A identidade da obrigação, as 8 situações, o vínculo único, a conferência humana e o malote por lote já foram desenhados para isso. O Modelo C **completa** a obra, os outros a **contornam**.
3. **Mata o dinheiro fictício na origem.** Com a extinção por terceiro, não há motivo para criar entrada, transferência ou saída.
4. **Dá a resposta certa ao escritório.** Cada caso chega com os fatos e as provas, e a contabilidade escolhe a conta. O app não decide política contábil por conta própria.
5. **Cabe na realidade de igreja pequena.** O tesoureiro responde a **três perguntas** (quem pagou, qual a intenção, qual a prova), não a um formulário contábil.

**Por que os demais foram descartados:** A porque confunde meio de pagamento com natureza e recria o caixa falso; B porque **é** o problema; D porque cria duas verdades onde hoje há uma.

---

## 8. O que o modelo mudaria em cada parte do sistema

| Parte | Efeito conceitual |
|---|---|
| **Saldo, caixa e fluxo** | Só extinções com conta da igreja entram. A **entrada fictícia deixa de existir**. Entrada em espécie passa a exigir **contagem do envelope**. |
| **DRE** | Uma linha de receita "Doações não monetárias" **pareada** com a despesa correspondente (resultado neutro no consumo). |
| **Extrato e conciliação** | Sem mudança. Só entram extinções bancárias. |
| **Estados da despesa** | Sem mudança. Extinção por terceiro termina em **Conferida**, não em Conciliada. |
| **Mesa e Contas a pagar** | Duas filas novas: **reembolsos a pagar** (para a pessoa) e **a esclarecer** (pagador sem intenção). |
| **Fechamento do mês** | Bloqueia "a esclarecer" e adiantamento vencido, como já bloqueia despesa sem categoria. |
| **Malote** | Pastas novas: **Doações** (termo + NF/valor + comprovante do doador), **Reembolsos** (NF + pedido + comprovante do reembolso), **Patrimônio recebido** (ficha do bem). Regra: **nenhum comprovante de pagamento que não houve**. |
| **Patrimônio** | Só a **ficha do bem** (descrição, série, valor justo, data, doador, local). A depreciação continua com o escritório. |
| **Estoque** | Recebe bens de consumo doados, sem valor financeiro. |
| **Sustento** | Adiantamentos de prebenda e reembolsos do pastor ficam **separados** (a prebenda tem regra própria). |

---

## 9. As conclusões da auditoria, avaliadas contra este modelo

| Conclusão da auditoria | Coerente? | Como o modelo a trata |
|---|---|---|
| **Compras ofertadas sem reembolso** | **Sim** | É "pessoa pagou e ofertou" (cenário B ou F). R$ 1.554,55 de "Ofertas" fictícias em 2026 (e R$ 897,39 + R$ 147,30 em 2024) são o sintoma. |
| **Compras em espécie apresentadas como oferta** | **Em parte, e o modelo corrige** | Precisa **separar duas coisas**: (i) o membro pagou do bolso e ofertou: doação não monetária; (ii) **a igreja pagou em dinheiro do Caixa Auxiliar** (Del Castilho, Accor, PAF): é pagamento da igreja, **só falta lançar**. A confusão entre (i) e (ii) é a origem do problema. |
| **Compras com NF da igreja** | **Sim, e é uma regra** | NF no CNPJ da igreja ⇒ a igreja é a compradora; quem pagou ainda se esclarece. **NF no CPF do membro** ⇒ bem do membro, **doação de bem**. |
| **Compras sem NF** | **Sim** | Níveis de prova: NF, cupom fiscal, recibo, declaração. Sem nenhum, **não há despesa comprovada**: ou vira **adiantamento com prazo** ou doação com declaração. Nunca "pago e esquecido". |
| **Reembolsos em aberto** | **Sim** | São "pessoa pagou e quer reembolso". Hoje a saída fica com o **fornecedor** como favorecido e o **pastor some**; o modelo guarda os dois papéis. |
| **Adiantamentos** (R$ 51.938,29) | **Sim** | Extinção por adiantamento: pago sem NF, **aguardando prestação de contas**, com prazo; fecha por compensação, desconto ou devolução. 27 das 32 linhas já existem no app, **só falta documento**. |
| **Ativo em Processamento** (R$ 13.863,99) | **Sim** | É o lugar onde o escritório guarda o "pago sem documento". No novo fluxo, pagamento **sem documento** aparece como **"falta documento"** no app, antes do malote, e nunca chega lá. |
| **13 NFs sem nenhum rastro** | **Sim, são o cenário F** | "Pagador a esclarecer". O modelo as trata como fila obrigatória: ninguém decide por elas. |

**O que a auditoria apontou e o modelo confirma:** a maior parte das pendências é **documental**; muitas despesas **já existem** no app; o problema era **como a liquidação foi representada**. É exatamente a tese do Modelo C.

---

## 10. Princípios que protegem a arquitetura

1. **Fato econômico e fato financeiro são separados.** Só dinheiro da igreja mexe em saldo.
2. **A pessoa é uma parte, não um comentário.** Pagador, doador e beneficiário do reembolso são Pessoas.
3. **A intenção é explícita e datada.** Sem declaração, "a esclarecer". Nunca se presume oferta.
4. **O documento prova o fato, não o movimento.** Não se gera comprovante de pagamento que não houve.
5. **O app guarda fatos e provas; a contabilidade escolhe a conta.** O app **não** codifica política contábil (receita imediata ou diferida, com ou sem restrição, voluntário reconhecido ou não): isso é parametrizável.
6. **A obrigação continua a mesma ao longo da vida.** Reembolso, doação e adiantamento são **destinos** da mesma obrigação, não objetos novos.
7. **O histórico não se reescreve em silêncio.** Qualquer correção do passado é auditada (padrão da reabertura e da conta auditada).

---

## 11. Decisões que são suas e do escritório

**Política (antes de qualquer implementação):**
1. **Documento mínimo** para compra pequena sem NF: cupom fiscal, recibo ou só declaração? Qual o limite de valor?
2. **Trabalho voluntário:** reconhecer pelo valor justo ou só divulgar em nota? **[confirmar]**
3. **Bem durável doado:** qual o limite de capitalização; receita imediata ou diferida; quando vai a patrimônio social (dotação)? **[confirmar]**
4. **Reembolso:** prazo máximo, quem aprova, qual o teto sem aprovação prévia?
5. **Adiantamento:** prazo para prestar contas e o que acontece depois do prazo (desconto, cobrança).
6. **Pastor:** reembolso e prebenda ficam **sempre** separados? Quais despesas podem ser reembolsadas ao pastor?
7. **Recibo ao doador:** a igreja emite? Com que texto? (Sem efeito de dedução de Imposto de Renda.)

**Ao escritório:**
8. Quais contas usar para a receita de doação não monetária e para o trabalho voluntário.
9. O ITCMD sobre doação recebida está coberto pela imunidade dos templos? **[confirmar]**

**Sobre o passado (só depois da política):**
10. Como tratar o que já foi lançado como "entrada fictícia" (R$ 1.554,55 em 2026): estorno e reclassificação combinados com o escritório, **com auditoria**.

---

## 12. Ordem sugerida de implantação (só a ordem, sem escopo)

1. **Política e vocabulário** (seção 11), com o escritório.
2. **Parar o sangramento:** regra de que não se cria mais entrada, transferência ou saída fictícia; fila "a esclarecer" para o que já existe.
3. **Reembolso e extinção por terceiro** (o caso mais frequente e o que mais pesa nas pendências).
4. **Doação direta** (consumo, bem durável, serviço), com a ficha do bem mínima.
5. **Malote e fechamento** com as pastas e os bloqueios novos.
6. **O histórico**, por último e com o escritório.
