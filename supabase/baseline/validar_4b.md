# Fase 4b — reconstrução real, passo a passo

**O que esta fase prova:** que `schema.sql` recria o banco **do zero**, num Postgres
que nunca viu este projeto.

É a diferença entre *"contei os objetos e os números batem"* — já feito nas fases 1 a 4
— e *"apliquei num banco vazio e ficou igual a produção"*.

> **Nada aqui toca produção.** Todo o trabalho é num Postgres local, em contêiner.

---

## 0 · Instalar o Docker Desktop

Único passo que exige privilégio de administrador e por isso não foi automatizado.

- **https://docs.docker.com/desktop/install/windows-install/**
- Cerca de 2 GB. Reinício pode ser pedido.
- Ao terminar, **abra o Docker Desktop e espere ficar "Engine running"** — o CLI do
  Supabase falha se o motor não estiver de pé.

Conferir:

```bash
docker --version && docker ps
```

---

## 1 · Subir o Supabase local

```bash
npx supabase start
```

Na primeira vez baixa as imagens (~2 GB). Ao fim, imprime as URLs e as chaves locais.

**Se reclamar de `config.toml` incompleto:** o arquivo atual tem só `project_id`. Faça
uma cópia antes de deixar o CLI regravá-lo —

```bash
cp supabase/config.toml supabase/config.toml.bak && npx supabase init --force
```

— e depois confira que `project_id = "prjoftmlkusbjoeptabp"` continua lá.

---

## 1b · Preparar as extensões — levantado antes, para não descobrir no erro

O baseline foi analisado estaticamente. **Ele pressupõe três extensões** que um
Postgres recém-criado pode não ter:

```bash
docker exec -i $(docker ps --format "{{.Names}}" | grep supabase_db_) psql -U postgres -d postgres -c "CREATE EXTENSION IF NOT EXISTS btree_gist; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

| Extensão | Por que é necessária |
|---|---|
| `btree_gist` | A restrição `EXCLUDE USING gist` de `arr_reservas` — a que impede reserva dupla |
| `pg_trgm` | 4 índices `GIN` de busca textual |
| `pgcrypto` | `gen_random_uuid()` aparece em **133 defaults de coluna** |

### E uma dependência que decide o ambiente

**O baseline referencia o schema `auth` 484 vezes** — `auth.uid()` em 329 lugares,
`auth.role()` em 106 — e tem **36 chaves estrangeiras apontando para `auth.users`**.

**Consequência: ele não pode ser aplicado num Postgres comum.** Só num Supabase, que
traz `auth.users` e os papéis `anon`, `authenticated`, `service_role` e
`supabase_admin`.

Foi por isso que o Docker + `supabase start` é o caminho, e não um Postgres avulso.

---

## 2 · Aplicar o baseline

**Não use `supabase db reset`.** Ele aplicaria as 105 migrations, que é justamente o
que não reconstrói o schema. O baseline vai direto no banco:

```bash
docker exec -i $(docker ps --format "{{.Names}}" | grep supabase_db_) psql -U postgres -d postgres < supabase/baseline/schema.sql > /tmp/4b.log 2>&1; tail -30 /tmp/4b.log
```

**Leia o fim do log.** Qualquer linha `ERROR:` é um objeto que não foi criado — anote
qual e por quê antes de seguir.

### Erros esperados, e o que fazer

| Erro | Causa | O que fazer |
|---|---|---|
| `type "..." does not exist` numa extensão | Falta `btree_gist` (o `EXCLUDE` de `arr_reservas` usa) | `CREATE EXTENSION IF NOT EXISTS btree_gist;` e reaplicar |
| `role "anon" does not exist` | O Supabase local cria esses papéis; se faltar, o `start` não completou | Refazer o passo 1 |
| `schema "auth" does not exist` | Idem | Refazer o passo 1 |
| `permission denied for schema storage` | Normal — o bloco de buckets escreve em tabela do Supabase | Ignorar; buckets são configuração, não schema |

---

## 3 · Comparar com produção

```bash
node supabase/baseline/validar_4b.cjs
```

Compara nove dimensões contra os números medidos em 25/08/2026:

```
143 tabelas · 30 views · 397 funções · 117 gatilhos · 114 enums
439 políticas · 423 índices · 273 chaves estrangeiras · 143 com RLS
```

**Divergência de um objeto é falha.** O script diz qual.

---

## 4 · Se aprovar

Atualize a tabela em [README.md](./README.md) e em
[DATABASE_RECOVERY_EXECUTION.md](../../DATABASE_RECOVERY_EXECUTION.md): a linha
*"4b · Aplicar num banco limpo e comparar"* passa de **pendente** para **concluída**.

A partir daí o baseline deixa de ser cópia conferida e passa a ser **reconstrução
provada** — e a Fase 5 (unificação das migrations) pode ser decidida com segurança,
porque haverá prova de que o baseline sozinho basta.

---

## 5 · Depois de terminar

```bash
npx supabase stop
```

Para liberar os recursos. Os contêineres podem ser religados depois com `start`.

---

## Por que não bastava o teste com `ROLLBACK` em produção

Foi considerado e descartado. Aplicar o baseline num schema temporário do banco real,
dentro de uma transação que reverte, **provaria menos**: aquele schema herda os papéis
(`anon`, `authenticated`), as extensões e o schema `auth` que **já existem** ali.

Sala limpa é o ponto. Um Postgres que nunca viu este projeto é o único lugar onde a
ausência de uma extensão ou de um papel aparece — e é exatamente esse tipo de
dependência implícita que faz uma reconstrução falhar no dia em que ela for
necessária de verdade.
