# O papel da Central de Documentos — recomendação de arquitetura

> **Decisões dela (23/10/2026): as cinco recomendações foram aprovadas** — nome "Importar documentos em lote"; um chip por mês; KPI do ano só dentro da importação ("Andamento da regularização de 2026"); mesmo acesso do Financeiro; Ctrl+K e Fechamento mantidos com o novo nome. **Implementado no mesmo dia** (ver a seção 8 no final).

Análise de **23/10/2026**. Só leitura: código (`FinancasCentralDocumentos.tsx`, `FinancasAuditoriaAnexos.tsx`, `FilaDePendencias`, `FechamentoMensal`, `MesaDoTesoureiro`, `navegacao.ts`, `CommandPalette`) e uma consulta somente leitura a `fin_lancamento_anexos` pela sessão dela no navegador. **Nada foi alterado.**

## 1. Quantos acessos a Central recebe?

**Não existe contador de acessos** (o app não tem telemetria de telas). O que dá para medir é o *efeito*: os anexos gravados. Em `fin_lancamento_anexos`:

| Medida | Valor |
|---|---|
| Anexos desde 02/10 (a Central nasceu em 03/10) | **583**, todos gravados pelo mesmo usuário (a Telma) |
| Em rajadas de 5 ou mais arquivos em menos de 3 min (ritmo de lote) | **393 (67%)**, em 24 rajadas |
| Dias com lote | 03/10, 09/10, 14/10, 15/10, 16/10 e 18/10 (domingo à noite: ~124 anexos em 6 rajadas) |
| **Desde 19/10 (5 dias)** | **36 anexos, nenhum em lote** (18 · 4 · 3 · 10 · 1 por dia) |

Leitura: a Central cumpriu o papel para o qual nasceu — **uma onda de migração** (o card dela mede "de 0,3% para 27,2%") — e o uso em lote **parou depois de 18/10**. *Limite da medida:* dois blocos (34 em 03/10 e 56 em 09/10, cada um dentro de um mesmo minuto) têm ritmo de script, não de gente; e uma rajada pode vir da Central ou de qualquer outro lote. Os números dizem "uso em lote", não "visitas à tela".

## 2. O que a Central faz que mais nada faz

Existe equivalente para anexar **um** documento a **uma** obrigação (o diálogo de anexos, a ação de cada linha da fila da Auditoria, o Pagar). Não existe equivalente para:

1. **Soltar uma pasta/dezenas de arquivos e o sistema ler (PDF/XML/imagem) e sugerir a obrigação de cada um** — leitura + casamento + revisão;
2. **detectar duplicatas por hash** (o mesmo arquivo não entra duas vezes);
3. **"Desfazer o último lote"** e o CSV do lote;
4. **órfãos**: arquivos que foram para o armazenamento e não ficaram ligados a lançamento nenhum;
5. o card **"Cobertura documental 2026"** (o KPI de 03/10: 0,3% → 15% → 45% → 80%, meta 80%, ideal 95%) — **só existe lá** (`CoberturaDocumentalCard` não é usado em nenhum outro lugar).

O que **não** justifica mais: ser a porta de entrada de "o que falta documentar" — esse papel é da Auditoria/Prontidão.

## 3. Ela ainda faz parte do fluxo principal?

Hoje há **cinco** caminhos para a Central, e três deles estão na primeira tela ou perto dela:

| Onde | O que diz |
|---|---|
| **Mesa › "Também hoje"** | chip "Documentos para a contabilidade · 13 pagamentos sem documento neste mês" → Central |
| **Mesa › cartão "Documentos para a contabilidade"** | botão "Abrir Central de Documentos" |
| **Fechamento › etapa 3 Prontidão** | botão "Anexar em lote" (ao lado de "Tela cheia, com filtros", que vai para a Auditoria) |
| Ctrl+K | "Anexar documentos em lote (Central de Documentos)" |
| Favoritos/trilha | a tela está em `lib/navegacao.ts` (pode ser fixada; trilha "Financeiro › Fechamento › Central de Documentos") |

Ela **não** está no menu lateral. Ou seja: a Tesouraria chega à Central sobretudo pelo chip e pelo cartão — exatamente os dois pontos em que ela quer ser conduzida às pendências.

## 4. Achados que mudam a proposta

1. **A Auditoria já abre nas pendências.** A fila (`FilaDePendencias`) guarda a visão na URL com padrão `vista=pendencias`; o link `…/auditoria-anexos?mes=AAAA-MM` já chega "filtrado". **Nada novo a construir para o filtro principal.**
2. **Mas o mês precisa ir no link.** A Auditoria abre, por padrão, no **mês anterior** (feita para o fechamento). O chip da Mesa fala do mês **corrente** — sem `?mes=` ele levaria ao mês errado.
3. **O número do chip é ambíguo na janela de fechamento.** Dias 1–20, `documentosFaltando` soma **o mês anterior + o corrente** e o chip escreve "neste mês". Hoje (23/10) mostra só outubro (13); em 05/11 somaria outubro e novembro sob o rótulo "neste mês", e o destino (um mês só) não bateria com o número. A Auditoria de setembro, na sua captura, mostra **24 pendências** (3 críticas · 19 parciais · 2 administrativas): é *esse* número que deve levar à Auditoria de setembro.
4. **Três percentuais de documentação convivem, com definições e períodos diferentes:** "84,7% prontidão do malote" (Auditoria, um mês: completas + dispensadas ÷ total); "X% com documentação completa" (cartão da Mesa, por mês: completas ÷ as que exigem); e "27,2% documentado — 226 de 832" (Central, o **ano**: o KPI de migração). Quem vê o 27,2% e o 84,7% no mesmo dia lê duas verdades.
5. O que falta num lote **parcial** (19 de 24 pendências de setembro são *parciais*: "falta o comprovante do PIX da…", "falta a NF") é, quase sempre, **um documento específico de uma obrigação específica** — trabalho de linha, não de pasta.

## 5. Recomendação (A, B ou C?)

**Combinar A + C; descartar B.**

- **A — sair do fluxo principal: sim.** Tirar a Central do chip e do cartão da Mesa; a primeira tela passa a conduzir à **Auditoria** (pendências).
- **C — renomear: sim**, para o que a tela é: **"Importar documentos em lote"** (ela sugeriu "Importação em lote de documentos"; os verbos de ação são mais fáceis de achar no Ctrl+K — decisão de redação dela).
- **B — "ferramenta administrativa": não.** Quem faz o lote é a própria Tesouraria (foi a Telma, em 6 dias). Escondê-la atrás do papel de administração faria o recurso desaparecer para quem o usa; a rota continua com o mesmo acesso do Financeiro.
- **Manter** a tela (ela é a única com leitura + casamento em massa) e a rota `/financas/documentos` (favoritos e links continuam valendo — só o nome muda).

### Desenho

```
Mesa (Tesouraria)                         Auditoria de documentos (?mes=…, Pendências)
 Também hoje:                              Prontidão do malote 84,7%
  [Setembro: 24 sem documento →] ─────────▶ fila de pendências (críticas · parciais …)
  [Outubro: 13 sem documento  →] ─────────▶   por linha: Anexar / Abrir / Editar
 Cartão "Documentos para a contabilidade"   ┌──────────────────────────────────────┐
  Setembro  84,7%  · 24 faltando  → Auditoria│ secundário: "Importar em lote…" ─────┼──▶ Importar documentos em lote
  Outubro   …                     → Auditoria│ (mesma tela de hoje, com outro nome) │     (Central, renomeada)
  [Resolver pendências]                      └──────────────────────────────────────┘
  texto discreto: "Tem uma pasta? Importar em lote"
Fechamento › 3 Prontidão: fila inline (como hoje) + "Importar em lote" (renomeado) + "Tela cheia"
```

Mudanças, uma a uma (sem migration):

1. **Chip da Mesa** vira um chip **por mês** dentro da janela (dias 1–20: "Setembro/2026 · 24 sem documento" e "Outubro/2026 · 13 …"; fora dela, só o corrente), cada um com link `/financas/auditoria-anexos?mes=AAAA-MM` (Pendências é o padrão). Corrige o rótulo "neste mês" que hoje soma dois meses.
2. **Cartão "Documentos para a contabilidade"**: o botão "Abrir Central de Documentos" vira **"Resolver pendências"** (→ Auditoria do mês com mais pendências); cada linha de mês também leva à Auditoria daquele mês; um link pequeno "Importar em lote" mantém a Central a um clique.
3. **Auditoria**: botão secundário "Importar documentos em lote" no cabeçalho (ao lado de "Abrir o Fechamento do mês").
4. **Fechamento etapa 3**: "Anexar em lote" → "Importar em lote" (só o rótulo).
5. **Renomear** em `navegacao.ts` (trilha/favoritos), `navConfig.ts` (rótulo da rota), `CommandPalette` e no título da própria tela; a descrição passa a dizer "para quando você tem muitos arquivos de uma vez".
6. **Dentro da tela importada**: depois de "Gravar", um botão **"Ver o que ainda falta"** → Auditoria do período; e um link "← Voltar para as pendências" no topo.
7. **Um percentual só na tela principal:** a prontidão do malote (84,7%) é o número da Tesouraria. O card "Cobertura documental 2026 · 27,2%" fica **só dentro da importação**, relabelado como **"Andamento da regularização de 2026"** (ele mede a migração do ano, não o mês) — para ser aposentado quando passar da meta ou ao fim do ano.

Esforço: **≈ 1 dia**, só front-end e testes (links, rótulos, o chip por mês); sem banco, sem função de servidor. Risco principal: o link do chip precisa levar o `?mes=` certo (hoje a Auditoria abriria no mês anterior); o teste de rotas (`TELAS` × `App.tsx`) exige que a renomeação siga em `navegacao.ts`.

## 6. Decisões que dependem dela

1. **Nome:** "Importar documentos em lote" (recomendado) ou "Importação em lote de documentos"?
2. **Chip por mês** na janela de fechamento (recomendado) ou um chip só que aponta para o mês mais antigo com pendência?
3. **KPI do ano** ("27,2%"): ficar só na tela de importação, como "Andamento da regularização de 2026" (recomendado), ou sair de vez?
4. **Quem enxerga a importação:** o mesmo acesso do Financeiro (recomendado) ou só administração (opção B)?
5. **Atalho no Ctrl+K e na etapa 3 do Fechamento:** manter com o novo nome (recomendado)?

## 7. O que ficou de fora de propósito

- Não propus apagar a Central nem seu código: leitura/casamento em massa não existe em outro lugar, e a próxima remessa de documentos de uma pasta (ex.: a pasta mensal do Drive) volta a precisar dela.
- Um filtro "o que falta" na URL da Auditoria (`?falta=nota_fiscal`) ajudaria links ainda mais específicos (ex.: "3 sem nenhum anexo"); fica para depois de ela ver o uso.
- Não medi "acessos" de verdade; se ela quiser decidir pelo uso real, o caminho é registrar a visita a essas telas por algumas semanas (uma linha por abertura) — não existe hoje.

## 8. O que foi implementado (23/10/2026)

- **Mesa › "Também hoje":** um chip por mês, "Documentos de Outubro/2026 · 23 pendências", cada um levando a `/financas/auditoria-anexos?mes=AAAA-MM` (a fila abre em Pendências). Dentro da janela de fechamento (dias 1–20) o mês anterior vem primeiro. O chip deixou de apontar para a Central.
- **Número igual ao da Auditoria:** a Mesa contava só as incompletas (13 em outubro) e a Auditoria mostra 23 (13 incompletas + 10 ajustes administrativos). Agora a Mesa conta como a Auditoria (`pendenciasDaAuditoria`); no cartão, "23 pendências (13 de documento · 10 administrativas)".
- **Cartão "Documentos para a contabilidade":** "Abrir Central de Documentos" virou **"Resolver pendências"** (Auditoria do mês mais urgente) e cada "N pendências" é link; a importação ficou num link discreto ("Importar documentos em lote").
- **Auditoria:** botão secundário "Importar documentos em lote" no cabeçalho (só para quem opera).
- **Fechamento, etapa 3:** "Anexar em lote" → "Importar em lote".
- **Nome:** "Importar documentos em lote" na tela, na trilha/favoritos (`navegacao.ts`), no rótulo da rota, no Ctrl+K (a busca ainda acha por "central"). A rota `/financas/documentos` não mudou.
- **Dentro da importação:** link "Ver o que falta (Auditoria)" no topo, "Ver o que ainda falta" depois de gravar, e o card do ano passou a "Andamento da regularização de 2026 · N% concluído" (só existe aqui).
- Sem banco, sem função de servidor. Verificado no navegador (375 px e 1280 px) com dados reais: o chip de outubro abre a Auditoria de outubro com **Pendências 23**, igual ao chip.
