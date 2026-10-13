# Fase 1: proposta técnica da Quitação (Responsável, Intenção e Grau de Prova)

> **Para revisão. Nenhuma migration foi escrita, nenhum código foi alterado, nada foi aplicado.** Esta proposta foi feita lendo o código e as migrations do repositório (D1 a D7 incluídas). **Não consegui consultar o banco de produção:** o token de acesso do Supabase que havia no ambiente está inválido (provavelmente o que você revogou). Por isso os números sobre o histórico vêm das medições já registradas (13/10) e a validação do histórico é um **script só de leitura** (`docs/FASE1_VALIDACAO_HISTORICO.sql`) para você rodar antes de qualquer migration.
>
> Segue rigorosamente: Especificação Funcional v2, Adendo da Quitação e a arquitetura da Obrigação (D1 a D7 aplicadas).

---

## 0. O que você precisa decidir antes de eu escrever a primeira migration

São sete decisões. Todas têm uma recomendação.

| # | Decisão | Recomendação | Por quê |
|---|---|---|---|
| **1** | **Como uma obrigação é extinta sem passar por conta** (oferta). Novo valor `quitado_terceiro` no status do lançamento | **Aprovar** | É a única forma que não cria caixa fictício e que "falha para o lado seguro": saldo, extrato, conciliação e previsão de caixa já ignoram qualquer status que não seja `realizado`/`conciliado` (seção 2.2) |
| **2** | **Onde mora a Quitação**: tabela nova `fin_quitacoes` (com histórico), e não colunas soltas no lançamento | **Aprovar** | A quitação é um fato com data, autor, prova e histórico; hoje 1 por obrigação, amanhã várias |
| **3** | **"Igreja" como responsável é implícito**: não gravamos nada para as 15.6 mil linhas antigas; a visão deriva "Igreja" de quem já está pago | **Aprovar** | Coerente com D1 leve e D4 (não mexer nos históricos). Só terceiro, "Não localizado" e a decisão ganham registro |
| **4** | **Fase 1 em três entregas** (1A fatos e filas · 1B oferta · 1C reembolso e malote), cada uma com seu ensaio e sua autorização | **Aprovar** | Você pediu oferta e reembolso completos. Fazer tudo numa migration só quebraria o padrão que protegeu a produção até aqui |
| **5** | **Vigência** controlada por parâmetro: enquanto estiver vazia, nada bloqueia o fechamento nem o malote | **Aprovar** | Permite colocar o código no ar "apagado", ligar quando você e o escritório decidirem |
| **6** | **Aprovação de reembolso nova e separada.** O fluxo antigo (`aguardando_aprovacao`, onde "aprovar" = pagar) **não é tocado** na Fase 1 | **Aprovar** | Evita mexer num fluxo que não tem uso hoje (0 linhas pelas medições) e que mistura as duas coisas. Unificar fica para depois |
| **7** | **Padrões conservadores quando o escritório ainda não decidiu**: bem durável = nível **Alto** (exige Formal) enquanto o limite de capitalização estiver vazio; Empresa sem histórico de pagamentos = **Médio** | **Aprovar** | Sem parâmetro definido, o sistema pede mais prova, nunca menos |

---

## 1. Plano técnico da fase

### 1.1 Escopo da Fase 1

**Entra:**
- Os três fatos: **Responsável pela Quitação**, **Intenção da Quitação** e **Grau de Prova**, com histórico.
- A **Matriz de suficiência da prova** (função de banco + espelho em TypeScript testado).
- As quatro filas: **Investigar**, **A esclarecer**, **Formalizar**, **Reembolso a pagar**.
- **Oferta completa** (extingue sem caixa, sem banco, sem extrato).
- **Reembolso completo** (dívida com a pessoa, aprovação separada, pagamento posterior, liquidação).
- Bloqueios de **fechamento** e **malote** (atrás do parâmetro de vigência).
- Documentos novos de quitação (declaração do terceiro, pedido de reembolso, prova do pagamento do terceiro).
- Guardas: **nada marca uma obrigação "paga" por cima de uma quitação por terceiro**; nada cria entrada, transferência ou saída fictícia.

**Fica para as próximas fases:** compensação de adiantamento (o valor existe no dado, a tela o mostra desabilitado), doações diretas (D, E, F), Ficha do Bem, estoque por doação, linha de receita de doação no DRE (depende da conta que o escritório escolher), regularização do histórico, absorção do conceito de reembolso do módulo de Arrecadação.

### 1.2 Como as D1 a D7 continuam valendo

| Decisão | Como a Fase 1 a respeita |
|---|---|
| **D1** identidade = obrigação (`obrigacao_id`) | A quitação aponta para a obrigação-raiz. Nada novo substitui a obrigação |
| **D2** estado derivado; "Atrasada" é indicador | O estado continua calculado por `vw_fin_ciclo`. As filas são **indicadores** em colunas novas no fim da view |
| **D3** OFX só evolui; linha sem candidata nasce paga | Intocado. O pagamento do reembolso passa pela liquidação existente |
| **D4** vínculo bancário ≠ conferência | Extinção por terceiro termina em **Conferida**, nunca em Conciliada. Reaproveita `conferido_em/conferido_por` |
| **D5** Pronta calculada | Ganha uma condição: documentos da quitação presentes e aprovação registrada |
| **D6** Enviada/Arquivada, lote mensal, congelamento estreito | O gatilho de congelamento passa a tratar `quitado_terceiro` como "situação paga". Intenção e responsável congelam depois do envio |
| **D7** documento do grupo, comprovante da linha | Os novos documentos são do grupo da obrigação; o comprovante do reembolso é da linha |

---

## 2. Impactos nas tabelas

### 2.1 O que já existe e será reaproveitado (sem alterar a estrutura)

`fin_lancamentos` (a obrigação), `fin_liquidacoes` e `fin_liquidar` (o ato de pagar), `fin_lancamento_anexos` (documentos), `fin_extrato_vinculos` (D4), `fin_malote_envios` / `fin_malote_itens` / `fin_reaberturas` (D6), `fin_fornecedores` (Empresa e Entidade, que já têm CNPJ e PIX), `membros` e `profiles.pessoa_id` (Pessoa e o teste do "circuito"), `fin_pessoa_pix` (chave PIX de quem será reembolsado).

### 2.2 A decisão central: como extinguir sem conta

`fin_lancamentos.conta_id` é **NOT NULL**, mesmo para lançamento previsto. Uma oferta precisa de uma obrigação extinta que **não pode mexer em saldo**. Alternativas avaliadas:

| Alternativa | O que acontece | Veredito |
|---|---|---|
| **A. Novo status `quitado_terceiro`** | Saldo (`fin_recalc_saldo_conta` soma só `realizado`/`conciliado`), extrato, conciliação e previsão de caixa ignoram o status sozinhos. O risco é o contrário: relatórios de **despesa** que filtram `realizado` não enxergam a oferta até serem atualizados (**omissão visível, não dinheiro fantasma**) | **Recomendada** |
| B. Manter `previsto` + marca "extinta" | A oferta continua aparecendo como conta a pagar na Mesa, nos vencimentos, na previsão de caixa e em todo filtro de `previsto` (dezenas de objetos no banco, mais o TypeScript). **Fantasma de saída futura** | Rejeitada |
| C. Usar `cancelado` | A despesa some do DRE e do malote, o contrário do que o escritório precisa | Rejeitada |
| D. Entrada + transferência + saída numa conta de passagem | É exatamente o padrão fictício que esta política existe para eliminar | Proibida |

**Consequência técnica:** o enum `fin_lancamento_status` ganha o valor `quitado_terceiro`. `ALTER TYPE ... ADD VALUE` **não pode ser usado na mesma transação**, por isso o valor entra sozinho numa migration (M0), seguida de aplicação e só depois das demais.

**Objetos que filtram `realizado` e precisam ser classificados** (inventário do baseline; o ensaio de impacto os lista de novo no banco real, seção 7):

| Tipo de consumidor | Objetos conhecidos | Tratamento |
|---|---|---|
| **Caixa** (não deve incluir `quitado_terceiro`) | `fin_recalc_saldo_conta`, `fin_exec_saldo_consolidado`, `fin_exec_fluxo_12m`, `fin_previsao_caixa`, extrato e conciliação | Nada a fazer: já excluem |
| **Competência / despesa** (deve incluir como despesa, marcada "sem caixa") | `vw_fin_resumo_mes`, `vw_fin_centros_resumo`, `vw_fin_orcamento_vs_real`, `fin_alertas_centros`, `fin_comparativo_meses`, `fin_anomalias_mes`, `fin_exec_centros_ano`, `fin_top_fornecedores`, `montar_pauta_financeira`, DRE e prestação de contas | Entrega **1C**, uma a uma, com teste de equivalência |
| **Ciclo e malote** | `vw_fin_ciclo`, `fin_enviar_malote`, gatilho de congelamento, pacote contábil | Entrega **1B** |
| **Aplicativo (TypeScript)** | ~50 arquivos citam `realizado` (105 ocorrências). A maioria é caixa. Os de despesa: `finService`, `mesaOperacoesService`, `painelTesourariaService`, `cicloDoMesService`, `fechamentoMensal*`, `pacoteContabil*`, `dashboardExecutivoService`, `prestacaoContasService`, `FinancasCentroDetalhe`, `FinancasDRE` | Classificar no ensaio de impacto |

### 2.3 Tabelas e colunas novas

#### `fin_quitacoes` (nova, a Quitação)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid PK | |
| `obrigacao_id` | uuid NOT NULL → `fin_lancamentos(id)` ON DELETE RESTRICT | A obrigação-raiz. Não se apaga obrigação com quitação |
| `responsavel_tipo` | text CHECK `('pessoa','empresa','entidade','nao_localizado')` | **Igreja** e **Ninguém ainda** não têm linha (derivados) |
| `responsavel_pessoa_id` | uuid → `membros(id)` | Obrigatório se `pessoa` |
| `responsavel_fornecedor_id` | uuid → `fin_fornecedores(id)` | Obrigatório se `empresa`/`entidade`, **com CNPJ** |
| `grau_responsavel` | text CHECK `('formal','relatado','nenhum')` | |
| `intencao` | text CHECK `('reembolso','oferta','compensacao_adiantamento','nao_declarada','nao_se_aplica')` | `nao_localizado` ⇒ `nao_se_aplica`; terceiro ⇒ uma das quatro |
| `grau_intencao` | text CHECK `('formal','relatado','nenhum')` | `nao_declarada` ⇒ `nenhum` |
| `valor` | numeric(14,2) CHECK > 0 | Parte da NF que esta quitação extinguiu. **Fase 1: igual ao valor da obrigação** |
| `pago_em` | date | Quando o terceiro pagou |
| `declarado_em` | date | Quando declarou a intenção |
| `registrado_por`, `registrado_em` | uuid, timestamptz | Quem registrou (Tesouraria). Distinto do declarante, que é o próprio responsável |
| `nivel_risco` | text CHECK `('baixo','medio','alto')` | Resultado da Matriz **no momento do registro** (foto) |
| `moduladores` | text[] | Quais de M1 a M4 foram acionados |
| `suficiente` | boolean | A prova bastou? Calculado pela função, nunca digitado |
| `aprovacao_decisao` | text CHECK `('aprovada','recusada')` | Aprovação de reembolso, e do Administrador no nível Médio |
| `aprovado_por`, `aprovado_em`, `aprovacao_motivo` | uuid, timestamptz, text | Decisão **independente do pagamento** |
| `prazo_formalizacao` | date | Até quando o Relatado pode ficar sem o documento |
| `no_circuito` | boolean | Declarado pela Tesouraria **ou** deduzido (a pessoa tem usuário com papel do financeiro) |
| `ativa` | boolean DEFAULT true | Falsa quando substituída ou cancelada. Índice único: **uma ativa por obrigação** (Fase 1) |

#### `fin_quitacao_historico` (nova, só acrescenta)
Cada criação, mudança de responsável/intenção/grau e cada decisão: valores anteriores e novos (`jsonb`), `motivo` obrigatório (≥ 5 caracteres), autor, data e hora. Gerada por **gatilho** (ninguém "esquece"), no padrão de `fin_conta_alteracoes`. Nunca atualizada nem apagada.

#### `fin_quitacao_parametros` (nova, uma linha, só Administrador altera)
`vigencia` (date, **nula = tudo desligado**), `teto_1` (500), `prazo_declaracao_dias` (30), `teto_anual_terceiro` (2000), `qtd_relatado_trimestre` (3), `prazo_formalizacao_dias` (30), `prazo_esclarecimento_dias` (30), `prazo_reembolso_dias` (10), `limite_capitalizacao` (nulo ⇒ durável conta como Alto). Cada mudança fica auditada.

#### Colunas novas, todas opcionais
- `fin_lancamentos.comprador` (`'cnpj_igreja'` | `'contratacao_previa'`), `fin_lancamentos.natureza_item` (`'consumo'|'estoque'|'duravel'|'servico'`), `fin_lancamentos.nf_chave_acesso` (44 dígitos, validada: tamanho, dígito verificador e CNPJ do emitente contra o fornecedor).
- `fin_liquidacoes.quitacao_id` (uuid) e `fin_liquidacoes.beneficiario_pessoa_id` / `beneficiario_fornecedor_id`: **para quem o dinheiro foi**. O `fornecedor_id` do lançamento **não muda** (o emitente é fixo e a despesa continua sendo daquele fornecedor).
- `fin_lancamento_anexos`: a `CHECK` de tipo ganha `declaracao_terceiro`, `pedido_reembolso`, `prova_pagamento_terceiro` (e já `solicitacao_aprovacao`, `prova_cancelamento` para as próximas fases, sem uso agora).

#### Views
- `vw_fin_quitacao` (nova): por obrigação, o **Responsável derivado** (Igreja, Pessoa, Empresa, Entidade, Ninguém ainda, Não localizado), a Intenção, os graus, o **Resultado** (a tabela 3.6 da Política), o **credor atual**, a **fila** e `bloqueia_fechamento`.
- `vw_fin_ciclo`: colunas novas **só no fim** (regra do `CREATE OR REPLACE VIEW`): `responsavel`, `intencao`, `grau`, `fila`, `nivel_risco`, `quitacao_id`, `reembolso_a_pagar`. O `CASE` do estado passa a tratar `quitado_terceiro`.

### 2.4 O que muda no comportamento do banco

| Peça | Mudança |
|---|---|
| `fin_lanc_congela_enviada` (D6) | `quitado_terceiro` conta como situação paga; intenção e responsável congelam |
| Novo gatilho **anti-pagamento duplo** | Recusa marcar `realizado`/`conciliado` uma obrigação que tenha quitação por terceiro ativa, **exceto** pelo caminho do reembolso (variável de transação) |
| Novo gatilho de integridade | `quitado_terceiro` só em `tipo='saida'` e só se existir quitação ativa, suficiente, de oferta |
| `fin_enviar_malote` | Passa a recusar o envio do mês se houver item **A esclarecer** ou **Formalizar** (após a vigência); o resto igual |

---

## 3. Migrações necessárias

Cinco migrations, em ordem. **Nenhuma escrita ainda.** Cada uma terá `ENSAIO`, `APLICAR` e `ROLLBACK` no mesmo padrão das anteriores.

| # | Migration (nome provisório) | Conteúdo | Entrega |
|---|---|---|---|
| **M0** | `fin_status_quitado_terceiro` | Só `ALTER TYPE ... ADD VALUE 'quitado_terceiro'` | 1B |
| **M1** | `fin_quitacao_base` | Tabelas `fin_quitacoes`, `fin_quitacao_historico`, `fin_quitacao_parametros` (RLS: leitura equipe, **escrita só por função**), colunas novas, `CHECK` dos anexos, gatilho de histórico | 1A |
| **M2** | `fin_quitacao_funcoes` | `fin_quitacao_avaliar` (a Matriz), `fin_registrar_quitacao`, `fin_alterar_quitacao`, `fin_aprovar_quitacao`, `fin_marcar_nao_localizado`; gatilhos anti-duplo e de integridade; ajuste do congelamento | 1A/1B |
| **M3** | `fin_quitacao_visoes` | `vw_fin_quitacao`, `vw_fin_ciclo` ampliada, bloqueio no `fin_enviar_malote` | 1A/1B |
| **M4** | `fin_reembolso_liquidacao` | Colunas em `fin_liquidacoes`; função `fin_liquidar_reembolso` (reaproveita o miolo de `fin_liquidar`) | 1C |

Observações de desenho:
- **`fin_liquidar` não é alterada.** O reembolso ganha função própria. Mudar a assinatura de uma função existente criaria sobrecarga e ambiguidade no PostgREST.
- As funções são `SECURITY DEFINER` com `search_path` fixo, `REVOKE` de `PUBLIC`/`anon` e `GRANT` só a `authenticated`, como as de D6.
- Quem escreve é só a função. Nada de `INSERT` direto pela API (RLS sem política de escrita), como em `fin_malote_itens`.
- O aplicativo **funciona antes e depois**: sondagem de existência (padrão `liquidacaoDisponivel`) esconde o que ainda não foi migrado.

---

## 4. Telas afetadas

| Tela / componente | Arquivo | O que muda |
|---|---|---|
| **Pagar (diálogo de confirmação)** | `hooks/useAcoesLancamento.tsx` | Nova primeira pergunta: **"Quem quitou esta conta?"** Igreja segue o fluxo de hoje; Pessoa, Empresa ou Entidade abrem o registro da quitação. É aqui que "marcar como pago" deixa de apagar a obrigação |
| **Registrar quitação (novo)** | `components/financas/QuitacaoDialog.tsx` | Responsável (cadastro), data do pagamento do terceiro, Intenção, anexos (prova do pagamento e declaração/pedido), grau calculado pelo que foi anexado, **resultado da Matriz mostrado antes de confirmar** ("vale", "precisa do Administrador" ou "exige documento formal") |
| **Pagar reembolso (novo)** | `components/financas/PagarReembolsoDialog.tsx` | Reaproveita `LiquidacaoPainel` (parcial, várias notas) e o QR do PIX, mas do **cadastro da pessoa**. Só abre com aprovação registrada e grau Formal |
| **Detalhe da despesa** | `components/financas/DetalhesDoLancamento.tsx` | Cartão **Quitação**: Responsável, Intenção, graus, nível, "declarada depois", prazo de formalização e histórico |
| **Mesa de Operações** | `components/financas/MesaDoTesoureiro.tsx`, `services/mesaOperacoesService.ts` | Faixas **Reembolsos a pagar** e **Pendências de quitação** (Investigar, A esclarecer, Formalizar). O botão "Pagar" some de obrigação com quitação por terceiro (trocado por "Pagar reembolso") |
| **Painel da Tesouraria** | `pages/PainelTesouraria.tsx`, `services/painelTesourariaService.ts` | `MotivoPendencia` ganha `esclarecer`, `formalizar`, `investigar`, `reembolso`; aparece "Aprovar reembolso" como decisão própria |
| **Fluxo de aprovação** | novo item no Painel | Decisão registrada (quem, quando, motivo), com a alçada por valor e a regra "nunca o próprio favorecido". **Não usa** `aprovarLancamento` |
| **Fechamento** | `lib/fechamentoMensal.ts`, `services/fechamentoMensalService.ts`, `components/financas/FechamentoMensal.tsx` | `TipoBloqueio` ganha `a_esclarecer` e `formalizar` (bloqueiam, após a vigência); `investigar` e `reembolso_a_pagar` entram como atenção |
| **Malote / Pacote Contábil** | `services/pacoteContabilService.ts`, `components/financas/PacoteContabilCard.tsx`, `services/cicloDoMesService.ts` | Pastas **Reembolsos** e **Compras ofertadas**, selo **Relatado**, relatório de pendências, e a lista informativa "obrigações com terceiro em aberto" (Etapa 1 do reembolso) |
| **Documentos** | `AnexosLancamentoDialog.tsx`, `CartaoDocumento.tsx`, `FinancasCentralDocumentos.tsx` | Três tipos novos de anexo; modelos para impressão da Declaração do Terceiro e do Pedido de Reembolso |
| **Conferir** | ações de conferência em `ConciliacaoDrawer.tsx`, `ExtratoContaDrawer.tsx`, `finService.conciliarLancamento` | Em obrigação `quitado_terceiro`, conferir **grava só `conferido_em`/`conferido_por`**, sem trocar o status (hoje troca para `conciliado`, o que a faria entrar no saldo) |
| **Cadastro do responsável** | `SeletorFavorecido.tsx`, `FornecedorForm.tsx` | Cadastro rápido de Empresa/Entidade **exigindo CNPJ** |
| **Parâmetros** | `pages/FinancasAdmin.tsx` | Painel só do Administrador para a vigência, tetos e prazos |
| **Tipos** | `integrations/supabase/types.ts` | Entradas manuais (arquivo gerado, regra do projeto) |

**Novos arquivos de regra pura e testada** (padrão `cicloDaDespesa.ts`): `lib/quitacao.ts` (Matriz, resultado, fila) e `lib/quitacao.test.ts`.

---

## 5. Os dois cenários completos

### 5.1 Reembolso

| Passo | Quem | Sistema | Tabelas tocadas | Saldo |
|---|---|---|---|---|
| 1 | Tesouraria | Registra a NF (CNPJ da igreja, `comprador`, `natureza_item`, chave) | `fin_lancamentos` (previsto) | — |
| 2 | Tesouraria | Em "Pagar": **Quem quitou?** → Pessoa X. Anexa prova do pagamento e o Pedido de Reembolso. Intenção = Reembolso | `fin_quitacoes`, `fin_quitacao_historico`, `fin_lancamento_anexos` | **Não muda** |
| 3 | Sistema | A Matriz dá nível **Alto** (reembolso) ⇒ exige grau Formal. Com o Pedido anexado, `suficiente = true`. Resultado: **dívida com a pessoa**; credor = X; fila "Reembolso a pagar (aguardando aprovação)". O lançamento **continua `previsto`** | `vw_fin_quitacao` | Não muda |
| 4 | Aprovador | Aprova (alçada por valor; nunca o próprio). Decisão registrada, **sem pagar** | `fin_quitacoes.aprovacao_*` | Não muda |
| 5 | Tesouraria | **Pagar reembolso** ao X (PIX/TED/espécie), parcial ou total | `fin_liquidacoes` (`quitacao_id`, beneficiário), `fin_lancamentos` → `realizado` | **Cai uma vez** |
| 6 | Tesouraria | Concilia no OFX (ou confere, se espécie) | `fin_extrato_vinculos` | — |
| 7 | Sistema | Documentos completos + aprovação ⇒ **Pronta** | `vw_fin_ciclo` | — |
| 8 | Tesouraria | Malote: Etapa 1 (aviso) na competência; Etapa 2 (comprovante) no mês do pagamento | `fin_malote_itens` | — |

**Garantias:** o fornecedor nunca é pago (gatilho anti-duplo); o excesso sobre a NF é recusado; reembolso sem Formal não abre o "Pagar reembolso".

### 5.2 Oferta

| Passo | Quem | Sistema | Tabelas tocadas | Saldo |
|---|---|---|---|---|
| 1 | Tesouraria | Registra a NF (igual) | `fin_lancamentos` (previsto) | — |
| 2 | Tesouraria | "Pagar": Quem quitou? → Pessoa/Empresa/Entidade. Anexa a prova do pagamento e a Declaração de Oferta. Intenção = Oferta | `fin_quitacoes`, anexos | **Não muda** |
| 3 | Sistema | A Matriz avalia os 4 eixos e os moduladores e mostra o resultado **antes** de confirmar | `fin_quitacao_avaliar` | — |
| 4a | Sistema | **Suficiente**: a função grava `status = 'quitado_terceiro'`, **sem** `data_pagamento`, **sem** liquidação, **sem** lançamento novo | `fin_lancamentos` | **Não muda** |
| 4b | Sistema | **Insuficiente**: continua `previsto`, cai em **Formalizar** (bloqueia fechamento e malote) | `vw_fin_quitacao` | Não muda |
| 5 | Tesouraria | **Confere** (só `conferido_em`) | `fin_lancamentos.conferido_*` | Não muda |
| 6 | Sistema | Documentos completos ⇒ **Pronta** | `vw_fin_ciclo` | — |
| 7 | Tesouraria | Malote, pasta "Compras ofertadas" | `fin_malote_itens` | — |

**Garantias, verificadas no ensaio:** `saldo_atual` de todas as contas idêntico antes e depois; **zero** linhas novas em `fin_lancamentos`; **nenhum** vínculo em `fin_extrato_vinculos`; **nenhuma** entrada, transferência ou saída criada.

---

## 6. Ordem de implementação

Cada degrau termina em algo verificável e **só avança com a sua autorização**.

| Entrega | Passo | O que é | Pode ser desfeito? |
|---|---|---|---|
| **1A** | 1 | `lib/quitacao.ts` + testes (Matriz, resultado, fila). Sem banco | Sim, é só código |
| | 2 | M1 e M2: tabelas, parâmetros, funções, gatilhos. **Vigência vazia** | Sim (ROLLBACK mantém o histórico) |
| | 3 | M3: `vw_fin_quitacao` e `vw_fin_ciclo` ampliada. Prova de equivalência com o aplicativo sobre as 5.774 saídas | Sim |
| | 4 | Telas: cartão Quitação no detalhe, filas na Mesa e no Painel, `QuitacaoDialog` registrando **Não localizado**, **Não declarada** e terceiro identificado | Sim |
| **1B** | 5 | **M0** (valor do status) e depois a parte de oferta das funções | M0 não se desfaz (limitação do Postgres); inofensivo sem uso |
| | 6 | Oferta ponta a ponta + conferência + malote + congelamento | Sim |
| **1C** | 7 | M4: liquidação do reembolso, aprovação separada, `PagarReembolsoDialog` | Sim |
| | 8 | Bloqueios de fechamento e malote (dependem da **vigência**); Etapa 1 e 2 do malote | Sim |
| | 9 | Consumidores de despesa (DRE, orçamento, centros, prestação de contas), um a um, com teste de equivalência | Sim |
| | 10 | Ligar a vigência (**decisão sua, com o escritório**) | Sim (esvaziar o parâmetro) |

---

## 7. Riscos

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| **R1** | **Pagamento duplo**: a obrigação aparece na Mesa e alguém paga o fornecedor depois de um terceiro já ter pago | Alta | Gatilho recusa `realizado`/`conciliado` com quitação ativa; botão "Pagar" some; teste dedicado |
| **R2** | **Conferir vira "conciliado" e a oferta entra no saldo** (o botão de hoje troca o status) | Alta | Gatilho impede `quitado_terceiro` → `realizado`/`conciliado`; ação de conferir específica; teste de saldo idêntico |
| **R3** | **Raio do novo status**: relatório de despesa omite as ofertas até ser atualizado | Média | Falha para o lado visível; entrega 1C com lista fechada de consumidores e teste de equivalência; ofertas são só pós-vigência |
| **R4** | Sem banco de homologação e sem acesso meu à produção | Alta | Ensaio `BEGIN…ROLLBACK` por você, mais Postgres real local; nada é aplicado sem o seu "pode aplicar" |
| **R5** | `vw_fin_ciclo` é pesada e só aceita colunas novas no fim | Média | Colunas no fim; medir tempo antes e depois; equivalência nas 5.774 saídas |
| **R6** | Interação com o congelamento da D6 | Média | Gatilho ajustado e testado (oferta enviada não regride; reabertura volta para `previsto`) |
| **R7** | **RLS que barra em silêncio** (sucesso com 0 linhas) | Média | Toda escrita do aplicativo usa `conferir()`; escrita só por RPC que lança exceção |
| **R8** | Datas e fuso (prazos de 30 dias, "declarada depois") | Média | Helpers de `lib/data.ts`; testes com virada de dia às 21h |
| **R9** | Parâmetros indefinidos (limite de capitalização, tetos) | Média | Padrões conservadores (decisão 7); vigência vazia |
| **R10** | **Dois conceitos de reembolso**: `arr_trg_reembolso_gera_lancamento` (Arrecadação) já grava uma saída `realizado` na conta principal | Média | Fora da Fase 1, **documentado**; não se cria nada novo nele; absorção planejada depois |
| **R11** | Três botões de "aprovar" (o antigo, o do reembolso, o de nível Médio) confundem | Baixa | Rótulos distintos; o antigo não é oferecido para quitação |
| **R12** | Mudança de intenção depois do envio | Média | Congelamento + reabertura auditada (D6) |
| **R13** | O reembolso exige o Pedido assinado, mas o terceiro não é usuário do app | Média | A Tesouraria registra em nome dele, com o documento anexo; o declarante fica no documento |
| **R14** | A Política ainda não foi validada pelo escritório | Média | Nada contábil novo (linha de receita) entra no DRE na Fase 1; a vigência fica desligada |
| **R15** | Aparelho celular / WebView não aceita `confirm()` | Baixa | Só `AlertDialog` (regra do projeto) |
| **R16** | Leitor de NF não captura **chave de acesso** nem **destinatário** | Média | Fase 1 usa campos manuais validados (chave com dígito verificador) e a confirmação "destinatário = CNPJ da igreja". Melhorar o leitor depois |
| **R17** | Número de gatilhos na tabela mais quente do banco | Baixa | Gatilhos novos com `WHEN` estreito (só disparam em mudança de status/tipo) |

---

## 8. Ensaios

### 8.1 Em três camadas

1. **Testes unitários** (vitest): `lib/quitacao.test.ts` com a Matriz inteira (4 eixos, 4 moduladores, regras duras, formalização vencida) e o resultado/fila de cada combinação.
2. **Postgres real local** (embedded, como em D4 e D6): as migrations aplicadas em banco limpo e em cópia sintética com o formato dos dados; **equivalência função do banco × biblioteca TypeScript** em centenas de cenários gerados.
3. **Seu ensaio em produção, `BEGIN…ROLLBACK`**: `QUITACAO_ENSAIO.sql` aplica a migration, roda os casos abaixo com linhas sintéticas e **desfaz tudo**. Só depois do seu "pode aplicar" vem o `APLICAR`.

### 8.2 Casos obrigatórios (todos devem passar)

| # | Caso | Resultado esperado |
|---|---|---|
| E1 | Oferta, nível Baixo, Relatado | `quitado_terceiro`; **saldo de todas as contas idêntico** |
| E2 | Oferta, nível Médio, Relatado, sem aprovação do Administrador | Continua `previsto`, fila Formalizar |
| E3 | Oferta, nível Alto, Relatado | Recusada; exige Formal |
| E4 | Oferta de **bem durável** com limite de capitalização vazio | Nível Alto |
| E5 | Oferta de **Empresa** fornecedora de R$ 50 | Alto (o valor baixo não salva) |
| E6 | Oferta declarada 60 dias depois | M1 sobe um nível |
| E7 | Reembolso com grau Relatado | **Pagamento recusado** |
| E8 | Reembolso Formal, aprovado pelo próprio favorecido | Recusado; exige outro aprovador |
| E9 | Reembolso maior que a NF | Recusado |
| E10 | Reembolso parcial | Resta o saldo a pagar; segue na fila |
| E11 | **Pagar o fornecedor** com quitação por terceiro ativa | **Recusado pelo gatilho** |
| E12 | `confirmarPagamento` direto (caminho antigo) em obrigação com quitação | Recusado |
| E13 | Conferir uma `quitado_terceiro` | Grava `conferido_em`, **status não muda**, saldo não muda |
| E14 | Tentar `quitado_terceiro` → `conciliado` por UPDATE | Recusado |
| E15 | Mudar a intenção antes do envio | Aceita; histórico guarda anterior, novo, motivo, autor |
| E16 | Mudar a intenção depois do envio | Recusado; só por reabertura |
| E17 | Reabrir despesa `quitado_terceiro` enviada | Volta aos fatos; histórico da reabertura |
| E18 | Fechamento com um A esclarecer, **vigência vazia** | Não bloqueia |
| E19 | Fechamento com um A esclarecer, **vigência ligada** | Bloqueia |
| E20 | `fin_enviar_malote` com A esclarecer no mês, vigência ligada | Recusa; vigência vazia: segue |
| E21 | Escrita direta na API em `fin_quitacoes` | Recusada pela RLS |
| E22 | Responsável Empresa **sem CNPJ** | Recusado |
| E23 | Quitação sem anexo de prova do pagamento | Grau do responsável = Nenhum ⇒ insuficiente |
| E24 | Duplicidade: mesma NF (chave) registrada duas vezes | Aviso/recusa |
| E25 | **Invariante global** | Contagem de linhas em `fin_lancamentos` por `tipo` e o total de `fin_extrato_vinculos` **idênticos** antes e depois de todo o ensaio; **nenhuma** `entrada` e **nenhuma** `transferencia` nova |

### 8.3 Não-regressão sobre o que já existe

- `vw_fin_ciclo` × aplicativo: **0 divergências** nas saídas existentes (referência de 13/10: 5.774 saídas; Prontas 585; Em Aberto 14).
- Estados D1 a D7: cada um com seu teste existente rodando de novo.
- Saldos, previsão de caixa, extrato e conciliação OFX: **iguais** antes e depois.

---

## 9. Validação dos dados históricos

**Princípio (já decidido por você em D1, D4 e D6): nenhum lançamento histórico é alterado.** A Fase 1 não preenche, não reclassifica, não migra. Ela só **lê** o passado e o separa do futuro pela vigência.

### 9.1 O que o script de leitura mede (`docs/FASE1_VALIDACAO_HISTORICO.sql`)

Rode antes de qualquer migration e guarde o resultado (é a linha de base de comparação):

| Seção | Pergunta |
|---|---|
| V1 | Quantos lançamentos por tipo, status e origem? (linha de base) |
| V2 | Saldo de cada conta e diferença contra a soma dos lançamentos (deve ser zero; é o invariante) |
| V3 | Quantas obrigações em cada estado de `vw_fin_ciclo` |
| V4 | Saídas que **parecem** pagas por terceiro (texto com reembolso, adiantamento, "pago pelo", cartão pessoal, ofertado, doado) |
| V5 | **Padrão fictício antigo**, pela assinatura real: entradas descritas como "Oferta de NF" |
| V6 | Obrigações `previsto` com mais de 90 dias (candidatas a "Não localizado") |
| V7 | As 17 NFs do escritório: como estão no app hoje |
| V8 | Reembolsos do módulo de Arrecadação e linhas de `fin_solicitacoes` |
| V9 | Inventário de **views e funções** que filtram `realizado` (lista fechada de consumidores) |
| V10 | Gatilhos hoje na `fin_lancamentos` |
| V11 | Usuários do financeiro e quantos têm `pessoa_id` (para o teste do "circuito") |
| V12 | Fornecedores por tipo e quantos com CNPJ válido (prontos para serem Empresa/Entidade) |
| V13 | Distribuição dos tipos de anexo (para a `CHECK`) |

### 9.2 Como o passado convive com o futuro

| Situação histórica | Tratamento na Fase 1 |
|---|---|
| Saída `realizado`/`conciliado` | **Responsável = Igreja** (derivado). Sem registro. Nada muda |
| Saída `previsto` recente | **Ninguém ainda** (derivado) |
| Saída `previsto` com mais de 90 dias | Aparece como candidata em **Investigar**, mas só **você** marca "Não localizado". O sistema não decide sozinho |
| Linhas do padrão fictício (V5) | **Apenas listadas.** Estorno é regularização do histórico, com o escritório, fora da Fase 1 |
| As 17 NFs | Já têm a classificação feita na planilha v3; viram as primeiras quitações **registradas à mão por você**, uma a uma, depois da vigência ou em lote autorizado |
| Reembolsos do módulo de Arrecadação | Intocados |

### 9.3 O que já está medido (13/10, registrado em memória)

15.661 lançamentos · 5.774 saídas em `vw_fin_ciclo` (585 Prontas, 14 Em Aberto, nenhuma Enviada) · 336 vínculos bancários (308 OFX, 28 PDF) · 0 envios de malote · `fin_solicitacoes` sem uso no código. O script confirma e atualiza esses números no momento da revisão.

---

## 10. O que acontece depois da sua aprovação

1. Você roda o `FASE1_VALIDACAO_HISTORICO.sql` e me devolve o resultado (ou apenas confirma que está tudo coerente).
2. Você responde às **sete decisões** da seção 0.
3. Eu escrevo **a entrega 1A** (biblioteca, testes, M1, M2, M3 e telas de leitura) com `ENSAIO/APLICAR/ROLLBACK`, ensaiada em Postgres real, e você revisa antes de rodar qualquer coisa.
4. Seguem 1B e 1C, cada uma com o seu ciclo de revisão.

**Nada é aplicado sem o seu "pode aplicar".**
