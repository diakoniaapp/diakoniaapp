// ─── PainelSecretaria.tsx — o trabalho da secretaria em um lugar ────────────
//
// ── POR QUE ESTE PAINEL EXISTE ─────────────────────────────────────────────
//
// A secretaria via 13 dos 17 blocos da Home, e só UM era dela ("Cadastros a
// corrigir"). Os outros doze são acolhimento, quem ninguém procurou, ações do
// dia, vida das famílias — trabalho pastoral que ela acompanha mas não
// executa. Ela começava o dia numa tela em que o que lhe cabe era 1/13 do que
// via.
//
// Aqui está só o que é dela, medido em 26/08/2026:
//
//   cadastro em contradição ...... 190  (64 + 61 + 65)
//   pessoas ativas sem família ... 100
//   ata de reunião não lançada ....  1
//   pauta em rascunho .............  3
//   membresia em andamento ........  0
//
// ── AS SEÇÕES NÃO SOMEM QUANDO ZERAM ───────────────────────────────────────
//
// O painel da Home segue a regra oposta — bloco sem nada a fazer desaparece —
// e ela é certa lá, onde o objetivo é reduzir uma tela cheia ao que importa
// hoje. Aqui o objetivo é outro: esta é a bancada de trabalho de uma pessoa,
// e bancada que muda de forma toda manhã obriga a reprocurar tudo.
//
// Zerado, o bloco fica e diz que está em ordem. "Nenhuma solicitação em
// andamento" é informação para quem responde pela membresia; ausência de
// bloco não é.
//
// ── O QUE NÃO ENTROU ───────────────────────────────────────────────────────
//
// Nada de aniversário, visitante ou escala: continua tudo na Home e no Painel
// Pastoral, que ela também acessa. Duplicar aqui faria duas telas discordarem
// no dia em que uma mudasse.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardCheck, Home, Gavel, ScrollText, Users, ChevronRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NomePessoa } from "@/components/membros/ficha";
import {
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao, formatarAtualizadoHa,
} from "@/components/painel/blocos";
import { PENDENCIAS_CADASTRO, type PendenciaCadastro } from "@/lib/pendenciasCadastro";
import {
  carregarPainelSecretaria, type ResumoSecretaria,
} from "@/services/painelSecretariaService";
import { WidgetsDoPainel } from "@/dashboard/WidgetsDoPainel";

/** Quantos nomes cabem antes de a lista virar rolagem sem fim. */
const AMOSTRA_SEM_FAMILIA = 12;

export default function PainelSecretaria() {
  const [resumo, setResumo] = useState<ResumoSecretaria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verTodasSemFamilia, setVerTodas] = useState(false);
  /** Quando os números da tela foram lidos — o "· há 3 minutos" do resumo. */
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setResumo(await carregarPainelSecretaria());
      setAtualizadoEm(new Date());
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar o painel.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const totalCadastro = (resumo?.pendencias ?? []).reduce((s, p) => s + p.quantidade, 0);
  const totalGovernanca = (resumo?.atasPendentes ?? 0) + (resumo?.pautasRascunho ?? 0);

  return (
    // ── A largura ──────────────────────────────────────────────────────
    //
    // Duas correções na mesma linha, em 27/08/2026, junto com a mesma
    // mudança no Painel Pastoral.
    //
    // **Faltava o `mx-auto`.** O container tinha 1024px encostado à
    // ESQUERDA, e todo o vão sobrava de um lado só: 160px numa janela de
    // 1440, mais de 600px numa de 1920. Assimetria que se lê como erro,
    // porque é — o painel irmão sempre centralizou.
    //
    // **E cresce em dois degraus até 1280px**, como o outro. Esta tela é
    // lista, não prosa, e as linhas de pendência ganham espaço para caber
    // sem quebrar. Mas o teto continua valendo: o bloco "Pessoas sem
    // família" é um parágrafo de nomes corridos, e esticá-lo até a borda
    // o tornaria ilegível.
    <div className="p-6 space-y-4 max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto">
      {/* O cabeçalho acompanha a rolagem, como no Painel Pastoral: a faixa de
          indicadores é o índice da tela, e índice que sai de vista ao rolar
          obriga a voltar ao topo para trocar de assunto.

          `-mx-6 px-6` porque o container tem `p-6` — sem estender, o conteúdo
          rolaria visível pelas laterais do bloco fixo. */}
      <div className="sticky top-0 z-20 bg-background -mx-6 px-6 -mt-6 pt-6 pb-3 space-y-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-gold shrink-0" />
              Painel da Secretaria
            </h1>
            <p className="text-sm text-muted-foreground first-letter:uppercase">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={carregar} disabled={carregando}
            className="gap-1.5 text-xs shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* ── Resumo em linguagem natural ────────────────────────────────
            O mesmo lugar e a mesma forma do Painel Pastoral: uma frase, sem
            caixa, com o "atualizado há" em corpo menor na mesma linha.

            Esta tela não tinha nenhuma. Ela abria com quatro números grandes
            — 266, 82, 4, 2 — e cabia a quem lesse descobrir qual deles pedia
            atenção primeiro. A frase diz. */}
        {resumo && (
          <p className="text-sm text-muted-foreground flex items-start gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
            <span className="min-w-0">
              {resumoNatural(resumo, totalCadastro, totalGovernanca)}
              {atualizadoEm && (
                <span className="text-[10px] text-muted-foreground ml-1.5 whitespace-nowrap">
                  · {formatarAtualizadoHa(atualizadoEm)}
                </span>
              )}
            </span>
          </p>
        )}

        {/* ── A faixa de indicadores ──────────────────────────────────────
            **É um índice, não um painel de números.** Sem `valor`, cada bloco
            vira atalho: ícone, rótulo e a seta.

            Os números saíram do Painel Pastoral a pedido da Telma em
            27/08/2026, e o motivo vale igual aqui — eles competiam com o
            conteúdo. "266" no alto da tela pede leitura e promete
            significado, mas a seção logo abaixo já diz o mesmo com contexto:
            "10 pessoas sem telefone cadastrado — a igreja não tem como falar
            com elas". O algarismo sozinho não diz o que fazer com ele.

            E aqui competiam DUAS vezes: o mesmo total reaparece na contagem
            ao lado do título de cada seção, que é onde ele significa algo. */}
        {resumo && (
          <FaixaDeIndicadores colunas={4}>
            <Indicador
              rotulo="Cadastro" tom="warning" icone={ClipboardCheck}
              onClick={() => irParaSecao("cadastro")} descricao="Ir para Cadastro a corrigir"
            />
            <Indicador
              rotulo="Sem família" tom="info" icone={Home}
              onClick={() => irParaSecao("sem-familia")} descricao="Ir para Pessoas sem família"
            />
            <Indicador
              rotulo="Governança" tom="violeta" icone={Gavel}
              onClick={() => irParaSecao("governanca")} descricao="Ir para Governança"
            />
            <Indicador
              rotulo="Membresia" tom="gold" icone={ScrollText}
              onClick={() => irParaSecao("membresia")} descricao="Ir para Membresia"
            />
          </FaixaDeIndicadores>
        )}
      </div>

      {erro && (
        <p className="text-sm text-destructive-text border border-destructive-line rounded-md px-3 py-2">
          {erro}
        </p>
      )}

      {carregando && !resumo && (
        <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
      )}

      {resumo && (
        <>
          {/* ── Cadastro ───────────────────────────────────────────────── */}
          <section id="cadastro" className="scroll-mt-[220px]">
            <TituloDaSecao icone={ClipboardCheck} tom="warning" contagem={totalCadastro}>
              Cadastro a corrigir
            </TituloDaSecao>
            {totalCadastro === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma contradição no cadastro.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {PENDENCIAS_CADASTRO.map((def: PendenciaCadastro) => {
                  const n = resumo.pendencias.find(p => p.chave === def.chave)?.quantidade ?? 0;
                  if (n === 0) return null;
                  return (
                    <li key={def.chave}>
                      {/* A linha inteira é o link. O que se quer ao ler "64
                          sem telefone" é ver quem são as 64 — e a lista chega
                          já recortada por `?pendencia=`. */}
                      <Link
                        to={`/membros?pendencia=${def.chave}`}
                        className="flex items-center gap-2 px-3 py-2.5 min-h-11 group"
                      >
                        <span className="text-sm min-w-0 flex-1">
                          <span className={def.destaque ? "font-medium text-warning-text" : "font-medium"}>
                            {def.texto(n)}
                          </span>
                          <span className="text-muted-foreground"> — {def.consequencia}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Pessoas sem família ────────────────────────────────────── */}
          <section id="sem-familia" className="scroll-mt-[220px]">
            <TituloDaSecao icone={Home} tom="info" contagem={resumo.semFamilia.length}>
              Pessoas sem família
            </TituloDaSecao>
            {resumo.semFamilia.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Todo mundo está vinculado a uma família.
              </p>
            ) : (
              <div className="rounded-md border bg-card p-3 space-y-2">
                {/* Dizer o que se perde, e não só quantos são. Sem família a
                    pessoa não entra nas bodas, não aparece na visão de
                    famílias e não herda endereço — e quem clica no nome cai
                    na ficha, onde o passo Vínculos tem a busca por parente. */}
                <p className="text-sm text-muted-foreground">
                  Sem vínculo familiar elas ficam fora das bodas e da visão por
                  família. Clique no nome para abrir a ficha e vincular no passo
                  <span className="font-medium"> Vínculos</span>.
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {(verTodasSemFamilia
                    ? resumo.semFamilia
                    : resumo.semFamilia.slice(0, AMOSTRA_SEM_FAMILIA)
                  ).map(p => (
                    <NomePessoa
                      key={p.id} id={p.id} nome={p.nome_completo}
                      className="text-sm hover:underline"
                    />
                  ))}
                </div>
                {resumo.semFamilia.length > AMOSTRA_SEM_FAMILIA && (
                  <button
                    type="button"
                    onClick={() => setVerTodas(v => !v)}
                    className="text-sm text-primary hover:underline"
                  >
                    {verTodasSemFamilia
                      ? "Mostrar menos"
                      : `Ver as outras ${resumo.semFamilia.length - AMOSTRA_SEM_FAMILIA}`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ── Governança ─────────────────────────────────────────────── */}
          <section id="governanca" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={Gavel} tom="violeta" contagem={totalGovernanca}
              acao={
                <Link to="/governanca" className="text-sm text-primary hover:underline">
                  Abrir Governança
                </Link>
              }
            >
              Governança
            </TituloDaSecao>
            {totalGovernanca === 0 ? (
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma ata pendente e nenhuma pauta em rascunho.
              </p>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {resumo.atasPendentes > 0 && (
                  <li>
                    <Link to="/governanca" className="flex items-center gap-2 px-3 py-2.5 min-h-11 group">
                      <span className="text-sm min-w-0 flex-1">
                        <span className="font-medium text-warning-text">
                          {resumo.atasPendentes} {resumo.atasPendentes === 1 ? "reunião encerrada" : "reuniões encerradas"} sem ata
                        </span>
                        {/* A ata é da secretaria: `gov_reunioes` guarda
                            `secretaria_id` justamente para isso. */}
                        <span className="text-muted-foreground"> — a decisão não fica registrada</span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  </li>
                )}
                {resumo.pautasRascunho > 0 && (
                  <li>
                    <Link to="/governanca" className="flex items-center gap-2 px-3 py-2.5 min-h-11 group">
                      <span className="text-sm min-w-0 flex-1">
                        <span className="font-medium">
                          {resumo.pautasRascunho} {resumo.pautasRascunho === 1 ? "pauta" : "pautas"} em rascunho
                        </span>
                        <span className="text-muted-foreground"> — não entram em reunião enquanto não forem fechadas</span>
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </section>

          {/* ── Membresia ──────────────────────────────────────────────── */}
          <section id="membresia" className="scroll-mt-[220px]">
            <TituloDaSecao
              icone={ScrollText} tom="gold" contagem={resumo.membresiaEmAndamento}
              acao={
                <Link to="/membresia" className="text-sm text-primary hover:underline">
                  Abrir Membresia
                </Link>
              }
            >
              Membresia
            </TituloDaSecao>
            {resumo.membresiaEmAndamento === 0 ? (
              // Fica, mesmo em zero. O módulo existe e nunca foi usado — a
              // tabela tem 0 linhas em 26/08/2026 —, e um bloco que só
              // aparecesse quando houvesse trabalho nunca apareceria, porque
              // ninguém descobriria que dá para começar por aqui.
              <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
                Nenhuma solicitação em andamento. Cartas de transferência e
                processos de admissão começam em <Link to="/membresia" className="text-primary hover:underline">Membresia</Link>.
              </p>
            ) : (
              <Link
                to="/membresia"
                className="flex items-center gap-2 px-3 py-2.5 min-h-11 rounded-md border bg-card group"
              >
                <span className="text-sm min-w-0 flex-1">
                  <span className="font-medium">
                    {resumo.membresiaEmAndamento} {resumo.membresiaEmAndamento === 1 ? "solicitação" : "solicitações"} em andamento
                  </span>
                  <span className="text-muted-foreground"> — aguardando documento, assembleia ou carta</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            )}
          </section>

          {/* ── Atalhos ────────────────────────────────────────────────── */}
          <section className="pt-1">
            <TituloDaSecao icone={Users} tom="neutro">Ir para</TituloDaSecao>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/membros"><Users className="w-3.5 h-3.5" /> Catálogo</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/familias"><Home className="w-3.5 h-3.5" /> Famílias</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/governanca"><Gavel className="w-3.5 h-3.5" /> Governança</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/membresia"><ScrollText className="w-3.5 h-3.5" /> Membresia</Link>
              </Button>
            </div>
          </section>
        </>
      )}

      {/* Os blocos que a Home devolveu ao virar tela pessoal. Quem decide
          quais aparecem aqui e o registry, pelo campo `paineis` — e a
          permissao de quem olha continua valendo por cima. */}
      <WidgetsDoPainel painel="secretaria" />
    </div>
  );
}

/**
 * A frase que abre o painel, em português e não em algarismos.
 *
 * ── COMO ELA ESCOLHE O QUE DIZER ───────────────────────────────────────────
 *
 * Não repete os quatro totais — isso a faixa já fazia, e era justamente o
 * problema: "266, 82, 4, 2" não diz por onde começar.
 *
 * A ordem aqui é de urgência, e a primeira posição não é escolha desta
 * função: `PENDENCIAS_CADASTRO` marca uma entrada com `destaque: true`, e
 * hoje é "sem telefone cadastrado". O motivo está escrito lá — quem não tem
 * telefone não recebe aniversário, não recebe convite, não é alcançável. Se
 * a igreja um dia mudar essa marca, a frase acompanha sozinha.
 *
 * Depois vem o que trava OUTRO trabalho: membresia em andamento espera
 * decisão, ata pendente trava a governança. Cadastro incompleto e gente sem
 * família são fila — importam, e podem esperar a rolagem.
 */
function resumoNatural(
  r: ResumoSecretaria,
  totalCadastro: number,
  totalGovernanca: number,
): string {
  const partes: string[] = [];

  const marcada = PENDENCIAS_CADASTRO.find(p => p.destaque);
  const nMarcada = marcada
    ? (r.pendencias.find(p => p.chave === marcada.chave)?.quantidade ?? 0)
    : 0;
  if (marcada && nMarcada > 0) partes.push(marcada.texto(nMarcada));

  if (r.membresiaEmAndamento > 0) {
    partes.push(`${r.membresiaEmAndamento} ${r.membresiaEmAndamento === 1
      ? "solicitação de membresia em andamento"
      : "solicitações de membresia em andamento"}`);
  }
  if (totalGovernanca > 0) {
    partes.push(`${totalGovernanca} ${totalGovernanca === 1
      ? "pendência de governança" : "pendências de governança"}`);
  }

  // ── A FILA NÃO ENTRA NA FRASE QUANDO HÁ URGÊNCIA ─────────────────────
  //
  // A primeira versão fechava com "Ao todo, 266 correções de cadastro e 82
  // pessoas sem família". Ficou com quatro linhas no celular contra duas do
  // Painel Pastoral — e, pior, repetia o que a seção logo abaixo já diz ao
  // lado do próprio título ("Cadastro a corrigir  266").
  //
  // Era o mesmo defeito pelo qual os números saíram da faixa, cometido de
  // novo três linhas depois. O total só aparece quando NÃO há urgência: ali
  // ele deixa de competir e passa a ser a resposta.
  if (partes.length > 0) return `Atenção: ${partes.join(", ")}.`;

  const fila: string[] = [];
  if (totalCadastro > 0) {
    fila.push(`${totalCadastro} ${totalCadastro === 1 ? "correção" : "correções"} de cadastro`);
  }
  if (r.semFamilia.length > 0) {
    fila.push(`${r.semFamilia.length} ${r.semFamilia.length === 1 ? "pessoa" : "pessoas"} sem família`);
  }
  if (fila.length === 0) return "Cadastro em dia e nada pendente — tudo em ordem! 🙏";
  return `Nada urgente. Na fila: ${fila.join(" e ")}.`;
}
