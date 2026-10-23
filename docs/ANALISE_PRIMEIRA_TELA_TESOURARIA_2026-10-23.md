# A primeira tela da Tesouraria — desktop e celular

> **Decisões dela (23/10/2026): as cinco recomendações foram aprovadas** — agenda do celular em semana + lista do dia (mês a um toque); "Fechar o mês" vira aviso contextual; botão "Resumo diário" com painel (último/próximo envio, destinatários, Visualizar, Enviar agora, Configurar); só as abas fixas no celular; saldos "Livre" e "Sai/semana" em destaque. **Implementado no mesmo dia** (commit local; ver o final deste documento). O texto abaixo é a análise que levou às decisões.

Análise de **23/10/2026**, só leitura do código (`PainelTesouraria.tsx`, `MesaDoTesoureiro.tsx`, `CalendarioDeVencimentos.tsx`, `FilaDoDia.tsx`, `favoritosService.ts`, migration `20260923100000_fin_favoritos.sql`) e dos dois prints dela (desktop 1668 px, celular 720 px ≈ 375 px CSS). **Nada foi alterado.** As medidas de altura saem dos prints (escala ≈ 1,92); onde é inferência, está dito.

## 1. O que existe hoje

Uma única página (`/painel-tesouraria`, aba "1 Operações") com **a mesma sequência nos dois tamanhos** — o que muda é só a quebra de linha. Não há nenhum ramo "se for celular" na página nem na Mesa (`useIsMobile` não é usado ali). A única adaptação de celular está dentro do calendário (valores compactos "12,4 mil", "obrig.", "venc.").

Ordem, de cima para baixo:

| # | Bloco | Desktop (print) | Celular (print, altura CSS aprox.) |
|---|---|---|---|
| 1 | Cabeçalho **fixo** (`sticky top-0`): título, data, 4 saldos, Atualizar, frase "Atenção: 12 alertas críticos", 4 abas | 1 faixa de ~190 px | **~210 px, fixa o tempo todo** (mais a barra do app 44 px e a barra inferior 44 px: ≈ 1/3 da tela nunca rola) |
| 2 | "Meu trabalho": 5 botões | 1 linha | 3 linhas, ~95 px |
| 3 | Favoritos: 5 atalhos + "Fixar novo" | 1 linha | 4 linhas, ~100 px |
| 4 | "Seu dia": 4 números | 1 linha de 4 cartões, ~75 px | 2×2, ~130 px |
| 5 | "Também hoje" | 1 linha | 1–2 linhas |
| 6 | **Calendário de vencimentos** (+ Fila, Preparar envio, NF quitada, Nova conta) | começa em y = 465 de 1016 — **na primeira tela** | começa ≈ 780 de ~750 visíveis — **fora da primeira tela**; e roda por baixo do cabeçalho fixo |

Leitura: no desktop a ordem é *indicadores → ações → agenda* e a agenda aparece. No celular a agenda — que é o que a tesoureira vem ver — é o **sexto** bloco, depois de ~370 px de botões e atalhos, e ainda disputa a tela com um cabeçalho de 210 px que não sai. É por isso que o celular "parece menos organizado": a hierarquia do desktop (a agenda é o centro) se perde quando tudo vira uma coluna.

## 2. Favoritos — respostas

- **São pessoais.** A tabela `fin_favoritos` tem `usuario_id` e uma única política (`fin_favoritos_dono`): `USING (usuario_id = auth.uid())`. Cada pessoa vê, cria, reordena e apaga só os seus; **não há exceção nem para o administrador**. Gravar exige um destes papéis: admin, diakonia, secretaria, tesouraria.
- **Não são compartilhados.** O que um usuário fixa **não** aparece para os outros.
- **Há separação por usuário** — pelo banco (RLS), não por filtro na tela. (Li a migration e o serviço; não rodei um teste de RLS contra produção com dois usuários. Se quiser a prova, é um ensaio com `SET LOCAL ROLE` em transação desfeita.)
- **Valem em qualquer aparelho do mesmo login**: por isso o desktop e o celular dela mostram os mesmos 5. Um usuário novo começa com a lista **vazia** (não há atalhos sugeridos de fábrica).
- Conclusão: **a preferência dela já é a regra.** Nada a mudar no modelo; o que muda é a apresentação no celular (seção 5).
- Observação: dos 5 fixados, **"Prestação de Contas" é o mesmo destino do botão "Fechar o mês"** (`/financas/prestacao-de-contas`) — ver seção 3.

## 3. "Fechar o mês" — é redundante?

Fatos do código:

- O botão leva a **`/financas/prestacao-de-contas`** — o **relatório** do período, não o fechamento.
- O fechamento de verdade é a aba **"4 Fechamento"** (`FechamentoMensal`: 1 Conciliação → 2 Classificação → 3 Prontidão → 4 Documentos do mês → 5 Malote → 6 Envio). Ela própria linka a Prestação de Contas como uma das saídas (linha 380).
- A trilha "Financeiro › Fechamento" já abre a aba por `#fechamento`.

Veredito: **o botão é redundante e, pior, enganoso** — o nome promete o fechamento e entrega um relatório, e a quem clica por "fechar o mês" ele esconde o checklist que de fato fecha. Além disso o destino já está nos favoritos dela e no menu ("Prestação de Contas").

Recomendação: **tirar da faixa "Meu trabalho"** e dar ao fechamento um lugar **contextual**: nos últimos ~3 dias do mês e nos primeiros ~5 do seguinte, um chip em "Também hoje" — *"Fechamento de setembro: 83% pronto · continuar →"* — que abre a aba 4 (a regra de prontidão já existe, `prontidao-do-malote`). Fora dessa janela, ninguém precisa dele na primeira tela. (Alternativa mínima: manter o botão mas apontar para `#fechamento`.)

## 4. "Preparar envio" × Resumo Diário — a substituição é parcial

O que o **Resumo Diário** (no ar desde 22/10) já faz: e-mail automático aos destinatários cadastrados, no horário, com linha digitável/Pix/origem, mesmas regras do manual, "Visualizar" e "Enviar teste para mim" (em Admin › Resumo semanal e diário; interruptor próprio).

O que **só o "Preparar envio"** faz hoje:

1. **Escolher** o que vai (desmarcar itens) antes de mandar;
2. a versão de **WhatsApp**;
3. o **ZIP "13.OUT"** com os boletos para a pasta do Drive (a "Fase 2 = anexos" do diário ainda não existe);
4. **sob demanda, agora** — o diário só sai pelo agendador; não existe "enviar agora para os destinatários" (só o teste, para o e-mail de quem está logado).

Logo, trocar o botão por "Resumo Diário" **sem** destino para esses quatro itens tiraria funções que ela usa. Nomes avaliados:

| Nome | Prós | Contras |
|---|---|---|
| **Resumo diário** | é o nome que ela e os tesoureiros já usam; casa com o Resumo semanal | lido como "relatório para ler", não como ação |
| **Enviar resumo diário** | diz que é uma ação | só é verdade se o botão realmente enviar agora (hoje não existe) |
| **E-mail da Tesouraria** | — | nomeia o canal, não o conteúdo; some quando virar WhatsApp/ZIP |
| **Relatório diário** | — | colide com "Relatórios"/Prestação de Contas; sugere PDF |

**Recomendação:** o botão visível se chama **"Resumo diário"** e mostra o estado ("ligado · 07:00" / "desligado"), abrindo um painel curto: *situação · destinatários · Ver o e-mail de hoje · Enviar teste para mim* e, **quando o backend ganhar**, *Enviar agora aos destinatários*. O **"Preparar envio" vira o item "Envio manual (escolher, WhatsApp, ZIP)" dentro desse mesmo painel** — sai do cabeçalho do calendário, mas não some, até a Fase 2 do diário (anexos/ZIP) cobrir o que falta. Aí o envio manual pode ser aposentado.

## 5. Proposta para o celular (experiência própria, não redução)

Princípio: **o desktop responde "o que está acontecendo e o que faço?" com a agenda no centro; o celular deve responder a mesma pergunta em ordem de uso do polegar.**

```
┌───────────────────────────┐  ← barra do app (como hoje)
│ Tesouraria        Atualizar│  cabeçalho NÃO fixo: título + data numa linha
│ Livre  −R$ 11.353   Sai/sem R$ 5.844 │  2 saldos que decidem; "Nas contas" e
│ ▸ mais saldos                │  "Reservado" atrás de um toque
├───────────────────────────┤
│ 1 Operações · Gestão · Cadastros · Fecham. │  só as abas ficam fixas (~40 px)
├───────────────────────────┤
│ ▲ 8 atrasadas  R$ 14.645 →  │  "Seu dia" em tira horizontal:
│ ● 1 vence hoje R$ 879   →  │  atrasadas e hoje grandes; "débitos a conferir"
│ ◐ 0 débitos · Falta p/ semana │  e "falta p/ semana" como chips
├───────────────────────────┤
│ AGENDA        Semana | Mês  │  ← 1ª tela já tem a agenda
│ D  S  T  Q  Q  S  S         │  tira da semana (7 dias com valor/alerta)
│ ─ 23 sex · 1 obrigação ──   │  lista do dia escolhido, com Pagar/Anexo
│ ─ amanhã … ─ atrasadas ─    │  (Mês = a grade de hoje; Fila = como hoje)
├───────────────────────────┤
│ ★ Prestação · Extrato · Auditoria · 120 Anos →  │  1 linha com rolagem lateral
│ Também hoje: documentos · fechamento (se for hora) │
└───────────────────────────┘
                      [ + ]  ← um "+" abre: Novo lançamento · Registrar recebimento
                               · Transferir · Importar extrato   (+ Resumo diário)
```

Resultado esperado (estimativa pelos prints): o que hoje ocupa ≈ 210 (cabeçalho fixo) + 95 (Meu trabalho) + 100 (Favoritos) + 130 (Seu dia) ≈ **535 px antes da agenda** cai para ≈ **40 (abas fixas) + 70 (saldos) + 70 (Seu dia) ≈ 180 px** — a agenda abre dentro da primeira tela e nada a cobre ao rolar.

Pontos de decisão no desenho:

1. **Agenda no celular = semana + lista do dia, com "Mês" a um toque.** A grade de 7 colunas num telefone dá células de ~44 px, só números compactos; a semana dá espaço para valor, situação e a lista logo abaixo. Isso muda, **só no celular**, o "abre sempre no Calendário" que ela decidiu em 20/10 (o mês continua a um toque, e no desktop nada muda).
2. **Ações rápidas num único "+"** (padrão do FAB que o app já usa em outras telas, hoje desligado de propósito nas telas do Financeiro porque brigava com a ação da tela; aqui ele *é* a ação da tela). Tira 3 linhas de botões.
3. **Favoritos em 1 linha rolável** (de ~100 px para ~36 px), "Fixar novo" como último item.
4. **Cabeçalho deixa de ser fixo no celular**; ficam fixas só as abas (as 4 áreas são o único elemento de navegação que precisa estar sempre à mão).
5. **Saldos:** "Livre" e "Sai/semana" no topo (decidem o dia); "Nas contas" e "Reservado" a um toque.
6. A frase **"Atenção: 12 alertas críticos"** hoje não leva a lugar nenhum visível; no celular, virar o primeiro item da tira "Seu dia" (ou sumir, porque "8 atrasadas" já diz o essencial).

## 6. O que é usado todo dia?

**Não há telemetria de cliques** (registrado em `financeiro-simplificacao-fases-a-d`), então não dá para afirmar uso por medição. O que há é o levantamento de 06/10 (`OPERACOES_MESA_DO_TESOUREIRO.md`), que descreve a rotina real: *ver o que pagar → pagar → anexar comprovante → conferir débitos automáticos → documentos para a contabilidade*. Com isso, a hipótese de trabalho:

| Frequência | O quê | Onde deve ficar |
|---|---|---|
| Todo dia | atrasadas / hoje, pagar, anexar | primeira tela (agenda + "Seu dia") |
| Toda semana | importar extrato, conferir débitos, registrar recebimentos (pós-domingo) | "+" e "Também hoje" |
| Todo mês | fechamento, prestação de contas | aba 4; chip contextual na virada do mês |
| Raro | Transferir, "NF já quitada por terceiro", Preparar envio manual | dentro do "+" / do painel do Resumo diário |

**Para confirmar com ela (3 respostas bastam):** quais 3 toques ela mais dá no celular? Registrar recebimento é semanal? Os tesoureiros que recebem o e-mail diário já substituíram o envio manual?

## 7. Decisões que dependem dela

1. **Agenda no celular:** semana + lista do dia (recomendado) ou manter a grade do mês como padrão?
2. **"Fechar o mês":** sair de "Meu trabalho" e virar chip contextual na virada do mês (recomendado), ou só apontar para `#fechamento`?
3. **Resumo diário:** botão "Resumo diário" com painel e "Preparar envio" dentro dele (recomendado) — e construir o **"Enviar agora aos destinatários"** (função nova no backend, ~1 dia)?
4. **Cabeçalho do celular:** só as abas fixas (recomendado)?
5. **Saldos no celular:** "Livre" + "Sai/semana" em destaque, o resto num toque?

## 8. Esforço (estimativa) e riscos

- Celular (itens 1–6 da seção 5): ~2–3 dias, **sem migration**, reaproveitando `CalendarioDeVencimentos`/`FilaDoDia`; a tira da semana é o único componente novo. Ramificação por largura (CSS + um hook), mantendo a página única — evita manter duas telas.
- "Fechar o mês" contextual: ~0,5 dia (a prontidão já existe).
- Painel do Resumo diário: ~1 dia (reutiliza `ResumoDiarioDaTesouraria`); "Enviar agora": +1 dia de função e teste.
- Risco principal: o desktop **não pode mudar** junto — cada alteração entra atrás de `md:`/hook e os testes de tela existentes (`MesaDoTesoureiro`, `FilaDoDia`, calendário) continuam valendo; verificar no navegador em 375 e 1280.
- Risco secundário: tirar botões da primeira tela do desktop exige o mesmo cuidado — nada foi proposto para o desktop além de trocar "Fechar o mês" e "Preparar envio" de lugar.

## 9. O que foi implementado (23/10/2026)

**Celular** (verificado no navegador em 375×812 com dados reais; o computador foi conferido por DOM e não mudou):
- cabeçalho não fixo — só as quatro abas ficam fixas; "Atualizar" virou ícone na linha do título; saldos: **Saldo livre** e **Sai/semana**, os outros dois atrás de "Detalhar →";
- "Seu dia": **Atrasadas** e **Vencem hoje** em cartões; "Débitos a conferir" e "Falta/Sobra na semana" numa linha;
- **Agenda da semana** (domingo a sábado, valor compacto "9,1k", ▲ n por dia) + **lista do dia** logo abaixo; **Semana · Mês · Fila** no mesmo controle;
- **"+"** (Novo lançamento, Registrar recebimento, Transferir, Importar extrato, NF já quitada por terceiro) no lugar da faixa de botões;
- **Favoritos** em uma linha com rolagem lateral, depois da agenda.
- Medido: a faixa da semana, que começava em ≈ 930 px (fora de uma tela de 812), passou a começar em ≈ 690 px — **dentro da primeira tela**.

**Computador (todos os tamanhos):** "Fechar o mês" saiu de "Meu trabalho"; no lugar, o **aviso do fechamento** ("Fechamento de Setembro/2026 · 83,4% do malote pronto · Continuar") aparece nos primeiros 20 dias do mês seguinte e nos 3 últimos dias do mês e leva à aba 4; "Preparar envio" virou **"Resumo diário"** (painel; o envio manual está dentro dele).

**Novo no servidor:** ação `agora` em `resumo-diario-previa` (ver `RESUMO_DIARIO_IMPLANTACAO.md`): **precisa reimplantar** para o "Enviar agora" funcionar.
