# Estudo — Resumo Diário da Tesouraria (22/10/2026)

Só estudo: **nada foi implementado**. Medi no banco (somente leitura) e li o código do "Preparar envio" e da função de e-mail.

## 1. Resposta curta

**Dá para fazer, e a maior parte das peças já existe.** Mas hoje **nada disso sai sem ação manual**: o e-mail que a Tesouraria recebe é montado pelo sistema, porém **copiado e colado no Gmail por uma pessoa**, e o ZIP e o PDF resumo são gerados **no navegador, no clique**. O que falta é levar essas mesmas peças para o servidor e agendá-las.

| Pergunta | Hoje | Para o envio automático |
|---|---|---|
| Enviar e-mail sem ninguém clicar? | **Sim**, para o resumo semanal (Edge Function + Resend + pg_cron) | Reaproveita a mesma esteira |
| Enviar **ZIP** anexado? | A função de e-mail só manda HTML. O ZIP é gerado no navegador (`jszip`) | O Resend aceita anexo; falta gerar o ZIP **no servidor** (viável) |
| Enviar **PDF resumo** anexado? | Gerado no navegador (`pdf-lib`, `lib/resumoDoLotePdf.ts`) | `pdf-lib` roda no servidor (Deno) — viável |
| Enviar **dados de pagamento** (linha, Pix)? | Lidos no navegador (`dadosParaPagarDoLancamento`) a partir da leitura que **já fica guardada** no anexo (`dados_extraidos`) | Viável: lê a leitura guardada, sem reler PDF |
| Sem ação manual da Tesouraria? | Não | Sim, com as decisões da seção 6 |

## 2. O que existe e o que se reaproveita

| Peça | Onde | Serve ao diário? |
|---|---|---|
| Escolha do meio de pagamento (linha → Pix do documento → Pix do cadastro; "Confirmar favorecido") | `services/envioDePagamentosService.ts` + `lib/envioDePagamentos.ts` | Regra pronta e **pura** (a lib só depende da assinatura) — vai para `_shared`, como fiz com o resumo semanal |
| E-mail no formato dela (🧾 💳 👤, banco, linha em grupos de 5) | `lib/envioDePagamentos.ts` | Sim |
| Pix copia e cola a partir da chave do cadastro | `lib/pix.ts` (`montarPayloadPix`) | Sim (puro) |
| ZIP dossiê + `LEIA-ME.txt` | `baixarPacote` (jszip + signed URLs) | Reescrever a montagem no servidor; a regra de nomes e do que entra (`entraNoZip`, `nomeDoDocumentoNoZip`) é pura |
| `00 RESUMO.pdf` (com coluna Origem) | `lib/resumoDoLotePdf.ts` (pdf-lib) | Sim, mesma biblioteca no servidor |
| Linha digitável e Pix **já lidos** | `fin_lancamento_anexos.dados_extraidos` (gravado ao anexar, desde 06/10) | Sim — é a fonte; o servidor **não** precisa ler PDF |
| Envio, domínio verificado, agendamento | `resumo-semanal` (Resend + pg_cron) | Sim; nova função `resumo-diario` + novo job |

## 3. O que o banco tem hoje (medido em 22/10, até 31/10, sem débito automático, reembolso ou transferência)

- **12** obrigações em aberto candidatas; **8** com documento anexado; **7** com leitura guardada.
- Meio de pagamento que o e-mail traria: **5** linha digitável do documento, **2** Pix do documento, **0** Pix do cadastro do favorecido, **5 sem nenhum meio automático** (o tesoureiro pagaria pelo papel do ZIP).
- Cadastro: 333 favorecidos, só **15 com Pix** (4,5%) — por isso o terceiro nível ("👤 Pix do cadastro") ainda rende pouco.
- Conclusão: o diário **já ajuda** (7 de 12 com meio pronto), mas **5 de 12 ainda exigiriam abrir o documento**. O ganho cresce conforme os favorecidos recorrentes ganham Pix cadastrado.

## 4. Limites reais da infraestrutura

- **Anexo no Resend:** suportado (`attachments`); o limite é ~40 MB por e-mail (já em base64). Um dia típico (poucos boletos e NFs em PDF) fica muito abaixo; precisa de uma guarda: se passar de ~25 MB, manda **links** no lugar do ZIP.
- **Edge Function:** ~256 MB de memória e ~2 s de **CPU** por chamada (esperar a rede não conta). ZIP com compressão pesaria; como PDF já é comprimido, o ZIP vai **sem compressão** (`STORE`) — barato. `pdf-lib` para o resumo é leve.
- **Documentos no Storage:** bucket privado; a função com a chave de serviço baixa sem login.
- **Ler PDF no servidor** (pdf.js + QR) **não é viável/vale a pena**: o QR é decodificado desenhando a página num canvas. Por isso o diário depende da leitura **já guardada** no anexo. Item sem leitura guardada entra como "sem meio automático" (hoje: 1 de 8).
- **Link para os documentos:** o link do sistema exige login (contraria "sem acessar o sistema"). Link assinado do Storage funciona sem login, mas **quem tiver o e-mail abre o documento** até expirar. Recomendação: **ZIP anexado como padrão**; link assinado com validade curta (24–48 h) só como opção ou quando o ZIP não couber.

## 5. Riscos que a decisão precisa cobrir

1. **Pagamento em duplicidade (o maior).** O e-mail repetiria todo dia o que continua "em aberto". Se o tesoureiro pagou ontem e ninguém deu baixa no sistema (ou o OFX ainda não chegou), o e-mail de hoje o lista de novo. Hoje esse risco é contido porque **uma pessoa** monta o lote. Solução: registro "enviado em dd/mm" (migration — é o "Lote enviado" que ficou pendente) e marcar no e-mail "já enviado em 21/10 — confira se já pagou"; ou enviar cada item uma vez + lembrete.
2. **Pix do favorecido errado.** O palpite pelo nome continua **fora** do envio automático (hoje já vem desmarcado, "Confirmar favorecido"): no diário esses itens aparecem numa seção "confirmar no sistema", sem Pix.
3. **Dado divergente.** Valor ou código do documento diferente do lançamento nunca vem marcado (regra atual) — mantém.
4. **E-mail com dado de pagamento é alvo de fraude.** O domínio já está verificado (SPF/DKIM). Recomendo manter o rodapé "confira sempre valores e vencimentos antes de pagar" e **nunca** incluir dados bancários (continua adiado).
5. **Quem entra:** prebenda, folha e Sustento ficam fora por padrão (decisão dela de 20/10); reembolso, débito automático e quitado por terceiro também.

## 6. Decisões suas antes de construir

1. **Quando e quem:** horário (sugiro 7h) e dias (segunda a sexta? feriado?). Os destinatários são os **tesoureiros do Cadastro de Pessoas** (Breno, Bruno, Caio, Lúcio, Sidney), não só quem tem login — a lista passa a morar no banco.
2. **O que é "do dia":** atrasadas + vencem hoje (como o painel marca hoje), ou também a semana?
3. **Duplicidade:** registrar "enviado em" e sinalizar, ou enviar cada item só uma vez? *(recomendo registrar e sinalizar)*
4. **Documentos:** ZIP anexado (recomendado); link assinado só como opção?
5. **E-mail sem nada a pagar:** não enviar *(recomendado)* ou enviar "nada para hoje"?

## 7. Como seria (fases)

- **Fase 1 — e-mail com os dados** (sem anexo): `resumo-diario` lê as obrigações do dia, a leitura guardada e o Pix do cadastro; monta o e-mail no formato dela; configuração (liga/desliga **independente** do semanal, horário, dias, destinatários); tabela de registro.
- **Fase 2 — anexos:** PDF resumo + ZIP (sem compressão) com guarda de tamanho.
- **Fase 3 — sinalização de duplicidade e fila "confirmar favorecido"** com a tela de registro.

**Configuração independente:** hoje a tela só mexe no job do semanal (`sistema_resumo_semanal_*` procura o job por `command ILIKE '%resumo-semanal%'`). O diário nasce com **job próprio** (`resumo-diario`) e interruptor próprio; a tela ganha uma seção "Resumo diário da Tesouraria" ao lado da semanal.

## 8. O que não consegui confirmar

- O limite de tamanho e de e-mails/dia do **plano** do Resend que a igreja usa (5 destinatários por dia = ~110 e-mails/mês, cabe em qualquer plano pago e no gratuito de 3.000/mês).
- Que `jszip` e `pdf-lib` rodam na Edge Function sem ajuste — são bibliotecas comuns em Deno, mas **o ensaio** (Fase 2) é o que confirma.
