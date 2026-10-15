# Adendo 3 — Oferta simples, Reembolso rigoroso (15/10/2026)

Aprovado pela Telma em 15/10/2026: *"Oferta deve permanecer simples. Reembolso continua rigoroso."*
Este adendo altera a Matriz de Risco da Política de Compras por Terceiros **apenas para ofertas**. O reembolso não muda.

## 1. O defeito que esta revisão corrige

Uma oferta com a nota fiscal em nome da igreja e a Declaração do Terceiro assinada **não saía de Formalizar**. Duas causas, as duas no banco:

1. **O grau do conjunto era o menor entre o grau do pagamento e o da intenção.** O grau do pagamento só chega a Formal com o anexo `prova_pagamento_terceiro`. Uma oferta comum nunca tem esse comprovante, então o conjunto ficava Relatado para sempre, mesmo com a declaração assinada.
2. **A mensagem mandava anexar a "prova do pagamento"** também para ofertas. Quem precisava fechar o mês anexava um documento que não existe, só para destravar. É exatamente o documento fictício que a Política quer evitar.

Depois da vigência (01/11/2026), as filas Formalizar e A esclarecer bloqueiam o fechamento e o malote. O defeito passaria de incômodo a trava do mês.

## 2. A regra nova da oferta

| Situação | Resultado |
|---|---|
| Nota anexada **em nome da igreja** + Declaração do Terceiro **assinada** + intenção Oferta | **Oferta formalizada**: Formal, risco Baixo, suficiente. Sem comprovante do pagamento do terceiro e sem aprovação. |
| Chave de acesso **não informada** | Não impede. A chave não é obrigatória. |
| Chave de acesso **informada** | Tem de ser válida e do emitente da nota. Se não confere, a mensagem diz para corrigir ou deixar em branco. |
| Valor acima do teto 1, terceiro ministro, empresa sem relação financeira, declaração depois de 30 dias, condição ou destinação restrita, três Relatadas no trimestre, período aprovado, intenção alterada | **Deixam de pedir o Administrador** quando a oferta está formalizada. |
| Acumulado do terceiro no ano **acima do limite anual** (R$ 2.000) | **Revisão do Administrador**, com justificativa. Não vira Alto Risco. |
| **Alto risco** (abaixo) | O **comprovante do pagamento do terceiro** (prova Formal) **ou** a **aprovação formal do Administrador**, com justificativa registrada. |
| Sem a nota anexada | "Oferta ainda não formalizada: anexe a nota fiscal da compra." |
| Nota que não está em nome da igreja | "…a nota precisa estar em nome da igreja (CNPJ da igreja), ou peça a aprovação do Administrador, com justificativa." |
| Sem a declaração assinada | Vale a Matriz de sempre: risco Baixo ainda passa como Relatado; Médio pede o Administrador e a mensagem diz "falta a Declaração do Terceiro assinada". |

### Causas de alto risco da oferta

- o ofertante pede **recibo com efeito fiscal**;
- o terceiro é **pessoa do circuito financeiro** da igreja (tem papel de Administrador, Diaconia, Secretaria ou Tesouraria);
- o terceiro é **empresa com relação financeira**: a igreja lhe pagou algo nos últimos 12 meses;
- **bem durável**, ou natureza do item não informada. Enquanto o **limite de capitalização** não for definido com o escritório, todo durável é alto risco. Definido o limite, o durável abaixo dele segue a regra simples.

A mensagem lista as causas: `Oferta de alto risco (bem durável, e o limite de capitalização ainda não foi definido): anexe o comprovante do pagamento do terceiro OU peça a aprovação formal do Administrador, com justificativa.`

## 3. O que não mudou

- **Reembolso e compensação de adiantamento** seguem exatamente como estavam: só se paga com a prova Formal dos dois lados (Pedido de Reembolso e comprovante do pagamento do terceiro). A aprovação do Administrador do Relatado **não** libera reembolso. A Fase 1D-b reescreverá o reembolso escalonado, em separado.
- O grau de prova continua nascendo dos **anexos**. Nada é digitado.
- O histórico da quitação continua append-only.

## 4. Justificativa do Administrador

`fin_decidir_quitacao` passa a exigir **pelo menos 10 caracteres** de justificativa ao **aprovar** o Relatado. Ela fica no histórico da quitação, com usuário, data e hora, e aparece no cartão ("Justificativa: …"). Recusar continua exigindo 5 caracteres. No cartão, o botão abre uma janela com o campo da justificativa: "Aprovar a oferta (Administrador)…".

## 5. O que muda na tela

- Oferta comum: o cartão mostra "pagamento do terceiro: não exigido" e **não oferece** anexar comprovante do pagamento.
- Oferta de alto risco: aparece "Anexar comprovante do pagamento do terceiro" **e** "Aprovar a oferta (Administrador)…".
- Mensagens de sucesso ao registrar uma oferta mandam anexar **a nota e a Declaração do Terceiro assinada**, e não mais a "prova do pagamento".
- O quadro "Como a obrigação será tratada: oferta" explica a regra.

## 6. Como foi preparado

| Arquivo | Para quê |
|---|---|
| `supabase/migrations/20261016160000_fin_quitacao_oferta_formalizada.sql` | `fin_quitacao_avaliar` (a Matriz), `fin_quitacao_entrada` (+ `chave_informada`) e `fin_decidir_quitacao` (+ justificativa). Nenhuma tabela, coluna ou dado muda. |
| `docs/QUITACAO_OFERTA_ENSAIO.sql` | Ensaio: nada fica gravado. Compara a avaliação de **cada quitação real** antes e depois, roda 25 casos de ouro e termina com `RESULTADO DO ENSAIO … TUDO OK`. |
| `docs/QUITACAO_OFERTA_APLICAR.sql` | Aplicação. Pode rodar duas vezes. Recusa-se a sobrescrever uma definição que mudou depois da leitura de 15/10/2026. |
| `docs/QUITACAO_OFERTA_ROLLBACK.sql` | Devolve as três definições exatamente como estavam em produção. |
| `src/lib/quitacao.ts` + `.test.ts` | Espelho da Matriz em TypeScript. |

Provas locais (banco PostgreSQL embutido, com as migrations da produção):

- a Matriz do banco e a do TypeScript dão o mesmo resultado em **8.000 combinações** aleatórias (nível, suficiência, grau, mensagem, moduladores, eixos e regra aplicada) e nas entradas reais dos casos de teste;
- ensaio TUDO OK sem gravar nada; APLICAR duas vezes sem efeito na segunda; rollback devolve as definições com a mesma impressão digital das de produção, e depois do rollback o ensaio e o APLICAR originais voltam a passar;
- nenhuma quitação de teste passou de suficiente para insuficiente, exceto as que viraram alto risco pela regra nova (por exemplo, durável).

## 7. Pontos em aberto

1. **Limite de capitalização**: definir com o escritório. Até lá, todo bem durável é alto risco.
2. **Efeito nas quitações já cadastradas**: o ensaio mostra, em produção, quantas passam a suficiente e quantas mudam de mensagem. Nenhuma pode piorar sem ser por alto risco.
3. **Reembolso escalonado (Fase 1D-b)**: segue como está, até a Telma aprovar a regra dele.
