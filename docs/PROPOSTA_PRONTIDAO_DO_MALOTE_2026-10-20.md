# Prontidão do Malote — proposta (20/10/2026)

Pedido dela: transformar a **Auditoria de Documentos** (hoje "com / sem documento") em um painel de **prontidão contábil do mês** e em uma **Central de Pendências do Malote**.
Nada foi implementado. Os números abaixo foram **medidos no banco de produção, só leitura**, com uma regra-rascunho minha (§3) — servem para ela ver o efeito antes de aprovar a regra.

## 1. O que existe hoje (e o que já resolve metade do pedido)

| Peça | Onde | O que faz |
|---|---|---|
| Auditoria de Documentos | `/financas/auditoria-anexos` (`pages/FinancasAuditoriaAnexos.tsx`) | classifica cada saída paga em **com / sem / dispensa** (`auditarAnexos` em `lib/pacoteContabil.ts`): "com" = **qualquer** anexo |
| Ciclo da despesa | `lib/cicloDaDespesa.ts` | já tem o estado **Pronta para Malote** = conciliada + classificada + *algum* documento original + comprovante; já dispensa tarifa e já não exige comprovante da igreja nas quitadas por terceiro |
| Documentos do Fechamento | `lib/fechamentoDocumentos.ts`, etapa 4 do `FechamentoMensal` | checklist mensal: extrato, OFX, cartão, adquirente (anexado / dispensado / faltando); no ar, com dados reais em setembro |
| Pacote / Malote | `services/pacoteContabilService.ts` | gera o ZIP; sai **com** pendências (decisão de 02/10) e as lista em `PENDENCIAS.csv` |
| Quitação por terceiros | `lib/quitacao.ts` (Matriz) | já sabe o que é "oferta formalizada" e "reembolso" |

**O defeito que ela descreveu é real e está em uma linha:** `situacao = lista.length > 0 ? "com" : …`. Um comprovante sozinho já vira "com documento". E as três telas (Auditoria, Fechamento, ciclo) leem a documentação por três caminhos diferentes — por isso a proposta é **uma regra só** (`lib/documentacaoExigida.ts`, pura e testada) que as três passam a usar.

## 2. O que a medição mostrou (setembro/2026: 144 saídas pagas)

Hoje a Auditoria diz "94 com documento / 4 sem / 46 dispensam" (tarifas). Com a regra por tipo:

| | Regra A — comprovante **sempre** (como o ciclo já exige) | Regra B — **sem** comprovante em Caixinha, Cartão e Envelopes |
|---|---|---|
| ✅ Completas | 48 | 73 |
| ⚪ Dispensam (tarifas) | 46 | 46 |
| 🟠 Parciais | 46 | 21 |
| 🔴 Sem documentação | 4 | 4 |
| **Prontas (completas + dispensam)** | **94 de 144 = 65%** | **119 de 144 = 83%** |

**A maior descoberta:** **30 saídas da Caixinha (16) e do Cartão (14) não têm comprovante** — e em 25 delas é só isso que falta (é a diferença entre as colunas acima). São pagamentos que **não geram comprovante bancário** (dinheiro vivo; compra no cartão, cuja prova é a fatura do cartão, que já é um *documento do fechamento*). No Bradesco, 55 de 61 têm comprovante. Ou seja: a regra "comprovante sempre" pune uma coisa que o banco nunca vai emitir. Decisão D2 abaixo.

Por tipo, setembro (regra A): NF/Fatura 59 de 74 (80%) · Comprovante 57 de 97 (59%) · Guia 5 de 6 · RPA 2 de 2 · RSP 3 de 4 · DPS 3 de 3 · Fatura (energia/água/gás/telefone) 4 de 6 · Boleto/Fatura (condomínio/seguros) 3 de 3. Outubro (42 saídas até hoje): 23 completas, 13 parciais, 4 sem, 2 dispensam.

**Setembro já foi enviado em 15/10 com 6 pendências** — o painel novo teria mostrado ~25 a 50 itens incompletos (conforme D2), não 6, porque hoje "com documento" é qualquer anexo. Isso não é erro do envio: é a régua que sobe.

## 3. Regra-rascunho (o que eu usei na medição)

A categoria **não** decide sozinha (Material de Consumo: NF em 17 de 25; Locação: NF ou Fatura). Por isso a regra é "**documento de origem aceito** + **prova do pagamento**", escolhida por tipo de despesa:

| Tipo de despesa (categoria / natureza) | Documento de origem — aceita qualquer um | Prova do pagamento |
|---|---|---|
| Tarifas, IOF, Juros, Encargos Bancários | **dispensa** (já existe) | dispensa |
| Energia, Água e Esgoto, Gás, Internet e Telefonia | Fatura | Comprovante |
| Salários | DPS | Comprovante |
| Prebenda | RSP | Comprovante |
| RPA Pessoa Física/Autônomo | RPA | Comprovante |
| Impostos e Taxas, Encargos Trabalhistas | Guia | Comprovante |
| Condomínio, Seguros, Projeto Missionário | Boleto, Fatura ou Contrato | Comprovante |
| **Todo o resto** (compras e serviços de PJ) | Nota Fiscal ou Fatura | Comprovante |
| Compra **ofertada** por terceiro (`quitado_terceiro`) | Nota Fiscal + Declaração do Terceiro | **nenhuma** da igreja (já é assim no ciclo) |
| **Reembolso** | Nota Fiscal + Declaração/Pedido do Terceiro + prova do pagamento do terceiro | Comprovante do PIX **da igreja** (ao pagar o reembolso) |

Onde mora a regra: uma tabela pura em código (como `CATEGORIAS_SEM_DOCUMENTO`), **sem migration**, por nome de categoria — a mesma escolha já feita para a dispensa. Se ela quiser mudar uma regra, é uma linha. A saída robusta (coluna `documentos_exigidos` em `fin_categorias` + tela de configuração) fica como fase 2, só se a tabela crescer.

## 4. Como ficaria a tela

**Topo — Prontidão do malote** (mês cheio por padrão = mês em fechamento): barra de progresso + "119 de 144 prontas · 83%", e abaixo as três contagens (✅ completas · 🟠 parciais · 🔴 sem documentação) + ⚪ dispensam. Ao lado, o veredito em uma linha: *"O escritório consegue trabalhar com este período"* (verde) ou *"Faltam N itens para o malote ficar 100%"*.

**Checklist do mês** (reaproveita o que existe): Obrigações completas · Obrigações sem documentação · Extrato bancário · OFX · Cartão de crédito · Cielo · Aplicação — cada uma ✅/⚠ com link para anexar. Vem de `checklistDeDocumentos` (já pronto).

**Por tipo de documento — Existentes × Necessários × %:** NF 59 de 74 · 80% etc., só com o que a regra **exige** (hoje a tela conta "quantas saídas têm o tipo", sem saber se precisava).

**Central de Pendências do Malote** (a fila): uma linha por obrigação incompleta, ordenada por gravidade e depois por valor:

`🔴 Crítica` — nenhum documento · `🟠 Parcial` — falta algum · `🔵 Administrativa` — documentos ok, falta algo de cadastro (categoria, centro, nº do documento, conferência)

Cada linha: Fornecedor · Valor · **Documento faltante** ("falta Nota Fiscal", "falta Comprovante") · Situação · Data · Projeto · Centro de custo · ações **[Anexar documento] [Editar obrigação] [Visualizar]** (as duas últimas já existem no Extrato de Obrigações e na Mesa; "Anexar" usa o `AnexosLancamentoDialog` já em uso). Filtros: gravidade, documento faltante, conta, centro, projeto. Resolver uma pendência recalcula o topo na hora.

**Integração (uma regra, três leitores):** a Auditoria, a etapa "Documentação" do Fechamento Mensal e o estado *Pronta para Malote* do ciclo passam a chamar a mesma `documentacaoDaSaida()`. Hoje o ciclo aceita "qualquer documento + comprovante"; com a regra por tipo ele passa a exigir o documento **certo** — é a mudança de maior alcance e a que muda quantas despesas aparecem como "Prontas" (D6).

## 5. Decisões que são dela (as outras eu resolvo com o padrão acima)

1. **D1 — Regra por tipo (§3):** a tabela está certa? Em especial: Salários só DPS? Seguros/Condomínio aceitam boleto no lugar de NF? Benefícios (comprovante sem fatura em 3 de 6) exige o quê?
2. **D2 — Comprovante em Caixinha, Cartão e Envelopes:** (A) exigir sempre, (B) **dispensar** — a prova é o cupom/NF (Caixinha, Envelopes) e a **fatura do cartão**, que já é documento do fechamento (Cartão). *Recomendo B*: o número sobe de 65% para 83% sem esconder nada, porque o que falta de verdade (NF) continua faltando.
3. **D3 — "Pronta" para o Fechamento:** continua o malote **saindo com pendência** (decisão de 02/10) — o painel só informa; ou o painel passa a **bloquear** o envio abaixo de X%? *Recomendo manter: informar, nunca bloquear.*
4. **D4 — 🔵 Administrativa:** minha leitura = documentação completa, mas falta categoria/centro/projeto/nº do documento/conferência (o que o ciclo chama de "classificação" e "conciliação"). É isso, ou ela pensava em outra coisa?
5. **D5 — Obrigações ainda abertas/previstas:** a Auditoria hoje só olha **saídas já pagas**. O malote do mês também inclui *avisos de reembolso* (dívida aprovada, não paga) e *compras ofertadas*. Entram na prontidão (como hoje no pacote) — confirma?
6. **D6 — Ciclo da despesa:** o *Pronta para Malote* passa a usar a regra por tipo (uma verdade só) ou a Auditoria usa a regra nova e o ciclo fica como está por enquanto? *Recomendo uma verdade só*, mas muda o contador de "Prontas" que a Mesa já mostra.

## 6. Plano de entrega (depois das respostas)

1. `lib/documentacaoExigida.ts` + testes (regra pura; reproduz os números acima nos dados reais) — sem tela.
2. Auditoria: topo de prontidão, checklist, "Existentes × Necessários".
3. Central de Pendências (fila com ações) dentro da própria tela — **rota e menu iguais; uma tela só**, para não haver duas Auditorias.
4. Fechamento Mensal e ciclo passam a ler a mesma regra (D6).

Sem migration em nenhum passo. Verificação: testes da regra contra os 144 de setembro e os 42 de outubro; tela em 1366/820/375; PDF/CSV da fila.
