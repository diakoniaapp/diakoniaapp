# Caso Del Castilho — NF-e 24.553, R$ 255,30 (10/08/2026)

> Relatório de **03/10/2026**. **Nada foi corrigido nem gravado.** Os números foram
> medidos no banco de produção (somente leitura) e conferidos contra o arquivo real
> de agosto (`08 - AGO-2026`) e o PDF guardado no sistema.

## 1. Conclusão e decisão

O documento foi **pago em espécie em 10/08/2026, a partir da Caixinha (Caixa
Auxiliar), e nunca foi lançado.** Decisão da Telma (03/10/2026) sobre como lançar:

> **Entrar no Caixa de Envelopes → transferir para a Caixinha → ser pago.**

São **3 lançamentos em 10/08/2026, todos de R$ 255,30** (seção 6). Esse fluxo é
coerente com toda a evidência: o dinheiro entra como receita **ainda não registrada**
no envelope (uma oferta ou dízimo contado a mais do que foi lançado), por isso o
depósito de 11/08 (R$ 690,00) continua batendo com o saldo registrado e **nenhum saldo
existente é alterado** (seção 7).

**Falta de você:** a categoria da **entrada** (seção 8) e o **nome do fornecedor**
(seção 4). **Eu não consigo gravar em produção**; os 3 lançamentos devem ser feitos
pelas telas do sistema (assim o carimbo de auditoria e o par da transferência saem
certos). Os valores a digitar estão na seção 6.

## 2. Dados completos da NF

| Campo | Valor |
|---|---|
| Documento | NF-e, modelo **55**, série **7**, nº **24.553** |
| Chave de acesso | `3326 0822 7539 8900 0147 5500 7000 0245 5310 0075 4460` |
| Emissão | **10/08/2026 15:35:44** (saída 15:55:43) |
| **Valor total da nota** | **R$ 255,30** |
| Emitente | **DEL CASTILHO MADEIRAS E CONSTRUCAO LTDA** |
| **CNPJ do emitente** | **22.753.989/0001-47** · IE 86953730 · UF RJ |
| Destinatário | QUARTA IGREJA BATISTA RJ — CNPJ 27.639.285/0001-61 |
| Natureza da operação | VENDA AO CONSUMIDOR (operação interna, consumidor final, presencial) |
| Situação | AUTORIZADA (produção) — protocolo 233260371829350, 10/08/2026 15:37:57 |
| Ciência da operação | registrada pelo destinatário em 11/08/2026 02:50:42 (evento 210210) — horário de madrugada, compatível com manifestação automática |
| Forma de pagamento | **não consta no PDF** (visualização do portal sem o grupo de pagamento). O arquivo de agosto a identifica como **PG ESPECIE** |
| Itens | **não constam** no PDF (só a visualização resumida) |
| Arquivo no sistema | `fin-comprovantes/tmp/1789358496917.pdf` · 112.238 bytes · enviado em 14/09/2026 |
| Arquivo na tesouraria | `02. CAIXA AUXILIAR \ 10.AGO \ 10.08.2026 - R$255,30 _ NF24553 _ DEL CASTILHO MADEIRAS E CONSTRUCOES _ PG ESPECIE.pdf` |

**Conta de origem do pagamento:** **Caixinha Administrativo** (na tesouraria,
"Caixa Auxiliar") — o arquivo está na pasta `02. CAIXA AUXILIAR` e o nome diz
"PG ESPECIE".

## 3. Evidências de que não existe lançamento

| Busca | Resultado |
|---|---|
| Lançamento de R$ 255,30, qualquer conta, status, tipo ou data (out/2025 em diante) | **nenhum** |
| Lançamento cancelado em agosto | nenhum |
| Valor parecido (±5%) entre 25/07 e 15/09 | só de outros fornecedores (Cbd R$ 260, Claro R$ 257,96, Obramax R$ 251,10, Modamusic R$ 259,90) |
| Dois ou três lançamentos do mesmo dia que somem R$ 255,30 | nenhum |
| Menção textual (descrição, observação, nº do documento): "castilho", "24553", o CNPJ | nenhuma |
| Saídas da Caixinha em 10/08 | **nenhuma** (só uma transferência de R$ 2,00 entrando) |
| Transferência de R$ 255,30 entre contas | nenhuma |
| Arquivo de agosto × sistema, Caixa Auxiliar | **18 PDFs × 17 saídas**, todas as 17 casadas: falta exatamente esta |

## 4. O fornecedor contaminado

O fornecedor com este CNPJ **existe**, mas se chama **"Chave de Acesso Número Nf-E
Versão"** (id `3fe29266…`), criado em **14/09/2026 01:00** pelo leitor de PDF, que
tomou o cabeçalho do documento por razão social. Tem 2 lançamentos, ambos da
Caixinha, importados do Omie em 29/09:

| Data | Valor | Categoria | Descrição vinda do Omie |
|---|---|---|---|
| 18/08/2025 | R$ 780,03 | Material de Consumo | `ATACADAO DEL CASTILHO` |
| 21/08/2025 | R$ 159,00 | Material de Consumo | `ATACADAO DEL CASTILHO` |

É o **único** cadastro contaminado entre os 325 fornecedores (verificado por rótulos
de NF, URLs, símbolos e tamanho).

### Nome correto — minha recomendação, para você confirmar

| Opção | Origem |
|---|---|
| **`Del Castilho Madeiras e Construcao LTDA`** | razão social **da NF-e autorizada** (CNPJ 22.753.989/0001-47), sem cedilha, como o portal a emite |
| `Atacadao Del Castilho` | nome fantasia que o Omie trouxe para os 2 lançamentos de 2025 |

**Recomendo a razão social**, que é o padrão do cadastro ("Supermercado Mundial LTDA",
"Prodesc Benfica Embalagens LTDA ME") e a que o contador encontra na nota; o nome
fantasia pode ir em `observacao`. **Não vou alterar nada até você confirmar.** A
correção é um `UPDATE` de uma linha em `fin_fornecedores` (`id 3fe29266…`).

## 5. De onde saiu o dinheiro — o que a evidência permite concluir

O Caixa de Envelopes é um caixa de passagem: **saldo hoje R$ 0,00**. Em **11/08**
saíram dele **R$ 650,00 + R$ 40,00 = R$ 690,00**, exatamente o saldo que ele tinha no
fim de 10/08 — são os dois "DEPOSITO ESPECIE" de 11/08 do arquivo da tesouraria.

- **O dinheiro não saiu de saldo já registrado no envelope:** se R$ 255,30 tivessem
  saído dele em 10/08, o depósito de 11/08 teria sido de R$ 434,70, não de R$ 690,00.
- **Mas é compatível com o fluxo decidido (entrada nova no envelope):** se foi
  contado/recebido R$ 255,30 a mais do que se registrou, o envelope **recebe** essa
  entrada, **repassa** à Caixinha e esta **paga** — e o depósito de R$ 690,00 continua
  igual. Foi o padrão que o sistema já usa: a Caixinha recebe do envelope o valor
  **exato** de cada compra em espécie (R$ 29,90 e R$ 34,02 em 03/08; R$ 14,00 e
  R$ 13,00 em 12/08).

## 6. O que lançar — 3 lançamentos em 10/08/2026

| # | Conta | Tipo | Valor | Detalhe |
|---|---|---|---|---|
| 1 | **Caixa de Envelopes** | Entrada | R$ 255,30 | categoria **a definir** (seção 8) · realizado |
| 2 | Caixa de Envelopes → **Caixinha Administrativo** | Transferência | R$ 255,30 | pela tela de transferência (cria as duas pernas) |
| 3 | **Caixinha Administrativo** | Saída | R$ 255,30 | fornecedor **Del Castilho** · realizado · categoria **a definir** (Material de Consumo, como em 2025, ou Manutenção de Imobilizado) · anexar a NF-e |

## 7. Impacto

### Caixinha e Caixa de Envelopes — **nenhum**

Verificado dia a dia: com os 3 lançamentos, a série de saldos das duas contas é
**idêntica à atual** em todas as datas.

| | Fim de 10/08 | Fim de agosto | Hoje |
|---|---|---|---|
| Caixinha | R$ 652,96 | R$ 572,95 | **R$ 57,70** (igual) |
| Caixa de Envelopes | R$ 690,00 | R$ 0,00 | **R$ 0,00** (igual) |

### Agosto/2026 — receita e despesa sobem juntas; **o resultado não muda**

| | Hoje | Com os 3 lançamentos | Variação |
|---|---|---|---|
| Entradas | R$ 94.525,88 | R$ 94.781,18 | + R$ 255,30 (+ 0,27%) |
| Saídas | R$ 85.742,72 | R$ 85.998,02 | + R$ 255,30 (+ 0,30%) |
| **Resultado** | **R$ 8.783,16** | **R$ 8.783,16** | **R$ 0,00** |
| Categoria da despesa — Material de Consumo | R$ 5.119,57 | R$ 5.374,87 | + 5,0% (se for esta) |
| Categoria da despesa — Manutenção de Imobilizado | R$ 18.045,54 | R$ 18.300,84 | + 1,4% (se for esta) |

A transferência **não** entra nos totais (o sistema exclui as pernas de transferência).

### Exercício 2026 (jan–set)

| | Hoje | Com os 3 lançamentos | Variação |
|---|---|---|---|
| Entradas | R$ 663.801,65 | R$ 664.056,95 | + R$ 255,30 |
| Saídas | R$ 709.243,25 | R$ 709.498,55 | + R$ 255,30 (+ 0,04%) |
| **Resultado** | **− R$ 45.441,60** | **− R$ 45.441,60** | **R$ 0,00** |

### Atenção — a receita sobe R$ 255,30

O lançamento 1 é **receita nova** de R$ 255,30 em agosto (na categoria que você
escolher: Dízimos, Ofertas ou Ofertas para Missões — as três usadas no envelope em
jul–set). Isso muda os indicadores eclesiásticos de agosto (se for Dízimos/Ofertas) e
a DRE. **Se o malote de agosto já foi enviado à contabilidade, convém avisar.**

### Outros relatórios

- **Pacote Contábil de agosto:** passa a ter 1 saída a mais **com** documento.
- **Cobertura documental de 2026:** + 1 lançamento com documento (+ 0,13 p.p.).

## 8. Decisões confirmadas pela Telma (03/10/2026) e como executar

| Decisão | Valor |
|---|---|
| Nome do fornecedor | **`Del Castilho Madeiras e Construção LTDA`** (com acento e cedilha). **Não** usar "Atacadão Del Castilho" nem "Chave de Acesso Número Nf-E Versão" |
| Categoria da **entrada** | **Ofertas** — "a mais neutra e mantém os indicadores consistentes até identificarmos a origem exata do recurso" |
| Categoria da **despesa** | **Material de Consumo** — historicamente a mais compatível |
| Fluxo | Entrada Caixa de Envelopes → Transferência para Caixinha → Pagamento Del Castilho |

**Passo a passo (pelas telas do sistema; eu não gravo em produção):**

1. **Fornecedores** → abrir "Chave de Acesso Número Nf-E Versão" (CNPJ 22.753.989/0001-47) →
   renomear para `Del Castilho Madeiras e Construção LTDA`.
2. **Caixa de Envelopes** → novo lançamento: **Entrada**, R$ 255,30, **10/08/2026**,
   categoria **Ofertas**, realizado. Descrição sugerida: "NF-e 24553 Del Castilho — origem a
   identificar" (para a origem exata não se perder).
3. **Transferência** Caixa de Envelopes → Caixinha Administrativo, R$ 255,30, 10/08/2026.
4. **Caixinha Administrativo** → novo lançamento: **Saída**, R$ 255,30, 10/08/2026,
   fornecedor Del Castilho, categoria **Material de Consumo**, realizado; anexar a NF-e
   (o PDF já está no sistema como arquivo solto: `fin-comprovantes/tmp/1789358496917.pdf`).

Conferência depois: saldos de Caixinha (R$ 57,70) e Envelopes (R$ 0,00) **iguais aos de
hoje**; resultado de agosto **inalterado** (R$ 8.783,16), com entradas e saídas
**+ R$ 255,30** cada.

> Aviso: a entrada em **Ofertas** soma R$ 255,30 aos indicadores eclesiásticos de agosto.
> Se o malote de agosto já foi enviado à contabilidade, convém avisar.

### Pontos que estavam em aberto (resolvidos acima)

1. **Categoria da entrada** no Caixa de Envelopes: `Dizimos`, `Ofertas` ou `Ofertas
   para Missões`? (Recomendo `Ofertas`, a mais comum — 51 das 91 entradas de jul–set —
   **mas a escolha é sua**, porque muda um indicador.)
2. **Categoria da despesa:** `Material de Consumo` ou `Manutenção de Imobilizado`?
3. **Nome do fornecedor:** `Del Castilho Madeiras e Construcao LTDA` (recomendado)?
4. **Quem faz os lançamentos:** pelas telas do sistema (recomendado); se preferir que
   eu prepare um script, ele precisaria reproduzir o par da transferência e o carimbo
   de auditoria — mais frágil.

## 9. Ponto à parte: a Caixinha negativa em setembro

Independente deste caso, a Caixinha **já fica negativa no sistema em setembro**: − R$
367,70 em 05/09 e − R$ 419,21 em 10/09, por defasagem entre pagamentos em espécie e
reposições do envelope. Não tem relação com o Del Castilho (que, no fluxo decidido, não
altera nenhum saldo), mas indica **pagamentos em espécie de setembro cuja reposição
ainda não foi lançada**. Vale conferir com o caixa físico.
