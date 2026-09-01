# SECURITY_DEFINER_AUDIT.md — DiakoniaApp

Auditoria das funções `SECURITY DEFINER` do banco de produção
(projeto `prjoftmlkusbjoeptabp`), executada em **25/08/2026**.

> Origem: **Achado 06** da Auditoria Técnica, e **ordem 3** do
> [ACTION_PLAN_90_DAYS.md](./ACTION_PLAN_90_DAYS.md). Era a única incógnita de
> segurança do relatório — nenhum documento registrava quantas funções eram
> `SECURITY DEFINER` nem quantas tinham guarda.
>
> **Este relatório não alterou nenhuma função, política, permissão ou linha de
> código.** Todo o levantamento é leitura do catálogo do Postgres.

---

## 1. Por que isto importa

`SECURITY DEFINER` faz a função rodar com os privilégios de quem a **criou**, não de
quem a **chama**. A consequência é direta: **a função ignora a RLS.**

O ARCHITECTURE.md §5.2 já dizia o que isso exige — *"a guarda tem de ser a primeira
linha do corpo; sem isso, definer vira porta aberta"*. E o AD-1 explica por que é
grave aqui em particular: **não há backend próprio, então a RLS é a totalidade da
segurança do sistema.** Uma função definer sem guarda é um caminho que contorna as
476 políticas de uma vez.

---

## 2. Panorama — onde estão as funções

| Schema | Funções | `SECURITY DEFINER` | Observação |
|---|---|---|---|
| `public` | 397 | **143** | O código da aplicação. **Objeto desta auditoria** |
| `vault` | 5 | 2 | Infraestrutura Supabase — fora de escopo |
| `pgbouncer` | 1 | 1 | Infraestrutura Supabase — fora de escopo |
| `extensions`, `storage`, `realtime`, `auth`, `graphql_public` | 92 | 0 | — |

Das **143 em `public`**:

| | Quantidade | Alcance |
|---|---|---|
| **Gatilhos** (retornam `trigger`) | **31** | Não chamáveis via RPC — o PostgREST recusa funções que retornam `trigger` |
| **Chamáveis via `.rpc()`** | **112** | **O universo de risco real** |

---

## 3. Duas descobertas estruturais — as duas boas

Antes dos problemas, duas coisas que **estão certas** e que eliminam classes inteiras
de vulnerabilidade:

**1 · Todas as 143 têm `search_path` fixo.**
Zero funções sem `SET search_path`. Definer sem `search_path` fixo é o vetor
clássico de escalada de privilégio — um usuário cria um objeto homônimo num schema
que vem antes no caminho de busca e a função definer o executa com privilégio de
dono. **Esse vetor não existe aqui.**

**2 · Nenhuma função tem ACL padrão.**
Zero funções com `proacl NULL`. No Postgres, o padrão é `EXECUTE` para `PUBLIC` —
se as concessões fossem implícitas, todas as 143 seriam chamáveis por qualquer um.
Aqui **todas têm concessão explícita**, o que significa que alguém pensou no assunto.

Isto muda a natureza do relatório: **não se trata de um sistema descuidado, mas de um
sistema com duas exceções concretas.**

---

## 4. Alcance de execução — quem pode chamar o quê

| Alcance | Funções | Destas, gatilhos | Chamáveis de fato |
|---|---|---|---|
| **Sem login** (`PUBLIC` ou `anon`) | 33 | 27 | **6** |
| Só autenticado | 106 | 4 | 102 |
| Só interna (`postgres`/`service_role`) | 4 | 0 | 4 |

As 6 chamáveis sem login são o ponto de partida da análise. Quatro delas **precisam**
ser públicas — são os fluxos anteriores ao login. Duas não.

---

# Ação Imediata Necessária

Esta seção contém **apenas** o que não tem mecanismo de autorização nenhum: nem
verificação de papel, nem `auth.uid()`, nem token.

## Nível 1 — Alcançáveis sem qualquer login (2 funções)

**São chamáveis com a chave anônima pública, que está embutida no JavaScript servido
pela Vercel.** Não exigem conta, senha ou convite.


### `agenda_pastoral_proximos_dias(p_dias integer)`

| | |
|---|---|
| **Schema** | `public` |
| **Finalidade aparente** | Devolve aniversários, bodas e efemérides dos próximos N dias para a agenda pastoral |
| **Objetos acessados** | `vw_agenda_pastoral` |
| **Usada pelo sistema?** | Sim |
| **Chamada RPC associada?** | Sim — `.rpc("agenda_pastoral_proximos_dias", …)` |
| **Possui validação de autorização?** | **Não** |
| **Qual validação foi encontrada?** | **Nenhuma** |
| **Ocorre no início da função?** | Não há validação |
| **Risco de bypass de RLS?** | **Sim — total, e sem login** |
| **Concessão** | `=X/postgres` → **`PUBLIC` tem `EXECUTE`** |

**Motivo da classificação.** A função lê `vw_agenda_pastoral`, e o corpo seleciona
explicitamente `v.telefone`, `v.telefone_secundario`, `v.titulo`, `v.subtitulo` e
`v.tipo_pessoa`. Sendo `SECURITY DEFINER`, a RLS de `membros` **não se aplica**. Com
`EXECUTE` concedido a `PUBLIC`, qualquer pessoa com a chave anônima — que é pública
por definição — obtém **nome e telefone de membros da igreja**, mais a data
comemorativa de cada um.

**Por que é a mais grave do relatório.** É a combinação completa: sem login, dado
pessoal direto, sem rastro de quem acessou, e a chave necessária está publicada no
pacote do site.

**Risco associado.** Exposição de dado pessoal sem autenticação e sem registro de
acesso. Sob a LGPD, tratamento sem base legal e sem rastreabilidade.

**Impacto potencial.** Nome e telefone de membros da igreja obtidos por qualquer
pessoa que leia o JavaScript do site. Não há como saber, depois, se aconteceu.

**Recomendação.** `REVOKE EXECUTE ... FROM PUBLIC, anon;` mantendo
`authenticated`. **É uma linha por função e não quebra nenhuma tela** — as duas são
chamadas de dentro do app, sempre com usuário logado.


### `sugerir_voluntarios_escala(p_area_id uuid, p_data_evento date, p_dia_semana text, p_turno text, p_limite integer, p_hora_inicio time without time zone, p_hora_fim time without time zone)`

| | |
|---|---|
| **Schema** | `public` |
| **Finalidade aparente** | Motor de sugestão de voluntários para uma escala, com score e motivo legível |
| **Objetos acessados** | `area_voluntarios, areas, escala_voluntarios, escalas, membros, perfil_servico` |
| **Usada pelo sistema?** | Sim |
| **Chamada RPC associada?** | Sim — `.rpc("sugerir_voluntarios_escala", …)` |
| **Possui validação de autorização?** | **Não** |
| **Qual validação foi encontrada?** | **Nenhuma** |
| **Ocorre no início da função?** | Não há validação |
| **Risco de bypass de RLS?** | **Sim — total, e sem login** |
| **Concessão** | `=X/postgres` → **`PUBLIC` tem `EXECUTE`** |

**Motivo da classificação.** A função cruza `area_voluntarios`, `areas`, `escalas`,
`escala_voluntarios`, `perfil_servico` e **`membros`**, devolvendo nomes de
voluntários com score de disponibilidade. Sendo definer, a RLS de `membros` não se
aplica; com `PUBLIC` no `EXECUTE`, o resultado sai sem login.

**Detalhe que importa: existem duas sobrecargas desta função.**

| Assinatura | Concessão |
|---|---|
| 5 argumentos (`p_area_id, p_data_evento, p_dia_semana, p_turno, p_limite`) | `authenticated` — **restrita, correta** |
| 7 argumentos (as anteriores + `p_hora_inicio`, `p_hora_fim`) | **`PUBLIC`** |

A sobrecarga de 7 argumentos é a mais nova — é a que implementa a checagem de
conflito por `tsrange` descrita no CLAUDE.md §5.5. **A concessão a `PUBLIC` parece
ter sido acidental na migration que a criou**, já que a versão anterior da mesma
função está corretamente restrita. É um erro de uma linha, não de desenho.

**Risco associado.** Exposição de dado pessoal sem autenticação e sem registro de
acesso. Sob a LGPD, tratamento sem base legal e sem rastreabilidade.

**Impacto potencial.** Nome e telefone de membros da igreja obtidos por qualquer
pessoa que leia o JavaScript do site. Não há como saber, depois, se aconteceu.

**Recomendação.** `REVOKE EXECUTE ... FROM PUBLIC, anon;` mantendo
`authenticated`. **É uma linha por função e não quebra nenhuma tela** — as duas são
chamadas de dentro do app, sempre com usuário logado.


## Nível 2 — Escrevem sem verificar identidade (12 funções)

Exigem login, mas **não verificam quem é o usuário**. Qualquer conta autenticada — os
6 usuários atuais, e qualquer conta futura, de qualquer papel — pode invocá-las e
alterar dados **contornando a RLS**.

| Função | Módulo | Tabelas que altera | Usada? | Aborta com exceção? |
|---|---|---|---|---|
| `assuntos_para_reuniao` | Assuntos e reuniões | `assuntos, reuniao_assuntos` | sim | não |
| `fin_gerar_recorrencias` | Financeiro | `fin_lancamentos, fin_recorrencias` | sim | não |
| `fin_recalc_saldo_conta` | Financeiro | `fin_contas, fin_lancamentos` | **não** | não |
| `fin_seed_centros_custo` | Financeiro | `areas, ebd_campanhas, ebd_classes, fin_centros_custo, ministerios, pgm_grupos` | sim | não |
| `fiscal_criar_lancamento` | Fiscal | `fin_lancamentos, fiscal_agenda, fiscal_obrigacoes_ativas, fiscal_tipos_obrigacao` | sim | sim |
| `fiscal_marcar_atrasados` | Fiscal | `fiscal_agenda` | sim | não |
| `gerar_notificacoes_campanha` | Outros | `campanha_notificacoes, campanhas` | sim | não |
| `gov_executar_pauta` | Governança | `gov_pautas, solicitacoes_membresia` | sim | não |
| `mover_aluno_classe` | EBD | `ebd_matriculas` | sim | não |
| `pgm_multiplicar_grupo` | Pequenos grupos | `pgm_grupos, pgm_membros` | sim | não |
| `solicitar_lgpd` | Acesso e identidade | `pessoas, solicitacoes_lgpd` | **não** | não |
| `vincular_pessoa_familia` | Pessoas | `familias, membros, vinculos_familiares` | sim | não |

**Motivo da classificação.** Nenhuma delas chama `is_admin()`, `has_any_role()`,
`tem_permissao()` nem `auth.uid()`. A autorização depende **inteiramente** de a tela
não oferecer o botão — e o CLAUDE.md AD-1 é explícito: *"nunca tratar uma checagem de
tela como barreira de segurança"*.

**Risco associado.** Escrita em massa por chamada direta de RPC, sem passar por tela
nenhuma. Os casos de maior alcance:

- **`fin_seed_centros_custo()`** — sem argumentos, cria centros de custo a partir de
  ministérios, áreas, classes da EBD e grupos. Uma chamada reescreve a árvore
  financeira. Não pede nada e não verifica ninguém.
- **`fiscal_marcar_atrasados()`** — sem argumentos, faz `UPDATE` em massa em
  `fiscal_agenda` marcando pendências como atrasadas.
- **`mover_aluno_classe(uuid, uuid)`** — desativa todas as matrículas de um aluno e
  cria outra. Qualquer autenticado move qualquer aluno.
- **`vincular_pessoa_familia(...)`** — altera `vinculos_familiares`, `familias` e
  `membros`, e pode desmarcar o responsável de uma família.
- **`gov_executar_pauta(uuid)`** — executa deliberação e mexe em
  `solicitacoes_membresia`. É decisão de assembleia, executável por qualquer conta.

**Duas não são chamadas por código nenhum:** `fin_recalc_saldo_conta` e
`solicitar_lgpd`. São superfície de ataque **sem dono** — ninguém notaria se fossem
usadas.

**Impacto potencial.** Alteração de dado financeiro, fiscal, de matrícula e de
vínculo familiar, sem trilha de autoria e sem que a RLS possa impedir.

**Recomendação.** Acrescentar a guarda de papel como primeira instrução do corpo,
seguindo o padrão que **6 funções do próprio banco já usam**:

```sql
IF NOT public.is_admin() THEN
  RAISE EXCEPTION 'Apenas a administração pode …';
END IF;
```

O papel exigido varia por função — `fin_*` e `fiscal_*` provavelmente pedem
`tesouraria`/`admin`; `mover_aluno_classe`, o perfil de EBD. **A definição de qual
papel cabe a cada uma é decisão da igreja, não da engenharia.**

---

## 5. Tabela resumo

| Métrica | Quantidade |
|---|---|
| **Total de `SECURITY DEFINER` no banco** | **146** |
| — em `public` (aplicação) | 143 |
| — em `vault` e `pgbouncer` (infraestrutura Supabase) | 3 |
| **Gatilhos** (não chamáveis via RPC) | 31 |
| **Chamáveis via `.rpc()`** | **112** |
| | |
| **Segura** | **20** |
| **Necessita Revisão** | **90** |
| **Crítica** | **2** |
| | |
| Sem `search_path` fixo | **0** |
| Com ACL padrão (`PUBLIC` implícito) | **0** |
| Alcançáveis sem login (excluindo gatilhos) | 6 — sendo 4 legítimas |
| Não chamadas por nenhuma linha de código | **33** |

### Composição de cada classe

| Classe | Grupo | Qtd. |
|---|---|---|
| **Segura** | Primitivas de guarda (retornam `boolean`, sem efeito colateral) | 10 |
| **Segura** | Operações com guarda de papel verificada | 6 |
| **Segura** | Fluxos pré-login protegidos por token | 4 |
| **Necessita Revisão** | Leem sem filtro de identidade | 56 |
| **Necessita Revisão** | Leem filtrando por `auth.uid()` | 12 |
| **Necessita Revisão** | **Escrevem sem verificar identidade** | **12** |
| **Necessita Revisão** | Escrevem filtrando por `auth.uid()` | 10 |
| **Crítica** | Públicas sem guarda | 2 |

---

## 6. Riscos ordenados — do mais grave ao menos grave

| # | Risco | Funções | Por que nesta posição |
|---|---|---|---|
| 1 | **Leitura de dado pessoal sem login** | 2 | Sem autenticação, dado direto (nome, telefone), sem rastro. A chave necessária é pública |
| 2 | **Escrita sem verificação de identidade** | 12 | Exige login, mas qualquer papel serve. Altera financeiro, fiscal, matrícula e vínculo familiar |
| 3 | **Superfície sem dono** | 33 | Não chamadas por código nenhum. Ninguém notaria o uso, e ninguém as mantém |
| 4 | **Leitura sem filtro de identidade** | 56 | Exige login. Muitas devolvem agregados, mas várias devolvem dado nominal |
| 5 | **Guarda presente, mas não no início** | 1 | `registrar_contato` valida a 32% do corpo; há trabalho antes da guarda |
| 6 | **Escrita filtrada por `auth.uid()`** | 10 | Contido: o usuário só altera o que é dele. Falta o papel, não a identidade |
| 7 | **Leitura filtrada por `auth.uid()`** | 12 | Menor risco do conjunto |

---

## 7. Necessita Revisão — detalhamento

### 7.1 Escrevem com `auth.uid()` (10)

Verificam **quem** é o usuário, mas não **o que ele pode**. O dano fica limitado ao
próprio registro do usuário — é contenção real, não acidental.

| Função | Módulo | Objetos | Usada? |
|---|---|---|---|
| `anonimizar_pessoa` | Pessoas | `consentimento, log_auditoria, membros_detalhes, pessoas` | **não** |
| `arr_aprovar_reserva` | Arrecadação | `arr_acordo_template, arr_reservas` | sim |
| `criar_convite_acesso` | Acesso e identidade | `convites_acesso, profiles` | sim |
| `ebd_marcar_presenca` | EBD | `ebd_presencas` | sim |
| `ebd_obter_ou_criar_aula` | EBD | `ebd_aulas` | sim |
| `pgm_iniciar_reuniao` | Pequenos grupos | `pgm_membros, pgm_presencas, pgm_reunioes` | sim |
| `registrar_audit_log` | Outros | `audit_logs` | sim |
| `registrar_exportacao` | Outros | `exportacoes_log` | sim |
| `registrar_historico_documento` | Documentos e identidade | `documentos_historico` | **não** |
| `reset_user_password` | Outros | `profiles` | sim |

**Motivo.** `auth.uid()` prova identidade, não autorização. Um usuário de papel baixo
que deva apenas *ler* consegue *escrever* no que é dele, se a função permitir.

**Recomendação.** Revisar caso a caso. Onde a operação for legítima para qualquer
usuário sobre seus próprios dados, **está adequada** e pode ser reclassificada como
Segura com um comentário na função dizendo isso.

### 7.2 Leem sem filtro de identidade (56)

O maior grupo. **Nem todas são problema** — muitas devolvem agregados de painel
(`fin_exec_indicadores_eclesiasticos`, `resumo_ebd_dashboard`) que já exigiriam papel
para chegar à tela. O risco varia com o que a consulta devolve.

| Função | Módulo | Objetos acessados | Usada? |
|---|---|---|---|
| `agenda_pastoral_mes` | Agenda e escalas | `vw_agenda_pastoral` | sim |
| `arr_problemas_resumo` | Arrecadação | `arr_espacos, arr_problemas_manutencao` | sim |
| `assuntos_alertas` | Assuntos e reuniões | `vw_assuntos_dashboard` | sim |
| `assuntos_por_responsavel` | Assuntos e reuniões | `vw_assuntos_dashboard` | sim |
| `assuntos_urgentes_igreja` | Assuntos e reuniões | `assuntos` | sim |
| `autocomplete_instituicoes` | Documentos e identidade | `instituicoes` | **não** |
| `buscar_estrutura_documento` | Documentos e identidade | `documento_estrutura` | **não** |
| `buscar_instituicao_similar` | Documentos e identidade | `instituicoes` | sim |
| `buscar_modelo_ministerio` | Documentos e identidade | `documento_estrutura, modelos_ministerio` | sim |
| `buscar_secoes_por_tag` | Documentos e identidade | `documentos, secoes_documento` | **não** |
| `dashboard_ministerios` | Outros | `area_voluntarios, areas, escala_voluntarios, escalas, lideranc…` | **não** |
| `ebd_chamada_view` | EBD | `ebd_aulas, ebd_matriculas, ebd_presencas, membros` | sim |
| `ebd_classes_baixa_presenca` | EBD | `ebd_aulas, ebd_classes, ebd_matriculas, ebd_presencas` | sim |
| `esperados_da_classe` | EBD | `ebd_classes, ebd_matriculas, ebd_professores, membros` | sim |
| `familias_sem_responsavel` | Pessoas | `familias, membros, vinculos_familiares` | sim |
| `fin_alertas_centros` | Financeiro | `fin_centros_custo, fin_lancamentos, vw_fin_orcamento_vs_real` | sim |
| `fin_alertas_financeiros` | Financeiro | `fin_lancamentos` | sim |
| `fin_anomalias_mes` | Financeiro | `fin_categorias, fin_lancamentos` | sim |
| `fin_comparativo_meses` | Financeiro | `fin_lancamentos` | sim |
| `fin_exec_alertas` | Financeiro | `fin_centros_custo, fin_contas, fin_lancamentos, fin_orcamentos…` | sim |
| `fin_exec_centros_ano` | Financeiro | `fin_centros_custo, fin_lancamentos, fin_orcamentos` | sim |
| `fin_exec_fluxo_12m` | Financeiro | `fin_lancamentos` | sim |
| `fin_exec_indicadores_eclesiasticos` | Financeiro | `fin_categorias, fin_lancamentos` | sim |
| `fin_exec_saldo_consolidado` | Financeiro | `fin_contas, fin_lancamentos` | sim |
| `fin_previsao_caixa` | Financeiro | `fin_contas, fin_lancamentos` | sim |
| `fin_sugerir_centro_por_categoria` | Financeiro | `fin_centros_custo, fin_lancamentos` | sim |
| `fin_top_fornecedores` | Financeiro | `fin_fornecedores, fin_lancamentos` | sim |
| `fiscal_alertas_proximos` | Fiscal | `fiscal_agenda, fiscal_config, fiscal_tipos_obrigacao` | **não** |
| `fiscal_documentos_mes` | Fiscal | `fiscal_agenda, fiscal_documentos, fiscal_tipos_obrigacao` | sim |
| `fiscal_historico_medio` | Fiscal | `fiscal_agenda` | **não** |
| `fiscal_inconsistencias` | Fiscal | `fiscal_agenda, fiscal_documentos, fiscal_tipos_obrigacao` | sim |
| `fiscal_insights` | Fiscal | `fiscal_agenda, fiscal_tipos_obrigacao` | sim |
| `fiscal_resumo_dashboard` | Fiscal | `fiscal_agenda, fiscal_config, fiscal_tipos_obrigacao` | sim |
| `fiscal_resumo_malote` | Fiscal | `fiscal_agenda, fiscal_documentos, fiscal_tipos_obrigacao` | sim |
| `fn_areas_do_ministerio` | Outros | `areas` | **não** |
| `fn_areas_do_voluntario` | Agenda e escalas | `area_voluntarios` | **não** |
| `fn_escalas_do_voluntario` | Agenda e escalas | `escala_voluntarios` | **não** |
| `gov_alertas` | Governança | `gov_assembleias, gov_pautas, gov_reunioes` | sim |
| `gov_executar_assembleia` | Governança | `gov_pautas` | sim |
| `gov_sugerir_participantes` | Governança | `areas, membros, ministerios, profiles, user_roles` | sim |
| `gov_sugerir_pautas` | Governança | `solicitacoes_membresia` | sim |
| `montar_pauta_financeira` | Assuntos e reuniões | `fin_categorias, fin_centros_custo, fin_lancamentos, fin_orcame…` | sim |
| `pessoas_sem_familia_sobrenome_conhecido` | Pessoas | `familias, membros, pessoas, vinculos_familiares` | sim |
| `pgm_alertas_ausencia` | Pequenos grupos | `membros, pgm_grupos, pgm_membros, pgm_presencas, pgm_reunioes` | sim |
| `pgm_resumo_geral` | Pequenos grupos | `pgm_grupos, pgm_membros, pgm_pedidos_oracao, pgm_presencas, pg…` | sim |
| `pgm_resumo_presenca` | Pequenos grupos | `pgm_presencas, pgm_reunioes` | sim |
| `pgm_sugerir_por_bairro` | Pequenos grupos | `membros, pgm_grupos, pgm_membros` | sim |
| `resumo_campanha_ebd` | EBD | `ebd_campanhas, ebd_entradas` | sim |
| `resumo_ebd_dashboard` | EBD | `ebd_aulas, ebd_classes, ebd_matriculas, ebd_presencas` | sim |
| `resumo_painel_pastoral` | Outros | `vw_agenda_pastoral` | sim |
| `secretaria_alertas` | Outros | `solicitacoes_documentos, solicitacoes_membresia` | sim |
| `sugerir_classe_ebd` | EBD | `ebd_classes` | sim |
| `sugerir_identidade_por_tag` | Documentos e identidade | `documentos, secoes_documento` | sim |
| `sugerir_vinculos_familiares` | Pessoas | `familias, membros, vinculos_familiares` | sim |
| `sugerir_voluntarios_escala` | Agenda e escalas | `area_voluntarios, areas, escala_voluntarios, escalas, membros,…` | sim |
| `verifica_conflito_ocupacao` | Agenda e escalas | `vw_ocupacao_local` | sim |

**Motivo da classificação.** Sem guarda e sem `auth.uid()`, qualquer conta
autenticada obtém o resultado completo, contornando a RLS das tabelas de origem.

**Como priorizar dentro deste grupo — a pergunta é uma só:** *a função devolve dado
nominal de pessoa, ou número agregado?* As que tocam `membros`, `familias`,
`visita_historico` e `perfil_servico` merecem guarda; as que devolvem contagem de
painel provavelmente não.

**Recomendação.** Triar por essa pergunta antes de escrever qualquer guarda. Aplicar
guarda em 56 funções sem triagem custaria dias e quebraria painéis.

### 7.3 Leem com `auth.uid()` (12)

| Função | Módulo | Usada? |
|---|---|---|
| `assuntos_meus_resumo` | Assuntos e reuniões | sim |
| `current_user_role` | Acesso e identidade | **não** |
| `fn_contexto_usuario` | Outros | **não** |
| `fn_meu_membro_id` | Pessoas | **não** |
| `fn_meu_ministerio_id` | Outros | **não** |
| `fn_meu_perfil_acesso` | Acesso e identidade | **não** |
| `fn_minha_permissao` | Acesso e identidade | **não** |
| `fn_todas_minhas_permissoes` | Acesso e identidade | **não** |
| `get_user_email` | Outros | sim |
| `minhas_permissoes` | Acesso e identidade | sim |
| `pessoa_atual` | Pessoas | **não** |
| `resumo_meus_dados` | Outros | **não** |

**Motivo.** Menor risco do relatório: já filtram pelo usuário corrente. Ficam em
Necessita Revisão apenas porque não verificam papel — o que, para leitura do próprio
dado, costuma ser aceitável.

---

## 8. Seguras — o padrão que o banco já sabe fazer

### 8.1 Operações com guarda de papel (6)

| Função | Validação encontrada | No início do corpo? | Usada? |
|---|---|---|---|
| `definir_perfil` | `is_admin()` / `has_any_role()` — a 5% do corpo | sim | sim |
| `excluir_importacao` | `is_admin()` / `has_any_role()` — a 2% do corpo | sim | sim |
| `fn_listar_acessos_sistema` | `is_admin()` / `has_any_role()` — a 3% do corpo | sim | não |
| `painel_de_acessos` | `is_admin()` / `has_any_role()` — a 3% do corpo | sim | sim |
| `registrar_contato` | `is_admin()` / `has_any_role()` — a 32% do corpo | **não** | sim |
| `revogar_acesso` | `is_admin()` / `has_any_role()` — a 6% do corpo | sim | sim |

Cinco delas colocam a guarda **imediatamente após o `BEGIN`**, exatamente como o
ARCHITECTURE.md §5.2 determina. `painel_de_acessos` e `revogar_acesso` são o modelo a
copiar:

```sql
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas a administração pode ver o painel de acessos.';
  END IF;
  …
```

**A exceção é `registrar_contato`**, que valida a **32% do corpo**, 276 caracteres
depois do `BEGIN`. A guarda existe e funciona, mas há trabalho antes dela. Não é
falha de segurança hoje; é um desvio da convenção que **facilita o erro na próxima
edição** — alguém que acrescente um efeito colateral acima da guarda o torna
incondicional.

### 8.2 Primitivas de guarda (10)

`fn_permissao`, `fn_pode_editar_obs_pastoral`, `fn_pode_executar`, `has_any_role`, `has_role`, `is_admin`, `is_admin_or_any`, `is_lider_ou_superior`, `is_operador_ou_superior`, `tem_permissao`

São `SECURITY DEFINER` **por necessidade**: precisam ler `user_roles` contornando a
RLS para poder responder "este usuário tem este papel?". Retornam `boolean` e não têm
efeito colateral. **Estão corretas por desenho.**

> **Atenção documentada.** `fn_permissao` e `fn_pode_executar` pertencem ao **modelo
> de permissão morto** descrito no CLAUDE.md Risco 9 — nada as consome. São seguras,
> mas são armadilha: quem as encontrar pode achar que são o mecanismo vigente.

### 8.3 Fluxos pré-login protegidos por token (4)

`aceitar_convite`, `validar_convite`, `redefinir_senha`, `solicitar_reset_senha`

**Precisam ser públicas** — são anteriores à existência da sessão. E estão bem
construídas:

- `aceitar_convite` valida token existente, não usado e não expirado, **antes de
  qualquer efeito**.
- `redefinir_senha` apenas delega para `aceitar_convite`, herdando a mesma guarda.
- `solicitar_reset_senha` **nunca revela se o telefone existe** — devolve sucesso em
  ambos os casos, com o comentário no código explicando que é proposital.

Este é o único ponto do relatório onde vale dizer: **o desenho está melhor do que a
média do sistema.**

---

## 9. Os 31 gatilhos

Retornam `trigger` e **não são invocáveis via PostgREST** — o RPC recusa esse tipo de
retorno. Rodam só quando o Postgres os dispara, no contexto da transação que os
provocou.

Ser `SECURITY DEFINER` aqui é **necessário e correto**: o gatilho precisa escrever em
tabelas de histórico e auditoria que o usuário que provocou a operação não pode
alterar diretamente. É exatamente o caso de `fn_auditoria_exclusao`,
`gov_registrar_historico` e `locais_auto_historico`.

**Nenhum deles entra na contagem de risco.**

---

## 10. Limitações deste levantamento

Três, todas relevantes para quem for agir sobre o relatório:

1. **A exposição pública foi confirmada no catálogo, não por chamada real.** A
   tentativa de executar as duas funções críticas com a chave anônima foi bloqueada
   pelo ambiente. A prova disponível é conclusiva no nível do código — `prosecdef =
   true`, `EXECUTE` concedido a `PUBLIC`, e ausência de qualquer guarda no corpo —
   mas **a confirmação empírica ainda deve ser feita**:

   ```bash
   curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/agenda_pastoral_proximos_dias" -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{"p_dias":30}'
   ```

   Se voltar dado, está confirmado. Se voltar erro de permissão, o catálogo está
   sendo contrariado por alguma configuração do PostgREST e **este relatório precisa
   ser revisto**.

2. **A detecção de escrita é textual.** Procurou `insert into`, `update ` e
   `delete from` no corpo. SQL dinâmico montado em string **não seria detectado**.
   Nenhuma das 112 aparenta usar `EXECUTE` dinâmico, mas não foi verificado uma a uma.

3. **"Finalidade aparente" e "módulo" foram inferidos do nome e das tabelas
   acessadas**, não de documentação. Onde a decisão depender da finalidade real,
   confirmar lendo a função.

---

## 11. O que fazer antes de qualquer funcionalidade nova

Em ordem, e o total é **menos de um dia de trabalho**:

1. **`REVOKE EXECUTE ... FROM PUBLIC, anon`** nas 2 funções críticas. Uma linha cada,
   não quebra tela nenhuma. *Minutos.*
2. **Confirmar empiricamente** com o `curl` acima, antes e depois. *Minutos.*
3. **Guarda de papel nas 12 escritoras**, começando por `fin_seed_centros_custo` e
   `fiscal_marcar_atrasados`, que não pedem argumento e agem em massa. *Meio dia,
   depois de a igreja definir o papel de cada uma.*
4. **Decidir sobre as 33 sem dono** — apagar ou documentar. *Entra no achado 18 da
   Auditoria Técnica.*

**A resposta à pergunta que originou este relatório:** o banco **não** está cheio de
portas abertas. Tem duas, e ambas fecham com uma linha de SQL cada. O trabalho de
verdade são as 12 escritoras — e esse depende de uma decisão da igreja sobre quem
pode o quê, não de engenharia.

---

*Levantamento por leitura do catálogo (`pg_proc`, `pg_namespace`,
`information_schema`) do banco de produção, cruzado com as 80 chamadas `.rpc()`
encontradas em `src/`. Nenhuma função, política, permissão ou linha de código foi
alterada.*
