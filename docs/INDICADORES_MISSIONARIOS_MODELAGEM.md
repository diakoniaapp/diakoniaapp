# Indicadores Missionários — modelagem proposta (para revisão)

**Estado: nada foi implementado nem gravado.** Este documento + o SQL em
[INDICADORES_MISSIONARIOS_MIGRACAO_PROPOSTA.sql](INDICADORES_MISSIONARIOS_MIGRACAO_PROPOSTA.sql)
são a proposta que ela pediu para revisar antes de qualquer alteração estrutural.
Medições de 06/10/2026, produção, somente leitura. Evolui o
[INDICADORES_MISSIONARIOS.md](INDICADORES_MISSIONARIOS.md) (etapa 1, já no ar).

## 1. Os cinco conceitos, em uma regra cada

| Conceito | O que é | De onde vem o número |
|---|---|---|
| **Fundo Missionário** | Dinheiro das ofertas para missões, que a igreja arrecada e repassa | Entradas da categoria *Ofertas para Missões* − Envio Oficial (+ ajustes) |
| **Campanha** | Para qual campanha a oferta/remessa foi: Mundiais, Nacionais, Especial | Campo novo `campanha_missionaria` (o ano vem da data) |
| **Envio Missionário Oficial** | O que foi repassado às Juntas | Saídas da categoria *Repasses Missionários* |
| **Sustento Missionário** | Investimento **próprio da igreja**, fora do fundo: pastor missionário, parcerias, sustentados, convênios | Saídas do subcentro *Sustento Missionário* |
| **Esforço Missionário Total** | Tudo o que a igreja põe em missões | Envio Oficial + Sustento |

Hoje o painel mistura os dois primeiros e ignora o quarto. A modelagem separa por
**dois eixos independentes**: o **subcentro** diz *que tipo de gasto é* (sustento,
envio, mobilização) e o **campo campanha** diz *para qual campanha*. Campanha não é
centro nem projeto.

## 2. Estrutura de centros (o que existe × o proposto)

Centro único **"Min. Evangelismo e Missões"** (nome oficial mantido). Subcentros:

| Hoje | Lançamentos | Proposto |
|---|---|---|
| Pastor Missionário | 11 saídas · 24.814,25 | → **Sustento Missionário** |
| Ofertas Missionárias (saídas: parcerias R$ 300) | 30 saídas · 8.850,00 | → **Sustento Missionário** |
| Missões Mundiais (saídas) | 8 · 108.541,31 | → **Envios Missionários** (+ campanha) |
| Missões Nacionais (saídas) | 5 · 54.013,58 | → **Envios Missionários** (+ campanha) |
| Missões Mundiais (entradas) | 224 + 1 | não move (entrada não é custo) |
| Ofertas Missionárias (entradas) | 5 · 547,00 | não move |
| — | 0 | **Mobilização Missionária** (novo) |

Os centros antigos **são desativados, nunca apagados**, e só os que ficarem sem
lançamento (Pastor Missionário e Missões Nacionais). *Missões Mundiais* e *Ofertas
Missionárias* continuam ativos porque ainda guardam entradas.

## 3. Os painéis (cada um com sua fonte e seu filtro)

1. **Fluxo missionário do período** — *segue o filtro.* Entradas missionárias (Ofertas
   para Missões) · Saídas missionárias (Envio Oficial) · Resultado líquido. Já existe.
2. **Fundo Missionário** — *nunca segue o filtro.* Saldo registrado · Saldo ajustado ·
   Histórico arrecadado · Histórico enviado · alerta de histórico incompleto (§5).
3. **Missões permanentes** — *segue o filtro.* Missionários sustentados · Pastor
   Missionário · Parcerias · **Compromisso mensal** · Total investido no período.
   Fonte: subcentro Sustento Missionário. O compromisso mensal vem das recorrências ativas
   desse subcentro; **hoje não há nenhuma** (o R$ 300 e a prebenda são lançados à mão),
   então o painel mostra "não cadastrado" e sugere criá-las — o que também alimenta a
   Mesa do Tesoureiro. Não vou inventar um compromisso por média.
4. **Campanhas** — Mundiais · Nacionais · Especial: Meta · Arrecadado · %. Usa o **ano da
   data final do filtro** (campanha é anual por natureza; um filtro de 7 dias não a
   mede). Meta em tabela mínima `fin_metas_campanha(campanha, ano, valor)` — um número por
   campanha/ano, opcional.
5. **Projetos missionários** — projetos (`fin_projetos`) marcados `missionario = true`:
   ativos, meta, execução. Projetos ficam só para o que é de fato temporário (ex.:
   templo missionário). **Hoje não há nenhum** (o único projeto, "120 Anos", não é
   missionário): o painel nasce com o estado vazio, sem inventar.
6. **Envios** — dois indicadores lado a lado: **Envio Oficial** (162.554,89) e **Esforço
   Total** (196.219,14 = 162.554,89 + 8.850,00 + 24.814,25). *Mobilização* aparece como
   linha separada e **não** entra no Esforço Total, como você definiu (pergunta 3 abaixo).
7. **Ofertas missionárias sem classificação** — ver §6.

## 4. Fórmulas (exatamente como pediu)

- Saldo registrado = Σ entradas(Ofertas para Missões) − Σ saídas(Repasses Missionários), só
  `realizado`/`conciliado`. **Hoje −16.607,80.**
- Saldo ajustado = saldo registrado + Σ ajustes ativos.
- Ajuste: tabela própria `fin_ajustes_fundo_missionario` (data, descrição, valor,
  justificativa, ativo). **Não toca** em `fin_lancamentos`, extratos, contabilidade nem
  prestação de contas; nunca se apaga, só se desativa.

## 5. Atenção: o dado só sustenta parte do ajuste

> **Atualizado após o documento da Junta Mundial** ([validação](INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md)):
> o valor sustentado é **R$ 12.032,69** (o gap do primeiro ciclo), com saldo ajustado de
> **−R$ 4.575,11**. Os R$ 11.878,90 abaixo ficaram superados — a remessa de 1.551,32 é
> Mundiais confirmada pela Junta. A campanha das remessas vem do **fornecedor**, e as
> remessas ≥ R$ 20.000 fecham o ciclo. A opção "Especial" deve ser renomeada "Campanha
> avulsa" (a Junta chama a oferta de Mundiais de "Dia Especial").

Você deu o exemplo de ajuste de R$ 16.607,80 (saldo ajustado = 0). Testei a hipótese da
transição de 2024 contra os dados:

- A remessa de **27/08/2024** (25.955,20) é praticamente igual a tudo o que foi
  arrecadado de 02/01 a 27/08/2024 (25.801,41): a campanha *Mundiais 2024* **fecha** com
  diferença de −153,79.
- As **duas remessas de 12/07/2024** — 10.327,58 (Junta Nacional) + 1.551,32 (Junta
  Mundial) = **11.878,90** — não têm arrecadação correspondente no sistema, e
  coincidem com o que você descreveu (campanha anterior ao Omie). É o **ajuste
  sustentado pelos dados**: R$ 11.878,90.
- Com ele, o **saldo ajustado fica em −R$ 4.728,90, não em zero.** Os 4.728,90 restantes
  vêm de 2025: o ciclo Mundiais 2025 enviou 14.328,09 acima do arrecadado (44.046,98
  contra 29.718,89, incluindo 9.830,56 pagos à Junta Nacional até 08/07/2025), em parte
  compensado pelo excedente de Nacionais 2024 (+5.513,62). Isso **não se explica pela transição
  de 2024** — pode ser arrecadação não lançada como "Ofertas para Missões", ou envio
  complementado pelo caixa geral.

Proposta: registrar o ajuste de **11.878,90** com a justificativa acima. Se você souber que
os 4.728,90 também são histórico faltante, registra-se um segundo ajuste, com texto
próprio — o sistema mostra cada um. **Não vou ajustar para zero só para fechar a conta.**

**Alerta histórico** (texto dela, mantido): *"⚠ Histórico parcialmente incompleto. Parte
dos envios realizados em 2024 refere-se a campanhas arrecadadas antes da implantação do
Omie. O saldo registrado pode não refletir integralmente o histórico missionário da
igreja."* Aparece no painel do Fundo enquanto houver ajuste ativo do tipo histórico.

## 6. Ofertas sem classificação (nada é classificado sozinho)

As 648 ofertas missionárias (R$ 145.947,09) hoje têm campanha vazia. Situação do centro:

| Situação | Qtde | Valor |
|---|---|---|
| Sem centro de custo (2024: 182 · 2025: 235 · 2026: 1) | **418** | **106.705,49** |
| Já em "Missões Mundiais" | 224 | 38.534,10 |
| Em "Ofertas Missionárias" | 5 | 547,00 |
| Em "Min. Administração" | 1 | 160,50 |

O painel mostra esses números e o botão **[Classificar em lote]**. O diálogo agrupa as
ofertas por ciclo (oferta → campanha da próxima remessa), mostra o total de cada grupo e
**só grava depois do "confirmar" dela**, grupo a grupo. A regra do ciclo é só a sugestão.
Com as remessas já classificadas (§7, Parte 3), a sugestão dá exatamente a sua tabela:
**Mundiais 2026 = 28.587,10 (95,3% de 30.000)** e **Nacionais 2026 = 4.040,10 (20,2% de
20.000)**.

## 7. SQL e ordem de aplicação

Três partes, no arquivo [.sql](INDICADORES_MISSIONARIOS_MIGRACAO_PROPOSTA.sql):

1. **Aditiva** — coluna `campanha_missionaria`, tabelas de metas e de ajustes, marca
   `fin_projetos.missionario`, 3 subcentros novos. Não move nada. Reversível.
2. **Remapeamento** — move **54 saídas** para Sustento/Envios, ajusta o centro padrão
   de 4 categorias e 2 fornecedores, desativa 2 centros antigos. Tem `RAISE EXCEPTION`
   se o banco não tiver as contagens revisadas aqui (54, e 0 sobras).
3. **Campanha das 13 remessas + ajuste de 11.878,90** — cada linha é decisão dela.

A tela funciona **antes** da migration (sonda de coluna, como nas recorrências): sem a
Parte 1 mostra o que mostra hoje, sem erro.

## 8. Impacto nos relatórios e no código atuais

Medido: **orçamento: 0 linhas** nesses centros · **recorrências: 0** · **rateio: 0**. Ou
seja, o remapeamento não quebra orçamento, recorrência nem rateio.

| Onde | Efeito |
|---|---|
| Centro-pai "Min. Evangelismo e Missões" | **Total não muda** — os lançamentos mudam de subcentro filho, não saem do pai |
| Detalhe por centro / DRE por centro / indicador por centro | As linhas dos 4 subcentros antigos somem; aparecem 2 novas (Sustento, Envios). Totais por **categoria** não mudam |
| Pacote Contábil / ZIP fiscal / extrato | **Sem efeito** (agrupam por conta e categoria; o centro é só um rótulo) |
| Relatórios trimestrais impressos que casam com a aba "Plano de Contas" | **Decisão dela:** as linhas dos subcentros mudam de nome. Conferir se o modelo impresso aceita as três linhas novas |
| Categorias com centro padrão apontando para os antigos | 4 categorias e 2 fornecedores — corrigidos na Parte 2 |
| Código (`src/`) | **Nenhuma referência por nome** a esses centros (conferido). Muda só o painel (`IndicadoresMissionarios.tsx`) e o formulário de lançamento (campo campanha, sugestão da campanha aberta) |
| Lançamento de R$ 300 em "Segurança e Monitoramento" (centro-pai) | Não é movido: provável categoria errada, para ela confirmar |

## 9. As 10 perguntas — onde cada uma é respondida

| # | Pergunta | Painel | Valor hoje |
|---|---|---|---|
| 1 | Quanto entrou no período? | Fluxo | (filtro) — Ano 2026: 32.627,20 |
| 2 | Quanto saiu no período? | Fluxo | Ano 2026: 26.660,23 |
| 3 | Resultado do período? | Fluxo | Ano 2026: +5.966,97 |
| 4 | Saldo registrado do fundo? | Fundo | −16.607,80 |
| 5 | Saldo ajustado? | Fundo | −4.575,11 (com o ajuste de 12.032,69) |
| 6 | Quanto investe em sustento? | Permanentes | 33.664,25 desde 2024 |
| 7 | Quanto foi enviado? | Envios | Oficial 162.554,89 · Total 196.219,14 |
| 8 | Arrecadado em Mundiais? | Campanhas | 2026: 28.587,10 |
| 9 | Arrecadado em Nacionais? | Campanhas | 2026: 4.040,10 |
| 10 | % de cada campanha? | Campanhas | 95,3% e 20,2% (metas 30.000 / 20.000) |

Os valores de 8–10 dependem de a classificação em lote ser confirmada; hoje o campo está
vazio.

## 10. Decisões que preciso dela antes de implementar

1. Aprova o **mapa de subcentros** (§2) e o **ajuste dos relatórios trimestrais**
   (§8, linha do Plano de Contas)?
2. **Mobilização Missionária** entra no Esforço Total? (Você listou só 4 itens, sem ela;
   proponho linha separada. Hoje tem zero lançamentos.)
3. **Ajuste histórico:** registro **12.032,69** (o que a evidência sustenta, ver a
   validação com a Junta Mundial) em vez de 16.607,80? Os 4.575,11 restantes ficam como
   "não explicado" até você ter o histórico da Junta Nacional.
4. As **remessas pela Junta de destino**: 4 remessas (5.000,00 · 4.493,56 · 337,00 ·
   783,58) tinham o centro divergente da Junta. Classifico a campanha pelo destino
   (Nacional → nacionais, Mundial → mundiais)? E a de 1.000,00 de 10/12/2025
   ("panetone") é campanha **Especial**?
5. As **parcerias de R$ 300** ficam em Sustento (custo da igreja, fora do fundo) — como
   a prebenda?
6. O lançamento de R$ 300 em "Segurança e Monitoramento" no centro de missões: está na
   categoria errada?
