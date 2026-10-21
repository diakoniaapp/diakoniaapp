# Classificação dos 52 movimentos duplicados do OFX de 20/10/2026

**Só classificação. Nada foi apagado.** Medido em leitura no banco de produção, 20/10/2026, com a sessão da Telma.

## A prova (vale para os 52)

Contei, para cada combinação *sentido + valor + dia* do Bradesco entre 01 e 19/10, quantas vezes o **extrato do banco** a lista e quantas vezes o **banco de dados** a tem (realizado + conciliado). Nas 45 combinações em que o sistema gravou algo hoje, o sistema tem **exatamente o dobro** do banco (ex.: PIX de R$ 20 em 05/10: extrato 4, sistema 8; 4 criados hoje). Nenhuma linha do extrato falta no sistema. Ou seja: a existência de **uma cópia a mais por movimento** é fato do extrato, não palpite do pareamento. As 52 cópias de hoje (criadas 19h16–19h37, origem `importado_ofx`, marca `lote-ofx`) são as que sobram; **as antigas (08–14/10) ficam**.

Nenhuma das 52 de hoje tem anexo, liquidação, filho ou obrigação ligada a ela; apagar uma não arrasta nada. Em 9 casos o lançamento **antigo** tem anexo (📎) — por isso o certo é manter o antigo e apagar o de hoje, nunca o contrário.

## Resultado

| Classe | Qtde | Valor líquido | O que significa |
|---|---|---|---|
| **Praticamente certos** | **33** | R$ 2.081,75 | A cópia de hoje não traz nada que o antigo não tenha (mesma categoria, mesmo centro, mesmo favorecido). Apagar a de hoje é seguro. |
| **Precisam de revisão** | **19** | R$ 3.848,43 | É duplicata do mesmo jeito (a contagem prova), mas a cópia de hoje **difere do antigo na classificação**: decidir qual classificação fica **antes** de apagar, para não perder o acerto que a Tesouraria fez hoje (ou não herdar um erro). |

Motivos da revisão: favorecido diferente 8 · favorecido só no antigo 3 · favorecido só no de hoje 1 · centro de custo 2 (+2 com favorecido) · categoria 3 (Dízimos × Ofertas, 70,00 / 50,00 / 20,00). Nos casos de PIX de mesmo valor no mesmo dia (R$ 20, 50, 150, 650) o par exato é ambíguo — mas como **todas** as cópias de hoje daquele valor/dia são excedente, a decisão é a mesma para o grupo.

## Fora da lista (3 movimentos que NÃO são duplicata de OFX)

| Movimento | O que é | Veredito |
|---|---|---|
| Saída R$ 2.639,15 em 01/10 — "Transferência: Bradesco → Caixa de Aplicação" | veio do PDF do Invest Fácil (`[ofx:PDF:…]`), não está no OFX | **legítimo**, manter |
| Entrada R$ 5.204,75 em 02/10 — "Transferência: Caixa de Aplicação → Bradesco" | idem (resgate do PDF) | **legítimo**, manter |
| Entrada R$ 250,00 em 01/10 — "DEP DINHEIRO ATM" | **duplicata de transferência**: hoje às 19h18 foi criada "Transferência: Caixa de Envelopes → Bradesco" (`06afa9a5`, marca N10111) e já existia a de 08/10 (`80c5728f`, marca N11AEB). O extrato tem **1**; o sistema tem **2** | **precisa revisão** — é um par de pernas (Caixa de Envelopes + Bradesco); desfazer pela tela de transferência, não por DELETE solto |

## As 52, uma a uma

Colunas: dia do movimento · sentido · valor · identificador de hoje · identificador antigo · id do lançamento de hoje (**candidato a apagar**) · id do antigo (**fica**; 📎 = tem anexo).

### Praticamente certos (33)

| Dia | Sentido | Valor | FITID hoje | FITID antigo | Lançamento de hoje | Lançamento antigo |
|---|---|---|---|---|---|---|
| 01/10 | saída | 1.479,65 | N10203 | N11BDD | `0c21aa4b` | `6a40c63c` 📎 |
| 01/10 | entrada | 1.070,00 | N10195 | N11B6F | `2d4291c4` | `21438aad` |
| 01/10 | entrada | 650,00 | N101D7 | N11BB1 | `c3e0b17e` | `b4806bda` |
| 01/10 | entrada | 300,00 | N10127 | N11B01 | `bd34c247` | `31db5fa2` |
| 01/10 | entrada | 294,00 | N1017F | N11B59 | `b5f6f0cc` | `d3d73624` |
| 01/10 | entrada | 14,60 | N1013D | N11B17 | `272c939c` | `c5ccc033` |
| 02/10 | entrada | 4.500,00 | N1022F | N11C2F | `35291ee7` | `e2aedd98` |
| 02/10 | saída | 4.138,00 | N102DD | N11CDD | `c3b7a8fd` | `b2c81d1c` 📎 |
| 02/10 | saída | 1.923,00 | N10309 | N11D09 | `e9174f77` | `ea629633` 📎 |
| 02/10 | saída | 1.875,00 | N102F3 | N11CF3 | `e1b9345a` | `f581a8f7` 📎 |
| 02/10 | saída | 1.630,00 | N1034B | N11D4B | `f98b8b8a` | `fb67de76` 📎 |
| 02/10 | entrada | 1.000,00 | N1029D | N11C9D | `281254ac` | `2edd037b` |
| 02/10 | saída | 760,00 | N10335 | N11D35 | `4b635f2c` | `67176c5e` 📎 |
| 02/10 | saída | 600,00 | N10361 | N11D61 | `4248f74c` | `7417fa90` 📎 |
| 02/10 | entrada | 470,00 | N1025B | N11C5B | `d0775eb6` | `c3f16ce8` |
| 02/10 | entrada | 400,00 | N10287 | N11C87 | `28e4bb58` | `511b8296` |
| 02/10 | entrada | 300,05 | N10245 | N11C45 | `9391e610` | `21480063` |
| 02/10 | entrada | 219,00 | N10219 | N11C19 | `1737226e` | `b53fce6c` |
| 02/10 | entrada | 200,00 | N10271 | N11C71 | `41730edd` | `2619966e` |
| 05/10 | entrada | 1.500,00 | N104ED | N11E53 | `59e30ba5` | `ecea67e7` |
| 05/10 | entrada | 1.300,00 | N103E5 | N11DA3 | `aee79117` | `07c690fc` |
| 05/10 | entrada | 1.000,00 | N10411 | N11DCF | `1294915f` | `e540c092` |
| 05/10 | entrada | 830,00 | N10377 | N11F9B | `bee57171` | `081f28d4` |
| 05/10 | entrada | 637,00 | N104C1 | N11E27 | `6396426a` | `36868f64` |
| 05/10 | saída | 291,31 | N1059D | N11F2D | `57764b56` | `b404b041` 📎 |
| 05/10 | saída | 278,22 | N105B3 | N11F17 | `237aa538` | `9919551e` 📎 |
| 05/10 | entrada | 155,00 | N10453 | N11F85 | `a688e90e` | `909613c0` |
| 05/10 | entrada | 152,00 | N103A3 | N11D77 | `43c1be34` | `89d0524b` |
| 05/10 | saída | 114,72 | N105C9 | N11F03 | `cbbd3343` | `9912111b` |
| 05/10 | entrada | 100,00 | N1055B | N11EC1 | `c880068b` | `eba80457` |
| 05/10 | entrada | 65,00 | N1043D | N11F6F | `12e8fda8` | `10eda10d` |
| 05/10 | entrada | 10,00 | N10545 | N11EAB | `a9551825` | `21b520ee` |
| 05/10 | entrada | 5,00 | N10503 | N11E69 | `29a5a040` | `50abca4f` |

### Precisam de revisão (19)

| Dia | Sentido | Valor | FITID hoje | FITID antigo | Lançamento de hoje | Lançamento antigo | Diferença |
|---|---|---|---|---|---|---|---|
| 01/10 | entrada | 1.040,00 | N101C1 | N11B9B | `ef8f78c0` | `413dcccb` | centro de custo difere; favorecido só no antigo |
| 01/10 | entrada | 220,00 | N10153 | N11B2D | `72713b26` | `7ff859c1` | favorecido só no antigo |
| 01/10 | entrada | 220,00 | N10169 | N11B43 | `bb25d795` | `0e6ba094` | favorecido só no antigo |
| 01/10 | entrada | 70,00 | N101AB | N11B85 | `da7ed3e1` | `45603cc7` | categoria: antigo Ofertas × hoje Dízimos |
| 01/10 | saída | 9,80 | N101ED | N11BC7 | `11345914` | `aa971213` | centro de custo difere |
| 02/10 | saída | 9,80 | N102C7 | N11CC7 | `67df572a` | `8381e8f3` | centro de custo difere |
| 02/10 | entrada | 0,03 | N102B3 | N11CB3 | `35e6ad5b` | `dd0b6adf` | centro de custo difere; favorecido só no antigo |
| 05/10 | entrada | 650,00 | N103FB | N11F43 | `8d0470f4` | `bed3f176` | favorecido só no antigo |
| 05/10 | entrada | 650,00 | N1038D | N11DB9 | `c6bbbd8e` | `6463080c` | favorecido diferente |
| 05/10 | entrada | 400,00 | N104D7 | N11E3D | `d61d60b9` | `b31904b7` | favorecido diferente |
| 05/10 | entrada | 150,00 | N10571 | N11F59 | `e0eae38f` | `847b1f82` | favorecido diferente |
| 05/10 | entrada | 150,00 | N103B9 | N11ED7 | `e7a00b6c` | `c2550e76` | favorecido diferente |
| 05/10 | entrada | 138,00 | N103CF | N11D8D | `611e30db` | `add301e1` | favorecido diferente |
| 05/10 | entrada | 50,00 | N10519 | N11E95 | `afe2ab03` | `d4e8659f` | categoria: antigo Dízimos × hoje Ofertas; favorecido só no antigo |
| 05/10 | entrada | 50,00 | N1052F | N11E7F | `b2a07be8` | `ce29342a` | favorecido só no de hoje |
| 05/10 | entrada | 20,00 | N10427 | N11DFB | `9720cc07` | `2487c725` | favorecido diferente |
| 05/10 | entrada | 20,00 | N10495 | N11EED | `84dba016` | `0203d57a` | favorecido diferente |
| 05/10 | entrada | 20,00 | N10469 | N11DE5 | `f1f8bf46` | `e9062079` | categoria: antigo Dízimos × hoje Ofertas; favorecido diferente |
| 05/10 | entrada | 20,00 | N10587 | N11E11 | `39d6f47e` | `cac8fe80` | favorecido diferente |

## Como eu trataria (aguardando o OK dela)

1. **Os 33 certos:** apagar só o lançamento de hoje, por script com ensaio `BEGIN … ROLLBACK` e conferência de contagem (esperado: o sistema volta a ter o mesmo número de movimentos do extrato por dia/valor/sentido).
2. **Os 19 de revisão:** para cada um, ela diz qual classificação vale; eu **copio** para o lançamento antigo o que faltar (favorecido, categoria, centro) e só então apago o de hoje. Os 8 "favorecido diferente" quase todos são PIX de valor repetido no dia, onde o par do pareamento pode estar trocado: ali vale olhar o favorecido de cada um.
3. **A transferência de R$ 250,00:** desfazer a de hoje pela tela de transferência (as duas pernas).
4. Depois da limpeza: o líquido do Bradesco em 01–19/10 deve ser **−R$ 2.040,42** (−R$ 4.606,02 do extrato + R$ 2.565,60 das duas transferências do PDF do Invest Fácil). A conta fecha: hoje o sistema marca **+R$ 4.139,76**; a diferença de R$ 6.180,18 é exatamente a soma líquida das 52 cópias (R$ 5.930,18) mais a transferência duplicada de R$ 250,00.
