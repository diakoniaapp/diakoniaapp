# DATABASE_RECOVERY_EXECUTION.md — DiakoniaApp

Relatório de execução do [DATABASE_RECOVERY_PLAN.md](./DATABASE_RECOVERY_PLAN.md).

**Data:** 25/08/2026

---

## 1. Resultado

| Fase | Situação | Observação |
|---|---|---|
| **1 · Baseline estrutural** | **✅ concluída** | 742 KB, 16.446 linhas, conferido por contagem |
| **2 · Funções** | **✅ concluída** | 397 funções · **conjunto de destinatários comparado por assinatura** |
| **3 · RLS** | **✅ concluída** | 439 políticas · texto, `TO` e `PERMISSIVE` conferidos |
| **4 · Validação estrutural** | **✅ concluída** | Delimitadores, ordem de dependência, identificadores |
| **4b · Validação em banco limpo** | **⛔ bloqueada** | Exige Docker — indisponível neste ambiente |
| **5 · Unificação das migrations** | **⏸️ suspensa** | **O plano estava errado neste ponto** — ver §5 |

**O objetivo declarado foi atingido: produção deixou de ser a única cópia do schema.**

**Arquivos criados** — nenhum arquivo existente foi alterado:

```
supabase/baseline/schema.sql     742 KB · 16.446 linhas
supabase/baseline/README.md
DATABASE_RECOVERY_EXECUTION.md   este arquivo
```

---

## 2. Fase 1 · Baseline estrutural

### O caminho previsto não funcionou

O plano previa `npx supabase db dump`. **O comando exige Docker Desktop**, que não está
instalado:

```
{"_tag":"Error","error":{"code":"LegacyDockerRunError",
 "message":"failed to run docker. Docker Desktop is a prerequisite..."}}
```

### O caminho usado

O DDL foi gerado pelas **próprias funções de geração do Postgres**, lidas pela API de
gerenciamento — que é o mesmo mecanismo que o `pg_dump` usa por dentro:

| Objeto | Função usada |
|---|---|
| Funções | `pg_get_functiondef(oid)` |
| Views | `pg_get_viewdef(oid, true)` |
| Gatilhos | `pg_get_triggerdef(oid)` |
| Chaves e restrições | `pg_get_constraintdef(oid)` |
| Índices | `pg_indexes.indexdef` |
| Concessões | `aclexplode(proacl)` |
| Tabelas e enums | `information_schema` + `pg_catalog`, montados |

**É equivalente em fidelidade** para estrutura. A diferença está no que não foi
coberto — ver §6.

### Conferência por contagem — o passo que o plano chamou de crítico

| Objeto | Baseline | Produção | Confere |
|---|---|---|---|
| Enums | 114 | 114 | ✅ |
| Tabelas | 143 | 143 | ✅ |
| Funções | 397 | 397 | ✅ |
| Views | 30 | 30 | ✅ |
| Gatilhos | 117 | 117 | ✅ |
| Políticas | 439 | 439 | ✅ |
| Sequências | 1 | 1 | ✅ |
| Chaves estrangeiras | 273 | 273 | ✅ |
| Índices | 423 | 423 | ✅ |

### A conferência encontrou dois defeitos reais

**Defeito 1 · Um índice ausente.** A primeira geração produziu 422 índices, não 423. O
ausente era **`arr_reservas_sem_conflito`** — uma restrição `EXCLUDE USING gist
(espaco_id WITH =, periodo WITH &&)`.

Ela caiu entre dois filtros meus: excluída da consulta de índices por ser respaldada
por restrição, e da consulta de restrições por ter `contype = 'x'`, fora do meu
`IN ('p','u','f','c')`.

**Por que importa:** é o objeto que **impede reserva dupla do mesmo espaço no mesmo
período** — o mecanismo de conflito por `tsrange` descrito no CLAUDE.md §5.5. Um banco
reconstruído sem ela aceitaria dupla reserva silenciosamente.

**Defeito 2 · 283 concessões malformadas.** A primeira geração renderizou as
concessões a `PUBLIC` como `TO "-"`, porque `grantee::regrole::text` converte o OID 0
em `-`. **As 283 instruções falhariam ao executar** — não existe papel chamado `-`.

Eram exatamente as concessões que mais importam: as que separam função pública de
restrita.

**Ambos corrigidos e reconferidos.**

> Se a conferência por contagem não existisse, o baseline teria sido aceito com um
> mecanismo de integridade a menos e 283 instruções quebradas — **parecendo pronto**.
> Era o risco que o plano classificou como o mais grave da Fase 1.

---

## 3. Fase 2 · Funções

### A primeira verificação tinha um ponto cego

A primeira passagem **contava** as instruções `GRANT` e passou — num arquivo que
tinha 283 delas inválidas (`TO "-"`). Contar não bastava.

A verificação foi refeita comparando, **por assinatura, o conjunto exato de
destinatários** contra o catálogo de produção.

| Verificação | Resultado |
|---|---|
| Funções no baseline | **397** de 397 |
| Assinaturas com concessão | **397** de 397 |
| **Conjuntos de destinatários divergentes** | **0** |
| Destinatários inválidos | **0** — só `PUBLIC`, `anon`, `authenticated`, `postgres`, `service_role`, `supabase_admin` |
| `SECURITY DEFINER` | **143** de 143 |
| Definer **sem** `SET search_path` | **0** — o vetor clássico de escalada não entrou |
| As 38 funções críticas ausentes do repositório | **todas presentes** |
| Sobrecargas preservadas | 1 — `sugerir_voluntarios_escala` (2 assinaturas) |

### As 6 funções chamáveis sem login, conferidas uma a uma

```
aceitar_convite · agenda_pastoral_proximos_dias · redefinir_senha
solicitar_reset_senha · sugerir_voluntarios_escala · validar_convite
```

**Todas mantêm a concessão a `PUBLIC` no baseline.** Quatro são legítimas (fluxo
pré-login, protegido por token); duas são o defeito apontado no
[SECURITY_DEFINER_AUDIT.md](./SECURITY_DEFINER_AUDIT.md).

**O baseline é fiel ao banco real, inclusive onde ele está errado.** Isso é o
comportamento correto para um baseline — corrigir é outra tarefa, com outro registro.

### O fluxo de acesso foi recuperado

Estas cinco funções **não existiam em lugar nenhum do repositório** e agora estão no
baseline:

```
aceitar_convite · validar_convite · criar_convite_acesso
redefinir_senha · solicitar_reset_senha
```

Sem elas, um banco reconstruído não teria como convidar ninguém nem recuperar senha.

### E as quatro primitivas de guarda

```
is_admin · is_admin_or_any · is_lider_ou_superior · is_operador_ou_superior
```

Eram a dependência que bloqueava tudo — 263 políticas as chamam. Estão no baseline,
com `SET search_path TO 'public'` e suas concessões.

---

## 4. Fase 3 · RLS

A primeira passagem conferiu `USING`, `WITH CHECK` e o comando — mas **não conferiu a
cláusula `TO` nem o modo `PERMISSIVE`/`RESTRICTIVE`**, que é o mesmo ponto cego da
Fase 2. Foi refeita.

| Verificação | Resultado |
|---|---|
| Políticas no baseline | **439** de 439 |
| **Texto de `USING` e `WITH CHECK`** | **439 conferem exatamente** |
| **Cláusula `TO` (quais papéis a política alcança)** | **439 conferem** |
| **`PERMISSIVE` / `RESTRICTIVE`** | **418 / 21 — idêntico a produção** |
| Comando (`SELECT`/`INSERT`/…) | ✅ em todas |
| Políticas só com `WITH CHECK` (sem `USING`) | 70 — tratadas corretamente |
| `ENABLE ROW LEVEL SECURITY` | 143 de 143 tabelas |
| Tabelas de acesso e LGPD | `profiles` 9 · `user_roles` 7 · `role_permissoes` 3 · `consentimento` 5 · `solicitacoes_lgpd` 4 · `convites_acesso` 1 — **todas presentes** |

### Por que `PERMISSIVE` × `RESTRICTIVE` merecia verificação própria

**Políticas `PERMISSIVE` somam com OR; `RESTRICTIVE` combinam com AND.** Trocar um
pelo outro inverte a lógica de autorização da tabela inteira.

O sistema usa **21 políticas `RESTRICTIVE`** — as `Bloqueia anon`, com `USING false`.
São elas que barram o acesso anônimo. **Se o baseline as tivesse convertido em
`PERMISSIVE`, elas deixariam de barrar e passariam a não fazer nada** — abrindo 21
tabelas ao acesso não autenticado, sem erro nenhum.

As 21 vieram como `RESTRICTIVE`.

### Achado: 11 tabelas com RLS ligada e nenhuma política

```
bazar_reservas · documentos_fiscais · fin_solicitacoes
pdv_caixa · pdv_estoque · pdv_fechamento · pdv_formas_pagamento
pdv_itens_venda · pdv_pagamentos · pdv_produtos · pdv_vendas
```

**Estas tabelas são inacessíveis em produção hoje** — RLS ligada sem política permissiva
significa que ninguém lê nem escreve.

As oito `pdv_*` confirmam o Achado 18 por outro ângulo: o módulo de ponto de venda não
está apenas *sem uso*, está **inutilizável**. As outras três — `bazar_reservas`,
`documentos_fiscais`, `fin_solicitacoes` — merecem investigação: podem ser tabelas
esquecidas, ou telas que falham em silêncio.

**O baseline reproduz esse estado fielmente.** Não foi corrigido — corrigir não era o
escopo.

---

## 5. Fase 5 · Suspensa, porque o plano estava errado

### O que o plano mandava

> *"Renomear o baseline para `supabase/migrations/00000000000000_baseline.sql`"*

### Por que não foi feito

**Isso quebraria a cadeia de migrations.** Verificado no código:

```sql
-- supabase/migrations/20260429013015_....sql, primeira migration
CREATE TABLE public.profiles      -- sem IF NOT EXISTS
CREATE TYPE public.app_role       -- falha se o tipo ja existe
```

O baseline representa o estado **de 25/08/2026 — depois das 105 migrations**. Se ele
rodasse primeiro, a primeira migration tentaria criar `profiles` e `app_role` que já
existiriam, e **falharia na hora**.

**O baseline não precede as migrations. Ele as resume.**

### A decisão que isso exige

| Opção | O que fazer | Ganho | Custo |
|---|---|---|---|
| **A · Squash** | Arquivar as 105 migrations em `_archive/`; o baseline vira a única migration inicial, carimbada `20260825` | `supabase db reset` volta a funcionar; CLI enxerga 100% | Perde-se o histórico incremental como cadeia executável (fica como registro) |
| **B · Manter separado** | Baseline fica em `supabase/baseline/`, documentado como ponto de partida | Zero risco; nada se move | O CLI continua enxergando 19%; `db reset` continua quebrado |

**Recomendação: A**, mas **é decisão sua** — arquivar 105 arquivos muda como o projeto
trata seu próprio histórico, e o benefício (um `db reset` funcional) só se realiza
quando houver ambiente local, que depende de Docker.

**Enquanto não houver decisão, a opção B está em vigor de fato**, e ela já entrega o
essencial: a estrutura está versionada.

### Os outros passos da Fase 5, e o que descobri

**As 28 migrations de `sql/migrations/`** precisariam ser renomeadas com carimbo de
tempo completo — hoje têm só o dia (`20260610_`), e há **13 arquivos do mesmo dia**. A
ordem entre eles teria de ser decidida por leitura, não por nome.

**Os 3 arquivos de `sql/` raiz** definem `reset_user_password`, `get_user_email` e
`registrar_audit_log` — que existem em produção e em nenhuma migration. **As três já
estão no baseline**, então esses arquivos passaram a ser redundantes.

**Apagar `sql/` não foi feito** e não deve ser feito antes da decisão acima.

---

## 6. O que continua pendente

### 6.1 Validação em banco limpo — a que prova o trabalho

**Bloqueada por falta de Docker.** É a diferença entre:

- *"contei os objetos e os números batem"* — **feito**
- *"apliquei num banco vazio e ele ficou igual a produção"* — **não feito**

Para executar quando houver Docker:

```bash
npx supabase start
psql "$LOCAL_DB_URL" -f supabase/baseline/schema.sql
```

Depois, rodar a mesma contagem do README do baseline e comparar com
`143 · 397 · 30 · 439 · 423`.

**Só então o baseline deixa de ser uma cópia conferida e passa a ser uma reconstrução
provada.**

### 6.2 O que o baseline não cobre

| Item | Situação |
|---|---|
| Dados | Fora de escopo — é estrutura |
| Schema `auth` | Gerenciado pelo Supabase |
| Configuração do Auth | Vai em `config.toml`, não no schema |
| Extensões | O Supabase as instala; `CREATE EXTENSION` pode ser necessário |
| Arquivos de storage | Só a configuração dos 10 buckets, sem conteúdo |

---

## 7. O que mudou na prática

**Antes:** o banco de produção era a única cópia completa do schema. Sem backup
documentado, sem restauração testada, e com desenvolvimento gravando nele.

**Agora:** existe um arquivo de 742 KB no repositório que descreve os 1.645 objetos,
conferido contra o catálogo em nove dimensões, com a ordem de dependência resolvida.

**O que ainda não mudou:** ele nunca foi executado. Enquanto a Fase 4b não rodar, a
garantia é de fidelidade, não de reconstrução.

**A ação de maior valor pendente é instalar Docker e rodar a Fase 4b** — meia hora de
trabalho que converte "temos uma cópia" em "sabemos que ela funciona".

---

*Execução das fases 1 a 4 do DATABASE_RECOVERY_PLAN.md. Nenhum arquivo existente,
migration, política, dado ou documentação foi alterado. Os arquivos criados estão
listados na §1.*
