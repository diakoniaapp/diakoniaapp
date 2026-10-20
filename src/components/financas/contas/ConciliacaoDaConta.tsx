// ─── ConciliacaoDaConta — a aba "Conciliação" da conta: conferir e importar o extrato do banco ──────────────────────────────────────────────────────────
// Fase D (20/10/2026): era o `ConciliacaoDrawer`, uma gaveta sobre o Painel da Tesouraria. Agora é uma ABA da própria conta (uma casa só para tudo o que é banco). A lista, a seleção e o
// `conciliarEmLote()` são os de sempre; "Importar OFX" continua sendo o `ConciliacaoOFXDialog`.
//
// D4 (13/10/2026): marcar à mão é CONFERIR (validação humana); CONCILIAR é ter o vínculo com a linha do banco (OFX ou PDF) — duas provas diferentes.
import { useCallback, useEffect, useState } from "react";
import { FileUp, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { hojeMaisDias } from "@/lib/data";
import { conciliarEmLote, listarLancamentosSemTeto, nomeExtrato, brl, type FinLancamentoExtenso } from "@/services/finService";
import { DIAS_JANELA_COMPROVANTE } from "@/services/painelTesourariaService";

const dataBr = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

export function ConciliacaoDaConta({ contaId, contaNome, onChange }: { contaId: string; contaNome: string; onChange?: () => void }) {
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conferindo, setConferindo] = useState(false);
  const [ofxAberto, setOfxAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      // só `realizado` dos últimos DIAS_JANELA_COMPROVANTE dias: o MESMO recorte que alimenta a contagem de "aguardando conciliação" do painel da Tesouraria
      setLancamentos(await listarLancamentosSemTeto({ contaId, status: "realizado", dataInicio: hojeMaisDias(-DIAS_JANELA_COMPROVANTE) }));
      setSelecionados(new Set());
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar o extrato"); }
    finally { setCarregando(false); }
  }, [contaId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const alternar = (id: string) => setSelecionados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodos = () => setSelecionados(s => (s.size === lancamentos.length ? new Set() : new Set(lancamentos.map(l => l.id))));

  async function conferir() {
    if (selecionados.size === 0) return;
    setConferindo(true);
    try {
      await conciliarEmLote(Array.from(selecionados));
      toast.success(`${selecionados.size} ${selecionados.size === 1 ? "lançamento conferido" : "lançamentos conferidos"}`);
      await carregar();
      onChange?.();
    } catch (e: any) { toast.error(e?.message ?? "Erro ao conferir"); }
    finally { setConferindo(false); }
  }

  return (
    <section aria-label={`Conciliação de ${contaNome}`} className="rounded-lg border bg-card" data-aba="conciliacao">
      <header className="border-b p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold"><Scale className="h-4 w-4 text-gold" /> Conciliar e conferir — {contaNome}</h2>
        <p className="text-xs text-muted-foreground">
          Realizados dos últimos {DIAS_JANELA_COMPROVANTE} dias que ainda não bateram com o extrato do banco. Importe o extrato para CONCILIAR (prova no banco) ou marque e use CONFERIR (validação humana, sem vínculo com o banco).
        </p>
      </header>

      <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <Checkbox checked={lancamentos.length > 0 && selecionados.size === lancamentos.length} onCheckedChange={alternarTodos} disabled={lancamentos.length === 0} />
          Selecionar todos
        </label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOfxAberto(true)}><FileUp className="h-3.5 w-3.5" /> Importar OFX</Button>
      </div>

      {carregando ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : lancamentos.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada pendente de conciliação nos últimos {DIAS_JANELA_COMPROVANTE} dias — esta conta está em dia.</p>
      ) : (
        <ul className="divide-y">
          {lancamentos.map(l => {
            const { principal, secundario } = nomeExtrato(l);
            return (
              <li key={l.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 px-4 py-2.5 hover:bg-muted/30">
                  <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternar(l.id)} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{principal}</span>
                    {secundario && <span className="text-muted-foreground"> · {secundario}</span>}
                    <span className="text-muted-foreground"> · {dataBr(l.data)}</span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>{l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {selecionados.size > 0 && (
        <div className="border-t bg-card p-3">
          <Button variant="success" type="button" className="w-full gap-1.5" onClick={conferir} disabled={conferindo}>
            {conferindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            Conferir {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
          </Button>
        </div>
      )}

      <ConciliacaoOFXDialog open={ofxAberto} onOpenChange={setOfxAberto} contaId={contaId} contaNome={contaNome} onSaved={() => { void carregar(); onChange?.(); }} />
    </section>
  );
}
