# Investigação detalhada: janela de 12/07/2024, simulações e o bazar de missões

Levantamento de **06/10/2026**, somente leitura. **Nada foi alterado no banco.**
Visual interativo (gráficos, tabela de 62 lançamentos com destaques e simulações):
[`investigacao-12-07-2024.html`](investigacao-12-07-2024.html) — abre no navegador, imprime bem.

## 0. Estado real do banco hoje (dois avisos)

1. **O ajuste de R$ 12.032,69 JÁ ESTÁ registrado e ativo** (veio na migration `20261006200000`, aprovada antes).
   Você pediu para **não registrá-lo ainda** — então ele precisa ser desativado. Não mexo no banco; duas formas:
   - na tela: *Indicadores Missionários → Fundo Missionário → **Ajustes** → Desativar*; ou
   - SQL (reversível, o ajuste continua no histórico, só deixa de somar):
     ```sql
     UPDATE public.fin_ajustes_fundo_missionario SET ativo = false
      WHERE descricao = 'Primeiro ciclo de 2024: campanhas anteriores ao Omie';
     ```
   Desativado, o **saldo ajustado volta a ser igual ao registrado** e o aviso "Histórico parcialmente incompleto"
   some (ele só aparece com ajuste ativo). Nenhum outro ajuste existe.
2. **A migration `20261006210000` (C1, C2, prebendas, feira) ainda não foi aplicada**: conferi no banco — o R$ 70
   ainda está em "Ofertas", as prebendas continuam sem categoria. Por isso "Cenário atual" abaixo é −16.270,80.

## 1. Linha do tempo crítica: 30 lançamentos antes e 30 depois de 12/07/2024

Janela: **17/06/2024 a 11/11/2024** (30 + 2 remessas do dia + 30). A tabela completa, com Data, Descrição, Categoria,
Campanha, Valor, Saldo e as marcas coloridas, está no HTML. O que ela mostra:

| Trecho | O que acontece |
|---|---|
| 17/06 a 07/07/2024 (30 lançamentos) | O fundo **sobe de R$ 17.543,71 para R$ 25.009,41** (+R$ 7.465,70 de ofertas). Maior entrada: R$ 1.500,10 em 17/06 |
| **12/07/2024** (2 remessas) | **JMN R$ 10.327,58** (25.009,41 → 14.681,83) e **JMM R$ 1.551,32** (→ 13.130,51). Saem R$ 11.878,90 num dia |
| 14/07 a 26/08/2024 | **Quase nada entra**: só R$ 792,00 em seis semanas. O saldo sobe só até R$ 13.922,51 |
| **27/08/2024** | **JMM R$ 25.955,20** (13.922,51 → **−12.032,69**) — *queda brusca* e **primeira vez negativo** |
| 03/09 a 11/11/2024 (restante dos 30) | 30 lançamentos somam só R$ 5.378,97; o fundo termina a janela em **−R$ 7.445,72**. **Não volta a ficar positivo** dentro da janela (volta só em 21/11/2024) |

Leitura: a remessa de 27/08/2024 foi dimensionada pelo ciclo de Mundiais (R$ 25.955,20 × R$ 25.801,41 arrecadados),
mas o fundo já tinha perdido **R$ 11.878,90** em 12/07 sem arrecadação equivalente. **Foram duas retiradas sobre o
mesmo dinheiro.** A retirada de 12/07 é a que não encontra par nas ofertas.

Destaques visuais no HTML: fica negativo (vermelho), volta a positivo (verde), entrada ≥ R$ 1.000, remessa ≥ R$ 20.000,
mudança brusca ≥ R$ 10.000 em um lançamento, linhas com saldo negativo sombreadas, dia 12/07 com faixa roxa.

## 2. Simulações (saldo registrado, cumulativas)

Mede também o **ponto mais baixo** e **por quantos dias o fundo ficou negativo** (de 27/08/2024 a 06/10/2026).

| Cenário | Saldo registrado | Variação | Ponto mais baixo | Dias negativos |
|---|---|---|---|---|
| **Cenário atual** | **−16.270,80** | — | −22.237,77 (29/12/2025) | 667 |
| Após C1 + C2 *(aprovadas)* | −15.950,80 | +320,00 | −21.917,77 (29/12/2025) | 660 |
| Após C1 + C2 + C3 | −15.744,60 | +206,20 | −21.711,57 (29/12/2025) | 660 |
| Após C1 + C2 + C3 + C4 (bazar) | −13.492,86 | +2.251,74 | −19.476,20 (22/07/2025) | 653 |
| Após C1 a C5 | −12.792,86 | +700,00 | −19.476,20 (22/07/2025) | 649 |
| Após C1 a C6 | −12.782,86 | +10,00 | −19.466,20 (22/07/2025) | 649 |
| Após C1 a C7 | **−12.982,86** | −200,00 | −19.666,20 (22/07/2025) | 656 |
| *Alternativa: C1 a C7 **sem** o bazar* | *−15.234,60* | *+1.036,20 sobre o atual* | *−21.901,57 (29/12/2025)* | *660* |

Conclusão das simulações: **nenhuma combinação de reclassificações tira o fundo do negativo** — todas deixam o saldo
na faixa de −R$ 13 mil a −R$ 15 mil e o fundo negativo por ~650 dos ~770 dias desde 27/08/2024. O único ponto que muda
de verdade o quadro é o bazar (C4: leva o ponto mais baixo de 29/12/2025 para 22/07/2025), e é justamente o item
que precisa de decisão — veja abaixo.

## 3. Bazar de missões — evidências

### 3.1 O que o bazar é nesta igreja
A igreja faz **vários bazares, cada um de um ministério**. Todos são lançados como **"Ofertas"** (categoria genérica),
com o centro do ministério quando está classificado:

| Bazar (rótulo no lançamento) | Lançamentos | Valor | Como foi classificado |
|---|---|---|---|
| Ornamentação | 48 | 4.835,62 | Ofertas · centro *Administração · Ornamentação* (parte sem centro) |
| Ministério com Famílias | 39 | 1.288,74 | Ofertas · sem centro |
| ADM / Administração | 34 | 1.490,48 | Ofertas · centro *Min. Administração* |
| Reforma da Cantina | 26 | 1.082,46 | Ofertas · sem centro |
| "Bazar" sem ministério | 28 | 1.729,41 | Ofertas |
| Almoço, Música, Diaconia | 6 | 470,45 | Ofertas · centros *Som e Áudio* / *Administração* |
| **Ministério de Missões** — "BAZAR MINISTÉRIO DE MISSÕES" e "BAZAR MISSÕES NINA" | **42** | **2.251,74** | **Ofertas · sem centro** (é o C4) |
| Ministério de Missões já em *Ofertas para Missões* | 5 | 160,82 | Ofertas para Missões (nov/2024, jul/2025, ago/2025) |

**O padrão contábil da casa é: bazar = receita do ministério dono.** O bazar de missões foi tratado assim em 42 de 47
lançamentos; só 5 entraram em "Ofertas para Missões" — e uma delas (R$ 19,82, "BAZAR MISSÕES NINA", 07/08/2025) é
*irmã* de outras 32 lançadas em "Ofertas" na mesma semana (06–12/08/2025), ou seja, inconsistência do lançamento, não regra.

### 3.2 As perguntas

| Pergunta | Evidência | Resposta |
|---|---|---|
| O valor arrecadado gerou algum repasse posterior? | Nenhuma saída tem valor igual ao do bazar (507,76 · 1.743,98 · 2.251,74 · 1.763,80). As remessas seguintes: JMN R$ 5.000,00 em 27/02/2025 (a mesma semana do bazar de fev., dez vezes maior) e JMM R$ 783,58 em 19/09/2025 (seis semanas depois, texto *"ALVO DE MISSÕES"*) | **Não há repasse rastreável** |
| Existe vínculo com Nina? | "Nina" só aparece **no rótulo** "BAZAR MISSÕES NINA" (33 lançamentos, 06–12/08/2025). Não há fornecedor, pessoa/membro nem pagamento chamado Nina. *(A busca por "nina" também casa com "femi**nina**" — União Feminina —: falso positivo.)* | **Sem vínculo financeiro**: é nome do bazar/organizadora, não beneficiária |
| Existe vínculo com campanha? | Nenhum dos 47 rótulos cita "campanha", "Mundiais" ou "Nacionais" | **Não** |
| Existe vínculo com sustentação missionária? | Nenhuma saída de sustento (prebenda, parcerias) cita o bazar; a prebenda sai todo mês independentemente | **Não** |
| Para onde vai o dinheiro de um bazar? | Despesa de 25/08/2025: *"COMPRADO COM OS RECEBIMENTOS EM ESPÉCIE DO BAZAR"* (R$ 296, material de obra; o lançamento não diz de qual bazar) — receita de bazar paga **compras da própria igreja/ministério** | **Uso interno** (não prova nada especificamente sobre o de missões) |

### 3.3 Conclusão sobre a natureza do bazar
Com a evidência disponível, o bazar de missões **parece receita do Ministério de Missões** (como os outros seis bazares
são dos seus ministérios), **não oferta de campanha** para repasse às Juntas. Nada o liga a remessa, a campanha, a
sustento ou a uma pessoa chamada Nina.

**Por isso revejo a recomendação C4.** Antes eu sugeri mover os 42 lançamentos para "Ofertas para Missões"
(+R$ 2.251,74 no fundo). Com a evidência, o tratamento **consistente com os outros bazares** é:

| Opção | Classificação dos 42 lançamentos | Efeito no saldo do fundo |
|---|---|---|
| **A (recomendada pela evidência)** | Continuam "Ofertas", ganham o centro **Min. Evangelismo e Missões** (a "receita do ministério") | **0,00** |
| B | Vão para "Ofertas para Missões" + campanha | +2.251,74 |

Em qualquer das duas, as **5 linhas de bazar que já estão em "Ofertas para Missões" (R$ 160,82)** deveriam ser
tratadas igual aos 42 (na opção A saem do fundo: −160,82). Quem decide é você / a liderança de Missões: *o bazar
de missões financia a campanha ou o próprio ministério?* Enquanto não houver a resposta, **recomendo não reclassificar o
bazar** (C4 fica de fora).

## 4. Onde isso nos deixa

- A auditoria **não encontrou nenhuma reclassificação que feche o buraco**: a melhor hipótese (C1–C7, com bazar) leva
  a −R$ 12,98 mil; sem o bazar, a −R$ 15,23 mil.
- O resíduo concentra-se em **12/07/2024** (R$ 10.327,58, JMN) e em **Mundiais 2025** (R$ 4,6 mil), e só a **Junta
  Nacional** pode dizer se aquele envio foi campanha, projeto ou saldo anterior ao Omie. **Esse documento é a
  próxima peça**; até lá, nenhum ajuste.
- Ações imediatas para você: (1) **desativar o ajuste de R$ 12.032,69** (§0); (2) **aplicar a migration `…210000`**;
  (3) decidir o bazar (A, B ou deixar como está).

Arquivos: [investigacao-12-07-2024.html](investigacao-12-07-2024.html) ·
[AUDITORIA_FUNDO_MISSIONARIO.md](AUDITORIA_FUNDO_MISSIONARIO.md) ·
`scripts/auditoria-missoes/investigacao-visual.mjs` (reproduz tudo).
