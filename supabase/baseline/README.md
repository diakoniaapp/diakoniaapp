# supabase/baseline/

**`schema.sql` é a única cópia completa da estrutura do banco fora da produção.**

Gerado em **25/08/2026** a partir do projeto `prjoftmlkusbjoeptabp`.

---

## Por que este arquivo existe

As migrations do repositório **não reproduzem o schema**. Medido:

| | Produção | No repositório |
|---|---|---|
| Objetos | 1.645 | 582 — **35%** |
| Visto pelo CLI (`supabase/migrations/` apenas) | — | 309 — **19%** |

A primeira migration é de **29/04/2026** e cria 8 tabelas. As outras 135 vieram de
antes, pelo painel do Supabase, e nunca foram versionadas.

**Consequência:** `supabase db reset` não reconstruía o banco — falharia ao executar
`ALTER TABLE` sobre tabelas que nenhuma migration cria.

Este arquivo fecha essa lacuna. Detalhes em
[DATABASE_BASELINE_AUDIT.md](../../DATABASE_BASELINE_AUDIT.md).

---

## O que ele contém

| Bloco | Qtd. |
|---|---|
| 1 · Tipos enumerados | 114 |
| 2 · Sequências | 1 |
| 3 · Tabelas | 143 |
| 4 · Funções | 397 |
| 5 · Chaves primárias / unicidade / check / exclude | 143 / 42 / 87 / 1 |
| 6 · Chaves estrangeiras | 273 |
| 7 · Índices | 237 |
| 8 · Views | 30 |
| 9 · Gatilhos | 117 |
| 10 · RLS ligada + políticas | 143 + 439 |
| 11 · Concessões de execução | 1.966 |
| 12 · Buckets de storage | 10 |

**742 KB, 16.446 linhas.**

---

## A ordem dos blocos não é estética

**Funções vêm antes das políticas de propósito.** Cerca de 263 das 439 políticas
chamam `is_admin()` ou `has_any_role()`. Sem a função criada antes, o `CREATE POLICY`
falha com *"function is_admin() does not exist"*.

Foi essa dependência que definiu a ordem inteira do arquivo. Ao editá-lo, preserve-a.

---

## Como foi gerado

**Não por `pg_dump`** — ele exige Docker, indisponível no ambiente onde isto foi feito.

Foi gerado pelas próprias funções de geração de DDL do Postgres, lidas via API de
gerenciamento:

```
pg_get_functiondef · pg_get_viewdef · pg_get_triggerdef
pg_get_constraintdef · pg_indexes.indexdef · aclexplode
```

O script de geração está descrito em
[DATABASE_RECOVERY_EXECUTION.md](../../DATABASE_RECOVERY_EXECUTION.md).

---

## Como conferir se ele continua fiel

O arquivo é uma fotografia. Para saber se o banco mudou desde então, conte:

```sql
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE')            AS tabelas,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public')                                          AS funcoes,
  (SELECT count(*) FROM information_schema.views WHERE table_schema='public') AS views,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public')           AS politicas,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public')            AS indices;
```

**Esperado em 25/08/2026:** `143 · 397 · 30 · 439 · 423`

Divergiu? O banco andou. **Regere o baseline — não edite este arquivo à mão.**

---

## O que ele NÃO contém

- **Dados.** É estrutura. Nenhuma linha de nenhuma tabela, e nenhum arquivo de storage.
- **O schema `auth`.** Gerenciado pelo Supabase.
- **Configuração do Auth** — confirmação de e-mail, provedores. Vai em `config.toml`.
- **Extensões.** O Supabase as instala; se alguma faltar, `CREATE EXTENSION` antes.

---

## Duas coisas que ele reproduz e que são defeitos

O baseline é fiel ao banco real — inclusive onde o banco real está errado. **Ao usá-lo
para criar um ambiente novo, estes dois pontos vêm junto:**

**1 · Seis funções `SECURITY DEFINER` chamáveis sem login.** Quatro são legítimas
(convite e recuperação de senha, protegidas por token). Duas não deveriam estar ali:
`agenda_pastoral_proximos_dias` e a sobrecarga de 7 argumentos de
`sugerir_voluntarios_escala`. Ver [SECURITY_DEFINER_AUDIT.md](../../SECURITY_DEFINER_AUDIT.md).

**2 · Onze tabelas com RLS ligada e nenhuma política** — portanto inacessíveis:

```
bazar_reservas, documentos_fiscais, fin_solicitacoes,
pdv_caixa, pdv_estoque, pdv_fechamento, pdv_formas_pagamento,
pdv_itens_venda, pdv_pagamentos, pdv_produtos, pdv_vendas
```

As oito `pdv_*` são o módulo de ponto de venda modelado e nunca construído. As outras
três merecem investigação.

---

## Estado da verificação

| Fase | Situação |
|---|---|
| 1 · Baseline gerado e conferido por contagem | **concluída** |
| 2 · Funções — destinatários comparados por assinatura | **concluída** |
| 3 · RLS — texto, cláusula `TO` e PERMISSIVE/RESTRICTIVE | **concluída** |
| 4 · Validação estrutural do arquivo | **concluída** |
| 4b · Aplicar num banco limpo e comparar | **concluída — 9 de 9 dimensões idênticas** |
| 5 · Unificação das migrations | **pendente — exige decisão** |

**Este arquivo é uma reconstrução provada.** Em 25/08/2026 ele foi aplicado a um
Supabase local vazio e produziu 143 tabelas, 30 views, 397 funções, 117 gatilhos, 114
enums, 439 políticas, 423 índices e 273 chaves estrangeiras — idêntico a produção.

**A execução real encontrou três defeitos que a verificação estática não via**, os três
já corrigidos neste arquivo:

- **Bloco `8b`** — segunda passagem das funções. Nove delas consultam views e falhavam
  por ordem.
- **Bloco `11a`** — `REVOKE ... FROM PUBLIC`. Sem ele, **114 funções restritas em
  produção nasciam públicas**, incluindo `anonimizar_pessoa` e `arr_aprovar_reserva`.
  O Postgres concede `EXECUTE` a `PUBLIC` por padrão, e a ausência de um `REVOKE` é
  invisível num arquivo.
- **Bloco `11c`** — **504 privilégios de tabela**. Sem eles o banco é *inutilizável*:
  `anon`, `authenticated` e `service_role` ficavam com zero relações, e toda consulta
  levava `permission denied for table` — a RLS nem chegava a ser avaliada. Não apareceu
  no inventário de objetos porque **privilégio não é objeto**; só apareceu ao **usar**
  o banco.

Detalhes em [FASE4B_RECONSTRUCTION_VALIDATION.md](../../FASE4B_RECONSTRUCTION_VALIDATION.md)
e [WAVE1_VALIDATION_REPORT.md](../../WAVE1_VALIDATION_REPORT.md).

---

## Um pré-requisito de dado

O baseline é estrutura. Mas **um ambiente novo não aceita cadastro nenhum** sem a
igreja-âncora do mono-inquilino — `src/lib/igreja.ts` fixa o UUID como default de
coluna, e **11 tabelas têm chave estrangeira para `igrejas`**:

```sql
INSERT INTO public.igrejas (id, nome) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Quarta Igreja Batista do Rio de Janeiro');
```
