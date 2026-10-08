# Plano de correção — recorrências infinitas e lançamentos previstos até 2099

> 08/10/2026 · **Nada foi aplicado no banco.** O código já está corrigido; o SQL está pronto e aguarda revisão e o "pode aplicar".
> Todos os números abaixo foram medidos por leitura, com a sessão da tesouraria, no fim do dia 08/10.

## 0. Resumo para a decisão

### O que a limpeza faz (e o que não faz)

| | Quantidade |
|---|---:|
| **Lançamentos removidos** (previstos de recorrência a mais de 12 meses, até dez/2099) | **29.460** |
| **Recorrências afetadas** | **33 de 37** |
| Lançamentos no sistema antes | 43.272 |
| **Lançamentos que permanecem** | **13.812** (−68%) |
| Previstos de recorrência que permanecem (próximos 12 meses) | 448 |
| Realizados, conciliados, manuais, importados e transferências apagados | **0** |
| Saldos alterados | **0** (verificado dentro da transação; se mudar, aborta) |

As 4 recorrências **não afetadas**: 1 parcelamento (não mexemos em parcelas), 1 contínua com data final real (06/11/2026), 1 sem data final que já só tem 13 previstos, e 1 cadastro repetido (Verisure) que não tem lançamento próprio.

### Por conta financeira

| Conta | Lançamentos antes | Removidos | Depois |
|---|---:|---:|---:|
| Bradesco | 39.226 | 29.460 | 9.766 |
| Caixa de Envelopes | 1.881 | 0 | 1.881 |
| Caixa de Aplicação | 962 | 0 | 962 |
| Caixinha Administrativo | 819 | 0 | 819 |
| Cartão de Crédito | 381 | 0 | 381 |
| Poupança | 3 | 0 | 3 |
| **Total** | **43.272** | **29.460** | **13.812** |

Todas as 37 recorrências do sistema são da conta Bradesco; por isso só ela é afetada.

### Por tipo de recorrência

| Tipo | Frequência | Recorrências | Afetadas | Lançamentos removidos |
|---|---|---:|---:|---:|
| Contínua | mensal | 36 | 33 | 29.460 |
| Parcelamento | mensal | 1 | 0 | 0 |

Cada uma das 33 afetadas perde ≈ 866 previstos (uma tem 1.732 — veja §8) e fica com 12 ou 13 dentro dos próximos 12 meses.

### Impacto esperado na performance (estimativa a partir de medições)

| | Hoje | Depois |
|---|---|---|
| Gerar, editar ou apagar previstos de uma recorrência | cada linha varre a conta inteira (≈ 0,3 a 1 s por linha; 866 linhas ≈ 5 a 15 min, contra um limite de ~8 s) → **timeout** | **sem recálculo de saldo** (migration 1): milissegundos |
| Linhas do Bradesco | 39.226 | 9.766 (−75%) |
| Contagem/varredura da conta (medido hoje: 0,7 s para 39 mil linhas) | 0,7 s | ≈ 0,2 s (estimativa proporcional) |
| Telas que paginam a conta inteira (1.000 linhas por requisição) | ≈ 40 requisições | ≈ 10 |
| Previsão de caixa / listas de previstos | ≈ 29.900 previstos | ≈ 450 |

**Atenção:** os números "depois" são estimativas por proporção; a medição real só existe após aplicar. Os valores de "hoje" foram medidos (extrato de 1.000 linhas: 90–123 ms; contagem exata de 39 mil linhas: 719 ms; 9.318 realizados/conciliados: 1,2 s).

**Gargalo que continua:** o gatilho ainda recalcula o saldo a cada lançamento **realizado/conciliado** (≈ 9.300 linhas varridas por confirmação na Mesa). É o próximo candidato (saldo incremental ou índice), mas é uma mudança de outro risco e **não faz parte deste pedido**.

## 1. O problema, medido

| | Valor |
|---|---:|
| Previstos de recorrência | 29.908 (69% dos lançamentos) |
| …a mais de 12 meses de hoje (até dez/2099) | **29.460** |
| …dentro dos próximos 12 meses | 448 |
| Recorrências | 37 (34 com `data_fim = 2099-12-31`; nenhuma delas parcelamento) |
| Previstos com anexo ou rateio ligado | 0 |
| Previstos além de 12 meses que são parcela | 0 |
| Previstos além de 12 meses sem vínculo com recorrência | 0 |
| Lançamentos não-previstos além de 12 meses | 4 (outra origem; **não** são tocados) |

## 2. Três causas encadeadas

1. **Marcador de "sem fim" tratado como data real.** O legado gravou `data_fim = 2099-12-31` para "sem fim". O gerador novo (06/10) leu isso como data final e criou ≈ 866 previstos por recorrência.
2. **Gatilho de saldo caro demais.** `fin_atualiza_saldo` chama `fin_recalc_saldo_conta` — um `SUM` sobre **todos** os lançamentos da conta — a cada INSERT, UPDATE e DELETE **por linha**, inclusive de previsto, que não entra no saldo (`saldo_atual = saldo_inicial + Σ realizado/conciliado`). Custo quadrático.
3. **Edição propagava tudo de uma vez.** "Editar recorrência" fazia um UPDATE único sobre as centenas de previstos → `statement timeout`.

## 3. Correção — o que já está feito (código, commitado)

| Arquivo | Mudança |
|---|---|
| `src/lib/recorrencia.ts` | **`data_fim ≥ 2090-01-01` = "sem fim"** (`dataFimReal`); série sem fim gera só os próximos 12 meses e renova sozinha; teto de 240 ocorrências por geração. Testado. |
| `RecorrenciaForm`, `ResumoDaRecorrencia`, `recorrenciaService` | Não mostram nem regravam 2099; "sem data final · renova sozinho". |
| `src/services/previstosEmBlocos.ts` | Propagar o modelo/forma de liquidação em blocos de 40. |

## 4. Correção — o que falta, em SQL (não aplicado)

Todos validados quanto à **sintaxe** com o analisador oficial do PostgreSQL (libpg-query) e quanto à **existência** das tabelas e colunas no banco real (consulta de leitura). A execução em si ainda não foi feita — o ensaio é o primeiro teste de verdade.

| Ordem | Arquivo | O que faz | Grava? |
|---|---|---|---|
| 1 | `supabase/migrations/20261008150000_fin_saldo_so_quando_o_saldo_muda.sql` | O gatilho só recalcula o saldo quando a linha, antes ou depois, é `realizado`/`conciliado`. Previsto não recalcula. | sim (troca uma função) |
| 2 | `docs/LIMPEZA_RECORRENCIAS_ENSAIO.sql` | Roda tudo e termina em **`ROLLBACK`**. Devolve o JSON com o resumo desta seção e as verificações. | **não** |
| 3 | `supabase/migrations/20261008160000_fin_recorrencias_limpar_previstos_alem_de_12_meses.sql` | A limpeza definitiva (idêntica ao ensaio, terminando em `COMMIT`). | sim |
| — | `docs/LIMPEZA_RECORRENCIAS_ROLLBACK.sql` | Desfaz a limpeza a partir do backup. **Só se necessário.** | sim |

### O que o SQL da limpeza faz, na ordem

0. **Aborta** se a migration 1 não estiver aplicada.
1. Fotografa o que não pode mudar: saldo de cada conta, e quantidade e soma dos lançamentos não-previstos por conta.
2. Seleciona os alvos: `status = previsto`, `origem = recorrencia`, data depois de hoje + 12 meses, sem parcela, de recorrência contínua sem data final real, **sem** anexo, rateio, folha, fiscal, estoque nem arrecadação ligados.
3. **Trava:** aborta se passar de 35.000 linhas.
4. Calcula o **resumo** (o das tabelas da §0) antes de apagar.
5. **Backup:** copia os lançamentos para `fin_lancamentos_previstos_backup_20261008` e **todas as recorrências** para `fin_recorrencias_backup_20261008` (RLS ligada, sem acesso do app).
6. Apaga.
7. As recorrências sem fim perdem o `2099-12-31` (viram NULL) e `ultimo_gerado_ate` volta ao último previsto que sobrou.
8. **Verificações — qualquer diferença aborta e desfaz tudo:** nenhum saldo mudou; a quantidade e a soma dos lançamentos não-previstos por conta são idênticas; o total de lançamentos é exatamente o esperado.

## 5. Plano de rollback

| Situação | O que fazer |
|---|---|
| A transação aborta (trava, saldo, verificação) | **Nada a fazer**: tudo é desfeito automaticamente; nada foi apagado. |
| Aplicou e viu algo errado | Rodar `docs/LIMPEZA_RECORRENCIAS_ROLLBACK.sql`: reinsere os lançamentos do backup (só os que não existem; a lista de colunas é montada na hora) e devolve `data_fim`/`ultimo_gerado_ate` das recorrências. Os previstos até 2099 **voltam**, e com eles o peso — por isso só se algo indevido tiver sido apagado. |
| Quiser desfazer o gatilho | O arquivo de rollback traz, comentada, a função original `fin_atualiza_saldo()`. |
| Retenção | Manter as duas tabelas de backup por ~30 dias; depois `DROP TABLE`. |

O que a limpeza **não** apaga (e portanto não precisa de rollback): qualquer lançamento realizado, conciliado, manual, importado (OFX/Omie) ou de transferência; qualquer parcela de parcelamento; qualquer previsto com anexo/rateio/folha/fiscal/estoque/arrecadação.

## 6. Riscos e como estão cobertos

| Risco | Cobertura |
|---|---|
| Apagar algo que importa | Filtros estreitos; backup; trava de 35.000; ensaio com ROLLBACK; verificações por conta (quantidade **e** soma) que abortam. |
| Saldo mudar | Previsto não entra no saldo; o script compara `saldo_atual` e a soma por conta antes/depois e **aborta**. |
| Recorrências voltarem a gerar 2099 | `data_fim` vira NULL; o código trata 2090+ como "sem fim" mesmo se o valor reaparecer. |
| A limpeza estourar o tempo limite | O script **exige** a migration 1 (sem recálculo por linha); ~29 mil DELETEs simples. |
| Perder previstos legítimos dos próximos 12 meses | Ficam: o corte é depois de hoje + 12 meses. |

## 7. Depois de aplicar

1. "Recorrências" deve mostrar "sem data final · lançamentos até ≈ out/2027 (renova sozinho)".
2. Editar uma recorrência: sem timeout.
3. Medir de novo (extrato do Bradesco, contagem de previstos) e comparar com a tabela de performance da §0.

## 8. Para você conferir (não mexi)

- **Título de Capitalização:** tem **duas séries** (previstos nos dias 2 e 3 de cada mês; o cadastro diz dia 3). Por isso perde 1.732 e **fica com 24** (12 extras do dia 2). Provavelmente o dia foi editado depois de gerar. Posso incluir na limpeza a remoção dos previstos cujo dia difere do da recorrência — mas prefiro tratar à parte, depois, para não misturar com esta operação.
- **Cadastros repetidos:** Verisure (2, um sem lançamento próprio), Light (2 iguais), Prefeitura (2, um com data final 06/11/2026) e Lúcio Paulo (2, dias 5 e 15 — pode ser legítimo).
