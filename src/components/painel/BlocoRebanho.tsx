// ─── BlocoRebanho.tsx — a contagem geral, e a forma do rol ─────────────────
//
// ── O NOME ─────────────────────────────────────────────────────────────────
//
// Nasceu "BlocoMembresia", dentro de uma seção chamada "A membresia", e as
// duas coisas estavam erradas: **membresia é o rol — só os membros**, e a
// seção abre o rebanho inteiro, com os congregados e os visitantes ativos.
// Corrigido a pedido da Telma em 26/08/2026.
//
// A distinção não é preciosismo de vocabulário: o título dizia 225 sobre uma
// seção cuja primeira linha listava 293 pessoas.
//
// ── TRÊS COMPONENTES, DESDE 09/09/2026 ──────────────────────────────────────
//
// Até aqui, um `BlocoRebanho` só reunia a frase geral e os dois quadros de
// detalhe na mesma seção do Painel Pastoral. Pedido dela, no mesmo dia, em
// dois passos:
//
//   1. "o rebanho deve ser a contagem geral de pessoas (para o pastor)" — os
//      dois quadros, que eram estatística de ROL FORMAL, foram para o Painel
//      da Secretaria, que já cuida de cadastro e governança.
//   2. "o grafico deve estar no painel pastoral tbm, porem com contagem
//      geral" — os MESMOS dois quadros voltaram ao Painel Pastoral, mas
//      contando todo mundo (membros + congregados + visitantes ativos), não
//      só o rol. Não é o quadro antigo de volta: é a mesma visualização,
//      sobre outra população.
//
//   `ResumoRebanho` — a frase geral (membros + congregados + visitantes),
//   no Painel Pastoral. "Quantas pessoas a igreja acompanha."
//
//   `DetalheDoRol` — os dois quadros sobre o ROL FORMAL, no Painel da
//   Secretaria — composição para assembleia, quem entrou/saiu do rol.
//
//   `DetalheDoRebanho` — os mesmos dois quadros sobre o REBANHO inteiro, no
//   Painel Pastoral, logo abaixo de `ResumoRebanho`.
//
//   **A forma** — pirâmide etária cruzada com sexo, e a leitura dela em três
//   números. Responde "para quem estamos pregando" (ou, no rebanho inteiro,
//   "para quem a igreja já está olhando").
//
//   **O movimento** — entradas acima do eixo, saídas abaixo.
//
// Os dois quadros ganharam uma prop, `geral`, que troca a população nos
// rótulos e nos textos — ver o comentário de `DetalheDoRebanho` para o
// porquê de ela morar nos quadros, e não aqui em cima.
//
// ── A REGRA DESTE ARQUIVO: O QUE NÃO SE SABE APARECE ───────────────────────
//
// Os dois quadros têm buracos grandes no dado, e nenhum dos dois os esconde:
//
//   · **35 dos 226 membros não têm data de nascimento** (15%). A pirâmide é
//     desenhada sobre 191, e diz isso embaixo — inclusive nas porcentagens,
//     cujo denominador é 191 e não 226.
//   · **66 dos 226 não têm ano de entrada** (29%). O gráfico de movimento
//     cobre 160, e a barra de cobertura em cima dele mostra a proporção
//     ANTES de qualquer barra de ano ser lida.
//
// A alternativa — calcular sobre quem tem dado e não mencionar o resto — foi
// descartada por ser exatamente o defeito que a ficha da pessoa acabou de
// perder: número verdadeiro apresentado como se fosse completo.
//
// ── POR QUE A COBERTURA É BARRA, E NÃO UMA BARRA "SEM ANO" NO GRÁFICO ──────
//
// A primeira ideia foi pôr "sem ano registrado" como mais uma barra ao lado
// dos anos. Não funciona: são 67 contra um pico anual de 17. A barra dos
// sem-ano ficaria quatro vezes mais alta que a maior, e as dez barras de ano
// — que são o assunto do quadro — virariam tocos ilegíveis.
//
// A barra de cobertura resolve os dois: fica ACIMA do gráfico, então a lacuna
// é lida antes dos anos, e não disputa escala com eles.

import { Users2, ArrowUpDown } from "lucide-react";
import type { IndicadoresMembresia, PessoaNaFaixa } from "@/services/rolDeMembrosService";
import { ANOS_NA_JANELA } from "@/services/rolDeMembrosService";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
// O nome abre a ficha em modo consulta — sem lápis de edição, como no bloco
// de candidatos logo acima nesta mesma tela.
import { NomePessoa } from "@/components/membros/ficha";

/**
 * "2016-05-18" → "18/05/2016". Só para as listas de "antes da janela": elas
 * cruzam décadas, e "18/05" sozinho não diz de qual ano — ao contrário das
 * listas por barra, onde o ano já está dito pela barra que abriu o cartão.
 *
 * Fatia a string em vez de passar por `Date`, pelo mesmo motivo do `diaEMes`
 * no serviço: a coluna é `date`, sempre "AAAA-MM-DD", e um `new Date` aqui
 * reabriria a armadilha do fuso.
 */
function comAno(iso: string): string {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Um trecho de gráfico que abre a lista de quem está nele.
 *
 * Nasceu dentro da pirâmide e saiu para cá quando o gráfico de movimento
 * pediu a mesma coisa: são duas telas com a mesma pergunta — "quem são?" —
 * e duas cópias seriam duas listas que um dia divergem no formato.
 *
 * ── POR QUE HoverCard, E NÃO Tooltip ───────────────────────────────────────
 *
 * Tooltip fecha quando o cursor sai do gatilho, e o ponteiro nunca alcança os
 * nomes. `HoverCard` mantém o cartão aberto enquanto o cursor caminha para
 * dentro dele, que é o que permite CLICAR num nome.
 *
 * O primitivo já existia em `components/ui/hover-card.tsx` e nunca tinha sido
 * usado por ninguém — mais um dos objetos dormentes deste projeto.
 *
 * ── O GATILHO É UM BOTÃO ───────────────────────────────────────────────────
 *
 * `HoverCard` abre por hover **e por foco**; com um botão, quem navega por
 * teclado chega com Tab, e no celular — onde hover não existe — o toque dá
 * foco e abre. Sem isso o recurso seria só para quem tem mouse.
 */
function CartaoDeNomes({
  itens, rotuloAria, align, className, children, larguraQuando = "w-[2.6rem]",
}: {
  /**
   * `quando` abre a linha, `detalhe` a fecha.
   *
   * A pirâmide manda só `detalhe` (a idade); os dois gráficos de movimento
   * mandam `quando` (o dia e o mês), e a saída manda os dois — a data na
   * frente e o motivo atrás.
   */
  itens: { id: string; nome: string; quando?: string; detalhe?: string }[];
  /** O que o leitor de tela ouve antes de abrir. */
  rotuloAria: string;
  align: "start" | "center" | "end";
  /** As classes do gatilho — ele é a própria célula do gráfico. */
  className: string;
  children: React.ReactNode;
  /**
   * A largura da coluna de `quando`. O padrão cabe "07/08" — dia e mês,
   * que é o que toda barra do gráfico manda, porque o ANO já está dito
   * pela própria barra em que o cartão foi aberto.
   *
   * As listas de "antes da janela" (`ent.pessoasAnteriores` etc.) são a
   * exceção: cruzam décadas, então precisam do ano na própria linha — sem
   * ele, "18/05" ao lado de "07/10" não diz se são o mesmo ano ou não.
   * Pedido dela em 09/09/2026, vendo a lista sem ano: "coloque o ano".
   */
  larguraQuando?: string;
}) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
          aria-label={rotuloAria}
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent align={align} className="w-80 p-3">
        {/* SEM CABEÇALHO, de propósito. Ele repetia o número, o recorte e o
            lado — todos a centímetros do cursor que acabou de apontar para
            eles. O `aria-label` do gatilho continua dizendo tudo: ali não é
            repetição, é a única forma de quem usa leitor de tela saber o que
            está prestes a abrir.

            ── Por que os nomes QUEBRAM, e não truncam ──────────────────
            "Maralice Leal Marques Moutin…" não é um nome: é a metade de um.
            Truncar serve para coluna de tabela, onde a linha tem outros
            dados; aqui o nome É o conteúdo. Medido no rol: o maior tem 46
            caracteres, a mediana 25, e só 6 de 215 passam de 40 — a maioria
            cabe numa linha e um punhado usa duas.

            Rola quando a lista é grande: 60–74 tem 35 mulheres. Sem teto o
            cartão passaria da altura da janela. */}
        {/* A data numa COLUNA fixa, e não solta no meio do texto.
            `tabular-nums` mais uma largura fixa alinham "07/08" debaixo de
            "31/12": numa lista ordenada por data, ela é a coluna que se
            percorre, e serrilhada obriga a reler cada linha. O nome fica
            num bloco próprio para poder quebrar sem passar por baixo da
            data. */}
        <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {itens.map(p => (
            <li key={p.id} className="text-xs leading-snug flex gap-1.5">
              {p.quando && (
                <span className={`text-muted-foreground tabular-nums shrink-0 ${larguraQuando}`}>
                  {p.quando}
                </span>
              )}
              <span className="min-w-0">
                <NomePessoa id={p.id} nome={p.nome} somenteLeitura />
                {p.detalhe && (
                  <span className="text-muted-foreground whitespace-nowrap"> · {p.detalhe}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * O lado de uma faixa: o número, a barra, e quem está ali dentro.
 *
 * ── POR QUE HoverCard, E NÃO Tooltip ───────────────────────────────────────
 *
 * O `title` que havia aqui dizia "35 mulheres de 60–74" e parava nisso. A
 * pergunta seguinte — "quem são?" — não tinha resposta na tela: era preciso ir
 * ao catálogo, filtrar por idade (o que não existe) e cruzar com o sexo.
 *
 * Tooltip não serve para isto: fecha quando o cursor sai do gatilho, e o
 * ponteiro nunca alcança os nomes. `HoverCard` mantém o cartão aberto enquanto
 * o cursor caminha para dentro dele, que é o que permite CLICAR num nome.
 *
 * O primitivo já existia em `components/ui/hover-card.tsx` e nunca tinha sido
 * usado por ninguém — mais um dos objetos dormentes deste projeto.
 *
 * ── O GATILHO É UM BOTÃO ───────────────────────────────────────────────────
 *
 * E não a `<div>` que era antes. `HoverCard` abre por hover **e por foco**;
 * com um botão, quem navega por teclado chega à lista com Tab, e no celular
 * — onde hover não existe — o toque dá foco e abre o cartão. Sem isso o
 * recurso seria só para quem tem mouse.
 */
function LadoDaFaixa({
  pessoas, quantidade, rotulo, sexo, escala, lado,
}: {
  pessoas: PessoaNaFaixa[];
  quantidade: number;
  rotulo: string;
  sexo: "homens" | "mulheres";
  /** O maior valor de célula da pirâmide — a largura de 100%. */
  escala: number;
  lado: "esquerda" | "direita";
}) {
  const esquerda = lado === "esquerda";

  const numero = (
    <span className={`text-xs tabular-nums text-muted-foreground ${esquerda ? "text-right" : "text-left"}`}>
      {quantidade || ""}
    </span>
  );

  /**
   * A barra desenhada — e, quando há gente, o próprio gatilho.
   *
   * O gatilho é a CÉLULA inteira da grade, não a barra colorida: numa faixa
   * de duas pessoas a barra tem uns poucos pixels, e caçar isso com o cursor
   * seria pior que não ter o recurso. Assim a metade da linha inteira abre o
   * cartão, e a barra dentro dela só desenha.
   *
   * Uma primeira versão pôs `display: contents` num <button> em volta das
   * DUAS células, para não desalinhar a grade. Não funciona: elemento com
   * `contents` não gera caixa, então não é alvo de ponteiro nem tem
   * geometria para o cartão se posicionar. O cartão simplesmente não abria.
   */
  const conteudoDaBarra = (
    <div
      className={`h-4 ${esquerda ? "rounded-l-sm bg-info" : "rounded-r-sm bg-celebracao"}`}
      style={{ width: `${(quantidade / escala) * 100}%` }}
    />
  );
  const alinhamento = esquerda ? "justify-end" : "justify-start";

  // Faixa vazia não vira gatilho: um cartão que abre para dizer "ninguém"
  // é pior que nada, e ainda rouba o cursor de passagem.
  if (quantidade === 0) {
    const vazia = <div className={`flex ${alinhamento}`}>{conteudoDaBarra}</div>;
    // A ordem das células depende do lado: a grade é espelhada —
    // [nº-M][barra-M][faixa][barra-F][nº-F].
    return esquerda ? <>{numero}{vazia}</> : <>{vazia}{numero}</>;
  }

  const gatilho = (
    <CartaoDeNomes
      itens={pessoas.map(p => ({ id: p.id, nome: p.nome, detalhe: String(p.idade) }))}
      rotuloAria={`Ver ${sexo === "homens" ? "os" : "as"} ${quantidade} ${sexo} de ${rotulo}`}
      align={esquerda ? "end" : "start"}
      className={`flex ${alinhamento} w-full rounded-sm`}
    >
      {conteudoDaBarra}
    </CartaoDeNomes>
  );

  return esquerda ? <>{numero}{gatilho}</> : <>{gatilho}{numero}</>;
}

/** Largura mínima de cada barra de ano. Abaixo disso o rótulo trunca. */
const LARGURA_DA_BARRA = "min-w-[26px]";

/**
 * A contagem geral — pastoral, não estatística de rol.
 *
 * 09/09/2026, pedido dela: "o rebanho deve ser a contagem geral de pessoas
 * (para o pastor)". Até aqui, "O rebanho" media as três coisas — a frase
 * geral E os dois quadros de detalhe do rol (pirâmide etária, movimento) —
 * numa seção só, no Painel Pastoral. Os dois quadros são leitura de rol
 * formal (idade para pregação, mas também composição para assembleia) e
 * mudaram de casa: ver `DetalheDoRol`, agora no Painel da Secretaria.
 *
 * O que fica aqui é só a frase — "quantas pessoas a igreja acompanha, e
 * como elas se dividem" — que é exatamente o que um pastor pergunta ao
 * pensar no rebanho inteiro, membros e quem ainda está a caminho de ser.
 */
export function ResumoRebanho({ dados }: { dados: IndicadoresMembresia }) {
  const { rol } = dados;
  const total = rol.membros + rol.congregados + rol.visitantes;

  return (
    <p className="text-sm text-muted-foreground">
      O rebanho tem <strong className="text-foreground tabular-nums">{total}</strong> pessoas
      ativas: <strong className="text-foreground tabular-nums">{rol.membros}</strong> membros,
      {" "}<strong className="text-foreground tabular-nums">{rol.congregados}</strong> congregados
      {rol.visitantes > 0 && (
        <> e <strong className="text-foreground tabular-nums">{rol.visitantes}</strong> visitantes</>
      )}.
    </p>
  );
}

/**
 * Os dois quadros de detalhe do ROL — pirâmide etária, movimento de
 * entradas e saídas. Estatística de governança (composição para
 * assembleia, quem entrou/saiu do rol formal), por isso mudou para o
 * Painel da Secretaria em 09/09/2026 — ver o comentário de `ResumoRebanho`.
 */
export function DetalheDoRol({ dados }: { dados: IndicadoresMembresia }) {
  const { rol, composicao: c, movimento: mv } = dados;

  return (
    <div className="space-y-3">
      {/* ── Só o rol, dito antes dos dois quadros ─────────────────────────
          Esta linha morava dentro do quadro "A forma do rol", e ali
          confundia: anunciava os três vínculos logo acima de uma pirâmide
          desenhada só sobre os membros. Aqui ela some a mesma dúvida que
          gerou o rótulo "só os N membros" em cada quadro — Telma perguntou
          duas vezes se os gráficos somavam os três vínculos. */}
      <p className="text-xs text-muted-foreground">
        Os dois quadros abaixo contam só <strong className="text-foreground tabular-nums">{rol.membros}</strong>
        {" "}membros do rol — congregados e visitantes ficam de fora dos dois.
      </p>
      <QuadroDaForma c={c} totalDoRol={rol.membros} />
      <QuadroDoMovimento mv={mv} totalDoRol={rol.membros} />
    </div>
  );
}

/**
 * Os mesmos dois quadros, sobre o REBANHO inteiro — membros, congregados e
 * visitantes ativos, não só o rol. Painel Pastoral, desde 09/09/2026.
 *
 * ── POR QUE DOIS COMPONENTES, E NÃO `DetalheDoRol` COM UMA PROP ────────────
 *
 * Existe uma prop, `geral`, mas ela vive um nível abaixo, nos dois quadros —
 * de propósito. Chamar `DetalheDoRol` com `escopo="rebanho"` do Painel
 * Pastoral criaria um nome que mente: "detalhe DO ROL, mas na verdade não é
 * o rol". Dois nomes, cada um dizendo a população certa, custam uma função
 * pequena a mais e evitam essa contradição no próprio nome do componente.
 *
 * `dados` aqui **precisa** vir de `indicadoresMembresia("rebanho")` — a
 * pirâmide e o movimento já chegam calculados sobre a população certa; este
 * componente só decide o texto e repassa `geral` para os quadros lerem.
 */
export function DetalheDoRebanho({ dados }: { dados: IndicadoresMembresia }) {
  const { rol, composicao: c, movimento: mv } = dados;
  const total = rol.membros + rol.congregados + rol.visitantes;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Os dois quadros abaixo contam as <strong className="text-foreground tabular-nums">{total}</strong>
        {" "}pessoas do rebanho: <strong className="text-foreground tabular-nums">{rol.membros}</strong> membros,
        {" "}<strong className="text-foreground tabular-nums">{rol.congregados}</strong> congregados
        {rol.visitantes > 0 && (
          <> e <strong className="text-foreground tabular-nums">{rol.visitantes}</strong> visitantes</>
        )}.
      </p>
      <QuadroDaForma c={c} totalDoRol={total} geral />
      <QuadroDoMovimento mv={mv} totalDoRol={total} geral />
    </div>
  );
}

// ─── Quadro 1 · A forma do rol ─────────────────────────────────────────────

function QuadroDaForma({
  c, totalDoRol, geral = false,
}: { c: IndicadoresMembresia["composicao"]; totalDoRol: number; geral?: boolean }) {
  // A pirâmide se lê de cima para baixo, do mais velho para o mais novo —
  // é a convenção, e é o que faz a forma significar alguma coisa: base larga
  // é igreja jovem, topo pesado é igreja envelhecendo. O serviço devolve na
  // ordem natural (mais novo primeiro), então aqui inverte.
  const deCimaParaBaixo = [...c.faixas].reverse();
  // A mesma tela, duas populações: `geral` é o Painel Pastoral pedindo
  // "contagem de todas as pessoas" em 09/09/2026 — membros, congregados e
  // visitantes ativos — contra o padrão, só o rol de membros, que o Painel
  // da Secretaria continua usando.
  const substantivo = geral ? "pessoas" : "membros";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* A base é o ROL, ou o REBANHO — conforme `geral`. Ver a nota em
          `FAIXAS`, no serviço: as FAIXAS em si chegaram a cobrir o rebanho
          inteiro para dar conteúdo a uma faixa de Berçário, e voltaram —
          dezenove crianças não pagam a queda de cobertura de 85% para 71%.
          Isso é sobre a forma das faixas; `geral` é outra coisa, é sobre
          quem entra na conta. */}
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h3 className="font-serif text-sm flex items-center gap-1.5 shrink-0">
          <Users2 className="w-3.5 h-3.5 text-violeta-text" />
          {geral ? "A forma do rebanho" : "A forma do rol"}
        </h3>
        {/* Etiqueta, e não texto solto: o escopo de um gráfico precisa ser
            lido antes dele, e uma frase em cinza ao lado do título se lê
            depois — quando já se tirou a conclusão errada. */}
        <span className="text-xs rounded border border-border bg-muted/60 px-1.5 py-0.5 shrink-0">
          {geral ? "todo o rebanho —" : "só os"}{" "}
          <strong className="tabular-nums">{totalDoRol}</strong> {substantivo}
        </span>
      </div>

      {/* ── A leitura, antes do desenho ──────────────────────────────────
          A pirâmide mostra o formato; estes três números o traduzem — e são
          a redução que os estudos de composição de igreja costumam fazer.
          Ninguém os extrai olhando barras.

          Ficam ACIMA porque respondem à pergunta que faz olhar a pirâmide
          ("estamos envelhecendo?"). Embaixo virariam nota de rodapé de uma
          conclusão que o leitor já tirou, certa ou errada.

          O denominador é `comDataNascimento`, e não o rol inteiro: dizer
          "30% dos membros" sobre uma conta feita em 191 de 226 seria a
          mesma meia-verdade que o resto deste bloco recusa. Por isso a
          linha de baixo diz sobre quantos a conta vale. */}
      {c.idadeMediana !== null && c.comDataNascimento > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5">
          <span className="text-xs text-muted-foreground">
            Idade mediana{" "}
            <strong className="text-foreground tabular-nums text-sm">{c.idadeMediana}</strong> anos
          </span>
          <span className="text-xs text-muted-foreground" title="Estatuto do Idoso: 60 anos ou mais">
            60 ou mais{" "}
            <strong className="text-violeta-text tabular-nums text-sm">
              {Math.round((c.maioresDe60 / c.comDataNascimento) * 100)}%
            </strong>
            <span className="tabular-nums"> ({c.maioresDe60})</span>
          </span>
          <span className="text-xs text-muted-foreground" title="Estatuto da Juventude: até 29 anos">
            18 a 29{" "}
            <strong className="text-info-text tabular-nums text-sm">
              {Math.round((c.jovens / c.comDataNascimento) * 100)}%
            </strong>
            <span className="tabular-nums"> ({c.jovens})</span>
          </span>
        </div>
      )}

      {/* ── A legenda vem ANTES da pirâmide ──────────────────────────────
          Sem ela, as duas cores são só duas cores: quem lê primeiro as
          barras e depois descobre qual lado é qual precisa reler tudo. */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-info shrink-0" />
          Masculino <span className="tabular-nums text-foreground">{c.masculino}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-celebracao shrink-0" />
          Feminino <span className="tabular-nums text-foreground">{c.feminino}</span>
        </span>
      </div>

      {/* ── A pirâmide ───────────────────────────────────────────────────
          Cinco colunas por linha, e a mesma grade em todas: número, barra,
          rótulo, barra, número. É a grade que faz os dois lados espelharem
          — sem ela cada linha centraria no seu próprio conteúdo e a coluna
          de faixas ficaria serrilhada.

          As barras têm altura mínima quando o valor é 1: uma faixa com uma
          pessoa não pode desaparecer só porque a escala é 43. */}
      {/* A coluna do meio voltou a 3rem junto com os rótulos curtos. Com
          os nomes da EBD ela precisava de 5.5rem, e as barras encolhiam
          justamente no celular. */}
      <div className="space-y-1">
        {deCimaParaBaixo.map(f => (
          <div key={f.rotulo} className="grid grid-cols-[2rem_1fr_3.5rem_1fr_2rem] items-center gap-1">
            <LadoDaFaixa
              pessoas={f.pessoas.masculino} quantidade={f.masculino}
              rotulo={f.rotulo} sexo="homens"
              escala={c.maiorCelula} lado="esquerda"
            />
            <span
              className="text-xs text-center text-muted-foreground tabular-nums"
              title={`${f.rotulo} anos — ${f.idades} — ${f.total} ${substantivo}`}
            >
              {f.rotulo}
            </span>
            <LadoDaFaixa
              pessoas={f.pessoas.feminino} quantidade={f.feminino}
              rotulo={f.rotulo} sexo="mulheres"
              escala={c.maiorCelula} lado="direita"
            />
          </div>
        ))}
      </div>

      {/* ── O que a pirâmide não alcança ─────────────────────────────────
          As duas lacunas ficam na mesma linha, em letra miúda, logo abaixo
          do desenho — perto o bastante para quem leu a forma não sair sem
          saber sobre quantos ela foi desenhada. */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        Desenhada sobre {c.comDataNascimento} dos {totalDoRol} {substantivo}.
        {c.semDataNascimento > 0 && (
          <>
            {" "}<strong className="font-medium text-warning-text">{c.semDataNascimento} sem
            data de nascimento</strong> não entram em faixa nenhuma.
          </>
        )}
        {c.semSexo > 0 && (
          <> {c.semSexo} sem sexo registrado ficam fora dos dois lados.</>
        )}
      </p>
    </div>
  );
}

// ─── Quadro 2 · Movimento de membros ───────────────────────────────────────
//
// ── POR QUE O EIXO NO MEIO ─────────────────────────────────────────────────
//
// Pedido da Telma em 26/08/2026: entradas acima, saídas abaixo, num gráfico
// só. É a forma canônica do movimento de um rol, e diz numa olhada o que duas
// listas de números lado a lado não dizem — se a igreja cresceu ou encolheu
// naquele ano.
//
// **As duas metades dividem a MESMA escala** (`mv.maior`). Escalas separadas
// fariam uma saída solitária desenhar uma barra do tamanho de um ano de
// dezessete entradas, e o espelho passaria a mentir exatamente onde deveria
// comparar.
//
// ── A METADE DE BAIXO NASCE VAZIA, DE PROPÓSITO ────────────────────────────
//
// Nenhuma saída foi registrada até hoje neste banco. O espaço fica reservado
// e dito — "à espera do registro" — em vez de a metade de baixo simplesmente
// não existir. Um gráfico que só tem metade de cima parece um gráfico de
// entradas; este parece o que é: um movimento com um lado ainda em branco.
//
// A altura das duas pistas é a mesma (`h-16`) pelo mesmo motivo.

const ALTURA_DA_PISTA = "h-16";
/** Largura mínima de cada coluna de ano. Abaixo disso o rótulo trunca. */
const LARGURA_DA_COLUNA = "flex-1 min-w-[26px]";

function QuadroDoMovimento({
  mv, totalDoRol, geral = false,
}: { mv: IndicadoresMembresia["movimento"]; totalDoRol: number; geral?: boolean }) {
  const { entradas: ent, saidas: sai } = mv;
  const percentualComAno = totalDoRol > 0 ? Math.round((ent.comAno / totalDoRol) * 100) : 0;
  const noAnoAtual = mv.porAno[mv.porAno.length - 1];
  const primeiroAno = mv.porAno[0]?.ano;
  const nenhumaBarraDeSaida = mv.porAno.every(a => a.saidas === 0);
  // Mesma dobra de `QuadroDaForma`: `geral` troca a população, e com ela o
  // substantivo e o que os cartões de nome dizem ter aberto.
  const substantivo = geral ? "pessoas" : "membros";
  const doQue = geral ? "do rebanho" : "do rol";

  /** Altura em porcentagem da pista, com piso para o valor 1 não sumir. */
  const alturaDaBarra = (v: number) =>
    v > 0 ? `${Math.max(4, (v / mv.maior) * 100)}%` : "2px";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h3 className="font-serif text-sm flex items-center gap-1.5 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-violeta-text" />
          {geral ? "Movimento do rebanho" : "Movimento de membros"}
        </h3>
        {/* A mesma etiqueta de escopo do quadro de cima, pelo mesmo motivo. */}
        <span className="text-xs rounded border border-border bg-muted/60 px-1.5 py-0.5 shrink-0">
          {geral ? "todo o rebanho —" : "só os"}{" "}
          <strong className="tabular-nums">{totalDoRol}</strong> {substantivo}
        </span>
        <p className="text-xs text-muted-foreground min-w-0">
          últimos {ANOS_NA_JANELA} anos
          {noAnoAtual && (
            <> · <strong className="text-foreground tabular-nums">{noAnoAtual.entradas}</strong>
            {" "}entradas em {noAnoAtual.ano}</>
          )}
        </p>
      </div>

      {/* A legenda antes do gráfico: duas cores sem legenda são duas cores. */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-violeta shrink-0" /> Entradas
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gold shrink-0" /> Saídas
        </span>
        <span className="text-muted-foreground">
          transferidos, desligados e falecidos
        </span>
      </div>

      {/* ── A cobertura das ENTRADAS, antes do gráfico ───────────────────
          Ver o cabeçalho do arquivo: 66 sem ano contra um pico de 17 não
          cabem na mesma escala, e a lacuna precisa ser lida primeiro. Vale
          só para a metade de cima — a de baixo tem a sua própria confissão,
          no rodapé. */}
      <div className="space-y-1">
        <div className="flex h-2 rounded-sm overflow-hidden bg-muted">
          <div
            className="bg-violeta"
            style={{ width: `${percentualComAno}%` }}
            title={`${ent.comAno} ${substantivo} com ano de entrada registrado`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          As entradas cobrem <strong className="text-foreground tabular-nums">{ent.comAno}</strong> dos
          {" "}{totalDoRol} {substantivo}.
          {ent.semAno > 0 && (
            <>
              {" "}<strong className="font-medium text-warning-text tabular-nums">{ent.semAno}</strong>
              {" "}não têm o ano de entrada registrado.
            </>
          )}
        </p>
      </div>

      {/* ── O gráfico ────────────────────────────────────────────────────
          Três faixas empilhadas — entradas, eixo, saídas — e não uma coluna
          por ano com tudo dentro. É o que permite o EIXO SER UMA LINHA SÓ:
          desenhado por coluna, ele apareceria picotado nos vãos entre elas.

          As três faixas usam a mesma classe de largura por célula e têm o
          mesmo número de células, então as colunas se alinham sozinhas.

          `overflow-y-hidden` junto do `overflow-x-auto` porque, pela
          especificação, um eixo não-`visible` faz o outro virar `auto`: um
          pixel de sobra bastava para nascer uma barra de rolagem vertical
          encostada na borda direita, parecendo uma coluna a mais. */}
      <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1">
        <div>
          {/* Entradas: crescem do eixo para cima. */}
          <div className="flex items-end gap-1">
            {mv.porAno.map(a => (
              <div key={a.ano} className={`flex flex-col items-center gap-1 ${LARGURA_DA_COLUNA}`}>
                <span className="text-xs tabular-nums text-muted-foreground leading-none">
                  {a.entradas || ""}
                </span>
                {/* A pista é o gatilho, e não a barra colorida: num ano de
                    duas entradas a barra tem poucos pixels de altura, e
                    caçar isso com o cursor seria pior que não ter a lista.
                    Assim a coluna inteira do ano abre o cartão. */}
                {a.entradas > 0 ? (
                  <CartaoDeNomes
                    // Mesma tradução da saída: `tipo` no serviço, `detalhe`
                    // aqui. Vem vazio para quem ainda não tem tipo de
                    // entrada registrado, e a linha então mostra só data e
                    // nome — ver a nota em `PessoaNoAno`.
                    itens={a.pessoasEntrada.map(p => ({
                      id: p.id, nome: p.nome, quando: p.quando, detalhe: p.tipo,
                    }))}
                    rotuloAria={`Ver quem entrou ${doQue} em ${a.ano}`}
                    align="center"
                    className={`w-full ${ALTURA_DA_PISTA} flex items-end rounded-sm`}
                  >
                    <div
                      className="w-full rounded-t-sm bg-violeta"
                      style={{ height: alturaDaBarra(a.entradas) }}
                    />
                  </CartaoDeNomes>
                ) : (
                  <div className={`w-full ${ALTURA_DA_PISTA} flex items-end`}>
                    <div
                      className="w-full rounded-t-sm bg-border"
                      style={{ height: alturaDaBarra(a.entradas) }}
                      title={`Nenhuma entrada registrada em ${a.ano}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* O eixo, com os anos pousados nele. Dois dígitos: "26" cabe em
              26px, "2026" não. */}
          <div className="flex gap-1 border-t border-foreground/25">
            {mv.porAno.map(a => (
              <span
                key={a.ano}
                className={`${LARGURA_DA_COLUNA} text-center text-[11px] sm:text-xs tabular-nums text-muted-foreground pt-0.5 leading-none`}
              >
                {String(a.ano).slice(2)}
              </span>
            ))}
          </div>

          {/* Saídas: crescem do eixo para baixo. */}
          <div className="relative flex items-start gap-1">
            {mv.porAno.map(a => (
              <div key={a.ano} className={`flex flex-col items-center gap-1 ${LARGURA_DA_COLUNA}`}>
                {a.saidas > 0 ? (
                  <CartaoDeNomes
                    // `tipo` vira `detalhe`: no serviço o campo tem o nome do
                    // que ele é; aqui, o do lugar onde aparece.
                    itens={a.pessoasSaida.map(p => ({
                      id: p.id, nome: p.nome, quando: p.quando, detalhe: p.tipo,
                    }))}
                    rotuloAria={`Ver quem saiu ${doQue} em ${a.ano}`}
                    align="center"
                    className={`w-full ${ALTURA_DA_PISTA} flex items-start rounded-sm`}
                  >
                    <div
                      className="w-full rounded-b-sm bg-gold"
                      style={{ height: alturaDaBarra(a.saidas) }}
                    />
                  </CartaoDeNomes>
                ) : (
                  <div className={`w-full ${ALTURA_DA_PISTA} flex items-start`}>
                    <div
                      className="w-full rounded-b-sm bg-border"
                      style={{ height: alturaDaBarra(a.saidas) }}
                      title={`Nenhuma saída registrada em ${a.ano}`}
                    />
                  </div>
                )}
                <span className="text-xs tabular-nums text-muted-foreground leading-none">
                  {a.saidas || ""}
                </span>
              </div>
            ))}

            {/* O aviso ocupa a metade vazia em vez de deixá-la sem
                explicação. `pointer-events-none` para não roubar o título
                das barras que um dia estarão embaixo. */}
            {nenhumaBarraDeSaida && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-muted-foreground/80 bg-card px-2 text-center">
                  à espera dos primeiros registros de saída
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Os rodapés ───────────────────────────────────────────────────
          Um por lacuna, e cada um diz de que lado está falando.

          ── "E SE PRECISARMOS CONSULTAR REGISTROS ANTERIORES?" ─────────────
          Pergunta dela em 09/09/2026, vendo estas duas linhas como texto
          puro — diziam quantos, nunca quem. Viraram `CartaoDeNomes`, o
          mesmo componente que já abre as barras do gráfico: a frase inteira
          é o gatilho, sublinhado para avisar que é clicável (as barras não
          precisam do sublinhado — parecem barra; texto corrido precisa).

          `<div>`, não `<p>`: o cartão que `CartaoDeNomes` abre (`HoverCardContent`
          → `<ul>`) não é portalado neste projeto — ver `components/ui/hover-card.tsx`
          — então ele nasce como filho de verdade de quem o chama. Um `<ul>`
          dentro de `<p>` é HTML inválido, e o React avisa disso no console
          assim que a primeira lista abre. */}
      <div className="space-y-1 border-t pt-2">
        {ent.anteriores > 0 && (
          <div className="text-xs text-muted-foreground">
            <CartaoDeNomes
              itens={ent.pessoasAnteriores.map(p => ({
                id: p.id, nome: p.nome, quando: comAno(p.data), detalhe: p.tipo,
              }))}
              rotuloAria={`Ver quem entrou ${doQue} antes de ${primeiroAno}`}
              align="start"
              className="rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid text-left"
              larguraQuando="w-20"
            >
              Mais <strong className="text-foreground tabular-nums">{ent.anteriores}</strong> entradas
              registradas antes de {primeiroAno}
            </CartaoDeNomes>
            {ent.anoMaisAntigo !== null && <> — a mais antiga em {ent.anoMaisAntigo}</>}.
          </div>
        )}

        {/* A mesma lacuna do lado de cima, do lado de baixo: até 09/09/2026
            só as entradas antigas tinham linha própria — as saídas antigas
            entravam em `sai.comAno` e desapareciam sem explicação. */}
        {sai.anteriores > 0 && (
          <div className="text-xs text-muted-foreground">
            <CartaoDeNomes
              itens={sai.pessoasAnteriores.map(p => ({
                id: p.id, nome: p.nome, quando: comAno(p.data), detalhe: p.tipo,
              }))}
              rotuloAria={`Ver quem saiu ${doQue} antes de ${primeiroAno}`}
              align="start"
              className="rounded-sm underline decoration-dotted underline-offset-2 hover:decoration-solid text-left"
              larguraQuando="w-20"
            >
              Mais <strong className="text-foreground tabular-nums">{sai.anteriores}</strong> saídas
              registradas antes de {primeiroAno}
            </CartaoDeNomes>
            {sai.anoMaisAntigo !== null && <> — a mais antiga em {sai.anoMaisAntigo}</>}.
          </div>
        )}

        {/* A frase da saída muda com o que existe, e nenhuma das versões
            afirma que não houve saída — só que não há registro. */}
        {/* ── Os TRÊS estados da saída ─────────────────────────────────
            Este rodapé tinha só dois ramos — "há saídas sem data" e
            "nenhuma saída" — e faltava justamente o caso normal a partir
            do momento em que a igreja começasse a registrar.

            **Ele mentiu na primeira vez que foi usado.** Com três saídas
            desenhadas logo acima (Gloria e Marcia transferidas em 19/04,
            Leonardo falecido em 19/08) e nenhuma sem data, a condição
            `semAno > 0` dava falso e caía no ramo final: "Nenhuma saída
            registrada ainda", sob as três barras.

            Os dois números são independentes e podem coexistir — saídas
            com data viram barra, saídas sem data ficam de fora —, então
            cada um tem a sua frase e as duas aparecem juntas quando é o
            caso. Nenhuma delas afirma que não houve saída: dizem o que há
            e o que falta registrar. */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {sai.comAno > 0 && (
            <>
              <strong className="font-medium text-foreground tabular-nums">{sai.comAno}</strong>
              {" "}saída{sai.comAno > 1 ? "s" : ""} registrada{sai.comAno > 1 ? "s" : ""} com
              data{sai.semAno > 0 ? ". " : "."}
            </>
          )}
          {sai.semAno > 0 && (
            <>
              <strong className="font-medium text-warning-text tabular-nums">{sai.semAno}</strong>
              {" "}pessoa{sai.semAno > 1 ? "s" : ""} marcada{sai.semAno > 1 ? "s" : ""} como
              transferida, desligada ou falecida <strong className="font-medium">sem data de
              saída</strong> — sem data não há ano onde pousar a barra. Basta editar a
              ficha e preencher a data de saída.
            </>
          )}
          {sai.comAno === 0 && sai.semAno === 0 && (
            <>
              Nenhuma saída registrada ainda. A metade de baixo se preenche
              sozinha assim que uma ficha receber transferido, desligado ou
              falecido <strong className="font-medium">com data de saída</strong>.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
