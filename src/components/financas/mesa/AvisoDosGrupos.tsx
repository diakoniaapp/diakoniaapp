// ─── AvisoDosGrupos — padrões repetidos que NÃO aceitam decisão em lote ───────────────────────────────────────
//
// Pedidos dela (08/10/2026): "13 saídas com o mesmo texto: PAGTO ELETRON COBRANCA … NET EMPRESA" e "4 entradas de TELMA RODRIGUES
// DE SO" convidavam a confirmar tudo de uma vez, mas o mesmo texto ou o mesmo remetente NÃO é a mesma natureza financeira
// (dízimo, oferta, oferta missionária e contribuição especial podem vir da mesma pessoa no mesmo mês).
// Aqui esses padrões aparecem como AVISO — sem botão de confirmar em lote — com cada linha e o que o motor sugere para ela,
// e as linhas continuam na fila abaixo, para decidir uma a uma.

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { brl } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import type { Grupo } from "@/lib/mesaOfx";
import { CriteriosDoGrupo, SELO } from "./CriteriosDoGrupo";

interface Props {
  grupos: Grupo[];
  linhas: Map<string, LinhaAnalisada>;
  nomeDaCategoria: (id?: string | null) => string;
}

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export function AvisoDosGrupos({ grupos, linhas, nomeDaCategoria }: Props) {
  if (grupos.length === 0) return null;
  const total = grupos.reduce((n, g) => n + g.fitids.length, 0);
  return (
    <details className="rounded-md border border-warning-line bg-warning-soft/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {grupos.length} {grupos.length > 1 ? "padrões" : "padrão"} repetido{grupos.length > 1 ? "s" : ""} sem segurança para decidir em lote ({total} linhas)
        <span className="font-normal text-muted-foreground"> — cada linha é decidida sozinha</span>
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">🟢 seguro = todos os critérios atendidos (aceita lote) · 🟡 parcial = parece igual, mas algo diverge · 🔴 inseguro = a natureza muda de uma linha para outra.</p>
      <ul className="mt-2 space-y-3">
        {grupos.map(g => {
          const insuf = g.seguranca === "inseguro";
          const entrada = g.tipo === "entrada";
          return (
            <li key={`${g.tipo}|${g.por}|${g.chave}`} className="space-y-1">
              <div className="flex items-start gap-2">
                {insuf ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive-text" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden />}
                <p className="min-w-0 flex-1">
                  <b className="tabular-nums">{g.fitids.length}</b> {entrada ? "entradas" : "saídas"}{" "}
                  {insuf ? "sem identificação suficiente" : "parecidas, mas com divergência"}
                  {": "}<span className="font-medium">{g.favorecido ?? g.amostra.replace(/\s+\d{2}\/\d{2}\s*$/, "")}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className={`font-medium ${SELO[g.seguranca].classe}`}>{SELO[g.seguranca].emoji} {SELO[g.seguranca].titulo}</span>
                    {" — "}Motivo: {g.motivo}
                  </span>
                </p>
              </div>
              <div className="ml-6 rounded border bg-background p-2"><CriteriosDoGrupo criterios={g.criterios} /></div>
              <ul className="ml-6 divide-y rounded border bg-background text-xs">
                {g.fitids.map(f => {
                  const l = linhas.get(f);
                  if (!l) return null;
                  const s = l.sugestao;
                  const alvo = s?.possivelMissoes ? "Possível oferta missionária" : nomeDaCategoria(s?.categoriaId) || "sem sugestão";
                  const Icone = s?.banda === "identificada" ? CheckCircle2 : s?.banda === "nao_identificada" || !s ? XCircle : AlertTriangle;
                  const cor = s?.banda === "identificada" ? "text-success-text" : s?.banda === "nao_identificada" || !s ? "text-destructive-text" : "text-warning-text";
                  return (
                    <li key={f} className="flex items-center gap-2 px-2 py-1">
                      <Icone className={`h-3.5 w-3.5 shrink-0 ${cor}`} aria-hidden />
                      <span className="w-10 shrink-0 tabular-nums text-muted-foreground">{dataCurta(l.tx.data)}</span>
                      <span className="shrink-0 tabular-nums">{brl(l.tx.valor)}</span>
                      <span className="min-w-0 flex-1 truncate">→ {alvo}</span>
                      {s && <span className="shrink-0 tabular-nums text-muted-foreground">{s.confianca}%</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
