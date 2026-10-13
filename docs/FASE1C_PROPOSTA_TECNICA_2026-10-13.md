# Fase 1C: proposta técnica (reembolso ponta a ponta, bloqueios, fila automática e regularizações)

> **Proposta para revisão. Nenhuma migration da 1C foi escrita.** Segue a regra de sempre: primeiro a proposta, depois o desenho de cada migration com ensaio, aplicar e rollback.
>
> **Situação do banco hoje (lido agora, só leitura):** a **1A e a 1B ainda não foram aplicadas** (não existem `fin_quitacoes`, o status `quitado_terceiro` nem as funções novas); há **13.936 lançamentos**. A sua ordem está aprovada (1A → M0 → ensaio 1B → revisão → aplicar 1B), mas os passos 1 e 2 são seus: **`QUITACAO_APLICAR.sql` está na sua área de transferência**. Quando disser "feito" (1A e M0), eu rodo o `QUITACAO_1B_ENSAIO.sql` em produção e lhe devolvo o resultado.
>
> **O princípio continua:** *Quem quitou?* e *Qual foi a intenção?* são os dois fatos do modelo; **todo o resto é derivado**. A 1C **não cria nenhuma coluna nova de fato**: a prova está na seção 1.2.

---

## 0. O que muda em relação ao que eu tinha dito

Dois achados desta leitura mudam a 1C:

1. **O Pacote Contábil e a documentação do mês só enxergam `realizado` e `conciliado`** (`saidasDoPeriodo` filtra por esses status). Uma oferta `quitado_terceiro` **não entra no ZIP do escritório**. Sem a 1C, a oferta extingue a obrigação no app mas **não chega à contabilidade**. É prioridade da 1C.
2. **`fin_fechar_periodo` só trava lançamentos `realizado`/`conciliado`.** Uma oferta ficaria **destravada** num período fechado. A 1C inclui `quitado_terceiro` na trava.

Boas notícias da leitura: o **pg_cron já está instalado** (versão 1.6.4, com um job semanal rodando) e o **pg_net também**; a fila automática que você pediu é viável **sem custo nem serviço novo**.

## 1. Reembolso ponta a ponta

### 1.1 O fluxo
| Passo | Quem | O que acontece | Onde já existe |
|---|---|---|---|
| 1 | Tesouraria | Registra a nota, a quitação (Pessoa/Empresa/Entidade + Reembolso) e anexa a prova do pagamento e o Pedido de Reembolso | 1A |
| 2 | Aprovador | Aprova (**não paga**) | 1A |
| 3 | Tesouraria | **Paga o reembolso** (PIX/TED/espécie), parcial ou total | **1C** |
| 4 | Tesouraria | Concilia no OFX (ou confere, se espécie) | existente |
| 5 | Sistema | Documentos completos ⇒ Pronta | existente |
| 6 | Tesouraria | Malote em duas etapas | **1C** |

### 1.2 O pagamento reaproveita a liquidação que já existe, **sem coluna nova**
`fin_liquidar_reembolso(quitacao, conta, data, forma, valor, comprovante, fitid, observação)` é uma **casca** em volta de `fin_liquidar`:
- confere as precondições: quitação de reembolso, prova **Formal**, **aprovação vigente**, valor ≤ saldo a reembolsar, papel do financeiro;
- liga a variável `qibrj.reembolso` (a que a guarda da 1A espera) e **chama `fin_liquidar`**, que já faz parcial, vínculo do extrato (FITID único) e tudo o mais;
- **nada novo é gravado em `fin_liquidacoes`**: o beneficiário **é** o responsável da quitação, e a ligação "esta liquidação reembolsou aquela quitação" se **deduz**: a liquidação paga o lançamento da obrigação, e essa obrigação tem uma quitação de reembolso. Não há como pagar essa obrigação de outro jeito (a guarda da 1A impede).

Duas consequências derivadas, em `vw_fin_quitacao`: `reembolsado` (soma já paga) e `saldo_a_reembolsar`; e o resultado "Reembolsada" só quando **o saldo zera** (hoje a visão olha o lançamento-raiz, e num pagamento parcial a raiz já aparece paga; corrijo para olhar a obrigação inteira).

### 1.3 Telas
- **Mesa, faixa "Reembolsos a pagar"**: lista as obrigações em `reembolso_a_pagar`, com o nome de quem recebe, a chave PIX (de `fin_pessoa_pix`), o valor e a idade; botão **Pagar reembolso**.
- **`PagarReembolsoDialog`**: reaproveita o `LiquidacaoPainel` (parcial) e o QR do PIX **da pessoa** (não do fornecedor). Só abre com aprovação vigente e prova Formal.
- **Painel, "Aprovar reembolso"**: já existe como fila; ganha atalho de aprovar.
- **Conciliação do OFX**: a linha do banco vai trazer o **nome da pessoa**, mas o lançamento carrega o **fornecedor** (o emitente). Hoje o casamento por nome falharia (por valor e data funciona). Ajuste: o candidato passa a considerar o beneficiário derivado.

### 1.4 Malote em duas etapas
- **Etapa 1, Aviso de extinção** (na competência da nota): relatório e pasta **Reembolsos/Aviso** no ZIP com nota, prova do pagamento do terceiro, Pedido de Reembolso e a aprovação (com usuário, data e hora). **Informativo, não congela** (a obrigação ainda não está Pronta).
- **Etapa 2**: quando o reembolso é pago e a obrigação fica **Pronta**, entra no lote do **mês do pagamento** (a regra atual do `fin_enviar_malote` já faz isso) com o comprovante.
- **Compras ofertadas**: o ZIP passa a incluir as `quitado_terceiro`, na pasta **Compras ofertadas**, pela competência da nota, com o selo **Relatado** quando for o caso.
- **Relatório de pendências** no ZIP: A esclarecer, Formalizar e Investigar, com a idade da nota.

## 2. Bloqueios de fechamento e de malote

Tudo atrás da **vigência** (parâmetro; vazia = nada bloqueia) e só para despesas **a partir dela**.

| Onde | Mudança |
|---|---|
| **Checklist do fechamento** (`lib/fechamentoMensal.ts`) | `TipoBloqueio` ganha `a_esclarecer` e `formalizar` (bloqueiam); `investigar` e `reembolso_a_pagar` entram só como atenção. Lê `vw_fin_quitacao.bloqueia_fechamento` do mês |
| **`fin_enviar_malote`** | Recusa o envio do mês se houver item que bloqueia (defesa no servidor, não só na tela) |
| **`fin_fechar_periodo`** | (a) recusa fechar período com item que bloqueia; (b) **passa a carimbar `fechamento_id` também nas `quitado_terceiro`**, para o período fechado travá-las |
| **Pacote e documentação do mês** | Passam a incluir `quitado_terceiro` (item 0.1) |

Meses **anteriores à vigência** nunca são bloqueados por esta Política (decisão sua; a vigência será o primeiro dia do mês seguinte à aplicação).

## 3. Fila automática de formalizações vencidas e Relatados a vencer

**Avaliação (o que você pediu).**

| Opção | Resolve? | Custo | Veredito |
|---|---|---|---|
| A. Só ao abrir a Mesa (hoje) | O status só se realinha quando alguém abre | zero | **Insuficiente**: é o problema que você apontou |
| B. **pg_cron diário** chamando uma função que sincroniza | O status se realinha todo dia, sem ninguém abrir nada | **zero** (pg_cron já instalado, 1.6.4) | **Recomendado** |
| C. **Visão derivada de prazos** (`vw_fin_quitacao_prazos`) + alerta no Painel | Mostra **antes** de vencer ("vence em 5 dias") | zero (nada guardado: calcula de registro + parâmetros) | **Recomendado**; é o que evita a surpresa |
| D. Aviso proativo por e-mail/WhatsApp | Chega a quem não abre o sistema | usa a função de borda `resumo-semanal` que já existe | **Opcional**; proponho incluir no resumo semanal uma linha com as contagens |

**Desenho de B + C (sem campo novo):**
- `fin_quitacao_sincronizar_agendada()`, **sem o teste de papel** (o cron não tem usuário), **não exposta** à API, chamada por `cron.schedule` **uma vez por dia (09:00)**. Nome do job: `quitacao-sincronizar`.
- `vw_fin_quitacao_prazos`: para cada quitação, **três prazos derivados**: formalização do Relatado (registro + 30 dias), esclarecimento (nota + 30 dias, e depois o Administrador decide uma das três saídas) e reembolso aprovado a pagar (aprovação + 10 dias). Cada linha traz `limite`, `dias_restantes` e `situacao` (**vencido**, **vence em até 7 dias** ou **no prazo**).
- **Painel e Mesa**: faixa "**Prazos da Quitação**" com **Vencidos** e **Vencem em 7 dias**; o alerta no Painel já existente (`fin_exec_alertas`) ganha a contagem.

## 4. Regularização do histórico

> **Princípio:** nada é alterado em silêncio. Cada regularização é um **ato auditado, reversível** (cópia em `fin_limpeza_backup`, como nas limpezas anteriores), com **ensaio** que prova **saldo idêntico em todas as contas**. **Só depois de o escritório validar a Política.**

### 4.1 As 8 entradas "Oferta de NF" (R$ 2.384,56)

**A leitura de hoje confirma o padrão completo:** cada entrada vem com uma **transferência** da Caixa de Envelopes para a Caixinha **e** a **saída real** da nota paga pela Caixinha. Entrada + transferência + saída: **três lançamentos para um fato que nunca moveu dinheiro da igreja**.

| # | Data | Valor | Fornecedor da saída | Quem ofertou (pela observação) |
|---|---|---|---|---|
| 1 | 09/01/2024 | 62,00 | Agata Com. Prod. de Higiene e Descartáveis | "Ofertado pelo irmão Caio" |
| 2 | 08/03/2024 | 516,06 | LHB Massaneiro Ferro e Aço | "Oferta no envelope NF 1168" (quem? a confirmar) |
| 3 | 12/04/2024 | 44,00 | Agata Com. Prod. de Higiene e Descartáveis | "Ofertado pelo irmão Caio" |
| 4 | 12/04/2026 | 1.000,00 | **a confirmar**: Vanderson Tomás Roza Silva (Caixinha, 12/04) **ou** Commander Digital (Bradesco, 24/03) | sem observação |
| 5 | 19/05/2026 | 543,00 | Traço Original Estúdio Gráfico | "Oferta de NF Pastor Lúcio Paulo" |
| 6 | 22/05/2026 | 192,50 | Yes Multivendas | "Oferta de NF Pastor Lúcio Paulo" |
| 7 | 12/08/2026 | 14,00 | Fer-Fix 390 (NF 6105) | a confirmar (ainda `realizado`, lançada à mão) |
| 8 | 12/08/2026 | 13,00 | Fer-Fix 390 (NF 6107) | a confirmar (ainda `realizado`, lançada à mão) |

**Mecanismo, `fin_regularizar_oferta_de_nf(entrada, saída, quem pagou, intenção, motivo)`** (só Administrador; tudo ou nada):
1. copia para o backup a **entrada**, as **duas pernas da transferência** e o estado da **saída**;
2. remove a entrada e as duas pernas;
3. devolve a **saída** a obrigação em aberto (mantém o `id`, o fornecedor, a nota e o histórico) e registra a **quitação de oferta** com quem a você disser;
4. o sincronizador extingue (`quitado_terceiro`) se a prova bastar, ou deixa em **Formalizar**.

**Invariante provado no ensaio:** o **saldo de cada conta** fica idêntico (entrada +X e transferência −X na Envelopes; transferência +X e saída −X na Caixinha: tudo se anula). O que muda é o **resultado**: as **ofertas deixam de ser receita** e a despesa passa a ter a oferta como origem. **Isso altera meses passados**: precisa do aval do escritório. Hoje nenhum mês foi fechado nem enviado (0 fechamentos, 0 envios), então tecnicamente é possível.

### 4.2 As 17 NFs do escritório
A planilha v3 já as classifica. O app não as tem; cada grupo entra por um caminho:

| Grupo | NFs | Como entra |
|---|---|---|
| **Oferta** | D Flesh (25597, R$ 137,28), pago em espécie pelo Pr. Patrick | **NF já quitada por terceiro** (1B), intenção Oferta. A prova fica **Relatada** até o termo assinado; o sistema mostra o prazo e a fila |
| **Paga pela igreja em dinheiro** | Del Castilho (24553, R$ 255,30) e Accor (166376, R$ 445,10) | Despesa comum **paga pela Caixinha**, com a data real. **Não é quitação por terceiro.** Você me confirma conta e data |
| **Cancelada** | Paulo Cid (184, R$ 150,00) | Desfecho **Cancelada** com a **prova do cancelamento** (tipo de anexo novo `prova_cancelamento` e uma função que exige a prova). **Não** é uma quitação |
| **Sem rastro** | as outras 13 (R$ 1.962,50) | NF registrada em aberto com **"Não localizado"** (fila **Investigar**). O diálogo da 1B hoje recusa isso; a 1C o permite |

**Execução:** um script gerado da planilha (`REGULARIZACAO_17_NFS_ENSAIO/APLICAR`) que chama as funções acima, **uma linha por NF**, com ensaio que prova que **nenhum saldo muda** (exceto as duas pagas em dinheiro, que movem a Caixinha uma vez e que você precisa autorizar) e que **nenhuma entrada nasce**.

### 4.3 Os três reembolsos em aberto

| Nota | Fornecedor | Valor |
|---|---|---|
| NF 106 | Rio Cinelândia 73 Vidros e Esquadrias | R$ 220,00 |
| NF 10998 | Giovanelli Embalagens | R$ 767,10 |
| sem nº (chave 17…) | Leandro Dias Gonçalves | R$ 1.500,00 |

Lidos hoje: três despesas **em aberto, vencidas em 11/10**, cada uma com a **nota fiscal anexada** (a de Giovanelli está em nome da Quarta Igreja Batista), nenhuma observação.
**Decisão sua mantida: nada é convertido automaticamente.** Ficam como estão até alguém confirmar **quem pagou**; aí o cartão "Quem pagou" as leva a A esclarecer, Formalizar ou Reembolso, conforme o que for declarado.
**Um risco real enquanto isso:** elas aparecem em **Contas a pagar, Atrasadas, com o botão Pagar**. Se alguém pagar o fornecedor e um terceiro já tiver pago, haverá pagamento em duplicidade. A 1C acrescenta um **aviso na tela Pagar** quando a descrição fala em reembolso ("confirme se um terceiro já pagou antes de pagar o fornecedor"). É só um aviso; **não bloqueia nada e não decide nada**.

## 5. Consumidores de despesa (DRE e relatórios)
A lista real tem **22 funções e 7 views** que filtram `realizado`. Na 1C: as de **caixa** não mudam; as de **competência** (DRE, orçamento × real, resumo por centro, categorias, top fornecedores, prestação de contas) passam a contar `quitado_terceiro` como despesa. **Nenhuma linha de "receita de doação não monetária" entra no DRE** até o escritório definir a conta (pergunta B.2 da Política). Cada função é atualizada com teste de equivalência.

## 6. Ordem de entrega da 1C

| Entrega | Conteúdo | Depende de |
|---|---|---|
| **1C-a** | Pagar reembolso (função, diálogo, faixa na Mesa), correção do "Reembolsada" parcial | 1A, 1B aplicadas |
| **1C-b** | Pacote e documentação do mês com `quitado_terceiro`; malote em duas etapas; relatório de pendências | 1C-a |
| **1C-c** | Bloqueios de fechamento e malote; `fin_fechar_periodo` | 1C-b; vigência |
| **1C-d** | Fila automática: `vw_fin_quitacao_prazos`, pg_cron diário, faixa e alerta | 1B |
| **1C-e** | Regularizações: cancelamento com prova, "Não localizado" na NF, 17 NFs, 8 entradas, aviso dos 3 reembolsos | 1C-a a 1C-c, **validação do escritório** |
| **1C-f** | Consumidores de despesa (DRE etc.) | 1B |

Cada uma com `ENSAIO`, `APLICAR` e `ROLLBACK`, e a sua revisão antes de aplicar.

## 7. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | Regularizar as 8 entradas **altera resultado de meses passados** | Só após o escritório validar; backup e rollback; saldo idêntico provado |
| R2 | `fin_fechar_periodo` passa a carimbar mais lançamentos | Ensaio compara o que é carimbado antes e depois para os `realizado`/`conciliado` (devem ser idênticos) |
| R3 | O cron diário roda sem usuário | Função própria, sem papel, **não exposta**; registra cada mudança no histórico com o usuário "sistema" |
| R4 | Pagar reembolso em OFX: nome da pessoa × fornecedor | Ajuste do candidato; casamento por valor e data continua valendo |
| R5 | Pagamento em duplicidade dos 3 reembolsos antes da confirmação | Aviso na tela Pagar (não bloqueia) |
| R6 | Cancelar uma NF já extinta por oferta | A função exige remover a quitação antes (com motivo) |
| R7 | O ZIP do escritório muda de formato (pastas novas) | Fica atrás do mesmo "Gerar malote"; o formato antigo continua para o que não tem quitação |

## 8. O que preciso de você

| # | Decisão | Recomendação |
|---|---|---|
| 1 | **Fila automática:** B (cron diário) + C (prazos derivados e alerta); D (resumo semanal) opcional | **B + C**; D depois |
| 2 | **Quem pagou cada uma das 8 entradas** (1, 2, 4, 7 e 8 não têm nome claro) e **qual saída é a certa na nº 4** | Você me diz; eu não presumo |
| 3 | **17 NFs:** confirmar que Del Castilho e Accor foram pagas em dinheiro pela Caixinha, e as datas | Você confirma |
| 4 | **Modelar "Cancelada"** (anexo `prova_cancelamento` + função) | Aprovar |
| 5 | **`fin_fechar_periodo`** passa a incluir `quitado_terceiro` e a recusar período com bloqueio | Aprovar |
| 6 | **Vigência**: primeiro dia do mês seguinte à aplicação da 1C-c | Aprovar |
| 7 | **Aviso na tela Pagar** para descrições com "reembolso" | Aprovar |
| 8 | **Ordem 1C-a a 1C-f** | Aprovar |
