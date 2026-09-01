# DATABASE_RECOVERY_PLAN.md — DiakoniaApp

Plano de recuperação do conhecimento do banco: **tirar produção da condição de fonte
única de verdade.**

Derivado do [DATABASE_BASELINE_AUDIT.md](./DATABASE_BASELINE_AUDIT.md), que mediu:
**1.063 dos 1.645 objetos (65%) não têm definição em lugar nenhum do repositório.**

> **Nada foi alterado.** Este documento planeja; não executa.

---

# 1. A dependência que decide tudo

Antes do plano, o achado que define sua ordem:

```
is_admin() · is_admin_or_any() · is_lider_ou_superior() · is_operador_ou_superior()
```

**As quatro primitivas de guarda estão ausentes do repositório.** São elas que as
políticas de RLS chamam para decidir autorização — cerca de **263 das 422 políticas**
dependem de `is_admin()` ou de `has_any_role()`.

**A consequência é dura:** num banco reconstruído a partir do repositório, não seria
possível **nem sequer criar** a maioria das políticas — o `CREATE POLICY` falharia com
"function is_admin() does not exist".

Isto responde de antemão à pergunta da §6: **não existe caminho de reconstrução parcial
que comece pelas tabelas.** A recuperação tem de começar pelas funções, ou por um dump
que traga tudo junto.

---

# 2. Inventário do que falta, classificado

## 2.1 Quadro geral

| Tipo | Crítico | Alto | Médio | Baixo | **Total ausente** | Em produção |
|---|---|---|---|---|---|---|
| Tabelas | 37 | 1 | 17 | 12 | **67** | 143 |
| Funções | 38 | 30 | 239 | 5 | **312** | 396 |
| Views | 4 | 0 | 0 | 14 | **18** | 30 |
| Gatilhos | 3 | 50 | 17 | 0 | **70** | 117 |
| Enums | 0 | 12 | 8 | 0 | **20** | 114 |
| Políticas | 181 | 0 | 84 | 1 | **266** | 422 |
| Índices | 0 | 0 | 0 | 310 | **310** | 423 |
| **TOTAL** | **263** | **93** | **365** | **342** | **1063** | **1.645** |

## 2.2 Critérios de classificação

**Crítico** — objeto usado pelo frontend, por RPC, pela autenticação, pela LGPD ou pelo
financeiro. Sem ele o sistema **não funciona**.

**Alto** — sustenta o funcionamento sem ser chamado diretamente: gatilhos que mantêm
derivados, enums de que colunas dependem, políticas de tabelas financeiras.

**Médio** — objeto de módulo em uso, sem referência direta encontrada.

**Baixo** — índices (desempenho, não funcionamento) e módulos dormentes: as 8 tabelas
`pdv_*`, `permissoes_modulo` e as 4 funções `fn_*` do modelo de permissão morto.

## 2.3 Os 263 objetos críticos

### Funções — 38

**As quatro primitivas de guarda** (bloqueiam tudo, ver §1):
```
is_admin, is_admin_or_any, is_lider_ou_superior, is_operador_ou_superior
```

**O fluxo de acesso inteiro** — sem elas ninguém entra no sistema reconstruído:
```
aceitar_convite, validar_convite, criar_convite_acesso,
redefinir_senha, solicitar_reset_senha, fn_listar_acessos_sistema
```

**LGPD e auditoria:**
```
anonimizar_pessoa, solicitar_lgpd, fn_auditoria_exclusao, registrar_exportacao
```

**Financeiro e fiscal — 15 relatórios executivos:**
```
fin_exec_alertas, fin_exec_centros_ano, fin_exec_fluxo_12m,
fin_exec_indicadores_eclesiasticos, fin_exec_saldo_consolidado,
fiscal_criar_lancamento, fiscal_documentos_mes, fiscal_inconsistencias,
fiscal_insights, fiscal_marcar_atrasados, fiscal_resumo_dashboard,
fiscal_resumo_malote, montar_pauta_financeira, arr_aprovar_reserva,
arr_problemas_resumo
```

**Demais chamadas por `.rpc()`:**
```
arr_produtos_vendaveis, assuntos_meus_resumo, assuntos_urgentes_igreja, buscar_instituicao_similar, buscar_modelo_ministerio, excluir_importacao, gerar_notificacoes_campanha, sugerir_identidade_por_tag, verifica_conflito_ocupacao
```

### Tabelas — 37

```
arr_acordo_template, arr_caixa_operadores, arr_caixas, arr_checklist_template, arr_espacos, arr_estoque_movimentos, arr_itens_venda, arr_movimentos, arr_problemas_manutencao, arr_produtos, arr_reserva_checklist, arr_reservas, arr_vendas, campanha_materiais, campanhas, convites_acesso, documento_estrutura, documentos, documentos_historico, escala_voluntarios, exportacoes_log, fin_decisoes_reuniao, fin_reunioes_financeiras, fiscal_agenda, fiscal_config, fiscal_documentos, fiscal_obrigacoes_ativas, fiscal_tipos_obrigacao, identidade_igreja, identidade_valores, igreja_instituicoes, importacoes_membros, instituicoes, log_exclusoes, perfil_servico, secoes_documento, solicitacoes_lgpd
```

**`convites_acesso` e `solicitacoes_lgpd` merecem destaque**: a primeira é a base do
único caminho de entrada de usuários; a segunda guarda os pedidos de titular sob a
LGPD, com prazo legal de resposta.

### Políticas de RLS — 181

O maior grupo. São políticas de tabelas que o frontend usa — `membros`, `familias`,
`escalas`, `eventos`, `documentos`, `perfil_servico` — e de tabelas de acesso e LGPD.

**A RLS é a totalidade da segurança do sistema** (AD-1). Um banco reconstruído sem
elas teria tabelas com RLS ligada e sem política — inacessíveis — ou receberia
políticas improvisadas, provavelmente mais permissivas que as originais. **É a pior
forma de errar aqui.**

### Views — 4

```
arr_caixa_resumo, v_importacoes_resumo, v_solicitacoes_lgpd, v_voluntarios_completo
```

### Gatilhos — 3

```
trg_sync_acesso_sistema_delete, trg_sync_acesso_sistema_insert, trg_updated_at_profiles
```

Sincronizam `acesso_sistema` e mantêm `updated_at` em `profiles`.

## 2.4 Os 93 de prioridade alta

| Tipo | Qtd. | O que são |
|---|---|---|
| Gatilhos | 50 | Mantêm derivados de tabelas em uso — carga de voluntário, contadores, histórico. **Sem eles o banco aceita escrita e para de se manter coerente**, e o defeito aparece semanas depois |
| Funções | 30 | Corpos de gatilho |
| Enums | 12 | arr_caixa_estado, arr_checklist_tipo, arr_estoque_mov_tipo, arr_forma_pgto, arr_mov_tipo, arr_produto_categoria… — colunas dependem deles; sem o tipo, a coluna não existe |
| Tabela | 1 | Financeiro sem referência direta |

---

# 3. Plano de recuperação

## A decisão que atravessa as cinco fases

**A recuperação é por dump, não por reconstrução manual.**

Reconstruir 1.063 objetos à mão — decidindo colunas, tipos, ordem de dependência e
texto de política — levaria semanas e produziria um banco *parecido*, não *igual*. Um
dump estrutural traz os 1.645 objetos em minutos, exatos.

**As fases 2 e 3 abaixo não reconstroem: elas conferem.** É a diferença entre "espero
que tenha vindo" e "contei e veio".

---

## Fase 1 · Baseline estrutural

**Objetivo:** ter, no repositório, um arquivo que recria o schema inteiro.

| | |
|---|---|
| **Esforço** | **1 dia** |
| **Risco** | **Médio** — o dump pode vir incompleto e parecer pronto |
| **Dependências** | Nenhuma. **Pode começar hoje** |

**Passos**

1. `npx supabase login`
2. `npx supabase db dump --project-ref prjoftmlkusbjoeptabp --schema public -f supabase/baseline/schema.sql`
3. Dump separado da configuração dos 10 buckets (`storage.buckets`) — **não vem no dump de `public`**
4. **Conferir por contagem antes de aceitar** — os números são conhecidos:

```
143 tabelas · 396 funções · 30 views · 117 gatilhos
114 enums · 422 políticas · 423 índices
```

5. Conferir que os `GRANT EXECUTE` vieram — o
   [SECURITY_DEFINER_AUDIT.md](./SECURITY_DEFINER_AUDIT.md) mostrou que as 143 funções
   definer têm ACL explícita, e **nenhum `GRANT` aparece hoje no repositório**
6. Versionar `supabase/baseline/` com um README explicando **por que existe**

**Critério de conclusão:** os sete números batem. **Se não baterem, o dump está
incompleto — e um dump incompleto é pior que nenhum, porque parece pronto.**

---

## Fase 2 · Funções

**Objetivo:** confirmar que as 396 funções vieram e estão íntegras.

| | |
|---|---|
| **Esforço** | **meio dia** |
| **Risco** | **Baixo** |
| **Dependências** | Fase 1 |

**Passos**

1. Contar `CREATE FUNCTION` no dump: esperado **396**
2. **Conferir nominalmente as 38 críticas** da §2.3 — especialmente as quatro
   primitivas de guarda e as seis do fluxo de acesso
3. Conferir que as `SECURITY DEFINER` mantiveram o `SET search_path` — as 143 têm hoje,
   e é o que impede uma classe inteira de escalada de privilégio
4. Conferir que os `GRANT EXECUTE` acompanham cada função

**Por que é fase própria:** o item 3 e o item 4 são invisíveis numa contagem. Uma
função pode vir sem `search_path` ou sem o `REVOKE` de `PUBLIC` e parecer correta.

---

## Fase 3 · RLS

**Objetivo:** confirmar as 422 políticas, **e que dizem a mesma coisa**.

| | |
|---|---|
| **Esforço** | **1 dia** |
| **Risco** | **Alto** — é a segurança inteira do sistema |
| **Dependências** | Fases 1 e 2 (política referencia função) |

**Passos**

1. Contar `CREATE POLICY` no dump: esperado **422**
2. **Comparar o texto de cada política**, não só o nome. Extrair `qual` e `with_check`
   dos dois bancos e conferir igualdade
3. Conferir que as 143 tabelas têm RLS **ligada** — hoje são 143 de 143, sem exceção
4. **Conferir tabela com RLS ligada e zero políticas** — seria inacessível, e é o modo
   mais provável de o dump falhar em silêncio

**Cuidado documentado.** Políticas permissivas **se somam com OR** (ARCHITECTURE.md
§4.4). Comparar uma política isolada leva à conclusão errada: **a comparação tem de ser
do conjunto por tabela e comando.**

---

## Fase 4 · Validação

**Objetivo:** provar que o repositório reconstrói o banco. **É a única fase que
responde à pergunta deste plano.**

| | |
|---|---|
| **Esforço** | **1 dia** |
| **Risco** | **Baixo** — roda em ambiente local, descartável |
| **Dependências** | Fases 1 a 3 |

**Passos**

1. `npx supabase start` num ambiente local limpo
2. Aplicar **só** o baseline
3. Rodar o mesmo inventário do DATABASE_BASELINE_AUDIT.md contra o banco local
4. **Comparar os sete números com produção. Diferença de um objeto é falha.**
5. Aplicar as 105 migrations por cima e **registrar quais falham** — primeira vez que
   serão exercitadas em sequência
6. Subir a aplicação contra o banco local e percorrer os fluxos críticos: **entrar,
   criar convite, aceitar convite, recuperar senha** — os que dependem das funções
   ausentes

**Critério de conclusão:** o inventário local é idêntico ao de produção, e o fluxo de
acesso funciona ponta a ponta.

---

## Fase 5 · Unificação das migrations

**Objetivo:** uma história, não duas.

| | |
|---|---|
| **Esforço** | **1 dia** |
| **Risco** | **Médio** — mexe na ordem de aplicação |
| **Dependências** | Fase 4 aprovada |

**Passos**

1. Renomear o baseline para `supabase/migrations/00000000000000_baseline.sql`
2. **Mover as 28 de `sql/migrations/`** para `supabase/migrations/`, renomeadas com
   carimbo de tempo completo. Hoje têm só o dia (`20260610_`), sem hora — **a ordem
   entre as do mesmo dia precisa ser decidida por leitura**
3. Triar os 3 arquivos de `sql/` raiz: `funcoes_admin.sql` define `reset_user_password`
   e `get_user_email`, que **existem em produção e em nenhuma migration**. Viram
   migration com carimbo anterior ao primeiro uso
4. Apagar `sql/` depois de tudo migrado — hoje ela compete com `supabase/migrations/`
   pelo título de fonte da verdade
5. Registrar a regra: **toda migration nasce em `supabase/migrations/`, e passa por
   local antes de produção**

**Ao fim desta fase:** `supabase db reset` volta a ser operação confiável, e o CLI
enxerga 100% do schema em vez de 19%.

---

# 4. Esforço, risco e dependências

| Fase | Esforço | Risco | Depende de | Entrega |
|---|---|---|---|---|
| 1 · Baseline | 1 dia | Médio | — | `schema.sql` conferido por contagem |
| 2 · Funções | meio dia | Baixo | 1 | 396 funções, 38 críticas nominalmente conferidas |
| 3 · RLS | 1 dia | **Alto** | 1, 2 | 422 políticas com texto comparado |
| 4 · Validação | 1 dia | Baixo | 1–3 | Prova de reconstrução em ambiente local |
| 5 · Unificação | 1 dia | Médio | 4 | Uma pasta de migrations; CLI com 100% |
| **Total** | **4,5 dias** | — | — | **Produção deixa de ser fonte única** |

**Custo em dinheiro: R$ 0.** Tudo roda com o CLI (v2.115.0, já disponível) e Docker.

## 4.1 Riscos, e o que fazer com cada um

| Risco | Gravidade | Mitigação |
|---|---|---|
| **Dump incompleto que parece pronto** | **Alta** | Conferência por contagem na fase 1. Os sete números são conhecidos |
| **Políticas vêm com texto diferente** | **Alta** | Fase 3 compara `qual` e `with_check`, não nomes |
| **`GRANT EXECUTE` não vem no dump** | Média | Item explícito nas fases 1 e 2. Sem ele, funções restritas viram públicas — ou o contrário |
| **As 105 migrations não sobem em sequência** | Média | Fase 4 as exercita **depois** do baseline. Descobrir ali é o objetivo |
| **Ordem indefinida em `sql/migrations/`** | Média | Fase 5: decidir por leitura. São 28 arquivos de 3 dias |
| **Alguém copiar dados junto** | **Alta** | O dump é **estrutural**. Observação pastoral é o dado mais sensível do sistema; copiá-la cria um segundo lugar a proteger |
| **Schema mudar durante o trabalho** | Baixa | 4,5 dias é curto. Congelar migrations em produção durante a execução |

---

# 5. Ordem recomendada

**As fases 1 e 2 já entregam a maior parte do valor.** Ao fim delas o schema está
versionado, e produção deixa de ser a única cópia — que é o objetivo declarado deste
plano.

As fases 3 a 5 transformam "temos uma cópia" em "sabemos que ela funciona".

**Se houver tempo para uma só coisa: a fase 1, e dentro dela o passo 4.** Um dump não
conferido é a ilusão de segurança que este plano existe para desfazer.

---

# 6. O menor conjunto necessário para uma reconstrução funcional

## 6.1 Por dependência, não por volume

Um sistema **funcional** — que sobe, autentica e permite trabalhar — precisa, nesta
ordem:

| # | Camada | Objetos | Por que nesta posição |
|---|---|---|---|
| 1 | **Enums** | 114 (20 ausentes) | Colunas dependem do tipo. Sem eles, nenhuma tabela é criada |
| 2 | **Primitivas de guarda** | 4 funções | `is_admin` e as três irmãs. **Sem elas nenhuma política pode ser criada** |
| 3 | **Tabelas** | 143 (67 ausentes) | O dado |
| 4 | **Chaves e índices únicos** | — | Integridade referencial |
| 5 | **Funções** | 396 (312 ausentes) | Regras de negócio e corpos de gatilho |
| 6 | **Gatilhos** | 117 (70 ausentes) | Mantêm derivados |
| 7 | **Políticas + GRANTs** | 422 (266 ausentes) | **A segurança inteira** |
| 8 | **Views** | 30 (18 ausentes) | Leitura |

**Índices comuns ficam de fora do mínimo** — 310 ausentes, e nenhum impede o
funcionamento.

## 6.2 O número

**Mínimo funcional: 753 objetos ausentes**, de um total de 1063. Os 310 índices restantes
são desempenho.

## 6.3 E por que o mínimo não é o caminho

**Reconstruir 753 objetos à mão é mais caro e mais arriscado que trazer os 1.645 de
uma vez.**

| Caminho | Esforço | Resultado |
|---|---|---|
| Reconstrução seletiva dos 753 críticos | **semanas** | Banco *parecido* com produção. Cada política reescrita é uma chance de ficar mais permissiva |
| **Dump estrutural completo** | **1 dia** | Banco *idêntico*, conferível por contagem |

**A pergunta "qual o menor conjunto necessário" tem uma resposta útil e uma armadilha.**
A resposta útil é a ordem de dependência da §6.1 — ela diz por onde a validação deve
começar e por que a fase 2 vem antes da fase 3. A armadilha é tratá-la como plano de
execução: **o menor conjunto a reconstruir é zero, porque nada precisa ser
reconstruído. Precisa ser copiado, conferido e versionado.**

---

## 7. Limitações

1. **A classificação de criticidade é por referência estática** — busca textual por
   `.from("x")` e `.rpc("x")`. Nome montado em variável não é detectado, então algum
   objeto "Médio" pode ser crítico.
2. **Colunas não foram comparadas.** Uma tabela coberta pelo repositório pode ter menos
   colunas que a de produção. **A cobertura de tabelas é um teto.**
3. **Não foi testado se o dump do CLI traz tudo** — as fases 1 a 3 existem justamente
   para verificar isso, e o plano assume que pode falhar.
4. **Dados não entram** — o objeto é estrutura.

---

*Derivado do DATABASE_BASELINE_AUDIT.md, com classificação cruzada entre o catálogo de
produção, 108 arquivos `.sql` do repositório e as 115 relações e 80 RPCs referenciadas
em `src/`. Nenhum arquivo, banco, migration ou documentação foi alterado.*
