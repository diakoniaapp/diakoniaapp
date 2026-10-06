# Governança Missionária — QIBRJ

**Documento final da auditoria do Fundo Missionário** · versão 1.0 · 06/10/2026 · **para revisão e aprovação da Tesouraria**.
Escrito para quem assumir a tesouraria depois: **seguindo estas regras, não é preciso repetir a auditoria.**
Todo número citado foi medido no banco de produção; onde algo não é certo, está escrito.

> **Como usar.** Leia as seções 1 a 3 uma vez. Depois, consulte pela necessidade: uma oferta chegou (§5, §6), uma remessa saiu (§7, §8, §9), vai começar uma campanha (§10), algo não bate (§4).
> Cada regra tem um código para ser citada em decisões e atas: **C** classificação · **A** auditoria · **P** Pix ",10" · **K** Cristolândia · **J** JMM · **N** JMN.

**Índice** · 1 Estrutura · 2 Campo Campanha · 3 Classificação · 4 Auditoria · 5 Pix ",10" · 6 Cristolândia · 7 JMM · 8 JMN · 9 Procedimento de campanhas · 10 Estado de referência e pontos em aberto · 11 Onde está cada coisa

---

## 1. Estrutura aprovada

### 1.1 Centro e subcentros

| Nível | Nome no sistema | Para que serve |
|---|---|---|
| **Centro** | **Min. Evangelismo e Missões** | O ministério. Recebe as ofertas missionárias e os gastos que não são nenhuma das três naturezas abaixo (panetones, doações genéricas) |
| Subcentro | **Evangelismo e Missões · Sustento Missionário** | Investimento **próprio** da igreja em quem está no campo: prebenda do pastor missionário, parcerias mensais, sustentados. **Fora do Fundo** |
| Subcentro | **Evangelismo e Missões · Envios Missionários** | O **Envio Oficial**: remessas de campanha às Juntas |
| Subcentro | **Evangelismo e Missões · Mobilização Missionária** | Conferências, preletores, Feira das Nações, banner, segurança e suporte de evento |

*(No sistema o nome do centro é "Min. Evangelismo e Missões".)*

**Centros antigos:** *Missões Mundiais* e *Ofertas Missionárias* seguem **ativos só porque ainda guardam entradas históricas**; *Missões Nacionais* e *Pastor Missionário* estão **inativos**. **Não lançar nada novo nos quatro.** O que era saída neles foi movido para os três subcentros novos.

### 1.2 As cinco contas (e só elas)

| Conta | Fórmula | Observação |
|---|---|---|
| **Fundo Missionário** | ofertas para missões − Envio Oficial | É um **razão**, não uma conta bancária. O dinheiro da igreja mora todo junto na Caixa de Aplicação |
| **Envio Oficial** | saídas da categoria **Repasses Missionários** | Só remessa de campanha a Junta |
| **Sustento** | saídas do subcentro Sustento Missionário | Fora do Fundo |
| **Mobilização** | saídas do subcentro Mobilização Missionária | Fora do Fundo; **entra** no Esforço Total |
| **Esforço Total** | Envio Oficial + Sustento + Mobilização | O que a igreja realmente investiu em missões |

**C-01.** Cada lançamento entra em **uma só** dessas contas. Se aparecer em duas, o Envio Oficial manda.
**C-02.** O Fundo mostra sempre o **Saldo registrado** (só o que está no banco). Existe também o *Saldo ajustado* (com ajustes gerenciais), mas **o oficial é o registrado** — ver A-01.

---

## 2. O campo "Campanha missionária"

Campo do lançamento (`fin_lancamentos.campanha_missionaria`), aparece no formulário para a categoria *Ofertas para Missões* e para os repasses.

| Valor | Aparece como | Quando |
|---|---|---|
| `mundiais` | Missões Mundiais | oferta ou remessa da campanha da **Junta de Missões Mundiais** |
| `nacionais` | Missões Nacionais | oferta ou remessa da campanha da **Junta de Missões Nacionais** |
| `especial` | **Campanha avulsa** | oferta pontual que não é nenhuma das duas *(a Junta chama a oferta de Mundiais de "Dia Especial")* |
| *vazio* | — | nenhuma campanha: despesa comum ou oferta ainda **sem classificar** |

**Regras do campo**

- **C-03. O ano da campanha é o ano da DATA do lançamento.** Não existe campo de ano nem cadastro por exercício. *Limite conhecido:* parcela paga com atraso cai no ano do pagamento; a proposta de um campo "Ciclo Missionário" (§10) **não foi implementada**.
- **C-04. A campanha de uma REMESSA vem da Junta de destino (o fornecedor)**, nunca da descrição nem do centro. Medido: em 5 das 13 remessas a descrição e o centro do Omie estavam trocados. A descrição acompanha a **estação do ano** (jan–ago "Mundiais", set–dez "Nacionais") e **não informa nada**.
- **C-05. A campanha de uma OFERTA segue o ciclo:** ela pertence à campanha da **próxima remessa que fecha o ciclo**. Uma remessa **≥ R$ 20.000,00 fecha o ciclo**; as menores são **complementos** do mesmo ciclo. Depois da última remessa que fechou, a campanha **aberta** é a **oposta** (Mundiais fechou → abre Nacionais). A prática da igreja: Mundiais no 1º semestre, Nacionais no 2º.
- **C-06. A classificação em lote é só sugestão.** "Ofertas missionárias sem classificação → Classificar em lote" propõe a campanha pelo ciclo; **nada é gravado sem a confirmação da tesouraria.**
- **C-07. Campanhas NÃO são projetos.** Não se cria projeto por campanha nem por ano.
- **C-08. Metas** ficam em *Metas de campanha* (campanha + ano + valor). *Hoje a tabela está vazia*: a meta de 2026 citada pela tesouraria (Mundiais R$ 30.000; Nacionais R$ 20.000) **ainda não foi registrada**.

---

## 3. Regras de classificação

### 3.1 O que fazer com cada lançamento

| Lançamento | Categoria | Centro | Campanha | Projeto | Entra em |
|---|---|---|---|---|---|
| **Oferta missionária** (Pix ",10", envelope, Feira, alvo das classes) | Ofertas para Missões | Min. Evangelismo e Missões *(ou vazio)* | pelo ciclo (C-05) | — | **Fundo (+)** |
| **Remessa de campanha** a JMM ou JMN | Repasses Missionários | Envios Missionários | pelo **fornecedor** (C-04) | — | **Envio Oficial (−)** |
| **Prebenda** do pastor missionário | Prebenda | Sustento Missionário | — | — | Sustento |
| **Parceria mensal** (R$ 300 à JMN) | Doações e Contribuições | Sustento Missionário | — | — | Sustento |
| **Oferta ao preletor** missionário | Ofertas à Preletores | Mobilização Missionária | — | — | Mobilização |
| **Despesa de evento** (Feira, banner, segurança, suporte) | a da natureza do gasto | Mobilização Missionária | — | — | Mobilização |
| **Panetones** (Cristolândia) | Doações e Contribuições | Min. Evangelismo e Missões | **vazio** | **Cristolândia** | Projetos *(fora do Fundo e do Esforço)* |
| **Revistas e materiais comprados da Junta** (nota fiscal) | Material de Consumo | centro de quem consome (ex.: Educação Cristã) | vazio | — | nada de missões |
| **Bazar e almoços** de ministérios | Ofertas | centro do ministério dono | — | — | **fora do Fundo** |
| **Dízimos** | Dizimos | Min. Administração | — | — | nunca é missões *(exceto Pix ",10" confirmado — §5)* |

### 3.2 Regras

- **C-09. Receita não exige subcentro** (basta categoria + centro). **Despesa** que cai no centro-pai sem subcentro gera só uma *atenção* no Fechamento, nunca um bloqueio.
- **C-10. Pagamento a uma Junta NÃO é automaticamente Envio Oficial.** Só é Envio Oficial a **remessa de campanha**. Nota fiscal de material é consumo; parceria mensal é Sustento; panetone é projeto. *(Foi o erro mais caro da auditoria: R$ 337 e R$ 5.050 estavam no Envio Oficial.)*
- **C-11. Bazar é receita do ministério dono, não oferta missionária.** A igreja faz bazares de vários ministérios (Ornamentação, Famílias, Administração, Missões…); todos entram como *Ofertas* com o centro do ministério. O "bazar de missões" também **não** entra no Fundo.
- **C-12. Feiras de missões entram no Fundo:** a **Feira das Nações (junho)** na campanha Mundiais; a **feira de novembro (Feira das Regiões)** na campanha Nacionais. Cartão (Cielo), Pix de venda e dinheiro da feira são *Ofertas para Missões*. As **despesas** da feira vão para Mobilização. *Atenção ao nome:* em novembro/2024 a receita foi lançada como "Feira das Regiões" e duas compras de papelaria como "Feira das Nações 2024" — **o que vale é a data da feira**, não o rótulo.
- **C-13. Ofertas "alvo" das classes da EBD** (anotação "ALVO DE MISSÕES | CLASSE …") são *Ofertas para Missões*.
- **C-14. Depósito em dinheiro sem origem** ("Ofertas não identificadas") **fica em Ofertas**. Só vai para missões com **documento** (§4, A-03).
- **C-15. Transferência entre contas** (Caixa de Envelopes → Bradesco etc.) não é receita, despesa nem oferta: não entra em nenhuma conta de missões.

---

## 4. Regras de auditoria

### 4.1 Princípios

- **A-01. O oficial é o Saldo registrado.** Não se cria ajuste, compensação, saldo artificial nem estimativa para "fechar a conta". Há **um** ajuste no sistema — R$ 12.032,69, "Primeiro ciclo de 2024: campanhas anteriores ao Omie" — e está **desativado** (desativa-se, nunca se apaga; é reversível pela tela *Ajustes*). Enquanto houver ajuste ativo, o painel mostra o alerta "Histórico parcialmente incompleto".
- **A-02. Não se reconstrói o que não tem documento.** A igreja não possui histórico confiável anterior a 2024. **Nada de saldo de 2023 inventado.** Um saldo auditável e explicável vale mais do que um saldo "corrigido" sem prova.
- **A-03. Só se reclassifica com prova.** Aceitam-se como prova: **comprovante, documento, mensagem Pix do pagador, ata, relatório, fechamento de campanha ou documento da Junta**. "Parece" e "faz sentido" não bastam.

### 4.2 A pergunta antes de qualquer ajuste

Responder **A–E**. **Qualquer "sim" → corrigir por reclassificação, não por ajuste:**

| | Pergunta |
|---|---|
| A | É **erro de classificação**? |
| B | É **projeto**? |
| C | É **sustento**? |
| D | É **campanha**? |
| E | Existe **documento ou evidência operacional** que comprove? |

### 4.3 Hipóteses sem prova

- **A-04.** Uma hipótese **não cria ajuste, não altera saldo, não reclassifica e não gera compensação.** Registra-se em `docs/auditoria-missoes/REGISTRO_DE_HIPOTESES.md` com **estado**, **confiança** e **o documento que a fecha**. Só a chegada do documento muda o estado.
- **A-05. Caso aberto: H-001.** Lançamento de 12/07/2024, R$ 10.327,58 à JMN, origem provável *Campanha Missões Nacionais 2023*, confiança **média**. **Tratamento:** mantido como está — *classificação provisória aguardando validação da JMN*. Se a JMN mostrar outro destino (projeto, parceria), **reclassifica-se**; não se ajusta.

### 4.4 Alertas do sistema (todos só sinalizam)

| Alerta | Onde | Regra |
|---|---|---|
| **⚠ Possível oferta missionária** | Fechamento (etapa 2) e *Abrir Correções* | §5. **Não** bloqueia, **não** reclassifica, **não** grava |
| **Ofertas missionárias sem classificação** | Indicadores Missionários | Mostra quantas ofertas estão sem campanha, com o botão *Classificar em lote* |
| **Histórico parcialmente incompleto** | Fundo Missionário | Aparece enquanto houver ajuste ativo |

### 4.5 Como alterar dados em lote (migrations)

- **A-06.** Toda correção em lote é uma migration **guardada por id + valor + estado antigo**: rodar de novo não faz nada, e uma **verificação final desfaz tudo** se o resultado não for o auditado.
- **A-07.** **Ensaiar sempre** dentro de `BEGIN; … ROLLBACK;` antes de gravar e **conferir os números na tela** depois. O script `scripts/copiar-migration.ps1 <número> [-Ensaio]` copia a migration para colar no SQL Editor.
- **A-08.** Lançamento corrigido leva uma **tag** em `observacoes` (`[auditoria-missoes <data>] …`), para sempre se saber o que foi mexido e por quê.
- **A-09.** Documentos de auditoria **não citam nome de ofertante** (dado pastoral): usam o id do lançamento.

### 4.6 Rotina

| Quando | O que conferir |
|---|---|
| **Todo mês** (Fechamento) | Alerta *Possível oferta missionária*; categoria/centro de toda entrada e saída de missões; remessas do mês com **campanha** preenchida |
| **Toda remessa** | Fornecedor = a Junta certa; campanha = a da Junta; **anexar o boleto/comprovante** ao lançamento |
| **Todo encerramento de campanha** | Razão da campanha (arrecadado − enviado). Se houver diferença, investigar na ordem do §9 (passo 8), com documento |
| **Todo ano** | Pedir à JMM e à JMN o **extrato de contribuições por destino** e conferir ao centavo contra as remessas |

---

## 5. Regras para Pix ",10"

**A convenção:** a tesouraria soma **R$ 0,10** ao valor de uma oferta missionária recebida por Pix para identificá-la (500,10 · 600,10 · 1.500,10 · 2.000,10). É **informação operacional da igreja**, não coincidência (no Fundo, 13% a 38% das entradas terminam em ",10"; nos Dízimos, 0,5%).

- **P-01. Vale só para PIX recebido.** **Não** vale para: espécie, envelope, **TED**, **DOC**, transferência interna, repasse de maquininha (Cielo, Getnet, PagSeguro).
- **P-02. ",01" não é convenção.** Valores terminados em ",01" ficam só como observação, **sem reclassificação**.
- **P-03. A auditoria "⚠ Possível oferta missionária"** dispara quando um **Pix recebido termina em ",10" e a categoria não é Ofertas para Missões** (nem repasse). Ignora transferências, rendimentos, valores até R$ 1,10 e maquininha. **Só sinaliza.**
- **P-04. A convenção diz como o doador costuma marcar; não prova o que ele quis em um Pix específico.** Por isso a regra **nunca reclassifica sozinha**: a pessoa abre o lançamento (botão *Revisar*) e decide.
- **P-05. Como pesar um alerta** (foi assim que se classificou):
  - **Alta:** o valor destoa do dízimo habitual do doador **e** o doador já marca ",10" nas ofertas para missões.
  - **Média:** destoa do habitual, mas **sem histórico** do doador.
  - **Baixa:** valor dentro da faixa do dízimo do doador (provável dízimo); **texto do Pix contradiz** ("REFORMA CANTINA"); valor fixo de **QR code estático**.
- **P-06. Confirmação.** Reclassifica-se com **comprovante Pix (mensagem do pagador)** ou com **decisão registrada da tesouraria**; a reclassificação leva a tag do A-08 e a campanha do ciclo (C-05).
- **P-07. Texto explícito vence a convenção.** Se o próprio Pix diz outra finalidade, **fica onde está**.

**Situação em 06/10/2026:** 4 Pix confirmados e reclassificados (R$ 3.150,40). Seguem **sem reclassificar**: 2 de média confiança (R$ 805,20) e 6 de baixa (R$ 817,60) — detalhe em `docs/auditoria-missoes/INVESTIGACAO_MUNDIAIS_2025_FASE3_MARCA_010.md` (§6).

---

## 6. Regras para Cristolândia

**O que é:** projeto da Junta de Missões Nacionais. Todo dezembro os membros **encomendam e pagam** panetones à igreja (~R$ 25 a unidade); a igreja **repassa** o valor à JMN.

- **K-01.** Existe **um projeto só**, chamado **Cristolândia**, **sem ano no nome**, marcado como *missionário* (`fin_projetos.missionario`).
- **K-02. A receita** dos membros continua em **Ofertas**, fora do Fundo.
- **K-03. O pagamento à JMN** é: categoria **Doações e Contribuições**, projeto **Cristolândia**, centro **Min. Evangelismo e Missões**, **campanha vazia**, descrição verdadeira ("Panetones Cristolândia — repasse à Junta de Missões Nacionais").
- **K-04. Não é Envio Oficial nem campanha.** Fica **fora do Fundo e do Esforço Total** e aparece na área **Projetos** do painel (execução hoje: R$ 5.050,00 = 4.050,00 de 19/12/2024 + 1.000,00 de 10/12/2025).
- **K-05.** O boleto da JMN é de **oferta voluntária** e **não traz campanha**: quem decide é a igreja, e a decisão é a do K-03.
- **K-06.** Outros projetos missionários (Carreta, Radicais): **mesmo molde** — um projeto, sem ano, `missionario = verdadeiro`.

---

## 7. Regras para a JMM (Junta de Missões Mundiais)

**No sistema:** fornecedor *Junta de Missoes Mundiais da Conv Batista Brasileira*.

- **J-01.** Toda remessa à JMM é **campanha `mundiais`**, categoria *Repasses Missionários*, centro *Envios Missionários*.
- **J-02.** A JMM **confirma** as suas contribuições: as 4 remessas de 2024–2025 foram conferidas **ao centavo** contra o histórico que ela enviou (boletos com 1 a 3 dias de diferença; nenhuma ausente ou duplicada).
- **J-03. Forma de pagamento:** em 2024 as remessas foram por **Pix**; de dezembro/2024 em diante, por **boleto** ("PAGTO ELETRON COBRANCA").
- **J-04. Remessa maior ou igual a R$ 20.000,00 fecha o ciclo Mundiais; as menores são complemento** (ex.: R$ 783,58 de 19/09/2025, "ALVO DE MISSÕES", que completa exatamente R$ 35.000,00 com os R$ 34.216,42 de 22/07/2025).
- **J-05. Alvo.** Quando a igreja fecha em valor redondo, **registrar o documento da decisão do alvo** (carta/boleto-proposta da JMM, ata). Em 2025 o complemento prova que houve um alvo de R$ 35.000,00, mas **não há documento** dele.
- **J-06. Pendente de validação:** a remessa de 07/07/2026 (R$ 26.660,23) **ainda não foi confirmada pela JMM**; a JMM não cobre 2026.

---

## 8. Regras para a JMN (Junta de Missões Nacionais)

**No sistema:** fornecedor *Junta de Missoes Nacionais da Conv Batista Brasileira*. **A JMN recebe quatro tipos de pagamento, e cada um tem classificação própria:**

| O que é | Como identificar | Classificação |
|---|---|---|
| **Campanha anual de Nacionais** | boleto/Pix "REPASSE CAMPANHA JMN" ou remessa grande | **Repasses Missionários** · Envios · campanha `nacionais` |
| **Parceria mensal (PAM)** | boleto de **R$ 300,00** por mês | **Doações e Contribuições** · **Sustento Missionário** |
| **Projeto** (Cristolândia, Carreta, Radicais) | panetones, ofertas de projeto | **Projeto** (§6) — fora do Fundo |
| **Material** (nota fiscal) | NF-e de revistas/publicações | **Material de Consumo** no centro que consome |

- **N-01. O boleto da JMN é "oferta voluntária": a campanha é decisão interna**, não vem do comprovante. **Registrar a decisão** (quem decidiu, quando) no lançamento.
- **N-02. Casos já decididos:** R$ 5.000,00 (27/02/2025) e R$ 4.493,56 (27/05/2025) = **Nacionais 2024**, parcelas depois da remessa principal; com elas o ciclo Nacionais 2024 fecha no centavo. R$ 337,00 de 08/07/2025 = **NF-e 83744** (17 revistas *Visão Missionária 3T25*) = **consumo**, não remessa.
- **N-03. Ponto a confirmar com a JMN:** os pagamentos mensais de R$ 300 aparecem com a descrição **"Carreta Missionária"** e são tratados como **parceria (Sustento)**. Se o extrato da JMN mostrar que são o **projeto Carreta**, passam para **Projetos** (K-06) — por **reclassificação**, nunca por ajuste.
- **N-04. Documento pendente:** o **extrato da JMN por destino (2023–2025)** resolveria a H-001 (R$ 10.327,58) e conferiria as remessas de 2024–2026: **diferente da JMM, a JMN ainda não confirmou nenhuma delas**. Pedir à JMN.

---

## 9. Procedimento para futuras campanhas

**Antes**
1. **Registrar a meta** em *Metas de campanha* (campanha + ano + valor) e **guardar o documento** (carta da Junta, ata). *Sem meta registrada, o painel não calcula percentual.*
2. **Confirmar a campanha aberta** (C-05) para saber o que sugerir às ofertas novas.

**Durante**
3. **Receber:** toda oferta missionária entra em **Ofertas para Missões**; Pix com a marca **",10"** (§5); envelopes no *Caixa de Envelopes*; vendas de feira por cartão/Pix/dinheiro (C-12).
4. **Classificar a campanha** no formulário (sugestão: a aberta) ou depois, no *Classificar em lote*, **com confirmação**.
5. **Eventos:** receitas de feira no Fundo; **despesas de feira em Mobilização**; bazar e almoço **fora** do Fundo (C-11). **Registrar o fechamento do evento** (receitas e despesas) por escrito — em 2025 a Feira das Nações **não tinha nenhuma despesa lançada como Feira**, e isso impediu fechar a conta.

**Remessa**
6. **Registrar a remessa:** fornecedor = Junta; categoria *Repasses Missionários*; centro *Envios*; **campanha pelo destino** (C-04); **anexar o boleto/comprovante**. Se for **complemento** (< R$ 20.000), registrar o motivo ("complemento para o alvo de R$ X").
7. **Valor redondo = decisão.** Documentar quem decidiu enviar mais ou menos do que o arrecadado (J-05).

**Fechamento da campanha**
8. **Conferir o razão da campanha** (arrecadado − enviado). **Se não bater**, investigar nesta ordem, **sempre com documento**:
   1. Pix ",10" fora de missões (alerta do §5);
   2. ofertas sem campanha (*Classificar em lote*);
   3. receitas do evento (fechamento da feira);
   4. depósitos em dinheiro e contagem de **envelopes**;
   5. valor-alvo decidido (complemento);
   6. extrato da Junta por destino.
   Nada de ajuste: se a diferença for **complemento do caixa geral por decisão**, **documentar a decisão**.
9. **Arquivar:** carta/boleto da Junta, decisão do alvo, fechamento da feira, contagem de envelopes e o **extrato da Junta** do ano.

**Campanha nova** (que não é Mundiais nem Nacionais)
10. Se for **pontual:** usar **Campanha avulsa** (`especial`) e descrever no lançamento. Se for **recorrente:** o campo só aceita os três valores — **pedir ao desenvolvimento** para acrescentar o novo valor (exige alterar a restrição do banco e o código).
11. Se for **projeto de uma Junta** (como Cristolândia): seguir o §6 — **um projeto, sem ano**, `missionario = verdadeiro`.

---

## 10. Estado de referência (06/10/2026) e pontos em aberto

### 10.1 Números de referência (medidos depois de todas as migrations)

| | R$ |
|---|---|
| Entradas do Fundo (histórico arrecadado) | **149.337,67** |
| Envio Oficial (histórico enviado) | **157.167,89** |
| **Saldo registrado** | **−7.830,22** |
| Esforço Total | 237.595,22 |
| Sustento | 79.292,93 |
| Mobilização | 1.134,40 |
| Projeto Cristolândia (execução) | 5.050,00 |

**Razão por edição** (arrecadado − enviado): pré-Omie **−10.257,58** · Mundiais 2024 **−1.705,11** · Nacionais 2024 +370,16 · Mundiais 2025 **−2.240,81** · Nacionais 2025 +36,15 · Mundiais 2026 +1.926,87 · Nacionais 2026 +4.040,10. **Soma = −7.830,22.**

### 10.2 As três pontas negativas (−14.203,50) e o que as fecha

| Ponta | Valor | Origem conhecida | O que fecha |
|---|---|---|---|
| **Pré-Omie (H-001)** | −10.257,58 | JMN 12/07/2024, provável Nacionais 2023 | extrato da JMN por destino; extrato Bradesco dez/2023–jun/2024 |
| **Mundiais 2024** | −1.705,11 | 1.551,32 (JMM 12/07/2024, mesmo dia da H-001) + 153,79 | extrato da JMM/Bradesco anterior a 2024 |
| **Mundiais 2025** | −2.240,81 | = 1.457,23 (boleto de 22/07) + 783,58 (boleto de 19/09 "ALVO") | carta/boleto JMM 2025 e decisão do alvo de R$ 35.000; fechamento da Feira das Nações; contagem de envelopes; extrato detalhado de 09/06/2025 |

Relatório completo de Mundiais 2025: `docs/auditoria-missoes/INVESTIGACAO_MUNDIAIS_2025_FASE5_FEIRA_E_META.md`.

### 10.3 Pendências

- **647 ofertas do Fundo ainda sem campanha** (só 5 têm): classificar em lote, **com confirmação**.
- **Metas 2026 não registradas** (C-08).
- **Recorrências de sustento** (pastor e parcerias) não cadastradas → o painel diz "compromisso mensal não cadastrado".
- **Candidatos a reclassificação que dependem de documento:** Pix ",10" de média/baixa confiança (§5) e o **Pix de R$ 206,20 de 07/02/2025** (anotação "ALVO DE MISSÕES | CLASSE DOS…", hoje em *Ofertas*).
- **Depósito de R$ 800,00 de 09/06/2025** ("Ofertas não identificadas"): indeterminado; decide o extrato detalhado.
- **N-03** (R$ 300 "Carreta Missionária" × parceria) e **J-06** (remessa de 07/07/2026).
- **Proposta "Ciclo Missionário"** (campo opcional nas remessas; nulo = ano da data): **não implementada**, aguarda decisão. *(Resolveria parcelas pagas com atraso, C-03.)*
- **Migration `20260526120508_fluxo_visitantes`: NÃO aplicar.** Daria `SELECT` ao papel anônimo sobre dados de visitantes; marcar como obsoleta.

---

## 11. Onde está cada coisa

| O quê | Onde |
|---|---|
| Painel | Painel da Tesouraria → **Indicadores Missionários** (`#missoes`) |
| Regras de cálculo | `src/lib/missoesModelo.ts` · `src/lib/indicadoresMissionarios.ts` |
| Auditoria "Possível oferta missionária" | `src/lib/possivelOfertaMissionaria.ts` (+ Fechamento e *Abrir Correções*) |
| Modelagem aprovada | `docs/INDICADORES_MISSIONARIOS_MODELAGEM.md` |
| Validação com o histórico da JMM | `docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md` |
| Toda a auditoria (índice) | `docs/auditoria-missoes/README.md` |
| Hipóteses (H-001) | `docs/auditoria-missoes/REGISTRO_DE_HIPOTESES.md` |
| Linha do tempo do Fundo | `docs/auditoria-missoes/linha-do-tempo-fundo-missionario.csv` |
| Migrations de Missões | `supabase/migrations/20261006180000` a `…240000` (todas aplicadas) |
| Aplicar migrations com ensaio | `scripts/copiar-migration.ps1` |

*Nada deste documento cria ajuste, compensação ou estimativa. Se uma regra aqui entrar em conflito com um documento novo da Junta, vale o documento — e esta página deve ser atualizada com a data e o motivo.*
