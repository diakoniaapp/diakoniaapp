# DiakoniaApp — Documentação Completa do Sistema

> **Propósito deste documento.** Consolidar, num arquivo só e autossuficiente, tudo
> o que é preciso saber sobre o DiakoniaApp — para leitura por uma pessoa nova ou
> por um assistente de IA sem acesso ao repositório. Consolida `CLAUDE.md`,
> `ARCHITECTURE.md`, os arquivos de `docs/` e o histórico de desenvolvimento.
>
> **Data de referência:** 10 de setembro de 2026. Onde um número foi contado em
> produção, ele está escrito; onde é estimativa ou não foi verificado, está dito.
>
> **Aviso sobre datas.** Vários números neste documento (contagem de tabelas,
> políticas, arquivos, usuários) foram medidos em levantamentos de agosto/2026 e
> podem ter mudado. O sistema está em desenvolvimento intenso e diário.

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Stack e infraestrutura](#2-stack-e-infraestrutura)
3. [Arquitetura](#3-arquitetura)
4. [Autenticação e autorização](#4-autenticação-e-autorização)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Mapa do código](#6-mapa-do-código)
7. [Módulos funcionais](#7-módulos-funcionais)
8. [Painéis de trabalho](#8-painéis-de-trabalho)
9. [Rotas](#9-rotas)
10. [Padrões obrigatórios e armadilhas](#10-padrões-obrigatórios-e-armadilhas)
11. [Riscos conhecidos e dívida técnica](#11-riscos-conhecidos-e-dívida-técnica)
12. [A Bússola — plano diretor de 12 meses](#12-a-bússola--plano-diretor-de-12-meses)
13. [Como rodar e verificar](#13-como-rodar-e-verificar)
14. [Glossário](#14-glossário)
15. [Histórico recente de desenvolvimento](#15-histórico-recente-de-desenvolvimento)

---

## 1. Visão geral

### 1.1 O que é

**DiakoniaApp** é o sistema de gestão da **Quarta Igreja Batista do Rio de Janeiro
(QIBRJ)**. É uma aplicação web de página única (SPA) escrita em React, que fala
diretamente com o Supabase (Postgres + autenticação + storage). **Não há backend
próprio** além de duas Edge Functions recentes para automação.

- **Repositório:** https://github.com/diakoniaapp/diakoniaapp (branch `main`)
- **Hospedagem:** Vercel, publicação a partir de `main`
- **Banco:** Supabase, projeto `prjoftmlkusbjoeptabp` — **é produção; não existe
  ambiente de homologação**
- **Não é AppSheet.** Uma versão anterior do sistema rodava em AppSheet; artefatos
  `.xlsx` e `.sql` dessa época ainda estão na pasta, mas o produto ativo é o app
  React.

### 1.2 Para quem

Administração, secretaria, tesouraria, pastor titular, liderança de ministérios e
áreas, professores da EBD, líderes de pequenos grupos e diáconos. **Não há
aplicativo voltado ao membro comum** ainda — a regra de acesso do membro comum
está desenhada no banco (vê só a própria ficha, a agenda sem editar, recebe
convites para servir/EBD/PGM), mas não há tela dedicada a ele.

Contas reais em produção (medido em 04/09/2026): **25 contas**, das quais só 4
ativas de fato (Telma — `admin`+`diakonia`; Lourdes — `secretaria`; Lúcio —
`pastor`; Bruno — `tesouraria`). As outras 21 são contas de líderes criadas
dormentes e **ainda não entregues** — decisão explícita da direção: "não vamos
enviar acessos agora, pois estamos construindo o sistema".

### 1.3 Que problema resolve

Informação espalhada e não acionável. O sistema é orientado a **cuidado
pastoral**, não a relatório: quem chegou e não foi procurado, quem está servindo
demais, quem passou da faixa etária da classe de EBD, qual família assistida
parou de vir buscar a cesta.

**Filosofia do produto, em três frases:**

1. **A frase, não o número.** Nenhuma tela abre com uma parede de estatísticas —
   abre com uma frase em português dizendo o que fazer primeiro.
2. **Um bloco some quando não há nada a fazer.** O painel pessoal (Home) é uma
   lista de tarefas: o que está feito sai da tela. (As "bancadas de trabalho" —
   Painel Pastoral, da Secretaria, da Tesouraria — são a exceção: mantêm a seção
   visível dizendo "em ordem", porque um rebanho de zero pessoas seria a notícia
   mais importante da tela.)
3. **A bancada reconhece o papel, não o módulo.** Um pastor nunca vê uma tela
   pensada para tesouraria; vê seu recorte, decidido de propósito.

---

## 2. Stack e infraestrutura

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript — **modo não estrito** (`strictNullChecks: false`, `noImplicitAny: false`, `noUnusedLocals: false`) |
| UI | React 18.3 · shadcn/ui sobre Radix UI (~30 primitivos) · lucide-react (ícones) |
| Build | Vite 5 · saída estática · `@vitejs/plugin-react-swc` |
| Rotas | react-router-dom 6 — ~100 rotas declaradas |
| Estilo | Tailwind 3 + tokens de cor HSL em `src/index.css` · dois temas (claro é o padrão institucional) |
| Formulários | react-hook-form + zod |
| Datas | date-fns + date-fns-tz · fuso `America/Sao_Paulo` fixado em funções do banco |
| Recorrência | rrule (eventos recorrentes) |
| Gráficos | recharts — **só em 2 telas**: `financas/DashboardExecutivo` e `PainelEstrategico` |
| Mapa | leaflet + react-leaflet — mapa de famílias por bairro |
| PDF / OCR | pdfjs-dist + tesseract.js — leitura de nota fiscal impressa na ingestão de documentos fiscais |
| Exportação | jszip + file-saver |
| Avisos | **sonner** — é o padrão. **Nunca `alert()`, `confirm()` ou `prompt()`** |
| Paleta de comandos | cmdk (Ctrl/Cmd+K) |
| Estado servidor | `@tanstack/react-query` instalado mas **pouco usado** — o padrão predominante é `useState` + `useEffect` chamando o serviço |
| PWA | vite-plugin-pwa (manifest + service worker desde 08/09/2026) — instalável no Android/Chrome; iOS continua manual |
| Dados | `@supabase/supabase-js` — único cliente de dados, auth e storage |

### 2.1 Infraestrutura de backend (desde 09/09/2026)

Até 09/09/2026 o sistema só sabia **puxar** (a pessoa entra, o painel mostra o que
importa). A primeira peça de **empurrar**:

- **`supabase/functions/resumo-semanal/`** — Edge Function Deno que manda um
  resumo por e-mail toda sexta às 18h de Brasília (21h UTC), via **Resend**.
  Implantada com `--no-verify-jwt` (alcançável por qualquer um com a URL — por
  isso a resposta nunca devolve dado real, só confirma a ação).
- **`pg_cron` + `pg_net`** habilitados nesta data. Agendamento via
  `cron.schedule(nome, cron_expr, $$ SELECT net.http_post(...) $$)`.
- Os números do resumo vêm de `resumo_semanal_digest()` (função SQL), que
  reaproveita as RPCs que os painéis já usam.
- **Estado:** domínio `diakoniaapp.com.br` verificado no Resend (DKIM+SPF),
  remetente `resumo@diakoniaapp.com.br`, primeiro envio real de teste feito em
  09/09/2026. Falta uma sexta-feira de disparo automático real para validar o
  cron antes de expandir a outros papéis.

### 2.2 Integrações externas

- **Supabase** — único serviço de dados.
- **Vercel** — publicação.
- **Resend** — e-mail transacional (resumo semanal).
- **WhatsApp** — por **link**, não por API. O sistema monta a mensagem e abre o
  WhatsApp; quem envia é a pessoa; nenhuma resposta volta. Desde 10/09/2026 o
  usuário escolhe entre **WhatsApp Web** (`web.whatsapp.com/send`) e **aplicativo**
  (`wa.me`) numa preferência local, no menu do usuário. Lógica central em
  `src/lib/whatsapp.ts` (`montarLinkWhatsApp`).
- **ViaCEP** — busca de endereço por CEP no cadastro.
- **Geocodificação** — `services/geocodificacaoService.ts` (provedor não
  verificado neste documento).
- **Não há**: gateway de pagamento, mensageria própria, WhatsApp Business API.

---

## 3. Arquitetura

### 3.1 A forma

**SPA React servida como estático, falando direto com o Supabase.**

```
Navegador (React 18 + Vite)
        │  supabase-js
        ▼
Supabase ── PostgREST (REST + RPC) ──┐
         ── GoTrue (autenticação)    ├── PostgreSQL
         ── Storage (10 buckets)     ┘   ~143 tabelas · ~30 views
                                         ~397 funções · ~476 políticas RLS
                                         ~123 gatilhos · ~114 enums
        ▲
        │ (empurra, desde 09/09/2026)
Edge Function (Deno) ──► Resend  ◄── pg_cron (sexta 18h)
```

### 3.2 Decisões arquiteturais (AD-1 a AD-6)

Nenhuma tem ADR escrito; foram inferidas do código e das migrations.

**AD-1 · Sem backend próprio: o navegador fala com o Postgres.**
Toda leitura e escrita passa por `supabase-js` direto do React. Não há onde
esconder segredo nem impor regra que o cliente não possa burlar. **A segurança é
100% da RLS** — as tabelas têm RLS ligada, sem exceção. O React decide o que
*oferecer*; o banco decide o que *permitir*. Ao criar tabela, criar política
junto — tabela sem política é tabela inacessível.

**AD-2 · A lógica de negócio mora no banco.**
O cálculo pesado é feito em funções SQL. O código chama **~80 RPCs distintas**
(`sugerir_voluntarios_escala`, `esperados_da_classe`, `fin_previsao_caixa`,
`gov_executar_assembleia`, `minhas_permissoes`, `resumo_painel_pastoral`…). Um
bug de regra provavelmente está numa função SQL, não num `.tsx`.

**AD-3 · Mono-inquilino com costura parcial para multi-tenant.**
`src/lib/igreja.ts` fixa `IGREJA_ID = "00000000-0000-0000-0000-000000000001"`.
**Apenas ~15 de ~143 tabelas têm `igreja_id`** (outras 4 têm `congregacao_id`).
Multi-tenant não é troca de constante — é projeto.

**AD-4 · Dois clientes Supabase.**
`integrations/supabase/client.ts` exporta `supabase` (tipado) e `supabaseRel`
(sem inferência de tipos). Selects aninhados com embed
(`.select("funcao, areas(nome, ministerios(nome))")`) fazem o TypeScript estourar
o limite de profundidade (TS2589), contaminando a cadeia inteira. **`supabaseRel`
só com embed; qualquer consulta sem embed usa `supabase`.**

**AD-5 · O painel é um registro, não JSX espalhado.**
`dashboard/widgetRegistry.tsx` declara os widgets com `permissoes[]`,
`prioridade` (0–3) e `paineis[]` (em qual painel o widget aparece). **A ordem
entre widgets de mesma prioridade é a ordem do array** — mover o bloco no arquivo
é mover a tela. `dashboard/quickActionsRegistry.tsx` faz o mesmo para as ações
rápidas (FAB e paleta).

**AD-6 · React Query instalado, pouco usado.**
Isto **não é decisão, é inconsistência**. Ao mexer numa tela, siga o padrão que
já está nela — não converta por conta própria.

### 3.3 A camada de serviços — desejado versus atual

**Padrão desejado:** a tela chama um serviço em `services/`; o serviço fala com o
Supabase.

**Situação real (medida por imports do client):** **~37 arquivos de `pages/` +
~35 de `components/` falam com o banco direto** — mais do que os ~29 de
`services/`. Consequências:

- Ao caçar uma consulta, procurar só em `services/` **não basta**.
- Ao alterar uma regra de leitura, ela pode estar em mais de um lugar.
- Código novo deve pôr a consulta num serviço; **não converter o legado por conta
  própria**.

Há ainda ~6 imports de `components/` para `pages/` — inversão de camada.

---

## 4. Autenticação e autorização

### 4.1 Login por telefone

O login é por **telefone**, não e-mail. O Supabase Auth exige e-mail, então o
sistema fabrica um a partir dos dígitos:

```
(21) 98399-1229  →  5521983991229@app.diakonia
```

Conversão em `pages/Auth.tsx` (`telefoneParaEmail`). **Consequência:** o e-mail em
`auth.users` é sintético e **não serve para contato** — o e-mail real da pessoa
vive em `membros.email`.

### 4.2 Os três portões depois do login

`AppLayout` roda esta cadeia em toda navegação; cada portão desvia e interrompe:

1. `loading?` → mostra "Carregando…"
2. `há user?` → não → `/auth`
3. `user_metadata.must_change_password?` (vem do JWT, não de `profiles`) → sim → `/primeiro-acesso`
4. `sessionStorage["lgpd_ok_{uid}"]` ausente → `/aceite-lgpd`
5. `papeisExigidosPara(pathname)` retorna papéis e `hasRole()` falha → redireciona para `/` com toast

**O aceite de LGPD usa `sessionStorage`, não o banco.** Fechar o navegador faz o
aceite ser pedido de novo. O registro persistente existe (tabela `consentimento`)
mas o portão não a consulta.

### 4.3 Guarda de rota (Risco 5, corrigido em 08/09/2026)

`ROUTE_ROLES` em `components/layout/navConfig.ts` (~20 entradas) é aplicado pelo
`AppLayout`. **Desde 08/09/2026 a guarda casa por PREFIXO** (via
`papeisExigidosPara()`, prefixo mais longo vence) — antes era caminho exato, e
`/financas/*` / `/admin/*` passavam sem checar papel. **Limitação que continua:**
a guarda só age depois de os papéis carregarem; antes disso a tela já renderizou.
**A RLS do banco é o backstop de verdade.**

### 4.4 Papéis e permissões

**Existem dois modelos de permissão no banco e só um está ligado:**

| | |
|---|---|
| **VIVO** | `permissoes` (~39 códigos, ~12 módulos) + `role_permissoes` (~108 concessões). Alimenta `minhas_permissoes()` → `hooks/usePermissoes.tsx` → widgets e ações rápidas; e `tem_permissao()` → ~15 políticas de RLS (arrecadação, manutenção). |
| **MORTO** | `permissoes_modulo` (~72 linhas, grade `pode_ver/pode_criar/pode_editar/pode_excluir`) + funções `fn_permissao`, `fn_contexto_usuario`, `fn_minha_permissao`, `fn_todas_minhas_permissoes`. **Zero políticas e zero código os chamam.** A grade tem a forma ideal para uma tela de caixas de seleção — por isso é armadilha. Mexer nele não muda nada. |

**Onde a decisão realmente mora:**
- ~263 de ~474 políticas nomeiam o papel direto (`has_any_role`, `is_admin`).
- ~15 consultam `tem_permissao()`.
- No React: ~91 pontos com `hasRole` / `canEdit` / `podeEditarPessoas`.

**Papel do usuário mora em `user_roles`.** `profiles.role` existe, **diverge** e
não deve ser lido. `profiles.primeiro_acesso` também mente (`true` para todos).
Use `user_roles.role` e `auth.users.last_sign_in_at`.

**Os papéis, depois da separação de 02/09/2026:**

| papel | é | contas |
|---|---|---|
| `diakonia` | **dono do sistema**, que o constrói. Catálogo inteiro. Atravessa igrejas. Não é perfil que uma igreja concede | 1 (a conta construtora, junto com `admin`) |
| `admin` | pessoa da igreja que **configura o sistema** — todo `gerenciar_*`, as políticas de DELETE | 1 (Telma) |
| `tesouraria` | **opera** o dinheiro: lança, aprova, folha, fiscal, executivo | 1 (Bruno) |
| `pastor` | o pastor titular. Recebeu famílias, vínculos, histórico, visitas, acompanhamento | 1 (Lúcio) |
| `secretaria` | cadastro, governança, membresia | 1 (Lourdes) |
| `lideranca` | líder de ministério/área. **NÃO opera o financeiro**; **vê** governança (atas, assembleias, votos) | 21 contas dormentes |
| `membro` | papel padrão de toda conta nova (`handle_new_user` dá `membro`, não mais `lideranca`) | — |
| `lider`, `operador`, `visualizador`, `voluntario` | **papéis fantasma** no enum `app_role`, sem ninguém usando | 0 |

**Regras de guarda:** `has_role`/`has_any_role` aceitam mais de uma linha por
conta (a conta construtora carrega `diakonia`+`admin` de propósito). O recorte de
liderança por equipe usa **identidade, não papel** — `fn_minhas_areas()`,
`lidero_ministerio_do_modulo('ebd'|'pgm')` — e por isso é **imune ao "Ver como"**
(que troca só o papel). Hook: `src/hooks/usePodeOperarModulo.tsx`.

**Cargo estatutário ≠ perfil de acesso.** `membros.funcoes_ministeriais`
(`secretaria_1`, `secretaria_2`, `tesoureiro`, etc.) é o cargo no estatuto;
`user_roles.role` é o acesso ao sistema. Nada garante que quem ocupa o cargo
tenha a conta. Ao raciocinar sobre "a secretaria", perguntar **qual das duas
noções** está em jogo.

### 4.5 Escrita silenciosa barrada pela RLS

**No Postgres com RLS, um `UPDATE`/`DELETE` que a política BARRA não gera erro —
devolve sucesso com zero linhas afetadas.** Sem `.select()` no fim, "gravou" e
"foi barrado" são indistinguíveis. Remédio: `src/lib/escritaConferida.ts`.

```ts
const r = conferir(
  await supabase.from("tabela").update(patch).eq("id", id).select("id"),
  "O sujeito",
);
if (!r.ok) throw new Error(r.erro); // ou toast.error(r.erro)
```

Auditoria completa de cobertura fechada em 08/09/2026 (~25 arquivos, ~130 pontos
de escrita). **Toda escrita nova usa `conferir()`.** `insert()` não precisa — RLS
bloqueando INSERT (`WITH CHECK`) já devolve erro de verdade.

**Ler uma política isolada engana: políticas permissivas se somam com OR.** Uma
tabela com `ALL: admin+secretaria` e `DELETE: is_admin()` **permite secretaria
apagar**, pela primeira. Convenção sistêmica: **`DELETE` é quase sempre só de
`is_admin()`**, enquanto INSERT/UPDATE aceitam mais papéis — o padrão "apaga tudo
e reescreve" quebra em silêncio para não-admins. Preferir **diferença** (apagar
só o que saiu) ou **encerrar em vez de apagar** (`status='encerrada'` + `data_fim`).

---

## 5. Modelo de dados

### 5.1 `membros` é o eixo de tudo

**~69 chaves estrangeiras apontam para `membros`.** Nenhuma outra tabela chega
perto. Mexer em `membros` ou em `tipo_pessoa` propaga para o sistema inteiro.

```
                          ┌── area_voluntarios ──→ areas ──→ ministerios
                          ├── ebd_matriculas ────→ ebd_classes
        vinculos_         ├── escala_voluntarios ─→ escalas ──→ eventos
familias ←── familiares ──→│
                    MEMBROS├── visita_historico        (contato pastoral)
                          ├── historico_membro        (mudança de vínculo)
                          ├── perfil_servico          (quando pode servir)
                          ├── pgm_membros ──────→ pgm_grupos
                          ├── diaconia_vinculos ──→ áreas da Diaconia
                          └── consentimento           (LGPD)

profiles ──→ auth.users ──→ user_roles ──→ role_permissoes ──→ permissoes
```

**Uma pessoa é uma linha em `membros`, seja ela visitante, congregado ou membro.**
Não há tabela separada de visitantes.

### 5.2 Duas colunas que parecem sinônimos e NÃO são

- **`tipo_pessoa`** (`visitante | congregado | membro`) — o **vínculo** com a
  igreja, em ordem crescente. Cada um tem semântica operacional própria no resto
  do sistema: `visitante` alimenta a fila de acolhimento com prazo; `congregado` é
  quem frequenta sem ser membro; `membro` passou por assembleia.
- **`status`** (`ativo | inativo | transferido | desligado | falecido`) — se a
  pessoa está **presente** na vida da igreja.

Um membro pode estar inativo; um visitante é sempre ativo até deixar de ser
acompanhado. **Filtrar por um pensando no outro é o erro mais fácil deste banco.**

Promoção `visitante → congregado → membro` grava data (`data_congregado`,
`data_membro`, `data_batismo` — historicamente 100% vazias, começaram a ser
preenchidas em 09/2026) e registra em `historico_membro`.

### 5.3 Convenções implícitas do banco

| Convenção | Evidência |
|---|---|
| **Excluir é `ativo = false`**, não apagar | ~40 tabelas têm `ativo`; ~1 tem `deleted_at` |
| **`DELETE` é quase sempre só de admin** | dezenas de tabelas dão INSERT/UPDATE a vários papéis e DELETE só a `is_admin()` |
| **`created_at` quase sempre; `updated_at` às vezes** | ~109 tabelas com `created_at`, ~49 com `updated_at` — **`ebd_campanhas` não tem `updated_at`** |
| **`igreja_id` = UUID fixo como default de coluna** | é assim que o mono-inquilino funciona sem código |
| **Papel do usuário mora em `user_roles`** | `profiles.role` diverge e não deve ser lido |
| **`status_acolhimento` tem default `'novo'`** | "novo" **não indica que algo aconteceu** — é o valor que a coluna nasce tendo; infla o primeiro balde ao contar visitantes por etapa |
| **`membros_excluidos_backup` (~154) e `log_exclusoes` (~214)** guardam quem foi apagado, com dados inteiros em `dados_antes` | antes de concluir que um id órfão é lixo, cruzar com essas duas |

### 5.4 Enums — gêneros diferentes

Um valor inválido em `.in()` **não filtra a mais — o Postgres rejeita a consulta
INTEIRA** ("invalid input value for enum"):

- `atuacao_status` (de `area_voluntarios`): `ativa` / `encerrada`
- `membro_status` (de `membros`): `ativo` (masculino)
- `escala_voluntarios.status`: `pendente | confirmado | recusado | presente`
- `vinculos_familiares.parentesco` (enum `parentesco_tipo`, 13 valores):
  `pai_mae, conjuge, filho, avo, neto, enteado, tutelado, irmao, sogro_sogra,
  genro_nora, sobrinho_sobrinha, cunhado_cunhada, outro`
- `visita_historico.tipo`: **CHECK com lista fechada** — valor novo é recusado
- `tipo_entrada_rol`: `aclamacao | batismo | reconciliacao | transferencia`
  (profissão de fé **não** é forma de entrada — antecede o batismo)

### 5.5 Storage — 10 buckets

`documentos` (priv), `ebd-aulas` (**público**), `ebd-comprovantes` (priv),
`fin-comprovantes` (priv), `fiscal-docs` (priv), `locais-mapas` (**público**),
`membresia-docs` (priv), `pgm-reunioes` (priv), `arrecadacao-nf` (priv, dormente),
`campanhas-materiais` (público, dormente).

### 5.6 Objetos dormentes

**~57 de ~173 objetos do banco nunca são consultados pelo código**, incluindo:
- **módulo PDV inteiro** — 8 tabelas `pdv_*`, zero arquivos em `src/`, RLS ligada
  com **zero políticas** (bloqueia tudo até alguém escrever as políticas);
- ~11 views `v_*` e ~4 `vw_*`;
- `permissoes_modulo` + 4 funções `fn_*` (o modelo morto de permissão);
- 11 tabelas com RLS ligada e zero políticas: `bazar_reservas`,
  `documentos_fiscais`, `fin_solicitacoes`, e as 7 `pdv_*` da configuração.

**Antes de criar qualquer coisa, conferir se já existe.** `pg_stat_user_tables.
n_live_tup` **é estimativa e mente** — sempre `count(*)` antes de dizer que uma
tabela está vazia.

---

## 6. Mapa do código

```
src/
├── pages/          ~75 — uma tela por rota (raiz + arrecadacao/ + financas/)
├── components/     ~150
│   ├── ui/          ~30 — primitivos shadcn/ui — NÃO editar sem motivo forte
│   ├── dashboard/   ~17 — blocos do painel
│   ├── membros/     ~17 — ficha, formulário (6 passos), acolhimento
│   ├── painel/         — Indicador, FaixaDeIndicadores, TituloDaSecao, BlocoRebanho
│   ├── layout/         — AppLayout, UserMenuButton, MobileNavDrawer, navConfig
│   ├── agenda/         — EventDialog, EscalaDialog, EventoViewDialog, AgendaViews
│   ├── ebd/ · pgm/ · financas/ · arrecadacao/ · familias/ · pessoas/ · usuarios/
│   └── hoje/           — vazio.tsx (canal "estou vazio")
├── services/       ~50 — acesso ao banco por domínio (ver §3.3)
├── lib/            ~20 — regras puras, sem React
│   ├── escritaConferida.ts   — conferir() — o padrão mais importante
│   ├── data.ts               — helpers de data locais (hojeLocal, toYmd, parseLocalDate…)
│   ├── whatsapp.ts            — montarLinkWhatsApp (Web vs app)
│   ├── funcaoMinisterial.ts  — cargos, ordem, apelidos, aposentadoria
│   ├── tipoPessoa.ts         — cores dos 3 vínculos
│   ├── igreja.ts             — IGREJA_ID fixo
│   ├── telefone.ts           — normalizarTelefone (garante DDI 55)
│   ├── navUso.ts             — menu que aprende (localStorage)
│   └── agenda/               — recurrence, convite, externalEvents, birthdays…
├── hooks/          ~7 — useAuth, usePermissoes, useTheme, usePodeOperarModulo, use-mobile
├── dashboard/      ~2 — widgetRegistry, quickActionsRegistry
├── hoje/              — tarefaPrincipal.ts (resolvedor da "Sua tarefa")
├── integrations/   ~2 — client do Supabase + types.ts GERADO pela Supabase CLI
└── types/          ~2
supabase/migrations/ ~177 arquivos .sql — fonte da verdade do schema
supabase/functions/  — resumo-semanal (Edge Function Deno)
e2e/                 — 3 specs Playwright (layout)
docs/                — PROJECT_STATE, ROADMAP, DECISIONS, KNOWN_ISSUES, BACKLOG…
```

### 6.1 Arquivos críticos

| Arquivo | Por que é crítico |
|---|---|
| `lib/escritaConferida.ts` | O padrão que impede escrita que mente. **Ler primeiro.** |
| `lib/data.ts` | Helpers de data locais — nunca escrever `.toISOString().slice(0,10)` para "hoje" |
| `hooks/useAuth.tsx` | Papéis (`user_roles`), portões `canEdit` / `podeEditarPessoas` |
| `hooks/usePermissoes.tsx` | RPC `minhas_permissoes()` — decide widgets e ações |
| `hooks/usePodeOperarModulo.tsx` | `hasRole([...]) \|\| lidero_ministerio_do_modulo(...)` — EBD/PGM |
| `integrations/supabase/client.ts` | `supabase` vs `supabaseRel` — ler a nota antes do segundo |
| `dashboard/widgetRegistry.tsx` | Painel inteiro; a ordem do array é a ordem da tela |
| `components/membros/MembroForm.tsx` | **6 passos** (Identificação · Contato · Vínculos · Quando serve · Acesso · Revisão) — o componente mais frágil |
| `components/layout/navConfig.ts` | Fonte única dos grupos de menu, roles, títulos e guards de rota |
| `components/painel/blocos.tsx` | `Indicador` / `FaixaDeIndicadores` / `TituloDaSecao` / `irParaSecao` — padrão reusado em Home, Painel Pastoral, Painel da EBD |
| `index.css` + `tailwind.config.ts` | Tokens de cor nos dois temas |

### 6.2 Padrões estruturais em uso

- **Canal de "estou vazio"** — `components/hoje/vazio.tsx`: o widget avisa a seção
  que não tem o que mostrar, e a seção **se esconde**. Usado por ~12 widgets (só na
  Home; bancadas de trabalho não escondem).
- **Provider único para diálogo global** — `components/membros/ficha.tsx` monta o
  `FichaProvider` uma vez no `AppLayout`; `<NomePessoa>` torna qualquer nome
  clicável (abre a ficha). `Membros`, `Organograma` e `EstruturaDaIgreja` ainda
  usam estado local — migrar quando tocar neles.
- **Padrão de painel** — cabeçalho `sticky`, `FaixaDeIndicadores` **sem número**
  (só ícone + rótulo + seta, `irParaSecao`), seções com `TituloDaSecao`. Decisão
  de 27/08/2026: um algarismo solto no topo compete com o conteúdo e não explica
  nada sozinho.

---

## 7. Módulos funcionais

Estado de cada módulo. **"Pronto e em uso"** = telas prontas + dado real.
**"Construído, aguardando adoção"** = telas prontas, tabelas vazias — a igreja
ainda não começou a usar.

### 7.1 Pessoas / Catálogo / Famílias — pronto e em uso

- `/membros` (Catálogo): ~294 pessoas. Nome abre a ficha (consulta); lápis edita.
  Filtros por tipo e situação. Telefone vira link de WhatsApp.
- **`MembroForm.tsx`** — formulário de 6 passos, usado para cadastrar/editar
  membro, congregado e visitante (prop `tipoInicial`). O passo "Quando serve" só
  aparece se houver área marcada em "Vínculos" (mas o passo **não some** da lista
  — mudar a contagem de passos em tempo real trava a tela). Exclusão definitiva
  vive no passo 1, só admin, com checagem de vínculos em 7 tabelas antes de
  perguntar.
- **Cadastro de visitante unificado (08/09/2026):** existiam dois formulários
  divergentes; `VisitanteRapidoDialog` foi removido, os 3 atalhos (Painel, Início,
  Chamada da EBD) abrem `MembroForm` com `tipoInicial="visitante"` e um botão
  "Cadastrar visitante" que salva já no passo 1.
- **OCR do cartão impresso: tentado e revertido.** Tesseract não lê caligrafia.
  Ficou só o anexo da foto — e essa foto **nunca é salva** (blob local do
  navegador, some ao fechar). Decisão: registrar e seguir.
- `/familias`: ~75 famílias, ~196 vínculos. `/familias` também tem o **mapa por
  bairro** (leaflet) — pino por família (não por pessoa); precisão de rua ou de
  bairro, dita no cartão.
- **Toda pessoa autenticada lê a ficha inteira de todas as ~297 pessoas** (nome,
  telefone, endereço, nascimento, observações pastorais) — a política
  `membros_by_igreja` concede SELECT só conferindo `igreja_id`, que 100% das
  linhas têm. É `true` disfarçado de filtro de inquilino. Fechar isso é mexer
  nessa política + trigger de coluna.

### 7.2 Acolhimento / Visitantes — pronto e em uso

- `/visitantes` e `/visitantes/:id`: ~286 contatos pastorais registrados.
- **`lib/visitantesFluxo.ts`** — as etapas: `boas_vindas` (≤1 dia) → `incentivo`
  (≤3) → `cuidado` (≤7) → `em_acompanhamento` (8–15) → `nao_voltou` (>15);
  `retornou` a partir de 2 visitas. `precisaAcao` corta em 2 dias sem contato — é
  esse corte que alimenta o bloco de Acolhimento.
- Cada visitante novo nasce com **4 tarefas automáticas de acolhimento**
  (boas-vindas, contato, convite, recontato). O motor mostra "% concluído" por
  pessoa e agregado por igreja; desde a Fase 3 da Bússola, também quebrado por
  tipo de tarefa (onde o processo mais falha).
- Cada etapa tem uma **mensagem de WhatsApp pronta**, com versículo, montada por
  `getMensagem(etapa, nome)`.
- A "marca de já cumprimentei" (aniversário, bodas, membresia, pastorado) mora em
  `visita_historico` com tipos `felicitacao_*` — porque `visita_historico` aceita
  escrita de qualquer autenticado e `historico_membro` não.

### 7.3 Ministérios / Áreas / Postos — pronto e em uso

- `/ministerios`, `/ministerios/:id/painel` (Painel do Líder), `/areas`,
  `/organograma`, `/estrutura`. ~120 vínculos ativos em `area_voluntarios`.
- **Ministério → Áreas → Voluntários.** Ex.: área "Recepção" dentro do ministério
  "Comunhão".
- **Posto (03/09/2026)** substitui `area_voluntarios.funcao` (texto livre): novas
  tabelas `area_funcoes` (catálogo por área) e `area_voluntario_funcoes` (quem
  ocupa o quê), lidas por `services/postos.ts` e `ComposicaoPorFuncao.tsx`. **Só
  22 de 135 vínculos migraram** — o resto não é recuperável automaticamente; cada
  líder precisa ligar a equipe pelo próprio painel (`CatalogoDaArea`).
- Cargos de conselho (`auditor`, `juridico_parlamentar`) **não têm nível de
  diretoria** — fiscalizam a diretoria.
- Funções aposentadas (`aposentada: true`) são **lidas mas nunca oferecidas**.
- `ministerio_membros` e `pessoa_participacao` têm **0 linhas** — os vínculos
  reais estão em `area_voluntarios`.

### 7.4 Escalas e voluntários — pronto (motor completo), adoção parcial

**Nada precisa ser criado; o ciclo inteiro existe no banco.** As 6 sprints estão
feitas: disponibilidade → sugestão → escala → confirmação → carga → sinal
pastoral.

- `perfil_servico` — dias/turnos disponíveis, frequência, descanso,
  `areas_preferidas`/`evitar`, restrições. **Tem dados reais preenchidos pela
  Telma.** Políticas: `lideranca` PODE escrever aqui (só da própria equipe, desde
  03/09) — oposto de `membros`.
- `sugerir_voluntarios_escala()` — motor de recomendação com score e **motivo
  legível** ("Fulano, porque está há 80 dias sem servir e tem esta área nas
  preferidas"). Limita a 12 resultados ranqueados.
- `buscarVoluntariosDaArea` (08/09/2026) — busca por nome, ignora o corte de 12.
- Conflito de horário entre áreas: `tsrange` com fim aberto `'[)'` — 10h–12h e
  12h–14h **não** se cruzam.
- `escalas` nasce do evento, pelo botão no `EventDialog`. `EventoViewDialog`
  (08/09/2026) lista os nomes escalados com atalho de WhatsApp direto, sem entrar
  em modo de edição.
- `ultima_escala_em` = data do **evento já acontecido**, não do clique.
- O gatilho `trg_atualizar_carga` mantém carga/sobrecarga sozinho e **cria a linha
  de `perfil_servico`** na primeira escala. **Não preencher à mão.**
- `v_voluntarios_completo` **mente por COALESCE** — `max_escalas_mes`,
  `carga_atual_mes`, `nivel_sobrecarga`, `em_descanso` medem 100% de cobertura e
  não têm dado. Não exibir como medição.
- **Pendente:** catálogo de postos por área (22 de 135); "Minha Escala" pessoal já
  lê `v_minha_escala` na Home, com toque de Confirmar/Recusar desde 09/09/2026.

### 7.5 Agenda / Eventos / Locais — pronto e em uso

- `/eventos` (Agenda), `/locais` (Espaços), `/agenda-pastoral`,
  `/agenda/imprimir`. ~33 eventos.
- **Recorrência tem duas formas no banco:** a **série** (`recorrencia_regra`
  preenchida, uma linha mestre) e a **ocorrência materializada** (regra nula,
  mesmo `recorrencia_id`, criada ao editar uma data). Ocorrências futuras são
  calculadas no cliente por `expandirOcorrencias` (`lib/agenda/recurrence.ts`).
  **A data-âncora (a que `eventos.data` guarda) NÃO é virtual** — tem linha
  própria desde sempre; editá-la toma o caminho de UPDATE direto, não de
  INSERT-como-exceção. `escalasDoEvento` filtra também por `data_evento` porque
  datas não editadas carregam o `evento_id` da série.
- Clique num evento abre **visualização** (`EventoViewDialog`, só leitura + botão
  Editar), não edição direta.
- Calendário no celular igual ao computador (Dia/Semana/Mês/Agenda), desde
  08/09/2026.
- **Transmissão ao vivo é atributo, não tipo:** `eventos.transmissao_online` +
  `transmissao_url` fazem os três estados (presencial / online / híbrido) caírem
  sozinhos. `tipo = 'live'` foi aposentado. O convite (`lib/agenda/convite.ts`)
  monta saudação por horário + assinatura (nome/função/sexo da ficha) + igreja +
  endereço da transmissão (ou atalho `@canal/live`).
- Feriados nacionais e calendário da Convenção Batista vêm de
  `lib/agenda/externalEvents`.

### 7.6 EBD (Escola Bíblica Dominical) — pronto e em uso, redesenhado em 09/2026

- `/ebd` virou **Painel da EBD** (molde do Painel Pastoral: cabeçalho sticky,
  faixa de indicadores sem número). ~84–89 matrículas ativas, 8 classes.
- **Perfil da classe** = faixa etária **e** gênero (`misto|masculino|feminino`).
  `esperados_da_classe` cruza idade real, gênero, professores e matrículas em
  outras classes; inclui membro + congregado + visitante-da-EBD (só quem já
  apareceu numa aula como visitante, `ebd_presencas.eh_visitante`).
- **Professor tem presença à parte** (`ebd_chamada_view` tem grupo `'professor'`);
  quem é professor E matriculado sai do grupo `'matriculado'` e **não conta na
  frequência**. Essa exclusão vale em toda conta de frequência da EBD.
- **Regra "aula sem chamada não é aula em que todos faltaram"** — aula criada mas
  nunca marcada fica fora de todo cálculo de frequência.
- Chamada por toque (sem botão "salvar" — grava no toque). **"Finalizar" é carimbo,
  não cadeado** (`ebd_aulas.fechada`) — continua editável. A tela de chamada
  **avança sozinha** para o próximo domingo em branco quando o último está fechado.
- Relatórios: **por aula** (`EbdAulaRelatorio`), **mensal por classe**
  (`EbdClasseRelatorioMensal`), **geral consolidado** (`EbdRelatorioMensalGeral`,
  com seletor de período semana/mês/ano — RPCs `ebd_relatorio_geral_*` recebem
  `(inicio, fim)`). Todos com impressão + mensagem de WhatsApp. Versículo do
  rodapé varia por faixa etária da classe.
- Indicadores do Painel da EBD: Matriculados, Presença média, Novos alunos,
  Visitantes, **Alcance** (matriculados ÷ elegíveis) e **Não alcançados**
  (não-matriculados ÷ elegíveis) — nomes escolhidos com a Telma depois de várias
  iterações; medem a mesma população elegível por ângulos opostos. Cada indicador
  clicável abre um painel com detalhe por classe.
- **Campanhas da EBD** (`ebd_campanhas`) — meta de arrecadação com prazo, por
  classe (`/ebd/:classeId/campanhas`). Tracking via `ebd_entradas`. Botão
  **"Fechar campanha"** (09/09/2026) alterna `ativo` direto, sem passar pela
  edição. **Não confundir com `campanhas`** (campanhas espirituais/devocionais,
  `/admin/campanhas`) — são tabelas e conceitos diferentes.
- **RLS da EBD:** as 7 políticas `ebd_*_modify_lider` tinham `WITH CHECK (true)`
  (qualquer autenticado dava INSERT) — corrigido em 09/09/2026
  (`20260909170000`).

### 7.7 PGM (Pequenos Grupos Multiplicadores) — construído, adoção parcial

- `/pgm`, `/pgm/:grupoId`, `/pgm/:grupoId/reuniao/:reuniaoId` (+ relatório).
  ~3 grupos ativos, ~6 participantes.
- Chamada por toque, relatório com impressão + WhatsApp. `pgm_reunioes.fechada`
  ("finalizar" = carimbo).
- Aba adaptativa da barra inferior (celular) leva **direto ao encontro de hoje**
  quando ele já existe (não cria — só encontra).
- `pgm_sugerir_por_bairro(bairro)` — SECURITY DEFINER, devolve bairro/dia/horário
  **sem o endereço da casa do anfitrião**; por isso `pgm_grupos` pode ficar
  fechada e o convite continuar chegando. Estendida a todo novo congregado
  (não só via Diaconia) desde 09/09/2026.

### 7.8 Diaconia e Ação Social — porta de entrada, construída e no ar (09/2026)

Cuidado de quem a igreja **assiste** (cestas básicas mensais, culto de rua de
terça, jantar pós-culto de domingo) — não necessariamente membro.

- Tabelas: `diaconia_pessoas_assistidas` (identidade + endereço + `assistida_desde`),
  `diaconia_vinculos` (a "matrícula" por área, muitos-para-muitos, com
  `encerrado_em`/`motivo_encerramento`), `diaconia_fichas_socioeconomicas`
  (histórico, **nunca UPDATE**), `diaconia_ocasioes` + `diaconia_atendimentos`
  (mesmo par de `ebd_aulas`/`ebd_presencas`), `diaconia_config` (piso do CadÚnico,
  editável por quem lidera o ministério).
- **Duas portas, RPCs SECURITY DEFINER:** `diaconia_posso_atender(area_id)` —
  larga (ministra, líder, quem serve na área, admin, secretaria, diakonia): porta
  da chamada. `diaconia_lidera_area(area_id)` — estrita (só ministra/líder/admin/
  secretaria): **única porta da ficha socioeconômica**.
- Ficha socioeconômica **enxuta e qualitativa** — sem cálculo automático de
  vulnerabilidade. `renda_mensal` (R$) + `valor_beneficio`; per capita
  (`rendaFamiliarTotal ÷ pessoasNaCasa`) **calculado na tela, não gravado**.
  `familiares` é `jsonb`. Sete campos com "Outro" via `SelectOuOutro`.
- `PercapitaBadge` (vermelho/âmbar/verde) classifica pela linha do CadÚnico
  (extrema pobreza ≤R$218, pobreza ≤R$810,50).
- Indicadores: cobertura (quem tem ficha × quem não tem, sempre primeiro),
  distribuição por classificação, per capita médio, crianças/idosos atendidos.
  Cruzamento com tesouraria: cestas compradas × pessoas atendidas.
- "Quem parou de vir" — critério **"não veio 2 meses seguidos"**, calculado da
  chamada, sem campo novo.
- **Isolamento por padrão, com ponte deliberada:** a pessoa assistida só aparece
  no resto do sistema quando alguém da Diaconia clica "Começou a frequentar"
  (`diaconia_iniciar_frequencia`) — cria registro em `membros` como
  **`congregado`** (não visitante — quem vem 1×/mês buscar cesta não é visitante),
  copia identidade/endereço, grava `data_congregado`. A ficha socioeconômica
  **não se move**.
- **`/painel-diaconia` é um redirecionamento** para o painel genérico de
  ministério (com o módulo `SecaoDiaconia`), não uma tela nova — a primeira
  tentativa de dar "painel próprio" duplicava o que já existia.

### 7.9 Governança — construído, aguardando adoção

- `/governanca`, `/governanca/reuniao/:id`, `/governanca/assembleia/:id`. Tabelas
  `gov_*` (7): reuniões, atas, participantes, pautas, assembleias, quórum, votação
  ao vivo. `gov_executar_assembleia`, `gov_reunioes` (`online` + `link_online`).
- **Liderança VÊ governança** (perguntado e confirmado 02/09/2026: ata de
  assembleia e voto são da igreja inteira, quem lidera ministério participa de
  assembleia).

### 7.10 Membresia — construído, aguardando adoção

- `/membresia`, `/membresia/:id`. `solicitacoes_membresia` (0 linhas), com carta,
  assinatura e assembleia. **Não confundir** `services/membresiaService.ts` (o
  PROCESSO de entrar/sair) com `services/rolDeMembrosService.ts` (a FOTOGRAFIA de
  quem está dentro e do movimento — pirâmide etária, entradas/saídas por ano, no
  Painel Pastoral e no da Secretaria).

### 7.11 Financeiro — construído como ERP eclesiástico (12/09/2026)

Grupo de menu "Financeiro". Tabelas `fin_*` (~23) e `fiscal_*` (5). Missão
completa de transformar o módulo num ERP eclesiástico rodou em 12/09/2026 —
auditoria, gap analysis e cada item concluído estão registrados em
`docs/ROADMAP_FINANCEIRO_ERP.md`; esta seção é o retrato atual, aquele
documento é o histórico de como se chegou aqui.

| Rota | O que é |
|---|---|
| `/financas` | Tesouraria — contas, lançamentos, plano de contas, centros de custo |
| `/financas/conta/:id` | Extrato de uma conta — conciliação manual (badge clicável + lote) e, em contas `tipo: banco`, botão "Importar OFX" |
| `/financas/recorrencias` | Despesas/receitas que se repetem — gera lançamentos previstos |
| `/financas/agenda` | Contas a pagar / a receber + seção "Aguardando aprovação" (aprovar/rejeitar `status: aguardando_aprovacao`) |
| `/financas/relatorio` · `/financas/relatorio/:ano/:mes` | Relatório mensal (malote) |
| `/financas/estoque` | Estoque |
| `/financas/insights` | Previsão de caixa 30/60/90 dias (`fin_previsao_caixa`) |
| `/financas/centros` · `/financas/centro/:id` | Centros de custo — `vinculo_tipo` inclui `evento` (sem centro criado ainda; `fin_seed_centros_custo()` não tem passo pra eventos) |
| `/financas/centro/:id/prestacao-contas` | Prestação de contas exportável/imprimível por centro (serve ministério/campanha/evento/projeto social — mesmo relatório, o `vinculo_tipo` muda o rótulo) |
| `/financas/orcamento` | Orçamento (`fin_orcamentos.valor_planejado`) |
| `/financas/folha` | Folha & Encargos — calculadora CLT, aba "Contratados" |
| `/financas/fiscal` | Módulo Fiscal — obrigações, agenda fiscal, malote mensal à contabilidade, ingestão de nota fiscal por OCR |
| `/financas/reunioes` | Reuniões financeiras + decisões |
| `/financas/doacoes` | Doações — total do mês, por forma de pagamento, por categoria, recorrentes ativas |
| `/financas/doadores` · `/financas/doadores/:pessoaId` | Histórico de contribuição por pessoa — acesso restrito a `ROLES_DOADORES` (`admin`, `diakonia`, `tesouraria`; **sem** `secretaria`, mais estreito que o resto do módulo por decisão de privacidade da Telma) |
| `/financas/executivo` | Visão Executiva — dashboard com gráficos (recharts), com atalho para a DRE |
| `/financas/dre` · `/financas/dre/:ano` | DRE Eclesiástica — formato de demonstração (Receitas por grupo → Despesas por grupo → Resultado), não lista solta. Restrita a `ROLES_PASTORAL_SEM_TITULAR` |
| `/financas/admin` | Config do módulo |

**Fluxo de aprovação (v1, um nível):** `fin_lancamentos.status` tem
`aguardando_aprovacao`; quem tem papel `admin`/`diakonia`/`secretaria`/
`tesouraria` aprova (`realizado`) ou rejeita (`cancelado`, motivo em
`observacoes`) em `/financas/agenda`. **Não existe** nível "Solicitante"
(liderança de ministério pedindo despesa) — decisão confirmada com a Telma
em 12/09/2026: só tesoureiro e administrador do sistema operam o módulo,
a migration `20260902210000_lideranca_nao_opera_o_financeiro.sql` continua
correta como está.

**Rateio entre centros de custo:** `LancamentoForm.tsx` permite dividir um
lançamento entre vários centros por percentual (`fin_lancamento_rateio`).
O lançamento grava `centro_custo_id` = centro de maior percentual — os
relatórios por centro (Prestação de Contas, Top 5 da Visão Executiva)
somam por essa coluna, não pelo rateio completo.

**Conciliação bancária:** manual (toggle `realizado`⇄`conciliado`, individual
ou em lote) e automática via importação de extrato OFX
(`ofxService.ts` — testado contra um extrato real do Bradesco, formato
OFX 1.02/SGML/`CHARSET:1252`). O casamento só CONCILIA lançamentos
`realizado` já existentes, nunca cria um novo sozinho; o que não casar
pode ser lançado na hora (botão "Lançar", pré-preenche data/valor/
descrição, categoria/centro de custo continuam manuais).

**Trilha de auditoria:** `criarLancamento()`/`atualizarLancamento()`
(`finService.ts`) carimbam `audit_user_id`/`audit_em` em toda escrita —
cobre todo caminho do app (nenhum código escreve direto em
`fin_lancamentos`); não cobre SQL direto/RPC futura que contorne essas
duas funções (um trigger de banco cobriria isso, fica como possível
endurecimento futuro).

- **Formatação de moeda:** a função Postgres **`fmt_brl(numeric, casas)`**
  (migration `20260909200000`) formata em padrão brasileiro (`.` milhar, `,`
  decimal) sem depender do locale do banco — o `lc_numeric` deste Supabase é
  `en_US.UTF-8`, então `to_char(...,'FM999G999D90')` produzia "1,234.50" errado, e
  `to_char(...,'FM9999999.99')` engolia o zero final. **Toda função SQL que
  devolve texto com R$ deve usar `fmt_brl`.**
- **`DashboardExecutivo.tsx` usa `Promise.allSettled`** (não `Promise.all`) —
  antes, um erro em uma das 5 chamadas paralelas renderizava a página inteira
  zerada como "tudo em ordem", mascarando 3 bugs SQL reais na "Visão Executiva"
  (colunas e enums errados — `o.valor`→`o.valor_planejado`, `'a_pagar'`→`'previsto'`,
  `data_vencimento`→`data`). Cada fonte que falha agora dá um `toast.error`
  próprio.
- **Bug crítico corrigido em 12/09/2026:** `fiscal_sincronizar_pagamento_trigger()`
  comparava `new.status = 'pago'`, valor que nunca existiu em
  `fin_lancamento_status` — quebrava **todo** UPDATE em `fin_lancamentos`,
  não só os relacionados a status. Migration
  `20260912013100_conserta_gatilho_fiscal_que_quebrava_todo_update.sql`.
- **`LancamentoForm.tsx`: campo "Conta" pré-preenchido via prop** usa um
  valor derivado (`contaIdEfetivo = contaId || contaIdPadrao`), não só o
  `state` `contaId` — um bug de timing (`state` setado num `useEffect`, um
  passo depois do primeiro render) fazia o campo abrir em branco mesmo com
  a conta certa disponível de cara. Vale lembrar deste padrão em qualquer
  outro formulário deste projeto que pré-preencha um campo obrigatório via
  prop esperando que a pessoa possa salvar quase imediatamente.
- **`arr_reservas` tem 0 linhas** — as telas de detalhe de reserva/caixa de
  arrecadação não foram exercitadas com dado real.

### 7.12 Arrecadação (Bazar, Cantina, Espaços) — construído, aguardando adoção

- `/arrecadacao` (hub), `/arrecadacao/espacos`, `/arrecadacao/reservas/nova`,
  `/arrecadacao/reserva/:id`, `/arrecadacao/caixa/:id`,
  `/arrecadacao/produtos/:espacoId`, `/arrecadacao/manutencao`,
  `/arrecadacao/checklist-templates`. `/locais` (Espaços) mora no grupo Financeiro.
- Aluguel de espaços da igreja, bazar e cantina. Acordo pré-uso + token +
  aprovação por WhatsApp. Checklist por área dentro de uma reserva.
- **Arrecadação é da Administração** (perfil + ministério), **não da tesouraria** —
  dinheiro de dízimo e dinheiro de bazar são caixas diferentes.
- **PDV (ponto de venda)** — 8 tabelas `pdv_*`, modeladas, **zero código**. RLS
  sem política nenhuma: quando o módulo for ligado, trava em silêncio até alguém
  escrever as políticas.

### 7.13 Usuários / Permissões / LGPD — pronto e em uso

- `/usuarios` — CRUD de contas, `PermissoesDosPerfis` (um perfil por vez, escreve
  em `role_permissoes`: conceder = INSERT, revogar = DELETE, sem UPDATE).
- `/admin/recuperacao-senha`, `/admin/lgpd`, `/admin/identidade`,
  `/admin/documentos`, `/admin/importacao`, `/admin/exportacao`,
  `/admin/campanhas`.
- **Criação de acesso** pela ficha da pessoa (`AcessoCard` → RPC
  `criar_convite_acesso` → `convites_acesso` → `/convite/:token`). **Recuperação
  de senha** por RPC `SECURITY DEFINER` (`solicitar_reset_senha`,
  `redefinir_senha`, `reset_user_password`). **Primeiro acesso**: `auth.updateUser`
  com nova senha.
- **Remover acesso não apaga o que a pessoa fez.** `revogar_acesso()` apaga os
  papéis, bloqueia o login (`banned_until`) e só então tenta apagar a conta; se
  uma FK segurar, a conta fica bloqueada e o histórico permanece. Guardas: só
  admin, nunca a própria conta, nunca o último administrador.
- LGPD: ~23 consentimentos registrados. Portão de navegação é `sessionStorage`,
  registro legal é a tabela `consentimento` — duas coisas separadas.

### 7.14 Comunicação — Fase 4 da Bússola, primeira peça no ar

- **Resumo semanal por e-mail** (§2.1) — no ar, aguardando validação de uma
  sexta-feira real.
- **WhatsApp** — link (não API). Preferência Web/app por navegador (§2.2).
- **Pendente:** alerta pontual (visitante esfriando, ata atrasada, aluno ausente
  2 domingos) — decidido: só depois do resumo semanal validado.

---

## 8. Painéis de trabalho

Cada papel relevante tem uma "bancada" — chegada automática no login, frase-resumo
em português, seções que ficam visíveis mesmo em zero.

| Painel | Rota | Para quem | Conteúdo |
|---|---|---|---|
| **Home** | `/` | todos | Identidade pessoal ("quem eu sou aqui, o que a igreja espera de mim esta semana"). Lista de tarefas — feito sai da tela. Cartão de chamada da EBD só aos domingos. "A sua semana" (`v_minha_escala`). |
| **Painel Pastoral** | `/painel-pastoral` | pastor, liderança | "Acontecendo hoje" (agenda, limite de 3 + ver mais), "Quem está entrando" (acolhimento + candidatos ao batismo), "O rebanho" (contagem geral: membros+congregados+visitantes, com pirâmide etária e movimento de entradas/saídas — **o movimento conta só membros**, pois só do rol se sai), Discipulado (EBD/PGM/Campanhas/Crescimento em abas). |
| **Painel da Secretaria** | `/painel-secretaria` | admin, secretaria | Cadastro, governança, membresia. "Detalhe do rol" (pirâmide + movimento, só membros). Cadastros a corrigir. |
| **Painel da Tesouraria** | `/painel-tesouraria` | tesouraria | Frase-resumo, prazo fiscal mais próximo, caixa aberto, pendências, vencimentos, orçamento, alertas — 6 blocos. Cruzamento com a Diaconia (cestas × atendidos). 4 sprints, no ar. |
| **Painel da Diaconia** | `/painel-diaconia` | liderança da Diaconia | **Redireciona** para o painel de ministério com `SecaoDiaconia`. |
| **Painel da EBD** | `/ebd` | responsável pela EBD | Cabeçalho sticky com 6+ indicadores, atalhos para as classes, professores, aniversariantes do mês, campanhas de arrecadação por classe. |
| **Painel do Ministério** | `/ministerios/:id/painel` | líder de ministério | Frase-resumo, faixa de indicadores, bancada por módulo (EBD, Bazar, PGM, Acolhimento, Diaconia), sugestão de voluntário com motivo direto na linha da escala. |
| **Visão Executiva** | `/financas/executivo` | pastoral (sem titular) | Dashboard financeiro com gráficos. |
| **Painel Estratégico** | `/painel-estrategico` | admin | Funil visitante → congregado → membro. Também embutido na aba "Crescimento" do Painel Pastoral. Conta só `status = 'ativo'` (corrigido 09/2026 — antes contava desligado/falecido como membro). |

**FAB flutuante ("+")**: escondido nos painéis de trabalho (Pastoral, Secretaria,
EBD, Diaconia) — `ehPainelDeTrabalho(pathname)` em `QuickActionsFab.tsx`. Aparece
em Membros/Visitantes/Eventos.

---

## 9. Rotas

**Públicas (fora do `AppLayout`):** `/auth`, `/auth/reset`, `/convite/:token`,
`/reset/:token`, `/esqueci-senha`, `/primeiro-acesso`, `/aceite-lgpd`,
`/agenda/imprimir`.

**Sob `AppLayout` (exigem sessão):**

```
/                                Home
/membros                         Catálogo de pessoas
/familias                        Famílias + mapa por bairro
/ministerios                     Lista de ministérios
/ministerios/:id/painel          Painel do Líder Ministerial
/ministerios/:id/voluntarios     Painel de voluntários da área
/ministerios/:mid/diaconia/:aid/pessoas    Pessoas assistidas
/ministerios/:mid/diaconia/:aid/chamada    Chamada da Diaconia (+ /relatorio)
/eventos  (/agenda → redireciona) Agenda
/locais                          Espaços
/visitantes  · /visitantes/:id   Acolhimento
/painel-estrategico              Funil de crescimento
/organograma · /estrutura        Organograma / regimento
/areas                           Áreas
/usuarios                        Usuários e acessos
/ebd                             Painel da EBD
/ebd/:classeId                   Ficha da classe
/ebd/:classeId/chamada           Chamada (+ /relatorio)
/ebd/:classeId/relatorio-mensal  Relatório mensal por classe
/ebd/relatorio-mensal            Relatório geral (seletor semana/mês/ano)
/ebd/:classeId/campanhas         Campanhas de arrecadação da classe
/ebd/:classeId/campanhas/:id     Campanha (+ /relatorio)
/pgm · /pgm/:grupoId             Pequenos Grupos
/pgm/:grupoId/reuniao/:rid       Reunião do grupo (+ /relatorio)
/financas  + 21 sub-rotas        Financeiro (ver §7.11)
/arrecadacao + 7 sub-rotas       Bazar, Cantina, Espaços (ver §7.12)
/membresia · /membresia/:id      Processo de membresia
/governanca · /reuniao/:id · /assembleia/:id   Reuniões e Atas
/assuntos · /assunto/:id         Assuntos (pendências da secretaria)
/agenda-pastoral                 Aniversários e bodas do mês
/painel-pastoral · /painel-secretaria · /painel-tesouraria · /painel-diaconia
/admin/recuperacao-senha · /admin/lgpd · /admin/identidade · /admin/documentos
/admin/importacao · /admin/exportacao · /admin/campanhas
```

**Menu (sidebar):** 4 atalhos fixos no topo (Painel Pastoral, da Secretaria, da
Tesouraria, da Diaconia) + Home + Agenda + 5 grupos: **Pessoas** (Catálogo,
Visitantes, Famílias, Ministérios, Organograma, Membresia), **Discipulado** (EBD,
Pequenos Grupos), **Financeiro** (Tesouraria, Módulo Fiscal, Reuniões financeiras,
Visão Executiva, Bazar e Cantina, Espaços), **Liderança** (Reuniões e Atas,
Assuntos, Estrutura). Os grupos "Administração" e "Agenda & Espaços" foram
**desmontados** em 09/09/2026 (Fase 1 da Bússola).

---

## 10. Padrões obrigatórios e armadilhas

### 10.1 Código

- **Idioma: português** em nomes, comentários, mensagens e migrations.
- **Comentário explica o PORQUÊ, com evidência medida** — não o que a linha faz.
  Não há um único `TODO`/`FIXME`/`HACK` no repositório — a dívida é descrita em
  prosa. **Ler os comentários antes de mudar** — muitos avisam explicitamente
  contra a mudança que parece óbvia.
- **Import por alias `@/`**.
- **Avisos com `sonner`.** Nunca `alert()`, `confirm()` ou `prompt()` — em WebView
  de celular as caixas nativas são bloqueadas e devolvem "cancelou" sem
  perguntar. Usar `AlertDialog` (referência: `pages/Ebd.tsx`).
- **Cor só por token semântico.** Nada de `bg-red-500`. Os papéis: `success`,
  `warning`, `destructive`, `info`, `celebracao` (rosa = aniversário/bodas),
  `violeta` (6º lugar das paletas categóricas, não semântico). Cuidado:
  `bg-teal-100` é o teal do Tailwind (azul-esverdeado), o token `--teal` é âmbar.
- **`min-w-0`** em todo item de flex/grid com texto truncável — o mesmo transbordo
  horizontal já apareceu 6+ vezes; há teste e2e só para isso.
- **`NomePessoa` é um `<button>`** — `truncate` sozinho não o faz encolher; dentro
  de container de largura restrita precisa de `w-full` (coluna isolada) ou
  `flex-1 min-w-0` + vizinho `shrink-0` (dividindo a linha).
- **`<Badge>` renderiza `<div>`** — nunca dentro de `<p>` (HTML inválido,
  `validateDOMNesting`). Mesma coisa: `<button>` nunca dentro de `<a>`/`<Link>`.
- **Grid Tailwind** que só declara colunas a partir de `md:`/`lg:` (sem base
  `grid-cols-N`) vaza a largura assim que o conteúdo cresce.

### 10.2 Datas — `src/lib/data.ts`

**`new Date().toISOString().slice(0,10)` como "hoje" lê AMANHÃ entre 21h e
meia-noite** (converte para UTC, 3h à frente de Brasília). Auditoria completa
fechada em 04/09/2026 (~60 pontos corrigidos). **Sempre usar** `hojeLocal()`,
`toYmd()`, `parseLocalDate()`, `daquiADias()`, `hojeMaisDias()`,
`formatarDatetimeLocal()` — todos leem componentes de data no fuso local, nunca
passam por UTC.

- **Seguro por construção:** `new Date(ano, mes, dia).toISOString().slice(0,10)`
  com y/m/d explícitos ("primeiro dia do mês") — meia-noite local num fuso atrás
  de UTC só empurra horas para frente dentro do mesmo dia civil.
- **Categoria diferente, fora de escopo:** `Math.floor((Date.now() -
  new Date(x).getTime()) / 86_400_000)` ("dias desde X") — diferença entre dois
  instantes, imprecisão de ±1 dia inerente, não é o bug de UTC.

### 10.3 Banco / migrations

- Nome: `AAAAMMDDHHMMSS_descricao_em_portugues.sql`, com cabeçalho explicando o
  defeito, a medição que o comprovou e a alternativa descartada.
- **Ensaiar toda migration com `BEGIN; … ROLLBACK;`** via API de gerenciamento
  antes de aplicar. Não há homologação.
- `CREATE OR REPLACE VIEW` só aceita **colunas novas no fim**, mantendo nome, tipo
  e ordem das existentes. Gerar a definição nova **transformando** a real
  (`pg_get_viewdef`), não redigitando.
- **Mudar o `RETURNS TABLE` ou os parâmetros de uma função exige `DROP FUNCTION` +
  `CREATE`** — `CREATE OR REPLACE` com assinatura diferente **cria uma segunda
  função** que colide ("function is not unique"). **RPC de escrita cujo conjunto
  de campos pode crescer nasce com um único parâmetro `p_dados jsonb`**, não
  parâmetros posicionais.
- `ALTER TYPE ... ADD VALUE` não roda na mesma transação em que o valor é usado.
- Ao acrescentar enum/coluna, o `types.ts` gerado costuma estar atrás — hoje é
  gerado pela Supabase CLI (`npx -y supabase@latest`), que **pula funções
  sobrecarregadas**.
- Funções `SECURITY DEFINER` ignoram a RLS — a guarda tem de ser a **primeira
  linha do corpo** (`IF NOT public.is_admin() THEN RAISE EXCEPTION …`).
- **Acesso ao banco fora do app:** API de gerenciamento —
  `POST https://api.supabase.com/v1/projects/prjoftmlkusbjoeptabp/database/query`
  com `Authorization: Bearer $SUPABASE_ACCESS_TOKEN`. **Corpo em arquivo com
  `--data-binary @`** (no Git Bash do Windows, passar a string pela substituição
  do shell corrompe UTF-8). A API devolve **só o último SELECT**.

### 10.4 `conferir()` — quando NÃO usar

Documentado no próprio código em cada caso: (1) "melhor esforço" depois que a ação
principal já teve sucesso via RPC; (2) UPDATE em massa onde zero linhas é
resultado válido, não bloqueio (`fecharCaixa`, `marcarVigente`); (3)
`.select().single()` já é auto-conferido (0 linhas vira `PGRST116`).

### 10.5 Ferramenta / ambiente

- **Nunca `Get-Content`/`Set-Content` do PowerShell** em arquivo-fonte — lê como
  ANSI e corrompe acentos e os `─` dos comentários.
- A cópia local **fica desatualizada com facilidade** — `git fetch` e comparar
  antes de editar.
- Nomes com apóstrofo dentro de SQL: aspas simples duplicadas, nunca
  `JSON.stringify`.

---

## 11. Riscos conhecidos e dívida técnica

Ordenados por custo de descobrir tarde.

| # | Risco | Estado / mitigação |
|---|---|---|
| 1 | **`npx tsc --noEmit` puro não verifica nada** — `tsconfig.json` tem `"files": []`. Um nome inventado passa. | Usar **sempre `-p tsconfig.app.json`**. Armadilha secundária: `TS2688` (vitest/globals não resolve) **aborta a checagem** e sai com "0 erros". Ler a primeira linha da saída. |
| 2 | **TypeScript não estrito** — `strictNullChecks: false` em ~285 arquivos, somado ao `supabaseRel` que apaga a tipagem em embed. | Não migrar de uma vez. Regra: arquivo novo nasce sem `any` e com nulo tratado. |
| 3 | **`confirm()` nativo não funciona em WebView** — ~39 chamadas fora de `AlertDialog`. Botão que não faz nada no celular, sem erro. | Trocar por `AlertDialog`. Priorizar as destrutivas. |
| 4 | **Escrita silenciosa barrada pela RLS** — ~52 escritas antigas descartam o resultado. | Aplicar `conferir()`. Auditoria de cobertura fechada em 08/09/2026 — mas o legado pré-auditoria pode ter pontos. |
| 5 | **Guarda de rota só age depois de os papéis carregarem** — a tela já renderizou antes. Rotas sem nenhum ancestral em `ROUTE_ROLES` não têm guarda de navegação. | A RLS é o backstop. Antes de criar tela sob prefixo sensível, conferir se o prefixo tem entrada em `ROUTE_ROLES`. |
| 6 | **`n_live_tup` mente** — reportou 0 para tabelas com 39, 108, 6 linhas. | **Sempre `count(*)`.** |
| 7 | **`DELETE` restrito a admin em quase todo o banco** — "apaga tudo e reescreve" quebra em silêncio para não-admin. | Preferir diferença ou encerrar. |
| 8 | **`VITE_SUPABASE_SERVICE_ROLE_KEY` no `.env.example`** — prefixo `VITE_` vai para o pacote do navegador. | **Sem vazamento hoje** (nenhum arquivo em `src/` a referencia). Remover a variável do `.env.example`. |
| 9 | **11 tabelas com RLS ligada e ZERO políticas** (7 `pdv_*`, `bazar_reservas`, `documentos_fiscais`, `fin_solicitacoes`). | Bloqueiam tudo. Quando o módulo Bazar/PDV for ligado, travará em silêncio até alguém escrever as políticas. **Avisar antes de ativar.** |
| 10 | **Pacote de produção > 2,6 MB** sem `manualChunks`. Primeira carga lenta em 3G — e a igreja usa celular. | Separar `pdfjs-dist`, `tesseract.js`, `leaflet`, `recharts`. |
| 11 | **Sem CI** — nada roda sozinho. Cada entrega depende de alguém rodar `tsc`, `vite build`, `vitest`, `playwright`. | — |
| 12 | **1 teste unitário trivial** era o estado em 20/08; hoje são **218 testes** reais (vitest) + 3 specs Playwright de layout. | — |
| 13 | **Duplicações estruturais** — dois modelos de permissão (só `role_permissoes` vivo); papel em dois lugares (`user_roles` vs `profiles.role`); dois modos de abrir a ficha (`FichaProvider` vs estado local em 3 telas). | Documentadas; não corrigidas. |
| 14 | **`meta description`** promete "campanhas" (módulo sem uso). **Sem `apple-touch-icon` na versão antiga** (resolvido no PWA de 08/09). | Backlog. |
| 15 | **Validações de formulário nunca construídas** — nascimento no futuro / acima de 120 anos, casamento antes dos 14, entrada no futuro. | Backlog. |

**Registro incompleto é aceito, mas continua pendente** (decisão D-1): meia data
de nascimento (dia/mês sem ano) pode ser gravada; quem tem meia data cai numa
segunda fila de pendências. **Nunca inventar valor para preencher campo** (D-2 —
"idade errada é pior que idade ausente").

---

## 12. A Bússola — plano diretor de 12 meses

Documento de produto (`bussola-diakonia.html`, 08/09/2026). Visão: em 12 meses o
Diakonia deixa de ser um conjunto de módulos e passa a ser um conjunto de
**bancadas de trabalho** — uma por papel — que já chegam com a prioridade do dia
calculada, e passa do modelo de **puxar** para também **empurrar**.

**Sete pilares:** Quem está entrando · Pessoas · Discipulado · Financeiro ·
Governança · Escalas · Comunicação (o único que ainda não existe como tal).

**Fases (dependem umas das outras):**

| Fase | Tema | Estado (10/09/2026) |
|---|---|---|
| **1 · Fundação** | fechar lacunas estruturais | **Completa.** Painel da Tesouraria; "Congregaram" corrigido; menu reorganizado; guarda de rota corrigida |
| **2 · Experiência** | padrão "painel com frase" aos papéis que faltam | **Completa.** Painel do Líder Ministerial (já existia); aba adaptativa de PGM. (OCR do cartão descartado — Tesseract não lê caligrafia) |
| **3 · Relacionamento** | unificar o cuidado com pessoas | **Completa.** "Quem está entrando" (acolhimento + candidatos) no Painel Pastoral; Diaconia com painel próprio; % do motor de acolhimento por tipo de tarefa |
| **4 · Automação** | o sistema empurra | **1ª peça no ar.** Resumo semanal por e-mail (Resend + pg_cron). **Aguardando uma sexta-feira de disparo automático real para validar** antes de expandir |
| **5 · Inteligência** | usar o histórico para sugerir | **Completa, adiantada.** Sugestão de voluntário com motivo na tela do líder; detecção de sobrecarga; PGM por bairro a todo novo congregado |

**Top 10 de impacto** — 9 feitos. Único pendente: **#6 alerta de visitante
esfriando** (a única fila do sistema com prazo de validade real) — travado junto
com a expansão do resumo semanal, esperando a validação da sexta.

**O que NÃO fazer:** centro de notificações genérico (sino com lista); OCR de
caligrafia sem orçamento de visão computacional paga; densidade de tela ajustável
(medido e descartado — sem volume que justifique); unificar os dois registries de
prioridade num motor único (dívida real, nenhum sintoma que pague o risco).

---

## 13. Como rodar e verificar

```bash
npm install                 # NÃO use bun — há duas lockfiles; o package-lock.json manda
cp .env.example .env        # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:8080  (porta fixada em vite.config.ts)
```

**⚠️ O `.env` aponta para produção.** `npm run dev` roda contra os dados reais da
igreja. Ao testar escrita: ensaiar com `BEGIN; … ROLLBACK;`, **ou** gravar e
apagar em seguida conferindo `count(*)`. Campo novo se experimenta em "Nova
pessoa" / "Novo evento", que não têm registro para estragar (D-8 — escrito depois
de uma gravação escapar e gravar um aniversário inventado numa ficha real).

**Antes de entregar:**

```bash
npx tsc --noEmit -p tsconfig.app.json   # NUNCA sem o -p (Risco 1)
npx vite build
npx vitest run                          # ~198 testes
npx playwright test                     # 3 specs de layout (pulam sem E2E_TELEFONE/E2E_SENHA)
```

**Não há CI. Nada roda sozinho.** O projeto é visual e cheio de estado de RLS —
rodar o `dev` e olhar vale mais que ler o diff.

**Convenções de sessão (para assistentes):** commit por mudança lógica, mensagem
em português; medir antes de concluir (a chance de o que se quer construir já
existir é alta — ~57 objetos dormentes, incluindo um módulo inteiro de PDV);
antes de construir qualquer fluxo de escrita/exclusão, grepar a ação no resto do
projeto — quase sempre alguém já resolveu o problema difícil em outro lugar.

---

## 14. Glossário

| Termo | O que é |
|---|---|
| **Membro / Congregado / Visitante** | Os três vínculos de uma pessoa com a igreja, em ordem crescente. Mesma tabela `membros`, discriminados por `tipo_pessoa` |
| **Rol** | Só os membros — quem passou por assembleia. "Membresia" = o rol |
| **Rebanho** | Quem a igreja acompanha: membros + congregados + visitantes ativos |
| **EBD** | Escola Bíblica Dominical — classes por faixa etária e sexo, com chamada |
| **PGM** | Pequenos Grupos Multiplicadores — células que se reúnem em casas |
| **Efeméride** | Data que se repete todo ano: aniversário, bodas, anos de membresia, anos de pastorado |
| **Escala** | A lista de quem serve num evento (louvor, recepção, som) |
| **Área** | Subdivisão de um ministério. Ex.: "Recepção" dentro de "Comunhão" |
| **Posto** | Função específica dentro de uma área (substituiu o texto livre `funcao`) |
| **Acolhimento** | O processo de acompanhar quem visitou pela primeira vez |
| **Diretoria / Conselho** | Cargos do estatuto. Conselho (auditoria, jurídico) **fiscaliza** a diretoria |
| **Membresia** | O processo formal de entrada ou saída do rol de membros |
| **Arrecadação** | Aluguel de espaços da igreja, bazar e cantina |
| **Malote** | Envio mensal de documentos à contabilidade |
| **Bússola** | O plano diretor de produto de 12 meses (§12) |
| **Bancada de trabalho** | Um painel feito sob medida para um papel |
| **`conferir()`** | O helper que distingue "gravou" de "RLS barrou em silêncio" |
| **`fmt_brl()`** | Função SQL que formata R$ em padrão brasileiro sem depender do locale |

---

## 15. Histórico recente de desenvolvimento

Os grandes arcos desde o levantamento de 20/08/2026 (que originou `CLAUDE.md` /
`ARCHITECTURE.md`):

- **Refatoração UX (12 fases, 1–10 feitas)** — escala tipográfica, estados vazios
  que ensinam, esqueleto no lugar do spinner, 3 raios de borda, cores 100% em
  tokens, ritmo vertical, menu que aprende, painel que abre pelo que uma pessoa
  pede, ficha como página de relacionamento. Item 11 (densidade escolhível):
  **medido e descartado**.
- **Auditoria de fuso horário (04/09/2026)** — `new Date().toISOString()` como
  "hoje" lia amanhã das 21h à meia-noite; ~60 pontos corrigidos em série,
  `src/lib/data.ts` criado. 5 incidentes reais medidos (formulário de evento,
  chamada da EBD, assembleia agendada para segunda, conta no prazo rotulada
  "atrasada", reunião financeira 3h adiantada).
- **Auditoria de `conferir()` (08/09/2026)** — ~25 arquivos, ~130 pontos de
  escrita; RLS barrando update/delete em silêncio.
- **Diaconia — porta de entrada (03–04/09/2026)** — módulo inteiro construído:
  cadastro, ficha socioeconômica, chamada de confirmação, indicadores, "quem
  parou de vir", ponte reversível para virar congregado.
- **EBD — redesenho visual completo (04–09/09/2026)** — `/ebd` virou Painel da
  EBD; relatórios por aula / mensal / geral com seletor de período; professor com
  presença à parte; gráfico de faixa etária; dezenas de iterações de nomenclatura
  e de conta (Alcance/Não alcançados).
- **Agenda / Eventos (08/09/2026)** — 3 bugs reais corrigidos (erro ao salvar
  áreas por duplo-toque; crash de Rules-of-Hooks no `EscalaDialog`; conflito de
  horário falso ao editar a âncora de série); calendário mobile; `EventoViewDialog`
  com escala + WhatsApp; transmissão ao vivo como atributo.
- **Separação de papéis (02–03/09/2026)** — `admin` / `secretaria` / `tesouraria`
  / `pastor` / `lideranca` / `membro`; `handle_new_user` passou a dar `membro`;
  recorte das ~61 políticas amplas de `lideranca` lote por lote (B·2); 21 contas
  de líder criadas dormentes (B·4), **não entregues** por decisão da direção.
- **Cadastro de visitante unificado (08/09/2026)** — um formulário só
  (`MembroForm`); OCR do cartão impresso tentado e revertido.
- **PWA (08/09/2026)** — app instalável no celular via `vite-plugin-pwa`.
- **Comunicação — Fase 4 (09/09/2026)** — Edge Function `resumo-semanal` + Resend
  + `pg_cron` + `pg_net`; primeira peça de "empurrar".
- **`fmt_brl` + Visão Executiva (09/09/2026)** — formatação de R$ locale-independente
  no banco; 3 bugs SQL reais na Visão Executiva desmascarados por
  `Promise.allSettled`.
- **Bússola — Fases 1, 2, 3, 5 completas** (09/09/2026); menu "Administração" e
  "Agenda & Espaços" desmontados.
- **10/09/2026** — Painel Pastoral: movimento do rebanho volta a contar só
  membros. WhatsApp: usuário escolhe entre WhatsApp Web e aplicativo (preferência
  local no menu do usuário; `src/lib/whatsapp.ts`).
- **Financeiro como ERP eclesiástico (12/09/2026)** — auditoria completa do
  módulo (`docs/ROADMAP_FINANCEIRO_ERP.md`) achou que a maior parte do que
  parecia faltar já existia no schema, só sem tela: vínculo "evento" em
  centros de custo, rateio (`fin_lancamento_rateio`), conciliação
  (`conciliado`) e aprovação (`aguardando_aprovacao`). Construído no mesmo
  dia: aprovação de despesas (1 nível), prestação de contas exportável por
  centro, tela "Doações", DRE Eclesiástica formal, conciliação manual e
  automática via extrato OFX real do Bradesco (com botão "Lançar" pro que
  não casar), histórico de doação por pessoa (`ROLES_DOADORES`, mais
  restrito que o resto do módulo), e a trilha de auditoria
  (`audit_user_id`/`audit_em`) finalmente carimbada em toda escrita. Bug
  crítico achado e corrigido no caminho: `fiscal_sincronizar_pagamento_trigger()`
  quebrava todo UPDATE em `fin_lancamentos` comparando contra um valor de
  status que nunca existiu no enum. Também corrigido: pré-preenchimento de
  "Conta" no `LancamentoForm.tsx` abrindo em branco por corrida de timing
  entre `useEffect` e o primeiro render.

---

*Fim. Para o detalhe de uma decisão específica, os cabeçalhos das migrations em
`supabase/migrations/` e os comentários longos do código são a fonte primária —
cada um cita a medição que o originou e a alternativa descartada.*
