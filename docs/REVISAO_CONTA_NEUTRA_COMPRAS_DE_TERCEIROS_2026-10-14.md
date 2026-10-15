# Conta neutra "Não Aplicável (Compras Pagas por Terceiros)" — revisão (14/10/2026, NADA aplicado)

> Decisão da Tesouraria: oferta não passa por banco, caixa, aplicação nem cartão, então **não se liga a conta financeira**.
> Arquivos: migrations `20261016140000_fin_conta_nao_aplicavel_tipo.sql` (passo 1) e `20261016140100_fin_conta_nao_aplicavel.sql` (passo 2) · `docs/CONTA_NEUTRA_APLICAR_1.sql` · `docs/CONTA_NEUTRA_ENSAIO.sql` · `docs/CONTA_NEUTRA_APLICAR_2.sql` · `docs/CONTA_NEUTRA_ROLLBACK.sql`.

## 1. Por que existe (o defeito)

A obrigação é uma linha de `fin_lancamentos`, e `conta_id` é obrigatório (`NOT NULL` + chave estrangeira). A oferta era registrada numa conta real (Caixinha, Bradesco…) só para satisfazer a estrutura, e aparecia na lista dela, sem efeito no saldo (que só conta `realizado` e `conciliado`).

**Medido em 14/10/2026:** nada semântico depende da conta de uma oferta. Malote: pasta "Compras ofertadas", coluna "Conta" mostra a pasta. DRE e competência: categoria e centro. Pagamento: `fin_liquidar` grava `conta_id` = a conta paga (a conta da obrigação é só a prevista).

**Alternativa descartada:** tornar `conta_id` opcional (tabela mais central: 13.939 linhas, ~15 gatilhos, 12 funções, 2 views com JOIN, centenas de usos no código).

## 2. O que muda

| Peça | O que faz |
|---|---|
| Passo 1 | `ALTER TYPE fin_conta_tipo ADD VALUE 'nao_aplicavel'` (comando próprio: valor de enum novo não se usa na mesma transação) |
| Conta | Uma linha em `fin_contas`, id fixo `00000000-0000-4000-8000-0000000000a1`: inativa, saldo zero, **não aceita receita, despesa nem transferência** |
| Restrição | `fin_contas_nao_aplicavel_chk`: só essa conta tem o tipo, e ela é sempre inativa, de saldo zero, sem aceitar movimento |
| Proteção | A conta não pode ser apagada (gatilho) |
| Trava | Gatilho em `fin_lancamentos`: na conta neutra só entra **obrigação (saída)** em `previsto`, `quitado_terceiro` ou `cancelado`. **Recusa** realizado, conciliado, entrada e transferência |
| Regra da oferta | Todo lançamento que vira `quitado_terceiro` vai para a conta neutra (o gatilho troca a conta). `fin_registrar_nf_quitada_por_terceiro` com intenção "oferta" nasce nela; reembolso e relatado seguem pedindo conta |
| Dados | A oferta existente (R$ 117,90, hoje na Caixinha) vai para a conta neutra. A mudança fica na auditoria `fin_conta_alteracoes` |

**Aplicativo:** a conta nunca aparece em seletor ou lista de contas (`listarContas` a exclui por id); o formulário "NF já quitada" esconde a conta quando a intenção é oferta (só depois de a conta existir no banco, por sondagem); o "Pagar" de uma despesa sem conta financeira pede de qual conta sai; a prestação de contas (geral e do projeto) mostra **"Compras ofertadas por terceiros — fora do caixa"** em seção própria.

## 3. Impacto esperado
Saldo de nenhuma conta muda (oferta nunca teve efeito no saldo). Lançamentos, malote, DRE e competência: iguais. Na lista da Caixinha, a oferta de R$ 117,90 deixa de aparecer. No extrato "Todas as contas" ela aparece com a conta "Não Aplicável" (sem efeito no saldo).

## 4. Ensaio (local) e em produção
Local (Postgres, esquema mínimo): ensaio, aplicação duas vezes, travas, auditoria e rollback — tudo OK. **Em produção:** rodar `CONTA_NEUTRA_APLICAR_1.sql`, depois `CONTA_NEUTRA_ENSAIO.sql` (termina em erro de propósito; a mensagem traz o resultado e nada fica gravado), depois `CONTA_NEUTRA_APLICAR_2.sql`.

## 5. Rollback
`docs/CONTA_NEUTRA_ROLLBACK.sql`: remove as travas, devolve a oferta à conta anterior (lida da auditoria), devolve a função antiga, remove a conta e a restrição. O valor do enum permanece (o Postgres não remove valor de enum).

## 6. Riscos
- A função `fin_registrar_nf_quitada_por_terceiro` é substituída (definição viva de 14/10/2026, com o projeto). O passo 2 confere a definição antes e **para** se ela tiver mudado.
- Outra migration da mesma função, aplicada depois, perderia a regra da oferta: refazer a partir da definição viva.
