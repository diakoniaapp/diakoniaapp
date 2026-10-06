// ─── LancamentosACorrigirDialog.tsx — "Abrir Correções" do Fechamento ───────────
//
// Lista, por problema, os lançamentos do mês que impedem (sem categoria, sem centro de
// custo) ou merecem atenção (sem subcentro) — e abre cada um no formulário de edição de
// sempre. Não há tela de correção separada: o ponto é chegar no lançamento certo sem
// procurar no extrato.

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import type { FinLancamentoExtenso } from "@/services/finService";
import type { Avaliacao, LancamentoFechamento } from "@/lib/fechamentoMensal";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const POR_GRUPO = 30;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  avaliacao: Avaliacao;
  /** Depois de salvar uma correção: a aba recarrega a avaliação. */
  onCorrigido: () => void;
}

export function LancamentosACorrigirDialog({ open, onOpenChange, avaliacao, onCorrigido }: Props) {
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  async function corrigir(l: LancamentoFechamento) {
    setAbrindo(l.id);
    try {
      const completo = await buscarLancamentoParaEditar(l.id);
      if (!completo) { toast.error("Lançamento não encontrado — pode ter sido removido."); return; }
      setEditando(completo);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir o lançamento");
    } finally {
      setAbrindo(null);
    }
  }

  const grupos: { chave: string; titulo: string; nota: string; itens: LancamentoFechamento[]; impede: boolean }[] = [
    { chave: "categoria", titulo: "Sem categoria", nota: "Impede o fechamento.", itens: avaliacao.semCategoria, impede: true },
    { chave: "centro", titulo: "Sem centro de custo", nota: "Impede o fechamento.", itens: avaliacao.semCentro, impede: true },
    { chave: "subcentro", titulo: "Sem subcentro", nota: "Só atenção — o centro escolhido tem subcentros e o lançamento ficou no centro-pai.", itens: avaliacao.semSubcentro, impede: false },
  ];
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <>
      {/* a lista se esconde enquanto o formulário está aberto (e volta ao fechar) */}
      <Dialog open={open && !editando} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Correções — {avaliacao.periodo.rotulo}</DialogTitle>
            <DialogDescription>
              {total === 0 ? "Nenhum lançamento a corrigir neste mês." : "Abra cada lançamento, corrija e salve: a lista se atualiza sozinha."}
            </DialogDescription>
          </DialogHeader>

          {grupos.map(g => g.itens.length > 0 && (
            <section key={g.chave} className="space-y-1.5">
              <h3 className="text-sm font-medium flex items-baseline gap-2">
                {g.titulo}
                <span className={`tabular-nums text-xs ${g.impede ? "text-destructive-text" : "text-warning-text"}`}>{g.itens.length}</span>
              </h3>
              <p className="text-xs text-muted-foreground">{g.nota}</p>
              <ul className="divide-y rounded-md border">
                {g.itens.slice(0, POR_GRUPO).map(l => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-xs text-muted-foreground">{dataBr(l.dia)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{l.fornecedor || "(sem fornecedor)"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {l.descricao ? `descrição: ${l.descricao} · ` : ""}{l.contaNome}
                      </span>
                    </span>
                    <span className="tabular-nums shrink-0">{brl(l.valor)}</span>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs shrink-0"
                      disabled={abrindo === l.id} onClick={() => corrigir(l)}>
                      {abrindo === l.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pencil className="w-3 h-3" />} Corrigir
                    </Button>
                  </li>
                ))}
              </ul>
              {g.itens.length > POR_GRUPO && (
                <p className="text-xs text-muted-foreground">
                  + {g.itens.length - POR_GRUPO} outros — corrija estes e a lista traz os próximos.
                </p>
              )}
            </section>
          ))}
        </DialogContent>
      </Dialog>

      {editando && (
        <LancamentoForm
          open
          onOpenChange={(v) => { if (!v) setEditando(null); }}
          lancamento={editando}
          onSaved={() => { setEditando(null); onCorrigido(); }}
        />
      )}
    </>
  );
}
