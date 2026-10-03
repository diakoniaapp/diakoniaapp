# Validação dos 15 lançamentos datados de 01/09/2026

*03/10/2026 · só leitura, em produção · pedida antes de concluir o Dossiê, porque a data
vai no nome do arquivo (`DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR`).*

> Este documento não traz nomes de pessoas nem valores de salário (o repositório não é o
> lugar deles). A tabela com nomes e valores foi entregue na conversa.

## Pergunta

Em setembro, 15 das 120 saídas pagas estão datadas de **01/09**; em agosto, 0 de 132 caem no
dia 1. Os dois dossiês que ela montou à mão tinham arquivos chamados `04.09.2026 …`. A data
do sistema está errada, ou é só o nome dos arquivos que difere?

## Veredicto

**Nenhuma das 15 datas se mostrou errada.** Em todas há evidência independente de que o
dia 01/09 é o dia do movimento no banco ou da compra. O `04.09` dos dois arquivos é um rótulo
da tesouraria, **não** a data da operação bancária.

## Evidência, por grupo

| Grupo | Qtd | Evidência de que 01/09 está certo |
|---|---|---|
| Pagamentos por PIX no Bradesco (prestadores, folha, prebendas, locação) | 10 | O texto do extrato importado de **cada um** termina em `0109` (dia+mês do movimento no banco). |
| — dois desses têm o **comprovante do banco** anexado | 2 | O PDF do comprovante diz literalmente **"Data da operação: 01/09/2026 – 20h43"** (lido do conteúdo). É a prova mais forte: a data do banco é 01/09, não 04/09. |
| Compras em dinheiro na Caixinha, com nota fiscal anexada | 2 | O próprio arquivo da nota é nomeado `01.09.2026 …` pela tesouraria. |
| Tarifas bancárias de PIX | 2 | Seguem o PIX do mesmo dia; dispensam documento. Sem data própria no texto. |
| Conta de água (boleto lido por código de barras) | 1 | O mesmo fornecedor paga todo mês no dia 1 (01/06, 01/07, 03/08 — o dia 1 de agosto foi sábado —, 01/09). Coerente com o vencimento. |

## Padrão geral do `DDMM` do extrato (Bradesco/PIX, jun–set/2026)

De 91 lançamentos importados com `DDMM` no texto, **81 (89%) têm o dia igual ao do
lançamento**. Os **10 que diferem não estão entre os 15 de 01/09**. Não analisei esses 10
(a pergunta era sobre 01/09); ficam como ponto a olhar se o contador reclamar de algum dia.

## O que isso muda para o Dossiê

- **Nada precisa ser corrigido nos 15 lançamentos** para o pacote de setembro sair com a data
  do banco. Os nomes sairão `01092026_…`.
- A questão que **resta** é de regra, não de dado: para folha/RPA, ela quer a **data do banco**
  (01/09, como está) ou a **data da tesouraria** (04/09)? Com a data do banco, não se mexe em
  nada. Com a da tesouraria, é preciso preencher `data_pagamento` desses lançamentos (o
  campo existe e o pacote já o prefere a `data`).
- Observação lateral: os dois comprovantes mostram o **mesmo "N° de controle"** do banco
  embora sejam pagamentos a pessoas diferentes. Pode ser extração do PDF; não investiguei.

## Como foi medido

Consulta direta aos 15 lançamentos (`tipo=saida`, `data=2026-09-01`, realizado/conciliado),
leitura de `observacoes` (texto do extrato do Omie), leitura do conteúdo dos dois PDFs de
comprovante (camada de texto) e comparação do `DDMM` com `data` em todos os PIX importados
de jun a set/2026. Nenhuma escrita.
