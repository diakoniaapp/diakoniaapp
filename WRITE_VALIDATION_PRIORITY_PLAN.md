# WRITE_VALIDATION_PRIORITY_PLAN.md — DiakoniaApp

Priorização cirúrgica das **54 escritas** identificadas no
[WRITE_VALIDATION_AUDIT.md](./WRITE_VALIDATION_AUDIT.md) como desprotegidas **e** em
tabela cuja RLS exige `is_admin()` ou papel específico.

> **Nenhuma linha de código foi alterada.** Este documento decide ordem, não executa.

---

## 1. Três coisas antes da lista

**1 · O financeiro não está aqui.** Das 54, **zero** tocam tabelas `fin_*`. As 15
escritas financeiras desprotegidas do relatório anterior estão todas em tabelas com
política ampla — desprotegidas, sim; prováveis de falhar, não. **Isso muda a ordem que
a intuição sugeriria**, e é o tipo de coisa que só aparece cruzando código com política.

**2 · Metade do risco está em `DELETE`.** São 13 `delete` e 2 `upsert` entre as 54 —
as operações que **perdem informação** quando falham. As outras 39 são `update`, que
deixam o dado velho no lugar. Perder é pior que não atualizar.

**3 · 24 arquivos concentram as 54.** Não é uma varredura pelo sistema inteiro: são 24
arquivos, e **os 5 maiores concentram 22 ocorrências**.

---

## 2. Classificação

| Prioridade | Qtd. | Arquivos | Critério |
|---|---|---|---|
| **A** | 23 | 12 | Perde informação, ou compromete acolhimento / LGPD / identidade de acesso |
| **B** | 18 | 9 | Inconsistência operacional e retrabalho |
| **C** | 13 | 4 | Baixo impacto — documentos e identidade institucional |

### Cobertura dos módulos citados no pedido

| Módulo | Ocorrências entre as 54 | Observação |
|---|---|---|
| **Membros** (`membros`, `familias`, `vinculos_familiares`) | **12** | O maior bloco. Eixo do domínio |
| **Visitas** (`visitas`) | 1 | `VisitanteDialog.tsx:132` — um `delete` |
| **Acolhimento** | 2 | `VisitanteDialog` e `ProximaAcaoCard` |
| **Consentimento / LGPD** | 1 | `LgpdAdmin.tsx:172` — prazo legal |
| **Financeiro** | **0** | Nenhuma tabela `fin_*` entre as 54 |

---

# As 10 ocorrências mais perigosas

Ordenadas por consequência: perde informação **e** está em tabela restritiva.

| Arquivo | Função | Op. | Tabela | RLS | Impacto para o usuário | Impacto para a igreja |
|---|---|---|---|---|---|---|
| `components/familias/VinculosDialog.tsx:101` | `remover` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/familias/VinculosPessoaDialog.tsx:80` | `remover` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/membros/MembroForm.tsx:540` | `onDelete` | delete | `membros` | 🔴 `is_admin()` | A ficha some da tela e volta no próximo carregamento. A pessoa parece excluída e não está | **Perda de controle sobre o rol.** `membros` é o eixo do domínio — 69 chaves estrangeiras apontam para ela |
| `components/membros/VisitanteDialog.tsx:132` | `removeVisita` | delete | `visitas` | 🔴 `is_admin()` | A visita registrada não sai da lista | **Acolhimento**: a visita não sai da fila, ou sai sem ter sido tratada |
| `pages/Familias.tsx:210` | `desvinculo` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `pages/Familias.tsx:212` | `desvinculo` | delete | `familias` | 🔴 `is_admin()` | A família parece excluída e reaparece | Cadastro de família divergente do real |
| `services/familiaService.ts:132` | `desvincularPessoa` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `services/acessoService.ts:265` | `uid` | upsert | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/userService.ts:221` | `uid` | upsert | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `components/layout/UserMenuButton.tsx:40` | `nomeMembro` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |

**O padrão das sete primeiras:** todas são `DELETE` em tabela cuja política exige
`is_admin()`. Para qualquer usuário que não seja administrador — o que inclui a
secretaria e a liderança — **elas não fazem nada e a tela não avisa**.

**A número 3 é a mais grave do sistema.** `MembroForm.tsx:540` exclui uma pessoa. Se a
RLS barra, a ficha some da tela e volta no próximo carregamento. `membros` tem 69
chaves estrangeiras apontando para ela — é o eixo do domínio.

**As números 8, 9 e 10 escrevem em `profiles`**, a tabela cujas colunas `role` e
`primeiro_acesso` a Auditoria Técnica já classificou como divergentes (Achado 14). São
escritas sem conferência numa tabela que já mente.

---

# As 20 com melhor relação esforço/benefício

Critério: prioridade A primeiro, e dentro dela **arquivos densos** — corrigir um
arquivo resolve várias ocorrências de uma vez.

| Arquivo | Ocorr. no arquivo | Prio. | Op. | Tabela |
|---|---|---|---|---|
| `components/familias/VinculosDialog.tsx:101` | 4 | **A** | delete | `vinculos_familiares` |
| `services/userService.ts:221` | 4 | **A** | upsert | `profiles` |
| `services/userService.ts:291` | 4 | **A** | update | `profiles` |
| `services/userService.ts:308` | 4 | **A** | update | `profiles` |
| `services/userService.ts:322` | 4 | **A** | update | `profiles` |
| `components/familias/VinculosDialog.tsx:108` | 4 | **A** | update | `vinculos_familiares` |
| `components/familias/VinculosDialog.tsx:117` | 4 | **A** | update | `vinculos_familiares` |
| `components/familias/VinculosDialog.tsx:122` | 4 | **A** | update | `vinculos_familiares` |
| `pages/Familias.tsx:210` | 3 | **A** | delete | `vinculos_familiares` |
| `pages/Familias.tsx:212` | 3 | **A** | delete | `familias` |
| `services/acessoService.ts:265` | 3 | **A** | upsert | `profiles` |
| `services/acessoService.ts:324` | 3 | **A** | update | `profiles` |
| `services/acessoService.ts:359` | 3 | **A** | update | `profiles` |
| `pages/Familias.tsx:143` | 3 | **A** | update | `familias` |
| `components/membros/MembroForm.tsx:540` | 2 | **A** | delete | `membros` |
| `services/familiaService.ts:132` | 2 | **A** | delete | `vinculos_familiares` |
| `services/familiaService.ts:141` | 2 | **A** | update | `familias` |
| `components/familias/VinculosPessoaDialog.tsx:80` | 1 | **A** | delete | `vinculos_familiares` |
| `components/membros/VisitanteDialog.tsx:132` | 1 | **A** | delete | `visitas` |
| `components/layout/UserMenuButton.tsx:40` | 1 | **A** | update | `profiles` |

**Os quatro arquivos de melhor retorno:**

- **`src/components/familias/VinculosDialog.tsx`** — 4 ocorrências, 4 de prioridade A
- **`src/services/userService.ts`** — 4 ocorrências, 4 de prioridade A
- **`src/pages/Familias.tsx`** — 3 ocorrências, 3 de prioridade A
- **`src/services/acessoService.ts`** — 3 ocorrências, 3 de prioridade A

---

# Plano de correção em ondas

## Onda 1 — até 2 dias · PRIORIDADE A

**23 ocorrências em 12 arquivos.**

| Arquivo | Função | Op. | Tabela | RLS | Impacto para o usuário | Impacto para a igreja |
|---|---|---|---|---|---|---|
| `components/familias/VinculosDialog.tsx:101` | `remover` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/familias/VinculosPessoaDialog.tsx:80` | `remover` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/membros/MembroForm.tsx:540` | `onDelete` | delete | `membros` | 🔴 `is_admin()` | A ficha some da tela e volta no próximo carregamento. A pessoa parece excluída e não está | **Perda de controle sobre o rol.** `membros` é o eixo do domínio — 69 chaves estrangeiras apontam para ela |
| `components/membros/VisitanteDialog.tsx:132` | `removeVisita` | delete | `visitas` | 🔴 `is_admin()` | A visita registrada não sai da lista | **Acolhimento**: a visita não sai da fila, ou sai sem ter sido tratada |
| `pages/Familias.tsx:210` | `desvinculo` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `pages/Familias.tsx:212` | `desvinculo` | delete | `familias` | 🔴 `is_admin()` | A família parece excluída e reaparece | Cadastro de família divergente do real |
| `services/familiaService.ts:132` | `desvincularPessoa` | delete | `vinculos_familiares` | 🔴 `is_admin()` | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `services/acessoService.ts:265` | `uid` | upsert | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/userService.ts:221` | `uid` | upsert | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `components/layout/UserMenuButton.tsx:40` | `nomeMembro` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `pages/LgpdAdmin.tsx:172` | `atualizarStatus` | update | `solicitacoes_lgpd` | 🔴 `is_admin()` | O pedido continua "pendente" depois de marcado como atendido | **Prazo legal.** A igreja acredita ter respondido ao titular e não respondeu |
| `services/acessoService.ts:324` | `msgAmigavel` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/acessoService.ts:359` | `tel` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/userService.ts:291` | `tel` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/userService.ts:308` | `erro` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `services/userService.ts:322` | `erro` | update | `profiles` | 🔴 `is_admin()` | O nome ou telefone do perfil não muda, sem explicação | Estado de acesso divergente. Piora o Achado 14 — a tabela já tem colunas que mentem |
| `components/familias/VinculosDialog.tsx:108` | `atualizarParentesco` | update | `vinculos_familiares` | 🟠 papel | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/familias/VinculosDialog.tsx:117` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/familias/VinculosDialog.tsx:122` | `definirResponsavel` | update | `vinculos_familiares` | 🟠 papel | O parentesco continua lá depois de "remover". Ao salvar de novo, erro de chave duplicada | Composição familiar errada. Afeta aniversário de casamento, endereço e o cuidado por família |
| `components/membros/ProximaAcaoCard.tsx:106` | `texto` | update | `membros` | 🟠 papel | A ficha some da tela e volta no próximo carregamento. A pessoa parece excluída e não está | **Perda de controle sobre o rol.** `membros` é o eixo do domínio — 69 chaves estrangeiras apontam para ela |
| `pages/Familias.tsx:143` | `onSubmit` | update | `familias` | 🟠 papel | A família parece excluída e reaparece | Cadastro de família divergente do real |
| `services/escalaService.ts:286` | `marcarNotificado` | update | `escala_voluntarios` | 🟠 papel | O sistema mostra o voluntário como avisado | **O voluntário não é avisado e não aparece no domingo** |
| `services/familiaService.ts:141` | `atualizarFamilia` | update | `familias` | 🟠 papel | A família parece excluída e reaparece | Cadastro de família divergente do real |

**Risco mitigado.** Toda a perda de informação do conjunto: os 13 `delete` e 2
`upsert` que hoje somem em silêncio. Acolhimento, composição familiar, rol de membros,
prazo de LGPD e estado de acesso passam a acusar erro em vez de mentir sucesso.

**Por que cabe em 2 dias.** 12 arquivos, e 4 deles concentram 3 ou mais ocorrências. O padrão
`conferir()` já existe — é aplicação, não desenho.

## Onda 2 — até 5 dias · PRIORIDADE B

**18 ocorrências em 9 arquivos.**

| Arquivo | Função | Op. | Tabela | RLS | Impacto para o usuário | Impacto para a igreja |
|---|---|---|---|---|---|---|
| `pages/CampanhasAdmin.tsx:143` | `excluirCampanha` | delete | `campanhas` | 🔴 `is_admin()` | A campanha não muda de status ou não é excluída | Campanha ativa depois de encerrada, ou material órfão (ver STORAGE_AUDIT.md) |
| `pages/Eventos.tsx:392` | `excluirEvento` | delete | `evento_ministerios` | 🔴 `is_admin()` | O vínculo do evento com o ministério permanece | Evento aparece para ministério que não participa |
| `pages/Eventos.tsx:393` | `excluirEvento` | delete | `evento_areas` | 🔴 `is_admin()` | O vínculo do evento com a área permanece | Evento aparece para área que não participa |
| `components/membros/MembroForm.tsx:427` | `removidos` | update | `area_voluntarios` | 🟠 papel | O voluntário continua na área depois de removido | Motor de sugestão de escalas usa dado errado |
| `components/ministerios/AreasDialog.tsx:52` | `onSubmit` | update | `areas` | 🟠 papel | A área não muda de nome ou status | Organograma divergente |
| `components/ministerios/VoluntariosDialog.tsx:104` | `hoje` | update | `area_voluntarios` | 🟠 papel | O voluntário continua na área depois de removido | Motor de sugestão de escalas usa dado errado |
| `pages/CampanhasAdmin.tsx:149` | `alterarStatus` | update | `campanhas` | 🟠 papel | A campanha não muda de status ou não é excluída | Campanha ativa depois de encerrada, ou material órfão (ver STORAGE_AUDIT.md) |
| `pages/CampanhasAdmin.tsx:522` | `payload` | update | `campanhas` | 🟠 papel | A campanha não muda de status ou não é excluída | Campanha ativa depois de encerrada, ou material órfão (ver STORAGE_AUDIT.md) |
| `pages/Eventos.tsx:539` | `newId` | update | `eventos` | 🟠 papel | A alteração do evento não persiste — data, local ou horário voltam ao anterior | Agenda divulgada diferente da agenda real |
| `pages/Eventos.tsx:558` | `updateBody` | update | `eventos` | 🟠 papel | A alteração do evento não persiste — data, local ou horário voltam ao anterior | Agenda divulgada diferente da agenda real |
| `pages/Eventos.tsx:572` | `updateBody` | update | `eventos` | 🟠 papel | A alteração do evento não persiste — data, local ou horário voltam ao anterior | Agenda divulgada diferente da agenda real |
| `pages/Eventos.tsx:602` | `currentMasterReg` | update | `eventos` | 🟠 papel | A alteração do evento não persiste — data, local ou horário voltam ao anterior | Agenda divulgada diferente da agenda real |
| `pages/Eventos.tsx:612` | `newId` | update | `eventos` | 🟠 papel | A alteração do evento não persiste — data, local ou horário voltam ao anterior | Agenda divulgada diferente da agenda real |
| `pages/ImportacaoMembros.tsx:272` | `duplicados` | update | `importacoes_membros` | 🟠 papel | O lote de importação fica com status errado | Retrabalho na importação; risco de duplicar pessoas |
| `pages/Locais.tsx:231` | `cap` | update | `locais` | 🟠 papel | O local não muda de capacidade ou status | Reserva de espaço sobre capacidade errada |
| `pages/Locais.tsx:274` | `toggleStatus` | update | `locais` | 🟠 papel | O local não muda de capacidade ou status | Reserva de espaço sobre capacidade errada |
| `pages/Ministerios.tsx:188` | `payload` | update | `ministerios` | 🟠 papel | O ministério não muda | Organograma divergente |
| `services/ministerioRefatoracaoService.ts:304` | `patch` | update | `ministerios` | 🟠 papel | O ministério não muda | Organograma divergente |

**Risco mitigado.** Inconsistência entre a agenda divulgada e a real, organograma
divergente, motor de sugestão de escalas operando sobre dado errado, e retrabalho de
importação.

**Ponto de atenção em `Eventos.tsx`.** Sete ocorrências, sendo duas `delete` em
`evento_ministerios` e `evento_areas` dentro de `excluirEvento`. O CLAUDE.md registra
que o padrão "apaga tudo e reescreve" **já foi corrigido em `insertLinks`** nesse mesmo
arquivo — **a correção foi parcial**. Se esses `delete` falham, a exclusão do evento
seguinte esbarra em chave estrangeira.

## Onda 3 — até 10 dias · PRIORIDADE C

**13 ocorrências em 4 arquivos.**

| Arquivo | Função | Op. | Tabela | Impacto para a igreja |
|---|---|---|---|---|
| `pages/DocumentosAdmin.tsx:364` | `excluirSecao` | delete | `secoes_documento` | Regimento com seção obsoleta |
| `pages/IdentidadeAdmin.tsx:548` | `redesAtivas` | delete | `identidade_valores` | Valores institucionais desatualizados |
| `pages/IdentidadeAdmin.tsx:569` | `atuaisSet` | delete | `igreja_instituicoes` | Vínculo institucional incorreto |
| `pages/DocumentosAdmin.tsx:396` | `salvarEstrutura` | update | `documento_estrutura` | Estrutura documental inconsistente |
| `pages/DocumentosAdmin.tsx:411` | `excluirEstrutura` | update | `documento_estrutura` | Estrutura documental inconsistente |
| `pages/IdentidadeAdmin.tsx:535` | `redesAtivas` | update | `identidade_igreja` | Identidade institucional desatualizada |
| `pages/IdentidadeAdmin.tsx:552` | `redesAtivas` | update | `identidade_valores` | Valores institucionais desatualizados |
| `services/estruturaSyncService.ts:122` | `payload` | update | `documento_estrutura` | Estrutura documental inconsistente |
| `pages/DocumentosAdmin.tsx:251` | `salvarDoc` | update | `documentos` | Documento institucional errado dado como vigente |
| `pages/DocumentosAdmin.tsx:311` | `marcarVigente` | update | `documentos` | Documento institucional errado dado como vigente |
| `pages/DocumentosAdmin.tsx:312` | `marcarVigente` | update | `documentos` | Documento institucional errado dado como vigente |
| `pages/DocumentosAdmin.tsx:336` | `kw` | update | `secoes_documento` | Regimento com seção obsoleta |
| `services/documentoIngestaoService.ts:253` | `resultado` | update | `documentos` | Documento institucional errado dado como vigente |

**Risco mitigado.** Documentos institucionais e identidade da igreja deixam de
divergir em silêncio. Impacto humano baixo, impacto institucional real — um regimento
com seção obsoleta dada como vigente é problema, só não é urgente.

---

## 4. Resumo das ondas

| Onda | Prazo | Arquivos | Ocorrências | `delete`/`upsert` | Risco mitigado |
|---|---|---|---|---|---|
| **1** | até 2 dias | 12 | **23** | 9 | **Toda a perda de informação.** Acolhimento, membros, famílias, LGPD, acesso |
| **2** | até 5 dias | 9 | 18 | 3 | Agenda, escalas, ministérios, campanhas, locais |
| **3** | até 10 dias | 4 | 13 | 3 | Documentos e identidade institucional |
| **Total** | **10 dias** | **24** | **54** | **15** | — |

**Se só houver tempo para uma onda, faça a 1.** São 43% das ocorrências e
**60% de tudo que perde informação**.

---

## 5. Três cuidados na execução

1. **Avise a equipe antes de subir a onda 1.** A correção vai *revelar* bloqueios que
   hoje passam despercebidos. Telas que pareciam funcionar vão acusar erro — é o
   objetivo, mas sem aviso parece que a correção quebrou o sistema.

2. **Confirme a política antes de concluir que uma escrita está barrada.** A restrição
   foi resumida **por tabela**. Políticas permissivas se somam com OR
   (ARCHITECTURE.md §4.4): uma tabela marcada `is_admin()` pode ter outra política mais
   ampla. **O `conferir()` vale em qualquer caso** — ele não presume, mede.

3. **Não execute sem homologação.** Testar `conferir()` exige provocar bloqueios de
   propósito, e hoje `npm run dev` grava em produção. Ver
   [HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md) — a fase 1
   é grátis e leva 2 a 3 dias.

---

## 6. O que este plano deixa de fora

As outras **111 escritas desprotegidas** do WRITE_VALIDATION_AUDIT.md, em tabelas com
política ampla. **Continuam sendo dívida real** — a política pode ficar mais restritiva
amanhã, e aí falham em silêncio sem que ninguém mude o código. Entram na correção
completa (~11 dias), não neste plano cirúrgico.

E o **padrão** que causa parte do problema: "apaga tudo e reescreve". Corrigir a
conferência faz o defeito **aparecer**; trocar por escrita diferencial faz ele **deixar
de existir**. Este plano faz o primeiro, que é pré-requisito do segundo.

---

*Derivado do WRITE_VALIDATION_AUDIT.md, que cruzou 285 arquivos de `src/` com as 228
políticas de `UPDATE`/`DELETE`/`ALL` do banco de produção. Nenhuma linha de código,
migration, política ou dado foi alterado.*
