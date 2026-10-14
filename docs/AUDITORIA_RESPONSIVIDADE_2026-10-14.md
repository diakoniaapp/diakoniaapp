# Auditoria de responsividade — DiakoniaApp

**Data:** 14/10/2026 · **Alvo:** celular de 375px (o mesmo dos testes em `e2e/`)
**Método:** leitura estática do código (`src/`, 370 arquivos `.tsx`). **Nada foi
medido no navegador**: o `.env` aponta para o banco de produção e as rotas exigem
login, então não subi o app. Onde a conclusão depende de medida, está marcado
**(estimado)** ou **(confirmar em aparelho)**.

### Situação em 14/10/2026: corrigido no mesmo dia

| Item | Estado |
|---|---|
| A1, A2, A3, M1, M4, M5 | **Corrigidos** como descrito abaixo |
| M2 | **Corrigido**, com alcance maior que o medido: a primeira varredura parava no `>` de `(e) =>` e contou só 2 `Input`. A contagem certa deu **88 campos em 43 arquivos**, todos passados para `text-base md:text-*`, além do `Textarea` e da busca |
| B1 | **Corrigido** em `EventDialog`, `FornecedorForm`, `ContratadoForm` e `ContaForm`. O `RecorrenciaForm` já tratava o caso com `min-w-0` (comentário de 15/09) e ficou como estava |
| A1, efeito colateral | O botão "Imprimir" exclusivo do celular em `Eventos.tsx` saiu, porque agora o do cabeçalho aparece também no celular. O `transbordo-dialogos.spec.ts` passou a clicar em "Imprimir / PDF" |
| M3, M6, B2, B3 | **Abertos.** M3 precisa de teste num iPhone de verdade antes da mudança |

Conferido com `tsc -p tsconfig.app.json`, `vite build` e `vitest`. O `vitest`
tem 1 falha em `navConfig.test.ts` ("/financas/reunioes sumiu do menu"), que
já falhava no commit anterior, sem estas mudanças. **Não foi medido na tela**, e
o `npm run test:layout` precisa de conta de teste.

---

## Resumo

| # | Gravidade | Problema | Alcance |
|---|---|---|---|
| A1 | Alta | `PageHeader` esconde os botões de ação no celular | 10 páginas perdem "Nova família", "Novo ministério" etc. |
| A2 | Alta | Botão "Salvar" fixo no rodapé fica **embaixo** da barra inferior | 2 telas de administração |
| A3 | Alta | Abas em 5 colunas não cabem nos diálogos | Ficha do visitante, Movimentos da arrecadação |
| M1 | Média | `AlertDialogContent` não recebeu a correção que o `DialogContent` recebeu | 79 confirmações |
| M2 | Média | `Textarea` e a busca global com fonte de 14px provocam zoom no iPhone | 71 textareas + busca |
| M3 | Média | Casco em `h-screen` (100vh) no Safari do iPhone | App inteiro (confirmar em aparelho) |
| M4 | Média | Abas do Painel Pastoral passam da borda | `/painel-pastoral` (estimado) |
| M5 | Média | Tabelas largas sem rolagem: pendências e relatórios para impressão | Finanças, EBD |
| M6 | Média | Testes de layout cobrem 21 das 111 rotas, nenhuma de Finanças | Cobertura |
| B1 | Baixa | Formulários com 3 colunas fixas dentro de diálogos | 5 formulários |
| B2 | Baixa | Botões de ícone com 24–28px | 53 botões, quase todos em Finanças |
| B3 | Baixa | `viewport-fit=cover` ausente: `pb-safe`/`pt-safe` não fazem nada | Casco |

---

## Alta

### A1. Os botões de ação somem no celular

`src/components/PageHeader.tsx:11`

```tsx
{actions && <div className="hidden md:flex gap-2 shrink-0 whitespace-nowrap">{actions}</div>}
```

Abaixo de 768px, tudo o que a página passa em `actions` deixa de existir. A
linha vem da primeira versão do arquivo (26/05/2026). O histórico não registra
nenhuma decisão de escondê-la.

| Página | O que some no celular | Há outro caminho? |
|---|---|---|
| `Familias.tsx:312` | Nova família | Não |
| `Ministerios.tsx:259` | Novo ministério, Refatoração | Não |
| `Areas.tsx:129` | Novo (ministério/área) | Não |
| `Locais.tsx:309` | Novo local | Não |
| `CampanhasAdmin.tsx:212` | Nova campanha | Não |
| `DocumentosAdmin.tsx:495` | Novo documento | Não |
| `EstruturaDaIgreja.tsx:404` | Recarregar, Documentos | Não |
| `ImportacaoMembros.tsx:371` | Ver histórico | Não |
| `Visitantes.tsx:245` | Ver em Pessoas | Barra inferior |
| `PainelEstrategico.tsx:194` | Ver visitantes | Barra inferior |
| `Eventos.tsx:784` | Imprimir, Novo evento | Sim: botão `md:hidden` na linha 853 + FAB |
| `Membros.tsx:1040` | Adicionar | Sim: FAB "Adicionar pessoa" |

**Correção:** mostrar as ações também no celular, com quebra de linha:

```tsx
{actions && <div className="flex flex-wrap gap-2 md:shrink-0 md:flex-nowrap md:whitespace-nowrap" translate="no">{actions}</div>}
```

O cabeçalho já é `flex-col` no celular, então as ações caem para baixo do
título. Depois de mudar, rodar `npm run test:layout`: Eventos e Membros
passariam a mostrar o botão duas vezes (cabeçalho e alternativa própria). Nessas
duas, tirar a alternativa ou não passar `actions` no celular.

### A2. "Salvar" escondido atrás da barra inferior

- `src/pages/IdentidadeAdmin.tsx:1244`: `sticky bottom-4 md:hidden`
- `src/pages/BoasVindasVisitanteAdmin.tsx:308`: `sticky bottom-4 px-4 md:hidden`

O `<main>` vai até o fim da tela (`AppLayout.tsx:271`, `h-screen`), e a
`MobileBottomNav` se sobrepõe a ele com `min-h-[56px]` + borda. Um botão
grudado a 16px do fundo fica inteiro embaixo da barra. Nessas duas telas, este
é justamente o único "Salvar" do celular, porque o do cabeçalho some (A1).

O próprio projeto já resolveu o mesmo caso em
`src/pages/FinancasCentralDocumentos.tsx:464`, com comentário explicando:

```tsx
className="sticky bottom-[4.25rem] md:bottom-0 ..."
```

**Correção:** `bottom-[4.25rem] md:bottom-4` nas duas telas.

### A3. Cinco abas não cabem num diálogo de 375px

`TabsTrigger` traz `whitespace-nowrap` (`ui/tabs.tsx`). Num diálogo de 359px
com `p-4`, cada uma das 5 colunas fica com cerca de 64px, e sobram uns 40px
para o texto depois do `px-3` **(estimado)**.

| Arquivo | Abas | Por que não cabe |
|---|---|---|
| `components/membros/VisitanteDialog.tsx:284` | Visitas · Jornada · Contatos · Acolhimento 💙 · Converter | ícone + texto; "Acolhimento 💙" tem cerca de 100px |
| `components/arrecadacao/MovimentosDialog.tsx:133` | Lista · Custo · Reembolso · Abate CNPJ · Reversão | "Abate CNPJ" tem cerca de 75px |

A ficha do visitante é tela de campo da equipe de acolhimento. O defeito
aparece justamente no celular.

**Correção:** o projeto já tem dois padrões que funcionam:
- `pages/LgpdAdmin.tsx:253`: só o ícone no celular (`<span className="hidden sm:inline">`);
- `pages/financas/Fiscal.tsx:57`: `h-11 px-1.5 min-w-0 text-xs sm:text-sm` no gatilho.

Para 5 abas com texto, a saída mais segura é uma lista rolável:
`TabsList className="w-full justify-start overflow-x-auto"`, sem `grid-cols-5`.

---

## Média

### M1. `AlertDialogContent` ficou sem a correção do `DialogContent`

`src/components/ui/dialog.tsx:51` recebeu três correções, com comentário
explicando o defeito do "Imprimir agenda" que saía 19px da tela:
`grid-cols-[minmax(0,1fr)]`, `w-[calc(100%-1rem)]` e `max-h-[92vh] overflow-y-auto`.

`src/components/ui/alert-dialog.tsx:36` continua com o original do shadcn:
`grid w-full max-w-lg ... sm:rounded-lg`. No celular isso significa:
- o diálogo encosta nas duas bordas e fica sem cantos arredondados;
- o mesmo transbordo por `truncate` que o `transbordo-dialogos.spec.ts`
  documenta (trilha `auto` do grid);
- confirmação com texto longo não rola.

São **79 usos**. A correção cabe numa linha do componente: copiar as mesmas
classes do `DialogContent`. O teste de diálogos pode ganhar um caso com
qualquer confirmação de exclusão.

### M2. Zoom automático do iPhone ao tocar no campo

`src/index.css:544` força 16px em `input, select, textarea` para o iOS não dar
zoom. Mas a regra está em `@layer base`, e qualquer utilitário `text-sm` vence.
O `Input` foi ajustado (`text-base md:text-sm`); estes não:

- `components/ui/textarea.tsx:9`: `text-sm` fixo. **71 textareas** (observações
  pastorais, motivos, descrições).
- `components/ui/command.tsx:47`: o campo da **busca global**, que no celular
  é aberta pela lupa do cabeçalho (`AppLayout.tsx:553`).
- `components/financas/LiquidacaoPainel.tsx:187` e `:209`: `Input` com `text-xs`.

**Correção:** `text-base md:text-sm` no `Textarea` e no `CommandInput`;
`text-base md:text-xs` nos dois campos da liquidação.

### M3. `h-screen` no Safari do iPhone (confirmar em aparelho)

`AppLayout.tsx:271` (e `:219`, tela de carregamento): `h-screen` = `100vh`. No
Safari do iOS, `100vh` é a altura com a barra do navegador **recolhida**. Como o
`body` não rola (o casco é `overflow-hidden`), a barra nunca recolhe, e o fim
do `<main>` fica atrás dela. O `pb-20` do `<main>` disfarça em parte. Já os
elementos `sticky bottom-*` caem fora da área visível.

No PWA instalado (`display: standalone`) o problema não acontece.

**Correção:** `h-dvh` (o Tailwind 3.4 do projeto já tem a classe). Hoje há 5
usos de `dvh/svh` no código e 80 de `h-screen`/`[NNvh]`. Os de diálogo
(`max-h-[92vh]`) podem ficar para depois.

### M4. Abas do Painel Pastoral (estimado)

`src/pages/PainelPastoral.tsx:815`: `TabsList` sem largura, com EBD ·
Pequenos Grupos · Campanhas · Crescimento. Somando o texto e o `px-3` de cada
aba, dá uns 370px, num espaço de 343px. Como o `<main>` é `overflow-x-hidden`,
a última aba é **cortada** em vez de rolar. A rota está no `transbordo.spec.ts`;
rodar o teste confirma. `Organograma.tsx:397` (4 abas em `grid-cols-4`) está no
limite.

### M5. Tabelas largas sem rolagem horizontal

**Pendências de categorização:** `components/financas/PendenciasCategorizacaoDrawer.tsx:151`.
São 9 colunas com larguras fixas que somam mais de 800px, num painel `w-full`
no celular. Rola de lado dentro do painel, então não perde dado, mas é
inutilizável com o polegar. Sugestão: cartões abaixo de `md`, no padrão de
`Membros.tsx` (ver o comentário lá sobre `overflow-hidden` e `sticky`).

**Relatórios para impressão:** `FinancasRelatorio.tsx`, `FinancasRelatorioContas.tsx`,
`FinancasDRE.tsx`, `FinancasDoadorDetalhe.tsx`, `FinancasCentroPrestacaoContas.tsx`,
`FinancasProjetoDetalhe.tsx`, `EbdCampanhaRelatorio.tsx`. Todos têm a "folha"
com `p-8 md:p-10` (32px de cada lado já no celular) e `<table className="w-full">`
**sem** `overflow-x-auto`. Num celular sobram cerca de 280px para tabelas de 5
a 13 colunas: o texto espreme e o que não cabe é cortado pelo `<main>`.

**Correção:** `p-4 md:p-10` na folha e um invólucro
`<div className="overflow-x-auto print:overflow-visible">` em volta de cada
tabela. A impressão não muda.

Os demais 12 arquivos com tabela já usam o `<Table>` do shadcn (que tem
`overflow-auto` embutido), têm invólucro próprio ou trocam por cartões no celular.

### M6. Cobertura dos testes de layout

`e2e/transbordo.spec.ts` percorre **21 rotas**; o app tem **111**. Fora da
cobertura:

- **`/financas/*`: 32 rotas, nenhuma testada.** É onde está a maior parte dos
  achados acima e dos botões pequenos (B2).
- `/admin/*` (9 rotas): IdentidadeAdmin e BoasVindasVisitanteAdmin são A2.
- Rotas de detalhe com parâmetro (`/visitantes/:id`, `/pgm/:grupoId`, `/ebd/:classeId/chamada`…).
- Páginas públicas (`/auth`, `/bemvindo`, `/convite/:token`, `/primeiro-acesso`).
  Pela leitura estão bem cuidadas (`AuthShell`, `VisitanteAutocadastro`), mas
  são as que mais abrem em celular de quem não conhece o sistema.

**Sugestão:** acrescentar ao `ROTAS` as rotas fixas de Finanças e Admin. As
públicas entram num `describe` separado, sem sessão. Para as de parâmetro, buscar
um id real na própria sessão de teste, sem fixar no código.

---

## Baixa

### B1. Três colunas fixas em formulários de diálogo

Num diálogo de 375px, `grid-cols-3 gap-3` deixa cada campo com cerca de 100px.
Cabe número de dia; data e cidade ficam apertadas.

| Arquivo | Campos |
|---|---|
| `components/agenda/EventDialog.tsx:264` | Data · Início · Fim |
| `components/financas/FornecedorForm.tsx:312`, `:323` | Endereço/CEP · Bairro/Cidade/UF |
| `components/financas/FornecedorForm.tsx:254`, `:269` | Chave Pix / Tipo |
| `components/financas/ContaForm.tsx:357` | Limite · Fechamento · Vencimento |
| `components/financas/RecorrenciaForm.tsx:380` | Frequência · Dia · … |

**Correção:** `grid-cols-1 sm:grid-cols-3` (ou `grid-cols-2 sm:grid-cols-3`
com `col-span-2` no campo longo). Os outros ~45 `grid-cols-3/4` sem prefixo
são blocos de números (KPIs), e esses estão bem.

### B2. Botões de ícone pequenos

`size="icon"` é `h-10 w-10` e **não tem `min-h`**, então um `className="h-7 w-7"`
o reduz de fato para 28px. São 47 em `h-7`, 6 em `h-6` e 7 em `h-8`, concentrados em
`FinancasAdmin.tsx` (7), `agenda/EscalaDialog.tsx` (5), `FinancasProjetos.tsx`
e `ProjetosDrawer.tsx` (4 cada). Todos passam o piso de 24px da WCAG 2.2 que o
teste cobra, mas ficam abaixo da meta de 44px do projeto. Quando ficarem lado a
lado com `gap-1`, vale o `after:-inset-2` descrito no `e2e/README.md`.

O inverso também acontece: os ~165 `h-7` em `<Button size="sm">` **não têm
efeito**, porque o `min-h-9` do tamanho `sm` vence a `height`. Esses botões
medem 36px. A classe só confunde quem lê; dá para tirar quando passar por perto.

### B3. Área segura do iPhone

`index.html:6` não tem `viewport-fit=cover`. Sem ele, `env(safe-area-inset-*)`
vale 0: o `pb-safe` da barra inferior, o `pt-safe` do cabeçalho e o
`calc(… + env(safe-area-inset-bottom))` do FAB não fazem nada. Hoje isso é
inofensivo, porque o navegador deixa a página fora da área do entalhe. Se um dia
entrar `viewport-fit=cover` (para o PWA ocupar a tela toda), rever as alturas
da barra inferior e dos botões `sticky` de A2.

---

## O que já está certo (não mexer)

- `DialogContent` com `grid-cols-[minmax(0,1fr)]` e altura limitada, com o defeito documentado no próprio arquivo.
- `Input` com `text-base md:text-sm`, a forma correta de evitar o zoom.
- Pessoas: tabela no desktop, cartões no celular (`Membros.tsx`).
- FAB duplicado removido de Eventos, com o motivo registrado (`Eventos.tsx:938`).
- Gráficos: todos dentro de `ResponsiveContainer`, nenhum com largura fixa.
- Os dois testes de layout e o `e2e/README.md`: medem elemento por elemento e explicam por quê.

## Sobre mexer em `components/ui/`

O CLAUDE.md (§9) pede para não editar os primitivos do shadcn sem motivo forte.
M1 e M2 são esse motivo, e o projeto já fez a mesma coisa antes. `dialog.tsx`,
`input.tsx` e `button.tsx` foram ajustados pelos mesmos defeitos de celular e
trazem o motivo em comentário. Fazer a correção no primitivo vale para todos os
usos de uma vez. Na tela, seriam 79 + 71 lugares.

## Ordem sugerida

1. **A2 e M1.** Uma linha cada, sem risco.
2. **M2.** Duas linhas nos componentes base.
3. **A1.** Uma linha no `PageHeader` + conferir Eventos e Membros.
4. **A3 e M4.** Abas.
5. **M6.** Ampliar o `ROTAS`. Assim M5, B1 e B2 passam a ser cobrados pelo teste,
   em vez de depender de nova auditoria.
6. **M3.** Testar num iPhone de verdade antes de trocar `h-screen` por `h-dvh`.

Para confirmar os itens marcados como estimados:

```bash
npm run test:layout
```

Precisa de `E2E_TELEFONE` e `E2E_SENHA` de uma **conta de teste** (ver `e2e/README.md`).
