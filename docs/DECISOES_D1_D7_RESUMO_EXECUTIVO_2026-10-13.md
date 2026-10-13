# Decisões D1 a D7 — resumo executivo para aprovação individual

13/10/2026. Nenhuma migration foi escrita. Números medidos hoje no banco de produção (somente leitura):

| Medida | Valor |
|---|---|
| Linhas em `fin_lancamentos` | **15.661** |
| …com `obrigacao_id` preenchido / nulo | **40** / **15.621** |
| `conciliado` (todas) / só saídas | **13.147** / **4.919** |
| …desses, com vínculo OFX (`[ofx:…]`) | **336** / **105** |
| `conciliado` **sem** vínculo (candidatos a "Conferida (Histórico)") | **12.811** (9.867 linhas do banco vieram do Omie) |
| Ocorrências de recorrência duplicadas (série + data), banco inteiro | **0** em 2.205 linhas |
| Envios de malote registrados · períodos fechados · reaberturas | **0 · 0 · 0** |
| Contas | 1 banco (Bradesco) · 5 **sem extrato OFX** (caixinha, envelopes, cartão, aplicação, poupança) |

## Decisões já tomadas por você (13/10/2026)

| | Decisão |
|---|---|
| Q1 | **0 dias**: antes do vencimento → *Prevista*; no dia → *Em Aberto*; depois → *Atrasada* |
| Q2 | O OFX **sempre pede um clique** quando há candidata |
| Q3 | Histórico do Omie = **Conferida (Histórico)**, nunca *Conciliada* |
| Q4 | Conta sem extrato: **documento + comprovante + conferência humana** bastam para *Pronta para Malote* |
| Q5 | **Reabrir** despesa enviada: só **Administrador** e **Tesouraria**; registrar motivo, data, hora, usuário, estado anterior e estado novo |
| Q6 | Comprovante único para vários documentos / guia para várias obrigações: **raro** (N para N descartado) |
| — | Recorrência: o aviso no gerador **não liga sozinho**; a ligação pede confirmação humana |

---

## D1 — A despesa é a obrigação; a linha é uma parcela de pagamento

**Objetivo:** a identidade da despesa passa a ser o `obrigacao_id`, sempre preenchido (a linha única aponta para si mesma). Continua **uma tabela**.
**Problema que resolve:** hoje a identidade só existe quando houve baixa parcial (40 de 15.661 linhas). Todo o resto é implícito, e cada tela precisa *lembrar* de olhar o grupo.

**Impacto:**
- **Banco:** a coluna já existe. Acrescentar: (a) um gatilho que, ao criar uma linha, preenche `obrigacao_id` com o próprio `id` quando vier vazio; (b) preencher as 15.621 linhas antigas. A view `vw_fin_obrigacoes` vira a leitura oficial da despesa.
- **Lançamentos existentes:** 15.621 linhas ganhariam `obrigacao_id = id`. Valor, status, saldo e extrato **não mudam**. O UPDATE em massa precisa ser em blocos (como já foi preciso nas recorrências, por causa do tempo limite do banco).
- **Alternativa mais leve:** só o gatilho para as linhas novas + ler `COALESCE(obrigacao_id, id)` nas antigas, **sem** tocar nas 15.621.
- **Necessita migration?** Sim
- **Pode ser revertida?** Sim (remover o gatilho; voltar o campo a nulo)
- **Grau de risco:** **Médio** com preenchimento em massa · **Baixo** com a alternativa leve

---

## D2 — O estado é derivado de fatos, calculado em um só lugar

**Objetivo:** uma leitura oficial (uma *view*) devolve o estado da obrigação, com a regra de Q1: Prevista → Em Aberto (no dia) → Atrasada (depois) → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta → Enviada → Arquivada. A lib de hoje vira o espelho testado dela.
**Problema que resolve:** o estado é calculado na tela por `lib/cicloDaDespesa.ts`, e cada relatório pode aplicar critério diferente. Hoje "Em Aberto" começa **depois** do vencimento (1 dia a mais que a sua regra) e não existe "Atrasada".

**Impacto:**
- **Banco:** **uma view nova** (nenhuma coluna). Cresce em etapas: os estados 1–6 já têm todos os fatos; 7–8 dependem de D6.
- **Lançamentos existentes:** nenhum dado é alterado. Despesas vencidas há dias passam a aparecer como *Atrasada*; as que vencem **hoje** passam a *Em Aberto*.
- **Necessita migration?** Sim (só a view)
- **Pode ser revertida?** Sim (apagar a view)
- **Grau de risco:** **Baixo**

**A confirmar:** "Atrasada" é um **9º estado** ou uma **situação dentro de Em Aberto** (continua pedindo a mesma ação, só que em vermelho)? Recomendo a segunda — o fluxo de ação é idêntico e o ciclo continua com os oito estados.

---

## D3 — OFX só evolui a despesa existente, sempre com um clique

**Objetivo:** ao encontrar obrigação compatível, o OFX propõe a ligação já preenchida e **um clique** confirma; nunca cria lançamento novo nesse caso. Linha sem candidata nasce como despesa **já paga e ligada**, aberta à fusão tardia.
**Problema que resolve:** hoje "registrar como novo" é um clique sem aviso — foi assim que Ana, Carlos e Denise duplicaram.

**Impacto:**
- **Banco:** nenhum, na parte de regra do aplicativo. (Quando D4 existir, a ligação passa a gravar na tabela de vínculos.)
- **Lançamentos existentes:** nenhum.
- **Mudança visível:** "registrar como novo", quando existe candidata, passa a pedir confirmação explícita.
- **Necessita migration?** Não
- **Pode ser revertida?** Sim
- **Grau de risco:** **Baixo**

---

## D4 — Conferida ≠ Conciliada

**Objetivo:** *Conciliada* = existe vínculo com a linha do banco. *Conferida* = um humano atestou. O histórico do Omie vira **Conferida (Histórico)**.
**Problema que resolve:** `conciliado` hoje significa as duas coisas — só **336 de 13.147** têm vínculo com o banco (nas saídas, **105 de 4.919**).

**Impacto:**
- **Banco:** (a) **tabela de vínculos** (`conta`, `FITID`, lançamento, quando, quem), única por conta + FITID; (b) campos de conferência (`conferido_em`, `conferido_por`, tipo = manual | histórico, nota). A marca `[ofx:…]` em texto continua sendo escrita por compatibilidade.
- **Lançamentos existentes:** 336 ganham vínculo (pela marca). **12.811** viram *Conferida (Histórico)*. **Recomendo não mudar o `status`** dessas linhas: saldo, DRE e extrato tratam `realizado`/`conciliado` como equivalentes, e trocar o valor do status exigiria alterar o tipo no banco e revisar tudo o que o lê. A distinção passa a ser **pelo vínculo**, não por um novo valor.
- **Necessita migration?** Sim
- **Pode ser revertida?** Sim (a tabela e os campos são novos; o `status` fica intacto)
- **Grau de risco:** **Médio** (volume alto, mas nenhum dado existente muda de status). **Alto** se alguém optar por trocar o status — por isso a recomendação.

---

## D5 — Pronta para Malote nasce sozinha

**Objetivo:** *Pronta* aparece quando existem **liquidação + conciliação + documento + comprovante + classificação**. Por Q4, em **conta sem extrato** a *Conferida* substitui a conciliação. Duas dispensas: categorias sem documento (tarifas) e conta sem extrato.
**Problema que resolve:** "pronta" hoje é só uma conta feita na tela; um botão manual afirmaria o que o sistema já pode ver.

**Impacto:**
- **Banco:** nenhum próprio — vive na view de D2. Depende de D4 (a conferência).
- **Lançamentos existentes:** nenhum dado muda. Despesas das 5 contas sem extrato (caixinha, envelopes, cartão, aplicação, poupança) com documento + comprovante + conferência passam a aparecer como *Pronta*.
- **Necessita migration?** Não (entra com D2)
- **Pode ser revertida?** Sim
- **Grau de risco:** **Baixo**

---

## D6 — Enviada congela; Arquivada = enviada + mês aprovado; reabrir com rastro

**Objetivo:** o envio do malote lista **quais despesas** levou; a partir daí a despesa fica congelada. *Arquivada* = enviada **e** período aprovado. Reabrir (Q5): só Administrador e Tesouraria, com motivo, data, hora, usuário, estado anterior e estado novo.
**Problema que resolve:** hoje o sistema não sabe o que foi à contabilidade (0 envios) nem trava o mês (0 períodos fechados): uma despesa já enviada pode ser alterada em silêncio.

**Impacto:**
- **Banco:** (a) tabela de **itens do envio** (envio ↔ obrigação); (b) tabela de **reaberturas** (o registro de Q5); (c) **gatilho de trava** que impede mudar valor, documentos, categoria e centro de uma despesa enviada; (d) usar `fin_fechamentos_periodo` (já existe, com gatilho próprio).
- **Lançamentos existentes:** **nenhum** muda agora — não há envio registrado. Os meses antigos **não** ficam "Enviados" por conta própria (não há registro de que foram). Se você quiser tratá-los como arquivados, é uma decisão à parte, mês a mês.
- **Necessita migration?** Sim
- **Pode ser revertida?** Sim, enquanto não houver envios registrados; depois disso desfazer apaga o rastro do que foi enviado
- **Grau de risco:** **Médio** (o gatilho precisa de limites bem definidos para não bloquear ações legítimas, como conciliar tardiamente uma despesa enviada)

---

## D7 — Documento pertence à obrigação; comprovante, ao pagamento

**Objetivo:** o documento (boleto, guia, DARF, FGTS, fatura, XML) é da obrigação; o comprovante é do pagamento; o dossiê reúne os dois.
**Problema que resolve:** num pagamento parcial a parcela aparecia "sem documento" embora o boleto estivesse na linha original.

**Impacto:**
- **Banco:** nenhum.
- **Lançamentos existentes:** nenhum.
- **Situação:** **já aplicado na leitura** (Fase A, 13/10): detalhe da despesa, Pacote Contábil, Ciclo do mês, Painel e Central de Documentos. Só a **Mesa** não mudou, porque lê só comprovante.
- **Necessita migration?** Não
- **Pode ser revertida?** Sim
- **Grau de risco:** **Baixo**

---

## Quadro-resumo

| | Decisão | Migration | Reversível | Risco |
|---|---|---|---|---|
| D1 | Obrigação = identidade (`obrigacao_id` sempre) | Sim | Sim | Médio (Baixo na versão leve) |
| D2 | Estado derivado, num só lugar (com Q1) | Sim (view) | Sim | Baixo |
| D3 | OFX evolui com um clique | Não | Sim | Baixo |
| D4 | Conferida ≠ Conciliada (+ Histórico) | Sim | Sim | Médio |
| D5 | Pronta nasce sozinha (com Q4) | Não | Sim | Baixo |
| D6 | Enviada, Arquivada, reabrir com rastro (Q5) | Sim | Sim* | Médio |
| D7 | Documento→obrigação, comprovante→pagamento | Não | Sim | Baixo |

*enquanto não houver envio registrado

**Ordem natural se aprovar tudo:** D3 e D7 (sem migration) → D1 → D2 + D5 (a view) → D4 → D6. Cada migration viria com ensaio, script de aplicar e script de reverter, como as anteriores.

## O que preciso que você confirme junto com as aprovações

1. **Atrasada** (D2): situação dentro de Em Aberto (recomendado) ou 9º estado?
2. **D4:** manter o `status` como está e distinguir pelo vínculo (recomendado)?
3. **D1:** preencher as 15.621 linhas antigas (Médio) ou só gatilho + leitura com `COALESCE` (Baixo)?
4. **D6:** os meses já passados ficam sem "Enviada/Arquivada" até que você os registre?
