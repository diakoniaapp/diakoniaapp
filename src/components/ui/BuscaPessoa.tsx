// ─── BuscaPessoa — autocomplete server-side de pessoas (membros) ────────────
//
// Substitui qualquer lookup que pre-carregava lista completa de membros.
// Faz busca server-side com debounce de 250ms (case-insensitive, ilike).
//
// Uso típico:
//   <BuscaPessoa
//     value={form.quem_convidou_id}
//     onChange={(id) => set("quem_convidou_id", id)}
//     tipos={["membro", "congregado"]}
//   />

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface PessoaResultado {
  id: string;
  nome_completo: string;
  tipo_pessoa?: string | null;
  telefone_celular?: string | null;
  cpf?: string | null;
  status?: string | null;
}

interface Props {
  value: string;
  onChange: (id: string, pessoa: PessoaResultado | null) => void;
  tipos?: ("membro" | "congregado" | "visitante")[];
  apenasAtivos?: boolean;
  placeholder?: string;
  disabled?: boolean;
  ignorarIds?: string[];
  autoFocus?: boolean;
}

export function BuscaPessoa({
  value,
  onChange,
  tipos,
  apenasAtivos = true,
  placeholder = "Digite o nome (mín. 2 letras)...",
  disabled,
  ignorarIds,
  autoFocus,
}: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<PessoaResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [nomeSelecionado, setNomeSelecionado] = useState("");
  const [mostrandoLista, setMostrandoLista] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carregar nome se vier id pré-selecionado
  useEffect(() => {
    if (!value) { setNomeSelecionado(""); return; }
    supabase
      .from("membros")
      .select("nome_completo")
      .eq("id", value)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setNomeSelecionado(data.nome_completo);
      });
  }, [value]);

  // Busca com debounce
  useEffect(() => {
    if (busca.length < 2) {
      setResultados([]);
      return;
    }
    const t = setTimeout(async () => {
      setBuscando(true);
      let q = supabase
        .from("membros")
        .select("id, nome_completo, tipo_pessoa, telefone_celular, cpf, status")
        .ilike("nome_completo", `%${busca}%`)
        .order("nome_completo")
        .limit(20);
      if (tipos && tipos.length) q = q.in("tipo_pessoa", tipos);
      if (apenasAtivos) q = q.eq("status", "ativo");
      const { data } = await q;
      let r = (data ?? []) as PessoaResultado[];
      if (ignorarIds?.length) r = r.filter(p => !ignorarIds.includes(p.id));
      setResultados(r);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [busca, JSON.stringify(tipos), apenasAtivos, JSON.stringify(ignorarIds)]);

  // Fecha lista ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMostrandoLista(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function escolher(p: PessoaResultado) {
    setBusca(""); // limpa termo de busca
    setNomeSelecionado(p.nome_completo);
    setResultados([]);
    setMostrandoLista(false);
    onChange(p.id, p);
  }

  function limpar() {
    setBusca("");
    setNomeSelecionado("");
    setResultados([]);
    onChange("", null);
  }

  const valorExibido = busca || nomeSelecionado;
  const temSelecao = !!value && !!nomeSelecionado;

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder={placeholder}
        value={valorExibido}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={() => setMostrandoLista(true)}
        onChange={(e) => {
          setBusca(e.target.value);
          setMostrandoLista(true);
          if (value) onChange("", null);
          if (!e.target.value) setNomeSelecionado("");
        }}
        className={temSelecao ? "pr-9" : undefined}
      />

      {temSelecao && (
        <button
          type="button"
          onClick={limpar}
          className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          aria-label="Limpar"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {buscando && (
        <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />
      )}

      {mostrandoLista && busca.length >= 2 && (
        <div className="absolute z-20 left-0 right-0 mt-1 border rounded-md max-h-56 overflow-y-auto bg-background shadow-md">
          {buscando && resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">Buscando...</p>
          ) : resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">Nenhuma pessoa encontrada</p>
          ) : (
            resultados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
              >
                <div className="font-medium">{p.nome_completo}</div>
                {p.tipo_pessoa && (
                  <div className="text-[11px] text-muted-foreground">
                    {p.tipo_pessoa}
                    {p.telefone_celular && ` · ${p.telefone_celular}`}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
