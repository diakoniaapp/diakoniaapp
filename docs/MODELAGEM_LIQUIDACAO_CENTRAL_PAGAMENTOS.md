# Modelagem — liquidação real da Central de Pagamentos

Proposta de **06/10/2026**, para revisão. **Nada foi construído nem aplicado.** SQL em rascunho (não ensaiado):
[MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS.sql](MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS.sql).

## 1. O problema, medido no código

Hoje "pagar" é `confirmarPagamento()` em `finService.ts`: troca o status para `realizado` e, se a pessoa digitar um valor, **sobrescreve `valor`**. Consequências:

- o valor do documento (R$ 1.418,00) **se perde** quando se paga outro valor; não há onde guardar juros, multa ou desconto;
- pagamento parcial não existe: ou a conta fecha, ou não;
- um pagamento para vários documentos obriga a lançamentos paralelos feitos à mão.

O enum `fin_lancamento_status` tem 4 valores (`previsto · realizado · conciliado · cancelado`), e cerca de **46 arquivos** do app citam esses status (contagem por busca no código), além das views `vw_fin_resumo_mes`, `vw_fin_proximos_vencimentos`, das funções `fin_exec_*`, do gatilho que recalcula o saldo das contas e da importação OFX. **Mexer no enum seria o caminho mais perigoso.** A proposta evita isso.

## 2. A ideia central: o dinheiro continua sendo lançamento; a obrigação ganha memória

Regra que não muda: **um lançamento `realizado` é dinheiro que circulou** e seu `valor` é o que saiu do caixa. Saldo, DRE, extrato, Fechamento e OFX continuam funcionando sem alteração, porque leem exatamente isso.

O que se acrescenta (tudo opcional, nada do que existe muda):

| Peça | Para quê |
|---|---|
| `fin_lancamentos.valor_original` | o valor da **obrigação**, como o documento diz (o valor lido do boleto/guia/fatura) |
| `fin_lancamentos.desconto` | quanto de desconto foi dado nesta baixa |
| `fin_lancamentos.componente` | `principal` · `juros` · `multa` · `complemento` · `ajuste` |
| `fin_lancamentos.obrigacao_id` | junta numa só obrigação a conta, seu saldo pendente, juros e multa |
| `fin_liquidacoes` (tabela nova) | o **ato de pagar**: uma saída do banco = uma linha, com valor total, data, conta, forma, comprovante e FITID do OFX |
| `vw_fin_obrigacoes` (view nova) | a **situação** de cada obrigação, calculada: Previsto, Em Aberto, Pago Parcialmente, Pago Integralmente, Pago com Diferença, Cancelado |
| `fin_liquidar()` (função nova) | grava tudo numa transação só; **recusa** se a soma não fechar com o valor pago |

**Os 6 status que você pediu são calculados, não gravados.** Assim nenhum relatório antigo quebra e a situação nunca fica desatualizada em relação aos lançamentos.

**Lançamentos antigos:** ficam como estão (13 mil). `valor_original` vazio significa "igual ao valor", então todos aparecem como *Pago Integralmente, sem diferença*. **Não estimo nem invento diferença histórica.**

## 3. Seus cenários, um a um

### Cenário 1 — pagamento parcial
Documento R$ 1.538,00, pago R$ 1.418,00.

| Lançamento | Valor | Status | Observação |
|---|---|---|---|
| principal (o que foi pago) | 1.418,00 | realizado | `valor_original` 1.538,00 |
| principal (saldo) | 120,00 | **previsto**, mesmo vencimento | continua na Central; vencido, aparece como Em Aberto |

Situação da obrigação: **Pago Parcialmente** · original 1.538,00 · pago 1.418,00 · **saldo pendente 120,00**. Fica aberta até a quitação total. O saldo herda categoria, centro, fornecedor e projeto.

### Cenário 2 — pago a maior (R$ 1.418,00 → R$ 1.538,00)
A função **não liquida sozinha**. A tela pergunta *"Qual o motivo da diferença de R$ 120,00?"* e cada resposta vira uma coisa concreta:

| Resposta | O que é criado |
|---|---|
| Juros | despesa "Juros", categoria *Juros* (já existe no plano de contas, Despesas Financeiras) |
| Multa | despesa "Multa", categoria *Multas* |
| Juros e Multa | as duas, com os valores que você informar (a soma tem que fechar os R$ 120,00) |
| Outro documento incluído | escolhe-se outra obrigação em aberto; ela entra no mesmo pagamento (cenário de vários documentos) |
| Complementação voluntária | despesa `complemento`, mesma categoria e centro do documento |
| Ajuste manual | despesa `ajuste` com **motivo obrigatório**; aparece destacada nos relatórios, não passa em silêncio |

### Juros e multa (R$ 1.418,00 + R$ 80,00 + R$ 40,00 = R$ 1.538,00)

| Lançamento | Categoria | Valor |
|---|---|---|
| principal | Energia Elétrica | 1.418,00 |
| juros | Juros | 80,00 |
| multa | Multas | 40,00 |

Os três nascem **na mesma liquidação**, com o **mesmo centro de custo e fornecedor** do principal (então o custo da Light pesa no centro certo) e o mesmo `obrigacao_id`. Total pago: 1.538,00 = o que o banco mostra.

### Desconto (R$ 1.418,00, pago R$ 1.350,00)
Principal `valor` = **1.350,00** (o que saiu), `valor_original` = **1.418,00**, `desconto` = **68,00**. Situação: **Pago com Diferença**.

### Vários documentos (A 1.418,00 + B 120,00, pago R$ 1.538,00)
Uma liquidação de R$ 1.538,00 com dois itens. Cada boleto é baixado pelo seu valor e a liquidação guarda o total que o banco viu.

## 4. OFX: comparar documento × extrato

A **liquidação é a unidade que se compara com o OFX**, porque é uma saída do banco. Hoje o casamento é por tipo + valor + janela de 5 dias com *um* lançamento; com juros e multa, nenhum lançamento isolado tem R$ 1.538,00.

Fluxo proposto:

1. A linha do OFX (R$ 1.538,00) é comparada com a obrigação provável (R$ 1.418,00, pelo valor lido do documento e pelo fornecedor).
2. Se diferente: **⚠ Diferença encontrada: R$ 120,00**, e abre o mesmo fluxo de "motivo da diferença" do cenário 2.
3. Ao concluir, grava-se a liquidação com o `ofx_fitid` (índice único por conta: o mesmo extrato não liquida duas vezes) e os lançamentos da liquidação são conciliados juntos.

## 5. Central de Pagamentos (painel)

Cada obrigação mostra: **Documento** (valor original) · **Pago** · **Juros** · **Multa** · **Desconto** · **Saldo pendente** · **Situação**, com os 6 status e filtros por eles. O valor lido do documento passa a ser o *valor original da obrigação*; as diferenças ficam em linhas separadas, nunca sobrescrevendo-o.

## 6. Relatórios que a base já responde

| Pergunta | Fonte |
|---|---|
| Quanto pagamos de juros / multas no mês? | lançamentos com `componente = 'juros'` / `'multa'` por `data_pagamento` |
| Quais contas foram pagas parcialmente? | `vw_fin_obrigacoes` com situação *pago_parcialmente* |
| Quais receberam desconto? Quanto economizamos? | `vw_fin_obrigacoes` com `desconto > 0`; soma de `desconto` |
| Quanto foi gasto em encargos financeiros? | juros + multa (+ categoria *IOF* e tarifas, já existentes) |
| Quais pagamentos tiveram "ajuste manual"? | `componente = 'ajuste'` (com motivo) |

## 7. Impacto (o que muda e o que não muda)

**Não muda:** saldo das contas (o gatilho soma `realizado`/`conciliado` como hoje), DRE, resumo do mês, extratos, indicadores. Cada centavo que saiu do banco continua sendo um lançamento realizado.

**Muda (estimativa por leitura do código; confirmo ao implementar):**

- `finService.confirmarPagamento` e o diálogo "Confirmar pagamento" (`useAcoesLancamento.tsx`) → viram o diálogo de liquidação;
- `PainelTesouraria` / contas a pagar → colunas e filtros de situação;
- `importacaoOfxService` / `ofxService` / `ConciliacaoDrawer` → casamento por liquidação e fluxo de diferença;
- gerador de recorrências → o saldo pendente **não herda** `recorrencia_id` (para o gerador não duplicar o mês);
- relatórios novos (juros, multas, parciais, descontos).

**A verificar antes de aplicar (não consegui confirmar, o banco está sem acesso de leitura de esquema):**

1. Se `fin_lancamentos.origem` tem algum CHECK que recuse o valor novo `liquidacao`.
2. Se o gatilho `fin_lanc_saldo` recalcula as **duas** contas quando uma baixa muda `conta_id` (a função muda `conta_id` quando se paga por outra conta).
3. Como o Fechamento mensal trata lançamento novo com data dentro de mês já fechado (a função deve recusar; hoje não checa).
4. Se as categorias *Juros*, *Multas* e *Descontos Obtidos* existem no banco (estão na migration do plano de contas de 12/09/2026; não consegui conferir hoje, a sessão do navegador caiu).

## 8. Decisões que preciso de você

1. **Desconto: como entra na contabilidade?**
   **A (recomendo):** a despesa é registrada pelo valor pago (R$ 1.350,00) e o desconto fica em coluna própria, para o relatório de economia. O caixa e a DRE batem com o banco, e não nasce "entrada" falsa.
   **B:** despesa de R$ 1.418,00 + uma *entrada* "Descontos Obtidos" de R$ 68,00 (a categoria existe). É a forma contábil clássica, mas infla "entradas do mês" e o saldo por um movimento que não existiu no banco.
2. **"Ajuste manual" (diferença sem outra explicação):** permitir com **motivo obrigatório** e destaque nos relatórios, ou **proibir** (a diferença tem que virar juros, multa, complemento ou outro documento)? Pela regra de "sem ajustes sem prova" que você definiu, minha inclinação é permitir só com motivo e listar todos para revisão.
3. **Em Aberto × Previsto:** proponho *Previsto* = ainda não venceu; *Em Aberto* = venceu e nada foi pago. Confirma?
4. **Quem pode liquidar:** os mesmos 4 papéis das demais tabelas financeiras (admin, diakonia, secretaria, tesouraria)?

## 9. Fases (cada uma entregável e verificada sozinha)

| Fase | Entrega |
|---|---|
| 1 | Migration (colunas, tabela, view, função) — **você revisa o SQL, eu entrego o ensaio, você aplica** |
| 2 | Diálogo de liquidação: parcial, juros, multa, desconto, vários documentos, motivo da diferença |
| 3 | OFX: comparação documento × extrato e fluxo da diferença; conciliação da liquidação inteira |
| 4 | Central de Pagamentos: colunas e os 6 status, com filtros |
| 5 | Relatórios: juros, multas, parciais, descontos, encargos financeiros |

## 10. Riscos

- **Divisão de lançamento na baixa parcial:** o saldo vira um lançamento novo. Compensa a rastreabilidade (mesmo `obrigacao_id`), mas quem exporta lançamentos verá duas linhas para uma conta. A view `vw_fin_obrigacoes` é a leitura "por conta".
- **Migration não ensaiada:** a função mexe em várias linhas por chamada. Será ensaiada com `BEGIN/ROLLBACK` em dados reais antes de valer, com contagens e somas conferidas.
- **Documento lido errado:** o valor lido (R$ 1.418,00) vira o *original*. Se a leitura errar, a diferença aparece na liquidação. Por isso a tela continua mostrando o valor lido ao lado do valor do lançamento, como hoje.
