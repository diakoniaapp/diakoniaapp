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
//   **A forma do rol** — pirâmide etária cruzada com sexo. Responde "para
//   quem estamos pregando": 62 pessoas com 60 anos ou mais e 47 com menos de
//   30 é uma igreja com um formato, e esse formato tem consequência
//   pastoral.
//
//   **Entradas no rol** — quantas pessoas entraram por ano, nos últimos dez.
//
// ── A REGRA DESTE ARQUIVO: O QUE NÃO SE SABE APARECE ───────────────────────
//
// Os dois quadros têm buracos grandes no dado, e nenhum dos dois os esconde:
//
//   · **35 dos 225 membros não têm data de nascimento** (16%). A pirâmide é
//     desenhada sobre 190 pessoas, e diz isso embaixo.
//   · **67 dos 225 não têm ano de entrada** (30%). O gráfico de entradas cobre
//     158, e a barra de cobertura em cima dele mostra a proporção ANTES de
//     qualquer barra de ano ser lida.
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
import type { IndicadoresMembresia } from "@/services/rolDeMembrosService";
import { ANOS_NA_JANELA } from "@/services/rolDeMembrosService";

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

          Aqui em cima ela faz o trabalho certo — explica de onde vem o
          número do título da seção — e deixa cada quadro livre para dizer
          qual é a SUA base. */}
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground tabular-nums">{total}</strong> pessoas ativas:
        {" "}<strong className="text-foreground tabular-nums">{rol.membros}</strong> membros,
        {" "}<strong className="text-foreground tabular-nums">{rol.congregados}</strong> congregados
        {rol.visitantes > 0 && (
          <> e <strong className="text-foreground tabular-nums">{rol.visitantes}</strong> visitantes</>
        )}.
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
      {/* O subtítulo diz a base do quadro, e não a do rebanho: a pirâmide
          é dos MEMBROS. Congregado e visitante ficam de fora porque 48 dos
          65 congregados não têm data de nascimento — pô-los aqui trocaria
          ~17 pessoas reais por 48 desconhecidas e deformaria o desenho. */}
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <h3 className="font-serif text-sm flex items-center gap-1.5 shrink-0">
          <Users2 className="w-3.5 h-3.5 text-violeta-text" />
          A forma do rol
        </h3>
        <p className="text-xs text-muted-foreground min-w-0">
          os <strong className="text-foreground tabular-nums">{totalDoRol}</strong> membros
        </p>
      </div>

      {/* ── A legenda vem ANTES da pirâmide ──────────────────────────────
          Sem ela, as duas cores são só duas cores: quem lê primeiro as
          barras e depois descobre qual lado é qual precisa reler tudo. */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
      <div className="space-y-1">
        {deCimaParaBaixo.map(f => (
          <div key={f.rotulo} className="grid grid-cols-[1.75rem_1fr_3rem_1fr_1.75rem] items-center gap-1">
            <span className="text-[11px] tabular-nums text-right text-muted-foreground">
              {f.masculino || ""}
            </span>
            <div className="flex justify-end">
              <div
                className="h-4 rounded-l-sm bg-info"
                style={{ width: `${(f.masculino / c.maiorCelula) * 100}%` }}
                title={`${f.masculino} homens de ${f.rotulo}`}
              />
            </div>
            <span className="text-[11px] text-center text-muted-foreground tabular-nums">
              {f.rotulo}
            </span>
            <div className="flex justify-start">
              <div
                className="h-4 rounded-r-sm bg-celebracao"
                style={{ width: `${(f.feminino / c.maiorCelula) * 100}%` }}
                title={`${f.feminino} mulheres de ${f.rotulo}`}
              />
            </div>
            <span className="text-[11px] tabular-nums text-left text-muted-foreground">
              {f.feminino || ""}
            </span>
          </div>
        ))}
      </div>

      {/* ── O que a pirâmide não alcança ─────────────────────────────────
          As duas lacunas ficam na mesma linha, em letra miúda, logo abaixo
          do desenho — perto o bastante para quem leu a forma não sair sem
          saber sobre quantos ela foi desenhada. */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Desenhada sobre {c.comDataNascimento} membros.
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
        <p className="text-xs text-muted-foreground min-w-0">
          últimos {ANOS_NA_JANELA} anos
          {noAnoAtual && (
            <> · <strong className="text-foreground tabular-nums">{noAnoAtual.entradas}</strong>
            {" "}entradas em {noAnoAtual.ano}</>
          )}
        </p>
      </div>

      {/* A legenda antes do gráfico: duas cores sem legenda são duas cores. */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-violeta shrink-0" /> Entradas
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-gold shrink-0" /> Saídas
        </span>
        <span className="text-muted-foreground/70">
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
        <p className="text-[11px] text-muted-foreground">
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
                <span className="text-[11px] tabular-nums text-muted-foreground leading-none">
                  {a.entradas || ""}
                </span>
                <div className={`w-full ${ALTURA_DA_PISTA} flex items-end`}>
                  <div
                    className={`w-full rounded-t-sm ${a.entradas > 0 ? "bg-violeta" : "bg-border"}`}
                    style={{ height: alturaDaBarra(a.entradas) }}
                    title={`${a.entradas} entrada(s) em ${a.ano}`}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* O eixo, com os anos pousados nele. Dois dígitos: "26" cabe em
              26px, "2026" não. */}
          <div className="flex gap-1 border-t border-foreground/25">
            {mv.porAno.map(a => (
              <span
                key={a.ano}
                className={`${LARGURA_DA_COLUNA} text-center text-[10px] tabular-nums text-muted-foreground pt-0.5 leading-none`}
              >
                {String(a.ano).slice(2)}
              </span>
            ))}
          </div>

          {/* Saídas: crescem do eixo para baixo. */}
          <div className="relative flex items-start gap-1">
            {mv.porAno.map(a => (
              <div key={a.ano} className={`flex flex-col items-center gap-1 ${LARGURA_DA_COLUNA}`}>
                <div className={`w-full ${ALTURA_DA_PISTA} flex items-start`}>
                  <div
                    className={`w-full rounded-b-sm ${a.saidas > 0 ? "bg-gold" : "bg-border"}`}
                    style={{ height: alturaDaBarra(a.saidas) }}
                    title={`${a.saidas} saída(s) em ${a.ano}`}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground leading-none">
                  {a.saidas || ""}
                </span>
              </div>
            ))}

            {/* O aviso ocupa a metade vazia em vez de deixá-la sem
                explicação. `pointer-events-none` para não roubar o título
                das barras que um dia estarão embaixo. */}
            {nenhumaBarraDeSaida && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-[11px] text-muted-foreground/80 bg-card px-2 text-center">
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
          <p className="text-[11px] text-muted-foreground">
            Mais <strong className="text-foreground tabular-nums">{ent.anteriores}</strong> entradas
            registradas antes de {primeiroAno}
            {ent.anoMaisAntigo !== null && <> — a mais antiga em {ent.anoMaisAntigo}</>}.
          </p>
        )}

        {/* A frase da saída muda com o que existe, e nenhuma das versões
            afirma que não houve saída — só que não há registro. */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {sai.semAno > 0 ? (
            <>
              <strong className="font-medium text-warning-text tabular-nums">{sai.semAno}</strong>
              {" "}pessoa{sai.semAno > 1 ? "s" : ""} marcada{sai.semAno > 1 ? "s" : ""} como
              transferida, desligada ou falecida <strong className="font-medium">sem data de
              saída</strong> — sem data não há ano onde pousar a barra. Basta editar a
              ficha e preencher a data de saída.
            </>
          ) : (
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
