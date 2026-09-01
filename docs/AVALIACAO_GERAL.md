# Avaliação geral — 01/09/2026

Levantamento por **medição direta** do banco de produção e do código. Todo
número aqui foi contado; onde não deu para concluir, está escrito.

O que se procurou: pendências reais, inconsistências entre partes do sistema,
e coisas **pensadas e nunca aplicadas**.

---

## 1. O defeito que mais se repete: conta ≠ ficha

Este sistema guarda duas identidades para a mesma pessoa:

| | o que é | onde vive |
|---|---|---|
| **conta** | quem entrou no sistema | `auth.users.id`, devolvido por `auth.uid()` |
| **ficha** | quem a pessoa é na igreja | `membros.id` |

O elo entre as duas é `profiles.pessoa_id`. **Sete políticas de RLS ignoram esse
elo** e comparam o id da ficha direto com `auth.uid()`. Como são identificadores
de tabelas diferentes, nenhuma jamais liberou uma linha.

Medido: das 297 fichas, **zero** têm id de conta.

| política | tabela | o que prometia | casa? |
|---|---|---|---|
| ~~`membro_ve_proprio`~~ | membros | ler a própria ficha | corrigida em 01/09 |
| ~~`membro_edita_proprio`~~ | membros | editar a própria ficha | removida em 01/09 |
| `escvol_proprio` | escala_voluntarios | **confirmar a própria escala** | 0 |
| `staff_update_escala_voluntarios` | escala_voluntarios | idem, no ramo `OR` | 0 nesse ramo |
| `ps_proprio` | perfil_servico | **editar a própria disponibilidade** | 0 |
| `user_update_consentimento` | consentimento | **registrar o próprio aceite LGPD** | 0 |
| `det_proprio_membro` | membros_detalhes | ler os próprios detalhes | 0 |

A última erra de outro jeito, e vale registrar: ela liga `profiles` a `membros`
**pelo e-mail**. O e-mail da conta é sintético — `5521983991229@app.diakonia`,
fabricado a partir do telefone —, e o e-mail real da pessoa vive em
`membros.email`. Medido: das 4 contas, **4 têm e-mail sintético e 0 casam** com
o e-mail de algum membro.

**O que isso custa hoje:** o voluntário não consegue confirmar a própria escala,
ninguém preenche a própria disponibilidade ("quando serve"), e o aceite de LGPD
não pode ser gravado pela própria pessoa. As três funcionalidades existem na
tela e são barradas em silêncio pelo banco — RLS que barra devolve *sucesso com
zero linhas*.

---

## 2. Uma tabela vazia sustentando onze políticas

`fn_meu_ministerio_id()` lê da tabela `liderancas`. **`liderancas` tem 0 linhas.**
A função devolve `NULL` para todo mundo, sempre.

**Onze políticas de RLS dependem dela** — entre elas
`lider_select_areas_proprias`, `lider_select_escalas_proprias`,
`lider_insert_evento_proprio` e `lider_update_evento_proprio`. Nenhuma libera
nada.

O sistema não quebrou porque existem políticas largas em paralelo
(`Autenticados leem areas`, `esc_select` com `true`). Ou seja: **a leitura
funciona apesar da função, não por causa dela.** O que não funciona é a
escrita — um líder não cria evento do próprio ministério.

A liderança real está preenchida, em outro lugar: `ministerios.lider_id`,
`vice_lider_id`, `co_lider_id` e `areas.lider_id`, `co_lider_id`, para os 11
ministérios. Foi de lá que o Painel de Ministério passou a ler.

**Duas saídas:** preencher `liderancas` a partir dessas colunas, ou reescrever a
função para lê-las. A segunda é menor e não cria uma terceira cópia do mesmo
fato.

---

## 3. Dois modelos para a mesma coisa

| assunto | vivo | dormente | divergem? |
|---|---|---|---|
| permissões | `role_permissoes` (101) | `permissoes_modulo` (72) | o segundo não é lido por ninguém |
| papel do usuário | `user_roles` | `profiles.role` | **sim, em 2 de 4 contas** |
| escalados | `escala_voluntarios` (12) | `escala_participantes` (0) | o segundo nunca foi usado |

A divergência de papel, medida:

```
Telma    profiles=admin     user_roles=admin        ok
Lourdes  profiles=NULO      user_roles=secretaria   diverge
Bruno    profiles=membro    user_roles=lideranca    diverge
Lúcio    profiles=diakonia  user_roles=diakonia     ok
```

`profiles.role` não deve ser lido — e ainda é escrito por `criarAcessoPessoa`.
Enquanto os dois campos existirem, alguém vai ler o errado.

---

## 4. Construído no banco e sem tela nenhuma

**23 tabelas** estão vazias *e* não são citadas por nenhum arquivo de `src/`:

```
bazar_reservas · congregacoes · documentos_fiscais · escala_participantes
fin_folha_competencias · fin_folha_lancamentos · fin_lancamento_rateio
fin_solicitacoes · gov_votos · liderancas · locais_historico_operacional
membros_detalhes · observacoes_pastorais_arquivadas · pessoa_cargo_estatutario
pessoas_cargos · pre_cadastros
pdv_caixa · pdv_estoque · pdv_fechamento · pdv_itens_venda · pdv_pagamentos
pdv_produtos · pdv_vendas
```

As sete `pdv_*` são um módulo inteiro — ponto de venda — modelado e nunca
construído. O CLAUDE.md já o registrava.

**15 das 30 views nunca são consultadas:**

```
v_dashboard_visitantes · v_diretoria_atual · v_estrutura_fisica
v_igrejas_ativas · v_membros_mapa · v_membros_perfil · v_meu_contexto
v_minha_escala · v_proximas_escalas · v_ranking_convidadores
v_visitantes_alerta · vw_agenda_igreja · vw_agenda_pastoral
vw_arr_reservas_publica · vw_ocupacao_local
```

---

## 5. Dado que existe e nenhum código lê

**16 tabelas têm conteúdo e nenhuma referência em `src/`.** Algumas são registro
de auditoria, escritas por gatilho, e está certo assim. Outras não:

| tabela | linhas | o que é |
|---|---|---|
| `permissoes_modulo` | 72 | o modelo de permissão morto |
| `convites_acesso` | 27 | convites de acesso |
| `modelos_ministerio` | 30 | modelos de ministério do regimento |
| `cargos_institucionais` | 21 | cargos da estrutura |
| `classificacao_campos` | 14 | classificação de campos |
| `niveis_organizacionais` | 7 | níveis do organograma |
| `cargos_estatutarios` | 6 | cargos do estatuto |
| `historico_lideranca` | 6 | histórico de quem liderou |
| `membros_excluidos_backup` | 154 | cópia de quem foi excluído |
| `unidades` / `predios` / `igrejas` | 5 / 1 / 1 | estrutura física |

**Ressalva honesta:** a busca foi por nome de tabela no código. Uma tabela lida
só através de view ou de RPC não apareceria. O número é um teto, não um veredito.

---

## 6. O que eu mesmo dupliquei

Auditando, encontrei três coisas que reimplementei tendo o original pronto. É o
defeito que o CLAUDE.md avisa na primeira linha da seção 9 — *"a chance de o que
você quer construir já existir é alta"* — e eu o cometi três vezes esta semana.

| o que escrevi | o que já existia | quem é melhor |
|---|---|---|
| `meuEspacoService.minhaSemana()` | **view `v_minha_escala`** | a view: traz `area_cor`, `ministerio_nome` e `hora_fim` |
| contagem de escalados em `painelMinisterioService` | **view `v_proximas_escalas`** | a view: separa `pendentes` de `recusados`; a minha junta |
| `meuEspacoService.meuPgm()` | `pgmService.sugerirPgmPorBairro()` + `listarGruposDaPessoa()` | o original: traz `qtd_membros` e `lider_nome` |

Nenhuma está errada, e as três funcionam — conferidas na tela. Mas são código a
mais para manter, e o dia em que a regra mudar num lado e não no outro já tem
precedente neste repositório.

**Recomendo trocar as três pelo que já existe**, e é trabalho pequeno.

---

## 7. Código sem chamador

`criarAcessoPessoa` era o caso mais grave — completa no serviço, chamada por
tela nenhuma, com o Painel de Acessos mandando "abrir a ficha da pessoa" para
uma porta que não existia. **Corrigido em 01/09**, e é o que permitiu criar o
acesso do Pastor Lúcio.

Restam **103 símbolos exportados de `services/` e `lib/` que nenhum outro
arquivo importa**. A maioria é constante usada só dentro do próprio arquivo —
ruído, não defeito. Os que merecem olhar:

- **`services/visitanteService.ts`** — `listarVisitantes`, `buscarHistorico`,
  `buscarAcompanhamentos`, `registrarAcompanhamento`, `tornarCongregado`,
  `tornarMembro`. Seis funções do coração do acolhimento, sem chamador — e não
  por desuso: **`pages/Visitantes.tsx` faz 4 consultas diretas ao banco e não
  importa o serviço.** É a §4.1 do CLAUDE.md acontecendo ("72 arquivos de
  `pages/` e `components/` falam com o banco direto"), só que aqui com o
  serviço pronto ao lado, ignorado.
- **`services/userService.ts`** — `criarUsuario`, `reenviarAcesso`,
  `resetarSenha`, `listarUsuarios` e mais cinco. Sobreposição direta com
  `acessoService`, que é o que a tela usa.
- **`services/folhaService.ts`** — sete funções de folha de pagamento, módulo
  que a igreja ainda não usa.

E **dois componentes que ninguém importa**: `membros/AcessosDashWidget.tsx` e
`membros/VisitantesDashWidget.tsx`.

---

## 8. Os riscos do CLAUDE.md, remedidos hoje

| risco | como estava | agora |
|---|---|---|
| 1 · `tsc` sem `-p` não verifica nada | aberto | aberto — sem script no `package.json` |
| 3 · `confirm()` nativo em WebView | 39 | **39** — nenhum convertido |
| 4 · escrita barrada em silêncio | ~52 de 288 | **151 escritas, 42 com `conferir()`** |
| 5 · guarda de rota | 9 de 76 rotas | **20 de 78** — 11 acrescentadas em 01/09 |
| 9 · duplicações estruturais | 4 | 4, e mais 3 que eu criei (§6) |
| 10 · pacote grande | sem `manualChunks` | igual |
| — · CI | não existe | não existe |

O número de escritas subiu de 288 para… não dá para comparar: a contagem antiga
media outra coisa. O que se pode dizer é o de hoje: **151 escritas ao banco, 42
conferidas**. As outras 109 podem falhar em silêncio.

---

## 9. Pendências da semana, ainda abertas

**Do sistema**

- O **Bruno perdeu o Painel Pastoral** quando a liderança saiu da lista. Se não
  era a intenção, é uma linha em `ROLES_PAINEL_PASTORAL`.
- A **senha do Pastor Lúcio não foi enviada**. A conta existe, o papel está
  certo, e ele não consegue entrar até alguém clicar em *Reenviar* no Painel de
  Acessos.
- **Nenhuma das 20 áreas tem checklist**, e há 2 escalas futuras no sistema
  inteiro. O Painel de Ministério está pronto e vazio.
- O login do pastor titular **nunca foi testado com sessão real** — só simulado
  com "Ver como", que troca papéis e não identidade.

**Do cadastro**

- **Joice Fernanda Da Silva** — o `14/06` de nascimento é real? Ele apareceu
  duas vezes em 28/08, e a segunda não foi por mim.
- **Andrea dos Santos da Cunha** — a matrícula de EBD desativada em 28/08 deve
  voltar?
- **Leonardo Pereira Vieira** — falecido em 19/08, saída sem assinatura.

**Do calendário**

- Duas séries seguem vencidas: *Ensaio Jovens* (até 24/07) e *Vigília de Oração
  pelas Famílias* (até 29/05). Podem ter mesmo acabado.

---

## 10. Se fosse para escolher três

> **As três foram feitas em 01/09/2026, logo após este levantamento.** O que
> segue é o que se pediu; abaixo de cada uma, o que de fato aconteceu.


1. **Consertar as cinco políticas de conta≠ficha.** É o defeito com maior
   alcance, custa uma migration, e desbloqueia coisas que a igreja pensa que
   tem: confirmar escala, dizer quando pode servir, aceitar a LGPD.

2. **Resolver `liderancas` vazia.** Onze políticas dependem de uma tabela sem
   linhas. Enquanto isso, nenhum líder cria evento do próprio ministério.

3. **Trocar meu código duplicado pelas views que já existiam** (§6). Pequeno,
   e evita que o repositório carregue duas versões da mesma conta.

---

## 11. O que foi feito depois deste levantamento

**As cinco políticas de conta ≠ ficha** — migration `20260901180000`, aplicada.
Todas passaram a comparar com `minha_pessoa_id()`. Ensaiado com ROLLBACK sob a
identidade da administradora: `perfil_servico` devolveu 1 linha, que a política
antiga jamais teria liberado.

**A tabela `liderancas` vazia** — migration `20260901190000`, aplicada. Em vez
de preencher uma terceira cópia da liderança, as funções passaram a ler as
colunas que a igreja já mantém:

- `fn_meus_ministerios()` — os ministérios que a pessoa lidera, SETOF uuid
- `fn_minhas_areas()` — as áreas que lidera, mais as dos ministérios que lidera
- `fn_meu_ministerio_id()` — mantida, agora lendo o lugar certo

As onze políticas passaram de `=` para `IN`. **A troca importa:** 3 das 24
pessoas que lideram lideram mais de um ministério, e com `=` elas teriam
acesso a metade.

Conferido com um líder real: o Pastor Lúcio alcança o Ministério Pastoral e a
área dele. A função antiga, que devolvia nulo para todos, voltou a responder.

**O código duplicado** — trocado pelas views e serviços que já existiam:

| era | virou |
|---|---|
| JOIN à mão em `escala_voluntarios` | view `v_minha_escala` |
| contagem de escalados no painel | view `v_proximas_escalas` |
| consulta própria de PGM + comparação de bairro | `listarGruposDaPessoa()` e `sugerirPgmPorBairro()` |

Dois ganhos além de menos código: a view separa **pendente de recusado**, que
a contagem manual juntava; e o filtro manual descartava `status` em
`["recusado", "cancelado", "removido"]` — os dois últimos **não existem** no
enum, então dois terços daquele filtro não filtravam nada.

`v_proximas_escalas` ganhou `ministerio_id` e `area_id` no fim (migration
`20260901200000`): sem eles, filtrar o painel de um ministério exigiria casar
pelo NOME. `listarGruposDaPessoa()` passou a trazer o grupo inteiro, e não só
o nome — era por isso que não servia.

Conferido na tela: o painel de Comunhão mostra os mesmos 2 escalas, "sem
ninguém" e "0/1", e os mesmos 44 voluntários de antes da troca.
