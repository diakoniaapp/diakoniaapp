# Matriz de indicadores de contribuição — auditoria de regras e proposta (27/10/2026)

Só análise. Nada foi alterado no código nem no banco. Complementa `AUDITORIA_INDICADORES_CONTRIBUICOES_2026-10-27.md` (o que entra nos cálculos); este documento trata das DEFINIÇÕES. Números medidos com o próprio código do sistema (`_shared/contribuicoes/analise.ts`) sobre os dados reais; só contagens.

## 1. As definições de hoje e onde elas se contradizem

| Termo | Definição no código | Problema |
|---|---|---|
| Contribuinte (doador) | pessoa com `pessoa_id` em ≥ 1 lançamento de Dízimos, Ofertas ou Missões | Mistura os três tipos |
| Dizimista | pessoa com ≥ 1 dízimo identificado, **de qualquer vínculo** | Correta. O código NÃO restringe a membros; quem restringe é o filtro de base (ver §3) |
| Recorrente | dizimista com dízimo em TODOS os meses completos do período | Coerente. Denominador = dizimistas |
| Parcial (novo) | dizimista com dízimo em alguns dos meses completos | Já resolvido hoje (coluna Meses com dízimo) |
| **Novo dizimista** | contribuinte (qualquer tipo) sem contribuição identificada entre 01/01/2026 e o início do período | **Errada pelo nome**: conta quem só deu oferta |
| **Saúde da base / adesão** | membros e congregados ativos que deram QUALQUER tipo ÷ base | **Inconsistente** com "Dizimistas": quem só dá oferta melhora a adesão e não é dizimista |

### O quanto isso distorce (dados reais)

**Novos, 28/04 a 27/10/2026:**

| Definição | Quantos |
|---|---|
| Hoje ("Novos dizimistas" = qualquer contribuinte novo) | 41 |
| Primeiro dízimo identificado no período | 21 |
| Dizimista sem nenhuma contribuição antes do período | 17 |
| Já contribuía com oferta e só agora dizima | 4 |

O número exibido como "novos dizimistas" é cerca do **dobro** do de quem de fato começou a dizimar. (01/07 a 30/09: 18 hoje × 8 pelo primeiro dízimo.)

**Adesão, 28/04 a 27/10/2026, base ativa:**

| Vínculo | Base ativa | Contribuíram (qualquer tipo) | Deram dízimo | Visitantes |
|---|---|---|---|---|
| Membros | 252 | 114 (45,2%) | 86 (34,1%) | |
| Congregados | 52 | 22 (42,3%) | 10 (19,2%) | |
| Visitantes | 17 | 0 | 0 | nenhum contribuiu |
| Membros + congregados (padrão da tela) | 304 | 136 (44,7%) | 96 (31,6%) | |

Hoje a tela mostra só a primeira coluna (44,7%) com o nome "adesão". A adesão ao DÍZIMO é 31,6%, e a diferença entre membros (34,1%) e congregados (19,2%) hoje é invisível.

Quem contribuiu só com ofertas no período: 41 pessoas (28 membros, 12 congregados, 1 transferido).

## 2. Sobre "dizimista só quem é membro?"

Não. Concordo e o código já é assim: dizimista = pessoa com dízimo identificado, qualquer vínculo (no período: 100 membros, 10 congregados, 3 membros inativos e 1 transferido; 0 visitantes). O que falta é MOSTRAR a quebra por vínculo. Pelo desenho de hoje, o filtro de base (padrão "Membros e congregados") esconde os inativos e transferidos dos indicadores e os mostra à parte ("fora da base"). Isso é intencional e deve continuar.

## 3. Proposta: matriz de indicadores

Linhas = o que se mede; colunas = o recorte. Todos com o mesmo período, o mesmo filtro de base e o mesmo cálculo na tela, no Excel e no e-mail.

| Indicador | Definição | Geral | Dízimos | Ofertas | Missões |
|---|---|---|---|---|---|
| Valor arrecadado | soma dos lançamentos (com ou sem pessoa) | ✔ | ✔ | ✔ | ✔ |
| Contribuintes | pessoas identificadas com ≥ 1 lançamento do tipo | ✔ (união) | = Dizimistas | Ofertantes | Contribuintes de missões |
| Contribuintes só de ofertas | contribuíram, mas não deram dízimo | ✔ | | | |
| Recorrentes | dízimo em todos os meses completos | | ✔ | | |
| Parciais | dízimo em alguns meses (com N/M) | | ✔ | | |
| Novos contribuintes | 1ª contribuição identificada no período | ✔ | | | |
| Novos dizimistas | 1º DÍZIMO identificado no período | | ✔ | | |
| Adesão | pessoas da base que contribuíram ÷ base | ✔ | **Adesão ao dízimo** | | |
| Quebra por vínculo | Membros / Congregados / Visitantes: base, contribuíram, dizimaram, % | ✔ | ✔ | | |
| Qualidade da identificação | valor com pessoa ÷ valor analisado | ✔ | | | |

### Como ficaria "Saúde da base" no painel e no e-mail

- **Saúde da contribuição** (qualquer tipo): membros 45,2% · congregados 42,3% · visitantes 0 de 17.
- **Saúde do dízimo**: membros 34,1% · congregados 19,2% · visitantes 0 de 17.
- Em ambos, as listas continuam só com números no e-mail agregado.

### Novos: dois indicadores

- **Novos contribuintes** = a regra de hoje, com o nome certo (41 no exemplo).
- **Novos dizimistas** = primeiro dízimo identificado desde o piso (21 no exemplo). Limite honesto: quem dizimava em 2025 (antes do piso, quando só ~30% dos lançamentos têm pessoa) pode parecer novo; hoje já é assim, e a tela deve continuar dizendo isso.
- "Novos membros dizimistas" (sugerido) é a mesma métrica filtrada pela base «Apenas membros»; não precisa de indicador próprio.

## 4. Qualidade da identificação

Hoje: R$ 728.254,75 analisados, R$ 664.424,87 com pessoa = **91,2%** (pelo valor). Dízimos 95,4%, Ofertas 67,2%, Missões 63,7%. A aba **Pendentes de Identificação** já calcula a taxa em quatro partes (identificadas, anônimas, ignoradas, pendentes) e a meta de 95%. A proposta é só mostrar essa taxa no topo do Painel, com o botão "Ver pendências".

Dois ajustes de justiça na conta:
- as vendas por cartão (§5) não deveriam estar no denominador; sem elas a taxa sobe para ~92,2%;
- oferta em dinheiro de envelope e cartão para missões são anônimas por natureza: ficam em "anônimas", não em "pendentes".

### Recuperação sem adivinhação
- 40 lançamentos (R$ 9.974,10) com o nome completo de um membro no texto: a fila de Pendentes já lê o remetente e sugere a pessoa quando há UM candidato; falta só alguém confirmar.
- 14 lançamentos (R$ 683,00) com o favorecido ligado a uma pessoa: a fila NÃO usa o favorecido hoje. Seria uma sugestão a mais (alta confiança), sem alterar dado automaticamente.

## 5. Nova categoria "Receitas de Eventos e Vendas"

Medido: 65 lançamentos, R$ 7.982,34 (11,2% das Ofertas), pagos por cartão (Cielo): Bazar Ornamentação 36, Almoço Juventude 13, Bazar Apoio ADM 11, Lanche Juventude 1, 4 sem descrição. Hoje só existem 6 categorias de entrada; não há onde lançar venda ou evento senão em "Ofertas".

**Recomendação: criar.** É a única forma de a Oferta voltar a significar oferta. Pontos de cuidado, a decidir com a Tesouraria e a contabilidade:
- o nome (sugestão: "Receitas de Eventos e Vendas") e se entra como receita operacional no DRE;
- reclassificar os 65 (UPDATE com trilha; lançamentos conciliados mantêm valor, data e conta, só muda a categoria) e dizer o que fazer com os 4 sem descrição;
- relatórios que somam por categoria (DRE, Prestação de Contas, pacote contábil) passam a ter uma linha nova: conferir antes;
- as 51 Cielo de Missões (R$ 9.497,28) ficam como estão: são ofertas;
- o repasse da Cielo mistura dízimo e oferta por cartão: sem o relatório da operadora não dá para separar (decisão antiga dela, mantida).
- fora do cálculo de pessoas nada muda: esses lançamentos já não têm pessoa.

## 6. Decisões para ela

1. "Novos dizimistas" passa a ser o **primeiro dízimo**, e a regra de hoje vira "Novos contribuintes"? (recomendo sim)
2. Mostrar **adesão geral e adesão ao dízimo**, com quebra por vínculo (membros, congregados, visitantes)? (recomendo sim)
3. Criar a categoria **Receitas de Eventos e Vendas** e reclassificar os 65? Nome e tratamento no DRE.
4. Incluir o favorecido ligado como sugestão na fila de Pendentes?
5. Mostrar a **Qualidade da identificação** no topo do Painel?
6. Conferir o dízimo de R$ 9.108,10 na Poupança (movimentação interna?).

## 7. Se aprovado: o que muda e o esforço

- `analise.ts`: novos indicadores (ofertantes, só ofertas, novos contribuintes × dizimistas, adesão ao dízimo, quebra por vínculo) — cálculo puro, com testes; a tela, o Excel e o e-mail passam a usar o mesmo resultado (~2 dias).
- Painel, relatório do pastor e "Como interpretar": rótulos e definições novos (~1 dia).
- Categoria nova + reclassificação: migration com ensaio e rollback (~0,5 dia), depois de decidido o tratamento contábil.
- Sugestão por favorecido na fila: ~0,5 dia.
