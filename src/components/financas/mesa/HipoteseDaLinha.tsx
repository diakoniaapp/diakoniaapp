// ─── HipoteseDaLinha — "o que o sistema acredita que esta linha representa" ────────────────────────────────────
//
// Pedido dela (08/10/2026): a Mesa como assistente financeiro. Em vez de "Possível contribuição", mostrar quem é, as últimas
// classificações, o valor, a sugestão, a confiança e o PORQUÊ; nas transferências, origem → destino, valor, data, confiança e motivo.
// O texto bancário bruto fica na primeira linha do cartão; aqui está a interpretação (lib/hipoteseOfx.ts).

import { AlertTriangle, ArrowRightLeft, CheckCircle2, FileQuestion, HelpCircle, UserCheck, Wallet } from "lucide-react";
import { brl } from "@/services/finService";
import type { HipoteseDaLinha as Hipotese } from "@/lib/hipoteseOfx";

const ESTILO: Record<Hipotese["nivel"], string> = {
  identificada: "border-success-line bg-success-soft/40",
  revisar: "border-warning-line bg-warning-soft/40",
  nao_identificada: "border-destructive-line bg-destructive-soft/30",
};
const ICONE_NIVEL = { identificada: CheckCircle2, revisar: AlertTriangle, nao_identificada: HelpCircle } as const;
const COR_NIVEL = { identificada: "text-success-text", revisar: "text-warning-text", nao_identificada: "text-destructive-text" } as const;

function Icone({ h }: { h: Hipotese }) {
  const cls = `h-4 w-4 shrink-0 ${COR_NIVEL[h.nivel]}`;
  if (h.tom === "transferencia") return <ArrowRightLeft className={cls} aria-hidden />;
  if (h.tom === "documento") return <FileQuestion className={cls} aria-hidden />;
  if (h.tom === "deposito") return <Wallet className={cls} aria-hidden />;
  if (h.tom === "pessoa" || h.tom === "fornecedor") return h.nivel === "identificada" ? <UserCheck className={cls} aria-hidden /> : <AlertTriangle className={cls} aria-hidden />;
  const I = ICONE_NIVEL[h.nivel];
  return <I className={cls} aria-hidden />;
}

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
      <dt className="w-32 shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export function HipoteseDaLinha({ h }: { h: Hipotese }) {
  const entrada = h.tipo === "entrada";
  return (
    <section aria-label="O que o sistema acredita" className={`ml-6 space-y-1.5 rounded-md border p-2.5 text-xs ${ESTILO[h.nivel]}`}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Icone h={h} /> {h.titulo}
      </p>
      <dl className="space-y-1">
        {h.quem && <Linha rotulo={h.quem.papel === "Pessoa" ? "Pessoa" : "Fornecedor"}><span className="font-medium">{h.quem.nome}</span></Linha>}
        {h.transferencia && (
          <>
            <Linha rotulo="Origem sugerida"><span className="font-medium">{h.transferencia.origem}</span></Linha>
            <Linha rotulo="Destino"><span className="font-medium">{h.transferencia.destino}</span></Linha>
            {h.transferencia.data && <Linha rotulo="Data da outra perna">{dataCurta(h.transferencia.data)}</Linha>}
          </>
        )}
        {h.anteriores.length > 0 && (
          <Linha rotulo={entrada ? "Contribuições anteriores" : "Últimas classificações"}>
            <span className="inline-flex flex-wrap gap-1">
              {h.anteriores.map((a, i) => <span key={i} className="rounded bg-background/70 px-1.5 py-0.5 ring-1 ring-border">{a}</span>)}
            </span>
          </Linha>
        )}
        <Linha rotulo={h.transferencia ? "Valor" : "Valor atual"}><span className="tabular-nums">{brl(h.valor)}</span></Linha>
        {h.sugestao && <Linha rotulo="Sugestão"><span className="font-medium">{h.sugestao}</span></Linha>}
        <Linha rotulo="Confiança"><span className="tabular-nums font-medium">{h.confianca}%</span></Linha>
        <Linha rotulo={h.porques.length > 1 ? "Motivos" : "Motivo"}>
          {h.porques.length > 1
            ? <ul className="list-disc space-y-0.5 pl-4">{h.porques.map((m, i) => <li key={i}>{m}</li>)}</ul>
            : h.porques[0]}
        </Linha>
      </dl>
      {h.aviso && <p className="flex items-start gap-1.5 font-medium"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-text" aria-hidden /> <span>{h.aviso}</span></p>}
    </section>
  );
}
