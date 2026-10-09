# Revisão: juros, multa e desconto como atributos da obrigação

Pedido da tesouraria (08/10/2026). Decisão: **uma obrigação continua sendo uma obrigação** (um documento, um boleto, uma guia, um comprovante);
juros, multa e desconto a enriquecem — não viram lançamentos independentes.

## Como era
`fin_liquidar` criava, para cada encargo, um **lançamento novo** (`componente` = juros / multa / complemento / ajuste, categorias Juros e Multas).
IPTU R$ 1.418 pago com R$ 80 de juros e R$ 40 de multa = 3 lançamentos. `desconto` e `valor_original` já eram campos do lançamento principal.

## Como fica
Um lançamento por obrigação paga:

| Campo | Significado |
|---|---|
| `valor` | o que **saiu do banco** (= o que o OFX mostra; o que mexe no saldo) = 1.538,00 |
| `valor_original` | o que o documento diz = 1.418,00 |
| `juros` · `multa` · `complemento` · `ajuste` | **novos** — 80,00 · 40,00 · 0 · 0 |
| `desconto` | já existia — 0,00 |
| `motivo_diferenca` | **novo** — obrigatório no ajuste manual |

Pago integralmente: `valor = valor_original − desconto + juros + multa + complemento + ajuste`. Status **Pago com Diferença** (calculado pela view).
Guia, boleto e comprovante continuam presos ao **mesmo** lançamento (anexos por `lancamento_id`) e à liquidação (`fin_liquidacoes.comprovante_url`).
Baixa parcial segue dividindo a obrigação: o que falta continua previsto — isso é o saldo da dívida, não um encargo.

## O que NÃO muda
- A assinatura de `fin_liquidar` (o app continua mandando `p_encargos`), a tabela `fin_liquidacoes` (o ato de pagar, que casa com o OFX), o gatilho de saldo,
  o enum de status e o diálogo "Qual o motivo da diferença?" (Juros · Multa · Juros e Multa · Desconto · Ajuste Manual). **Nenhum arquivo do app precisou mudar.**

## O que muda no banco (migration `20261008200000`, NÃO aplicada)
1. 5 colunas novas em `fin_lancamentos`.
2. `fin_liquidar` grava os encargos NO lançamento do documento (recusa encargo que não aponte para um documento da mesma liquidação, ajuste sem motivo e soma que não fecha).
3. `vw_fin_obrigacoes` lê as colunas (e soma o legado, se sobrar).
4. Os 2 lançamentos de encargo que existem em produção (juros R$ 1,86 · Localiza; multa R$ 12,50 · Prefeitura 1/3) são incorporados ao documento. Saldos não mudam.

Ordem: `ENCARGOS_NA_OBRIGACAO_ENSAIO.sql` (tudo OK) → "pode aplicar" → `ENCARGOS_NA_OBRIGACAO_APLICAR.sql`. Desfazer: `ENCARGOS_NA_OBRIGACAO_ROLLBACK.sql` (recria os lançamentos de encargo — inverso exato).

## Relatórios (sem lançamentos extras)
- Quanto pagamos de juros / multa / complemento / ajuste e quanto economizamos: `SELECT sum(juros), sum(multa), sum(desconto) FROM vw_fin_obrigacoes WHERE referencia BETWEEN … ` — painel **Liquidações e diferenças** (já existe, lê a view).
- **Prestação de Contas**: novo bloco "Juros, multas e descontos do período" — documento, valor original, juros, multa, outros, desconto, total pago, e totais. (Feito; funciona antes e depois da migration.)

## A consequência que precisa de decisão
Relatórios **por categoria** (DRE, orçamento × realizado, dashboard por categoria/centro, pacote contábil) somam `valor` por `categoria_id`. Com o encargo dentro
do lançamento, os R$ 120 de juros e multa passam a somar na categoria do documento (IPTU), e não mais em "Juros" e "Multas". Hoje o impacto é R$ 14,36
(os 2 casos existentes). Opções: **(A)** deixar nas categorias dos documentos e mostrar juros/multas como nota/linha informativa derivada dos campos
(simples, sem risco); **(B)** separar nos relatórios de categoria, subtraindo os encargos da categoria do documento e somando em "Juros" e "Multas"
(fiel ao plano de contas, mas mexe em ~10 consultas).

## Testes
Postgres real (embedded-postgres), 18 conferências: modelo antigo → migration → 1 lançamento com juros/multa; view idêntica antes e depois; saldo idêntico; pagamento a maior,
desconto, baixa parcial com juros, dois documentos, recusas (ajuste sem motivo, soma que não fecha, encargo fora da liquidação), relatórios, e rollback sem perder um centavo.
