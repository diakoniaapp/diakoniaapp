# Navegação — onde estou, de onde vim, como volto

*03/10/2026 · revisão pedida pela Telma: "frequentemente perco o contexto; acabo usando o
menu lateral para me localizar".*

## 1. Análise global (medida no código, antes de mexer)

89 telas internas (93 rotas, 4 delas só redirecionam):

| O que | Antes |
|---|---|
| Telas com trilha de navegação (breadcrumb) | **1** de 89 |
| Telas com botão "voltar" **próprio, de destino fixo** | **59** |
| Telas sem nenhum voltar | 30 |
| Telas **sem nome** no cabeçalho do celular (apareciam como "Diakonia") | **52** de 89 |
| Rotas com parâmetro (`/…/:id`) | 31 |
| Telas que **não estão no menu** (só se chega por dentro de outra tela) | **64** de 89 |
| Telas sem `<h1>` no próprio arquivo | 20 (a maioria usa o componente `PageHeader`; não alterado) |

**Onde a pessoa se perdia, concretamente:**
- O "voltar" tinha destino fixo. Em 19 telas financeiras ele apontava para `/financas`
  ("Contas correntes"), uma tela que **nem está mais no menu**: quem chegou pelo Painel da
  Tesouraria clicava na seta e caía noutro lugar.
- Dois voltar na mesma pilha: a Central de Documentos voltava para a *Auditoria*, a Auditoria
  para o *Painel*, o Painel para onde?
- No celular, o voltar do cabeçalho era `navigate(-1)` **cego**: numa tela aberta por link
  colado ou logo após o login, saía do sistema.
- As abas do Painel da Tesouraria (Operações, Gestão, Cadastros, Fechamento) eram só estado
  interno: sem endereço, e **voltar de uma tela reabria o painel na aba errada**.
- 64 telas só se alcançam por dentro de outra: sem trilha, o menu lateral era o único mapa.

## 2. O que foi feito

Uma **barra de contexto única** no topo de toda tela interna
(`components/layout/BarraDeContexto.tsx`), alimentada por um **registro das telas**
(`lib/navegacao.ts`) — em vez de editar 89 telas:

```
← Voltar · Painel da Tesouraria
⌂ Home › 🏦 Financeiro › Fechamento › Central de Documentos
```

1. **Onde estou** — a trilha: Home › Módulo (workspace) › Seção › telas-pai › tela atual.
   Módulos: Financeiro, Pessoas, Diaconia, Discipulado, Pastoral, Secretaria, Liderança, Sistema.
   No Financeiro a seção é a **aba do Painel** (Operações, Gestão, Cadastros, Fechamento).
2. **De onde vim** — o botão diz o nome da tela anterior ("· Painel da Tesouraria").
3. **Como volto** — "Voltar" usa o histórico **do app** (posição em `history.state.idx`,
   guardada por aba em `sessionStorage`). Sem histórico válido (link colado, primeira tela da
   aba, anterior era o login, mesma tela com outra query), vira **"← Voltar para Financeiro"**
   (módulo) ou "Voltar para <tela-pai>" nas telas-filhas; nunca sai do sistema.
4. **Qual módulo** — o ícone e o nome do módulo na trilha; o nome real do que está aberto
   ("Bradesco", "Classe Jovens", o nome do fornecedor…) vem da própria tela
   (`useRotuloDaTela`, ligado em 8 telas de detalhe).
5. **Celular** — a trilha encurta para `Home › Financeiro › … › Tela atual`; o "…" abre o
   caminho inteiro. O cabeçalho do celular passou a mostrar o nome de **todas** as telas
   (37 → 89) e perdeu o `navigate(-1)` cego (o Voltar fica na barra, com histórico).
6. **Abas com endereço** — `/painel-tesouraria#fechamento` (e `#operacoes`, `#gestao`,
   `#cadastros`). Trocar de aba grava o endereço **sem criar entrada no histórico**: ir para
   uma tela e voltar reabre o painel **na mesma aba**.
7. **Os 51 botões de voltar de destino fixo foram removidos** de 50 telas (a barra os
   substitui; ter dois voltar com destinos diferentes era o problema). Ficaram os "voltar"
   que **não mudam de rota** (ex.: fechar o detalhe de uma reunião e voltar à lista, passo
   anterior de um assistente).

**Para a próxima tela nova:** uma linha em `TELAS` (`lib/navegacao.ts`). Um teste lê o
`App.tsx` e **reprova** se alguma rota interna ficar sem entrada (ou sobrar entrada de rota
que não existe mais) — a navegação não se desfaz em silêncio.

## 3. Decisões e limites

- A trilha usa os nomes das abas do Painel ("Fechamento"), não "Fechamento Contábil" — é o
  que está escrito na tela.
- As telas de **Discipulado** não têm uma tela-casa (o menu agrupa EBD e Pequenos Grupos): o
  módulo aparece na trilha como texto, sem link. Se a Telma quiser um painel de Discipulado,
  é uma tela nova.
- A tela de cada módulo "casa" (Painel de Pessoas, da Tesouraria, Pastoral, Secretaria)
  mostra o **nome do módulo** como última migalha, sem repeti-lo.
- Telas fora do registro (404, login, impressão da agenda) não mostram a barra.
- O título grande e a descrição de cada tela continuam sendo da própria tela; a barra não
  duplica o `<h1>`.
