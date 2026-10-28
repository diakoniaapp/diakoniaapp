# Auditoria: "Cálculo Preventivo de Encargos" — o que já existe no DiakoniaApp (28/10/2026)

Auditoria só de leitura. Nada foi implementado, alterado ou aplicado. Cada afirmação abaixo vem do código do repositório em 28/10/2026 (busca por termos, leitura dos arquivos e das migrations). O que **não** pude verificar está na seção 9.

Esta auditoria confirma e atualiza a análise de 27/10 (`docs/ANALISE_REGRAS_DE_ATRASO_2026-10-27.md`), onde a proposta de UX e arquitetura já está detalhada. Aqui o foco é o que você pediu: o que existe de verdade.

---

## 1. Resposta curta

| | Situação |
|---|---|
| Ler o documento e extrair valor, vencimento, beneficiário, linha digitável, Pix | ✅ **Já implementado** |
| Ler **multa, juros, desconto e "não receber após"** impressos no documento | 🟡 **Parcial**: o leitor existe, está testado e está publicado, mas **não é chamado no upload** e o resultado **não é guardado em lugar nenhum** |
| Guardar multa, juros e encargos na obrigação | 🟡 **Parcial**: as colunas existem, mas só são preenchidas **na hora de pagar (digitados)** ou ao **recalcular a guia (digitados)** |
| **Calcular** valor atualizado, dias de atraso × taxa, multa acumulada, juros acumulados | ❌ **Não existe** |
| Mesa exibindo valor atualizado, multa acumulada, juros acumulados, custo do atraso | ❌ **Não existe** |

**O "Cálculo Preventivo de Encargos" como você descreveu não existe.** Existe o terreno onde ele se apoia: leitor de documentos, colunas de encargo, trilha de recálculo e indicadores históricos. Falta o elo do meio: ler a regra, guardá-la e calculá-la.

---

## 2. Auditoria item a item

### 2.1 Leitura automática de PDF, imagem e boleto (OCR) — ✅

- **PDF:** primeiro extrai o texto exato com `pdfjs-dist` (`textoDoPdf`, `src/services/ocrService.ts`). Só quando o PDF não tem texto útil é que rasteriza e usa OCR (Tesseract, no navegador, sem custo externo).
- **Imagem (PNG/JPG):** OCR com Tesseract.
- **QR Code:** lê o Pix "copia e cola" quando só existe como imagem (`src/services/qrDoDocumentoService.ts`).
- **Campos que `lerDocumentoDePagamento` extrai** (`src/lib/documentos/pagamento.ts`): tipo (boleto, guia, fatura, Pix), subtipo da guia e da fatura (energia, água, telefonia…), valor, vencimento, data de emissão, beneficiário, CNPJ do beneficiário, banco, número do documento, competência, código da receita da DARF, linha digitável, código de barras e se os dígitos verificadores conferem, Pix (payload, chave, valor, nome, CRC), convênio de arrecadação, confiança 0–100, motivos e avisos.
- **Notas fiscais:** `lerDocumento` em `src/lib/documentos/leitura.ts` (chave de acesso, valores, duplicatas) e `extrairCamposDoTexto` em `ocrService.ts`.
- **Comprovantes bancários:** `lerComprovante` em `src/lib/documentos/comprovante.ts`.
- **Decodificação de arrecadação** (GPS, DARF, tributos): `src/lib/documentos/arrecadacao.ts`.

**Não extrai:** multa, juros, desconto por pontualidade, correção monetária, "não receber após". Nenhum desses campos existe em `DocumentoDePagamento`.

### 2.2 O que acontece ao anexar um documento numa despesa — 🟡

`src/components/financas/AnexosLancamentoDialog.tsx`:

1. Ao escolher o arquivo, chama `lerArquivoDePagamento` e **interpreta** o conteúdo. Não só armazena.
2. Mostra o que leu e oferece botões "aplicar valor", "aplicar vencimento" e "preencher classificação" (só o que estava vazio).
3. Ao enviar, grava a leitura no anexo (`dados_extraidos`, versão 1) e **aprende** a classificação para a próxima vez (`aprenderComEscolha`).

O que fica guardado em `dadosParaGuardar` (`pagamento.ts:444`) é só o que serve para **pagar**: valor, vencimento, beneficiário, linha digitável, código de barras, Pix. **Multa e juros não entram**.

Dois detalhes:
- O leitor também roda no `LancamentoForm` (`LancamentoForm.tsx:519`).
- A importação em lote usa o leitor de NF e **não grava** `dados_extraidos`.

### 2.3 Multas e juros no código — 🟡

Busquei `multa`, `juros`, `mora`, `encargo`, `atraso`, `correção` em `src/`, `supabase/functions/` e `supabase/migrations/`. Resultado, por categoria:

| O que é | Onde | Calcula? |
|---|---|---|
| **Registrar** juros/multa/desconto/complemento/ajuste **na hora do pagamento**: a pessoa digita a diferença e escolhe o motivo | `src/lib/liquidacao.ts`, `LiquidacaoPainel.tsx`, função SQL `fin_liquidar` (`20261007100000_fin_liquidacao_real.sql`, `20261008200000_fin_encargos_como_atributos_da_obrigacao.sql`) | Não: confere que a soma fecha |
| **Colunas** `juros`, `multa`, `complemento`, `ajuste`, `desconto`, `valor_original`, `motivo_diferenca` em `fin_lancamentos` | migration `20261008200000` | Não |
| **"Recalcular guia"**: a guia reemitida com juros, multa e correção altera a obrigação, com trilha imutável | `RecalcularGuiaDialog.tsx`, `src/lib/recalculoDeGuia.ts`, `fin_recalcular_obrigacao`, tabela `fin_obrigacao_recalculos` (migration `20261023160000`) | Não: a pessoa digita o novo valor e a quebra; o sistema só confere que a diferença fecha |
| **Indicadores históricos** de encargos já pagos | `IndicadoresDeEncargos.tsx` (DRE, Orçamento, Visão Executiva), `EncargosDoPeriodo.tsx` (Prestação de Contas), `src/lib/encargos.ts` | Soma o que foi gravado |
| **Leitor de regras de atraso impressas** (`lerRegrasDeAtraso`) | `supabase/functions/_shared/atraso/regras.ts` (reexportado por `src/lib/atrasoRegras.ts`) | Só **lê** a regra; não calcula |
| **Sondagem de cobertura** da leitura nos anexos existentes | `src/lib/sondagemDeRegras.ts`, `src/services/sondagemDeRegrasService.ts`, rota `/admin/sondagem-regras-de-atraso` | Não |

O `lerRegrasDeAtraso` entende multa (percentual ou fixa), juros (% ao mês, % ao dia, valor fixo por dia), desconto até uma data, índice de correção citado e "não receber após". Tem 18 testes. Está em `origin/main` (commits `25cac95` e `3a87144`), mas **só a sondagem o chama** (`sondagemDeRegrasService.ts:59`). O upload de despesa **não** o usa.

### 2.4 Valor atualizado — ❌

Procurei por qualquer conta de atraso: taxa × dias, multa percentual ou fixa aplicada a um valor, juros diários, estimativa de valor atualizado. **Não existe em `src/`, nas Edge Functions nem nas funções SQL.** Não há campo nem função `valor_atualizado`.

O que existe é **dias de atraso** como informação:
- `vw_fin_ciclo.atraso_dias = hoje − vencimento` (`20261013110000_fin_ciclo_da_despesa_view.sql:80`), espelhado em `src/lib/cicloDaDespesa.ts`.
- Texto "vencido há 3d" (`PainelTesouraria.tsx:1368`), "atrasada há 3 dias" (`src/lib/filaDoDia.ts`).

Dias de atraso sem taxa, sem multa, sem custo.

### 2.5 Mesa da Tesouraria — 🟡 (só o indicador de atraso)

- **Indicador de atraso:** ✅ sim. A fila do dia, o calendário de vencimentos e o painel mostram vencido há N dias.
- **Indicador de encargos:** ❌ não. `IndicadoresDeEncargos` aparece no DRE, no Orçamento e na Visão Executiva, **não na Mesa**. Além disso, ele soma o que já foi pago, pela data do lançamento.
- **Valor atualizado:** ❌ não.
- **Previsão de multa:** ❌ não. A palavra "multa" aparece na Mesa só como comentário ("o que gera multa": Fiscal e Caixa), sem número.

### 2.6 Estrutura para guardar multa, juros, percentual e regra — 🟡

| Guarda | Existe? |
|---|---|
| **Valor** de multa, juros, desconto, complemento, ajuste **já cobrados** | ✅ colunas em `fin_lancamentos` |
| **Quebra** juros/multa/correção de uma guia recalculada, com quem e quando | ✅ `fin_obrigacao_recalculos` |
| **Leitura do documento** (`dados_extraidos`) | ✅ mas versão 1, sem regra de atraso |
| **A regra** (percentual da multa, taxa de juros, índice, desconto até quando, "não receber após") **por obrigação** | ❌ **nenhuma tabela nem coluna**. Confirmei por busca: não há `fin_regras_de_atraso` nem nada equivalente |

---

## 3. Classificação final

| Capacidade | |
|---|---|
| OCR / leitura de PDF, imagem, boleto, fatura, guia | ✅ |
| Extrair valor original, vencimento, beneficiário, linha, Pix no upload | ✅ |
| Interpretar o documento ao anexar (e guardar a leitura) | ✅ |
| Ler multa, juros, desconto e "não receber após" do texto | 🟡 (código pronto, não ligado) |
| Colunas para encargos **cobrados** | ✅ |
| Registrar encargos ao pagar | ✅ (digitados) |
| Recalcular guia atrasada com trilha | ✅ (digitado) |
| Indicadores de encargos **pagos** em relatórios | ✅ (fora da Mesa) |
| Guardar a **regra** de atraso por obrigação | ❌ |
| Calcular valor atualizado, multa e juros acumulados | ❌ |
| Mesa: valor atualizado, dias × encargos, custo do atraso | ❌ |
| Conferência da regra lida, no upload | ❌ |
| Cartão "Custo dos atrasos" (pago × em curso) | ❌ |

---

## 4. O que pode ser reaproveitado

1. **`lerRegrasDeAtraso`** (`_shared/atraso/regras.ts`): pronto e testado; é a base da extração.
2. **`lerDocumentoDePagamento` + `dadosParaGuardar`**: já rodam no upload; basta chamar o leitor de regras na mesma passada e acrescentar a regra ao `dados_extraidos` (versão 2, compatível).
3. **`AnexosLancamentoDialog`**: já mostra o que foi lido e já pede confirmação ("aplicar valor"). Dá para acrescentar um painel "Regras lidas — conferir".
4. **Colunas de encargo + `fin_liquidar` + `fin_recalcular_obrigacao`**: o destino natural do valor quando o atraso vira pagamento real. Já respeitam a decisão de 13/10 (o encargo é atributo da obrigação, nunca linha do DRE).
5. **`vw_fin_ciclo.atraso_dias`**: a multiplicação de dias vem pronta.
6. **`IndicadoresDeEncargos` e `EncargosDoPeriodo`**: o desenho dos três números (juros, multas, descontos) já existe; só não está na Mesa.
7. **Sondagem** (`/admin/sondagem-regras-de-atraso`): mede a cobertura real antes de construir o resto.

---

## 5. O que falta

1. **Módulo de cálculo puro** (`calculo.ts`): dado valor, vencimento, data de hoje e regra, devolve multa, juros e total. Hoje não há nada.
2. **Tabela da regra** por obrigação (percentuais, tipo, desconto, "não receber após", origem: lida do documento, padrão ou digitada, quem conferiu).
3. **Ligar o leitor de regras no upload** e **guardar** o resultado.
4. **Conferência humana da regra lida** (decisão sua de 27/10: obrigatória no primeiro upload).
5. **Os três números por obrigação** (original, atualizado, custo do atraso) e a **visão na Mesa**.
6. **Cartão "Custo dos atrasos"** com a separação pago × em curso (estimado).
7. **Estimativa sempre rotulada** como estimativa, e só depois de vencer.

---

## 6. Impacto técnico

| Área | Impacto |
|---|---|
| **Banco** | 1 tabela nova (regra por obrigação) + 1 migration; nenhuma coluna existente muda. `fin_liquidar` e `fin_lancamentos` **não precisam mudar** na 1ª entrega |
| **Leitura** | `dados_extraidos` passa a versão 2 (aditiva). Os anexos antigos continuam válidos; precisam ser relidos para ganhar a regra |
| **Cálculo** | Módulo puro, testável, compartilhado entre app, e-mails e Edge Functions (`_shared/atraso/`), como já foi feito para `regras.ts` |
| **Telas** | `AnexosLancamentoDialog` (painel de conferência), detalhe da obrigação (3 números), Mesa (cartão) |
| **Risco principal** | **Falsa precisão**: tributo (DARF, GPS, FGTS) e documento "não receber após o vencimento" **não** devem ser estimados. A proposta aprovada trata isso com os degraus A–D |
| **Risco de dados** | Nenhum para o histórico: tudo é aditivo. A estimativa nunca vira lançamento sozinha |
| **Dependência de produção** | Ver seção 9: `dados_extraidos` e as migrations de recálculo precisam estar aplicadas |

---

## 7. Esforço estimado

Reaproveitando o que existe, e já descontando a Fase 0 (feita):

| Fase | O que entrega | Estimativa |
|---|---|---|
| **0 (feita)** | Leitor de regras + sondagem | — |
| 0b | Você roda a sondagem logada e vemos a cobertura real | 0,5 d (sua parte: abrir a tela) |
| 1 | `calculo.ts` puro e testado (multa %, fixa; juros %/mês, %/dia, fixo/dia; desconto; degraus A–D) | 1–1,5 d |
| 2 | Tabela da regra + migration + guardar no upload + painel "Regras lidas — conferir" | 2,5–3 d |
| 3 | Três números na obrigação (original, atualizado, custo do atraso) | 1,5–2 d |
| 4 | Cartão "Custo dos atrasos" na Mesa (pago × em curso) | 1,5–2 d |
| 5 | Reler os anexos antigos; e-mails diário e semanal passam a citar o custo | 1–2 d |
| **Total** | | **~8–10 d**, com **MVP útil (fases 1–3) em ~5–6 d** |

---

## 8. Roadmap proposto

1. **Rodar a sondagem** (você, logada, em `/admin/sondagem-regras-de-atraso`). Diz quantos boletos e faturas **realmente imprimem** a regra. Se for pouco, o degrau B (regra padrão editável) ganha mais peso.
2. **Fase 1** (cálculo puro) e **Fase 2** (regra guardada e conferida no upload). Só aqui o sistema "sabe" a regra.
3. **Fase 3** (três números na obrigação). É o que responde "quanto custa se atrasar".
4. **Fase 4** (Mesa). Só faz sentido depois de a regra estar guardada.
5. **Fase 5** (anexos antigos, e-mails).

Decisões que você já tomou em 27/10 (todas "sim") e que continuam valendo: degraus A–D; tributos fora da 1ª entrega; regra padrão (2% de multa, 1% ao mês de juros) **desligada por padrão e editável**; estimativa só depois de vencer; cartão da Mesa separando "pago" de "em curso (estimado)"; números pagos pela data do pagamento; conferência obrigatória no primeiro upload; sondagem primeiro.

---

## 9. O que não consegui verificar

- **Produção:** não consultei o banco. Não sei se as migrations `20261006160000` (`dados_extraidos`) e `20261023160000` (recalcular obrigação) estão aplicadas. O código tem recados de "falta a migration" quando a coluna não existe.
- **Cobertura real:** quantos dos seus PDFs imprimem multa e juros. É a sondagem que mede, e ela precisa de você logada.
- **Leitura de imagem escaneada:** a regra de atraso só é lida de texto exato do PDF. Boleto fotografado ou escaneado passa por OCR, que é aproximado, e a Fase 0 não o cobre.
