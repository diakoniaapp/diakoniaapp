# WAVE1_IMPLEMENTATION_PLAN.md — DiakoniaApp

Plano de implementação da **Onda 1** definida no
[WRITE_VALIDATION_PRIORITY_PLAN.md](./WRITE_VALIDATION_PRIORITY_PLAN.md).

> **Nenhuma linha de código foi alterada.** Este documento prepara a execução.

---

## 1. A Onda 1 tem 21 ocorrências, não 23

Ao ler o código de cada uma das 23, **duas se revelaram decisões deliberadas, com o
motivo escrito no comentário logo acima**. Não são esquecimento, e corrigi-las seria
contrariar uma decisão tomada com razão declarada.

| Ocorrência | Operação | O que o comentário diz |
|---|---|---|
| `components/membros/ProximaAcaoCard.tsx:106` | update em `membros` | *"…se a política barrar, nada de substantivo se perde — e falhar a ação inteira por causa de um carimbo seria pior que não carimbar. O que importa (o histórico, logo abaixo) tem política própria."* |
| `services/escalaService.ts:286` | update em `escala_voluntarios` | *"Sem conferir: é um carimbo de 'já mandei mensagem'. Se falhar, o líder manda de novo — derrubar a ação por causa do carimbo seria pior."* |

**As duas seguem o mesmo raciocínio, e ele está certo:** são carimbos secundários. O
dado que importa é gravado logo ao lado, com conferência. Derrubar a operação inteira
por causa do carimbo trocaria uma falha silenciosa inofensiva por uma falha ruidosa
prejudicial.

**Recomendação: não mexer.** Se algum dia quiserem visibilidade, o caminho é registrar
em log, não interromper o fluxo.

> Isto é exatamente o que o CLAUDE.md §9 avisa: *"Muitos comentários avisam
> explicitamente contra a mudança que parece óbvia."* Uma varredura automática as
> teria "corrigido".

**Onda 1 = 21 ocorrências em 11 arquivos.**

---

## 2. Quem realmente falha — e é mais estreito do que parecia

O relatório anterior marcou cada tabela como "exige `is_admin()`" ou "exige papel".
Somando as políticas com OR — como manda o ARCHITECTURE.md §4.4 — o quadro fica preciso.

**Os 6 usuários têm 3 papéis atribuídos: `admin` (1), `secretaria` (1), `lideranca` (1).**

| Tabela · operação | Quem PODE | Quem falha em silêncio hoje |
|---|---|---|
| `familias` · delete | admin, secretaria | **lideranca** |
| `familias` · update | admin, secretaria, diakonia | **lideranca** |
| `membros` · delete | admin, secretaria | **lideranca** |
| `profiles` · update | **admin, ou o próprio dono do perfil** | **secretaria e lideranca, sobre perfil alheio** |
| `profiles` · upsert | **admin, ou o próprio dono do perfil** | **secretaria e lideranca, sobre perfil alheio** |
| `solicitacoes_lgpd` · update | admin, secretaria | **lideranca** |
| `vinculos_familiares` · delete | admin, secretaria | **lideranca** |
| `vinculos_familiares` · update | admin, secretaria, diakonia | **lideranca** |
| `visitas` · delete | admin, secretaria | **lideranca** |

**A conclusão que isto permite:**

- **`lideranca` é quem mais sofre.** Não pode apagar vínculo familiar, família,
  pessoa nem visita, e não pode alterar família nem solicitação de LGPD. **Todas essas
  telas dizem "pronto" para essa pessoa.**
- **`profiles` é o caso mais restrito:** só `admin`, ou o próprio dono do perfil.
  Toda escrita de `userService` e `acessoService` sobre perfil alheio falha para
  `secretaria` e `lideranca`.
- **`membros` UPDATE não falha para ninguém** dos papéis em uso — a migration de
  20/08 acrescentou `lideranca` a `staff_update_membros`. **O comentário em
  `escritaConferida.ts` está desatualizado nesse ponto**: ele diz que a política "não
  inclui `lideranca`". Hoje inclui.

---

## 3. Padrões de correção já existentes no sistema

**`conferir()` já está em uso: 19 vezes, em 10 arquivos.** Não há nada a inventar.

| Arquivo | Usos | Observação |
|---|---|---|
| `services/visitanteService.ts` | 5 | O mais completo — cobre o fluxo de acolhimento inteiro |
| `services/escalaService.ts` | 4 | **Referência direta: a linha 291 está 5 linhas abaixo de uma ocorrência da Onda 1** |
| `components/membros/VisitanteDialog.tsx` | 2 | **Mesmo arquivo de uma ocorrência da Onda 1** (linha 132 vs. 166) |
| `pages/Visitantes.tsx` | 2 | Uso em página, não em serviço |
| `services/permissoesPerfilService.ts` | 2 | Escrita em tabela de permissão |
| `services/ebdService.ts` · `perfilServico.ts` · `efemerideFeita.ts` · `AcolhimentoPanel.tsx` | 1 cada | — |

### O padrão canônico

```ts
const r = conferir(
  await supabase.from("membros").update({ ... }).eq("id", id).select("id"),
  "O status de acolhimento",
);
if (!r.ok) return toast.error(r.erro);
```

E a variante de serviço, que devolve em vez de avisar — `escalaService.ts:291`:

```ts
export async function excluirEscala(escalaId: string): Promise<ResultadoEscrita> {
  return conferir(
    await supabase.from("escalas").delete().eq("id", escalaId).select("id"),
    "A escala",
  );
}
```

**Regra de qual usar:** em `services/`, devolver `ResultadoEscrita`; em componente ou
página, chamar `toast.error(r.erro)`. Os dois padrões já existem — basta seguir o do
arquivo vizinho.

---

## 4. As 21 ocorrências, agrupadas por arquivo

### `src/components/familias/VinculosDialog.tsx` — 4 ocorrências

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `101` | `remover` | delete | `vinculos_familiares` | `Admin/Sec gerenciam vinculos_familiares` (ALL) OR `admin_delete_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
| `108` | `atualizarParentesco` | update | `vinculos_familiares` | `Admin/Sec gerenciam…` (ALL) OR `staff_update_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
| `117` | `definirResponsavel` | update | `vinculos_familiares` | `Admin/Sec gerenciam…` (ALL) OR `staff_update_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
| `122` | `definirResponsavel` | update | `vinculos_familiares` | `Admin/Sec gerenciam…` (ALL) OR `staff_update_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |

### `src/services/userService.ts` — 4 ocorrências

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `221` | `uid` | upsert | `profiles` | idem UPDATE | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |
| `291` | `tel` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |
| `308` | `erro` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |
| `322` | `erro` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |

### `src/pages/Familias.tsx` — 3 ocorrências

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `143` | `onSubmit` | update | `familias` | `Admin/Sec gerenciam familias` (ALL) OR `staff_update_familias` | **lideranca** | **Perde a família** |
| `210` | `desvinculo` | delete | `vinculos_familiares` | `Admin/Sec gerenciam vinculos_familiares` (ALL) OR `admin_delete_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
| `212` | `desvinculo` | delete | `familias` | `Admin/Sec gerenciam familias` (ALL) OR `admin_delete_familias` | **lideranca** | **Perde a família** |

### `src/services/acessoService.ts` — 3 ocorrências

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `265` | `uid` | upsert | `profiles` | idem UPDATE | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |
| `324` | `msgAmigavel` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |
| `359` | `tel` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |

### `src/services/familiaService.ts` — 2 ocorrências

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `132` | `desvincularPessoa` | delete | `vinculos_familiares` | `Admin/Sec gerenciam vinculos_familiares` (ALL) OR `admin_delete_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
| `141` | `atualizarFamilia` | update | `familias` | `Admin/Sec gerenciam familias` (ALL) OR `staff_update_familias` | **lideranca** | **Perde a família** |

### `src/components/familias/VinculosPessoaDialog.tsx` — 1 ocorrência

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `80` | `remover` | delete | `vinculos_familiares` | `Admin/Sec gerenciam vinculos_familiares` (ALL) OR `admin_delete_vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |

### `src/components/layout/UserMenuButton.tsx` — 1 ocorrência

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `40` | `nomeMembro` | update | `profiles` | `Admin gerencia perfis` (ALL) OR `Usuarios atualizam proprio perfil` OR `user_update_profiles` | **secretaria e lideranca, sobre perfil alheio** | **Identidade de acesso** — e a tabela já tem colunas divergentes (Achado 14) |

### `src/components/membros/MembroForm.tsx` — 1 ocorrência

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `540` | `onDelete` | delete | `membros` | `Admin/Sec gerenciam membros` (ALL) OR `admin_delete_membros` | **lideranca** | **Perde a pessoa.** `membros` é o eixo do domínio — 69 chaves estrangeiras |

### `src/components/membros/VisitanteDialog.tsx` — 1 ocorrência

**`conferir()` já existe neste arquivo (2×)** — importar já está feito

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `132` | `removeVisita` | delete | `visitas` | `Admin/Sec gerenciam visitas` (ALL) OR `admin_delete_visitas` | **lideranca** | **Acolhimento** — a visita não sai da lista |

### `src/pages/LgpdAdmin.tsx` — 1 ocorrência

Precisa acrescentar o import de `@/lib/escritaConferida`

| Linha | Função | Op. | Tabela | Política efetiva | Falha para | Motivo da classificação A |
|---|---|---|---|---|---|---|
| `172` | `atualizarStatus` | update | `solicitacoes_lgpd` | `lgpd_admin_total` (ALL) OR `admin_update_solicitacoes_lgpd` | **lideranca** | **LGPD** — prazo legal de resposta ao titular |

---

## 5. As 5 correções que devem vir primeiro

| # | Ocorrência | Op. | Falha para | Por quê primeiro |
|---|---|---|---|---|
|  | `components/familias/VinculosDialog.tsx:101` | delete `vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
|  | `components/familias/VinculosPessoaDialog.tsx:80` | delete `vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |
|  | `components/membros/MembroForm.tsx:540` | delete `membros` | **lideranca** | **Perde a pessoa.** `membros` é o eixo do domínio — 69 chaves estrangeiras |
|  | `components/membros/VisitanteDialog.tsx:132` | delete `visitas` | **lideranca** | **Acolhimento** — a visita não sai da lista |
|  | `pages/Familias.tsx:210` | delete `vinculos_familiares` | **lideranca** | **Perde o parentesco.** Composição familiar fica errada |

**Justificativa da ordem.** Todas as cinco são `delete` ou `upsert` — as operações que
**perdem informação**. Um `update` barrado deixa o dado velho; um `delete` barrado faz
a tela mentir sobre algo que a pessoa acredita ter removido, e o passo seguinte do
padrão "apaga e recria" estoura chave duplicada.

---

## 6. Destaques pedidos

### `MembroForm.tsx:540` — a mais grave do sistema

```ts
const onDelete = async () => {
  if (!membro) return;
  setBusy(true);
  const { error } = await supabase.from("membros").delete().eq("id", membro.id);
  setBusy(false);
  if (error) {
    // A mensagem crua do Postgres … nao diz nada a quem esta na secretaria.
```

**O tratamento de erro deste bloco é cuidadoso** — há um comentário longo explicando
por que a mensagem de chave estrangeira é traduzida. **O que falta é o outro caso:**
quando a RLS barra, não há erro nenhum, o `if (error)` não entra, e a função segue como
se tivesse apagado.

Falha para `lideranca`. Correção: `.select("id")` e `conferir()`, **mantendo** o
tratamento de chave estrangeira que já existe — os dois casos são diferentes e ambos
precisam existir.

### `VisitanteDialog.tsx:132` — a correção mais barata do plano

```ts
const removeVisita = async (id: string) => {
  const { error } = await supabase.from("visitas").delete().eq("id", id);
  if (error) return toast.error(error.message);
  load();
};
```

**O mesmo arquivo já usa `conferir()` duas vezes**, uma delas 34 linhas abaixo. O
import existe, o padrão existe, a convenção do arquivo existe. **É trocar três linhas.**

### `ProximaAcaoCard.tsx:106` — **não corrigir**

Decisão deliberada. O comentário explica: é carimbo de `updated_at` para sinalizar
atividade; o que importa — o histórico — é gravado logo abaixo com política própria.
**Corrigir isto trocaria uma falha inofensiva por uma interrupção real do acolhimento.**

### Consentimento e LGPD

```
LgpdAdmin.tsx:172 · update solicitacoes_lgpd · falha para lideranca
```

Única ocorrência de LGPD na Onda 1. Marca o pedido do titular como atendido. Se falha,
**a igreja acredita ter respondido dentro do prazo legal e não respondeu**.

> **Nota.** O `insert` em `consentimento` aparece no WRITE_VALIDATION_AUDIT.md, mas
> **não entra na Onda 1**: é INSERT, e INSERT barrado pela RLS levanta erro `42501`.
> Está coberto. O problema do consentimento é outro, e está no fluxo — ver o relatório
> de LGPD.

### As exclusões críticas — 8 `delete` e 2 `upsert`

| Ocorrência | Op. | Tabela | Falha para |
|---|---|---|---|
| `components/familias/VinculosDialog.tsx:101` | delete | `vinculos_familiares` | **lideranca** |
| `components/familias/VinculosPessoaDialog.tsx:80` | delete | `vinculos_familiares` | **lideranca** |
| `components/membros/MembroForm.tsx:540` | delete | `membros` | **lideranca** |
| `components/membros/VisitanteDialog.tsx:132` | delete | `visitas` | **lideranca** |
| `pages/Familias.tsx:210` | delete | `vinculos_familiares` | **lideranca** |
| `pages/Familias.tsx:212` | delete | `familias` | **lideranca** |
| `services/familiaService.ts:132` | delete | `vinculos_familiares` | **lideranca** |
| `services/acessoService.ts:265` | upsert | `profiles` | **secretaria e lideranca, sobre perfil alheio** |
| `services/userService.ts:221` | upsert | `profiles` | **secretaria e lideranca, sobre perfil alheio** |

**Cinco das dez são em `vinculos_familiares`**, em quatro arquivos diferentes — o
mesmo desvínculo implementado repetidas vezes. **É também o melhor candidato a virar
uma função única em `familiaService`**, o que resolveria conferência e duplicação de
uma vez. Fica registrado, não é escopo desta onda.

---

## 7. Plano de implementação

### Etapa 1 · Preparar — meio dia

1. **Subir o ambiente local** (fase 1 do
   [HOMOLOGATION_ENVIRONMENT_AUDIT.md](./HOMOLOGATION_ENVIRONMENT_AUDIT.md)). Testar
   `conferir()` exige **provocar bloqueios de propósito**, e hoje `npm run dev` grava
   em produção.
2. **Criar um usuário de teste com papel `lideranca`** — é o papel que falha em 9 das
   11 combinações. Sem ele, a correção não é verificável.
3. **Avisar a equipe.** As telas vão passar a acusar erro onde antes diziam "pronto".
   É o objetivo — mas sem aviso parece que a correção quebrou o sistema.

### Etapa 2 · Corrigir — 1 dia

Na ordem, começando pelos arquivos que já têm o padrão:

1. `src/components/familias/VinculosDialog.tsx` — 4 ocorrências
2. `src/services/userService.ts` — 4 ocorrências
3. `src/pages/Familias.tsx` — 3 ocorrências
4. `src/services/acessoService.ts` — 3 ocorrências
5. `src/services/familiaService.ts` — 2 ocorrências
6. `src/components/familias/VinculosPessoaDialog.tsx` — 1 ocorrência
7. `src/components/layout/UserMenuButton.tsx` — 1 ocorrência
8. `src/components/membros/MembroForm.tsx` — 1 ocorrência
9. `src/components/membros/VisitanteDialog.tsx` — 1 ocorrência · **padrão já no arquivo**
10. `src/pages/LgpdAdmin.tsx` — 1 ocorrência

**Regra por camada:** em `services/` devolver `ResultadoEscrita`; em componente e
página, `toast.error(r.erro)`.

**Cuidado em `Familias.tsx:210-212` e `familiaService.ts:132`:** são o padrão
"apaga em cascata". Conferir **cada** `delete` separadamente — se o primeiro falhar e o
segundo não for tentado, a família fica sem vínculos mas existindo.

### Etapa 3 · Verificar — meio dia

1. **Com o usuário `lideranca`**, percorrer as 11 telas e confirmar que cada uma
   **acusa erro** em vez de dizer "pronto".
2. **Com `admin`**, confirmar que tudo continua funcionando — a correção **não muda
   permissão de ninguém**, só torna visível o que já acontecia.
3. Rodar `npx tsc --noEmit -p tsconfig.app.json` — **nunca sem `-p`** (Risco 1).

---

## 8. Esforço

### Por arquivo

| Arquivo | Ocorr. | Padrão no arquivo? | Esforço |
|---|---|---|---|
| `components/familias/VinculosDialog.tsx` | 4 | não | ~1 h |
| `services/userService.ts` | 4 | não | ~1 h |
| `pages/Familias.tsx` | 3 | não | ~1 h |
| `services/acessoService.ts` | 3 | não | ~1 h |
| `services/familiaService.ts` | 2 | não | ~30 min |
| `components/familias/VinculosPessoaDialog.tsx` | 1 | não | ~30 min |
| `components/layout/UserMenuButton.tsx` | 1 | não | ~30 min |
| `components/membros/MembroForm.tsx` | 1 | não | ~30 min |
| `components/membros/VisitanteDialog.tsx` | 1 | sim | ~15 min |
| `pages/LgpdAdmin.tsx` | 1 | não | ~30 min |

### Por módulo

| Módulo | Ocorrências | Esforço | Impacto esperado |
|---|---|---|---|
| **Membros e famílias** | 12 | ~2 h | Fim da perda silenciosa de pessoa, família e parentesco |
| **Acesso e identidade** | 9 | ~2 h | Estado de acesso deixa de divergir; prazo de LGPD deixa de ser presumido |
| **Acolhimento** | 1 | ~15 min | Visita não some da lista sem ter saído |
| **Total** | **21** | **~2 dias** com preparo e verificação | — |

### Impacto esperado

| Antes | Depois |
|---|---|
| 10 operações que perdem informação falham em silêncio | Todas acusam erro com frase que diz **a quem pedir** |
| `lideranca` vê "pronto" em 9 de 11 telas onde nada acontece | `lideranca` sabe imediatamente que precisa da secretaria |
| Padrão `conferir()` em 10 arquivos | Em 21 arquivos — passa a ser **a norma visível** |

**A correção não concede permissão a ninguém.** Quem podia gravar continua podendo;
quem não podia continua não podendo. **O que muda é que a pessoa passa a saber** — como
diz o comentário do próprio `escritaConferida.ts`.

---

## 9. Riscos da execução

| Risco | Mitigação |
|---|---|
| Telas passam a mostrar erro onde não mostravam | **É o objetivo.** Avisar a equipe na etapa 1 |
| Corrigir uma decisão deliberada | As 2 identificadas estão fora. **Ler o comentário acima de cada linha antes de alterar** |
| Cascata parcial em `Familias.tsx` | Conferir cada `delete` separadamente; decidir o que fazer se o primeiro falhar |
| Testar em produção | Etapa 1 exige ambiente local **antes** de começar |
| Política mudar e invalidar a análise | `conferir()` **não presume, mede** — continua correto se a política mudar |

---

*Derivado do WRITE_VALIDATION_PRIORITY_PLAN.md, com leitura do código de cada uma das
23 ocorrências e das políticas de RLS de 7 tabelas no banco de produção. Nenhuma linha
de código, migration, política ou dado foi alterado.*
