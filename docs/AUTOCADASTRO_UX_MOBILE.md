# AutoCadastro de Visitantes — revisão de UX (celular)

> Análise de 07/10/2026, **antes de qualquer alteração de código**. Medido em tela de 375×812
> (iPhone padrão), sem enviar nada. Nenhum campo é removido.

## 1. Como está hoje (medido)

| Medida | Valor | Leitura |
|---|---|---|
| Altura total da página | **1.461 px** (1,8 telas) | o visitante rola ~650 px sem ver o fim |
| Onde o formulário começa | **214 px** | logo + frase ocupam 26% da primeira tela; só 3 campos aparecem antes de rolar |
| Campos / controles tocáveis | 19 (6 caixas de texto, 1 select, 4 + 1 caixas de marcar, 6 botões Sim/Não, enviar) | tudo no mesmo bloco, sem agrupar |
| Fonte do `select` "Como conheceu" | **14 px** | no iPhone, fonte < 16 px faz o Safari **dar zoom** ao tocar — o visitante precisa "desafazer" o zoom |
| Caixas de marcar | 16 px (o rótulo todo é tocável: 44 px nos pedidos de oração, 21 px em "mesmo número é WhatsApp") | "mesmo número é WhatsApp" tem alvo de toque de 21 px, abaixo dos 44–48 px recomendados |
| Rolagem horizontal | nenhuma (375 = 375) | ok |
| Data de nascimento | `input[type=date]` nativo | no celular abre o seletor de roda, **lento para quem nasceu há 40 anos** (rolar por décadas) |
| E-mail | **não existe** | é um campo que você pediu para manter — hoje ele não está no formulário nem na função do banco |
| Endereço | um campo só, `autocomplete=street-address` | bom: o celular sugere o endereço salvo |
| Teclado | só o telefone usa `inputMode=tel`; nome sem `enterKeyHint` | o teclado não oferece "Próximo" |

## 2. Gargalos de preenchimento

1. **Muro único de campos.** Tudo na mesma tela, sem blocos: o olho não sabe onde termina. Formulário longo
   parado numa página só é o padrão que mais gera abandono em celular.
2. **Zoom do iOS** no select (14 px). É o atrito mais concreto: a tela "pula" e o visitante perde o lugar.
3. **Três pares Sim/Não seguidos no fim** (primeira visita, contato pastoral, informações), cada um com 2 botões
   de 147 px — repetitivos e sem relação entre si; o de "contato pastoral" não abre nada.
4. **Data nativa** com roda de seleção.
5. **Topo gasto** (214 px) antes do primeiro campo.
6. **Botão Enviar no fim de 1.461 px**: o visitante precisa rolar até achar; não há noção de "falta quanto".
7. **Validação só no envio:** o erro aparece lá embaixo, longe do campo com problema.
8. **Link com `?p=<32 caracteres>`:** feio, não se digita, e quebra se o QR for trocado e o link antigo estiver numa
   mensagem de WhatsApp.

## 3. Proposta — 3 passos curtos, nenhum campo a menos

Avaliação honesta de "3 passos" contra "página única": para **formulário com 14–18 campos em celular**, passos
curtos vencem, porque cada tela cabe inteira sem rolar (a decisão fica pequena) e o botão grande de "Continuar" fica
sempre à vista. O custo é 2 toques a mais; o ganho é não rolar, não dar zoom e saber quanto falta. Recomendo passos.
A alternativa (página única com 3 blocos rotulados) está descrita no fim, para você comparar.

**Passo 1 de 3 — Dados pessoais**
Nome\*, Telefone\* (+ "mesmo número é WhatsApp"; se desmarcar, abre WhatsApp), Nascimento, **E-mail**, Endereço.

**Passo 2 de 3 — Sobre sua visita**
Como conheceu (lista compacta). **Quem convidou?** só aparece se for "Convite de familiar ou amigo";
**Conte como foi** só aparece em "Outro". É sua primeira visita?

**Passo 3 de 3 — Oração e acompanhamento**
Pedidos de oração (4 opções; o texto só abre em "Outro"), Deseja contato pastoral?, Deseja receber informações?,
aceite da LGPD, **Enviar cadastro**.

### Regras de mobile (valem para os 3 passos)

- Todo campo com **fonte ≥ 16 px** (acaba o zoom do iOS), altura **48 px**, botões **50 px**.
- Barra inferior fixa: **Voltar** (secundário) e **Continuar** (principal, largura total) — polegar alcança.
- Barra de progresso no topo + "Passo X de 3 · nome do passo".
- Cabeçalho enxuto: logo menor, **sem a frase longa** (o "leva menos de 1 minuto" vira uma linha).
- Validação **por passo**, com a mensagem junto do campo e foco nele; o visitante não perde o que digitou.
- `inputMode` / `autoComplete` / `enterKeyHint` certos em cada campo (nome, tel, e-mail, endereço) para o teclado
  mostrar "Próximo" e o celular sugerir o que já tem salvo.
- Rascunho em `sessionStorage`: se a tela recarregar ou o visitante voltar do WhatsApp, nada se perde.
- Data de nascimento: manter o campo nativo (e a máscara `dd/mm/aaaa` digitável como alternativa — a decidir; ver §6).
- Sem rolagem horizontal; `min-w-0` nos itens flex (regra do projeto).

### Campos condicionais (nada some do cadastro, só aparece na hora certa)

| Campo | Quando aparece |
|---|---|
| WhatsApp (outro número) | desmarcou "esse número também é WhatsApp" |
| Quem convidou? | Como conheceu = Convite de familiar ou amigo |
| Conte como foi | Como conheceu = Outro |
| Texto do pedido de oração | marcou "Outro" em oração |
| **Canal e horário do contato** | marcou "Deseja contato pastoral = Sim" — **proposta nova, precisa da sua decisão** (§6) |

## 4. Protótipo conceitual

Interativo na conversa (3 passos, validação, campos condicionais, tela final). O texto da tela final:

> ✅ **Cadastro realizado com sucesso.** Seja muito bem-vindo à Quarta Igreja Batista do Rio de Janeiro.
> Foi uma alegria receber sua visita.

## 5. Impacto esperado (estimativa, não medição)

**Não existe linha de base:** o formulário nasceu em 07/10 e não há envios reais suficientes para medir taxa de
conclusão. O que está abaixo é **julgamento**, não dado.

| Mudança | Efeito esperado |
|---|---|
| Fonte 16 px no select | elimina o zoom involuntário no iPhone — efeito certo, não depende de estimativa |
| 3 passos de ≤ 6 campos, sem rolar | tela cabe inteira; progresso visível → menos abandono no meio |
| Campos condicionais | o visitante comum (não convidado, sem pedido de oração específico) vê **~5 campos a menos** que o formulário completo |
| Teclado e autopreenchimento certos | nome, telefone, e-mail e endereço podem vir do celular em 1 toque |
| Barra fixa | o botão deixa de ser "o fim da página" |
| Tempo | visitante típico: ~40–55 s (nome, telefone, nascimento, e-mail, como conheceu, oração/contato, aceite). Meta de < 1 min é realista **para quem digita rápido**; endereço digitado do zero é o trecho mais lento |

**Para medir de verdade:** registrar, sem dado pessoal, `passo_alcançado` e o tempo total. Proposta no §6.

## 6. Decisões que preciso de você

1. **Passos ou página única?** Recomendo passos (§3).
2. **E-mail** não existe hoje no formulário nem em `visitante_autocadastro`. Para incluí-lo é preciso:
   alterar a função (aceitar `email`, gravar em `membros.email` só se estiver vazio, validar formato) — **mudança
   no banco, com ensaio antes** — e o campo no formulário. Obrigatório ou opcional? (Recomendo **opcional**.)
3. **"Campos complementares" do contato pastoral.** Hoje "Deseja contato" só vira prioridade na fila. Proponho
   **Melhor forma de contato** (WhatsApp / Ligação) e **Melhor horário** (manhã / tarde / noite). Precisam de
   2 colunas em `visitante_checkins` e aparecer na fila pastoral. Aprova? Quer outros (ex.: "Quem prefere que ligue")?
4. **URL limpa.** Opções: `/visitante` (já existe; passaria a funcionar **sem** `?p=`), `/bemvindo`, `/visita`.
   Posso deixar as três apontando para o mesmo formulário e imprimir só uma no QR. Recomendo imprimir
   **`portal.diakoniaapp.com.br/bemvindo`** (curto, fácil de falar). Como o código vira interno: a função passa a
   aceitar `p_codigo` vazio e usa o **único ponto ativo**; os links antigos `?p=` continuam valendo.
   Atenção: se um dia existirem **dois pontos ativos** (ex.: duas portas), a URL sem código não saberá qual usar —
   nesse caso volta-se a `?p=` ou a `/bemvindo/porta-2`.
5. **Medir conclusão** (passo alcançado + tempo, sem dado pessoal): quer?
6. **Data de nascimento:** manter o seletor nativo ou campo digitável `dd/mm/aaaa`? (Recomendo digitável no celular;
   a roda é lenta para adultos.)

## 7. Alternativa — página única em 3 blocos

Mesmos campos, mesmos condicionais, mas uma rolagem só, com cabeçalhos DADOS PESSOAIS / SOBRE SUA VISITA /
ACOMPANHAMENTO e botão fixo "Enviar" na base. Ganha 2 toques a menos; perde a tela que cabe inteira e o
indicador "falta pouco". Mais simples de construir (metade do trabalho), menos eficaz em celular pequeno.

## 8. Plano de implementação (após aprovação)

1. SQL: `visitante_autocadastro` aceita `email`, `canal_contato`, `horario_contato` e `p_codigo` vazio; ensaio via
   API com `ROLLBACK`; só aplicar após "pode aplicar".
2. `autocadastroVisitante.ts`: tipos, `montarPedido`, `problemasDoFormulario` (e-mail), testes.
3. `VisitanteAutocadastro.tsx`: 3 passos, rascunho, barra fixa, campos condicionais, texto final.
4. `App.tsx`: rotas `/bemvindo` e `/visita` públicas (junto de `/visitante`).
5. `AutoCadastroQrPainel.tsx`: QR e link copiável passam a usar a URL limpa.
6. Conferência: viewport 375×812 com envio de teste e remoção em seguida (transação com claim de admin).
