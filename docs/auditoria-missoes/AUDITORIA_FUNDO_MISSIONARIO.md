# Auditoria do Fundo Missionário — onde o saldo diverge e o que reclassificar

Levantamento de **06/10/2026**, banco de produção (somente leitura) + exportação do Omie + histórico da
Junta Mundial + comprovantes da Junta Nacional. **Nada foi alterado.** Este relatório responde:
*"Qual lançamento está causando a diferença?"* e *"se eu corrigir este, quanto o saldo melhora?"* —
antes de qualquer ajuste histórico.

- Linha do tempo completa (660 movimentos, com saldo acumulado): [`linha-do-tempo-fundo-missionario.csv`](linha-do-tempo-fundo-missionario.csv)
  (abre direto no Excel; gerada por `scripts/auditoria-missoes/linha-do-tempo.mjs`, reproduzível).
- **Saldo registrado de partida: −R$ 16.270,80** (648 ofertas = R$ 145.947,09 − 12 remessas = R$ 162.217,89).

---

## 1. Linha do tempo: as 12 remessas e o saldo antes e depois de cada uma

Fundo = ofertas para missões − Envio Oficial. No mesmo dia, as entradas vêm antes das saídas.

| Data | Junta | Campanha | Remessa | Saldo antes | Saldo depois | Leitura |
|---|---|---|---|---|---|---|
| 12/07/2024 | JMN | Nacionais | 10.327,58 | 25.009,41 | 14.681,83 | ⚠ Sem arrecadação de 2024 que a sustente (a descrição dizia "Mundiais") |
| 12/07/2024 | JMM | Mundiais | 1.551,32 | 14.681,83 | 13.130,51 | Confirmada pela Junta Mundial |
| **27/08/2024** | JMM | Mundiais | 25.955,20 | 13.922,51 | **−12.032,69** | 🔴 **O saldo fica negativo pela 1ª vez.** Envio > saldo acumulado |
| 19/12/2024 | JMN | Nacionais | 4.050,00 | 17.461,83 | 13.411,83 | |
| 30/12/2024 | JMN | Nacionais | 20.000,00 | 13.480,93 | −6.519,07 | 🔴 Fecha o ciclo Nacionais 2024 negativo |
| 27/02/2025 | JMN | Nacionais | 5.000,00 | −6.021,48 | −11.021,48 | ⚠ Sai com o fundo já negativo; não há oferta de Nacionais em 2025 que a sustente |
| 27/05/2025 | JMN | Nacionais | 4.493,56 | −5.860,75 | −10.354,31 | ⚠ "REPASSE CAMPANHA JMN"; mesma situação |
| **22/07/2025** | JMM | Mundiais | 34.216,42 | 13.706,26 | **−20.510,16** | 🔴 Maior envio da série; > arrecadado do ciclo (29.718,89) |
| 19/09/2025 | JMM | Mundiais | 783,58 | −20.064,24 | −20.847,82 | Complemento: 34.216,42 + 783,58 = 35.000,00 |
| 10/12/2025 | JMN | Avulsa | 1.000,00 | 6.751,23 | 5.751,23 | Panetones (Cristolândia) |
| **29/12/2025** | JMN | Nacionais | 28.180,00 | 5.942,23 | **−22.237,77** | 🔴 **Ponto mais baixo da história** |
| 07/07/2026 | JMM | Mundiais | 26.660,23 | 6.349,33 | −20.310,90 | Ainda não validada pela Junta |
| 20/09/2026 | — | — | — | — | **−16.270,80** | Hoje (Nacionais 2026 já arrecadou 4.040,10) |

Padrão: **antes de cada remessa principal o fundo está positivo, mas sempre abaixo do valor enviado** — 13.922 →
25.955 · 13.481 → 20.000 · 13.706 → 34.216 · 5.942 → 28.180 · 6.349 → 26.660. A diferença de cada uma é o que deixa o
saldo negativo.

## 2. Primeira data em que o saldo muda de comportamento

- **27/08/2024** — a primeira vez que o saldo fica negativo (−R$ 12.032,69). Até essa data o fundo nunca
  esteve negativo (máximo: R$ 25.009,41 em 07/07/2024).
- A **causa** está antes: **12/07/2024**, quando saem R$ 10.327,58 para a Junta *Nacional* sem que exista, no
  sistema, nenhuma oferta de Nacionais de 2024. Foi o primeiro envio sem arrecadação correspondente; o saldo
  continuou positivo só porque as ofertas de Mundiais (25.009,41) ainda estavam no caixa do fundo.

## 3. Pontos de virada

| Data | O que aconteceu | Saldo |
|---|---|---|
| 27/08/2024 | Fica negativo | 13.922,51 → −12.032,69 |
| 21/11/2024 | Volta a positivo (entradas de novembro) | −242,43 → 1.108,07 |
| 30/12/2024 | Fica negativo | 13.447,93 → −6.519,07 |
| 23/06/2025 | Volta a positivo (entradas de junho) | −59,74 → 4.251,66 |
| 22/07/2025 | Fica negativo | 13.706,26 → −20.510,16 |
| 05/12/2025 | Volta a positivo | −4.364,04 → 136,08 |
| 29/12/2025 | Fica negativo (**mínimo histórico**) | 5.942,23 → −22.237,77 |
| 26/06/2026 | Volta a positivo (entradas de junho) | −2.299,12 → 1.801,18 |
| 07/07/2026 | Fica negativo | 6.349,33 → −20.310,90 |

**Alterações bruscas**: todas são remessas — 22/07/2025 (−34.216,42), 29/12/2025 (−28.180,00), 07/07/2026
(−26.660,23), 27/08/2024 (−25.955,20), 30/12/2024 (−20.000,00), 12/07/2024 (−10.327,58). As entradas
sobem em **degraus em jun/2024, nov/2024, jun/2025, nov/2025 e jun/2026** — lotes de dezenas de entradas
pequenas (cartão/Pix) no mesmo dia, provavelmente as feiras (ex.: 15/06/2026, uma entrada de R$ 7.315,67).

**Envio maior que a arrecadação, por ciclo** (cada ciclo é fechado por uma remessa ≥ R$ 20.000; complementos
entram na campanha da Junta de destino):

| Ciclo (campanha) | Arrecadado | Enviado | Diferença |
|---|---|---|---|
| Pré-Omie (JMN, 12/07/2024) | 0,00 | 10.327,58 | **−10.327,58** |
| Mundiais até 27/08/2024 | 25.801,41 | 27.506,52 | −1.705,11 |
| Nacionais até 30/12/2024 (+ complementos de 27/02 e 27/05/2025) | 29.563,62 | 33.543,56 | **−3.979,94** |
| Mundiais até 22/07/2025 (+ complemento de 19/09) | 29.718,89 | 35.000,00 | **−5.281,11** |
| Nacionais até 29/12/2025 | 28.235,97 | 28.180,00 | **+55,97** |
| Avulsa (panetones, 10/12/2025) | 0,00 | 1.000,00 | −1.000,00 |
| Mundiais até 07/07/2026 | 28.587,10 | 26.660,23 | +1.926,87 |
| Nacionais 2026 (em andamento) | 4.040,10 | — | +4.040,10 |
| **Total** | 145.947,09 | 162.217,89 | **−16.270,80** |

Dois ciclos fecham quase perfeitamente (Mundiais 2024: remessa 25.955,20 × arrecadado 25.801,41; Nacionais
2025: 28.180,00 × 28.235,97). **Isso valida o lado das ofertas** — o dinheiro lançado como oferta missionária
bate com o que foi enviado quando a remessa segue o ciclo. A divergência está nas **remessas fora do ciclo**.

## 4. Qual lançamento causa a diferença

Ordenado pelo que cada um pesa no −R$ 16.270,80 (soma dos negativos R$ 22.293,74, compensados por R$ 6.022,94
de ciclos que sobraram):

| # | Lançamento(s) | Peso | Por que pesa |
|---|---|---|---|
| 1 | **12/07/2024 — JMN — R$ 10.327,58** | −10.327,58 | Remessa à Junta Nacional sem oferta de Nacionais no sistema |
| 2 | **22/07/2025 e 19/09/2025 — JMM — R$ 35.000,00** | −5.281,11 | Mundiais 2025 enviou 35.000,00; o ciclo registrou 29.718,89 |
| 3 | **27/02/2025 e 27/05/2025 — JMN — R$ 9.493,56** | −3.979,94 | Saem do excedente de Nacionais 2024 (5.513,62) e passam dele |
| 4 | 12/07 e 27/08/2024 — JMM — R$ 27.506,52 | −1.705,11 | Mundiais 2024 enviou um pouco mais que o arrecadado |
| 5 | 10/12/2025 — JMN — R$ 1.000,00 | −1.000,00 | Panetones (avulsa) sem ofertas avulsas |
| — | Compensações | +6.022,94 | Nacionais 2026 aberto (4.040,10) · Mundiais 2026 (1.926,87) · Nacionais 2025 (55,97) |

**Nenhuma dessas remessas está *classificada errada* hoje** (todas têm Junta, campanha e categoria
coerentes). Elas só podem sair do fundo se a **natureza** do pagamento for outra (ver §6).

## 5. Classificações suspeitas

Varredura: remessas, parcerias, prebendas e despesas de missões; entradas fora da categoria de missões que
citam missões/bazar/alvo; despesas de feira/preletor em outros centros; lançamentos sem classificação.

### 5.1 Ofertas fora do fundo (melhoram o saldo)

| # | Lançamento | Classificação atual | Sugerida | Motivo | Efeito no saldo | Certeza |
|---|---|---|---|---|---|---|
| C1 | `397913c3` · 10/03/2024 · R$ 70,00 | "Ofertas", centro Missões Mundiais | **Ofertas para Missões** (campanha Nacionais; edição 2023) | Texto: *"SALDO DA CAMPANHA DE MISSÕES NACIONAIS 2023"*. Já está no centro de missões, só a categoria destoa | **+70,00** | Alta |
| C2 | `4be7491f` · 09/12/2024 · R$ 250,00 | "Dizimos" | **Ofertas para Missões** | Texto: *"ALVO MISSÕES CLASSE JOVENS I"* | **+250,00** | Alta |
| C3 | `ebe1ac47` · 07/02/2025 · R$ 206,20 | "Ofertas", sem centro | **Ofertas para Missões** | Texto: *"…ALVO DE MI…"* (cortado) | **+206,20** | Média |
| C4 ⚠ **revista** | 42 lançamentos · 20–28/02/2025 (10, R$ 507,76) e 06–12/08/2025 (32, R$ 1.743,98) · **R$ 2.251,74** | "Ofertas", sem centro | **Ofertas para Missões** | Vendas do *"BAZAR MINISTÉRIO DE MISSÕES"* / *"BAZAR MISSÕES NINA"*; o destino do bazar é de missões | **+2.251,74** | Média (confirmar se "Nina" é campanha ou apoio a uma missionária) |
| C5 | `2b15ce2b` · 06/04/2026 · R$ 700,00 | "Dizimos" | **Ofertas para Missões** | Texto: *"…ALVO DAS…"* — mesma natureza das 39 ofertas "alvo das classes" já em missões | **+700,00** | Baixa/Média |
| C6 | `7cf2e6dd` · 19/05/2024 · R$ 10,00 | "Ofertas", centro Administração | **Ofertas para Missões** | *"OFERTA DESIGNADA MINISTÉRIO DE EVANGELISMO E MISSÕES"*, como outras 23 já em missões | **+10,00** | Baixa |

### 5.2 Despesa que deveria estar no Envio Oficial (piora o saldo)

| # | Lançamento | Atual | Sugerida | Motivo | Efeito | Certeza |
|---|---|---|---|---|---|---|
| C7 | `e8a7bdd6` · 11/11/2024 · R$ 200,00 | Sem categoria, sem centro (União Feminina Missionária) | **Repasses Missionários** (avulsa), Envios | No Omie estava em "Outros Repasses Missionários"; a categoria se perdeu na importação | **−200,00** | Média |

### 5.3 Fora do fundo, mas mal classificadas (não mudam o saldo; corrigem Sustento/Mobilização)

| # | Lançamento | Atual | Sugerida | Motivo | Valor |
|---|---|---|---|---|---|
| S1 | **21 prebendas do pastor missionário**, jun/2024 a abr/2026 (apêndice) | **Sem categoria e sem centro** | Prebenda · **Sustento Missionário** | Só jan–mai/2024 e 6 meses de 2026 estavam classificados; os outros 21 pagamentos mensais, não | **45.778,68** |
| S2 | 2 previstos (nov e dez/2026) do pastor missionário, importados do Omie | Sem categoria/centro | Prebenda · Sustento | Já nascem sem classificação; vale criar a recorrência do pastor classificada | 4.724,00 |
| M1 | `eb678363` · 14/06/2026 · R$ 300 *"Segurança da feira"* | Centro-pai, Segurança e Monitoramento | **Mobilização Missionária** | Feira das Nações | 300,00 |
| M2 | `580a32f9` · 14/06/2026 · R$ 127 *"suporte feira das nações"* | Administração · Serviços | **Mobilização Missionária** | Feira das Nações | 127,00 |
| M3 | `af03745d` · 15/05/2024 · R$ 314 *"Banner Feira Missionária"* | Administração · Patrimônio (Móveis e Equipamentos) | **Mobilização Missionária** | Evento missionário (se for patrimônio durável, manter) | 314,00 |
| M4 | `864433f8` e `b74af91b` · 05–06/11/2024 · R$ 214,00 + R$ 29,40 *"Feira das Nações 2024"* | Sem categoria, sem centro | **Mobilização Missionária** | Material da feira | 243,40 |
| M5 | `1bf5cd83` · 26/05/2024 · R$ 150 *"Oferta Preletor Missionário"* | Sustento (Doações e Contribuições) | **Mobilização Missionária** (Ofertas à Preletores) | É oferta a preletor, não sustento | 150,00 |

Conferir: em 14/06/2026 há **dois lançamentos de R$ 300** e **dois de R$ 127** para a mesma feira — um é a perna da
*Transferência do Caixa de Envelopes*. Provavelmente não é duplicidade, mas a observação *"VERIFICAR ESTA
PENDÊNCIA COM O ADM"* continua nos lançamentos.

### 5.4 Descrições que contradizem a Junta (só o texto; a campanha já está certa)

| Lançamento | Descrição gravada | Junta de destino |
|---|---|---|
| `0cbe1da1` · 12/07/2024 · 10.327,58 | "Campanha Missões **Mundiais**" | **Nacional** |
| `9f172950` · 27/02/2025 · 5.000,00 | "Campanha de Missões **Mundiais**" | **Nacional** |
| `e96d4253` · 27/05/2025 · 4.493,56 | "Campanha de Missões **Mundiais**" | **Nacional** |
| `623c289f` · 19/09/2025 · 783,58 | "Campanha de Missões **Nacionais**" | **Mundial** |
| `5ecb5c32` · 10/12/2025 · 1.000,00 | "Campanha Missões **Nacionais**" | Nacional, mas é **avulsa** |

### 5.5 O que a varredura **não** encontrou
- **Sustento lançado como Campanha:** nenhum — as 12 remessas são todas transferências às Juntas.
- **Mobilização lançada como Envio:** nenhum (o único era a NF de revistas de R$ 337, já corrigida).
- **Remessa duplicada:** nenhuma (conferido contra a Junta Mundial e contra todos os valores do banco).
- As parcerias de R$ 300 (29) têm a descrição *"Carreta Missionária"*: são patrocínio mensal de um **projeto da JMN**.
  Mantive-as em Sustento, como você definiu ("Parcerias JMN").

## 6. Impacto de cada reclassificação no Saldo Registrado

Aplicadas na ordem da certeza (cada linha parte do saldo da anterior):

| Passo | Correção | Antes | Depois | Diferença |
|---|---|---|---|---|
| — | Ponto de partida | | −16.270,80 | |
| C1 | R$ 70 → Ofertas para Missões | −16.270,80 | −16.200,80 | **+70,00** |
| C2 | R$ 250 (alvo missões) → Ofertas para Missões | −16.200,80 | −15.950,80 | **+250,00** |
| C3 | R$ 206,20 → Ofertas para Missões | −15.950,80 | −15.744,60 | **+206,20** |
| C4 | Bazar de missões (42 lançamentos) | −15.744,60 | −13.492,86 | **+2.251,74** |
| C5 | R$ 700 (alvo) → Ofertas para Missões | −13.492,86 | −12.792,86 | **+700,00** |
| C6 | R$ 10 (designada) → Ofertas para Missões | −12.792,86 | −12.782,86 | **+10,00** |
| C7 | R$ 200 União Feminina → Repasses | −12.782,86 | −12.982,86 | **−200,00** |
| | **Impacto acumulado (C1–C7)** | −16.270,80 | **−12.982,86** | **+3.287,94** |

Com o ajuste histórico já registrado (R$ 12.032,69): saldo ajustado hoje **−4.238,11** → depois das correções
**−950,17**. As correções 5.3 (prebenda, feira, preletor) **não mexem no saldo do fundo**: aumentam o **Sustento**
em R$ 45.778,68 (pastor missionário passa de R$ 24.814,25 para **R$ 70.592,93**) e a **Mobilização** em
R$ 1.134,40, e levam o Esforço Total de R$ 195.882,14 para **R$ 242.845,22**.

### Reclassificações que dependem de confirmação (ainda não são correção)

| Se for confirmado que… | Passa para | Efeito no saldo | Quem confirma |
|---|---|---|---|
| os R$ 5.000,00 e R$ 4.493,56 (JMN, 2025) foram para a **Carreta Missionária/projeto**, não campanha | Projeto/Sustento | +9.493,56 | Junta Nacional |
| os R$ 1.000,00 dos panetones foram **compra de consumo**, não repasse | Material de Consumo | +1.000,00 | Você |
| os R$ 10.327,58 (JMN, 12/07/2024) foram **projeto** ou outra natureza | Projeto | +10.327,58 | Junta Nacional |

## 7. O que sobra depois das correções

Depois de C1–C7 o fundo continua em **−R$ 12.982,86**. O que ainda pesa, sem reclassificação possível hoje:

1. **R$ 10.257,58** (12/07/2024, JMN, menos os R$ 70 da campanha de 2023) — único lançamento cuja natureza só a
   Junta Nacional confirma. É o candidato a ajuste histórico mais forte.
2. **R$ 4.567,15** de Mundiais 2025 (35.000,00 enviados × 30.432,85 arrecadados, já com C3 e C4).
3. **R$ 3.729,94** de Nacionais 2024 (33.543,56 × 29.813,62, com C2): os envios de fev/mai/2025.
4. **R$ 1.695,11** de Mundiais 2024 (27.506,52 × 25.811,41, com C6), **R$ 1.000,00** dos panetones e **R$ 200,00** da União Feminina.
5. Compensações a favor: +4.040,10 (Nacionais 2026) · +2.626,87 (Mundiais 2026) · +1.799,95 (Nacionais 2025, com o bazar).

Conferência: 10.257,58 + 4.567,15 + 3.729,94 + 1.695,11 + 1.000,00 + 200,00 − 8.466,92 = **12.982,86**.

**Recomendação:** esgotadas as reclassificações, **peça à Junta Nacional o histórico equivalente** ao da Junta
Mundial. Ele resolve os itens 1 e 3 (R$ 14.000 do problema) com prova, e só depois se discute ajuste.

---

## Apêndice A — as 21 prebendas sem classificação (S1)

Todas: fornecedor "pastor missionário", status conciliado, **sem categoria e sem centro**.

| Mês | Lançamentos (id · valor) |
|---|---|
| 2024 | 06 `86e0c427` 2.101,85 · 07 `d81e1a54` 2.101,85 · 08 `ea6f2ed9` 2.101,85 · 09 `1e512a78` 2.101,85 · 10 `8bb39d3a` 2.101,85 · 11 `23c2a55c` 2.101,85 · 12 `223eee8d` 2.101,85 |
| 2025 | 01 `f2d31215` 2.101,85 · 02 `b63c691d` 2.101,85 · 03 `6c5598da` 2.101,85 · 04 `6eee58e6` 2.101,85 · 05 `2f5134f5` 2.606,33 · 06 `d5834dd1` 2.228,00 · 07 `bdfa3de4` 2.228,00 · 08 `03172759` 2.228,00 · 09 `b2113238` 2.228,00 · 10 `36ceb7d8` 2.228,00 · 11 `c48fa9b3` 2.228,00 · 12 `178361ec` 2.228,00 |
| 2026 | 03 `16481ba8` 2.228,00 · 04 `73b1c8f7` 2.228,00 |

Total: **R$ 45.778,68** (2024: 14.712,95 · 2025: 26.609,73 · 2026: 4.456,00).

## Apêndice B — como a linha do tempo foi montada
- Entradas: as 648 ofertas da categoria "Ofertas para Missões" (realizado/conciliado), por data de pagamento.
- Saídas: as 12 remessas da categoria "Repasses Missionários" depois das reclassificações de 06/10.
- Ciclo: as remessas ≥ R$ 20.000 fecham o ciclo; a campanha das ofertas na planilha é **sugerida** (coluna
  "sugerida pelo ciclo"), nada foi gravado.
- Verificações: 648 ofertas = R$ 145.947,09; saldo final = −R$ 16.270,80; soma dos ciclos = o mesmo saldo.

---

## Aprovado por ela em 06/10/2026 — migration `20261006210000_missoes_correcoes_da_auditoria.sql`

Aprovados: **C1**, **C2**, as **21 prebendas (S1)** e as **despesas de feira/preletor (M1–M5)**.
Ficam **pendentes de decisão**: C3 (R$ 206,20), C4 (bazar, R$ 2.251,74), C5 (R$ 700), C6 (R$ 10) e C7 (R$ 200 União Feminina).

Resultado esperado depois de aplicar (para conferir na tela):

| Indicador | Antes | Depois |
|---|---|---|
| Saldo registrado do Fundo | −16.270,80 | **−15.950,80** (+320,00) |
| Saldo ajustado (com os 12.032,69) | −4.238,11 | **−3.918,11** |
| Histórico arrecadado | 145.947,09 | **146.267,09** |
| Ofertas sem classificação | 648 · 145.947,09 | **649 · 146.197,09** (a de R$ 250 entra na fila do lote) |
| Sustento (pastor + parcerias) | 33.664,25 | **79.292,93** |
| Mobilização | 0,00 | **1.134,40** |
| Esforço Total | 195.882,14 | **242.645,22** |

> **Atualização (06/10/2026, noite):** a evidência sobre o bazar (ver [INVESTIGACAO_JANELA_BAZAR_E_SIMULACOES.md](INVESTIGACAO_JANELA_BAZAR_E_SIMULACOES.md)) mostra que a igreja trata o bazar como **receita do ministério dono** em todos os outros casos. **C4 deixou de ser recomendada**: fica em suspenso até a decisão sobre a natureza do bazar de missões.
