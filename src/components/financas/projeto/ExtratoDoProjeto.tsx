// ─── ExtratoDoProjeto — a vista "Extrato" da tela do Projeto (21/10/2026) ─────────────────────────────────────────────────────────────────────────────
//
// Pedido dela: um extrato de receitas e despesas POR PROJETO, como o que ela já acompanha por centro de custo — com impressão em PDF e com a lista do mesmo centro que ainda não tem projeto.
// Mora na tela do Projeto (e não no extrato da conta, que é por conta, nem no do centro, que é por quem): o projeto é o eixo "para quê". As contas são de lib/extratoDoProjeto.ts
// (as mesmas regras da reserva: só realizado/conciliado, sem transferência; previsto aparece se pedido e nunca mexe no saldo).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Pencil, Printer, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampoData } from "@/components/CampoData";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { AssinaturaDoSistema } from "@/components/AssinaturaDoSistema";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { aoMudarFim, aoMudarInicio } from "@/lib/intervaloDeDatas";
import { candidatosSemProjeto, diaDoCaixa, montarExtratoDoProjeto } from "@/lib/extratoDoProjeto";
import { atualizarLancamento, brl, listarLancamentosSemTeto, nomeExtrato, type FinLancamentoExtenso, type FinProjeto } from "@/services/finService";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export type VistaDoProjeto = "relatorio" | "extrato";

/** As duas vistas da tela do Projeto: o relatório executivo de sempre e o extrato cronológico. */
export function AbasDoProjeto({ vista, onChange }: { vista: VistaDoProjeto; onChange: (v: VistaDoProjeto) => void }) {
  const botao = (v: VistaDoProjeto, rotulo: string) => (
    <button type="button" aria-pressed={vista === v} onClick={() => onChange(v)}
      className={`rounded px-3 py-1 text-xs font-medium ${vista === v ? "bg-gold text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{rotulo}</button>
  );
  return <div role="group" aria-label="Vista do projeto" className="inline-flex gap-0.5 rounded-md border p-0.5">{botao("relatorio", "Relatório")}{botao("extrato", "Extrato")}</div>;
}

function Kpi({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "verde" | "vermelho" | "neutro" }) {
  const cor = tom === "verde" ? "text-success-text" : tom === "vermelho" ? "text-destructive-text" : "";
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={`text-base font-bold tabular-nums ${cor}`}>{valor}</p>
    </div>
  );
}

interface Props {
  projeto: FinProjeto;
  /** TODOS os lançamentos do projeto (o extrato escolhe o que mostrar) */
  lancamentos: FinLancamentoExtenso[];
  emitidoPor: string;
  abas: ReactNode;
  onEditarProjeto: () => void;
  /** depois de editar um lançamento ou incluir outros no projeto: a tela recarrega */
  onMudou: () => void;
  /** só o documento do PDF (sem controles): usado pelo "PDF completo" da tela do Projeto */
  soDocumento?: boolean;
  /** imprime o relatório executivo + este extrato */
  onImprimirCompleto?: () => void;
}

export function ExtratoDoProjeto({ projeto, lancamentos, emitidoPor, abas, onEditarProjeto, onMudou, soDocumento, onImprimirCompleto }: Props) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [mostrarPrevistos, setMostrarPrevistos] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const extrato = useMemo(() => montarExtratoDoProjeto(lancamentos, { de: de || undefined, ate: ate || undefined, mostrarPrevistos }), [lancamentos, de, ate, mostrarPrevistos]);

  // ── do mesmo centro, sem projeto ──
  const centros = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lancamentos) if (l.centro_custo_id) m.set(l.centro_custo_id, l.centro_nome ?? "centro");
    return m;
  }, [lancamentos]);
  const [doCentro, setDoCentro] = useState<FinLancamentoExtenso[]>([]);
  const [carregandoCentro, setCarregandoCentro] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [incluindo, setIncluindo] = useState(false);
  const chaveDosCentros = Array.from(centros.keys()).sort().join(",");
  useEffect(() => {
    let vivo = true;
    setMarcados(new Set());
    if (soDocumento) return;   // só o documento do PDF: não precisa da lista "sem projeto"
    if (!chaveDosCentros) { setDoCentro([]); return; }
    setCarregandoCentro(true);
    Promise.all(chaveDosCentros.split(",").map(id => listarLancamentosSemTeto({ centroCustoId: id })))
      .then(r => { if (vivo) setDoCentro(r.flat()); })
      .catch(e => { if (vivo) { setDoCentro([]); toast.error(e?.message ?? "Não foi possível ler os lançamentos do centro"); } })
      .finally(() => { if (vivo) setCarregandoCentro(false); });
    return () => { vivo = false; };
  }, [chaveDosCentros, lancamentos]);
  const candidatos = useMemo(() => candidatosSemProjeto(doCentro, { de: de || undefined, ate: ate || undefined }), [doCentro, de, ate]);
  const LIMITE = 200;
  const visiveis = candidatos.slice(0, LIMITE);
  const totalMarcado = candidatos.filter(c => marcados.has(c.id)).reduce((s, c) => s + (c.tipo === "entrada" ? Number(c.valor) : -Number(c.valor)), 0);
  const alternar = (id: string) => setMarcados(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosMarcados = visiveis.length > 0 && visiveis.every(c => marcados.has(c.id));

  async function incluirNoProjeto(e: React.MouseEvent) {
    e.preventDefault();   // AlertDialogAction fecha antes do await (mesmo cuidado dos outros diálogos)
    const ids = candidatos.filter(c => marcados.has(c.id)).map(c => c.id);
    if (ids.length === 0) return;
    setIncluindo(true);
    let feitos = 0;
    try {
      for (const id of ids) { await atualizarLancamento(id, { projeto_id: projeto.id }, `Incluído no projeto ${projeto.nome} pelo extrato do projeto`); feitos++; }
      toast.success(`${feitos} lançamento${feitos > 1 ? "s" : ""} incluído${feitos > 1 ? "s" : ""} em ${projeto.nome}`);
    } catch (err: any) {
      toast.error(`${err?.message ?? "Erro"} — ${feitos} de ${ids.length} foram incluídos antes do erro.`);
    } finally {
      setIncluindo(false); setConfirmar(false); setMarcados(new Set());
      onMudou();
    }
  }

  const periodo = de || ate ? `${de ? dataBr(de) : "início"} a ${ate ? dataBr(ate) : "hoje"}` : "todo o período";
  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rotuloSaldo = ate ? `Saldo do projeto em ${dataBr(ate)}` : "Saldo do projeto";

  const documento = (
      <div className="relatorio-page mx-auto my-4 max-w-6xl rounded-md border border-border/40 bg-white p-4 text-foreground shadow-elevated md:my-6 md:p-8 print:my-0">
        <header className="avoid-break flex flex-col gap-3 border-b-2 border-gold/30 pb-4 print:flex-row print:items-start print:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-12 w-auto shrink-0 object-contain" draggable={false}
              style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} />
            <div className="min-w-0">
              <h1 className="font-serif text-2xl leading-tight">Extrato do Projeto</h1>
              <p className="text-sm text-muted-foreground">{projeto.nome}</p>
            </div>
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground print:shrink-0 print:text-right">
            <p>Período do extrato: <strong className="text-foreground">{periodo}</strong></p>
            <p>Gerado em <strong className="text-foreground">{hojeBr}</strong> às {horaBr} · {emitidoPor}</p>
          </div>
        </header>

        <section className="avoid-break my-4 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Resumo do extrato">
          <Kpi rotulo="Receitas no período" valor={brl(extrato.entradas)} tom="verde" />
          <Kpi rotulo="Despesas no período" valor={brl(extrato.saidas)} tom="vermelho" />
          <Kpi rotulo={rotuloSaldo} valor={brl(extrato.saldoFinal)} tom={extrato.saldoFinal < 0 ? "vermelho" : "neutro"} />
          {projeto.reserva_financeira
            ? <Kpi rotulo="Reservado" valor={brl(extrato.reservado)} />
            : <Kpi rotulo="Lançamentos" valor={String(extrato.linhas.filter(x => x.conta).length)} />}
        </section>
        {projeto.reserva_financeira && extrato.alemDaReserva > 0 && (
          <p className="mb-3 flex items-center gap-1.5 rounded bg-warning-soft px-2 py-1 text-xs text-warning-text">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> Gasto além da reserva: <b className="tabular-nums">{brl(extrato.alemDaReserva)}</b> (as despesas passaram do que o projeto arrecadou).
          </p>
        )}

        {extrato.linhas.length === 0 ? (
          <p className="py-10 text-center text-sm italic text-muted-foreground">Nenhum lançamento do projeto neste período.</p>
        ) : (
          <table className="w-full text-xs" aria-label="Extrato do projeto">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="w-20 py-1.5 text-left print:w-[1.9cm]">Data</th>
                <th className="py-1.5 text-left">Descrição / Favorecido</th>
                <th className="w-32 py-1.5 text-left print:w-[2.6cm]">Categoria</th>
                <th className="w-32 py-1.5 text-left print:hidden">Centro</th>
                <th className="w-28 py-1.5 text-left print:hidden">Conta</th>
                <th className="w-24 py-1.5 text-right print:w-[2.3cm]">Receita</th>
                <th className="w-24 py-1.5 text-right print:w-[2.3cm]">Despesa</th>
                <th className="w-28 py-1.5 text-right print:w-[2.5cm]">Saldo</th>
                <th className="no-print w-8 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {(de) && (
                <tr className="border-b bg-muted/30 italic text-muted-foreground">
                  <td className="py-1.5" colSpan={5}>Saldo anterior · até {dataBr(de)}</td>
                  <td className="py-1.5 print:hidden" colSpan={2} />
                  <td className="py-1.5 text-right tabular-nums font-medium">{brl(extrato.saldoAnterior)}</td>
                  <td className="no-print print:hidden" />
                </tr>
              )}
              {extrato.linhas.map(({ lancamento: l, dia, entrada, saida, conta, saldo }) => {
                const nome = nomeExtrato(l);
                return (
                  <tr key={l.id} className={`border-b align-top ${conta ? "" : "italic text-muted-foreground"}`} data-linha={l.id}>
                    <td className="whitespace-nowrap py-1.5">{dataBr(dia)}</td>
                    <td className="py-1.5 pr-2">
                      <span className="font-medium">{nome.principal}</span>{!conta && <span className="ml-1 rounded border px-1 text-[10px] not-italic">previsto</span>}
                      {nome.secundario && nome.secundario !== l.categoria_nome && <span className="block text-muted-foreground">{nome.secundario}</span>}
                      {/* no papel (retrato) o centro e a conta vão aqui embaixo, em vez de duas colunas que não cabem */}
                      <span className="hidden text-[10px] text-muted-foreground print:block">{[l.centro_nome, l.conta_nome].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="py-1.5 pr-2">{l.categoria_nome ?? ""}</td>
                    <td className="py-1.5 pr-2 print:hidden">{l.centro_nome ?? ""}</td>
                    <td className="py-1.5 pr-2 print:hidden">{l.conta_nome ?? ""}</td>
                    <td className="py-1.5 text-right tabular-nums text-success-text">{entrada ? brl(entrada) : ""}</td>
                    <td className="py-1.5 text-right tabular-nums text-destructive-text">{saida ? brl(saida) : ""}</td>
                    <td className={`py-1.5 text-right tabular-nums ${saldo < 0 ? "text-destructive-text" : ""}`}>{conta ? brl(saldo) : ""}</td>
                    <td className="no-print py-1 print:hidden">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar lançamento" onClick={() => setEditando(l)}><Pencil className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2" colSpan={3}>Total do período</td>
                <td className="py-2 print:hidden" colSpan={2} />
                <td className="py-2 text-right tabular-nums text-success-text">{brl(extrato.entradas)}</td>
                <td className="py-2 text-right tabular-nums text-destructive-text">{brl(extrato.saidas)}</td>
                <td className={`py-2 text-right tabular-nums ${extrato.saldoFinal < 0 ? "text-destructive-text" : ""}`}>{brl(extrato.saldoFinal)}</td>
                <td className="no-print print:hidden" />
              </tr>
            </tfoot>
          </table>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Contam só receitas e despesas realizadas ou conciliadas, com a data em que o banco movimentou. Transferências entre contas e compras ofertadas por terceiros não entram.
        </p>

        <footer className="avoid-break mt-8 border-t border-gold/30 pt-3 text-center">
          <p className="text-xs text-muted-foreground">Tesouraria · DiakoniaApp</p>
          <AssinaturaDoSistema />
        </footer>
      </div>
  );
  // "PDF completo": o relatório executivo (capa com os gráficos) + este extrato como últimas páginas — só o documento, sem controles nem a lista "sem projeto"
  if (soDocumento) return <div className="pagina-extrato" style={{ pageBreakBefore: "always" }}>{documento}</div>;

  return (
    <div className="bg-background min-h-screen" data-extrato-projeto>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.2cm 1.4cm; }
          .relatorio-page table { table-layout: fixed !important; }
        }
      `}</style>

      {/* controles (fora do papel) */}
      <div className="no-print sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          {abas}
          <div className="flex flex-wrap items-center gap-1.5">
            <CampoData value={de} permitirVazio placeholder="De" className="w-[10.5rem]" onChange={v => { const r = aoMudarInicio(v, ate); setDe(r.inicio); setAte(r.fim); }} />
            <span className="text-xs text-muted-foreground">até</span>
            <CampoData value={ate} permitirVazio placeholder="Até" className="w-[10.5rem]" onChange={v => { const r = aoMudarFim(de, v); setDe(r.inicio); setAte(r.fim); }} />
            {(de || ate) && <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setDe(""); setAte(""); }}>Todo o período</Button>}
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={mostrarPrevistos} onCheckedChange={v => setMostrarPrevistos(!!v)} /> Mostrar previstos
          </label>
          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onEditarProjeto}><Pencil className="h-3.5 w-3.5" /> Editar projeto</Button>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()} title="Só esta vista: o extrato, com o período escolhido"><Printer className="h-3.5 w-3.5" /> Só o extrato</Button>
            {onImprimirCompleto && <Button type="button" variant="gold" size="sm" className="gap-1.5" onClick={onImprimirCompleto} title="Relatório executivo (com os gráficos) + extrato"><Printer className="h-3.5 w-3.5" /> PDF completo</Button>}
          </div>
        </div>
      </div>

      {/* o documento: é só isto que sai no PDF */}
      {documento}

      {/* fora do papel: o que ainda está só no centro de custo */}
      <section className="no-print mx-auto mb-10 max-w-6xl px-4 print:hidden" aria-label="Do mesmo centro, sem projeto">
        <div className="rounded-lg border bg-card">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-bold"><FolderPlus className="h-4 w-4 text-gold" /> Do mesmo centro, sem projeto</h2>
              <p className="text-xs text-muted-foreground">
                Lançamentos realizados {centros.size > 0 ? <>dos centros <b>{Array.from(centros.values()).join(", ")}</b></> : "do centro deste projeto"} que ainda não foram ligados a nenhum projeto
                {de || ate ? ` (${periodo})` : ""}. Marque os que pertencem a <b>{projeto.nome}</b> e inclua — eles passam a entrar neste extrato{projeto.reserva_financeira ? " e na reserva" : ""}.
              </p>
            </div>
            <Button type="button" size="sm" className="gap-1.5" disabled={marcados.size === 0 || incluindo} onClick={() => setConfirmar(true)}>
              {incluindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
              Incluir {marcados.size > 0 ? `${marcados.size} ` : ""}neste projeto
            </Button>
          </header>
          {centros.size === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Este projeto ainda não tem lançamentos com centro de custo — não há de onde sugerir.</p>
          ) : carregandoCentro ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo os lançamentos do centro…</p>
          ) : candidatos.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nada sobrando: todo lançamento realizado desse centro {de || ate ? "neste período " : ""}já está em algum projeto.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
                <Checkbox checked={todosMarcados} onCheckedChange={v => setMarcados(v ? new Set(visiveis.map(c => c.id)) : new Set())} aria-label="Marcar todos" />
                <span className="text-muted-foreground">{candidatos.length} lançamentos{candidatos.length > LIMITE ? ` (mostrando os ${LIMITE} mais recentes — use o período para ver os outros)` : ""}</span>
                {marcados.size > 0 && <span className="ml-auto tabular-nums">Marcados: <b>{brl(Math.abs(totalMarcado))}</b>{totalMarcado < 0 ? " (líquido de despesa)" : ""}</span>}
              </div>
              <ul className="divide-y" data-candidatos>
                {visiveis.map(c => {
                  const nome = nomeExtrato(c);
                  return (
                    <li key={c.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                      <Checkbox className="mt-1" checked={marcados.has(c.id)} onCheckedChange={() => alternar(c.id)} aria-label={`Marcar ${nome.principal}`} />
                      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{dataBr(diaDoCaixa(c))}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{nome.principal}</span>
                        <span className="block truncate text-xs text-muted-foreground">{[c.categoria_nome, c.centro_nome, c.conta_nome].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className={`shrink-0 tabular-nums font-medium ${c.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>{c.tipo === "entrada" ? "+" : "−"} {brl(Number(c.valor))}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      <AlertDialog open={confirmar} onOpenChange={v => { if (!v && !incluindo) setConfirmar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Incluir {marcados.size} lançamento{marcados.size > 1 ? "s" : ""} em {projeto.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos marcados passam a ter este projeto (a categoria, o centro, a conta e o valor não mudam). Líquido: <b>{brl(totalMarcado)}</b>.
              {projeto.reserva_financeira && " Como o projeto tem reserva financeira, o que for receita passa a ser reservado."} Dá para corrigir depois, editando o lançamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={incluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={incluirNoProjeto} disabled={incluindo}>{incluindo ? "..." : "Incluir"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); onMudou(); }} />
    </div>
  );
}
