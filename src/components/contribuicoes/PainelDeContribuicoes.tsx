// ─── PainelDeContribuicoes — o painel executivo da tela Doadores (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SÓ AGREGADOS: nenhum nome e nenhum valor individual aparece aqui — por isso o painel não precisa do registro de acessos (esse é da lista nominal). É também o que o e-mail ao pastor levará (mesmo
// cálculo, `lib/contribuicoes`). Cada indicador diz o que conta, e a cobertura de identificação fica à vista: um número sem a sua qualidade engana.
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import { brl } from "@/services/finService";
import type { AnaliseDoPeriodo, SemanaDeContribuicao } from "@/lib/contribuicoes";

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

export function PainelDeContribuicoes({ analise }: { analise: AnaliseDoPeriodo }) {
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
    return <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground" data-vazio>Nenhuma contribuição registrada neste período.</CardContent></Card>;
  }

  return (
    <div className="space-y-4" data-painel>
      <div className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed" data-cobertura>
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          <strong>{pct(analise.cobertura.pctDoValor)}</strong> do valor tem pessoa identificada ({brl(analise.cobertura.valorNaoIdentificado)} em {analise.cobertura.entradasSemPessoa}{" "}
          {analise.cobertura.entradasSemPessoa === 1 ? "entrada" : "entradas"} ficou sem identificação). Os números de pessoas (dizimistas, doadores, recorrência, novos) só contam quem foi identificado.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Indicador id="dizimistas" rotulo="Dizimistas" valor={num(analise.dizimistas)} legenda="pessoas com dízimo identificado" />
        <Indicador id="doadores" rotulo="Doadores" valor={num(analise.doadores)} legenda="dízimos, ofertas ou missões" />
        <Indicador id="arrecadado" rotulo="Arrecadado" valor={brlCurto(analise.arrecadado)} legenda={`Dízimos ${brlCurto(analise.porTipo.dizimo)} · Ofertas ${brlCurto(analise.porTipo.oferta)} · Missões ${brlCurto(analise.porTipo.missoes)}`} />
        <Indicador id="media-mensal" rotulo="Média mensal" valor={brlCurto(analise.mediaMensal)} legenda={`em ${analise.periodo.dias} dias`} />
        <Indicador id="media-doador" rotulo="Média por doador" valor={analise.mediaPorDoador === null ? "—" : brl(analise.mediaPorDoador)} legenda="valor identificado ÷ doadores" />
        <Indicador id="frequencia" rotulo="Frequência média" valor={num(analise.frequenciaMedia, 1)} legenda="contribuições por doador no período" />
        <Indicador id="recorrencia" rotulo="Recorrência" valor={analise.recorrentes ? pct(analise.recorrentes.pct) : "—"}
          legenda={analise.recorrentes ? `${analise.recorrentes.pessoas} dizimistas deram dízimo em todos os ${analise.recorrentes.meses} meses completos` : "o período não tem mês completo"} />
        <Indicador id="novos" rotulo="Novos" valor={analise.novos === null ? "—" : num(analise.novos)}
          legenda={analise.novos === null ? "sem histórico anterior confiável (o período começa em 01/01/2026)" : "primeira contribuição identificada no período"} />
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
