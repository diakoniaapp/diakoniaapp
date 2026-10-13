# Fase 1C-b e 1C-c — Pacote contábil e bloqueios (para revisão, NADA aplicado)

> Decisões suas já incorporadas: **A esclarecer e Formalizar bloqueiam; Reembolso a pagar e Investigar só avisam; vigência DESLIGADA por padrão** (nada bloqueia sem ativação consciente).

## 1C-b — Pacote contábil e malote (só código, sem migration)

| O que muda | Como |
|---|---|
| **Compras ofertadas** entram no ZIP | `saidasDoPeriodo` passa a incluir `quitado_terceiro` (só depois que o status existe no banco). Pasta **Compras ofertadas**, pelo **dia da nota**, com a observação "Compra ofertada por X (prova Formal/Relatada): sem pagamento da igreja" |
| **Aviso de reembolso** | Reembolso aprovado e ainda não pago entra na pasta **Reembolsos - aviso**, só informativo (nota, prova, pedido, quem aprovou). Quando for pago, entra de novo no **mês do pagamento**, com o comprovante (regra que o `fin_enviar_malote` já tinha: a oferta Pronta entra pela data da nota, o reembolso pago pela data do pagamento) |
| **PENDENCIAS_QUITACAO.csv** | Lista de tudo que está sem resposta (Investigar, A esclarecer, Formalizar, Aprovar/Pagar reembolso) com a idade da nota. Só entra no ZIP se houver algo |
| Formato antigo | Sem nenhuma quitação por terceiro, o `INDICE.csv` é o de antes (a coluna "Compras por terceiros" só existe quando há linha da Política) |

Verificação: tipos limpos; 41 testes do pacote (5 novos). Nenhum dado é alterado.

## 1C-c — Bloqueios (migration `20261015110000_fin_quitacao_bloqueios.sql`)

**Desenho técnico**
- `fin_quitacao_bloqueios(ini, fim)`: conta as despesas do intervalo com `vw_fin_quitacao.bloqueia_fechamento` (uma fonte só: a visão; que já exige vigência ligada e despesa a partir dela).
- `fin_enviar_malote`: recusa o envio do mês se houver bloqueio (defesa no servidor). O resto é idêntico ao D6.
- `fin_fechar_periodo`: recusa período com bloqueio e **carimba também as `quitado_terceiro`** (para o período fechado travá-las). Saldo final continua somando só realizado/conciliado.
- Tela: o checklist do fechamento mostra "Compras por terceiros sem resposta" (bloqueando só com a vigência ligada, senão "só aviso") e a oferta entra na conferência de categoria/centro.

**Impacto esperado:** com a vigência vazia (hoje) **nenhum malote nem fechamento muda de comportamento**. Os dados existentes não mudam.

**Resultado do ensaio (banco de teste local, cadeia 1A→M0→1B→1C-a→1C-c): TUDO OK**
- Nada existente mudou (lançamentos, ciclo, obrigações, quitações).
- C1 vigência desligada: malote enviado e período fechado mesmo com despesa A esclarecer.
- C2 vigência ligada: malote e fechamento recusados, com mensagem em português; C3 mês sem pendência passa; C4 Investigar não bloqueia.
- C5 resolvida a pendência o período fecha; a oferta e a despesa paga são carimbadas, a em aberto não. C6 a oferta de período fechado fica travada.
- **C7 fechei um mês real de teste (08/2026): a função nova carimbou exatamente os mesmos lançamentos pagos que a regra antiga carimbaria.**
- APLICAR duas vezes, ROLLBACK e reaplicar: ok. Testes da lib do checklist: 26 passam (5 novos).
- Ensaio em produção: só depois da 1A, M0, 1B e 1C-a aplicadas.

**Rollback** (`docs/QUITACAO_1C_C_ROLLBACK.sql`): devolve `fin_enviar_malote` (D6) e `fin_fechar_periodo` (Fase 6) e remove `fin_quitacao_bloqueios`. Ofertas já carimbadas por um fechamento continuam carimbadas (reabrir o período as libera).

**Para ligar a vigência** (decisão futura, sua): `fin_quitacao_parametros_alterar({"vigencia": "AAAA-MM-01"}, motivo)`, recomendado o primeiro dia do mês seguinte à aplicação. Não é feito por nenhuma migration.
