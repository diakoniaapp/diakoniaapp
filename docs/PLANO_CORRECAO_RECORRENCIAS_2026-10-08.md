# Plano de correção — recorrências infinitas e lançamentos previstos até 2099

> 08/10/2026 · **Nada foi aplicado no banco.** O código já está corrigido; o SQL está pronto e aguarda o "pode aplicar".
> Medições feitas por leitura, com a sessão da tesouraria.

## 1. O problema, medido

| | Valor |
|---|---:|
| Lançamentos no sistema | 43.239 |
| Previstos de recorrência | 29.913 (69%) |
| …a mais de 12 meses de hoje (até dez/2099) | **29.460** |
| …dentro dos próximos 12 meses | 453 |
| Recorrências | 37 (34 com `data_fim = 2099-12-31`, 3 com data real, 0 parcelamentos entre as 34) |
| Conta onde estão | 100% no Bradesco |
| Previstos com anexo ou rateio ligado | 0 |
| Previstos além de 12 meses que são parcela de parcelamento | 0 |
| Previstos além de 12 meses sem vínculo com recorrência | 0 |

## 2. Três causas encadeadas

1. **Marcador de "sem fim" tratado como data real.** O legado gravou `data_fim = 2099-12-31` para "sem fim". O gerador novo (06/10) leu isso como data final e criou ≈ 880 previstos por recorrência (mensal até dez/2099), nos dias 06 e 07/10.
2. **Gatilho de saldo caro demais.** `fin_atualiza_saldo` chama `fin_recalc_saldo_conta` — um `SUM` sobre **todos** os lançamentos da conta — a cada INSERT, UPDATE e DELETE **por linha**, inclusive de lançamento previsto, que não entra no saldo (`saldo_atual = saldo_inicial + Σ realizado/conciliado`). Gerar, editar ou apagar 880 previstos = 880 varreduras de uma conta de 39 mil linhas (custo quadrático).
3. **Edição propagava tudo de uma vez.** "Editar recorrência" fazia um UPDATE único sobre os centenas de previstos da série → `canceling statement due to statement timeout`.

## 3. Correção — o que já está feito (código, commitado)

| Arquivo | Mudança |
|---|---|
| `src/lib/recorrencia.ts` | `data_fim ≥ 2090-01-01` = "sem fim" (`dataFimReal`); série sem fim gera 12 meses e renova sozinha; teto de 240 ocorrências por geração. Testado (28 testes de recorrência). |
| `RecorrenciaForm`, `ResumoDaRecorrencia`, `recorrenciaService` | Não mostram nem regravam 2099 como data final; "sem data final · renova sozinho". |
| `src/services/previstosEmBlocos.ts` (commit `0081bfd`) | Propagar o modelo/forma de liquidação em blocos de 40. |

## 4. Correção — o que falta, em SQL (não aplicado)

Ordem obrigatória:

**Passo 1 — `supabase/migrations/20261008150000_fin_saldo_so_quando_o_saldo_muda.sql`**
O gatilho de saldo só recalcula quando a linha, antes ou depois, é `realizado` ou `conciliado`. O saldo resultante é idêntico; previstos deixam de custar uma varredura cada. Reduz o custo de gerar, editar e apagar previstos de ~N varreduras para zero. Risco: baixo (a regra de saldo não muda; só se pula o recálculo que daria o mesmo número).

**Passo 2 — ensaio da limpeza: `docs/LIMPEZA_RECORRENCIAS_ENSAIO.sql`**
Roda tudo e termina em `ROLLBACK`: nada fica gravado. Devolve **uma linha** com os números reais (antes/depois). Se aparecer `saldos_alterados` ≠ 0 ou erro, não aplicar.

**Passo 3 — limpeza: `supabase/migrations/20261008160000_fin_recorrencias_limpar_previstos_alem_de_12_meses.sql`**
Em uma transação:
1. seleciona os previstos de recorrência com data > hoje + 12 meses, contínuos sem data final real, sem parcela, sem anexo/rateio/folha/fiscal/estoque/arrecadação ligados;
2. trava de segurança: aborta se passar de 35.000 linhas;
3. copia as linhas para `fin_lancamentos_previstos_backup_20261008` (RLS ligada, sem acesso do app) — restaurável com um `INSERT … SELECT`;
4. apaga;
5. as 34 recorrências perdem o `2099-12-31` (viram "sem data final") e `ultimo_gerado_ate` volta ao último previsto que sobrou;
6. confere que nenhum `saldo_atual` mudou — se mudar, aborta e desfaz tudo.

## 5. Simulação do impacto (medida; a execução real é o ensaio do passo 2)

| | Antes | Depois | Variação |
|---|---:|---:|---:|
| Lançamentos no sistema | 43.239 | ≈ 13.779 | **−68%** |
| Previstos de recorrência | 29.913 | ≈ 453 | −98,5% |
| Lançamentos do Bradesco | ≈ 39.200 | ≈ 9.800 | −75% |
| Previsto mais distante | 30/12/2099 | ≈ out/2027 | — |
| Recorrências com `data_fim = 2099-12-31` | 34 | 0 | — |
| Saldos das contas | — | **idênticos** | 0 |
| Lançamentos realizados/conciliados/manuais/importados | — | **intactos** | 0 |

Linhas de leitura medidas hoje (referência): extrato do Bradesco, 1.000 linhas: 90–123 ms; contagem de previstos: 755 ms (cai com o volume); a lentidão grave estava nas **escritas** (geração, edição, exclusão), não na leitura simples.

## 6. Riscos e como estão cobertos

| Risco | Cobertura |
|---|---|
| Apagar algo que importa | Só `previsto` + `origem = recorrencia` + sem vínculo; cópia de segurança antes; trava de 35.000; ensaio com ROLLBACK. |
| Saldo mudar | Previsto não entra no saldo; o script compara `saldo_atual` antes/depois e aborta. |
| Recorrências voltarem a gerar 2099 | `data_fim` das 34 vira NULL; o código trata 2090+ como "sem fim" mesmo se o valor reaparecer. |
| A limpeza estourar o tempo limite | Aplicar o passo 1 antes: sem recálculo por linha, apagar ~29 mil linhas é uma operação simples. |
| Perder previstos legítimos dos próximos 12 meses | Ficam: o corte é depois de hoje + 12 meses. |

## 7. Depois de aplicar

1. Abrir "Recorrências": devem aparecer como "sem data final · lançamentos até ≈ out/2027 (renova sozinho)".
2. Editar uma recorrência: não deve mais dar timeout.
3. Se algo estiver errado, restaurar: `INSERT INTO fin_lancamentos SELECT * FROM fin_lancamentos_previstos_backup_20261008;` (depois do passo 1, é rápido).
4. Quando tudo estiver estável (sugestão: 30 dias), apagar a tabela de backup.

## 8. Para você conferir (não mexi)

Há recorrências que parecem **duplicadas** (mesmo favorecido, mesma descrição, mais de um cadastro): Verisure (2 cadastros, um sem nenhum lançamento próprio), Light (2 iguais), Prefeitura (2, um com data final 06/11/2026) e Lúcio Paulo (2, dias 5 e 15 — pode ser legítimo). Se forem duplicatas, o próprio gerador já evita criar o mesmo lançamento duas vezes, mas vale excluir o cadastro repetido.
