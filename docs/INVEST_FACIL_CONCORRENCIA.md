# Invest Fácil — pontos de concorrência e quem protege cada um

Levantamento de 08/10/2026, depois do commit do "Vincular Evidência" com UPDATE condicional.
**Legenda:** 🟢 protegido pelo banco · 🟡 protegido só pela aplicação (ou pelo banco, mas só depois de aplicar a migration pendente) · ⚪ sem dano possível.

> Estado do banco hoje: o índice único `fin_lancamentos_invest_pdf_chave_uq` (migration `20261008180000`) está **escrito, testado e NÃO aplicado**.
> Enquanto não for aplicado, os itens 1 a 4 e 7 dependem só da aplicação.

| # | Cenário | Quem protege hoje | Depois do índice | Observação |
|---|---|---|---|---|
| 1 | Duas abas/usuários **confirmam a mesma linha** do PDF | 🟡 conferência da chave imediatamente antes de gravar (`like '%[invest-pdf:…]%'`); sobra a janela entre conferir e gravar | 🟢 índice recusa o 2º INSERT inteiro (23505) → "Transferência já registrada" | maior risco real |
| 2 | Duplo clique / "Confirmar todas" na mesma aba | 🟡 botões desabilitados durante a gravação + conferência do item 1 | 🟢 | em lote, linha registrada por outra aba não interrompe o resto |
| 3 | Transferência gravada pela metade (só uma perna) | 🟢 as duas pernas são **um INSERT só** (todas ou nenhuma) + conferência de 2 linhas devolvidas | 🟢 | sem mudança |
| 4 | **Vincular × Confirmar** a mesma linha em duas abas (manual × par novo) | 🟡 conferência no confirmar; o vínculo não olha | 🟢 mesma chave no mesmo conta → 23505 no INSERT ou no UPDATE | |
| 5 | **Vincular × Vincular**, chaves diferentes, mesma transferência manual (o cenário pedido) | 🟢 **UPDATE condicional** (`WHERE observacoes = valor lido`): o Postgres serializa e reavalia a condição depois de esperar o travamento; a 2ª grava 0 linhas → "alterada por outra aba — nada foi sobrescrito" | 🟢 | a regra vive no app, a atomicidade é do banco; sem migration |
| 6 | Mesma chave vinculada a **duas transferências manuais diferentes** em abas diferentes | 🟡 a classificação "uma transferência serve a uma linha" é calculada em memória por aba | 🟢 índice por (conta, chave) | |
| 7 | **Desfazer o vínculo** depois que alguém editou a observação | 🟢 desfazer condicional: só devolve o texto original se a observação ainda é a do vínculo; senão recusa e preserva a edição | 🟢 | |
| 8 | **Desfazer o par** (apagar as duas pernas) × nova confirmação ou segundo Desfazer | 🟡 `excluirLancamentosEmLote` lê e apaga em comandos separados; as FKs impedem órfãs; efeito pior: mensagem de erro, sem dado errado | 🟡 | baixa gravidade |
| 9 | **Ignorar** a mesma linha em duas abas | 🟢 `UNIQUE (conta_id, fitid)` + upsert em `fin_extrato_ignorados` | 🟢 | |
| 10 | **Ignorar × Confirmar** a mesma linha | ⚪ "já registrada" prevalece sobre "ignorada" na classificação | ⚪ | |
| 11 | **Reativar** uma ignorada que outra aba já reativou | ⚪ delete de 0 linhas mostra "não foi salvo — permissão" (mensagem imprecisa, sem dano) | ⚪ | |
| 12 | **Saldo da conta** com duas gravações simultâneas | 🔴→🟡 **risco real, reproduzido** (risco BAIXO): a função recalcula por SUM sem travar a conta antes, e a 2ª transação pode gravar um `saldo_atual` sem a 1ª. Ver `docs/PARECER_SALDO_CONCORRENCIA.md` | 🟢 com a migration `20261008190000` (pendente) | autocorrige no próximo lançamento da conta; a Auditoria do extrato acusa na conta auditada |
| 13 | **Leitura** do PDF, Auditoria e Conferência diária | ⚪ só leitura; a leitura paginada não é um retrato único, então durante uma gravação pode mostrar um instante intermediário | ⚪ | recarregar resolve |

## O que continua só na aplicação, de propósito
- Itens 8 e 11: custo de proteger no banco maior que o risco (sem dado errado).
- Item 12: depende da definição da função de saldo; ver "Para conferir" abaixo.
- A marca `[invest-pdf:…]` vive no **texto** de `observacoes`: quem apagar a observação de uma transferência tira a proteção (e o "já registrada") daquela linha. Só uma coluna própria eliminaria isso.

## Para conferir (leitura, no SQL Editor)
```sql
SELECT pg_get_functiondef('public.fin_recalc_saldo_conta(uuid)'::regprocedure);
```
Se o UPDATE do saldo usa um SUM calculado na própria instrução, duas gravações simultâneas na mesma conta podem deixar `saldo_atual` sem uma das linhas até o próximo recálculo. Se travar a linha da conta antes de somar (`SELECT … FOR UPDATE`), está protegido.
