# Auditoria estratégica do módulo Financeiro — 20/10/2026

Só análise: nenhum código, nenhuma migration, nenhuma correção. Base: leitura do código (rotas, páginas, componentes, serviços) e contagens **só de leitura** no banco de produção.

## 0. O que esta análise sabe e o que não sabe

- **Não há telemetria de uso** (nenhum contador de acesso por tela). "Uso real" abaixo é **inferido** de três coisas: o volume e a data do último registro que cada tela produz no banco, os favoritos que você fixou (4), e o que você me pediu nas últimas semanas. Onde for chute, está escrito "inferido".
- Li a fundo: Mesa, Agenda, Extrato de Obrigações, Auditoria de Documentos, Fechamento Mensal, Ciclo, Malote (pacote), Quitação, Débito Automático, Painel da Tesouraria. Li só o cabeçalho e as ligações de: Insights, Visão Executiva, DRE, Orçamento, Estoque, Folha, Fiscal, Reuniões, Doações/Doadores, Centros, Projetos, Admin. A classificação destas é menos firme.
- `OBRIGACOES.pdf` e `PRESTACAO.pdf` (Downloads) são de **19/10 às 23:55**, antes do redesenho publicado em 20/10 (`152ea4a`). O pedido de "padrão da Prestação" para o Extrato já foi entregue; ver §6.

## 1. Fotografia

- **35 rotas `/financas/*`** + o Painel da Tesouraria; 32 arquivos de página (~15,3 mil linhas); 94 componentes em `components/financas`. O Painel sozinho tem 1.462 linhas.
- **9 entidades têm página E gaveta (drawer)**: contas/extrato (`ExtratoContaDrawer` × `/financas/conta/:id`), conciliação, favorecidos, recorrências, estoque, orçamento, projetos, contratados, missões. É o padrão de duplicação mais sistemático.

### Dados de produção (20/10/2026)
| O quê | Volume | Leitura |
|---|---|---|
| Saídas pagas / entradas realizadas | 5.122 / 8.339 | o núcleo vivo é **o livro de lançamentos** |
| Saídas previstas | 483 (40 recorrências ativas; 81 débitos automáticos, 373 boletos) | Mesa/obrigações têm uso real |
| Entradas **previstas** | **1** | "Contas a Receber" não existe na prática: receita se registra depois de acontecer |
| Origem Omie (histórico) / manual / OFX | 9.847 / 262 / 0 | OFX concilia por vínculo (382), não cria linha |
| Liquidações | 56 | Central de Pagamentos usada |
| Quitações por terceiros | 19 | modelo robusto para pouco volume |
| Malote: envios / itens | **1** envio (set/2026), 95 itens | o ciclo de fechamento foi exercitado **uma vez** |
| `fin_fechamentos_periodo` (aprovação de período) | **0** | o estado "Arquivada" **nunca** ocorreu |
| Reaberturas | 95 (= nº de itens do malote) | **a verificar**: coincide com o envio inteiro |
| Documentos do fechamento | 9 | recém-nascido |
| Favoritos | 4 (Prestação, Extrato de Obrigações, Auditoria de documentos, Famílias) | o que você realmente abre |
| Estoque, Orçamento, Folha, Reuniões, Decisões, Metas, Rateio, Solicitações, Chave PIX | **0** cada | módulos construídos e nunca usados |
| Contratados / Projetos | 1 / 1 | uso simbólico |

## 2. Achados estruturais (o que realmente pesa)

**F1 — Sete vocabulários de "estado" para a mesma obrigação.** `EstadoDoCiclo` (9), selo do Extrato (6), `SituacaoDoDebito` (5), `SituacaoDocumental` (4) + `Gravidade` (3), filas da Quitação (5), urgência da Agenda (5), janelas da Mesa (5) e o `status` do lançamento. Cada tela mostra uma lente diferente e **nenhuma diz "o que preciso fazer com esta obrigação agora"** numa palavra só. O Ciclo foi desenhado para ser a definição única, mas o Extrato, a Agenda e a Auditoria não o usam como linguagem.

**F2 — Seis componentes de linha para a mesma coisa** (uma obrigação): `LinhaDeConta` (Mesa), linha da Agenda, `ObrigacaoItem` (Extrato), `LinhaDaFila` (Auditoria), linha de Liquidações do Período, `ContasJaPagas`. Cada um com suas ações e seu chip. É isto que faz o sistema parecer "várias telas resolvendo o mesmo problema": **são mesmo**.

**F3 — A Agenda é um subconjunto estrito da Mesa.** Mesma fonte (`listarProximosVencimentos`), mesmo horizonte (30 dias = `DIAS_DA_MESA`), mesma ação (`useAcoesLancamento`/Pagar). A única diferença é o filtro de entradas, e há **1** entrada prevista no banco inteiro.

**F4 — Três portas para gerar o malote e duas cópias do checklist do mês.** O ZIP sai do Fechamento Mensal (`gerarMalote`), do `/financas/relatorio` (`PacoteContabilCard`) e do botão "Gerar pacote" da Auditoria (que só leva ao segundo). O checklist de documentos do mês (extrato, OFX, cartão, adquirente) existe na etapa 4 do Fechamento **e** (por mim, hoje) na Auditoria. Isso é uma redundância que eu mesmo criei e recomendo desfazer (§5).

**F5 — O ciclo mistura dois eixos.** A obrigação vive: prevista → em aberto → paga → conciliada. O **mês** vive: aberto → pronto → enviado → aprovado. "Pronta para Malote / Enviada / Arquivada" são propriedades do **pacote do mês**, não da obrigação, mas hoje cada despesa carrega o estado. Resultado: três painéis contam "prontas" de três jeitos (Mesa, Fechamento, Auditoria) e a reabertura precisa de 95 registros para um envio.

**F6 — Relatórios sobrepostos.** Prestação de Contas × DRE × Visão Executiva × Insights × Indicadores Eclesiásticos/Missionários (no Painel) × Prestação do Centro × Relatório de Contas. Dois gráficos de fluxo de caixa (Prestação e Executivo) e **três** telas de alertas (Insights, Executivo, seção "alertas" do Painel). Você abre, na prática, a Prestação.

**F7 — Módulos construídos e nunca adotados** (0 registros): Estoque, Orçamento (e a visão orçamento×real), Folha, Reuniões Financeiras, Metas de campanha, Rateio. Pesam no menu, no Painel (gavetas) e na manutenção.

**F8 — O Painel da Tesouraria é três produtos num arquivo:** a Mesa (operar), a gestão (indicadores, missões, orçamento, alertas) e o hub de cadastros (gavetas). 1.462 linhas, 4 abas, 12 gavetas.

## 3. Tabela tela a tela

Classes: **A** essencial · **B** complementar · **C** redundante · **D** pode ser absorvida. "Uso" = inferido (ver §0).

| Tela | Problema que resolve | Uso (inferido) | Sobreposição | Classe | Recomendação |
|---|---|---|---|---|---|
| Mesa do Tesoureiro (aba 1) | O que fazer hoje: pagar, débitos automáticos, quitações, caixa | Diário, Tesouraria | Agenda, Liquidações do período, Prazos/Pendências de Quitação | **A** | **Evoluir** — vira a única porta do dia a dia |
| Agenda Financeira | Lista de vencimentos | Raro (inferido: o que importa já está na Mesa) | Mesa (idêntica em dados e horizonte) | **D** | **Fundir** na Mesa como visão "Calendário" |
| Extrato de Obrigações | Livro das obrigações do período: ler, filtrar, imprimir | Semanal/mensal (favorito) | Mesa (operar), Auditoria (documentos) | **A** | **Evoluir** — vira o "Livro de Obrigações" com lentes |
| Extrato Bancário (`/conta/:id`) | Livro-razão de uma conta, importar OFX/PDF, conciliar | Diário/semanal | `ExtratoContaDrawer`, Relatório de Contas, Auditoria do Extrato | **A** | **Evoluir** — única porta das contas |
| Contas correntes (`/financas`) | Saldos e acesso às contas | Semanal | cartões de conta do Painel | **B** | **Transformar** — vira a aba "Contas" do mesmo lugar do extrato |
| Relatório de Contas | Extrato de várias contas juntas (impressão) | Raro | Extrato Bancário | **D** | **Fundir** — modo de impressão multiconta do extrato |
| Auditoria do Extrato | Por que o saldo não bate com o banco (Invest Fácil, R$ 1,00) | Pontual, alta importância | Conciliação OFX | **B** | **Fundir** como aba de "Contas" (diagnóstico) |
| Conciliação OFX (dialog + drawer) | Casar extrato × lançamentos | Semanal | Mesa de Conciliação, ExtratoContaDrawer, Auditoria do Extrato | **A** (motor) / **C** (duas entradas) | **Manter o motor, eliminar a gaveta duplicada** |
| Auditoria de Documentos | Prontidão documental do mês + fila de pendências | Mensal (favorito) | Fechamento (etapa 3/4), Central de Documentos, Malote | **A** | **Transformar** — vira a etapa "Prontidão" do Fechamento |
| Central de Documentos | Anexar em lote e casar arquivos com lançamentos | Esporádico, intenso no fechamento | Auditoria (Anexar linha a linha) | **B** | **Fundir** como ferramenta ("Anexar em lote") da Prontidão |
| Fechamento Mensal (aba 4) | Fluxo único de fechar o mês | Mensal (1 envio até hoje) | Malote Contábil, Auditoria, Documentos do Fechamento | **A** | **Evoluir** — vira a casa do mês (assistente em etapas) |
| Malote Contábil (`/relatorio`) | ZIP + resumo mensal + CSV | Mensal | Fechamento, Prestação (resumo) | **C** | **Eliminar a página**; o ZIP mora no Fechamento |
| Ciclo da Despesa | Estado e próximo passo de uma obrigação | Em toda tela | — | **A** (domínio) | **Evoluir** — vira o vocabulário único (F1) |
| Recorrências (página + gaveta) | Gerar obrigações futuras (40 ativas) | Semanal/mensal | gaveta × página | **B** | **Fundir** — uma só, em Cadastros |
| Obrigações / Contas a Pagar | (não há tela própria: Mesa + Extrato + Agenda) | Diário | ver F2 | — | **Fundir** — Mesa (operar) + Livro (consultar) com linha única |
| Contas a Receber | (não existe; 1 entrada prevista) | — | — | — | **Não criar.** Receita se registra no fato |
| Reembolsos / Compras por Terceiros / Quitações (diálogos, filas, cards) | Política de Quitação (19 casos) | Eventual, crítico | Mesa (2 cartões), Extrato (filtros), Prestação | **A** (regra) | **Manter a regra; reduzir as superfícies** a: fila na Mesa + ação na linha |
| Prazos / Pendências de Quitação | Prazos e filas da Política | Eventual | Mesa (completo) **e** aba Gestão do Painel (compacto): duas superfícies para a mesma fila | **C** | **Fundir** numa fila só |
| Sustento | Conta corrente pastoral (sigilo) | Mensal, 1–2 pessoas | — | **B** | **Manter** separado (perfil e privacidade próprios) |
| Prestação de Contas | Relatório canônico do período | Mensal (favorito) | DRE, Executivo, Relatório de Contas | **A** | **Manter** — é o padrão de relatório |
| DRE | Demonstração contábil | Eventual | Prestação (parte) | **B** | **Manter**, ligada à Prestação |
| Visão Executiva / Insights / Indicadores Eclesiásticos e Missionários / alertas do Painel | Leitura estratégica | Raro (inferido) | Entre si e com a Prestação (fluxo de caixa e alertas ×3) | **B/C** | **Fundir** num só "Painel de gestão"; eliminar Insights e os alertas duplicados |
| Prestação do Centro / Centros / Centro (detalhe) | Gasto por centro de custo | Raro | Prestação (filtro por centro) | **D** | **Fundir** — filtro de centro na Prestação; o detalhe fica |
| Projetos (página + gaveta + detalhe) | Gasto por projeto (1 projeto) | Raro hoje; **120 Anos** tende a crescer | Prestação (filtro por projeto) | **B** | **Fundir** página/gaveta; manter o detalhe |
| Favorecidos (página + gaveta + detalhe) | Cadastro de quem recebe | Semanal | gaveta × página | **A** | **Fundir** página/gaveta |
| Contas e categorias (Admin) | Cadastros base | Raro | — | **A** | **Manter** em Cadastros |
| Doações / Doadores | Arrecadação e ficha do doador | Semanal (outros perfis) | — | **B** | **Manter** (perfil próprio) |
| Fiscal (módulo) | Obrigações e malote fiscal (0 documentos) | Raro | Fechamento | **B/C** | **Transformar** em etapa/aba do Fechamento, ou dormir até uso |
| Calculadoras (Folha) | CLT/RPA | Raro | — | **B** | **Manter** como ferramenta (0 competências gravadas) |
| Orçamento | Plano vs realizado | **0 registros** | — | **C** | **Eliminar do menu** (dormente) até haver decisão de usar |
| Estoque | Estoque da igreja | **0** | PDV (modelado e nunca construído) | **C** | **Eliminar do menu** |
| Reuniões Financeiras | Atas e decisões | **0** | — | **C** | **Eliminar do menu** |
| Doações Missionárias / Missões (gaveta + indicadores) | Remessas e fundo missionário | Mensal | Indicadores Missionários | **B** | **Fundir** com o Painel de gestão |
| Fluxo de Débito Automático | Acompanhar débitos pelo tempo | Diário (novo) | Mesa (cartão), Extrato (chip), Ciclo | **A** | **Manter** — já está nos três lugares certos |

## 4. Os quatro casos específicos

### Agenda Financeira
Resolve o mesmo problema da Mesa (o que vence e quando), com os mesmos dados e a mesma ação. Não deve continuar como tela. O que poderia ter valor próprio é **a visão de calendário** (mês em grade, com o total de cada dia) — que a Mesa, organizada por janelas (hoje/amanhã/semana), não dá. Recomendação: **fundir na Mesa** como visão alternativa "Calendário de vencimentos" (grade do mês, mesmo componente de linha ao abrir um dia) e redirecionar `/financas/agenda` para ela. **Não** vale uma aba separada: seria uma segunda lista.

### Auditoria de Documentos → Prontidão
Sim: ela torna redundantes (1) a etapa "Documentação" do Fechamento, (2) o contador "Documentos para a contabilidade" da Mesa, (3) o `PacoteContabilCard` / página do Malote como lugar de conferência, (4) o `CoberturaDocumentalCard` (mesma conta com outro nome) e, em parte, (5) a lista "sem documento" do ZIP (`PENDENCIAS.csv`). Mas ela **não** deve virar uma tela solta: o dono do mês é o Fechamento. Recomendação: a Auditoria vira a **etapa "Prontidão"** do Fechamento (a mesma tela, aberta por link direto), e o checklist de documentos do mês que eu pus nela **sai** (já é a etapa 4 do Fechamento).

### Extrato de Obrigações: consulta, operação e auditoria ao mesmo tempo?
Está virando as três, e **isso é desejável quando é a mesma obrigação vista por lentes, e indesejável quando cada lente reimplementa a lista**. A unidade do trabalho da Tesouraria é a obrigação; o erro seria obrigá-la a trocar de tela para cada pergunta. Recomendação: **uma só lista de obrigações** (mesma linha, mesmo estado, mesmos filtros) com três lentes pré-definidas:
- **Operar** (o que preciso fazer: pagar, conferir débito, aprovar reembolso) = a Mesa;
- **Fechar** (o que falta para o mês: documentos, conciliação) = a Prontidão;
- **Reportar** (o livro do período, com impressão) = o Extrato.
As ações no Extrato devem continuar **discretas** (já estão), e a auditoria **não** deve crescer dentro dele.

### Malote: Obrigação → Documentação → Pronta → Enviada → Arquivada
Pode e deve simplificar. São **dois ciclos**: o da obrigação (prevista → em aberto → paga → conciliada) e o do **mês** (aberto → pronto → enviado → aprovado/travado). Hoje "Pronta/Enviada/Arquivada" são gravadas por despesa (95 itens para um envio) e "Arquivada" nunca ocorreu (0 aprovações de período). Se o estado passar a ser **do mês**, com "pendências" calculadas por obrigação (a regra única de documentação já faz isso), caem: o contador "Prontas" duplicado em três painéis, a necessidade de reabrir item a item, e a tela do Malote como relatório.

## 5. Erros meus a desfazer (honestidade)
- **Checklist do mês dentro da Auditoria**: duplica a etapa 4 do Fechamento. Foi pedido ("checklist do fechamento"), mas o lugar certo é o Fechamento.
- **Cobertura Documental × Prontidão**: dois indicadores para a mesma conta.
- **Chips por lente** (Documentação, Débito, Gravidade, Selo): cada um é correto isolado, mas somam sete vocabulários (F1). Precisam ser **projeções de um só estado da obrigação**, não selos concorrentes.

## 6. Extrato de Obrigações — padrão da Prestação de Contas
Tudo o que o pedido listava foi entregue em `152ea4a` e verificado em Chromium real (tela a 1366/820/375 px e PDF A4 retrato dos 4 modelos): agrupamento por data, linha "dd/mm/aaaa | TOTAL DO DIA", selos com glifo, resumo de 6 peças, "Em aberto" incluindo reembolsos (com "Apenas reembolsos" mantido), filtro Conta (inclui "Sem conta financeira"), impressão com 4 modelos e campos escolhidos, destaque de terceiros e Projeto. A identidade visual vem de um **kit compartilhado** (`RelatorioKit`: cabeçalho, resumo, assinaturas, rodapé) usado pelos dois relatórios.
O que **falta** para parecerem o mesmo produto: (a) reexportar `OBRIGACOES.pdf` do código atual para comparar com a Prestação (os PDFs de Downloads são anteriores); (b) a **linha de obrigação** ainda é um componente próprio (F2) — unificá-la é parte da arquitetura abaixo, não do relatório.

## 7. Arquitetura recomendada: 10 telas

**Operar (diário)**
1. **Mesa do Tesoureiro** — hoje, vencimentos (lista + calendário), débitos automáticos, fila de quitações, caixa. *Evoluir; absorve Agenda, Liquidações do período, Prazos/Pendências de Quitação.*
2. **Livro de Obrigações** (hoje "Extrato de Obrigações") — consulta e relatório com as lentes Operar/Fechar/Reportar. *Evoluir.*
3. **Contas** — saldos, extrato por conta, importação e conciliação OFX/PDF, diagnóstico (Auditoria do Extrato) e impressão multiconta. *Fundir: Contas correntes + Extrato Bancário + Relatório de Contas + Auditoria do Extrato + gavetas de extrato/conciliação.*

**Fechar o mês**
4. **Fechamento do mês** — assistente: conciliação → classificação → **Prontidão** (a Auditoria) → documentos do mês → pacote (ZIP) → envio. *Fundir: Auditoria de Documentos, Central de Documentos (anexar em lote), Documentos do Fechamento, Malote Contábil, Pacote, Fiscal (etapa).*

**Prestar contas e gerir**
5. **Prestação de Contas** — relatório canônico (fluxo de caixa, projetos e centros como filtros). *Manter; absorve Prestação do Centro e Relatório de Contas.*
6. **DRE** — *Manter.*
7. **Painel de gestão** — Visão Executiva + Indicadores Eclesiásticos/Missionários + alertas (uma vez) + orçamento×real (quando houver). *Fundir; eliminar Insights.*

**Cadastros**
8. **Cadastros** — Favorecidos, Contas e categorias, Centros de custo, Recorrências, Projetos, Contratados (uma página com abas; os detalhes `favorecido/:id`, `projeto/:id`, `centro/:id` permanecem). *Fundir páginas e gavetas.*

**Por perfil**
9. **Doações e Doadores** — *Manter.*
10. **Sustento Pastoral** — *Manter, separado (sigilo).*

Fora das dez: **Calculadoras (Folha)** vira ferramenta dentro de Cadastros; **Estoque, Orçamento (até haver decisão), Reuniões Financeiras** saem do menu (os dados e o código ficam; reativar é uma linha).

### Módulo a módulo
| Módulo | Decisão |
|---|---|
| Mesa | **Evoluir** |
| Agenda Financeira | **Fundir** (Mesa → Calendário) |
| Extrato de Obrigações | **Evoluir** (lentes, linha única) |
| Extrato Bancário | **Evoluir** (casa das contas) |
| Auditoria de Documentos | **Transformar** (etapa Prontidão) |
| Fechamento Mensal | **Evoluir** (casa do mês) |
| Ciclo da Despesa | **Evoluir** (vocabulário único) |
| Malote Contábil | **Eliminar** a página; o ZIP fica no Fechamento |
| Recorrências | **Fundir** (página/gaveta) → Cadastros |
| Obrigações / Contas a Pagar | **Fundir** (Mesa + Livro) |
| Contas a Receber | **Não criar** |
| Reembolsos / Compras por Terceiros / Quitações | **Manter a regra, reduzir superfícies** |
| Sustento | **Manter** |
| Relatórios Financeiros | **Fundir** (Prestação, DRE, Painel de gestão) |
| Prestação de Contas | **Manter** (padrão) |
| Projetos | **Fundir** página/gaveta; detalhe fica |
| Conciliação OFX | **Manter o motor; eliminar a gaveta duplicada** |
| Fluxo de Débito Automático | **Manter** |

## 8. Ordem sugerida (quando você decidir implementar)
1. **Sem risco, alto retorno:** um só estado/linha de obrigação (F1/F2) — cada tela passa a ser uma projeção; remove duas cópias do checklist e a terceira porta do ZIP.
2. **Fundir Agenda na Mesa** (menor tela, mesma fonte) e redirecionar a rota (favoritos salvos por caminho continuam funcionando).
3. **Fechamento como casa do mês** (Prontidão + Central + Pacote em etapas) e o estado do mês no lugar do estado por item.
4. **Contas** (extrato + conciliação + diagnóstico) e **Cadastros** (páginas/gavetas).
5. **Painel de gestão** e retirada dos módulos dormentes do menu.
Riscos: links e favoritos salvos por caminho (precisam de redirecionamentos), `navConfig.test.ts` (já falha por `/financas/reunioes`), e o que está em uso por outros perfis (Doações, Sustento).

## 9. Decisões que são suas
1. **Medir antes de cortar?** Posso propor um contador simples de acesso por tela (sem implementar agora) para confirmar as classificações "inferidas" em 3–4 semanas. Recomendo, para Insights, Executivo, DRE, Centros e Relatório de Contas.
2. **O estado do mês substitui o estado por despesa** (F5)? É a maior simplificação e a que mexe mais no banco/relatórios.
3. **Agenda vira Calendário dentro da Mesa** (e some como tela)?
4. **Os módulos dormentes** (Estoque, Orçamento, Reuniões, Metas, Rateio) saem do menu agora ou você pretende usá-los?
5. **Fiscal**: vira etapa do Fechamento ou fica dormente até haver documento fiscal real (0 hoje)?
6. **Os 95 registros de reabertura** = 95 itens do malote de setembro: foi o envio reaberto de propósito? (Confere antes de qualquer mudança no ciclo.)
