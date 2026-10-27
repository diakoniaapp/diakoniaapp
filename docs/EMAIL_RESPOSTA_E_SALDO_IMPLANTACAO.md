# Reply-To configurável e regra do saldo nos e-mails — implantação (27/10/2026)

Fase 1 do pedido dela de 27/10/2026. Três mudanças, todas nos e-mails automáticos:

1. **O resumo diário não leva mais saldo.**
2. **O resumo semanal só mostra saldo de conta de banco se o último extrato tiver até 3 dias**; senão oculta e diz até quando vai o banco.
3. **Reply-To configurável pela igreja.** O remetente continua `Diakonia <resumo@diakoniaapp.com.br>`; a *resposta* vai para um endereço escolhido em Identidade da Igreja. Nunca `nao-responda@`.

## O que mudou no comportamento

| | Antes | Agora |
|---|---|---|
| Diário | podia trazer o saldo das contas | **nunca** traz (só volta se a configuração tiver `incluir_saldos: true`, hoje ninguém tem) |
| Semanal, extrato em dia (≤ 3 dias) | total + uma linha por conta | igual |
| Semanal, extrato velho em UMA conta | total com aviso "extrato desatualizado" | **sem total** (seria soma parcial); as contas em dia aparecem; a velha diz "saldo ocultado — extrato do banco até dd/mm (há N dias)"; frase "Saldo das contas parcialmente ocultado…" |
| Semanal, TODAS as contas de banco velhas | total com aviso | "Saldo das contas ocultado. Última atualização bancária: dd/mm/aaaa." + "Os saldos foram ocultados para evitar interpretações baseadas em dados desatualizados." |
| Conta de banco sem nenhum extrato, ou sem como conferir a data | saldo mostrado | ocultado, com o motivo |
| Caixa físico (sem extrato) | mostrado | mostrado sempre |
| Responder ao e-mail | voltava para `resumo@` (caixa desconhecida) | vai para o Reply-To; o rodapé convida a responder |
| Sem Reply-To configurado | — | e-mail sai como sempre e o rodapé pede para **não** responder |

**A regra é por conta**, não geral: o Bradesco pode estar velho e o Bradesco Investimento em dia.
**"Última atualização bancária" é só a data** (dd/mm/aaaa): o banco de dados guarda a data do último movimento do extrato, não a hora.

**Ordem do endereço de resposta:** `identidade_igreja.email_resposta` ("Responder para") → `email_contato` → nenhum.

## Ordem de implantação

1. **Aplicar a migration** `supabase/migrations/20261027120000_email_resposta_da_igreja.sql` (uma coluna opcional; nada muda enquanto estiver vazia). Reverter: `docs/EMAIL_RESPOSTA_ROLLBACK.sql`.
2. **Publicar o app** (o campo "Responder para" aparece em Identidade da Igreja quando a coluna existe).
3. **Reimplantar as funções** (precisam do token do Supabase; o app usa o terminal, nunca o chat):

   ```
   supabase functions deploy resumo-diario --no-verify-jwt --project-ref prjoftmlkusbjoeptabp
   supabase functions deploy resumo-semanal --no-verify-jwt --project-ref prjoftmlkusbjoeptabp
   supabase functions deploy resumo-diario-previa --project-ref prjoftmlkusbjoeptabp
   supabase functions deploy resumo-semanal-previa --project-ref prjoftmlkusbjoeptabp
   supabase functions deploy visitante-mensagem-teste --project-ref prjoftmlkusbjoeptabp
   ```

   `alerta-ata-atrasada` e `alerta-visitante-esfriando` também ganharam o Reply-To, mas **o repositório não registra com que flag foram implantadas nem como o agendamento as chama**. Reimplantar sem `--no-verify-jwt` liga a verificação de login e poderia fazer o agendamento receber 401. **Confirmar antes** (Dashboard › Edge Functions › cada uma › "Verify JWT") e reimplantar com a mesma configuração. Se preferir, deixe para depois: sem a troca, os dois alertas continuam saindo como hoje (só não ganham o Reply-To nem a nota no rodapé).
4. **Preencher "Responder para"** em Identidade da Igreja (exemplos dela: `tesouraria@qibrj.org.br`, `administracao@qibrj.org.br`, `telma@diakoniaapp.com.br`).

## Como testar a resposta

1. Em **Resumo diário** (ou semanal) use **Enviar teste** para o seu e-mail.
2. No Gmail, clique em **Responder**: o campo "Para" deve mostrar o endereço de "Responder para", **não** `resumo@`.
3. Apague o campo, salve e envie outro teste: o rodapé deve pedir para não responder.

## O que ainda não se sabe

- **Se `resumo@diakoniaapp.com.br` tem caixa.** O MX do domínio entrega no Google Workspace (medido em 27/10/2026); só se descobre enviando uma mensagem para esse endereço. Com o Reply-To configurado, a dependência some.
- O repositório não tem como saber se alguém respondeu a um resumo antigo.

## Testes

`src/lib/emailReplyTo.test.ts` (ordem do endereço, coluna ausente, erro de rede, nota do rodapé, contrato das 7 funções: usam o remetente central, leem o Reply-To e nenhum `nao-responda@` no código), `src/lib/resumoExtratoDasContas.test.ts` e `src/lib/resumoSemanalConfig.test.ts` (regra dos 3 dias, ocultação total e parcial, diário sem saldo).
