# Favorecido Financeiro — modelagem

Proposta de **07/10/2026**, para revisão. **Nada foi aplicado e nenhum código do app mudou.** SQL em rascunho, ensaiado no seu banco com `BEGIN/ROLLBACK` (8 casos, mais o passo de vínculos):
[FAVORECIDO_FINANCEIRO.sql](FAVORECIDO_FINANCEIRO.sql) · [ensaio](FAVORECIDO_FINANCEIRO_ENSAIO_FUNCIONAL.sql) · [vínculos (passo B)](FAVORECIDO_FINANCEIRO_VINCULOS.sql).

## 1. O que existe hoje (medido)

| | |
|---|---|
| Cadastros em `fin_fornecedores` | **326**: 301 "jurídica" (261 com CNPJ, **40 sem documento**) e 25 "física" (todas com CPF) |
| Lançamentos | 20.079. **9.558** apontam para um fornecedor, **3.588** apontam para uma pessoa (`pessoa_id`), **nunca os dois** |
| Quem mais usa | Caio (925 lançamentos como fornecedor), Ana Patricia (911), Carlos Eduardo (911), Telma (33 como fornecedor **e 1.010 como pessoa**) |
| Pessoas que já são "fornecedor" | **17 cadastros** batem exatamente, pelo nome, com alguém do Cadastro de Pessoas (Telma, Alexandre, Caio, Ana Patricia, Daniel, Flavio…) |
| Outras estruturas, **vazias** | `fin_pessoa_pix` (0 linhas), `fin_contratados` (0 linhas), tabela `pessoas` (0) |
| Quem aponta para o cadastro de fornecedor | lançamentos, recorrências, estoque (2 tabelas) e a memória de documentos |

Ou seja: **o mesmo ser humano aparece de dois jeitos** (ex.: a Telma tem 33 lançamentos como "fornecedor" e 1.010 como "pessoa"), e o sistema não sabe que são a mesma pessoa. Daí vêm o Pix que não aparecia no Pagar (a chave estava num lugar e o lançamento apontava para o outro) e a necessidade de "adivinhar pelo nome".

## 2. A ideia

**"Favorecido Financeiro" = quem pode receber um pagamento.** É uma camada, não um cadastro novo:

- **Pessoa** (funcionário, pastor, missionário, membro, preletor…): continua **no Cadastro de Pessoas**. O favorecido financeiro dela guarda **só** o que é financeiro: Pix, banco, agência, conta, categoria, centro e subcentro habituais.
- **Empresa** (Light, Amil, Vivo, Claro…): continua sendo empresa, como hoje, com CNPJ e os mesmos dados financeiros.
- Os dois são **favorecidos** e recebem pagamentos do mesmo jeito.

### Como fica, sem recadastrar ninguém

O cadastro que hoje se chama "fornecedor" **passa a ser o cadastro de Favorecidos**, com uma coluna nova: **`pessoa_id`**, a ponte para o Cadastro de Pessoas (única: uma pessoa, um favorecido). Nenhum lançamento muda de lugar.

| Natureza | Como se reconhece | Exemplo |
|---|---|---|
| **Pessoa** | tem `pessoa_id` | Telma, Pastor Alexandre, Missionária Nina |
| **Pessoa física (sem cadastro de pessoa)** | física, sem vínculo | Carlos Eduardo de Santana (RPA, 911 lançamentos) e mais 14 |
| **Empresa** | jurídica, sem vínculo | Light, Amil, Vivo |

**O nome técnico da tabela não muda** (`fin_fornecedores`); só o que se lê na tela. Renomear a tabela quebraria 14 arquivos, 5 chaves estrangeiras e a memória de aprendizado dos documentos, sem ganho nenhum para quem usa.

## 3. O fluxo que você pediu

**Novo favorecido:**

1. Pesquisa primeiro no **Cadastro de Pessoas**.
2. Achou (ex.: *Telma Rodrigues de Souza*, *Pastor Alexandre*, *Missionária Nina*) → botão **"Vincular pessoa existente como favorecido financeiro"**. **Sem criar registro duplicado.**
   - Se já existe um cadastro financeiro com o **mesmo CPF ou mesmo nome** (inclusive MEI com prefixo de CNPJ, como `47.354.609 Daniel Alves Souza`), o sistema oferece **ligar aquele** em vez de criar outro. É o que evita 3 cadastros para a mesma pessoa.
3. Depois do vínculo, só se preenchem: **Pix, banco, agência, conta, categoria habitual, centro habitual e subcentro habitual.** Nome, CPF e telefone vêm da pessoa.
4. **Não achou ninguém** → **🏢 Favorecido Empresarial** (o formulário de empresa de hoje).

O banco garante o "sem duplicar": a função de vincular é **idempotente** (vincular de novo devolve o mesmo favorecido) e a pessoa só pode ter **um** favorecido.

## 4. O que muda no app (não feito ainda)

| Onde | Mudança |
|---|---|
| Menu e telas | "Fornecedores" → **"Favorecidos"** (cerca de 45 arquivos citam a palavra; só o texto visível muda) |
| Novo favorecido | o fluxo da §3 (busca em Pessoas primeiro; vincular; ou Empresarial) |
| Ficha do favorecido | mostra a natureza (Pessoa / Pessoa física / Empresa) e, para pessoa, um atalho para a ficha dela; extrato juntando o que está como "fornecedor" e como "pessoa" |
| **Pagar** | se o lançamento aponta para uma **pessoa**, procura o Pix no favorecido dela. Isso substitui o "palpite pelo nome" que fizemos hoje, que passa a ser só para o que ainda não estiver vinculado |
| Recorrências, estoque, memória de documentos | **nada muda** (continuam apontando para o mesmo cadastro) |

## 5. Os números do vínculo (passo B, opcional)

**15 cadastros** podem ser vinculados agora, sem ambiguidade (o nome bate com **uma única** pessoa e nenhum outro cadastro tem esse nome): Flavio Inaldo, Daniel Alves Souza, Natalia Ribeiro, Bernard Noblat, Raquel Sepulvida, **Alexandre Lourenço**, Ana Patricia, **Caio Marcelo**, Erivaldo, José Fernandes, Lucio Paulo, Marcelo Martignone, Maria Regina, Patricia Oliveira, **Telma**. Só se preenche `pessoa_id`; nenhum lançamento muda.

**Ficam de fora, de propósito:**
- **Tayane Claudio Rezende de Souza**: a pessoa está **duplicada no Cadastro de Pessoas** (`TAYANE…` em maiúsculas e `Tayane…`). Junte as duas fichas antes (isso é do cadastro de pessoas, não do financeiro).
- **15 pessoas físicas sem ficha no Cadastro de Pessoas** (Carlos Eduardo de Santana, Willian Artur, Breno Artur, Estevão Farias…): são prestadores/RPAs que não são da igreja. Continuam favorecidos "pessoa física". Ver decisão 3.
- **Os 40 cadastros sem documento** e as empresas: nada muda.

## 6. Segurança e impacto

- **Não toca** em `fin_lancamentos`, recorrências, estoque nem na memória de documentos. A migration só **acrescenta** uma coluna e duas views.
- Views nascem com `security_invoker` e sem acesso do anônimo (a lição da `vw_fin_obrigacoes`); o ensaio confere isso.
- **Reversível:** apagar a coluna `pessoa_id` desfaz tudo; nada foi movido.
- O CPF da pessoa aparece no favorecido só para quem já lê o cadastro de pessoas e o financeiro.

## 7. Decisões que preciso de você

1. **Nome técnico:** manter `fin_fornecedores` por dentro e mudar só o texto visível (recomendo), ou renomear a tabela também (mais trabalho e risco, sem ganho visível)?
2. **MEI** (CNPJ no nome de uma pessoa, ex.: `47.354.609 Daniel Alves Souza`): tratar como **Pessoa** quando o nome bate com alguém do cadastro (recomendo). Concorda?
3. **Pessoas físicas que não são da igreja** (15, como Carlos Eduardo, RPA): ficam como favorecido "pessoa física" **sem** cadastro de pessoa (recomendo, para o Cadastro de Pessoas continuar sendo só da igreja), ou quer que elas também entrem em Pessoas?
4. **Passo B:** posso ligar os **15** cadastros agora (depois da migration), ou prefere conferir um a um?
5. **Tayane:** quer unir as duas fichas dela no Cadastro de Pessoas antes?

## 8. Fases

| Fase | Entrega |
|---|---|
| 1 | Migration (coluna, views, funções) e, se aprovado, o passo B — **você aprova, eu aplico pelo token** |
| 2 | Tela: "Favorecidos", o fluxo "vincular pessoa existente" / "Favorecido Empresarial", ficha e extrato unificados |
| 3 | Pagar e documentos usam o favorecido da pessoa (Pix, categoria e centro habituais) |
| 4 | Relatórios por favorecido (pessoa e empresa no mesmo extrato) |
