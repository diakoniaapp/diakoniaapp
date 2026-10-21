// ─── SeletorPeriodo — presets de período estilo Omie ───────────────────────
//
// Pedido da Telma (29/09/2026), inspirado no print de referência do Omie:
// em vez de só "Data inicial"/"Data final" livres, um atalho rápido pros
// recortes que a tesouraria usa o tempo inteiro (Hoje, Mês atual, Este
// ano...), com "Período personalizado" caindo de volta nos dois campos
// (`CampoData`, digitar + calendário) só quando nenhum preset serve.
//
// Cálculo de mês/semana/ano usa `date-fns` (já dependência do projeto,
// mesma convenção `weekStartsOn: 0` já usada em Agenda/Eventos) em cima de
// uma `Date` construída por `parseLocalDate` — nunca `new Date(iso)` nem
// `.toISOString()`, que lê o dia errado perto da meia-noite (ver o
// comentário grande em `src/lib/data.ts`).
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, subMonths, subWeeks, subYears,
} from "date-fns";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CampoData } from "@/components/CampoData";
import { hojeLocal, parseLocalDate, toYmd, daquiADias } from "@/lib/data";
import { aoMudarFim, aoMudarInicio } from "@/lib/intervaloDeDatas";
import type { FinStatus } from "@/services/finService";

export type PeriodoPreset =
  | "hoje" | "ontem"
  | "ultimos_7" | "ultimos_15" | "ultimos_30"
  | "mes_atual" | "mes_anterior"
  | "semana_atual" | "semana_anterior"
  | "ano_atual" | "ano_anterior" | "exercicio_atual"
  | "atrasados"
  | "personalizado";

export const PERIODO_PRESET_LABEL: Record<PeriodoPreset, string> = {
  hoje: "Hoje",
  ontem: "Ontem",
  ultimos_7: "Últimos 7 dias",
  ultimos_15: "Últimos 15 dias",
  ultimos_30: "Últimos 30 dias",
  mes_atual: "Mês atual",
  mes_anterior: "Mês anterior",
  semana_atual: "Esta semana",
  semana_anterior: "Semana anterior",
  ano_atual: "Este ano",
  ano_anterior: "Ano anterior",
  exercicio_atual: "Exercício atual",
  atrasados: "Atrasados",
  personalizado: "Período personalizado",
};

// Ordem exata pedida por ela — o Select segue esta lista.
export const PERIODO_PRESET_ORDEM: PeriodoPreset[] = [
  "hoje", "ontem", "ultimos_7", "ultimos_15", "ultimos_30",
  "mes_atual", "mes_anterior", "semana_atual", "semana_anterior",
  "ano_atual", "ano_anterior", "exercicio_atual", "atrasados", "personalizado",
];

export interface PeriodoResolvido {
  dataInicio: string;
  dataFim: string;
  /** Só "atrasados" usa isto — filtra `previsto` vencido, não uma faixa de data. */
  status?: FinStatus;
}

/**
 * Calcula início/fim (e, pro preset "atrasados", o filtro de status) a
 * partir do preset escolhido. Presets diferentes de "personalizado" são
 * recalculados TODA vez a partir de "hoje" — de propósito: um link salvo
 * com `periodo=mes_atual` deve mostrar o mês atual de quando é aberto, não
 * congelar as datas de quando foi salvo.
 */
export function resolverPeriodo(
  preset: PeriodoPreset,
  personalizadoIni?: string,
  personalizadoFim?: string,
): PeriodoResolvido {
  const hoje = hojeLocal();
  const hojeDate = parseLocalDate(hoje);
  switch (preset) {
    case "hoje":
      return { dataInicio: hoje, dataFim: hoje };
    case "ontem": {
      const o = daquiADias(hoje, -1);
      return { dataInicio: o, dataFim: o };
    }
    case "ultimos_7":
      return { dataInicio: daquiADias(hoje, -6), dataFim: hoje };
    case "ultimos_15":
      return { dataInicio: daquiADias(hoje, -14), dataFim: hoje };
    case "ultimos_30":
      return { dataInicio: daquiADias(hoje, -29), dataFim: hoje };
    case "mes_atual":
      return { dataInicio: toYmd(startOfMonth(hojeDate)), dataFim: toYmd(endOfMonth(hojeDate)) };
    case "mes_anterior": {
      const m = subMonths(hojeDate, 1);
      return { dataInicio: toYmd(startOfMonth(m)), dataFim: toYmd(endOfMonth(m)) };
    }
    case "semana_atual":
      return {
        dataInicio: toYmd(startOfWeek(hojeDate, { weekStartsOn: 0 })),
        dataFim: toYmd(endOfWeek(hojeDate, { weekStartsOn: 0 })),
      };
    case "semana_anterior": {
      const s = subWeeks(hojeDate, 1);
      return {
        dataInicio: toYmd(startOfWeek(s, { weekStartsOn: 0 })),
        dataFim: toYmd(endOfWeek(s, { weekStartsOn: 0 })),
      };
    }
    // "Exercício atual" == "Este ano": confirmado com a Telma (29/09/2026)
    // — a igreja usa ano civil, sem exercício fiscal deslocado. Os dois
    // ficam como opções separadas no menu porque fazem sentido pra
    // vocabulários diferentes (contábil vs. dia a dia), mesmo calculando
    // igual por enquanto.
    case "ano_atual":
    case "exercicio_atual":
      return { dataInicio: toYmd(startOfYear(hojeDate)), dataFim: toYmd(endOfYear(hojeDate)) };
    case "ano_anterior": {
      const a = subYears(hojeDate, 1);
      return { dataInicio: toYmd(startOfYear(a)), dataFim: toYmd(endOfYear(a)) };
    }
    // Vencido = previsto com data antes de hoje, sem piso de data (pode ser
    // de qualquer época) — confirmado com a Telma (29/09/2026). `dataInicio`
    // vazia não filtra chão nenhum (`construirQueryLancamentos` só aplica
    // `.gte` quando o valor existe).
    // (O Extrato da conta não usa mais este preset: virou a Situação "Só vencidos em aberto". Continua aqui para quem ainda usa o `SeletorPeriodo`.)
    case "atrasados":
      return { dataInicio: "", dataFim: daquiADias(hoje, -1), status: "previsto" };
    case "personalizado":
    default:
      return { dataInicio: personalizadoIni ?? hoje, dataFim: personalizadoFim ?? hoje };
  }
}

// Lembrar conta+período entre sessões (pedido da Telma, 29/09/2026: "quando
// o usuário entrar novamente no sistema, lembrar automaticamente a última
// conta e o último período"). NÃO contradiz a decisão de 22/09/2026 (ver
// `FinancasConta.tsx`) de guardar o filtro na URL, não em localStorage (ali
// o motivo era não vazar filtro de uma conta pra outra aba/sessão) — este
// localStorage só entra como VALOR PADRÃO na ausência de `?periodo=` na URL
// (primeiro acesso do dia, ou vindo do hub sem escolher período); qualquer
// URL explícita continua vencendo. Lido também por `Financas.tsx` (hub),
// pro "continuar de onde parei" — por isso mora aqui, não dentro da página.
const CHAVE_CONTEXTO_FINANCAS = "diakonia:financas:contexto";
export interface ContextoFinancasSalvo {
  contaId: string;
  periodo: PeriodoPreset;
  // Só têm sentido pra "personalizado" — os outros presets recalculam a
  // data sozinhos (ver `resolverPeriodo`). Sem isto, "Continuar de onde
  // parei" reabria "Personalizado" mas caía sempre em hoje, não nas datas
  // que a Telma tinha digitado (achado ao vivo por ela, 29/09/2026) — o
  // nome do preset sozinho não bastava pra reconstruir o período.
  dataInicio?: string;
  dataFim?: string;
}
export function lerContextoFinancasSalvo(): ContextoFinancasSalvo | null {
  try {
    const bruto = localStorage.getItem(CHAVE_CONTEXTO_FINANCAS);
    if (!bruto) return null;
    const obj = JSON.parse(bruto);
    if (typeof obj?.contaId === "string" && typeof obj?.periodo === "string") return obj;
    return null;
  } catch { return null; }
}
export function salvarContextoFinancas(contaId: string, periodo: PeriodoPreset, dataInicio?: string, dataFim?: string) {
  try {
    localStorage.setItem(CHAVE_CONTEXTO_FINANCAS, JSON.stringify({ contaId, periodo, dataInicio, dataFim }));
  } catch { /* privado/bloqueado — ignora */ }
}

// ─── O par de datas do Extrato da conta, com atalhos (21/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────
//
// O seletor "Período" (14 opções) saiu do Extrato: ficam Data inicial, Data final e quatro atalhos — Hoje, Semana, Mês, 30 dias — que SÓ PREENCHEM as duas datas. O atalho não
// vira estado: o que vale é o par de datas (mexer numa data depois do atalho não "desmarca" nada, só deixa de casar). Ontem, 7/15 dias, mês/semana/ano anterior, ano atual e
// exercício continuam possíveis digitando. As contas dos atalhos são as do `resolverPeriodo` acima (semana de domingo a sábado, mês fechado, 30 dias contando hoje).
export type AtalhoDePeriodo = "hoje" | "semana" | "mes" | "30dias";

export const ATALHOS_DE_PERIODO: { id: AtalhoDePeriodo; rotulo: string; preset: PeriodoPreset }[] = [
  { id: "hoje", rotulo: "Hoje", preset: "hoje" },
  { id: "semana", rotulo: "Semana", preset: "semana_atual" },
  { id: "mes", rotulo: "Mês", preset: "mes_atual" },
  { id: "30dias", rotulo: "30 dias", preset: "ultimos_30" },
];

export function intervaloDoAtalho(id: AtalhoDePeriodo): { inicio: string; fim: string } {
  const a = ATALHOS_DE_PERIODO.find(x => x.id === id)!;
  const r = resolverPeriodo(a.preset);
  return { inicio: r.dataInicio, fim: r.dataFim };
}

/** Qual atalho o par de datas forma exatamente hoje (para destacá-lo e para lembrar "Hoje" como "Hoje" no dia seguinte), ou null. */
export function atalhoQueCasa(inicio: string, fim: string): AtalhoDePeriodo | null {
  return ATALHOS_DE_PERIODO.find(a => { const r = intervaloDoAtalho(a.id); return r.inicio === inicio && r.fim === fim; })?.id ?? null;
}

/** O que gravar no "continuar de onde parei": o nome do atalho quando o par é um (recalcula no dia seguinte), senão "personalizado" com as datas. */
export function periodoParaLembrar(inicio: string, fim: string): PeriodoPreset {
  const a = atalhoQueCasa(inicio, fim);
  return a ? ATALHOS_DE_PERIODO.find(x => x.id === a)!.preset : "personalizado";
}

/**
 * O par de datas com que o Extrato abre. Prioridade (a mesma de antes, agora sem o seletor):
 *   1. `?periodo=<preset>` na URL (links antigos, favoritos, "continuar de onde parei"): presets que andam com o calendário (mes_atual…) recalculam para HOJE, não congelam;
 *   2. `?de=&ate=` (e `periodo=personalizado`): as datas da URL — a que faltar vem do contexto lembrado, depois de hoje;
 *   3. o contexto lembrado no aparelho (preset recalculado, ou as datas se era personalizado);
 *   4. hoje.
 * `periodo=atrasados` (o antigo preset) abre com a Situação "Só vencidos em aberto" — `vencidos` — e as datas em hoje, que nesse modo não valem.
 */
export function periodoInicialDoExtrato(p: {
  periodoUrl: string | null; de: string | null; ate: string | null; contexto: ContextoFinancasSalvo | null;
}): { inicio: string; fim: string; vencidos: boolean } {
  const hoje = hojeLocal();
  const ctx = p.contexto;
  const doPreset = (preset: PeriodoPreset) => {
    if (preset === "atrasados") return { inicio: hoje, fim: hoje, vencidos: true };
    const r = resolverPeriodo(preset);
    return { inicio: r.dataInicio, fim: r.dataFim, vencidos: false };
  };
  const ehPreset = (s: string | null | undefined): s is PeriodoPreset => !!s && Object.prototype.hasOwnProperty.call(PERIODO_PRESET_LABEL, s);
  const urlPreset = ehPreset(p.periodoUrl) ? p.periodoUrl : null;
  if (urlPreset && urlPreset !== "personalizado") return doPreset(urlPreset);
  if (urlPreset === "personalizado" || p.de || p.ate) {
    return { inicio: p.de ?? ctx?.dataInicio ?? hoje, fim: p.ate ?? ctx?.dataFim ?? hoje, vencidos: false };
  }
  if (ctx && ehPreset(ctx.periodo)) {
    return ctx.periodo === "personalizado"
      ? { inicio: ctx.dataInicio ?? hoje, fim: ctx.dataFim ?? hoje, vencidos: false }
      : doPreset(ctx.periodo);
  }
  return { inicio: hoje, fim: hoje, vencidos: false };
}

interface BarraDePeriodoProps {
  inicio: string;
  fim: string;
  onChange: (r: { inicio: string; fim: string }) => void;
  /** a Situação "Só vencidos" ignora as datas: os campos ficam apagados em vez de enganar */
  desabilitado?: boolean;
}

/** Data inicial – Data final + Hoje · Semana · Mês · 30 dias, numa linha só. Regra do par: lib/intervaloDeDatas.ts. */
export function BarraDePeriodo({ inicio, fim, onChange, desabilitado }: BarraDePeriodoProps) {
  const casa = atalhoQueCasa(inicio, fim);
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${desabilitado ? "opacity-50" : ""}`}
      title={desabilitado ? "A situação \"Só vencidos em aberto\" ignora as datas" : undefined}>
      <label htmlFor="extrato-data-inicial" className="sr-only">Data inicial</label>
      <CampoData id="extrato-data-inicial" value={inicio} disabled={desabilitado} className="w-[10.5rem]"
        onChange={(v) => onChange(aoMudarInicio(v, fim))} />
      <span aria-hidden className="text-muted-foreground text-xs">até</span>
      <label htmlFor="extrato-data-final" className="sr-only">Data final</label>
      <CampoData id="extrato-data-final" value={fim} disabled={desabilitado} className="w-[10.5rem]"
        onChange={(v) => onChange(aoMudarFim(inicio, v))} />
      <div role="group" aria-label="Atalhos de período" className="inline-flex rounded-md border p-0.5 gap-0.5">
        {ATALHOS_DE_PERIODO.map(a => (
          <button key={a.id} type="button" disabled={desabilitado} aria-pressed={casa === a.id}
            onClick={() => onChange(intervaloDoAtalho(a.id))}
            className={`rounded px-2 py-1 text-xs font-medium disabled:cursor-not-allowed ${casa === a.id ? "bg-gold text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SeletorPeriodoProps {
  preset: PeriodoPreset;
  onPresetChange: (preset: PeriodoPreset) => void;
  dataInicio: string;
  dataFim: string;
  onDataInicioChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
}

export function SeletorPeriodo({
  preset, onPresetChange, dataInicio, dataFim, onDataInicioChange, onDataFimChange,
}: SeletorPeriodoProps) {
  return (
    <>
      <div className="w-44">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Período</label>
        <Select value={preset} onValueChange={(v) => onPresetChange(v as PeriodoPreset)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODO_PRESET_ORDEM.map(p => (
              <SelectItem key={p} value={p}>{PERIODO_PRESET_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Datas livres só aparecem no preset "Personalizado" — todo o resto
          já calcula sozinho. Mesmo `CampoData` de sempre: digitar OU
          calendário, com máscara — nada de `<input type="date">` nativo
          (teclado quebrado em WebView, ver o comentário grande em
          `CampoData.tsx`). Regra do par (21/10/2026, substitui a de 29/09): mudar a Data
          inicial NÃO mexe na final, a menos que a final ficasse menor que a inicial — ver lib/intervaloDeDatas.ts. */}
      {preset === "personalizado" && (
        <>
          <div className="min-w-[150px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <CampoData value={dataInicio} onChange={(v) => { const r = aoMudarInicio(v, dataFim); onDataInicioChange(r.inicio); if (r.fim !== dataFim) onDataFimChange(r.fim); }} />
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data final</label>
            <CampoData value={dataFim} onChange={(v) => { const r = aoMudarFim(dataInicio, v); onDataFimChange(r.fim); if (r.inicio !== dataInicio) onDataInicioChange(r.inicio); }} />
          </div>
        </>
      )}
    </>
  );
}
