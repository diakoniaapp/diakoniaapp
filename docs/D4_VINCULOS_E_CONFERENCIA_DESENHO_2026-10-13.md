# D4 — vínculos com o banco e conferência: desenho para aprovação (sem migration ainda)

13/10/2026. Pré-requisitos já no ar: D1 leve (aplicada) e `vw_fin_ciclo` (aplicada; conferida contra o aplicativo em **5.772 de 5.772** saídas reais, 0 divergências).

## O que existe hoje e o que falta
- O vínculo entre a despesa e a linha do banco é um **texto** em `observacoes` (`[ofx:FITID]`). Medido hoje: **336 linhas** com a marca (308 do OFX, 28 do PDF do Invest Fácil), **0 chaves repetidas** na mesma conta, **0 linhas com mais de uma marca**.
- "Conferida" não tem rastro: é o status `conciliado` marcado à mão (ou vindo do Omie), sem quem nem quando.

## O que propõe
1. **Tabela `fin_extrato_vinculos`**: `conta_id`, `fitid`, `lancamento_id`, `origem` (`ofx` | `pdf`), `vinculado_em`, `vinculado_por`. **Única por (conta, fitid)** — uma linha do banco liga a uma despesa só. Linha apagada leva o vínculo junto.
2. **Um gatilho em `fin_lancamentos`** que mantém a tabela a partir da marca em `observacoes` (cria ao aparecer, remove ao sumir). Assim **nenhuma tela de importação muda**: OFX, Invest Fácil, fusão e liquidação continuam escrevendo a marca, e o vínculo nasce sozinho. Se alguém tentar ligar a **mesma linha do banco a duas despesas**, o banco recusa com uma mensagem clara.
3. **Preenchimento inicial**: as 336 marcas atuais viram 336 linhas na tabela nova. **Nenhum lançamento é alterado.**
4. **Campos de conferência** em `fin_lancamentos`: `conferido_em`, `conferido_por`, `conferencia_nota` (todos nulos nos 13.147 históricos). A marcação manual passa a gravar quem e quando; desmarcar limpa. É acrescentar colunas vazias (não reescreve a tabela).
5. **`vw_fin_ciclo`** passa a ler o vínculo da tabela (mesmo resultado de hoje) e a mostrar quem conferiu.
6. **Tela**: o detalhe da despesa mostra "Conferida por … em …" e, no histórico, "Conferida (Histórico)".

## Impacto
| | |
|---|---|
| Dados existentes | **nenhum alterado**; só nascem 336 linhas numa tabela nova |
| Migration | Sim (tabela, gatilho, 3 colunas, atualização da view) |
| Reversível | Sim (remover gatilho, tabela e colunas; a marca em texto continua intacta) |
| Risco | **Médio** — o gatilho roda a cada gravação de lançamento e a regra "uma linha do banco, uma despesa" passa a ser imposta pelo banco |

## Decisões que preciso de você
- **a)** Gatilho que acompanha a marca (recomendado: nenhuma tela de importação muda) **ou** cada tela passa a gravar o vínculo (mais código, mais pontos de falha)?
- **b)** Ligar a mesma linha do banco a duas despesas: **recusar** (recomendado, é a regra I2) ou apenas avisar?
- **c)** Incluir os vínculos do PDF do Invest Fácil na mesma tabela, com `origem = pdf` (recomendado)?
