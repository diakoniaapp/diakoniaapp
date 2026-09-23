// ─── ConciliacaoDrawer.tsx — bater com o extrato sem trocar de tela ────────
//
// Fase 10 do roadmap Financeiro ERP (22/09/2026), última peça pra fechar a
// Central Operacional. Pedido dela, escolhendo entre duas formas: "drawer
// largo — clicar em 'aguardando conciliação' abre um painel lateral com o
// extrato daquela conta específica (seleção + 'Conciliar N'), sem trocar de
// rota". Esta é essa peça.
//
// Não é uma tela nova por trás: a lista, a seleção múltipla e
// `conciliarEmLote()` já existiam em `FinancasConta.tsx` — aqui só mudou
// ONDE moram (um `Sheet` sobre o Painel da Tesouraria, escopado a UMA
// conta) e O QUE mostra (só `realizado` dos últimos `DIAS_JANELA_COMPROVANTE`
// dias — o mesmo recorte que já alimenta a contagem de "aguardando
// conciliação" em `painelTesourariaService.ts`, pra não abrir um drawer
// que mostra mais ou menos do que a pendência prometeu).
//
// "Importar OFX" continua sendo o `ConciliacaoOFXDialog` que já existia —
// reaproveitado, não duplicado —, empilhado por cima do drawer: as duas
// formas de conciliar (marcar manual, importar extrato do banco) moram no
// mesmo lugar agora, mas nenhuma delas foi reescrita.

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Scale, FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  listarLancamentosSemTeto, conciliarEmLote, brl, nomeExtrato,
  type FinLancamentoExtenso,
} from "@/services/finService";
import { DIAS_JANELA_COMPROVANTE } from "@/services/painelTesourariaService";
import { hojeMaisDias } from "@/lib/data";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onChange?: () => void;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function ConciliacaoDrawer({ open, onOpenChange, contaId, contaNome, onChange }: Props) {
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conciliando, setConciliando] = useState(false);
  const [ofxOpen, setOfxOpen] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const lancs = await listarLancamentosSemTeto({
        contaId, status: "realizado", dataInicio: hojeMaisDias(-DIAS_JANELA_COMPROVANTE),
      });
      setLancamentos(lancs);
      setSelecionados(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar o extrato");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (open) carregar(); }, [open, contaId]);

  function alternar(id: string) {
    setSelecionados(s => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  function alternarTodos() {
    setSelecionados(s => s.size === lancamentos.length ? new Set() : new Set(lancamentos.map(l => l.id)));
  }

  async function conciliar() {
    if (selecionados.size === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(Array.from(selecionados));
      toast.success(`${selecionados.size} ${selecionados.size === 1 ? "lançamento conciliado" : "lançamentos conciliados"}`);
      await carregar();
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao conciliar");
    } finally {
      setConciliando(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-gold" /> Conciliar — {contaNome}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Realizados dos últimos {DIAS_JANELA_COMPROVANTE} dias que ainda não bateram com o extrato do banco.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={lancamentos.length > 0 && selecionados.size === lancamentos.length}
                onCheckedChange={alternarTodos}
                disabled={lancamentos.length === 0}
              />
              Selecionar todos
            </label>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOfxOpen(true)}>
              <FileUp className="w-3.5 h-3.5" /> Importar OFX
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : lancamentos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center px-4">
                Nada pendente de conciliação nos últimos {DIAS_JANELA_COMPROVANTE} dias — esta conta está em dia.
              </p>
            ) : (
              <ul className="divide-y">
                {lancamentos.map(l => {
                  const { principal, secundario } = nomeExtrato(l);
                  return (
                  <li key={l.id}>
                    <label className="flex items-center gap-2.5 px-4 py-2.5 min-h-11 cursor-pointer hover:bg-muted/30">
                      <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternar(l.id)} />
                      <span className="text-sm min-w-0 flex-1">
                        <span className="font-medium">{principal}</span>
                        {secundario && <span className="text-muted-foreground"> · {secundario}</span>}
                        <span className="text-muted-foreground"> · {dataBr(l.data)}</span>
                      </span>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                        {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                      </span>
                    </label>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>

          {selecionados.size > 0 && (
            <div className="p-3 border-t bg-card">
              <Button type="button" className="w-full gap-1.5 bg-success hover:bg-success text-white"
                onClick={conciliar} disabled={conciliando}>
                {conciliando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />}
                Conciliar {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConciliacaoOFXDialog
        open={ofxOpen}
        onOpenChange={setOfxOpen}
        contaId={contaId}
        contaNome={contaNome}
        onSaved={() => { carregar(); onChange?.(); }}
      />
    </>
  );
}
