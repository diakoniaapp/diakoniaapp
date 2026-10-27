# Análise automática de documentos: regras de atraso (multa, juros, custo do atraso) — análise e proposta (27/10/2026)

Só análise e proposta: **nada foi implementado**. Li o código (leitura de documentos, OCR, anexos, encargos, Mesa). Não consultei o banco ao vivo; quantos documentos reais trazem a regra impressa é o primeiro número que falta (ver §7).

## 1. Resposta curta

- **Ler o valor, o vencimento, a linha digitável e o Pix de um documento já existe e funciona.** O que **não existe** é ler a **regra de atraso** (multa, juros, desconto, correção) nem **calculá-la** no tempo: não há nenhuma função de "dias de atraso", "juros pro rata" ou "multa" no código. Hoje multa e juros só entram **na hora de pagar** (`fin_liquidar`) ou, desde 23/10, no "Recalcular guia".
- **É viável**, com um cuidado central: o valor calculado é uma **estimativa**, não o valor oficial. Há documentos que **não podem ser pagos depois de vencer** (a própria guia de ISS lida em teste diz "bancos ou casas lotéricas não estão autorizados a receber esse DARM após 06/10/2026"), e as guias de tributo (DARF, GPS, FGTS) têm fórmula oficial própria. Por isso a proposta tem **degraus** (§4).
- **O que dá para entregar com segurança primeiro:** boletos e faturas que trazem a regra escrita ("após o vencimento, multa de 2% e juros de 1% ao mês"). Esforço: **~6 dias** o primeiro degrau; **~11–12 dias** o conjunto completo.

## 2. O que já existe e dá para reaproveitar

| Peça | Onde | O que faz hoje | Serve para esta funcionalidade? |
|---|---|---|---|
| **Texto do PDF** (exato) | `services/ocrService.ts` `textoDoPdf` | extrai o texto embutido do PDF; sem OCR | **Sim — é a melhor fonte** (a regra é texto impresso) |
| **OCR de imagem/scan** | `ocrService.ts` (Tesseract, `pdfParaImagem`, `extrairDadosDoComprovante`) | lê foto/escaneado; "aproximado: conferir sempre" | Sim, com confiança menor e conferência obrigatória (a própria casa já descartou OCR para caligrafia) |
| **Leitor de documento de pagamento** | `lib/documentos/pagamento.ts` `lerDocumentoDePagamento` (puro, 455 linhas, 370 de testes) | tipo (boleto/guia/fatura/Pix), valor, vencimento, emissão, beneficiário, CNPJ, banco, linha digitável, competência, código da receita, Pix, **confiança e avisos** | **Sim — é o ponto de extensão**: ganha um bloco `regras` ao lado dos campos de hoje |
| **Decodificação da linha digitável** | `lib/boleto.ts`, `arrecadacao.ts` | valor e vencimento **exatos** pelos dígitos verificadores | Sim: o valor original e o vencimento **vêm da linha**, sem depender do texto |
| **Subtipo de guia** | `lib/documentos/guia.ts` | DARF, GPS, FGTS, IRRF, ISS, IPTU, DAS, taxa | Sim: decide o degrau (§4) |
| **Painel de leitura** | `components/financas/LeituraDoDocumentoPainel.tsx` | mostra o que foi lido, avisos, botão copiar | Sim: ganha a seção "Regras de atraso" editável |
| **Gancho do primeiro upload** | `AnexosLancamentoDialog` (lê ao escolher o arquivo; `guardarLeituraNoAnexo` ao enviar), `LancamentoForm:519` (lê o comprovante) | é exatamente "no primeiro upload" | **Sim** |
| **Leitura guardada** | `fin_lancamento_anexos.dados_extraidos` (JSON, `versao: 1`, só o que serve para pagar) | já alimenta Pagar, "Preparar envio" e o e-mail diário | Sim, como cópia da leitura; **mas não serve para somar na Mesa** (JSON em linha de anexo) |
| **Encargos da obrigação** | `lib/encargos.ts`, colunas `juros / multa / desconto / valor_original / motivo_diferenca`, `IndicadoresDeEncargos`, `EncargosDoPeriodo` (Prestação), "Recalcular guia" | **o que foi pago** a mais ou a menos | **Sim**: é a "realidade" que a estimativa compara |
| **Indicadores de encargos** | `IndicadoresDeEncargos` (hoje no DRE, no Orçamento e na Visão Executiva — **não na Mesa**) e `totaisDeEncargosNoPeriodo` | total de juros, multas e descontos **pagos** no período, **pela data do lançamento** | Parcial: falta levar à Mesa e pôr a opção "pela data do pagamento" (você decidiu mês do pagamento em 23/10) |
| **Datas puras** | `_shared/contribuicoes/analise.ts` (`diasEntre`, `somarDias`), `lib/data.ts` | aritmética de datas em UTC, sem fuso | Sim: o cálculo de atraso usa as mesmas |

### Lacunas medidas no código
1. O leitor **não tem campo** para multa, juros, desconto ou regra — só um aviso solto sobre "valor da multa" na fixture de ISS.
2. **A importação em lote** (Central de Documentos / "Importar documentos em lote", onde entraram os 583 anexos) usa o leitor de **nota fiscal** (`lerDocumento`), **não** o de pagamento: documentos que entraram em lote **não têm** `dados_extraidos`. Para eles a regra só viria de uma leitura retroativa (§5, fase 3).
3. O leitor de pagamento é chamado em 3 lugares (`LancamentoForm`, `documentoPagamentoService` ×2); **não há** um único ponto "documento entrou → extrai e guarda" para todas as portas.
4. **PDF escaneado sem texto** cai no OCR (aproximado): a regra extraída dali **nunca** deve ser aplicada sem conferência.

## 3. O que a regra de atraso precisa dizer (modelo)

A regra é o que o **documento** diz, e quase sempre cabe em um destes desenhos:

| Parte | Formas que aparecem em boleto/fatura | Como guardar |
|---|---|---|
| **Valor original** | o valor do documento | já existe (`valor_original`, linha digitável) |
| **Vencimento** | data | já existe |
| **Multa** | "2% após o vencimento" · "R$ 2,00" · "multa 10% (FGTS)" | `{ tipo: "pct" \| "fixo", valor, incide: "uma_vez" }` |
| **Juros** | "1% ao mês" · "0,033% ao dia" · "R$ 0,33 ao dia" | `{ tipo: "pct_mes" \| "pct_dia" \| "fixo_dia", valor, base: "simples" \| "composto" }` — pro rata dia |
| **Correção** | IPCA, IGP-M, SELIC, TR | `{ indice, observação }` — **precisa de tabela de índices** (mensal, mantida à mão ou por fonte oficial) |
| **Desconto** | "desconto de R$ x até dd/mm" · "x% até o vencimento" | `{ ate, tipo, valor }` |
| **Carência / limite** | "juros após 3 dias úteis" · "não receber após dd/mm" | `{ carenciaDias, pagavelAte }` |
| **Origem e confiança** | lida do texto (com o **trecho**), digitada, ou padrão | `origem: "texto" \| "ocr" \| "manual" \| "padrao"`, `confianca 0–100`, `trecho` |

A conta (função pura, testada, em `_shared/atraso/calculo.ts`): `valorAtualizado(regras, valor, vencimento, hoje)` devolve `{ diasDeAtraso, multa, juros, correcao, total, estimativa: true, avisos }`. Convenções ficam em **um lugar** (dias corridos, juros pro rata, multa uma vez, arredondamento em centavos) e **aparecem na tela** ("1% ao mês, pro rata dia, simples").

## 4. Degraus — onde a estimativa é confiável e onde não é

| Degrau | Documentos | O que o sistema faz | Risco |
|---|---|---|---|
| **A — regra impressa** | boleto bancário e fatura (energia, água, gás, telefonia, internet, condomínio) com "multa X% / juros Y%" no texto | **lê e calcula** a estimativa (valor atualizado, multa, juros, custo) | baixo — vem do documento; sempre rotulado "estimado" |
| **B — regra padrão** | boleto/fatura **sem** a regra escrita | oferece uma **regra padrão configurável** (sugestão: multa 2% e juros 1% a.m., o teto comum de consumo), marcada **"padrão — não consta no documento"** e **desligada por padrão** | médio — é palpite; só entra se você ligar |
| **C — guia de tributo** | DARF, GPS/INSS, FGTS, IRRF, DAS | **não calcula** sozinho: multa de mora diária com teto + SELIC acumulada (DARF/GPS) e multa + TR/juros (FGTS) são oficiais; mostra "**recalcular na fonte**" e usa o fluxo **Recalcular guia** (que o sistema já tem) | alto se estimar — fica para depois, com tabela de índices |
| **D — não pagável após vencer** | ISS/DARM, boletos com "não receber após" | mostra **"vencida: peça segunda via"**, sem número | — |

O ponto de honestidade: o **valor atualizado exibido é uma estimativa** e o dinheiro que sai do banco será o valor da **guia nova** ou do **boleto atualizado pelo banco**. Quando a guia chega (Recalcular guia ou o pagamento), os valores **oficiais substituem** a estimativa, e a **diferença** entre a estimativa e o real alimenta uma medida de precisão ("o sistema acertou X%").

## 5. Arquitetura proposta

**Cálculo e leitura em módulos puros compartilhados** (a lição dos e-mails e do módulo de contribuições: o MESMO número na tela, no Excel e no e-mail):
- `supabase/functions/_shared/atraso/regras.ts` — tipos + **leitor de regras do texto** (busca "multa", "juros de mora", "ao mês", "ao dia", "% após o vencimento", "desconto até"; devolve regra + trecho + confiança). Recebe texto; **não** lê arquivo.
- `…/atraso/calculo.ts` — a estimativa (§3), com o aviso de limite/estimativa.
- `src/lib/atraso.ts` — reexporta.

**Guardar** — comparação das duas opções:

| | JSON no anexo (`dados_extraidos` versão 2) | **Tabela `fin_regras_de_atraso` (1 linha por obrigação)** |
|---|---|---|
| Vincula à obrigação | indireto (anexo → lançamento) | **direto** |
| Somar na Mesa/relatórios | ruim (varre JSON de N anexos) | **boa** (join simples) |
| Histórico de guias (vence a mais nova) | confuso | `anexo_id` da guia que originou + versões |
| Edição manual (corrigir 2% → 5%) | não tem onde | **tem** (`origem: manual`) |
| Migration | não | **sim** |

**Recomendação:** **tabela por obrigação**, com a leitura copiada em `dados_extraidos` (versão 2: apenas **reserva** o bloco `regras`, para o mesmo JSON seguir servindo Pagar e e-mails). RLS como `fin_lancamentos` (equipe do financeiro lê; admin e tesouraria escrevem); registro de quem e quando.

**Fluxo:**
1. **Entrada do documento** (3 portas de hoje + lote): `lerDocumentoDePagamento` ganha `regras`; o serviço grava `fin_regras_de_atraso` **como rascunho** e mostra **"Regras lidas — conferir"** (§6).
2. **Estimativa em tela:** componente puro `CustoDoAtraso` (Valor original · Valor atualizado · Custo dos encargos) calcula **no navegador** a partir da regra + valor + vencimento + hoje (sem função de banco, sem agendamento).
3. **Mesa:** indicadores somam regras das obrigações em aberto (poucas dezenas) + encargos pagos (já existem).
4. **E-mails** (diário/semanal): bloco opcional "Custo dos atrasos" reaproveitando o mesmo módulo `_shared`.
5. **Oficial vence:** `Recalcular guia` e o pagamento gravam os encargos reais; a estimativa some para aquela obrigação e vira "pago: X (estimado: Y)".

Nada disto cria linha de DRE (mantém a **Opção A**: encargo é informação da obrigação).

## 6. UX proposta

**a) No primeiro upload — "Regras de atraso lidas"** (seção nova dentro de `LeituraDoDocumentoPainel`, fechada se não achou nada):
```
Regras de atraso (lidas do documento)                      confiança 92%
  Multa       2,00 %  após o vencimento            ✎
  Juros       1,00 % ao mês (pro rata dia)         ✎
  Desconto    —                                    ✎
  "Após o vencimento cobrar multa de 2% e juros de 1% ao mês"   ← trecho do documento
  [ Guardar regras ]   [ Não é isto — digitar ]   [ Ignorar ]
```
Sem regra no texto: **"Este documento não traz regra de atraso."** com o botão **"Usar regra padrão da igreja"** (se ligada) ou **"Informar regra"**.

**b) Na obrigação (detalhe, Mesa, Extrato de Obrigações)** — três números, só quando está **vencida**:
```
Valor original        R$ 1.000,00
Valor atualizado*     R$ 1.037,50    (estimado em 27/10 · 12 dias)
Custo dos encargos    R$    37,50    multa 20,00 + juros 17,50
* estimativa pela regra do documento · ⓘ ver a regra · "Recalcular guia" quando a guia nova chegar
```
Selo **"Atrasada há 12d"** (o mesmo da auditoria) e, nos casos D, **"Peça segunda via"**. No **Pagar**, os campos juros e multa já vêm **sugeridos** pela estimativa (editáveis) — digitar menos e errar menos.

**c) Mesa da Tesouraria — cartão "Custo dos atrasos"** (mês escolhido, com a mesma seleção de período):
```
Multas do período     R$  120,00   (pagas)
Juros do período      R$   64,30   (pagos)
Custo dos atrasos     R$  184,30   pago  +  R$ 52,10 em curso (estimado, 3 obrigações)
Maiores custos: Light 31,20 · Prefeitura 12,50 · …            [Ver no Extrato →]
```
Duas cores/etiquetas honestas: **pago (certo)** × **em curso (estimado)**. Os números **pagos** usam a **data do pagamento** (sua decisão de 23/10) e coincidem com o bloco da Prestação.

## 7. Riscos e como tratá-los

| Risco | Tratamento |
|---|---|
| Regra lida errada (OCR/texto confuso) | **sempre rascunho + conferência** no primeiro upload; mostra o **trecho** lido; confiança visível; OCR nunca vira regra sozinho |
| Estimativa diferente do banco | sempre rotulada "estimado"; o oficial substitui; **medida de precisão** (estimado × pago) |
| Documentos já anexados sem regra | leitura retroativa em lote **com revisão** (§8, fase 3) |
| Guias de tributo | degrau C: não estima; leva ao "Recalcular guia" |
| Falsa tranquilidade ("vence em 30 dias e já sei o custo") | cálculo **só depois do vencimento**; antes mostra apenas "regra: multa 2% + juros 1% a.m." |
| Índices (IPCA, SELIC) | fora do primeiro degrau; quando entrarem, tabela mensal com data de atualização visível |

**Antes de construir, uma sondagem de ~0,5 dia (somente leitura):** rodar o leitor de regras sobre os anexos que **já têm texto** e contar quantos trazem multa/juros legíveis, por tipo (boleto, energia, água, telefonia…). Isso dá a taxa real de cobertura do degrau A com dados da igreja e evita construir para um caso raro.

## 8. Roteiro e esforço

| Fase | Conteúdo | Esforço |
|---|---|---|
| **0 — Sondagem** | leitor de regras em modo "só conta" sobre os anexos existentes; relatório de cobertura | 0,5 d |
| **1 — Núcleo** | `atraso/regras.ts` (leitor) + `atraso/calculo.ts` + testes com textos reais; extensão do leitor de pagamento (`regras`) | 3 d |
| **2 — Guardar e mostrar (MVP)** | migration `fin_regras_de_atraso` + ensaio; painel "Regras lidas" no upload; **os três números** na obrigação; **Pagar** sugere juros/multa | 3 d |
| **3 — Mesa e relatórios** | cartão "Custo dos atrasos" (pagos pela data do pagamento + em curso estimado); bloco opcional nos e-mails | 2 d |
| **4 — Retroativo** | "Ler regras dos documentos já anexados" com fila de revisão; ligar a importação em lote | 1,5 d |
| **5 — Tributos e índices** (depois) | tabela de índices; DARF/GPS/FGTS; medida de precisão | a definir |
| **Total até a fase 4** | | **~11–12 dias** (**MVP = fases 1–2 ≈ 6 dias**) |

## 9. Decisões que preciso de você

1. **Concorda com os degraus?** Em especial: tributos (DARF/GPS/FGTS) **fora** da primeira entrega, usando o "Recalcular guia".
2. **Regra padrão** (multa 2% + juros 1% a.m.) para documento sem regra escrita: **oferecer, desligada por padrão**, ou **não oferecer**?
3. **Estimativa só depois de vencer**, rotulada "estimado"? (recomendo sim)
4. O **cartão da Mesa** separa **"pago"** de **"em curso (estimado)"**? Ou só o pago?
5. Os números pagos usam a **data do pagamento** (como você decidiu em 23/10), diferente do DRE (data do lançamento): fica assim e a tela explica?
6. **Conferência no primeiro upload é obrigatória** (a regra só vale depois de "Guardar regras") ou a regra lida com confiança alta entra sozinha?
7. Posso começar pela **sondagem da fase 0** numa sessão sua logada (só leitura), antes de qualquer migration?
