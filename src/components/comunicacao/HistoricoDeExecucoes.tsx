// ─── HistoricoDeExecucoes — aba Histórico da Central de Comunicação ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// HOJE o que o sistema sabe é só isto: as últimas execuções do agendador do resumo semanal (`cron.job_run_details`: data e situação), SEM quem pediu nem para quem foi. O registro completo de envios
// (solicitante, destinatários, resultado por pessoa, origem agendado/sob demanda/teste) é a Fase 1 do roadmap (`comunicacao_envios`) e ainda não existe — a tela diz isso em vez de parecer completa.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, History, Info, XCircle } from "lucide-react";
import type { ResumoSemanalStatus } from "@/services/sistemaService";

function fmtExecucao(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function HistoricoDeExecucoes({ status }: { status: ResumoSemanalStatus | null }) {
  const execucoes = status?.execucoes ?? [];
  return (
    <div className="space-y-4">
      <Card className="shadow-card-soft" data-cartao="historico-execucoes">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg">
            <History className="w-4 h-4 text-gold" /> Últimas execuções do resumo semanal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {execucoes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Nenhum disparo registrado ainda.</p>
          ) : (
            execucoes.map((e, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm min-w-0">
                {e.status === "succeeded"
                  ? <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" />
                  : <XCircle className="w-4 h-4 text-destructive-text shrink-0" />}
                <span className="text-muted-foreground shrink-0">{fmtExecucao(e.inicio)}</span>
                <span className="truncate min-w-0">{e.mensagem ?? e.status}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed" data-aviso="historico-incompleto">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>
          Este histórico mostra só quando o agendador rodou. O registro de <strong>quem enviou, para quem e com que resultado</strong> — inclusive do resumo diário, dos testes e dos relatórios sob demanda —
          ainda não existe e é a próxima etapa da Central.
        </p>
      </div>
    </div>
  );
}
