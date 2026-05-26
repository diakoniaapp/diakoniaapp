import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RecorrenciaFreq, RecorrenciaRegra } from "@/lib/agenda/types";
import { descreverRegra } from "@/lib/agenda/recurrence";
import { cn } from "@/lib/utils";

interface Props {
  freq: RecorrenciaFreq;
  regra: RecorrenciaRegra | null;
  onChange: (freq: RecorrenciaFreq, regra: RecorrenciaRegra | null) => void;
}

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

export function RecurrenceEditor({ freq, regra, onChange }: Props) {
  const setFreq = (f: RecorrenciaFreq) => {
    if (f === "nao") return onChange("nao", null);
    const novo: RecorrenciaRegra = {
      freq: f,
      intervalo: 1,
      dias_semana: f === "semanal" ? [new Date().getDay()] : undefined,
      fim: { tipo: "nunca" },
    };
    onChange(f, novo);
  };

  const update = (patch: Partial<RecorrenciaRegra>) => {
    if (!regra) return;
    onChange(freq, { ...regra, ...patch });
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-sm">Repetição</Label>
      <Select value={freq} onValueChange={(v) => setFreq(v as RecorrenciaFreq)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nao">Não se repete</SelectItem>
          <SelectItem value="diario">Diariamente</SelectItem>
          <SelectItem value="semanal">Semanalmente</SelectItem>
          <SelectItem value="mensal">Mensalmente</SelectItem>
          <SelectItem value="anual">Anualmente</SelectItem>
          <SelectItem value="personalizado">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {regra && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">A cada</Label>
              <Input type="number" min={1} value={regra.intervalo}
                onChange={(e) => update({ intervalo: Math.max(1, +e.target.value || 1) })} />
            </div>
            <div className="flex items-end text-xs text-muted-foreground">
              {regra.freq === "diario" && "dia(s)"}
              {regra.freq === "semanal" && "semana(s)"}
              {regra.freq === "mensal" && "mês(es)"}
              {regra.freq === "anual" && "ano(s)"}
              {regra.freq === "personalizado" && "dia(s)"}
            </div>
          </div>

          {regra.freq === "semanal" && (
            <div>
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex gap-1 mt-1">
                {DIAS.map((d, i) => {
                  const sel = regra.dias_semana?.includes(i);
                  return (
                    <button type="button" key={i}
                      onClick={() => {
                        const cur = regra.dias_semana || [];
                        update({ dias_semana: sel ? cur.filter(x => x !== i) : [...cur, i].sort() });
                      }}
                      className={cn(
                        "w-8 h-8 rounded-full text-xs font-medium border transition-colors",
                        sel ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                      )}>{d}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Termina</Label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "nunca"}
                  onChange={() => update({ fim: { tipo: "nunca" } })} />
                Nunca
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "data"}
                  onChange={() => update({ fim: { tipo: "data", data: new Date().toISOString().slice(0, 10) } })} />
                Em
                <Input type="date" className="h-8 w-40 ml-1"
                  disabled={regra.fim.tipo !== "data"}
                  value={regra.fim.tipo === "data" ? regra.fim.data : ""}
                  onChange={(e) => update({ fim: { tipo: "data", data: e.target.value } })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={regra.fim.tipo === "ocorrencias"}
                  onChange={() => update({ fim: { tipo: "ocorrencias", n: 10 } })} />
                Após
                <Input type="number" min={1} className="h-8 w-20 ml-1"
                  disabled={regra.fim.tipo !== "ocorrencias"}
                  value={regra.fim.tipo === "ocorrencias" ? regra.fim.n : 0}
                  onChange={(e) => update({ fim: { tipo: "ocorrencias", n: Math.max(1, +e.target.value || 1) } })} />
                <span className="text-xs text-muted-foreground">ocorrências</span>
              </label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground italic">{descreverRegra(regra)}</p>
        </>
      )}
    </div>
  );
}