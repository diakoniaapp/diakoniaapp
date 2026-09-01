# ACTION_PLAN_90_DAYS.md — DiakoniaApp

Plano de ação de 90 dias derivado da **Auditoria Técnica de 25/08/2026**, que
classificou 23 achados a partir do [CLAUDE.md](./CLAUDE.md) e do
[ARCHITECTURE.md](./ARCHITECTURE.md).

> **Janela:** 25/08/2026 a 23/11/2026.
> **Escopo:** os 23 achados, todos classificados. Nenhum fica sem destino.
> **Este documento não altera o sistema.** É plano, não execução.

---

## 1. As três premissas que sustentam o plano

### 1.1 Capacidade — e o confronto que ela impõe

O roadmap de 12 meses estimou **~62 dias de execução**. Uma equipe pequena, em
90 dias corridos, tem cerca de **28 dias** de trabalho técnico — assumindo
aproximadamente dois dias por semana de foco real, o que já é otimista para quem
também opera a igreja.

**62 não cabe em 28.** Este plano não finge que cabe.

A consequência é a decisão mais importante deste documento: **nem todo achado
precisa ser resolvido para deixar de ser risco.** Vários deixam de ameaçar o
sistema quando são contidos ou decididos — e contenção custa horas, não semanas.

### 1.2 Orçamento — o que custa dinheiro é um item só

| Item | Custo | Observação |
|---|---|---|
| CI (GitHub Actions) | **R$ 0** esperado | Um job de `typecheck` + `build` consome poucos minutos por push. **(incerto: confirmar o limite do plano do repositório)** |
| Segundo projeto Supabase (homologação) | **A confirmar** | É o **único item do plano com custo recorrente possível**. Ver a alternativa gratuita em 4.2 |
| Todos os demais 21 achados | **R$ 0** | Só tempo |

**Se o segundo projeto não couber no orçamento, o plano não trava** — a alternativa
local está descrita e mantém o desfecho.

### 1.3 O que "concluído" significa aqui

Cada achado recebe um **desfecho** ao fim dos 90 dias. Só um dos três exige que o
problema tenha desaparecido:

| Desfecho | O que significa | Quando é legítimo |
|---|---|---|
| **Resolvido** | O problema não existe mais | Correção cabe na janela |
| **Contido** | O dano está barrado, a correção completa fica para depois | A contenção custa horas e a correção custa semanas |
| **Decidido** | Nenhuma obra; a igreja registrou por escrito que aceita o risco e por quê | O achado é condicional a uma decisão de negócio que ainda não foi tomada |

**Risco aceito conscientemente não é dívida — é escolha.** Risco esquecido é que é
dívida. Os três desfechos tiram todos os 23 achados do esquecimento.

---

## 2. Quadro de classificação — os 23 achados

| # | Achado | Categoria | Prior. | Janela | Desfecho | Ordem |
|---|---|---|---|---|---|---|
| 03 | Chave `service_role` com prefixo `VITE_` | Segurança | Crítica | Imediata | Resolvido | 1 |
| 10 | Três buckets públicos sem auditoria | Segurança | Alta | Imediata | Resolvido | 2 |
| 06 | Funções `SECURITY DEFINER` sem guarda conhecida | Segurança | Alta | Imediata | Resolvido | 3 |
| 04 | Nenhuma verificação automática | Manutenib. | Crítica | Imediata → Curto | Resolvido | 4 e 7 |
| 05 | Guarda de rota cobre 9 de 76 | Segurança | Alta | Imediata | Resolvido | 5 |
| 07 | 39 `confirm()` mudos no celular | Dívida | Alta | Imediata → Longo | Resolvido | 6 e 16 |
| 01 | Desenvolvimento sobre produção | Segurança | Crítica | Curto | Resolvido | 8 e 9 |
| 12 | Portão de LGPD não lê o banco | Segurança | Média | Curto | Resolvido | 10 |
| 22 | Duas lockfiles | Manutenib. | Baixa | Curto | Resolvido | 11 |
| 23 | README vazio e scripts soltos | Manutenib. | Baixa | Curto | Resolvido | 11 |
| 02 | ~52 escritas cegas | Dívida | Crítica | Médio → Longo | Resolvido | 12 e 15 |
| 08 | Pacote acima de 2,6 MB | Performance | Alta | Médio | Resolvido | 13 |
| 19 | `types.ts` gerado com edições à mão | Dívida | Média | Médio | Resolvido | 14 |
| 13 | Dois modelos de permissão, um morto | Arquitetura | Média | Longo | **Contido** | 17 |
| 14 | Duas colunas de `profiles` mentem | Dívida | Média | Longo | **Contido** | 18 |
| 18 | 57 objetos dormentes | Dívida | Média | Longo | **Contido** | 19 |
| 20 | `components/` importa `pages/` | Arquitetura | Baixa | Longo | Resolvido | 20 |
| 11 | TypeScript não estrito | Manutenib. | Alta | Longo | **Contido** | 21 |
| 16 | React Query instalado e não usado | Performance | Média | Longo | **Contido** | 22 |
| 09 | Camada de serviços não respeitada | Arquitetura | Alta | Longo | **Contido** | 23 |
| 15 | `DELETE` só de admin | Dívida | Média | Longo | **Contido** | por 02 |
| 17 | Multi-inquilino parcial | Escalabil. | Média | Longo | **Decidido** | 24 |
| 21 | Nunca exercitado além de 6 usuários | Escalabil. | Baixa | Longo | **Decidido** | 24 |

**Resumo:** 14 resolvidos · 7 contidos · 2 decididos · **~28 dias de esforço**.

---

## 3. Correções imediatas — dias 1 a 7 (25/08 a 31/08)

**Esforço da janela: ~4 dias.** Tudo aqui é barato, e nada aqui mexe em regra de
negócio. É o menor risco de execução do plano inteiro.

**O critério desta janela:** as três verificações que a documentação deixou
marcadas como `(incerto)` — porque incógnita de segurança não se prioriza, se mede
— mais as duas correções de maior perda evitada por hora de trabalho.

### Ordem 1 · Remover `VITE_SUPABASE_SERVICE_ROLE_KEY` do `.env.example`

`Achado 03 · Segurança · Crítica · Resolvido`

**Esforço** algumas horas · **Dependências** nenhuma

**Impacto.** Fecha a única porta que exporia as 143 tabelas de uma vez. Variáveis
`VITE_` vão para o pacote entregue ao navegador, e a chave `service_role` ignora a
RLS — que é a totalidade da segurança do sistema.

**Risco mitigado.** Exposição total do banco a partir do JavaScript público. Hoje
não há vazamento (verificado: nenhum arquivo em `src/` a referencia, o valor não
aparece em `dist/`), mas o nome está no arquivo que todo recém-chegado copia.

**Como fazer.** Apagar a linha, ou renomear para `SUPABASE_SERVICE_ROLE_KEY` com um
comentário dizendo que é de servidor e nunca de cliente. É a correção mais barata do
plano e a de maior perda evitada — **por isso é a primeira.**

### Ordem 2 · Classificar o conteúdo dos três buckets públicos

`Achado 10 · Segurança · Alta · Resolvido`

**Esforço** meio dia · **Dependências** nenhuma

**Impacto.** `ebd-aulas`, `locais-mapas` e `campanhas-materiais` são públicos —
qualquer pessoa com a URL lê o arquivo, sem autenticação e sem registro de acesso.
O ARCHITECTURE.md §5.3 marca explicitamente que o conteúdo nunca foi olhado.

**Risco mitigado.** Exposição pública de dado pessoal sob a LGPD. Se houver lista de
chamada ou foto de criança da EBD, há agravante — e nenhum rastro de quem acessou.

**Como fazer.** Listar os três, classificar o que há dentro. `campanhas-materiais` é
**dormente** (nenhum código o referencia) e pode ser fechado imediatamente. Para os
outros dois, conferir antes se alguma tela depende da URL pública.

### Ordem 3 · Auditar as funções `SECURITY DEFINER`

`Achado 06 · Segurança · Alta · Resolvido`

**Esforço** 1 dia · **Dependências** nenhuma

**Impacto.** Elimina a única incógnita de segurança da auditoria. Função `SECURITY
DEFINER` ignora a RLS por definição, e por isso a guarda precisa ser a primeira
linha do corpo. O schema tem 397 funções; ninguém contou quantas são definer nem
quantas têm guarda.

**Risco mitigado.** Escalada de privilégio por chamada direta de `.rpc()`,
contornando as 476 políticas — inclusive nas funções que não aparecem em tela alguma.

**Como fazer.** Consultar `pg_proc.prosecdef` para listar as definer, e ler a
primeira instrução de cada uma. É leitura, não escrita. **Atenção:** se aparecer
função sem guarda, ela vira correção urgente não prevista — reserve folga na semana.

### Ordem 4 · Acrescentar o script `typecheck`

`Achado 04 (parte 1 de 2) · Manutenibilidade · Crítica`

**Esforço** algumas horas · **Dependências** nenhuma

**Impacto.** Faz o comando certo ser o mais fácil de rodar. Hoje `npx tsc --noEmit`
sem `-p` monta um programa **vazio** e sai com sucesso — a ferramenta de verificação
mente, e a documentação precisa avisar por escrito.

**Risco mitigado.** Erro de tipo chegando em produção com o verificador dizendo "ok".

**Como fazer.** `"typecheck": "tsc --noEmit -p tsconfig.app.json"` nos scripts do
`package.json`. Rodar uma vez e resolver o que aparecer antes de seguir — a parte 2
(CI) depende de a base estar limpa.

### Ordem 5 · Cobrir `/admin/*` e `/financas/*` em `ROUTE_ROLES`

`Achado 05 · Segurança · Alta · Resolvido`

**Esforço** meio dia · **Dependências** nenhuma

**Impacto.** Leva a guarda de rota de 9 para 34 das 76 rotas, incluindo as 25 mais
sensíveis. Trocar caminho exato por prefixo conserta de quebra `/ebd/:classeId`, que
hoje não casa com a entrada de `/ebd`.

**Risco mitigado.** Qualquer usuário autenticado que digite a URL chega à tela de
administração ou de finanças. A RLS continua barrando o dado, mas a tela abre.

**Como fazer.** As duas mudanças cabem em `components/layout/navConfig.ts`.
**Cuidado:** mudar de caminho exato para prefixo altera o comportamento de *todas*
as rotas já cobertas — conferir tela por tela, com cada papel, antes de subir.

### Ordem 6 · Substituir os `confirm()` das ações destrutivas

`Achado 07 (parte 1 de 2) · Dívida técnica · Alta`

**Esforço** 1,5 dia · **Dependências** nenhuma

**Impacto.** Botões que hoje não fazem nada no celular voltam a funcionar. Em
WebView — que é como a igreja usa o sistema — a caixa nativa é bloqueada,
`confirm()` devolve falso **sem perguntar**, e o código entende "cancelou".

**Risco mitigado.** Excluir campanha, arquivar reserva e excluir lançamento falham
em silêncio. O efeito prático é a equipe concluir que o sistema não funciona no
celular.

**Como fazer.** Só as ~10 destrutivas nesta janela. `pages/Ebd.tsx` já traz o padrão
com `AlertDialog`. As demais 29 vão para a ordem 16.

---

## 4. Curto prazo — dias 8 a 30 (01/09 a 23/09)

**Esforço da janela: ~8 dias.** A janela que devolve a rede de segurança e para de
expor dado real ao desenvolvimento.

### Ordem 7 · Concluir o CI

`Achado 04 (parte 2 de 2) · Manutenibilidade · Crítica · Resolvido`

**Esforço** 1 dia · **Dependências** ordem 4 (o `typecheck` precisa passar limpo antes)

**Impacto.** Tira a verificação da memória de quem entrega. Hoje **nada roda
sozinho**: 1 teste unitário trivial, 3 specs de layout, sem CI, contra 476 políticas
e 397 funções.

**Risco mitigado.** Regressão silenciosa descoberta pelo usuário, em produção, sobre
dado real.

**Como fazer.** Um workflow que rode `typecheck` e `build` a cada push. **Não incluir
teste de RLS nesta janela** — ele depende de homologação e é trabalho de outro porte
(fora dos 90 dias; ver §7).

### Ordem 8 · Criar o ambiente de homologação

`Achado 01 (parte 1 de 2) · Segurança · Crítica`

**Esforço** 4 dias · **Dependências** nenhuma técnica; **depende de decisão de orçamento**

**Impacto.** Acaba a exposição diária do cadastro real de 294 pessoas — com
telefone, endereço e observações pastorais — ao desenvolvimento. É o item que
destrava a varredura da ordem 12.

**Risco mitigado.** Escrita ou exclusão acidental em dado de gente de verdade. Hoje
a única proteção é lembrar de ensaiar com `BEGIN; … ROLLBACK;`.

**Como fazer — duas rotas, conforme o orçamento:**

- **Rota A · segundo projeto Supabase.** Aplicar as 77 migrations e povoar com dados
  fictícios. Mais fiel ao ambiente real. **Confirmar o custo antes de decidir.**
- **Rota B · Supabase local via CLI (Docker).** Custo zero, roda na máquina do
  desenvolvedor. Não cobre diferenças de configuração da nuvem, mas **cobre o risco
  que importa**: parar de gravar em produção.

**A rota B é suficiente para o desfecho deste plano.** Escolher a A só se o
orçamento permitir sem apertar o resto.

**Disciplina obrigatória a partir daqui:** toda migration passa por homologação
antes de produção. Sem isso, os dois bancos divergem e o ambiente vira ficção.

### Ordem 9 · Confirmar o PITR e testar uma restauração

`Achado 01 (parte 2 de 2) · Segurança · Crítica · Resolvido`

**Esforço** 1 dia · **Dependências** ordem 8

**Impacto.** Nenhum dos dois documentos registra política de backup. **Backup nunca
testado é suposição** — e suposição só é desmentida no pior dia possível.

**Risco mitigado.** Perda de dado sem caminho de volta.

**Como fazer.** Confirmar se o *Point-in-Time Recovery* está ligado no projeto de
produção e ensaiar uma restauração **sobre o ambiente de homologação** — nunca sobre
produção. É por isso que vem depois da ordem 8.

### Ordem 10 · O portão de LGPD passa a consultar a tabela

`Achado 12 · Segurança · Média · Resolvido`

**Esforço** 1 dia · **Dependências** nenhuma

**Impacto.** Acaba o reaceite a cada nova sessão. A tabela `consentimento` tem 23
linhas para 6 usuários — número coerente com o termo sendo pedido de novo toda vez
que alguém fecha o navegador.

**Risco mitigado.** Atrito diário para a equipe, e o desacoplamento entre o registro
que tem valor jurídico e o portão que decide se pergunta.

**Como fazer.** O portão consulta `consentimento` — a fonte da verdade — e usa
`sessionStorage` apenas como cache da resposta. Uma consulta a mais no carregamento.

### Ordem 11 · README, lockfile única e triagem dos scripts soltos

`Achados 22 e 23 · Manutenibilidade · Baixa · Resolvidos`

**Esforço** 1 dia · **Dependências** nenhuma

**Impacto.** Custo pequeno, retorno concentrado no primeiro dia de quem chegar. Hoje
o repositório não tem porta de entrada e tem duas lockfiles disputando qual árvore
de dependências vale.

**Risco mitigado.** "Funciona na minha máquina" causado por lockfiles divergentes; e
alguém executar um dos três scripts da raiz sem saber se ainda vale.

**Como fazer.** README de dez linhas apontando para o CLAUDE.md e o ARCHITECTURE.md.
Decidir o gerenciador, apagar a outra lockfile, declarar `engines.node`. Triar os
scripts: na dúvida, mover para `scripts/` em vez de apagar.

---

## 5. Médio prazo — dias 31 a 60 (24/09 a 23/10)

**Esforço da janela: ~8 dias.** Com a rede montada, a janela ataca o achado que já
causou dano real.

### Ordem 12 · Varrer as escritas cegas de maior risco

`Achado 02 (parte 1 de 2) · Dívida técnica · Crítica`

**Esforço** 4 dias · **Dependências** ordem 8 (para ensaiar sem tocar em produção); ordem 7 ajuda

**Impacto.** De 288 escritas, cerca de 52 descartam o resultado. No Postgres com
RLS, um UPDATE barrado afeta zero linhas e devolve **sucesso** — a tela diz "salvo"
e nada foi salvo.

**Risco mitigado.** Registrar contato pastoral que não aconteceu, fazendo a pessoa
sumir da fila de acolhimento. O sistema falhando exatamente na função que o
justifica. **Já aconteceu:** é o defeito que originou o `escritaConferida.ts`.

**Como fazer.** As ~25 de maior risco primeiro — aquelas onde a política de RLS é
mais restritiva que o portão da tela. Aplicar `conferir()` com `.select()` no fim.

**Aviso à equipe, antes de subir:** esta correção vai **revelar** falhas de permissão
que hoje passam despercebidas. Telas que pareciam funcionar começarão a acusar erro.
Isso é o objetivo — mas assusta quem não foi avisado.

**Ao contar, cuidado:** `await supabase` indentado como argumento de `conferir(`
**não** é escrita cega. Um regex ingênuo conta a mais (Risco 4).

### Ordem 13 · Divisão de código

`Achado 08 · Performance · Alta · Resolvido`

**Esforço** 2 dias · **Dependências** nenhuma

**Impacto.** Tira o motor de OCR, o leitor de PDF, o mapa e os gráficos da primeira
carga. São 2,6 MB hoje, para um público que abre pelo celular, com frequência fora
do Wi-Fi. `recharts` é usado em **duas telas**; `tesseract.js`, em uma.

**Risco mitigado.** Abandono na primeira abertura e percepção duradoura de sistema
pesado — que é difícil de reverter depois de formada.

**Como fazer.** `build.rollupOptions.output.manualChunks` separando os quatro
pesados, e `React.lazy` nas telas que os usam. **É configuração, não refatoração.**

### Ordem 14 · Regenerar `types.ts` e disciplinar o processo

`Achado 19 · Dívida técnica · Média · Resolvido`

**Esforço** 2 dias · **Dependências** ordem 8 (regenerar e testar fora de produção)

**Impacto.** O arquivo que deveria espelhar o schema — 14.092 linhas, gerado — tem
edições à mão. Regenerar descarta o que foi acrescentado; não regenerar deixa o tipo
atrás do banco.

**Risco mitigado.** Tipo que não corresponde ao banco. Com `strictNullChecks`
desligado (achado 11), o compilador não ajuda a perceber.

**Como fazer.** Regenerar com o diff aberto, reaplicar as entradas manuais
conferindo uma a uma — várias podem já existir no schema. Depois, passar a regenerar
**no mesmo passo** em que a migration é aplicada.

---

## 6. Longo prazo — dias 61 a 90 (24/10 a 23/11)

**Esforço da janela: ~8 dias.** A janela de fechamento: concluir o que ficou pela
metade e **dar destino aos nove achados restantes**, gastando horas em vez de semanas.

**O critério desta janela:** um documento que precisa avisar "não use esta coluna" é
um sintoma. Onde a remoção não cabe em 90 dias, a contenção vai **para dentro do
banco** — `COMMENT ON TABLE` e `COMMENT ON COLUMN` aparecem em qualquer cliente SQL.
O documento não viaja com o banco; o comentário viaja.

### Ordem 15 · Concluir a varredura de escritas cegas

`Achado 02 (parte 2 de 2) · Dívida técnica · Crítica · Resolvido`

**Esforço** 3 dias · **Dependências** ordem 12

**Impacto e risco mitigado.** Os mesmos da ordem 12, agora nas ~27 restantes, de
risco menor. Ao fim desta ordem, **nenhuma escrita do sistema mente sobre ter
gravado.**

### Ordem 16 · Concluir os `confirm()` e proibir por lint

`Achado 07 (parte 2 de 2) · Dívida técnica · Alta · Resolvido`

**Esforço** 2,5 dias · **Dependências** ordem 6

**Impacto.** Termina as 29 restantes. **A regra de lint é o que impede o defeito de
voltar** — sem ela, volta na próxima tela que alguém escrever.

**Risco mitigado.** Botões mudos no celular, de forma permanente e não só nos pontos
já conhecidos.

**Como fazer.** `grep -rn "confirm(" src --include=*.tsx | grep -v AlertDialog`, e
depois a regra proibindo `confirm|alert|prompt`.

### Ordem 17 · Conter o modelo de permissão morto

`Achado 13 · Arquitetura · Média · **Contido**`

**Esforço** algumas horas · **Dependências** nenhuma

**Impacto.** `permissoes_modulo` (72 linhas) e as 4 funções `fn_*` não são lidas por
nenhuma política nem por nenhuma linha de código. Mas a grade
`pode_ver/pode_criar/pode_editar/pode_excluir` é a forma mais tentadora para quem
for construir uma tela de permissões.

**Risco mitigado.** Alguém escrever num modelo que não decide nada — e acreditar que
revogou uma permissão que continua valendo.

**Por que contido e não resolvido.** Apagar exige confirmar por `count(*)` e por
busca no código que nada consome (o Risco 6 avisa que `n_live_tup` mente), e depois
uma migration. Em 90 dias, `COMMENT ON TABLE ... 'modelo abandonado, não usar'`
entrega **quase todo o benefício por uma fração do custo**. A remoção fica para o
roadmap de 12 meses.

### Ordem 18 · Conter as duas colunas de `profiles` que mentem

`Achado 14 · Dívida técnica · Média · **Contido**`

**Esforço** algumas horas · **Dependências** nenhuma

**Impacto.** `profiles.role` está nulo em 3 dos 6 usuários e diverge de
`user_roles`; `profiles.primeiro_acesso` é `true` inclusive para quem já entrou.

**Risco mitigado.** Decisão de autorização tomada sobre coluna divergente.
`profiles.role` é o primeiro lugar onde qualquer pessoa procuraria o papel de um
usuário — o nome é a armadilha.

**Por que contido.** Remover coluna é irreversível. O caminho correto é marcar como
legado, esperar um ciclo e só então remover — o que atravessa a janela de 90 dias.
`COMMENT ON COLUMN` nas duas, apontando `user_roles.role` e
`auth.users.last_sign_in_at` como as fontes corretas.

### Ordem 19 · Decidir sobre o PDV e marcar os dormentes

`Achado 18 · Dívida técnica · Média · **Contido**`

**Esforço** algumas horas · **Dependências** nenhuma

**Impacto.** 57 de 173 objetos nunca são consultados. Quem investiga onde uma regra
mora tem 173 objetos a descartar em vez de 116.

**Risco mitigado.** Retrabalho, e alguém construir o que já existe.

**Por que contido.** A triagem completa dos 57 é trabalho de dias. Nesta janela,
tratar só o caso mais claro: as **8 tabelas `pdv_*`**, com zero arquivos em `src/`
que as citem — um módulo de ponto de venda modelado e nunca construído. Uma decisão
explícita (construir ou apagar) e um `COMMENT ON TABLE` registrando-a.
**Não apagar em bloco.**

### Ordem 20 · Corrigir as 6 inversões de camada

`Achado 20 · Arquitetura · Baixa · Resolvido`

**Esforço** meio dia · **Dependências** nenhuma

**Impacto.** 6 imports de `components/` para `pages/`, contra o sentido pretendido.
Um componente que depende de uma tela não pode ser reaproveitado, e o import
circular fica a um passo.

**Risco mitigado.** Acoplamento que tende a se multiplicar por imitação.

**Como fazer.** Mover o que é compartilhado — tipo, constante ou componente — de
`pages/` para `lib/` ou `components/`. O número volta a zero.

### Ordem 21 · Ligar `noUnusedLocals` e registrar a regra de tipos

`Achado 11 · Manutenibilidade · Alta · **Contido**`

**Esforço** meio dia · **Dependências** ordem 7 (o CI precisa existir para segurar a regra)

**Impacto.** `noUnusedLocals` pega código morto **sem** a explosão de erros que
`strictNullChecks` causaria.

**Risco mitigado.** Parte do risco: o acúmulo continua barrado dali em diante, ainda
que o passado siga sem proteção contra nulo.

**Por que contido.** Ligar `strictNullChecks` estouraria em centenas de erros — o
próprio CLAUDE.md avisa. A migração é por arquivo, ao longo de meses, e **só faz
sentido depois de existirem testes**. Fica para o roadmap de 12 meses. O que cabe
aqui é a regra escrita: **arquivo novo nasce sem `any` e com nulo tratado.**

### Ordem 22 · Medir o painel antes de decidir sobre React Query

`Achado 16 · Performance · Média · **Contido**`

**Esforço** meio dia · **Dependências** nenhuma

**Impacto.** 17 widgets, cada um lendo o seu domínio, sem cache compartilhado, na
tela mais aberta do sistema.

**Risco mitigado.** Nenhum ainda — **este item existe para não otimizar às cegas.**

**Por que contido.** Nenhum documento conta as requisições da primeira carga. Abrir
o painel, contar na aba de rede e **registrar o número**. Se justificar, a adoção
(6 dias, só no painel) entra no roadmap de 12 meses. Se não justificar, o achado
morre com uma medição — que é o melhor desfecho possível.

### Ordem 23 · Registrar a convenção de serviços e remedir

`Achado 09 · Arquitetura · Alta · **Contido**` · também fecha o `Achado 15`

**Esforço** meio dia · **Dependências** 90 dias decorridos

**Impacto.** 72 arquivos de `pages/` e `components/` falam com o banco direto, contra
29 em `services/`.

**Risco mitigado.** Regra de leitura duplicada, corrigida num lugar e esquecida nos
outros.

**Por que contido.** A correção é **cultural, não mecânica** — migrar em massa
contraria AD-6. A regra: código novo nasce no serviço; ao tocar numa tela por outro
motivo, mover a consulta daquela tela. No dia 90, **remedir a proporção**. Se não
caiu, a conclusão é que convenção escrita não basta e o caso é de lint.

**Sobre o achado 15 (`DELETE` só de admin).** Ele não tem ordem própria porque a
ordem 12 já o resolve pela metade: com `conferir()`, o padrão "apaga tudo e
reescreve" **para de falhar em silêncio**. A troca por diferença — ou por encerrar em
vez de apagar, como `MembroForm` já faz — entra no roadmap de 12 meses.

### Ordem 24 · Registrar por escrito as duas decisões de escala

`Achados 17 e 21 · Escalabilidade · **Decididos**`

**Esforço** algumas horas · **Dependências** nenhuma técnica

**Impacto.** Nenhum no código. O valor está em impedir um erro de estimativa.

**Risco mitigado.**

- **Achado 17 — multi-inquilino.** Só 15 das 143 tabelas têm `igreja_id`. O
  comentário em `igreja.ts` descreve a intenção e pode ser lido como "já está
  pronto". Registrar: **é projeto, não troca de constante.** 128 tabelas não têm
  coluna de inquilino.
- **Achado 21 — abertura ao membro comum.** Hoje são 6 usuários. Abrir aos 294
  multiplicaria os simultâneos por cinquenta. Registrar: **é mudança de regime, não
  de escopo**, e exige teste de carga e revisão das políticas de RLS mais custosas
  **antes** de qualquer compromisso.

**Como fazer.** Um parágrafo de cada no CLAUDE.md, onde quem for orçar vai ler.
Nenhuma obra de código — seria otimizar sem problema.

---

## 7. O que fica fora dos 90 dias, e por quê

Quatro trabalhos foram deliberadamente empurrados. **Nenhum deles é esquecimento:**

| Trabalho | Por que fora | Onde entra |
|---|---|---|
| **Bateria de testes de RLS por papel** | ~12 dias. É o item de maior valor estrutural do roadmap de 12 meses, mas sozinho consumiria **43% da capacidade** dos 90 dias — e depende da homologação, que só fica pronta no dia 30 | Roadmap 12 meses, fase 3 |
| **Migração para `strictNullChecks`** | Estouraria em centenas de erros. Só faz sentido **depois** de existirem testes | Roadmap 12 meses, fase 4 |
| **Adoção de React Query no painel** | ~6 dias, e ainda não se sabe se é necessário. A ordem 22 mede primeiro | Condicional à medição |
| **Remoção física dos objetos dormentes e das colunas legadas** | As ordens 17, 18 e 19 contêm por comentário; a remoção exige migration e um ciclo de espera | Roadmap 12 meses, fase 3 |

**A troca central deste plano:** trocamos os testes de RLS por *catorze achados
resolvidos e sete contidos*. Para uma equipe pequena, fechar dezenove frentes vale
mais em 90 dias do que abrir uma sozinha — mas **os testes seguem sendo o item mais
importante do ano**, e o dia 91 deve começar por eles.

---

## 8. Como saber, no dia 90, se o plano funcionou

Sete medições. **Todas verificáveis por comando ou consulta** — nenhuma depende de
impressão:

| # | Medição | Hoje | Meta |
|---|---|---|---|
| 1 | Linha `VITE_SUPABASE_SERVICE_ROLE_KEY` no `.env.example` | existe | **ausente** |
| 2 | Funções `SECURITY DEFINER` sem guarda na primeira linha | desconhecido | **0, e o número é conhecido** |
| 3 | Rotas cobertas por `ROUTE_ROLES` | 9 de 76 | **34 de 76** |
| 4 | Chamadas a `confirm()` em `src/` | 40 | **0**, com lint impedindo |
| 5 | Escritas que descartam o resultado | ~52 | **0** |
| 6 | Ambiente onde `npm run dev` grava | produção | **homologação** |
| 7 | Arquivos de `pages/` e `components/` importando o client direto | 72 | **não maior que 72** |

A sétima é a única sem meta de queda, **de propósito**: em 90 dias, com correção
cultural e sem migração em massa, o realista é o número **parar de crescer**. Se
tiver crescido, a convenção não pegou — e a conclusão é que o caso é de lint, não de
documento.

**Antes de comemorar qualquer número:** o Risco 6 do CLAUDE.md vale aqui também.
`n_live_tup` é estimativa e mente — durante o levantamento reportou 0 linhas para
tabelas que tinham 39, 108 e 6. **Sempre `count(*)`.**

---

## 9. Resumo executivo

| Janela | Dias | Achados tratados | Esforço | O que muda na prática |
|---|---|---|---|---|
| **Imediata** | 1–7 | 6 | ~4 dias | As três incógnitas de segurança viram números; a chave sai do `.env.example` |
| **Curto** | 8–30 | 5 | ~8 dias | Para de desenvolver sobre dado real; toda entrega passa a ser verificada |
| **Médio** | 31–60 | 3 | ~8 dias | As telas param de mentir "salvo"; o sistema fica leve no celular |
| **Longo** | 61–90 | 9 | ~8 dias | As armadilhas do banco passam a se anunciar sozinhas, dentro do banco |
| **Total** | **90** | **23** | **~28 dias** | 14 resolvidos · 7 contidos · 2 decididos |

**A regra que atravessa o plano:** a ordem não é de facilidade nem de gravidade — é
de **dependência**. As três primeiras janelas existem para tornar a quarta possível,
e o dia 91 começa pelos testes de RLS.

---

*Plano derivado da Auditoria Técnica de 25/08/2026, que por sua vez saiu do
CLAUDE.md e do ARCHITECTURE.md. Nenhum arquivo do sistema foi alterado para
produzi-lo. As estimativas de esforço são ordens de grandeza para planejar, não
compromissos, e devem ser reavaliadas ao fim de cada janela.*
