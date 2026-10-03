# Dossiê Contábil — um PDF por lançamento (validação e proposta)

> **03/10/2026.** Pedido da Telma: cada lançamento vira **um único PDF consolidado** no
> Pacote Contábil (nota + boleto + comprovante, ou RPA + comprovante…), em ordem de
> upload, com o nome `DDMMAAAA_DOCUMENTO_FORNECEDOR.pdf`, mantendo a estrutura
> `Conta → Dia → Arquivos`. **Validação antes de implementar:** nada disto foi
> construído ainda. Medições feitas no navegador contra produção (só leitura), com a
> biblioteca `pdf-lib` carregada no experimento, **sem alterar o projeto**.

## 1. Veredicto

**É viável, rápido e leve.** O merge funciona com 100% dos PDFs reais testados, custa
~36 ms por dossiê e **reduz** o tamanho em ~9%. O ponto que pede decisão antes de
implementar **não é técnico, é de dado**: a data dos lançamentos (seção 6).

## 2. Resultados medidos

### PDFs — 43 arquivos reais do bucket

| | Resultado |
|---|---|
| Abrem sem erro | **43 de 43** (0 criptografados, 0 corrompidos) |
| Páginas por arquivo | 1 pág.: 39 · 2 pág.: 2 · 3 pág.: 1 · 6 pág.: 1 |
| Tamanhos de página | A4 (37 arquivos) · cupons e DANFE em formatos próprios (522×1000, 589×836, 624×964, 686×1000) — o merge **mantém cada página como é** |
| Tempo para abrir | 112 ms no total (máx. 36 ms por arquivo) |
| Mesclar **grupos de 3** (14 dossiês) | média **36 ms**, máx. 82 ms |
| Tamanho do resultado | **91,2%** da soma dos originais (5,09 MB × 5,58 MB) |
| Mesclar **os 43 de uma vez** (estresse) | **545 ms**, 52 páginas, 5,18 MB; memória ~190 MB |

### O seu caso real (dois dossiês que você montou hoje)

| Lançamento | Anexos, em ordem de upload | Dossiê |
|---|---|---|
| Ana Patrícia da Silva de Lima de Oliveira · R$ 760,00 | 01:52 RPA (408 KB) → 01:59 Comprovante (6 KB) | **2 páginas, 413 KB, 6 ms** |
| Tayane Claudio Rezende de Souza · R$ 1.933,00 | 02:00 DPS (541 KB) → 02:01 Comprovante (6 KB) | **2 páginas, 546 KB, 3 ms** |

A ordem `ORDER BY enviado_em ASC` produziu exatamente "página 1 = RPA/DPS, página 2 =
comprovante". (Estes anexos foram enviados como **"Outro"** e **"Comprovante"**, porque
RPA/DPS ainda não existiam — ver o script de reclassificação.)

### Imagens

| Formato | Medição | Estratégia |
|---|---|---|
| **JPG** de celular 3024×4032 | entra no PDF **sem recompressão**: 3,2 MB → PDF de 3,2 MB, 11 ms | Fotos grandes inflam o ZIP. **Reduzir para 1.600 px / qualidade 0,8 só na cópia do dossiê**: 3,2 MB → **0,3 MB (10× menor)**, 160 ms por foto, legível para recibo. O original continua intacto no sistema |
| **PNG** (print de celular) | embutir direto: ~240 ms, ~430 KB (print comum). Um PNG com ruído de fotografia chegou a 1,2 s e 2,8 MB | Embutir direto; se passar de ~2 MB, converter para JPEG (78 ms, mesmo tamanho para print simples) |
| JPG pequeno de comprovante 1080×1920 | 1 ms, 486 KB | direto |

Cada imagem vira **1 página A4**, centralizada e sem ampliar.

### XML de NF-e

| Opção | Custo | Avaliação |
|---|---|---|
| **B — manter o XML original ao lado do PDF** | +4,5 KB por nota (XML típico) | **Recomendada** (é a sua preferência) |
| A — gerar um PDF a partir do XML | 6 ms, 2,4 KB | O PDF é um **resumo em texto**, não um DANFE: não tem valor fiscal e pode induzir a erro. Um DANFE fiel é um layout oficial, fora de escopo |

**Por que B está certa:** o XML é o documento fiscal **juridicamente válido** e é o que o
escritório **importa** no sistema deles; convertê-lo em página de PDF o tornaria inútil
para isso. Nome: o mesmo do dossiê, extensão `.xml` (`01092026_12345_MUNDIAL.xml`).

### Outros formatos

O sistema só aceita **PDF, JPG, PNG e XML** (até 5 MB). HEIC (iPhone), WEBP, Word e Excel
já são recusados no envio; portanto não há outro formato a mesclar.

## 3. Estratégia recomendada

1. O dossiê é montado **no navegador, ao gerar o pacote**, em sequência, com o `jszip`
   que o pacote já usa (a biblioteca de PDF carrega sob demanda, como o `jszip`).
2. Ordem das páginas: `enviado_em` crescente. Documentos de **uma mesma carga em lote**
   recebem `enviado_em` em ordem crescente de milissegundos, com os documentos fiscais
   antes do comprovante (a Central decide a ordem; ver decisão 3).
3. XML: **não entra no PDF**; vai ao lado, com o mesmo nome.
4. **Falha de um arquivo** (PDF corrompido ou criptografado): o arquivo sai **separado**,
   com o sufixo `_ORIGINAL`, o dossiê é montado com o que deu certo e o problema vai
   para o `ERROS.txt` e para o `INDICE.csv`. Nada se perde.
5. `INDICE.csv` ganha o **mapa do dossiê**: "pág. 1 RPA · pág. 2 Comprovante" e os nomes
   originais — o contador sabe o que há em cada página sem abrir.
6. Os **originais permanecem no sistema**. A cópia consolidada é de consulta: o merge
   **invalida assinatura digital** que um PDF original tenha (NFS-e assinada, por
   exemplo). O original assinado continua disponível na tela de anexos.

### Custo para o pacote de setembro (estimativa a partir das medições)

| | |
|---|---|
| Dossiês | ~99 (as saídas que exigem documento) |
| Tempo de montagem | ~99 × 36 ms ≈ **4 s** (≈ 11 s para 300 dossiês) + 160 ms por foto grande |
| Tamanho do ZIP | ~99 × 2,5 docs × 96 KB (mediana) ≈ **24 MB** → ~**22 MB** depois do merge |
| Memória | o ZIP inteiro fica na memória: ~25 MB em setembro; um **ano inteiro** (~100 MB) já seria arriscado em celular — por isso o pacote é **mensal** |

## 4. Padrão de nomes — como ficou a regra

> **Atualizado em 03/10/2026 (ver §8):** o **valor** passou a fazer parte obrigatória do
> nome. Formato oficial: `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR.pdf`
> (`01092026_86,13_12345_MUNDIAL.pdf`). Os exemplos e a regra de colisão abaixo são da
> versão anterior (sem valor) e valem apenas nas demais partes.

Formato: `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR.pdf`

| Parte | Regra |
|---|---|
| `DDMMAAAA` | dia do pagamento: `data_pagamento`, ou `data` se vazia (a mesma da pasta do dia) |
| `VALOR` | valor do lançamento, **sem símbolo e sem separador de milhar**, vírgula decimal: `760,00` · `12548,92` |
| `DOCUMENTO` | **1º** o número do documento (`12345`); **2º**, sem número, o tipo (`RPA`, `RSP`, `DPS`, `NF`, `FATURA`, `BOLETO`, `CONTRATO`) |
| `FORNECEDOR` | o nome do **fornecedor**; se o lançamento for de pessoa, o do **funcionário** |
| Normalização | maiúsculas · sem acento · só letras e números · barras, aspas e símbolos viram espaço · espaços múltiplos colapsados · espaço → `_` |

Exemplos (como pedido): `01092026_12345_MUNDIAL.pdf`,
`04092026_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_DE_OLIVEIRA.pdf`.

- **Tipo "principal" quando não há número:** o primeiro documento, em ordem de upload,
  que **não** seja comprovante (RPA + comprovante → `RPA`; NF + boleto + comprovante sem
  número → `NF`).
- **De onde vem o número hoje:** `fin_lancamentos.documento_numero`, que está
  preenchido em **1 de 283** lançamentos de setembro — **quase sempre vazio**. Fontes
  para alimentá-lo sem criar estrutura nova: **(a)** a Central grava o número lido do
  documento (chave de acesso da NF-e, "Número: 14937" do cupom) em
  `documento_numero` ao vincular, se estiver vazio; **(b)** o número que o nome do arquivo
  da tesouraria já traz (`NF577`), que já é lido por `nomeArquivo.ts`. Sem isso, a
  maioria dos nomes cairia no tipo (`..._NF_MUNDIAL.pdf`).
- **Colisão** (mesmo dia + mesmo valor + mesmo número/tipo + mesmo fornecedor, ex.: duas
  faturas da Light de R$ 281,46 no mesmo dia): como o valor agora **já está sempre no
  nome**, ele deixa de ser o primeiro desempate — sobra o **início do ID** do lançamento
  (`15092026_281,46_FATURA_LIGHT_7a44cf.pdf`). Colisões caem muito: dois lançamentos só
  colidem se coincidirem dia, valor, documento **e** fornecedor.
- **Limites:** nome do fornecedor cortado em 60 caracteres (caminho máximo hoje: 117 de 260
  do Windows).

## 5. O que muda no código (quando aprovado)

| Onde | Mudança |
|---|---|
| `lib/pacoteContabil.ts` | `planejarPacote` passa a planejar **um arquivo por lançamento** (dossiê) + XMLs ao lado; nome pelo padrão acima; `INDICE.csv` com o mapa de páginas |
| novo `lib/documentos/dossie.ts` (puro) | nome do dossiê, ordem, normalização, escolha do "documento principal" — testável sem PDF |
| `services/pacoteContabilService.ts` | monta o PDF (`pdf-lib`, carregado sob demanda), reduz foto grande, trata falha |
| dependência | `pdf-lib` (MIT) — **a única nova** |
| Pacote da Central | o mesmo documento de uma **compra parcelada** vai para o dossiê de **cada** parcela |

## 6. O ponto que precisa da sua decisão: a data

Os dois dossiês do seu exemplo revelaram uma **diferença entre o sistema e os arquivos**:

| | Sistema | Arquivo / seu exemplo |
|---|---|---|
| Ana Patrícia, R$ 760,00 | lançamento de **01/09/2026** (conta **Bradesco**) | `04.09.2026 … RPA …` e pasta `04-09-2026` |
| Tayane, R$ 1.933,00 | lançamento de **01/09/2026** | `04.09.2026 … DPS …` |

Em **setembro, 15 das 120 saídas (13%) estão datadas de 01/09**; em **agosto, 0 de 132
estão no dia 01**. Entre as do dia 01/09 há Salários (3), Prestação de Serviços (3),
Prebenda (2) e RPA (1) — tipos que a tesouraria costuma pagar em outro dia — mas também
compras de mercado que **realmente** são de 01/09 (os arquivos delas se chamam
`01.09.2026 …`). **Não dá para afirmar que as 15 estão erradas; as 2 que você anexou
estão** (e as outras precisam ser conferidas uma a uma). Para elas, o dia que o dossiê
usaria na **pasta e no nome** (`01-09-2026`, `01092026_…`) **não é o dia que a
tesouraria usa** (`04-09-2026`). `data_pagamento` está vazia em 99,9% das saídas, então
não ajuda.

**Isto não é um defeito do dossiê** — é o mesmo dado que já afeta o pacote atual. Mas
o novo nome de arquivo põe a data **no nome**, o que torna o erro mais visível. Antes de
gerar o pacote de setembro, vale **conferir esses 15 lançamentos** e corrigir a data
(ou preencher `data_pagamento`); eu posso listá-los com o que se sabe de cada um.

## 7. Decisões que preciso de você

1. **`NF12345` ou `12345`?** Os seus exemplos de abertura mostram `01092026_NF12345_MUNDIAL`
   e a regra de prioridade diz `01092026_12345_MUNDIAL`. Segui a **regra** (só o número).
   Confirma?
2. **Gravar o número lido em `documento_numero`** quando estiver vazio? É uma escrita em
   `fin_lancamentos` (coluna existente), mas sem isso a maioria dos nomes cairá no tipo.
3. **Ordem num mesmo lote da Central:** documento fiscal **antes** do comprovante,
   independente da ordem em que os arquivos foram soltos?
4. **Foto grande:** reduzir para 1.600 px **só na cópia do dossiê** (original intacto)?
5. **Os 15 lançamentos de 01/09:** quer a lista para conferir as datas antes do pacote?
6. **Marca nas páginas** (rodapé "RPA · pág. 1/2")? Recomendo **não**: altera o documento
   original; o `INDICE.csv` já traz o mapa de páginas.

## 8. Regras de negócio registradas (03/10/2026, ditadas pela Telma)

Registro das regras como ela as formulou, antes de qualquer código do dossiê. Onde uma
regra **responde** uma pergunta do §7, está dito; onde dá para ler de dois jeitos, a
leitura adotada está marcada como **leitura minha**.

**Tipos oficiais (lista fechada, nesta ordem):** Nota Fiscal · Boleto · Comprovante de
Pagamento · Fatura · Contrato · XML · RPA · RSP · DPS · Outro. RPA, RSP e DPS são de
primeira classe em Anexos, Auditoria, Central, Relatórios, Filtros e Indicadores — todas
essas telas já leem a mesma lista (`FIN_ANEXO_TIPOS_OFERECIDOS` / `FIN_ANEXO_TIPO_LABEL`
em `finService.ts`); o rótulo passou a ser "Comprovante de Pagamento", como na lista dela.

**Significado das siglas — DEFINIÇÃO FINAL (03/10/2026, ver §8.3):** **RPA** = Recibo de Pagamento a Autônomo · **RSP** = Recibo de Sustento Pastoral · **DPS** = Demonstrativo de Pagamento de Salário. O **RPS** deixou de existir.

**Um arquivo principal por lançamento.** O escritório não recebe vários documentos do
mesmo pagamento: `Fornecedor_NF.pdf` + `_Boleto.pdf` + `_Comprovante.pdf` viram **um**
`Fornecedor.pdf` com tudo dentro.

**Merge.** Todos os PDFs do mesmo lançamento são mesclados ao gerar o Pacote Contábil.

**Ordem das páginas = ordem cronológica do upload** (`ORDER BY` data de envio `ASC`):
o que foi enviado primeiro é a página 1 (ex.: RPA às 01:52, comprovante às 01:59 →
página 1 RPA, página 2 comprovante). *"A sequência de envio representa o fluxo real da
documentação."* → **responde a pergunta 3 do §7 em parte:** vale a ordem de envio. Como
a Central grava os arquivos de um mesmo lote com `enviado_em` escalonado, a ordem entre
eles é a que a Central define (documento fiscal antes do comprovante) — **leitura minha**;
se ela quiser que valha a ordem em que soltou os arquivos, é uma linha de mudança.

**Nome:** `DDMMAAAA_DOCUMENTO-OU-NÚMERO_FORNECEDOR`.
1. **Prioridade 1 — o número do documento:** `01092026_12345_MUNDIAL.pdf`,
   `15092026_987_RPA_ANA_PATRICIA.pdf`, `12082026_456_RPS_APOIO_CONTABIL.pdf`.
2. **Prioridade 2 — sem número, o tipo:** `04092026_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA.pdf`,
   `05092026_DPS_TAYANE_CLAUDIO_REZENDE_DE_SOUZA.pdf`.
3. **Fornecedor ou funcionário**, conforme o lançamento.
4. **Padronização automática:** sem acento, sem caractere especial, sem barra, sem aspas,
   sem caractere inválido no Windows, espaço vira `_`, tudo em maiúsculas
   (`Ana Patrícia da Silva de Lima Oliveira` → `ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA`).

   → **responde a pergunta 1 do §7:** os exemplos dela confirmam **só o número** (`12345`,
   não `NF12345`). **Detalhe novo que os exemplos revelam:** nos de RPA e RSP o **tipo
   aparece depois do número** (`987_RPA_…`, `456_RPS_…`), enquanto na nota fiscal ele
   **não** aparece (`12345_MUNDIAL`). **Leitura minha:** com número, Nota Fiscal, Boleto
   e Fatura levam só o número; **RPA, RSP e DPS mantêm o tipo depois do número**, porque
   o número de um recibo sozinho não diz o que é. Sem número, o tipo entra para todos.

**Estrutura do pacote:** `Conta Financeira → Data → Arquivos`, **sem** pasta de fornecedor
(já é a estrutura atual; o exemplo dela é `Bradesco/01-09-2026/…`).

**XML nunca se perde.** Preferência dela: gerar o `….pdf` **e** o `….xml` com o **mesmo
nome-base, na mesma pasta**; o XML **não entra no merge** e fica disponível ao escritório.
É a "estratégia B" do §3, agora confirmada como regra.

**JPG e PNG viram PDF** na geração do dossiê e entram nas páginas correspondentes (NF em
PDF, comprovante em JPG convertido, recibo em PNG convertido). O original continua
intacto no sistema.

**Objetivo final:** abrir `Bradesco → 01-09-2026` e achar um PDF consolidado por
pagamento — `01092026_12345_MUNDIAL.pdf` (NF + boleto + comprovante),
`01092026_9876_LIGHT.pdf` (fatura + comprovante),
`01092026_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA.pdf` (RPA + comprovante).

### 8.1 Alteração: o valor entra no nome (03/10/2026, mesma noite)

*"O valor passa a ser parte obrigatória do nome de todos os arquivos do Dossiê
Contábil."* Motivos dela: conferência pelo escritório, localização rápida, identificação
visual, menos colisões, análise sem abrir o PDF.

**Padrão oficial: `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR`**, na ordem de prioridade
**1 data · 2 valor · 3 número do documento** (sem número, o tipo):

| Caso | Nome |
|---|---|
| NF com número | `01092026_86,13_12345_MUNDIAL.pdf` |
| Fatura com número | `15092026_281,46_98765_LIGHT.pdf` |
| RPA sem número | `04092026_760,00_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA.pdf` |
| DPS sem número | `05092026_350,00_DPS_TAYANE_CLAUDIO_REZENDE_DE_SOUZA.pdf` |
| RSP com número | `12092026_1200,00_456_RSP_APOIO_CONTABIL_LTDA.pdf` |

**Valor:** o valor financeiro **do lançamento**, sem símbolo de moeda e **sem separador
de milhar** (`R$ 12.548,92` → `12548,92`; `R$ 760,00` → `760,00`). Numa compra
parcelada, cada parcela leva o valor **da sua parcela**.

**XML:** mesma nomenclatura do PDF — `01092026_86,13_12345_MUNDIAL.pdf` e
`01092026_86,13_12345_MUNDIAL.xml`.

**Os exemplos dela confirmam a "leitura minha" nº 1 acima:** a fatura da Light com número
(`98765_LIGHT`) não leva o tipo, e o RSP com número (`456_RSP_…`) leva. Passa de leitura a
regra: **com número, RPA/RSP/DPS mantêm o tipo depois dele; os demais levam só o número.**

**Consequências práticas (medidas por aritmética, não por geração real):**
- O nome cresce no máximo ~12 caracteres (`12548,92_`). O maior caminho medido antes era
  117 de 260 do Windows, então fica em torno de **129** — folga mantida.
- A vírgula é válida em nome de arquivo no Windows e no ZIP. O `INDICE.csv` já usa
  `;`/aspas pt-BR (`csvPtBr`), então a vírgula do nome não o quebra.
- O desempate de colisão (§4) passa a ser só o início do ID.
- Impacto no código: `lib/documentos/dossie.ts` (a ser criado) formata o valor com
  `toFixed(2).replace(".", ",")` — o mesmo formato que `relatorioLote.ts` já usa — e o
  `planejarPacote` atual (`Fornecedor_Tipo.ext`) é substituído por este padrão junto com
  o resto do dossiê. Testes obrigatórios: `12548.92` → `12548,92`; `760` → `760,00`; `0` → `0,00`; e
  valor negativo (estorno) não pode gerar `-` solto no nome — usa o valor absoluto.

### 8.2 Respostas finais (03/10/2026, mais tarde) e implementação

| # | Pergunta | Resposta dela | Situação |
|---|---|---|---|
| 2 | Gravar o número em `documento_numero` | **Sim** — pesquisa, auditoria, relatórios, conferência, duplicidade | Feito: a Central grava o número lido (nota, RPA, RSP, DPS, fatura) só onde está **vazio**, e o **Desfazer lote** o esvazia de volta. Boleto, comprovante, contrato, XML e "outro" não gravam número. |
| 3 | Ordem das páginas | **Lógica documental**, não a do upload: NF · RPA · RSP · DPS · Fatura · Boleto · Contrato · Outro · **Comprovante por último** | Feito (`ordenarPartes`). Dentro do mesmo tipo vale a ordem de envio. O XML não entra. |
| 4 | Foto grande | **Sim**, reduzir **só na cópia do dossiê**; nunca alterar o original | Feito: lado maior em 1.600 px (JPEG 0,85; PNG continua PNG); JPEG com rotação EXIF passa pelo canvas para sair em pé. O armazenado não é tocado. |
| 5 | 15 lançamentos de 01/09 | **Validar antes** | Feito: [`VALIDACAO_DATAS_01_09.md`](./VALIDACAO_DATAS_01_09.md) — nenhuma data errada. |
| 6 | Carimbo | **Não** (sem marca d'água, número de página, "X de Y", nome do sistema, rodapé, cabeçalho) | Feito, com teste: nº de páginas do dossiê = soma dos originais. Um dossiê de **uma** parte em PDF sai com os bytes originais. |

**Colisão:** só quando coincidem data, valor, documento **e** fornecedor entra o identificador
(`15092026_281,46_FATURA_LIGHT_7A44CF.pdf`). **Truncamento:** só o fornecedor/funcionário
encolhe — 1º tira conectivos (DE, DA, DO…), 2º mantém primeiro e último nome, 3º corte seco;
data, valor e documento nunca são cortados. Limite do caminho relativo: 200 caracteres (260 do
Windows menos ~60 de folga para onde o contador extrai).

**Montagem:** `lib/documentos/dossie.ts` (ordem e nome, puro), `dossiePdf.ts` (merge com
`pdf-lib`, carregado sob demanda — única dependência nova), `reduzirImagem.ts` (canvas),
`pacoteContabil.ts` (plano: um dossiê por lançamento) e `pacoteContabilService.ts`
(download, merge, ZIP). **O que não puder ser mesclado não se perde:** vai ao lado como
`…_ORIGINAL_n.ext` e entra no `ERROS.txt`. O `INDICE.csv` agora tem **uma linha por
lançamento** e a coluna **Páginas** (`Nota Fiscal: 1-2 · Comprovante de Pagamento: 3`), já
que não há carimbo nas páginas.

**Medido em produção (setembro/2026, só leitura):** o pacote tem hoje **4 dossiês** (só
existem 6 anexos no banco); o merge dos dois que ela montou à mão deu 2 páginas cada (tamanho
≈ soma dos originais, ~0,6 s por dossiê incluindo o download); o ZIP inteiro gerou em 0,6 s
sem falhas; caminho máximo 120 de 200. Foto sintética 3000×2000 → 1600×1067 (282 KB → 53 KB);
PNG de 5,8 MB → 0,88 MB; imagem pequena sai idêntica.

**Sigla do Recibo de Sustento Pastoral:** resolvida em §8.3 — é **RSP**, no banco, na tela e no nome do arquivo.

**Antes de gerar o pacote de setembro** (ações dela): rodar a migration `20261002200000`
e `sql/reclassificar_anexos_rpa_dps_2026-10-03.sql`; sem isso os dois dossiês de RPA/DPS saem
com `DOCUMENTO` no lugar de `RPA`/`DPS`, porque os anexos ainda estão como "Outro".

**Ainda em aberto do §7 (superado pelas respostas acima — mantido por histórico):** 2 (gravar o número lido em
`documento_numero` — sem isso a maioria dos nomes cairá no tipo, pois só 1 de 283
lançamentos de setembro tem número), 4 (reduzir foto grande só na cópia do dossiê),
5 (conferir os 15 lançamentos datados 01/09 — o nome do arquivo leva a data, então um
dia errado vira nome errado) e 6 (sem carimbo de página).

### 8.3 Correção definitiva dos tipos (03/10/2026, depois da implementação)

Revisados os documentos reais, a classificação final é:

| Tipo | Significado | Usado para |
|---|---|---|
| **RPA** | Recibo de Pagamento a Autônomo | prestadores autônomos; pessoa física sem vínculo empregatício |
| **RSP** | Recibo de Sustento Pastoral | sustento pastoral, verba pastoral, ajuda ministerial, sustento ministerial |
| **DPS** | Demonstrativo de Pagamento de Salário | contracheque, holerite, folha individual de pagamento |

**RPS (Recibo Provisório de Serviços) foi removido por completo** — "não faz parte da rotina
da igreja e está causando confusão". Lista oficial: Nota Fiscal · Boleto · Comprovante de
Pagamento · Fatura · Contrato · XML · RPA · RSP · DPS · Outro.

**Classificação automática** (o usuário sempre pode trocar), do mais firme ao mais solto:
1. o **título** impresso: "Recibo de Pagamento a Autônomo" → RPA · "Recibo de Sustento
   Pastoral" → RSP · "Demonstrativo de Pagamento de Salário" → DPS;
2. as **expressões** que ela listou: *Folha de Pagamento, Contracheque, Holerite, Recibo de
   Salário* → DPS · *Sustento Pastoral, Verba Pastoral, Ajuda Ministerial, Sustento
   Ministerial* → RSP;
3. a **sigla** sozinha (RPA, RSP, DPS).

Os degraus 2 e 3 não valem quando o texto parece NFS-e (uma nota de serviço pode citar "folha
de pagamento" ou "DPS" com outro sentido). O título completo vence a expressão solta.

**Nomes** seguem `DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR`; com número o tipo fica depois dele:
`30092026_4500,00_RSP_CAIO_MARCELO_MENDES_DA_SILVA.pdf` ·
`30092026_3250,00_DPS_MARIA_APARECIDA_DOS_SANTOS.pdf` · `15092026_760,00_RPA_JOSE_DA_SILVA.pdf`.
A ordem das páginas troca RPS por RSP na mesma posição: NF · RPA · RSP · DPS · Fatura ·
Boleto · Contrato · Outro · Comprovante.

**Banco:** medido por tentativa de inserção sem gravar nada (lançamento inexistente: tipo
recusado dá erro de CHECK, tipo aceito dá erro de chave estrangeira), o banco **ainda não tem**
RPA/RPS/RSP/DPS — só a lista antiga. Por isso a migration `20261002200000` (ainda não aplicada)
foi corrigida **no lugar**: `rsp` em vez de `rps`, e nenhum dado precisou ser convertido.

**Um ponto a saber:** o arquivo real de agosto da tesouraria usa `RPS` nos nomes (ex.: uma
faxineira). O leitor de nome continua reconhecendo o termo para **tirá-lo do fornecedor**, mas
não sugere tipo nenhum a partir dele (não vou adivinhar se aquilo era RPA).
