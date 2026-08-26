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
  Indicador, FaixaDeIndicadores, TituloDaSecao, irParaSecao,
} from "@/components/painel/blocos";
import { PENDENCIAS_CADASTRO, type PendenciaCadastro } from "@/lib/pendenciasCadastro";
import {
  carregarPainelSecretaria, type ResumoSecretaria,
} from "@/services/painelSecretariaService";

/** Quantos nomes cabem antes de a lista virar rolagem sem fim. */
const AMOSTRA_SEM_FAMILIA = 12;

export default function PainelSecretaria() {
  const [resumo, setResumo] = useState<ResumoSecretaria | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verTodasSemFamilia, setVerTodas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setResumo(await carregarPainelSecretaria());
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
    <div className="p-6 space-y-4 max-w-5xl">
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

        {resumo && (
          <FaixaDeIndicadores colunas={4}>
            <Indicador
              rotulo="Cadastro" valor={totalCadastro} tom="warning" icone={ClipboardCheck}
              onClick={() => irParaSecao("cadastro")} descricao="Ir para Cadastro a corrigir"
            />
            <Indicador
              rotulo="Sem família" valor={resumo.semFamilia.length} tom="info" icone={Home}
              onClick={() => irParaSecao("sem-familia")} descricao="Ir para Pessoas sem família"
            />
            <Indicador
              rotulo="Governança" valor={totalGovernanca} tom="violeta" icone={Gavel}
              onClick={() => irParaSecao("governanca")} descricao="Ir para Governança"
            />
            <Indicador
              rotulo="Membresia" valor={resumo.membresiaEmAndamento} tom="gold" icone={ScrollText}
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
                <p className="text-xs text-muted-foreground">
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
                <Link to="/governanca" className="text-xs text-primary hover:underline">
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
                <Link to="/membresia" className="text-xs text-primary hover:underline">
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
    </div>
  );
}
