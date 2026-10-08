# Parecer — `fin_recalc_saldo_conta` e a corrida em `saldo_atual`

Data: 08/10/2026. **Classificação do risco: BAIXO** (probabilidade baixa, impacto visível mas autocorrigível). **Existe**, é reproduzível, e a correção custa uma linha.

## 1. Como o saldo é calculado hoje

Fonte: `supabase/baseline/schema.sql` (a função) e `20261008150000_fin_saldo_so_quando_o_saldo_muda.sql` (o gatilho, já aplicado). *Não consegui ler a função direto do banco de produção; `docs/PARECER_SALDO_AUDITORIA.sql` imprime o corpo que está lá e confirma que é igual ao do repositório.*

| Pergunta | Resposta |
|---|---|
| Recalcula pela soma completa? | **Sim.** `saldo_atual = saldo_inicial + Σ(entrada − saída)` de todos os lançamentos `realizado`/`conciliado` da conta, a cada disparo. |
| Incrementa/decrementa? | Não. |
| UPDATE com leitura prévia? | Um `UPDATE fin_contas SET saldo_atual = … (SELECT SUM …)` — a leitura está **dentro** do mesmo comando. |
| Bloqueio da linha da conta? | Só o **implícito do UPDATE** (trava a linha até o fim da transação). Não há `SELECT … FOR UPDATE`. |
| Transação serializada? | Não. É `READ COMMITTED`, o padrão do Supabase. |
| Gatilho? | Sim: `fin_lanc_saldo` (AFTER, **por linha**, em INSERT/UPDATE/DELETE de `fin_lancamentos`; hoje só quando a linha conta no saldo) e `fin_contas_saldo_inicial` (ao mudar `saldo_inicial`). `SECURITY DEFINER`. |

## 2. Existe o cenário "A e B terminam com sucesso, mas `saldo_atual` tem só uma"? — **Sim**

1. A grava o lançamento A; o gatilho dele faz o UPDATE da conta (trava a linha) e o retrato dele inclui A.
2. B grava o lançamento B; o UPDATE do gatilho dele **espera** o travamento. O retrato desse UPDATE foi tirado quando ele começou — antes de A confirmar.
3. A confirma. B continua. No `READ COMMITTED` o Postgres reavalia a **linha** travada, mas **não** refaz a subconsulta `SUM` com retrato novo. A soma de B não vê A.
4. B confirma gravando `saldo_inicial + (o que existia + B)`. **Os dois lançamentos existem; `saldo_atual` ficou sem A.**

**Medido em Postgres 18 real** (`docs/PARECER_SALDO_CORRIDA_REPRODUCAO.mjs`; a produção é Postgres 15/17, com a mesma semântica):

| Teste | Função atual | Função corrigida |
|---|---|---|
| A(100) e B(50) ao mesmo tempo, conta com saldo inicial 1 | guardado **51**, devido 151 — 5 de 5 tentativas | guardado 151 — 0 de 5 |
| 200 gravações simultâneas (8 conexões) na mesma conta | guardado **200**, devido 201 | guardado 201 |
| Deadlocks/erros | — | **0** |
| Depois do próximo lançamento na conta | corrige sozinho (recálculo completo) | — |

## 3. Impacto

- **O que fica errado:** só o número `saldo_atual` (cartões de saldo, "caixa disponível", projeções que partem dele). Lançamentos, extratos, DRE, relatórios por soma e a Mesa **não** são afetados.
- **Duração:** até o próximo lançamento `realizado`/`conciliado` da mesma conta. Em conta parada pode ser dias.
- **Probabilidade:** exige duas transações na **mesma conta** com o UPDATE de uma começando dentro da janela entre o UPDATE e o commit da outra — milissegundos num lançamento avulso. A janela **cresce** com operações em massa: um INSERT/UPDATE/DELETE de N linhas dispara N recálculos de uma varredura da conta (~39 mil linhas no Bradesco) antes de confirmar, segurando o travamento por segundos. Com um tesoureiro principal e poucos usuários, o encontro é raro; duas abas da mesma pessoa e a Mesa de Conciliação em lote são os caminhos plausíveis.
- **O app em si não paraleliza escritas** (os `Promise.all` de `finService`/`importacaoOfxService` são leituras): hoje a corrida só vem de **abas/usuários diferentes**.

## 4. A Auditoria do Extrato detecta sempre? — **Não "sempre"**

- Detecta **na conta auditada, quando é executada**: ela compara `saldo_atual` com saldo anterior + soma dos lançamentos (`conferenciaDaLeitura`) e avisa "A leitura dos lançamentos do sistema não fecha com o saldo guardado". Para a **conta de aplicação** o aviso não é exibido.
- A **Conferência diária do R$ 1,00** parte de `saldo_atual` para reconstruir os saldos dos dias; com `saldo_atual` errado ela mostra um desvio **falso** do mesmo valor perdido, no primeiro dia da janela. Passa a ser confiável depois da correção.
- Para olhar **todas as contas de uma vez**: `docs/PARECER_SALDO_AUDITORIA.sql` (só leitura).

## 5. Menor correção

`supabase/migrations/20261008190000_fin_recalc_saldo_serializa_por_conta.sql`: um `SELECT 1 … FOR NO KEY UPDATE` na linha da conta **antes** do UPDATE. A espera passa para esse comando; o UPDATE seguinte começa com retrato novo e enxerga A. Mesma tabela, fórmula e assinatura; nenhum dado muda; sem coluna nova. `NO KEY UPDATE` é o mesmo nível que o UPDATE já pedia — não bloqueia a checagem de chave estrangeira de quem insere lançamentos (por isso, 0 deadlocks no teste). Reversível: `docs/PARECER_SALDO_ROLLBACK.sql`.

Alternativas descartadas: `SERIALIZABLE` (exige repetir transações no app); saldo incremental (+/−) em vez de soma (reescreve a regra de saldo e perde a autocura); `LOCK TABLE` (bloqueia a tela inteira).

**Sequência sugerida:** `PARECER_SALDO_AUDITORIA.sql` → (se houver conta divergente, `SELECT public.fin_recalc_saldo_conta('<id>')` conserta) → "pode aplicar" → aplicar a migration → rodar a auditoria de novo (a linha "função no banco" deve dizer "JÁ TRAVA").

## 6. Relação com o índice único do Invest Fácil

São independentes: o índice impede a transferência em dobro; esta correção impede o saldo escorregar quando duas gravações boas acontecem juntas. As duas podem ser aplicadas em qualquer ordem.
