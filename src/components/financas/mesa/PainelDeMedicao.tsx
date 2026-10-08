// ─── PainelDeMedicao — "quantas o sistema acertou sozinho, quantas pediram uma olhada, quantas foram à mão" ────
//
// A reimportação de setembro/outubro é o teste real da Mesa. Este painel conta, ao vivo e sem guardar nada: o que o
// motor classificou ao abrir o arquivo e o que a tesouraria fez com cada linha. "Copiar relatório" gera o texto da rodada.

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { textoDaMedicao, type Medicao } from "@/lib/mesaOfx";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : "—");

export function PainelDeMedicao({ medicao, rotulo }: { medicao: Medicao; rotulo: string }) {
  const a = medicao.aoAbrir;
  const novas = a.identificadas + a.revisar + a.naoIdentificadas;
  const r = medicao.resolvidas;
  const feitas = r.aceitasSemMudar + r.corrigidas + r.manuais + r.ignoradas;
  async function copiar() {
    try { await navigator.clipboard.writeText(textoDaMedicao(medicao, rotulo)); toast.success("Relatório da medição copiado"); }
    catch { toast.error("Não foi possível copiar — selecione o texto do painel"); }
  }
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Medição desta importação · {feitas} de {novas} novas resolvidas
        {r.aceitasSemMudar > 0 && <span className="font-normal text-muted-foreground"> · {r.aceitasSemMudar} aceitas sem mudar ({pct(r.aceitasSemMudar, novas)})</span>}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">O motor, ao abrir o arquivo</p>
          <p>✓ Identificadas automaticamente: <b className="tabular-nums">{a.identificadas}</b> ({pct(a.identificadas, novas)})</p>
          <p>⚠ Precisam de revisão: <b className="tabular-nums">{a.revisar}</b> ({pct(a.revisar, novas)})</p>
          <p>❌ Não identificadas: <b className="tabular-nums">{a.naoIdentificadas}</b> ({pct(a.naoIdentificadas, novas)})</p>
          <p className="text-xs text-muted-foreground">Fora da fila: {a.jaRegistradas} já registradas · {a.conciliar} a conciliar · {a.debitos} débitos automáticos · {a.documentos} documentos · {a.transferencias} transferências</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">O que foi feito até agora</p>
          <p>Aceitas sem mudar nada: <b className="tabular-nums">{r.aceitasSemMudar}</b> <span className="text-xs text-muted-foreground">({r.aceitasEmIdentificadas} identificadas · {r.aceitasEmRevisar} que pediam revisão)</span></p>
          <p>Corrigidas na própria linha: <b className="tabular-nums">{r.corrigidas}</b></p>
          <p>Formulário completo ou transferência: <b className="tabular-nums">{r.manuais}</b></p>
          <p>Ignoradas: <b className="tabular-nums">{r.ignoradas}</b> · decididas em grupo: <b className="tabular-nums">{r.viaGrupo}</b></p>
          <p>Ainda pendentes: <b className="tabular-nums">{medicao.pendentes}</b></p>
          {medicao.errosNaIdentificada > 0 && <p className="text-xs text-warning-text">{medicao.errosNaIdentificada} das identificadas precisaram de correção.</p>}
          {medicao.missoes.sugeridas > 0 && <p className="text-xs text-muted-foreground">Possível oferta missionária (,10): {medicao.missoes.sugeridas} sugeridas · {medicao.missoes.confirmadas} confirmadas como Missões</p>}
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" className="mt-3 gap-1.5" onClick={copiar}><Copy className="h-3.5 w-3.5" /> Copiar relatório</Button>
    </details>
  );
}
