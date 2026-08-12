# Testes de layout (Playwright)

## Para que servem

Pegam defeitos que só existem quando há layout de verdade. São dois arquivos:

| | |
|---|---|
| `transbordo.spec.ts` | conteúdo que passa da borda em 375px |
| `alvos-de-toque.spec.ts` | alvo clicável abaixo de 24px (WCAG 2.2 SC 2.5.8) |

O `vitest` do projeto roda em **jsdom, que não calcula layout**:
`getBoundingClientRect()` devolve zero em tudo. Um teste de transbordo escrito
em jsdom passaria sempre, inclusive nas seis vezes em que o defeito era real
neste projeto.

Por isso estes ficam em `e2e/` e rodam em Chromium. Os dois mundos não se
atrapalham: o `vitest.config.ts` só inclui `src/**`.

## Rodar

```bash
npm run test:layout
```

Ele sobe o `npm run dev` sozinho (ou reaproveita um já de pé) e percorre 23
rotas em 375px.

## Credenciais

As rotas estão atrás de login. Defina duas variáveis de ambiente — o login do
app é **por telefone**, não por e-mail:

```bash
E2E_TELEFONE=21999999999
E2E_SENHA=...
```

Use uma **conta de teste**, não a sua. Sem elas o teste não falha: ele se pula
com a mensagem dizendo o que falta, porque configuração ausente não é defeito
no produto.

Se essa conta nunca entrou no sistema, o app manda para `/aceite-lgpd`. Entre
uma vez à mão e aceite a política — o teste não aceita termos no seu lugar.

O arquivo `e2e/.sessao.json` guarda um token de acesso válido. Está no
`.gitignore` e não deve sair da máquina.

## Quando um teste falhar

A mensagem já aponta os três primeiros elementos que passam da borda, com
classe, largura e o texto dentro. As duas causas prováveis, nesta ordem:

1. **`min-w-0` faltando** num item de flex ou grid. Item de flex/grid não
   encolhe abaixo da largura `min-content` do próprio conteúdo — é o padrão do
   CSS, não um bug do navegador. Já aconteceu em `AppLayout`,
   `AlertasInteligentes`, `AcoesDoDia`, `Pessoas`, `Famílias` e
   `VisitanteCard`.

2. **Um filho com `truncate`** (que traz `white-space: nowrap`) esticando o pai.
   `<button>` é `inline-block` e encolhe-para-caber, então um `<h3 truncate>`
   dentro dele estica o botão até a largura do texto inteiro. Resolve com
   `block w-full` no botão.

Um `trace` e uma captura de tela ficam em `test-results/` quando falha.

## Por que medir elemento por elemento

O reflexo é comparar `document.scrollWidth` com `clientWidth`. **Não serve
neste app**, e a razão vale entender porque muda o raciocínio inteiro:

O `<main>` deste layout é `overflow-x-hidden` — está lá para a página nunca
rolar de lado. Consequência: **nada aqui "vaza". Tudo é cortado.** O documento
nunca rola na horizontal, o `scrollWidth` fica sempre limpo, e o conteúdo largo
demais simplesmente **desaparece na borda**.

Foi assim que "os nomes dos cards não cabem" apareceu: o nome não vazava para
fora da tela — ele sumia. No defeito de Famílias o cartão media 593px numa tela
de 375px e o `scrollWidth` do documento não acusou nada.

Por isso a medida é a posição de cada elemento, não o scroll do documento.

## Truncagem intencional vs. corte pelo casco

`getBoundingClientRect()` devolve a caixa de **layout** e ignora recorte. Isso
cria duas situações que medem igual e são opostas no produto:

| | |
|---|---|
| `<span>` dentro de `<li class="truncate">` | O `li` corta e mostra reticências. **É o comportamento pedido.** |
| Cartão largo demais dentro de `<main>` | O `main` corta também — mas aqui o corte **é** o defeito. |

A regra do teste: só conta como truncagem intencional o ancestral que corta e
está **abaixo do `<main>`**. O corte do próprio casco não absolve ninguém.

Sem essa distinção o teste reprovava `/hoje` por um `<span>` de 149px dentro de
um `<li class="truncate">` que terminava dentro da tela — falso positivo, e
falso positivo é o que faz uma equipe apagar o teste em vez de consertar o
produto.

## Alvos de toque

O piso é **24px** (WCAG 2.2 SC 2.5.8, nível AA), e não os 44px que o projeto
adota nas telas principais. 44px é a meta de conforto; 24px é a linha que não
se cruza. Um teste exigindo 44 reprovaria coisas legitimamente densas e viraria
ruído — e teste ruidoso acaba desligado.

Três armadilhas, todas encontradas medindo:

1. **Alvo esticado por pseudo-elemento.** Em Famílias e Ministérios o título do
   cartão é um `<button>` de 28px cujo `::after` cobre o cartão inteiro
   (336×80). Medir só a caixa acusaria 46 violações inexistentes. O tamanho
   efetivo considera `::after`/`::before` absolutos.

2. **Amostrar pontos com `elementFromPoint` é instável.** Parece mais fiel, mas
   numa lista rolável a barra inferior fixa cobre transitoriamente o que estiver
   embaixo: o mesmo botão passa e reprova conforme a rolagem. Medida geométrica
   é determinística.

3. **Link dentro de frase é isento pela própria norma.** Em `/usuarios` há um
   `<a>Pessoas</a>` de 56×17 no meio de "Para criar acesso, abra a ficha da
   pessoa em Pessoas". Reprovar isso obrigaria a inchar texto corrido.

### Quando falhar

Duas saídas, nesta ordem:

1. Aumentar o alvo — `h-11` (44px) é o padrão das telas principais.
2. Quando o desenho precisa continuar pequeno, esticar só a **área**:

```
relative after:absolute after:-inset-2 after:content-['']
```

O `::after` é absoluto, então não ocupa espaço e nada no layout muda. Foi o que
resolveu as checkboxes de 16px da chamada da EBD: desenho igual, área de toque
de 30px.
