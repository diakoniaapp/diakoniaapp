# FASE4B_RECONSTRUCTION_VALIDATION.md — DiakoniaApp

Validação da Fase 4b do [DATABASE_RECOVERY_PLAN.md](./DATABASE_RECOVERY_PLAN.md):
**o baseline reconstrói o banco em sala limpa?**

**Data:** 25/08/2026 · **Ambiente:** Supabase local, Docker Desktop 4.88.0, Postgres 17

---

# 1. Resultado: SIM — e o teste encontrou dois defeitos

**As nove dimensões do banco reconstruído batem exatamente com produção.**

| Objeto | Produção | Baseline | Reconstruído | Confere |
|---|---|---|---|---|
| Tabelas | 143 | 143 | **143** | ✅ |
| Views | 30 | 30 | **30** | ✅ |
| Funções | 397 | 397 | **397** | ✅ |
| Gatilhos | 117 | 117 | **117** | ✅ |
| Enums | 114 | 114 | **114** | ✅ |
| Políticas RLS | 439 | 439 | **439** | ✅ |
| Índices | 423 | 423 | **423** | ✅ |
| Chaves estrangeiras | 273 | 273 | **273** | ✅ |
| Tabelas com RLS ligada | 143 | 143 | **143** | ✅ |

**Mas o baseline que passou não é o que entrou no teste.** A execução real revelou
dois defeitos que **nenhuma verificação estática tinha visto** — um deles de segurança.
Ambos corrigidos, e o arquivo no repositório já é a versão corrigida.

---

# 2. Antes do baseline: a prova de que as migrations não reconstroem

Ao subir o ambiente, o `supabase start` aplicou automaticamente as 77 migrations de
`supabase/migrations/`. **Elas falharam:**

```
Applying migration 20260526120508_fluxo_visitantes.sql...
ERROR: column "numero_visitas" does not exist (SQLSTATE 42703)

CREATE OR REPLACE VIEW public.v_fluxo_visitantes AS
SELECT id, nome_completo,
       COALESCE(numero_visitas, 1) AS numero_visitas,
                ^
```

A migration referencia uma coluna que **nenhuma migration cria**. Ela veio do painel do
Supabase e nunca foi versionada.

**Isto confirma por execução o achado central do
[DATABASE_BASELINE_AUDIT.md](./DATABASE_BASELINE_AUDIT.md)**, que até aqui era uma
inferência de contagem: as migrations cobrem 35% dos objetos, e **param de funcionar na
18ª de 77**.

Para testar o baseline isoladamente, as migrations foram movidas para fora durante o
ensaio e **restauradas ao fim** — `git status` confirma que as 77 estão intactas.

---

# 3. Defeito 1 · Ordem — 9 funções não nasciam

## O que aconteceu

Na primeira execução, **388 das 397 funções** foram criadas. Nove falharam:

```
agenda_pastoral_mes          fin_alertas_centros        pgm_resumo_presenca
agenda_pastoral_proximos_dias fin_alertas_financeiros    resumo_painel_pastoral
assuntos_alertas             fn_pode_editar_obs_pastoral
assuntos_por_responsavel
```

Com estes erros:

```
ERROR: relation "public.vw_agenda_pastoral" does not exist
ERROR: relation "public.vw_assuntos_dashboard" does not exist
ERROR: relation "public.vw_fin_orcamento_vs_real" does not exist
ERROR: function public.fin_previsao_caixa() does not exist
ERROR: function has_any_role(uuid, app_role[]) does not exist
ERROR: column "r.data" must appear in the GROUP BY clause
```

## A dependência ausente

**Funções e views se referenciam mutuamente.** O baseline criava funções no bloco 4 e
views no bloco 8 — mas nove funções consultam views, e funções em linguagem SQL têm o
corpo **validado no momento da criação**.

O erro de `GROUP BY` em `pgm_resumo_presenca` era o mesmo problema com outra cara: sem
a view, o Postgres não resolvia as colunas e produzia uma mensagem enganosa.

## A correção mínima

**Bloco `8b` — segunda passagem das funções, depois das views.** Como todas são
`CREATE OR REPLACE`, repetir é idempotente e resolve qualquer referência antecipada.

É a solução padrão para dependência circular em restauração de schema, e torna o
baseline robusto a novas funções que consultem views.

---

# 4. Defeito 2 · Segurança — 114 funções nasciam públicas

## O que aconteceu

Com as 397 funções criadas, a contagem de objetos batia. Mas:

| | Produção | Reconstruído |
|---|---|---|
| Funções com `EXECUTE` para `PUBLIC` | **283** | **397** |

**114 funções que produção mantém restritas nasceriam acessíveis a qualquer um.** Entre
elas:

```
anonimizar_pessoa          — LGPD, apaga dado pessoal
arr_aprovar_reserva        — aprova reserva de espaço
assuntos_para_reuniao      — escreve em pauta de reunião
agenda_pastoral_mes        — agenda pastoral com telefones
buscar_estrutura_documento — documentos institucionais
```

## A dependência ausente

**O Postgres concede `EXECUTE` a `PUBLIC` por padrão ao criar uma função.** O baseline
tinha os 1.966 `GRANT` corretos — mas **nenhum `REVOKE`**. Conceder o que deve ser
concedido não remove o que veio de graça.

**Por que a verificação estática não viu:** ela comparou os `GRANT` do arquivo com os de
produção, e eles eram idênticos. **A ausência de um `REVOKE` é invisível num arquivo** —
só aparece quando o Postgres aplica seu padrão.

## A correção mínima

**Bloco `11a` — `REVOKE ALL ON FUNCTION … FROM PUBLIC` para as 397**, antes do bloco de
concessões. O `11b` então restaura `PUBLIC` nas 283 que devem tê-lo.

**Resultado após a correção: 283 de 283.** Idêntico.

---

# 5. Execução definitiva

Banco derrubado e recriado do zero, extensões habilitadas, baseline corrigido aplicado.

## 5.1 Erros registrados — 447, e todos explicados

| Erros | Causa | Consequência |
|---|---|---|
| **438** | `permission denied for language c` | **Nenhuma.** São funções em C das extensões `btree_gist` e `pg_trgm`, que **já existem** por `CREATE EXTENSION`. O `CREATE OR REPLACE` é recusado, e nada se perde |
| **6** | `relation vw_* does not exist` | **Nenhuma.** Primeira passagem; resolvidos pelo bloco `8b` |
| **2** | `function … does not exist` | **Nenhuma.** Idem |
| **1** | `column "r.data" must appear in GROUP BY` | **Nenhuma.** `pgm_resumo_presenca`, criada na segunda passagem |

**Nenhum objeto ficou faltando.** Os erros são ruído de primeira passagem e de
extensões — os 397 objetos de função existem no banco final.

## 5.2 Tarefa 12 — objetos críticos, verificados no banco reconstruído

| Verificação | Produção | Reconstruído | |
|---|---|---|---|
| **RPCs chamadas pelo frontend** | 80 | **80** | ✅ |
| `is_admin()` | definer + `search_path` | **definer + `search_path=public`** | ✅ |
| `is_admin_or_any()` | idem | **idem** | ✅ |
| `is_lider_ou_superior()` | idem | **idem** | ✅ |
| `is_operador_ou_superior()` | idem | **idem** | ✅ |
| Políticas `PERMISSIVE` | 418 | **418** | ✅ |
| **Políticas `RESTRICTIVE`** | 21 | **21** | ✅ |
| **Grants a `PUBLIC`** | 283 | **283** | ✅ |
| **Constraint `EXCLUDE`** | `arr_reservas_sem_conflito` | **presente** | ✅ |

## 5.3 Comparação de grants, assinatura por assinatura

| | |
|---|---|
| Assinaturas comparadas | 397 |
| Ausentes | **0** |
| Divergentes | 219 |
| **Destas, funções da aplicação** | **0** |
| Destas, internas de extensão | **219** |

As 219 são `cash_dist`, `date_dist`, `gbt_bit_compress` e similares — internas do
`btree_gist` e do `pg_trgm`. Em produção elas herdaram uma concessão ampla aplicada em
algum momento a todas as funções do schema; no ambiente novo têm o padrão da extensão.

**Nenhuma função da aplicação diverge.**

---

# 6. Um obstáculo de ambiente, e a solução

O `supabase start` falhou na primeira tentativa:

```
ports are not available: exposing port TCP 0.0.0.0:54322
bind: An attempt was made to access a socket in a way forbidden by its access permissions
```

A mensagem sugere falta de permissão. **Não era.** O Windows reserva faixas de porta
para o Hyper-V:

```
netsh interface ipv4 show excludedportrange protocol=tcp
→ 53935-54334 excluída
```

**As portas padrão do Supabase — 54321 a 54327 — caem inteiras dentro dessa faixa.**
Nada estava escutando nelas; o Windows apenas as reservou.

**Solução:** `supabase/config.toml` passou a fixar as portas em 55321+, fora de todas as
faixas excluídas. O arquivo original está em `supabase/config.toml.bak`. **A mudança
afeta apenas o ambiente local** — não tem relação com produção.

---

# 7. Tarefa 13 — respostas explícitas

## 7.1 O banco é reproduzível?

**Sim. Provado por execução.**

Um Postgres que nunca viu este projeto, com as três extensões habilitadas, recebeu o
baseline e terminou com **as nove dimensões idênticas a produção**.

## 7.2 O baseline é suficiente?

**Sim, sobre um substrato Supabase.** Ele reconstrói o schema `public` por completo,
mas **não cria** — e não deve criar:

- as 3 extensões (`pgcrypto`, `pg_trgm`, `btree_gist`);
- os 5 papéis (`anon`, `authenticated`, `service_role`, `postgres`, `supabase_admin`);
- o schema `auth` e a tabela `auth.users`, alvo de **36 chaves estrangeiras**.

**Um Postgres comum não serve.** Um Supabase, sim — e é uma linha de comando de
diferença.

## 7.3 O ambiente reconstruído é equivalente à produção?

**Sim, para tudo que é da aplicação.**

| Camada | Equivalência |
|---|---|
| Estrutura (9 dimensões) | **100%** |
| Grants de funções da aplicação | **100%** |
| Políticas RLS, texto e modo | **100%** |
| Grants de funções internas de extensão | divergem em 219 — **irrelevante para a aplicação** |
| Dados | **0% — proposital.** O baseline é estrutura |

## 7.4 O que ainda impede uma reconstrução completa?

**Para o schema: nada.** Está provado.

O que permanece em aberto é de outra natureza:

| Item | Situação |
|---|---|
| **Dados** | O baseline não os traz, por desenho. Restauração de dado depende de backup — que continua **sem política documentada nem teste** |
| **Fase 5 — unificação das migrations** | Agora **pode ser decidida com prova**: o baseline sozinho basta, então arquivar as 105 migrations deixou de ser aposta |
| **Configuração do Auth** | Confirmação de e-mail, provedores. Vive em `config.toml`, não no schema |

---

# 8. Tarefa 14 — equivalência, próximos passos e riscos

## 8.1 Percentual de equivalência

**100% dos objetos da aplicação.**

```
143 tabelas · 30 views · 397 funções · 117 gatilhos · 114 enums
439 políticas · 423 índices · 273 chaves estrangeiras · 143 com RLS
80 de 80 RPCs · 283 de 283 grants públicos · 21 de 21 políticas RESTRICTIVE
```

Divergência total: **219 grants em funções internas de extensão**, nenhuma da aplicação.

## 8.2 Próximos passos recomendados

1. **Decidir a Fase 5.** A prova existe: o baseline reconstrói sozinho. Arquivar as 105
   migrations e adotá-lo como ponto de partida torna `supabase db reset` confiável.
2. **Usar o ambiente local para validar a Onda 1.** Ele está de pé. As 13 correções de
   escrita nunca foram exercitadas contra banco — falta criar os 3 usuários de teste e
   a semente descritos no
   [HOMOLOGATION_IMPLEMENTATION_PLAN.md](./HOMOLOGATION_IMPLEMENTATION_PLAN.md).
3. **Fechar as duas funções públicas indevidas** — `agenda_pastoral_proximos_dias` e a
   sobrecarga de 7 argumentos de `sugerir_voluntarios_escala`. Agora há onde testar o
   `REVOKE` antes de aplicá-lo em produção.
4. **Regerar o baseline periodicamente.** Ele é uma fotografia de 25/08/2026.

## 8.3 Riscos remanescentes

| Risco | Gravidade | Observação |
|---|---|---|
| **Sem backup de dados verificado** | **Alta** | A estrutura está provada; o conteúdo, não. São 294 pessoas |
| **O baseline envelhece em silêncio** | Média | Nada avisa quando produção diverge. O `README.md` traz a consulta de conferência |
| **As 105 migrations continuam quebradas** | Média | Comprovado: falham na 18ª. Enquanto não forem arquivadas, alguém pode tentar usá-las |
| **Extensões precisam ser habilitadas antes** | Baixa | Documentado no runbook e neste relatório |

---

# 9. Conclusão

**A Fase 4b respondeu à sua pergunta: sim, o baseline reconstrói o banco.**

E fez mais do que confirmar — **encontrou dois defeitos que quatro rodadas de
verificação estática deixaram passar**, um deles de segurança, com 114 funções que
nasceriam públicas.

Isso não desmerece a verificação estática: ela achou o índice `EXCLUDE` ausente e as
283 concessões malformadas. **São camadas diferentes.** A contagem pega o que falta; a
comparação de texto pega o que mudou; **só a execução pega o que o banco faz por conta
própria** — como conceder `PUBLIC` a toda função nova.

**Produção deixou de ser a única cópia do schema.** Agora existe um arquivo versionado,
conferido em nove dimensões e **provado por reconstrução** — e a diferença entre *cópia
conferida* e *reconstrução provada*, que estas fases existiam para eliminar, deixou de
existir.

---

*Reconstrução executada em Supabase local (Docker 29.7.2, Postgres 17), a partir de
`supabase/baseline/schema.sql`. Nenhum DDL foi executado em produção — todas as
consultas ao banco produtivo foram de leitura do catálogo. As 77 migrations foram
movidas durante o ensaio e restauradas intactas. Nenhum código de aplicação foi
alterado.*
