# Auditoria contábil e operacional — compras feitas por membro/pastor (13/10/2026)

> Somente análise. Nada foi implementado. Base: balancete e DRE de 08/2026 do escritório (ALPL), as planilhas `ALPL_CONT_010` (análise) e `ALPL_CONT_111` (solicitação de documentos) e os dados reais do DiakoniaApp.
>
> **Limite desta análise:** é uma leitura técnica para você levar ao escritório, não um parecer contábil. Os pontos que dependem do julgamento do contador (CRC) estão marcados **[confirmar]** e reunidos na seção 8.

---

## 1. Respostas curtas

1. **O fluxo "entrada fictícia → transferência → saída" deve deixar de existir.** O dinheiro nunca passou pela igreja, e o fluxo cria caixa, receita de "Ofertas" e transferência que não existiram. O escritório já reclama disso (seção 2).
2. **Compra feita por membro, NF no CNPJ da igreja, sem reembolso = doação recebida, não movimento financeiro.** Contabilmente: *Despesa (ou Estoque, ou Imobilizado) a débito, Receita de doação a crédito.* Nenhuma linha em Caixa ou Banco.
3. **Classificação:** a receita é sempre **doação voluntária de pessoa física, não monetária (aplicada direto no pagamento)**. O que muda é o débito: material de consumo → despesa; material para uso futuro → estoque; bem durável acima do limite de capitalização → imobilizado.
4. **Compra com reembolso = obrigação da igreja com o membro, paga depois.** Existe saída financeira real, no dia do reembolso, para **a pessoa**, e a despesa nasce na data da NF.
5. **O DiakoniaApp hoje perde a informação central dos dois cenários:** quem recebeu o dinheiro (reembolso) e quem doou (doação). No reembolso, a saída fica com o *fornecedor da NF* como favorecido; o pastor some.

---

## 2. O que o escritório já está dizendo (evidência nos arquivos)

| Evidência | O que significa para esta análise |
|---|---|
| Nota explicativa 5: *"Os pagamentos realizados pelo banco que não têm identificação são lançados no Caixa… por isso a conta Caixa apresenta saldo elevado. O cliente não possui relatório diário de caixa."* | O escritório usa o Caixa como "depósito" do que não identifica. Caixa fictício no nosso lado piora isso. |
| Análise 08/2026: **Caixa Auxiliar R$ 448,92** e **Caixa Envelope R$ 0,00** — *"Falta ajustar saldo no Omie / saldo divergente do relatório"*. No DiakoniaApp: Caixa de Envelopes R$ 634,60, Caixinha −R$ 29,30. | Os saldos de caixa dos dois lados não batem. O fluxo fictício é uma das causas prováveis. |
| **Ativo em Processamento R$ 13.863,99** = Bradesco 8.586,62 + Cartão 5.210,37 + Caixa 67,00. Quase tudo: *"favor enviar nota fiscal / fatura"*. | É a conta onde o escritório "estaciona" pagamento sem documento. **Zerar = enviar o documento de cada linha.** |
| **Adiantamentos R$ 51.938,29** = despesas operacionais 17.226,56 + fornecedores de materiais 221,40 + fornecedores de serviços 34.490,33. | Pagamento a **pessoa** sem NF/RPA/prestação de contas vira *crédito a receber* da pessoa. É o destino do reembolso mal documentado. |
| Cartão de crédito a pagar R$ 8.431,67 (fatura 06/2026 pendente); Título de Capitalização R$ 4.577,76 (contrato); fornecedores R$ 22.473,46; RPA a pagar R$ 2.453,76; prebenda a pagar R$ 10.532,55; contas correntes de Missões R$ 8.312,71. | Pendências de outras naturezas. Mapa na seção 6. |
| DRE: a igreja já tem *Receitas c/ restrições* (dízimos), *s/ restrições* (**Contribuições e Doações Voluntárias — Pessoas Físicas**), rendimentos e *Recuperação de despesas*. | A estrutura de contas para **registrar a doação já existe** no plano do escritório. Padrão de entidade sem fins lucrativos (ITG 2002). |

---

## 3. Cenário 1 — compra feita por membro/pastor, NF no CNPJ da igreja, **sem reembolso**

### 3.1 As seis perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | **Fato econômico real** | A igreja recebeu um bem ou serviço sem suportar o custo. Um terceiro pagou a dívida dela com ânimo de liberalidade ("estou ofertando"). **É uma doação** (Código Civil, art. 538: transferência de patrimônio por liberalidade). |
| 2 | **Fato financeiro real** | **Nenhum.** Nenhum recurso entrou ou saiu das contas da igreja. O desembolso foi do doador, direto ao fornecedor. |
| 3 | **Documentação que deve existir** | **(a)** NF/DANFE e XML em nome do CNPJ da igreja. **(b)** **Termo de doação** assinado pelo doador (nome, CPF, descrição, valor igual ao da NF, data, declaração *"sem direito a reembolso"*) e aceite da igreja (tesouraria/diretoria). **(c)** Comprovante de que o doador pagou (cupom, extrato do cartão, PIX): mostra a *origem* do recurso e que não houve reembolso. |
| 4 | **O que enviar à contabilidade** | NF + termo de doação + comprovante do pagamento do doador, **numa só pasta**, com a competência do mês da NF. **Não** enviar como movimento de caixa/banco. |
| 5 | **Lançamento esperado** | Ver 3.3. |
| 6 | **Fluxo no DiakoniaApp** | Ver 3.5. |

### 3.2 Análise especial — que tipo de doação é?

| Alternativa | Veredito | Por quê |
|---|---|---|
| Doação financeira | **Não** | Nenhum dinheiro passou pela igreja. Tratar como financeira é o que gera a entrada fictícia. |
| Doação em bens | **Sim, quando o item é bem durável** | Bem recebido em doação é reconhecido pelo **valor justo** (aqui, o valor da NF). Acima do limite de capitalização vai ao **Imobilizado** (doação patrimonial). **[confirmar limite de capitalização e se a receita é imediata ou diferida]** |
| Doação em materiais de consumo | **Sim, quando é consumo** | Receita de doação e despesa de consumo no mesmo mês; efeito líquido no resultado = zero. |
| Doação patrimonial | **Só quando vira imobilizado** | Piso, carpete e reforma relevantes podem ser benfeitoria (imobilizado) em vez de "manutenção". |
| Outra classificação | **Sim, no rótulo** | Receita: *Contribuições e Doações Voluntárias — Pessoas Físicas*, em subconta **"não monetária / pagamento direto por terceiro"**. Se o doador designou o uso, vai em *com restrição*. |

**Conclusão:** uma classificação só para a receita (doação PF não monetária) e três possíveis para o débito, conforme a natureza do item.

### 3.3 Lançamento contábil esperado (regime de competência)

| Caso | Débito | Crédito | Caixa/Banco |
|---|---|---|---|
| Material de consumo | Despesa (Material de Consumo) | Receita — Doações PF (não monetária) | **Nenhum** |
| Material para uso futuro | Estoque | Receita — Doações PF (não monetária) | **Nenhum** |
| Bem durável acima do limite | Imobilizado | Receita — Doações PF (não monetária) **[confirmar: imediata ou diferida]** | **Nenhum** |
| Serviço | Despesa do serviço | Receita — Doações PF (não monetária) | **Nenhum** |

No resultado, consumo e doação se anulam. A receita **não** aparece em "Ofertas" nem em "Dízimos", e a DFC **não** conta como entrada de caixa (transação sem caixa: vai em nota explicativa, NBC TG 03).

### 3.4 Por que o fluxo atual está errado

**Fluxo atual:** *Entrada em espécie* (Caixa de Envelopes, categoria "Ofertas") → *Transferência* (Caixa de Envelopes → Caixinha) → *Saída* (despesa na Caixinha).

| Problema | Efeito |
|---|---|
| Cria caixa que nunca existiu | O saldo físico de Caixa de Envelopes/Caixinha não confere com a contagem. O escritório já aponta divergência. |
| A entrada é classificada como **"Ofertas"** | Infla a receita de ofertas e relatórios de arrecadação com dinheiro que ninguém colocou no envelope. |
| A transferência não existiu | Movimenta duas contas por algo que não aconteceu. |
| Nada liga a despesa ao doador | Quem doou, e quanto, não fica registrado. |
| Para o escritório, é um lançamento sem lastro | Entrada em espécie sem contagem e sem documento: exatamente o que ele manda para "Ativo/Passivo em processamento". |

**Quanto existe no DiakoniaApp** (busca por "doação / ofertad / compradas", 16 lançamentos):

| Quando | O quê | Valor |
|---|---|---|
| 22/07/2026 | Entrada "Doação de NF" (Caixa de Envelopes, Ofertas) + saída "Doação Pr. LUCIO" (Caixinha, Manutenção de Imobilizado) | R$ 741,24 |
| 03/09/2026 | Entrada "Notas compradas e ofertadas no envelope" (Ofertas) + saídas "Doação de NF Piso Arosa RT" (156,41) e "…Adesivo cola para carpete…" (656,90) | R$ 813,31 |
| 2024 | 10 saídas "doação…" + 1 entrada | R$ 897,39 / R$ 147,30 |

**Total 2026: R$ 1.554,55 de "Ofertas" que não foram ofertas em dinheiro.** A descrição de 03/09 mostra o mecanismo: o membro colocou as **notas** no envelope de ofertas.

### 3.5 Fluxo correto no DiakoniaApp (desenho, sem código)

1. **Um único registro: "Despesa custeada por terceiro (doação)".** Não gera entrada, transferência nem saída.
2. **Campos:** NF (emitente, número, valor, data), **doador** (pessoa), natureza do item (consumo / estoque / durável / serviço), termo de doação anexado, comprovante do doador.
3. **Estados:** sem "Pagamento realizado" e sem "Conciliação" (não há banco). Vai direto a **Conferida → Pronta para Malote**, pela regra já aprovada para conta sem extrato (documento + comprovante + conferência humana).
4. **Efeitos:** conta = "sem movimentação financeira"; **fora** do saldo, do fluxo de caixa e da conciliação; **dentro** do DRE por competência (despesa **e** receita de doação, pareadas); na DFC, só nota explicativa.
5. **Malote:** pasta própria "Doações em bens e serviços", com o par NF + termo.

---

## 4. Cenário 2 — compra feita por membro/pastor **com reembolso**

### 4.1 As seis perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | **Fato econômico** | A igreja adquiriu o bem/serviço **na data da NF** e assumiu uma dívida com o membro, que adiantou o pagamento por conta dela. A despesa é da data da compra. |
| 2 | **Fato financeiro** | **Saída real no dia do reembolso**, da conta (Bradesco ou Caixinha) **para a pessoa** (o favorecido do pagamento é o membro, não o fornecedor). |
| 3 | **Documentação** | **(a)** NF/DANFE em nome do CNPJ da igreja (ou cupom fiscal com CNPJ). **(b)** Prova de que o membro pagou. **(c)** **Pedido de reembolso** com aprovação. **(d)** Comprovante do reembolso (PIX/recibo, assinado se foi em espécie). |
| 4 | **O que enviar** | NF + pedido aprovado + comprovante do reembolso. O escritório lê o **extrato** como pagamento a uma pessoa, e a NF como o fato gerador. As duas pontas precisam estar ligadas. |
| 5 | **Lançamento** | Na compra: **D** Despesa (ou Estoque, ou Imobilizado), **C** Reembolso a pagar (obrigação com pessoa). No reembolso: **D** Reembolso a pagar, **C** Banco/Caixa. Se compra e reembolso caem no mesmo mês, pode ser direto: D Despesa, C Banco. |
| 6 | **Fluxo no DiakoniaApp** | Ver 4.3. |

### 4.2 Variantes do mesmo cenário

| Variante | Tratamento | Risco |
|---|---|---|
| **NF no CNPJ da igreja + reembolso** | Caso padrão acima. | Baixo. |
| **NF em nome da pessoa (CPF) ou cupom sem CNPJ** | O gasto não é comprovável como da igreja. O escritório lança como **Adiantamento** (crédito a receber da pessoa) até haver documento. | É exatamente o que está nos R$ 17.226,56. |
| **Adiantamento antes da compra** | **Ativo (adiantamento)** até a prestação de contas; ao receber a NF, baixa o adiantamento contra a despesa. Prazo e saldo precisam ser acompanhados. | Médio: vira pendência permanente se ninguém cobra. |
| **Dinheiro/prebenda para o pastor "para despesas" sem prestação de contas** | Pode ser interpretado como **remuneração** (IRRF/INSS), não reembolso. | **Alto.** O escritório já pergunta "informar data de desconto". |

### 4.3 Fluxo correto no DiakoniaApp (desenho, sem código)

1. **Pedido de reembolso** (membro ou tesouraria): NF anexada, valor, favorecido = **membro**.
2. **Dois "quem"**: **emitente da NF** (fornecedor, define o documento) e **favorecido do pagamento** (membro, define o extrato). Hoje o app só guarda um.
3. **Competência** = data da NF; **vencimento/pagamento** = data do reembolso.
4. **Aprovação** (Tesouraria ou Administrador) antes de pagar.
5. **Pagamento** pelo fluxo normal (conciliação com o extrato).
6. **Malote:** NF + pedido + comprovante do reembolso, ligados à mesma obrigação.
7. **Categoria** continua sendo a **natureza da despesa**, nunca "Reembolso".

---

## 5. Tabela de situações

| Situação | Tratamento atual | Problema | Tratamento correto | Impacto na contabilidade | Impacto no malote | Impacto no financeiro | Recomendação |
|---|---|---|---|---|---|---|---|
| **A. Compra ofertada, NF no CNPJ da igreja** | Entrada em espécie (Ofertas) → transferência → saída | Caixa e receita de "Ofertas" fictícios; sem doador; divergência de caixa | **Doação não monetária**: D despesa/estoque/imobilizado, C receita de doação. Sem Caixa/Banco | Aparece como doação PF; resultado neutro (consumo); some a divergência de caixa | NF + termo de doação + comprovante do doador | Sai do saldo e do fluxo de caixa (não é financeiro) | **Encerrar o fluxo fictício.** Criar "Despesa custeada por terceiro" |
| **B. Compra ofertada, NF no CPF do doador** | Mesmo fluxo fictício | Não há NF da igreja; o escritório não reconhece como despesa | **Doação de bem** pelo valor justo (valor da NF do doador): D estoque/imobilizado/despesa, C receita de doação | Idem A, mas a NF do doador é só prova de valor | Termo de doação + cópia da NF do doador | Nenhum | Exigir termo; **[confirmar]** se o escritório aceita a NF em CPF como valor justo |
| **C. Reembolso, NF no CNPJ da igreja** | Saída da Caixinha, com o fornecedor como favorecido. A pessoa que recebeu não fica registrada | O extrato mostra pagamento a uma pessoa e o app diz "pago ao fornecedor" | Obrigação com a pessoa; despesa na data da NF; saída real no reembolso para a pessoa | Despesa na competência certa; sem Adiantamento | NF + pedido aprovado + comprovante do reembolso | Saída real no dia do reembolso | Separar **emitente da NF** de **favorecido do pagamento** |
| **D. Reembolso sem NF da igreja (CPF/cupom)** | Saída lançada; a pessoa recebe | Sem comprovação: o escritório joga em Adiantamento (R$ 17.226,56) | Exigir documento válido **antes** de pagar. Sem documento, tratar como adiantamento a receber, com prazo | Evita crédito a receber permanente e risco de remuneração disfarçada | Só envia o que tem documento | Reembolso só com NF | Bloquear aprovação sem NF |
| **E. Pagamento em espécie ao pastor/membro "a pedido"** | Saída de caixa com descrição livre | Sem destino: Adiantamento (ex.: 1.253,79, 280,00 e 200,00 ao pastor) | Prebenda (se for remuneração, com tratamento próprio) **ou** adiantamento com prestação de contas | Pode virar IRRF/INSS | Recibo + justificativa | Saída real, sem lastro | Decidir **a natureza** de cada um **[confirmar com o escritório]** |
| **F. Adiantamento de prebenda** (R$ 10.000 + 1.200 + 3.362 + 1 + 1) | Registrado como pagamento | Fica como Adiantamento aguardando "informar data de desconto" | Desconto na prebenda do mês seguinte, com a data informada | Baixa o adiantamento contra a prebenda | Demonstrativo de desconto | Nenhum novo | Responder as 5 linhas: data do desconto |
| **G. Pagamento sem documento (Ativo em Processamento)** | Pago pelo banco/cartão/caixa, sem NF ou fatura | R$ 13.863,99 parados | Enviar o documento de cada linha | Cada linha vira despesa na conta certa | Documento na pasta do mês | Nenhum | Cruzar as 27 linhas com o DiakoniaApp (seção 7) |
| **H. Compra no cartão (fatura)** | Saída do Cartão por lançamento | Falta fatura 06/2026; NF/bilhete das compras parceladas | Fatura completa + NF de cada compra | Baixa Cartão a pagar (R$ 8.431,67) | Fatura + NFs | Nenhum | Enviar a fatura de 06/2026 primeiro |
| **I. Entrada fictícia em espécie (qualquer motivo)** | Lançada como Ofertas | Receita que não existiu | **Deixar de existir.** Receita só com dinheiro contado e depositado | Remove ruído | — | Remove saldo fictício | Regra no app: entrada em espécie exige contagem do envelope |

---

## 6. Mapa das pendências do escritório → ação

| Conta | Valor | Natureza | Ação que zera | Depende de |
|---|---|---|---|---|
| 100165 Ativo em Processamento | R$ 13.863,99 | Pagamento sem documento (27 linhas) | Enviar NF/fatura de cada linha | Você / favorecidos |
| 112463 Adiantamento despesas operacionais | R$ 17.226,56 | Prebenda 14.564,00 + espécie ao pastor 1.733,79 + compras/reembolsos sem NF 928,77 | Prebenda: data do desconto. Espécie: natureza. Compras: NF (203,00 e 26,77 já "ajustados no Omie") | Você + escritório |
| 112481 Adiantamento fornecedor de materiais | R$ 221,40 | Letra do Céu (05/2025) | NF | Fornecedor |
| 112482 Adiantamento fornecedor de serviços | R$ 34.490,33 | 17 pagamentos sem NF, 12 deles a uma mesma prestadora | NF ou RPA de cada um | Prestadores |
| 122006 Título de Capitalização | R$ 4.577,76 | Contrato | Enviar o contrato | Você |
| 211005 / 211006 Fornecedores | R$ 22.473,46 | "Verificar pendências com a Telma" | Baixar com data de pagamento | Você |
| 211998 Cartão a pagar | R$ 8.431,67 | Fatura 06/2026 | Enviar a fatura | Você |
| 211884 RPA a pagar | R$ 2.453,76 | Pagamento/competência | Informar datas | Você |
| 211885 Prebenda a pagar | R$ 10.532,55 | Saldo | Informar pagamentos | Você |
| 222505 / 222506 Contas correntes Missões | R$ 8.312,71 | Saldo | Conciliar com o Indicadores Missionários | Você |
| 111172 / 111173 Caixa | R$ 448,92 / 0,00 | Saldo divergente | Fechar caixa físico; acabar com o fluxo fictício | Você |
| 111342 Bradesco / 111795 Aplicação | R$ 1,00 / R$ 15.191,91 | Extrato consolidado 05/2026 | Enviar o extrato | Você |

Observação: nenhuma dessas linhas se resolve com lançamento novo no app. **São documento ou resposta.** O que o app pode fazer é indicar, linha a linha, o que já existe e o que falta (seção 7).

---

## 7. Impacto no malote

1. **Pasta nova "Doações em bens e serviços"**: NF + termo + comprovante do doador.
2. **Reembolsos**: NF + pedido aprovado + comprovante do pagamento **à pessoa**, ligados.
3. **Nada de documento sem movimento correspondente**: hoje o malote leva comprovante de "pagamento" que nunca houve.
4. **Cruzamento recomendado antes de enviar:** casar as 27 linhas do *Ativo em Processamento* com o DiakoniaApp (valor e data), mostrando documento já anexado ou faltante. Muitas pendências podem já estar resolvidas aqui e só falta enviar o arquivo.

---

## 8. O que confirmar com o escritório

1. **Limite de capitalização** (bem durável vs. despesa) e se piso/carpete é benfeitoria.
2. **Doação de bem durável:** receita imediata ou diferida, e se vai com ou sem restrição.
3. **Conta contábil** para a receita *"Doações PF — não monetária"* (hoje a DRE só mostra "Contribuições e Doações de Pessoas Físicas").
4. **NF em CPF do doador:** aceita como prova de valor?
5. **Reembolso a pastor:** o que exige para não ser tratado como remuneração (IRRF/INSS).
6. **ITCMD/imunidade** sobre doação recebida (imunidade de templos) **[confirmar]**.
7. **Adiantamentos antigos de prebenda:** como o escritório quer a data de desconto.
8. **Caixa:** o que o escritório espera como "relatório diário de caixa" para o fechamento.

---

## 9. Decisões que são suas

1. Encerrar o fluxo "entrada fictícia + transferência + saída" a partir de já? (Recomendado.)
2. Regularizar os R$ 1.554,55 de 2026 e os de 2024 (estorno do fluxo fictício e reclassificação como doação), em conjunto com o escritório?
3. Tornar obrigatório o **termo de doação** e o **pedido de reembolso** com aprovação?
4. Exigir **NF antes de aprovar reembolso** (sem NF = adiantamento com prazo)?
5. Cruzar as pendências do escritório com o app antes de enviar a resposta?
