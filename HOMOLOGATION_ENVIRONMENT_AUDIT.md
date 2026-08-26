# HOMOLOGATION_ENVIRONMENT_AUDIT.md — DiakoniaApp

Auditoria dos ambientes de desenvolvimento, homologação e produção, executada em
**25/08/2026**.

> Origem: **Achado 01** da Auditoria Técnica — o único crítico cuja correção é um
> projeto, não uma linha. É também a **ordem 8** do
> [ACTION_PLAN_90_DAYS.md](./ACTION_PLAN_90_DAYS.md).
>
> **Nada foi alterado.** Levantamento por leitura de `.env`, `.gitignore`,
> `package.json`, `vite.config.ts`, `vercel.json`, `supabase/config.toml`,
> `playwright.config.ts`, do client do Supabase e do bundle em `dist/`.

---

## 1. Resumo em uma frase

**Não existem três ambientes. Existe um — produção — e todo mundo trabalha dentro
dele.** Desenvolvimento, testes automatizados e uso real da igreja compartilham o
mesmo banco, a mesma autenticação, o mesmo storage e as mesmas 294 pessoas.

---

## 2. Configuração atual dos ambientes

### 2.1 Qual banco cada ambiente usa

| Contexto | Banco | Como chega lá |
|---|---|---|
| **Desenvolvimento** (`npm run dev`) | `prjoftmlkusbjoeptabp` — **produção** | `.env` local |
| **Testes E2E** (`npm run test:layout`) | `prjoftmlkusbjoeptabp` — **produção** | Playwright sobe `npm run dev` |
| **CLI do Supabase / migrations** | `prjoftmlkusbjoeptabp` — **produção** | `supabase/config.toml` fixa o `project_id` |
| **Produção** (Vercel) | `prjoftmlkusbjoeptabp` | Variáveis no painel da Vercel |
| **Homologação** | — | **não existe** |

**São quatro caminhos distintos e um único destino.** Não há um ponto do sistema em
que a escolha de banco dependa de contexto.

### 2.2 Variáveis de ambiente

Só existem dois arquivos: `.env` e `.env.example`. **Não há `.env.development`,
`.env.staging` nem `.env.production`.**

| Variável | Presente no `.env`? | Consumida pelo código? | Observação |
|---|---|---|---|
| `VITE_SUPABASE_URL` | sim (40 chars) | sim — `client.ts:5` | Aponta para produção |
| `VITE_SUPABASE_ANON_KEY` | sim (208 chars) | sim — `client.ts:6` | Pública por desenho; presente no bundle, como esperado |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | **sim (41 chars)** | **não** — nenhum arquivo em `src/` | **Ver §4.2** |
| `E2E_TELEFONE` / `E2E_SENHA` | não | sim — `e2e/sessao.setup.ts` | Só ambiente, nunca repositório |
| `E2E_BASE_URL` | não | sim — `playwright.config.ts:20` | Padrão `http://localhost:8080` |

**O que está certo:** `.gitignore` cobre `.env` e `.env.*` com exceção explícita para
`.env.example` (linhas 2–4), e o `.env` **não está rastreado** pelo git. A proteção
funciona.

### 2.3 Diferenças entre ambientes

**Nenhuma.** É o achado central desta seção, e vale enunciá-lo com precisão:

```
grep -rE 'import\.meta\.env\.(MODE|DEV|PROD)|process\.env\.NODE_ENV' src e2e
→ zero ocorrências
```

**Não há uma única linha em 285 arquivos que se comporte de modo diferente conforme o
ambiente.** Não existe *feature flag*, não existe log condicional, não existe proteção
de escrita em modo de desenvolvimento. O `vite.config.ts` também não usa a função
`({ mode }) => ...` — a configuração é estática.

Existe o script `build:dev` (`vite build --mode development`), mas **sem arquivos de
`.env` por modo ele não muda nada de substantivo** — carrega o mesmo `.env` e produz um
bundle com o mesmo destino.

### 2.4 Dependências externas

| Dependência | Separável por ambiente? | Situação |
|---|---|---|
| **Supabase** (banco, auth, storage) | sim — bastaria outro projeto | **Um só, compartilhado** |
| **Vercel** | sim — *preview deployments* nativos | Um projeto; deploy a partir de `main` |
| **WhatsApp** | não se aplica | Link `wa.me`, sem API e sem credencial |
| **Geocodificação** | a verificar | `geocodificacaoService.ts` — provedor não confirmado |

O WhatsApp ser apenas link é uma **vantagem** aqui: não há credencial de terceiro para
duplicar, nem risco de disparar mensagem real a partir de um teste.

---

## 3. Verificação de separações

| Separação | Existe? | Evidência |
|---|---|---|
| **Ambiente de homologação** | **Não** | Um `project_id` em `config.toml`; um `.env` |
| **Credenciais** | **Não** | Mesma `anon key` em desenvolvimento e produção |
| **Storage** | **Não** | Os 10 buckets são os mesmos. Um teste de upload grava no bucket real |
| **Autenticação** | **Não** | Mesmo GoTrue, mesmos `auth.users`. A conta de teste do E2E é uma conta real do sistema |
| **APIs** | **Não** | Mesmo PostgREST, mesmas 397 funções, mesmas 476 políticas |

**Cinco separações verificadas, cinco ausentes.** Não é uma separação incompleta — é a
ausência da própria noção de ambiente.

---

## 4. Riscos identificados

### 4.1 Risco 1 · Testes automatizados rodam contra produção — **CRÍTICO**

**Evidência.** `playwright.config.ts:38-40`:

```ts
webServer: {
  command: "npm run dev",
  url: "http://localhost:8080",
}
```

`npm run dev` lê o `.env`, que aponta para produção. **Toda execução de
`npm run test:layout` autentica no sistema real e navega pelas telas com dados reais.**

**Impacto.** Hoje é contido por sorte, não por desenho: os specs fazem 4 `goto`, 2
`fill` e 2 `click`, e os `fill`/`click` são do login. Os três specs de layout **só
leem**. Mas nada impede que o próximo teste clique num botão de excluir — e ele
excluiria de verdade.

**Probabilidade de dano hoje:** baixa. **Probabilidade de dano no primeiro teste de
escrita que alguém escrever:** certa.

> **Nota justa ao código existente.** O `e2e/sessao.setup.ts` é cuidadoso: tira as
> credenciais só do ambiente, nunca do repositório; avisa em comentário para usar
> conta de teste; grava a sessão num arquivo que está no `.gitignore`; e escolhe
> *pular* em vez de *falhar* quando faltam credenciais, com o motivo explicado. **O
> problema não é a qualidade do teste — é o banco para onde ele aponta.**

### 4.2 Risco 2 · A chave `service_role` está preenchida na máquina — **ALTO**

**Evidência.** `VITE_SUPABASE_SERVICE_ROLE_KEY` tem valor no `.env` local (41
caracteres).

**Isto atualiza o Achado 03 da Auditoria Técnica.** Aquele relatório concluiu "sem
vazamento" com base em duas verificações que **continuam válidas** — e que eu refiz:

| Verificação | Resultado |
|---|---|
| Algum arquivo em `src/` referencia a variável? | **Não** |
| O valor aparece em algum dos 25 arquivos de `dist/`? | **Não** |
| O nome `SERVICE_ROLE` aparece no bundle? | **Não** |
| A `anon key` aparece no bundle? | Sim — 1 arquivo, **correto e esperado** |

**O que muda.** A auditoria descrevia uma armadilha *armada*. Ela agora está **armada e
carregada**: o prefixo `VITE_` faz o Vite embutir a variável no bundle **assim que
qualquer linha a referenciar**. Basta um `import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY`
escrito por engano — e o nome sugere exatamente isso — para que a próxima publicação
na Vercel leve ao navegador uma credencial que **ignora as 476 políticas de RLS**.

**Não há vazamento hoje. Há uma linha de distância dele.**

### 4.3 Risco 3 · Migrations aplicadas direto em produção — **ALTO**

**Evidência.** `supabase/config.toml` contém uma única linha:
`project_id = "prjoftmlkusbjoeptabp"`. Qualquer comando do CLI age sobre produção por
padrão.

**Impacto.** As 77 migrations foram aplicadas sem ensaio em ambiente equivalente. O
CLAUDE.md §6.3 compensa com disciplina — ensaiar com `BEGIN; … ROLLBACK;` — mas
`ROLLBACK` **não cobre DDL com efeito colateral** nem erros que só aparecem com volume
real de dados.

### 4.4 Risco 4 · Zero diferenciação de comportamento — **MÉDIO**

**Impacto.** Não há como marcar dado de teste, nem barrar envio de e-mail, nem
desligar uma integração em desenvolvimento. **Toda proteção depende de a pessoa
lembrar.** É a mesma classe de problema do `confirm()` e da escrita cega: o sistema
não avisa, a pessoa é que tem de saber.

### 4.5 Risco 5 · Sem `engines` no `package.json` — **BAIXO**

Node 20+ funciona e o ambiente atual roda v24. Com duas lockfiles (Achado 22), a
ausência de `engines` amplia a chance de divergência entre máquinas.

### 4.6 Quadro de riscos

| # | Risco | Impacto | Probabilidade | Severidade |
|---|---|---|---|---|
| 1 | Testes E2E contra produção | Perda ou alteração de dado real | Alta no primeiro teste de escrita | **Crítica** |
| 2 | `service_role` preenchida com prefixo `VITE_` | Exposição total do banco | Baixa hoje, crescente | **Alta** |
| 3 | Migrations sem ensaio equivalente | DDL irreversível em produção | Média | **Alta** |
| 4 | Sem diferenciação de ambiente | Impossível proteger por código | Certa (é o estado) | **Média** |
| 5 | Sem `engines` | Divergência entre máquinas | Baixa | **Baixa** |

---

## 5. Arquitetura recomendada

### 5.1 O princípio

**A separação que importa é a do banco.** Separar o front-end sem separar o Supabase
não resolve nada: o dado real continua a um `npm run dev` de distância.

### 5.2 Desenvolvimento

| | |
|---|---|
| **Banco** | Supabase **local** via CLI (Docker) — `supabase start` |
| **Dados** | Semente fictícia, gerada por script versionado |
| **Auth** | GoTrue local, usuários fictícios |
| **Storage** | Buckets locais, vazios |
| **Config** | `.env.local` — nunca versionado |
| **Custo** | **R$ 0** |

O Supabase CLI sobe Postgres, GoTrue, PostgREST e Storage em contêineres, aplicando as
77 migrations de `supabase/migrations/`. **É o mesmo schema, sem o dado de ninguém.**

### 5.3 Homologação

| | |
|---|---|
| **Banco** | Segundo projeto Supabase na nuvem |
| **Dados** | Semente fictícia, ou cópia **anonimizada** de produção |
| **Config** | Variáveis no *preview deployment* da Vercel |
| **Testes E2E** | **Apontam para cá, nunca para produção** |
| **Custo** | A confirmar no plano atual |

É onde a migration é ensaiada antes de produção e onde o Playwright pode escrever à
vontade.

> **Sobre copiar dados de produção.** Só com anonimização — telefone, endereço, e-mail
> e **observação pastoral**. A última é a mais sensível do sistema: é o que a pessoa
> contou em confiança. Copiar sem anonimizar transformaria homologação num segundo
> lugar a proteger. **Semente fictícia é mais simples e mais segura.**

### 5.4 Produção

| | |
|---|---|
| **Banco** | `prjoftmlkusbjoeptabp` — como hoje |
| **Config** | Variáveis no painel da Vercel |
| **Acesso** | Migration só depois de passar em homologação |
| **Backup** | **PITR ligado e restauração testada** — hoje não há registro de nenhum dos dois |

### 5.5 Quadro comparativo

| | Desenvolvimento | Homologação | Produção |
|---|---|---|---|
| Banco | Local (Docker) | Projeto 2 | Projeto 1 |
| Dado real | não | não | **sim** |
| E2E pode escrever | sim | sim | **não** |
| Migration ensaiada aqui | sim | sim | já validada |
| `service_role` | local, sem `VITE_` | nunca no cliente | nunca no cliente |
| Custo | R$ 0 | a confirmar | atual |

### 5.6 Se o orçamento não permitir o segundo projeto

**O plano não trava.** Desenvolvimento local resolve o risco principal — parar de
gravar em produção — com custo zero. Homologação vira **fase 2**, quando houver
orçamento. A ordem correta é local primeiro, nuvem depois; **nunca o contrário**.

---

## 6. Plano de implantação

### Fase 0 · Contenção imediata — *menos de 1 hora, custo zero*

Antes de qualquer ambiente novo, três ações que reduzem risco hoje:

1. **Renomear `VITE_SUPABASE_SERVICE_ROLE_KEY` para `SUPABASE_SERVICE_ROLE_KEY`** no
   `.env` e no `.env.example`, com comentário dizendo que é de servidor. Elimina o
   Risco 2 pela raiz: sem o prefixo `VITE_`, o Vite não a embute **mesmo que alguém a
   referencie**.
2. **Apontar o Playwright para uma URL explícita.** Trocar o `webServer` por
   `E2E_BASE_URL` obrigatório, sem cair em `localhost:8080` por padrão. Faz o teste
   **falhar** em vez de silenciosamente acertar produção.
3. **Declarar `engines.node`** no `package.json`.

### Fase 1 · Desenvolvimento local — *2 a 3 dias, custo zero*

1. Instalar o Supabase CLI e rodar `supabase start`.
2. Aplicar as 77 migrations no banco local e **confirmar que sobem limpas** — é a
   primeira vez que elas seriam validadas do zero. Pode revelar dependência de ordem.
3. Escrever `supabase/seed.sql` com dados fictícios: ~20 pessoas, 3 famílias, 2
   ministérios, 1 classe da EBD, 1 evento. **Nomes inventados.**
4. Criar `.env.local` apontando para `http://127.0.0.1:54321`.
5. **Documentar no README** — que hoje está vazio (Achado 23) — como subir o ambiente.

**Ao fim da fase 1, `npm run dev` deixa de tocar em produção.** É o objetivo do
Achado 01, atingido sem gastar nada.

### Fase 2 · Testes contra o local — *1 dia*

1. `E2E_BASE_URL` e credenciais apontando para o ambiente local.
2. Conta de teste criada pelo `seed.sql`, com o aceite de LGPD já registrado — o
   comentário em `sessao.setup.ts` avisa que o teste não aceita termos por você.
3. **A partir daqui os testes podem escrever.**

### Fase 3 · Homologação na nuvem — *3 a 4 dias, custo a confirmar*

1. Confirmar o custo do segundo projeto **antes de criar**.
2. Criar o projeto, aplicar as migrations, rodar o `seed.sql`.
3. Ligar às *preview deployments* da Vercel.
4. **Regra nova, e é ela que dá sentido à fase:** toda migration passa por homologação
   antes de produção. Sem essa disciplina, os bancos divergem e o ambiente vira ficção.

### Fase 4 · Blindar produção — *1 dia*

1. Confirmar o PITR e **testar uma restauração de verdade** — sobre homologação, nunca
   sobre produção. Backup nunca testado é suposição.
2. Registrar quem pode aplicar migration.
3. Rever o `config.toml`: com múltiplos projetos, o `project_id` fixo passa a ser
   armadilha.

### 6.1 Resumo do plano

| Fase | Duração | Custo | Risco que remove |
|---|---|---|---|
| 0 · Contenção | < 1 hora | R$ 0 | Riscos 2 e 5, e metade do 1 |
| 1 · Local | 2–3 dias | R$ 0 | **Risco 1 e a maior parte do Achado 01** |
| 2 · Testes | 1 dia | R$ 0 | Conclui o Risco 1 |
| 3 · Homologação | 3–4 dias | a confirmar | Risco 3 |
| 4 · Blindagem | 1 dia | R$ 0 | Ausência de backup verificado |
| **Total** | **7–9 dias** | **1 item pago** | — |

---

## 7. Conclusão

**O ambiente não está mal configurado — ele não existe.** É uma distinção com
consequência prática: não há nada a corrigir, há algo a construir, e por isso a
correção é um projeto de sete a nove dias e não um ajuste.

**A boa notícia é que o mais importante é grátis.** A fase 1 — Supabase local — elimina
o risco central do Achado 01 sem custo recorrente. O segundo projeto na nuvem resolve o
ensaio de migrations, que é real mas menor, e pode esperar orçamento.

**A ação de maior retorno por minuto está na fase 0:** remover o prefixo `VITE_` da
chave `service_role`. Leva um minuto e desarma a única falha deste relatório cujo
impacto seria irreversível — hoje ela está **preenchida e a uma linha de código de ir
para o navegador**.

---

*Levantamento por leitura de `.env`, `.env.example`, `.gitignore`, `package.json`,
`vite.config.ts`, `vercel.json`, `supabase/config.toml`, `playwright.config.ts`,
`e2e/sessao.setup.ts`, `src/integrations/supabase/client.ts` e dos 25 arquivos de
`dist/`. Nenhum arquivo, variável, banco ou permissão foi alterado.*
