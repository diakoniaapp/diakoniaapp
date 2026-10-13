# Fase 1: resultado da validação histórica (13/10/2026)

> Consultas **somente de leitura** feitas no banco de produção. Nada foi alterado. O script oficial é `docs/FASE1_VALIDACAO_HISTORICO.sql` (a seção V5 foi corrigida depois deste resultado, ver item 5).

## 1. Linha de base (deve continuar idêntica depois das migrations)

| Medida | Valor |
|---|---|
| Lançamentos | **13.932**: entradas conciliadas 8.232 · entradas realizadas 124 · saídas conciliadas 4.920 · saídas realizadas 209 · saídas previstas 447 |
| Cancelados · aguardando aprovação | **0 · 0** (o fluxo antigo de aprovação não tem uso) |
| Saldo das 6 contas | Todas **iguais** ao saldo inicial somado ao movimento. Bradesco −11.088,55 · Caixa de Aplicação 1.310,64 · Caixa de Envelopes 1.126,60 · Caixinha 170,70 · Cartão −5.609,20 · Poupança 2.444,80 |
| `vw_fin_ciclo` (4.037 saídas, sem transferências) | prevista 435 · em aberto 12 · pagamento realizado 13 · aguardando conciliação 4 · conciliada 2.982 · **pronta para malote 591** |
| Fechamentos de período · envios de malote | **0 · 0** |
| Previstas com mais de 90 dias | **0** |

A diferença para os números de 13/10 de manhã (15.661 lançamentos, 5.774 saídas) é coerente com as limpezas aplicadas desde então (duplicatas de recorrência, Título de Capitalização, CBD). Saldos e estados batem, que é o que importa para o invariante.

## 2. O que o resultado muda no desenho

### 2.1 As 17 NFs do escritório **não existem como obrigação no app**
Nenhuma foi encontrada pelo número do documento, e os pagamentos a D Flesh e Del Castilho que existem no app são **outros valores e outras datas**. Consequência: para essas NFs não há o que "registrar uma quitação". A Fase 1 precisa de um caminho **"registrar NF já quitada por terceiro"** (cria a obrigação e a quitação **na mesma operação**, com competência no passado). Isso é acrescentado à entrega 1B/1C. Não é lançamento fictício: é a nota que a igreja de fato deve ou deveu.

### 2.2 Três solicitações de reembolso reais já existem em `previsto`
Criadas em 09/10, vencimento 11/10 (já em aberto), cada uma com 1 anexo, **ligadas a um fornecedor e não a uma pessoa**:

| Valor | Fornecedor |
|---|---|
| R$ 220,00 | Rio Cinelândia 73 Vidros e Esquadrias de Alumínio |
| R$ 767,10 | Giovanelli Embalagens |
| R$ 1.500,00 | Leandro Dias Gonçalves |

São os primeiros casos naturais do cenário de reembolso. **Preciso que você me diga quem pagou cada uma** (e se foi mesmo com recurso próprio) antes de eu tratá-las. Não vou presumir.

### 2.3 O padrão fictício antigo tem uma assinatura clara
Procurar "entrada e saída de mesmo valor" só achou coincidências e transferências legítimas entre contas (a versão antiga de V5 foi abandonada). A assinatura real é a **entrada descrita como "Oferta de NF"**:

| Quantidade | Total | Onde | Observação |
|---|---|---|---|
| **8 entradas** | **R$ 2.384,56** | Todas na **Caixa de Envelopes** | 6 de 2024 a 2026 conciliadas (Omie) e **2 de 12/08/2026 (R$ 14,00 e R$ 13,00) ainda `realizado`, lançadas à mão** |

A Fase 1 **não toca nelas**. Entram na regularização do histórico, com o escritório. Apenas as listo como o retrato do que o novo modelo impede daqui para frente.

### 2.4 Outras candidatas a "pago por terceiro" no histórico
33 saídas com texto de reembolso, adiantamento, "ofertado", "pago pelo" etc. (21 importadas do Omie, 12 lançadas à mão). Em 2026 são 10: adiantamentos de RPA e de pastor titular (R$ 8.000), **quatro "Reembolso ao Pastor Lúcio"** (R$ 310,50, 376,23, 89,50 e 251,10, setembro, **já pagos pela igreja e conciliados**) e as 3 solicitações acima. Os reembolsos já pagos ficam, no novo modelo, como **Responsável = Igreja** (derivado). Nada muda.

### 2.5 Consumidores do status: a lista real é maior que a do baseline (acréscimos à seção 2.2 da proposta)

O banco real tem **22 funções (23 com a sobrecarga de `fin_sugerir_centro_por_categoria`) e 7 views** que filtram `realizado`. Além das que eu já havia listado, entram:
`fin_categoria_resumo`, `fin_categorias_ranking`, `fin_centro_resumo`, `fin_fechar_periodo`, `fin_liquidar_com_pagamento_existente`, `fiscal_sincronizar_pagamento_trigger`, `vw_agenda_igreja`, `vw_sustento_conta_corrente` e, **a mais importante**, **`vw_fin_obrigacoes`** (usada em `obrigacoesService`, `cicloDaDespesaService`, `liquidacao.ts`, `EncargosDoPeriodo`, `LiquidacoesDoPeriodo`).

> **Armadilha encontrada:** `vw_fin_obrigacoes` calcula "pago" só com `realizado`/`conciliado`. Uma oferta `quitado_terceiro` apareceria ali como obrigação **em aberto**, o fantasma que o novo status quer evitar. **A view precisa ser ajustada na entrega 1B**, antes de a oferta ir ao ar. Entra na lista de consumidores e no ensaio.

### 2.6 Há 11 gatilhos na `fin_lancamentos`
Os que interessam ao novo modelo: `fin_lanc_bloqueio_fechamento` (bloqueia alteração em período fechado), `fin_lanc_congela_*` (D6), `fin_lanc_conta_auditada`, `fin_lanc_obrigacao_propria`, os três de vínculo bancário e `trg_fiscal_sync_pagamento` (sincroniza a agenda fiscal quando um lançamento é pago). Cada um entra no ensaio com um caso próprio, especialmente o fiscal, para provar que `quitado_terceiro` **não** marca obrigação fiscal como paga.

### 2.7 Cadastros
- **4 usuários do financeiro**, todos com `pessoa_id` ⇒ o teste do "circuito" (terceiro que também aprova/registra/paga) funciona automaticamente.
- **Fornecedores:** 31 pessoas físicas (todas com CPF) e 298 jurídicas, das quais **39 sem CNPJ válido**. Uma Empresa ou Entidade só pode ser Responsável **com CNPJ**: a função recusa, e a tela leva ao cadastro. Esses 39 precisam de CNPJ antes de serem usados.
- **Anexos:** 11 tipos em uso (nota_fiscal 127, boleto 34, comprovante 21, fatura 17, outro 18, guia 7, rsp 7, dps 6, rpa 6, documento 2, contrato 1). A `CHECK` de tipos aceita os três novos sem conflito.

## 3. Conclusão

**Nada do que foi medido contradiz o desenho aprovado.** Os números de linha de base, os saldos e o ciclo estão coerentes. Há **quatro acréscimos** ao plano, todos já refletidos acima:

1. caminho "registrar NF já quitada por terceiro" (obrigação + quitação juntas);
2. `vw_fin_obrigacoes` e mais seis objetos entram na lista de consumidores da entrega 1B;
3. caso de ensaio específico para o gatilho fiscal;
4. exigência de CNPJ para Empresa/Entidade (39 fornecedores a corrigir).

**Pendente de você:** quem pagou cada uma das três "Solicitações de Reembolso" (seção 2.2), e as duas decisões que ficaram em aberto (nº 6, aprovação de reembolso separada; nº 7, padrões conservadores).
