// ─── CartaoDoGrupo — decidir UMA vez para várias linhas do mesmo padrão ──────────────────────────────────────
//
// "PIX da Cielo", "tarifa bancária", "depósito no caixa eletrônico": o banco escreve igual e ninguém foi identificado pelo
// nome. A tesouraria escolhe a categoria e o centro uma vez e confirma todas. Só agrupa o que `lib/mesaOfx` agrupa
// (linhas novas, sem favorecido, mesmo tipo, 3 ou mais).

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl, type FinCategoria, type FinProjeto } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import type { Grupo } from "@/lib/mesaOfx";
import { nomeCurtoDaCategoria } from "./CartaoDaLinha";
import { CriteriosDoGrupo, SELO } from "./CriteriosDoGrupo";

const SELECT = "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";
const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

interface Props {
  grupo: Grupo;
  linhas: LinhaAnalisada[];
  categorias: FinCategoria[];
  opcoesDeCentro: { id: string; rotulo: string }[];
  projetos: FinProjeto[];
  nomeDaCategoria: (id?: string | null) => string;
  ocupado: boolean;
  onConfirmar: (g: Grupo, escolha: { categoriaId: string; centroId?: string; projetoId?: string }) => void;
}

/** A sugestão mais repetida entre as linhas do grupo (categoria e centro) — o ponto de partida. */
function maisComum(linhas: LinhaAnalisada[], campo: "categoriaId" | "centroId"): string | undefined {
  const conta = new Map<string, number>();
  for (const l of linhas) { const id = l.sugestao?.[campo]; if (id) conta.set(id, (conta.get(id) ?? 0) + 1); }
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export function CartaoDoGrupo({ grupo, linhas, categorias, opcoesDeCentro, projetos, nomeDaCategoria, ocupado, onConfirmar }: Props) {
  const [categoriaId, setCategoriaId] = useState<string>(() => maisComum(linhas, "categoriaId") ?? "");
  const [centroId, setCentroId] = useState<string>(() => maisComum(linhas, "centroId") ?? "");
  const [projetoId, setProjetoId] = useState<string>("");
  const [aberto, setAberto] = useState(false);
  const entrada = grupo.tipo === "entrada";
  const opcoes = useMemo(() => {
    const alt = linhas.flatMap(l => [l.sugestao?.categoriaId, ...(l.sugestao?.alternativas ?? [])]);
    return [categoriaId, ...alt].filter((x, i, a): x is string => !!x && a.indexOf(x) === i).slice(0, 4);
  }, [linhas, categoriaId]);
  const datas = linhas.map(l => l.tx.data).sort();

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          <b className="tabular-nums">{grupo.fitids.length}</b> {entrada ? "entradas" : "saídas"}{grupo.favorecido ? " de " : " com o mesmo padrão: "}<span className="font-medium" title={grupo.amostra}>{grupo.favorecido ?? grupo.amostra.replace(/\s+\d{2}\/\d{2}\s*$/, "")}</span>
          <span className={`ml-1 text-xs ${SELO.seguro.classe}`}>{SELO.seguro.emoji} {SELO.seguro.titulo}</span>
        </p>
        <span className={`shrink-0 text-sm font-medium tabular-nums ${entrada ? "text-success-text" : "text-destructive-text"}`}>{entrada ? "+" : "−"}{brl(grupo.total)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{dataCurta(datas[0])}{datas.length > 1 && datas[datas.length - 1] !== datas[0] ? ` a ${dataCurta(datas[datas.length - 1])}` : ""}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {opcoes.map(id => (
          <button key={id} type="button" disabled={ocupado} aria-pressed={categoriaId === id} onClick={() => setCategoriaId(id)}
            className={`h-8 rounded-md border px-2.5 text-xs ${categoriaId === id ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>
            {nomeCurtoDaCategoria(nomeDaCategoria(id))}
          </button>
        ))}
        <select className={`${SELECT} w-36`} aria-label="Outra categoria para o grupo" disabled={ocupado} value="" onChange={e => { if (e.target.value) setCategoriaId(e.target.value); }}>
          <option value="">{opcoes.length ? "Outra…" : "Categoria…"}</option>
          {categorias.filter(c => !opcoes.includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select className={`${SELECT} w-44`} aria-label="Centro de custo do grupo" disabled={ocupado} value={centroId} onChange={e => setCentroId(e.target.value)}>
          <option value="">Centro de custo…</option>
          {opcoesDeCentro.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
        {projetos.length > 0 && (
          <select className={`${SELECT} w-40`} aria-label="Projeto do grupo (opcional)" disabled={ocupado} value={projetoId} onChange={e => setProjetoId(e.target.value)}>
            <option value="">Sem projeto</option>
            {projetos.map(pr => <option key={pr.id} value={pr.id}>{pr.nome}</option>)}
          </select>
        )}
        <Button type="button" size="sm" className="h-8 gap-1 text-xs" disabled={ocupado || !categoriaId}
          onClick={() => onConfirmar(grupo, { categoriaId, centroId: centroId || undefined, projetoId: projetoId || undefined })}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar as {grupo.fitids.length}
        </Button>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2" onClick={() => setAberto(v => !v)} aria-expanded={aberto}>
          {aberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} ver as linhas
        </button>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Por que é seguro: {grupo.motivo}</summary>
        <div className="mt-1.5"><CriteriosDoGrupo criterios={grupo.criterios} /></div>
      </details>
      {aberto && (
        <ul className="divide-y rounded border bg-background text-xs">
          {linhas.map(l => (
            <li key={l.tx.fitid} className="flex items-center gap-2 px-2 py-1">
              <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{dataCurta(l.tx.data)}</span>
              <span className="min-w-0 flex-1 truncate" title={l.tx.memo}>{l.tx.memo}</span>
              <span className="shrink-0 tabular-nums">{brl(l.tx.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
