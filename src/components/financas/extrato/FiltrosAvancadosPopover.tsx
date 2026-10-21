// ─── Filtros avançados do Extrato da conta — o botão "⚙ Filtros (n)", o popover e os chips de filtro ativo ──────────────────────────────────────────────────
//
// Tipo, Situação (inclui "Só vencidos em aberto" = o antigo preset "Atrasados"), Categoria e Centro de custo (com busca), Valor de/até e Data exata. Regra de ouro: filtro
// ativo nunca fica escondido — o botão leva o contador e `ChipsDeFiltros` desenha um chip removível por filtro logo abaixo da barra de consulta.
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoData } from "@/components/CampoData";
import { SeletorComBusca, type OpcaoDoSeletor } from "./SeletorComBusca";
import {
  FILTROS_VAZIOS, ROTULO_DA_SITUACAO, ROTULO_DO_TIPO, SITUACOES_EM_ORDEM, chipsDosFiltros, contarFiltrosAtivos,
  type FiltrosAvancados, type SituacaoDoFiltro, type TipoDoFiltro,
} from "@/lib/filtrosDoExtrato";

interface Props {
  valor: FiltrosAvancados;
  onChange: (parcial: Partial<FiltrosAvancados>) => void;
  categorias: OpcaoDoSeletor[];
  centros: OpcaoDoSeletor[];
}

const TIPOS: TipoDoFiltro[] = ["todos", "entrada", "saida", "transferencia"];

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</label>
      {children}
    </div>
  );
}

export function FiltrosAvancadosPopover({ valor, onChange, categorias, centros }: Props) {
  const n = contarFiltrosAtivos(valor);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" aria-label={n ? `Filtros (${n} ativos)` : "Filtros"}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
          {n > 0 && <span className="rounded-full bg-gold px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">{n}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Tipo">
            <Select value={valor.tipo} onValueChange={(v) => onChange({ tipo: v as TipoDoFiltro })}>
              <SelectTrigger className="h-8 text-xs" aria-label="Tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map(t => <SelectItem key={t} value={t}>{ROTULO_DO_TIPO[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo rotulo="Situação">
            <Select value={valor.situacao} onValueChange={(v) => onChange({ situacao: v as SituacaoDoFiltro })}>
              <SelectTrigger className="h-8 text-xs" aria-label="Situação"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SITUACOES_EM_ORDEM.map(s => <SelectItem key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        </div>
        {valor.situacao === "vencidos" && (
          <p className="-mt-1 text-[11px] text-warning-text">Previstos que já venceram, de qualquer época, até ontem — as datas da barra não valem.</p>
        )}
        <Campo rotulo="Categoria">
          <SeletorComBusca valor={valor.categoriaId} onChange={(id) => onChange({ categoriaId: id })} opcoes={categorias}
            rotuloDeTodos="Todas as categorias" ariaLabel="Categoria" />
        </Campo>
        <Campo rotulo="Centro de custo">
          <SeletorComBusca valor={valor.centroCustoId} onChange={(id) => onChange({ centroCustoId: id })} opcoes={centros}
            rotuloDeTodos="Todos os centros" ariaLabel="Centro de custo" />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Valor de (R$)">
            <Input type="text" inputMode="decimal" value={valor.valorMin} onChange={(e) => onChange({ valorMin: e.target.value })}
              placeholder="Sem mínimo" aria-label="Valor mínimo" className="h-8 text-base md:text-xs" />
          </Campo>
          <Campo rotulo="Valor até (R$)">
            <Input type="text" inputMode="decimal" value={valor.valorMax} onChange={(e) => onChange({ valorMax: e.target.value })}
              placeholder="Sem máximo" aria-label="Valor máximo" className="h-8 text-base md:text-xs" />
          </Campo>
        </div>
        <Campo rotulo="Só um dia">
          <CampoData value={valor.dataExata} onChange={(v) => onChange({ dataExata: v })} permitirVazio placeholder="Todos os dias do período" />
        </Campo>
        <div className="flex items-center justify-between border-t pt-2">
          <span className="text-[11px] text-muted-foreground">Busca e datas ficam na barra.</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={n === 0}
            onClick={() => onChange({ ...FILTROS_VAZIOS })}>
            Limpar filtros
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Um chip removível por filtro ativo — o filtro nunca fica escondido. Some quando não há nenhum. Na impressão vira uma linha de texto ("Filtros: …"). */
export function ChipsDeFiltros({ valor, onChange, categorias, centros }: Props) {
  const chips = chipsDosFiltros(valor, { categorias, centros });
  if (chips.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 print:hidden" aria-label="Filtros ativos">
        {chips.map(c => (
          <span key={c.chave} className="inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 py-0.5 pl-2.5 pr-1 text-xs">
            {c.rotulo}
            <button type="button" onClick={() => onChange(c.limpar)} aria-label={`Remover filtro: ${c.rotulo}`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => onChange({ ...FILTROS_VAZIOS })}
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">
          Limpar filtros
        </button>
      </div>
      <p className="hidden text-xs text-muted-foreground print:block">Filtros: {chips.map(c => c.rotulo).join(" · ")}</p>
    </>
  );
}
