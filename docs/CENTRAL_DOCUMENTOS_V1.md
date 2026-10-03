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

## 9. Andamento (03/10/2026) — motor de leitura e casamento prontos

Primeira entrega, **sem tela e sem gravação**: dois módulos puros, com 38 testes.

- `src/lib/documentos/leitura.ts` — texto → emitente (pela chave de acesso), CNPJ,
  número, emissão/vencimento, **vários valores candidatos** (bruto, líquido, total
  pago), duplicatas. Corrige os 5 defeitos de §7.4 e mais 4 achados ao rodar nos PDFs
  reais (pagamento misto, total sozinho na linha de baixo, DANFE, NFS-e/boleto/fatura).
- `src/lib/documentos/casamento.ts` — candidatos com confiança e **motivo por
  extenso**, bandas (pronto / revisar / sem destino / duplicata), regra do cartão,
  **compra parcelada (1 documento → N lançamentos)**, divergência de valor sempre em
  revisão, empate nunca automático.

**Resultado nos 37 órfãos reais** (rodado no navegador contra produção, só leitura;
nenhum PDF nem nome real foi versionado):

| Banda | Arquivos | Conferência |
|---|---|---|
| Pronto | **25** | 17 dos 18 vínculos aprovados, **idênticos** ao aprovado; +5 "prontos" extras e +3 parcelamentos exatos — **todos** confirmados pelo arquivo real de agosto ou pela soma das parcelas. **0 falsos positivos** |
| Duplicata | 2 | as 2 cópias de anexos existentes, detectadas **sozinhas** pelo hash |
| Revisar | 5 | o 18º aprovado (OCR de baixa qualidade, candidato certo no topo) · Águas do Rio (2 lançamentos de mesmo valor) · Marcia Auxiliadora · Miranda Flores · Passarinho (falta 1 parcela) |
| Sem destino | 5 | Del Castilho (sem lançamento) · TNTINFO ×2 (parcelas = 95% da nota) · 2 documentos fracos (OCR e NFS-e) **com o melhor palpite certo** |

**Antes (análise de hoje cedo): 20 automáticos.** Agora: **25 prontos + 2 duplicatas**.
O ganho vem dos defeitos do leitor, não de afrouxar regra.

**Falta para a v1 (atualizado em §10):** nada da lista original — a tela e a gravação
entraram em 03/10/2026. A leitura de XML de NF-e ficou para a Fase 2, de propósito.

## 10. Andamento (03/10/2026, noite) — a tela está no ar: `/financas/documentos`

**O que existe:** card de Cobertura Documental como primeiro elemento (KPI oficial, trilha
0,3% → 15% → 45% → 80%, meta 80%, ideal 95%); entrada por **pasta** (arrastar ou
"Escolher pasta") ou arquivos, com PDF/JPG/PNG/XML até 5 MB; os **"arquivos soltos no
armazenamento"** como origem opcional; leitura em duas passadas (texto primeiro, OCR só
nas digitalizações); quatro grupos com filtro e contagem — ✅ Vinculação automática, ⚠
Revisão necessária, ❌ Não identificado, ↺ Já anexado; por cartão: documento lido,
melhor candidato, confiança, motivos por extenso, **Confirmar**, **Escolher outro
lançamento**, deixar de fora; parcelados com o mesmo documento em **todas** as parcelas
(cada parcela pode ser desmarcada); rodapé "Gravar N vínculos" com confirmação;
**Desfazer o último lote**; relatório do lote em CSV; aviso ao sair com trabalho não
gravado. **Nenhuma tabela nova e nenhuma fila persistida.**

**Verificado ao vivo, em produção, sem gravar documento real:**

| Verificação | Resultado |
|---|---|
| 37 arquivos soltos, lidos de ponta a ponta | **25 automáticos · 5 revisão · 4 não identificados · 3 já anexados** (a soma é 37) |
| Teste de gravação com 1 XML sintético (24 bytes) vinculado a um lançamento | anexo criado (tipo `xml`), KPI foi de 0,5% para 0,6% na hora |
| Desfazer o lote | anexos de volta a **6** (igual ao antes), pasta do lançamento vazia, 37 pastas na raiz (igual) — o arquivo solto original **nunca** é apagado pelo desfazer |
| Celular (375 px) | barra de gravação acima da navegação inferior, sem rolagem horizontal |

**Defeitos achados e corrigidos na própria verificação:** (1) a leitura começava com a
lista vazia (o espelho de estado só atualizava depois do render) — 37 arquivos presos em
"na fila"; (2) o nome de exibição dos soltos terminava em `.pdf)` e o PDF ia ao Tesseract
como imagem — `lerArquivo` agora também confia no tipo do blob; (3) a barra de gravação
`fixed` caiu no meio da lista por causa do contêiner de rolagem — virou `sticky`; (4) a
lista de "Escolher outro lançamento" abria com recorrências **previstas até 2030** —
realizados vêm antes; (5) o selo "Vinculado" saía vermelho.

**Ganchos deixados para a Fase 2 (comentados no código, nada implementado):**
leitura automática do **XML de NF-e** (`lerArquivo` hoje devolve `nao_lido` para `.xml`,
e o arquivo continua podendo ser ligado à mão); **identificação por CNPJ** do
fornecedor (o CNPJ já é lido e usado como pontuação, mas não cadastra fornecedor);
**sugestão de fornecedor, categoria e centro de custo** a partir do documento.

**Pendência conhecida, fora desta entrega:** `navConfig.test.ts` falha em
`/financas/reunioes sumiu do menu` — falha anterior a este trabalho (reproduzida com as
mudanças guardadas); o teste espera um item de menu que não existe mais.

## 11. Fase 2 (só depois de alguns fechamentos)

Persistir a fila (`fin_documentos_fila`: arquivo, hash, dados extraídos, candidatos,
confiança, motivo, estado) para retomar revisão depois e para medir acerto ao longo do
tempo; talvez pré-leitura automática de arquivos soltos. **Não construir antes** de
ver como a v1 é usada.
