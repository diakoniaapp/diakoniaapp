# Adendo à Política de Compras por Terceiros — reembolso em espécie (28/10/2026)

**Decisão (Opção B):** o reembolso em espécie pode ser **pago sem a declaração assinada antes**. Ela passa a ser exigida **na quitação, depois de pago**.

## Antes
"Reembolso só se paga com a prova Formal": o reembolso só era aprovado e pago com a **declaração assinada** (prova da intenção) **e** a prova do pagamento do terceiro.

## Agora
| Momento | Exigência |
|---|---|
| **Aprovar e pagar** | A **prova do pagamento do terceiro** (a nota e o comprovante do que ele pagou ao fornecedor) continua obrigatória. A declaração assinada **não** é mais |
| **Pagar em espécie** (conta Caixinha/Envelopes, ou forma Dinheiro) | Pode sem a declaração assinada. O recebedor assina a **Solicitação e Recibo de Reembolso** no ato do pagamento |
| **Pagar por PIX, TED ou outra forma bancária** | O banco **recusa** se a declaração não estiver assinada **antes** (com ela assinada, qualquer forma vale, como sempre) |
| **Depois de pago** | Sem a via assinada, a despesa volta para "A formalizar" ("falta a Solicitação e Recibo assinada pelo recebedor") e, depois da vigência, bloqueia o fechamento do mês. Com a via assinada: em ordem, e não pede PIX, TED nem comprovante de banco |

## O que **não** muda
Oferta e compensação; a aprovação do reembolso (outro ato, de outra pessoa); a aprovação do Administrador **não** substitui a prova do pagamento do terceiro.

## Onde está
- Banco: `supabase/migrations/20261029100000_fin_reembolso_especie_declaracao_depois.sql` (só funções; nenhuma tabela, coluna ou dado). Rollback: `docs/REEMBOLSO_ESPECIE_ROLLBACK.sql`.
- Espelho no app: `src/lib/quitacao.ts` e o diálogo "Pagar reembolso".
- Ensaio (Postgres local): `docs/REEMBOLSO_ESPECIE_ENSAIO.mjs` — 6.000 entradas comparam a regra antiga com a nova e só diferem no caso decidido (e no texto do motivo do reembolso já pago).

## Limite do ensaio
`fin_quitacao_entrada` e `fin_liquidar_reembolso` foram ensaiadas com tabelas mínimas (criam sem erro; o bloqueio de PIX/TED foi provado). O cálculo de "obrigação paga" dentro de `fin_quitacao_entrada` não foi exercitado com dados reais.
