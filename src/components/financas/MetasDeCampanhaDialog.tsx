// ─── MetasDeCampanhaDialog.tsx — meta de cada campanha, por ano ───
//
// A meta mora numa tabela mínima (campanha + ano + valor), não num projeto por exercício: um número
// por campanha/ano, opcional. Sem meta, o painel mostra só o arrecadado.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CAMPANHAS_EM_ORDEM, ROTULO_DA_CAMPANHA, type CampanhaMissionaria, type MetaDeCampanha } from "@/lib/missoesModelo";
import { definirMetaDeCampanha, RECADO_MIGRATION_DE_MISSOES } from "@/services/missoesService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ano: number;
  metas: MetaDeCampanha[];
  disponivel: boolean;
  onMudou: () => void;
}

export function MetasDeCampanhaDialog({ open, onOpenChange, ano, metas, disponivel, onMudou }: Props) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<CampanhaMissionaria | null>(null);

  useEffect(() => {
    if (!open) return;
    const v: Record<string, string> = {};
    for (const c of CAMPANHAS_EM_ORDEM) {
      const m = metas.find(x => x.campanha === c && Number(x.ano) === ano);
      v[c] = m ? String(Number(m.valor)) : "";
    }
    setValores(v);
  }, [open, metas, ano]);

  async function salvar(c: CampanhaMissionaria) {
    const texto = (valores[c] ?? "").trim().replace(",", ".");
    const n = texto === "" ? null : Number(texto);
    if (n !== null && (!Number.isFinite(n) || n <= 0)) { toast.error("A meta precisa ser um valor maior que zero (ou vazio, para remover)."); return; }
    setSalvando(c);
    try {
      await definirMetaDeCampanha(c, ano, n);
      toast.success(n === null ? "Meta removida" : "Meta salva");
      onMudou();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a meta");
    } finally { setSalvando(null); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Metas das campanhas — {ano}</DialogTitle>
          <DialogDescription>
            Um valor por campanha e ano; não é preciso cadastrar projeto. Deixe vazio e salve para remover a meta.
          </DialogDescription>
        </DialogHeader>
        {!disponivel ? (
          <p className="text-sm border border-dashed rounded-md p-3 text-muted-foreground">{RECADO_MIGRATION_DE_MISSOES}</p>
        ) : (
          <div className="space-y-3">
            {CAMPANHAS_EM_ORDEM.map(c => (
              <div key={c} className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <Label>{ROTULO_DA_CAMPANHA[c]}</Label>
                  <Input type="number" step="0.01" value={valores[c] ?? ""} placeholder="Sem meta"
                    onChange={e => setValores(v => ({ ...v, [c]: e.target.value }))} />
                </div>
                <Button type="button" size="sm" onClick={() => salvar(c)} disabled={salvando !== null}>
                  {salvando === c ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
