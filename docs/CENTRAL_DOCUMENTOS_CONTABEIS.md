# Central de Documentos Contábeis — relatório consolidado e proposta

> Levantamento de **03/10/2026**, por medição direta do banco de produção
> (somente leitura), do bucket `fin-comprovantes`, do arquivo real de agosto
> (`08 - AGO-2026`, 103 PDFs da tesouraria) e dos PDFs guardados. **Nada foi
> gravado.** Onde o número é estimativa, está escrito; onde é medição, foi
> contado.

**Índice:** 1. Pacote Contábil · 2. Documentos anexados · 3. Órfãos ·
4. Dispensados · 5. Potencial de vinculação automática · 6. Investigações ·
7. Proposta da Central · 8. Decisões que preciso de você · Anexos A–C

---

## 1. Estatísticas do Pacote Contábil (setembro/2026)

| | |
|---|---|
| Saídas pagas no mês (sem transferências) | **120** |
| Que **exigem** documento | **99** |
| Que **dispensam** (tarifa bancária) | 21 (R$ 318,64) |
| Com documento hoje | **2** (2%) |
| Sem documento (pendências reais) | **97** |
| ZIP real hoje | 2 arquivos, 236 KB, 2 pastas (`Conta/Dia`) |

**Pacote completo simulado** (3 documentos — NF, boleto, comprovante — em cada
uma das 99 saídas que exigem; só em memória, nada gravado):

| | |
|---|---|
| Arquivos | 297 (Bradesco 186 · Caixinha 63 · Cartão 48) |
| Pastas `Conta/Dia` | 28 |
| Profundidade | sempre 4 níveis (`raiz/conta/dia/arquivo`) |
| Maior caminho | 117 caracteres (limite do Windows: 260) |
| Lançamentos que precisam de **ID** no nome | **4** (Light 281,46 ×2 · Flora 312,00 ×2) |
| Peso estimado | ~28 MB (297 × mediana de 96 KB) |

Com as tarifas fora, o ID no nome cai de 19 para exatamente 4 lançamentos —
confirma a regra "ID só quando fornecedor + data + valor não bastam".

## 2. Estatísticas dos documentos anexados

| | |
|---|---|
| Lançamentos no sistema | 13.378 |
| Linhas em `fin_lancamento_anexos` | **2** (ambas de 02/10, tipo antigo `documento`) |
| `comprovante_url` preenchido | 0 |
| `fiscal_documentos` | 0 |
| Objetos no bucket `fin-comprovantes` | 39 (4,8 MB; mediana 96 KB; máx. 615 KB; todos PDF) |
| Enviados em | 14/09: 25 · 15/09: 11 · 24/09: 1 · 02/10: 2 |
| Nomes originais preservados | só nos 2 anexados — os outros viraram `timestamp.pdf` |

**Lacuna de código:** `excluirLancamento` apaga o arquivo de `comprovante_url`,
mas **não** os de `fin_lancamento_anexos` (a linha some por `CASCADE`; o arquivo
fica). Não foi possível determinar como os 37 órfãos ficaram sem lançamento.

## 3. Estatísticas dos órfãos (37 PDFs)

37 = 39 objetos − 2 anexados. 33 têm camada de texto; 4 são digitalizações lidas
por OCR. 2 pares são idênticos (mesmo hash): 2 órfãos são **cópias** dos 2 anexados
e 2 órfãos são o mesmo documento enviado duas vezes.

| Destino | Arquivos | % | O que é |
|---|---|---|---|
| **Vínculo automático** (≥ 85%) | **20** | 54% | 18 vínculos novos + **2 cópias de anexos já ligados** (não vincular de novo) |
| **Fila de revisão** | **10** | 27% | 60–84%, ou leitura que o leitor errou (2 casos) — todos com candidato plausível |
| **Compra parcelada** (1 documento → N parcelas) | **6** (5 documentos) | 16% | NF-e de março–maio no cartão; as parcelas existem no sistema |
| **Sem lançamento** | **1** | 3% | Del Castilho R$ 255,30 |

Antes da investigação eram "19 / 7 / 11 não identificados". A diferença vem de
três coisas medidas: **(a)** 6 dos "não identificados" são compras parceladas
(item 6); **(b)** 2 eram defeitos do leitor de PDF (item 7.4); **(c)** 3 tinham
candidato plausível abaixo de 60%.

**Validação independente** (arquivo real de agosto): dos 13 vínculos
automáticos que caem em agosto, **13 de 13** batem com um arquivo de nome real
(valor + dia), **0 contradições**; os outros 5 são de setembro e não têm fonte
independente. Dos 10 da fila de revisão, **10 de 10** têm arquivo correspondente
no arquivo de agosto.

## 4. Estatísticas dos dispensados

Regra por **categoria** (nome exato): `Tarifas Bancárias`, `IOF`, `Juros`,
`Encargos Bancários`. Hoje só existem `Tarifas Bancárias` (273 saídas em 2026) e
`Juros` (0 uso); `IOF` e `Encargos Bancários` ainda não existem.

| Mês | Saídas | Dispensam | % | Valor |
|---|---|---|---|---|
| Junho | 114 | 33 | 29% | R$ 421,45 |
| Julho | 129 | 36 | 28% | R$ 437,62 |
| Agosto | 132 | 33 | 25% | R$ 403,47 |
| Setembro | 120 | 21 | 18% | R$ 318,64 |

- **Por categoria, não por fornecedor:** o mesmo Banco Bradesco tem 271 lançamentos
  de Tarifas, 1 de *Título de Capitalização* e 1 sem categoria; os dois últimos
  precisam de documento.
- **Cuidado de nome:** existe `Encargos Trabalhistas` (10 saídas, R$ 42.509 em 2026
  — guias de FGTS/INSS, **com** documento). Por isso a regra é por nome **exato**,
  não por padrão de texto. `Multas` fica de fora (multa de tributo vem em guia).
- No arquivo real de agosto não há **um** PDF de tarifa; 33 das 40 saídas sem
  arquivo eram tarifas.

## 5. Potencial de vinculação automática

| Fonte | Taxa | Observação |
|---|---|---|
| Por **nome de arquivo**, regra simples (valor + data + fornecedor) | 72% | 99 arquivos de agosto contra os lançamentos |
| Por nome, regras calibradas (conta, ±1 dia, cartão, desempate) | 94 de 96 (98%) | **otimista**: calibrado nos mesmos dados. Planejar ~90% |
| Por **conteúdo** do PDF (órfãos) | 20 de 37 (54%) automático | + 10 em revisão + 6 parcelados = **36 de 37 com destino plausível (97%)** |
| Teto por chave `conta + dia + valor` (setembro, 99 que exigem) | 95 de 99 (96%) | as 4 ambíguas são Light/Flora |

O número de NF **não** serve como chave hoje: `documento_numero` está preenchido em
1 de 283 lançamentos de setembro. O CNPJ só existe **dentro do PDF** (nenhum nome de
arquivo traz CNPJ) e 285 de 325 fornecedores (88%) o têm cadastrado.

## 6. Investigações

### 6.1 Os 6 documentos fiscais "sem lançamento" — **todos têm lançamento**

O leitor tinha lido a **data errada** (agosto) e o **emitente errado**. Lidos de
novo: são DANFE emitidas entre **24/03 e 13/05/2026**, de **compras parceladas no
cartão**. O lançamento existe — é a **parcela**, não o total.

| NF · emitente (CNPJ) | Emissão | Total da NF | Parcelas lançadas | Fecha? |
|---|---|---|---|---|
| 9.370 · Modamusicnet (47.517.276/0001-05) | 24/03 | R$ 519,80 | 5 × 51,98 (abr–ago) + 259,90 em 10/09 (5 parcelas) | **519,80 exato** |
| 764 · Manehel Kamal Ayed Judeh (63.752.829/0001-60) | 31/03 | R$ 101,85 | 25,47 + 3 × 25,46 | **101,85 exato** |
| 12.058 · Renova-Teck (31.786.229/0001-27) | 30/03 | R$ 659,65 | 66,01 + 3 × 65,96 + 395,76 (6 parcelas, 10/09) | **659,65 exato** |
| 439.288 · M.F. Passarinho (13.206.514/0001-40) | 13/05 | R$ 378,26 | 54,08 + 3 × 54,03 + 108,06 *previsto* (13/10) = 324,23 | falta **1 parcela de 54,03**, ainda não lançada |
| 231.852 · TNTINFO (08.606.542/0001-14), 2 arquivos idênticos | 30/03 | R$ 389,00 | 7 parcelas = 369,55 | **369,55 = 95% de 389,00**: desconto de 5% fora da NF |

- **Duplicidade:** o documento TNTINFO foi enviado duas vezes (mesmo hash, 14/09).
  Nenhuma duplicidade de *lançamento*: os dois lançamentos de R$ 101,85 que existem
  são transferências de dezembro/2025, sem relação.
- **TNTINFO:** a NF não tem frete, seguro nem desconto (total dos produtos = total da
  nota). Os 5% a menos só se explicam por desconto concedido fora da nota — confirmar
  na fatura Visa.
- **Consequência de produto:** 11 dos 19 PDFs de compra no cartão no arquivo de
  agosto (58%) são parcelas (`04_10`, `05_06`…). **"1 documento → N lançamentos" é a regra do cartão,
  não a exceção.**

### 6.2 Del Castilho R$ 255,30 — **pago, não lançado**

**Documento:** NF-e modelo 55 nº **24.553**, série 7, emitida em **10/08/2026 às
15:35**, valor **R$ 255,30**; emitente **DEL CASTILHO MADEIRAS E CONSTRUCAO LTDA**,
CNPJ **22.753.989/0001-47**; destinatário: a igreja. "Ciência da operação" registrada
em 11/08. No arquivo de agosto: `10.08.2026 - R$255,30 _ NF24553 _ DEL CASTILHO … _
PG ESPECIE` (Caixa Auxiliar).

| Pergunta | Resposta |
|---|---|
| Existe lançamento de R$ 255,30? | **Não**, em nenhuma conta, status ou data (out/2025 em diante) |
| Em outra conta / cancelado? | Não; nenhum lançamento cancelado em agosto |
| Valor semelhante? | Não (±5% de 25/07 a 15/09: só Cbd, Claro, Obramax, Modamusic — todos de outros fornecedores) |
| Dois lançamentos que somem 255,30? | Não, nenhuma combinação em agosto |
| Menção em descrição/observação? | Nenhuma ("castilho", "24553", o CNPJ) |
| Fornecedor cadastrado? | **Sim, pelo CNPJ — com o nome errado** (abaixo) |
| Há movimento de caixa que o cubra? | Não. A Caixinha recebe transferências do Caixa de Envelopes do valor exato de cada compra (13 e 14 em 12/08, p. ex.); **não há transferência de 255,30** |

**Conclusão:** o pagamento ocorreu (em espécie, no Caixa Auxiliar, em 10/08) e
**nunca foi lançado** — nem a despesa, nem a transferência que a financiaria. O
arquivo de agosto tem 18 PDFs da Caixa Auxiliar e o sistema 17 saídas nessa conta,
todas casadas: falta exatamente este.

**Achado colateral:** o fornecedor com o CNPJ do Del Castilho existe, mas se chama
**"Chave de Acesso Número Nf-E Versão"** — um cabeçalho do PDF que o leitor tomou
por razão social. Foi criado em 14/09/2026 01:00, tem 2 lançamentos de agosto/2025
(Material de Consumo), e por isso nenhuma busca por nome o achava. É o único
cadastro contaminado entre os 325 fornecedores. **Correção sugerida (precisa de
gravação, não feita):** renomear para "Del Castilho Madeiras e Construcao LTDA" e
lançar a saída de R$ 255,30 em 10/08 na Caixinha (categoria usada nos 2 lançamentos
anteriores: Material de Consumo) com a transferência correspondente do Caixa de
Envelopes.

### 6.3 Outros lançamentos ausentes no arquivo de agosto

- **Agrottha:** o arquivo diz R$ 5.400,00; o lançamento de 25/08 (mesmo fornecedor
  e dia) é de **R$ 5.940,00** — um dos dois tem os dígitos trocados.

## 7. Proposta da Central de Documentos

### 7.1 Princípios

1. **Nunca gravar sem mostrar.** Toda associação passa por uma tela de confirmação;
   "automático" significa *pré-selecionado*, não *gravado sozinho*.
2. **Preservar tudo.** Nada é apagado ou movido; o arquivo original e o nome original
   são guardados.
3. **Mostrar o motivo.** Cada sugestão traz o porquê ("CNPJ = fornecedor; valor =
   total − desconto; data igual") — o contador vê *por que*, não só um percentual.
4. **A conferência vale por categoria:** tarifas e afins não entram na meta.

### 7.2 Fluxo do usuário

1. Arrasta **dezenas ou centenas** de PDFs (e fotos/XML) para a tela.
2. Cada arquivo é lido **no navegador** (texto do PDF; OCR só se não houver texto) —
   sem custo e sem enviar a terceiros.
3. O sistema propõe, arquivo a arquivo, o lançamento e o tipo de documento.
4. Três colunas: **Casados** (≥ 85%, marcados), **Revisar** (60–84%, com os
   candidatos e o motivo), **Sem destino** (com os melhores palpites e busca manual).
5. Um clique confirma os casados; a revisão é "aceitar / trocar / pular" por linha.
6. Resumo final: "18 vinculados · 4 para revisar · 1 sem lançamento", e atalho para a
   Auditoria de Documentos.

### 7.3 Regras de casamento, em ordem

1. **Duplicata** — mesmo hash de um anexo existente: avisa e não liga de novo.
2. **CNPJ do emitente → fornecedor** (88% dos fornecedores têm CNPJ).
3. **Valor**: o bruto **e** o líquido (total − desconto; dinheiro − troco; "valor a
   pagar"). Sem isso, 9 cupons de supermercado ficariam de fora.
4. **Data**: exata; ±1 dia; no cartão, data da compra ≠ data da fatura (ignorar a
   data, exigir valor + fornecedor na conta do cartão).
5. **Compra parcelada**: documento com total T e N lançamentos do mesmo fornecedor
   cuja soma é T (±centavos) ou cada um T/N → 1 documento, N vínculos.
6. **Nome do arquivo**, quando existir (`dd.mm.aaaa - R$valor _ NF _ FORNECEDOR`):
   serve de reserva e preenche `documento_numero`.
7. **Eliminação**: o lançamento já casado por outro arquivo sai da disputa.

Confiança = soma ponderada (CNPJ 40 · valor 35 · data 20 · unicidade +5), com
**desconto quando o 2º colocado está perto**. É uma pontuação de ordenação, **não**
uma probabilidade calibrada — a calibração real só vem depois de uso.

### 7.4 Correções necessárias no leitor de PDF

Todas encontradas nesta análise, em documentos reais:

| Defeito | Efeito | Correção |
|---|---|---|
| Lê **valor bruto** em cupom com desconto | 9 de 37 órfãos ficavam sem casar | Considerar total − desconto, dinheiro − troco, valor pago |
| Lê **percentual de tributos como dinheiro** ("1.084,08%") | cupom de R$ 24,00 lido como R$ 1.084,08 | Ignorar números seguidos de `%` |
| **"VALOR À PAGAR"** com acento não é reconhecido | cupom de R$ 61,00 lido como R$ 62,60 | Normalizar acentos |
| Em **NF-e "Consulta"/DANFE** o emitente não é achado | razão = "www.nfe.fazenda.gov.br/porta"; data errada | Ler "RECEBEMOS DE …", o CNPJ ≠ da igreja e "DATA DA EMISSÃO" |
| **Cria fornecedor** com cabeçalho como nome | "Chave de Acesso Número Nf-E Versão" | Validar nome (rótulos conhecidos, tamanho) antes de sugerir cadastro |

### 7.5 Casos especiais

- **Compra parcelada.** Hoje um arquivo é "dono" de um anexo. Para 1 documento → N
  lançamentos há duas saídas: **(a)** N linhas em `fin_lancamento_anexos` apontando
  para o mesmo arquivo — exige que `removerAnexo`/`excluirLancamento` só apaguem o
  arquivo quando for a **última** referência; **(b)** copiar o arquivo por parcela.
  Recomendo **(a)** + contagem de referências. No pacote, o documento aparece na
  pasta de **cada** parcela (INDICE.csv indica "parcela 5 de 10").
- **Documento sem lançamento** (Del Castilho, Agrottha): vai para "Sem destino" com
  o motivo e a opção "criar lançamento a partir do documento" (já existe leitura de
  NF no formulário de lançamento).
- **Divergência de valor** (mesmo fornecedor e dia, valor diferente): sempre
  *Revisar*, nunca automático.
- **Duplicidade de arquivo:** por hash (SHA-256 no navegador), antes de enviar.

### 7.6 Dados

- **Reaproveita sem mudar:** `fin_lancamento_anexos`, o bucket `fin-comprovantes`,
  `AnexosLancamentoDialog`, `auditarAnexos`, o leitor `ocrService`.
- **Uma tabela nova é necessária para a fila de revisão** — `fin_documentos_fila`
  (arquivo, hash, dados extraídos, candidatos, confiança, motivo, estado). Sem ela, a
  revisão só existe enquanto a aba estiver aberta. Alternativa descartada: tornar
  `lancamento_id` opcional em `fin_lancamento_anexos` (mistura "ligado" e "pendente"
  na tabela que o pacote lê).
- **Uma migration pequena:** nada além da já feita (tipos de documento).
- **Nome original:** passar a gravar em `fin_lancamento_anexos.nome` no envio em lote
  (o envio atual perde o nome no armazenamento).

### 7.7 Esforço (estimativa)

| Etapa | Dias |
|---|---|
| Zona de arrasto, leitura no navegador, hash, fila local, motor de casamento (regras 1–4, 6–7) | 3–4 |
| Três colunas + confirmação em lote + revisão por linha + busca manual | 2–3 |
| Compra parcelada (regra 5) + contagem de referências ao apagar | 1–2 |
| Fila persistida (`fin_documentos_fila`) + retomar depois | 1–2 |
| Correções do leitor (7.4) + testes com os 39 PDFs reais | 1–2 |
| **Total** | **~8–13 dias** |

**Primeira entrega recomendada (v1, ~5–6 dias):** arrasto + leitura + motor + três
colunas + confirmação em lote, **sem** fila persistida e **sem** parcelados. Mede a
taxa real de acerto com PDFs novos antes de investir no resto.

### 7.8 Riscos

- **Taxa em PDFs novos:** os números aqui vêm de 37 arquivos de 2 dias de teste e 103
  nomes de 1 mês. Setembro será o primeiro uso real; por isso a v1 não grava nada
  sozinha.
- **Regra de dispensa por nome de categoria** quebra se renomearem a categoria.
- **Leitura por OCR** (digitalizados): acerto menor; sempre cai em "Revisar" quando
  a confiança do OCR é baixa.

## 8. Decisões que preciso de você

1. **Aprovar o relatório dos 18 vínculos** (Anexo A) — o script está pronto em
   `sql/vincular_orfaos_2026-10-03.sql`, **não executado**.
2. **Fila de revisão (10)**: aceita a sugestão de cada linha do Anexo B, ou decide caso
   a caso?
3. **Del Castilho:** lançar a saída (e a transferência do Caixa de Envelopes) e
   renomear o fornecedor?
4. **Parcelados:** documento em **cada** parcela do pacote, ou só na primeira?
5. **Central v1 sem fila persistida**, ou já com `fin_documentos_fila`?

---

## Anexo A — Vínculos automáticos (20; 18 a gravar, 2 cópias fora)

| Arquivo (envio) | Lançamento vinculado | Conf. | Motivo da correspondência |
|---|---|---|---|
| 0a93…5700 (14/09) | 13/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 52,74 | 100% | CNPJ = fornecedor; valor igual; data igual |
| 2781…5353 (15/09) | 18/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 45,94 | 97% | CNPJ = fornecedor; valor = dinheiro 50,00 − troco 4,06; data igual |
| 4807…1499 (15/09) | 25/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 86,13 | 97% | CNPJ = fornecedor; valor = total 94,45 − descontos 8,32; data igual |
| 50cd…5442 (14/09) | 03/08/2026 · Caixinha · Sendas Distribuidora S.A. · R$ 29,90 | 100% | CNPJ = fornecedor; valor igual; data igual (OCR) |
| 703f…4253 (14/09) | 05/09/2026 · Caixinha · Prodesc Benfica Embalagens · R$ 117,90 | 100% | CNPJ = fornecedor; valor igual; data igual |
| 892b…0270 (15/09) | 04/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 32,77 | 97% | CNPJ = fornecedor; valor = total 33,78 − descontos 1,01; data igual |
| 9205…6157 (14/09) | 15/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 39,95 | 100% | CNPJ = fornecedor; valor igual; data igual (OCR) |
| a13a…4352 (15/09) | 04/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 172,52 | 97% | CNPJ = fornecedor; valor = total 179,67 − descontos 7,15; data igual |
| a395…6659 (14/09) | 05/09/2026 · Caixinha · Supermercado Mundial LTDA · R$ 108,90 | 100% | CNPJ = fornecedor; valor igual; data igual |
| ce3b…7795 (15/09) | 26/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 25,92 | 97% | CNPJ = fornecedor; valor = total 27,92 − descontos 2,00; data igual |
| cfd9…0382 (24/09) | 23/09/2026 · Bradesco · Freecolor Comercio de Tintas · R$ 299,90 | 100% | CNPJ = fornecedor; valor igual; data igual (boleto) |
| d6d3…3293 (15/09) | 21/08/2026 · Caixinha · Agata Com. Prod. de Hig. e Desc. · R$ 94,00 | 100% | CNPJ = fornecedor; valor igual; data igual |
| e29c…4646 (14/09) | 18/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 104,75 | 97% | CNPJ = fornecedor; valor = total 115,47 − descontos 10,72; data igual |
| e95f…2094 (15/09) | 11/08/2026 · Caixinha · Supermercado Mundial LTDA · R$ 147,63 | 97% | CNPJ = fornecedor; valor = total 154,06 − descontos 6,43; data igual |
| tmp…1602 (14/09) | 09/09/2026 · Caixinha · Supermercado Mundial LTDA · R$ 31,78 | 97% | CNPJ = fornecedor; valor = dinheiro 35,00 − troco 3,22; data igual |
| tmp…2874 (14/09) | 12/08/2026 · Caixinha · Fer-Fix 390 Comercial · R$ 14,00 | 100% | CNPJ = fornecedor; valor igual; data igual |
| tmp…0094 (14/09) | 12/08/2026 · Caixinha · Fer-Fix 390 Comercial · R$ 13,00 | 100% | CNPJ = fornecedor; valor igual; data igual |
| tmp…0089 (14/09) | 05/09/2026 · Caixinha · Jafi Decoracoes LTDA · R$ 89,50 | 100% | CNPJ = fornecedor; valor igual; data igual (NF-e) |
| eb25…8375 (14/09) | 01/09/2026 · Caixinha · Agata … · R$ 53,00 | 87% | **Cópia exata (hash) do anexo que o lançamento já tem — NÃO vincular** |
| f905…1912 (14/09) | 01/09/2026 · Caixinha · Supermercado Mundial · R$ 61,92 | 97% | **Cópia exata (hash) do anexo que o lançamento já tem — NÃO vincular** |

## Anexo B — Fila de revisão (10)

| Arquivo | Documento | Sugestão | Conf. | Por que revisar · evidência |
|---|---|---|---|---|
| 3ee5…7009 | NF-e Rnt Soluções R$ 271,00 (emissão 18/07) | 10/08 · Cartão · R$ 271,00 (único) | 84% | Compra 18/07 × fatura 10/08 (regra do cartão). Arquivo de agosto ✓ |
| 5b41…5859 | Cupom Mundial R$ 83,58 | 07/08 · Caixinha · R$ 83,58 (único) | 84% | Data do cupom difere do lançamento. Arquivo de agosto ✓ (NF301279) |
| d5e1…5367 | Cupom Pax R$ 66,99 (07/07) | 10/08 · Cartão · R$ 66,99 (único) | 80% | Compra 07/07 × fatura 10/08. Arquivo de agosto ✓ (NF414223) |
| 28b5…5677 | Fatura Águas do Rio R$ 1.135,07 (ref. 06/2026, emissão 07/08) | **2 candidatos:** 02/02 e 03/08, mesmo valor | 60% | O valor se repete (consumo médio) e a data do documento não fecha com nenhum — **decisão humana**; possível 3º lançamento |
| 99a4…2186 | NFS-e R$ 297,00 | 03/08 · Bradesco · D Flesh Serviços · R$ 297,00 | 60% | Valor + data únicos; CNPJ de NFS-e não lido. Arquivo de agosto ✓ (NF577 "KIKOPIAS DFLESH") |
| c7fd…5132 | NF-e R$ 300,00 | 03/08 · Bradesco · Miranda Flores · R$ 300,00 | 55% | Valor + data únicos; emitente não lido. Arquivo de agosto ✓ (NF19513) |
| 60a3…5557 | NF-e (OCR leu 732,50) | 03/08 · Caixinha · União Feminina · R$ 34,02 | 52% | OCR com leitura errada do total. Arquivo de agosto ✓ (NF105291, R$ 34,02) |
| 9cae…2268 | NF-e Marcia Auxiliadora R$ 41,34 | **2 candidatos:** 10/07 e 10/08 (parcelas 1 e 2 de 2) | 30% | Compra parcelada em 2×: ligar às duas. Arquivo de agosto ✓ (parcela `02_02`) |
| 8d02…3374 | Cupom Ágata nº 14.937 (07/08) | 07/08 · Caixinha · Ágata · **R$ 24,00** | corrigido | O leitor leu "1.084,08%" (tributos) como valor. Arquivo de agosto ✓ (NF14937) |
| fa4c…4905 | Cupom Ágata (OCR, 18/08) | 18/08 · Caixinha · Ágata · **R$ 61,00** | corrigido | "VALOR À PAGAR R$ 61,00" (62,60 − 1,60) não reconhecido. Arquivo de agosto ✓ (NF14977) |

## Anexo C — Compras parceladas (6 arquivos, 5 documentos) e sem lançamento

Ver itens 6.1 e 6.2. Arquivos: 0e48…2876 (Modamusic), c2aa…1212 (Manehel),
cc2f…7169 (Passarinho), fc85…1707 (Renova-Teck), 8bb1…5905 e f730…2341
(TNTINFO, idênticos) · e `tmp…6917` (Del Castilho, sem lançamento).

## Anexo D — Conferência final dos 18 vínculos aprovados (03/10/2026)

**Aprovados pela Telma. NÃO gravados.** Antes desta tabela, cada um foi relido do banco
e conferido em 10 verificações — **18 de 18 passaram em todas**:

1. o lançamento existe · 2. é saída paga (realizado/conciliado) · 3. não é transferência ·
4. a data confere · 5. o valor confere · 6. o fornecedor confere · 7. o arquivo existe
no armazenamento · 8. com o mesmo tamanho de bytes · 9. o lançamento não tem anexo ·
10. nenhum anexo aponta para o arquivo.

Além disso: 18 lançamentos distintos e 18 arquivos distintos (nenhum disputado);
todos `conciliado`; soma R$ 1.507,23 (Caixinha 17 · Bradesco 1); **o script SQL contém
exatamente este conjunto** (checksum `5f4be54cd2de5a8f` idêntico ao do banco).

| Arquivo | Lançamento | Data | Fornecedor (CNPJ) | Conta | Valor (R$) | Conf. | Motivo |
|---|---|---|---|---|---|---|---|
| 50cd…5442 | 141a5cb2 | 03/08/26 | Sendas Distribuidora S.A. (06.057.223/0426-80) | Caixinha | 29,90 | 100% | CNPJ confere; valor igual; data igual |
| 892b…0270 | 58f8995b | 04/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 32,77 | 97% | CNPJ confere; valor = total 33,78 − descontos 1,01; data igual |
| a13a…4352 | 01870c54 | 04/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 172,52 | 97% | CNPJ confere; valor = total 179,67 − descontos 7,15; data igual |
| e95f…2094 | 0442ec79 | 11/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 147,63 | 97% | CNPJ confere; valor = total 154,06 − descontos 6,43; data igual |
| tmp…2874 | 938efd2e | 12/08/26 | Fer-Fix 390 Comercial (07.123.696/0001-92) | Caixinha | 14,00 | 100% | CNPJ confere; valor igual; data igual |
| tmp…0094 | 9eca5a3a | 12/08/26 | Fer-Fix 390 Comercial (07.123.696/0001-92) | Caixinha | 13,00 | 100% | CNPJ confere; valor igual; data igual |
| 0a93…5700 | fd01c259 | 13/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 52,74 | 100% | CNPJ confere; valor igual; data igual |
| 9205…6157 | 9664914d | 15/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 39,95 | 100% | CNPJ confere; valor igual; data igual (OCR) |
| 2781…5353 | 7ad66ace | 18/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 45,94 | 97% | CNPJ confere; valor = dinheiro 50,00 − troco 4,06; data igual |
| e29c…4646 | 2c318585 | 18/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 104,75 | 97% | CNPJ confere; valor = total 115,47 − descontos 10,72; data igual |
| d6d3…3293 | 8589c34f | 21/08/26 | Agata Com. Prod. de Hig. e Descartaveis (18.301.506/0001-04) | Caixinha | 94,00 | 100% | CNPJ confere; valor igual; data igual |
| 4807…1499 | 6d9ef4b2 | 25/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 86,13 | 97% | CNPJ confere; valor = total 94,45 − descontos 8,32; data igual |
| ce3b…7795 | fabe829b | 26/08/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 25,92 | 97% | CNPJ confere; valor = total 27,92 − descontos 2,00; data igual |
| 703f…4253 | c07c0a7e | 05/09/26 | Prodesc Benfica Embalagens (06.058.769/0001-47) | Caixinha | 117,90 | 100% | CNPJ confere; valor igual; data igual |
| a395…6659 | 4d378c44 | 05/09/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 108,90 | 100% | CNPJ confere; valor igual; data igual |
| tmp…0089 | 1d4a2d9c | 05/09/26 | Jafi Decoracoes LTDA (27.654.631/0001-80) | Caixinha | 89,50 | 100% | CNPJ confere; valor igual; data igual (NF-e) |
| tmp…1602 | 217d12ba | 09/09/26 | Supermercado Mundial LTDA (33.304.981/0006-24) | Caixinha | 31,78 | 97% | CNPJ confere; valor = dinheiro 35,00 − troco 3,22; data igual |
| cfd9…0382 | c0f17e88 | 23/09/26 | Freecolor Comercio de Tintas (01.756.077/0001-59) | Bradesco | 299,90 | 100% | CNPJ confere; valor igual; data igual (boleto) |

**Pontos de atenção:** 9 dos 18 são cupons com desconto/troco (97%): o valor do
lançamento é o **líquido** (conferido pela aritmética exata acima). 5 são de setembro,
**sem** fonte independente (os 13 de agosto batem com arquivo real da tesouraria).
