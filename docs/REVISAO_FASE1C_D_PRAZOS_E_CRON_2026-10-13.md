# Fase 1C-d — Prazos derivados e realinhamento diário (para revisão, NADA aplicado)

> Pedido seu: *"Não quero depender de alguém abrir uma tela para que o sistema perceba que uma formalização expirou."* Aprovado: cron diário + visão de prazos (Vencidos, Vencem em 7 dias) na Mesa e no Painel.

## Desenho técnico (`20261015120000_fin_quitacao_prazos_e_cron.sql`)

| Peça | O que é |
|---|---|
| `vw_fin_quitacao_prazos` | **Derivada**, nada guardado. Uma linha por prazo aberto: **formalização** do Relatado (registro + 30 dias), **esclarecimento** da intenção (data da nota + 30 dias), **reembolso aprovado a pagar** (aprovação + 10 dias). Os dias são os parâmetros da Política (`fin_quitacao_parametros`). Traz `limite`, `dias_restantes` e `situacao`: `vencido`, `vence_em_7_dias` ou `no_prazo` |
| `fin_quitacao_sincronizar_agendada()` | O sincronizador **sem teste de papel** (o relógio não tem usuário), **não exposto à API** (`REVOKE` de `authenticated`). Uma obrigação que falha (ex.: período fechado) não derruba as demais |
| Job `quitacao-sincronizar` | `pg_cron` (já instalado, v1.6.4), todo dia às **09:00 de Brasília** (12:00 UTC). Só é criado se o `pg_cron` existir |
| Telas | Faixa **Prazos da Quitação** (Vencidos · Vencem em 7 dias) na **Mesa** (com lista) e no **Painel**, na seção Alertas (compacta). Some quando não há nada |

## Impacto esperado
- **Nenhum dado existente muda.** Hoje não há nenhuma quitação, então as faixas ficam vazias.
- Quando houver quitações: uma oferta aceita como Relatado cujo prazo vencer **perde a extinção sozinha** na rodada das 09:00 (volta a "Formalizar"), com o evento `extincao_desfeita` no histórico, sem ninguém abrir tela. É o comportamento que a Matriz já mandava; o cron só o torna pontual.
- O job grava só pelo sincronizador existente; o histórico registra o usuário como vazio (= sistema).

## Resultado do ensaio (banco de teste local): TUDO OK
- Nada existente mudou (hash antes/depois).
- **P1** A esclarecer há 40 dias ⇒ prazo de esclarecimento **vencido há 10 dias**. **P2** reembolso aprovado hoje ⇒ 10 dias, no prazo; com o prazo em 5 dias ⇒ "vence em até 7 dias". **P3** oferta Relatada extinta com 30 dias para formalizar; passados 40 dias ⇒ vencido; **o realinhamento diário, sem usuário, desfez a extinção** e deixou o evento. **P4** um usuário autenticado **não** consegue chamar o realinhamento.
- APLICAR duas vezes, ROLLBACK e reaplicar: ok.
- **Limite do ensaio local:** o banco de teste não tem `pg_cron`; a criação do job só pode ser provada no **ensaio em produção** (ele confere que existe exatamente 1 job `quitacao-sincronizar`). A criação é protegida: sem `pg_cron`, só emite um aviso.

## Rollback (`docs/QUITACAO_1C_D_ROLLBACK.sql`)
Remove o job, a função do relógio e a visão. Nada mais muda; a Mesa continua realinhando as ofertas ao abrir.

## Não incluído (opcional, depois)
Aviso por e-mail/WhatsApp no `resumo-semanal` com as contagens (opção D da proposta). Só se você pedir.
