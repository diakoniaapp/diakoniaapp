// ─── ListaDePessoas — a aba "Pessoas" da tela Doadores (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A lista nominal sobre o período e o cálculo único, com grupos (Dizimistas, Recorrentes, Novos), classificação (#), ordenação completa e "Top N". É NOMINAL e traz valores individuais (total, média mensal,
// valor médio): só aparece depois que o acesso é registrado (`useRegistroDeAcesso`), e a exportação também registra; NUNCA vai por e-mail.
// Ordem padrão (decisão dela, 27/10/2026): TOTAL CONTRIBUÍDO, do maior para o menor — antes era por nome ("não virar ranking", nota de 12/09). A mudança vale só aqui dentro, para quem já vê as contribuições.
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

export type GrupoDePessoas = "todos" | "dizimistas" | "recorrentes" | "novos" | "novosDizimistas";
export const GRUPOS_DE_PESSOAS: { id: GrupoDePessoas; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" }, { id: "dizimistas", rotulo: "Dizimistas" }, { id: "recorrentes", rotulo: "Recorrentes" }, { id: "novos", rotulo: "Novos contribuintes" }, { id: "novosDizimistas", rotulo: "Novos dizimistas" },
];

export type OrdemDaLista = "total_desc" | "total_asc" | "frequencia" | "frequencia_asc" | "ultima" | "nome_az" | "nome_za" | "tempo";
export const ORDENS_DA_LISTA: { id: OrdemDaLista; rotulo: string }[] = [
  { id: "total_desc", rotulo: "Total contribuído (maior para menor)" }, { id: "total_asc", rotulo: "Total contribuído (menor para maior)" }, { id: "frequencia", rotulo: "Mais contribuições (quantidade)" }, { id: "frequencia_asc", rotulo: "Menos contribuições (quantidade)" },
  { id: "ultima", rotulo: "Última contribuição" }, { id: "nome_az", rotulo: "Nome A–Z" }, { id: "nome_za", rotulo: "Nome Z–A" }, { id: "tempo", rotulo: "Tempo sem contribuir" },
];
export const ORDEM_PADRAO_DA_LISTA: OrdemDaLista = "total_desc";
/** Os endereços antigos (`?ordem=nome` e `?ordem=valor`) continuam significando o que significavam. */
export function ordemDaUrl(texto: string | undefined): OrdemDaLista {
  if (texto === "nome") return "nome_az";
  if (texto === "valor") return "total_desc";
  return ORDENS_DA_LISTA.some(o => o.id === texto) ? (texto as OrdemDaLista) : ORDEM_PADRAO_DA_LISTA;
}

export type TopDaLista = "todos" | "10" | "20" | "50";
export const TOPS_DA_LISTA: { id: TopDaLista; rotulo: string }[] = [{ id: "todos", rotulo: "Todos" }, { id: "10", rotulo: "Top 10" }, { id: "20", rotulo: "Top 20" }, { id: "50", rotulo: "Top 50" }];
export const topDaUrl = (texto: string | undefined): TopDaLista => (TOPS_DA_LISTA.some(t => t.id === texto) ? (texto as TopDaLista) : "todos");

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

export interface PessoaDaLista extends ResumoDePessoa {
  nome: string;
  /** total ÷ (dias do período ÷ 30,4375) */
  mediaMensal: number;
  /** total ÷ quantidade de contribuições */
  valorMedio: number;
  /** dias entre a última contribuição e o fim do período */
  diasSemContribuir: number;
}

type Comparador = (a: PessoaDaLista, b: PessoaDaLista) => number;
const porNome: Comparador = (a, b) => a.nome.localeCompare(b.nome, "pt-BR");
const COMPARADORES: Record<OrdemDaLista, Comparador[]> = {
  total_desc: [(a, b) => b.total - a.total, (a, b) => b.quantidade - a.quantidade, (a, b) => b.ultima.localeCompare(a.ultima), porNome],
  total_asc: [(a, b) => a.total - b.total, (a, b) => a.quantidade - b.quantidade, porNome],
  frequencia: [(a, b) => b.quantidade - a.quantidade, (a, b) => b.total - a.total, porNome],
  /** quem contribuiu MENOS vezes primeiro; a lista só tem quem contribuiu pelo menos uma vez, então nunca começa por zero; desempate: última contribuição mais antiga */
  frequencia_asc: [(a, b) => a.quantidade - b.quantidade, (a, b) => a.ultima.localeCompare(b.ultima), porNome],
  ultima: [(a, b) => b.ultima.localeCompare(a.ultima), porNome],
  nome_az: [porNome],
  nome_za: [(a, b) => porNome(b, a)],
  tempo: [(a, b) => b.diasSemContribuir - a.diasSemContribuir, porNome],
};

/** Aplica grupo, busca (sem acento), ordem e "Top N" (os N primeiros NA ORDEM escolhida). Pura. */
export function filtrarPessoas(lista: PessoaDaLista[], grupo: GrupoDePessoas, busca: string, ordem: OrdemDaLista, top: TopDaLista = "todos"): PessoaDaLista[] {
  let r = lista;
  if (grupo === "dizimistas") r = r.filter(p => p.dizimista);
  if (grupo === "recorrentes") r = r.filter(p => p.recorrente === true);
  if (grupo === "novos") r = r.filter(p => p.nova === true);
  if (grupo === "novosDizimistas") r = r.filter(p => p.novaDizimista === true);
  if (busca.trim().length >= 2) { const b = normalizar(busca); r = r.filter(p => normalizar(p.nome).includes(b)); }
  const cadeia = COMPARADORES[ordem];
  const ordenada = [...r].sort((a, b) => { for (const c of cadeia) { const x = c(a, b); if (x !== 0) return x; } return porNome(a, b); });
  return top === "todos" ? ordenada : ordenada.slice(0, Number(top));
}

interface Props {
  pessoas: PessoaDaLista[];
  grupo: GrupoDePessoas; aoMudarGrupo: (g: GrupoDePessoas) => void;
  busca: string; aoMudarBusca: (v: string) => void;
  ordem: OrdemDaLista; aoMudarOrdem: (o: OrdemDaLista) => void;
  top: TopDaLista; aoMudarTop: (t: TopDaLista) => void;
  registro: { estado: EstadoDoRegistro; erro: string; liberado: boolean; tentarDeNovo: () => void };
  aoExportar: (formato: "xlsx" | "csv", visiveis: PessoaDaLista[]) => void;
  exportando: boolean;
  novosDisponivel: boolean; recorrentesDisponivel: boolean;
}

export function ListaDePessoas({ pessoas, grupo, aoMudarGrupo, busca, aoMudarBusca, ordem, aoMudarOrdem, top, aoMudarTop, registro, aoExportar, exportando, novosDisponivel, recorrentesDisponivel }: Props) {
  const visiveis = useMemo(() => filtrarPessoas(pessoas, grupo, busca, ordem, top), [pessoas, grupo, busca, ordem, top]);
  const contagem = (g: GrupoDePessoas) => filtrarPessoas(pessoas, g, "", "nome_az").length;

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
        {GRUPOS_DE_PESSOAS.filter(g => ((g.id !== "novos" && g.id !== "novosDizimistas") || novosDisponivel) && (g.id !== "recorrentes" || recorrentesDisponivel)).map(g => (
          <button key={g.id} type="button" onClick={() => aoMudarGrupo(g.id)} data-grupo={g.id} aria-pressed={grupo === g.id}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${grupo === g.id ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/50"}`}>
            {g.rotulo} <span className="tabular-nums opacity-80">{contagem(g.id)}</span>
          </button>
        ))}
      </div>

      <Card><CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
        <div className="col-span-2 relative">
          <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
          <Input value={busca} onChange={e => aoMudarBusca(e.target.value)} className="h-8 text-base md:text-xs pl-6" placeholder="Buscar nome..." />
        </div>
        <Select value={ordem} onValueChange={v => aoMudarOrdem(v as OrdemDaLista)}>
          <SelectTrigger className="h-8 text-xs md:col-span-2" data-campo="ordem"><SelectValue /></SelectTrigger>
          <SelectContent>{ORDENS_DA_LISTA.map(o => (<SelectItem key={o.id} value={o.id}>{o.rotulo}</SelectItem>))}</SelectContent>
        </Select>
        <Select value={top} onValueChange={v => aoMudarTop(v as TopDaLista)}>
          <SelectTrigger className="h-8 text-xs" data-campo="top"><SelectValue /></SelectTrigger>
          <SelectContent>{TOPS_DA_LISTA.map(t => (<SelectItem key={t.id} value={t.id}>{t.rotulo}</SelectItem>))}</SelectContent>
        </Select>
        <div className="flex gap-1.5 justify-end">
          <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("xlsx", visiveis)}><FileSpreadsheet className="w-3.5 h-3.5" /> Excel</Button>
          <Button size="sm" variant="outline" className="gap-1 h-8" disabled={exportando || visiveis.length === 0} onClick={() => aoExportar("csv", visiveis)}><FileText className="w-3.5 h-3.5" /> CSV</Button>
        </div>
      </CardContent></Card>

      <p className="text-xs text-muted-foreground" data-contagem>
        {top === "todos" ? "" : `${TOPS_DA_LISTA.find(t => t.id === top)!.rotulo} · `}{visiveis.length} pessoa{visiveis.length !== 1 ? "s" : ""} · {brl(visiveis.reduce((s, p) => s + p.total, 0))}
      </p>

      {visiveis.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">{pessoas.length === 0 ? "Nenhuma contribuição vinculada a pessoa neste período." : "Ninguém com esse filtro."}</CardContent></Card>
      ) : (
        <div className="space-y-1">
          {visiveis.map((p, i) => (
            <Link key={p.pessoaId} to={`/financas/doadores/${p.pessoaId}`} data-pessoa={p.pessoaId} className="flex items-center gap-2 border rounded-md px-3 py-2 hover:bg-muted/30">
              <span className="w-7 shrink-0 text-right text-xs tabular-nums text-muted-foreground" data-posicao>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{p.nome}</p>
                <p className="text-xs text-muted-foreground">{p.quantidade} {p.quantidade === 1 ? "contribuição" : "contribuições"} · última em {dataBr(p.ultima)}{p.recorrente ? " · recorrente" : p.dizimista && p.mesesCompletos > 0 ? ` · parcial (${p.mesesComDizimo}/${p.mesesCompletos} meses com dízimo)` : ""}{p.novaDizimista ? " · novo dizimista" : p.nova ? " · novo contribuinte" : ""}</p>
                <p className="text-xs text-muted-foreground" data-medias>Média mensal {brl(p.mediaMensal)} · valor médio {brl(p.valorMedio)}</p>
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
