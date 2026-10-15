// ─── PrestacaoFluxoDeCaixa — "Indicadores Financeiros e Fluxo de Caixa": o gráfico e os cartões gerenciais da Prestação de Contas ─────────────────────
// O gráfico é SVG próprio (e não uma biblioteca de gráficos): o desenho é o mesmo na tela, na impressão e no PDF, sem depender de medir a largura da janela.
// Entradas e saídas em barras (eixo da esquerda), saldo acumulado em linha (eixo da direita). Agrupamento: Automático · Diário · Semanal · Mensal.
// Os números vêm de `lib/prestacaoIndicadores.ts`: os mesmos lançamentos da demonstração, e o saldo do último dia de cada mês é o "Saldo Final" da tabela.
import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl } from "@/services/finService";
import {
  MODOS_DO_GRAFICO, despesaTotalPorMes, fluxoDoRelatorio, indicadoresGerenciais, tendenciaMensal,
  type BaseDaPrestacao, type ModoDoGrafico, type Tendencia,
} from "@/lib/prestacaoIndicadores";
import type { PontoFluxo } from "@/lib/fluxoCaixa";

const EXATO = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties;
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const NOME_DA_VISAO = { dia: "diária", semana: "semanal", mes: "mensal" } as const;
const UNIDADE = { dia: "dias", semana: "semanas", mes: "meses" } as const;

const L = 74, R = 74, T = 16, B = 48, W = 960, H = 340;

/** Escala linear: `min`→y0 e `max`→y1. */
function escala(min: number, max: number, y0: number, y1: number) {
  const span = max - min || 1;
  return (v: number) => y0 + (y1 - y0) * ((v - min) / span);
}

/** Um eixo com limites e marcas em "números bonitos" (passo 1, 2, 2,5 ou 5 × 10ⁿ), cobrindo [min, max]. */
export function eixoBonito(min: number, max: number, alvo = 4): { min: number; max: number; ticks: number[] } {
  const topo = max <= min ? min + 1 : max;
  const bruto = (topo - min) / alvo;
  const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / exp;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
  const lo = Math.floor(min / passo + 1e-9) * passo;
  const hi = Math.ceil(topo / passo - 1e-9) * passo;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(Math.round(v * 100) / 100);
  return { min: lo, max: hi, ticks };
}

export function GraficoDeFluxo({ pontos, resumoAcessivel }: { pontos: PontoFluxo[]; resumoAcessivel: string }) {
  const n = pontos.length;
  const pw = W - L - R, ph = H - T - B;
  const eixoE = eixoBonito(0, Math.max(...pontos.flatMap(p => [p.entradas, p.saidas]), 0));
  const saldos = pontos.map(p => p.saldo);
  const eixoS = eixoBonito(Math.min(...saldos), Math.max(...saldos));
  const yBarra = escala(eixoE.min, eixoE.max, T + ph, T);
  const ySaldo = escala(eixoS.min, eixoS.max, T + ph, T);
  const banda = pw / Math.max(n, 1);
  const bw = Math.max(2, Math.min(18, banda * 0.36));
  const cx = (i: number) => L + banda * (i + 0.5);
  const passo = Math.max(1, Math.ceil(n / 12));
  const linhaSaldo = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${cx(i).toFixed(1)},${ySaldo(p.saldo).toFixed(1)}`).join(" ");
  const verde = "hsl(var(--success))", vermelho = "hsl(var(--destructive))", ouro = "hsl(var(--gold))", grade = "hsl(var(--border))", texto = "hsl(var(--muted-foreground))";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={resumoAcessivel} style={EXATO}>
      <title>{resumoAcessivel}</title>
      <defs>
        <pattern id="hachura-saidas" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={vermelho} />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="1.6" />
        </pattern>
      </defs>
      {eixoE.ticks.map((v, k) => (
        <g key={k}>
          <line x1={L} x2={W - R} y1={yBarra(v)} y2={yBarra(v)} stroke={grade} strokeWidth={k === 0 ? 1.2 : 0.6} strokeDasharray={k === 0 ? undefined : "3 3"} />
          <text x={L - 8} y={yBarra(v) + 3} textAnchor="end" fontSize={11} fill={texto}>{compacto.format(v)}</text>
        </g>
      ))}
      {eixoS.ticks.map((v, k) => <text key={k} x={W - R + 8} y={ySaldo(v) + 3} fontSize={11} fill={ouro}>{compacto.format(v)}</text>)}
      {eixoS.min < 0 && eixoS.max > 0 && <line x1={L} x2={W - R} y1={ySaldo(0)} y2={ySaldo(0)} stroke={ouro} strokeWidth={0.8} strokeDasharray="2 3" />}
      {pontos.map((p, i) => (
        <g key={p.chave}>
          <title>{`${p.titulo}\nEntradas ${brl(p.entradas)} · Saídas ${brl(p.saidas)}\nSaldo acumulado ${brl(p.saldo)}`}</title>
          <rect x={cx(i) - bw - 0.5} y={yBarra(p.entradas)} width={bw} height={Math.max(0, T + ph - yBarra(p.entradas))} fill={verde} rx={1} />
          <rect x={cx(i) + 0.5} y={yBarra(p.saidas)} width={bw} height={Math.max(0, T + ph - yBarra(p.saidas))} fill="url(#hachura-saidas)" stroke={vermelho} strokeWidth={0.8} rx={1} />
          {i % passo === 0 && <text x={cx(i)} y={H - B + 16} textAnchor="middle" fontSize={10.5} fill={texto}>{p.rotulo}</text>}
        </g>
      ))}
      <path d={linhaSaldo} fill="none" stroke={ouro} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {n <= 45 && pontos.map((p, i) => <circle key={p.chave} cx={cx(i)} cy={ySaldo(p.saldo)} r={2.6} fill={ouro} />)}
      <text x={L} y={H - 6} fontSize={10.5} fill={texto}>Barras: entradas e saídas (eixo à esquerda) · Linha: saldo acumulado (eixo à direita)</text>
    </svg>
  );
}

function Cartao({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-white p-3 min-w-0" style={EXATO}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5 min-w-0">
        <span className={`block font-serif text-[15px] sm:text-lg tabular-nums whitespace-nowrap ${cor ?? ""}`}>{valor}</span>
        {detalhe && <span className="block text-[11px] text-muted-foreground mt-0.5">{detalhe}</span>}
      </dd>
    </div>
  );
}

function ChipDeTendencia({ rotulo, t }: { rotulo: string; t: Tendencia | null }) {
  if (!t) return null;
  const Icone = t.sentido === "queda" ? TrendingDown : TrendingUp;
  const texto = t.sentido === "alta" ? "em alta" : t.sentido === "queda" ? "em queda" : "estável";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white px-2 py-0.5 text-[11px]" style={EXATO}>
      <Icone className="w-3 h-3" /> {rotulo}: <b>{texto}</b> ({t.variacao > 0 ? "+" : ""}{String(t.variacao).replace(".", ",")}%)
    </span>
  );
}

export function FluxoDeCaixaDaPrestacao({ r, contaFiltrada }: { r: BaseDaPrestacao; contaFiltrada: boolean }) {
  const [modo, setModo] = useState<ModoDoGrafico>("automatico");
  const fluxo = useMemo(() => fluxoDoRelatorio(r, modo), [r, modo]);
  const ind = useMemo(() => indicadoresGerenciais(r, fluxo.serie), [r, fluxo.serie]);
  const tEntradas = useMemo(() => tendenciaMensal(r.totalReceitas), [r.totalReceitas]);
  const tSaidas = useMemo(() => tendenciaMensal(despesaTotalPorMes(r)), [r]);
  const un = UNIDADE[fluxo.granularidade];
  const ultimo = fluxo.pontos[fluxo.pontos.length - 1];
  const resumoAcessivel = fluxo.pontos.length === 0 ? "Sem dados" : `Fluxo de caixa em ${fluxo.pontos.length} ${un}, visão ${NOME_DA_VISAO[fluxo.granularidade]}. Saldo final ${brl(ultimo.saldo)}.`;

  return (
    <section aria-label="Indicadores Financeiros e Fluxo de Caixa" className="mt-10 print:break-before-page">
      <h2 className="font-serif text-lg text-gold uppercase tracking-wide border-b-2 border-gold/30 pb-1 mb-1">Indicadores Financeiros e Fluxo de Caixa</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Complementam a prestação de contas acima — não a substituem. Mesmos lançamentos da demonstração; o saldo do último dia de cada mês é o Saldo Final do quadro.
        {contaFiltrada ? " Relatório de uma conta só." : ""}
      </p>

      <div className="avoid-break">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h3 className="font-serif text-sm text-gold uppercase tracking-wide">Fluxo de Caixa · visão {NOME_DA_VISAO[fluxo.granularidade]}</h3>
          <div className="no-print flex items-center gap-1.5 flex-wrap" role="group" aria-label="Agrupamento do gráfico">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Agrupar por</span>
            {MODOS_DO_GRAFICO.map(m => (
              <Button key={m.id} size="sm" variant={modo === m.id ? "default" : "outline"} className="h-7 text-xs" aria-pressed={modo === m.id} onClick={() => setModo(m.id)}>
                {m.rotulo}
              </Button>
            ))}
            {modo === "automatico" && <span className="text-xs text-muted-foreground">→ {NOME_DA_VISAO[fluxo.granularidade]}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-1">
          <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "hsl(var(--success))", ...EXATO }} /> Entradas</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block w-3 h-2.5 rounded-sm border" style={{ background: "repeating-linear-gradient(135deg, hsl(var(--destructive)) 0 2px, #ffffff 2px 4px)", borderColor: "hsl(var(--destructive))", ...EXATO }} /> Saídas</span>
          <span className="inline-flex items-center gap-1"><i className="inline-block w-4 h-0.5" style={{ background: "hsl(var(--gold))", ...EXATO }} /> Saldo acumulado</span>
        </div>
        {fluxo.pontos.length === 0
          ? <p className="text-sm text-muted-foreground italic py-8 text-center">Sem movimento no período.</p>
          : <div className="overflow-x-auto"><div className="min-w-[640px]"><GraficoDeFluxo pontos={fluxo.pontos} resumoAcessivel={resumoAcessivel} /></div></div>}
      </div>

      <div className="avoid-break">
      <h3 className="font-serif text-sm text-gold uppercase tracking-wide mt-6 mb-2">Indicadores Gerenciais</h3>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        <Cartao titulo="Maior arrecadação do período" valor={ind.maiorArrecadacao ? brl(ind.maiorArrecadacao.valor) : "—"} cor="text-success-text"
          detalhe={ind.maiorArrecadacao ? `Mês da maior arrecadação: ${ind.maiorArrecadacao.mes}` : "sem receitas no período"} />
        <Cartao titulo="Maior despesa do período" valor={ind.maiorDespesa ? brl(ind.maiorDespesa.valor) : "—"} cor="text-destructive-text"
          detalhe={ind.maiorDespesa ? `Mês da maior despesa: ${ind.maiorDespesa.mes}` : "sem despesas no período"} />
        <Cartao titulo="Menor saldo registrado" valor={ind.menorSaldo ? brl(ind.menorSaldo.valor) : "—"} cor={(ind.menorSaldo?.valor ?? 0) < 0 ? "text-destructive-text" : undefined}
          detalhe={ind.menorSaldo ? `Mês do menor saldo: ${ind.menorSaldo.mes}` : undefined} />
        <Cartao titulo="Meses com saldo negativo" valor={`${ind.mesesComSaldoNegativo} de ${ind.totalDeMeses}`} cor={ind.mesesComSaldoNegativo > 0 ? "text-destructive-text" : "text-success-text"}
          detalhe="pelo Saldo Final de cada mês" />
        <Cartao titulo="Média mensal de receitas" valor={brl(ind.mediaMensalReceitas)} cor="text-success-text" />
        <Cartao titulo="Média mensal de despesas" valor={brl(ind.mediaMensalDespesas)} cor="text-destructive-text" />
      </dl>
      {(tEntradas || tSaidas) && (
        <p className="mt-2 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
          Tendência (2ª metade do período sobre a 1ª):
          <ChipDeTendencia rotulo="entradas" t={tEntradas} />
          <ChipDeTendencia rotulo="saídas" t={tSaidas} />
        </p>
      )}
      </div>
    </section>
  );
}
