// ─── "⚙ Colunas" do Extrato da conta — substitui o par Resumido/Analítico ──────────────────────────────────────────────────────────────────────────────────
//
// Data, Descrição e Valor são fixas; o resto liga e desliga. Compacto e Completo só marcam as caixas (o atalho que casa fica destacado). A escolha é lembrada no aparelho
// (ver lib/colunasDoExtrato.ts). Regras e motivo: docs/ANALISE_UX_EXTRATO_DA_CONTA_2026-10-21.md, §5.
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COLUNAS_OPCIONAIS, colunasDoPreset, presetQueCasa, type ColunaId, type PresetDeColunas,
} from "@/lib/colunasDoExtrato";

interface Props {
  colunas: Set<ColunaId>;
  onChange: (colunas: Set<ColunaId>) => void;
  todasContas: boolean;
}

const PRESETS: { id: PresetDeColunas; rotulo: string }[] = [
  { id: "compacto", rotulo: "Compacto" },
  { id: "completo", rotulo: "Completo" },
];

export function ColunasPopover({ colunas, onChange, todasContas }: Props) {
  const casa = presetQueCasa(colunas, todasContas);
  const opcoes = COLUNAS_OPCIONAIS.filter(c => todasContas || !c.soTodasContas);

  function alternar(id: ColunaId) {
    const novo = new Set(colunas);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    onChange(novo);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Columns3 className="h-3.5 w-3.5" /> Colunas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-1rem)] space-y-2.5 p-3">
        <div role="group" aria-label="Atalhos de colunas" className="inline-flex w-full rounded-md border p-0.5 gap-0.5">
          {PRESETS.map(p => (
            <button key={p.id} type="button" aria-pressed={casa === p.id} onClick={() => onChange(colunasDoPreset(p.id))}
              className={`flex-1 rounded px-2 py-1 text-xs font-medium ${casa === p.id ? "bg-gold text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {p.rotulo}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Data, Descrição e Valor sempre aparecem.</p>
        <ul className="space-y-0.5">
          {opcoes.map(c => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-xs hover:bg-muted/60">
                <Checkbox checked={colunas.has(c.id)} onCheckedChange={() => alternar(c.id)} className="mt-0.5" />
                <span>
                  {c.rotulo}
                  {c.dica && <span className="block text-[11px] text-muted-foreground">{c.dica}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
