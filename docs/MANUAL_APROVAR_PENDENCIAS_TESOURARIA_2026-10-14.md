# "Aprovar pendências" — análise técnica e manual da Tesouraria (14/10/2026)

> **DECISÃO (14/10/2026): opção A — aposentar o botão e o estado.** Saíram do aplicativo o botão "Aprovar pendências", a lista "Aguardando aprovação" (Painel e Agenda Financeira), os botões Aprovar/Rejeitar, o item do checklist da Mesa e a opção de Situação no formulário. A migration `20261016090000_fin_aposenta_aguardando_aprovacao.sql` (restrição no banco) está **preparada, ainda não aplicada**. O restante deste documento descreve o que existia e serve de histórico; a seção 9 (manual) deixa de valer para o botão e segue valendo para a fila **"Aprovar reembolso"** da Quitação.

> Levantamento feito no código, no banco de produção (somente leitura) e na documentação. Onde não foi possível concluir, está escrito **(não verificado)**. Números foram contados em 14/10/2026.

## 0. Resumo em cinco linhas

1. O botão **"Aprovar pendências"** (Painel da Tesouraria › 1 Operações › "Meu trabalho") **não aprova nada sozinho**: ele leva à lista **"Aguardando aprovação"**, na aba **4 Fechamento**, onde cada lançamento tem **Aprovar** e **Rejeitar**, **um por vez**.
2. Só entra nessa lista o lançamento cuja **Situação** foi escolhida **à mão** como **"Aguardando aprovação"** no formulário de lançamento. **Nenhuma rotina, recorrência, importação de OFX, reembolso ou gatilho cria esse estado.**
3. **Hoje há 0 lançamentos nesse estado** (de 13.939 lançamentos). O botão responde "Nenhuma aprovação parada." É uma funcionalidade **vazia na prática**.
4. **"Aprovar" aqui significa "pagar/receber"**: o lançamento vira `realizado`, com data de pagamento = hoje, e **o saldo da conta muda na hora**, sem passar pela tela de Pagar, sem escolher conta, forma nem comprovante.
5. **Não é** a aprovação dos reembolsos (Quitação), que é outro mecanismo, com regras próprias (seção 6, cenário 3).

---

## 1. O que a funcionalidade é

É a **aprovação de um nível (v1)**, construída em 12/09/2026 sobre o status `aguardando_aprovacao`, que já existia no banco. A decisão do roadmap (12/09/2026) foi: só o Tesoureiro e o Administrador operam o financeiro, não há "solicitante"; portanto **um nível basta** e o fluxo multinível foi dado como "não se aplica" (`docs/ROADMAP_FINANCEIRO_ERP.md`).

Há **dois lugares** para decidir:

| Onde | Tela | Mostra |
|---|---|---|
| Painel da Tesouraria › **4 Fechamento** › "Aguardando aprovação" | `PainelTesouraria.tsx` | só as **8 primeiras** (`slice(0, 8)`), mesmo que o contador diga mais |
| **Agenda Financeira** (`/financas/agenda`) | `FinancasAgenda.tsx` | todas |

Os dois usam os mesmos botões (`BotoesAprovacao`) e a mesma ação (`useAcoesLancamento` → `aprovarLancamento` / `rejeitarLancamento`, em `finService.ts`).

---

## 2. As 20 perguntas

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Objetivo | Dar um **sim ou não** a um lançamento que alguém deixou "Aguardando aprovação". Sim → vira `realizado`. Não → vira `cancelado`, com o motivo. |
| 2 | O que é pendência | `fin_lancamentos.status = 'aguardando_aprovacao'`, **entrada ou saída**, de **qualquer data** (sem janela de tempo e sem teto de 300 linhas, de propósito: a aprovação mais antiga é a mais urgente). |
| 3 | Como nasce | **Só à mão**: no formulário do lançamento, campo **Situação** lista "Aguardando aprovação" entre as opções (`LancamentoForm.tsx`). Nenhum outro código grava esse status. |
| 4 | Tipos existentes | **Um só**: lançamento `aguardando_aprovacao`. Outras "pendências" do mesmo painel (sem comprovante, aguardando conciliação, fechamento do mês) existem na lista interna, mas **não são aprovadas por este botão**. |
| 5 | O clique | Sem pendência: aviso "Nenhuma aprovação parada.". Com pendência: abre a aba 4 Fechamento (**sem rolar até a lista**, que fica abaixo do checklist do mês). |
| 6 | Lote ou individual | **Individual.** Não existe aprovação em lote. |
| 7 | Tabelas alteradas | `fin_lancamentos` (direto). Indiretas, por gatilho: o **saldo da conta** (`fin_recalc_saldo_conta`) e, se o lançamento estiver ligado a uma obrigação fiscal, `fiscal_agenda` (marca "pago"). |
| 8 | Campos que mudam | **Aprovar:** `status` → `realizado`; `data_pagamento` → hoje; `audit_user_id` e `audit_em` (quem e quando editou); `updated_at`. **Rejeitar:** `status` → `cancelado`; `observacoes` ganha a linha `[Rejeitado em AAAA-MM-DD] motivo`. |
| 9 | Validações | **Na tela:** nenhuma além da confirmação (rejeitar exige texto). **No banco:** período fechado/aprovado bloqueia; lançamento já enviado ao Malote não pode mudar certos campos; despesa já **quitada por terceiro** não pode ser marcada paga ao fornecedor (mensagem em português). **Não há:** comprovante, conta, forma, duplicidade, valor máximo, nem "outra pessoa aprova". |
| 10 | Permissões | Rota e tela: **admin, diakonia, secretaria, tesouraria** (`ROLES_FINANCEIRO`). Banco: a mesma lista, por política (`fin_lancamentos_equipe`). **Não há alçada por valor** nem papel exclusivo de aprovador. |
| 11 | Caixa disponível | **Sim, imediato.** O saldo só considera `realizado` e `conciliado`. Aprovar uma saída **reduz** o caixa na hora; uma entrada **aumenta**. Enquanto está "aguardando", **não afeta** o caixa. |
| 12 | Previsão financeira | **Enquanto aguarda, fica fora da previsão** (`fin_previsao_caixa` só lê `previsto`). Depois de aprovada, vira realizado e sai da previsão (entra no saldo). |
| 13 | Contas a pagar | **Enquanto aguarda, some da lista de vencimentos** (`vw_fin_proximos_vencimentos` só lê `previsto`). Depois de aprovada, deixa de ser "a pagar" porque ficou paga. Rejeitada, some de vez. |
| 14 | Contas a receber | Mesma mecânica de entradas: aguardando não aparece nos vencimentos; aprovar = **recebido**. |
| 15 | Conciliação | Aprovada, vira `realizado`, que é exatamente o estado que **espera conciliação** com o extrato. Se o pagamento real ainda não aconteceu no banco, ficará "realizado" sem extrato correspondente. |
| 16 | Fechamento mensal | Lançamento `aguardando_aprovacao` **não conta** como movimento do mês (o fechamento olha realizado/conciliado/oferta). Aprovar dentro de um período já **fechado ou aprovado é bloqueado**. |
| 17 | Recorrências | **Sem ligação.** A recorrência gera lançamentos `previsto` (confirmado em `recorrenciaService.ts`), nunca `aguardando_aprovacao`. |
| 18 | Fluxo de aprovação de despesas | É **este** o fluxo v1, mas **ninguém o alimenta**. O fluxo novo de reembolsos (Quitação) é **separado** e **não passa por aqui**. |
| 19 | Pagamentos automáticos | **Sem ligação.** Débitos automáticos são `previsto` com forma de liquidação automática e são **conferidos** na Mesa do Tesoureiro, não aprovados. |
| 20 | OFX | **Sem ligação.** O OFX cria lançamento `conciliado` ou promove um `previsto` a `conciliado`. Nunca passa por `aguardando_aprovacao`. |

---

## 3. O que acontece, passo a passo

**Aprovar**
1. A pessoa clica em **Aprovar** na linha → aparece "Aprovar lançamento? … Vira *realizado*, com data de pagamento hoje."
2. `aprovarLancamento(id)` faz um UPDATE: `status = realizado`, `data_pagamento = hoje`, mais carimbo de quem editou.
3. O banco dispara, nesta ordem: bloqueio de período fechado → congelamento do Malote → bloqueio de quitação por terceiro → recálculo do **saldo da conta** → sincronização com a **agenda fiscal** (se houver vínculo).
4. A tela atualiza e o item sai da lista.

**Rejeitar**
1. O motivo é obrigatório (campo de texto). O botão só habilita com texto.
2. `rejeitarLancamento(id, motivo)` grava `status = cancelado` e acrescenta ao fim de `observacoes`: `[Rejeitado em AAAA-MM-DD] motivo`.
3. Cancelado **não entra** em saldo, previsão, vencimentos, DRE nem fechamento.

---

## 4. Onde é usada, por quem, quando

- **Onde:** Painel da Tesouraria (botão "Aprovar pendências", item "Decidir aprovações paradas" do checklist da Mesa e a lista da aba 4) e Agenda Financeira.
- **Quem deveria:** Tesouraria **e** Administrador, mas **não a mesma pessoa que criou o lançamento**. Hoje o sistema **não impede** a autoaprovação.
- **Quando usar:** quando alguém **deliberadamente** deixou um lançamento "Aguardando aprovação" por precisar de uma segunda decisão **e** o pagamento/recebimento **já aconteceu de fato**.
- **Quando NÃO usar:** (a) para **pagar** uma conta: use "Pagar" na Mesa; (b) para **reembolso de terceiro**: use a fila "Aprovar reembolso" da Quitação; (c) para **conciliar o extrato**: use a Mesa de Conciliação/OFX; (d) **antes** de o dinheiro sair ou entrar na conta; (e) em lançamento de **mês já fechado**.

---

## 5. Riscos de aprovar errado

| Risco | Por quê |
|---|---|
| **Caixa mostra dinheiro que não saiu** | Aprovar uma saída já a debita do saldo. Se o pagamento real não foi feito, o saldo fica menor que o do banco |
| **Pagamento sem comprovante** | A aprovação não pede anexo; a despesa entra em "sem comprovante" na prestação de contas |
| **Pagar duas vezes** | Se aprovar e depois alguém pagar de novo pela tela Pagar (ou o OFX trazer o débito), há duas saídas para o mesmo compromisso |
| **Data de pagamento falsa** | A data gravada é **hoje**, não a data real do pagamento |
| **Autoaprovação** | Quem lançou pode aprovar o próprio lançamento; não há trava nem registro de "aprovador" distinto |
| **Rejeição não reversível pela tela** | Cancelado não tem botão de "desfazer" |
| **Obrigação fiscal marcada paga** | Se o lançamento estiver ligado a uma obrigação da agenda fiscal, ela vira "paga" junto |
| **Esquecimento** | Enquanto "aguarda", a despesa **some de Contas a pagar e da previsão** |

---

## 6. Quatro cenários

### Cenário 1 — Conta criada manualmente

*Fluxo até virar pendência.* Na criação, a Tesouraria escolhe **Situação = "Aguardando aprovação"** (padrão do formulário é "Realizado"). Fica fora do caixa, da previsão e de Contas a pagar. Aparece no contador do botão, no checklist da Mesa e na aba 4 Fechamento.
*Depois de aprovar.* Vira `realizado`, data de pagamento = hoje, **saldo da conta cai** e o lançamento passa a esperar conciliação com o extrato. Se rejeitar: `cancelado`, com o motivo nas observações.
*Observação:* se a conta ainda não foi paga no banco, **não aprove**: deixe `previsto` e pague pela Mesa.

### Cenário 2 — Despesa recorrente

*Fluxo.* A recorrência gera os lançamentos como `previsto` (hoje, **428 dos 445 previstos de saída são de recorrência**). **Não passam por "Aguardando aprovação".** Aparecem em Contas a pagar, na previsão e na Mesa.
*Depois.* O fluxo é o de sempre: **Pagar** (ou conferir o débito automático, ou conciliar pelo OFX). **"Aprovar pendências" não participa.**
*Atenção:* se alguém, por engano, editar um lançamento recorrente e mudar a Situação para "Aguardando aprovação", ele **desaparece** de Contas a pagar até ser decidido.

### Cenário 3 — Nota fiscal de reembolso

*Fluxo.* A nota é registrada com a **Quitação** (quem pagou, intenção "reembolso"); a despesa fica `previsto`. A Declaração do Terceiro é gerada e assinada. A fila **"Aprovar reembolso"** (na Mesa do Tesoureiro, componente de pendências de quitação) mostra o item quando a prova é suficiente.
*Aprovação.* É `fin_decidir_quitacao`: **registra a decisão (quem, quando, motivo) e não mexe em dinheiro.** Regras do banco: só Administrador ou Tesouraria; despesa precisa estar em aberto; a prova precisa ser suficiente; **acima de R$ 500 só o Administrador**; **ninguém aprova o próprio reembolso**.
*Depois.* Vai para **"Reembolso a pagar"**; o pagamento é feito em **Pagar reembolso** (conta, data, forma, valor, comprovante), que usa a liquidação de sempre.
*Hoje:* 2 reembolsos aprovados em aberto, somando R$ 1.720,00.
*Importante:* **não use "Aprovar pendências"** para isso. Se um lançamento de reembolso fosse marcado "Aguardando aprovação" e aprovado ali, o banco **recusaria** (trava de quitação) com mensagem em português.

### Cenário 4 — Débito identificado na conciliação bancária

*Fluxo.* O extrato (OFX) chega pela Mesa de Conciliação. O sistema casa o débito com um lançamento `previsto`/`realizado` existente, ou cria um novo já como `conciliado`. **Não existe estado "aguardando aprovação" nesse caminho.** A decisão humana é **"é este lançamento mesmo?"** (confirmar o casamento), não "aprovar".
*Depois.* O lançamento fica `conciliado`, com `data_pagamento` = data do extrato. Nada passa por "Aprovar pendências".

---

## 7. Bugs e inconsistências encontrados

| # | Gravidade | Achado |
|---|---|---|
| 1 | **Alta** | **"Aprovar" = pagar.** Aprovar já baixa o saldo sem a pessoa escolher conta, forma, data real nem comprovante. A própria especificação da Política (seção 5.3) registra isso como defeito a corrigir |
| 2 | **Alta** | **Lançamento "aguardando aprovação" some de Contas a pagar e da previsão** (as duas só leem `previsto`), mas **aparece** na contagem de "PIX pendentes" e no resumo semanal. Fica "invisível" justamente quando precisa de decisão |
| 3 | Média | **Sem registro de quem aprovou.** Só há `audit_user_id`/`audit_em` (último editor), que muda a qualquer edição posterior. O código tem o comentário "aprovado_por/aprovado_em próprios ficam para quando houver acesso" e **nunca foi feito** |
| 4 | Média | **Autoaprovação possível**: não há regra "outra pessoa aprova" nem alçada por valor |
| 5 | Média | **Nome enganoso.** "Aprovar pendências" soa como "todas as pendências" (comprovante, conciliação, fechamento), mas só trata o status `aguardando_aprovacao`. As outras ficam em seções diferentes |
| 6 | Média | **A lista da aba 4 mostra só 8**, mesmo que o contador diga mais; o resto só é alcançável pela Agenda Financeira |
| 7 | Baixa | **O clique não rola até a lista**: a aba 4 abre no topo e a lista fica abaixo do checklist do mês |
| 8 | Baixa | **Rejeitar não tem "desfazer"** pela tela; o motivo fica misturado no texto livre das observações |
| 9 | Baixa | **Ninguém cria o estado**: 0 lançamentos, e o único caminho é escolher a Situação à mão. O recurso existe, mas é praticamente órfão |
| 10 | Baixa | O mês de aprovação não é validado contra a competência: aprovar em novembro uma despesa de outubro ainda aberta grava `data_pagamento` de novembro (o vencimento original fica) |

---

## 8. Melhorias recomendadas

1. **Decidir o destino da funcionalidade** (a pergunta principal). Duas opções honestas:
   - **A. Aposentar** o botão e o estado, já que ninguém os usa e a Quitação cobre o caso real de aprovação (recomendada se a Tesouraria **não** quer um segundo nível para despesas comuns).
   - **B. Reaproveitar com o desenho certo**: aprovação **separada do pagamento** (grava quem/quando/motivo e **não mexe em saldo**), **alçada por valor**, **outra pessoa aprova**, e o lançamento aprovado volta a `previsto` para ser pago em **Pagar**. É o que a Especificação da Política já pede (seção 5.3 e 12).
2. Enquanto não decidir: **manter o lançamento "aguardando" visível em Contas a pagar e na previsão**, com selo "aguardando aprovação".
3. Registrar `aprovado_por` e `aprovado_em` (migration pequena, com revisão e ensaio, como as demais).
4. Renomear o botão para **"Aprovações paradas"** e fazer o clique **rolar até a lista**.
5. Mostrar **todas** as aprovações na aba, não só 8.
6. Se a opção B for escolhida: bloquear **autoaprovação** e exigir **comprovante/conta/forma** apenas no momento de pagar, não de aprovar.

---

## 9. MANUAL OPERACIONAL DA TESOURARIA

### 9.1 Objetivo
Dar a segunda decisão (sim ou não) a um lançamento que foi deixado **"Aguardando aprovação"**. Não serve para pagar, reembolsar nem conciliar.

### 9.2 Regras de negócio
1. Só existe pendência quando alguém marcou a Situação **"Aguardando aprovação"** no lançamento. **Hoje não há nenhuma.**
2. Enquanto aguarda: **não mexe no caixa**, **não aparece em Contas a pagar** e **não entra na previsão**.
3. **Aprovar** = o dinheiro **já saiu (ou entrou)**: o lançamento vira **Realizado**, com data de pagamento **hoje**, e o **saldo da conta muda na hora**.
4. **Rejeitar** = o lançamento vira **Cancelado**; o motivo é obrigatório e fica nas observações.
5. Mês **fechado ou aprovado** não permite aprovar nem rejeitar: reabra o período antes, com motivo.
6. Despesa **quitada por terceiro** (reembolso) **não** se aprova aqui: use a fila "Aprovar reembolso".
7. Quem pode: Administrador, Diakonia, Secretaria e Tesouraria. **Recomendação interna:** quem lançou **não** aprova.

### 9.3 Fluxo operacional
1. Painel da Tesouraria › **1 Operações** › **Aprovar pendências (N)** (ou **4 Fechamento** › "Aguardando aprovação", ou **Agenda Financeira**).
2. Para cada linha, **confira**: favorecido, valor, categoria, centro, e **se o dinheiro realmente saiu do banco**.
3. Pagou de fato? **Aprovar.** Ainda não pagou, ou não se sabe? **Não aprove**: pague pela Mesa ou peça esclarecimento.
4. Não vale? **Rejeitar**, escrevendo o motivo de forma que outra pessoa entenda daqui a um ano.
5. Depois, **anexe o comprovante** ao lançamento e **concilie** com o extrato.

### 9.4 Exemplos reais
- **Conta de luz paga hoje pelo app do banco, deixada "Aguardando aprovação":** confira o débito no extrato, **Aprovar**, anexe o comprovante, concilie.
- **Compra de R$ 40 de material feita pelo ministério, lançada "Aguardando aprovação", sem nota:** **Rejeitar**, com o motivo "sem nota fiscal; peça ao ministério".
- **Reembolso de R$ 1.500 ao pastor:** **não** é aqui. Vá a **Aprovar reembolso** (quem aprova **não** pode ser o próprio beneficiário e, acima de R$ 500, **só o Administrador**) e depois **Pagar reembolso**.

### 9.5 Impactos contábeis e financeiros
| Ação | Caixa | Previsão | Contas a pagar/receber | Conciliação | Fechamento |
|---|---|---|---|---|---|
| Lançar "Aguardando" | não muda | **fora** | **fora** | n/a | não conta |
| **Aprovar** | **muda agora** | sai (já realizado) | sai (já pago) | passa a **aguardar** conciliação | passa a contar |
| **Rejeitar** | não muda | n/a | n/a | n/a | não conta |

### 9.6 Boas práticas
- Aprove **depois** de o dinheiro mover, nunca antes.
- **Não aprove o que você mesmo lançou.**
- Revise a lista **toda semana**: aprovação parada é compromisso invisível.
- Sempre **anexe o comprovante** logo após aprovar.
- Para reembolso, siga o fluxo próprio (Quitação), com Declaração do Terceiro e recibo.

### 9.7 Checklist antes de aprovar
- [ ] O dinheiro **já saiu/entrou** no extrato do banco?
- [ ] Favorecido, **valor** e **data** conferem com o documento?
- [ ] Categoria e centro de custo estão corretos?
- [ ] Existe **nota fiscal ou documento** (e, para despesa, comprovante)?
- [ ] **Não** é reembolso de terceiro (se for, usar a fila da Quitação)?
- [ ] **Não** foi pago também por outra via (OFX, outra tela, débito automático)?
- [ ] O mês **não** está fechado?
- [ ] **Não fui eu** quem lançou?
- [ ] Se algo falhar, o motivo da **rejeição** está escrito com clareza?
