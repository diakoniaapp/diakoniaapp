# Resumo semanal configurável — como colocar no ar (22/10/2026)

O código está pronto e testado, mas **nada disto foi aplicado nem implantado** — o banco e as funções do Supabase continuam como estavam.

## Ordem (importa)

1. **Banco.** Rode `supabase/migrations/20261022200000_resumo_semanal_configuravel.sql` no SQL Editor.
   - Sozinha ela **não muda nada** do que já sai por e-mail: a função de envio que está no ar continua usando a lista antiga de destinatários e ignora as chaves novas.
   - Ensaio feito num Postgres local (`docs/RESUMO_SEMANAL_CONFIGURAVEL_ENSAIO.mjs`: TUDO OK). Reverter: `docs/RESUMO_SEMANAL_CONFIGURAVEL_ROLLBACK.sql`.
2. **Funções (duas).** No terminal, com o Supabase CLI logado:
   ```bash
   supabase functions deploy resumo-semanal --no-verify-jwt --project-ref prjoftmlkusbjoeptabp
   ```
   ```bash
   supabase functions deploy resumo-semanal-previa --project-ref prjoftmlkusbjoeptabp
   ```
   - `resumo-semanal` é a que o agendamento chama (sem login, como sempre). `resumo-semanal-previa` é a da tela (visualizar e teste) e **exige login** — por isso é implantada sem `--no-verify-jwt`.
   - Se implantar a função de envio **antes** da migration, ela recusa o envio (erro 500 "configuração ainda não existe") em vez de mandar um e-mail diferente do prometido.
3. **Publicar o app** (a tela nova em *Sistema → Resumo semanal*).

## O que muda para cada pessoa quando entrar no ar

| Quem | Antes | Depois (configuração padrão) |
|---|---|---|
| Telma (endereço fixo) | Pastoral + Secretaria + Tesouraria (uma frase cada) | Perfil **Administração**: todos os blocos, agora com os financeiros novos |
| Caio (admin) | nada | Perfil **Administração** — passa a receber o resumo completo. Para não receber: desligue a Administração ou tire o papel |
| Bruno (Tesouraria) | uma frase com 5 contagens | Contas atrasadas, Vencimentos da semana, Débitos automáticos, Reembolsos, Saldo das contas, Centros acima do orçamento |
| Lourdes (Secretaria) | só Secretaria | igual, agora em 3 blocos |
| Lucio (Pastor) | só Pastoral | igual, agora em 3 blocos |

Exemplo do e-mail novo da Tesouraria, com os números de hoje: `docs/EXEMPLO_EMAIL_SEMANAL_TESOURARIA_NOVO_2026-10-22.html`.

## O que a tela faz

- **Por perfil:** interruptor "recebe", blocos ligados/desligados, ordem (subir/descer), quem é do perfil (e quem está sem e-mail).
- **Visualizar e-mail:** monta o e-mail do perfil com os números de agora e a configuração que está na tela, mesmo sem salvar. Não envia.
- **Enviar teste para mim:** manda o e-mail, marcado `[TESTE]`, só para o e-mail cadastrado de quem está logado.
- **Quem recebe 2 perfis** recebe 1 e-mail com os blocos somados, sem repetir.

## O que ficou de fora (aparece travado na tela, "Em preparação")

Prontidão do Malote, Documentos pendentes e Recursos reservados. Dependem da regra documental e do Fundo Missionário, que o app calcula em TypeScript; reescrevê-las em SQL criaria uma segunda regra que um dia diverge da tela. Entram quando o e-mail puder ler o mesmo cálculo.

## Como as definições do e-mail batem com o painel

Conferido em 22/10/2026 contra o Painel da Tesouraria: **9 contas atrasadas, R$ 15.038,01** e **Saldo nas contas −R$ 8.403,19** (os dois números do painel). Contas atrasadas não incluem pagamento automático (esses viram "possível falha" no bloco de débitos).

## Para acrescentar um bloco no futuro

Um bloco novo ainda pede código: o número no digest SQL, a frase em `supabase/functions/_shared/resumoSemanal/blocos.ts` e a linha em `catalogo.ts`. Ligar, desligar e reordenar não pedem.
