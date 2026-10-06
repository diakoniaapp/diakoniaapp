// ─── ConciliacaoOFXDialog.tsx — importar extrato (OFX) ──────────────────────────
//
// Item 7 do roadmap do ERP financeiro, evoluído em 06/10/2026 para a IMPORTAÇÃO INTELIGENTE.
// Mesmo padrão de Dialog que `TransferenciaForm.tsx`/`LancamentoForm.tsx` usam.
//
// O que cada linha do extrato vira:
//   · `conciliar`      — casa com um lançamento já registrado como "Realizado": um clique concilia
//                        (o comportamento de sempre, `conciliarEmLote`);
//   · `ja_registrada`  — já existe (mesmo FITID de uma importação anterior, ou lançamento
//                        conciliado de mesmo valor/data): NÃO é criada de novo;
//   · `nova`           — o sistema SUGERE pessoa, categoria e centro (`lib/classificacaoOfx.ts`),
//                        com confiança e os motivos; a pessoa confirma em massa o que veio
//                        identificado e edita só as exceções.
//
// Nada é gravado sem um clique. O lote criado carrega `[lote-ofx:ID]` e pode ser desfeito logo
// depois; e as correções que ela faz aqui viram o histórico que ensina a próxima importação.
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  FileUp, Scale, CheckCircle2, HelpCircle, ArrowRightLeft, Pencil, Undo2, Loader2, AlertTriangle, XCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { conciliarEmLote, brl, type FinMovimentoTipo } from "@/services/finService";
import { parseOFX, encodingDoOFX, inferirFormaPagamento, type OFXTransacao } from "@/services/ofxService";
import {
  analisar, carregarContexto, conciliarDebitos, desfazerLote, registrarLote,
  type ContextoOfx, type LinhaAnalisada, type ParaRegistrar,
} from "@/services/importacaoOfxService";
import {
  ORDEM_DOS_FILTROS, ROTULO_DO_FILTRO, contarPorFiltro, identificadasParaConfirmar, marcadasIniciais,
  marcadasParaGravar, paginar, pertenceAoFiltro, podeGravar, rotuloDaConfianca, valoresEfetivos,
  type Edicao, type Filtro, type LinhaDaGrade,
} from "@/lib/gradeOfx";
import { LancamentoForm } from "./LancamentoForm";
import { TransferenciaForm } from "./TransferenciaForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

const POR_PAGINA = 40;

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const daGrade = (l: LinhaAnalisada): LinhaDaGrade => ({ fitid: l.tx.fitid, situacao: l.situacao, sugestao: l.sugestao });

const CHIP: Record<string, string> = {
  identificada: "border-success-line bg-success-soft text-success-text",
  revisar: "border-warning-line bg-warning-soft text-warning-text",
  nao_identificada: "border-destructive-line bg-destructive-soft text-destructive-text",
};

const SELECT = "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

export function ConciliacaoOFXDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [transacoes, setTransacoes] = useState<OFXTransacao[] | null>(null);
  const [contexto, setContexto] = useState<ContextoOfx | null>(null);
  const [linhas, setLinhas] = useState<LinhaAnalisada[] | null>(null);

  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagina, setPagina] = useState(1);

  const [paraConfirmar, setParaConfirmar] = useState<LinhaAnalisada[] | null>(null);
  const [gravando, setGravando] = useState<{ feitos: number; total: number } | null>(null);
  const [lote, setLote] = useState<{ loteId: string; ids: string[] } | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  const [editarLinha, setEditarLinha] = useState<LinhaAnalisada | null>(null);
  // Pedido da Telma (22/09/2026): uma linha sem correspondência pode ser transferência de outra
  // conta (a `TransferenciaForm` cria as duas pernas atômico), não só um lançamento avulso.
  const [transferirTransacao, setTransferirTransacao] = useState<OFXTransacao | null>(null);

  const grade = useMemo(() => (linhas ?? []).map(daGrade), [linhas]);
  const contagem = useMemo(() => contarPorFiltro(grade), [grade]);
  const visiveis = useMemo(() => {
    const ok = new Set(grade.filter(g => pertenceAoFiltro(g, filtro)).map(g => g.fitid));
    return (linhas ?? []).filter(l => ok.has(l.tx.fitid));
  }, [linhas, grade, filtro]);
  const pag = paginar(visiveis, pagina, POR_PAGINA);

  useEffect(() => { setPagina(1); }, [filtro]);

  const categoriasPorTipo = useMemo(() => ({
    entrada: (contexto?.categorias ?? []).filter(c => c.tipo === "entrada"),
    saida: (contexto?.categorias ?? []).filter(c => c.tipo === "saida"),
  }), [contexto]);
  const opcoesDeCentro = useMemo(() => {
    const cs = contexto?.centros ?? [];
    const porId = new Map(cs.map(c => [c.id, c]));
    return cs.map(c => ({ id: c.id, rotulo: c.centro_pai_id && porId.get(c.centro_pai_id) ? `${porId.get(c.centro_pai_id)!.nome} › ${c.nome}` : c.nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [contexto]);
  const nomeDaCategoria = (id?: string) => contexto?.categorias.find(c => c.id === id)?.nome ?? "";

  function reiniciar() {
    setArquivo(null); setTransacoes(null); setLinhas(null); setContexto(null);
    setEdicoes({}); setMarcadas(new Set()); setFiltro("todas"); setPagina(1); setLote(null);
  }

  /** `recarregarContexto`: depois de gravar, o que foi gravado passa a fazer parte da memória. */
  async function analisarDeNovo(txs: OFXTransacao[], recarregarContexto: boolean, primeira = false) {
    const ctx = !contexto || recarregarContexto ? await carregarContexto() : contexto;
    setContexto(ctx);
    const res = await analisar(contaId, txs, ctx);
    setLinhas(res);
    const g = res.map(daGrade);
    setMarcadas(prev => primeira ? marcadasIniciais(g) : new Set([...prev].filter(f => g.some(x => x.fitid === f && x.situacao === "nova"))));
  }

  async function processarArquivo(file: File) {
    setArquivo(file);
    setProcessando(true);
    setLinhas(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const texto = new TextDecoder(encodingDoOFX(bytes)).decode(bytes);
      const txs = parseOFX(texto);
      if (txs.length === 0) {
        toast.error("Nenhuma transação encontrada nesse arquivo — confira se é o extrato em OFX.");
        setArquivo(null);
        return;
      }
      setTransacoes(txs);
      await analisarDeNovo(txs, true, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler o arquivo");
      setArquivo(null);
    } finally {
      setProcessando(false);
    }
  }

  const aConciliar = linhas?.filter(l => l.situacao === "conciliar") ?? [];
  const debitosEncontrados = linhas?.filter(l => l.situacao === "debito_encontrado") ?? [];

  async function conciliarOsDebitos(lista: LinhaAnalisada[]) {
    if (lista.length === 0 || !transacoes) return;
    setConciliando(true);
    try {
      const r = await conciliarDebitos(contaId, lista.map(l => ({ lancamentoId: l.lancamentoId!, tx: l.tx })));
      if (r.conciliados.length > 0) toast.success(`${r.conciliados.length} débito${r.conciliados.length > 1 ? "s" : ""} automático${r.conciliados.length > 1 ? "s" : ""} conciliado${r.conciliados.length > 1 ? "s" : ""}`);
      if (r.erros.length > 0) toast.error(r.erros[0]);
      await analisarDeNovo(transacoes, true);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao conciliar o débito");
    } finally {
      setConciliando(false);
    }
  }

  async function conciliar() {
    if (aConciliar.length === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(aConciliar.map(r => r.lancamentoId!));
      toast.success(`${aConciliar.length} lançamento${aConciliar.length > 1 ? "s" : ""} conciliado${aConciliar.length > 1 ? "s" : ""}`);
      if (transacoes) await analisarDeNovo(transacoes, false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setConciliando(false);
    }
  }

  // ── gravação em lote ──
  function pedirConfirmacao(candidatas: LinhaDaGrade[]) {
    if (candidatas.length === 0) { toast.info("Nenhuma linha pronta para lançar."); return; }
    const ids = new Set(candidatas.map(c => c.fitid));
    setParaConfirmar((linhas ?? []).filter(l => ids.has(l.tx.fitid)));
  }

  async function gravar() {
    const alvo = paraConfirmar;
    setParaConfirmar(null);
    if (!alvo || !transacoes) return;
    const itens: ParaRegistrar[] = alvo.map(l => {
      const v = valoresEfetivos(daGrade(l), edicoes[l.tx.fitid]);
      return {
        tx: l.tx, categoriaId: v.categoriaId!, centroId: v.centroId,
        pessoaId: l.sugestao?.pessoa?.id, fornecedorId: l.sugestao?.fornecedor?.id,
      };
    });
    setGravando({ feitos: 0, total: itens.length });
    try {
      const r = await registrarLote(contaId, itens, (feitos, total) => setGravando({ feitos, total }));
      if (r.erros.length > 0) toast.error(`Parte não foi gravada: ${r.erros[0]}`);
      if (r.ids.length > 0) {
        setLote({ loteId: r.loteId, ids: r.ids });
        toast.success(`${r.ids.length} lançamento${r.ids.length > 1 ? "s" : ""} criado${r.ids.length > 1 ? "s" : ""}.`);
      }
      await analisarDeNovo(transacoes, true);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gravar");
    } finally {
      setGravando(null);
    }
  }

  async function desfazer() {
    if (!lote || !transacoes) return;
    setDesfazendo(true);
    try {
      await desfazerLote(lote.ids);
      toast.success(`${lote.ids.length} lançamento${lote.ids.length > 1 ? "s" : ""} do lote desfeito${lote.ids.length > 1 ? "s" : ""}.`);
      setLote(null);
      await analisarDeNovo(transacoes, true);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    } finally {
      setDesfazendo(false);
    }
  }

  async function aoSalvarForm() {
    setEditarLinha(null);
    setTransferirTransacao(null);
    if (transacoes) await analisarDeNovo(transacoes, true);
    onSaved();
  }

  function editar(fitid: string, patch: Edicao) {
    setEdicoes(prev => ({ ...prev, [fitid]: { ...prev[fitid], ...patch } }));
  }
  function alternarMarca(fitid: string, marcada: boolean) {
    setMarcadas(prev => { const n = new Set(prev); if (marcada) n.add(fitid); else n.delete(fitid); return n; });
  }

  const identificadasProntas = identificadasParaConfirmar(grade, edicoes, marcadas);
  const marcadasProntas = marcadasParaGravar(grade, edicoes, marcadas);
  const resumoDoLote = useMemo(() => {
    const alvo = paraConfirmar ?? [];
    const soma = (t: string) => alvo.filter(l => l.tx.tipo === t).reduce((s, l) => s + l.tx.valor, 0);
    return { n: alvo.length, entradas: soma("entrada"), saidas: soma("saida") };
  }, [paraConfirmar]);

  // o que o formulário "Editar" recebe — memoizado: o efeito do formulário reinicia a cada novo objeto
  const rascunho = useMemo(() => {
    if (!editarLinha) return undefined;
    const v = valoresEfetivos(daGrade(editarLinha), edicoes[editarLinha.tx.fitid]);
    const s = editarLinha.sugestao;
    return {
      data: editarLinha.tx.data, valor: editarLinha.tx.valor, descricao: editarLinha.tx.memo,
      forma: inferirFormaPagamento(editarLinha.tx.memo),
      categoriaId: v.categoriaId, centroId: v.centroId, pessoa: s?.pessoa, fornecedor: s?.fornecedor,
    };
  }, [editarLinha, edicoes]);

  const painel = contagem;
  const total = linhas?.length ?? 0;
  const ocupado = conciliando || !!gravando || desfazendo;

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (ocupado && !v) return; onOpenChange(v); if (!v) reiniciar(); }}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold" /> Importar extrato (OFX)
          </DialogTitle>
          <DialogDescription>
            Lê o extrato de <strong>{contaNome}</strong>, identifica quem é cada movimento e sugere categoria e
            centro de custo. Você confirma em massa o que veio identificado e edita só as exceções — nada é
            gravado antes do seu clique, e o lote pode ser desfeito.
          </DialogDescription>
        </DialogHeader>

        {!arquivo ? (
          <label className="cursor-pointer block">
            <input type="file" accept=".ofx,.OFX" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
            <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
              <FileUp className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">Selecionar arquivo .OFX</span>
            </div>
          </label>
        ) : processando || !linhas ? (
          <p className="text-sm text-center text-muted-foreground py-8 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lendo o extrato e identificando os movimentos…
          </p>
        ) : (
          <div className="space-y-3">
            {/* o painel: quantas, e o que cada botão faz */}
            <div className="rounded-md border p-3 space-y-2.5">
              <p className="text-sm font-medium">{total} movimentações no extrato</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-success-line bg-success-soft px-2.5 py-1 text-success-text">
                  <CheckCircle2 className="w-4 h-4" /> <b className="tabular-nums">{painel.identificadas}</b> identificadas
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-warning-line bg-warning-soft px-2.5 py-1 text-warning-text">
                  <AlertTriangle className="w-4 h-4" /> <b className="tabular-nums">{painel.revisar}</b> precisam de revisão
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-destructive-line bg-destructive-soft px-2.5 py-1 text-destructive-text">
                  <XCircle className="w-4 h-4" /> <b className="tabular-nums">{painel.nao_identificadas}</b> não identificadas
                </span>
              </div>
              {(contagem.transferencias + contagem.conciliar + contagem.ja_registradas) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Além destas: {contagem.conciliar} a conciliar com lançamentos já feitos · {contagem.ja_registradas} já registrada{contagem.ja_registradas !== 1 ? "s" : ""} (não serão criadas de novo) · {contagem.transferencias} parece{contagem.transferencias !== 1 ? "m" : ""} transferência entre contas.
                </p>
              )}
              {debitosEncontrados.length > 0 && (
                <div className="rounded-md border border-info-line bg-info-soft/40 p-2.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm flex-1 min-w-0">
                    <b className="tabular-nums">{debitosEncontrados.length}</b> débito{debitosEncontrados.length > 1 ? "s" : ""} automático{debitosEncontrados.length > 1 ? "s" : ""} encontrado{debitosEncontrados.length > 1 ? "s" : ""} no extrato — já estavam previstos.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={ocupado}
                    onClick={() => conciliarOsDebitos(debitosEncontrados)}>
                    <Scale className="w-3.5 h-3.5" /> Conciliar débitos ({debitosEncontrados.length})
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="gap-1.5" disabled={ocupado || identificadasProntas.length === 0}
                  onClick={() => pedirConfirmacao(identificadasProntas)}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar identificadas ({identificadasProntas.length})
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={contagem.pendencias === 0}
                  onClick={() => setFiltro("pendencias")}>
                  <HelpCircle className="w-3.5 h-3.5" /> Revisar pendências ({contagem.pendencias})
                </Button>
              </div>
              {gravando && (
                <p className="text-xs text-muted-foreground flex items-center gap-2" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gravando… {gravando.feitos} de {gravando.total}
                </p>
              )}
            </div>

            {lote && (
              <div className="rounded-md border border-success-line bg-success-soft/40 p-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-success-text flex-1 min-w-0">
                  <b>{lote.ids.length}</b> lançamento{lote.ids.length > 1 ? "s" : ""} criado{lote.ids.length > 1 ? "s" : ""} neste lote.
                </p>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={desfazendo} onClick={desfazer}>
                  {desfazendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Desfazer este lote
                </Button>
              </div>
            )}

            {/* filtros */}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar movimentações">
              {ORDEM_DOS_FILTROS.map(f => (
                <button key={f} type="button" role="tab" aria-selected={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                  {ROTULO_DO_FILTRO[f]} <span className="tabular-nums opacity-80">{contagem[f]}</span>
                </button>
              ))}
            </div>

            {/* a grade */}
            {pag.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação neste filtro.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {pag.itens.map(l => {
                  const fitid = l.tx.fitid;
                  const g = daGrade(l);
                  const s = l.sugestao;
                  const ed = edicoes[fitid];
                  const v = valoresEfetivos(g, ed);
                  const gravavel = podeGravar(g, ed);
                  const entrada = l.tx.tipo === "entrada";
                  const ehNova = l.situacao === "nova";
                  return (
                    <li key={fitid} className="px-3 py-2 space-y-1.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {ehNova ? (
                          <Checkbox aria-label={`Marcar ${l.tx.memo}`} checked={marcadas.has(fitid)} disabled={!gravavel || ocupado}
                            onCheckedChange={(c) => alternarMarca(fitid, c === true)} />
                        ) : <span className="w-4 shrink-0" />}
                        <span className="w-11 shrink-0 tabular-nums text-xs text-muted-foreground">{dataBr(l.tx.data)}</span>
                        <span className="min-w-0 flex-1 truncate" title={l.tx.memo}>{l.tx.memo}</span>
                        <span className={`shrink-0 tabular-nums ${entrada ? "text-success-text" : "text-destructive-text"}`}>
                          {entrada ? "+" : "−"}{brl(l.tx.valor)}
                        </span>
                        {s && ehNova && (
                          <span title={s.motivos.join(" · ")}
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] tabular-nums ${CHIP[s.banda]}`}>
                            {s.confianca}% · {rotuloDaConfianca(s.banda)}
                          </span>
                        )}
                      </div>

                      {l.situacao === "conciliar" && (
                        <p className="pl-6 text-xs text-muted-foreground">Casa com um lançamento já registrado — será conciliada.</p>
                      )}
                      {l.situacao === "ja_registrada" && (
                        <p className="pl-6 text-xs text-muted-foreground">Já registrada: {l.motivoJaRegistrada}. Não será criada de novo.</p>
                      )}
                      {l.situacao === "debito_encontrado" && l.debito && (
                        <div className="pl-6 flex flex-wrap items-center gap-2">
                          <p className="text-xs flex-1 min-w-0">
                            <b className="text-info-text">Débito automático encontrado</b>
                            {" — "}{l.debito.candidato.fornecedor || l.debito.candidato.descricao || "previsto"}, vencimento {dataBr(l.debito.candidato.data)}, previsto {brl(l.debito.candidato.valor)}
                            <span className="text-muted-foreground"> · {l.debito.confianca}% · {l.debito.motivos.join(" · ")}</span>
                          </p>
                          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={ocupado}
                            onClick={() => conciliarOsDebitos([l])}>
                            <Scale className="w-3 h-3" /> Conciliar débito
                          </Button>
                        </div>
                      )}
                      {l.situacao === "ambigua" && (
                        <div className="pl-6 flex flex-wrap items-center gap-2">
                          <p className="text-xs text-warning-text flex-1 min-w-0">Há lançamentos parecidos já registrados — confira à mão antes de criar outro.</p>
                          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setEditarLinha(l)}>
                            <Pencil className="w-3 h-3" /> Lançar
                          </Button>
                        </div>
                      )}

                      {ehNova && s && (
                        <div className="pl-6 flex flex-wrap items-center gap-2">
                          {(s.pessoa || s.fornecedor) && (
                            <span className="text-xs rounded bg-muted px-1.5 py-0.5 max-w-[14rem] truncate" title={s.pessoa?.nome ?? s.fornecedor?.nome}>
                              {s.pessoa ? "👤" : "🏢"} {s.pessoa?.nome ?? s.fornecedor?.nome}
                            </span>
                          )}
                          {s.transferencia ? (
                            <span className="text-xs text-warning-text">Parece transferência entre contas — registre como Transferência.</span>
                          ) : (
                            <>
                              <select className={`${SELECT} w-40`} aria-label="Categoria" value={v.categoriaId ?? ""} disabled={ocupado}
                                onChange={(e) => editar(fitid, { categoriaId: e.target.value })}>
                                <option value="">Categoria…</option>
                                {categoriasPorTipo[l.tx.tipo].map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              </select>
                              <select className={`${SELECT} w-44`} aria-label="Centro de custo" value={v.centroId ?? ""} disabled={ocupado}
                                onChange={(e) => editar(fitid, { centroId: e.target.value })}>
                                <option value="">Centro de custo…</option>
                                {opcoesDeCentro.map(c => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                              </select>
                            </>
                          )}
                          <div className="flex gap-1 ml-auto">
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" disabled={ocupado}
                              onClick={() => setEditarLinha(l)}>
                              <Pencil className="w-3 h-3" /> Editar
                            </Button>
                            {/* Transferência entre contas — a mesma linha pode ser o lado de cá de um
                                movimento interno, não receita/despesa (pedido de 22/09/2026). */}
                            <Button type="button" size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" disabled={ocupado}
                              onClick={() => setTransferirTransacao(l.tx)}>
                              <ArrowRightLeft className="w-3 h-3" /> Transferência
                            </Button>
                          </div>
                          {!s.transferencia && s.banda !== "identificada" && s.motivos.length > 0 && (
                            <p className="basis-full text-[11px] text-muted-foreground truncate" title={s.motivos.join(" · ")}>
                              {s.motivos[s.motivos.length - 1]}{v.categoriaId && ` · sugestão: ${nomeDaCategoria(s.categoriaId)}`}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {pag.paginas > 1 && (
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" disabled={pag.pagina <= 1} onClick={() => setPagina(pag.pagina - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </Button>
                <span className="tabular-nums">Página {pag.pagina} de {pag.paginas} · {visiveis.length} linhas</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" disabled={pag.pagina >= pag.paginas} onClick={() => setPagina(pag.pagina + 1)}>
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar} disabled={ocupado}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={ocupado}>Fechar</Button>
          {linhas && aConciliar.length > 0 && (
            <Button variant="success" type="button" onClick={conciliar} disabled={ocupado} className="gap-1.5">
              <Scale className="w-3.5 h-3.5" /> {conciliando ? "..." : `Conciliar ${aConciliar.length}`}
            </Button>
          )}
          {linhas && marcadasProntas.length > 0 && (
            <Button type="button" onClick={() => pedirConfirmacao(marcadasProntas)} disabled={ocupado} className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Lançar marcadas ({marcadasProntas.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* a última chance antes de gravar em massa */}
    <AlertDialog open={!!paraConfirmar} onOpenChange={(v) => { if (!v) setParaConfirmar(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lançar {resumoDoLote.n} movimentação{resumoDoLote.n !== 1 ? "ões" : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            Serão criados {resumoDoLote.n} lançamentos em <strong>{contaNome}</strong>, já conciliados com o extrato:
            entradas de {brl(resumoDoLote.entradas)} e saídas de {brl(resumoDoLote.saidas)}. Logo depois você
            pode desfazer o lote inteiro.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={gravar}>Lançar {resumoDoLote.n}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Editar uma linha — o MESMO formulário de sempre, já com o que foi sugerido. Dialog irmão,
        nunca aninhado (mesmo padrão de FinancasConta.tsx). */}
    <LancamentoForm
      open={!!editarLinha}
      onOpenChange={(v) => { if (!v) setEditarLinha(null); }}
      contaIdPadrao={contaId}
      contaTravada
      contaNomeTravado={contaNome}
      tipoPadrao={editarLinha?.tx.tipo as FinMovimentoTipo}
      rascunho={rascunho}
      onSaved={aoSalvarForm}
    />

    {/* Se a transação é SAÍDA desta conta, esta conta é a origem; se é ENTRADA, é o destino —
        a pessoa só escolhe o outro lado. */}
    <TransferenciaForm
      open={!!transferirTransacao}
      onOpenChange={(v) => { if (!v) setTransferirTransacao(null); }}
      contaOrigemPadrao={transferirTransacao?.tipo === "saida" ? contaId : undefined}
      contaDestinoPadrao={transferirTransacao?.tipo === "entrada" ? contaId : undefined}
      valorPadrao={transferirTransacao?.valor}
      dataPadrao={transferirTransacao?.data}
      descricaoPadrao={transferirTransacao?.memo}
      onSaved={aoSalvarForm}
    />
    </>
  );
}
