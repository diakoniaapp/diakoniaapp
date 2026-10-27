# "Resumos por E-mail" → Central de Comunicação e Relatórios — análise antes de implementar

Análise de **27/10/2026**. Só leitura: `ResumoSemanalAdmin.tsx`, `ConteudoDoResumoSemanal`, `ResumoDiarioDaTesouraria`, `ResumoDiarioPainel`, `MensagensVisitanteAdmin`, as 7 Edge Functions de e-mail, `_shared/email/*`, `_shared/pagamentos/*`, `_shared/resumoSemanal/*`, `_shared/saldos/*`, `sistemaService`, migrations de resumo/mensagens, `navConfig`/`navegacao`. **Nada foi implementado.** Par deste documento: `ANALISE_CENTRAL_DE_DOADORES_E_DIZIMISTAS_2026-10-27.md` (o primeiro relatório que a Central entregaria).

## 1. Em uma página

- **O que existe é bom e já tem 80% das peças**: interruptor, horário, destinatários, prévia, teste, "enviar agora" (diário), perfis × blocos × ordem (semanal), moldura única de e-mail, textos institucionais, regra de saldo com data do último extrato. O problema não é falta de recurso: é que **cada resumo nasceu separado** — dois motores de conteúdo, remetente repetido em 7 arquivos, texto fixo, sem Reply-To e **sem histórico de quem enviou o quê para quem**.
- **Recomendação de nome:** menu **"Comunicação e Relatórios"** (descritivo, serve para resumos, relatórios e mensagens a visitantes). Título da página: "Central de Comunicação".
- **Estrutura:** **5 abas**, não 6 — *Agendamentos · Modelos · Relatórios · Histórico · Configurações* (a aba "Conteúdo" do seu desenho **é** o editor do Modelo; separá-la faria o usuário ir e voltar).
- **Saldo das contas:** **sair do envio padrão** e virar bloco opcional com **regra** ("mostrar só se o último extrato tem ≤ 3 dias; senão ocultar e dizer por quê"). Hoje ele já vai com data e aviso, mas continua indo.
- **Reply-To:** concordo com a sua preferência — manter `resumo@`/`relatorios@` como remetente e usar **Reply-To configurável** (a Identidade da Igreja já tem `email_contato`: reaproveitar). `nao-responda@` seria um passo atrás numa ferramenta pastoral.
- **O que a Central ganha de novo** (e custa de verdade): **histórico** (`comunicacao_envios`), **envio sob demanda** com anexo (uma Edge Function), **texto inteligente** e **edição** de assunto/introdução/rodapé, e **relatórios** como um catálogo.
- **O PDF anexado é o item mais caro**: o PDF do sistema hoje é impressão do navegador, que **não gera arquivo**. Anexar PDF exige gerador `pdf-lib` por relatório. Excel já existe. Recomendo e-mail com **corpo resumido + Excel** primeiro; PDF por relatório depois.

## 2. Estado atual (mapeado)

### 2.1 A tela hoje
`/admin/resumo-semanal` — **título "Resumos por E-mail"**, acessada pelo **menu do avatar** (não há item no menu lateral), restrita a **admin e diakonia** (`ROLES_DONO_SISTEMA`). Uma página longa com cartões empilhados (253 linhas + 2 componentes):

| Cartão | O que faz |
|---|---|
| Resumo semanal (agendamento) | dia/hora, ligar/pausar, **disparar agora** (com confirmação), situação do agendador |
| Histórico | **as últimas 10 execuções do agendador** (`cron.job_run_details`: data e status) — **sem destinatários nem solicitante** |
| Conteúdo do resumo semanal (`ConteudoDoResumoSemanal`) | por **perfil** (Administração, Tesouraria, Secretaria, Pastoral): recebe? quais blocos? em que ordem (sobe/desce) + **Visualizar e-mail** + **Enviar teste para mim** |
| Resumo diário da Tesouraria (`ResumoDiarioDaTesouraria`) | interruptor próprio, dias, horário (Brasília), janela, "enviar sem pagamentos", destinatários (pessoas do cadastro), **Visualizar** e **Enviar teste**; e o painel `ResumoDiarioPainel` na Mesa traz **último/próximo envio** e **Enviar agora** |

### 2.2 Capacidades por tipo de envio

| | Diário (Tesouraria) | Semanal | Alertas (ata atrasada, visitante esfriando) | Boas-vindas ao visitante |
|---|---|---|---|---|
| Agendamento | pg_cron (dias+hora) | pg_cron (dia+hora) | pg_cron | manual (link WhatsApp/e-mail) |
| Destinatários | lista própria (pessoas do cadastro) | por perfil (papéis) | **fixo: e-mail da Telma** no código | o visitante |
| Conteúdo configurável | **não** (lista de itens do dia; só "sigilosos" e janela) | **sim** (blocos × ordem por perfil) | não | **sim** (7 momentos × canal, blocos, marcas `{{nome}}`) — `/admin/mensagens-visitante` |
| Prévia / teste | sim / sim | sim / sim | não | sim / sim |
| Enviar agora | **sim** (admin/diakonia, com guarda de 20 min) | **sim** | — | — |
| Histórico | `resumo_diario_enviados` (itens listados, p/ aviso "já enviado") + execuções cron | execuções cron | execuções cron | — |
| Texto de abertura | fixo (`textos.ts`) | fixo | fixo | modelo editável |
| Remetente | fixo `resumo@` | fixo `resumo@` | fixo `resumo@` | fixo `resumo@` |
| Reply-To | **nenhum** | nenhum | nenhum | nenhum |
| Anexos | **nenhum** | nenhum | nenhum | nenhum |

### 2.3 Componentes reaproveitáveis (já existem)
- **Moldura/cartões/rodapé/paleta** `_shared/email/desenho.ts` + `textos.ts` + teste de consistência (`emailDesignSystem.test.ts`).
- **Catálogo de blocos** `_shared/resumoSemanal/catalogo.ts` (17 blocos: 14 disponíveis, 3 "em preparação") e `blocos.ts` (`montarBloco` → título, frase, itens, tom).
- **Motor do diário** `_shared/pagamentos/*` (itens com linha digitável/Pix/origem, seções, reembolsos).
- **Prévia e teste** (`*-previa`), **envio compartilhado** `_shared/pagamentos/enviarDiario.ts` (envio + registro + guarda de 20 min — criado para o "Enviar agora").
- **Modelos de mensagem** `visitante_mensagem_modelos` + `montarMensagem` (marcas, blocos, canal) — o único lugar onde "template editável" já existe.
- **Identidade da Igreja** (`identidade_igreja`: nome, endereço, telefone, **e-mail de contato**, redes) — fonte única de dados institucionais.
- **Saldo com data do último extrato** `_shared/saldos/extratoDasContas.ts` (`situacaoDoExtrato`, `DIAS_ATE_AVISAR = 3`, `NOTA_DO_SALDO`).
- **UI:** `PageHeader`, cartões, `Switch`, `Badge`, `AlertDialog`, `useEstadoNaUrl` (abas/estado na URL), padrão de abas do Fechamento/Contas.

## 3. Nome da tela

| Opção | Avaliação |
|---|---|
| **Comunicação e Relatórios** | **Recomendada.** Descreve as duas coisas (avisos automáticos e relatórios sob demanda) e comporta as mensagens a visitantes. |
| Central de Comunicação | Boa como título da página; "relatórios" fica implícito demais. |
| Central de Relatórios | Exclui as mensagens ao visitante e os alertas. |
| Notificações e Relatórios | "Notificações" sugere push/sino do app — não é o que é. |

Onde fica: item no menu lateral do grupo **Sistema** (hoje só o avatar o abre, o que esconde a função). Rota nova `/comunicacao` (com redirecionamentos de `/admin/resumo-semanal` e `/admin/mensagens-visitante`). **Permissão em dois níveis**: configurar (agendamentos, modelos, configurações) = dono do sistema; **pedir/enviar relatório** = papéis do próprio relatório (ex.: financeiro para a tesouraria). Hoje tudo é admin/diakonia.

## 4. Saldos das contas

**O risco é real e já foi parcialmente tratado:** desde 22/10 o diário e o semanal dizem "extrato do banco até DD/MM (há N dias)" e avisam em destaque passando de 3 dias. Mas **o saldo continua indo** — e é o único número do resumo que pode ser lido como "o saldo da conta da igreja" sem ser.

| Opção | Efeito |
|---|---|
| 1. Remover de vez | Seguro, mas perde o saldo nas semanas em que o OFX está em dia. |
| 2. Opcional (bloco liga/desliga) | Respeita a escolha; ainda pode ir desatualizado. |
| 3. Mostrar a "última atualização" | Já existe. |
| **4. Regra automática (recomendada)** | **Bloco opcional + regra:** exibe só se `último movimento do banco ≤ N dias` (padrão **3**, configurável); senão **oculta o saldo e escreve uma linha**: *"Saldos não exibidos: o último extrato do banco importado é de 18/10 (há 9 dias)."* A linha **não é erro**: avisa quem precisa importar o OFX. |

**Padrões sugeridos:** **diário** — bloco de saldo **desligado** (o diário é "o que exige ação"; saldo não é ação); **semanal** — opcional, ligado só para Administração/Tesouraria, **com a regra**. **Regra por conta** (o Bradesco pode estar em dia e a Investimento não). Dois cuidados: (1) **alinhar as constantes** — o e-mail avisa passando de 3 dias, mas o checklist da Mesa pede o extrato passando de **4** (`DIAS_ATE_PEDIR_EXTRATO`): uma constante só; (2) fim de semana e feriado: 3 dias cobre sexta→segunda; considerar dias úteis só se gerar falso "oculto" às terças.

## 5. Blocos — o que existe e o que falta

### 5.1 Mapa da sua lista

| Bloco pedido | Situação | Fonte |
|---|---|---|
| Contas atrasadas | **existe** (semanal) e é o núcleo do diário | `resumo_semanal_digest` / `itensDoDia` |
| Vencimentos de hoje | **existe** no diário (não como bloco) | `itensDoDia` |
| Vencimentos da semana | **existe** (semanal) | digest |
| Reembolsos pendentes | **existe** (os dois) | `lerReembolsos` |
| Compras pagas por terceiros | **falta como bloco** (a fila `vw_fin_quitacao` existe) | quitação |
| Débitos automáticos | **existe** (semanal) | digest |
| Recursos reservados | **catalogado, "em preparação"** | `lib/recursosReservados.ts` (TypeScript no app) |
| Pendências documentais | **catalogado, "em preparação"** | `documentacaoExigida.ts` (app) |
| Pendências administrativas | **falta** (parte da prontidão: 10 ajustes em outubro) | `documentacaoExigida.ts` |
| Prestação de contas pendente | **falta** | `prestacaoContasService` |
| Indicadores financeiros | **falta** (existe na tela) | `fin_exec_*`, indicadores |
| Saldos bancários | **existe** (com a regra da seção 4) | `extratoDasContas` |
| Novos visitantes | **existe parcial** ("Visitantes" = sem contato >7 dias) | digest |
| Aniversariantes | **existe** | digest |
| Novos membros | **falta** | `membros`/membresia |
| Relatórios anexados | **falta** (não há anexos) | — |
| *Outros que já existem e não estavam na lista* | Centros acima do orçamento, Obrigações fiscais, Caixas abertos, Batismo, Membresias, Governança, Pessoas sem telefone | catálogo |

### 5.2 O obstáculo de arquitetura (e a saída)
Hoje há **dois motores**: o **diário** monta *itens ricos* (cada pagamento com linha digitável, Pix e origem) e o **semanal** monta *frases + listas simples de texto*. Para "blocos configuráveis" valerem para os dois:

1. **Um contrato de bloco** (`_shared/comunicacao/bloco.ts`): `{ id, titulo, tom, tipo: "frase" | "lista" | "pagamentos" | "indicadores" | "tabela", dados }` — o diário passa a ser um **modelo** que usa os blocos `contas_atrasadas`, `vencimentos_hoje`, `reembolsos`, `compras_terceiros`…, com o bloco `pagamentos` desenhando o cartão rico que já existe.
2. **Regra "o MESMO cálculo"**: os blocos "em preparação" travaram porque o cálculo está no app (TypeScript) e reescrevê-lo em SQL criaria uma **segunda regra que um dia diverge**. A saída já praticada no projeto: **mover a regra pura para `_shared/` e re-exportar em `src/lib/`** (como `assinaturaDoSistema`). `documentacaoExigida.ts` e `recursosReservados.ts` são puras — candidatos diretos. Assim a tela e o e-mail leem a mesma conta.

## 6. Conteúdo do e-mail: texto inteligente e edição manual

### 6.1 Introdução gerada a partir do que realmente vai
Hoje o texto é fixo ("Segue o resumo diário… incluindo pagamentos em atraso, vencimentos do dia e reembolsos pendentes"), mesmo quando não há reembolso. Proposta: uma função **pura e determinística** (sem IA — testável) `introducaoDoEnvio(blocosPresentes, contagens)`:

- Junta **só** os assuntos presentes, na ordem de gravidade (atrasadas › hoje › reembolsos › pendências › informativos), com singular/plural e "e" final.
- Exemplos: *"Segue o resumo diário da Tesouraria, com **3 pagamentos em atraso** e **2 vencimentos para hoje**."* · *"…com **1 reembolso a pagar** e **4 pendências de documentação**."* · sem nada: *"Não há pagamentos em aberto nesta data."* (já existe).
- Mora em `textos.ts` (o mesmo ponto único que o teste de consistência protege), usada pela prévia, pelo teste e pelo envio.

### 6.2 Edição livre sem perder o automático
Cada campo do modelo (**assunto, introdução, rodapé**) tem um modo: **Automático** (recalculado a cada envio) ou **Manual** (texto fixo do modelo, com marcas `{{data}}`, `{{igreja}}`, `{{total}}`, `{{periodo}}`). Quem edita vê "Automático" virar "Manual" e pode **voltar ao automático**. Estrutura que ela desenhou, tal qual: **Assunto · Introdução · Conteúdo (blocos) · Rodapé**.

### 6.3 Rodapé padrão
Rodapé institucional configurável (hoje fixo em `desenho.ts`), com **duas variações**: *sem Reply-To* ("…não responda diretamente…") e *com Reply-To* ("…para dúvidas, responda esta mensagem ou fale com a equipe administrativa"). O texto do exemplo dela cabe como padrão; fica em Configurações.

## 7. Modelos, pré-visualização e anexos

### 7.1 Modelos
Um **modelo** = tipo de envio + assunto + introdução + blocos (ordem) + rodapé + destinatários + remetente + Reply-To. Hoje existem **três modelagens soltas** (perfis × blocos do semanal; configuração do diário; modelos de visitante). **Estratégia incremental, sem migração arriscada:**

1. Fase 1: a Central **lê** as três pelas telas atuais (adaptadores) e passa a **gravar histórico** de todos.
2. Fase 3: modelos **novos** (relatórios) usam `comunicacao_modelos` (+ blocos); os antigos migram um a um quando houver ganho.

### 7.2 Pré-visualização obrigatória
Já existe prévia e teste. Falta **torná-la obrigatória**: o botão **Enviar** só habilita depois de abrir a prévia **na mesma sessão** (e com os dados de agora). A prévia mostra o que sai: assunto, cabeçalho, introdução, blocos, tabelas, anexos (nome/tamanho) e rodapé.

### 7.3 Gráficos e anexos em e-mail
- **Gráficos:** Gmail/Outlook não rodam JS nem SVG. Recomendo **barras em HTML de tabela** (funciona em qualquer cliente) para distribuição mensal e curva semanal; sem serviço externo de imagem (privacidade).
- **Excel:** pronto (`xlsxSimples`) — gerado no navegador e anexado pelo Resend (`attachments`, base64).
- **PDF:** **o ponto mais caro.** O PDF do sistema é a impressão do navegador (não vira arquivo). Para anexar é preciso um **gerador `pdf-lib` por relatório** (o projeto já usa `pdf-lib` no dossiê do malote e no "00 RESUMO.pdf"). Recomendo: Fase 1 sem PDF; PDF para o relatório que mais precisar.

## 8. Remetentes e Reply-To

**Fatos:** o remetente `Diakonia <resumo@diakoniaapp.com.br>` está **escrito em 7 funções** (`resumo-diario`, `resumo-diario-previa`, `resumo-semanal`, `resumo-semanal-previa`, `alerta-ata-atrasada`, `alerta-visitante-esfriando`, `visitante-mensagem-teste`); **nenhuma** usa Reply-To. O Resend verifica o **domínio** — `relatorios@diakoniaapp.com.br` **não exige configuração nova de DNS** (a confirmar no painel do Resend). O que **preciso saber** para decidir o Reply-To: **onde caem hoje as respostas a `resumo@`?** (existe caixa de entrada para esse endereço?).

| Estratégia | Avaliação |
|---|---|
| **A. `resumo@`/`relatorios@` + Reply-To configurável** | **Recomendada** (é a sua preferência). A resposta chega a uma pessoa real. |
| B. `nao-responda@` | Em ferramenta pastoral, a resposta é informação (um tesoureiro avisando "já paguei"); perde isso. |
| C. Um remetente por pessoa | Complica a verificação e a reputação do domínio. |

**Proposta:** `_shared/email/remetente.ts` com `remetenteDe(tipo)` e `replyToDe(identidade, tipo)`: `resumo@` para automáticos, `relatorios@` para sob demanda; Reply-To **por tipo** (financeiro → e-mail da tesouraria; visitantes → secretaria/pastoral), com padrão em `identidade_igreja.email_contato` (**coluna que já existe**). As 7 funções passam a chamar o helper (**e precisam ser reimplantadas juntas**).

## 9. Relatórios sob demanda

Catálogo (cada um é um **gerador** registrado, com papéis e parâmetros):

| Relatório | Gerador hoje | Observação |
|---|---|---|
| Dizimistas / Doadores | **novo** (documento irmão) | privacidade nível A (agregado) no e-mail |
| Prestação de Contas | existe (tela + impressão) | PDF por impressão; anexar exige `pdf-lib` |
| Financeiro (DRE, extrato de obrigações) | existe (Excel/CSV/PDF) | Excel já anexável |
| Visitantes | digest/Central de Acolhimento | indicadores prontos |
| Membresia | membresia/Governança | resumo |
| Administrativos | vários | por demanda |

Fluxo: **escolher relatório → parâmetros (período) → destinatários → prévia obrigatória → enviar**. Uma Edge Function única (`comunicacao-enviar`) **confere sessão e papel** (padrão de `resumo-diario-previa`), valida anexos (tipo/tamanho), envia pelo Resend com `from`/`reply_to` do helper e **grava o histórico**. O gerador roda **no navegador** (é lá que ficam Excel/PDF/gráficos hoje) e manda o resultado já pronto — evita reescrever cada relatório no servidor, com a ressalva de que a função não confia no conteúdo: só no papel de quem chama e nos limites de tamanho.

## 10. Histórico

Hoje: execuções do agendador (10 últimas, sem quem/para quem) e `resumo_diario_enviados`. **Proposta:** tabela `comunicacao_envios`:

| Campo | Para quê |
|---|---|
| modelo / relatório, parâmetros (período) | "Dizimistas — últimos 6 meses" |
| origem | agendado · sob demanda · teste · "enviar agora" |
| solicitante (usuário + nome) | "Solicitado por Telma Souza" |
| remetente, reply-to | auditoria |
| destinatários (e-mail + resultado por pessoa) | "Enviado para pastor@…" |
| data/hora, `resend_id` | rastreio e (depois) entrega/abertura via webhook |
| anexos (nome, tamanho, tipo) | o que foi |
| resumo agregado do conteúdo | contagens/totais — **nunca** o conteúdo nominal |

**Decisão de privacidade embutida:** o histórico registra **que** um relatório com nomes foi enviado, **a quem** e **quando** — mas **não guarda o arquivo nem a lista**. Retenção definida (ex.: 24 meses). RLS: admin/diakonia veem tudo; cada solicitante vê os seus.

## 11. A tela — estrutura e wireframes

### 11.1 As abas (5)
**Agendamentos · Modelos · Relatórios · Histórico · Configurações.** O seu desenho tinha "Conteúdo" separado de "Modelos": na prática o conteúdo de um envio **é** o modelo — uma aba a menos e nenhum vai-e-volta.

### 11.2 Agendamentos
```
Comunicação e Relatórios  ›  Agendamentos
┌ Resumo diário da Tesouraria ─────────────────────┐ ┌ Resumo semanal ──────────────┐
│ ● Ligado · seg–sex 09:00 · 6 destinatários        │ │ ● Ligado · sexta 18:00        │
│ Último: 26/10 09:00 · Próximo: hoje 09:00         │ │ Último: 23/10 · Próximo: 30/10│
│ [Visualizar] [Enviar agora] [Editar modelo]       │ │ [Visualizar] [Enviar agora]   │
└───────────────────────────────────────────────────┘ └───────────────────────────────┘
┌ Alertas automáticos ─────────────────────────────┐ ┌ + Novo agendamento (Prestação mensal…) ┐
│ Ata atrasada · Visitante esfriando (ligados)      │ └────────────────────────────────────────┘
└───────────────────────────────────────────────────┘
```

### 11.3 Modelos (o editor)
```
Modelo: Resumo diário da Tesouraria                          [ Visualizar ▸ ]
Assunto       ( Automático ◉ | Manual ○ )  Resumo diário da Tesouraria | 27.10 · 3 pagamentos
Introdução    ( Automático ◉ | Manual ○ )  "Segue o resumo diário… com 3 pagamentos em atraso e 2 para hoje."
Conteúdo      ☑ Contas atrasadas  ☑ Vencimentos de hoje  ☑ Reembolsos  ☑ Compras por terceiros
              ☐ Saldos bancários  ☑ Pendências documentais   (arrastar ou ▲▼ para ordenar)
              ⚙ Saldos: mostrar só se o último extrato ≤ [3] dias
Rodapé        ( Padrão ◉ | Manual ○ )     Remetente: resumo@ · Reply-To: tesouraria@…
Destinatários [ pessoas do cadastro ] [ perfis ]  [ e-mail avulso ]
```
Prévia lado a lado no desktop; em tela cheia no celular.

### 11.4 Relatórios (sob demanda)
```
Relatórios  ›  [ Dizimistas ▾ ]   Período: Últimos 6 meses ▾   Nível: ◉ Agregado ○ Nominal (com confirmação)
Destinatários: pastor@… ✕   [ + adicionar ]
Anexos: ☑ Excel  ☐ PDF (indisponível)
[ Visualizar (obrigatório) ]      [ Enviar ]  ← habilitado depois da prévia
```

### 11.5 Histórico
```
Quando        Relatório                       Solicitante     Para                 Origem        Resultado
26/10 09:00   Resumo diário                    (agendado)      6 destinatários      agendado      ✓ 6/6
26/10 11:02   Dizimistas – últimos 6 meses     Telma Souza     pastor@…             sob demanda   ✓
```

### 11.6 Configurações
Remetentes (automáticos × relatórios), Reply-To por tipo, rodapé (com/sem resposta), regra do saldo (N dias), link para a Identidade da Igreja.

### 11.7 Celular
Abas em linha rolável (padrão do Workspace), cartões empilhados, prévia em tela cheia, histórico como lista de cartões.

## 12. Fluxo de navegação
Menu lateral › Sistema › **Comunicação e Relatórios** (`/comunicacao?aba=…`). Entradas contextuais: Mesa › "Resumo diário" → Agendamentos/diário; Contribuições › "Enviar relatório" → Relatórios com o modelo já escolhido; Prestação de Contas › "Enviar" idem. Voltar devolve a aba e o estado (padrão `useEstadoNaUrl`). `/admin/resumo-semanal` e `/admin/mensagens-visitante` redirecionam.

## 13. Impacto no sistema atual
- **Front:** `ResumoSemanalAdmin` (253 linhas) vira casca de abas; `ConteudoDoResumoSemanal`, `ResumoDiarioDaTesouraria` e `MensagensVisitanteAdmin` entram como conteúdo de abas (sem reescrita na Fase 1).
- **Banco:** `comunicacao_envios` (+ modelos nas fases seguintes); coluna(s) de Reply-To/rodapé/regra do saldo (preferir `identidade_igreja`/config pequena existente).
- **Edge Functions:** helper `remetente.ts` usado pelas 7 funções (**reimplantar todas**), nova `comunicacao-enviar`; o `enviarDiario.ts` já é o embrião do envio compartilhado.
- **Testes:** `emailDesignSystem.test.ts` cobre os e-mails novos; novos testes do texto inteligente, da regra do saldo e do histórico.
- **Custo operacional:** cada rodada exige **implantar funções** (token do Supabase colado no terminal) — hoje manual; vale decidir a automação de implantação em paralelo.

## 14. Riscos
- **Duplicidade de envio** (manual + agendado): manter a guarda de 20 min e registrar a origem.
- **Dado sensível por e-mail:** nível agregado por padrão; nominal com confirmação e histórico (ver documento de Doadores).
- **Divergência tela × e-mail:** só com blocos que leem o **mesmo cálculo** (`_shared`).
- **Limites do Resend** (envios por dia/mês, tamanho de anexo): **confirmar o plano**; relatório com muitos destinatários pode esbarrar.
- **Remetente novo e reputação:** `relatorios@` no mesmo domínio herda a reputação; começar com poucos destinatários.
- **Escopo:** a Central é grande; por isso as fases abaixo entregam valor em cada uma.

## 15. Roadmap

| Fase | Entrega | Esforço |
|---|---|---|
| **0 — Ganhos rápidos (independentes)** | Regra do saldo (ocultar com motivo, padrão desligado no diário) + alinhar a constante de 3/4 dias; helper `remetente.ts` + Reply-To (usa `email_contato`) + rodapé com/sem resposta | 1,5–2 d |
| **1 — Histórico** | `comunicacao_envios` gravado por diário, semanal, "enviar agora" e teste; aba Histórico mínima | 2 d |
| **2 — A Central** | `/comunicacao` com as 5 abas; Agendamentos e Configurações com o que já existe; item no menu; redirecionamentos | 2–3 d |
| **3 — Texto e modelos** | `introducaoDoEnvio` (automático), campos Automático/Manual, editor de modelo + prévia obrigatória; contrato de bloco | 3–4 d |
| **4 — Relatórios sob demanda** | `comunicacao-enviar` + catálogo; 1º relatório (Dizimistas, nível agregado, corpo + Excel) | 4–5 d |
| **5 — Blocos novos** | Prontidão do malote, Documentos pendentes, Recursos reservados (regra movida para `_shared`), Compras por terceiros, Novos membros | 3 d |
| **6 — PDF anexável e relatório mensal automático** | gerador `pdf-lib` do relatório mais pedido; agendamento "Prestação mensal" | 3–4 d |

Total aproximado **17–23 dias**, em fatias. **A Fase 0 sozinha já resolve o que mais incomoda hoje** (saldo desatualizado e resposta sem destino).

## 16. Sobre a avaliação que ela colou

Concordo com: o **nome** (Central de Comunicação…), **remover/condicionar o saldo**, **prévia obrigatória**, separar **automáticos × sob demanda** (`resumo@` × `relatorios@`) e **blocos configuráveis**. Ajustes: (a) **"Relatórios sob demanda" como segunda aba** — sim, mas dentro de uma Central com **Histórico e Modelos**, senão o histórico fica sem casa; (b) o diário **só com o que exige ação**: concordo, mas "**pendências documentais**" todo dia vira ruído (outubro tem 23 por dia) — melhor no semanal ou só quando um malote está perto do fechamento (dias 1–20 / fim do mês, a mesma janela do aviso da Mesa); (c) "**recursos reservados em risco**" precisa de uma definição de "risco" (hoje o app só calcula reservado × livre) — decisão dela; (d) **três áreas** (Agendamentos, Conteúdo, Relatórios) × **seis abas** do outro desenho: fico com **cinco**.

## 17. Decisões que dependem dela

1. **Nome do menu:** "Comunicação e Relatórios" (recomendado).
2. **Saldo:** diário **desligado** e semanal opcional **com a regra ≤ 3 dias**? Regra por conta? Mensagem quando oculto ("Saldos não exibidos…")?
3. **Reply-To:** para onde vão as respostas hoje (`resumo@` tem caixa?) e qual e-mail da igreja será o Reply-To de cada tipo.
4. **Rodapé:** aprovar o texto (com e sem resposta).
5. **Histórico:** guardar só metadados e agregados (recomendado) ou também o corpo do e-mail? Retenção (ex.: 24 meses)?
6. **Quem pede relatório:** só administração ou cada papel para os seus relatórios (tesouraria → financeiro)?
7. **Primeiro relatório:** Dizimistas (junto com a análise de Doadores) — e em qual nível de privacidade.
8. **PDF anexável:** vale o custo agora ou começamos só com Excel + corpo?
9. **Estrutura:** 5 abas (recomendado) ou as 6 do desenho?
10. **Implantação das funções:** manter o token colado no terminal ou montar a automação (GitHub Actions) junto desta Central.
