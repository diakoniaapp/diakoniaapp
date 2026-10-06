// ─── SeletorFavorecido.tsx — o favorecido de uma recorrência, ligado ao cadastro real ───
//
// Pedido da Telma (06/10/2026): a recorrência não pode ser só texto ("RPA Carlos Eduardo") — tem
// de apontar para o fornecedor ou a PESSOA do cadastro, para que os lançamentos futuros nasçam
// já com o favorecido certo. Busca nos dois cadastros ao mesmo tempo (mesmos serviços do
// formulário de lançamento) e, escolhido o favorecido, mostra o que o histórico já sabe dele:
// último pagamento, último valor, categoria e centro habituais e os documentos de costume.

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserRound, Building2, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  brl, buscarPessoasParaLancamento, listarFornecedores, FIN_ANEXO_TIPO_LABEL,
  type FinAnexoTipo, type FinCategoria, type FinCentroCusto,
} from "@/services/finService";
import { habitosDoFavorecido } from "@/services/recorrenciaService";
import type { HabitosDoFavorecido } from "@/lib/habitosDoFavorecido";

export interface Favorecido { tipo: "fornecedor" | "pessoa"; id: string; nome: string }

/** O que o cadastro/histórico sugere preencher — o formulário só aplica o que ainda está vazio. */
export interface SugestoesDoFavorecido {
  categoriaId?: string | null;
  centroId?: string | null;
  valor?: number | null;
  habitos?: HabitosDoFavorecido | null;
}

interface Props {
  value: Favorecido | null;
  onChange: (f: Favorecido | null, sugestoes?: SugestoesDoFavorecido) => void;
  categorias: FinCategoria[];
  centros: FinCentroCusto[];
  /** Mostra o aviso de obrigatório. */
  obrigatorio?: boolean;
  rotulo?: string;
}

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

export function SeletorFavorecido({ value, onChange, categorias, centros, obrigatorio, rotulo = "Fornecedor / Prestador / Favorecido" }: Props) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Favorecido[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [habitos, setHabitos] = useState<HabitosDoFavorecido | null>(null);
  const [lendo, setLendo] = useState(false);
  const [semHistorico, setSemHistorico] = useState(false);
  const sequencia = useRef(0);

  // a busca, com um respiro entre as teclas
  useEffect(() => {
    if (value || busca.trim().length < 2) { setAchados([]); return; }
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
          ...forns.slice(0, 6).map(f => ({ tipo: "fornecedor" as const, id: f.id, nome: f.nome })),
          ...pessoas.slice(0, 6).map(p => ({ tipo: "pessoa" as const, id: p.id, nome: p.nome })),
        ]);
      } finally {
        if (minha === sequencia.current) setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, value]);

  // o que o histórico sabe dele
  useEffect(() => {
    setHabitos(null); setSemHistorico(false);
    if (!value) return;
    let cancelado = false;
    setLendo(true);
    habitosDoFavorecido(value.tipo === "fornecedor" ? { fornecedorId: value.id } : { pessoaId: value.id })
      .then(h => { if (!cancelado) { setHabitos(h); setSemHistorico(!h); } })
      .catch(() => { if (!cancelado) setSemHistorico(true); })
      .finally(() => { if (!cancelado) setLendo(false); });
    return () => { cancelado = true; };
  }, [value?.tipo, value?.id]);

  async function escolher(f: Favorecido) {
    setBusca(""); setAchados([]);
    // um fornecedor pode trazer categoria/centro padrão; o histórico completa quando carregar
    let padroes: SugestoesDoFavorecido = {};
    if (f.tipo === "fornecedor") {
      try {
        const lista = await listarFornecedores(f.nome);
        const reg = lista.find(x => x.id === f.id);
        padroes = { categoriaId: reg?.categoria_padrao_id ?? null, centroId: reg?.centro_custo_padrao_id ?? null };
      } catch { /* sem padrão: segue só com o histórico */ }
    }
    onChange(f, padroes);
  }

  // quando o histórico chega, avisa o formulário (que preenche só o que está vazio)
  useEffect(() => {
    if (!value || !habitos) return;
    onChange(value, { categoriaId: habitos.categoriaId, centroId: habitos.centroId, valor: habitos.ultimoValor, habitos });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitos]);

  const nomeCategoria = (id: string | null) => categorias.find(c => c.id === id)?.nome ?? null;
  const nomeCentro = (id: string | null) => centros.find(c => c.id === id)?.nome?.replace(" · ", " › ") ?? null;

  return (
    <div>
      <Label>{rotulo}{obrigatorio && " *"}</Label>
      {value ? (
        <div className="mt-1 rounded-md border bg-muted/20 p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 text-sm">
            {value.tipo === "pessoa" ? <UserRound className="w-4 h-4 text-muted-foreground shrink-0" /> : <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="font-medium truncate">{value.nome}</span>
            <span className="text-2xs uppercase tracking-wide text-muted-foreground shrink-0">{value.tipo === "pessoa" ? "Pessoa do catálogo" : "Fornecedor"}</span>
            <button type="button" className="ml-auto text-xs underline decoration-dotted text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => { onChange(null); setBusca(""); }}>trocar</button>
          </div>
          {lendo && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Lendo o histórico…</p>}
          {habitos && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-muted-foreground">Último pagamento</dt>
              <dd className="tabular-nums">{dataBr(habitos.ultimoDia)} · {brl(habitos.ultimoValor)}</dd>
              {nomeCategoria(habitos.categoriaId) && (<><dt className="text-muted-foreground">Categoria habitual</dt><dd>{nomeCategoria(habitos.categoriaId)}</dd></>)}
              {nomeCentro(habitos.centroId) && (<><dt className="text-muted-foreground">Centro habitual</dt><dd>{nomeCentro(habitos.centroId)}</dd></>)}
              {habitos.documentos.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Documentos de costume</dt>
                  <dd className="flex flex-wrap gap-1">
                    {habitos.documentos.slice(0, 4).map(d => (
                      <span key={d.tipo} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <FileText className="w-3 h-3" /> {FIN_ANEXO_TIPO_LABEL[d.tipo as FinAnexoTipo] ?? d.tipo}
                      </span>
                    ))}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Histórico</dt>
              <dd>{habitos.pagamentos} pagamento{habitos.pagamentos > 1 ? "s" : ""} registrado{habitos.pagamentos > 1 ? "s" : ""}</dd>
            </dl>
          )}
          {!lendo && semHistorico && <p className="text-xs text-muted-foreground">Ainda sem pagamentos registrados para este favorecido.</p>}
        </div>
      ) : (
        <div className="relative mt-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8"
            placeholder="Digite o nome: Carlos Eduardo, Amil, Light…" autoComplete="off" />
          {buscando && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-3 animate-spin text-muted-foreground" />}
          {achados.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 border rounded-md max-h-48 overflow-y-auto bg-popover shadow">
              {achados.map(f => (
                <button key={`${f.tipo}-${f.id}`} type="button" onClick={() => escolher(f)}
                  className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 text-sm hover:bg-muted/50">
                  <span className="truncate">{f.nome}</span>
                  <span className="text-2xs uppercase tracking-wide text-muted-foreground shrink-0">{f.tipo === "pessoa" ? "Pessoa" : "Fornecedor"}</span>
                </button>
              ))}
            </div>
          )}
          {busca.trim().length >= 2 && !buscando && achados.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Não achei no cadastro. Cadastre o fornecedor (ou a pessoa) antes e volte aqui.</p>
          )}
        </div>
      )}
    </div>
  );
}
