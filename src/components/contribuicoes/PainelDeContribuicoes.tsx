// ─── PainelDeContribuicoes — o painel executivo da tela Doadores (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SÓ AGREGADOS: nenhum nome e nenhum valor individual aparece aqui — por isso o painel não precisa do registro de acessos (esse é da lista nominal). É também o que o e-mail ao pastor levará (mesmo
// cálculo, `lib/contribuicoes`). Cada indicador diz o que conta, e a cobertura de identificação fica à vista: um número sem a sua qualidade engana.
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComoInterpretar } from "./ComoInterpretar";
import { brl } from "@/services/finService";
import { PISO_DE_IDENTIFICACAO, type AnaliseDoPeriodo, type ForaDaBase, type ResumoDaBase, type SaudeDeUmTipo, type SemanaDeContribuicao } from "@/lib/contribuicoes";

const dm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (m: string) => `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const num = (n: number | null, casas = 0) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: casas }));
const brlCurto = (v: number) => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v));

function Indicador({ rotulo, valor, legenda, id }: { rotulo: string; valor: string; legenda: string; id: string }) {
  return (
    <Card className="shadow-card-soft" data-indicador={id}>
      <CardContent className="p-3.5 space-y-0.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</p>
        <p className="font-serif text-2xl font-semibold tabular-nums leading-tight" data-valor>{valor}</p>
        <p className="text-xs text-muted-foreground leading-snug">{legenda}</p>
      </CardContent>
    </Card>
  );
}

function Grafico({ titulo, nota, children, id }: { titulo: string; nota?: string; children: React.ReactNode; id: string }) {
  return (
    <Card className="shadow-card-soft" data-grafico={id}>
      <CardHeader className="pb-1"><CardTitle className="font-serif text-base">{titulo}</CardTitle>{nota && <p className="text-xs text-muted-foreground">{nota}</p>}</CardHeader>
      <CardContent className="h-56 pr-2">{children}</CardContent>
    </Card>
  );
}

const COR = "hsl(var(--gold))";
const GRADE = "hsl(var(--border))";
const eixo = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

const dataBrCompleta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

const ROTULO_DO_VINCULO = { membro: "Membros", congregado: "Congregados", visitante: "Visitantes" } as const;

function Caixinhas({ itens }: { itens: [string, string, string][] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {itens.map(([id, rotulo, valor]) => (
        <div key={id} data-saude={id} className="rounded-md border bg-muted/20 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">{rotulo}</p>
          <p className="font-serif text-xl font-semibold tabular-nums" data-valor>{valor}</p>
        </div>
      ))}
    </div>
  );
}

/** "Membros 114 de 252 (45,2%) · Congregados 22 de 52 (42,3%)" — só os vínculos que fazem parte da base escolhida. */
function PorVinculo({ s, id }: { s: SaudeDeUmTipo; id: string }) {
  const itens = (["membro", "congregado", "visitante"] as const).filter(v => s.porVinculo[v]);
  return (
    <p className="text-xs text-muted-foreground" data-por-vinculo={id}>
      {itens.map((v, i) => { const r = s.porVinculo[v]!; return <span key={v}>{i > 0 ? " · " : ""}{ROTULO_DO_VINCULO[v]}: <strong>{num(r.contribuiram)} de {num(r.base)}</strong>{r.adesaoPct === null ? "" : ` (${pct(r.adesaoPct)})`}</span>; })}
    </p>
  );
}

/**
 * O card fixo "Saúde da base contribuinte" (pedido dela, 27/10/2026), agora em DUAS saúdes que respondem perguntas diferentes: a da CONTRIBUIÇÃO (dízimo, oferta ou missões) e a do DÍZIMO (só dízimo),
 * cada uma com a quebra por vínculo. Só números.
 */
function CardSaudeDaBase({ saude, analise, rotuloDaBase, foraDaBase }: { saude: ResumoDaBase; analise: AnaliseDoPeriodo; rotuloDaBase: string; foraDaBase?: ForaDaBase }) {
  const { contribuicao, dizimo } = saude.saude;
  return (
    <Card className="shadow-card-soft border-gold/30" data-card="saude-da-base">
      <CardHeader className="pb-2"><CardTitle className="font-serif text-base">Saúde da base contribuinte</CardTitle><p className="text-xs text-muted-foreground">{rotuloDaBase} (ativos); menores de 18 anos ficam fora da conta de quem não contribuiu.</p></CardHeader>
      <CardContent className="space-y-4">
        <section className="space-y-2" data-saude-secao="contribuicao">
          <div><p className="text-sm font-semibold">Saúde da contribuição</p><p className="text-xs text-muted-foreground">Quem deu dízimo, oferta ou missões no período.</p></div>
          <Caixinhas itens={[
            ["base", "Base ativa", num(saude.base)], ["contribuiram", "Contribuíram", num(contribuicao.contribuiram)], ["adesao", "Adesão à contribuição", pct(contribuicao.adesaoPct)],
            ["nao", "Sem contribuição registrada", num(saude.naoContribuiram)], ["novos", "Novos contribuintes", analise.novos === null ? "—" : num(analise.novos)],
          ]} />
          <PorVinculo s={contribuicao} id="contribuicao" />
        </section>
        <section className="space-y-2" data-saude-secao="dizimo">
          <div><p className="text-sm font-semibold">Saúde do dízimo</p><p className="text-xs text-muted-foreground">Quem deu dízimo no período (ofertas e missões não contam aqui).</p></div>
          <Caixinhas itens={[
            ["base-dizimo", "Base ativa", num(saude.base)], ["dizimistas", "Deram dízimo", num(dizimo.contribuiram)], ["adesao-dizimo", "Adesão ao dízimo", pct(dizimo.adesaoPct)],
            ["recorrentes", "Dizimistas recorrentes", analise.recorrentes ? num(analise.recorrentes.pessoas) : "—"], ["novos-dizimistas", "Novos dizimistas", analise.novosDizimistas === null ? "—" : num(analise.novosDizimistas)],
          ]} />
          <PorVinculo s={dizimo} id="dizimo" />
        </section>
        <div className="text-xs text-muted-foreground space-y-0.5" data-saude-ausencia>
          <p>Sem contribuição há mais de: <strong>30 dias {num(saude.haMaisDe.dias30)}</strong> · <strong>60 dias {num(saude.haMaisDe.dias60)}</strong> · <strong>90 dias {num(saude.haMaisDe.dias90)}</strong> · <strong>180 dias {num(saude.haMaisDe.dias180)}</strong></p>
          <p>Sem contribuição no período e sem registro anterior: <strong>{num(saude.nuncaDesdeOPiso)}</strong> · contribuíram anteriormente, mas não no período: <strong>{num(saude.jaContribuiuAntes)}</strong></p>
          {foraDaBase && <p data-fora-da-base>Contribuintes fora da base: <strong>{num(foraDaBase.pessoas)}</strong>{foraDaBase.pessoas > 0 ? ` (${brl(foraDaBase.valor)}, fora dos indicadores)` : ""}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** A qualidade da identificação, no topo (pedido dela, 27/10/2026): um número sem a sua qualidade engana. O botão leva à aba Pendentes. */
function CardQualidadeDaIdentificacao({ analise, aoVerPendencias }: { analise: AnaliseDoPeriodo; aoVerPendencias?: () => void }) {
  const c = analise.cobertura;
  return (
    <Card className="shadow-card-soft" data-cobertura data-card="qualidade-da-identificacao">
      <CardContent className="p-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Qualidade da identificação</p>
          <p className="font-serif text-3xl font-semibold tabular-nums leading-tight" data-valor>{pct(c.pctDoValor)}</p>
        </div>
        <div className="min-w-0 flex-1 text-xs text-muted-foreground leading-relaxed">
          <p><strong className="text-foreground">{brl(c.valorIdentificado)}</strong> identificados · <strong className="text-foreground">{brl(c.valorNaoIdentificado)}</strong> pendentes ({c.entradasSemPessoa} {c.entradasSemPessoa === 1 ? "entrada" : "entradas"} ficou sem identificação).</p>
          <p className="flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />Os números de pessoas (dizimistas, doadores, recorrência, novos) só contam quem foi identificado.</p>
        </div>
        {aoVerPendencias && c.entradasSemPessoa > 0 && <Button type="button" variant="outline" size="sm" onClick={aoVerPendencias} data-acao="ver-pendencias">Ver pendências</Button>}
      </CardContent>
    </Card>
  );
}

export function PainelDeContribuicoes({ analise, saude, rotuloDaBase, foraDaBase, aoVerPendencias, interpretacao = [] }: { analise: AnaliseDoPeriodo; saude?: ResumoDaBase | null; rotuloDaBase?: string; foraDaBase?: ForaDaBase; aoVerPendencias?: () => void; interpretacao?: { titulo: string; texto: string }[] }) {
  const { periodo, destaques: d } = analise;
  // período longo → barras por mês; curto → por semana (o gráfico semanal de um ano seria uma cerca)
  const porSemana = periodo.dias <= 140;
  const evolucao = useMemo(
    () => (porSemana ? analise.semanas.map(s => ({ x: dm(s.inicio), valor: s.valor })) : analise.meses.map(m => ({ x: mesCurto(m.mes), valor: m.valor }))),
    [analise, porSemana],
  );
  const adesao = useMemo(() => analise.semanas.map(s => ({ x: dm(s.inicio), pessoas: s.contribuintes })), [analise]);
  const mensal = useMemo(() => analise.meses.map(m => ({ x: mesCurto(m.mes), valor: m.valor })), [analise]);
  const semana = (s: SemanaDeContribuicao) => `semana de ${dm(s.inicio)}`;

  if (analise.arrecadado === 0) {
    return (
      <div className="space-y-4">
        {saude && <CardSaudeDaBase saude={saude} analise={analise} rotuloDaBase={rotuloDaBase ?? "Membros e congregados"} foraDaBase={foraDaBase} />}
        <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground" data-vazio>Nenhuma contribuição registrada neste período.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-painel>
      <CardQualidadeDaIdentificacao analise={analise} aoVerPendencias={aoVerPendencias} />
      <ComoInterpretar itens={interpretacao} />
      {saude && <CardSaudeDaBase saude={saude} analise={analise} rotuloDaBase={rotuloDaBase ?? "Membros e congregados"} foraDaBase={foraDaBase} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Indicador id="dizimistas" rotulo="Dizimistas" valor={num(analise.dizimistas)} legenda="pessoas com dízimo identificado" />
        <Indicador id="doadores" rotulo="Doadores" valor={num(analise.doadores)} legenda="dízimos, ofertas ou missões" />
        <Indicador id="arrecadado" rotulo="Arrecadado" valor={brlCurto(analise.arrecadado)} legenda={`Dízimos ${brlCurto(analise.porTipo.dizimo)} · Ofertas ${brlCurto(analise.porTipo.oferta)} · Missões ${brlCurto(analise.porTipo.missoes)}`} />
        <Indicador id="media-mensal" rotulo="Média mensal" valor={brlCurto(analise.mediaMensal)} legenda={`em ${analise.periodo.dias} dias`} />
        <Indicador id="media-doador" rotulo="Média por doador" valor={analise.mediaPorDoador === null ? "—" : brl(analise.mediaPorDoador)} legenda="valor identificado ÷ doadores" />
        <Indicador id="frequencia" rotulo="Frequência média" valor={num(analise.frequenciaMedia, 1)} legenda="contribuições por doador no período" />
        <Indicador id="recorrencia" rotulo="Recorrência" valor={analise.recorrentes ? pct(analise.recorrentes.pct) : "—"}
          legenda={analise.recorrentes ? `${analise.recorrentes.pessoas} dizimistas deram dízimo em todos os ${analise.recorrentes.meses} meses completos` : "o período não tem mês completo"} />
        <Indicador id="novos" rotulo="Novos contribuintes" valor={analise.novos === null ? "—" : num(analise.novos)}
          legenda={analise.novos === null ? `sem histórico anterior confiável (o período começa em ${dataBrCompleta(analise.periodo.ini)})` : "primeira contribuição identificada no período"} />
        <Indicador id="novos-dizimistas" rotulo="Novos dizimistas" valor={analise.novosDizimistas === null ? "—" : num(analise.novosDizimistas)}
          legenda={analise.novosDizimistas === null ? "sem histórico anterior confiável" : "primeiro dízimo identificado no período"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Grafico id="evolucao" titulo="Evolução das contribuições" nota={porSemana ? "valor por semana" : "valor por mês"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolucao} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRADE} />
              <XAxis dataKey="x" tick={eixo} interval="preserveStartEnd" /><YAxis tick={eixo} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
              <Tooltip formatter={(v: number) => [brl(v), "Valor"]} />
              <Line type="monotone" dataKey="valor" stroke={COR} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Grafico>
        <Grafico id="adesao" titulo="Curva de adesão" nota="pessoas diferentes que contribuíram em cada semana">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={adesao} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRADE} />
              <XAxis dataKey="x" tick={eixo} interval="preserveStartEnd" /><YAxis tick={eixo} width={32} allowDecimals={false} />
              <Tooltip formatter={(v: number) => [v, "Pessoas"]} />
              <Bar dataKey="pessoas" fill={COR} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Grafico>
        <div className="md:col-span-2">
          <Grafico id="mensal" titulo="Distribuição mensal" nota="valor arrecadado em cada mês do período (o primeiro e o último podem estar incompletos)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensal} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRADE} />
                <XAxis dataKey="x" tick={eixo} /><YAxis tick={eixo} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                <Tooltip formatter={(v: number) => [brl(v), "Valor"]} />
                <Bar dataKey="valor" fill={COR} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Grafico>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3" data-destaques>
        <Card className="shadow-card-soft"><CardContent className="p-3.5 space-y-0.5" data-destaque="adesao">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Maior adesão</p>
          {d.maiorAdesao ? <><p className="font-serif text-lg font-semibold">{num(d.maiorAdesao.contribuintes)} pessoas</p><p className="text-xs text-muted-foreground">{semana(d.maiorAdesao)}</p></> : <p className="text-sm text-muted-foreground">—</p>}
        </CardContent></Card>
        <Card className="shadow-card-soft"><CardContent className="p-3.5 space-y-0.5" data-destaque="arrecadacao">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Maior arrecadação</p>
          {d.maiorArrecadacao ? <><p className="font-serif text-lg font-semibold">{brl(d.maiorArrecadacao.valor)}</p><p className="text-xs text-muted-foreground">{semana(d.maiorArrecadacao)}</p></> : <p className="text-sm text-muted-foreground">—</p>}
        </CardContent></Card>
        <Card className="shadow-card-soft"><CardContent className="p-3.5 space-y-0.5" data-destaque="crescimento">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Maior crescimento</p>
          {d.maiorCrescimento ? <><p className="font-serif text-lg font-semibold">+{num(d.maiorCrescimento.variacao, 0)}%</p><p className="text-xs text-muted-foreground">{semana(d.maiorCrescimento.semana)} sobre a anterior</p></> : <p className="text-sm text-muted-foreground">—</p>}
        </CardContent></Card>
      </div>
    </div>
  );
}
