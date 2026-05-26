import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Filter, Palette } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AgendaFiltros, AreaOpt, CategoriaEvento, EventoStatus, EventoTipo, LocalOpt, MinisterioOpt,
  STATUS_LABEL, TIPO_LABEL,
} from "@/lib/agenda/types";
import { Badge } from "@/components/ui/badge";
import { CATEGORIA_EXTERNAS } from "@/lib/agenda/externalEvents";
import { CATEGORIA_PESSOAS } from "@/lib/agenda/birthdays";

const ALL_CATS: CategoriaEvento[] = ["igreja", "batista", "feriado", "aniversario", "casamento"];

interface Props {
  filtros: AgendaFiltros;
  onChange: (f: AgendaFiltros) => void;
  ministerios: MinisterioOpt[];
  areas: AreaOpt[];
  locais: LocalOpt[];
}

function MultiPopover({
  label, items, selected, onToggle, onClear,
}: {
  label: string;
  items: { id: string; nome: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
        <div className="flex items-center justify-between px-1 pb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <button type="button" onClick={onClear} className="text-xs text-primary hover:underline">Limpar</button>
        </div>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">Nenhum item.</p>
        ) : items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
            <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
            <span className="text-sm truncate">{it.nome}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function AgendaFilters({ filtros, onChange, ministerios, areas, locais }: Props) {
  const tiposItems = useMemo(() => (Object.entries(TIPO_LABEL) as [EventoTipo, string][])
    .map(([id, nome]) => ({ id, nome })), []);
  const statusItems = useMemo(() => (Object.entries(STATUS_LABEL) as [EventoStatus, string][])
    .map(([id, nome]) => ({ id, nome })), []);

  const toggle = <K extends keyof AgendaFiltros>(key: K, value: string) => {
    const arr = filtros[key] as unknown as string[];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    onChange({ ...filtros, [key]: next } as AgendaFiltros);
  };
  const clear = <K extends keyof AgendaFiltros>(key: K) =>
    onChange({ ...filtros, [key]: [] } as AgendaFiltros);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
        <Filter className="w-3.5 h-3.5" /> Filtros
      </div>
      <MultiPopover label="Ministério" items={ministerios.map(m => ({ id: m.id, nome: m.nome }))}
        selected={filtros.ministerios} onToggle={(v) => toggle("ministerios", v)} onClear={() => clear("ministerios")} />
      <MultiPopover label="Área" items={areas.map(a => ({ id: a.id, nome: a.nome }))}
        selected={filtros.areas} onToggle={(v) => toggle("areas", v)} onClear={() => clear("areas")} />
      <MultiPopover label="Tipo" items={tiposItems}
        selected={filtros.tipos} onToggle={(v) => toggle("tipos", v)} onClear={() => clear("tipos")} />
      <MultiPopover label="Local" items={locais.map(l => ({ id: l.id, nome: l.nome_completo || l.nome }))}
        selected={filtros.locais} onToggle={(v) => toggle("locais", v)} onClear={() => clear("locais")} />
      <MultiPopover label="Status" items={statusItems}
        selected={filtros.status} onToggle={(v) => toggle("status", v)} onClear={() => clear("status")} />

      <MultiPopover
        label="Categoria"
        items={[
          { id: "igreja", nome: "Igreja" },
          ...CATEGORIA_EXTERNAS.map((c) => ({ id: c.id, nome: c.label })),
          ...CATEGORIA_PESSOAS.map((c) => ({ id: c.id, nome: c.label })),
        ]}
        selected={filtros.categorias ?? ALL_CATS}
        onToggle={(v) => {
          const cur = filtros.categorias ?? ALL_CATS;
          const next = cur.includes(v as CategoriaEvento)
            ? cur.filter((x) => x !== v)
            : [...cur, v as CategoriaEvento];
          onChange({ ...filtros, categorias: next });
        }}
        onClear={() => onChange({ ...filtros, categorias: ALL_CATS })}
      />

      <div className="flex items-center gap-1.5 ml-auto">
        <Palette className="w-3.5 h-3.5 text-muted-foreground" />
        <Label className="text-xs text-muted-foreground">Cor por:</Label>
        <Select value={filtros.colorBy} onValueChange={(v) => onChange({ ...filtros, colorBy: v as "ministerio" | "tipo" })}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tipo">Tipo de evento</SelectItem>
            <SelectItem value="ministerio">Ministério</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}