// ─── EscolherLancamentoDialog.tsx — "Escolher outro lançamento" ────────────
//
// Botão de cada cartão da Central de Documentos (pedido da Telma, 03/10/2026):
// quando a sugestão está errada — ou não existe —, ela procura o lançamento certo
// aqui. Busca por fornecedor, valor ou data; sem texto, a lista já vem ORDENADA por
// proximidade com o documento (mesmo valor primeiro, depois fornecedor parecido,
// depois a data mais perto). Mostra se o lançamento já tem documento.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { semelhanca, type LancamentoPool } from "@/lib/documentos/casamento";
import type { DocumentoLido } from "@/lib/documentos/leitura";
import { dataBr } from "@/lib/pacoteContabil";
import { brl } from "@/services/finService";

const MAXIMO = 60;

const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Pontua a proximidade com o documento (maior = mais perto). */
function proximidade(l: LancamentoPool, d?: DocumentoLido): number {
  if (!d) return 0;
  let s = 0;
  if (d.valores.some(v => Math.abs(v.valor - l.valor) < 0.005)) s += 100;
  if (d.emitente) s += semelhanca(d.emitente, l.fornecedorNome) * 50;
  const ref = d.emissao ?? d.vencimento;
  if (ref) s += Math.max(0, 30 - Math.abs(new Date(`${ref}T00:00`).getTime() - new Date(`${l.dia}T00:00`).getTime()) / 864e5);
  return s;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pool: LancamentoPool[];
  leitura?: DocumentoLido;
  nomeArquivo: string;
  onEscolher: (l: LancamentoPool) => void;
}

export function EscolherLancamentoDialog({ open, onOpenChange, pool, leitura, nomeArquivo, onEscolher }: Props) {
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const termos = normaliza(busca).split(/\s+/).filter(Boolean);
    const filtrada = termos.length === 0 ? pool : pool.filter(l => {
      const alvo = normaliza(`${l.fornecedorNome} ${l.contaNome} ${l.descricao ?? ""} ${brl(l.valor)} ${l.valor.toFixed(2)} ${l.valor.toFixed(2).replace(".", ",")} ${dataBr(l.dia)} ${l.dia}`);
      return termos.every(t => alvo.includes(t));
    });
    // "previsto" vem DEPOIS do que já foi pago: sem leitura do documento, só a data
    // ordenava, e a lista abria com recorrências previstas até 2030 (medido ao vivo).
    const previsto = (l: LancamentoPool) => (l.status === "previsto" ? 1 : 0);
    return [...filtrada]
      .sort((a, b) => previsto(a) - previsto(b) || proximidade(b, leitura) - proximidade(a, leitura) || b.dia.localeCompare(a.dia))
      .slice(0, MAXIMO);
  }, [pool, busca, leitura]);

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setBusca(""); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escolher outro lançamento</DialogTitle>
          <DialogDescription className="text-xs truncate">
            Para <strong>{nomeArquivo}</strong> — saídas dos últimos 18 meses, as mais parecidas primeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input autoFocus value={busca} onChange={e => setBusca(e.target.value)} className="pl-8"
            placeholder="Favorecido, valor (52,74) ou data (13/08)…" />
        </div>

        <ul className="max-h-[22rem] overflow-y-auto divide-y border rounded-md">
          {lista.length === 0 && <li className="p-4 text-sm text-center text-muted-foreground">Nenhum lançamento encontrado.</li>}
          {lista.map(l => (
            <li key={l.id}>
              <button type="button" onClick={() => { onEscolher(l); onOpenChange(false); setBusca(""); }}
                className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 outline-none">
                <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">{dataBr(l.dia)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.fornecedorNome || "(sem fornecedor)"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {l.contaNome}{l.temAnexo ? " · já tem documento" : ""}{l.status === "previsto" ? " · previsto" : ""}
                  </span>
                </span>
                <span className="tabular-nums shrink-0">{brl(l.valor)}</span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
