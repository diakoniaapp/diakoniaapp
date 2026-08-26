# DATABASE_BASELINE_AUDIT.md — DiakoniaApp

Auditoria de reconstrução: **o repositório contém informação suficiente para recriar o
banco de produção?**

Executada em **25/08/2026** sobre o projeto `prjoftmlkusbjoeptabp`.

> Origem: §1 do [HOMOLOGATION_IMPLEMENTATION_PLAN.md](./HOMOLOGATION_IMPLEMENTATION_PLAN.md),
> que apontou a lacuna. Este relatório a mede.
>
> **Nada foi alterado.** Leitura do catálogo do Postgres e de 108 arquivos `.sql` do
> repositório.

---

# 1. A resposta

**Não. O repositório reproduz 35% do banco de produção.**

E o número que mais importa é outro: **o CLI do Supabase enxerga apenas 19%**, porque
lê só `supabase/migrations/`. Um `supabase db reset` produziria um banco com menos de
um quinto dos objetos — e falharia antes disso, ao tentar `ALTER TABLE` sobre tabelas
que nenhuma migration cria.

| | Objetos | Proporção |
|---|---|---|
| Em produção | **1645** | 100% |
| Reproduzíveis pelo repositório inteiro | **582** | **35%** |
| Reproduzíveis só por `supabase/migrations/` | 309 | 19% |
| **Sem definição em lugar nenhum** | **1063** | **65%** |

---

# 2. O que existe no repositório

Foram encontradas **três** fontes de SQL, não uma:

| Fonte | Arquivos | Período | O CLI conhece? |
|---|---|---|---|
| `supabase/migrations/` | **77** | 29/04/2026 – 20/08/2026 | **sim** |
| `sql/migrations/` | **28** | 09/06/2026 – 11/06/2026 | **não** |
| `sql/` (raiz) | 3 | sem data | **não** |

**As duas pastas de migrations não têm um único arquivo em comum.** São históricos
paralelos, e o período de `sql/migrations/` (junho) cai **dentro** do intervalo coberto
por `supabase/migrations/` (abril a agosto) — ou seja, foram aplicadas fora de banda,
provavelmente pelo painel do Supabase, enquanto a outra pasta seguia sendo usada.

### A consequência prática

**A pasta que o CLI ignora contribui mais que a oficial** para quase todo tipo de
objeto:

| Tipo | `supabase/migrations` | `sql/migrations` | `sql/` raiz |
|---|---|---|---|
| Tabelas | 30 | **45** | 1 |
| Funções | 25 | **59** | 3 |
| Views | 3 | **11** | 0 |
| Gatilhos | 21 | **26** | 0 |
| Índices | 41 | **70** | 2 |
| Enums | **72** | 22 | 0 |
| Políticas | **117** | 40 | 0 |

Só enums e políticas favorecem a pasta oficial. **Para tabelas e funções, o que o CLI
não vê é o dobro do que ele vê.**

---

# 3. Métricas por tipo de objeto

| Objeto | Em produção | Reproduzível | Ausente | Cobertura |
|---|---|---|---|---|
| **Tabelas** | 143 | 76 | 67 | 53% |
| **Funções** | 396 | 84 | 312 | 21% |
| **Views** | 30 | 12 | 18 | 40% |
| **Gatilhos** | 117 | 47 | 70 | 40% |
| **Enums** | 114 | 94 | 20 | 82% |
| **Políticas RLS** | 422 | 156 | 266 | 37% |
| **Índices** | 423 | 113 | 310 | 27% |
| **Sequências** | 1 | 0 | 1 | 0% |
| **Chaves estrangeiras** | 273 | — ¹ | — | — |
| **TOTAL** | **1645** | **582** | **1063** | **35%** |

¹ *Chaves estrangeiras nascem dentro do `CREATE TABLE` ou de `ALTER TABLE`; foram
contadas em produção mas não rastreadas individualmente no repositório. Como 47% das
tabelas não têm `CREATE TABLE`, as chaves delas também não existem.*

**Nota de método.** As contagens de produção vieram de `information_schema` e
`pg_catalog`. Diferem ligeiramente das registradas no CLAUDE.md (476 políticas, 123
gatilhos) por critério de contagem — este relatório conta linhas de `pg_policies` e
gatilhos não internos. **Use os números daqui para decisões de reconstrução.**

---

# 4. Classificação dos objetos

## 4.1 Reproduzível — 582 objetos (35%)

Têm `CREATE` em algum arquivo do repositório. **Ressalva importante:** "reproduzível"
aqui significa *existe uma instrução de criação*, não *sobe corretamente em sequência*.
As 105 migrations nunca foram exercitadas do zero.

**Melhor caso: os enums (82%).** Dos 114 tipos, 94 têm `CREATE TYPE ... AS ENUM`. É o
único tipo de objeto que se aproxima de completo.

## 4.2 Parcialmente reproduzível

Tabelas **criadas** por uma fonte e **alteradas** por outra, sem que a ordem esteja
garantida. É a maior parte das 76 tabelas cobertas: nasceram em `sql/migrations/` e
receberam `ALTER` em `supabase/migrations/`, ou o contrário.

**Não é possível aplicá-las na ordem certa sem juntar as duas pastas e reordenar por
data** — e mesmo assim, sem garantia, porque as datas de `sql/migrations/` são só o dia,
sem hora.

## 4.3 Não reproduzível — 1063 objetos (65%)

### Tabelas ausentes: 67

**31 delas são escritas pelo código hoje.** Sem elas o sistema não roda:

```
arr_caixa_operadores, arr_caixas, arr_checklist_template, arr_espacos, arr_estoque_movimentos, arr_itens_venda, arr_movimentos, arr_problemas_manutencao, arr_produtos, arr_reserva_checklist, arr_reservas, arr_vendas, campanha_materiais, campanhas, documento_estrutura, documentos, documentos_historico, escala_voluntarios, fin_decisoes_reuniao, fin_reunioes_financeiras, fiscal_agenda, fiscal_config, fiscal_obrigacoes_ativas, identidade_igreja, identidade_valores, igreja_instituicoes, importacoes_membros, instituicoes, perfil_servico, secoes_documento, solicitacoes_lgpd
```

As outras 36 incluem as 8 tabelas `pdv_*` (módulo modelado e nunca construído,
Achado 18), `permissoes_modulo` (modelo de permissão morto, Achado 13), `pessoas`,
`convites_acesso` e `igrejas`.

### Funções ausentes: 312

**30 são chamadas por `.rpc()` no código.** E entre elas está algo que merece
destaque próprio:

```
aceitar_convite · validar_convite · criar_convite_acesso
redefinir_senha · solicitar_reset_senha
```

**O fluxo inteiro de convite e recuperação de senha não existe no repositório.** Num
banco reconstruído, ninguém poderia ser convidado, aceitar convite ou recuperar senha —
e a tabela `convites_acesso` também está ausente.

Junto com elas faltam os 15 relatórios executivos do financeiro (`fin_exec_*`), todo o
módulo fiscal (`fiscal_*`) e o motor de arrecadação (`arr_*`).

### Views ausentes: 18 de 30

```
arr_caixa_resumo, v_dashboard_visitantes, v_diretoria_atual, v_estrutura_fisica, v_igrejas_ativas, v_importacoes_resumo, v_membros_mapa, v_membros_perfil, v_meu_contexto, v_minha_escala, v_proximas_escalas, v_ranking_convidadores, v_solicitacoes_lgpd, v_visitantes_alerta, v_voluntarios_completo, vw_agenda_igreja, vw_arr_reservas_publica, vw_ocupacao_local
```

### Gatilhos ausentes: 70 de 117

São os que mantêm dados derivados — carga de voluntário, contadores, histórico. **Sem
eles o banco aceita escrita mas para de se manter coerente sozinho**, e o defeito só
aparece semanas depois.

### Enums ausentes: 20

```
arr_caixa_estado, arr_checklist_tipo, arr_estoque_mov_tipo, arr_forma_pgto, arr_mov_tipo, arr_produto_categoria, arr_reserva_status, dia_semana, frequencia_servico, funcao_lideranca, funcao_ministerial, local_status_op, predio_tipo, status_checklist, status_escala, status_presenca_escala, status_voluntario, tipo_lideranca_ref, turno_disponibilidade, unidade_tipo
```

Concentrados em arrecadação (`arr_*`) e escalas (`status_escala`,
`turno_disponibilidade`, `funcao_ministerial`).

### Políticas ausentes: 266 de 422

**É a lacuna mais perigosa das sete.** A RLS é a totalidade da segurança do sistema
(AD-1). Um banco reconstruído teria tabelas com RLS ligada e **sem política** — o que
as torna inacessíveis — ou, pior, alguém as criaria às pressas mais permissivas que as
originais.

### Índices ausentes: 310 de 423

Não impedem o funcionamento; degradam o desempenho de forma silenciosa.

---

# 5. Respostas diretas

## 5.1 É possível reconstruir produção a partir do repositório?

**Não.**

Nem a partir do repositório inteiro (35%), nem — muito menos — pelo caminho que o
ferramental oferece por padrão (19%).

E há um agravante além do percentual: **as 105 migrations nunca foram aplicadas em
sequência do zero.** Mesmo os 35% cobertos não têm garantia de subir, porque as duas
pastas têm ordens independentes e há dependências conhecidas de ordem — `ALTER TYPE …
ADD VALUE` não roda na mesma transação em que o valor é usado (CLAUDE.md §6.3).

## 5.2 Quais componentes impedem isso?

Em ordem de gravidade:

| # | Componente | Por quê impede |
|---|---|---|
| 1 | **O schema fundador não está versionado** | A primeira migration é de 29/04/2026 e cria 8 tabelas. As outras 135 vieram de antes, pelo painel |
| 2 | **30 funções chamadas por RPC sem definição** | Inclui convite, aceite e recuperação de senha — o sistema subiria sem forma de dar acesso a ninguém |
| 3 | **31 tabelas em uso ativo sem `CREATE TABLE`** | `escala_voluntarios`, `solicitacoes_lgpd`, `documentos`, `campanhas`, `perfil_servico` |
| 4 | **266 políticas de RLS ausentes** | A segurança é 100% RLS. Sem política, ou tudo trava, ou alguém improvisa mais frouxo |
| 5 | **Duas pastas de migrations paralelas** | Ordem de aplicação indefinida entre elas |
| 6 | **70 gatilhos ausentes** | Os derivados param de se manter, e o defeito aparece tarde |
| 7 | **Grants de `EXECUTE` não versionados** | O [SECURITY_DEFINER_AUDIT.md](./SECURITY_DEFINER_AUDIT.md) mostrou que as 143 funções definer têm ACL explícita. Nenhum `GRANT` aparece no repositório |

## 5.3 Qual o menor conjunto necessário para uma baseline completa?

**Um dump estrutural de produção.** Não há atalho — 65% dos objetos só existem lá.

### O que a baseline precisa conter

| # | Conteúdo | Como obter | Já coberto pelo dump padrão? |
|---|---|---|---|
| 1 | Tabelas, colunas, chaves, índices, sequências | `supabase db dump --schema public` | sim |
| 2 | Funções, views, gatilhos, enums | idem | sim |
| 3 | **Políticas de RLS** | idem | sim — **conferir as 422** |
| 4 | **`GRANT EXECUTE` das funções** | idem | **conferir** — é o que separa função pública de restrita |
| 5 | **Configuração dos 10 buckets** | `storage.buckets`, à parte | **não** — dump de `public` não inclui |
| 6 | Configuração do Auth (confirmação de e-mail desligada) | `config.toml` local | **não** |
| 7 | As 105 migrations, **daí para a frente** | já no repositório | — |

### Verificação obrigatória do dump

**Conferir por contagem antes de usar.** Os números são conhecidos:

```
143 tabelas · 396 funções · 30 views
117 gatilhos · 114 enums · 422 políticas · 423 índices
```

**Se não baterem, o dump está incompleto** — e um dump incompleto é pior que nenhum,
porque parece pronto.

### O passo que fecha a lacuna de vez

Depois de conferido, **versionar o dump como `supabase/migrations/00000000000000_baseline.sql`**
e mover as 28 de `sql/migrations/` para a pasta oficial, renomeadas com carimbo de
tempo completo. A partir daí:

- o CLI passa a enxergar 100% do schema;
- `supabase db reset` volta a ser uma operação confiável;
- existe **uma** história, não duas.

**Esforço: cerca de 1 dia**, e é o único trabalho deste relatório que remove o problema
em vez de contorná-lo.

---

# 6. O risco que este relatório mede

**Hoje o banco de produção é a única cópia completa do schema.**

Não há segunda fonte. Se o projeto `prjoftmlkusbjoeptabp` for perdido, corrompido ou
tiver o schema alterado por engano, **o repositório não permite reconstruí-lo** — 65%
dos objetos não existem em lugar nenhum além do próprio banco.

Isto não é hipótese distante: o [HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md)
registra que **não há política de backup documentada nem restauração testada**, e que
o desenvolvimento roda direto sobre esse mesmo banco.

**A combinação é a de maior perda potencial de todo o conjunto de auditorias:** um
banco sem cópia estrutural, sem backup verificado, e com desenvolvimento gravando
nele.

**Gerar e versionar o dump é a ação de maior valor por hora de trabalho já identificada
nestes relatórios.** Custa cerca de uma hora para a primeira versão utilizável.

---

## 7. Limitações deste levantamento

1. **A detecção é textual.** Procura `CREATE [OR REPLACE] <tipo> [IF NOT EXISTS] [public.]nome`,
   ignorando comentários de linha. SQL montado dinamicamente ou dentro de `DO $$` **não
   é detectado** — pode haver objetos criados assim, o que faria a cobertura real ser
   ligeiramente maior.
2. **"Reproduzível" não significa "sobe".** Mede a existência de uma instrução de
   criação, não a execução em sequência. As 105 migrations nunca foram exercitadas do
   zero.
3. **Colunas não foram comparadas.** Uma tabela criada no repositório pode ter menos
   colunas que a de produção, se recebeu `ALTER` fora de banda. **A cobertura de 53%
   das tabelas é, portanto, um teto.**
4. **Chaves estrangeiras não foram rastreadas individualmente** no repositório.
5. **Dados não entram nesta conta** — o objeto deste relatório é estrutura.

---

*Comparação entre o catálogo do banco de produção (`information_schema`, `pg_catalog`)
e 108 arquivos `.sql` do repositório, em três diretórios. Nenhum arquivo, banco,
migration ou documentação foi alterado.*
