# WAVE1_IMPLEMENTATION_REPORT.md — DiakoniaApp

Relatório da execução das correções da Onda 1, definidas no
[WAVE1_IMPLEMENTATION_PLAN.md](./WAVE1_IMPLEMENTATION_PLAN.md).

**Data:** 25/08/2026 · **Verificação:** `tsc --noEmit -p tsconfig.app.json` limpo ·
`vite build` concluído

---

## 1. Resumo

| | |
|---|---|
| Ocorrências na Onda 1 | 21 |
| **Corrigidas** | **13** |
| **Não corrigidas, com justificativa** | **8** |
| Arquivos alterados | **9** |
| Linhas acrescentadas / removidas | 138 / 36 |
| Refatorações feitas | **nenhuma** |
| Assinaturas de função alteradas | **nenhuma** |
| Mensagens de erro removidas | **nenhuma** |
| Comentários removidos | **nenhuma** |

**Nenhuma permissão foi concedida a ninguém.** Quem podia gravar continua podendo;
quem não podia continua não podendo. O que muda é que a pessoa passa a saber.

---

## 2. Arquivos alterados

| Arquivo | Ocorr. corrigidas | Import acrescentado |
|---|---|---|
| `src/components/familias/VinculosDialog.tsx` | 3 | sim |
| `src/components/familias/VinculosPessoaDialog.tsx` | 1 | sim |
| `src/components/membros/MembroForm.tsx` | 1 | sim |
| `src/components/membros/VisitanteDialog.tsx` | 1 | **não — já existia** |
| `src/pages/Familias.tsx` | 2 | sim |
| `src/pages/LgpdAdmin.tsx` | 1 | sim |
| `src/services/acessoService.ts` | 1 | sim |
| `src/services/familiaService.ts` | 2 | sim |
| `src/services/userService.ts` | 1 | sim |

---

## 3. Ocorrências corrigidas

| # | Arquivo · linha original | Função | Op. | Tabela | Padrão aplicado |
|---|---|---|---|---|---|
| 1 | `VisitanteDialog.tsx:132` | `removeVisita` | delete | `visitas` | `conferir()` + `toast.error` |
| 2 | `MembroForm.tsx:540` | `onDelete` | delete | `membros` | `conferir()` **após** o tratamento de chave estrangeira |
| 3 | `VinculosDialog.tsx:101` | `remover` | delete | `vinculos_familiares` | `conferir()` + `toast.error` |
| 4 | `VinculosDialog.tsx:108` | `atualizarParentesco` | update | `vinculos_familiares` | `conferir()` + `toast.error` |
| 5 | `VinculosDialog.tsx:122` | `definirResponsavel` | update | `vinculos_familiares` | `conferir()` + `toast.error` |
| 6 | `VinculosPessoaDialog.tsx:80` | `remover` | delete | `vinculos_familiares` | `conferir()` + `toast.error` |
| 7 | `Familias.tsx:143` | `onSubmit` | update | `familias` | `conferir()` no ramo de edição |
| 8 | `Familias.tsx:212` | exclusão de família | delete | `familias` | `conferir()` após checar `error` |
| 9 | `familiaService.ts:132` | `desvincularPessoa` | delete | `vinculos_familiares` | `conferir()` + `throw` |
| 10 | `familiaService.ts:141` | `atualizarFamilia` | update | `familias` | `conferir()` + `throw` |
| 11 | `LgpdAdmin.tsx:172` | `atualizarStatus` | update | `solicitacoes_lgpd` | `conferir()` como terceiro ramo |
| 12 | `userService.ts:221` | `criarUsuario` | upsert | `profiles` | `conferir()` devolvendo a senha |
| 13 | `acessoService.ts:265` | `criarAcessoPessoa` | upsert | `profiles` | `conferir()` devolvendo a senha |

### Decisões de forma, por camada

**Em componente e página** — `toast.error(r.erro)`, seguindo `VisitanteDialog.tsx`,
que já usava o padrão duas vezes no próprio arquivo.

**Em serviço** — mantida a convenção de cada arquivo:

- `familiaService.ts` lança exceção e devolve `Promise<void>`. Trocar para
  `ResultadoEscrita` mudaria a assinatura e obrigaria a alterar os chamadores — isso é
  refatoração, que a regra 8 proíbe. **Aplicado `throw new Error(r.erro)`.**
- `userService.ts` e `acessoService.ts` devolvem `UserServiceResult`. A falha entra
  nesse formato, **devolvendo a senha junto** — pela mesma razão que o comentário já
  existente no arquivo dá: *"Auth criado mas profile falhou — retorna senha para não
  perder"*.

### Dois casos que exigiram cuidado

**`MembroForm.tsx:540`** — o bloco de erro existente traduz violação de chave
estrangeira em linguagem de secretaria, com um comentário longo explicando por quê.
**Ele foi preservado inteiro.** O `conferir()` entrou *depois* dele, porque cobre um
caso diferente: quando a RLS barra não há erro nenhum, e o `if (error)` nunca entrava.

**`Familias.tsx:212`** — a exclusão da família não tinha rede: a chave
`vinculos_familiares_familia_id_fkey` é **`ON DELETE CASCADE`** (verificado no banco),
então não existe erro de chave estrangeira que denuncie um bloqueio. Sem o `.select()`,
barrado e excluído devolviam exatamente a mesma coisa.

---

## 4. Ocorrências não corrigidas

### 4.1 Excluídas pela regra 2 do pedido — 2

| Arquivo · linha | Motivo |
|---|---|
| `escalaService.ts:286` | Decisão deliberada documentada no código |
| `ProximaAcaoCard.tsx:106` | Decisão deliberada documentada no código |

**Não foram tocadas.**

### 4.2 Onde `conferir()` daria erro falso — 2

| Arquivo · linha | Operação | Por que não |
|---|---|---|
| `VinculosDialog.tsx:117` | `update vinculos_familiares` | Limpa `responsavel_familia` de toda a família. **Afeta zero linhas quando ninguém era responsável ainda** — caso legítimo. `conferir()` leria esse zero como bloqueio e acusaria erro falso. Quem guarda a operação é o update seguinte, corrigido |
| `Familias.tsx:210` | `delete vinculos_familiares` | Mesma ambiguidade: família sem vínculos devolve zero legitimamente. **E a chave é `ON DELETE CASCADE`** — o passo seguinte remove esses vínculos no banco de qualquer forma. A linha é redundante, e falhar nela em silêncio não deixa órfão |

**Ambas receberam comentário no código explicando a ausência**, para que a próxima
varredura não as "corrija".

### 4.3 Escritas de cache, onde a falha é inofensiva — 2

| Arquivo · linha | Operação | Por que não |
|---|---|---|
| `userService.ts:291` | `update profiles` (telefone) | O comentário existente já diz: *"Persiste para não buscar novamente na próxima vez"*. A função devolve o telefone de qualquer forma; se a gravação falha, a próxima chamada apenas busca de novo |
| `acessoService.ts:359` | `update profiles` (telefone) | Idem — *"Persiste no profile para não buscar sempre"* |

Mesma natureza das duas decisões deliberadas da §4.1: **carimbo secundário, cujo dado
verdadeiro está em outro lugar.**

### 4.4 Escritas em coluna que não governa nada — 3

| Arquivo · linha | Operação |
|---|---|
| `userService.ts:308` | `update profiles` — `primeiro_acesso: true` |
| `userService.ts:322` | `update profiles` — `primeiro_acesso: true` |
| `acessoService.ts:324` | `update profiles` — `primeiro_acesso: true` |

**Duas razões, e a segunda é a decisiva.**

**Primeira — a coluna não é o portão.** Verificado no código: o desvio para
`/primeiro-acesso` é decidido por **`user_metadata.must_change_password`**, lido em
`AppLayout.tsx:128`, `Auth.tsx:108` e `PrimeiroAcesso.tsx:38`. `profiles.primeiro_acesso`
não gateia nada — alimenta apenas o rótulo "aguardando"/"ativo" em `acessoService`. É a
coluna que o ARCHITECTURE.md §7.3 descreve como *"true para todos, inclusive quem já
entrou"*.

**Segunda — falhar aqui perderia a senha.** As três linhas rodam **depois** de
`resetarSenhaRpc` ter êxito. A senha temporária já existe e ainda não foi mostrada a
ninguém. Interromper o fluxo neste ponto devolveria erro **sem devolver a senha** — e o
próprio arquivo documenta essa preocupação, na linha 227: *"Auth criado mas profile
falhou — retorna senha para não perder"*.

**Corrigir isto trocaria uma inconsistência de rótulo por uma senha perdida.**

### 4.5 Onde o aviso seria pior que o silêncio — 1

| Arquivo · linha | Operação | Por que não |
|---|---|---|
| `UserMenuButton.tsx:40` | `update profiles` (nome) | Roda dentro de um `useEffect` **na montagem do layout**. A tela já chamou `setNome(nomeMembro)` antes — a gravação é só cache. Acrescentar `toast.error` faria surgir um aviso de erro **a cada carregamento de página** para quem tivesse a escrita barrada. A regra 10 proíbe alterar funcionalidade além da validação da escrita, e um toast novo no carregamento é alteração de funcionalidade |

> **Nota sobre a política.** A escrita é sobre o **próprio** perfil (`.eq("id", user.id)`),
> e a política `Usuarios atualizam proprio perfil` (`id = auth.uid()`) a permite. **Não
> falha hoje para ninguém.** Foi classificada A pela tabela, não pelo caso concreto.

---

## 5. Verificação executada

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | **limpo** — nenhum erro |
| `npx vite build` | **concluído** em 41,9 s |
| Aviso de chunk > 500 kB | **pré-existente** — é o Achado 08, não foi introduzido aqui |
| Fim de linha (CRLF) | consistente nos 9 arquivos; nenhuma mistura introduzida |
| Linhas removidas no diff | conferidas uma a uma — **só instruções de escrita** |
| Mensagens de erro existentes | **todas preservadas** |
| Comentários existentes | **todos preservados** |

---

## 6. O que ainda falta — e por que importa

**Estas correções não foram exercitadas contra o banco.** Foram verificadas por
compilação e build, não por execução.

O plano previa a Etapa 1 como **preparo**, e ela continua pendente:

| Pendência | Por que importa |
|---|---|
| **Ambiente local** (fase 1 do [HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md)) | Hoje `npm run dev` grava em **produção**. Testar `conferir()` exige **provocar bloqueios de propósito** — e não há onde fazer isso sem tocar nos dados de 294 pessoas |
| **Usuário de teste com papel `lideranca`** | É o papel que falha em 9 das 11 combinações tabela×operação. Sem ele, **nenhuma das 13 correções é verificável** |
| **Aviso à equipe** | As telas vão passar a acusar erro onde antes diziam "pronto". É o objetivo — mas sem aviso parece que a correção quebrou o sistema |

**Recomendação:** não publicar antes de exercitar com um usuário `lideranca`. O risco
não é a correção estar errada — é ela estar **certa** e a equipe ser surpreendida por
erros em telas que "sempre funcionaram".

---

## 7. Impacto esperado

| Antes | Depois |
|---|---|
| 8 operações que perdem informação falhavam em silêncio | Todas acusam erro com frase que diz **a quem pedir** |
| `lideranca` via "pronto" ao excluir pessoa, família, vínculo e visita | Recebe aviso imediato de que precisa da secretaria |
| Solicitação de LGPD podia ser dada por respondida sem ter sido | O prazo legal deixa de ser presumido |
| `conferir()` em 10 arquivos | Em **18 arquivos** — passa a ser a norma visível do repositório |

---

*Execução das correções da Onda 1 sobre 9 arquivos de `src/`. Nenhuma migration foi
gerada, nenhuma política alterada, nenhum dado tocado, nenhuma documentação existente
modificada. As alterações estão no diff de trabalho e podem ser revistas com
`git diff -- src/`.*
