// ─── FluxoCaixaCard.tsx — o gráfico de Fluxo de Caixa da Visão Executiva ──────
//
// Pedido dela (03/10/2026): base SEMPRE diária — 15 dias = 15 pontos, 90 dias = 90 —
// respeitando exatamente o período escolhido; um "termômetro operacional" do caixa.
// Até ~120 dias é diário e o seletor nem aparece; acima disso: Automático · Diário ·
// Semanal · Mensal. Séries: Entradas, Saídas e Saldo acumulado. Tooltip: data, entradas,
// saídas e resultado do dia e saldo acumulado. As regras (série, agrupamento,
// destaques) estão em `lib/fluxoCaixa.ts`.

import { useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampoData } from "@/components/CampoData";
import {
  LIMITE_DIARIO, agrupar, destaques, granularidadeDe,
  type DiaFluxo, type Granularidade, type ModoFluxo, type PontoFluxo,
} from "@/lib/fluxoCaixa";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

const MODOS: { id: ModoFluxo; rotulo: string }[] = [
  { id: "automatico", rotulo: "Automático" },
  { id: "diario", rotulo: "Diário" },
  { id: "semanal", rotulo: "Semanal" },
  { id: "mensal", rotulo: "Mensal" },
];

const UNIDADE: Record<Granularidade, { do: string; nome: string; plural: string }> = {
  dia: { do: "do dia", nome: "dia", plural: "dias" },
  semana: { do: "da semana", nome: "semana", plural: "semanas" },
  mes: { do: "do mês", nome: "mês", plural: "meses" },
};

interface Props {
  de: string;
  ate: string;
  onDe: (v: string) => void;
  onAte: (v: string) => void;
  /** Um dia por linha, exatamente o período `de`–`ate`. */
  serie: DiaFluxo[];
  carregando: boolean;
}

export function FluxoCaixaCard({ de, ate, onDe, onAte, serie, carregando }: Props) {
  const [modo, setModo] = useState<ModoFluxo>("automatico");

  const dias = serie.length;
  const g = granularidadeDe(dias, modo);
  const pontos = useMemo(() => agrupar(serie, g), [serie, g]);
  const dest = useMemo(() => destaques(pontos), [pontos]);
  const un = UNIDADE[g];
  const periodoInvalido = !!de && !!ate && de > ate;

  // O eixo X usa a chave (única) — `dd/MM` repetiria numa janela de mais de um ano.
  const rotuloEixo = useMemo(() => {
    const comAno = g === "dia" && dias > 200;
    return new Map(pontos.map(p => [p.chave, comAno ? `${p.rotulo}/${p.inicio.slice(2, 4)}` : p.rotulo]));
  }, [pontos, g, dias]);

  const resumoAcessivel = pontos.length === 0 ? "Sem dados" :
    `Fluxo de caixa de ${ddmmaaaa(serie[0].dia)} a ${ddmmaaaa(serie[dias - 1].dia)}, ${pontos.length} ${pontos.length === 1 ? un.nome : un.plural}. ` +
    `Saldo final ${brl(pontos[pontos.length - 1].saldo)}.`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" /> Fluxo de caixa
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dias > 0 ? `${ddmmaaaa(serie[0].dia)} a ${ddmmaaaa(serie[dias - 1].dia)} · ${dias} dias` : "Período selecionado"}
            {dias > 0 && ` · visão ${g === "dia" ? "diária" : g === "semana" ? "semanal" : "mensal"}`}
          </p>
        </div>
        <div className="flex items-end gap-1.5 print:hidden flex-wrap">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">De</label>
            <CampoData value={de} onChange={onDe} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</label>
            <CampoData value={ate} onChange={onAte} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
          </div>
          {carregando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground mb-1.5" />}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* O seletor só existe acima de ~120 dias: até lá a visão é sempre diária. */}
        {dias > LIMITE_DIARIO && (
          <div className="flex items-center gap-1.5 flex-wrap print:hidden" role="group" aria-label="Agrupamento do gráfico">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Agrupar por</span>
            {MODOS.map(m => (
              <Button key={m.id} size="sm" variant={modo === m.id ? "default" : "outline"} className="h-7 text-xs"
                aria-pressed={modo === m.id} onClick={() => setModo(m.id)}>
                {m.rotulo}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">
              {modo === "automatico" && `→ ${g === "dia" ? "diário" : g === "semana" ? "semanal" : "mensal"}`}
            </span>
          </div>
        )}

        {periodoInvalido ? (
          <div className="h-72 flex items-center justify-center text-xs text-destructive-text">
            A data inicial é depois da data final.
          </div>
        ) : pontos.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-xs text-muted-foreground">
            {carregando ? "Carregando…" : "Sem dados ainda."}
          </div>
        ) : (
          <>
            <div className={"h-72 transition-opacity " + (carregando ? "opacity-60" : "")} role="img" aria-label={resumoAcessivel}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pontos} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="chave" tick={{ fontSize: 10 }} interval="preserveStartEnd"
                    // O Recharts pula o rótulo que não couber (sempre mantendo o primeiro e o último). Em
                    // meses/semanas basta um respiro pequeno: no desktop cabem todos, no celular só alguns.
                    minTickGap={g === "dia" ? 18 : 6}
                    tickFormatter={(k: string) => rotuloEixo.get(k) ?? k}
                  />
                  <YAxis tickFormatter={(v: number) => compacto.format(v)} tick={{ fontSize: 10 }} />
                  {/* o zero é a linha entre caixa positivo e negativo */}
                  <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
                  <Tooltip content={<TooltipFluxo unidade={un.do} />} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {/* ponto marcado só enquanto cabe: com 90 dias os pontos viram borrão */}
                  <Line type="monotone" dataKey="entradas" stroke="#059669" strokeWidth={2} name="Entradas"
                    dot={pontos.length <= 45 ? { r: 2.5 } : false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="saidas" stroke="#dc2626" strokeWidth={2} name="Saídas"
                    dot={pontos.length <= 45 ? { r: 2.5 } : false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="saldo" stroke="#b89348" strokeWidth={2} name="Saldo acumulado"
                    dot={pontos.length <= 45 ? { r: 2.5 } : false} activeDot={{ r: 4 }} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* O termômetro em números: o que o olho procura no gráfico, já dito. */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Destaque titulo={`Maior arrecadação (${un.nome})`} ponto={dest.maiorEntrada} valor={dest.maiorEntrada?.entradas} cor="text-success-text" />
              <Destaque titulo={`Maior despesa (${un.nome})`} ponto={dest.maiorSaida} valor={dest.maiorSaida?.saidas} cor="text-destructive-text" />
              <Destaque titulo="Menor saldo" ponto={dest.menorSaldo} valor={dest.menorSaldo?.saldo}
                cor={(dest.menorSaldo?.saldo ?? 0) < 0 ? "text-destructive-text" : "text-foreground"} />
              <div className="rounded-md border p-2">
                <dt className="text-muted-foreground">Saldo negativo</dt>
                <dd className={"font-medium tabular-nums " + (dest.negativos > 0 ? "text-destructive-text" : "text-success-text")}>
                  {dest.negativos} de {dest.total} {dest.total === 1 ? un.nome : un.plural}
                  {dest.total > 0 && <span className="text-muted-foreground font-normal"> ({Math.round((dest.negativos / dest.total) * 100)}%)</span>}
                </dd>
              </div>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Destaque({ titulo, ponto, valor, cor }: { titulo: string; ponto: PontoFluxo | null; valor?: number; cor: string }) {
  return (
    <div className="rounded-md border p-2 min-w-0">
      <dt className="text-muted-foreground">{titulo}</dt>
      {ponto && valor != null ? (
        <dd className="min-w-0">
          <span className={"font-medium tabular-nums " + cor}>{brl(valor)}</span>
          <span className="block text-muted-foreground truncate">{ponto.titulo}</span>
        </dd>
      ) : (
        <dd className="text-muted-foreground">—</dd>
      )}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: PontoFluxo }[];
  unidade: string;
}

function TooltipFluxo({ active, payload, unidade }: TooltipProps) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const linha = (rotulo: string, valor: number, cor?: string) => (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={"tabular-nums font-medium " + (cor ?? "")}>{brl(valor)}</span>
    </div>
  );
  return (
    <div className="rounded-md border bg-card p-2.5 text-[11px] shadow-md space-y-0.5 min-w-[11rem]">
      <div className="font-medium pb-1 mb-1 border-b">{p.titulo}</div>
      {linha(`Entradas ${unidade}`, p.entradas, "text-success-text")}
      {linha(`Saídas ${unidade}`, p.saidas, "text-destructive-text")}
      {linha(`Resultado ${unidade}`, p.resultado, p.resultado < 0 ? "text-destructive-text" : "text-success-text")}
      <div className="pt-1 mt-1 border-t">
        {linha("Saldo acumulado", p.saldo, p.saldo < 0 ? "text-destructive-text" : "")}
      </div>
    </div>
  );
}
