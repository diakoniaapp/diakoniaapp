# Liquidação conjunta: um débito do banco pagando várias obrigações — análise (28/10/2026)

Só leitura do código, das migrations e dos documentos do repositório. **Nada foi implementado ou aplicado.** Não li dados reais (o painel do navegador está deslogado), então o que depende do banco está marcado.

## 1. Resposta curta

**O banco já faz N:1.** A tela é que não oferece o caminho completo. Das suas 6 perguntas:

| # | Pedido | Situação |
|---|---|---|
| 1 | Uma movimentação bancária liquidar várias obrigações | ✅ **No banco.** 🟡 **Na tela só pela metade** (ver §3) |
| 2 | Relacionar recorrências do mesmo fornecedor | 🟡 Existe "Outro documento incluído" (mesmo favorecido, só em previsto). Não mostra a relação depois |
| 3 | Distribuir a diferença (previsto × pago) em multa/juros/encargos | ✅ **Existe**, com a pessoa digitando. ❌ Não existe "ratear proporcionalmente" nem sugestão automática |
| 4 | Exibir "Liquidada em conjunto com outras obrigações" | ❌ Não existe (o dado existe; falta mostrar) |
| 5 | Histórico dos relacionamentos | 🟡 O fato fica gravado (liquidação, quem e quando); não há tela que o conte |
| 6 | Estrutura parcial para N:1 | ✅ **Sim, ampla** (§2) |

## 2. O que já existe (reaproveitável)

- **`fin_liquidar`** (migration `20261008200000`): recebe **uma lista de lançamentos**, o valor total pago, os **encargos por lançamento** (juros, multa, complemento, ajuste) e o **FITID do banco**. Recusa se a soma não fecha. É atômica. Já é o "N obrigações ↔ 1 pagamento".
- **`fin_liquidacoes`** (o ato de pagar): guarda `ofx_fitid`. Cada lançamento aponta para ela por `liquidacao_id`. O importador de OFX já trata esse FITID como "já registrado", então a linha do banco não volta como pendente.
- **Encargos como atributos da obrigação** (decisão sua, Opção A): `valor_original`, `juros`, `multa`, `desconto`, `complemento`, `ajuste`, `motivo_diferenca` no próprio lançamento. Nada vira linha separada.
- **`lib/liquidacao.ts`**: o plano da liquidação com vários documentos, a conta "pago − original", o que falta explicar, e o motivo "outro documento incluído".
- **`LiquidacaoPainel`**: já lista "Outros documentos em aberto deste favorecido" e deixa somá-los (`documentosEmAbertoDoFavorecido`).
- **Confirmação bancária** (`confirmacaoBancariaService`): já reconhece a liquidação com FITID como confirmação de **todas** as faturas dela. Foi assim que as Light 1.473,10 e 2.110,12 saíram da pendência.
- **`fin_extrato_vinculos`**: a linha do banco pertence a **uma** despesa (índice único ativo por conta + FITID, decisão sua de 13/10). Por isso, no N:1, o FITID fica na liquidação e **não** gera vínculo por fatura.
- **`fin_desvincular_do_extrato`** (motivo + trilha) e a **trilha de recálculo** (`fin_obrigacao_recalculos`).
- **Precedente exato:** `docs/LIGHT_N10DBB_UMA_LIQUIDACAO.sql`: desvincula, chama `fin_liquidar` com 2 faturas + FITID e concilia. Funciona, mas é um script manual.

## 3. O que falta (a lacuna real)

1. **Não há tela para "relacionar obrigações a uma linha do banco".** Os dois caminhos de hoje falham no caso Light:
   - *Pelo OFX, ao importar* (`LiquidarPeloExtratoDialog`): mostra os candidatos como **escolha de um só** (botões de rádio). Para somar outro documento, depende do painel dentro do diálogo. Só abre quando a linha **ainda não virou lançamento**.
   - *Pelo "Marcar como pago" da Mesa*: aceita "Outro documento incluído", mas **não recebe o FITID**. Paga, mas a linha do banco continua sem ligação, e a pendência "Falta Confirmação bancária" fica.
2. **Linha do banco que já virou lançamento** (o OFX a importou como saída própria) exige hoje o script manual: desvincular → liquidar → conciliar.
3. **O candidato do OFX só considera 1 documento por vez** (`documentoDoExtrato.ts`). Não procura a **combinação** (ex.: 313,77 + 321,37 + encargos).
4. **"Ratear a diferença"** e **sugerir multa/juros** pelo documento: não existe (a auditoria de 28/10 sobre cálculo preventivo confirma que a regra de multa e juros nunca foi lida nem guardada).
5. **Mostrar a relação** ("Liquidada em conjunto com… · Débito N10DA5") na despesa, no Extrato e na Mesa.

## 4. O caso Light de hoje (321,37 e 313,77)

**Atenção ao número.** Pelas notas de 22/10, a linha do banco ligada a esse caso é a **N10DA5, de R$ 603,29**. A soma das duas faturas é **R$ 635,14**. O débito é **menor** que a soma (falta R$ 31,85), então **não** parece "as duas + multa + juros". Pode ser outra composição (outra fatura, pagamento parcial, desconto). **Não monto SQL às cegas**: preciso da linha real do extrato.

O que eu preciso de você para fechar o caso **sem tela nova**: o valor e a data da linha do banco, e se o 313,77 está ligado a ela (o painel diz "Ligado ao extrato"). Com isso eu preparo um script no mesmo formato do N10DBB, em transação com `ROLLBACK` primeiro.

## 5. Proposta (se você quiser a tela)

Reaproveita quase tudo; o trabalho é de **tela e de um serviço**, sem mudar a regra do banco.

**Fase 1: "Relacionar obrigações" (a tela que falta)**
- Entrada: na linha do banco (Mesa de Conciliação e despesa ligada ao extrato) → **[Relacionar obrigações]**.
- Lista as obrigações em aberto do **mesmo favorecido** (previsto e vencido), marcáveis. Mostra: Previsto (soma), Pago (linha do banco), **Diferença**.
- A diferença usa o painel que já existe: multa, juros, outros encargos, **e a opção nova "ratear proporcionalmente"** entre as obrigações marcadas.
- Se a linha já virou lançamento: faz o que o script do N10DBB faz (desvincular com motivo → `fin_liquidar` com o FITID → conciliar), **numa ação só**, com a trilha.
- Serviço novo fino (`liquidacaoConjuntaService`) em cima de `fin_desvincular_do_extrato` + `fin_liquidar`. **Sem migration.**

**Fase 2: mostrar a relação**
- Selo **"Liquidada em conjunto com N outras obrigações"** na despesa (Ciclo), no Extrato de Obrigações e na Mesa, com os irmãos clicáveis e o FITID. Vem de `liquidacao_id` compartilhado, sem coluna nova.
- **Histórico**: quem relacionou, quando, o valor e o motivo (já gravados na liquidação e na trilha); a tela só os lê.
- Quando o valor não bate com nenhum documento, a linha do OFX diz **"Valor diferente do previsto. Possível liquidação conjunta"** com o botão.

**Fase 3: sugestão**
- O OFX procura **combinações** de 2–3 documentos do mesmo favorecido que, com encargos plausíveis (multa 2% + juros ≈ 0,033% ao dia), fecham o valor. Sempre **pede um clique** (sua regra Q2 de 13/10: nada liga sozinho).
- Pede, depois, a leitura de multa e juros no documento (ligaria com o cálculo preventivo de encargos, que é outra frente).

**Estimativa:** Fase 1 ≈ 3 dias; Fase 2 ≈ 2 dias; Fase 3 ≈ 3 dias.

## 6. Decisões suas

1. **A linha do banco continua pertencendo a uma só despesa** e o N:1 fica na liquidação (como hoje), ou você quer **um vínculo por obrigação** (mudaria o índice único de `fin_extrato_vinculos`)? **Recomendo manter como está:** não muda decisão de 13/10 e não quebra nada.
2. **Ratear a diferença**: proporcional ao valor de cada obrigação (recomendo), igual entre elas, ou sempre digitado?
3. **Obrigações de meses diferentes** na mesma liquidação (setembro em atraso + outubro) valem para o **Fechamento**? A data de pagamento é uma só (a do banco); o período fechado de setembro pode recusar. Confirmo no banco antes de construir.
4. **Quem pode relacionar** (hoje liquida admin, tesouraria, secretaria, diaconia)? Recomendo o mesmo.
5. Começo pela **Fase 1**?

## 7. Não verifiquei

- Os dados reais da Light (linha N10DA5, ids dos lançamentos, o que está ligado).
- Se `VinculoBancario` (a faixa "Ligado ao extrato") mostra a liquidação com FITID de várias faturas ou só o vínculo 1:1.
- Se algum período fechado bloqueia incluir uma obrigação de mês anterior na mesma liquidação (gatilho `fin_lanc_bloqueio_fechamento`).
