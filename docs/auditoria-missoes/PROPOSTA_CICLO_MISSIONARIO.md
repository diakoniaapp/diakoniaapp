# Proposta de modelagem — "Ciclo Missionário" (opcional)

**Somente proposta. Nada foi implementado.** Pedido (07/10/2026): remessas pagas no exercício seguinte não podem
distorcer a campanha. Sem campo "Ano da Campanha"; quero analisar um campo opcional **Ciclo Missionário**.

```
Campanha: Missões Nacionais    Ciclo: 2024    Pagamento: 2025
Campanha: Missões Mundiais     Ciclo: 2025    Pagamento: 2026
```

## 1. O problema, com números reais

Hoje o painel mede a campanha pelo **ano da data** do lançamento. Os dois pagamentos de 2025 da campanha de Nacionais
**2024** (R$ 5.000,00 em 27/02 e R$ 4.493,56 em 27/05) aparecem em "Nacionais 2025". Arrecadado: Nacionais 2024 =
29.813,62 e Nacionais 2025 = 28.216,15 (já com as correções aprovadas).

| Painel "Campanhas" | Enviado em 2024 / 2025 | Diferença |
|---|---|---|
| **Hoje — ano da data** · Nacionais 2024 | 10.327,58 (jul) + 20.000,00 (dez) = **30.327,58** | −513,96 *(parece bom, mas só porque o item provisório de jul/2024 compensa o que falta)* |
| **Hoje — ano da data** · Nacionais 2025 | 5.000,00 + 4.493,56 + 28.180,00 = **37.673,56** | **−9.457,41** *(distorção)* |
| **Com ciclo** (2 parcelas → 2024; os R$ 10.327,58 ainda nulos) · Nacionais 2024 | 30.327,58 + 9.493,56 = **39.821,14** | **−10.007,52** *(o item provisório aparece como realmente é)* |
| **Com ciclo** · Nacionais 2025 | **28.180,00** | **+36,15** |
| Com ciclo e os R$ 10.327,58 fora (pré-Omie, depois que a JMN responder) · Nacionais 2024 | **29.493,56** | **+320,06** |

Sem o campo, o painel mostra a campanha 2025 "estourada" em R$ 9,5 mil e **esconde** o item provisório de 2024 dentro de um
saldo aparentemente saudável. Com o campo, 2025 fecha em +R$ 36,15 e o problema real — os R$ 10.327,58 — fica visível
em 2024 até a JMN responder. É a leitura que a auditoria precisou fazer à mão.

## 2. Opções

| | Opção | Prós | Contras |
|---|---|---|---|
| **A** | **Coluna opcional `ciclo_missionario` no lançamento** (inteiro; nulo = ano da data) | Uma coluna, nenhum cadastro novo, sem manutenção anual; só quem foge do padrão preenche | Precisa de uma sugestão automática para não depender de memória |
| B | Sem campo: **derivar** o ciclo pela regra "remessa ≥ R$ 20.000 fecha o ciclo" | Zero digitação | Frágil: falha com remessa pequena isolada, campanha sem remessa grande ou mudança de padrão; não dá para corrigir à mão |
| C | Tabela `fin_ciclos_missionarios (campanha, ciclo, abre_em, fecha_em)` com janelas por data | Preciso e auditável | **Uma linha por campanha por ano, para sempre** — a manutenção anual que você já recusou nos projetos |

**Recomendação: A**, com a sugestão da B como *ajuda de preenchimento* (nunca como verdade).

## 3. Como seria (opção A)

### Dado
- `fin_lancamentos.ciclo_missionario smallint NULL CHECK (ciclo_missionario BETWEEN 2000 AND 2100)`.
- **Significado:** o ano em que a campanha foi *arrecadada* (a "edição"). Nacionais arrecada de jul a dez; Mundiais, de jan a jun.
  Então "Nacionais, ciclo 2024, pago em 2025" é a campanha arrecadada em 2024 e paga em 2025.
- **Nulo = o ano da data do lançamento** (o comportamento de hoje). Ou seja: **ofertas quase nunca precisam do campo** (o ano
  em que entram é o ano do ciclo); só **remessas pagas fora do ano da arrecadação** o usam.
- Leitura única no sistema: `ciclo = COALESCE(ciclo_missionario, ano da data)`.

### Metas
`fin_metas_campanha (campanha, ano, valor)` já existe: o "ano" passa a significar **ciclo**. Sem migration de metas.

### Preenchimento
- No formulário da **remessa**, ao lado de "Campanha missionária": **"Ciclo (opcional)"**. Só aparece com campanha
  Mundiais/Nacionais.
- **Sugestão automática** (editável): o ciclo da edição a que a remessa pertence, pela regra das remessas ≥ R$ 20.000 e pela
  data (ex.: Nacionais pago em fev–jun → ciclo do ano anterior). Quando a sugestão difere do ano da data, o campo
  vem preenchido e avisa: *"Pago em 2025 — ciclo sugerido 2024"*.
- Na tela de **classificação em lote** das ofertas, nada muda (a data já dá o ciclo).

### Painel
O quadro "Campanhas" agrupa por `ciclo` e mostra, por campanha, **arrecadado do ciclo, enviado do ciclo e a data dos
pagamentos** (ex.: *"Nacionais 2024 — enviado 29.493,56 (dez/2024 a mai/2025)"*). Uma linha do tempo por ciclo
substitui a leitura por ano civil.

### Backfill (mínimo)
| Remessa | Ciclo | Observação |
|---|---|---|
| 27/02/2025 · R$ 5.000,00 | 2024 | Nacionais, parcela (certeza alta) |
| 27/05/2025 · R$ 4.493,56 | 2024 | Nacionais, parcela (certeza alta) |
| 12/07/2024 · R$ 10.327,58 | *(nulo, por ora)* | provisório; só a JMN define (2023?) |
| demais remessas | nulo | o ano da data já é o ciclo |

**Efeito até a JMN responder:** enquanto os R$ 10.327,58 ficarem com ciclo nulo, o painel os conta em **Nacionais 2024** (ano da
data) e a campanha 2024 aparece **−R$ 10.007,52**. Sinalizar na tela como *"classificação provisória aguardando validação da JMN"*,
sem mexer no ciclo.

## 4. O que não muda
- Contabilidade, extratos, conciliação, prestação de contas: **nada** (a coluna é analítica).
- Saldo do fundo: **igual** (o ciclo só reagrupa).
- O ajuste histórico: continua desativado.

## 5. Custo
1 migration aditiva (coluna nula) + 1 campo no formulário + ajuste do agrupamento do painel + testes. Reversível
(`DROP COLUMN`). A tela funciona antes da migration (sondagem de coluna), como as demais.

## 6. Decisões que preciso de você
1. **Opção A**, com a sugestão automática, como na seção 3?
2. **"Ciclo" = ano da arrecadação** (Nacionais jul–dez, Mundiais jan–jun) está certo?
3. Backfill: só as duas parcelas de 2025 agora (e os R$ 10.327,58 ficam nulos até a JMN)?
4. As **ofertas** também ganham o campo, ou ele fica só nas remessas? (Recomendo só nas remessas.)
