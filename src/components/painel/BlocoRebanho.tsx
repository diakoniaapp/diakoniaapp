// ─── BlocoRebanho.tsx — a forma do rol e as entradas nele ──────────────────
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
// Dois quadros, pedidos em 26/08/2026 para o Painel Pastoral:
//
//   **A forma do rol** — pirâmide etária cruzada com sexo, e a leitura dela
//   em três números. Responde "para quem estamos pregando": um rol com
//   mediana de 46 anos, 32% acima de 60 e 12% entre 18 e 29 tem um formato,
//   e esse formato tem consequência pastoral.
//
//   **Movimento de membros** — entradas acima do eixo, saídas abaixo.
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
  itens, rotuloAria, align, className, children,
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
                <span className="text-muted-foreground tabular-nums shrink-0 w-[2.6rem]">
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

export function BlocoRebanho({ dados }: { dados: IndicadoresMembresia }) {
  const { rol, composicao: c, movimento: mv } = dados;
  const total = rol.membros + rol.congregados + rol.visitantes;

  return (
    <div className="space-y-3">
      {/* ── A repartição do rebanho, antes dos dois quadros ───────────────
          Esta linha morava dentro do quadro "A forma do rol", e ali
          confundia: anunciava os três vínculos logo acima de uma pirâmide
          desenhada só sobre os membros.

          Movê-la para cá não bastou. **Telma perguntou duas vezes se os
          gráficos somavam os três vínculos** — e a pergunta é justa: um
          número grande em negrito, logo acima de dois gráficos, ocupa a
          posição de quem anuncia o assunto do que vem a seguir. O "os 226
          membros" ao lado de cada título existia, em letra miúda, e perdia
          a disputa.

          Por isso a segunda frase, no mesmo tamanho da primeira: quem lê a
          linha de contexto lê junto o que ela NÃO é. Duas perguntas iguais
          sobre a mesma tela são defeito de quem escreveu a tela. */}
      <p className="text-xs text-muted-foreground">
        O rebanho tem <strong className="text-foreground tabular-nums">{total}</strong> pessoas
        ativas: <strong className="text-foreground tabular-nums">{rol.membros}</strong> membros,
        {" "}<strong className="text-foreground tabular-nums">{rol.congregados}</strong> congregados
        {rol.visitantes > 0 && (
          <> e <strong className="text-foreground tabular-nums">{rol.visitantes}</strong> visitantes</>
        )}.
        {" "}<span className="text-foreground">Os dois quadros abaixo contam
        só os {rol.membros} membros</span> — congregados e visitantes ficam de fora
        dos dois.
      </p>
      <QuadroDaForma c={c} totalDoRol={rol.membros} />
      <QuadroDoMovimento mv={mv} totalDoRol={rol.membros} />
    </div>
  );
}

// ─── Quadro 1 · A forma do rol ─────────────────────────────────────────────

function QuadroDaForma({
  c, totalDoRol,
}: { c: IndicadoresMembresia["composicao"]; totalDoRol: number }) {
  // A pirâmide se lê de cima para baixo, do mais velho para o mais novo —
  // é a convenção, e é o que faz a forma significar alguma coisa: base larga
  // é igreja jovem, topo pesado é igreja envelhecendo. O serviço devolve na
  // ordem natural (mais novo primeiro), então aqui inverte.
  const deCimaParaBaixo = [...c.faixas].reverse();

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* A base é o ROL. Ver a nota em `FAIXAS`, no serviço: a pirâmide
          chegou a cobrir o rebanho inteiro para dar conteúdo a uma faixa de
          Berçário, e voltou — dezenove crianças não pagam a queda de
          cobertura de 85% para 71%. */}
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h3 className="font-serif text-sm flex items-center gap-1.5 shrink-0">
          <Users2 className="w-3.5 h-3.5 text-violeta-text" />
          A forma do rol
        </h3>
        {/* Etiqueta, e não texto solto: o escopo de um gráfico precisa ser
            lido antes dele, e uma frase em cinza ao lado do título se lê
            depois — quando já se tirou a conclusão errada. */}
        <span className="text-xs rounded border border-border bg-muted/60 px-1.5 py-0.5 shrink-0">
          só os <strong className="tabular-nums">{totalDoRol}</strong> membros
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
              title={`${f.rotulo} anos — ${f.idades} — ${f.total} membros`}
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
        Desenhada sobre {c.comDataNascimento} dos {totalDoRol} membros.
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
  mv, totalDoRol,
}: { mv: IndicadoresMembresia["movimento"]; totalDoRol: number }) {
  const { entradas: ent, saidas: sai } = mv;
  const percentualComAno = totalDoRol > 0 ? Math.round((ent.comAno / totalDoRol) * 100) : 0;
  const noAnoAtual = mv.porAno[mv.porAno.length - 1];
  const primeiroAno = mv.porAno[0]?.ano;
  const nenhumaBarraDeSaida = mv.porAno.every(a => a.saidas === 0);

  /** Altura em porcentagem da pista, com piso para o valor 1 não sumir. */
  const alturaDaBarra = (v: number) =>
    v > 0 ? `${Math.max(4, (v / mv.maior) * 100)}%` : "2px";

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h3 className="font-serif text-sm flex items-center gap-1.5 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-violeta-text" />
          Movimento de membros
        </h3>
        {/* A mesma etiqueta de escopo do quadro de cima, pelo mesmo motivo. */}
        <span className="text-xs rounded border border-border bg-muted/60 px-1.5 py-0.5 shrink-0">
          só os <strong className="tabular-nums">{totalDoRol}</strong> membros
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
            title={`${ent.comAno} membros com ano de entrada registrado`}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          As entradas cobrem <strong className="text-foreground tabular-nums">{ent.comAno}</strong> dos
          {" "}{totalDoRol} membros.
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
                    rotuloAria={`Ver quem entrou no rol em ${a.ano}`}
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
                    rotuloAria={`Ver quem saiu do rol em ${a.ano}`}
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
          Um por lacuna, e cada um diz de que lado está falando. */}
      <div className="space-y-1 border-t pt-2">
        {ent.anteriores > 0 && (
          <p className="text-xs text-muted-foreground">
            Mais <strong className="text-foreground tabular-nums">{ent.anteriores}</strong> entradas
            registradas antes de {primeiroAno}
            {ent.anoMaisAntigo !== null && <> — a mais antiga em {ent.anoMaisAntigo}</>}.
          </p>
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
