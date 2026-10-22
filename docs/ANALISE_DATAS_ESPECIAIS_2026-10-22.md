# Datas Especiais e Calendários Institucionais — análise

22/10/2026 · só análise, nada implementado.

Pergunta: a área **Identidade da Igreja** já pode virar a central de fontes
institucionais que alimenta a Agenda automaticamente com datas especiais?

Resposta curta: **em parte.** A Identidade já sabe *quais instituições a igreja
segue* — e é isso que deve decidir quais calendários aparecem. Mas ela **não
guarda calendário nenhum** e **não consome nada de fora**. Quem guarda as datas
hoje é o código da Agenda, que já tem feriados nacionais e 39 datas da CBB
calculadas por regra. Ninguém ligou as duas coisas.

---

## 1. O que já existe

### 1.1 Identidade da Igreja (`/admin/identidade`, `IdentidadeAdmin.tsx`)

| Bloco | Onde fica | Campos de URL |
|---|---|---|
| Dados institucionais | `identidade_igreja` (1 linha) | `logo_url`, `site_oficial` |
| Redes sociais | `identidade_igreja.redes_sociais` (JSONB) | `url` por plataforma (Instagram, Facebook, YouTube, TikTok, WhatsApp, Telegram, Spotify, Outro) |
| Valores | `identidade_valores` | — |
| Instituições vinculadas | `instituicoes` + `igreja_instituicoes` (N:N) | `instituicoes.site_oficial` |

Outros campos úteis: `fundada_em` (data de fundação), `pastor_id`, `resumo`.

A tabela `instituicoes` veio com seed de CBB, JMM, JMN, CBERJ, ABB e outras, com
`tipo_instituicao` (`denominacao` | `missoes` | `organizacao` | `outro`),
`oficial` e **`permite_integracao`**.

### 1.2 Integrações existentes

- **`permite_integracao` nunca é lido.** Aparece só no tipo da tabela e nos
  retornos de `autocomplete_instituicoes` / `buscar_instituicao_similar`; nenhum
  código decide nada com ele, e o padrão é `false`. A intenção de integrar
  existiu; a integração não.
- Chamadas externas do sistema hoje: ViaCEP e Nominatim (endereço), Resend
  (e-mails das funções `resumo-*` e `alerta-*`). **Nenhuma** lê site,
  calendário, RSS ou iCal de instituição.
- Não existe campo para URL de calendário (iCal/Google Calendar/RSS), nem
  rotina agendada que busque algo, nem tabela de "fonte".

### 1.3 Calendário institucional — já existe, mas no código

`src/lib/agenda/externalEvents.ts`:

- **Feriados nacionais** calculados (com Páscoa por algoritmo): 13 datas.
- **Calendário da CBB**: 39 datas guardadas como **regra** ("2º domingo de
  junho"), não como dia. Cada uma traz a data oficial de 2026 e um teste
  (`externalEvents.test.ts`) exige que a regra a reproduza. Isto foi feito em
  26/08/2026 porque a versão anterior, com dia fixo, tinha **todas** as datas
  denominacionais erradas.
- Já incluídas: Dia do Pastor, Dia da Bíblia, Dia de Missões Mundiais (JMM),
  Dia de Missões Nacionais (JMN), 7 dias de Oração pela Pátria, Dia Batista de
  Oração Mundial, Dia do Missionário Batista, Dia da Reforma Protestante, Dia do
  Diácono, Dia da EBD, Dia do Jovem/Adolescente/Criança Batista etc.
- Ficaram de fora **de propósito**: assembleias de outras convenções estaduais
  e as campanhas de mês inteiro ("viram 30 linhas na agenda e afogam o que tem
  dia marcado").

Quem consome `eventosExternos`:

| Tela | Uso |
|---|---|
| Agenda (`Eventos.tsx`) | Categorias `feriado` e `batista`, com filtro por categoria (salvo no navegador) |
| Mesa Principal — Agenda do Dia (`AgendaDoDia.tsx`) | Hoje e amanhã |
| Minha agenda da semana (`AgendaDaSemana.tsx`) | Semana |
| Impressão da Agenda | Sim |
| Painel Pastoral | **Retirado de propósito**: "não são celebração de ninguém — são contexto do calendário" |
| Resumo Semanal / Diário (e-mail) | **Não aparece** |

Categorias atuais da Agenda: `igreja`, `batista`, `feriado`, `aniversario`,
`casamento`, `arrecadacao`.

### 1.4 Datas de pessoas (efemérides)

Aniversário, bodas, anos de membresia e anos de pastorado vêm do banco
(`agendaPastoralService`) e alimentam "Ações de hoje" com o "já felicitei"
gravado em `visita_historico`. É o mecanismo que um "Dia do Médico" com
destinatário reaproveitaria.

### 1.5 Profissão — não existe para membros

`profissao` existe **só** em `diaconia_pessoas_assistidas` (ficha
socioeconômica). A ficha de `membros` não tem profissão. Sem isso, "Dia do
Médico" é só uma data no calendário — não dá para dizer **quem** cumprimentar.

---

## 2. O que pode ser reaproveitado

1. **`igreja_instituicoes` como interruptor.** "A igreja é vinculada à CBB" →
   mostra datas da CBB; "vinculada à JMM" → mostra datas da JMM. Hoje as 39
   datas aparecem para qualquer igreja, vinculada ou não. Isto é exatamente o
   papel que a Identidade pode cumprir: *quem* a igreja segue.
2. **`instituicoes.site_oficial`** como link "Fonte" em cada data (de onde ela
   veio), e para a conferência anual.
3. **`identidade_igreja.fundada_em`** → aniversário da igreja (categoria
   Institucional) sem cadastro novo.
4. **O motor de regras** (`fixa`, `nth`, `ultima`) já cobre quase tudo:
   Dia das Mães (2º dom. de maio), Dia dos Pais (2º dom. de agosto), datas
   profissionais (fixas em lei).
5. **O filtro de categorias da Agenda** já existe — acrescentar categoria é
   acrescentar opção, não tela.
6. **O padrão "já felicitei"** (`visita_historico`) para datas profissionais,
   quando houver profissão no cadastro.

---

## 3. Limitações da estrutura atual

| Limitação | Consequência |
|---|---|
| A CBB publica o calendário **só em HTML** (página "Atividades 2026"; existe link para "Atividades 2027"). Sem iCal, RSS, PDF estruturado ou API. | "Aparecer automaticamente" exigiria raspar HTML — quebra calado quando o site muda, e erra exatamente do jeito que o código antigo errava: uma data plausível e errada. |
| Identidade não tem campo de URL de calendário nem rotina que busque | Nada a consumir mesmo que houvesse feed |
| `permite_integracao` é um booleano sem semântica | Não diz *o quê* integrar |
| Regras não sabem "relativo à Páscoa" | Calendário cristão (Cinzas, Ramos, Pentecostes, Ascensão, Advento) não cabe sem um tipo novo de regra — o cálculo da Páscoa já existe |
| Datas só mudam com publicação do app | Secretaria não consegue acrescentar "Dia do Ministério Feminino da QIBRJ" sozinha (para isso servem os eventos próprios da categoria `igreja`) |
| Datas não são ligadas à instituição | Não dá para ligar/desligar JMM separado de CBB |
| Membros sem profissão | Datas profissionais não têm destinatário |
| **Falta o Dia da Consciência Negra (20/11)** na lista de feriados | Feriado nacional desde a Lei 14.759/2023; a lista do código não tem. Afeta também a Tesouraria (dia sem banco) |
| Não há feriados estaduais/municipais (RJ: São Sebastião 20/01, São Jorge 23/04) | Mesmo efeito em vencimentos |

---

## 4. Melhor arquitetura

Separar três papéis que hoje estão misturados ou ausentes:

```
IDENTIDADE (quem a igreja segue)        CATÁLOGO (o que cada um celebra)      MÓDULOS (onde aparece)
igreja_instituicoes  ── liga/desliga ─▶ datas por regra + categoria +    ─▶ Agenda, Mesa, Resumo,
fundada_em                               instituição de origem + fonte         Pastoral, Tesouraria…
                                                                              conforme a categoria
```

- **Identidade = interruptor e procedência.** Vincular a CBB liga as datas da
  CBB. O `site_oficial` vira o link de fonte.
- **Catálogo = regras curadas e testadas**, como já é feito com a CBB.
  Cada data ganha: `categoria`, `instituicao` (sigla, opcional), `regra`,
  `dias`, `fonte`. Inclui um tipo de regra `pascoa` (+/- dias).
- **Visibilidade por módulo** definida por categoria, com padrão no código; o
  usuário continua podendo filtrar na Agenda.
- **Campanhas de mês inteiro** viram *faixa de contexto* no topo do mês
  (ex.: "Março — Mês de Missões Mundiais"), não 30 linhas.

### Categorias — sim, faz sentido, com um ajuste

| Categoria | Exemplos | Origem |
|---|---|---|
| Eclesiásticas | Páscoa, Pentecostes, Advento, Natal, Reforma Protestante | Regra (Páscoa) — universal |
| Denominacionais | Dia do Pastor, Dia da Bíblia, Dia Batista de Oração, Missões Mundiais/Nacionais | Por instituição vinculada (CBB, JMM, JMN, CBERJ) |
| Profissionais | Médico 18/10, Professor 15/10, Enfermeiro 12/05, Assistente Social 15/05, Advogado 11/08, Psicólogo 27/08, Administrador 09/09, Contador 22/09, Servidor Público 28/10 | Fixas |
| Familiares e sociais | Mães, Pais, Mulher, Criança, Idoso (01/10), Juventude | Fixas/regra |
| Cívicas | Feriados nacionais (+ estaduais/municipais) | Cálculo local |
| Institucionais da Igreja | Aniversário da igreja, eventos próprios | `fundada_em` + `eventos` |

O ajuste: **"é feriado" deve ser um atributo, não só uma categoria** — Tesouraria
precisa saber "não há expediente bancário", não "é data cívica". Dia da Criança
(12/10) é familiar *e* cai em feriado; Dia do Professor não é feriado.

Duas observações honestas sobre a lista pedida: "Dia da Juventude" tem mais de
uma data em uso (internacional da ONU em 12/08; o Dia do Jovem Batista da CBB é
o 3º domingo de agosto) — escolher uma. E Dia da Reforma hoje está marcado como
CBB; mudaria para Eclesiástica.

---

## 5. Onde cada categoria deve aparecer (proposta)

● = aparece por padrão · ○ = disponível, desligado por padrão · — = não aparece

| | Eclesiástica | Denominacional | Profissional | Familiar | Cívica/feriado | Institucional |
|---|---|---|---|---|---|---|
| Agenda | ● | ● | ○ | ● | ● | ● |
| Mesa Principal (hoje/amanhã) | ● | ● | ○ ¹ | ● | ● | ● |
| Resumo Semanal (e-mail) | ● ² | ● ² | — | ● ² | ● | ● |
| Painel Pastoral | — | — | ● ¹ | — | — | — |
| Secretaria (comunicação/boletim) | ● | ● | ● | ● | ○ | ● |
| Tesouraria | — | ○ ³ | — | — | ● ⁴ | — |
| Relacionamento | — | — | ● ¹ | ● | — | — |
| Aniversariantes e Comunicações | ○ | ○ | ● | ● | — | ● |

1. Só faz sentido **com destinatário**: "Dia do Médico — 4 médicos na igreja".
   Exige profissão no cadastro de membros (decisão abaixo). O Painel Pastoral
   tirou feriados/CBB de propósito; essa regra continua: só entra data que tem
   *pessoa* para cuidar.
2. **Com antecedência, não na semana.** Dia das Mães, Missões Mundiais, Dia da
   Bíblia se preparam com 3–4 semanas. No Resumo, o bloco útil é "Próximas datas
   (4 semanas)", não "datas desta semana".
3. Campanhas missionárias (JMM em março, JMN em setembro) ligam com o Fundo
   Missionário e as ofertas — contexto para a Tesouraria.
4. Feriado = dia sem banco: afeta vencimentos, débito automático e o
   acompanhamento "aguardando o banco". É o uso mais concreto para a Tesouraria.

---

## 6. As três opções

| Opção | Veredito |
|---|---|
| **Apenas Identidade da Igreja** | Não resolve. Ela não tem datas nem como obtê-las; as fontes não publicam feed. |
| **Identidade + calendário próprio** | **Recomendada.** Identidade liga/desliga e dá a fonte; catálogo curado com regras testadas (já existe para a CBB). Funciona offline, não quebra, não depende de terceiros. Custo: conferir 1×/ano quando a CBB publica o ano seguinte (a página "Atividades 2027" já existe). |
| **Identidade + API externa** | Hoje não há API para o que importa. BrasilAPI (`/api/feriados/v1/{ano}`) só dá feriados nacionais — que o sistema já calcula. CBB/JMM/JMN/CBERJ só publicam HTML. Raspar site seria frágil. Vale **deixar a porta aberta**: se uma instituição publicar iCal, um campo `calendario_url` na instituição e uma leitura agendada resolvem — mas não construir isso antes de existir o feed. |

---

## 7. Como outras igrejas costumam tratar

Pelo que é comum nos sistemas de gestão de igreja (não fiz levantamento
produto a produto):

- O calendário denominacional é **digitado pela secretaria uma vez por ano**, a
  partir do PDF/página da convenção, como eventos comuns. Funciona, mas repete
  o trabalho todo ano e erra quando alguém copia o dia do ano anterior — o
  defeito que o Diakonia já teve.
- Feriados vêm de uma **biblioteca embutida** no sistema ou de um Google
  Calendar público de feriados assinado.
- Quando há integração, é **assinatura de iCal/Google Calendar** — não API.
- Datas profissionais quase nunca estão no sistema; ficam na cabeça de quem faz
  o boletim ou numa planilha de comunicação.

O Diakonia já está à frente no ponto mais difícil (regra + teste contra a data
oficial). O que falta é ligar isso à Identidade e às categorias.

---

## 8. Recomendação final

**Identidade da Igreja como central de *quem a igreja segue*; catálogo próprio,
curado e testado, como central de *quais datas*. Sem API externa por ora.**

Em etapas, quando ela decidir seguir:

1. **Sem tabela nova.** Ampliar o catálogo em código: categorias, tipo de regra
   relativa à Páscoa, datas profissionais/familiares/eclesiásticas, Consciência
   Negra, aniversário da igreja a partir de `fundada_em`; ligar datas
   denominacionais aos vínculos de `igreja_instituicoes`; faixa de contexto para
   campanhas de mês.
2. **Módulos.** Padrões por categoria (tabela da seção 5); bloco "Próximas
   datas" no Resumo Semanal; feriados na Tesouraria.
3. **Só se houver necessidade real:** tabela de datas editável pela secretaria
   (datas próprias que não são evento), e `calendario_url` na instituição se
   alguma publicar iCal.

### Decisões dela

1. Datas profissionais com destinatário exigem **profissão no cadastro de
   membros** (campo novo na ficha). Quer isso, ou datas profissionais só como
   lembrete de comunicação?
2. Feriados **estaduais e municipais do RJ** entram (afetam a Tesouraria)?
3. Datas denominacionais passam a depender do vínculo em Identidade (desvincular
   a CBB esconde as datas da CBB)?
4. Datas profissionais aparecem **desligadas por padrão** na Agenda?
5. Qual "Dia da Juventude" usar?

---

Fontes: código (`externalEvents.ts`, `IdentidadeAdmin.tsx`,
`supabase/baseline/schema.sql`, `20260528_identidade_digital.sql`); página da
CBB "Atividades 2026" (convencaobatista.com.br, lida em 22/10/2026: só HTML);
BrasilAPI — referências secundárias ao endpoint de feriados. O banco não foi
consultado: o token de acesso à API de gerenciamento está inválido.
