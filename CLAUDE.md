# CLAUDE.md — DiakoniaApp

Sistema de gestão da **Quarta Igreja Batista do Rio de Janeiro (QIBRJ)**.

> **Como ler este documento.** As seções 1–4 são o onboarding: leia em ordem no
> primeiro dia. As 5–8 são referência: consulte quando precisar. A 9 é para
> sessões do Claude Code.
>
> Levantamento de **20/08/2026**, por medição direta do repositório e do banco de
> produção. Onde não foi possível concluir, está escrito **(incerto)**. Números sem
> essa marca foram contados.

**Índice**

1. [Comece por aqui](#1-comece-por-aqui) · 2. [O domínio](#2-o-domínio) ·
3. [Arquitetura](#3-arquitetura) · 4. [Mapa do código](#4-mapa-do-código) ·
5. [Regras de negócio](#5-regras-de-negócio) · 6. [Padrões obrigatórios](#6-padrões-obrigatórios) ·
7. [Estado dos módulos](#7-estado-dos-módulos) · 8. [Riscos e mitigação](#8-riscos-e-mitigação) ·
9. [Para sessões Claude Code](#9-para-sessões-claude-code)

---

## 1. Comece por aqui

### 1.1 Subir o projeto

```bash
npm install                 # NÃO use bun — ver aviso abaixo
cp .env.example .env        # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:8080
```

**Três armadilhas na primeira hora:**

| Armadilha | O que fazer |
|---|---|
| Existem **duas lockfiles** (`package-lock.json` e `bun.lockb`) | Use **npm**. O `package-lock.json` é maior e mais recente. **(incerto: nenhum documento declara o gerenciador oficial)** |
| A porta é **8080**, não a 5173 do Vite | Está fixada em `vite.config.ts` |
| Não há `engines` no `package.json` | Node 20+ funciona; o ambiente atual roda v24 |

### 1.2 ⚠️ Não existe banco de homologação

**O `.env` aponta para o Supabase de produção.** `npm run dev` roda contra os dados
reais da igreja — 294 pessoas cadastradas, com telefone, endereço e observações
pastorais.

Qualquer teste que grave mexe em dado de gente de verdade. Ao testar escrita:

- ensaie com `BEGIN; … ROLLBACK;` pela API de gerenciamento do Supabase; **ou**
- grave e **apague em seguida**, conferindo `count(*)` antes e depois.

`VITE_SUPABASE_SERVICE_ROLE_KEY` aparece no `.env.example`. **Não a use no cliente**
— ver [Risco 8](#risco-8--chave-de-service-role-com-prefixo-vite_).

### 1.3 Verificar antes de entregar

```bash
npx tsc --noEmit -p tsconfig.app.json   # ⚠️ NUNCA sem o -p — ver Risco 1
npx vite build
npx vitest run                          # 1 teste, trivial
npx playwright test                     # 3 specs de layout, reais
```

Não há CI. **Nada roda sozinho** — se você não rodar, ninguém roda.

### 1.4 Ordem de leitura sugerida

1. `src/lib/escritaConferida.ts` — o padrão mais importante do projeto, e o
   comentário explica o defeito real que o originou.
2. `src/hooks/useAuth.tsx` + `src/hooks/usePermissoes.tsx` — como o sistema decide
   quem pode o quê.
3. `src/dashboard/widgetRegistry.tsx` — o painel, e a filosofia do produto.
4. `src/lib/visitantesFluxo.ts` — uma regra de negócio inteira, pequena e legível.
5. `src/components/membros/MembroForm.tsx` — o componente mais complexo (6 passos).
6. Duas ou três migrations recentes em `supabase/migrations/` — o cabeçalho de cada
   uma conta o defeito que ela resolve.

**Os comentários deste repositório são documentação de primeira classe.** Eles citam
medições ("contado em produção: `ministerio_membros` tem 0 linhas"), o defeito que a
linha conserta e a alternativa descartada. Não há um único `TODO`, `FIXME` ou `HACK`
em 285 arquivos — a dívida é descrita em prosa. **Leia antes de mudar.**

### 1.5 Glossário

Vocabulário de igreja batista que aparece em nomes de tabela, função e variável:

| Termo | O que é |
|---|---|
| **Membro / Congregado / Visitante** | Os três vínculos de uma pessoa com a igreja, em ordem crescente. Todos moram na **mesma tabela** `membros`, discriminados por `tipo_pessoa` |
| **EBD** | Escola Bíblica Dominical — classes por faixa etária e sexo, com chamada |
| **PGM** | Pequenos Grupos Multiplicadores — células que se reúnem em casas |
| **Efeméride** | Data que se repete todo ano: aniversário, bodas, anos de membresia, anos de pastorado |
| **Escala** | A lista de quem serve num evento (louvor, recepção, som) |
| **Área** | Subdivisão de um ministério. Ex.: "Recepção" dentro de "Comunhão" |
| **Acolhimento** | O processo de acompanhar quem visitou pela primeira vez |
| **Diretoria / Conselho** | Cargos do estatuto. Conselho (auditoria, jurídico) **fiscaliza** a diretoria |
| **Membresia** | O processo formal de entrada ou saída do rol de membros |
| **Arrecadação** | Aluguel de espaços da igreja, bazar e cantina |
| **Malote** | Envio mensal de documentos à contabilidade |

---

## 2. O domínio

### 2.1 Que problema o sistema resolve

Informação espalhada e não acionável. Três evidências no próprio código:

- `services/historiaPessoa.ts` documenta que a igreja tinha **283 contatos pastorais
  registrados e nenhum lugar para lê-los**.
- `lib/escritaConferida.ts` documenta duas tabelas discordando sobre quem foi
  contatado, porque uma aceitava a escrita e a outra não.
- O painel é construído sobre a ideia de que **um bloco some quando não há nada a
  fazer** — o oposto de um dashboard de indicadores.

A orientação do produto é **cuidado pastoral**, não relatório: quem chegou e não foi
procurado, quem está servindo demais, quem passou da faixa da EBD.

### 2.2 Público

Administração, secretaria, liderança de ministérios e áreas, professores da EBD e
tesouraria — **6 usuários** no momento do levantamento. **Não há aplicativo voltado
ao membro comum.**

### 2.3 O modelo de dados, em uma frase

**`membros` é o eixo de tudo: 69 chaves estrangeiras apontam para ela.**

```
                          ┌── area_voluntarios ──→ areas ──→ ministerios
                          ├── ebd_matriculas ────→ ebd_classes
        vinculos_          ├── escala_voluntarios ─→ escalas ──→ eventos
familias ←── familiares ──→│
                    MEMBROS├── visita_historico        (contato pastoral)
                          ├── historico_membro        (mudança de vínculo)
                          ├── perfil_servico          (quando pode servir)
                          ├── pgm_membros ──────→ pgm_grupos
                          └── consentimento           (LGPD)

profiles ──→ auth.users ──→ user_roles ──→ role_permissoes ──→ permissoes
```

**Uma pessoa é uma linha em `membros`, seja ela visitante, congregado ou membro.**
Não há tabela separada de visitantes. Isso explica por que quase todo serviço começa
em `membros` e por que `tipo_pessoa` aparece em tantos filtros.

Duas colunas parecem sinônimos e **não são**:

- **`tipo_pessoa`** (`visitante | congregado | membro`) — o vínculo com a igreja.
- **`status`** (`ativo | inativo | transferido | desligado | falecido`) — se a pessoa
  está presente na vida da igreja.

Um membro pode estar inativo; um visitante é sempre ativo até deixar de ser
acompanhado. **Filtrar por um pensando no outro é o erro mais fácil deste banco.**

---

## 3. Arquitetura

### 3.1 A forma

**SPA React servida como estático, falando direto com o Supabase. Não há backend
próprio.**

```
Navegador (React 18 + Vite)
        │  supabase-js
        ▼
Supabase ── PostgREST ──┐
         ── GoTrue      ├── PostgreSQL
         ── Storage     ┘   · 143 tabelas · 30 views
                            · 397 funções · 476 políticas RLS
                            · 123 gatilhos · 114 enums
```

### 3.2 Decisões arquiteturais registradas

Nenhuma destas tem ADR escrito; foram inferidas do código e das migrations. Estão
aqui porque **um recém-chegado que não as conhecer vai contrariá-las sem perceber**.

---

**AD-1 · Sem backend próprio: o navegador fala com o Postgres**

*Decisão.* Toda leitura e escrita passa por `supabase-js` direto do React.

*Consequência.* Não há onde esconder segredo, nem onde pôr regra que o cliente não
possa burlar. **A segurança é 100% da RLS** — as 143 tabelas têm RLS ligada, sem
exceção. O React decide o que *oferecer*; o banco decide o que *permitir*.

*O que isso obriga.* Nunca tratar uma checagem de tela como barreira de segurança.
Ao criar tabela, criar política junto — tabela sem política é tabela inacessível.

---

**AD-2 · A lógica de negócio mora no banco**

*Decisão.* O cálculo pesado é feito em funções SQL. O código chama **80 RPCs
distintas** — `sugerir_voluntarios_escala`, `esperados_da_classe`,
`fin_previsao_caixa`, `gov_executar_assembleia`, `minhas_permissoes`…

*Consequência.* Quem quiser mudar comportamento **precisa ler SQL**, não só
componentes. Um bug de regra provavelmente está numa função, não num `.tsx`.

*Custo aceito.* Lógica em SQL é mais difícil de testar e versionar. O projeto paga
esse preço em troca de a regra valer para todo cliente do banco, inclusive consultas
manuais.

---

**AD-3 · Mono-inquilino com costura parcial para multi-tenant**

*Decisão.* `src/lib/igreja.ts` fixa `IGREJA_ID =
"00000000-0000-0000-0000-000000000001"`, e as tabelas relevantes trazem esse UUID
como **default de coluna**.

*Estado real.* **Apenas 15 das 143 tabelas têm `igreja_id`.** Outras 4 têm
`congregacao_id`.

*Consequência.* Multi-tenant **não é uma troca de constante** — 128 tabelas não têm
coluna de inquilino. Tratar como projeto, não como ajuste. O comentário em
`igreja.ts` descreve a intenção, não o caminho pronto.

---

**AD-4 · `supabaseRel`: escape tipado para consultas com embed**

*Decisão.* `integrations/supabase/client.ts` exporta um segundo cliente sem
inferência de tipos.

*Por quê.* Selects aninhados (`.select("funcao, areas(nome, ministerios(nome))")`)
fazem o TypeScript percorrer o grafo de relacionamentos. Com 284 objetos isso estoura
o limite de profundidade (**TS2589**), e o erro contamina a cadeia inteira,
transformando argumentos de `.eq()` em `never`.

*Regra de uso.* **Só com embed.** Qualquer consulta sem embed usa `supabase` e
mantém a verificação completa.

---

**AD-5 · O painel é um registro, não JSX espalhado**

*Decisão.* `dashboard/widgetRegistry.tsx` declara **17 widgets** com
`permissoes[]` e `prioridade`.

*Consequência.* **A ordem entre widgets de mesma prioridade é a ordem do array** —
mover o bloco no arquivo é mover a tela. E um widget só aparece se o usuário tiver
uma das permissões listadas.

---

**AD-6 · Deriva não decidida: React Query instalado, pouco usado**

`@tanstack/react-query` está nas dependências, mas o padrão predominante é
`useState` + `useEffect` chamando o serviço. **Isto não é uma decisão registrada; é
uma inconsistência.** Ao mexer numa tela, siga o padrão que já está nela — não
converta por conta própria.

### 3.3 Tecnologias

| | |
|---|---|
| Linguagem | TypeScript — **modo não estrito** (ver [Risco 2](#risco-2--typescript-em-modo-não-estrito)) |
| UI | React 18.3 · shadcn/ui sobre Radix UI (51 primitivos) |
| Build | Vite 5 · saída estática |
| Rotas | react-router-dom 6 — ~70 rotas |
| Estilo | Tailwind + tokens HSL em `src/index.css` |
| Hospedagem | Vercel — `vercel.json` reescreve tudo para `index.html` |
| Dados | Supabase, projeto `prjoftmlkusbjoeptabp` |

### 3.4 Dependências que importam

58 pacotes de produção. Os que carregam decisão:

| Pacote | Para quê |
|---|---|
| `@supabase/supabase-js` | Único cliente de dados, auth e storage |
| `react-hook-form` + `zod` | Formulários e validação |
| `date-fns` + `date-fns-tz` | Datas; o fuso `America/Sao_Paulo` aparece fixado em funções do banco |
| `rrule` | Recorrência de eventos (`lib/agenda/recurrence.ts`) |
| `recharts` | Gráficos — **só em 2 telas**: `financas/DashboardExecutivo` e `PainelEstrategico` |
| `leaflet` + `react-leaflet` | Mapa de membros por bairro |
| `pdfjs-dist` + `tesseract.js` | Leitura de PDF e OCR na ingestão de documentos |
| `jszip` + `file-saver` | Exportação |
| `sonner` | Avisos — **é o padrão**, não use `alert()` |
| `cmdk` | Paleta de comandos (Ctrl+K) |
| `next-themes` | Só em `ui/sonner.tsx`; o tema real é o `hooks/useTheme.tsx` próprio |

### 3.5 Integrações externas

- **Supabase** — único serviço de dados.
- **Vercel** — publicação. Deploy a partir de `main` **(incerto: não há CI no
  repositório; a ligação é presumida pelo `vercel.json` e pelo fluxo observado)**.
- **WhatsApp** — por **link `wa.me`**, não por API. O sistema monta a mensagem e abre
  o WhatsApp; quem envia é a pessoa. **Não recebe resposta.**
- **Geocodificação** — `services/geocodificacaoService.ts` **(incerto: não verifiquei
  o provedor)**.
- **Não há**: e-mail próprio, gateway de pagamento, mensageria.

---

## 4. Mapa do código

```
src/
├── pages/          73 — uma tela por rota (62 na raiz + arrecadacao/ + financas/)
├── components/    146
│   ├── ui/         51 — primitivos shadcn/ui — NÃO editar sem motivo forte
│   ├── dashboard/  17 — blocos do painel
│   ├── membros/    17 — ficha, formulário, acolhimento
│   ├── layout/      4 — AppLayout, UserMenuButton, MobileNavDrawer
│   └── financas/ 8 · arrecadacao/ 7 · agenda/ 7 · familias/ 5 · ebd/ 4 · outros
├── services/       31 — acesso ao banco por domínio (ver nota sobre a camada real)
├── lib/            18 — regras puras, sem React
├── hooks/           5 — useAuth, usePermissoes, useTheme, use-mobile, use-toast
├── dashboard/       2 — widgetRegistry, quickActionsRegistry
├── integrations/    2 — client do Supabase + types.ts GERADO (14.092 linhas)
└── types/           2
supabase/migrations/ 77 arquivos .sql — fonte da verdade do schema
e2e/                  3 specs Playwright (layout)
```

### 4.1 A camada de serviços: desejado versus atual

> **Corrigido em 20/08/2026.** A versão anterior afirmava que *todo* acesso ao banco
> passava por `services/`. A medição mostrou o contrário.

**Padrão desejado:** a tela chama um serviço; o serviço fala com o Supabase.

**Situação atual, medida por imports do client:**

| Camada | Arquivos que importam `integrations/supabase/client` |
|---|---|
| `pages/` | **37** |
| `components/` | **35** |
| `services/` | 29 |
| `hooks/` e `lib/` | 4 |

**72 arquivos de `pages/` e `components/` falam com o banco direto — mais do que os
29 de `services/`.**

Consequências práticas:

- **Ao caçar uma consulta, procurar em `services/` não basta.** Buscar também em
  `pages/` e `components/`.
- **Ao alterar uma regra de leitura, ela pode estar em mais de um lugar** — não há
  garantia de ponto único.
- **Ao criar código novo, siga o padrão desejado** e ponha a consulta num serviço.
  Não converta o que já existe por conta própria — ver AD-6 sobre deriva.

Outra tensão medida: **6 imports de `components/` para `pages/`** — inversão de
camada, componente dependendo de tela.

### Arquivos críticos

| Arquivo | Por que é crítico |
|---|---|
| `lib/escritaConferida.ts` | O padrão que impede escrita que mente |
| `hooks/useAuth.tsx` | Papéis (`user_roles`) e portões `canEdit` / `podeEditarPessoas` |
| `hooks/usePermissoes.tsx` | RPC `minhas_permissoes()` — decide widgets e ações |
| `integrations/supabase/client.ts` | `supabase` vs `supabaseRel` — leia a nota antes do segundo |
| `dashboard/widgetRegistry.tsx` | Painel inteiro; a ordem do array é a ordem da tela |
| `lib/funcaoMinisterial.ts` | Cargos, ordem, apelidos, aposentadoria |
| `components/membros/MembroForm.tsx` | 6 passos — o componente mais frágil |
| `components/layout/AppLayout.tsx` | Layout e providers globais |
| `index.css` + `tailwind.config.ts` | Tokens de cor nos dois temas |

### Fluxo de uma requisição

```
Tela (pages/) → Serviço (services/) → supabase-js → PostgREST → RLS → tabela
                                                  ↘ RPC → função SQL
```

`main.tsx` → `App.tsx` monta `ThemeProvider` → `AuthProvider` → rotas. Rotas públicas:
`/auth`, `/convite/:token`, `/primeiro-acesso`, `/esqueci-senha`. Todo o resto fica
sob `<Route element={<AppLayout />}>`, que exige sessão e monta `FichaProvider`,
`CommandPalette`, `QuickActionsFab` e `MobileBottomNav`.

---

## 5. Regras de negócio

### 5.1 Convenções implícitas do banco

Não estão escritas em lugar nenhum; foram medidas. **Contrariá-las quebra coisa.**

| Convenção | Evidência |
|---|---|
| **Excluir é `ativo = false`**, não apagar | 40 tabelas têm `ativo`; apenas 1 tem `deleted_at` |
| **`DELETE` é quase sempre só de admin** | Dezenas de tabelas dão INSERT/UPDATE a vários papéis e DELETE só a `is_admin()` |
| **`created_at` quase sempre; `updated_at` às vezes** | 109 tabelas com `created_at`, 49 com `updated_at` |
| **`igreja_id` tem o UUID fixo como default de coluna** | É assim que o mono-inquilino funciona sem código |
| **Papel do usuário mora em `user_roles`** | `profiles.role` existe, **diverge** e não deve ser lido |
| **`membros` é o eixo do domínio** | **69 chaves estrangeiras** apontam para ela — nenhuma outra tabela chega perto. Mexer em `membros` ou em `tipo_pessoa` propaga para o sistema inteiro |

**O login é por telefone, não por e-mail.** O Supabase Auth exige e-mail, então o
sistema fabrica um a partir dos dígitos do telefone:

```
(21) 98399-1229  →  5521983991229@app.diakonia
```

A conversão está em `pages/Auth.tsx` (`telefoneParaEmail`). **Consequência: o e-mail
em `auth.users` é sintético e não serve para contato** — o e-mail real da pessoa vive
em `membros.email`. Não usar o do `auth` para escrever a ninguém.

**`status_acolhimento` tem default `'novo'`.** Isso significa que "novo" **não indica
que algo aconteceu** — é o valor que a coluna nasce tendo. Ao contar visitantes por
etapa, esse default infla o primeiro balde.

### 5.2 Pessoas e vínculos

- Promoção `visitante → congregado → membro` grava data (`data_congregado`,
  `data_membro`) e registra em `historico_membro`.
- **Funções ministeriais são múltiplas** (array `funcoes_ministeriais`) — há quem
  acumule diácono e tesoureiro. A **primeira da ordem de `FUNCOES_EM_ORDEM`** é a
  principal e aparece no catálogo.
- **Cargos de conselho não têm nível de diretoria** — `auditor` e
  `juridico_parlamentar` fiscalizam a diretoria; pô-los dentro dela inverteria o que
  o organograma afirma.
- **Funções aposentadas** (`aposentada: true`) são **lidas mas nunca oferecidas** —
  quem já as tem continua com elas.
- **`diakonia` NÃO é legado — é o perfil de pastor titular.** Corrigido em
  26/08/2026; a versão anterior deste documento dizia que era "sinônimo migrado de
  `pastor`, ler e não oferecer". **A migração nunca aconteceu.**

  | | |
  |---|---|
  | Ordem real | `diakonia` está no enum desde a **primeira migration** (29/04/2026); `pastor` veio depois |
  | Arquivo que a versão anterior citava | `sql/migrations/diakonia_para_pastor.sql` — **não existe** |
  | Alcance medido | `diakonia` **62** combinações tabela+operação · `pastor` **34** |

  **`pastor` sozinho não enxerga famílias, vínculos familiares, visitas, histórico de
  membresia, acompanhamento de visitante, locais nem membros de ministério.**
  `diakonia` enxerga tudo isso — medido com usuários reais em ambiente local, não só
  por leitura de política.

  A interface passou a chamá-lo de **"Pastor titular"** e a oferecê-lo no convite.
  `pastor` continua existindo, com alcance reduzido, e **não acrescenta nada** a quem
  já tem `diakonia`.

- **Cuidado ao comparar papéis pelo texto das políticas.** Ao levantar isto, a leitura
  do texto sugeriu que `pastor` tinha 3 acessos exclusivos (`areas`, `escalas`,
  `eventos`). **A medição desmentiu:** existe uma política
  `Autenticados leem eventos | SELECT | true` que cobre qualquer autenticado, e as
  permissivas **se somam com OR**. Comparar papéis exige medir, não ler.

- **Outros legados**: `perfil_acesso_legado` aparece em views. Ler, não oferecer.

### 5.3 Acolhimento

`lib/visitantesFluxo.ts`: `boas_vindas` (≤1 dia) → `incentivo` (≤3) → `cuidado` (≤7)
→ `em_acompanhamento` (8–15) → `nao_voltou` (>15); `retornou` a partir de 2 visitas.

**`precisaAcao` corta em 2 dias sem contato** — é esse corte que alimenta o bloco de
Acolhimento no painel.

### 5.4 EBD

- **Perfil da classe** = faixa etária **e** gênero. `esperados_da_classe` ainda
  exclui professores e quem já está em outra classe.
- **Alerta de progressão só aponta quem passou do teto.** Quem está abaixo do mínimo
  entra na faixa sozinho no próximo aniversário — sugerir que desça seria o contrário
  de progredir.
- **`progressao_dispensada_em`** mantém um aluno na classe apesar da idade. A marca
  vive **na matrícula**: se o aluno for movido, a matrícula nova nasce sem ela.

### 5.5 Escalas

- Conflito de horário usa **`tsrange` com fim aberto `'[)'`** — 10h–12h e 12h–14h
  **não** se cruzam.
- `ultima_escala_em` é a data do **evento já acontecido**, não a do clique.
- O gatilho `trg_atualizar_carga` mantém carga e sobrecarga sozinho e **cria a linha
  de `perfil_servico`** na primeira escala. **Não preencher à mão.**

### 5.6 Eventos recorrentes — duas formas no banco

| | |
|---|---|
| a **série** | `recorrencia_regra` preenchida |
| a **ocorrência materializada** | regra nula, mesmo `recorrencia_id`, criada ao editar uma data |

Datas que ninguém editou carregam o `evento_id` **da série**. Qualquer coisa presa só
a `evento_id` **vaza para todas as datas** — por isso `escalasDoEvento` filtra também
por `data_evento`.

### 5.7 Acessos

**Remover acesso não apaga o que a pessoa fez.** `revogar_acesso()` apaga os papéis,
bloqueia o login (`banned_until`) e só então tenta apagar a conta; se uma chave
estrangeira segurar, a conta fica **bloqueada** e o histórico permanece com autor.

Guardas: **só admin**, **nunca a própria conta**, **nunca o último administrador**.

### 5.8 Consentimento LGPD — o portão não lê o banco

O `AppLayout` desvia para `/aceite-lgpd` quando falta a marca
`sessionStorage["lgpd_ok_{uid}"]`.

**O portão consulta `sessionStorage`, não a tabela `consentimento`.** Duas
consequências:

- **Fechar o navegador faz o aceite ser pedido de novo**, porque `sessionStorage`
  morre com a aba.
- **O registro persistente existe** — a tabela `consentimento` tem 23 linhas — mas
  quem decide se pergunta de novo é a marca de sessão, não ela.

Ao mexer nesse fluxo, lembrar que são **duas coisas separadas**: o registro legal
(banco) e o portão de navegação (sessão).

### 5.9 Validações que já causaram defeito

- **Enum inválido em `.in()` não filtra a mais — o Postgres rejeita a consulta
  INTEIRA** ("invalid input value for enum"). `atuacao_status` só tem `ativa` e
  `encerrada`; `membro_status` tem `ativo`. **Dois enums, gêneros diferentes.**
- `visita_historico.tipo` tem **CHECK com lista fechada** — valor novo é recusado
  pelo banco, não aceito em silêncio.
- `vinculos_familiares.parentesco`: `pai_mae, conjuge, filho, avo, neto, enteado,
  tutelado, irmao, outro`.

---

## 6. Padrões obrigatórios

### 6.1 Escrita conferida — o padrão central

**No Postgres com RLS, um UPDATE barrado afeta zero linhas e devolve SUCESSO.** Sem
`.select()` no fim, não há como distinguir "gravou" de "foi barrado".

```ts
const r = conferir(
  await supabase.from("membros").update({ ... }).eq("id", id).select("id"),
  "O status de acolhimento",
);
if (!r.ok) return toast.error(r.erro);
```

Hoje: 11 arquivos, 19 usos. **Toda escrita nova usa isto.** Cerca de 52 escritas
antigas ainda descartam o resultado — ver [Risco 4](#risco-4--escrita-silenciosa-barrada-pela-rls).

### 6.2 Código

- **Idioma: português** em nomes, comentários, mensagens e migrations.
- **Comentário explica o PORQUÊ, com evidência medida** — não o que a linha faz.
- **Import por alias `@/`**.
- **Serviço por domínio** em `services/`. **Padrão desejado**, não situação atual —
  ver [§4.1](#41-a-camada-de-serviços-desejado-versus-atual).
- **Avisos com `sonner`**. Nunca `alert()`, `confirm()` ou `prompt()` — ver
  [Risco 3](#risco-3--confirm-nativo-não-funciona-em-webview).
- **Cor só por token semântico.** Nada de `bg-red-500`. Cuidado: `bg-teal-100` é o
  teal do Tailwind (azul-esverdeado), enquanto o token `--teal` é âmbar.
- **`min-w-0`** em todo item de flex/grid com texto truncável — o mesmo transbordo já
  apareceu **seis vezes**, e há teste e2e só para isso.

### 6.3 Banco

- Migrations: `AAAAMMDDHHMMSS_descricao_em_portugues.sql`, com cabeçalho explicando o
  defeito, a medição e a alternativa descartada.
- **`CREATE OR REPLACE VIEW` só aceita colunas novas no fim**, mantendo nome, tipo e
  ordem das existentes.
- **`ALTER TYPE ... ADD VALUE`** não roda na mesma transação em que o valor é usado.
- Gerar definição nova **transformando** a real (`pg_get_viewdef`), não redigitando.
- Ao acrescentar enum ou coluna, **registrar também em
  `integrations/supabase/types.ts`** — é gerado e costuma estar atrás.

### 6.4 Padrões estruturais em uso

- **Canal de "estou vazio"** — `components/hoje/vazio.tsx`: o widget avisa a seção que
  não tem o que mostrar, e a seção **se esconde**. Usado por 12 widgets.
- **Provider único para diálogo global** — `components/membros/ficha.tsx` monta o
  `FichaProvider` uma vez no `AppLayout`; `<NomePessoa>` torna qualquer nome
  clicável.

---

## 7. Estado dos módulos

### Pronto e em uso, com dado real

| Módulo | Rotas | Volume medido |
|---|---|---|
| Pessoas / catálogo | `/membros`, `/visitantes` | 294 membros |
| Acolhimento | `/visitantes/:id` | 286 contatos |
| Famílias | `/familias` | 75 famílias, 196 vínculos |
| Ministérios e áreas | `/ministerios`, `/areas` | 120 vínculos ativos |
| Escalas | dentro do evento | 67 perfis de serviço |
| Agenda | `/agenda`, `/eventos`, `/locais` | 33 eventos |
| EBD | `/ebd/*` | 117 matrículas |
| Organograma / Estrutura | `/organograma`, `/estrutura` | lê do regimento |
| Usuários e permissões | `/usuarios` | 6 usuários, 108 concessões |
| LGPD | `/admin/lgpd` | 23 consentimentos |

### Construído, aguardando adoção

Financeiro (18 rotas, 18 tabelas `fin_`), governança, fiscal, membresia, pequenos
grupos e arrecadação. **As telas existem; as tabelas estavam vazias ou quase.** Não
são funcionalidades incompletas — são módulos que a igreja ainda não começou a usar.

### Planejado, no banco, sem interface

- **PDV (ponto de venda)** — **8 tabelas `pdv_*` e zero arquivos em `src/` que as
  citem.** Módulo modelado e nunca construído.
- **57 de 173 objetos do banco nunca são consultados**, incluindo 11 views `v_*` e 4
  `vw_*`. **Antes de criar qualquer coisa, conferir se já existe.**
- **2 dos 10 buckets de storage não são referenciados por código nenhum**:
  `arrecadacao-nf` (privado) e `campanhas-materiais` (público).

### Pendências visíveis

- **README vazio** (3 linhas em branco).
- **1 teste unitário**, e ele é `expect(true).toBe(true)`. Os 3 specs de Playwright
  são reais, mas cobrem layout, não regra.
- **Sem CI.**
- Scripts soltos na raiz (`fix_push_lgpd.ps1`, `push_arquitetura_institucional.ps1`,
  `push_lgpd_painel.bat`) e pasta `sql/` fora de `supabase/migrations/`
  **(incerto: não verifiquei se ainda são usados)**.

---

## 8. Riscos e mitigação

Ordenados por **custo de descobrir tarde**.

### Risco 1 — `npx tsc --noEmit` não verifica nada

`tsconfig.json` tem `"files": []` e só `references`. O comando puro monta um programa
**vazio** e sai com sucesso — um nome inventado passa sem reclamação.

**Impacto:** erro de tipo chega em produção com o verificador dizendo "ok".

**Mitigação imediata:** usar sempre `-p tsconfig.app.json`.
**Mitigação definitiva:** acrescentar `"typecheck": "tsc --noEmit -p tsconfig.app.json"`
aos scripts do `package.json`, e um workflow de CI que o rode.
**Armadilha secundária:** se `vitest/globals` não resolver, o `tsc` emite `TS2688` e
**aborta a checagem semântica**, saindo com "0 erros" tendo verificado zero arquivos.
Sempre ler a primeira linha da saída antes de acreditar num zero.

### Risco 2 — TypeScript em modo não estrito

`strictNullChecks: false`, `noImplicitAny: false`, `noUnusedLocals: false`. Somado ao
`supabaseRel`, que apaga a tipagem em consultas com embed.

**Impacto:** o compilador não protege contra nulo — a classe de bug mais comum.

**Mitigação:** ligar `strictNullChecks` de uma vez estouraria em centenas de erros.
Caminho viável: ligar por arquivo com `// @ts-strict` **(incerto: exige plugin)**, ou
adotar a regra de que **arquivo novo nasce sem `any` e com nulo tratado**, sem migrar
o que existe.

### Risco 3 — `confirm()` nativo não funciona em WebView

**40 chamadas.** Em navegador embarcado — que é onde o sistema é usado no celular —
as caixas nativas são bloqueadas: `confirm()` devolve valor falso sem perguntar, o
código entende "cancelou" e não faz nada. **Sem erro, sem aviso.**

**Impacto:** botões que simplesmente não fazem nada no celular. Já confirmado em
"Mover selecionados" da EBD.

**Mitigação:** já corrigido em `pages/Ebd.tsx` com `AlertDialog` — usar como
referência. As 39 restantes: varrer por
`grep -rn "confirm(" src --include=*.tsx | grep -v AlertDialog`. Priorizar as
destrutivas (excluir campanha, arquivar reserva, excluir lançamento).
**Prevenção:** regra de lint proibindo `confirm|alert|prompt` **(incerto: não há
config de lint para isso hoje)**.

### Risco 4 — Escrita silenciosa barrada pela RLS

De 288 escritas no Supabase, **cerca de 52 descartam o resultado**. Como um UPDATE
barrado devolve sucesso, elas podem falhar em silêncio.

**Impacto:** a tela diz "salvo" e nada foi salvo. Já aconteceu neste projeto.

**Mitigação:** aplicar `conferir()` ([§6.1](#61-escrita-conferida--o-padrão-central)).
Priorizar por risco de RLS: escrever primeiro onde a política é mais restritiva que o
portão da tela. **Atenção ao contar:** `await supabase` indentado como argumento de
`conferir(` **não** é escrita cega — um regex ingênuo conta a mais.

### Risco 5 — A guarda de rota por papel cobre 9 de 76 rotas

> **Corrigido em 20/08/2026.** A versão anterior deste documento afirmava que
> *nenhuma* rota tinha guarda por papel. Estava errado.

Existe controle de acesso por papéis nas rotas: `ROUTE_ROLES`, declarado em
`components/layout/navConfig.ts` e aplicado pelo `AppLayout` a cada navegação.
Quem não tem o papel exigido é redirecionado para o painel.

```ts
// components/layout/navConfig.ts
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/membros":            ROLES_LIDERES,
  "/familias":           ROLES_LIDERES,
  "/ministerios":        ROLES_LIDERES,
  "/locais":             ROLES_LIDERES,
  "/painel-estrategico": ROLES_PASTORAL,
  "/ebd":                ROLES_LIDERES,
  "/organograma":        ROLES_LIDERES,
  "/estrutura":          ROLES_PASTORAL,
  "/usuarios":           ROLES_ADMIN,
};
```

**Cobertura medida: 9 rotas protegidas, 76 rotas no total — 67 sem guarda.**

**Limitações observadas:**

- **As rotas mais sensíveis não estão na lista.** `/admin/*` (7 rotas) e
  `/financas/*` (18 rotas) **não** aparecem em `ROUTE_ROLES`. Quem digitar a URL
  chega à tela.
- **A guarda é por caminho exato**, não por prefixo: `Record<string, AppRole[]>`
  indexado por `location.pathname`. Uma rota com parâmetro — `/ebd/:classeId` — não
  casa com a entrada de `/ebd`.
- **A guarda só age depois de os papéis carregarem** (`roles.length > 0`). Antes
  disso a tela já renderizou.

**Impacto:** contido, mas por acúmulo e não por desenho — as telas de `/admin`
se defendem sozinhas com `hasRole(...)`, e a RLS é o backstop. Depende de cada tela
lembrar.

**Mitigação:** acrescentar as rotas de `/admin/*` e `/financas/*` a `ROUTE_ROLES`,
ou trocar a busca por caminho exato por casamento de prefixo. Enquanto não houver,
**toda tela nova sob `/admin` precisa da sua própria guarda interna**.

### Risco 6 — `pg_stat_user_tables.n_live_tup` mente

É estimativa e fica defasada. Durante este levantamento reportou 0 linhas para
tabelas que tinham 39, 108 e 6.

**Impacto:** concluir que um módulo inteiro "nunca foi usado" quando ele está
povoado. Aconteceu.

**Mitigação:** **sempre `count(*)`** antes de afirmar que uma tabela está vazia.

### Risco 7 — `DELETE` restrito a admin em quase todo o banco

Convenção sistêmica. **O padrão "apaga tudo e reescreve" quebra em silêncio** para
quem não é admin.

**Impacto:** para um não-admin, remover um item de uma lista não faz nada, e
re-salvar estoura erro de chave duplicada.

**Mitigação:** preferir **diferença** (apagar só o que saiu) ou **encerrar em vez de
apagar** — como `MembroForm` já faz com `area_voluntarios` (`status='encerrada'`).
Já corrigido em `pages/Eventos.tsx` (`insertLinks`) — usar como referência.

### Risco 8 — Chave de service role com prefixo `VITE_`

`.env.example` declara `VITE_SUPABASE_SERVICE_ROLE_KEY`. Variáveis `VITE_` **vão para
o pacote enviado ao navegador**, e essa chave ignora a RLS.

**Estado atual: sem vazamento.** Verificado — nenhum arquivo em `src/` a referencia e
o valor não aparece em `dist/`.

**Mitigação:** **remover a variável do `.env.example`**, ou renomeá-la sem o prefixo
`VITE_` com um comentário dizendo que é de servidor. Enquanto estiver ali com esse
prefixo, é uma armadilha armada.

### Risco 9 — Duplicações estruturais

| Duplicação | Qual manda | Mitigação |
|---|---|---|
| Dois modelos de permissão | `role_permissoes` (vivo) | `permissoes_modulo` e as `fn_*` não são lidas por ninguém — apagar ou documentar como morta |
| Papel em dois lugares | `user_roles` | `profiles.role` diverge (nulo em 3 de 6). Parar de escrever nele; considerar remover |
| Dois modos de abrir a ficha | `FichaProvider` | `Membros`, `Organograma` e `EstruturaDaIgreja` ainda usam estado local — migrar quando tocar neles |
| `types.ts` gerado com edições à mão | o banco | Entradas manuais estão marcadas em comentário; uma regeneração as descarta. Regenerar e reconferir |

### Risco 10 — Pacote de produção grande

O build avisa: chunk acima de **2,6 MB**. Não há `manualChunks`.

**Impacto:** primeira carga lenta em 3G — e a igreja usa celular.

**Mitigação:** `build.rollupOptions.output.manualChunks` separando os pesados
(`pdfjs-dist`, `tesseract.js`, `leaflet`, `recharts`), que já são usados em poucas
telas e se prestam a carregamento sob demanda.

---

## 9. Para sessões Claude Code

### Antes de começar

1. **Medir antes de concluir.** 143 tabelas e 397 funções: a chance de o que você
   quer construir já existir é alta. Há **57 objetos dormentes** — inclusive um
   módulo inteiro (PDV).
2. **Ler os comentários.** Muitos avisam explicitamente contra a mudança que parece
   óbvia.
3. **Conferir a política antes do portão.** Políticas permissivas **se somam com
   OR**: uma tabela com `ALL: admin+secretaria` e `DELETE: is_admin()` permite
   secretaria apagar, pela primeira. Não confiar no `canEdit` do app.

### Ao entregar

- Rodar `npx tsc --noEmit -p tsconfig.app.json` — **nunca sem `-p`**.
- Rodar `npx vite build`.
- **Conferir na tela.** O projeto é visual e cheio de estado de RLS; rodar o `dev` e
  olhar vale mais que ler o diff.
- Testar escrita com `ROLLBACK` ou apagando em seguida — [§1.2](#12--não-existe-banco-de-homologação).

### Armadilhas específicas

- **Formulário de pessoa tem 6 passos.** Ao mexer na numeração, conferir *todos* os
  lugares: conteúdo de cada passo, a guarda `if (step !== 6)`, o rodapé
  `{step < 6 ? …}`, o indicador e os casts. Esquecer o rodapé **trava a tela sem erro
  nenhum**.
- **Não editar `components/ui/`** sem motivo forte — são primitivos do shadcn/ui.
- **Não regenerar `types.ts`** sem reconferir as entradas manuais.
- **Ao mudar a ordem de widgets**, lembrar que é a ordem do array que manda.

### Convenções inegociáveis

1. Português em tudo.
2. Comentário explica o porquê, com evidência medida.
3. Migration com cabeçalho contando o defeito e a medição.
4. Ensaiar migration com `BEGIN; … ROLLBACK;` antes de aplicar.
5. Toda escrita nova com `conferir()`.

---

## Correções após análise arquitetural

A primeira versão deste documento foi escrita a partir de uma varredura do
repositório. Ao levantar os fluxos para o [ARCHITECTURE.md](./ARCHITECTURE.md),
duas afirmações se mostraram **falsas** e quatro achados relevantes estavam
**ausentes**. Esta seção registra o que mudou e por quê.

> Todas as correções vieram de evidência já documentada no ARCHITECTURE.md.
> Nenhuma investigação nova foi feita para produzi-las.

### Afirmações corrigidas

**1 · "Nenhuma rota tem guarda por papel" — era falso.**

| | |
|---|---|
| Dizia antes | "Só há guarda de autenticação (`AppLayout`)" |
| Evidência | `ROUTE_ROLES` em `components/layout/navConfig.ts`, aplicado pelo `AppLayout` |
| Diz agora | 9 rotas protegidas de 76; 67 sem guarda |
| Onde | [Risco 5](#risco-5--a-guarda-de-rota-por-papel-cobre-9-de-76-rotas) |

A **preocupação original continua válida** — `/admin/*` e `/financas/*` não estão
entre as nove — mas o diagnóstico estava errado. O risco passou a documentar a
cobertura real, o mapa completo das 9 rotas e três limitações que só apareceram ao
ler o código do portão: a busca é por **caminho exato** (rota com parâmetro não
casa), e a guarda **só age depois de os papéis carregarem**.

**2 · "Todo acesso ao banco passa por `services/`" — era falso.**

| | |
|---|---|
| Dizia antes | "`services/` — TODO acesso ao banco passa por aqui" |
| Evidência | Contagem de imports de `integrations/supabase/client` por camada |
| Diz agora | 37 em `pages/` + 35 em `components/` = **72**, contra 29 em `services/` |
| Onde | nova [§4.1](#41-a-camada-de-serviços-desejado-versus-atual) |

A nova subseção separa explicitamente **padrão desejado** de **situação atual**, e
tira daí a consequência prática: *ao caçar uma consulta, procurar em `services/`
não basta*. A convenção em [§6.2](#62-código) passou a dizer "padrão desejado, não
situação atual" em vez de afirmar o que não se cumpre.

### Achados incorporados

**3 · Autenticação por telefone e e-mail sintético** → [§5.1](#51-convenções-implícitas-do-banco)

O login é por telefone; o Supabase Auth exige e-mail, e o sistema fabrica
`{dígitos}@app.diakonia`. **O e-mail em `auth.users` não serve para contato** — o
real está em `membros.email`. Faltava por completo na versão anterior.

**4 · O papel de `membros` no domínio** → [§5.1](#51-convenções-implícitas-do-banco)

As **69 chaves estrangeiras** que apontam para `membros` já apareciam na §2.3, mas
só como descrição do modelo. Viraram também uma linha na tabela de convenções
implícitas, com a consequência dita: mexer em `membros` ou em `tipo_pessoa`
propaga para o sistema inteiro.

**5 · Consentimento LGPD por `sessionStorage`** → nova [§5.8](#58-consentimento-lgpd--o-portão-não-lê-o-banco)

O portão do `AppLayout` lê `sessionStorage["lgpd_ok_{uid}"]`, **não a tabela
`consentimento`**. Fechar o navegador faz o aceite ser pedido de novo, embora o
registro legal persista no banco (23 linhas). São duas coisas separadas, e a versão
anterior não mencionava nenhuma das duas. A antiga §5.8 virou §5.9.

**6 · Buckets sem referência no código** → [§7](#7-estado-dos-módulos)

`arrecadacao-nf` (privado) e `campanhas-materiais` (público) não são citados por
nenhum arquivo. Somam-se aos 57 objetos dormentes já documentados.

### O que não mudou

Nada além dos seis pontos acima. Os demais números — 285 arquivos, 77 migrations,
143 tabelas, 476 políticas, 57 objetos dormentes, 40 `confirm()`, 52 escritas sem
conferência — foram **confirmados** pela análise arquitetural, não alterados.

### Lição para quem mantiver este documento

As duas afirmações falsas tinham a mesma origem: **descreviam a intenção do projeto
como se fosse o estado dele.** "Passa por services" e "não tem guarda de rota" são
frases que soam plausíveis e que ninguém checa.

Ao escrever aqui, prefira **um número contado a um adjetivo**. "9 de 76" resiste à
leitura de quem for conferir; "nenhuma" não resistiu.
