# HOMOLOGATION_IMPLEMENTATION_PLAN.md — DiakoniaApp

Plano de implantação de um ambiente de homologação, com o objetivo específico de
**validar as 13 correções já implementadas** ([WAVE1_IMPLEMENTATION_REPORT.md](./WAVE1_IMPLEMENTATION_REPORT.md))
sem tocar em dados de produção.

> **Nada foi alterado.** Nenhum código, banco, migration ou documentação existente.
> Levantamento por leitura do repositório e do catálogo do banco de produção.

---

# 1. A descoberta que muda o plano

**As migrations não reproduzem o schema.** Medido:

| | Produção | Definido em `supabase/migrations/` |
|---|---|---|
| Tabelas | **143** | **46** — há apenas 42 instruções `CREATE TABLE` nas 77 migrations |
| Funções | **396** | **60** |
| Funções definidas só na pasta `sql/` solta | — | 3 (`reset_user_password`, `get_user_email`, `registrar_audit_log`) |
| **Funções sem definição em lugar nenhum do repositório** | — | **333** |

A primeira migration é de **29/04/2026** e cria 8 tabelas. O schema já existia antes
dela. **As 77 migrations são um changelog incremental, não a origem do banco.**

### O que isso invalida

**O CLAUDE.md §6.3 afirma que as migrations são "a fonte da verdade do schema".** Não
são — são a fonte da verdade das *mudanças* desde abril. E o
[HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md), que eu mesmo
escrevi, recomendava *"aplicar as 77 migrations"* no ambiente novo. **Isso não
funcionaria:** migrations que fazem `ALTER TABLE campanhas` sobre uma tabela que nenhuma
migration cria falhariam já na primeira execução.

### O que isso obriga

**A baseline de homologação tem de vir de um dump do schema de produção**, não das
migrations. As migrations passam a valer **daí para a frente**.

Isto acrescenta cerca de meio dia ao plano e **remove o risco de construir um ambiente
que parece certo e está incompleto** — que seria a pior forma de errar aqui, porque as
13 correções passariam a ser validadas contra um banco diferente do real.

---

# 2. Arquitetura recomendada

## 2.1 Visão

```
┌─ DESENVOLVIMENTO ────────────┐   ┌─ HOMOLOGAÇÃO ────────┐   ┌─ PRODUÇÃO ──────────┐
│ Supabase local (Docker)      │   │ Projeto Supabase 2   │   │ prjoftmlkusbjoeptabp│
│ • schema: dump de produção   │──▶│ • mesmo baseline     │──▶│ • dados reais       │
│ • dados: seed.sql fictício   │   │ • seed fictício      │   │ • 294 pessoas       │
│ • 3 usuários de teste        │   │ • preview da Vercel  │   │                     │
│ • custo R$ 0                 │   │ • custo a confirmar  │   │                     │
└──────────────────────────────┘   └──────────────────────┘   └─────────────────────┘
         ▲                                                              │
         └──────────── dump do schema, sem dados ───────────────────────┘
```

**A fase 1 (local) é suficiente para validar as 13 correções.** A homologação na nuvem
resolve o ensaio de migrations e o *preview* da Vercel, e pode esperar orçamento.

## 2.2 Banco de dados

| | |
|---|---|
| **Baseline** | `supabase/baseline/schema.sql` — dump de produção, **estrutura apenas** |
| **Incremental** | as 77 migrations existentes, aplicadas **depois** da baseline |
| **Dados** | `supabase/seed.sql` — fictício, escrito à mão |
| **Nunca** | cópia de dados de produção, mesmo anonimizada — ver §6.3 |

## 2.3 Storage

Os 10 buckets precisam existir para as telas não quebrarem, e **vazios**.

Segundo o [STORAGE_AUDIT.md](./STORAGE_AUDIT.md), 3 são públicos (`ebd-aulas`,
`locais-mapas`, `campanhas-materiais`) e 7 privados. **Recriar com a mesma configuração
de visibilidade** — inclusive a pública, para que homologação reproduza o
comportamento real.

**Nenhum arquivo é copiado.** As 13 correções não tocam storage.

## 2.4 Autenticação

O login é por telefone, com e-mail sintético `{dígitos}@app.diakonia`
(CLAUDE.md §5.1). O GoTrue local aceita isso sem configuração extra — **não há
provedor externo a reproduzir**.

**Confirmação de e-mail deve ficar desligada** no ambiente local; senão nenhum usuário
de teste consegue entrar.

## 2.5 Usuários e papéis de teste

**Três usuários, e os três são necessários.** As 13 correções só são verificáveis se
existir alguém que *falhe*:

| Usuário | Telefone | Papel | Para que serve |
|---|---|---|---|
| `admin.teste` | `(21) 90000-0001` | `admin` | Confirma que **tudo continua funcionando** — a correção não tira permissão de ninguém |
| `secretaria.teste` | `(21) 90000-0002` | `secretaria` | Passa em 11 das 13; **falha nas 2 de `profiles`** |
| `lideranca.teste` | `(21) 90000-0003` | `lideranca` | **O usuário decisivo — falha em 11 das 13** |

> **Por que `lideranca` é o centro do plano.** Segundo o
> [WAVE1_IMPLEMENTATION_PLAN.md](./WAVE1_IMPLEMENTATION_PLAN.md) §2, é o papel que não
> pode apagar vínculo familiar, família, pessoa nem visita, e não pode alterar família
> nem solicitação de LGPD. **Sem um usuário `lideranca`, nenhuma das 13 correções pode
> ser observada funcionando** — com `admin` todas passam, que é exatamente o
> comportamento anterior.

Cada usuário precisa de linha em `auth.users`, em `profiles` e em `user_roles` — os
três, porque `user_roles` é a fonte da verdade do papel e `profiles.role` diverge
(Achado 14).

## 2.6 Dados fictícios

O mínimo que exercita as 13 correções. As colunas obrigatórias são poucas — medido no
banco:

| Tabela | Obrigatórias (sem default) | Quantidade sugerida |
|---|---|---|
| `membros` | `nome_completo` | **12** — 6 membros, 3 congregados, 3 visitantes |
| `familias` | `nome_familia` | **3** |
| `vinculos_familiares` | `familia_id`, `membro_id`, `parentesco` | **8** — inclui 1 família com responsável e 1 sem |
| `visitas` | `membro_id` | **4** — ligadas aos 3 visitantes |
| `solicitacoes_lgpd` | `email_solicitante`, `tipo` | **3** — uma por status |
| `profiles` | `id`, `nome` | **3** — os usuários de teste |
| `user_roles` | `user_id`, `role` | **3** |

**Nomes inventados, telefones na faixa `(21) 9xxxx-xxxx` de teste, nenhum endereço
real.** Total: cerca de 36 linhas.

**Dois casos de borda precisam existir na semente**, porque duas correções dependem
deles:

- **Uma família sem responsável definido** — para exercitar `VinculosDialog.tsx:117`,
  a limpeza que legitimamente afeta zero linhas e por isso **não** recebeu `conferir()`.
- **Uma família sem vínculos** — para exercitar `Familias.tsx:210`, mesma situação.

Se a semente não tiver esses dois casos, a decisão de não conferir aquelas duas linhas
fica sem verificação.

## 2.7 Variáveis de ambiente

| Arquivo | Uso | Versionado? |
|---|---|---|
| `.env` | **produção** — como hoje | não |
| `.env.local` | **ambiente local** — `http://127.0.0.1:54321` | não |
| `.env.example` | modelo | sim |

**Duas mudanças obrigatórias no `.env.example`**, ambas do
[HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md):

1. **Renomear `VITE_SUPABASE_SERVICE_ROLE_KEY` para `SUPABASE_SERVICE_ROLE_KEY`.** Com
   o prefixo `VITE_`, o Vite embute a variável no pacote entregue ao navegador assim
   que qualquer linha a referenciar. Hoje ela está **preenchida** na máquina.
2. **Acrescentar `E2E_BASE_URL`, `E2E_TELEFONE` e `E2E_SENHA`** como variáveis
   esperadas, apontando para o ambiente local.

## 2.8 Sincronização

**Em uma direção só: produção → homologação, e apenas estrutura.**

| Evento | Ação |
|---|---|
| Nova migration | aplicar **primeiro** em local, depois em produção |
| Schema divergiu | regerar a baseline por dump; **nunca** editar à mão |
| Semente insuficiente | acrescentar linha ao `seed.sql` e versionar |
| **Dados de produção** | **nunca copiados** |

**Regra que dá sentido ao ambiente:** toda migration passa por local antes de
produção. Sem ela, os bancos divergem e a homologação vira ficção.

---

# 3. Checklist de implantação

## Fase 0 · Contenção — 30 minutos, antes de tudo

- [ ] Renomear `VITE_SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` no `.env` e no `.env.example`
- [ ] Acrescentar comentário: *"chave de servidor — nunca no cliente, nunca com prefixo `VITE_`"*
- [ ] Confirmar que `.env.local` está coberto por `.gitignore` (a regra `.env.*` já cobre)
- [ ] Declarar `engines.node` no `package.json`

## Fase 1 · Baseline do schema — 1 dia

- [ ] Instalar o Supabase CLI (verificado: **v2.115.0 já disponível** via `npx`)
- [ ] `npx supabase login`
- [ ] Extrair a estrutura de produção, **sem dados**:
      `npx supabase db dump --project-ref prjoftmlkusbjoeptabp --schema public -f supabase/baseline/schema.sql`
- [ ] Extrair também as políticas de RLS e as funções (o dump acima já as inclui — **conferir**)
- [ ] **Conferir o dump antes de usar:** 143 tabelas, 396 funções, 476 políticas, 123 gatilhos
- [ ] Extrair a configuração dos buckets: `storage.buckets` (10 linhas, 3 públicos)
- [ ] Versionar `supabase/baseline/` com um README explicando **por que ele existe** e que as migrations sozinhas não bastam

## Fase 2 · Ambiente local — meio dia

- [ ] `npx supabase init` (o `config.toml` hoje tem só `project_id` — vai ganhar a seção local)
- [ ] Desligar confirmação de e-mail na configuração local do Auth
- [ ] `npx supabase start`
- [ ] Aplicar a baseline no banco local
- [ ] Aplicar as 77 migrations **por cima** e **registrar quais falham** — é a primeira vez que serão exercitadas em sequência
- [ ] Criar os 10 buckets com a visibilidade correta (3 públicos, 7 privados)
- [ ] Criar `.env.local` apontando para `http://127.0.0.1:54321`

## Fase 3 · Usuários e semente — 1 dia

- [ ] Criar os 3 usuários em `auth.users` com e-mail sintético `{telefone}@app.diakonia`
- [ ] Criar as 3 linhas em `profiles`
- [ ] Criar as 3 linhas em `user_roles` — **`admin`, `secretaria`, `lideranca`**
- [ ] Escrever `supabase/seed.sql` com as ~36 linhas da §2.6
- [ ] **Incluir os dois casos de borda:** família sem responsável, família sem vínculos
- [ ] Registrar o aceite de LGPD dos 3 usuários — senão o portão desvia para `/aceite-lgpd` e o teste para (o `e2e/sessao.setup.ts` já avisa disso em comentário)
- [ ] Verificar que `npm run dev` com `.env.local` sobe contra o banco local

## Fase 4 · Testes automatizados — meio dia

- [ ] Apontar `E2E_BASE_URL` para o ambiente local
- [ ] Trocar o `webServer.command` do Playwright para usar `.env.local` explicitamente
- [ ] **Remover o padrão `?? "http://localhost:8080"`** de `playwright.config.ts:20` — faz o teste **falhar** em vez de silenciosamente acertar produção
- [ ] Rodar `npx playwright test` e confirmar que os 3 specs passam

## Fase 5 · Documentação — meio dia

- [ ] README com o passo a passo de subir o ambiente
- [ ] Registrar a descoberta da §1 — que as migrations não reproduzem o schema
- [ ] Registrar a regra: **toda migration passa por local antes de produção**

---

# 4. Checklist de validação das 13 correções

**O método é o mesmo para todas: entrar como `lideranca`, tentar a ação, e confirmar
que aparece um erro em vez de "pronto".** Depois entrar como `admin` e confirmar que a
mesma ação funciona.

## 4.1 Com `lideranca.teste` — deve **falhar com aviso**

| # | Correção | Como exercitar | Esperado |
|---|---|---|---|
| 1 | `VisitanteDialog.tsx:132` | Abrir ficha de visitante → remover uma visita | Erro: *"A visita não foi salva — seu perfil não tem permissão…"* |
| 2 | `MembroForm.tsx:540` | Abrir ficha → excluir contato | Erro sobre **O contato**, **não** a mensagem de chave estrangeira |
| 3 | `VinculosDialog.tsx:101` | Família → remover vínculo | Erro sobre **O vínculo** |
| 4 | `VinculosDialog.tsx:108` | Família → mudar parentesco | Erro sobre **O parentesco** |
| 5 | `VinculosDialog.tsx:122` | Família → definir responsável | Erro sobre **O responsável** |
| 6 | `VinculosPessoaDialog.tsx:80` | Ficha da pessoa → remover vínculo | Erro sobre **O vínculo** |
| 7 | `Familias.tsx:143` | Editar família e salvar | Erro sobre **A família** |
| 8 | `Familias.tsx:212` | Excluir família | Erro sobre **A família** |
| 9 | `familiaService.ts:132` | Desvincular pessoa | Exceção com a mensagem de `conferir()` |
| 10 | `familiaService.ts:141` | Atualizar família por serviço | Exceção com a mensagem de `conferir()` |
| 11 | `LgpdAdmin.tsx:172` | Marcar solicitação como concluída | Erro — **não** *"Erro ao atualizar solicitação"*, que é o ramo de `error` |

**O ponto 2 e o ponto 11 merecem atenção:** neles a correção convive com um tratamento
de erro anterior. O teste precisa confirmar que a mensagem que aparece é a de
`conferir()`, provando que o **novo** ramo foi alcançado.

## 4.2 Com `secretaria.teste` — deve **passar**, exceto `profiles`

| # | Correção | Esperado |
|---|---|---|
| 1–11 | as da tabela acima | **Funcionam** — a política de `familias`, `vinculos_familiares`, `visitas`, `membros` e `solicitacoes_lgpd` inclui `secretaria` |
| 12 | `userService.ts:221` — criar usuário | **Falha** — `profiles` é `admin` ou o próprio dono |
| 13 | `acessoService.ts:265` — criar acesso pela ficha | **Falha** — idem |

**Nas 12 e 13, confirmar que a senha volta junto com o erro.** Foi a decisão de
desenho: *"Acesso criado no Auth, mas o perfil não foi salvo…"* acompanhado da senha,
para ela não se perder.

## 4.3 Com `admin.teste` — **tudo deve funcionar**

- [ ] As 13 ações concluem com sucesso
- [ ] Nenhuma mensagem nova de erro aparece
- [ ] **É a verificação mais importante do plano:** confirma que a correção não tirou permissão de ninguém

## 4.4 Casos de borda — as 2 linhas que **não** receberam `conferir()`

| Caso | Como exercitar | Esperado |
|---|---|---|
| `VinculosDialog.tsx:117` | Como `admin`, definir responsável numa família **que não tem nenhum** | **Sucesso** — a limpeza afeta zero linhas legitimamente, e não pode acusar erro |
| `Familias.tsx:210` | Como `admin`, excluir uma família **sem vínculos** | **Sucesso** — e confirmar que o `CASCADE` remove os vínculos quando existem |

**Se qualquer um destes acusar erro, a decisão de não conferir estava errada** — e é
justamente para isso que os dois casos de borda entram na semente.

---

# 5. Estratégia de rollback

## 5.1 O rollback do ambiente é trivial

**Nada em produção é tocado por este plano.** O ambiente local é descartável:

| Situação | Ação | Custo |
|---|---|---|
| Ambiente local quebrou | `npx supabase stop --no-backup` e `supabase start` de novo | minutos |
| Baseline saiu errada | Regerar o dump e recomeçar | ~1 hora |
| Semente insuficiente | Acrescentar linhas e reaplicar | minutos |
| Desistir do plano | Apagar `.env.local` e `supabase/baseline/`. **Produção nunca soube que existiu** | minutos |

## 5.2 O rollback que exige cuidado é o das 13 correções

As correções **já estão no diff de trabalho** e ainda não foram publicadas.

| Situação | Ação |
|---|---|
| Uma correção se mostra errada na validação | `git checkout -- <arquivo>` e refazer só ela |
| Todas se mostram problemáticas | `git checkout -- src/` — o diff é de 9 arquivos, 138 inserções |
| Já publicado e a equipe reclama | **Não reverter por reclamação.** O erro que aparece é real e existia antes, em silêncio. Ver §6.4 |

**Recomendação: não publicar antes da validação.** O rollback depois de publicado é
tecnicamente fácil e organizacionalmente caro.

---

# 6. Riscos

## 6.1 A baseline sair incompleta — **ALTO**

**Evidência:** as migrations cobrem 46 de 143 tabelas. Se o dump também falhar em algo,
o ambiente valida contra um banco que não é o real.

**Mitigação:** conferir o dump por contagem antes de usar — 143 tabelas, 396 funções,
476 políticas, 123 gatilhos. **Números conhecidos; se não baterem, o dump está
incompleto.**

## 6.2 As 77 migrations não subirem em sequência — **MÉDIO**

**Evidência:** nunca foram exercitadas do zero, e há dependências de ordem
documentadas — `ALTER TYPE ... ADD VALUE` não roda na mesma transação em que o valor é
usado (CLAUDE.md §6.3).

**Mitigação:** aplicá-las **depois** da baseline, não no lugar dela. Registrar as que
falharem. **Descobrir isso em local é o objetivo, não um problema.**

## 6.3 Alguém copiar dados de produção para acelerar — **ALTO**

**Por que é grave:** o dado mais sensível do sistema é a **observação pastoral** — o
que a pessoa contou em confiança. Copiar para homologação cria um segundo lugar a
proteger, com controles mais frouxos.

**Mitigação:** semente fictícia é **mais simples e mais segura**. São ~36 linhas. Deixar
isso escrito no README, porque a tentação aparece quando o prazo aperta.

## 6.4 A equipe interpretar os erros novos como regressão — **MÉDIO**

**Evidência:** as 13 correções fazem aparecer erro onde antes aparecia "pronto".

**Mitigação:** avisar **antes** de publicar, com a frase exata: *"o sistema passou a
avisar quando uma alteração não é salva; isso já acontecia, só era invisível."*

## 6.5 O ambiente local divergir com o tempo — **MÉDIO**

**Mitigação:** a regra da §2.8 — toda migration em local antes de produção. E regerar a
baseline a cada trimestre.

## 6.6 Custo do segundo projeto na nuvem — **BAIXO**

**Mitigação:** a fase local é gratuita e **suficiente para validar as 13 correções**. A
nuvem é fase 6, opcional, e só quando houver orçamento confirmado.

---

# 7. Estimativa de esforço

| Fase | Duração | Custo | Entrega |
|---|---|---|---|
| **0 · Contenção** | 30 min | R$ 0 | `service_role` sem prefixo `VITE_`; `engines` declarado |
| **1 · Baseline** | 1 dia | R$ 0 | `supabase/baseline/schema.sql` conferido |
| **2 · Ambiente local** | meio dia | R$ 0 | `supabase start` funcionando; migrations exercitadas |
| **3 · Usuários e semente** | 1 dia | R$ 0 | 3 papéis, ~36 linhas, 2 casos de borda |
| **4 · Testes automatizados** | meio dia | R$ 0 | Playwright contra local |
| **5 · Documentação** | meio dia | R$ 0 | README e a regra de migration |
| **Subtotal — validar as 13** | **~3,5 dias** | **R$ 0** | — |
| **6 · Homologação na nuvem** *(opcional)* | 2 dias | a confirmar | *preview* da Vercel |
| **Total com nuvem** | **~5,5 dias** | 1 item pago | — |

**A validação das 13 correções custa 3,5 dias e zero reais.**

A estimativa original do [ACTION_PLAN_90_DAYS.md](./ACTION_PLAN_90_DAYS.md) era de 4
dias para a homologação. **Continua realista** — a descoberta da §1 acrescenta meio dia
de baseline, e a fase local remove a dependência de orçamento.

---

# 8. Ordem recomendada

1. **Fase 0** — 30 minutos, hoje. Independe de tudo o mais e remove o risco irreversível.
2. **Fases 1 a 3** — 2,5 dias. Ao fim, `npm run dev` deixa de tocar em produção.
3. **Validação da §4** — meio dia. **Só então publicar as 13 correções.**
4. **Fases 4 e 5** — 1 dia.
5. **Fase 6** — quando houver orçamento.

**O marco que importa é o passo 3.** Antes dele as correções estão escritas mas não
verificadas; depois dele, verificadas contra o papel que de fato falha.

---

## 9. Uma correção pendente na documentação

A §1 contradiz duas afirmações registradas:

| Documento | Afirma | Realidade medida |
|---|---|---|
| `CLAUDE.md` §6.3 | Migrations são *"a fonte da verdade do schema"* | 46 de 143 tabelas; são changelog desde abril/2026 |
| `HOMOLOGATION_ENVIRONMENT_AUDIT.md` §6 | *"Aplicar as 77 migrations"* no ambiente novo | Falharia — `ALTER` sobre tabelas que nenhuma migration cria |

**Não corrigi nenhum dos dois** — o pedido foi para não alterar documentação existente.
Ficam registradas aqui para correção posterior.

---

*Levantamento por leitura de `supabase/migrations/` (77 arquivos), `supabase/config.toml`,
`sql/`, `package.json`, `playwright.config.ts`, `.env`, `.gitignore` e do catálogo do
banco de produção. Nenhum código, banco, migration ou documentação foi alterado.*
