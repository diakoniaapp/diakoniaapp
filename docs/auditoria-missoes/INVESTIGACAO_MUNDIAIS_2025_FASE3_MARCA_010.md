# Mundiais 2025 — fase 3: o ",10" como regra real da tesouraria

Levantamento de **06/10/2026**, somente leitura. **Nenhum lançamento foi reclassificado, nenhum ajuste criado.**
Continua [INVESTIGACAO_MUNDIAIS_2025_FASE2.md](INVESTIGACAO_MUNDIAIS_2025_FASE2.md). Ofertantes identificados só pelo id do lançamento.

## 0. O que mudou

A tesouraria informou que **os R$ 0,10 são usados de propósito para identificar oferta missionária** (500,10 · 600,10 · 2.000,10 · 1.500,10…).
Isso troca a natureza do achado da fase 2:

| | Antes | Agora |
|---|---|---|
| Natureza | Indício estatístico (13–38% no fundo contra 0,5% nos Dízimos) | **Informação operacional fornecida pela tesouraria** |
| Pergunta que respondia | "Isso é coincidência?" | "Este Pix, que o doador marcou como missões, está no lugar certo?" |
| Ressalva da fase 2 §6 ("não é prova") | valia | **fica superada quanto à convenção**; continua valendo quanto a **cada lançamento** (a regra diz como o doador *costuma* marcar, não prova o que ele quis em um Pix específico) |

Pela governança A–E, a convenção reforça **A (erro de classificação)** e **D (campanha)**, mas **E (documento)** continua em aberto: declaração da
tesouraria não é o comprovante Pix com a mensagem do pagador. Por isso **nada foi reclassificado**.

## 1. Os candidatos de Mundiais 2025 reavaliados

Classificação sugerida em todos: **Ofertas para Missões · campanha Mundiais 2025** (pela regra do ciclo: a próxima remessa fechadora é a de 22/07/2025, à JMM).

| Id | Data | Valor | Classificação atual | Classificação sugerida | Confiança anterior | Confiança atual | Impacto no fundo (se confirmado) |
|---|---|---|---|---|---|---|---|
| `9e2d4e16` | 29/05/2025 | **2.000,10** | Dízimos | Ofertas p/ Missões · Mundiais 2025 | Indício estatístico (forte) | **Informação operacional da tesouraria** — alta; o doador A também marca ",10" no fundo (1.100,10 em 05/12/2024) | +2.000,10 |
| `26e5b39c` | 02/06/2025 | **600,10** | Dízimos | idem | Indício estatístico (forte) | **Informação operacional da tesouraria** — alta; o doador B marca ",10" no fundo (830,10 em 05/12/2024) | +600,10 |
| `4f87f5f7` | 27/06/2025 | **500,10** | Dízimos | idem | Indício estatístico (forte) | **Informação operacional da tesouraria** — alta; o doador C marca ",10" (400,10 em 18/06/2024) e **no mesmo dia** o fundo recebeu o alvo da classe (800,10 e 500,10) | +500,10 |
| `6f2e15e4` | 07/05/2025 | 178,10 | Dízimos | idem | Indício estatístico (fraca: sem histórico) | **Informação operacional** — média: a convenção se aplica, mas não há histórico do doador | +178,10 |
| `e3cffcce` | 05/03/2025 | 142,10 | Dízimos | idem | Descartada (hábito do doador) | **Média-baixa**: o doador D tem outro Dízimo ",10" (`b3841190`, 144,10 em 04/12/2024), o que sugere **valor habitual de dízimo** e não marca — **precisa de conferência** | +142,10 |
| `f129b495` | 01/04/2025 | 500,10 | Ofertas | **manter** | Descartada (texto) | **Conflito**: a convenção diz missões, mas o texto do próprio Pix diz **"REFORMA CANTINA"**. O texto explícito vence até prova em contrário | 0 (não entra) |
| 5 envelopes | fev–jun/2025 | 191,10 · 112,10 · 67,10 · 182,10 · 14,10 | Ofertas/Dízimos (espécie) | **manter** | Descartadas | A convenção foi descrita para **Pix**; em espécie não se aplica sem confirmação sua | 0 (não entram) |

**Excluído da regra:** `22ec2cf2` (06/08/2025, 97,10, bazar "Missões" via **Cielo**): é repasse de **maquininha** (soma de vendas), não Pix de doador; o ",10" ali é
coincidência de soma. Já estava decidido que o bazar é receita do ministério.

## 2. Mundiais 2025 recalculado — em camadas, nada aplicado

Remessas à JMM: 22/07/2025 (34.216,42) + 19/09/2025 (783,58) = **35.000,00**. Arrecadado hoje: **29.658,89**. Diferença hoje: **−5.341,11**.

| Camada | Entra | Soma | Arrecadado | Diferença p/ 35.000,00 | Saldo registrado do fundo* |
|---|---|---|---|---|---|
| 0 — hoje | — | — | 29.658,89 | **−5.341,11** | −10.980,62 |
| 1 — os três da tesouraria (confiança alta) | `9e2d4e16`, `26e5b39c`, `4f87f5f7` | 3.100,30 | 32.759,19 | **−2.240,81** | −7.880,32 |
| 2 — + os dois de confiança média/média-baixa | `6f2e15e4`, `e3cffcce` | 320,20 | 33.079,39 | **−1.920,61** | −7.560,12 |
| 3 — + o que o texto contradiz (**não recomendado**) | `f129b495` | 500,10 | 33.579,49 | −1.420,51 | −7.060,02 |

\* Saldo registrado já com as migrações `…210000`, `…220000`, `…230000` aplicadas (−10.980,62). Aritmética condicionada à confirmação.

Duas leituras:

1. **A camada 1 explica 58% da diferença** (3.100,30 de 5.341,11) — e **68%** dos R$ 4.557,53 que a remessa de 22/07 teve a mais. Sobram **R$ 2.240,81**, ainda sem
   documento (complementação do caixa geral para fechar R$ 35.000,00, ou ofertas em espécie não lançadas).
2. A convenção **não fecha o ciclo sozinha**. Quem fecharia de vez seria a decisão da tesouraria sobre o valor de R$ 35.000,00 (carta/boleto da JMM) — nenhum documento a registra.

## 3. A mesma convenção nos outros ciclos (Pix ",10" fora do fundo, desde jan/2024)

Levantamento completo: **13 Pix** (R$ 4.870,30) fora do fundo, contra 123 dentro dele nesta consulta (a fase 2 contou 134 de 135 com outro critério de "Pix"; **a diferença não foi conciliada** —
não altera a conclusão, mas os 123 são o piso). Fora dos de Mundiais 2025 acima:

| Id | Data | Valor | Categoria | Ciclo | Leitura |
|---|---|---|---|---|---|
| `bc001639` | 25/09/2024 | 50,10 | Ofertas | Nacionais 2024 | doador marca ",10" no fundo → **candidata** (confiança média-alta) |
| `b3841190` | 04/12/2024 | 144,10 | Dízimos | Nacionais 2024 | mesmo doador D do `e3cffcce`: **hábito de dízimo** (média-baixa) |
| `37a585b4` | 30/12/2025 | 11,10 | Ofertas | pós-Nacionais 2025 | doador marca no fundo; valor pequeno |
| `76747416` | 27/02/2026 | 627,10 | Dízimos (com centro) | 2026 | sem histórico no fundo; **2026 não foi analisado** |
| `2060e0c9`, `ac5785ba` | 20 e 27/07/2026 | 10,10 + 10,10 | Ofertas (classificação automática, "PIX QR Code estático") | 2026 | mesmo remetente; parece **valor fixo de um QR code**, não oferta marcada |

Efeito colateral a considerar: **Nacionais 2024 hoje fecha em +320,06**; os dois ",10" de 2024 (194,20) o levariam a **+514,26**. Reclassificar tudo
pela convenção **empurra para superávit** os ciclos que já fecham — o que é coerente com a prática de remeter parcelas depois, mas exige decidir
campanha e edição caso a caso (ver Ciclo Missionário, ainda não implementado).

**Perguntas abertas que não consigo resolver pelos dados:**

- Existe também uma **marca ",01"**? Dentro do fundo há 8 entradas (nov/dez 2025: 1.440,01 · 500,01 · 300,01 · 1.400,01 · 400,01 · 150,01; além de 200,01 em dez/2024 e 300,01 em jun/2026), todas em época de Nacionais, **menos a de jun/2026**.
  Fora do fundo, há um **Dízimo de R$ 1.630,01 por TED em 18/06/2025** (dentro da janela de Mundiais 2025), 50,01 (31/12/2025), 12,01 e 10,01 (2026).
  **Não os contei** em nenhuma camada. Se ",01" também for convenção (por exemplo, de outra campanha), o R$ 1.630,01 muda a conta.
- A convenção vale para **espécie** ou só para Pix?

## 4. Regra de auditoria proposta: "⚠ Possível oferta missionária"

**Avaliação: viável, barata e de baixo ruído.** *(Atualização de 06/10/2026: aprovada por você e **implementada** — ver §7. O rebaixamento por "hábito do doador" descrito abaixo
ficou de fora da primeira versão, porque o Fechamento só carrega o mês e o hábito exige histórico.)*

**Disparo (função pura, testável):**

| Condição | Detalhe |
|---|---|
| Entrada, não cancelada, não transferência | `tipo = entrada`, `origem ≠ transferencia` |
| Centavos = 10 | `Math.round(valor × 100) % 100 === 10` (evita erro de ponto flutuante) |
| Pix recebido | "PIX" na descrição/observações (como o fundo já é lido) |
| Categoria **fora** de Ofertas para Missões e de Repasses | |
| **Exclusões:** Cielo/instituição de pagamento (vendas de maquininha), Rendimentos de Aplicações, valor ≤ 1,10 | evita falso positivo |
| **Rebaixamento:** se o mesmo doador tem 2+ lançamentos ",10" fora de missões → nível "baixa" (hábito de dízimo) | o caso do doador D |

**Medido nos dados reais:** dispararia **12 alertas em 21 meses** (13 menos o da Cielo), cerca de 0,6 por mês — **sem fadiga de alerta**.
Dos 12, 3 são os candidatos de alta confiança e 1 (`f129b495`) mostraria o texto "REFORMA CANTINA" ao lado do alerta, para o revisor decidir.

**Comportamento:** só sinaliza. Aparece em *Lançamentos a corrigir* e no *Fechamento mensal* como **atenção (não bloqueia o fechamento)**, com o botão
**"Revisar"** que abre o lançamento já com o campo de campanha à mão — **a pessoa decide**. Sem reclassificação automática, sem migração, sem coluna nova.

**Custo:** 1 função em `src/lib` + testes + uma linha em duas telas. **Risco:** nenhum para os dados.

## 5. Próximos passos que dependem de você

1. **Comprovantes Pix com "mensagem do pagador"** de 29/05, 02/06 e 27/06/2025 (e 07/05/2025) — fecham a camada 1 com documento (governança E).
2. **Confirmar se existe a marca ",01"** e se o ",10" vale para espécie.
3. **Autorizar (ou não) a regra de auditoria** da §4.
4. Se você confirmar a camada 1 **como tesouraria**, preparo a migração de reclassificação dos 3 ids para você aplicar (não ensaiada; não sou eu quem altera o banco).

---

## 6. Reavaliação completa dos Pix ",10" desde 2024 (06/10/2026, depois do seu esclarecimento)

Para cada Pix, olhei o **histórico do próprio doador** (valores dos dízimos e se ele já marca ",10" no fundo). Isso **mudou duas avaliações da §1**:

- **Doador D (`e3cffcce` e `b3841190`) caiu de média-baixa para baixa.** Os dízimos regulares dele variam entre ~R$ 145 e R$ 152; 142,10 e 144,10 estão **dentro da faixa do dízimo
  dele**, então a chance de ser dízimo é maior do que parecia.
- **`bc001639` (50,10) subiu para alta.** As outras ofertas dele fora do fundo são redondas (50,00 · 100,00) e ele tem ",10" no fundo; o 50,10 destoa do hábito dele.

Nos três de Mundiais 2025 a leitura se reforçou: o dízimo regular do doador A é **1.100,00** (3 vezes), o do B gira em 550–900 e o do C em 900–1.150 — o 2.000,10, o 600,10 e o 500,10
**não são o dízimo habitual de ninguém** e os três doadores já marcam ",10" no fundo.

Campanha sugerida pela regra do ciclo (a próxima remessa fechadora); onde há dúvida está dito.

### Alta confiança — 4 Pix, R$ 3.150,40

| Id | Data | Valor | Categoria atual | Categoria sugerida | Campanha sugerida | Por quê |
|---|---|---|---|---|---|---|
| `bc001639` | 25/09/2024 | 50,10 | Ofertas | Ofertas p/ Missões | Nacionais 2024 | doador marca ",10" no fundo; outras ofertas dele são redondas |
| `9e2d4e16` | 29/05/2025 | 2.000,10 | Dízimos | Ofertas p/ Missões | Mundiais 2025 | dízimo habitual = 1.100,00; marca ",10" no fundo |
| `26e5b39c` | 02/06/2025 | 600,10 | Dízimos | Ofertas p/ Missões | Mundiais 2025 | dízimo habitual 550–900, nunca ",10"; marca no fundo |
| `4f87f5f7` | 27/06/2025 | 500,10 | Dízimos | Ofertas p/ Missões | Mundiais 2025 | dízimo habitual 900–1.150; marca ",10" 2× no fundo |

### Média confiança — 2 Pix, R$ 805,20

| Id | Data | Valor | Categoria atual | Categoria sugerida | Campanha sugerida | Por quê |
|---|---|---|---|---|---|---|
| `6f2e15e4` | 07/05/2025 | 178,10 | Dízimos | Ofertas p/ Missões | Mundiais 2025 | destoa do dízimo habitual (151,80–359,30); **sem histórico no fundo** |
| `76747416` | 27/02/2026 | 627,10 | Dízimos | Ofertas p/ Missões | Mundiais 2026 | **sem nenhum outro lançamento** do doador para comparar |

### Baixa confiança — 6 Pix, R$ 817,60

| Id | Data | Valor | Categoria atual | Categoria sugerida | Campanha sugerida | Por quê |
|---|---|---|---|---|---|---|
| `e3cffcce` | 05/03/2025 | 142,10 | Dízimos | manter (revisar) | Mundiais 2025 | doador D: dentro da faixa do dízimo dele |
| `b3841190` | 04/12/2024 | 144,10 | Dízimos | manter (revisar) | Nacionais 2024 | idem |
| `f129b495` | 01/04/2025 | 500,10 | Ofertas | manter | — | o texto do Pix diz **"REFORMA CANTINA"** |
| `37a585b4` | 30/12/2025 | 11,10 | Ofertas | revisar | conforme o ciclo | doador sem ",10" no fundo; outras ofertas dele terminam em ",05" (outra marca própria?) |
| `2060e0c9` | 20/07/2026 | 10,10 | Ofertas | manter (revisar) | ciclo aberto | "QR Code estático", mesmo remetente nos dois; parece valor fixo |
| `ac5785ba` | 27/07/2026 | 10,10 | Ofertas | manter (revisar) | ciclo aberto | idem |

Fora das tabelas (excluído da regra): `22ec2cf2`, 97,10, Cielo (soma de vendas do bazar). Total dos 12 Pix: R$ 4.773,20.

### Mundiais 2025 — o impacto financeiro, nas três etapas pedidas

| Etapa | Arrecadado | Diferença p/ R$ 35.000,00 | Saldo registrado do fundo |
|---|---|---|---|
| **Saldo atual** | 29.658,89 | **−5.341,11** | −10.980,62 |
| ↓ + 3 Pix de alta confiança (3.100,30) | 32.759,19 | **−2.240,81** | −7.880,32 |
| ↓ + candidato de média confiança de Mundiais 2025 (`6f2e15e4`, 178,10) | 32.937,29 | **−2.062,71** | −7.702,22 |

O `76747416` (média) é de 2026 e não entra em Mundiais 2025. O `bc001639` (alta) é de Nacionais 2024: reclassificá-lo move o saldo total do fundo em +50,10
(Nacionais 2024: +320,06 → +370,16), sem tocar em Mundiais 2025. **Opcional, só se você confirmar com o doador D:** `e3cffcce` leva a diferença a −1.920,61.

### Perguntas ainda abertas (os campos do seu esclarecimento vieram em branco)

- **Forma de recebimento.** Apliquei **só Pix**, como nos seus critérios. Os dados sustentam isso: **134 das 135** entradas ",10" do fundo são Pix. Em espécie, fora do fundo, há 10 lançamentos ",10"
  (R$ 10.816,00, dos quais R$ 9.108,10 são um dízimo na Poupança de 01/08/2026) — **não os tratei como candidatos**.
- **Existe a marca ",01"?** O fundo tem 8 entradas ",01" (200,01 em dez/2024; 1.440,01 · 500,01 · 300,01 · 1.400,01 · 400,01 · 150,01 em nov–dez/2025; 300,01 em jun/2026). Fora do fundo há um
  **Dízimo de R$ 1.630,01 por TED em 18/06/2025**. Sem resposta sua, **não entra em nenhuma conta**.

## 7. A regra de auditoria "⚠ Possível oferta missionária" — implementada (06/10/2026)

Aprovada por você; **só sinaliza**. Critérios aplicados: entrada · Pix · valor terminado em ",10" · categoria fora de *Ofertas para Missões* e de repasse. Exclusões: transferência entre contas,
rendimentos, valor até R$ 1,10 e repasse de maquininha (Cielo/Getnet/PagSeguro/"instituição de pagamento").

- **Onde aparece:** Fechamento mensal › etapa 2 *Lançamentos* (contador ⚠, nível "atenção") e *Abrir Correções* (grupo próprio, botão **Revisar** que abre o lançamento).
- **O que NÃO faz:** não bloqueia o malote, não reclassifica, não grava nada. O contador não entra nas pendências que impedem o fechamento.
- **Código:** `src/lib/possivelOfertaMissionaria.ts` (regra pura, 7 testes) + `avaliarFechamento` (2 testes novos) — sem migração e sem coluna nova.
- **Conferido na tela, com dados reais:** dez/2025 → 1 alerta · fev/2026 → 1 · jul/2026 → 2 · set/2026 → 0 — exatamente os Pix ",10" fora de missões desses meses.
- **Ainda não faz:** rebaixar quem repete ",10" em dízimos (o caso do doador D), porque o Fechamento só carrega um mês. Se quiser, vira uma segunda versão com consulta ao histórico.
