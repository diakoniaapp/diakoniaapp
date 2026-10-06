// ─── IndicadoresMissionarios.tsx — missões em duas perguntas que não se misturam ───
//
// Pedido dela (06/10/2026). Antes: o destaque de cima seguia o filtro de período
// ("Hoje", vazio quase todo dia) e o cartão de baixo mostrava o histórico inteiro,
// os dois com o rótulo "Arrecadado". Agora:
//
//   (A) RESULTADO DO PERÍODO  — entradas, saídas e resultado líquido, só do filtro;
//   (B) FUNDO ACUMULADO       — a vida inteira, que NÃO muda com o filtro;
//   (C) GRÁFICO               — entradas × saídas × resultado acumulado, no filtro.
//
// O filtro mora aqui dentro (não é o do resto de "Indicadores Eclesiásticos"): a
// tesouraria abre o restante da tela em "Hoje" por decisão dela de 23/09/2026, e
// missões, que entra no domingo, precisa de um recorte maior para dizer algo.
// As contas estão em `lib/indicadoresMissionarios.ts`, com teste.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CampoData } from "@/components/CampoData";
import { brl, nomeExtrato, type FinLancamentoExtenso } from "@/services/finService";
import {
  PERIODOS_EM_ORDEM, PERIODO_PADRAO, ROTULO_DO_PERIODO, diaDoLancamento, ehRealizado, fundoAcumulado,
  periodoAnterior, periodoDoPreset, resumoDoPeriodo, serieDoPeriodo, variacaoPercentual,
  type PeriodoPreset, type PontoDaSerie,
} from "@/lib/indicadoresMissionarios";

interface Props {
  entradas: FinLancamentoExtenso[];
  saidas: FinLancamentoExtenso[];
  carregando: boolean;
  /** Categoria "Ofertas para Missões" não existe no plano de contas. */
  semCategoriaDeEntrada: boolean;
  /** Nenhuma categoria de repasse missionário no plano de contas. */
  semCategoriaDeRepasse: boolean;
  hoje: string;
  onRegistrarRemessa: () => void;
  onAbrirRemessa: (l: FinLancamentoExtenso) => void;
  onVerDetalheDasOfertas: () => void;
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function IndicadoresMissionarios({
  entradas, saidas, carregando, semCategoriaDeEntrada, semCategoriaDeRepasse, hoje,
  onRegistrarRemessa, onAbrirRemessa, onVerDetalheDasOfertas,
}: Props) {
  const [preset, setPreset] = useState<PeriodoPreset>(PERIODO_PADRAO);
  const [customInicio, setCustomInicio] = useState(hoje);
  const [customFim, setCustomFim] = useState(hoje);

  const { inicio, fim } = periodoDoPreset(preset, hoje, { inicio: customInicio, fim: customFim });
  const ant = periodoAnterior(inicio, fim);

  const calc = useMemo(() => {
    const periodo = resumoDoPeriodo(entradas, saidas, inicio, fim);
    const anterior = resumoDoPeriodo(entradas, saidas, ant.inicio, ant.fim);
    return {
      periodo, anterior,
      fundo: fundoAcumulado(entradas, saidas),
      serie: serieDoPeriodo(entradas, saidas, inicio, fim),
      remessas: saidas
        .filter(l => ehRealizado(l) && diaDoLancamento(l) >= inicio && diaDoLancamento(l) <= fim)
        .sort((a, b) => diaDoLancamento(b).localeCompare(diaDoLancamento(a))),
    };
  }, [entradas, saidas, inicio, fim, ant.inicio, ant.fim]);

  const { periodo, anterior, fundo, serie, remessas } = calc;
  const tendencia = variacaoPercentual(periodo.entradas, anterior.entradas);
  const tomDoResultado = periodo.situacao === "superavit" ? "text-success-text"
    : periodo.situacao === "deficit" ? "text-destructive-text" : "text-muted-foreground";
  const rotuloDoResultado = periodo.situacao === "superavit" ? "Superávit"
    : periodo.situacao === "deficit" ? "Déficit" : "Equilibrado";

  return (
    <div className="space-y-3 mb-3">
      {/* ── Filtro: vale para (A) e (C); (B) fica de fora de propósito ───── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODOS_EM_ORDEM.map(chave => (
          <button key={chave} type="button" onClick={() => setPreset(chave)}
            aria-pressed={preset === chave}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              preset === chave ? "bg-violeta text-violeta-foreground border-transparent" : "bg-card text-muted-foreground hover:text-foreground"
            }`}>
            {ROTULO_DO_PERIODO[chave]}
          </button>
        ))}
        {preset === "custom" && (
          <span className="flex items-end gap-2 ml-1">
            <span>
              <label className="text-xs text-muted-foreground block">De</label>
              <CampoData value={customInicio} onChange={setCustomInicio} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
            </span>
            <span>
              <label className="text-xs text-muted-foreground block">Até</label>
              <CampoData value={customFim} onChange={setCustomFim} className="h-8 w-[10.5rem]" inputClassName="text-sm" />
            </span>
          </span>
        )}
      </div>

      {/* ── (A) Resultado do período ───────────────────────────────────────── */}
      <section className="rounded-lg border-2 border-violeta bg-violeta-soft/40 overflow-hidden" aria-labelledby="mis-periodo">
        <div className="p-4 pb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id="mis-periodo" className="text-sm font-bold text-violeta-text">Resultado do período</h3>
            <p className="text-[11px] text-muted-foreground">
              {ROTULO_DO_PERIODO[preset]} · {inicio === fim ? dataBr(inicio) : `${dataBr(inicio)} a ${dataBr(fim)}`}
            </p>
          </div>
          {!carregando && !semCategoriaDeEntrada && (
            <button type="button" onClick={onVerDetalheDasOfertas}
              className="text-xs font-semibold text-violeta-text hover:underline shrink-0">
              Ver detalhe das ofertas →
            </button>
          )}
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground px-4 pb-4">Carregando…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 px-4 pb-3">
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Entradas missionárias</p>
                <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(periodo.entradas)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {periodo.qtdEntradas} contribuiç{periodo.qtdEntradas === 1 ? "ão" : "ões"}
                  {anterior.entradas > 0 || periodo.entradas > 0 ? ` · ${tendencia >= 0 ? "▲" : "▼"} ${Math.abs(tendencia).toFixed(0)}% vs. período anterior` : ""}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Saídas missionárias</p>
                <p className="text-lg font-extrabold tabular-nums text-destructive-text">{brl(periodo.saidas)}</p>
                <p className="text-[11px] text-muted-foreground">{periodo.qtdSaidas} remessa{periodo.qtdSaidas === 1 ? "" : "s"}</p>
              </div>
              <div className="min-w-0">
                <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Resultado líquido</p>
                <p className={`text-lg font-extrabold tabular-nums ${tomDoResultado}`}>{brl(periodo.resultado)}</p>
                <p className={`text-[11px] font-semibold ${tomDoResultado}`}>{rotuloDoResultado}</p>
              </div>
            </div>
            <p className="px-4 pb-4 text-xs text-muted-foreground">
              {periodo.qtdEntradas === 0 && periodo.qtdSaidas === 0
                ? "Nenhuma oferta nem remessa missionária neste período. Escolha um período maior para comparar."
                : `Neste período entraram ${brl(periodo.entradas)} e saíram ${brl(periodo.saidas)} para missões — ${
                  periodo.situacao === "superavit" ? `superávit de ${brl(periodo.resultado)}.`
                    : periodo.situacao === "deficit" ? `déficit de ${brl(-periodo.resultado)}.` : "resultado equilibrado."}`}
            </p>
          </>
        )}
      </section>

      {/* ── (B) Fundo Missionário Acumulado ────────────────────────────────── */}
      {!semCategoriaDeRepasse && (
        <section className="rounded-lg border bg-card overflow-hidden" aria-labelledby="mis-fundo">
          <div className="p-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 id="mis-fundo" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Fundo Missionário Acumulado
              </h3>
              <p className="text-[11px] text-muted-foreground">Desde o início dos registros — não muda com o período escolhido.</p>
            </div>
            <Button type="button" size="sm" variant="violeta" className="h-6 px-2 text-[11px]" onClick={onRegistrarRemessa}>
              + Registrar remessa
            </Button>
          </div>
          {carregando ? (
            <p className="text-sm text-muted-foreground px-3 pb-3">Carregando…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3 px-3 pb-3">
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Saldo atual</p>
                  <p className={`text-lg font-extrabold tabular-nums ${fundo.saldo >= 0 ? "text-success-text" : "text-destructive-text"}`}>{brl(fundo.saldo)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Total histórico arrecadado</p>
                  <p className="text-lg font-extrabold tabular-nums text-violeta-text">{brl(fundo.arrecadado)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">Total histórico enviado</p>
                  <p className="text-lg font-extrabold tabular-nums text-destructive-text">{brl(fundo.enviado)}</p>
                </div>
              </div>
              {fundo.saldo < 0 && (
                <p className="px-3 pb-3 text-xs text-muted-foreground">
                  A igreja já enviou {brl(-fundo.saldo)} a mais do que arrecadou nas ofertas para missões — a diferença saiu do caixa geral.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* ── (C) Gráfico ─────────────────────────────────────────────────────── */}
      {!carregando && (
        <section className="rounded-lg border bg-card p-3" aria-labelledby="mis-grafico">
          <h3 id="mis-grafico" className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
            Entradas × saídas — {ROTULO_DO_PERIODO[preset].toLowerCase()}
          </h3>
          <GraficoMissionario serie={serie} />
        </section>
      )}

      {/* ── Remessas do período — cada uma abre o detalhe ───────────────────── */}
      {!carregando && remessas.length > 0 && (
        <section className="rounded-lg border bg-card overflow-hidden" aria-label="Remessas do período">
          <p className="px-3 pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Remessas no período ({remessas.length})
          </p>
          <ul className="divide-y border-t">
            {remessas.map(l => (
              <li key={l.id}>
                <button type="button" onClick={() => onAbrirRemessa(l)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-muted/40 transition-colors">
                  <span className="min-w-0 truncate">
                    {diaDoLancamento(l).slice(8, 10)}/{diaDoLancamento(l).slice(5, 7)}{" · "}{nomeExtrato(l).principal}
                  </span>
                  <span className="font-medium tabular-nums shrink-0">{brl(Number(l.valor))}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Gráfico: barras de entrada/saída + linha do resultado acumulado ──────────
// SVG puro: o gráfico é pequeno e o `recharts` só existe em 2 telas (CLAUDE.md §3.4).
function GraficoMissionario({ serie }: { serie: PontoDaSerie[] }) {
  const W = 600, H = 150, PAD_T = 8, PAD_B = 22, PAD_X = 4;
  const maxBarra = Math.max(0, ...serie.flatMap(p => [p.entradas, p.saidas]));
  const acums = serie.map(p => p.acumulado);
  const topo = Math.max(maxBarra, ...acums, 1);
  const base = Math.min(0, ...acums);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (v - base) / (topo - base || 1));
  const slot = (W - PAD_X * 2) / Math.max(serie.length, 1);
  const larguraBarra = Math.min(slot * 0.36, 22);
  const cx = (i: number) => PAD_X + slot * i + slot / 2;
  const semMovimento = maxBarra === 0;
  const indicesDosRotulos = new Set([0, Math.floor((serie.length - 1) / 2), serie.length - 1]);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label="Gráfico de entradas, saídas e resultado acumulado de missões no período">
        <line x1={PAD_X} x2={W - PAD_X} y1={y(0)} y2={y(0)} stroke="hsl(var(--border))" strokeWidth="1" />
        {serie.map((p, i) => (
          <g key={p.inicio}>
            <title>{`${p.rotulo}: entrou ${brl(p.entradas)} · saiu ${brl(p.saidas)} · resultado ${brl(p.saldo)}`}</title>
            <rect x={cx(i) - larguraBarra - 0.5} width={larguraBarra} y={Math.min(y(p.entradas), y(0))}
              height={Math.max(Math.abs(y(0) - y(p.entradas)), p.entradas > 0 ? 1 : 0)} fill="hsl(var(--violeta))" rx="1.5" />
            <rect x={cx(i) + 0.5} width={larguraBarra} y={Math.min(y(p.saidas), y(0))}
              height={Math.max(Math.abs(y(0) - y(p.saidas)), p.saidas > 0 ? 1 : 0)} fill="hsl(var(--destructive))" rx="1.5" />
            {indicesDosRotulos.has(i) && (
              <text x={cx(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === serie.length - 1 ? "end" : "middle"}
                fontSize="10" fill="hsl(var(--muted-foreground))">{p.rotulo}</text>
            )}
          </g>
        ))}
        {serie.length > 1 && (
          <polyline fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5" strokeLinejoin="round"
            points={serie.map((p, i) => `${cx(i)},${y(p.acumulado)}`).join(" ")} />
        )}
        {serie.length > 0 && (
          <circle cx={cx(serie.length - 1)} cy={y(serie[serie.length - 1].acumulado)} r="3" fill="hsl(var(--foreground))" />
        )}
      </svg>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violeta" />Entradas</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-destructive" />Saídas</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-foreground" />Resultado acumulado no período</span>
      </div>
      {semMovimento && <p className="text-xs text-muted-foreground mt-2">Sem movimento missionário neste período.</p>}
    </div>
  );
}
