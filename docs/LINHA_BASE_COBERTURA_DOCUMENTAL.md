# Linha de base — cobertura documental (03/10/2026)

> **Para que serve:** medir o ganho da Central de Documentos. Estes são os números
> **antes** da implantação. Para repetir a medição: tela **Auditoria de documentos**
> (`/financas/auditoria-anexos`), período **"Este ano"** — chega aos mesmos valores
> (conferido em 03/10/2026: 1.042 · 2 · 770 · 270).

## Definições (não mudar sem registrar aqui)

| Termo | Definição |
|---|---|
| **Lançamento financeiro** | toda linha de `fin_lancamentos`, de qualquer status e tipo |
| **Saída paga** | `tipo = saida`, `status` realizado/conciliado, `origem ≠ transferencia` |
| **Dispensa documento** | saída paga de categoria **Tarifas Bancárias, IOF, Juros ou Encargos Bancários** (nome exato) |
| **Exige documento** | saída paga que **não** dispensa |
| **Com documentação** | exige documento **e** tem ≥ 1 linha em `fin_lancamento_anexos` |
| **Documento anexado** | linha em `fin_lancamento_anexos` |
| **Documento órfão** | arquivo no bucket `fin-comprovantes` **sem** linha em `fin_lancamento_anexos` |
| **Data do lançamento** | `data_pagamento`, ou `data` quando vazia (99,9% das saídas não têm `data_pagamento`) |

Não entram em "exige documento": entradas, pernas de transferência, cancelados, e
saídas **ainda não pagas** (previsto / aguardando aprovação).

## Visão global (todos os anos)

| | |
|---|---|
| Lançamentos financeiros no sistema | **13.378** |
| Que **exigem** documento | **2.602** (2024: 853 · 2025: 976 · 2026: 772 · 2022: 1) |
| Documentos anexados | **2** (ambos tipo antigo, de 02/10/2026) |
| Documentos órfãos | **37** (39 arquivos no bucket − 2 anexados) |
| **Cobertura documental global** | **2 de 2.602 = 0,08%** |

## 2026 (o ano inteiro; as saídas "não pagas" são os previstos até dezembro)

| | Lançamentos |
|---|---|
| Total de lançamentos com data em 2026 | 3.518 |
| Entradas | 1.638 |
| Pernas de transferência | 698 |
| Saídas ainda não pagas (previsto / aguardando) | 140 |
| Saídas pagas que **dispensam** (tarifas) | 270 |
| **Saídas pagas que EXIGEM documento** | **772** |

| | Quantidade | % das que exigem |
|---|---|---|
| **Com documentação** | **2** | **0,3%** |
| **Sem documentação** | **770** | **99,7%** |
| Documentos órfãos | 37 | — |

### Por mês de 2026

| Mês | Exigem | Com documento | Cobertura | Dispensam (tarifas) |
|---|---|---|---|---|
| Janeiro | 59 | 0 | 0% | 31 |
| Fevereiro | 78 | 0 | 0% | 22 |
| Março | 72 | 0 | 0% | 28 |
| Abril | 94 | 0 | 0% | 32 |
| Maio | 94 | 0 | 0% | 34 |
| Junho | 81 | 0 | 0% | 33 |
| Julho | 93 | 0 | 0% | 36 |
| Agosto | 99 | 0 | 0% | 33 |
| Setembro | 99 | 2 | 2,0% | 21 |
| Outubro (1–3) | 3 | 0 | 0% | — |

## Quanto o material que já existe pode mover o número

Medido nesta análise (cada item é estimativa baseada em medição; nada foi gravado):

| Fonte | Lançamentos cobertos | Cobertura 2026 resultante |
|---|---|---|
| Hoje | 2 | 0,3% |
| + **18 vínculos automáticos** aprovados (órfãos) | + 18 | 20 / 772 = **2,6%** |
| + **fila de revisão** (10 arquivos → 11 lançamentos) | + 11 | 31 / 772 = **4,0%** |
| + **compras parceladas** (5 NF-e → 24 parcelas pagas; o mesmo documento em todas) | + 24 | 55 / 772 = **7,1%** |
| + Del Castilho (3 lançamentos; 1 saída com documento) | + 1 | 56 / 772 = **7,3%** |
| **Teto do material que já está no sistema** | | **≈ 7%** |

**O gargalo não são os órfãos: é o hábito.** O arquivo real de agosto (103 PDFs da
tesouraria, hoje **fora** do sistema) cobriria **92 das 99 saídas que exigem documento
em agosto (93%)** — se fosse enviado à Central. É o maior ganho disponível.

## Metas sugeridas para validar a Central

| Indicador | Linha de base | Meta v1 |
|---|---|---|
| Cobertura de **agosto/2026** (reenviando o arquivo da tesouraria) | 0% | ≥ 90% |
| Cobertura de **setembro/2026** | 2,0% | ≥ 80% |
| Vínculos automáticos (sem revisão) em lote real | 54% dos órfãos | ≥ 70% |
| Órfãos no bucket | 37 | 0 (ligados ou descartados com decisão sua) |
| Tempo para anexar 100 PDFs | inviável (1 a 1) | < 15 min |
