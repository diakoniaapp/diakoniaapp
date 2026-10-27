# Auditoria dos indicadores de contribuição — 27/10/2026

Só leitura. Nada foi alterado no código nem no banco. Dados reais de 01/01/2026 a 27/10/2026, lidos pela sessão logada (contagens e somas; nenhum nome foi impresso).

## 1. O que entra hoje (regra do código)

`supabase/functions/_shared/contribuicoes/carregar.ts` + `analise.ts` (a tela e o e-mail usam a MESMA consulta):

- `fin_lancamentos` com `tipo = entrada`, `status` realizado ou conciliado, `data >= 01/01/2026`;
- só categorias pelo NOME: **Dizimos**, **Ofertas**, **Ofertas para Missões** (`tipoDaContribuicao`);
- sem filtro de conta, centro de custo, forma de pagamento, origem, projeto ou fornecedor. Entra tudo que tiver uma dessas três categorias.

| Indicador | O que conta |
|---|---|
| Arrecadado, por categoria | as três categorias, COM ou SEM pessoa |
| Contribuintes / doadores | só linhas COM `pessoa_id` (qualquer das três categorias) |
| Dizimistas | só `pessoa_id` + categoria Dízimos |
| Recorrentes | dizimista com dízimo em TODOS os meses completos do período |
| Novos dizimistas | qualquer contribuinte (dízimo, oferta ou missões) sem contribuição identificada entre 01/01/2026 e o início do período |
| Saúde da base | membros/congregados ativos × quem tem qualquer das três categorias com pessoa |

Nenhum campo de texto (descrição, observações) e nenhum favorecido participa da identificação: só `pessoa_id`.

## 2. Medição (01/01 a 27/10/2026)

**Entram: 1.686 lançamentos, R$ 728.254,75**

| Categoria | Lançamentos | Valor | Identificado (valor) |
|---|---|---|---|
| Dízimos | 908 | R$ 624.252,25 | 95,4% |
| Ofertas | 604 | R$ 71.265,20 | 67,2% |
| Ofertas para Missões | 174 | R$ 32.737,30 | 63,7% |

Contas: Bradesco 1.395, Caixa de Envelopes 290, Poupança 1. Origens: Omie 1.381, OFX 260, manual 45. Não há lançamento "previsto" em 2026.

**Ficam fora, corretamente:** 386 entradas sem categoria (transferências, resgates, aplicações: R$ 842.313), 140 Rendimentos (R$ 10,10), 3 Estornos e Recuperações (R$ 647). As únicas categorias de entrada são 6: Descontos Obtidos, Dizimos, Estornos e Recuperações, Ofertas, Ofertas para Missões, Rendimentos de Aplicações.

### 2.1 Cielo
116 lançamentos, R$ 17.479,62, TODOS sem pessoa. Identificados pelo favorecido "Cielo" (apenas 36 trazem "Cielo" no texto das observações; nenhum na descrição).
- 65 em **Ofertas** (R$ 7.982,34): 36 "Bazar Ornamentação", 13 "Almoço Juventude", 11 "Bazar Apoio ADM", 1 "Lanche Juventude", 4 sem descrição. Centros: Ornamentação 39, Juventude 14, Min. Administração 12. **São vendas e eventos, não contribuições.**
- 51 em **Ofertas para Missões** (R$ 9.497,28), centro Campanhas Missionárias: ofertas por cartão para missões. São contribuições, não identificadas.

Efeito: entram em Arrecadado, Ofertas e Missões; NÃO entram em dizimistas, recorrentes, novos nem saúde da base (sem pessoa).

### 2.2 Sem pessoa vinculada
377 lançamentos, R$ 63.829,88 (8,8% do valor): Dízimos 75 (R$ 28.562,05), Ofertas 228 (R$ 23.399,69), Missões 74 (R$ 11.868,14). Contam no total arrecadado; não contam em nenhum indicador de pessoas. Dos 228 de Ofertas, 65 são as vendas da Cielo acima; 76 estão na Caixa de Envelopes (oferta em dinheiro, anônima por natureza).

### 2.3 Identificadas só por texto
- **40 lançamentos (R$ 9.974,10)** estão sem pessoa, mas o nome completo de UM membro aparece na descrição/observações: 20 Dízimos (R$ 8.753,00), 17 Ofertas (R$ 1.159,00), 3 Missões (R$ 62,10). Nenhum deles tem dois nomes possíveis. Hoje NÃO contam como identificados: faltam 20 dízimos nos dizimistas/recorrentes.
- **14 lançamentos (R$ 683,00)** têm o favorecido ligado a uma pessoa, mas o lançamento está sem `pessoa_id`: 3 Dízimos (R$ 373,00) e 11 Ofertas (R$ 310,00). Recuperáveis sem adivinhar nada.
(Os dois grupos podem se sobrepor em parte.)

### 2.4 Receitas administrativas
Não existe categoria de entrada para vendas, eventos, bazar, cantina ou reembolso. Qualquer receita que não seja dízimo/oferta cai em **Ofertas** ou fica sem categoria. Casos medidos:
- as 65 vendas por cartão acima (R$ 7.982,34 = 11,2% das Ofertas);
- **1 dízimo de R$ 9.108,10 na conta Poupança**, origem manual, forma transferência, com "poupança" no texto: confirmar se é dízimo ou movimentação interna;
- dízimos em centros incompatíveis: Administração · Pessoal (R$ 2.500,00), Administração · Consumo (R$ 1.000,00); 21 dízimos sem centro (R$ 14.575,00). Não mudam o indicador, mas indicam classificação descuidada;
- 1 dízimo de R$ 1.190,00 com palavra de venda no texto (provável falso positivo; conferir).

### 2.5 Fora da base
Contribuintes inativos/transferidos: 4 pessoas, 35 lançamentos (R$ 12.047,62). Ficam fora dos indicadores quando há filtro de base e aparecem à parte ("fora da base"). Comportamento intencional.

## 3. Conclusão: entram / deveriam entrar / deveriam sair

**Entram hoje:** Dízimos, Ofertas, Ofertas para Missões (realizados/conciliados, desde 01/01/2026), com ou sem pessoa.

**Deveriam entrar (e já entram):** Dízimos, Ofertas de pessoas e anônimas (envelopes, PIX sem identificação), Ofertas para Missões, inclusive as por cartão da Cielo.

**Deveriam entrar e hoje não entram como identificadas:** os 40 por nome no texto e os 14 por favorecido ligado (R$ 10.657 no máximo, com sobreposição) — vão para a fila de Pendentes, não para o cálculo automático.

**Deveriam sair:**
1. as 65 vendas/eventos pagos por Cielo em Ofertas (R$ 7.982,34): exigem nova categoria de entrada (ex.: "Receitas de eventos e vendas") ou outra classificação; decisão da Tesouraria;
2. o dízimo de R$ 9.108,10 na Poupança, SE for movimentação interna.

**Regras de definição a reconsiderar (não são tipos de receita):**
- "Novos dizimistas" conta qualquer contribuinte (inclui quem só deu oferta);
- "Saúde da base" considera contribuinte quem deu qualquer das três categorias, enquanto "Dizimistas" exige dízimo.
