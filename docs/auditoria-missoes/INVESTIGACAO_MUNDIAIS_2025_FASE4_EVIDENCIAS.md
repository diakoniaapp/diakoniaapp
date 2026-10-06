# Mundiais 2025 — fase 4: consolidação e os R$ 2.240,81 restantes

Levantamento de **06/10/2026**, somente leitura. **Sem ajuste, sem compensação, sem saldo artificial, sem reclassificação automática.**
Continua [a fase 3](INVESTIGACAO_MUNDIAIS_2025_FASE3_MARCA_010.md). Ofertantes identificados só por id.

## 1. Decisões dela registradas (06/10/2026)

| Tema | Decisão |
|---|---|
| Ajuste histórico de R$ 12.032,69 | segue **desativado**; trabalha-se só com o **saldo registrado** |
| Marca ",10" | **convenção real da tesouraria**, válida **só para Pix**. Fora: espécie, envelope, TED, DOC, transferência interna |
| Marca ",01" | **não é convenção**. Fica só como observação, sem reclassificação |
| Auditoria "⚠ Possível oferta missionária" | **aprovada e implementada** (só sinaliza; não bloqueia, não reclassifica, não grava) |
| 4 Pix de alta confiança | **confirmados**; migration preparada para revisão (`20261006240000_missoes_pix_marca_010_alta_confianca.sql`), **não aplicada** |
| JMN 12/07/2024 · R$ 10.327,58 | **mantido como está**: classificação provisória aguardando validação da JMN. Hipótese **H-001** já registrada em [REGISTRO_DE_HIPOTESES.md](REGISTRO_DE_HIPOTESES.md) (Nacionais 2023, confiança média) |
| 2023 | nenhuma reconstrução, estimativa ou saldo anterior inventado |

## 2. Os números — o banco hoje × depois de cada passo

**Estado real do banco hoje:** as migrations `…210000`, `…220000` e `…230000` **ainda não foram aplicadas** (medido: o projeto Cristolândia não existe; Envio Oficial
= 162.217,89). Por isso há três colunas:

| | Banco hoje | Depois das 3 migrations aprovadas | Depois desta (4 Pix) |
|---|---|---|---|
| Entradas do Fundo (histórico arrecadado) | 145.947,09 | 146.187,27 | **149.337,67** |
| Envio Oficial (repasses) | 162.217,89 | 157.167,89 | 157.167,89 |
| **Saldo registrado do Fundo** | **−16.270,80** | −10.980,62 | **−7.830,22** |
| Esforço Total (Envio + Sustento + Mobilização) | 195.882,14 | 237.595,22 | 237.595,22 |

O Esforço Total **não muda** com esta migration: ela só move receita para o fundo.

**Razão do fundo por edição, depois de tudo** (cada linha é arrecadado − enviado naquela campanha):

| Edição | Saldo |
|---|---|
| Antes do Omie (H-001, JMN 12/07/2024) | −10.257,58 |
| Mundiais 2024 | −1.705,11 |
| Nacionais 2024 | **+370,16** *(era +320,06; +50,10 do Pix de 25/09/2024)* |
| **Mundiais 2025** | **−2.240,81** *(era −5.341,11)* |
| Nacionais 2025 | +36,15 |
| Mundiais 2026 | +1.926,87 |
| Nacionais 2026 | +4.040,10 |
| **Soma = saldo registrado** | **−7.830,22** |

Do que resta de negativo, **−14.203,50** são três pontas abertas: H-001 (−10.257,58), Mundiais 2024 (−1.705,11) e Mundiais 2025 (−2.240,81).

**Mundiais 2025 hoje no banco** (sem as migrations): arrecadado 29.718,89 (inclui R$ 60,00 de bazar que a `…230000` tira), diferença −5.281,11. Com a `…230000`: 29.658,89
e −5.341,11; com os 3 Pix: −2.240,81.

## 3. Como os R$ 2.240,81 se dividem

| Remessa | Valor | Arrecadado no período | Diferença | Depois dos 3 Pix |
|---|---|---|---|---|
| Boleto de 22/07/2025 | 34.216,42 | 29.658,89 | 4.557,53 | **1.457,23** |
| Boleto de 19/09/2025 | 783,58 | — | 783,58 | **783,58** |
| **Total** | **35.000,00** | | **5.341,11** | **2.240,81** |

## 4. Evidências encontradas (desta fase)

**E1 — Os dois pagamentos são boletos ("PAGTO ELETRON COBRANCA") e os valores contam uma história.**
O de 19/09 vale **exatamente o que falta para R$ 35.000,00** (34.216,42 + 783,58) e o texto do banco diz *"ALVO DE MISSÕES | CAMPANHA MISSÕES MUNDIAIS 2025"*:
**R$ 35.000,00 foi um alvo**. Já o de 22/07, com centavos "quebrados" (,42), **parece uma contagem**, não um valor-alvo. Nos Nacionais a igreja também enviou valores quebrados
(ex.: 4.493,56) e o sistema concordou com a contagem dela por poucos reais (+36,15 e +370,16). *Isto é inferência pelos dados, não prova:* aponta que a tesouraria **contou** R$ 4.557,53 a mais do que o
sistema tinha na categoria de missões, e não que "completou" com o caixa geral.

**E2 — A Feira das Nações 2025 foi em 07 e 08/06/2025.** Mais de 40 lançamentos pequenos de 09/06 trazem o sufixo de data "0706"/"0806" na descrição, e a **Cielo** liquidou cinco repasses entre 09 e 10/06
(somados, R$ 6.805,36). O fundo recebeu R$ 5.379,72 em 09/06 e R$ 3.073,35 em 10/06 — esses dois dias são a feira.
*(Desde o relatório da fase 2 o fundo já contava a feira; o que é novo é a data exata.)*

**E3 — Um depósito em dinheiro de R$ 800,00 no caixa eletrônico, em 09/06/2025 (a segunda-feira depois da Feira), lançado fora do fundo como "Ofertas não identificadas".**
É o **único depósito em dinheiro** no Bradesco entre 31/12/2024 e 22/07/2025. É um achado de **documento a verificar** (o comprovante do depósito diz de onde veio o dinheiro). A convenção ",10" não se aplica
(é espécie), então **não é candidato pela regra**; é só uma pista. *Se* fosse da Feira, a diferença restante cairia para R$ 1.440,81 — **condicional, não aplicado**.

**E4 — As ofertas do fundo depois de 22/07 não explicam os R$ 783,58.** Entre 23/07 e 19/09/2025 entraram R$ 445,92 no fundo (R$ 426,10 depois do bazar que a `…230000` tira): menos da metade.

**E5 — Nenhuma decisão registrada no sistema.** A tabela de metas de campanha (`fin_metas_campanha`) está **vazia**; reuniões, decisões e solicitações já estavam vazias. Nos arquivos locais há só o
*Cartaz Oficial JMM* e o fundo de PowerPoint da *Campanha 26* (2026): **nenhuma carta, boleto-proposta ou material da JMM de 2025**.

**E6 — O texto da remessa de 19/09 contradiz o banco.** A descrição gravada é *"Campanha de Missões Nacionais"*, mas o texto do banco diz *"MISSOES MUNDIAIS 2025"* e o campo de campanha está
`mundiais`. Já era conhecido (a descrição acompanha a estação do ano, não a campanha) e **não muda nenhum número**.

## 5. Hipóteses ainda abertas (nenhuma registrada; nenhuma aplicada)

| | Hipótese | A favor | Contra / limite | O que fecha |
|---|---|---|---|---|
| a | O boleto de 22/07 foi a **contagem da tesouraria** e R$ 1.457,23 são ofertas **em dinheiro ou outras** que não chegaram à categoria de missões | centavos quebrados (E1); Feira (E2); depósito de R$ 800,00 (E3) | sem documento; espécie não tem marca | fechamento da Feira das Nações; contagem de envelopes; comprovante do depósito |
| b | Os R$ 783,58 de 19/09 foram um **complemento até o alvo de R$ 35.000,00** com dinheiro do caixa geral | valor = exatamente o que falta (E1); texto "ALVO" | as ofertas pós-22/07 (R$ 426,10) cobrem parte; não dá para separar | carta/decisão da JMM ou da diretoria sobre o alvo |
| c | Os dois Pix de média/baixa confiança de Mundiais 2025 (178,10 e 142,10) também são missões | convenção ",10" | o de 142,10 está dentro da faixa de dízimo do doador | comprovante com a "mensagem do pagador" |
| d | O Dízimo de R$ 1.630,01 por TED em 18/06/2025 | — | ",01" **não é convenção** e TED foi excluído; **fica só como observação** | — |

**Ordem de utilidade dos documentos:** (1) comprovante do depósito de 09/06/2025 e fechamento da Feira das Nações 07–08/06/2025; (2) carta/boleto-proposta da JMM de 2025 e a decisão do alvo
de R$ 35.000,00; (3) contagem dos envelopes de maio–julho/2025; (4) comprovantes Pix dos itens de média/baixa confiança.

## 6. O objetivo final: onde cada coisa mora

| Conceito | Onde fica | Estado |
|---|---|---|
| **Fundo Missionário** | categoria *Ofertas para Missões* − *Repasses Missionários* | −7.830,22 depois das migrations; as 3 pontas abertas estão acima |
| **Campanhas** | campo `campanha_missionaria` (ano pela data) | 4 Pix entram aqui com a migration desta fase |
| **Sustento Missionário** | subcentro *… · Sustento Missionário*, fora do fundo | R$ 79.292,93 depois das migrations |
| **Mobilização Missionária** | subcentro *… · Mobilização Missionária* | R$ 1.134,40 |
| **Projetos** | `fin_projetos.missionario` (Cristolândia) | R$ 5.050,00 depois da `…230000` |
