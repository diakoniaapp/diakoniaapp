# Revisão da experiência de navegação — análise (22/10/2026)

Só análise: **nada foi implementado**. Feita por leitura do código e medição por busca (`grep`) em `src/`. **Não reproduzi cada caso na tela** — onde o item é "confirmado no código, não visto na tela", está escrito.

## 1. Como o sistema navega hoje (o que já existe)

| Peça | O que faz |
|---|---|
| `BarraDeContexto` + `hooks/useNavegacao.tsx` | O botão **Voltar** de toda tela interna. Usa `navigate(-1)` (histórico real) quando há tela anterior dentro do app; só sem histórico vai para o "pai" da tela (`lib/navegacao.ts`, campo `pai`). |
| `anteriorValida` | Diz que não há anterior quando: é a 1ª tela da aba, a anterior era o login, **ou a anterior tem o mesmo caminho** (só `?query`/`#hash` diferentes). |
| `AppLayout` → `<main key={location.pathname}>` | **Remonta a tela inteira a cada mudança de caminho.** É o fato estrutural que explica quase tudo abaixo. |
| Filtros na URL | Só alguns: Extrato da conta, Extrato de Obrigações, Prestação de Contas, Auditoria de Anexos (mês), Pessoas (só o tipo), Visitantes (aba). |
| Rolagem | Só `Membros.tsx` tem "ao trocar de página, volta ao topo" (`irParaPagina`). |

### Três causas-raiz

1. **A tela é remontada ao voltar.** Tudo que está em `useState` (busca, mês, página, aba interna, "mostrar mais") nasce de novo. O que está na URL sobrevive, porque o histórico guarda a URL.
2. **A rolagem não volta.** O `<main>` novo começa em 0; nenhum código guarda nem restaura a posição.
3. **Painéis (diálogos) não são entradas do histórico e não empilham.** Cada um *substitui* o anterior: ao fechar o último, cai na lista, não no painel de onde se veio. Só um caso é tratado à mão (Anexos → reabre a Documentação).

## 2. Problema 1 — onde o "Voltar" leva ao lugar errado

| # | Onde | O que acontece | Certeza |
|---|---|---|---|
| 1.1 | **Extrato de Obrigações** (`FinancasExtratoObrigacoes.tsx:270`) — botão "← Tesouraria" | `<Link to="/painel-tesouraria">` fixo: vem-se da Mesa, do Fechamento ou da Prontidão e cai na aba **padrão** da Tesouraria, não na de origem. | código |
| 1.2 | **Sustento** (`financas/Sustento.tsx:86`) — seta "Voltar à Tesouraria" | Mesmo `Link` fixo. | código |
| 1.3 | **Links entre abas da mesma página** (`/painel-tesouraria#mesa` → `/painel-tesouraria?mes=…#fechamento`, p.ex. a partir da Auditoria de Anexos ou do Fechamento) | `anteriorValida` descarta "anterior com o mesmo caminho" → o botão passa a dizer "Voltar para <pai>" e **vai ao pai/Home**, não à aba de onde se veio. | código (provável causa do seu relato; não reproduzido) |
| 1.4 | **Painéis em cadeia** — Mesa/Extrato: Detalhe → "Anexar documentos" fecha o Detalhe e abre Anexos; Documentação → Editar fecha a Documentação e abre o formulário | Ao fechar o último, cai na **lista**, não no painel anterior (`extrato/AcoesDeObrigacao.tsx`, `MesaDoTesoureiro.tsx:431-432`). Exceção tratada: Anexos → reabre a Documentação. | código |
| 1.5 | **Seletor de conta** (`ContaComAbas.tsx:53`, `FinancasConta.tsx:269`) e **DRE ano ±1** (`FinancasDRE.tsx:84/88`) | `navigate` empilha uma entrada a cada clique: "Voltar" percorre contas/anos antigos em vez de sair da tela. | código |
| 1.6 | Telas de "não encontrado" (`<Link to="/…">Voltar</Link>`, ~14 telas) | Destino fixo, mas é estado de erro — aceitável. | — |
| 1.7 | `PessoaCard` → `/membros?abrir=ID`; Painel Pastoral → `/visitantes?aba=…` | Usam push normal, **voltam certo**; o contexto de lista é que se perde (item 3). | — |

Os botões "Voltar" de **diálogos** (Cancelar nota, Reabrir, Ignorar linha, etc.) só fecham o diálogo — comportamento certo.

## 3. Problema 2 — mudança de página não vai ao topo

Só **3 telas têm paginação de verdade**; as outras listas longas usam "Mostrar mais" (acrescentam linhas, não pulam de página).

| Tela | Estado | Por quê |
|---|---|---|
| **Extrato da conta** (`FinancasConta.tsx`, 50/pág.) | **Erro** | A lista rola dentro de `.extrato-scroll` (altura medida, desktop). `setPagina` não rola esse contêiner: a página 2 abre na altura em que o dedo estava — o rodapé. Confirmado no código. |
| **Conciliação OFX** (`ConciliacaoOFXDialog.tsx`, 50/pág.) | **Erro** | O diálogo rola (`max-h-[90vh] overflow-y-auto`) e o botão "Próxima" fica no fim da lista; `setPagina` não rola. |
| **Pessoas** (`Membros.tsx`, 20/pág.) | OK | `irParaPagina` rola a sentinela para a vista. É o modelo a copiar. |
| Extrato de Obrigações, Fila de Pendências (Prontidão), Central de Documentos | OK (sem salto) | "Mostrar mais": acrescenta; não há mudança de página. |
| DRE, Doações, Doadores | Sem lista paginada | Trocam ano/mês; DRE usa `navigate` (remonta → topo). |
| Favoritos, Cadastros, Projetos, Relatórios | Não paginam | — |

## 4. Problema 3 — telas que perdem o contexto ao voltar

Legenda: ✔ sobrevive ao Voltar · ✘ perde. "URL" = filtro refletido na URL (o histórico o guarda).

| Tela | Período / mês | Conta | Busca | Filtros / aba | Página / "mostrar mais" | Rolagem |
|---|---|---|---|---|---|---|
| Extrato da conta | ✔ URL | ✔ caminho | ✔ URL | ✔ URL (colunas: localStorage) | **✘** | ✘ |
| Extrato de Obrigações | ✔ URL | — | — | ✔ URL | **✘** (volta ao 1º lote de dias) | ✘ |
| Mesa do Tesoureiro | **✘** (mês/dia do calendário em `useState`) | — | — | **✘** visão sempre Calendário (decisão de 20/10) | — | ✘ |
| Fechamento / Prontidão | só **lido** na abertura (`?mes`), mudar o mês não grava | — | — | **✘** vista (pendências…) | **✘** | ✘ |
| Auditoria de Anexos | ✔ URL (só leitura) | — | — | — | — | ✘ |
| Conciliação OFX (diálogo) | — | ✔ | — | **✘** filtro e página (fechar o diálogo zera) | **✘** | — |
| Central de Documentos | — | — | — | **✘** | **✘** | ✘ |
| Pessoas | — | — | **✘** (tipo ✔) | **✘** grupo, situação, ordem | **✘** | ✘ |
| Visitantes | — | — | — | ✔ aba | — | ✘ |
| Favorecidos / Projetos / Centros | — | — | **✘** | **✘** (tipo, status) | — | ✘ |
| Doações / Doadores | **✘ volta ao mês/ano atual** | — | **✘** | — | — | ✘ |
| Agenda / Eventos | — | — | — | ✔ filtros e visão (localStorage) | — | ✘ |
| Assuntos | — | — | **✘** | **✘** | — | ✘ |

A **rolagem** é ✘ em todas, sem exceção (causa 2).

## 5. Padrão proposto para o sistema inteiro

**Regra de ouro:** *tudo que responde "onde eu estava?" mora na URL; tudo que é "como eu gosto de ver" mora no localStorage.* O histórico do navegador passa a restaurar sozinho.

| Camada | Peça | Efeito |
|---|---|---|
| **A. Estado de lista na URL** | um gancho `useEstadoNaUrl` (busca, filtros, ordem, mês, **página**, vista), sempre com `replace`, omitindo o valor padrão | busca, período, conta, filtros e página voltam ao Voltar. O Extrato da conta já faz o espelhamento à mão — é generalizar. |
| **B. Rolagem restaurada** | um único gancho no `AppLayout` que guarda o `scrollTop` do `<main>` por entrada do histórico e o restaura **só em Voltar (POP)**, depois dos dados carregarem; em link novo continua no topo | "voltar para onde eu estava", em todas as telas, sem mexer em cada uma. Para contêineres internos (`.extrato-scroll`) um gancho irmão. |
| **C. Mudar de página = topo** | `usePaginacao()` (devolve `pagina` na URL + `irParaPagina`, que rola o contêiner rolável mais próximo da sentinela) | Extrato e Conciliação ganham; Pessoas migra do código próprio para o gancho. |
| **D. Voltar** | (1) os dois `Link` fixos (1.1, 1.2) passam a usar `voltar(fallback)`; (2) `anteriorValida` aceita anterior de mesmo caminho quando `?query`/`#hash` diferem; (3) seletor de conta e DRE usam `replace` | "Voltar" volta à aba/tela de origem. |
| **E. Pilha de painéis** | `useAcoesDeObrigacao` ganha uma pilha: ao fechar Editar/Anexos/Documentação, reabre o painel de onde veio | Mesa → obrigação → documentação → editar → fechar volta à documentação. |

### Ordem sugerida

1. **Rápido e seguro:** C (Extrato + Conciliação) e D (1.1, 1.2) — corrige o que você viu hoje.
2. **Maior ganho:** B (rolagem restaurada no `AppLayout`) + A nas telas de lista (Pessoas, Favorecidos, Projetos, Centros, Doações/Doadores, Mesa, Fila, Central de Documentos).
3. **Por último:** E (pilha de painéis) — mexe em fluxos de pagamento e documentação, pede mais cuidado e teste.

## 6. Decisões suas antes de implementar

1. **Mesa sempre abre no Calendário** (decisão de 20/10): ao **voltar** de uma obrigação, restaurar a visão/mês/dia em que estava, e só ao **abrir pelo menu** ir ao Calendário de hoje? *(recomendado)*
2. **Seletor de conta / ano do DRE:** trocar sem empilhar (Voltar sai da tela) *(recomendado)* ou empilhar (Voltar volta à conta anterior)?
3. **Fechar o diálogo da Conciliação OFX** descarta o arquivo analisado e a página. Guardar o arquivo/estado por alguns minutos para reabrir de onde parou, ou manter como está?
4. **Restaurar rolagem em todas as telas** (camada B) ou só nas listas?

## 7. O que esta análise não cobriu

- Reprodução na tela de cada item; os de "código" acima estão marcados.
- Navegação de **celular** (menu inferior, gesto de voltar): o cabeçalho do celular já usa `voltar` do mesmo contexto, mas não foi testado.
- Telas fora do escopo pedido (EBD, PGM, Arrecadação, Governança) usam o mesmo `BarraDeContexto`/`<main key>`: valem as mesmas causas-raiz.
