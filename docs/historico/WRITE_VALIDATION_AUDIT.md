# WRITE_VALIDATION_AUDIT.md — DiakoniaApp

Auditoria das operações de escrita no Supabase, executada em **25/08/2026**.

> Origem: **Achado 02** da Auditoria Técnica — o único achado crítico cujo defeito
> **já se materializou** neste projeto.
>
> **Nenhuma linha de código foi alterada.** Varredura de 285 arquivos em `src/`,
> cruzada com as 228 políticas de `UPDATE`/`DELETE`/`ALL` do banco de produção.

---

## 1. As duas conclusões

**Primeira:** o número documentado mede a metade menor do problema.

| | |
|---|---|
| Escritas que descartam o resultado por completo | **27** |
| Escritas que **checam `error` e acreditam estar protegidas** | **123** |
| **Total incapaz de detectar bloqueio de RLS** | **165 de 270** |

As 123 são o achado. Têm `if (error) return toast.error(...)`, passam por qualquer
revisão de código — e num `UPDATE` esse `if` **nunca dispara**.

**Segunda:** desprotegido não é o mesmo que em risco. Cruzando cada escrita com a
política da tabela que ela toca:

| Restrição da RLS na tabela | Escritas desprotegidas | Falha em silêncio hoje? |
|---|---|---|
| **Exige `is_admin()`** | **27** | **Sim, para todo não-admin** |
| **Exige papel específico** | **27** | **Sim, para quem não tem o papel** |
| Filtra por `auth.uid()` | 20 | Só fora do próprio registro |
| Política ampla | 76 | Improvável |
| Sem política de `UPDATE`/`DELETE` | 15 | `visita_historico` — ver §6.2 |

**São 54 escritas, não 165, que podem estar mentindo hoje.** É por elas que a correção
começa.

---

## 2. Por que checar `error` não basta — e quando basta

| Operação | RLS barra e acontece o quê? | `if (error)` detecta? |
|---|---|---|
| **INSERT** | Levanta `42501` — *"new row violates row-level security policy"* | **Sim** |
| **UPDATE** | A linha não entra no conjunto visível: **0 linhas, `error = null`** | **Não** |
| **DELETE** | Idem: **0 linhas, `error = null`** | **Não** |
| **UPSERT** | Se inserir, erra; se atualizar, silencia | **Parcialmente** |

**INSERT é barulhento. UPDATE e DELETE são mudos.**

> **Correção ao primeiro levantamento deste relatório.** A primeira passagem tratou
> como desprotegida toda escrita que só checava `error`, chegando a 192. Estava
> errado: para INSERT a checagem serve. A validação contra `VinculosDialog.tsx:88`
> mostrou a diferença, e os números abaixo são os da segunda contagem.

---

## 3. Panorama

### 3.1 Por operação

| Operação | Total | Protegida | Parcialmente | **Desprotegida** |
|---|---|---|---|---|
| `.insert()` | 91 | 76 | 0 | **15** |
| `.update()` | 126 | 13 | 8 | **105** |
| `.upsert()` | 13 | 1 | 1 | **11** |
| `.delete()` | 40 | 3 | 3 | **34** |

**270 escritas em tabelas.** Storage e `auth.updateUser` ficaram fora — não passam por
RLS de tabela.

### 3.2 Classificação

| Classe | Qtd. | Critério |
|---|---|---|
| **Protegida** | 93 | Usa `conferir()`, **ou** é INSERT que checa `error` |
| **Parcialmente protegida** | 12 | Tem `.select()` — dá para detectar — mas não passa por `conferir()` |
| **Desprotegida** | **165** | Não distingue "gravou" de "foi barrado" |

### 3.3 Por camada

| Camada | Escritas | Desprotegidas | Proporção |
|---|---|---|---|
| `src/services/` | 167 | 108 | 65% |
| `src/pages/` | 64 | 37 | 58% |
| `src/components/` | 37 | 19 | 51% |

Proporção **parecida nas três camadas** — não há um lugar onde a disciplina pegou. É
uniforme, o que confirma que `conferir()` é recente e ainda não se espalhou.

---

# As 54 escritas que podem estar falhando hoje

Desprotegidas **e** em tabela cuja RLS exige `is_admin()` ou papel específico. Ordenadas
por restrição.

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/components/familias/VinculosDialog.tsx:101` | `remover` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosPessoaDialog.tsx:80` | `remover` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/layout/UserMenuButton.tsx:40` | `nomeMembro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/components/membros/MembroForm.tsx:540` | `onDelete` | delete | `membros` | 🔴 admin | A ficha da pessoa — **eixo do domínio, 69 chaves estrangeiras apontam para cá** |
| `src/components/membros/VisitanteDialog.tsx:132` | `removeVisita` | delete | `visitas` | 🔴 admin | Registro de visita recebida |
| `src/pages/CampanhasAdmin.tsx:143` | `excluirCampanha` | delete | `campanhas` | 🔴 admin | Campanha da igreja |
| `src/pages/DocumentosAdmin.tsx:364` | `excluirSecao` | delete | `secoes_documento` | 🔴 admin | Seção de documento |
| `src/pages/DocumentosAdmin.tsx:396` | `salvarEstrutura` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/pages/DocumentosAdmin.tsx:411` | `excluirEstrutura` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/pages/Eventos.tsx:392` | `excluirEvento` | delete | `evento_ministerios` | 🔴 admin | Vínculo de evento com ministério |
| `src/pages/Eventos.tsx:393` | `excluirEvento` | delete | `evento_areas` | 🔴 admin | Vínculo de evento com área |
| `src/pages/Familias.tsx:210` | `desvinculo` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/pages/Familias.tsx:212` | `desvinculo` | delete | `familias` | 🔴 admin | Cadastro da família. Endereço e responsável |
| `src/pages/IdentidadeAdmin.tsx:535` | `redesAtivas` | update | `identidade_igreja` | 🔴 admin | Identidade institucional |
| `src/pages/IdentidadeAdmin.tsx:548` | `redesAtivas` | delete | `identidade_valores` | 🔴 admin | Valores institucionais |
| `src/pages/IdentidadeAdmin.tsx:552` | `redesAtivas` | update | `identidade_valores` | 🔴 admin | Valores institucionais |
| `src/pages/IdentidadeAdmin.tsx:569` | `atuaisSet` | delete | `igreja_instituicoes` | 🔴 admin | Instituição vinculada |
| `src/pages/LgpdAdmin.tsx:172` | `atualizarStatus` | update | `solicitacoes_lgpd` | 🔴 admin | Pedido do titular sob a LGPD — prazo legal para responder |
| `src/services/acessoService.ts:265` | `uid` | upsert | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/acessoService.ts:324` | `msgAmigavel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/acessoService.ts:359` | `tel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/estruturaSyncService.ts:122` | `payload` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/services/familiaService.ts:132` | `desvincularPessoa` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/services/userService.ts:221` | `uid` | upsert | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:291` | `tel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:308` | `erro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:322` | `erro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/components/familias/VinculosDialog.tsx:108` | `atualizarParentesco` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosDialog.tsx:117` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosDialog.tsx:122` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/membros/MembroForm.tsx:427` | `removidos` | update | `area_voluntarios` | 🟠 papel | Voluntário de área. Alimenta o motor de sugestão de escalas |
| `src/components/membros/ProximaAcaoCard.tsx:106` | `texto` | update | `membros` | 🟠 papel | A ficha da pessoa — **eixo do domínio, 69 chaves estrangeiras apontam para cá** |
| `src/components/ministerios/AreasDialog.tsx:52` | `onSubmit` | update | `areas` | 🟠 papel | Cadastro de área |
| `src/components/ministerios/VoluntariosDialog.tsx:104` | `hoje` | update | `area_voluntarios` | 🟠 papel | Voluntário de área. Alimenta o motor de sugestão de escalas |
| `src/pages/CampanhasAdmin.tsx:149` | `alterarStatus` | update | `campanhas` | 🟠 papel | Campanha da igreja |
| `src/pages/CampanhasAdmin.tsx:522` | `payload` | update | `campanhas` | 🟠 papel | Campanha da igreja |
| `src/pages/DocumentosAdmin.tsx:251` | `salvarDoc` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:311` | `marcarVigente` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:312` | `marcarVigente` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:336` | `kw` | update | `secoes_documento` | 🟠 papel | Seção de documento |
| `src/pages/Eventos.tsx:539` | `newId` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:558` | `updateBody` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:572` | `updateBody` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:602` | `currentMasterReg` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:612` | `newId` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Familias.tsx:143` | `onSubmit` | update | `familias` | 🟠 papel | Cadastro da família. Endereço e responsável |
| `src/pages/ImportacaoMembros.tsx:272` | `duplicados` | update | `importacoes_membros` | 🟠 papel | Controle de importação em lote |
| `src/pages/Locais.tsx:231` | `cap` | update | `locais` | 🟠 papel | Cadastro de local |
| `src/pages/Locais.tsx:274` | `toggleStatus` | update | `locais` | 🟠 papel | Cadastro de local |
| `src/pages/Ministerios.tsx:188` | `payload` | update | `ministerios` | 🟠 papel | Cadastro de ministério |
| `src/services/documentoIngestaoService.ts:253` | `resultado` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/services/escalaService.ts:286` | `marcarNotificado` | update | `escala_voluntarios` | 🟠 papel | Quem serve no evento. **O voluntário não é avisado** |
| `src/services/familiaService.ts:141` | `atualizarFamilia` | update | `familias` | 🟠 papel | Cadastro da família. Endereço e responsável |
| `src/services/ministerioRefatoracaoService.ts:304` | `patch` | update | `ministerios` | 🟠 papel | Cadastro de ministério |

**Leitura desta tabela.** Para um usuário sem o papel exigido, cada uma destas linhas é
uma tela que diz "salvo" e não salvou. As de `fin_*` erram o fechamento do mês; as de
`gov_*` erram o quórum de uma assembleia; a de `consentimento` compromete a prova
legal do aceite de LGPD.

---

## 4. Prioridade por módulo

| Módulo | Desprotegidas | Destas, em tabela restritiva |
|---|---|---|
| **Financeiro** | 15 | 0 |
| **Membros e famílias** | 26 | 15 |
| **Acolhimento** | 3 | 0 |
| **Agenda e escalas** | 10 | 8 |
| Outros | 32 | 23 |
| Arrecadação | 26 | 0 |
| Governança | 16 | 0 |
| Pequenos grupos | 11 | 0 |
| EBD | 10 | 0 |
| Ministérios | 7 | 4 |
| Acesso e identidade | 6 | 4 |
| Fiscal | 2 | 0 |
| Membresia | 1 | 0 |

**Sobre a ordem pedida.** Financeiro tem 15 desprotegidas e Acolhimento tem 3 —
mas **Acolhimento é onde o dano é maior por ocorrência**. Um lançamento financeiro que
não gravou reaparece na conciliação; um contato pastoral que não gravou **tira a pessoa
da fila e ninguém volta a procurá-la**. O CLAUDE.md §2.1 registra que foi exatamente
esse defeito que originou o `escritaConferida.ts`.

**Membros e famílias tem 26 e é o maior risco estrutural:** `membros` é o eixo do
domínio, com 69 chaves estrangeiras apontando para ela.

---

## 5. Ocorrências desprotegidas — detalhamento completo

### 5.1 Financeiro (15)

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/services/finService.ts:151` | `atualizarConta` | update | `fin_contas` | 🟢 ampla | Conta financeira e saldo |
| `src/services/finService.ts:156` | `desativarConta` | update | `fin_contas` | 🟢 ampla | Conta financeira e saldo |
| `src/services/finService.ts:264` | `atualizarLancamento` | update | `fin_lancamentos` | 🟢 ampla | **Lançamento financeiro.** Fecha o mês com número errado |
| `src/services/finService.ts:272` | `excluirLancamento` | delete | `fin_lancamentos` | 🟢 ampla | **Lançamento financeiro.** Fecha o mês com número errado |
| `src/services/finService.ts:320` | `atualizarCategoria` | update | `fin_categorias` | 🟢 ampla | Categoria de lançamento |
| `src/services/finService.ts:325` | `excluirCategoria` | delete | `fin_categorias` | 🟢 ampla | Categoria de lançamento |
| `src/services/finService.ts:338` | `reativarConta` | update | `fin_contas` | 🟢 ampla | Conta financeira e saldo |
| `src/services/finService.ts:343` | `excluirConta` | delete | `fin_contas` | 🟢 ampla | Conta financeira e saldo |
| `src/services/finService.ts:478` | `atualizarRecorrencia` | update | `fin_recorrencias` | 🟢 ampla | Lançamento recorrente — erra os meses seguintes |
| `src/services/finService.ts:483` | `excluirRecorrencia` | delete | `fin_recorrencias` | 🟢 ampla | Lançamento recorrente — erra os meses seguintes |
| `src/services/finService.ts:787` | `excluirOrcamento` | delete | `fin_orcamentos` | 🟢 ampla | Orçamento |
| `src/services/reunioesFinanceirasService.ts:90` | `atualizarReuniao` | update | `fin_reunioes_financeiras` | 🟢 ampla | Reunião financeira |
| `src/services/reunioesFinanceirasService.ts:98` | `excluirReuniao` | delete | `fin_reunioes_financeiras` | 🟢 ampla | Reunião financeira |
| `src/services/reunioesFinanceirasService.ts:149` | `atualizarDecisao` | update | `fin_decisoes_reuniao` | 🟢 ampla | Decisão de reunião financeira |
| `src/services/reunioesFinanceirasService.ts:157` | `excluirDecisao` | delete | `fin_decisoes_reuniao` | 🟢 ampla | Decisão de reunião financeira |

### 5.2 Membros e famílias (26)

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/components/familias/VinculosDialog.tsx:101` | `remover` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosPessoaDialog.tsx:80` | `remover` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/membros/MembroForm.tsx:540` | `onDelete` | delete | `membros` | 🔴 admin | A ficha da pessoa — **eixo do domínio, 69 chaves estrangeiras apontam para cá** |
| `src/components/membros/VisitanteDialog.tsx:132` | `removeVisita` | delete | `visitas` | 🔴 admin | Registro de visita recebida |
| `src/pages/Familias.tsx:210` | `desvinculo` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/pages/Familias.tsx:212` | `desvinculo` | delete | `familias` | 🔴 admin | Cadastro da família. Endereço e responsável |
| `src/services/familiaService.ts:132` | `desvincularPessoa` | delete | `vinculos_familiares` | 🔴 admin | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosDialog.tsx:108` | `atualizarParentesco` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosDialog.tsx:117` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/familias/VinculosDialog.tsx:122` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | Parentesco entre pessoas. Família fica incompleta ou com responsável errado |
| `src/components/membros/MembroForm.tsx:427` | `removidos` | update | `area_voluntarios` | 🟠 papel | Voluntário de área. Alimenta o motor de sugestão de escalas |
| `src/components/membros/ProximaAcaoCard.tsx:106` | `texto` | update | `membros` | 🟠 papel | A ficha da pessoa — **eixo do domínio, 69 chaves estrangeiras apontam para cá** |
| `src/pages/Familias.tsx:143` | `onSubmit` | update | `familias` | 🟠 papel | Cadastro da família. Endereço e responsável |
| `src/pages/ImportacaoMembros.tsx:272` | `duplicados` | update | `importacoes_membros` | 🟠 papel | Controle de importação em lote |
| `src/services/familiaService.ts:141` | `atualizarFamilia` | update | `familias` | 🟠 papel | Cadastro da família. Endereço e responsável |
| `src/components/membros/AcolhimentoPanel.tsx:66` | `novaConcluida` | update | `acolhimento_tarefas` | 🟡 usuário | Tarefa de acolhimento. Some da lista de quem precisa ser procurado |
| `src/components/membros/MembroForm.tsx:463` | `atualId` | update | `ebd_matriculas` | 🟡 usuário | Matrícula na EBD. Aluno na classe errada, ou em nenhuma |
| `src/components/membros/MembroForm.tsx:475` | `atualId` | update | `ebd_matriculas` | 🟡 usuário | Matrícula na EBD. Aluno na classe errada, ou em nenhuma |
| `src/services/pgmService.ts:176` | `vincularPessoa` | upsert | `pgm_membros` | 🟢 ampla | Membro de pequeno grupo |
| `src/services/pgmService.ts:189` | `desvincularPessoa` | update | `pgm_membros` | 🟢 ampla | Membro de pequeno grupo |
| `src/services/pgmService.ts:196` | `alterarPapel` | update | `pgm_membros` | 🟢 ampla | Membro de pequeno grupo |
| `src/services/pgmService.ts:201` | `marcarPrincipal` | update | `pgm_membros` | 🟢 ampla | Membro de pequeno grupo |
| `src/components/membros/MembroForm.tsx:410` | `hoje` | insert | `area_voluntarios` | — insert | Voluntário de área. Alimenta o motor de sugestão de escalas |
| `src/components/membros/MembroForm.tsx:470` | `atualId` | insert | `ebd_matriculas` | — insert | Matrícula na EBD. Aluno na classe errada, ou em nenhuma |
| `src/components/membros/VisitanteRapidoDialog.tsx:177` | `tarefas` | insert | `acolhimento_tarefas` | — insert | Tarefa de acolhimento. Some da lista de quem precisa ser procurado |
| `src/pages/ImportacaoMembros.tsx:264` | `l` | insert | `membros` | — insert | A ficha da pessoa — **eixo do domínio, 69 chaves estrangeiras apontam para cá** |

### 5.3 Acolhimento (3)

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/services/pgmService.ts:365` | `excluirVisita` | delete | `pgm_visitas` | 🟢 ampla | Visita de pequeno grupo |
| `src/lib/historicoFluxo.ts:33` | `logHistorico` | insert | `visita_historico` | — insert | **Contato pastoral.** Registra que alguém foi procurado — se não gravar, a pessoa some da fila e ninguém volta |
| `src/services/visitanteService.ts:129` | `registrarAcompanhamento` | insert | `acompanhamentos_visitante` | — insert | Acompanhamento de visitante novo |

### 5.4 Agenda e escalas (10)

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/pages/Eventos.tsx:392` | `excluirEvento` | delete | `evento_ministerios` | 🔴 admin | Vínculo de evento com ministério |
| `src/pages/Eventos.tsx:393` | `excluirEvento` | delete | `evento_areas` | 🔴 admin | Vínculo de evento com área |
| `src/pages/Eventos.tsx:539` | `newId` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:558` | `updateBody` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:572` | `updateBody` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:602` | `currentMasterReg` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/pages/Eventos.tsx:612` | `newId` | update | `eventos` | 🟠 papel | Evento da agenda. Data, local, horário |
| `src/services/escalaService.ts:286` | `marcarNotificado` | update | `escala_voluntarios` | 🟠 papel | Quem serve no evento. **O voluntário não é avisado** |
| `src/services/fiscalService.ts:151` | `darBaixaObrigacao` | update | `fiscal_agenda` | 🟢 ampla | Obrigação fiscal com vencimento — **prazo legal** |
| `src/services/fiscalService.ts:163` | `dispensarObrigacao` | update | `fiscal_agenda` | 🟢 ampla | Obrigação fiscal com vencimento — **prazo legal** |

### 5.5 Demais módulos (111)

| Arquivo | Função | Op. | Tabela | RLS | Impacto da falha |
|---|---|---|---|---|---|
| `src/components/layout/UserMenuButton.tsx:40` | `nomeMembro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/pages/CampanhasAdmin.tsx:143` | `excluirCampanha` | delete | `campanhas` | 🔴 admin | Campanha da igreja |
| `src/pages/DocumentosAdmin.tsx:364` | `excluirSecao` | delete | `secoes_documento` | 🔴 admin | Seção de documento |
| `src/pages/DocumentosAdmin.tsx:396` | `salvarEstrutura` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/pages/DocumentosAdmin.tsx:411` | `excluirEstrutura` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/pages/IdentidadeAdmin.tsx:535` | `redesAtivas` | update | `identidade_igreja` | 🔴 admin | Identidade institucional |
| `src/pages/IdentidadeAdmin.tsx:548` | `redesAtivas` | delete | `identidade_valores` | 🔴 admin | Valores institucionais |
| `src/pages/IdentidadeAdmin.tsx:552` | `redesAtivas` | update | `identidade_valores` | 🔴 admin | Valores institucionais |
| `src/pages/IdentidadeAdmin.tsx:569` | `atuaisSet` | delete | `igreja_instituicoes` | 🔴 admin | Instituição vinculada |
| `src/pages/LgpdAdmin.tsx:172` | `atualizarStatus` | update | `solicitacoes_lgpd` | 🔴 admin | Pedido do titular sob a LGPD — prazo legal para responder |
| `src/services/acessoService.ts:265` | `uid` | upsert | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/acessoService.ts:324` | `msgAmigavel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/acessoService.ts:359` | `tel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/estruturaSyncService.ts:122` | `payload` | update | `documento_estrutura` | 🔴 admin | Estrutura de documento |
| `src/services/userService.ts:221` | `uid` | upsert | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:291` | `tel` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:308` | `erro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/services/userService.ts:322` | `erro` | update | `profiles` | 🔴 admin | Perfil do usuário. **Escrever aqui é escrever nas colunas legadas** (`role`, `primeiro_acesso`) que divergem da fonte de verdade |
| `src/components/ministerios/AreasDialog.tsx:52` | `onSubmit` | update | `areas` | 🟠 papel | Cadastro de área |
| `src/components/ministerios/VoluntariosDialog.tsx:104` | `hoje` | update | `area_voluntarios` | 🟠 papel | Voluntário de área. Alimenta o motor de sugestão de escalas |
| `src/pages/CampanhasAdmin.tsx:149` | `alterarStatus` | update | `campanhas` | 🟠 papel | Campanha da igreja |
| `src/pages/CampanhasAdmin.tsx:522` | `payload` | update | `campanhas` | 🟠 papel | Campanha da igreja |
| `src/pages/DocumentosAdmin.tsx:251` | `salvarDoc` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:311` | `marcarVigente` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:312` | `marcarVigente` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/pages/DocumentosAdmin.tsx:336` | `kw` | update | `secoes_documento` | 🟠 papel | Seção de documento |
| `src/pages/Locais.tsx:231` | `cap` | update | `locais` | 🟠 papel | Cadastro de local |
| `src/pages/Locais.tsx:274` | `toggleStatus` | update | `locais` | 🟠 papel | Cadastro de local |
| `src/pages/Ministerios.tsx:188` | `payload` | update | `ministerios` | 🟠 papel | Cadastro de ministério |
| `src/services/documentoIngestaoService.ts:253` | `resultado` | update | `documentos` | 🟠 papel | Documento institucional |
| `src/services/ministerioRefatoracaoService.ts:304` | `patch` | update | `ministerios` | 🟠 papel | Cadastro de ministério |
| `src/services/arrecadacaoService.ts:260` | `userId` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:273` | `userId` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:285` | `iniciarUso` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:292` | `arquivarReserva` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:555` | `userId` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:596` | `userId` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/arrecadacaoService.ts:1594` | `encerrarReserva` | update | `arr_reservas` | 🟡 usuário | Reserva de espaço — **espaço fica duplo-reservado ou livre por engano** |
| `src/services/ebdService.ts:74` | `desmatricular` | update | `ebd_matriculas` | 🟡 usuário | Matrícula na EBD. Aluno na classe errada, ou em nenhuma |
| `src/services/ebdService.ts:131` | `excluirClasse` | delete | `ebd_classes` | 🟡 usuário | Cadastro de classe — faixa etária e gênero |
| `src/services/ebdService.ts:137` | `desativarClasse` | update | `ebd_classes` | 🟡 usuário | Cadastro de classe — faixa etária e gênero |
| `src/services/ebdService.ts:144` | `reativarClasse` | update | `ebd_classes` | 🟡 usuário | Cadastro de classe — faixa etária e gênero |
| `src/services/ebdService.ts:185` | `removerProfessor` | update | `ebd_professores` | 🟡 usuário | Professor da classe |
| `src/services/ebdService.ts:241` | `atualizarAula` | update | `ebd_aulas` | 🟡 usuário | Registro de aula |
| `src/services/ebdService.ts:376` | `atualizarCampanha` | update | `ebd_campanhas` | 🟡 usuário | Campanha da EBD |
| `src/services/ebdService.ts:381` | `excluirCampanha` | delete | `ebd_campanhas` | 🟡 usuário | Campanha da EBD |
| `src/services/ebdService.ts:410` | `atualizarEntrada` | update | `ebd_entradas` | 🟡 usuário | Entrada da campanha da EBD |
| `src/services/ebdService.ts:421` | `excluirEntrada` | delete | `ebd_entradas` | 🟡 usuário | Entrada da campanha da EBD |
| `src/components/assuntos/AssuntoForm.tsx:91` | `novo` | upsert | `reuniao_assuntos` | 🟢 ampla | Vínculo de assunto com reunião |
| `src/pages/GovernancaReuniao.tsx:641` | `onSubmit` | upsert | `gov_participantes` | 🟢 ampla | Participante de reunião — compõe quórum |
| `src/pages/RecuperacaoSenhaAdmin.tsx:86` | `resolver` | update | `recuperacao_senha` | 🟢 ampla | Token de recuperação de senha |
| `src/services/arrecadacaoService.ts:161` | `atualizarTaxasEspaco` | update | `arr_espacos` | 🟢 ampla | Espaço locável |
| `src/services/arrecadacaoService.ts:334` | `linhas` | upsert | `arr_reserva_checklist` | 🟢 ampla | Checklist de reserva |
| `src/services/arrecadacaoService.ts:352` | `userId` | update | `arr_reserva_checklist` | 🟢 ampla | Checklist de reserva |
| `src/services/arrecadacaoService.ts:397` | `atualizarProduto` | update | `arr_produtos` | 🟢 ampla | Produto de bazar/cantina |
| `src/services/arrecadacaoService.ts:404` | `arquivarProduto` | update | `arr_produtos` | 🟢 ampla | Produto de bazar/cantina |
| `src/services/arrecadacaoService.ts:523` | `moverCaixaParaConciliando` | update | `arr_caixas` | 🟢 ampla | Caixa — abertura e fechamento |
| `src/services/arrecadacaoService.ts:542` | `userId` | update | `arr_caixas` | 🟢 ampla | Caixa — abertura e fechamento |
| `src/services/arrecadacaoService.ts:583` | `userId` | update | `arr_caixas` | 🟢 ampla | Caixa — abertura e fechamento |
| `src/services/arrecadacaoService.ts:651` | `userId` | update | `arr_vendas` | 🟢 ampla | Venda |
| `src/services/arrecadacaoService.ts:685` | `removerOperador` | delete | `arr_caixa_operadores` | 🟢 ampla | Operador de caixa |
| `src/services/arrecadacaoService.ts:863` | `arquivarMovimento` | update | `arr_movimentos` | 🟢 ampla | Movimento de caixa |
| `src/services/arrecadacaoService.ts:940` | `userId` | update | `arr_reserva_checklist` | 🟢 ampla | Checklist de reserva |
| `src/services/arrecadacaoService.ts:1002` | `atualizarProblema` | update | `arr_problemas_manutencao` | 🟢 ampla | Problema de manutenção reportado |
| `src/services/arrecadacaoService.ts:1010` | `userId` | update | `arr_problemas_manutencao` | 🟢 ampla | Problema de manutenção reportado |
| `src/services/arrecadacaoService.ts:1051` | `atualizarResponsavelEspaco` | update | `arr_espacos` | 🟢 ampla | Espaço locável |
| `src/services/arrecadacaoService.ts:1425` | `atualizarChecklistTemplate` | update | `arr_checklist_template` | 🟢 ampla | Modelo de checklist |
| `src/services/arrecadacaoService.ts:1433` | `arquivarChecklistTemplate` | update | `arr_checklist_template` | 🟢 ampla | Modelo de checklist |
| `src/services/arrecadacaoService.ts:1562` | `novo` | update | `arr_produtos` | 🟢 ampla | Produto de bazar/cantina |
| `src/services/assuntosService.ts:137` | `atualizarAssunto` | update | `assuntos` | 🟢 ampla | Assunto para reunião |
| `src/services/assuntosService.ts:142` | `excluirAssunto` | delete | `assuntos` | 🟢 ampla | Assunto para reunião |
| `src/services/assuntosService.ts:180` | `vincularAssuntoNaReuniao` | upsert | `reuniao_assuntos` | 🟢 ampla | Vínculo de assunto com reunião |
| `src/services/assuntosService.ts:187` | `desvincularAssuntoDaReuniao` | delete | `reuniao_assuntos` | 🟢 ampla | Vínculo de assunto com reunião |
| `src/services/estoqueService.ts:88` | `atualizarItem` | update | `fin_estoque_itens` | 🟢 ampla | Item de estoque |
| `src/services/estoqueService.ts:93` | `desativarItem` | update | `fin_estoque_itens` | 🟢 ampla | Item de estoque |
| `src/services/estoqueService.ts:135` | `excluirMovimento` | delete | `fin_estoque_movimentos` | 🟢 ampla | Movimento de estoque |
| `src/services/fiscalService.ts:73` | `atualizarConfig` | update | `fiscal_config` | 🟢 ampla | Configuração fiscal |
| `src/services/fiscalService.ts:104` | `definirObrigacaoAtiva` | upsert | `fiscal_obrigacoes_ativas` | 🟢 ampla | Obrigação fiscal ativa |
| `src/services/folhaService.ts:67` | `atualizarContratado` | update | `fin_contratados` | 🟢 ampla | Contratado / prestador |
| `src/services/folhaService.ts:72` | `desativarContratado` | update | `fin_contratados` | 🟢 ampla | Contratado / prestador |
| `src/services/governancaService.ts:129` | `atualizarReuniao` | update | `gov_reunioes` | 🟢 ampla | Reunião de governança |
| `src/services/governancaService.ts:134` | `excluirReuniao` | delete | `gov_reunioes` | 🟢 ampla | Reunião de governança |
| `src/services/governancaService.ts:160` | `adicionarParticipante` | upsert | `gov_participantes` | 🟢 ampla | Participante de reunião — compõe quórum |
| `src/services/governancaService.ts:180` | `marcarPresenca` | update | `gov_participantes` | 🟢 ampla | Participante de reunião — compõe quórum |
| `src/services/governancaService.ts:185` | `removerParticipante` | delete | `gov_participantes` | 🟢 ampla | Participante de reunião — compõe quórum |
| `src/services/governancaService.ts:206` | `atualizarPauta` | update | `gov_pautas` | 🟢 ampla | Pauta — deliberação da assembleia |
| `src/services/governancaService.ts:211` | `excluirPauta` | delete | `gov_pautas` | 🟢 ampla | Pauta — deliberação da assembleia |
| `src/services/governancaService.ts:366` | `atualizarAssembleia` | update | `gov_assembleias` | 🟢 ampla | Assembleia |
| `src/services/governancaService.ts:438` | `rows` | upsert | `gov_assembleia_presentes` | 🟢 ampla | Presença em assembleia — **compõe quórum de deliberação** |
| `src/services/governancaService.ts:460` | `marcarPresencaAssembleia` | update | `gov_assembleia_presentes` | 🟢 ampla | Presença em assembleia — **compõe quórum de deliberação** |
| `src/services/membresiaService.ts:144` | `atualizarSolicitacao` | update | `solicitacoes_membresia` | 🟢 ampla | Entrada ou saída do rol de membros |
| `src/services/pgmService.ts:117` | `atualizarGrupo` | update | `pgm_grupos` | 🟢 ampla | Pequeno grupo |
| `src/services/pgmService.ts:122` | `desativarGrupo` | update | `pgm_grupos` | 🟢 ampla | Pequeno grupo |
| `src/services/pgmService.ts:127` | `reativarGrupo` | update | `pgm_grupos` | 🟢 ampla | Pequeno grupo |
| `src/services/pgmService.ts:132` | `excluirGrupo` | delete | `pgm_grupos` | 🟢 ampla | Pequeno grupo |
| `src/services/pgmService.ts:294` | `atualizarReuniao` | update | `pgm_reunioes` | 🟢 ampla | Reunião de pequeno grupo |
| `src/services/pgmService.ts:301` | `r` | delete | `pgm_reunioes` | 🟢 ampla | Reunião de pequeno grupo |
| `src/services/pgmService.ts:333` | `marcarPresenca` | update | `pgm_presencas` | 🟢 ampla | Presença em pequeno grupo |
| `src/services/pgmService.ts:481` | `responderPedidoOracao` | update | `pgm_pedidos_oracao` | 🟢 ampla | Pedido de oração |
| `src/services/pgmService.ts:491` | `arquivarPedidoOracao` | update | `pgm_pedidos_oracao` | 🟢 ampla | Pedido de oração |
| `src/services/pgmService.ts:496` | `excluirPedidoOracao` | delete | `pgm_pedidos_oracao` | 🟢 ampla | Pedido de oração |
| `src/services/pgmService.ts:546` | `salvarMarcos` | upsert | `pgm_marcos_discipulado` | 🟢 ampla | Marco de discipulado |
| `src/pages/AceiteLgpd.tsx:128` | `onAceitar` | insert | `consentimento` | — insert | **Registro legal de LGPD.** Se não gravar, a igreja não consegue comprovar o consentimento |
| `src/pages/CampanhasAdmin.tsx:555` | `path` | insert | `campanha_materiais` | — insert | Material de campanha — ver STORAGE_AUDIT.md |
| `src/pages/IdentidadeAdmin.tsx:556` | `redesAtivas` | insert | `identidade_valores` | — insert | Valores institucionais |
| `src/pages/IdentidadeAdmin.tsx:565` | `atuaisSet` | insert | `igreja_instituicoes` | — insert | Instituição vinculada |
| `src/pages/PrimeiroAcesso.tsx:64` | `onSubmit` | insert | `log_auditoria` | — insert | **Trilha de auditoria.** Se não gravar, o evento aconteceu e não ficou registro |
| `src/services/arrecadacaoService.ts:1550` | `novo` | insert | `arr_estoque_movimentos` | — insert | Movimento de estoque de arrecadação |
| `src/services/ministerioRefatoracaoService.ts:288` | `snapshot` | insert | `documentos_historico` | — insert | Histórico de documento |
| `src/services/ministerioRefatoracaoService.ts:306` | `patch` | insert | `documentos_historico` | — insert | Histórico de documento |
| `src/services/ministerioRefatoracaoService.ts:324` | `novo` | insert | `documentos_historico` | — insert | Histórico de documento |

---

## 6. Dois achados laterais

### 6.1 `profiles` tem 8 escritas desprotegidas

A tabela cujas colunas `role` e `primeiro_acesso` a Auditoria Técnica classificou como
**divergentes e que não devem ser lidas** (Achado 14) continua sendo **escrita** — e
sem conferência.

A recomendação do achado era "parar de escrever nelas". **Este relatório mostra onde
essa escrita acontece**, o que torna a recomendação executável.

### 6.2 `visita_historico` não tem política de `UPDATE`/`DELETE`

Única tabela escrita pelo sistema sem política para essas operações. Com RLS ligada e
sem política permissiva, **toda tentativa de `UPDATE` ou `DELETE` afeta zero linhas**,
sempre, para qualquer papel.

O `INSERT` funciona — e é o que o sistema usa. Mas se alguém construir a função de
corrigir ou desfazer um contato pastoral, **ela vai falhar em silêncio para todo mundo,
inclusive para o administrador**. A Auditoria Técnica já registrava a decisão pendente
de criar uma política de "desfazer" para essa tabela.

---

## 7. Plano de correção

### 7.1 O princípio

Não é por volume. É por **quanto tempo o erro passa despercebido**:

| Critério | Por quê |
|---|---|
| 1º · A RLS é mais restritiva que o portão da tela | É onde o bloqueio de fato acontece — as 54 da tabela acima |
| 2º · `UPDATE` e `DELETE` antes de `INSERT` | INSERT já é detectado pelo erro |
| 3º · Dano que não se reencontra depois | Acolhimento antes de Financeiro |
| 4º · Tabelas com muitos dependentes | `membros` propaga por 69 chaves estrangeiras |

### 7.2 As quatro ondas

**Onda 1 · As 54 em tabela restritiva — ~4 dias**

A tabela da seção destacada. **Maior probabilidade de já estar falhando**, e é onde a
correção tem efeito imediato e visível.

**Onda 2 · Os 34 `DELETE` desprotegidos restantes — ~2 dias**

`DELETE` é a operação mais restrita do banco. Aqui este relatório encontra o **Achado
15**: a convenção restringe `DELETE` a `is_admin()`, um `DELETE` barrado devolve
sucesso, e 34 dos 40 não percebem. Para um não-admin, remover item de lista não faz
nada — e o passo seguinte do padrão "apaga tudo e reescreve" estoura chave duplicada.

**Corrigir a conferência é pré-requisito de corrigir o padrão de escrita:** sem
`conferir()`, a troca por escrita diferencial não é verificável.

**Onda 3 · Acolhimento, Membros e Agenda restantes — ~3 dias**

**Onda 4 · O restante — ~2 dias**

Incluindo os 15 INSERT sem checagem nenhuma, que são os mais fáceis: basta ler o
`error` que já vem.

### 7.3 O padrão a aplicar

Já existe em `lib/escritaConferida.ts`:

```ts
const r = conferir(
  await supabase.from("membros").update({ ... }).eq("id", id).select("id"),
  "O status de acolhimento",
);
if (!r.ok) return toast.error(r.erro);
```

**O `.select("id")` é o que torna os dois ramos distinguíveis.**

### 7.4 Três cuidados

1. **Avisar a equipe antes de subir.** Isto vai *revelar* falhas de permissão que hoje
   passam despercebidas. Telas que pareciam funcionar vão acusar erro — é o objetivo,
   mas assusta quem não foi avisado.
2. **Não confiar em regex ingênuo ao contar.** `await supabase` indentado como
   argumento de `conferir(` **não** é escrita cega (Risco 4 do CLAUDE.md).
3. **Não corrigir sem homologação.** Ver
   [HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md): hoje
   `npm run dev` grava em produção, e testar `conferir()` exige provocar bloqueios de
   propósito.

### 7.5 Esforço

| Onda | Ocorrências | Esforço |
|---|---|---|
| 1 · Tabela restritiva | 54 | ~4 dias |
| 2 · `DELETE` restantes | ~21 | ~2 dias |
| 3 · Acolhimento, Membros, Agenda | restantes | ~3 dias |
| 4 · Restante | resto | ~2 dias |
| **Total** | **165** | **~11 dias** |

O ACTION_PLAN reservou 7 dias com base em ~52 ocorrências. **Com 165, a estimativa
realista é ~11** — diferença de escopo, não de produtividade.

**Se o orçamento não comportar 11 dias:** a **onda 1 sozinha, 4 dias, cobre as 54
que de fato podem estar falhando hoje.** As outras 111 são dívida real, mas de
probabilidade baixa.

---

## 8. Limitações

1. **Análise textual, não semântica.** Janela de 12 linhas antes e 14 depois. `conferir()`
   aplicado a variável declarada muito acima pode ter sido contado a menos.
2. **A restrição da RLS foi resumida por tabela**, não por política individual.
   **Políticas permissivas se somam com OR** (ARCHITECTURE.md §4.4): uma tabela marcada
   "ADMIN" pode ter outra política mais ampla que a torne acessível. **Confirmar a
   política específica antes de concluir que uma escrita está barrada.**
3. **`upsert` classificado pelo pior caso.**
4. **Módulo inferido** por caminho de arquivo e nome de tabela.

---

*Varredura de 285 arquivos `.ts`/`.tsx` em `src/` (exceto `integrations/supabase/types.ts`),
cruzada com `pg_policies` do banco de produção. Nenhuma linha de código, migration,
política ou dado foi alterado.*
