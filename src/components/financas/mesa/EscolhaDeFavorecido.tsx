// ─── EscolhaDeFavorecido — trocar quem é o favorecido da linha SEM abrir o formulário completo ────────────────
//
// Na Mesa de Conciliação o sistema já chega com a pessoa ou o fornecedor que o texto do extrato cita. Quando ele erra
// (nome truncado pelo banco, duas pessoas parecidas) a correção tem de caber num clique e numa busca — não num formulário
// de lançamento inteiro. Busca pessoas e favorecidos ao mesmo tempo, igual ao seletor das recorrências.

import { useEffect, useRef, useState } from "react";
import { Building2, Loader2, Search, UserRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buscarPessoasParaLancamento, listarFornecedores } from "@/services/finService";
import type { FavorecidoEscolhido } from "@/lib/gradeOfx";

interface Props {
  /** quem está valendo agora (o sugerido ou o escolhido) */
  atual: { tipo: "pessoa" | "fornecedor"; id: string; nome: string } | null;
  /** o sistema identificou sozinho (mostra o selo "sugerido") */
  sugerido?: boolean;
  disabled?: boolean;
  onChange: (f: FavorecidoEscolhido | null) => void;
}

export function EscolhaDeFavorecido({ atual, sugerido, disabled, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<FavorecidoEscolhido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const sequencia = useRef(0);

  useEffect(() => {
    if (!aberto || busca.trim().length < 2) { setAchados([]); return; }
    const minha = ++sequencia.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const [forns, pessoas] = await Promise.all([
          listarFornecedores(busca.trim()).catch(() => []),
          buscarPessoasParaLancamento(busca.trim()).catch(() => []),
        ]);
        if (minha !== sequencia.current) return;
        setAchados([
          ...forns.slice(0, 6).map(f => ({ tipo: "fornecedor" as const, id: f.id, nome: f.nome, pessoaId: f.pessoa_id ?? null })),
          ...pessoas.slice(0, 6).map(p => ({ tipo: "pessoa" as const, id: p.id, nome: p.nome })),
        ]);
      } finally { if (minha === sequencia.current) setBuscando(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, aberto]);

  const escolher = (f: FavorecidoEscolhido | null) => { onChange(f); setAberto(false); setBusca(""); setAchados([]); };
  const Icone = atual?.tipo === "fornecedor" ? Building2 : UserRound;

  return (
    <Popover open={aberto} onOpenChange={v => { setAberto(v); if (!v) { setBusca(""); setAchados([]); } }}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} title={atual ? `${atual.nome} — clique para trocar` : "Escolher o favorecido"}
          className="inline-flex h-8 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted disabled:opacity-50">
          <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{atual ? atual.nome : "Sem favorecido — escolher"}</span>
          {atual && sugerido && <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">sugerido</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome da pessoa ou do favorecido…" className="h-9 pl-8 text-sm" />
        </div>
        <ul className="mt-2 max-h-56 overflow-y-auto" role="listbox" aria-label="Resultados">
          {buscando && <li className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</li>}
          {!buscando && busca.trim().length >= 2 && achados.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Ninguém com esse nome. Cadastre antes, ou use "Editar".</li>}
          {achados.map(f => (
            <li key={`${f.tipo}-${f.id}`}>
              <button type="button" role="option" aria-selected={false} onClick={() => escolher(f)}
                className="flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                {f.tipo === "pessoa" || f.pessoaId ? <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{f.tipo === "pessoa" || f.pessoaId ? "Pessoa" : "Favorecido"}</span>
              </button>
            </li>
          ))}
        </ul>
        {atual && (
          <button type="button" onClick={() => escolher(null)} className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" aria-hidden /> Sem favorecido (não ligar a ninguém)
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
