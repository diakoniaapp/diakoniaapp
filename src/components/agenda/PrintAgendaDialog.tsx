import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer } from "lucide-react";
import { format, addDays, startOfMonth, endOfMonth } from "date-fns";
import { AgendaFiltros, CategoriaEvento, EventoStatus, EventoTipo, LocalOpt, MinisterioOpt, AreaOpt, TIPO_LABEL, STATUS_LABEL } from "@/lib/agenda/types";
import { CATEGORIA_EXTERNAS } from "@/lib/agenda/externalEvents";
import { CATEGORIA_PESSOAS } from "@/lib/agenda/birthdays";

const ALL_CATS: CategoriaEvento[] = ["igreja", "batista", "feriado", "aniversario", "casamento", "arrecadacao"];

interface Props {
  open: boolean;
  onClose: () => void;
  filtrosAtuais: AgendaFiltros;
  ministerios: MinisterioOpt[];
  areas: AreaOpt[];
  locais: LocalOpt[];
  refDate: Date;
}

function toggle<T extends string>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function PrintAgendaDialog({ open, onClose, filtrosAtuais, ministerios, areas, locais, refDate }: Props) {
  const [inicio, setInicio] = useState(() => format(startOfMonth(refDate), "yyyy-MM-dd"));
  const [fim, setFim] = useState(() => format(endOfMonth(refDate), "yyyy-MM-dd"));
  const [mins, setMins] = useState<string[]>(filtrosAtuais.ministerios);
  const [locs, setLocs] = useState<string[]>(filtrosAtuais.locais);
  const [tipos, setTipos] = useState<EventoTipo[]>(filtrosAtuais.tipos);
  const [status, setStatus] = useState<EventoStatus[]>(filtrosAtuais.status);
  const [cats, setCats] = useState<CategoriaEvento[]>(filtrosAtuais.categorias ?? ALL_CATS);

  useEffect(() => {
    if (open) {
      setInicio(format(startOfMonth(refDate), "yyyy-MM-dd"));
      setFim(format(endOfMonth(refDate), "yyyy-MM-dd"));
      setMins(filtrosAtuais.ministerios);
      setLocs(filtrosAtuais.locais);
      setTipos(filtrosAtuais.tipos);
      setStatus(filtrosAtuais.status);
      setCats(filtrosAtuais.categorias ?? ALL_CATS);
    }
  }, [open, refDate, filtrosAtuais]);

  const submit = () => {
    if (!inicio || !fim || inicio > fim) return;
    const p = new URLSearchParams();
    p.set("inicio", inicio);
    p.set("fim", fim);
    if (mins.length) p.set("ministerios", mins.join(","));
    if (locs.length) p.set("locais", locs.join(","));
    if (tipos.length) p.set("tipos", tipos.join(","));
    if (status.length) p.set("status", status.join(","));
    if (cats.length) p.set("categorias", cats.join(","));
    window.open(`/agenda/imprimir?${p.toString()}`, "_blank");
    onClose();
  };

  const quick = (days: number) => {
    setInicio(format(new Date(), "yyyy-MM-dd"));
    setFim(format(addDays(new Date(), days), "yyyy-MM-dd"));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle translate="no">Imprimir agenda</DialogTitle>
          <DialogDescription>Escolha o período e os filtros para gerar o PDF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label translate="no">Data inicial</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <Label translate="no">Data final</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setInicio(format(new Date(), "yyyy-MM-dd")); setFim(format(new Date(), "yyyy-MM-dd")); }}>Hoje</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => quick(7)}>Próx. 7 dias</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => quick(30)}>Próx. 30 dias</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setInicio(format(startOfMonth(refDate), "yyyy-MM-dd")); setFim(format(endOfMonth(refDate), "yyyy-MM-dd")); }}>Mês atual</Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto pr-1">
            <FilterBox label="Ministérios" items={ministerios.filter(m => m.ativo).map(m => ({ id: m.id, nome: m.nome }))} selected={mins} onToggle={(v) => setMins((s) => toggle(s, v))} onAll={() => setMins(ministerios.filter(m => m.ativo).map(m => m.id))} onNone={() => setMins([])} />
            <FilterBox label="Locais" items={locais.map(l => ({ id: l.id, nome: l.nome_completo || l.nome }))} selected={locs} onToggle={(v) => setLocs((s) => toggle(s, v))} onAll={() => setLocs(locais.map(l => l.id))} onNone={() => setLocs([])} />
            <FilterBox label="Tipos" items={(Object.entries(TIPO_LABEL) as [EventoTipo, string][]).map(([id, nome]) => ({ id, nome }))} selected={tipos} onToggle={(v) => setTipos((s) => toggle(s, v as EventoTipo))} onAll={() => setTipos(Object.keys(TIPO_LABEL) as EventoTipo[])} onNone={() => setTipos([])} />
            <FilterBox label="Status" items={(Object.entries(STATUS_LABEL) as [EventoStatus, string][]).map(([id, nome]) => ({ id, nome }))} selected={status} onToggle={(v) => setStatus((s) => toggle(s, v as EventoStatus))} onAll={() => setStatus(Object.keys(STATUS_LABEL) as EventoStatus[])} onNone={() => setStatus([])} />
            <FilterBox label="Categorias" items={[{ id: "igreja", nome: "Igreja" }, { id: "arrecadacao", nome: "🛍️ Arrecadação" }, ...CATEGORIA_EXTERNAS.map(c => ({ id: c.id, nome: c.label })), ...CATEGORIA_PESSOAS.map(c => ({ id: c.id, nome: c.label }))]} selected={cats} onToggle={(v) => setCats((s) => toggle(s, v as CategoriaEvento))} onAll={() => setCats(ALL_CATS)} onNone={() => setCats([])} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!inicio || !fim || inicio > fim}>
            <Printer className="w-4 h-4 mr-2" /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterBox({ label, items, selected, onToggle, onAll, onNone }: {
  label: string;
  items: { id: string; nome: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="border rounded-md p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={onAll} className="text-primary hover:underline">Todos</button>
          <button type="button" onClick={onNone} className="text-muted-foreground hover:underline">Nenhum</button>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {items.length === 0 ? <p className="text-xs text-muted-foreground">Sem itens.</p> : items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
            <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
            <span className="truncate">{it.nome}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default PrintAgendaDialog;