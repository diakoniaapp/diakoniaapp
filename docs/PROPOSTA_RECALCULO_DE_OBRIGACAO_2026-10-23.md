# Recalcular uma obrigação (FGTS atrasado) sem perder a história — proposta de arquitetura (23/10/2026)

Só análise e proposta; **nada foi implementado**. Medido no código e nas migrations (o banco ao vivo não foi consultado).

## 1. Concordo — e o desenho já está meio construído

Excluir e recriar apaga o fato mais útil: **a igreja pagou R$ 37,50 a mais por atraso**. O que ela quer (preservar o original, registrar o encargo, mostrar como custo extraordinário) é a **Opção A**, que a Tesouraria já decidiu em 13/10/2026 e está no ar: *"uma obrigação continua sendo uma obrigação"*; juros, multa e desconto são **campos da obrigação**, nunca linha de DRE (`lib/encargos.ts`, `fin_lancamentos.valor_original / juros / multa / complemento / ajuste / desconto / motivo_diferenca`).

**Recomendação: a Opção 1 (recalcular a obrigação existente).** A Opção 2 (lançamento complementar vinculado) contraria a Opção A: faz parecer duas despesas, divide o FGTS em dois lançamentos no extrato e no OFX, e a Tesouraria já rejeitou isso três vezes. Também **não criaria um conceito/tabela "Ajuste Financeiro" paralelo**: os campos já existem; falta a *porta de entrada* antes do pagamento.

## 2. O que existe hoje e onde está a lacuna

| Peça | Estado hoje |
|---|---|
| Colunas de encargo + `valor_original` | existem — mas **só `fin_liquidar` as preenche, na hora de PAGAR** (`juros = v_juros`, sobrescreve) |
| Trilha imutável de edição (`fin_lancamento_historico`: valor, data, fornecedor… antes/depois, quem, quando, motivo) | existe (Fase 2A, 15/10) — mas editar o valor de uma obrigação em aberto grava só "1.000 → 1.037,50"; **não diz que 37,50 é encargo**, e `valor_original` fica em branco |
| Painel de encargos nos relatórios (`IndicadoresDeEncargos`, bloco na Prestação, sub-linha no Extrato) | existe — **só enxerga o que foi pago** com encargo registrado |
| Congelamento após envio à contabilidade (`fin_lanc_congela_*`) | existe — vale também para o recálculo |

**A lacuna:** guia recalculada **antes** do pagamento não tem caminho próprio. Editar o valor perde a classificação; excluir/recriar perde tudo.

## 3. Proposta: ação "Recalcular guia" na obrigação em aberto

**Fluxo na tela** (botão no detalhe da obrigação e no menu da Mesa/Extrato, só para obrigação `previsto`):
1. Mostra o valor atual (R$ 1.000,00) e pede o **novo valor da guia** (R$ 1.037,50).
2. O sistema calcula a diferença (R$ 37,50) e pede **a quebra**: Juros · Multa · Correção/atualização (soma tem de fechar com a diferença; sobra sem explicação vai para `ajuste` e exige motivo — a regra que já existe).
3. **Motivo** obrigatório (mín. 5 caracteres), com sugestões ("Encargos por atraso", "Guia reemitida").
4. Opcional/recomendado: anexar a **nova guia** (tipo `guia`); a original permanece nos anexos.
5. Confirmação mostra o impacto (reaproveita `fin_impacto_edicao`: declaração/aprovação que cairia).

**Resultado na obrigação:** `valor_original` = 1.000,00 (gravado uma única vez, na primeira recalculada) · `multa` ou `juros` = 37,50 · `valor` = 1.037,50 · selo **⚠ Recalculada**. Recalculada mais de uma vez (nova guia, nova multa) acumula e mantém o `valor_original` da primeira.

**Auditoria:** a trilha existente continua gravando o antes/depois do `valor`; acrescenta-se **um registro por recálculo** numa tabela pequena e imutável (`fin_obrigacao_recalculos`: obrigação, valor antes/depois, juros, multa, correção, ajuste, motivo, anexo da nova guia, quem, quando). É ela que alimenta o relatório de custos extraordinários e responde "por que o FGTS de setembro ficou mais caro?" sem ler texto livre.

## 4. A parte delicada: o pagamento depois do recálculo (`fin_liquidar`)

Hoje `fin_liquidar` faz `juros = v_juros` e `valor_original = COALESCE(valor_original, valor)`. Se a obrigação já traz encargo registrado e o Pagar manda "sem encargos", o encargo seria **zerado**. Duas saídas; recomendo a primeira:
- **(a)** o pagamento **soma** aos encargos já gravados (juros/multa novos por um segundo atraso entram além dos 37,50) e o diálogo Pagar pré-carrega "principal = valor original − desconto; encargos já registrados" para a pessoa só confirmar;
- (b) o app recomputa tudo e manda em `p_encargos` (menos SQL, mais regra no cliente — e há outros chamadores).

Exige alterar `fin_liquidar` (função central, usada por 6 migrations) com ensaio no Postgres local — é o maior risco e o maior custo do trabalho.

## 5. Reflexo nos relatórios, Fechamento e Contabilidade

- **Extrato de Obrigações / Mesa / Pagar:** chip **⚠ Recalculada** e a linha de detalhe que já existe: *Valor original R$ 1.000,00 · Multa R$ 37,50*.
- **Prestação de Contas mensal:** novo bloco **"Custos extraordinários do mês"** (FGTS — encargos por atraso — R$ 37,50, com o motivo), reaproveitando `IndicadoresDeEncargos`. **O total do FGTS continua em "FGTS"** (Opção A): o relatório mostra o extra *ao lado*, nunca como linha de despesa separada. Regime: o custo extraordinário aparece no **mês do pagamento** (como hoje, caixa); recalculada e ainda não paga aparece em "encargos previstos".
- **Fechamento / pacote da contabilidade:** a planilha ganha as colunas *valor original · encargos · motivo*; o ZIP leva **a guia original e a recalculada** na pasta da obrigação. Se o contador quiser multa e juros em **contas contábeis próprias**, isso é mapeamento na exportação — não linha de DRE.
- **Conciliação OFX:** inalterada e até melhor — o valor da obrigação já é o da guia nova, então o débito de R$ 1.037,50 casa de primeira.
- **Painel/indicadores:** "Encargos por atraso" do período (quanto custou pagar atrasado) vira indicador de gestão.

## 6. Esforço (estimativa)

| Parte | Dias |
|---|---|
| Banco: tabela de recálculos + RPC `fin_recalcular_obrigacao` + ajuste de `fin_liquidar` + view + ensaio | 2 |
| Tela: diálogo "Recalcular guia", selo, integração no Pagar | 1,5 |
| Relatórios: Extrato, Prestação ("Custos extraordinários"), Fechamento/CSV/ZIP | 2 |
| Testes, conferência na tela, documentação | 1 |
| **Total** | **~6 dias** (MVP — RPC + diálogo + selo + Extrato + bloco na Prestação — **~3 dias**) |

## 7. Enquanto isso (procedimento até existir)

Em vez de excluir e recriar: **editar o valor** da obrigação com motivo ("Guia recalculada — encargos por atraso R$ 37,50"). A trilha guarda o antes/depois e o motivo; só não classifica o extra como encargo. Anexar a guia nova e manter a antiga.

## 8. Decisões dela

1. Concorda com a **Opção 1** (recalcular a obrigação) e em **descartar** a Opção 2 e o "Ajuste Financeiro" como tabela à parte?
2. Tipos de encargo: **juros, multa e correção** bastam? (hoje há `complemento` e `ajuste`; "correção/atualização monetária" seria coluna nova.)
3. O custo extraordinário aparece no **mês do pagamento** (caixa) ou no **mês de competência** da obrigação?
4. Recalcular obrigação **já enviada à contabilidade**: bloquear (padrão atual) ou exigir "reabrir" com motivo?
5. A **nova guia anexada** é obrigatória para recalcular?
6. A contabilidade quer multa/juros **separados na planilha/ZIP**, com contas contábeis próprias?
7. Quem pode recalcular: só Tesouraria/Administração?
