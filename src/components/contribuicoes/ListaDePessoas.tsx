// ─── ListaDePessoas — a aba "Pessoas" da tela Doadores (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A lista nominal que a tela já tinha (nome, contribuições, última, total), agora sobre o período e o cálculo único, com grupos (Dizimistas, Recorrentes, Novos). É NOMINAL: só aparece depois que o
// acesso é registrado (`useRegistroDeAcesso`) e a exportação também registra. Ordem padrão: por NOME — não é um placar (a nota de privacidade do projeto desde 12/09/2026).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, FileSpreadsheet, FileText, Loader2, Search } from "lucide-react";
import { brl } from "@/services/finService";
import type { ResumoDePessoa } from "@/lib/contribuicoes";
import { textoDoRegistro, type EstadoDoRegistro } from "./useRegistroDeAcesso";

export type GrupoDePessoas = "todos" | "dizimistas" | "recorrentes" | "novos";
export const GRUPOS_DE_PESSOAS: { id: GrupoDePessoas; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" }, { id: "dizimistas", rotulo: "Dizimistas" }, { id: "recorrentes", rotulo: "Recorrentes" }, { id: "novos", rotulo: "Novos" },
];

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export interface PessoaDaLista extends ResumoDePessoa { nome: string }

/** Aplica grupo, busca (sem acento) e ordem. Pura. */
export function filtrarPessoas(lista: PessoaDaLista[], grupo: GrupoDePessoas, busca: string, ordem: "nome" | "valor"): PessoaDaLista[] {
  let r = lista;
  if (grupo === "dizimistas") r = r.filter(p => p.dizimista);
  if (grupo === "recorrentes") r = r.filter(p => p.recorrente === true);
  if (grupo === "novos") r = r.filter(p => p.nova === true);
  if (busca.trim().length >= 2) { const b = normalizar(busca); r = r.filter(p => normalizar(p.nome).includes(b)); }
  return [...r].sort((a, b) => (ordem === "valor" ? b.total - a.total : a.nome.localeCompare(b.nome, "pt-BR")));
}

interface Props {
  pessoas: PessoaDaLista[];
  grupo: GrupoDePessoas; aoMudarGrupo: (g: GrupoDePessoas) => void;
  busca: string; aoMudarBusca: (v: string) => void;
  ordem: "nome" | "valor"; aoMudarOrdem: (o: "nome" | "valor") => void;
  registro: { estado: EstadoDoRegistro; erro: string; liberado: boolean; tentarDeNovo: () => void };
  aoExportar: (formato: "xlsx" | "csv", visiveis: PessoaDaLista[]) => void;
  exportando: boolean;
  novosDisponivel: boolean; recorrentesDisponivel: boolean;
}

export function ListaDePessoas({ pessoas, grupo, aoMudarGrupo, busca, aoMudarBusca, ordem, aoMudarOrdem, registro, aoExportar, exportando, novosDisponivel, recorrentesDisponivel }: Props) {
  const visiveis = useMemo(() => filtrarPessoas(pessoas, grupo, busca, ordem), [pessoas, grupo, busca, ordem]);
  const contagem = (g: GrupoDePessoas) => filtrarPessoas(pessoas, g, "", "nome").length;

  if (registro.estado === "erro") {
    return (
      <Card className="border-dashed" data-registro="erro"><CardContent className="py-6 text-center space-y-2">
        <p className="text-sm">Não foi possível registrar este acesso, então a lista com nomes não é mostrada.</p>
        <p className="text-xs text-muted-foreground">{registro.erro}</p>
        <Button size="sm" variant="outline" onClick={registro.tentarDeNovo}>Tentar de novo</Button>
      </CardContent></Card>
    );
  }
  if (!registro.liberado) {
    return <div className="flex items-center justify-center h-24 text-sm text-muted-foreground" data-registro="aguardando"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Registrando o acesso…</div>;
  }

  const aviso = textoDoRegistro(registro.estado);
  return (
    <div className="space-y-3" data-lista="pessoas">
      {aviso && <p className={`text-xs ${registro.estado === "indisponivel" ? "text-warning-text" : "text-muted-foreground"}`} data-registro={registro.estado}>{aviso}</p>}

      <div className="flex flex-wrap gap-1.5" data-grupos>
        {GRUPOS_DE_PESSOAS.filter(g => (g.id !== "novos" || novosDisponivel) && (g.id !== "recorrentes" || recorrentesDisponivel)).map(g => (
          <button key={g.id} type="button" onClick={() => aoMudarGrupo(g.id)} data-grupo={g.id} aria-pressed={grupo === g.id}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${grupo === g.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
            {g.rotulo} <span className="tabular-nums opacity-80">{contagem(g.id)}</span>
          </button>
        ))}
      </div>

      <Card><CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-center">
        <div className="col-span-2 relative">
          <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={busca} onChange={e => aoMudarBusca(e.target.value)} className="h-8 text-base md:text-xs pl-6" placeholder="Buscar nome..." />
        </div>
        <Select value={ordem} onValueChange={v => aoMudarOrdem(v as "nome" | "valor")}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="nome">Ordenar por nome</SelectItem><SelectItem value="valor">Ordenar por valor</SelectItem></SelectContent>
        </Select>
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("xlsx", visiveis)}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>
          <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("csv", visiveis)}><FileText className="w-3.5 h-3.5" /> CSV</Button>
        </div>
      </CardContent></Card>

      <p className="text-xs text-muted-foreground" data-contagem>{visiveis.length} pessoa{visiveis.length !== 1 ? "s" : ""} · {brl(visiveis.reduce((s, p) => s + p.total, 0))}</p>

      {visiveis.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">{pessoas.length === 0 ? "Nenhuma contribuição vinculada a pessoa neste período." : "Ninguém com esse filtro."}</CardContent></Card>
      ) : (
        <div className="space-y-1">
          {visiveis.map(p => (
            <Link key={p.pessoaId} to={`/financas/doadores/${p.pessoaId}`} data-pessoa={p.pessoaId} className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{p.nome}</p>
                <p className="text-xs text-muted-foreground">{p.quantidade} {p.quantidade === 1 ? "contribuição" : "contribuições"} · última em {dataBr(p.ultima)}{p.recorrente ? " · recorrente" : ""}{p.nova ? " · nova" : ""}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-success-text shrink-0">{brl(p.total)}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
