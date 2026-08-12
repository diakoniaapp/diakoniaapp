# Testes de layout (Playwright)

## Para que servem

Pegam defeitos que só existem quando há layout de verdade — transbordo
horizontal, alvo de toque pequeno demais, sobreposição. O `vitest` do projeto
roda em **jsdom, que não calcula layout**: `getBoundingClientRect()` devolve
zero em tudo. Um teste de transbordo escrito em jsdom passaria sempre, inclusive
nas seis vezes em que o defeito era real neste projeto.

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

O reflexo é comparar `document.scrollWidth` com `clientWidth`. **Não serve.**
Quando o transbordo acontece dentro de um ancestral com `overflow-hidden` — o
caso comum neste layout — o documento não rola de lado e o `scrollWidth` fica
limpo, enquanto o conteúdo está cortado na borda. No defeito de Famílias o
cartão media 593px numa tela de 375px e o `scrollWidth` do documento não acusou
nada. Aqui a medida é a posição de cada elemento.
