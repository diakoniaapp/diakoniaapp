// ─── PainelDeProntidao — "o escritório já consegue trabalhar com este período?" ────────────────────────────────────────────────────────────────────────
// A resposta de topo da Prontidão do malote: o percentual (completas + dispensadas ÷ total), a barra, o veredito em uma linha e as quatro contagens. Peça única: serve à etapa "Prontidão" do
// Fechamento do mês e à página de Auditoria de documentos (mesma regra, `lib/documentacaoExigida.ts`). Só informa — o envio nunca é bloqueado (decisão de 02/10, mantida em 20/10).
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ResumoDaProntidao } from "@/lib/documentacaoExigida";

const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function PainelDeProntidao({ resumo, filtrando = false }: { resumo: ResumoDaProntidao; filtrando?: boolean }) {
  const parte = (n: number) => (resumo.total > 0 ? (n / resumo.total) * 100 : 0);
  const faltamDocumentais = resumo.parciais + resumo.sem;
  const tudoPronto = resumo.total > 0 && resumo.pendentes === 0;
  const documentalOk = resumo.total > 0 && faltamDocumentais === 0;
  return (
    <Card aria-label="Prontidão do malote" data-bloco="prontidao">
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Prontidão do malote{filtrando ? " (filtrada)" : ""}</p>
          <p className={`text-sm font-medium flex items-center gap-1.5 ${tudoPronto ? "text-success-text" : documentalOk ? "text-info-text" : "text-warning-text"}`} data-veredito={tudoPronto ? "pronto" : documentalOk ? "documentos_ok" : "faltam"}>
            {tudoPronto ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {resumo.total === 0 ? "Nenhuma obrigação neste recorte."
              : tudoPronto ? "O escritório já consegue trabalhar com este período."
                : documentalOk ? `Documentação completa. Restam ${resumo.administrativas} ajuste${resumo.administrativas === 1 ? "" : "s"} administrativo${resumo.administrativas === 1 ? "" : "s"}.`
                  : `Faltam ${faltamDocumentais} obrigaç${faltamDocumentais === 1 ? "ão" : "ões"} com documentação incompleta${resumo.administrativas > 0 ? ` e ${resumo.administrativas} ajuste${resumo.administrativas === 1 ? "" : "s"} administrativo${resumo.administrativas === 1 ? "" : "s"}` : ""}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-serif text-4xl leading-none tabular-nums" data-percentual>{pct(resumo.percentual)}</p>
          <p className="text-sm text-muted-foreground tabular-nums"><strong className="text-foreground">{resumo.prontas}</strong> de <strong className="text-foreground">{resumo.total}</strong> obrigações prontas (completas ou dispensadas)</p>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img"
          aria-label={`${resumo.completas} completas, ${resumo.dispensam} dispensam, ${resumo.parciais} parciais, ${resumo.sem} sem documentação`}>
          <span className="bg-success-text/80" style={{ width: `${parte(resumo.completas)}%` }} />
          <span className="bg-success-text/40" style={{ width: `${parte(resumo.dispensam)}%` }} />
          <span className="bg-warning-text/70" style={{ width: `${parte(resumo.parciais)}%` }} />
          <span className="bg-destructive-text/80" style={{ width: `${parte(resumo.sem)}%` }} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Totais do período">
          <Total rotulo="Documentação completa" valor={resumo.completas} tom="ok" />
          <Total rotulo="Documentação parcial" valor={resumo.parciais} tom={resumo.parciais > 0 ? "alerta" : "ok"} nota={resumo.parciais > 0 ? "falta algum documento" : undefined} />
          <Total rotulo="Sem documentação" valor={resumo.sem} tom={resumo.sem > 0 ? "critico" : "ok"} nota={resumo.sem > 0 ? "nenhum anexo" : undefined} />
          <Total rotulo="Dispensam" valor={resumo.dispensam} tom="neutro" nota="tarifas bancárias" />
        </div>
      </CardContent>
    </Card>
  );
}

function Total({ rotulo, valor, nota, tom = "neutro" }: { rotulo: string; valor: number; nota?: string; tom?: "ok" | "alerta" | "critico" | "neutro" }) {
  const cor = tom === "ok" ? "text-success-text" : tom === "alerta" ? "text-warning-text" : tom === "critico" ? "text-destructive-text" : "text-foreground";
  const caixa = tom === "alerta" ? "border-warning-line bg-warning-soft" : tom === "critico" ? "border-destructive-line bg-destructive-soft" : undefined;
  return (
    <Card className={caixa}>
      <CardContent className="p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">{rotulo}</p>
        <p className={`text-3xl font-semibold tabular-nums ${cor}`}>{valor}</p>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardContent>
    </Card>
  );
}
