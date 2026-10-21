// ─── SeletorComBusca — lista longa (42 categorias, 44 centros de custo) com campo de busca ─────────────────────────────────────────────────────────────────
//
// O `<Select>` do Radix não tem busca: com 40+ opções a pessoa rola até achar. Aqui o campo filtra enquanto digita (sem acento, sem diferença de maiúscula), e a primeira
// linha ("Todas…") limpa a escolha. Mora dentro do popover de Filtros avançados do Extrato da conta.
import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { normalizarNome } from "@/lib/fuzzyNome";

export interface OpcaoDoSeletor { id: string; nome: string }

interface Props {
  valor: string;
  onChange: (id: string) => void;
  opcoes: OpcaoDoSeletor[];
  /** o que a primeira linha diz e o que o botão mostra quando nada está escolhido ("Todas as categorias") */
  rotuloDeTodos: string;
  ariaLabel: string;
}

export function SeletorComBusca({ valor, onChange, opcoes, rotuloDeTodos, ariaLabel }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const escolhida = opcoes.find(o => o.id === valor);
  const alvo = normalizarNome(busca);
  const visiveis = alvo ? opcoes.filter(o => normalizarNome(o.nome).includes(alvo)) : opcoes;

  function escolher(id: string) {
    onChange(id);
    setAberto(false);
  }

  return (
    <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel} aria-haspopup="listbox"
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-xs hover:bg-muted/40">
          <span className={`truncate ${escolhida ? "" : "text-muted-foreground"}`}>{escolhida?.nome ?? rotuloDeTodos}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-2 space-y-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-3 w-3 text-muted-foreground" />
          <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..."
            aria-label={`Buscar ${ariaLabel.toLowerCase()}`} className="h-8 pl-6 text-base md:text-xs" />
        </div>
        <ul role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto overscroll-contain">
          <li role="option" aria-selected={!valor}>
            <button type="button" onClick={() => escolher("")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs italic text-muted-foreground hover:bg-muted">
              <span className="w-3.5 shrink-0">{!valor && <Check className="h-3.5 w-3.5" />}</span>{rotuloDeTodos}
            </button>
          </li>
          {visiveis.map(o => (
            <li key={o.id} role="option" aria-selected={o.id === valor}>
              <button type="button" onClick={() => escolher(o.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted">
                <span className="w-3.5 shrink-0">{o.id === valor && <Check className="h-3.5 w-3.5" />}</span>
                <span className="truncate">{o.nome}</span>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted-foreground">Nada com esse nome</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
