# Central de Documentos Contábeis — Fase 1 (proposta técnica)

> **03/10/2026.** Decisões da Telma que governam esta proposta:
> Fase 1 **sem tabela nova e sem fila persistida**; upload em lote → casamento
> automático → revisão imediata → confirmação manual → gravação direta; o mesmo
> documento aparece em **todas** as parcelas; a fila de revisão fica **dentro** da
> Central. **Fase 2** (`fin_documentos_fila` ou outra persistência) só depois de uso
> real por alguns fechamentos. Números de apoio: `CENTRAL_DOCUMENTOS_CONTABEIS.md` e
> `LINHA_BASE_COBERTURA_DOCUMENTAL.md`.

## 1. O que o usuário vê

Rota **`/financas/documentos`** (a guarda de `/financas` por prefixo já a restringe a
admin/diakonia/secretaria/tesouraria). Atalhos: Auditoria de documentos, Painel da
Tesouraria, Ctrl+K.

1. **Zona de arrasto** — dezenas ou centenas de PDF, JPG, PNG e **XML de NF-e**.
   Segunda fonte, no mesmo fluxo: botão **"Arquivos soltos no armazenamento (37)"**,
   que traz os órfãos já guardados (não reenvia nada: só liga).
2. **Leitura** com barra de progresso (no navegador; OCR só nos digitalizados).
3. **Três grupos**, cada arquivo um cartão:
   - **Prontos** (≥ 85%) — já marcados; botão **"Vincular os N prontos"**.
   - **Revisar** (60–84%, divergência de valor, mais de um candidato) — **nada
     marcado**.
   - **Sem destino** — com melhores palpites; pode ser deixado de fora.
4. **Cartão de cada item**: o documento (tipo, emitente + CNPJ, nº, data, valor) com
   link para abrir o PDF · **melhor candidato** (data, fornecedor, valor, conta) ·
   **confiança %** · **motivo do casamento** por extenso · tipo do documento
   (editável) · botões **Confirmar** e **Escolher outro lançamento**.
5. **Escolher outro lançamento**: janela com busca (fornecedor, valor, data), lista
   ordenada por proximidade, mostrando se já tem documento.
6. **Compra parcelada**: o cartão mostra "5 parcelas · R$ 51,98 · mesmo documento em
   todas", com as parcelas marcadas (desmarcáveis).
7. **Rodapé fixo**: "Gravar N vínculos" · resumo · **Baixar relatório do lote**
   (CSV: arquivo, lançamento, data, fornecedor, valor, confiança, motivo, ação).
8. Após gravar: resumo e **"Desfazer este lote"** (dentro da sessão).

**Sem persistência de propósito:** o que não foi confirmado some ao fechar a aba, e
**nada se perde** — os arquivos continuam no computador (ou no armazenamento, se eram
órfãos). Aviso ao sair com itens pendentes.

## 2. Arquitetura (sem tabela nova)

| Peça | Arquivo | Papel |
|---|---|---|
| Leitura | `src/lib/documentos/leitura.ts` (puro) | texto → campos: tipo, emitente, CNPJ (≠ da igreja), nº, data de emissão, valores candidatos |
| XML | `src/lib/documentos/nfeXml.ts` (puro) | NF-e em XML: leitura **exata** (CNPJ, `vNF`, `dhEmi`, duplicatas) |
| Nome do arquivo | `src/lib/documentos/nomeArquivo.ts` (puro) | padrão `dd.mm.aaaa - R$valor _ NF _ FORNECEDOR _ PG forma` |
| Casamento | `src/lib/documentos/casamento.ts` (puro) | candidatos, confiança, motivo, parcelas, eliminação, duplicatas |
| E/S | `src/services/centralDocumentosService.ts` | carrega o pool, lê arquivo/órfão, grava, desfaz |
| Tela | `src/pages/FinancasCentralDocumentos.tsx` | zona de arrasto, grupos, cartões, seletor |

**Reaproveita sem mudar:** `fin_lancamento_anexos`, bucket `fin-comprovantes`,
`ocrService` (texto do PDF + OCR), `lib/pacoteContabil` (classificação,
`dispensaDocumento`, `auditarAnexos`), `AnexosLancamentoDialog`, `nomeExtrato`.

**Pool de candidatos:** saídas pagas dos últimos **18 meses** (as compras
parceladas de março ainda têm parcelas em setembro) **+ previstas** (a nota pode
chegar antes do pagamento), sem tarifas, com o anexo atual de cada uma. ~1.200 linhas
em memória.

**Gravação:** para cada vínculo confirmado — arquivo novo: sobe para
`{lancamentoId}/{timestamp}.{ext}` (convenção atual) e insere a linha; órfão: só
insere, apontando para o caminho que já existe. **Compra parcelada:** o arquivo sobe
**uma vez** e entram **N linhas** apontando para o mesmo caminho.

## 3. Regras de casamento (ordem de prioridade)

1. **Duplicata** — hash SHA-256 igual a anexo existente: avisa, não liga de novo.
2. **XML de NF-e** — chave, CNPJ, valor e data exatos.
3. **CNPJ do emitente → fornecedor** (88% têm CNPJ). Sem CNPJ cadastrado: nome
   aproximado, com peso menor.
4. **Valor** — o bruto **e** o líquido (total − desconto; dinheiro − troco; "valor a
   pagar" com ou sem acento). Ignora números seguidos de `%`.
5. **Data** — exata; ±1 dia; **cartão**: a data do documento é a da compra, não a da
   fatura → exige valor + fornecedor na conta do cartão.
6. **Compra parcelada** — total T e N lançamentos do mesmo fornecedor com soma = T
   (±centavos) ou cada um ≈ T/N → **1 documento, N vínculos**.
7. **Nome do arquivo**, se seguir o padrão da tesouraria — reserva e preenche
   `documento_numero`.
8. **Eliminação** — lançamento já tomado por outro arquivo sai da disputa.

**Sempre "Revisar", nunca automático:** mesmo fornecedor e dia com **valor diferente**
(caso Agrottha: R$ 5.400 × R$ 5.940), dois candidatos empatados, OCR de baixa
confiança. **Confiança** = pontuação (CNPJ 40 · valor 35 · data 20 · unicidade +5) com
penalidade quando o 2º colocado está perto — **ordena, não é probabilidade
calibrada.** A calibração vem do uso.

## 4. Mudanças em código existente

| Onde | Mudança | Por quê |
|---|---|---|
| `finService.removerAnexo` | só apaga o arquivo quando **nenhuma outra linha** aponta para o caminho | o mesmo arquivo em N parcelas; hoje apagar uma apagaria o arquivo das outras |
| `finService.excluirLancamento` / `excluirLancamentosEmLote` | idem, e **apagar os arquivos de `fin_lancamento_anexos`** do lançamento excluído (hoje só apaga o de `comprovante_url`) | fecha o vazamento que deixou os 32 órfãos e protege os parcelados |
| `ocrService` | corrigir: valor líquido, `%` lido como dinheiro, "À PAGAR", emitente de DANFE, validação do nome sugerido | defeitos medidos em documentos reais (ver `CENTRAL_DOCUMENTOS_CONTABEIS.md` §7.4) |
| `LancamentoForm` | não criar fornecedor com nome inválido ("Chave de Acesso…") | origem do cadastro contaminado |

## 5. Pacote Contábil e parcelados

O documento de compra parcelada aparece na pasta de **cada** parcela (decisão sua). O
`INDICE.csv` ganha a coluna **"Parcela"** (ex.: "5 de 10"). O download baixa o arquivo
**uma vez** e o escreve em cada pasta. Monitoramento de colisões (decisão 7): o
pacote passa a **contar e mostrar** quantos nomes foram ajustados pela regra final de
segurança.

## 6. Esforço (estimativa)

| Etapa | Dias |
|---|---|
| Leitura + XML + nome de arquivo + correções do `ocrService` | 2 |
| Motor de casamento (regras 1–8) + testes com sintéticos | 2 |
| Gravação (upload/insert), desfazer, referência por caminho em `removerAnexo`/`excluirLancamento` | 1,5 |
| Tela: arrasto, 3 grupos, cartões, seletor "escolher outro", parcelas, rodapé, CSV | 3 |
| Validação com os 39 PDFs + os 103 nomes reais (fora do repositório) | 1 |
| **Total** | **~9–10 dias** |

**Corte possível:** entregar primeiro **sem parcelados** (−2 dias) e acrescentá-los em
seguida. **Recomendo não cortar**: no cartão, **58% dos documentos de agosto são
parcelas** (11 de 19) — sem isso o cartão, que é onde a Central mais ajuda, ficaria de
fora.

## 7. Como medir o ganho

A **Auditoria de documentos** com o período **"Este ano"** é a medição oficial
(`LINHA_BASE_COBERTURA_DOCUMENTAL.md`). Linha de base: **0,3%** em 2026 (2 de 772).
Metas da v1: agosto ≥ 90% (reenviando o arquivo da tesouraria), setembro ≥ 80%,
≥ 70% de vínculos sem revisão em lote real.

## 8. Riscos e salvaguardas

| Risco | Salvaguarda |
|---|---|
| Vínculo automático errado | nada grava sem o clique em "Vincular"; motivo visível; **Desfazer este lote**; CSV do lote |
| Taxa menor em PDFs novos | os 54% automáticos vêm de 37 arquivos de 2 dias de teste; a v1 mede com uso real antes da fase 2 |
| Dependência de CDN (worker do pdf.js e dados do OCR) | já existe hoje no lançamento por NF; documentar |
| Aba fechada com revisão pela metade | aviso ao sair; nada se perde (arquivos intactos) |
| Dados pessoais em arquivos de teste | **não** versionar PDFs nem nomes reais de prestadores; fixtures sintéticos |

## 9. Fase 2 (só depois de alguns fechamentos)

Persistir a fila (`fin_documentos_fila`: arquivo, hash, dados extraídos, candidatos,
confiança, motivo, estado) para retomar revisão depois e para medir acerto ao longo do
tempo; talvez pré-leitura automática de arquivos soltos. **Não construir antes** de
ver como a v1 é usada.
