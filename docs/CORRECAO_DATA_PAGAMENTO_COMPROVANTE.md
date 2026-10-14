# Correção histórica da data de pagamento pelos comprovantes

Rotina que corrige, **sem revisão manual**, o campo `data_pagamento` dos pagamentos já
feitos, usando o comprovante bancário anexado a cada um. Primeira execução: **14/10/2026**.
Foram **19 pagamentos corrigidos de 34** (ver "Exemplos reais").

| | |
|---|---|
| Regra (testada) | `src/lib/correcaoDataPagamento.ts`, testes em `correcaoDataPagamento.test.ts` |
| Leitor do comprovante | `src/lib/documentos/comprovante.ts`, o mesmo do "Confirmar pagamento" |
| Scripts | `scripts/correcao-data-pagamento/` (`ler.ts`, `corrigir.ts`, `desfazer.ts`) |
| Saídas | `scripts/correcao-data-pagamento/saida/`, **fora do git**: têm o texto dos comprovantes |
| Trilha | tabela `log_auditoria`, `usuario_email = 'correcao-automatica@comprovante'` |

---

## 1. Objetivo

Até 14/10/2026, o "Pagar" gravava como `data_pagamento` o **dia do registro**, não o dia em
que o dinheiro saiu. Um Pix feito em 08/10 e registrado em 14/10 ficava com 14/10. Com isso o
lançamento não batia com o extrato, com o OFX, com o fechamento do mês nem com o malote.

A rotina lê o comprovante anexado e grava a data da operação quando ela é **inequívoca**. O
objetivo é que fique **Data do sistema = Data do comprovante = Data do extrato = Data do OFX**.

Os pagamentos novos não precisam desta rotina. Desde 14/10/2026 o próprio "Confirmar
pagamento" lê o comprovante e sugere a data (`DataDoPagamento.tsx`). Rode esta rotina quando
entrarem comprovantes **antigos**: lançamentos importados ou comprovantes anexados depois do
pagamento.

---

## 2. Como executar

Da pasta do projeto. É preciso ter a chave `service_role` no `.env` (ou nas variáveis
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`). A chave lê os anexos de todos e grava ignorando
a RLS.

| Passo | Comando | Grava algo? |
|---|---|---|
| 1. Ler os comprovantes | `npm run correcao-data:ler` | Não. Gera `saida/leituras-<data-hora>.json` |
| 2. Ver o plano | `npm run correcao-data:plano` | Não. Lista o que corrige, o que não corrige e por quê |
| 3. Aplicar | `npm run correcao-data:aplicar` | **Sim.** Atualiza `data_pagamento` e grava a trilha |

O passo 2 e o passo 3 usam a leitura **mais recente** de `saida/`. Para usar outra, passe o
caminho do arquivo:

```bash
npm run correcao-data:plano -- scripts/correcao-data-pagamento/saida/leituras-2026-10-14-16-18-20.json
```

Rodar de novo é seguro. O que já foi corrigido aparece em "JÁ CERTAS" e não é tocado.

**Duas proteções na gravação:**

- **Atualização condicional.** A data só muda se, no banco, ela ainda for a que a leitura
  viu. Se alguém mexeu entre o passo 1 e o 3, o lançamento não é alterado e aparece como
  falha.
- **Sem trilha, não fica.** Se a linha de trilha não gravar, a alteração é desfeita na hora.

---

## 3. Critérios de correção

O pagamento só é corrigido quando **todas** as condições valem:

| # | Condição |
|---|---|
| 1 | É um pagamento feito: `tipo = saida` e `status` `realizado` ou `conciliado` |
| 2 | Tem anexo do tipo **comprovante**, em **PDF com texto** |
| 3 | O comprovante tem **data identificada** |
| 4 | A confiança da leitura é **alta** |
| 5 | O **valor** do comprovante é igual ao valor pago (diferença de até R$ 0,009) |
| 6 | O comprovante tem **uma única data** de operação |
| 7 | O PDF traz **um único** comprovante |
| 8 | Se a despesa tem mais de um comprovante, todos dão a **mesma** data |
| 9 | A data cai em **dia útil bancário** (seção 4) |
| 10 | A data é **diferente** da `data_pagamento` atual, ou ela está vazia |

A confiança "alta" vem do leitor (`comprovante.ts`). No Pix, a data também é conferida com o
identificador E2E, que traz embutidos a data, a hora e o banco do pagador. Datas de emissão do
comprovante, de vencimento e de agendamento nunca são usadas como data do pagamento.

---

## 4. Critérios de exclusão

Qualquer dúvida exclui. O plano mostra o motivo de cada caso.

| Motivo | Por quê |
|---|---|
| **Fim de semana ou feriado** | O Bradesco lança no **próximo dia útil**. Medido em 14/10/2026: Pix do sábado 05/09 e Pix do feriado 07/09 aparecem no extrato e no OFX em 08/09. A data do comprovante não é a do extrato, e trocar pioraria a conciliação. |
| **PDF com mais de um comprovante** | O Bradesco junta vários Pix num arquivo só. Não dá para saber qual é o deste pagamento. |
| **Valor divergente** | O comprovante anexado é de outra despesa, ou é só parte dela. |
| **Confiança média ou baixa** | As fontes discordam, o comprovante é de agendamento, a data é antiga, etc. |
| **Mais de uma data** | A leitura não é inequívoca. |
| **Comprovantes da mesma despesa com datas diferentes** | Idem. |
| **Sem comprovante apropriado** | PDF escaneado (sem texto), imagem ou arquivo que não baixa. A rotina **não usa OCR**: no banco ela erra dígito, e aqui não há revisão humana. |

**Calendário bancário.** Os feriados nacionais fixos, os móveis (Carnaval, Sexta-feira Santa e
Corpus Christi, calculados pela Páscoa) e São Jorge (RJ, 23/04) são calculados para **qualquer
ano** em `feriadosBancarios()`. Feriado municipal novo, ou outro banco com outra regra, entra
nessa função, junto com um teste.

---

## 5. Rollback

A trilha guarda a data antiga, então dá para desfazer por lote ou por lançamento:

```bash
npm run correcao-data:desfazer -- --lote 2026-10-14
```

O comando acima **só mostra** o que seria desfeito. Para desfazer de fato:

```bash
npm run correcao-data:desfazer -- --lote 2026-10-14 --aplicar
```

- `--lote AAAA-MM-DD`: as correções feitas nesse dia.
- `--lancamento <id ou prefixo>`: um lançamento só.
- Sem filtro: todas as correções que ainda não foram desfeitas.

O rollback só altera um lançamento se a data no banco **ainda for a que a correção gravou**.
Se alguém mudou à mão depois, o lançamento não é tocado. Cada rollback também gera uma linha
na trilha, com `campos_alt.evento = 'DESFAZ_CORRECAO_DATA_PAGAMENTO'`.

### A trilha, em SQL

```sql
SELECT registro_id,
       valor_antes->>'data_pagamento'  AS data_antiga,
       campos_alt->>'data_pagamento'   AS data_nova,
       campos_alt->>'corrigido_em'     AS corrigido_em,
       campos_alt->>'motivo'           AS motivo,
       campos_alt->>'evento'           AS evento
  FROM public.log_auditoria
 WHERE usuario_email = 'correcao-automatica@comprovante'
 ORDER BY created_at;
```

A coluna `acao` é sempre `UPDATE`, porque a tabela só aceita `SELECT`, `INSERT`, `UPDATE`,
`DELETE` e `EXPORT`. O tipo de evento fica em `campos_alt.evento`. Cada linha guarda também o
arquivo, o banco, o horário, o valor e o identificador E2E do comprovante.

---

## 6. Exemplos reais (execução de 14/10/2026)

Universo: 34 pagamentos com comprovante, em 35 PDFs, todos do Bradesco. Os identificadores
abaixo são os 8 primeiros caracteres do lançamento.

### Resultado

| | Quantidade |
|---|---|
| Corrigidos | **19** |
| Não corrigidos (caso dúbio) | **7** |
| Sem comprovante apropriado (PDF escaneado) | **2** |
| Já estavam certos | **6** |

### Precisão, medida antes de corrigir

Os pagamentos ligados ao OFX têm a data **do banco**. Comparando a leitura com eles: em dia
útil, a data lida foi sempre a do extrato. As únicas diferenças eram de fim de semana e
feriado, e essa regra virou um critério de exclusão.

### Corrigidos (amostra)

| Lançamento | Valor | Era | Ficou | Comprovante |
|---|---|---|---|---|
| `d538b3be` | R$ 1.358,00 | 14/10/2026 | **02/10/2026** | Pix. Era o pagamento parcial registrado no próprio dia 14/10. |
| `dcdbeeda` | R$ 298,00 | 14/10/2026 | **08/10/2026** | Pix, quinta-feira. |
| `cd8cc8f2` | R$ 312,70 | 14/10/2026 | **07/10/2026** | Imposto/taxa: "Data de Pagamento 07/10" |
| `be714ddb` | R$ 984,72 | 11/10/2026 (domingo, dia do registro) | **09/10/2026** | Boleto: "Data de débito 09/10" |
| `9810ed42` | R$ 2.362,00 | 09/10/2026 | **05/10/2026** | Pix, segunda-feira. |
| `67e7fea3` | R$ 299,90 | *(vazia)* | **23/09/2026** | Boleto. O pagamento estava conciliado, mas sem data de pagamento. |

### Não corrigidos

| Lançamento | Valor | Motivo |
|---|---|---|
| `491f335b` | R$ 3.000,00 | Pix de **sábado** 05/09 (o banco lançou em 08/09). O PDF também traz dois Pix. |
| `d1c400c7` | R$ 1.142,00 | Pix do **feriado** 07/09 (o banco lançou em 08/09). |
| `d233beea` | R$ 1.000,00 | O comprovante anexado é de **R$ 31,51**: é de outra despesa. |
| `ed4473fa` | R$ 150,00 | O comprovante é de R$ 102,96. |
| `434fc7b6` | R$ 2.801,40 | Dois comprovantes com datas diferentes, e o valor também não confere. |
| `d6adae05`, `da112d97` | R$ 677,00 · R$ 37,80 | O PDF traz mais de um comprovante. |

### Sem comprovante apropriado

`50a5c7ca` (R$ 160,00) e `788dd2f3` (R$ 90,00): PDFs escaneados, sem camada de texto.

Os 7 não corrigidos e os 2 escaneados continuam com a data que tinham. Se for preciso
acertá-los, é à mão, no lançamento, conferindo com o extrato. O caso `d233beea` vale a pena
olhar: o comprovante anexado não é o dessa despesa.
