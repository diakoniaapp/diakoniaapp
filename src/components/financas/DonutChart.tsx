// ─── DonutChart.tsx — Pizza/donut puro SVG sem dependencia ────────────────
import React from "react";

interface DonutChartProps {
  data: { label: string; valor: number; cor: string }[];
  tamanho?: number;
  espessura?: number;
}

export function DonutChart({ data, tamanho = 140, espessura = 24 }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (total === 0) {
    return (
      <div style={{ width: tamanho, height: tamanho }} className="flex items-center justify-center text-xs text-muted-foreground">
        Sem dados
      </div>
    );
  }
  const cx = tamanho / 2;
  const cy = tamanho / 2;
  const raio = tamanho / 2 - espessura / 2 - 2;
  const c = 2 * Math.PI * raio;

  let acumulado = 0;
  const segmentos = data.map((d, i) => {
    const pct = d.valor / total;
    const dash = pct * c;
    const offset = -acumulado * c;
    acumulado += pct;
    return (
      <circle
        key={i}
        cx={cx} cy={cy} r={raio}
        fill="none"
        stroke={d.cor}
        strokeWidth={espessura}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
  });

  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`}>
      <circle cx={cx} cy={cy} r={raio} fill="none" stroke="hsl(var(--muted))" strokeWidth={espessura} />
      {segmentos}
    </svg>
  );
}
