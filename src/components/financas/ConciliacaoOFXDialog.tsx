// ─── ConciliacaoOFXDialog.tsx — a Mesa de Conciliação (importar o extrato OFX e decidir) ───────────────────────
//
// Item 7 do roadmap do ERP financeiro, evoluído em 06/10/2026 para a IMPORTAÇÃO INTELIGENTE e, em 08/10/2026, para a MESA
// DE CONCILIAÇÃO (comparação com o Omie: docs/ANALISE_CONCILIACAO_OMIE_VS_DIAKONIA.md).
//
// O extrato vira uma FILA DE DECISÕES em três pilhas — ✓ identificadas · ⚠ precisam de revisão · ❌ não identificadas — e cada
// linha nova é um CARTÃO: o que o banco disse, quem o sistema identificou (trocável ali mesmo), o histórico da pessoa, a
// categoria sugerida com as alternativas a um clique e o botão Confirmar. O formulário completo só abre em "Editar".
//   · `conciliar`     — casa com um lançamento já registrado como "Realizado": um clique concilia;
//   · `ja_registrada` — já existe (mesmo FITID, ou lançamento conciliado de mesmo valor/data): NÃO é criada de novo;
//   · `ignorada`      — a tesouraria mandou ignorar (migration 20261008140000): fica recolhida, com opção de reativar;
//   · `nova`          — o cartão de decisão. Linhas do mesmo padrão sem favorecido viram UM cartão de grupo.
//
// Nada é gravado sem um clique. "Confirmar" grava a linha na hora (com "Desfazer"); os lotes ("Confirmar identificadas",
// "Lançar marcadas") pedem confirmação e podem ser desfeitos. As correções viram o histórico que ensina a próxima importação.
// O painel de MEDIÇÃO conta quantas linhas o sistema acertou sozinho, quantas pediram uma olhada e quantas foram à mão.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  FileUp, Scale, CheckCircle2, HelpCircle, Undo2, Loader2, AlertTriangle, XCircle, ChevronLeft, ChevronRight, Layers, RotateCcw, BanIcon,
} from "lucide-react";
import { conciliarEmLote, excluirLancamentosEmLote, brl, type FinMovimentoTipo } from "@/services/finService";
import { parseOFX, encodingDoOFX, inferirFormaPagamento, type OFXTransacao } from "@/services/ofxService";
import {
  analisar, carregarContexto, conciliarDebitos, desfazerLote, ignorarLinha, listarIgnoradas, reativarIgnorada, registrarLote, ROTULO_DO_MOTIVO,
  type ContextoOfx, type LinhaAnalisada, type MotivoDeIgnorar, type ParaRegistrar,
} from "@/services/importacaoOfxService";
import {
  ORDEM_DOS_FILTROS, ROTULO_DO_FILTRO, contarPorFiltro, favorecidoEfetivo, foiCorrigida, identificadasParaConfirmar, marcadasIniciais,
  marcadasParaGravar, paginar, pertenceAoFiltro, podeGravar, valoresEfetivos,
  type Edicao, type Filtro, type LinhaDaGrade,
} from "@/lib/gradeOfx";
import { agruparPorClasse, resumirMedicao, type Desfecho, type Grupo, type Medicao, type RegistroDaMedicao } from "@/lib/mesaOfx";
import { LancamentoForm } from "./LancamentoForm";
import { LiquidarPeloExtratoDialog } from "./LiquidarPeloExtratoDialog";
import { TransferenciaForm } from "./TransferenciaForm";
import { CartaoDaLinha } from "./mesa/CartaoDaLinha";
import { CartaoDoGrupo } from "./mesa/CartaoDoGrupo";
import { IgnorarLinhaDialog } from "./mesa/IgnorarLinhaDialog";
import { PainelDeMedicao } from "./mesa/PainelDeMedicao";

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

/** A linha como a grade a vê. As que foram lançadas AGORA (sem reanalisar o arquivo) contam como já registradas. */
const daGradeBase = (l: LinhaAnalisada): LinhaDaGrade => ({ fitid: l.tx.fitid, situacao: l.situacao, sugestao: l.sugestao });

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
  const [agrupar, setAgrupar] = useState(true);

  const [paraConfirmar, setParaConfirmar] = useState<LinhaAnalisada[] | null>(null);
  const [gravando, setGravando] = useState<{ feitos: number; total: number } | null>(null);
  const [lote, setLote] = useState<{ loteId: string; ids: string[] } | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const [salvandoLinha, setSalvandoLinha] = useState(false);

  // o que foi lançado AGORA, linha a linha (fitid → ids dos lançamentos): sai da fila sem reanalisar o arquivo inteiro
  const [confirmadas, setConfirmadas] = useState<Map<string, string[]>>(new Map());
  // a medição da rodada
  const [registros, setRegistros] = useState<Map<string, RegistroDaMedicao>>(new Map());
  const [aoAbrir, setAoAbrir] = useState<Medicao["aoAbrir"] | null>(null);
  const [totalDoArquivo, setTotalDoArquivo] = useState(0);
  const alterou = useRef(false);

  const [ignorarDisponivel, setIgnorarDisponivel] = useState(false);
  const [ignorando, setIgnorando] = useState<LinhaAnalisada | null>(null);

  const [editarLinha, setEditarLinha] = useState<LinhaAnalisada | null>(null);
  // Saída do extrato que quitou um documento a pagar (igual ou com diferença): a divergência abre sozinha ao importar.
  const [liquidarLinha, setLiquidarLinha] = useState<LinhaAnalisada | null>(null);
  // Pedido da Telma (22/09/2026): uma linha sem correspondência pode ser transferência de outra
  // conta (a `TransferenciaForm` cria as duas pernas atômico), não só um lançamento avulso.
  const [transferirTransacao, setTransferirTransacao] = useState<OFXTransacao | null>(null);

  const daGrade = (l: LinhaAnalisada): LinhaDaGrade =>
    confirmadas.has(l.tx.fitid) ? { fitid: l.tx.fitid, situacao: "ja_registrada" } : daGradeBase(l);

  const grade = useMemo(() => (linhas ?? []).map(daGrade), [linhas, confirmadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => contarPorFiltro(grade), [grade]);
  const visiveis = useMemo(() => {
    const ok = new Set(grade.filter(g => pertenceAoFiltro(g, filtro)).map(g => g.fitid));
    return (linhas ?? []).filter(l => ok.has(l.tx.fitid));
  }, [linhas, grade, filtro]);

  // grupos: linhas do mesmo padrão, sem favorecido, das que estão na tela agora
  const agrupamento = useMemo(() => {
    if (!agrupar) return { grupos: [] as Grupo[], avulsas: new Set<string>(), noGrupo: new Set<string>() };
    const { grupos } = agruparPorClasse(visiveis.map(l => ({
      fitid: l.tx.fitid, tipo: l.tx.tipo, valor: l.tx.valor, memo: l.tx.memo,
      situacao: confirmadas.has(l.tx.fitid) ? "ja_registrada" : l.situacao, sugestao: l.sugestao,
    })));
    return { grupos, avulsas: new Set<string>(), noGrupo: new Set(grupos.flatMap(g => g.fitids)) };
  }, [visiveis, confirmadas, agrupar]);
  const naLista = useMemo(() => visiveis.filter(l => !agrupamento.noGrupo.has(l.tx.fitid)), [visiveis, agrupamento]);
  const pag = paginar(naLista, pagina, POR_PAGINA);

  useEffect(() => { setPagina(1); }, [filtro, agrupar]);

  const categoriasPorTipo = useMemo(() => ({
    entrada: (contexto?.categorias ?? []).filter(c => c.tipo === "entrada"),
    saida: (contexto?.categorias ?? []).filter(c => c.tipo === "saida"),
  }), [contexto]);
  const projetos = contexto?.projetos ?? [];
  const opcoesDeCentro = useMemo(() => {
    const cs = contexto?.centros ?? [];
    const porId = new Map(cs.map(c => [c.id, c]));
    return cs.map(c => ({ id: c.id, rotulo: c.centro_pai_id && porId.get(c.centro_pai_id) ? `${porId.get(c.centro_pai_id)!.nome} › ${c.nome}` : c.nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [contexto]);
  const nomeDaCategoria = (id?: string | null) => (id ? contexto?.categorias.find(c => c.id === id)?.nome ?? "" : "");

  function reiniciar() {
    setArquivo(null); setTransacoes(null); setLinhas(null); setContexto(null);
    setEdicoes({}); setMarcadas(new Set()); setFiltro("todas"); setPagina(1); setLote(null);
    setConfirmadas(new Map()); setRegistros(new Map()); setAoAbrir(null); setTotalDoArquivo(0);
  }

  function fechar(v: boolean) {
    if (ocupado && !v) return;
    onOpenChange(v);
    if (!v) {
      if (alterou.current) { alterou.current = false; onSaved(); }
      reiniciar();
    }
  }

  /** `recarregarContexto`: depois de gravar, o que foi gravado passa a fazer parte da memória. */
  async function analisarDeNovo(txs: OFXTransacao[], recarregarContexto: boolean, primeira = false) {
    const ctx = !contexto || recarregarContexto ? await carregarContexto() : contexto;
    setContexto(ctx);
    const [res, ign] = await Promise.all([analisar(contaId, txs, ctx), listarIgnoradas(contaId)]);
    setIgnorarDisponivel(ign.disponivel);
    setLinhas(res);
    setConfirmadas(new Map());   // a reanálise já enxerga o que foi gravado (FITID)
    const g = res.map(daGradeBase);
    if (primeira) {
      const c = contarPorFiltro(g);
      setAoAbrir({
        identificadas: c.identificadas, revisar: c.revisar, naoIdentificadas: c.nao_identificadas, jaRegistradas: c.ja_registradas,
        conciliar: c.conciliar, debitos: c.debitos, documentos: c.documentos, transferencias: c.transferencias,
      });
      setTotalDoArquivo(res.length);
      const divergente = res.find(l => l.documentos?.[0] && !l.documentos[0].exato && (l.situacao === "documento" || l.documentos.length === 1));
      if (divergente) setLiquidarLinha(divergente);
    }
    // quem ainda está pendente não conta como resolvida
    const novas = new Set(res.filter(l => l.situacao === "nova").map(l => l.tx.fitid));
    setRegistros(prev => new Map([...prev].filter(([f]) => !novas.has(f))));
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
  const documentosEncontrados = linhas?.filter(l => l.situacao === "documento") ?? [];
  const divergentes = documentosEncontrados.filter(l => l.documentos?.[0] && !l.documentos[0].exato);

  const marcar = (fitid: string, r: RegistroDaMedicao) => setRegistros(prev => new Map(prev).set(fitid, r));
  const registroDe = (l: LinhaAnalisada, desfecho: Desfecho, extra: Partial<RegistroDaMedicao> = {}): RegistroDaMedicao =>
    ({ banda: l.sugestao?.banda ?? "sem_sugestao", desfecho, possivelMissoes: l.sugestao?.possivelMissoes, ...extra });

  async function aoLiquidar() {
    setLiquidarLinha(null);
    alterou.current = true;
    if (transacoes) await analisarDeNovo(transacoes, true);
  }

  async function conciliarOsDebitos(lista: LinhaAnalisada[]) {
    if (lista.length === 0 || !transacoes) return;
    setConciliando(true);
    try {
      const r = await conciliarDebitos(contaId, lista.map(l => ({ lancamentoId: l.lancamentoId!, tx: l.tx })));
      if (r.conciliados.length > 0) toast.success(`${r.conciliados.length} débito${r.conciliados.length > 1 ? "s" : ""} automático${r.conciliados.length > 1 ? "s" : ""} conciliado${r.conciliados.length > 1 ? "s" : ""}`);
      if (r.erros.length > 0) toast.error(r.erros[0]);
      alterou.current = true;
      await analisarDeNovo(transacoes, true);
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
      alterou.current = true;
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setConciliando(false);
    }
  }

  // ── gravação ──

  /** O que será gravado para uma linha, com o que a pessoa escolheu por cima do que foi sugerido. */
  function itemDaLinha(l: LinhaAnalisada): ParaRegistrar {
    const g = daGradeBase(l);
    const ed = edicoes[l.tx.fitid];
    const v = valoresEfetivos(g, ed);
    const fav = favorecidoEfetivo(g, ed);
    const escolhido = ed?.favorecido ?? null;
    return {
      tx: l.tx, categoriaId: v.categoriaId!, centroId: v.centroId, projetoId: ed?.projetoId || undefined,
      pessoaId: fav.pessoa?.id ?? (escolhido?.tipo === "fornecedor" ? escolhido.pessoaId ?? undefined : undefined),
      fornecedorId: fav.fornecedor?.id,
    };
  }

  /** "Confirmar" na própria linha: grava na hora e deixa o "Desfazer" à mão. */
  async function confirmarLinha(l: LinhaAnalisada) {
    const g = daGradeBase(l);
    if (!podeGravar(g, edicoes[l.tx.fitid])) return;
    setSalvandoLinha(true);
    try {
      const r = await registrarLote(contaId, [itemDaLinha(l)]);
      if (r.erros.length > 0 || r.ids.length !== 1) { toast.error(r.erros[0] ?? "Não foi possível lançar esta linha"); return; }
      alterou.current = true;
      setConfirmadas(m => new Map(m).set(l.tx.fitid, r.ids));
      setMarcadas(m => { const n = new Set(m); n.delete(l.tx.fitid); return n; });
      marcar(l.tx.fitid, registroDe(l, foiCorrigida(g, edicoes[l.tx.fitid]) ? "corrigida" : "aceita"));
      toast.success(`Lançado: ${l.tx.memo.slice(0, 40)}`, { action: { label: "Desfazer", onClick: () => desfazerLinha(l.tx.fitid, r.ids) } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao lançar");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function desfazerLinha(fitid: string, ids: string[]) {
    try {
      await excluirLancamentosEmLote(ids);
      setConfirmadas(m => { const n = new Map(m); n.delete(fitid); return n; });
      setRegistros(m => { const n = new Map(m); n.delete(fitid); return n; });
      toast.success("Lançamento desfeito — a linha voltou para a fila");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    }
  }

  /** Um clique decide o grupo inteiro (mesma categoria e centro para todas as linhas). */
  async function confirmarGrupo(grupo: Grupo, escolha: { categoriaId: string; centroId?: string; projetoId?: string }) {
    const doGrupo = (linhas ?? []).filter(l => grupo.fitids.includes(l.tx.fitid) && l.situacao === "nova" && !confirmadas.has(l.tx.fitid));
    if (doGrupo.length === 0) return;
    setSalvandoLinha(true);
    try {
      const itens: ParaRegistrar[] = doGrupo.map(l => ({ tx: l.tx, categoriaId: escolha.categoriaId, centroId: escolha.centroId, projetoId: escolha.projetoId }));
      const r = await registrarLote(contaId, itens);
      if (r.erros.length > 0 || r.ids.length !== itens.length) {
        toast.error(`Parte do grupo não foi gravada: ${r.erros[0] ?? "confira"}`);
        if (r.ids.length > 0 && transacoes) { alterou.current = true; await analisarDeNovo(transacoes, true); }
        return;
      }
      alterou.current = true;
      setConfirmadas(m => { const n = new Map(m); doGrupo.forEach((l, i) => n.set(l.tx.fitid, [r.ids[i]])); return n; });
      setRegistros(m => {
        const n = new Map(m);
        for (const l of doGrupo) {
          const s = l.sugestao;
          const mudou = escolha.categoriaId !== s?.categoriaId || (!!escolha.centroId && escolha.centroId !== s?.centroId);
          n.set(l.tx.fitid, registroDe(l, mudou ? "corrigida" : "aceita", { emGrupo: true }));
        }
        return n;
      });
      toast.success(`${doGrupo.length} linhas lançadas de uma vez`, { action: { label: "Desfazer", onClick: () => desfazerGrupo(doGrupo.map((l, i) => [l.tx.fitid, r.ids[i]] as [string, string])) } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao lançar o grupo");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function desfazerGrupo(pares: [string, string][]) {
    try {
      await excluirLancamentosEmLote(pares.map(p => p[1]));
      const fitids = new Set(pares.map(p => p[0]));
      setConfirmadas(m => new Map([...m].filter(([f]) => !fitids.has(f))));
      setRegistros(m => new Map([...m].filter(([f]) => !fitids.has(f))));
      toast.success(`${pares.length} lançamentos do grupo desfeitos`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    }
  }

  async function ignorar(l: LinhaAnalisada, motivo: MotivoDeIgnorar, observacao: string) {
    setSalvandoLinha(true);
    try {
      await ignorarLinha(contaId, l.tx, motivo, observacao);
      setIgnorando(null);
      marcar(l.tx.fitid, registroDe(l, "ignorada"));
      setMarcadas(m => { const n = new Set(m); n.delete(l.tx.fitid); return n; });
      toast.success("Movimento ignorado — não volta nas próximas importações");
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ignorar");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function reativar(l: LinhaAnalisada) {
    try {
      await reativarIgnorada(contaId, l.tx.fitid);
      setRegistros(m => { const n = new Map(m); n.delete(l.tx.fitid); return n; });
      toast.success("Movimento de volta à fila");
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível reativar");
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
    const itens = alvo.map(itemDaLinha);
    setGravando({ feitos: 0, total: itens.length });
    try {
      const r = await registrarLote(contaId, itens, (feitos, total) => setGravando({ feitos, total }));
      if (r.erros.length > 0) toast.error(`Parte não foi gravada: ${r.erros[0]}`);
      if (r.ids.length > 0) {
        alterou.current = true;
        setLote({ loteId: r.loteId, ids: r.ids });
        toast.success(`${r.ids.length} lançamento${r.ids.length > 1 ? "s" : ""} criado${r.ids.length > 1 ? "s" : ""}.`);
        for (const l of alvo) marcar(l.tx.fitid, registroDe(l, foiCorrigida(daGradeBase(l), edicoes[l.tx.fitid]) ? "corrigida" : "aceita"));
      }
      await analisarDeNovo(transacoes, true);
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
      alterou.current = true;
      await analisarDeNovo(transacoes, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    } finally {
      setDesfazendo(false);
    }
  }

  async function aoSalvarForm() {
    const fitid = editarLinha?.tx.fitid ?? transferirTransacao?.fitid;
    const linha = editarLinha ?? (linhas ?? []).find(l => l.tx.fitid === fitid) ?? null;
    setEditarLinha(null);
    setTransferirTransacao(null);
    alterou.current = true;
    if (fitid && linha) marcar(fitid, registroDe(linha, "manual"));
    if (transacoes) await analisarDeNovo(transacoes, true);
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

  const medicao = useMemo(() => {
    if (!aoAbrir) return null;
    return resumirMedicao(aoAbrir, totalDoArquivo, aoAbrir.identificadas + aoAbrir.revisar + aoAbrir.naoIdentificadas, [...registros.values()]);
  }, [aoAbrir, totalDoArquivo, registros]);

  // o que o formulário "Editar" recebe — memoizado: o efeito do formulário reinicia a cada novo objeto
  const rascunho = useMemo(() => {
    if (!editarLinha) return undefined;
    const g = daGradeBase(editarLinha);
    const v = valoresEfetivos(g, edicoes[editarLinha.tx.fitid]);
    const f = favorecidoEfetivo(g, edicoes[editarLinha.tx.fitid]);
    return {
      data: editarLinha.tx.data, valor: editarLinha.tx.valor, descricao: editarLinha.tx.memo,
      forma: inferirFormaPagamento(editarLinha.tx.memo),
      categoriaId: v.categoriaId, centroId: v.centroId, projetoId: edicoes[editarLinha.tx.fitid]?.projetoId || undefined,
      pessoa: f.pessoa, fornecedor: f.fornecedor,
    };
  }, [editarLinha, edicoes]);

  const total = linhas?.length ?? 0;
  const ocupado = conciliando || !!gravando || desfazendo || salvandoLinha;
  const linhasDoGrupo = (g: Grupo) => (linhas ?? []).filter(l => g.fitids.includes(l.tx.fitid) && !confirmadas.has(l.tx.fitid));
  const pilha = (f: Filtro, n: number, classe: string, icone: React.ReactNode, texto: string) => (
    <button type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${classe} ${filtro === f ? "ring-2 ring-ring" : ""}`}>
      {icone} <b className="tabular-nums">{n}</b> {texto}
    </button>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold" /> Mesa de conciliação (extrato OFX)
          </DialogTitle>
          <DialogDescription>
            Lê o extrato de <strong>{contaNome}</strong>, identifica quem é cada movimento e sugere categoria e centro de custo.
            Você confirma o que veio certo, troca o que veio errado na própria linha e só abre o formulário nas exceções — nada é
            gravado antes do seu clique, e tudo pode ser desfeito.
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
            {/* a fila: três pilhas, cada uma é um filtro */}
            <div className="rounded-md border p-3 space-y-2.5">
              <p className="text-sm font-medium">{total} movimentações no extrato</p>
              <div className="flex flex-wrap gap-2">
                {pilha("identificadas", contagem.identificadas, "border-success-line bg-success-soft text-success-text", <CheckCircle2 className="w-4 h-4" />, "identificadas")}
                {pilha("revisar", contagem.revisar, "border-warning-line bg-warning-soft text-warning-text", <AlertTriangle className="w-4 h-4" />, "precisam de revisão")}
                {pilha("nao_identificadas", contagem.nao_identificadas, "border-destructive-line bg-destructive-soft text-destructive-text", <XCircle className="w-4 h-4" />, "não identificadas")}
              </div>
              {(contagem.transferencias + contagem.conciliar + contagem.ja_registradas + contagem.ignoradas) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fora da fila: {contagem.conciliar} a conciliar com lançamentos já feitos · {contagem.ja_registradas} já registrada{contagem.ja_registradas !== 1 ? "s" : ""} (não serão criadas de novo) · {contagem.ignoradas} ignorada{contagem.ignoradas !== 1 ? "s" : ""} · {contagem.transferencias} parece{contagem.transferencias !== 1 ? "m" : ""} transferência entre contas.
                </p>
              )}
              {documentosEncontrados.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 p-2.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm flex-1 min-w-0">
                    <b className="tabular-nums">{documentosEncontrados.length}</b> pagamento{documentosEncontrados.length > 1 ? "s" : ""} do extrato quita{documentosEncontrados.length > 1 ? "m" : ""} documento{documentosEncontrados.length > 1 ? "s" : ""} a pagar
                    {divergentes.length > 0 && <> — <b className="tabular-nums text-warning-text">{divergentes.length} com diferença de valor</b></>}.
                    Revise cada um: nada é liquidado sem o seu clique.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={ocupado}
                    onClick={() => setLiquidarLinha(divergentes[0] ?? documentosEncontrados[0])}>
                    <Scale className="w-3.5 h-3.5" /> Revisar {divergentes.length > 0 ? "diferenças" : "documentos"}
                  </Button>
                </div>
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
                <Button type="button" size="sm" variant={agrupar ? "secondary" : "outline"} className="gap-1.5" aria-pressed={agrupar} onClick={() => setAgrupar(v => !v)}>
                  <Layers className="w-3.5 h-3.5" /> Agrupar por padrão
                </Button>
              </div>
              {gravando && (
                <p className="text-xs text-muted-foreground flex items-center gap-2" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gravando… {gravando.feitos} de {gravando.total}
                </p>
              )}
            </div>

            {medicao && <PainelDeMedicao medicao={medicao} rotulo={contaNome} />}

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
              {ORDEM_DOS_FILTROS.filter(f => f !== "ignoradas" || contagem.ignoradas > 0).map(f => (
                <button key={f} type="button" role="tab" aria-selected={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                  {ROTULO_DO_FILTRO[f]} <span className="tabular-nums opacity-80">{contagem[f]}</span>
                </button>
              ))}
            </div>

            {/* os grupos: uma decisão para várias linhas do mesmo padrão */}
            {agrupamento.grupos.length > 0 && (
              <div className="space-y-2" aria-label="Linhas do mesmo padrão">
                {agrupamento.grupos.map(g => (
                  <CartaoDoGrupo key={`${g.tipo}|${g.chave}|${g.fitids.length}`} grupo={g} linhas={linhasDoGrupo(g)}
                    categorias={categoriasPorTipo[g.tipo]} opcoesDeCentro={opcoesDeCentro} projetos={projetos} nomeDaCategoria={nomeDaCategoria}
                    ocupado={ocupado} onConfirmar={confirmarGrupo} />
                ))}
              </div>
            )}

            {/* a fila de cartões */}
            {pag.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{agrupamento.grupos.length > 0 ? "O resto desta pilha está nos grupos acima." : "Nenhuma movimentação neste filtro."}</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {pag.itens.map(l => {
                  const fitid = l.tx.fitid;
                  const entrada = l.tx.tipo === "entrada";
                  const lancadaAgora = confirmadas.get(fitid);
                  return (
                    <li key={fitid} className="px-3 py-2 space-y-1.5 text-sm">
                      {lancadaAgora ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-success-text" aria-hidden />
                          <span className="w-11 shrink-0 tabular-nums text-xs text-muted-foreground">{dataBr(l.tx.data)}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={l.tx.memo}>{l.tx.memo}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{entrada ? "+" : "−"}{brl(l.tx.valor)}</span>
                          <span className="shrink-0 text-xs text-success-text">lançado</span>
                          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={ocupado} onClick={() => desfazerLinha(fitid, lancadaAgora)}>
                            <Undo2 className="w-3 h-3" /> Desfazer
                          </Button>
                        </div>
                      ) : l.situacao === "nova" && l.sugestao ? (
                        <CartaoDaLinha linha={l} edicao={edicoes[fitid]} marcada={marcadas.has(fitid)} ocupado={ocupado}
                          categorias={categoriasPorTipo[l.tx.tipo]} opcoesDeCentro={opcoesDeCentro} projetos={projetos} nomeDaCategoria={nomeDaCategoria}
                          ignorarDisponivel={ignorarDisponivel}
                          onEditar={patch => editar(fitid, patch)} onMarcar={c => alternarMarca(fitid, c)}
                          onConfirmar={() => confirmarLinha(l)} onFormulario={() => setEditarLinha(l)}
                          onTransferencia={() => setTransferirTransacao(l.tx)} onIgnorar={() => setIgnorando(l)} />
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-4 shrink-0" />
                            <span className="w-11 shrink-0 tabular-nums text-xs text-muted-foreground">{dataBr(l.tx.data)}</span>
                            <span className="min-w-0 flex-1 truncate" title={l.tx.memo}>{l.tx.memo}</span>
                            <span className={`shrink-0 tabular-nums ${entrada ? "text-success-text" : "text-destructive-text"}`}>
                              {entrada ? "+" : "−"}{brl(l.tx.valor)}
                            </span>
                          </div>

                          {l.situacao === "conciliar" && (
                            <p className="pl-6 text-xs text-muted-foreground">Casa com um lançamento já registrado — será conciliada.</p>
                          )}
                          {l.situacao === "ja_registrada" && (
                            <p className="pl-6 text-xs text-muted-foreground">Já registrada: {l.motivoJaRegistrada}. Não será criada de novo.</p>
                          )}
                          {l.situacao === "ignorada" && l.ignorada && (
                            <div className="pl-6 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-muted-foreground flex-1 min-w-0">
                                <BanIcon className="mr-1 inline h-3 w-3" aria-hidden />Ignorada — {ROTULO_DO_MOTIVO[l.ignorada.motivo]}{l.ignorada.observacao ? `: ${l.ignorada.observacao}` : ""}. Não volta nas próximas importações.
                              </p>
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={ocupado} onClick={() => reativar(l)}>
                                <RotateCcw className="w-3 h-3" /> Reativar
                              </Button>
                            </div>
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
                          {l.situacao === "documento" && l.documentos?.[0] && (
                            <div className="pl-6 flex flex-wrap items-center gap-2">
                              <p className="text-xs flex-1 min-w-0">
                                <b className={l.documentos[0].exato ? "text-info-text" : "text-warning-text"}>
                                  {l.documentos[0].exato ? "Documento a pagar encontrado" : "⚠ Diferença identificada"}
                                </b>
                                {" — "}{l.documentos[0].documento.descricao ?? "documento"}, vencimento {dataBr(l.documentos[0].documento.data)}, documento {brl(l.documentos[0].documento.valor)}
                                {!l.documentos[0].exato && <> · diferença <b className="tabular-nums">{l.documentos[0].diferenca > 0 ? "+" : "−"}{brl(Math.abs(l.documentos[0].diferenca))}</b></>}
                              </p>
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={ocupado}
                                onClick={() => setLiquidarLinha(l)}>
                                <Scale className="w-3 h-3" /> {l.documentos[0].exato ? "Liquidar" : "Explicar diferença"}
                              </Button>
                            </div>
                          )}
                          {l.situacao === "ambigua" && (
                            <div className="pl-6 flex flex-wrap items-center gap-2">
                              <p className="text-xs text-warning-text flex-1 min-w-0">Há lançamentos parecidos já registrados — confira à mão antes de criar outro.</p>
                              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setEditarLinha(l)}>
                                Lançar
                              </Button>
                              {ignorarDisponivel && (
                                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setIgnorando(l)}>
                                  <BanIcon className="w-3 h-3" /> Ignorar
                                </Button>
                              )}
                            </div>
                          )}
                        </>
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
                <span className="tabular-nums">Página {pag.pagina} de {pag.paginas} · {naLista.length} linhas</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" disabled={pag.pagina >= pag.paginas} onClick={() => setPagina(pag.pagina + 1)}>
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={reiniciar} disabled={ocupado}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => fechar(false)} disabled={ocupado}>Fechar</Button>
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

    <IgnorarLinhaDialog linha={ignorando} ocupado={salvandoLinha} onFechar={() => setIgnorando(null)} onConfirmar={ignorar} />

    <LiquidarPeloExtratoDialog linha={liquidarLinha} contaId={contaId} onFechar={() => setLiquidarLinha(null)} onFeito={aoLiquidar} />

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
