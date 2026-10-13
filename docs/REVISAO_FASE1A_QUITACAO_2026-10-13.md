# Revisão da Entrega 1A: a Quitação como fato (para a sua revisão, antes de qualquer aplicação)

> **Nada foi aplicado no banco.** As três migrations estão no repositório como **PREPARADAS**; o aplicativo funciona antes e depois delas. Este documento traz o que você pediu para revisar: **o desenho**, **o impacto esperado**, **o resultado do ensaio** e **a estratégia de rollback**.
>
> Segue: Especificação v2, Adendo, Proposta Técnica da Fase 1, D1 a D7, e as suas decisões de 13/10 (aprovação separada do pagamento; padrões conservadores; "não quero campos redundantes quando o sistema puder inferir").

---

## 1. O que a entrega 1A faz (e o que não faz)

**Faz:** registra **quem pagou** (Pessoa, Empresa ou Entidade, ou "Não localizado") e **a intenção** (Reembolso, Não declarada; Oferta e Compensação ficam gated); deduz **grau de prova, nível de risco, suficiência, resultado, credor atual e fila**; separa **aprovar de pagar**; trava **pagar o fornecedor de uma conta que um terceiro já pagou**; cria a fila de **saneamento cadastral**.

**Não faz (de propósito):** não paga reembolso (1C); não extingue oferta (1B, precisa do status `quitado_terceiro`); não bloqueia fechamento nem malote (1C; e a **vigência nasce desligada**); não altera nenhum lançamento existente; não cria entrada, transferência ou saída.

## 2. Fato × derivado (o princípio que você reafirmou)

Eu havia proposto guardar o nível de risco, a suficiência e os moduladores na quitação. **Tirei.** Agora a tabela guarda só o que alguém **disse ou fez**; o resto o banco calcula toda vez:

| **Guardado (fato)** | **Derivado (nunca digitado)** |
|---|---|
| Responsável: tipo e cadastro (Pessoa, Empresa ou Entidade) ou "Não localizado" | **Igreja** e **Ninguém ainda** (de a despesa estar paga ou não) |
| Intenção declarada (Reembolso, Oferta, Compensação, Não declarada) | **Grau de prova**: nasce dos **anexos** (com a prova do pagamento do terceiro, Formal; com a declaração/Pedido, a intenção é Formal; sem eles, Relatado) |
| Data do pagamento e data da declaração | **Nível de risco, moduladores, suficiência** (a Matriz, com os parâmetros) |
| Condição da oferta e "pede recibo" | **Resultado, credor atual, fila**, bloqueio de fechamento |
| Quem registrou e quando | **Aprovação vigente** (a decisão mais recente, que perde a validade se a quitação mudar depois) |
| As decisões e as mudanças (histórico, só acrescenta) | **O estado** da despesa (a `vw_fin_ciclo`) |

Duas consequências boas: **ninguém consegue afirmar "Formal" sem o documento estar no sistema**, e nenhum campo pode ficar **contradizendo** o outro.

## 3. O desenho de cada migration

### 20261014100000: a base (tabelas, parâmetros, colunas)
| Objeto | O que é |
|---|---|
| `fin_cnpj_valido`, `fin_nfe_chave_valida` | Validação módulo 11, usadas nas `CHECK` e nas funções |
| `fin_lancamentos` + 3 colunas **nulas**: `comprador`, `natureza_item`, `nf_chave_acesso` | Com `CHECK` (a chave precisa passar no dígito verificador) |
| `fin_quitacao_parametros` | Uma linha: **vigência (nula = desligada)**, teto 1 (R$ 500), prazos (30/30/30/10), teto anual (R$ 2.000), 3 relatadas por trimestre, **limite de capitalização (nulo ⇒ bem durável conta como Alto)** |
| `fin_quitacoes` | **Uma por obrigação.** Só os fatos. `CHECK` de coerência (pessoa ⇒ cadastro de pessoa; empresa/entidade ⇒ favorecido; não localizado ⇒ sem nada) e "declarada ⇔ tem data de declaração" |
| `fin_quitacao_eventos` | Histórico **só acrescenta** (gatilho recusa alterar e apagar). Alimentado por **gatilho**: nenhuma escrita escapa; alterar e remover **exigem motivo** |
| Tipos de anexo novos | `declaracao_terceiro`, `pedido_reembolso`, `prova_pagamento_terceiro` (a `CHECK` é refeita derrubando qualquer `CHECK` de tipo anterior) |
| RLS | **Só leitura** para a equipe do financeiro; **sem política de escrita** (a API não escreve) |

### 20261014110000: as funções e as guardas
| Função | O que faz |
|---|---|
| `fin_quitacao_avaliar` / `fin_quitacao_resultado` / `fin_quitacao_graus` | A Matriz, o resultado/credor/fila e o grau pelos anexos. **Puras**, iguais às de `lib/quitacao.ts` |
| `fin_quitacao_entrada` | Reúne o que a Matriz precisa (anexos, nota e chave, circuito, histórico de pagamentos da empresa, moduladores). `SECURITY DEFINER` (a avaliação não depende do RLS de quem lê) |
| `fin_registrar_quitacao` / `fin_alterar_quitacao` / `fin_remover_quitacao` | Quem escreve. Exigem papel do financeiro; só em despesa **ainda a pagar**; alterar e remover **pedem motivo** |
| `fin_decidir_quitacao` | **A aprovação, evento próprio.** NÃO paga, NÃO gera liquidação, NÃO mexe em conta nem saldo. Alçada: Tesouraria até o teto 1, Administrador acima; **ninguém aprova o próprio reembolso**; só aprova com prova Formal |
| `fin_quitacao_parametros_alterar` | Só Administrador, com motivo, fica no histórico |
| **Guarda 1** (gatilho em `fin_lancamentos`) | Obrigação com quitação por terceiro **não pode ser marcada paga** pela via comum (evita pagar o fornecedor de novo). Se a marca era "Não localizado" e a igreja pagou, a marca some sozinha, **com rastro** |
| **Guarda 2** | Despesa com quitação **não se exclui** (mensagem clara) |
| **Gates** | Oferta: recusada até existir o status `quitado_terceiro` (1B). Compensação: recusada (fase futura) |

### 20261014120000: as visões
`vw_fin_quitacao` (a quitação com tudo derivado) e `vw_fin_ciclo` **ampliada só com colunas no fim** (`quitacao_id`, `responsavel`, `intencao`, `grau_conjunto`, `nivel_risco`, `fila`, `resultado`, `credor_atual`, `bloqueia_fechamento`). As colunas e estados existentes **não mudam**, com **duas** exceções que só valem para despesa que **tem quitação por terceiro** (hoje nenhuma): ela fica **Em aberto** mesmo antes do vencimento, e as provas da quitação **não contam como "documento original"**.

## 4. Impacto esperado em produção

| Pergunta | Resposta |
|---|---|
| Algum lançamento muda? | **Não.** 13.932 hoje; o ensaio compara o hash de todos antes e depois |
| A `vw_fin_ciclo` muda de resultado? | **Não** para as 4.037 saídas atuais (o ensaio compara estado, atraso e conferência de cada uma). Só ganha colunas no fim |
| Algum saldo muda? | **Não.** Nenhuma migration toca saldo |
| Alguém é bloqueado? | **Não.** A vigência nasce **desligada** |
| O que as pessoas veem de novo no app? | (a) o cartão **Quem pagou** no detalhe da despesa em aberto; (b) na tela **Pagar**, o link "Foi outra pessoa, empresa ou entidade que pagou?"; (c) na Mesa, a faixa **Quitações a resolver** (só aparece quando há algo nas filas) e a fila **Saneamento de cadastros** (já aparece, mesmo antes da migration: 42 empresas) |
| Bloqueio de tabela? | `ADD COLUMN` nulo é só metadado; criar gatilhos em `fin_lancamentos` pede um bloqueio de milissegundos |
| Desempenho | O ensaio mede a leitura da `vw_fin_ciclo` inteira antes e depois e **falha** se ficar 3× mais lenta + 2 s |
| Suposições sobre o banco real | Conferidas **por leitura** hoje: colunas obrigatórias de `fin_lancamentos` e `fin_lancamento_anexos` (o ensaio as preenche), papéis do enum, `membros.funcoes_ministeriais`, `fin_fechamentos_periodo`, `profiles.pessoa_id`, nada pré-existente com os nomes novos, `vw_fin_ciclo` **sem views dependentes** |

## 5. Resultado do ensaio

**Rodei o ensaio completo num Postgres 18 local**, com o esquema das migrations anteriores (D1, D2, D4, D6, liquidação) e os **três arquivos reais** (`QUITACAO_ENSAIO.sql`, `APLICAR`, `ROLLBACK`). **Resultado: TUDO OK.**

| Verificação | Resultado |
|---|---|
| Migrations não alteram lançamentos nem o resultado de `vw_fin_ciclo` | ✔ idênticos |
| Tabelas nascem vazias; vigência desligada | ✔ |
| T1 reembolso sem anexo ⇒ Formalizar; despesa futura já "Em aberto" | ✔ |
| T2 anexos tornam a prova Formal ⇒ Aprovar reembolso; a prova **não** conta como documento original | ✔ |
| T3 aprovar **não paga** (despesa segue prevista; saldo de **todas** as contas idêntico) | ✔ |
| T4 pagar o fornecedor de novo é **recusado** | ✔ |
| T5 alterar sem motivo recusado; com motivo vale; a **aprovação anterior perde a validade** | ✔ |
| T6 oferta recusada (até a 1B); compensação recusada | ✔ |
| T7 Empresa sem CNPJ válido recusada; o emitente não pode ser o terceiro; Empresa com CNPJ e intenção não declarada ⇒ A esclarecer | ✔ |
| T8 ninguém aprova o próprio reembolso | ✔ |
| T9 "Não localizado" ⇒ Investigar; se a igreja paga, a marca sai e fica o rastro | ✔ |
| T10 despesa com quitação não se exclui | ✔ |
| T11 a API não escreve nas tabelas novas nem nos parâmetros | ✔ |
| T12 o histórico não se apaga (1 registro, 1 alteração, 2 aprovações) | ✔ |
| T13 remover exige motivo; sem quitação, a igreja paga e o sistema deduz "Igreja" | ✔ |
| T14 vigência desligada não bloqueia; ligada, A esclarecer bloqueia | ✔ |
| T15 moduladores M1 e M2 elevam o nível | ✔ |
| **Garantia:** nenhuma entrada, transferência ou vínculo bancário criado | ✔ |
| **Equivalência banco × biblioteca TypeScript** | ✔ **6.000** cenários da Matriz, 360 de resultado/credor/fila, 320 de grau por anexos, CNPJ e 600 chaves de NF-e, **0 divergências** |
| **APLICAR** roda duas vezes | ✔ |
| **ROLLBACK** devolve a `vw_fin_ciclo` do D6 com o **mesmo** resultado, remove funções/gatilhos/visão e **mantém as tabelas**; e depois **APLICAR volta a funcionar** | ✔ |

**Um defeito real foi pego e corrigido pelo ensaio:** uma concatenação de lista (`mods || 'M1'`) quebrava a Matriz quando um modulador era acionado. Os testes ao vivo não o acionavam; a equivalência de 6.000 cenários o pegou. Corrigi e acrescentei o teste T15.

**Testes do aplicativo:** 1.267 passam (55 da Matriz e do registro, 9 do cartão, 3 novos do ciclo). **1 falha** em `navConfig.test.ts` ("/financas/reunioes sumiu do menu"): **já falhava antes das minhas mudanças** (confirmei no código limpo); não é desta entrega. `tsc -p tsconfig.app.json` sem erros; `vite build` ok.

**O que este ensaio NÃO prova:** o comportamento nos **seus dados reais**. Por isso o `QUITACAO_ENSAIO.sql` é feito para você rodar **em produção, desfazendo tudo no fim** (como os de D4 e D6): ele repete esta bateria com dados sintéticos sobre o seu banco e confere que nada existente mudou. **Também não vi na tela** o diálogo e o cartão funcionando contra o banco (só existem depois da migration); verifiquei a lógica por testes de componente e a Mesa e o Saneamento no navegador.

## 6. Estratégia de rollback

| Situação | O que fazer |
|---|---|
| Quero desfazer **antes de usar** | `docs/QUITACAO_ROLLBACK.sql`: remove gatilhos, funções e a visão nova e devolve a `vw_fin_ciclo` do D6. **Mantém** as tabelas, as colunas e os tipos de anexo (o histórico não se perde) |
| Já há quitações registradas | Remova-as (ou trate-as) antes. Sem as guardas, uma obrigação com quitação por terceiro voltaria a poder ser paga ao fornecedor |
| Quero apagar tudo (irreversível) | As linhas `DROP TABLE` e `DROP COLUMN` estão **comentadas** no fim do rollback |
| O aplicativo | Funciona antes e depois: sem as tabelas a tela esconde tudo (`quitacaoDisponivel`) |
| A vigência | Para "desligar" sem desfazer nada: `fin_quitacao_parametros_alterar` com `vigencia` vazia |

## 7. Decisões que tomei e que você pode querer mudar

| # | O que decidi | Por quê |
|---|---|---|
| 1 | **Grau de prova derivado dos anexos**, não digitado | Princípio dela; impede "Formal" sem documento |
| 2 | **Uma quitação por obrigação** e só em obrigação ainda sem baixa parcial | Primeira entrega; a lista fica para quando houver caso real |
| 3 | **Aprovação perde a validade** se a quitação for alterada depois | Evita aprovar uma coisa e pagar outra |
| 4 | **Qualquer usuário do financeiro conta como "no circuito"** (nível Alto) | Conservador. Hoje são 4 pessoas, todas com cadastro |
| 5 | "Ministro" = qualquer função ministerial diferente de "membro" (nível Médio) | A regra aprovada diz "ministro, diretor ou conselho" |
| 6 | **Quem registra pode aprovar** (só o favorecido não pode) | A equipe é de 4 pessoas; exigir outra pessoa travaria a rotina. **Diga se quer exigir que seja outra** |
| 7 | **Natureza do item e comprador são obrigatórios** ao registrar um terceiro | Sem eles a Matriz não tem como avaliar; sem natureza o padrão é Alto |
| 8 | Nota fiscal = anexo `nota_fiscal` ou `xml` | Eixo 3 da Matriz |
| 9 | Entidade fica em **Médio** (como a Empresa sem histórico) | Conservador |

## 8. Ordem para seguir

1. Rodar **`docs/QUITACAO_ENSAIO.sql`** em produção. Ele termina **sempre com um erro de propósito** ("ENSAIO CONCLUÍDO") para desfazer tudo; o relatório está na mensagem. Se disser **TUDO OK, pode aplicar**, me devolva a mensagem.
2. Você revisa este documento e dá o **"pode aplicar"**.
3. Aplica **`docs/QUITACAO_APLICAR.sql`** (pode rodar mais de uma vez) e confere no app.
4. Seguem 1B (oferta) e 1C (reembolso, malote e bloqueios).
