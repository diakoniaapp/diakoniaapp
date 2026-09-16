import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { paraNumero } from "@/lib/dinheiro";
import {
  atualizarCentroCusto, criarCentroCusto, VINCULO_LABEL,
  type FinCentroCusto,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // `null` com `open=true` = criando um centro novo (vinculo_tipo
  // "geral" — os outros tipos nascem sozinhos, sincronizados de
  // ministério/área/EBD/PGM/campanha, e criar um manualmente com esses
  // tipos desalinharia do que ele diz representar).
  centro: FinCentroCusto | null;
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
];

// Editar só muda nome/cor/orçamento — `vinculo_tipo`, `vinculo_id` e
// `centro_pai_id` são estruturais (vêm do seed automático ou de
// migration, nunca de digitação) e mudar um deles à toa desalinha o
// centro do que ele diz representar.
//
// Criar (16/09/2026, pedido da Telma — "permita adição dos centros de
// custo"): `criarCentroCusto()` já existia no serviço desde 13/09/2026
// mas nenhuma tela chamava — a única forma de nascer um centro era o
// seed automático. Restrito a quem tem a permissão `estruturar_
// financeiro` (só a Telma, papel "proprietario") — ver o botão "Novo
// centro de custo" em FinancasAdmin.tsx, escondido pra quem não tem essa
// permissão.
export function CentroCustoForm({ open, onOpenChange, centro, onSaved }: Props) {
  const criando = open && !centro;
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#888");
  const [orcamentoTexto, setOrcamentoTexto] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(centro?.nome ?? "");
    setCor(centro?.cor ?? "#888");
    setOrcamentoTexto(centro?.orcamento_anual != null ? String(centro.orcamento_anual) : "");
  }, [open, centro]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const orcamento_anual = orcamentoTexto.trim() ? paraNumero(orcamentoTexto) : null;
      if (criando) {
        await criarCentroCusto({
          nome: nome.trim(), cor, orcamento_anual,
          vinculo_tipo: "geral", vinculo_id: null, vinculo_nome: null, centro_pai_id: null,
        });
        toast.success("Centro de custo criado");
      } else {
        if (!centro) return;
        await atualizarCentroCusto(centro.id, { nome: nome.trim(), cor, orcamento_anual });
        toast.success("Centro de custo atualizado");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            {criando ? "Novo centro de custo" : "Editar centro de custo"}
            {!criando && centro && <Badge variant="outline" className="text-xs">{VINCULO_LABEL[centro.vinculo_tipo]}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {criando
              ? "Uso livre — não fica amarrado a ministério, área, EBD, PGM ou campanha."
              : "Tipo de vínculo não muda por aqui — vem do jeito que o centro nasceu."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>

          <div>
            <Label>Orçamento anual (R$)</Label>
            <Input type="text" inputMode="decimal" value={orcamentoTexto}
              onChange={(e) => setOrcamentoTexto(e.target.value)}
              placeholder="Opcional" />
          </div>

          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CORES.map(c => (
                <button key={c} type="button"
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
