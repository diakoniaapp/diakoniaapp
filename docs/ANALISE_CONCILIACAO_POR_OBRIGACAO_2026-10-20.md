# Conciliação OFX centrada em obrigações — análise (20/10/2026)

**Só análise. Nada foi implementado nem gravado no banco.** Medições feitas em leitura, no banco de produção, com a sessão da Telma, entre 19h e 20h de 20/10/2026. Arquivo analisado: `Bradesco_20102026_184406.OFX` (166 linhas, 01 a 19/10, saldo final −729,78).

---

## 0. O que a medição mostrou (leia primeiro)

A pergunta era "uma obrigação ficou aguardando, o pagamento chegou e o sistema deixou criar outra despesa". Hoje **não há nenhuma obrigação aberta com gêmea paga** (9 contas vencidas em aberto; as duas que parecem ter par são o mês seguinte de contratos mensais — Ecoprint R$ 360 e Prov Telecom R$ 99 —, não duplicata).

Mas a mesma classe de erro — **o OFX criando uma despesa que já existe** — aconteceu hoje, por **outro caminho**, e é maior:

| | |
|---|---|
| Extrato do banco, 01–19/10 | 166 movimentos, líquido **−R$ 4.606,02** |
| Banco de dados, Bradesco, 01–19/10 (realizado + conciliado) | **221** movimentos, líquido **+R$ 4.139,76** |
| Diferença | **55 movimentos a mais; R$ 8.745,78 acima do banco** |
| Criados hoje, 19h16–19h37, pela conciliação (marca `lote-ofx`) | 136 lançamentos em 102 lotes |
| Desses, com gêmeo 1:1 já gravado em 08–14/10 (mesma conta, sentido, valor e dia) | **52** — 12 saídas (R$ 13.109,50) e 40 entradas (R$ 19.039,68) |
| Das 12 saídas, as que casam com **obrigação de recorrência já baixada** | **9** (R$ 12.489,90): Água R$ 1.479,65 · Caio R$ 4.138 · Telma R$ 1.923 · Tayane R$ 1.875 · Carlos R$ 1.630 · Ana R$ 760 · Verisure R$ 291,31 e R$ 278,22 · Título de Capitalização R$ 114,72 |

**Grau de certeza.** O pareamento é por valor + dia + sentido, 1 para 1. Em **36 dos 52** a diferença entre o identificador antigo e o novo é a mesma em vários pares (6.656 ×15, 6.618 ×9, 6.502 ×9, 6.590 ×3) — é a assinatura de uma numeração por posição no arquivo; esses são praticamente certos. Os outros **16** têm deslocamento isolado e podem incluir coincidências (dois PIX de R$ 20 no mesmo dia, tarifa de R$ 9,80 repetida). Ver a lista com `docs/CONFERIR_DUPLICIDADES_OFX_2026-10-20.sql` (só leitura; **não rodei** — não tenho token válido; a lógica foi validada com a mesma consulta no navegador).

Outras medidas, para dar escala:
- Pagamentos de saída vindos do OFX: setembro, **74 lançados como novos × 17 liquidações** de obrigação (com identificador do banco); outubro, **36 × 7**. Ou seja, só ~1 em cada 5 pagamentos chega a uma obrigação prévia — o resto a Tesouraria cria no ato.
- `fin_extrato_ignorados`: **0 linhas** (consulta com a sessão de admin). "Ignorar" nunca foi usado como saída — nenhuma obrigação foi "ignorada" por essa via.
- Liquidações que guardam o identificador do banco: 24 (17 em setembro, 7 em outubro). O caminho certo existe e funciona; é minoria.

---

## 1. Onde a tela induz o erro

Há **dois defeitos diferentes** e a tela erra nos dois.

### 1.1 Defeito de motor (o que gerou as 52 de hoje): o sistema não reconhece o próprio movimento

`importacaoOfxService.analisar` decide "já existe?" em três degraus:

1. `fitidsJaImportados` — igualdade **exata** do identificador (`FITID`) do banco.
2. `casarComLancamentos` com `realizados` — só lançamentos de status **realizado**.
3. `casarComLancamentos` com `semDono` — conciliados **sem marca `[ofx:…]`** e sem liquidação com identificador. (Regra de 08/10: "o lançamento que já nasceu de OUTRA linha do extrato não pode ser par", para um PIX de R$ 20 novo não achar o R$ 20 de outro dia.)

O pressuposto escondido é que **o FITID do Bradesco é estável entre exportações**. Não é: o mesmo PIX de R$ 760 para Ana Patrícia (02/10) é `N11D35` no arquivo de 08/10 e `N10335` no de hoje, e o desvio é o mesmo (6.656) em Caio, Tayane, Telma e Carlos — o número depende de quantas linhas vieram antes no arquivo. Resultado:

- degrau 1 falha (identificador diferente);
- degrau 2 falha (o antigo é `conciliado`, não `realizado`);
- degrau 3 **exclui exatamente o gêmeo**, porque ele carrega uma marca `[ofx:N11…]` e foi tratado como "de outra linha".

A linha cai em **"nova"**. A guarda D3 (13/10) não a pega, porque só olha **contas em aberto** (`previstos`), e a recorrência dessas 9 já estava **baixada**. O cartão mostra "Confirmar" como botão principal. Cada "Confirmar" grava o segundo lançamento — foram 102 confirmações (lotes) em 21 minutos, uma a cada ~12 segundos: ritmo de quem confia que a tela só mostra o que é novo.

> Resumo: a defesa existe contra "obrigação aberta + despesa nova", mas não contra "movimento já registrado por outro arquivo". A tela não tem como dizer "isto parece o que você importou dia 8" porque o motor não pergunta.

### 1.2 Defeito de hierarquia (o que a Telma descreveu): a obrigação candidata é nota de rodapé

Leitura de `mesa/CartaoDaLinha.tsx` e `HipoteseDaLinha.tsx`. A ordem de cima para baixo no cartão de uma saída:

1. caixa **Hipótese** (valor atual, sugestão, confiança, motivos);
2. seletor de favorecido;
3. chips de categoria, "é transferência?", "Transferência entre contas", "Outra…";
4. seletor de centro de custo e de projeto;
5. **só então** o aviso da conta candidata (linhas 159–163) — uma frase pequena;
6. os botões (linhas 166–177).

Pontos concretos:
- **A pergunta que o cartão faz é "qual categoria?".** Cabem 8–12 controles antes de a obrigação aparecer. A decisão que evita duplicidade (liquidar × criar) vem depois de a pessoa já ter "trabalhado" no cartão classificando — e quem classificou tende a confirmar.
- **O botão principal só inverte se o valor for exato** (`obrigacaoExata = !!documento?.exato`). Candidata com valor diferente (juros, multa, desconto — o caso normal de boleto) mantém **"Confirmar"** como botão cheio e "Liquidar documento" como contorno.
- **"Confirmar" é um verbo sem objeto.** Confirmar o quê — que a hipótese está certa, ou que a despesa nova deve ser criada? Na variante exata ele muda para "Lançar como novo", que é honesto; na variante não exata, não.
- **A guarda D3 vem tarde e só ela existe.** É um diálogo depois do clique (ConciliacaoOFXDialog ~860–885), com "É outro pagamento — criar mesmo assim" um clique abaixo. É a rede de segurança certa, mas não deve ser o principal mecanismo: se aparece o tempo todo, vira ritual.
- **Nada diz "já existe".** Não há estado "possível duplicata de lançamento registrado em 08/10" nem "esta recorrência já foi baixada este mês". Recorrência só entra se estiver **aberta** e a linha for saída com favorecido identificado ou valor igual em 5 dias.
- **Cinco saídas, quatro botões** (Liquidar, Confirmar, Editar, Ignorar) mais ~8 controles de classificação, repetidos por linha. Em lote de 100+ linhas o cérebro aprende "clique no azul" — e o azul é "Confirmar".

---

## 2. A pergunta certa e o desenho que a responde

Hoje: *"O que fazer com este lançamento bancário?"* → classificar e confirmar.
Proposto: *"A qual obrigação este pagamento pertence?"* — e só se a resposta for "a nenhuma", classificar.

### 2.1 Ordem das hipóteses (o motor decide antes de a tela desenhar)

| # | Hipótese | Ação principal do cartão | Quando |
|---|---|---|---|
| H0 | **Já registrada** (mesmo movimento em outro arquivo, à mão ou pelo Omie) | **Vincular** ao lançamento existente (só grava a marca/vínculo) | impressão digital igual a lançamento não previsto |
| H1 | **Liquidar obrigação em aberto** | **Liquidar «Conta X · vence 05/10 · R$ 278,22»** | favorecido + valor/janela (regra atual de `documentoDoExtrato`) |
| H2 | **Recorrência compatível sem obrigação aberta** (a do mês ainda não foi gerada, ou já foi baixada) | **Gerar e liquidar a ocorrência de outubro** / **Vincular à ocorrência já baixada** | recorrência ativa do mesmo favorecido, valor ±, dia do mês próximo |
| H3 | Débito automático / transferência entre contas | regras atuais | sem mudança |
| H4 | **Nenhuma obrigação compatível** | **Registrar como nova despesa** (aí sim aparecem categoria, centro, projeto) | só depois de H0–H3 serem descartadas |

O cartão passa a ter **uma linha-resposta no topo**, antes de qualquer controle:

> ✅ **Existe conta compatível:** Verisure · vence 05/10 · R$ 278,22 (valor igual) → botão cheio **Liquidar esta conta**
> ↳ *Não é esta conta* · *Ver outras 2 abertas do favorecido*

ou, quando H4:

> ◻ **Nenhuma conta ou recorrência compatível encontrada** (verifiquei 14 abertas e 3 contratos) → **Registrar como nova despesa**

Essa segunda forma é importante: a tela **mostra o que procurou**, para "nova despesa" ser uma conclusão e não o padrão.

### 2.2 Menos controles no caminho principal

- Em H0/H1/H2 a **classificação vem da obrigação** (categoria, centro, projeto, favorecido). Os 8–12 controles **saem do cartão**; ficam só em "Corrigir classificação" (recolhido).
- Em H4 o cartão atual continua, mas com título "Nova despesa" e **um** botão cheio.
- "Editar" e "Ignorar" viram menu "⋯" (hoje ocupam 2 dos 4 botões e disputam atenção).
- Se existe candidata e a pessoa escolhe "Registrar como nova despesa", pede **um motivo de uma linha** (chips: "É outro pagamento do mesmo favorecido", "A conta que apareceu é de outro contrato", "Outro motivo…"). Isso substitui o diálogo D3, grava a razão (útil para aprender) e custa 1 clique a mais só onde há risco.
- O verbo muda: **Confirmar** desaparece como rótulo isolado. Os rótulos são sempre "Liquidar…", "Vincular…", "Registrar nova despesa".

### 2.3 Recorrências

Regra do pedido: *mesmo favorecido + mesmo valor + vencimento próximo → primeira hipótese "Liquidar a recorrência"*. Hoje a recorrência só existe para o motor como `contratosDoFornecedor` (rótulo e valor habitual) e como `recorrencia_id` dos previstos abertos. Propostas:
- H1 já cobre o caso em que o previsto do mês existe: **promover de "dica" para ação principal**, inclusive quando o valor diferir até 15% (hoje só exato é "default").
- H2 é novo: o contrato existe, o previsto do mês **não** está aberto. Dois sub-casos medidos hoje — o previsto já foi **baixado** (as 9 saídas; ação: Vincular) ou **nunca foi gerado/foi excluído** (ação: Gerar e liquidar). O motor diferencia por haver ou não `fin_lancamentos` com `recorrencia_id` naquele mês.

---

## 3. Como evitar novas duplicidades (arquitetura)

Em ordem de custo/benefício. As duas primeiras fecham o buraco de hoje.

**A. Impressão digital do movimento, no motor (código, sem migration).**
Chave `conta + data + sentido + valor + ordinal` (o n-ésimo movimento igual no dia). É estável entre exportações; o FITID passa a ser identificador **secundário**. `analisar` ganha o degrau "H0": se existe lançamento não previsto, de qualquer origem **e mesmo com marca `[ofx:outro]`**, com a mesma chave ainda não consumido por outra linha do arquivo, a linha vira **"possível já registrada"** — fora de "Pendências", com ação Vincular. Isso conserta justo a regra de 08/10 sem reabrir o caso do PIX de R$ 20: o pareamento é **1 para 1 por ordinal**, não "qualquer um com o mesmo valor".
*Teste de aceitação:* reimportar `Bradesco_20102026` contra o banco **antes** de hoje deve dar cerca de 50 linhas "já registradas" (os 52 pares acima) e nenhuma criada.

**B. Guarda no banco (migration, depende de decisão).**
Gatilho `BEFORE INSERT` em `fin_lancamentos` para `origem = 'importado_ofx'`: se já existe lançamento não previsto na mesma conta/sentido/valor/dia com **marca de outro FITID**, recusa com mensagem clara, a menos que a chamada passe `motivo_novo` (o "é outro pagamento" da seção 2.2). Mesmo que o front falhe de novo, o banco não deixa duplicar em silêncio — mesma filosofia de `conferir()`.

**C. Vínculo estruturado em vez de texto em `observacoes`.**
Hoje a ligação lançamento↔banco é a string `[ofx:…]` dentro de um campo livre (e `fin_liquidacoes.ofx_fitid`). Uma tabela `fin_movimento_banco(conta_id, fitid, impressao, lancamento_id, arquivo, importado_em)` permite achar "o que já veio" por consulta, aceita mais de um FITID por movimento (o de 8/10 e o de hoje) e é a base natural do relatório de duplicidades. Fase posterior.

**D. Detector de possíveis duplicidades na Auditoria do extrato.**
A consulta `CONFERIR_DUPLICIDADES_OFX_2026-10-20.sql` vira uma tela: pares suspeitos com os dois lançamentos lado a lado e um botão "Desfazer o mais novo". Também pega o que já está lá (hoje, 52 pares).

**E. Importação com janela.**
Ao importar, a tela diz *"Seu banco já tem movimentos até 13/10 neste extrato; cerca de 50 das 166 linhas coincidem com eles"* **antes** de mostrar as Pendências. É a informação que teria evitado hoje, e custa uma consulta.

---

## 4. Fazer a Tesouraria pensar em obrigações

O desenho acima muda o cartão. A mudança de modelo mental pede também mudar a **tela**:

1. **Visão "por obrigação" (nova, padrão).** Lista as contas a pagar vencidas/da semana; cada uma mostra, ao lado, a linha do extrato que provavelmente a pagou, com "Liquidar" de um clique. É o que a Tesouraria já faz de cabeça ("a Verisure caiu?"). Abaixo, o que sobrou do extrato sem obrigação — **a fila de exceção**, que é onde se classifica e se cria despesa nova.
2. **A fila de exceção deve encolher com o tempo.** Cada "nova despesa" recorrente (mesmo favorecido ≥ 3 vezes) oferece **"Criar recorrência"** — assim o mês seguinte já chega como obrigação. Meta mensurável: hoje **19%** dos pagamentos chegam com obrigação prévia (17 de 91 em setembro; 7 de 43 em outubro até agora). Subir esse número é o indicador de que a Tesouraria passou a pensar em obrigações.
3. **Indicador no topo da conciliação:** "Hoje: 7 liquidaram obrigação · 29 viraram despesa nova · 0 vinculadas a registro existente". Faz o comportamento visível.
4. Nomear sempre pela obrigação: "Liquidar *Verisure · 05/10*", não "Confirmar PAGTO ELETRON COBRANCA VERISU".

---

## 4b. O que o Omie faz (tela "Extrato para Conciliação", mesmo arquivo de 01–19/10, 166 registros)

- **Mestre–detalhe.** Tabela compacta à esquerda (Data · Lançamento · Valor · Situação, com filtros por coluna e paginação) e **um único painel de decisão** à direita, para a linha selecionada. Nós abrimos um cartão por linha, com controles repetidos 100+ vezes.
- **Situação = barrinhas de certeza**, não texto. Leitura de relance de quais linhas já têm par.
- **O painel começa pelo estado**, não pelos controles: "Lançamento não encontrado — selecione uma opção".
- **"Conciliar este lançamento" é a 1ª opção e fica desabilitado quando não há par.** Criar novo é a 2ª; transferência, conta a receber e ignorar vêm depois, todas como links de peso igual. O Omie não força a obrigação, mas a ordem já diz "primeiro ligar ao que existe".
- **"Buscar e associar a um lançamento que já existe"** é uma ação de primeira classe (link sublinhado, destacado): quando o automático não acha, a pessoa procura à mão e liga. **Nós não temos isso** — conferi: não há busca/associação manual no Diakonia; quem não vê a candidata só tem "Confirmar" (criar).
- Sem categoria, centro nem projeto na decisão: o cadastro do lançamento é um passo depois, só para "novo".

**O que adoto na proposta:** (a) mestre–detalhe em vez de cartões empilhados; (b) a pergunta no painel antes de qualquer campo; (c) **"Buscar e associar a conta/lançamento que já existe"** como ação fixa, abrindo busca por favorecido, valor e período sobre contas abertas **e** lançamentos já registrados — é a saída que falta quando o motor erra; (d) barrinhas de certeza na lista. **O que faço melhor que o Omie:** H0 automática (o Omie, pelo que a tela mostra, também deixa o "novo" a um clique e depende da pessoa lembrar de buscar) e o motivo ao criar novo quando há candidata.

---

## 5. O que fazer com o que já está no banco (decisão dela, não executei)

1. **Parar de importar extratos que se sobreponham** ao que já foi lançado até a correção A entrar (o próximo arquivo deve começar no dia 14/10 ou depois). As linhas que restam em "Pendências" deste arquivo têm o FITID de hoje e são seguras de tratar.
2. Rodar `docs/CONFERIR_DUPLICIDADES_OFX_2026-10-20.sql` e conferir a lista (os 16 de deslocamento isolado, um a um).
3. Eu preparo o script de desfazer **dos lançamentos de hoje** que ela confirmar como duplicata (ensaio com `BEGIN … ROLLBACK`, depois ela aplica). Antes, olhar `vw_fin_ciclo`/liquidações: as 9 recorrências baixadas **não** devem ser mexidas — apaga-se o lançamento de hoje, não o antigo.
4. Depois da limpeza, a Auditoria de saldo deve voltar a bater: o líquido do banco no período é −R$ 4.606,02.

---

## 6. Decisões que preciso dela

1. **Prioridade:** começo pela correção A (impressão digital, só código) + E (aviso de janela), que fecha o caso de hoje — ou pelo redesenho do cartão?
2. **Banco:** autoriza a guarda B (gatilho com `motivo_novo`)? Ela exige uma migration que ela aplica.
3. **Cartão:** aprova a ordem H0→H4, a pergunta no topo e a retirada da classificação do caminho "liquidar"?
4. **Motivo obrigatório** ao registrar nova despesa quando existe candidata: sim/não (substitui o diálogo D3).
5. **Visão por obrigação** como padrão da conciliação (seção 4.1), ou como aba opcional primeiro?
6. **Limpeza de hoje:** quer que eu monte o script de desfazer, após ela conferir a lista?

---

*Medições: consultas de leitura com a sessão de admin no navegador (PostgREST), 20/10/2026. Nenhum dado foi alterado. Arquivos lidos: `CartaoDaLinha.tsx`, `HipoteseDaLinha.tsx`, `ofxCandidatas.ts`, `documentoDoExtrato.ts`, trechos de `ConciliacaoOFXDialog.tsx`, `importacaoOfxService.ts`, `mesaOfx.ts`.*
