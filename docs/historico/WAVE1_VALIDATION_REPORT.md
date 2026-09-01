# WAVE1_VALIDATION_REPORT.md — DiakoniaApp

Validação das **13 correções de escrita** da Onda 1
([WAVE1_IMPLEMENTATION_REPORT.md](./WAVE1_IMPLEMENTATION_REPORT.md)) contra banco real.

**Data:** 25/08/2026 · **Ambiente:** Supabase local reconstruído do baseline

---

# 1. Resultado

**As 13 correções estão certas. `lideranca` é barrada em silêncio nas 9 operações — e
agora o sistema avisa.**

| # | Ponto corrigido | Operação | admin | secretaria | **lideranca** |
|---|---|---|---|---|---|
| 1 | `VisitanteDialog.tsx:132` | `DELETE visitas` | 1 | 1 | **0** |
| 2 | `MembroForm.tsx:540` | `DELETE membros` | 1 | erro¹ | **0** |
| 3 | `VinculosDialog:101` + 2 outros | `DELETE vinculos_familiares` | 1 | 1 | **0** |
| 4 | `VinculosDialog.tsx:108` | `UPDATE` parentesco | 1 | 1 | **0** |
| 5 | `VinculosDialog.tsx:122` | `UPDATE` responsável | erro² | erro² | **0** |
| 6 | `Familias.tsx:143` + `familiaService:141` | `UPDATE familias` | 1 | 1 | **0** |
| 7 | `Familias.tsx:212` | `DELETE familias` | 1 | 1 | **0** |
| 8 | `LgpdAdmin.tsx:172` | `UPDATE solicitacoes_lgpd` | 1 | 1 | **0** |
| 9 | `userService:221` + `acessoService:265` | `UPDATE profiles` alheio | 1 | **0** | **0** |

*Linhas afetadas. **0 = a RLS barrou sem levantar erro** — exatamente o que
`conferir()` passou a detectar. Cada teste rodou em transação própria, revertida.*

**A previsão do plano se confirmou inteira:** `lideranca` falha em tudo, `secretaria`
falha só em `profiles`, `admin` passa.

---

# 2. Como foi medido

Para cada ponto, a **mesma operação que a tela executa**, simulando o papel:

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"<uuid do usuário>"}', true);
SET LOCAL ROLE authenticated;
WITH x AS (DELETE FROM public.visitas WHERE id='…' RETURNING 1) SELECT count(*) FROM x;
ROLLBACK;
```

O `RETURNING` + `count(*)` é **precisamente o que `.select("id")` devolve** e o que
`conferir()` inspeciona. Se conta zero, a tela dizia "pronto" e nada acontecia.

**Semente:** 3 usuários (`admin`, `secretaria`, `lideranca`), 6 pessoas, 3 famílias,
5 vínculos, 2 visitas, 2 solicitações LGPD. Nomes inventados, telefones de teste.

---

# 3. Os dois `erro` — e por que são boa notícia

Ambos são **ruidosos**, não silenciosos. O `if (error)` que já existia no código os
pega; não precisavam de `conferir()`.

## ¹ `DELETE membros` como secretaria

```
ERROR: Apenas administradores podem excluir contatos. Utilize o status para inativar.
```

**Um gatilho, não a política de RLS.** A política de `membros` permite
`admin`+`secretaria`, mas um gatilho estreita para admin — **com uma mensagem escrita
para quem está na secretaria**, não para quem lê log.

**Isto corrige uma análise minha.** O
[WAVE1_IMPLEMENTATION_PLAN.md](./WAVE1_IMPLEMENTATION_PLAN.md) §2 disse que `membros`
`DELETE` era permitido a `admin, secretaria`, lendo só as políticas. **Era incompleto:**
há defesa em profundidade, e o gatilho é mais restritivo.

## ² `UPDATE` responsável = true

```
ERROR: duplicate key value violates unique constraint "vinculos_familiares_unico_responsavel"
```

Só pode haver **um responsável por família**. Meu teste tentou marcar um segundo sem
limpar o primeiro — e é exatamente por isso que o código real faz em dois passos.

**A constraint valida o desenho de `definirResponsavel`.**

---

# 4. Os dois casos de borda — a decisão de NÃO conferir estava certa

Duas linhas ficaram deliberadamente sem `conferir()`. O teste confirma o porquê:

| Caso | Operação | Como **admin**, que pode tudo |
|---|---|---|
| `VinculosDialog.tsx:117` | Limpar responsável de família **sem responsável** | **0 linhas** |
| `Familias.tsx:210` | Apagar vínculos de família **sem vínculos** | **0 linhas** |

**Zero linhas como administrador.** Se `conferir()` estivesse ali, teria dito *"não foi
salvo — seu perfil não tem permissão"* **para quem tem todas as permissões**.

Seria erro falso na cara do usuário, e das piores espécies: ensina a equipe a ignorar o
aviso.

## E o `CASCADE` confirmado

```
vínculos antes:  3
DELETE FROM familias  →  DELETE 1
vínculos depois: 0
```

Apagar a família **remove os vínculos sozinha**, no banco. A linha 210 é redundante,
como estava documentado — e falhar nela em silêncio não deixa órfão.

---

# 5. Um terceiro defeito do baseline, encontrado ao tentar USAR o banco

Antes de qualquer teste da Onda 1, toda operação falhou:

```
ERROR: permission denied for table visitas
HINT: Grant the required privileges to the current role with:
      GRANT SELECT, DELETE ON public.visitas TO authenticated;
```

## O que faltava

O baseline trazia os 1.966 `GRANT EXECUTE` das funções e **nenhum privilégio de
tabela**.

| Papel | Produção | Reconstruído (antes) |
|---|---|---|
| `anon` | 158 relações | **0** |
| `authenticated` | 173 relações | **0** |
| `service_role` | 173 relações | **0** |

**Um banco reconstruído seria inutilizável pela aplicação.** A RLS só é avaliada
*depois* do privilégio de tabela — sem `GRANT`, nenhuma política chega a rodar.

## Por que as verificações anteriores não viram

A Fase 4b conferiu **nove dimensões de objetos** — tabelas, funções, políticas,
índices. Todas batiam. **Privilégio de tabela não é objeto: é permissão sobre objeto**,
e não estava na conta.

**Só apareceu ao tentar usar o banco**, não ao inventariá-lo.

## Correção

**Bloco `11c` — 504 instruções `GRANT`** (158 + 173 + 173). Após a correção, os três
papéis batem exatamente com produção.

---

# 6. Um achado sobre a semente: a igreja-âncora

O primeiro `INSERT` de pessoa falhou:

```
ERROR: insert or update on table "membros" violates foreign key constraint
       "membros_igreja_id_fkey"
DETAIL: Key (igreja_id)=(00000000-0000-0000-0000-000000000001)
        is not present in table "igrejas".
```

`src/lib/igreja.ts` fixa esse UUID como default de coluna, e **11 tabelas têm chave
estrangeira para `igrejas`**. Sem essa linha, o banco não aceita cadastro nenhum.

**É dado, não estrutura** — então corretamente fora do baseline. Mas **é pré-requisito
de qualquer ambiente novo**, e agora está registrado.

---

# 7. O que isto prova, e o que não prova

## Prova

- **As 13 correções detectam o que antes passava em silêncio.** Nove operações, zero
  linhas para `lideranca`, em todas.
- **A correção não tirou permissão de ninguém.** `admin` continua passando em tudo que
  passava.
- **As duas exceções deliberadas estavam certas.** Zero linhas como admin nos dois
  casos de borda.
- **O sistema tem defesa em profundidade** — gatilho e constraint pegam o que a
  política não pega, e com mensagem legível.

## Não prova

- **Que o `toast.error` apareça com o texto certo em cada tela.** A aplicação foi
  executada (§8) e o comportamento de acesso foi verificado, mas as nove mensagens não
  foram vistas uma a uma — ver §10.
- **Os outros 152 pontos desprotegidos** do
  [WRITE_VALIDATION_AUDIT.md](./WRITE_VALIDATION_AUDIT.md). A Onda 1 cobriu 13.

---

# 8. A camada de tela — e o achado que reordena as prioridades

A aplicação foi executada contra o ambiente local, com login real de Carla Liderança.
E aí apareceu algo que o teste de banco não podia mostrar.

## 8.1 A tela de Famílias, para `lideranca`, vem vazia

```
Famílias
0 núcleos familiares
Nenhuma família cadastrada
```

**Havia três famílias na semente.** `lideranca` não as vê — a política de `SELECT`
de `familias` cobre `admin`, `diakonia` e `secretaria`.

**Consequência:** a falha silenciosa que provei no banco **não é alcançável por
`lideranca` pela interface**. Ela nunca chega ao botão, porque a lista está vazia.

## 8.2 A pergunta certa: quem lê, mas não escreve?

Medido, papel a papel, com linhas reais:

| Tabela | Leem | Escrevem |
|---|---|---|
| `familias` | admin, diakonia, secretaria | admin, diakonia, secretaria |
| `vinculos_familiares` | admin, diakonia, secretaria | admin, diakonia, secretaria |
| `visitas` | admin, diakonia, secretaria | admin, diakonia, secretaria |
| `solicitacoes_lgpd` | admin, secretaria | admin, secretaria |
| `membros` | admin, diakonia, membro, pastor, secretaria, voluntario | **os mesmos + lideranca, operador** |

**Nestas cinco tabelas, quem lê também escreve.** Não existe hoje um papel que veja a
tela e falhe ao salvar.

## 8.3 A exceção — e é justamente `profiles`

| Papel | Lê `profiles` | Escreve `profiles` |
|---|---|---|
| `admin` | 3 | **1** |
| `secretaria` | 3 | **0** |
| `lideranca` | 3 | **0** |

**Aqui a falha silenciosa é real e alcançável pela tela.** Uma pessoa da secretaria
abre a gestão de usuários, **vê os perfis**, tenta criar ou editar um acesso — e nada
acontece.

São exatamente as duas correções em `userService.ts:221` e `acessoService.ts:265`.

## 8.4 O que isto significa para as 13 correções

**Não invalida nenhuma.** Reordena a urgência:

| Correções | Situação hoje |
|---|---|
| **2 em `profiles`** | **Protegem um defeito que acontece agora**, para secretaria e liderança |
| 11 nas demais tabelas | Protegem contra bloqueio que a RLS faria — mas hoje **quem alcança a tela também consegue gravar** |

**As 11 continuam valendo**, por três razões concretas:

1. **`DELETE membros` já é o caso.** Um gatilho barra a secretaria com mensagem clara —
   e o dia em que alguém trocar o gatilho por política, o erro vira silencioso.
2. **Política muda; código não acompanha sozinho.** O `conferir()` não presume: mede.
3. **O custo é zero.** Já está escrito.

**A conclusão honesta:** o risco medido no
[WRITE_VALIDATION_AUDIT.md](./WRITE_VALIDATION_AUDIT.md) — 54 escritas em tabela
restritiva — é menor na prática do que a contagem sugeria, **porque a leitura costuma
estar restrita junto com a escrita**. Cruzar escrita com política foi um avanço;
cruzar também com a **política de leitura** teria afinado mais.

Fica registrado como método para a Onda 2.

---

# 9. Dois achados laterais da navegação

**`VisitanteDialog` não abre pela tela de Visitantes.** A prop `onOpen` é passada ao
`VisitanteCard` três vezes (linhas 294, 324, 340 de `Visitantes.tsx`) e **o componente
nunca a chama**. O diálogo só é alcançável por `/membros`.

É defeito pré-existente, não introduzido pelas correções — mas significa que
`VisitanteDialog.tsx:132` está fora de alcance a partir de `/visitantes`.

**O portão de LGPD funciona como documentado.** Após o login, o desvio para
`/aceite-lgpd` aconteceu; o aceite gravou e liberou. Confirma o §5.8 do CLAUDE.md.

---

# 10. Próximo passo

**A aplicação foi executada** contra o ambiente local, com login real. O que resta,
por ordem de valor:

1. **Testar as duas correções de `profiles` pela tela**, entrando como Bruno
   Secretaria (`(21) 90000-0002`) e tentando criar um acesso em `/usuarios`. É o único
   ponto onde a falha silenciosa é alcançável hoje — e onde a correção tem efeito
   imediato e visível.
2. **Commit das 13 correções.** Validadas na camada de banco, com a de maior impacto
   prático identificada.
3. **Aplicar o método da §8.2 à Onda 2** — cruzar escrita com política de **leitura**,
   não só de escrita. Foi o que reordenou as prioridades aqui.

---

## Como usar o ambiente que ficou montado

```bash
npx supabase start          # se estiver parado
npm run dev                 # já aponta para o local, via .env.local
```

**Usuários de teste** (senha `Teste@2026`):

| Telefone | Nome | Papel |
|---|---|---|
| (21) 90000-0001 | Ana Administradora | `admin` |
| (21) 90000-0002 | Bruno Secretaria | `secretaria` |
| (21) 90000-0003 | Carla Liderança | `lideranca` |

**Para voltar a apontar para produção:** apagar `.env.local` e reiniciar o servidor.
**Para derrubar o ambiente:** `npx supabase stop`.

> O `.env.local` está coberto pelo `.gitignore` (regra `*.local`). A semente está
> versionada em `supabase/seed.sql`.

---

*Validação executada contra Supabase local reconstruído do baseline. Testes de banco
em transação revertida; a semente permaneceu intacta. A aplicação foi exercitada com
login real. Nenhuma consulta de escrita tocou produção. Nenhum código de aplicação
foi alterado.*
