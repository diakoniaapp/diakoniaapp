// ─── SaneamentoDeCadastros — fila dos cadastros de empresa sem CNPJ válido ────────────────────────────────────────────────────────────────────────────
//
// Fase 1A da Política de Compras por Terceiros. Empresa e Entidade só podem ser registradas como quem pagou uma despesa se o cadastro tiver CNPJ válido. Medido em 13/10/2026:
// 298 favorecidos jurídicos, 39 sem CNPJ válido. Esta fila os lista para corrigir (não depende da migration da Quitação; só lê). Some quando não há o que sanear.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cnpjValido } from "@/lib/quitacao";
import { supabase } from "@/integrations/supabase/client";

interface Sujo { id: string; nome: string; documento: string | null }

export function SaneamentoDeCadastros({ chave }: { chave: number }) {
  const [lista, setLista] = useState<Sujo[] | null>(null);
  const [aberta, setAberta] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("fin_fornecedores").select("id, nome, tipo, cnpj_cpf").eq("ativo", true).eq("tipo", "juridica").order("nome").limit(2000);
      if (!vivo) return;
      if (error) { setLista([]); return; }
      setLista((data ?? []).filter(f => !cnpjValido(f.cnpj_cpf)).map(f => ({ id: String(f.id), nome: String(f.nome), documento: f.cnpj_cpf ? String(f.cnpj_cpf) : null })));
    })();
    return () => { vivo = false; };
  }, [chave]);

  if (!lista || lista.length === 0) return null;
  return (
    <section aria-label="Saneamento de cadastros" className="rounded-lg border bg-card lg:col-span-2">
      <button type="button" onClick={() => setAberta(a => !a)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/40">
        {aberta ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Saneamento de cadastros · {lista.length}</span>
          <span className="block text-xs text-muted-foreground">Empresas (favorecidos jurídicos) sem CNPJ válido. Para uma empresa ou entidade poder ser registrada como quem pagou uma despesa, o cadastro precisa de CNPJ válido.</span>
        </span>
      </button>
      {aberta && (
        <ul className="max-h-72 divide-y overflow-y-auto border-t text-sm">
          {lista.map(f => (
            <li key={f.id} className="flex items-center gap-2 px-4 py-1.5">
              <span className="min-w-0 flex-1 truncate">{f.nome}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{f.documento ?? "sem documento"}</span>
              <Link to={`/financas/favorecido/${f.id}`} className="shrink-0 text-xs text-primary hover:underline">Corrigir</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
