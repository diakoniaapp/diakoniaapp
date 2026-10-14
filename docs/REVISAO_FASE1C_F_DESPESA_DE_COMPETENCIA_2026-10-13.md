# Fase 1C-f — Despesa de competência: a oferta passa a contar nos relatórios de despesa (para revisão, NADA aplicado)

> Regra aprovada: a compra ofertada por terceiro (`quitado_terceiro`) é **despesa da igreja**, mas **não moveu caixa nem banco**. Relatório de **competência** conta; relatório de **caixa** não. **Nenhuma linha de "receita de doação não monetária"** entra até a contabilidade definir a conta.

## Como foi feito
As definições foram **lidas do banco vivo** (13/10/2026, `pg_get_functiondef` / `pg_get_viewdef`) e **transformadas**, não redigitadas: onde o filtro de despesa era `l.status in ('realizado','conciliado')` passa a ser `… or (l.status::text = 'quitado_terceiro' and l.tipo = 'saida')`. O gerador conferiu o número de trechos trocados em cada arquivo (qualquer divergência aborta).

| Conta como despesa (competência) | Continua igual (caixa / fora desta entrega) |
|---|---|
| `fin_categoria_resumo`, `fin_categorias_ranking`, `fin_centro_resumo` (despesa por categoria e por centro) | `vw_fin_resumo_mes`, `fin_comparativo_meses`, `fin_exec_fluxo_12m` (fluxo e resultado de caixa) |
| `fin_top_fornecedores`, `fin_anomalias_mes`, `fin_alertas_centros` | `fin_exec_alertas` na parte do **saldo das contas** (só a parte do orçamento mudou) |
| `fin_exec_centros_ano`, `fin_exec_alertas` (parte do orçamento) | `fin_exec_indicadores_eclesiasticos` (só receita), `vw_sustento_conta_corrente`, saldo (`fin_recalc_saldo_conta`) |
| `vw_fin_centros_resumo` (gasto 90 dias e do mês), `vw_fin_orcamento_vs_real` | **Pauta financeira** (`montar_pauta_financeira`: mistura caixa e competência — fica para o primeiro caso real) |
| **No aplicativo:** DRE (com aviso na tela quando há ofertas), listagem de despesas de uma categoria e de um centro, gasto do mês do centro da Diaconia | **Prestação de contas** (é caixa: tem saldo), Resumo mensal por conta, Sustento |

## O que isto significa para o DRE
O **resultado do período fica menor** pelo valor das ofertas, **sem que o saldo de nenhuma conta mude** (a despesa existe; o dinheiro não saiu). A tela do DRE mostra um aviso com o valor das ofertas incluídas e o motivo. Quando a contabilidade definir a conta da doação não monetária, entra a receita correspondente numa entrega pequena e separada — a decisão é dela, não minha.

## Impacto esperado
- **Hoje não existe nenhuma oferta no banco**: todos os resultados atuais ficam **idênticos** (o ensaio compara por hash os 10 resultados e 3 controles de caixa).
- **Nenhum dado é alterado.**

## Ensaio (rodar em produção; sempre desfaz tudo)
`docs/QUITACAO_1C_F_ENSAIO.sql` confere: (1) antes e depois da migration, os 10 resultados são idênticos; (2) uma oferta sintética de **R$ 321,45** sobe **exatamente 321,45** a despesa por categoria, por centro, o ranking, o top de fornecedores e o gasto do mês do centro; (3) com a oferta no banco, o **caixa** (comparativo de meses, resumo do mês, fluxo de 12 meses e o saldo de **todas** as contas) fica **idêntico**.
Não foi possível ensaiar localmente (o banco de teste não tem essas 10 peças): o ensaio em produção é o primeiro teste de fato — por isso ele existe e por isso a aplicação só vem depois dele dar **TUDO OK**.

## Rollback
`docs/QUITACAO_1C_F_ROLLBACK.sql` devolve as 10 definições ao que eram (lidas antes da mudança). Ofertas deixam de entrar nas despesas; nada mais muda.
