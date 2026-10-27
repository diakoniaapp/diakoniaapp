# Auditoria funcional da Tesouraria — 27/10/2026

Só análise: **nada foi implementado** (a única edição de código foi um defeito do meu próprio `RecalcularGuiaDialog`, achado no caminho — ver F-12).

## 0. Como auditei (e o que não consegui)

- Li o código dos fluxos (formulários, serviços, regras puras, migrations) e **reproduzi em teste** o defeito das recorrências (jsdom, com dados simulados).
- **Não naveguei a produção**: a sessão do navegador do app está deslogada e eu não digito senha. Por isso **nenhum número é de dados reais** e os itens marcados **[a confirmar na tela]** dependem de você (ou de uma sessão logada) para fechar.
- Legenda de evidência: **[reproduzido]** rodei e vi · **[código]** está escrito assim, com arquivo e linha · **[deduzido]** consequência lógica do código · **[a confirmar na tela]**.
- Gravidade: **CRÍTICO** (dado financeiro errado ou perdido sem aviso) · **ALTO** (decisão ou pagamento errado, ou promessa da tela não cumprida) · **MÉDIO** (confusão, retrabalho, erro provável) · **BAIXO** (acabamento).

## 1. Quadro-resumo

| ID | Achado | Gravidade | Esforço | Quick win? |
|---|---|---|---|---|
| F-01 | O seletor (Radix Select) **apaga o valor** quando as opções chegam depois do valor — conta, categoria e centro da recorrência somem na primeira edição da página; no lançamento só Categoria/Centro/Projeto foram protegidos (a Conta não) | **CRÍTICO** | 0,5 d (correção central) | **Sim** |
| F-02 | Editar a **conta** de uma recorrência não chega aos previstos já gerados; a propagação da forma de liquidação ainda procura pela conta **nova** e falha em silêncio | **ALTO** | 1 d | **Sim** |
| F-03 | **Desativar ou excluir** uma recorrência deixa até 12 meses de previstos vivos (Mesa, e-mail diário, projeção de saldo) | **ALTO** | 1 d | Sim |
| F-04 | Os três lembretes da recorrência (5 dias antes, 1 dia antes, no vencimento) **são gravados e ninguém os lê** | **ALTO** | 0,5 d (ocultar) / 3 d (cumprir) | Sim (ocultar) |
| F-05 | **Comprovante** tem três definições; a Mesa e o Painel ainda cobram comprovante de débito automático já conciliado (contraria a regra de 22/10) | **ALTO** | 1 d | **Sim** |
| F-06 | **"Quanto está atrasado?"** tem três respostas (diário × semanal × Mesa); o semanal soma o que o diário tira (reembolsos pendentes) | **ALTO** | 1,5 d | Não |
| F-07 | **Lançamento manual nasce "Realizado"** (padrão do formulário), e permite "Conciliado" na criação | **ALTO** | 0,5 d | **Sim** |
| F-08 | **Estados quase invisíveis**: no extrato da conta o único sinal é a cor do texto da data; três vocabulários diferentes; "em atraso" não é um estado em lugar nenhum | **ALTO** | 3–4 d (sistema de selos) | Parcial |
| F-09 | **Anexos:** o campo de arquivo continua mostrando o arquivo depois de salvar (Anexos da despesa, Declaração do terceiro); entradas ocultas não deixam escolher o mesmo arquivo de novo | MÉDIO | 0,5 d | **Sim** |
| F-10 | Diálogos que "somem" mas guardam o estado (Cancelar nota): reabrir mostra texto antigo e **arquivo invisível** que libera o botão | MÉDIO | 0,25 d | Sim |
| F-11 | Ligar/desligar recorrência sem tratamento de erro; **não existe "Duplicar"**; valor com campo numérico fora do padrão da casa | MÉDIO | 1 d | Parcial |
| F-12 | `RecalcularGuiaDialog` (meu, de 23/10) reabria com valores antigos e arquivo invisível | MÉDIO | feito | — |
| F-13 | Débito automático: o diário **nunca cita** débito (nem o de hoje); "possível falha" não tem saída de "paguei por outro meio" **[a confirmar na tela]** | MÉDIO | 1,5 d | Não |
| F-14 | Dois tipos com o **mesmo nome** (`SituacaoDaObrigacao`) e palavras diferentes para o mesmo estado ("Paga" × "Pago Integralmente") | MÉDIO | 1 d | Não |
| F-15 | Painéis que leem `vw_fin_obrigacoes` mostram, para a guia **recalculada ainda não paga**, o saldo antigo | MÉDIO | 1 d | Não |
| F-16 | Favorecido cadastrado com o CPF no nome ("Leandro Dias Goncalves 11098354770") aparece nos e-mails e relatórios **[dado, a confirmar]** | BAIXO | 0,25 d | Sim |

## 2. ITEM 1 — Recorrências: a conta que some

### Mapa do fluxo (como está hoje)

| Etapa | O que acontece | Onde |
|---|---|---|
| **Criar** | formulário → `criarRecorrencia` → `gerarOcorrencias` (parcelamento: tudo; contínua: 12 meses) | `RecorrenciaForm.tsx:149-254`, `recorrenciaService.ts` |
| **Editar** | o formulário se reinicia a cada abertura a partir da recorrência → `atualizarRecorrencia` → (1) re-datar previstos, (2) `propagarModelo`, (3) `propagarLiquidacaoParaPrevistos`, (4) `gerarOcorrencias` | `RecorrenciaForm.tsx:82-116, 198-220` |
| **Salvar** | gravação conferida (`conferir`), depois avisos (já pagas, descrição repetida) | `finService.ts:1852` |
| **Duplicar** | **não existe** (só um aviso quando outra recorrência tem a mesma descrição) | `RecorrenciaForm.tsx:241-246` |
| **Desativar/Excluir** | liga/desliga `ativo`; excluir apaga a recorrência (previstos ficam, sem vínculo) | `FinancasRecorrencias.tsx:66-69`, `20261006150000…:49` |

### F-01 — O defeito (reproduzido)

- **Causa:** o Radix Select 2.3.7 mantém um `<select>` nativo escondido. Quando o `value` passa de `""` para `"c1"` **antes** de as opções existirem, o navegador não acha a opção, o valor nativo vira `""`, o Radix dispara `onValueChange("")` e o formulário **zera o campo**. Isso está no código do componente (`SelectBubbleInput`, `@radix-ui/react-select/dist/index.mjs:1093-1111`).
- **Por que só às vezes:** as listas (contas, categorias, centros) carregam **depois** de o formulário abrir. Na **primeira** abertura da página elas ainda estão vazias; nas seguintes já estão em memória e tudo funciona. Por isso parece intermitente.
- **Reprodução [reproduzido]:** abrindo a edição de uma recorrência com a conta "Bradesco" (ativa): o seletor mostra **"Selecione"** e, ao salvar, a tela responde **"Selecione a conta"** — o dado no banco continua certo, o formulário é que o perdeu.
- **A equipe já achou isto antes:** no `LancamentoForm`, Categoria, Centro e Projeto ganharam a proteção `onValueChange={(v) => { if (v) … }}` (commit `8a6552d`, "Categoria e Centro de custo em branco ao editar lançamento", com o comentário explicando exatamente este mecanismo). **A correção ficou local**: a **Conta** do mesmo formulário (`:887`) e **todos** os seletores do `RecorrenciaForm` não a têm. Há ~30 seletores controlados em ~25 telas.
- **Risco no lançamento [deduzido; a confirmar na tela]:** `contaIdEfetivo = contaId || contaIdPadrao` (`LancamentoForm.tsx:140`). Se o Radix zerar a conta ao editar a partir da tela de **outra** conta, a conta efetiva vira a da tela e **o salvamento poderia mudar a conta do lançamento sem aviso**. Por isso classifiquei como CRÍTICO até alguém confirmar na tela que não ocorre.
- **Efeito que o usuário descreve:** "a conta bancária some". Tem os dois sintomas: o **rótulo** vazio e o **estado** zerado (não é só visual).
- **Correção (altitude certa):** tratar na **raiz**, uma vez: no componente `ui/select.tsx` ignorar `onValueChange("")` quando o seletor não tem item de valor vazio (ou carregar a lista antes de definir o valor). Remove a classe inteira de defeitos de ~30 seletores e as proteções locais viram redundantes. Esforço: ~0,5 dia + teste que reproduz a corrida. (O `ui/` é shadcn — "não editar sem motivo forte"; este é o motivo.)

### F-02 — A conta editada não chega aos lançamentos já gerados

- `propagarModelo` leva ao futuro previsto: favorecido, categoria, centro, valor (se fixo). **Não leva conta nem descrição.** [código `recorrenciaService.ts:231-251`]
- `propagarLiquidacaoParaPrevistos` acha os previstos por **mesma descrição + tipo + conta** — usando a conta **nova** do formulário (`RecorrenciaForm.tsx:217-218`). Se a conta mudou, nenhum previsto antigo casa: a forma de liquidação (débito automático, boleto…) **não é aplicada** e a tela diz sucesso.
- **Impacto:** a recorrência passa a "Bradesco", mas os 11 previstos futuros seguem na "Caixinha": o débito automático esperado no OFX do Bradesco não casa; o saldo projetado por conta fica errado.
- **Correção:** propagar `conta_id` (e `descricao`) pelo vínculo `recorrencia_id`, e casar a forma de liquidação pelo vínculo, não pela conta; avisar quantos foram movidos. Esforço 1 dia, com teste.

### F-03 — Encerrar recorrência não encerra os previstos

- Desativar só troca `ativo` (`FinancasRecorrencias.tsx:66-69`); excluir faz `ON DELETE SET NULL` no vínculo dos previstos (`20261006150000…:49`). Nenhum dos dois cancela o futuro.
- **Impacto:** contrato encerrado continua aparecendo em "A pagar", no calendário, no e-mail diário e na projeção por até 12 meses; alguém pode **pagar o que não é mais devido**.
- **Correção:** ao desativar/excluir perguntar "Cancelar os N previstos futuros (R$ X)?" (padrão: sim; só `previsto` e de hoje em diante, como o resto do serviço). 1 dia.

### F-04 — Lembretes que não existem

- Os três checkboxes "🔔 Lembrar antes do vencimento" (`RecorrenciaForm.tsx:448-464`) gravam `lembrar_5d/1d/dia`. **Nenhum código, função ou agendamento lê esses campos** [código — busca em `src/` e `supabase/`]. A promessa na tela não se cumpre.
- Hoje o que existe de aviso: a Mesa (visual), o e-mail diário (só em atraso/hoje, **sem débitos automáticos**) e o semanal.
- **Decisão sua:** (a) **ocultar** os campos até existirem (0,5 d, recomendado agora) ou (b) **cumprir** (e-mail/notificação "vence em 5 dias / amanhã / hoje", ~3 d, casando com a Central de Comunicação).

### F-11 — Outros pontos da recorrência

- `toggle` (ligar/desligar) sem `try/catch`: se a RLS barrar, `conferir` lança e o clique **não faz nada nem avisa** (`FinancasRecorrencias.tsx:66`).
- **Duplicar** não existe: para criar o "gêmeo" (outra unidade do mesmo fornecedor) a pessoa refaz tudo. Sugestão: "Duplicar" abre o formulário preenchido, sem id, com sufixo no nome.
- O campo **Valor** é `type="number"` (`:301`); a casa tem `lib/dinheiro.ts` (`paraNumero`) justamente porque o campo numérico trata vírgula de forma inconsistente — o `LancamentoForm` já usa. Padronizar.

## 3. ITEM 2 — Estados da despesa: de "discretos" a legíveis

### Como está hoje [código]

| Onde | Como o estado aparece |
|---|---|
| **Extrato da conta** (`FinancasConta.tsx:70-77, 626`) | **só a cor do texto da data** (`previsto` âmbar, `conciliado` verde, `realizado` preto, `cancelado` cinza riscado). O ícone foi **retirado a pedido seu em 22/09** ("tire o ícone de check da data") |
| **Extrato de Obrigações** (`lib/extratoDeObrigacoes.ts:50-63`) | selo com glifo + palavra (✓ Paga, ! Em aberto, ↺ Reembolso, ◆ Terceiro, ✕ Cancelada) — **o melhor padrão que já existe** |
| **Mesa — débitos** (`DebitoChip.tsx`) | chip 🔵🟡🔴✅ com palavra |
| **Mesa — contas** | linha com dias e cor; não há selo |
| **Detalhe** (`DetalhesDoLancamento`) | texto cinza `STATUS_LABEL` |

Três vocabulários para o mesmo ciclo: `FinStatus` (Previsto/Realizado/**Conferido / conciliado**/Cancelado/…), `SituacaoDaObrigacao` do Extrato (**Em aberto**/**Paga**/…) e `SituacaoDaObrigacao` de `liquidacao.ts` (**Previsto**/**Pago Integralmente**/…). **Dois tipos com o mesmo nome e valores diferentes** (F-14). E **"em atraso" não existe como estado**: é só cálculo de dias, dito em cada tela de um jeito.

### Proposta: um único `StatusChip` (glifo + palavra + cor — nunca só cor)

Tokens já existentes (`success`/`warning`/`info`/`destructive`/`muted`, no padrão `border-*-line bg-*-soft text-*-text` do `DebitoChip`). A regra de ouro: **o chip é informativo, nunca clicável** (você pediu "conciliar só pela caixa de seleção").

| Estado | Palavra | Glifo | Cor | Nota |
|---|---|---|---|---|
| Prevista | **Prevista** | ○ | azul (info) | contorno vazado: "ainda não aconteceu" |
| Vence hoje | **Vence hoje** | ◔ | âmbar (warning) forte | só sobre Prevista |
| Em atraso | **Atrasada há 5d** | ! | vermelho (destructive) | **sobreposição** de Prevista, não estado novo; mostra os dias |
| Paga / Realizada | **Paga** (saída) · **Recebida** (entrada) | ● | verde-claro (success-soft) | o dinheiro saiu, banco ainda não confirmou |
| Conciliada | **Conciliada** | ✓✓ | verde cheio (success) | dupla confirmação; preenchimento sólido a distingue da Paga |
| Cancelada | **Cancelada** | ✕ | cinza + riscado | |
| Aguardando banco | **Aguardando banco** | ◌ | âmbar | débito automático vencido |
| Possível falha | **Possível falha** | ⚠ | vermelho | débito não encontrado |
| Reembolso / Terceiro | **Reembolso a pagar** · **Quitada por terceiro** | ↺ · ◆ | índigo/roxo discreto | já existem no Extrato de Obrigações |

- **Vocabulário único:** "Paga" e "Realizada" são o mesmo estado — recomendo **"Paga"** na tela (e "Recebida" para entrada) e manter `realizado` só no banco. O `FinStatus` "Conferido / conciliado" passa a **Conciliada** (a distinção "à mão × banco" fica num ponto pequeno/`title`).
- **Onde pôr:** coluna estreita **"Situação"** no Extrato da conta (a cor da data volta a ser só data) e no detalhe; mesma peça na Mesa, Fila, Calendário (ponto colorido), Extrato de Obrigações e e-mails.
- **Acessibilidade/impressão:** glifo + palavra funcionam em papel preto-e-branco e para daltônicos (o Extrato de Obrigações já faz assim).
- **Esforço:** componente + mapeamento puro testado (1,5 d) + trocar nas 6 telas (2 d) + unificar os dois tipos `SituacaoDaObrigacao` (0,5 d) = **3–4 dias**. Quick win imediato: o selo "Atrasada há Nd" nas linhas (0,5 d).

## 4. ITEM 3 — Débito automático: o que já existe, o que falta

### O seu fluxo ideal × o código de hoje

| Passo que você descreve | Hoje | Situação |
|---|---|---|
| 1. Alerta no vencimento | Mesa mostra (previsto → hoje → aguardando → possível falha, 3 dias de tolerância); semanal tem o bloco; **e-mail diário NÃO inclui débitos**; lembretes da recorrência não funcionam (F-04) | **Parcial** |
| 2. Aparecer na Mesa | card "Débitos automáticos" + indicadores + "Débitos a conferir" | **Feito** |
| 3. Solicitar confirmação | "Aguardando confirmação bancária" é só **estado**: não há pedido ativo (notificação/e-mail) nem botão "confirmar que debitou" sem OFX | **Parcial** |
| 4. Conciliação via OFX = comprovação | `conciliarDebitos` põe o previsto como **conciliado**, com o dia e o valor do banco e o FITID (`importacaoOfxService.ts:~620-650`); `documentacaoDaSaida` troca "comprovante" por "Confirmação bancária" (22/10) | **Feito — mas incompleto (F-05)** |

### O que está inconsistente (F-05, F-13)

- **A Mesa e o Painel ainda cobram comprovante de débito automático.** O card "Comprovantes pendentes" da Mesa marca "sem comprovante" todo pago dos últimos 7 dias sem `comprovante_url` nem **qualquer** anexo (`mesaOperacoesService.ts:80-96`, `MesaDoTesoureiro.tsx:234`) — não aplica a regra de 22/10. O Painel (`painelTesourariaService.ts:128-133`) conta só `comprovante_url` e **ignora anexos**. Já a Prontidão/Ciclo/Extrato usam a regra nova. **Três definições de "tem comprovante"**: um mesmo débito conciliado está "ok" no Extrato e "pendente" na Mesa. É a causa direta do que você descreve ("ficam pendentes aguardando comprovante").
- Na Mesa, **qualquer anexo** (até uma nota fiscal) conta como comprovante; no Painel, só o campo do comprovante.
- **"Possível falha" sem saída** [a confirmar na tela]: 7 em 20/10, as seis de set–nov "provavelmente pagas por outro caminho". A resolução hoje é abrir o lançamento; falta uma ação direta "Foi pago por outro meio" / "Não foi debitado".
- O **e-mail diário** exclui por desenho toda forma automática; nos dias de débito a Tesouraria não recebe nada sobre ele.

### Fluxo recomendado

1. **Definição única de "comprovado"** (função pura, usada por Mesa, Painel, Prontidão, Ciclo e Extrato): `documentacaoDaSaida` já é a base — a Mesa e o Painel passam a perguntá-la. *(F-05 — 1 dia, quick win)*
2. **Vencimento:** o e-mail diário ganha o bloco curto "Débitos automáticos de hoje" e "Possíveis falhas (conferir o extrato)", sem linha digitável. *(0,5 d)*
3. **Confirmação:** "Aguardando banco" ganha duas ações no card — **Conciliar com o extrato** (abre o OFX/vínculos) e **Já foi pago/não debitou** (com motivo). *(1,5 d)*
4. **OFX = prova:** mantém. Ao importar um OFX com o débito, **sugerir já marcado** (não só listar) quando valor e data batem (variável: faixa) — a pessoa só confirma em lote. *(1 d, após ver a taxa de acerto)*
5. **Prontidão:** débito conciliado nunca aparece como pendência de comprovante.

## 5. ITEM 4 — Anexos: campos de upload que não limpam

### Mapa dos campos de arquivo da Tesouraria (o app inteiro tem 36)

| Componente | Limpa depois de salvar? | Observação |
|---|---|---|
| **Anexos da despesa** (`AnexosLancamentoDialog:241`) | **NÃO** | `setArquivo(null)` mas o `<input type="file">` não é controlado: o nome do arquivo **continua à vista** com o diálogo aberto (é o seu relato) |
| **Declaração do terceiro** (`DeclaracaoDoTerceiroCard:132`) | **NÃO** | mesmo padrão; o cartão não se desmonta |
| **Cancelar nota** (`CancelarNotaDialog:48`) | só no sucesso | cancelar/fechar sem salvar guarda arquivo e motivo; reabrir mostra o campo vazio com o arquivo ainda no estado (**botão liberado com arquivo invisível**) |
| Pagar reembolso, Pagar (AlertDialog), Recalcular guia | sim (reiniciam a cada abertura / fecham) | Recalcular guia tinha o defeito da linha acima; corrigido |
| Quitação, Documentos do fechamento, Importar fatura | **sim** (`value=""`/ref) | **são o modelo certo** |
| "Ler nota/comprovante" (`LancamentoForm:1283`), Transferência (`:213/221`), OFX (`ConciliacaoOFXDialog:934`) | não limpam | entrada **oculta**: escolher o **mesmo arquivo** de novo não dispara nada (o navegador acha que não mudou) — parece que o botão "quebrou" |

**Correção:** um `CampoDeArquivo` único (controlado: `key` que muda ao salvar + `value=""`), usado nesses 8 pontos; regra de casa "campo de arquivo sempre zera ao concluir e ao reabrir". 0,5 d, com teste por componente.

## 6. Auditoria ampliada — o que mais encontrei

### F-06 — Três respostas para "o que está atrasado"

- **E-mail diário:** `resumo_diario_dados` — saída prevista, **exclui** reembolso pendente (`NOT EXISTS vw_fin_quitacao … reembolso`) e as formas automáticas; sigilosos entram.
- **Semanal:** `resumo_semanal_obrigacoes_abertas` — saída prevista, **só exclui automáticas**: **inclui** a despesa com reembolso pendente (o mesmo valor aparece também no bloco "Reembolsos").
- **Mesa/Extrato:** outras regras (fila do dia, vencimentos).
- **Sintoma real (suas capturas de 23/10):** semanal "8 contas atrasadas · R$ 14.645,56" × diário "6 em atraso · R$ 9.618,60 (+1 reembolso, +1 sem meio)". Parte da diferença é a data/escopo, parte é regra. **[números a conferir com dados do mesmo instante]**
- **Correção:** uma única função de "obrigações em aberto" (SQL) com as exclusões **nomeadas** (`inclui_reembolso`, `inclui_automatica`), consumida por diário, semanal, Mesa e Extrato; os rótulos dizem o que contam. 1,5 d + ensaio.

### F-07 — Despesa manual nasce "Realizada"

- `useState<FinStatus>("realizado")` (`LancamentoForm.tsx:165`) e `setStatus("realizado")` ao abrir um lançamento novo (`:445`); o seletor "Situação" permite também **Conciliado** na criação.
- **Impacto:** "Novo lançamento" para uma conta a pagar já registra como paga: mexe no saldo na hora, **pula a liquidação**, a documentação e o vínculo com o extrato — e contradiz o seu modelo (toda despesa nasce **prevista**).
- **Correção:** para **saída**, padrão **Prevista**; "Realizada" só com data de pagamento + conta; "Conciliada" **só pelo vínculo com o extrato** (nunca no formulário). Entradas podem manter "Recebida" (ofertas do dia). 0,5 d. *Decisão sua:* manter atalho "já paguei" explícito.

### F-15 — Guia recalculada ainda não paga (efeito conhecido)
`vw_fin_obrigacoes` soma o encargo ao "pago": até pagar, os painéis que a leem mostram o saldo **antigo**. A lista de pagar e o Pagar usam o valor novo. Corrigir exige reescrever a view (com a definição viva) — 1 dia.

### F-16 — Qualidade de cadastro
Favorecido "Leandro Dias Goncalves 11098354770" (nome + CPF) aparece na lista de atrasadas do semanal. Pode ser intencional (para distinguir homônimos); se não, o CPF deve ir no campo próprio. **[a confirmar]**

## 7. A Mesa responde "o que preciso fazer agora?"

**Avaliação por pergunta** (a Mesa foi redesenhada em 23/10 e você está observando o uso; esta é só a leitura do código):

| Pergunta | Responde? | Por quê |
|---|---|---|
| O que pagar hoje? | **Sim** | Fila do dia / agenda da semana; ordem única |
| O que está atrasado? | **Em parte** | o número difere do e-mail e do semanal (F-06) |
| O que o banco deve debitar? | **Sim** | card de débitos |
| O que falta de documento? | **Em parte** | "Comprovantes pendentes" e "Documentos para a contabilidade" usam **definições diferentes** (F-05) |
| O que fechar este mês? | **Sim** | aviso do fechamento (dias 1–20 e 3 últimos) |
| Há dinheiro reservado/comprometido? | **Sim** | saldo Livre/Reservado |
| O que fazer com o reembolso? | **Sim** | quem recebe, conta, Pix (e espécie) |
| E se "nada" está pendente? | **Não** | não há mensagem de "tudo em dia" única; cada cartão diz o seu |

**Sugestão estrutural (não urgente):** uma faixa **"Agora"** no topo com **no máximo 3 itens** ordenados por risco (atrasada de valor alto → débito possível falha → documento do mês anterior a fechar), cada um com a ação primária; o resto fica abaixo como hoje. Os selos de F-08 e a definição única de F-06 são pré-requisitos.

## 8. Quick wins (pode sair em 1–2 dias de trabalho, sem decisão sua)

1. **F-01** proteção central do Select (resolve conta/categoria/centro sumindo) — **0,5 d**
2. **F-09/F-10** zerar campos de arquivo e estados fantasma — **0,75 d**
3. **F-07** saída manual nasce **Prevista** — **0,5 d**
4. **F-05** Mesa e Painel passam a usar a regra de comprovante/confirmação — **1 d**
5. **F-02** propagar a conta da recorrência aos previstos futuros — **1 d**
6. **F-04 (ocultar)** esconder os lembretes que não funcionam — **0,25 d**
7. **F-11** tratamento de erro no liga/desliga — **0,25 d**

## 9. Melhorias estruturais

- **Selo de situação único + vocabulário único** (F-08, F-14) — 3–4 d.
- **Uma só definição de "em aberto" e de "comprovado"** servindo Mesa, e-mails, Painel, Prontidão (F-05, F-06) — 2,5 d.
- **Ciclo de vida da recorrência** (encerrar com os previstos, duplicar, propagar conta) (F-02, F-03, F-11) — 2,5 d.
- **Cumprir os lembretes** de vencimento/débito pela Central de Comunicação (F-04, F-13) — 3 d.
- **Débito automático "de ponta a ponta"**: ações no card, sugestão marcada ao importar OFX (F-13) — 2,5 d.

## 10. Roteiro sugerido

| Fase | Conteúdo | Esforço | Entrega |
|---|---|---|---|
| **1 — Estancar** | F-01, F-09, F-10, F-07, F-04 (ocultar), F-11 (erro) | ~2,5 d | numa publicação só; sem migration |
| **2 — Coerência** | F-05, F-06, F-02, F-03 | ~5 d | 1 migration (função única de "em aberto"); ensaio no Postgres local |
| **3 — Clareza** | F-08/F-14 (selos e vocabulário), F-13 (débito), faixa "Agora" | ~6–7 d | em etapas, tela a tela, com você aprovando o visual |
| **4 — Promessas** | lembretes de vencimento (F-04b) | ~3 d | depende da Central de Comunicação |

## 11. Decisões que preciso de você

1. **F-01:** posso aplicar a proteção central do Select agora (é o item de maior risco e o mais barato)?
2. **F-07:** despesa manual passa a nascer **Prevista**? Mantenho um atalho explícito "Já paguei"?
3. **F-04:** **ocultar** os lembretes já, ou **cumprir** depois (e-mail "vence em 5 dias / amanhã / hoje")?
4. **F-03:** ao desativar/excluir uma recorrência, cancelar os previstos futuros **por padrão** (com confirmação)?
5. **Vocabulário (F-08):** "Paga/Recebida" no lugar de "Realizada", e "Conciliada" no lugar de "Conferido / conciliado"?
6. **Selos:** aprova o desenho acima (○ ◔ ! ● ✓✓ ✕) ou prefere ícones preenchidos? E o chip fica numa coluna "Situação" no extrato da conta?
7. **F-06:** reembolso pendente deve aparecer em "atrasadas" do semanal (hoje sim) ou só no bloco "Reembolsos" (como o diário)?
8. **F-13:** o e-mail diário deve citar os débitos automáticos de hoje e as possíveis falhas?
9. Para fechar o que ficou **[a confirmar na tela]**: posso conduzir uma sessão sua logada (você me diz quando) para eu reproduzir F-01 no formulário de lançamento e medir os números do F-06 com dados do mesmo instante?
