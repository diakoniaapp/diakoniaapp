// ─── IndicadorDeConfiabilidade — o quadro "Confiabilidade desta lista" (27/10/2026) ────────────────────────────────────────────────────────────────────────────────────
// Pedido dela, antes do primeiro relatório oficial ao pastor: toda lista de "sem dízimo / sem contribuição" mostra o quanto se pode confiar nela — % identificado, pendências, impacto potencial e a data dos
// dados — num indicador visual (alta, média, baixa), com o aviso de que só contam contribuições identificadas e vinculadas a pessoas. Só números: nenhum nome aqui.
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AVISO_SO_IDENTIFICADAS, ROTULO_DO_NIVEL, linhasDaConfiabilidade, type Confiabilidade, type NivelDeConfiabilidade } from "@/lib/contribuicoes";

const ESTILO: Record<NivelDeConfiabilidade, { caixa: string; texto: string; barra: string; Icone: typeof CheckCircle2 }> = {
  alta: { caixa: "border-success/40 bg-success/5", texto: "text-success-text", barra: "bg-success", Icone: CheckCircle2 },
  media: { caixa: "border-warning/40 bg-warning/5", texto: "text-warning-text", barra: "bg-warning", Icone: AlertTriangle },
  baixa: { caixa: "border-destructive/40 bg-destructive/5", texto: "text-destructive-text", barra: "bg-destructive", Icone: ShieldAlert },
};

export function IndicadorDeConfiabilidade({ c, aoVerPendencias }: { c: Confiabilidade; aoVerPendencias?: () => void }) {
  const e = ESTILO[c.nivel];
  const Icone = e.Icone;
  const pctIdentificado = c.pctIdentificado ?? 100;
  const detalhes = linhasDaConfiabilidade(c).slice(1);   // a 1ª linha (o nível) já é o título
  return (
    <div className={`rounded-md border px-3.5 py-3 space-y-2 ${e.caixa}`} data-confiabilidade={c.nivel} role="status">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${e.texto}`} data-nivel><Icone className="w-4 h-4" aria-hidden />Confiabilidade desta lista: {ROTULO_DO_NIVEL[c.nivel]}</p>
        {aoVerPendencias && c.pendentes.quantidade > 0 && <Button type="button" size="sm" variant="outline" className="h-7 ml-auto text-xs" data-acao="ver-pendencias-da-lista" onClick={aoVerPendencias}>Ver pendências</Button>}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-hidden><div className={`h-full ${e.barra}`} style={{ width: `${Math.max(0, Math.min(100, pctIdentificado))}%` }} /></div>
      <ul className="text-xs text-foreground/80 space-y-0.5 leading-relaxed" data-confiabilidade-detalhes>
        {detalhes.map(l => (<li key={l}>{l}</li>))}
      </ul>
      <p className="text-xs text-muted-foreground leading-relaxed" data-aviso="so-identificadas">{AVISO_SO_IDENTIFICADAS}</p>
    </div>
  );
}
