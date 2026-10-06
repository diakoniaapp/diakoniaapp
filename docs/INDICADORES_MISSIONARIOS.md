# Indicadores Missionários — análise crítica e proposta de evolução

Levantamento de **06/10/2026**, com medição direta no banco de produção (somente
leitura) e conferência na tela. Números sem marca de "incerto" foram contados.

## 1. O que estava errado

| # | Problema | Evidência |
|---|---|---|
| 1 | Abria em **"Hoje"**: tela vazia quase todo dia (a oferta missionária entra no domingo) | `eclPreset` iniciava em `"hoje"` |
| 2 | **Dois "Arrecadado" lado a lado** com escopos diferentes e sem rótulo: o de cima seguia o filtro, o de baixo era a vida inteira | Exemplo dela: 32.627,20 (01/01–05/10) × 145.947,09 (histórico) |
| 3 | O "Enviado" **não é tudo o que foi para missões** (ver §2) | Só a categoria "Repasses Missionários" era somada |
| 4 | Cada clique no filtro **refazia 3 consultas** da vida inteira | `carregarMissoesRemessa` dependia do período |
| 5 | Painel inteiro sumia em silêncio se a categoria de repasse fosse renomeada/desativada | Busca por igualdade exata de nome |
| 6 | Sem gráfico, sem resultado líquido, sem frase que responda "superávit ou déficit?" | — |

## 2. O que a medição mostrou (produção, 06/10/2026)

**O fundo missionário está negativo**: arrecadado R$ 145.947,09 − enviado
R$ 162.554,89 = **−R$ 16.607,80**. O exemplo de saldo positivo do pedido (48.321)
não corresponde à realidade — a igreja já enviou mais do que arrecadou nas ofertas
para missões, e a diferença saiu do caixa geral. A tela agora diz isso em palavras.

**E o "Enviado" está incompleto.** O dinheiro que sai para missões está espalhado
por três categorias, e o painel somava só uma:

| Centro de custo (saída) | Categoria usada | Lançamentos | Total | Entra no "Enviado" de hoje? |
|---|---|---|---|---|
| Missões Mundiais | Repasses Missionários | 8 | 108.541,31 | sim |
| Missões Nacionais | Repasses Missionários | 5 | 54.013,58 | sim |
| **Ofertas Missionárias** | **Doações e Contribuições** | 30 | **8.850,00** (29 × R$ 300 à Junta Nacional + 1 × R$ 150) | **não** |
| **Pastor Missionário** | **Prebenda** | 11 | **24.814,25** | **não** |
| Min. Evangelismo e Missões | Segurança e Monitoramento | 1 | 300,00 | não (provável erro de categoria) |

Somando o que saiu pelos quatro subcentros de missões: **R$ 196.219,14**, não 162.554,89
(a diferença é 8.850,00 + 24.814,25 = 33.664,25). Se o universo for esse, o fundo
acumulado vai a **−R$ 50.272,05**.

Outras medições:

- **Entradas** ("Ofertas para Missões"): 648 lançamentos, todos conciliados. **418
  (R$ 106.705,49) não têm centro de custo** — o de 2025 inteiro. Só 224 estão em
  "Missões Mundiais" e 5 em "Ofertas Missionárias". **Não existe nenhuma entrada em
  "Missões Nacionais"**: a oferta nunca é separada em Mundiais × Nacionais na entrada,
  só na hora do repasse.
- **Projetos** (`fin_projetos`, com `meta_valor`): existe só "120 Anos QIBRJ", sem
  meta. Nenhuma campanha missionária está cadastrada, e nenhum lançamento missionário
  tem `projeto_id`.
- **Recorrências**: nenhuma cadastrada para missões. Os R$ 300/mês são lançados à mão.
- **Prebenda do Pastor Missionário** tem lacunas: há lançamentos em jan–mai/2024 e
  jan–fev + mai–ago/2026; **2025 inteiro e mar–abr/2026 não aparecem no centro**.
  Pode estar lançada sem centro — vale conferir antes de qualquer total "permanente".
- A categoria oficial do plano (`Outros Repasses Missionários`, migration
  20260912190000) **não existe** em produção; a categoria ativa é "Repasses
  Missionários". A tela agora aceita as duas grafias.

## 3. Entregue (etapa 1 — já no ar, sem migration)

Tudo em `components/financas/IndicadoresMissionarios.tsx`, com as contas em
`lib/indicadoresMissionarios.ts` (18 testes).

- **Período padrão: "Mês atual"** (filtros: Hoje, 7, 30, 60, 90 dias, Mês, Ano,
  Personalizado). O filtro é próprio da seção — o resto do Financeiro continua
  abrindo em "Hoje", como ela decidiu em 23/09/2026.
- **(A) Resultado do período**: Entradas missionárias · Saídas missionárias ·
  Resultado líquido (Superávit/Déficit/Equilibrado), com a frase de leitura e a
  variação contra o período anterior. Conferido ao vivo: 01/01–06/10/2026 →
  **32.627,20 / 26.660,23 / 5.966,97**, exatamente o exemplo dela.
- **(B) Fundo Missionário Acumulado**: Saldo atual · Total histórico arrecadado ·
  Total histórico enviado. **Não muda com o filtro**; diz isso no subtítulo.
- **(C) Gráfico** de entradas × saídas × resultado acumulado, que segue o filtro
  (por dia até 35 dias, por semana até 120, por mês acima disso).
- Remessas do período clicáveis; "+ Registrar remessa" mantido.
- Carregamento único da vida inteira (o clique no filtro não consulta o banco).
- Categoria de repasse aceita "Repasses Missionários" e "Outros Repasses Missionários".

Nada do que (A) e (C) mostram usa dado do histórico, e (B) nunca usa o filtro.

## 4. Proposta (etapa 2 — depende de decisões dela)

### 4.1 Classificação: já existe, está nos centros de custo

Ela pediu três classes — Sustento Permanente, Campanha, Projeto. A medição mostra que
**o sistema já distingue isso, só que no centro de custo, não no painel**:

| Classe | Como reconhecer hoje | 2024–06/10/2026 |
|---|---|---|
| **Sustento permanente** | centro "Pastor Missionário" + centro "Ofertas Missionárias" (parcerias de R$ 300) | 24.814,25 + 8.850,00 |
| **Campanha** | centros "Missões Mundiais" e "Missões Nacionais" | 108.541,31 + 54.013,58 |
| **Projeto missionário** | `projeto_id` apontando para um projeto missionário (ainda não há nenhum) | 0 |

Recomendação, **sem coluna nova**: o painel passa a classificar pelo centro de custo
(e pelo projeto, quando existir). É reversível, não exige migration e já responde às
perguntas dela. Uma coluna explícita só se justifica se um mesmo centro precisar
conter duas classes — hoje não precisa.

### 4.2 Painéis novos

- **Campanhas** (Meta · Arrecadado · %): usar `fin_projetos` (já tem `meta_valor`,
  `data_inicio`, `data_fim`). Cadastrar "Missões Mundiais 2026" (meta 30.000) e
  "Missões Nacionais 2026" (meta 20.000) como projetos; o *arrecadado* da campanha
  é o que entrou com aquele `projeto_id`. **Pré-requisito**: hoje a entrada não é
  separada por campanha (nenhuma entrada em "Missões Nacionais"), então a oferta
  precisa ser marcada com o projeto na hora do lançamento — ou a regra "1º semestre
  = Mundiais, 2º = Nacionais" vira *sugestão* automática na tela de oferta.
- **Sustento missionário**: nº de sustentados = fornecedores/pessoas distintos nas
  saídas de sustento permanente; **compromisso mensal** = soma das recorrências ativas
  dessa classe (hoje não há nenhuma — o R$ 300 e a prebenda deveriam virar
  recorrências, o que também alimenta a Mesa do Tesoureiro); enviado no período.
- **Respostas imediatas**: quanto foi para campanhas, para sustento permanente e para
  projetos no período — três linhas, uma por classe.

### 4.3 Decisões que preciso dela

1. **O que é "Saída missionária"?** (a) só a categoria "Repasses Missionários"
   (162.554,89 — como era); (b) tudo que sai pelos centros de missões (196.219,14),
   incluindo prebenda do pastor missionário e as parcerias de R$ 300. O pedido
   lista o pastor missionário e o sustento recorrente como missões permanentes, o que
   aponta para **(b)** — mas muda o fundo de −16,6 mil para −50,3 mil, então só
   aplico com o "sim" dela.
2. A prebenda do pastor missionário **entra no fundo missionário** ou é custo da
   igreja? (é a pergunta de fundo por trás da 1.)
3. As **418 ofertas sem centro** (R$ 106,7 mil) podem ser marcadas em lote como
   "Missões Mundiais"? Sem isso, o painel por campanha nasce quase vazio.
4. Cadastro das campanhas 2026 com as metas (30.000 / 20.000).

## 5. O que não foi feito (de propósito)

- Nenhuma gravação em produção. Todas as medições foram `SELECT`.
- O universo do "Enviado" não foi alterado (decisão 1 acima).
- "Ofertas para Missões" ainda busca a categoria por **nome exato** (existe e é única).
