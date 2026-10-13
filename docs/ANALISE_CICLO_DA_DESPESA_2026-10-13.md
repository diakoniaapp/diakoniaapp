# Uma despesa, uma identidade — análise do ciclo de vida no DiakoniaApp

Levantamento de **13/10/2026**. Só leitura: código (`src/`, `supabase/migrations/`, `docs/`) e banco de produção (contagens e consultas de leitura pela sessão do app). **Nenhum código foi alterado por esta análise.** Onde não consegui provar, está escrito **(não verificado)**.

---

## 0. A resposta curta

**O sistema já tem a espinha certa e ainda tem as portas erradas.**

- **A espinha está certa.** Existe **uma única tabela** para a despesa em qualquer etapa — `fin_lancamentos` — com uma máquina de estados (`previsto → realizado → conciliado`, mais `cancelado` e `aguardando_aprovacao`). A recorrência gera **uma linha por vencimento**; "Pagar", o débito automático do OFX e a fusão **mudam a mesma linha**; anexos, liquidação e extrato **apontam para o `id` dela**. Não há "uma tabela de obrigação" e "uma tabela de pagamento" competindo.
- **As portas erradas** são os caminhos em que o **pagamento é visto antes (ou sem) a obrigação** e, por isso, **nasce uma linha nova** em vez de evoluir a existente: linha do OFX sem par (77 das 232 saídas de set/out), importação do Omie (32), lançamento manual (26), PDF do Invest Fácil. Era isso que produzia Ana/Carlos/Denise/Verisure — a obrigação ficava aberta e o pagamento entrava como outro lançamento. A defesa existe hoje para **parte** dessas portas (OFX e "Contas já pagas"), não para todas.
- **O ciclo de 6 estados não é um campo.** É **calculado** (`lib/cicloDaDespesa.ts`) a partir de `status`, `data_pagamento`, do marcador `[ofx:…]` em `observacoes`, de anexos e da categoria. Funciona, mas é derivado de texto livre e de um `status` que hoje significa duas coisas diferentes (ver §4.3).
- **"Arquivada" não existe** em lugar nenhum. O envio do malote é registrado **por mês**, não por despesa, e a tabela de envios está **vazia** (0 linhas).

Princípio a validar — *"uma despesa criada por recorrência não deve ser duplicada, só evoluir"*: **vale para o caminho feliz (recorrência → Pagar → OFX) e está medido: 0 ocorrências duplicadas** (mesma `recorrencia_id` + mesma data) entre 15/08 e 15/11. **Não vale ainda para os caminhos que começam pelo pagamento.**

---

## 1. Fluxo atual real (o que o código faz hoje)

```
RECORRÊNCIA (fin_recorrencias, 37 ativas)
   │  gerador no app (recorrenciaService) — UMA linha `previsto` por vencimento, com recorrencia_id
   ▼
fin_lancamentos  status = previsto            ← 2.179 saídas previstas (2.161 vindas de recorrência)
   │
   ├─ MESA / CONTAS A PAGAR: lista os previstos; "Pagar" → confirmarPagamento ou fin_liquidar
   │        MESMA LINHA vira realizado (data_pagamento, valor real).  Pagamento PARCIAL: a linha original continua
   │        previsto com o saldo e nasce uma 2ª linha (a parcela paga) ligada por obrigacao_id.
   │
   ├─ DÉBITO AUTOMÁTICO: o previsto fica esperando o banco; o OFX o encontra e a MESMA LINHA vira conciliado.
   │
   ├─ OFX (ConciliacaoOFXDialog → importacaoOfxService.analisar) classifica cada linha do extrato em:
   │     1. FITID já importado                          → pula
   │     2. casa com realizado/conciliado               → "já registrada"
   │     3. débito automático previsto compatível       → concilia o previsto (mesma linha)
   │     4. documento previsto provável (valor+favorecido) → só uma DICA; a tesouraria escolhe liquidar o documento
   │     5. nada casa                                   → CRIA lançamento novo (origem importado_ofx)   ← porta de duplicidade
   │
   ├─ "CONTAS JÁ PAGAS" (Mesa): varre previstos abertos que já têm pagamento registrado e FUNDE em uma linha
   │        (fin_liquidar_com_pagamento_existente) — correção DEPOIS do fato.
   ▼
EXTRATO DA CONTA (FinancasConta / ExtratoContaDrawer / RelatorioContas): só LÊ fin_lancamentos (data de caixa)
   ▼
ANEXOS (fin_lancamento_anexos, por lancamento_id; 239 anexos) → comprovante
   ▼
FECHAMENTO MENSAL (aba 4) → PACOTE CONTÁBIL (ZIP) → registrarEnvio (fin_malote_envios: por MÊS)
```

### Números que sustentam o diagnóstico (consultados em 13/10/2026)

| Medida | Valor |
|---|---|
| Saídas por status | previsto 2.179 · realizado 212 · conciliado 4.919 · cancelado 0 · aguardando_aprovacao 0 |
| Saídas pagas em set–out/2026 (232) por **origem** | OFX **77** · transferência 52 · Omie 32 · manual 26 · **recorrência 45** (37 já com liquidação) |
| Ocorrências duplicadas de recorrência (mesma série + data) | **0** |
| Previstos já vencidos | **7**: 3 reembolsos avulsos (11/10), Carreta Missionária R$ 300 (10/10), CEG R$ 207 e Claro R$ 257,96 (débito automático, 08/10), **Light R$ 1.489,15 (débito automático, 15/09 — 28 dias aberto)** |
| Possível "gêmeo" (previsto aberto + pagamento do mesmo favorecido em ±12 dias) | **1** — a Light acima (há um conciliado de R$ 456,38 em 15/09 de **outra** recorrência da Light; **precisa de conferência dela** — pode ser duas instalações, pode ser o débito que cumpriu a recorrência errada) |
| `conciliado` com marcador de OFX (`[ofx:…]`) | **336 de 13.147** (2,6%) — o resto é histórico do Omie e conferência manual |
| Saídas pagas de set–out **sem nenhum anexo** | 154 de 232 (52 são pernas de transferência, que não pedem documento); entre as 45 que seguiram a recorrência, **17 ainda sem documento** |
| `fin_malote_envios` · `fin_fechamentos_periodo` · `fin_extrato_ignorados` | **0 · 0 · 0** linhas — existem, nunca usadas |

---

## 2. Módulo por módulo

Legenda: **Nasce** = onde a despesa passa a existir · **Muda** = o que ele altera · **Some** = quando deixa de aparecer como trabalho · **Histórico** = quando vira só consulta.

| # | Módulo | Responsabilidade (o que deveria ser) | Nasce | Muda status | Some da fila | Vira histórico | Observação |
|---|---|---|---|---|---|---|---|
| 1 | **Recorrências** | Contrato: modelo (favorecido, valor, categoria, centro, forma de liquidação) e calendário | **Sim — é a origem**: uma linha `previsto` por vencimento | Não | — | Ao pagar a ocorrência | Gerador no app (`recorrenciaService`); o **gerador SQL antigo** (`fin_gerar_recorrencias`) continua no banco e `finService.gerarRecorrencias` o envolve, **sem uso** hoje — é um segundo gerador latente |
| 2 | **Mesa de Operações** (aba 1) | Fila de trabalho do tesoureiro: o que pagar, o que conferir, o que anexar | Não | Indiretamente (botões) | Débito automático sai de "a pagar" e entra em "débitos automáticos" | — | **Só lê.** Também hospeda "Contas já pagas" (a correção de duplicidade) |
| 3 | **Contas a Pagar** | A mesma fila, filtrada por vencimento | Não | "Pagar" → `realizado` | Ao pagar | — | **Não é um módulo separado**: é a visão `previsto` + saída da Mesa. Nome em três lugares (Mesa, Painel, Pagar) para a mesma lista |
| 4 | **Central de Pagamentos** | Pagar com leitura do boleto/guia/fatura/PIX, sugerir e aprender | Não | `previsto → realizado` (`fin_liquidar`) | Ao pagar | — | `documentoPagamentoService` lê o arquivo; `LiquidacaoPainel` faz o pagamento parcial/juros/multa/desconto. Responsabilidade **dividida** entre Mesa, Central e Painel, mas todas gravam via as mesmas funções |
| 5 | **Extrato Financeiro** | Livro-caixa por conta (data de caixa, saldo, fechamento do dia) | Não — mas **admite lançamento manual** ("Novo lançamento") | Marca `conciliado` à mão (checkbox) | — | Sempre (é histórico) | Lança direto da tela: é uma **porta de entrada de pagamento sem obrigação** |
| 6 | **Importação OFX** | Trazer o extrato e propor o que cada linha é | **Sim** (caso 5 do fluxo: linha sem par) | Concilia previsto de débito automático; marca FITID | — | — | Porta de duplicidade principal |
| 7 | **Conciliação bancária** | Provar que o lançamento existe no banco | Não | `realizado → conciliado` | — | Ao conciliar | **Um motor** (`ConciliacaoOFXDialog`, com a Mesa de Conciliação e `LiquidarPeloExtratoDialog` dentro) **montado em 3 lugares** (Painel, extrato da conta, `ConciliacaoDrawer`) + a marcação manual por checkbox |
| 8 | **Liquidações** | O ato de pagar (`fin_liquidacoes`): vários documentos, parcial, encargos | Cria a 2ª linha só em **pagamento parcial** | `previsto → realizado` | — | Sempre | 39 liquidações. Juros/multa/desconto agora são **campos** da obrigação |
| 9 | **Documentos anexados** | Boleto, guia, XML, comprovante ligados à despesa | Não | Não | — | — | Ligados ao **`lancamento_id`**, não à obrigação (ver §4.4) |
| 10 | **Malote Contábil** | Pacote mensal para a contabilidade | Não | **Não grava nada na despesa** | — | — | Existem **dois malotes**: Fiscal (`fiscalService`) e Pacote Contábil (`pacoteContabilService`). O envio é **por mês** |

---

## 3. Duplicidades — onde o sistema pode gerar cada tipo

### 3.1 Lançamento duplicado (a mesma saída em duas linhas)
| Porta | Situação |
|---|---|
| **OFX, caso 5** (linha sem par vira lançamento) | Protegida em parte: o OFX procura **previstos** de débito automático e **dá a dica** de documento provável. **Mas a dica não obriga**: se ela clicar "registrar como novo" em vez de "liquidar o documento", o previsto fica aberto e o pagamento vira outra linha. **Foi exatamente o caso Ana/Carlos/Denise.** |
| **Lançamento manual no extrato** | Sem nenhuma busca por obrigação aberta do mesmo favorecido. |
| **Importação Omie / fatura de cartão / Invest Fácil (PDF)** | Têm trava contra **reimportar o mesmo arquivo** (hash + FITID/chave), mas **não** procuram obrigação aberta. O Omie é histórico, então é aceitável; o Invest Fácil tem índice único contra duplicar a **própria** chave. |
| **Recorrência × SQL antigo** | Se alguém chamar `fin_gerar_recorrencias`, gera por outro critério e pode duplicar ocorrências. Hoje ninguém chama (**cron não verificado**: não há `cron.schedule` para ela nas migrations). |

### 3.2 Obrigação duplicada
- **Medido: zero** (mesma série + mesma data).
- **Risco estrutural:** a unicidade da ocorrência **não é garantida pelo banco** (não há índice único em `recorrencia_id + data`); depende de o gerador do app não rodar duas vezes em paralelo. Hoje é só disciplina.

### 3.3 Pagamento duplicado
- O mesmo extrato importado duas vezes: **protegido** (FITID).
- O mesmo pagamento "casado" a dois previstos: **protegido** em "Contas já pagas" (um pagamento serve a **uma** obrigação) e na fusão atômica (recusa se o pagamento já estiver ligado a algo).
- Duas pessoas conciliando a mesma linha ao mesmo tempo: **protegido** nas rotas do Invest Fácil (índice único + comparação-e-troca); **não** nas demais (depende de RLS e de quem clicar primeiro). **(não verificado em todas as telas)**

### 3.4 Histórico duplicado
- **Dois sentidos de "conciliado"** (ver §4.3): o histórico mostra `conciliado` para linhas que só foram *marcadas*, e para linhas casadas com o extrato. Quem lê o extrato não distingue.
- **Legado de encargos:** antes de 08/10 juros/multa eram lançamentos separados. A migration `20261008200000` os incorporou (4 componentes). Não há mais lançamento de encargo solto **(medido na aplicação da migration)**.

---

## 4. Quebras de continuidade (onde a identidade se perde)

### 4.1 O pagamento nasce sem obrigação
77 das saídas de set–out nasceram de linha de extrato. Muitas **não têm obrigação** (tarifa, PIX avulso) — isso é correto. O problema é as que **tinham** (contas recorrentes pagas por boleto/PIX) e o OFX não soube ligar. Hoje a ligação é **heurística** (valor + favorecido + janela) e só vira sugestão.

### 4.2 O vínculo com o extrato é um texto
O elo entre a despesa e a linha do banco é `[ofx:FITID]` dentro de `observacoes`. Funciona e tem índice, mas:
- é frágil (uma edição de observação o apaga — foi o motivo do compare-and-swap no Invest Fácil);
- não há tabela de vínculos, então **"esta linha do banco está ligada a quê?"** exige varrer texto;
- a ordem da linha no dia (`ordem_banco`) **ainda não existe no banco** (migration `20261008210000` **não aplicada**).

### 4.3 `conciliado` significa duas coisas
- (a) "casado com uma linha do extrato OFX"; (b) "alguém marcou o checkbox" (`conciliarLancamento`) ou "veio assim do Omie".
- Medido: só **336 de 13.147** `conciliado` têm marcador de OFX.
- Consequência: o estado **Conciliada** do ciclo prova pouco. O ciclo atual contorna com a etapa "OFX vinculado" separada, mas o `status` em si não distingue.

### 4.4 Documentos presos à linha, não à obrigação
Os anexos apontam para `lancamento_id`. Para a despesa comum, é a mesma coisa. **Pelo código** (`carregarDetalhesDaDespesa` lê `listarAnexos(l.id)` da linha aberta): num **pagamento parcial**, que gera uma segunda linha, o documento fica numa linha e o comprovante da parcela em outra, e o detalhe de uma **não mostra** o que está na outra. **(não verifiquei com um caso real — não há parcial em aberto hoje além da Denise, ainda não liquidada)**
Outro ponto: a coluna antiga `comprovante_url` existe junto da tabela de anexos (hoje 0 linhas usam a coluna — legado morto, mas o código ainda a lê).

### 4.5 "Arquivada" e o malote não tocam a despesa
- O malote é gerado no navegador e baixado; `registrarEnvio` grava **um registro do mês** (`ano`, `mes`, dossiês, pendências) — **0 linhas hoje**.
- `fin_fechamentos_periodo` (travar o mês: aberto → fechado → aprovado, com gatilho que bloqueia edição) existe e **nunca foi usada** (0 linhas).
- Portanto uma despesa **não sabe** em qual malote foi enviada nem se o mês foi travado. O sétimo estado (Arquivada) é, hoje, impossível de afirmar.

### 4.6 Várias telas para a mesma decisão
Conciliar: um motor em 3 pontos de entrada + checkbox manual (que não passa pelo motor). Pagar: Mesa, Painel, "Pagar" do extrato, Central de Documentos. Malote: Fiscal e Contábil. Todas gravam nas mesmas linhas (bom), mas **cada uma impõe um critério diferente de "pronto"**.

---

## 5. O que já existe e atende ao fluxo

| Funcionalidade | Atende a | Estado |
|---|---|---|
| `fin_lancamentos` como entidade única + `recorrencia_id` | identidade do nascimento ao pagamento | ✅ em uso |
| Gerador de recorrências no app (parcelas, horizonte, favorecido real) | obrigação nasce **uma vez por vencimento** | ✅ (0 duplicadas) |
| `fin_liquidar` + `fin_liquidacoes` (39) | pagar sem criar segunda linha (exceto parcial) | ✅ aplicado |
| Encargos como campos da obrigação (`juros`, `multa`, `desconto`, `valor_original`) | extrato com **uma** linha | ✅ aplicado; extrato mostra "Detalhamento"; indicadores informativos no DRE/Orçamento/Dashboard |
| OFX: FITID, débito automático, dica de documento | evita duplicar | ✅ parcial (caso 4 é só dica) |
| "Contas já pagas" + `fin_liquidar_com_pagamento_existente` | **funde** obrigação aberta + pagamento existente, atômico | ✅ aplicado |
| `lib/cicloDaDespesa.ts` + `DetalhesDoLancamento` | os 6 estados, derivados, com o próximo passo | ✅ em uso (calculado) |
| Bloco "Ciclo do mês" no Fechamento | ver o mês por estado | ✅ |
| Pacote Contábil (ZIP) com anexos N por lançamento | malote | ✅ funcional, sem registro de envio por despesa |
| Leitura de boleto/guia (DARF, GPS, FGTS, ISS…)/fatura/PIX + aprendizado (`fin_documento_conhecimento`, 52 linhas) | documento ligado ao pagamento | ✅ em uso |

## 6. Pensado e não funcionando (ou nunca ligado)

| Item | Situação |
|---|---|
| **Estado "Arquivada" / malote por despesa** | não existe |
| **`fin_malote_envios`** | tabela existe, **0 linhas** — o botão de registrar envio nunca foi usado |
| **`fin_fechamentos_periodo`** (travar o mês) | existe, **0 linhas** |
| **Aprovação multinível** (`aguardando_aprovacao`, `aprovarLancamento`) | código e status existem; **0 lançamentos** nesse estado; pendente no roadmap |
| **Leitura de XML de NF-e** (Central de Documentos, Fase 2) | `lerArquivo` devolve "não lido" para `.xml`; planejado, não feito |
| **`ordem_banco`** (ordem igual à do banco) | código pronto, **migration não aplicada** |
| **Conta Corrente de Sustento** | código pronto, **migration `20261008170000` não aplicada** (`conta_sustento_id` ausente) |
| **Gerador SQL de recorrências** | wrapper `gerarRecorrencias` exportado e **sem uso**; função segue no banco |
| **`comprovante_url`** | coluna legada, 0 linhas |
| **Ignorar linha do extrato** (`fin_extrato_ignorados`) | 0 linhas |

---

## 7. Fluxo ideal (o que você descreveu, com as portas fechadas)

```
RECORRÊNCIA ─► OBRIGAÇÃO (1 linha por vencimento; única)
                  │ estado: PREVISTA ─► EM ABERTO (venceu ou foi para a fila)
                  ▼
            PAGAMENTO  (Pagar / débito automático / PIX)    ← só EVOLUI a mesma linha
                  │ PAGAMENTO REALIZADO
                  ▼
            EXTRATO (a linha do banco se LIGA à obrigação; nunca cria outra se existir uma aberta compatível)
                  │ AGUARDANDO CONCILIAÇÃO ─► CONCILIADA (com o FITID como prova)
                  ▼
            DOCUMENTO + COMPROVANTE (da obrigação, não da linha)
                  │ PRONTA PARA MALOTE
                  ▼
            MALOTE (registra QUAL despesa foi em QUAL envio) ─► ARQUIVADA (mês aprovado/travado)
```

Regras de ouro:
1. **Quem enxerga o pagamento primeiro procura a obrigação aberta antes de criar qualquer coisa** — qualquer porta (OFX, manual, Omie, PDF).
2. **A ocorrência da recorrência é única por construção** (índice no banco, não só disciplina do gerador).
3. **Conciliada** só quando há vínculo com o extrato; a marcação manual é outro estado ("conferida").
4. **Documento pertence à obrigação** (todas as parcelas a enxergam).
5. **Arquivada** é fato registrado (envio + mês travado), não inferência.

---

## 8. Proposta de arquitetura — uma identidade do nascimento ao malote

**Princípio:** a identidade é a **obrigação** (`obrigacao_id`, a raiz — já existe). Cada linha de `fin_lancamentos` é uma **parcela** dela; a obrigação comum tem uma só.

### Fase A — sem mexer em tabela (reduz o risco já)
1. **Todas as portas passam pela mesma pergunta**: "existe obrigação aberta compatível?" — hoje só OFX e a varredura fazem; estender ao lançamento manual do extrato e à importação de fatura/PDF (função pura já existe: `sugerirLiquidacoes`).
2. **Detalhe da despesa lê o grupo da obrigação** (documentos e comprovantes de todas as parcelas), não só a linha aberta.
3. **Conferir os 7 previstos vencidos** (em especial a Light R$ 1.489,15) — é o teste real do princípio.
4. **Aplicar** as duas migrations já prontas (`ordem_banco`, Sustento) quando você decidir.

### Fase B — migrations pequenas e reversíveis
1. **Índice único `recorrencia_id + data`** (parcial, só quando `recorrencia_id` não é nulo) — o banco passa a recusar a ocorrência duplicada. *Precisa de ensaio: pode haver uma série com duas parcelas no mesmo dia legítimas.*
2. **Tabela de vínculos do extrato** (`fin_extrato_vinculos`: conta, FITID, lançamento, quando, quem) — substitui o marcador em texto, que continua sendo escrito por compatibilidade. Dá a prova de "Conciliada".
3. **Separar "conferida" de "conciliada"** (coluna `conferido_em` para a marca manual; `conciliado` passa a exigir vínculo, com o legado do Omie classificado como histórico).
4. **Envio do malote por despesa**: `fin_malote_itens` (envio, lançamento) — liga a despesa ao pacote em que foi.

### Fase C — o estado vira consulta, não cálculo espalhado
1. **View `vw_fin_ciclo`** devolvendo o estado dos 7 (incluindo **Arquivada** = mês aprovado/travado + item de malote). Telas e relatórios leem dela; `lib/cicloDaDespesa.ts` passa a ser a mesma regra, com um teste que compara os dois.
2. **Usar `fin_fechamentos_periodo`** no fim do mês (aprovar → travar), que é o que faz a despesa virar histórico de verdade.

### Fora do escopo desta proposta (precisa de decisão sua)
- Aposentar o gerador SQL de recorrências e a coluna `comprovante_url`.
- Unificar os pontos de entrada da conciliação e da marcação manual (é redesenho de tela, não de modelo).
- Aprovação multinível (já no roadmap).

---

## 9. Conclusão — o sistema já está preparado?

| Pergunta | Resposta |
|---|---|
| A mesma despesa é acompanhada do início ao fim? | **Sim, no caminho feliz** (recorrência → Pagar → OFX/débito automático). **Não** quando o pagamento aparece antes da obrigação. |
| Hoje cria novos registros a cada etapa? | **Não** nas etapas internas (Mesa, Pagar, Central, Liquidação, Extrato, Malote **leem/alteram a mesma linha**). **Sim** em 4 portas de entrada: OFX sem par, manual, Omie/fatura, PDF. |
| Recorrência gera **uma** obrigação que evolui? | **Sim** (0 duplicadas medidas). A garantia hoje é do gerador, **não do banco**. |
| Documentos permanecem vinculados durante todo o ciclo? | **À linha, sim; à obrigação, só se ela tiver uma linha.** Em pagamento parcial, o detalhe não junta as parcelas. |
| Existe "Arquivada"? | **Não.** Falta registro de envio por despesa e uso do fechamento de período. |
| Fragmentação entre módulos? | **Pouca no dado, alguma na tela**: conciliação em 3 pontos de entrada mais a marcação manual, 3 nomes para "a pagar", 2 malotes, e dois significados de "conciliado". |

**O que eu faria primeiro** (ordem de valor/risco): (1) conferir a Light e os 6 outros vencidos; (2) Fase A-1 e A-2 (nenhuma migration); (3) índice único da ocorrência (Fase B-1) depois de um ensaio; (4) separar "conferida" de "conciliada" (B-3) — é o que mais distorce o que você lê hoje.
