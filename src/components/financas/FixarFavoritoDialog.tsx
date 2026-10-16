// ─── FixarFavoritoDialog.tsx — fixar um atalho pessoal na Home ─────────
//
// Fase 12 (Workspace Financeiro, 23/09/2026): "Favoritos reais" —
// prioridade 4 da lista dela. Quatro destinos: conta, favorecido, centro de custo e TELA do Financeiro.
// 16/10/2026: a lista de telas deixou de ser fixa (6 relatórios escolhidos à mão, e toda tela nova ficava de fora). Vem do registro único
// das telas (lib/favoritosFinanceiros.ts): tela nova do Financeiro entra sozinha, salvo motivo técnico registrado.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { listarFornecedores, listarCentrosCusto, type FinConta, type FinFornecedor, type FinCentroCusto } from "@/services/finService";
import { fixarFavorito, type FinFavoritoTipo } from "@/services/favoritosService";
import { telasFixaveis } from "@/lib/favoritosFinanceiros";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contas: FinConta[];
  onFixado: () => void;
}

export function FixarFavoritoDialog({ open, onOpenChange, contas, onFixado }: Props) {
  const [tipo, setTipo] = useState<FinFavoritoTipo>("conta");
  const [destino, setDestino] = useState("");
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo("conta");
    setDestino("");
    listarFornecedores().then(setFornecedores).catch(() => setFornecedores([]));
    listarCentrosCusto().then(setCentros).catch(() => setCentros([]));
  }, [open]);

  const opcoes = tipo === "conta"
    ? contas.map(c => ({ valor: c.id, rotulo: c.nome, rota: `/financas/conta/${c.id}` }))
    : tipo === "fornecedor"
    ? fornecedores.map(f => ({ valor: f.id, rotulo: f.nome, rota: `/financas/favorecido/${f.id}` }))
    : tipo === "centro_custo"
    ? centros.map(c => ({ valor: c.id, rotulo: c.nome, rota: `/financas/centro/${c.id}` }))
    : telasFixaveis().map(t => ({ valor: t.rota, rotulo: t.rotulo, rota: t.rota, exibicao: t.secao ? `${t.rotulo} · ${t.secao}` : t.rotulo }));

  async function confirmar() {
    const escolhida = opcoes.find(o => o.valor === destino);
    if (!escolhida) { toast.error("Escolha o que fixar"); return; }
    setBusy(true);
    try {
      await fixarFavorito({ tipo, rotulo: escolhida.rotulo, rota: escolhida.rota });
      toast.success(`"${escolhida.rotulo}" fixado nos favoritos`);
      onOpenChange(false);
      onFixado();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao fixar favorito");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Fixar atalho</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>O que é</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as FinFavoritoTipo); setDestino(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="conta">Conta financeira</SelectItem>
                <SelectItem value="fornecedor">Favorecido</SelectItem>
                <SelectItem value="centro_custo">Centro de custo</SelectItem>
                <SelectItem value="relatorio">Tela ou relatório</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Qual</Label>
            <Select value={destino} onValueChange={setDestino}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {opcoes.map(o => <SelectItem key={o.valor} value={o.valor}>{(o as { exibicao?: string }).exibicao ?? o.rotulo}</SelectItem>)}
                {opcoes.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nada disponível</div>}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy || !destino}>{busy ? "..." : "Fixar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
