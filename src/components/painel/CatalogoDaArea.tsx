// ─── CatalogoDaArea.tsx ──────────────────────────────────────────────────────
// Renomear e acrescentar postos, num lugar só por área.
//
// ── POR QUE NÃO É NO CARTÃO DE CADA PESSOA ───────────────────────────────────
//
// `PostosDoVinculo` já deixa CRIAR o primeiro posto, de dentro da linha de
// cada pessoa — e faz sentido lá, porque nasce junto da primeira ocupação.
// Mas RENOMEAR um posto que já existe é outra operação: se ficasse repetida
// em cada uma das 25 linhas da Recepção, seriam 25 botões de editar para o
// mesmo nome — e editar por qualquer um deles muda a mesma linha do banco,
// então as outras 24 ficariam mostrando o nome velho até recarregar.
//
// Aqui é uma vez por área, na seção "Áreas", onde a área já aparece uma vez.

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Check, X, Loader2 } from "lucide-react";
import { criarPosto, editarPosto, type Posto } from "@/services/postos";

export function CatalogoDaArea({ areaId, areaNome, catalogo, podeEditar, onMudou }: {
  areaId: string;
  areaNome: string;
  catalogo: Posto[];
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvarEdicao(posto: Posto) {
    const novo = rascunho.trim();
    if (!novo || novo === posto.nome) { setEditando(null); return; }
    setOcupado(true);
    const r = await editarPosto(posto.id, novo);
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`"${posto.nome}" agora é "${r.posto!.nome}".`);
    setEditando(null);
    onMudou();
  }

  async function criar() {
    const r = await criarPosto(areaId, rascunho, catalogo.length + 1);
    if (!r.ok) return toast.error(r.erro);
    toast.success(`${r.posto.nome} agora existe em ${areaNome}.`);
    setRascunho("");
    setCriando(false);
    onMudou();
  }

  // Sem permissão, a lista é só leitura — nomes, sem lápis nem "+".
  if (!podeEditar) {
    return catalogo.length > 0 ? (
      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
        {catalogo.map(p => (
          <span key={p.id} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
            {p.nome}
          </span>
        ))}
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
      {catalogo.map(p => (
        editando === p.id ? (
          <span key={p.id} className="inline-flex items-center gap-1">
            <Input
              autoFocus
              value={rascunho}
              onChange={e => setRascunho(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); salvarEdicao(p); }
                if (e.key === "Escape") setEditando(null);
              }}
              className="h-7 w-40 text-xs"
            />
            <button type="button" onClick={() => salvarEdicao(p)} disabled={ocupado}
              aria-label={`Salvar novo nome para ${p.nome}`}
              className="rounded p-1 text-primary hover:bg-primary/10 disabled:opacity-50">
              {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => setEditando(null)} aria-label="Cancelar"
              className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ) : (
          <button
            key={p.id}
            type="button"
            onClick={() => { setEditando(p.id); setRascunho(p.nome); }}
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground
                       hover:text-foreground hover:border-primary hover:bg-primary/5 transition-colors
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Renomear ${p.nome}`}
          >
            {p.nome}
            <Pencil className="w-2.5 h-2.5 opacity-50" />
          </button>
        )
      ))}

      {criando ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={rascunho}
            onChange={e => setRascunho(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); criar(); }
              if (e.key === "Escape") { setCriando(false); setRascunho(""); }
            }}
            placeholder={`Novo posto em ${areaNome}`}
            className="h-7 w-44 text-xs"
          />
          <button type="button" onClick={criar} aria-label="Criar posto"
            className="rounded p-1 text-primary hover:bg-primary/10">
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => { setCriando(false); setRascunho(""); }} aria-label="Cancelar"
            className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => { setRascunho(""); setCriando(true); }}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-xs
                     text-muted-foreground hover:text-primary hover:border-primary transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="w-3 h-3" />
          {catalogo.length === 0 ? "criar o primeiro posto" : "novo"}
        </button>
      )}
    </div>
  );
}
