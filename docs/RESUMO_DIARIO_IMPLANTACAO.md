# Resumo diário da Tesouraria — Fase 1: como colocar no ar (22/10/2026)

O código está pronto e testado, mas **nada disto foi aplicado, implantado nem publicado**. Aplicada a migration, **nada é enviado**: o resumo diário nasce **desligado** e só você o liga.

## O que a Fase 1 entrega

O e-mail diário da Tesouraria com os **dados de pagamento** (sem anexos): favorecido, valor, vencimento, **linha digitável**, **Pix** e **de onde veio cada dado**.

| Ordem do meio de pagamento | Como aparece |
|---|---|
| 1. Linha digitável do documento | 🧾 Linha digitável do documento |
| 2. Pix do documento | 💳 PIX do documento |
| 3. Pix do cadastro do favorecido (só quando o favorecido está **ligado** à obrigação) | 👤 PIX do cadastro do favorecido |

Seções do e-mail:

1. **Para pagar** — com meio de pagamento e documento coerente. Atrasadas primeiro. Mostra "ATRASADO há Nd" ou "vence hoje".
2. **⚠ Conferir antes de pagar** — o valor ou o código do documento **não bate** com a obrigação. O código **não vem** no e-mail.
3. **❓ Sem linha digitável nem Pix** — pagar pelo documento (no DiakoniaApp). Nesta fase os documentos ainda **não** vão anexados.
4. **🔒 Pagamentos sigilosos** (prebenda, folha, Sustento, RPA) **também vão**: seguem as mesmas regras dos demais (pagar, conferir, sem meio), vêm marcados "🔒 sigiloso" e o e-mail avisa "não encaminhe este e-mail". A tela tem a opção **"Incluir os pagamentos sigilosos"** (ligada por padrão) para tirá-los se um destinatário não deve ver remuneração; desligada, eles ficam de fora e o e-mail traz só a contagem.

Regras de quem entra: saída **prevista**, vencida ou vencendo hoje (mais os dias à frente que você escolher); **fora**: pagamento automático (débito, Pix recorrente, transferência programada) e reembolso. Quem **recebe** remuneração por esse e-mail é a lista de destinatários: confira se todos devem ver prebenda, folha e Sustento. O palpite de favorecido **pelo nome não existe** no envio automático (no manual a tesoureira confirma na tela; aqui não há quem confirme).

**Contra o pagamento em duplicidade:** cada obrigação listada é registrada; o e-mail seguinte marca **"↻ já enviado em dd/mm — confira se já foi pago"**. Um novo disparo em menos de 20 minutos é recusado (agendamento duplicado ou a URL chamada de novo).

## Ordem (importa)

1. **Banco.** Rode `supabase/migrations/20261022210000_resumo_diario_tesouraria.sql` no SQL Editor.
   - Cria o interruptor (desligado), os destinatários, o registro do que foi enviado e um job **próprio** do pg_cron (`resumo-diario`), **desligado**. O resumo semanal não é tocado.
   - Ensaio feito num Postgres local (`docs/RESUMO_DIARIO_ENSAIO.mjs`: TUDO OK). Reverter: `docs/RESUMO_DIARIO_ROLLBACK.sql`.
2. **Funções (duas).** No terminal, com o Supabase CLI logado:
   ```bash
   supabase functions deploy resumo-diario --no-verify-jwt --project-ref prjoftmlkusbjoeptabp
   ```
   ```bash
   supabase functions deploy resumo-diario-previa --project-ref prjoftmlkusbjoeptabp
   ```
   - `resumo-diario` é a que o agendamento chama (sem login). `resumo-diario-previa` é a da tela (visualizar e teste) e **exige login** — por isso sem `--no-verify-jwt`.
   - A função de envio usa os mesmos segredos que o resumo semanal (`RESEND_API_KEY`); não precisa de nada novo.
3. **Publicar o app.** A seção nova fica em *Sistema → Resumos por e-mail*, abaixo do resumo semanal.
4. **Configurar e conferir antes de ligar:** adicione os destinatários (tesoureiros do Cadastro de Pessoas que tenham e-mail), clique em **Visualizar e-mail** e em **Enviar teste para mim**. **Só então** ligue.

## Padrões que já saem escolhidos

Segunda a sexta, **7h** (Brasília), só o que vence hoje e o que está atrasado; **não envia** quando não há nada a pagar. Tudo isso se muda na tela.

## O que a Fase 1 NÃO faz (de propósito)

- **Sem anexos:** PDF resumo e ZIP dos documentos são a Fase 2. Hoje, para os itens sem linha/Pix, o tesoureiro ainda precisa consultar o documento no sistema.
- **Sem a fila "confirmar favorecido"** com tela própria (Fase 3).
- **Sem dados bancários** (continuam adiados).

## O que medi em 22/10/2026 (somente leitura)

Com os dados de hoje o e-mail traria **7 pagamentos para pagar (R$ 10.451,69), todos em atraso**, e **1 sem meio automático** (a Amil, sem documento anexado). Exemplo: `docs/EXEMPLO_RESUMO_DIARIO_TESOURARIA_2026-10-22.html`.

Atenção a dois achados nos dados:

- **A leitura de um documento pode pegar a data errada:** a fatura da Tim tem vencimento lido de 07/10, mas a obrigação vence em 20/10. O e-mail usa a **data da obrigação** para dizer o atraso e mostra a do documento numa nota.
- Dos 7 itens, 5 têm linha digitável, 2 têm só Pix do documento e **nenhum** usou o Pix do cadastro (só 15 de 333 favorecidos têm Pix cadastrado).

## Quem recebe

Uma lista própria, **separada dos perfis do resumo semanal**: pessoas do Cadastro de Pessoas com e-mail (os tesoureiros não precisam ter login). A tela busca pelo nome e adiciona; só se liga com ao menos um destinatário.
