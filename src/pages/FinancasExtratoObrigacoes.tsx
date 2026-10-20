// ─── FinancasExtratoObrigacoes.tsx — "Extrato de Obrigações" ─────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido (16/10/2026): ver TODAS as obrigações de um período, tenham sido pagas pela igreja, reembolsadas ou quitadas por terceiros. A quitada por terceiro aparece normalmente,
// mesmo sem movimentação financeira (não há extrato de banco que a "prove"). Filtros: período, situação, fornecedor, categoria, centro de custo, projeto. Exporta Excel, PDF e CSV.
// Leitura em `services/extratoDeObrigacoesService.ts`; regras (situação, resumo, atraso, AÇÕES de cada linha) em `lib/extratoDeObrigacoes.ts`.
// Pedido de 20/10/2026: deixou de ser só consulta. Cada linha tem as ações que cabem à sua situação — Visualizar, Editar, Pagar agora (ou Pagar reembolso), Corrigir quitação — e TODAS reaproveitam o que a
// Mesa já usa (`useAcoesLancamento`, `LancamentoForm`, `PagarReembolsoDialog`, `QuitacaoDialog`, `DetalhesDoLancamento`): o tesoureiro resolve sem sair daqui e a lista recarrega ao terminar. As ações não saem no papel.
// Impressão: A4 em PAISAGEM — são 12 colunas; as demais telas de relatório com muitas colunas fazem o mesmo.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { ArrowLeft, CheckCircle2, Download, Eye, FileSpreadsheet, Loader2, Paperclip, Pencil, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoData } from "@/components/CampoData";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { PaginaSkeleton } from "@/components/ListState";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { DocumentacaoDaObrigacao } from "@/components/financas/DocumentacaoDaObrigacao";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { PagarReembolsoDialog } from "@/components/financas/PagarReembolsoDialog";
import { QuitacaoDialog, type AlvoDaQuitacao } from "@/components/financas/QuitacaoDialog";
import { useAcoesLancamento } from "@/hooks/useAcoesLancamento";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";
import { mensagemErro } from "@/lib/erroRede";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import { quitacaoDaObrigacao, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import {
  brl, buscarVencimentoPorId, downloadCSV, listarCategoriasTodas, listarCentrosCustoTodas, listarFornecedores, listarProjetosTodos,
  type FinCategoria, type FinCentroCusto, type FinFornecedor, type FinProjeto,
} from "@/services/finService";
import { carregarExtratoDeObrigacoes } from "@/services/extratoDeObrigacoesService";
import {
  CABECALHO_DO_EXTRATO, OPCOES_DE_SITUACAO, acoesDaObrigacao, ROTULO_SITUACAO, dataDoExtrato, filtrarPorSituacao, gerarCSVDoExtrato, resumoDoExtrato,
  type FiltroDeSituacao, type LinhaDoExtrato, type SituacaoDaObrigacao,
} from "@/lib/extratoDeObrigacoes";
import { gerarXlsx, serialDoExcel, type Celula } from "@/lib/xlsxSimples";
import { hojeLocal, toYmd } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const TODOS = "__todos__";

const COR_DA_SITUACAO: Record<SituacaoDaObrigacao, string> = {
  em_aberto: "border-warning-line bg-warning-soft text-warning-text",
  paga_parcialmente: "border-warning-line bg-warning-soft text-warning-text",
  paga: "border-success-line bg-success-soft text-success-text",
  reembolso: "border-gold/50 bg-gold/10 text-foreground",
  quitada_por_terceiro: "border-primary/40 bg-primary/10 text-foreground",
  cancelada: "border-border bg-muted text-muted-foreground",
};

/** Um filtro "Todos/Todas ou um item". Declarado FORA da tela: dentro dela seria um componente novo a cada renderização e remontaria os seletores. */
function Filtro({ rotulo, valor, onChange, itens, todos }: { rotulo: string; valor: string; onChange: (v: string) => void; itens: { id: string; nome: string }[]; todos: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs text-muted-foreground mb-0.5">{rotulo}</p>
      <Select value={valor || TODOS} onValueChange={v => onChange(v === TODOS ? "" : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={todos} /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={TODOS}>{todos}</SelectItem>
          {itens.map(i => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** As ações da linha — o que aparece vem de `acoesDaObrigacao` (lib), que carrega a regra por situação. Fora da tela para não remontar a cada renderização. */
function AcoesDaLinha({ l, podeOperar, ocupada, onVisualizar, onEditar, onPagar, onPagarReembolso, onDocumentacao, onCorrigirQuitacao }: {
  l: LinhaDoExtrato; podeOperar: boolean; ocupada: boolean;
  onVisualizar: () => void; onEditar: () => void; onPagar: () => void; onPagarReembolso: () => void; onDocumentacao: () => void; onCorrigirQuitacao: () => void;
}) {
  const a = acoesDaObrigacao(l);
  const btn = "h-6 px-1.5 text-[11px] gap-1 whitespace-nowrap";
  // na obrigação de terceiro/reembolso a documentação é o centro da decisão (NF, declaração, evidências): o botão ganha destaque
  const emDestaque = l.situacao === "quitada_por_terceiro" || l.situacao === "reembolso";
  return (
    <div className="flex flex-wrap gap-1">
      {a.visualizar && (
        <Button size="sm" variant="ghost" className={btn} disabled={ocupada} onClick={onVisualizar} aria-label={`Visualizar ${l.fornecedor || l.descricao || "obrigação"}`}>
          {ocupada ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} Visualizar
        </Button>
      )}
      {a.editar && podeOperar && (
        <Button size="sm" variant="outline" className={btn} disabled={ocupada} onClick={onEditar}><Pencil className="w-3 h-3" /> Editar</Button>
      )}
      {a.pagar === "normal" && podeOperar && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagar}><CheckCircle2 className="w-3 h-3" /> Pagar agora</Button>
      )}
      {a.pagar === "reembolso" && podeOperar && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagarReembolso}><CheckCircle2 className="w-3 h-3" /> Pagar reembolso</Button>
      )}
      {a.documentacao && (
        <Button size="sm" variant={emDestaque ? "default" : "outline"} className={btn} disabled={ocupada} onClick={onDocumentacao}
          aria-label={`Documentação de ${l.fornecedor || l.descricao || "obrigação"}`}><Paperclip className="w-3 h-3" /> Documentação</Button>
      )}
      {a.corrigirQuitacao && podeOperar && (
        <Button size="sm" variant="outline" className={btn} disabled={ocupada} onClick={onCorrigirQuitacao}><ShieldCheck className="w-3 h-3" /> Corrigir quitação</Button>
      )}
    </div>
  );
}

function mesAtual(): { de: string; ate: string } {
  const [a, m] = hojeLocal().split("-").map(Number);
  return { de: `${a}-${String(m).padStart(2, "0")}-01`, ate: toYmd(new Date(a, m, 0)) };
}

export default function FinancasExtratoObrigacoes() {
  const { user, hasRole } = useAuth();
  // quem opera o dinheiro; os demais só visualizam (a RLS do banco é a barreira de verdade — isto só poupa o botão que daria "permissão negada")
  const podeOperar = hasRole(ROLES_FINANCEIRO);
  const [params, setParams] = useSearchParams();
  const padrao = useMemo(mesAtual, []);
  const de = params.get("inicio") || padrao.de;
  const ate = params.get("fim") || padrao.ate;
  const situacao = (params.get("situacao") as FiltroDeSituacao) || "todas";
  const fornecedorId = params.get("fornecedor") || "";
  const categoriaId = params.get("categoria") || "";
  const centroId = params.get("centro") || "";
  const projetoId = params.get("projeto") || "";

  const [linhas, setLinhas] = useState<LinhaDoExtrato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [emitidoPor, setEmitidoPor] = useState("");
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [projetos, setProjetos] = useState<FinProjeto[]>([]);
  // ações por linha
  const acoes = useAcoesLancamento(() => carregar());
  const [detalhe, setDetalhe] = useState<Awaited<ReturnType<typeof buscarLancamentoParaEditar>>>(null);
  const [editando, setEditando] = useState<Awaited<ReturnType<typeof buscarLancamentoParaEditar>>>(null);
  const [reembolso, setReembolso] = useState<QuitacaoDaObrigacao | null>(null);
  const [corrigindo, setCorrigindo] = useState<{ alvo: AlvoDaQuitacao; quitacao: QuitacaoDaObrigacao } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [documentando, setDocumentando] = useState<Awaited<ReturnType<typeof buscarLancamentoParaEditar>>>(null);
  const [anexando, setAnexando] = useState<{ id: string; descricao: string } | null>(null);

  useEffect(() => {
    Promise.all([listarFornecedores("", true), listarCategoriasTodas(), listarCentrosCustoTodas(), listarProjetosTodos()])
      .then(([f, c, cc, p]) => { setFornecedores(f); setCategorias(c.filter(x => x.tipo === "saida")); setCentros(cc); setProjetos(p); })
      .catch(() => { /* os filtros ficam sem opções; o relatório em si continua funcionando */ });
    if (user) supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle().then(({ data }) => setEmitidoPor(data?.nome ?? user.email ?? "Sistema"));
    // só o id: o objeto `user` pode ser recriado a cada renovação da sessão, e as listas de filtro não devem recarregar por isso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function carregar() {
    setCarregando(true); setErro(null);
    try {
      setLinhas(await carregarExtratoDeObrigacoes({
        de, ate, fornecedorId: fornecedorId || undefined, categoriaId: categoriaId || undefined, centroId: centroId || undefined, projetoId: projetoId || undefined,
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as obrigações.");
      setLinhas([]);
    } finally { setCarregando(false); }
  }
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [de, ate, fornecedorId, categoriaId, centroId, projetoId]);

  /** Uma ação por vez na linha: o botão fica desabilitado enquanto a leitura (de um lançamento, vencimento ou quitação) responde, e qualquer falha vira aviso — nunca fica muda. */
  async function naLinha(id: string, fazer: () => Promise<void>) {
    setOcupado(id);
    try { await fazer(); } catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(null); }
  }
  const visualizar = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const x = await buscarLancamentoParaEditar(l.obrigacaoId);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setDetalhe(x);
  });
  const documentacao = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const x = await buscarLancamentoParaEditar(l.obrigacaoId);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setDocumentando(x);
  });
  const editar = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    if (!l.idEmAberto) return;
    const x = await buscarLancamentoParaEditar(l.idEmAberto);
    if (!x) throw new Error("Não encontrei esta obrigação — ela pode ter sido removida. Atualize a lista.");
    setEditando(x);
  });
  const pagarAgora = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    if (!l.idEmAberto) return;
    const v = await buscarVencimentoPorId(l.idEmAberto);
    if (!v) { toast.info("Esta obrigação já não está em aberto — alguém acabou de pagá-la. Atualizando a lista."); await carregar(); return; }
    acoes.pagar(v);   // o MESMO fluxo de sempre: documento, Pix/QR, liquidação, comprovante
  });
  const pagarReembolso = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const q = await quitacaoDaObrigacao(l.obrigacaoId);
    if (!q) throw new Error("Não encontrei a quitação deste reembolso. Atualize a lista.");
    setReembolso(q);
  });
  const corrigirQuitacao = (l: LinhaDoExtrato) => naLinha(l.obrigacaoId, async () => {
    const q = await quitacaoDaObrigacao(l.obrigacaoId);
    if (!q) throw new Error("Esta obrigação não tem quitação registrada para corrigir.");
    setCorrigindo({ alvo: { id: l.obrigacaoId, descricao: l.descricao || l.fornecedor || "Obrigação", valor: l.valor }, quitacao: q });
  });

  function mudar(campos: Record<string, string>) {
    const p = new URLSearchParams(params);
    Object.entries(campos).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    setParams(p, { replace: true });
  }

  const visiveis = useMemo(() => filtrarPorSituacao(linhas, situacao), [linhas, situacao]);
  const resumo = useMemo(() => resumoDoExtrato(visiveis), [visiveis]);

  const nomeDe = <T extends { id: string; nome: string }>(lista: T[], id: string) => lista.find(x => x.id === id)?.nome ?? "";
  const filtrosEmTexto = [
    situacao !== "todas" ? `Situação: ${OPCOES_DE_SITUACAO.find(o => o.valor === situacao)?.rotulo}` : "",
    fornecedorId ? `Fornecedor: ${nomeDe(fornecedores, fornecedorId)}` : "",
    categoriaId ? `Categoria: ${nomeDe(categorias, categoriaId)}` : "",
    centroId ? `Centro de custo: ${nomeDe(centros, centroId)}` : "",
    projetoId ? `Projeto: ${nomeDe(projetos, projetoId)}` : "",
  ].filter(Boolean);
  const periodoEmTexto = `${dataDoExtrato(de)} a ${dataDoExtrato(ate)}`;
  const arquivo = (ext: string) => `QIBRJ_Extrato_de_Obrigacoes_${de}_a_${ate}.${ext}`;

  function exportarCSV() {
    downloadCSV(arquivo("csv"), gerarCSVDoExtrato(visiveis, resumo, [`Período: ${periodoEmTexto}`, ...filtrosEmTexto]));
    toast.success("CSV exportado");
  }

  async function exportarExcel() {
    try {
      const cab = CABECALHO_DO_EXTRATO.map(h => ({ v: h as string, estilo: "cabecalho" as const }));
      const dados: Celula[][] = visiveis.map(l => [
        { v: serialDoExcel(l.data), estilo: "data" }, l.fornecedor, l.documento, l.descricao, l.categoria, l.centro, l.projeto, { v: l.valor, estilo: "moeda" },
        ROTULO_SITUACAO[l.situacao], l.responsavel, l.intencao, l.diasEmAtraso === null ? null : { v: l.diasEmAtraso, estilo: "inteiro" },
      ]);
      const total: Celula[] = [{ v: "Total (sem canceladas)", estilo: "negrito" }, null, null, null, null, null, null, { v: resumo.valorTotal, estilo: "moedaNegrito" }];
      const topo: Celula[][] = [
        [{ v: "EXTRATO DE OBRIGAÇÕES", estilo: "titulo" }],
        [`Período: ${periodoEmTexto}`],
        [filtrosEmTexto.length ? `Filtros: ${filtrosEmTexto.join(" · ")}` : "Sem outros filtros"],
        [`Emitido em ${new Date().toLocaleDateString("pt-BR")} por ${emitidoPor || "Sistema"}`],
        [],
      ];
      const parte = (nome: string, q: number, v: number): Celula[] => [nome, { v: q, estilo: "inteiro" }, { v, estilo: "moeda" }];
      const blob = await gerarXlsx([
        { nome: "Obrigações", linhas: [...topo, cab, ...dados, total], larguras: [11, 28, 14, 34, 22, 22, 18, 15, 20, 26, 18, 10], linhaDoCabecalho: topo.length },
        {
          nome: "Resumo", larguras: [34, 12, 16],
          linhas: [
            [{ v: "RESUMO", estilo: "titulo" }], [`Período: ${periodoEmTexto}`], [],
            [{ v: "Situação", estilo: "cabecalho" }, { v: "Quantidade", estilo: "cabecalho" }, { v: "Valor", estilo: "cabecalho" }],
            [{ v: "Total (valor sem canceladas)", estilo: "negrito" }, { v: resumo.quantidade, estilo: "inteiro" }, { v: resumo.valorTotal, estilo: "moedaNegrito" }],
            parte("Em aberto (saldo a pagar)", resumo.emAberto.quantidade, resumo.emAberto.valor), parte("Pagas", resumo.pagas.quantidade, resumo.pagas.valor),
            parte("Reembolsos", resumo.reembolsos.quantidade, resumo.reembolsos.valor), parte("Quitadas por terceiros", resumo.quitadasPorTerceiros.quantidade, resumo.quitadasPorTerceiros.valor),
            parte("Canceladas", resumo.canceladas.quantidade, resumo.canceladas.valor),
          ],
        },
      ]);
      saveAs(blob, arquivo("xlsx"));
      toast.success("Excel exportado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o Excel.");
    }
  }

  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const cartoes: { rotulo: string; q: number; v: number | null; destaque?: boolean }[] = [
    { rotulo: "Obrigações", q: resumo.quantidade, v: resumo.valorTotal, destaque: true },
    { rotulo: "Em aberto", q: resumo.emAberto.quantidade, v: resumo.emAberto.valor },
    { rotulo: "Pagas", q: resumo.pagas.quantidade, v: resumo.pagas.valor },
    { rotulo: "Reembolsos", q: resumo.reembolsos.quantidade, v: resumo.reembolsos.valor },
    { rotulo: "Quitadas por terceiros", q: resumo.quitadasPorTerceiros.quantidade, v: resumo.quitadasPorTerceiros.valor },
    { rotulo: "Canceladas", q: resumo.canceladas.quantidade, v: null },
  ];


  return (
    <div className="bg-background min-h-screen">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm 1.2cm; }
          .relatorio-page table { table-layout: fixed !important; }
          .tabela-extrato, .tabela-extrato td, .tabela-extrato th { font-size: 8.5px !important; line-height: 1.25 !important; }
          .tabela-extrato td, .tabela-extrato th { padding: 2px 3px !important; vertical-align: top; word-break: break-word; }
          .tabela-extrato thead { display: table-header-group; }
          .tabela-extrato tfoot { display: table-row-group; }
          .resumo-extrato { gap: 4px !important; }
        }
      `}</style>

      {/* Barra de controles e filtros */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-7xl mx-auto px-4 py-2 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2"><Link to="/painel-tesouraria"><ArrowLeft className="w-3.5 h-3.5" /> Tesouraria</Link></Button>
            <h1 className="font-serif text-lg">Extrato de Obrigações</h1>
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <Button onClick={() => void carregar()} size="sm" variant="outline" disabled={carregando} className="gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${carregando ? "animate-spin" : ""}`} /> Atualizar
              </Button>
              <Button onClick={() => void exportarExcel()} size="sm" variant="outline" disabled={carregando || visiveis.length === 0} className="gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </Button>
              <Button onClick={exportarCSV} size="sm" variant="outline" disabled={carregando || visiveis.length === 0} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button variant="gold" onClick={() => window.print()} size="sm" disabled={carregando} className="gap-1.5">
                <Printer className="w-3.5 h-3.5" /> PDF / Imprimir
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 items-end">
            <div className="min-w-0"><p className="text-2xs text-muted-foreground mb-0.5">Data inicial</p><CampoData value={de} onChange={v => v && mudar({ inicio: v })} /></div>
            <div className="min-w-0"><p className="text-2xs text-muted-foreground mb-0.5">Data final</p><CampoData value={ate} onChange={v => v && mudar({ fim: v })} /></div>
            <div className="min-w-0">
              <p className="text-2xs text-muted-foreground mb-0.5">Situação</p>
              <Select value={situacao} onValueChange={v => mudar({ situacao: v === "todas" ? "" : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{OPCOES_DE_SITUACAO.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Filtro rotulo="Fornecedor" valor={fornecedorId} onChange={v => mudar({ fornecedor: v })} itens={fornecedores} todos="Todos" />
            <Filtro rotulo="Categoria" valor={categoriaId} onChange={v => mudar({ categoria: v })} itens={categorias} todos="Todas" />
            <Filtro rotulo="Centro de custo" valor={centroId} onChange={v => mudar({ centro: v })} itens={centros} todos="Todos" />
            <Filtro rotulo="Projeto" valor={projetoId} onChange={v => mudar({ projeto: v })} itens={projetos} todos="Todos" />
          </div>
        </div>
      </div>

      {carregando && linhas.length === 0 ? <PaginaSkeleton /> : (
        <div className="relatorio-page max-w-7xl mx-auto bg-white text-foreground p-4 md:p-8 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
          <header className="avoid-break flex items-start justify-between gap-4 pb-3 border-b-2 border-gold/30">
            <div className="flex flex-col items-center gap-1">
              <img src={logoDiakonia} alt="DIAKONIA" className="h-12 w-auto object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }} draggable={false} />
              <div className="text-center">
                <h2 className="font-serif text-base leading-tight">DiakoniaApp</h2>
                <p className="text-2xs text-muted-foreground tracking-[0.12em] uppercase">Gestão Ministerial</p>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              <p>Emitido em <strong className="text-foreground">{hojeBr}</strong> às {horaBr}</p>
              <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
            </div>
          </header>

          <div className="text-center my-4 avoid-break">
            <p className="text-xs tracking-[0.25em] uppercase text-gold">Extrato de Obrigações</p>
            <h1 className="font-serif text-2xl mt-1">{periodoEmTexto}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {resumo.quantidade} obrigaç{resumo.quantidade === 1 ? "ão" : "ões"} · pagas pela igreja, reembolsadas ou quitadas por terceiros
              {filtrosEmTexto.length > 0 && <> · {filtrosEmTexto.join(" · ")}</>}
            </p>
          </div>

          {erro && <p role="alert" className="no-print rounded-md border border-destructive-line bg-destructive-soft px-3 py-2 text-sm text-destructive-text mb-4">{erro}</p>}

          <section aria-label="Resumo" className="resumo-extrato avoid-break grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 print:grid-cols-6 gap-2 mb-4">
            {cartoes.map(c => (
              <div key={c.rotulo} className={`rounded-md border px-3 py-2 ${c.destaque ? "border-gold/50 bg-gold/5" : "bg-card"}`}>
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">{c.rotulo}</p>
                <p className="text-lg font-semibold tabular-nums leading-tight">{c.q}</p>
                {c.v !== null && <p className="text-xs tabular-nums text-muted-foreground">{brl(c.v)}</p>}
              </div>
            ))}
          </section>
          <p className="text-2xs text-muted-foreground -mt-2 mb-3">O valor total não inclui as canceladas; "Em aberto" é o que ainda falta pagar (inclui pagamentos parciais).</p>

          {visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-8 text-center">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Nenhuma obrigação neste período, com estes filtros."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabela-extrato w-full text-xs border-collapse min-w-[1100px] print:min-w-0">
                <colgroup>
                  {[5, 10, 5, 13, 9, 9, 6, 7, 7, 7, 5, 3].map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
                  <col className="no-print" style={{ width: "260px" }} />
                </colgroup>
                <thead>
                  <tr className="border-b-2 border-gold/40 text-left text-muted-foreground">
                    {CABECALHO_DO_EXTRATO.map((h, i) => <th key={h} className={`py-1.5 pr-2 font-semibold ${i === 7 || i === 11 ? "text-right" : i === 8 ? "pl-2" : ""}`}>{h}</th>)}
                    <th className="no-print sticky right-0 z-[1] min-w-[260px] bg-white py-1.5 pl-2 font-semibold shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.18)]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(l => (
                    <tr key={l.obrigacaoId} data-obrigacao={l.obrigacaoId} className="border-b border-border/40 avoid-break align-top">
                      <td className="py-1 pr-2 tabular-nums whitespace-nowrap">{dataDoExtrato(l.data)}</td>
                      <td className="py-1 pr-2">{l.fornecedor || "—"}</td>
                      <td className="py-1 pr-2">{l.documento || "—"}</td>
                      <td className="py-1 pr-2">{l.descricao || "—"}</td>
                      <td className="py-1 pr-2">{l.categoria || "—"}</td>
                      <td className="py-1 pr-2">{l.centro || "—"}</td>
                      <td className="py-1 pr-2">{l.projeto || "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums whitespace-nowrap">{brl(l.valor)}</td>
                      <td className="py-1 pr-2 pl-2">
                        <span className={`inline-block rounded-full border px-1.5 py-0.5 text-2xs leading-tight print:border-0 print:bg-transparent print:p-0 print:rounded-none print:text-[8.5px] ${COR_DA_SITUACAO[l.situacao]}`}>{ROTULO_SITUACAO[l.situacao]}</span>
                      </td>
                      <td className="py-1 pr-2">{l.responsavel}</td>
                      <td className="py-1 pr-2">{l.intencao}</td>
                      <td className={`py-1 text-right tabular-nums ${l.diasEmAtraso ? "text-destructive-text font-medium" : ""}`}>{l.diasEmAtraso ?? "—"}</td>
                      <td className="no-print sticky right-0 z-[1] min-w-[260px] bg-white py-1 pl-2 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.18)]">
                        <AcoesDaLinha l={l} podeOperar={podeOperar} ocupada={ocupado === l.obrigacaoId}
                          onVisualizar={() => void visualizar(l)} onEditar={() => void editar(l)} onPagar={() => void pagarAgora(l)}
                          onPagarReembolso={() => void pagarReembolso(l)} onDocumentacao={() => void documentacao(l)} onCorrigirQuitacao={() => void corrigirQuitacao(l)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gold/40 font-semibold bg-muted/40" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                    <td colSpan={7} className="py-1.5 uppercase tracking-wide">Total (sem canceladas)</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap">{brl(resumo.valorTotal)}</td>
                    <td colSpan={4} />
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Os fluxos de sempre, montados uma vez: pagar (documento, Pix/QR, liquidação, comprovante) · detalhe · edição · pagar reembolso · corrigir quitação */}
          <div className="no-print">
            {acoes.dialogs}
            <DetalhesDoLancamento lancamento={detalhe} onFechar={() => setDetalhe(null)} />
            <DocumentacaoDaObrigacao lancamento={documentando} onFechar={() => setDocumentando(null)}
              onAnexos={podeOperar ? (x => { setDocumentando(null); setAnexando({ id: x.id, descricao: x.descricao || x.fornecedor_nome || "Obrigação" }); }) : undefined} />
            {anexando && (
              <AnexosLancamentoDialog open onOpenChange={v => {
                if (v) return;
                const id = anexando.id; setAnexando(null); void carregar();
                void buscarLancamentoParaEditar(id).then(x => { if (x) setDocumentando(x); }).catch(() => { /* só não reabre o painel */ });
              }} lancamentoId={anexando.id} descricaoLancamento={anexando.descricao} />
            )}
            <LancamentoForm open={!!editando} onOpenChange={v => { if (!v) setEditando(null); }} lancamento={editando} onSaved={() => { setEditando(null); void carregar(); }} />
            <PagarReembolsoDialog alvo={reembolso} onFechar={() => setReembolso(null)} onFeito={() => { setReembolso(null); void carregar(); }} />
            <QuitacaoDialog alvo={corrigindo?.alvo ?? null} quitacao={corrigindo?.quitacao ?? null} onFechar={() => setCorrigindo(null)} onFeito={() => { setCorrigindo(null); void carregar(); }} />
          </div>

          <footer className="avoid-break mt-6 pt-3 border-t border-gold/30 text-center">
            <p className="text-xs italic text-muted-foreground font-serif">"Tudo, porém, deve ser feito com decência e ordem."</p>
            <p className="text-xs text-gold tracking-wide mt-1">1 Coríntios 14:40</p>
          </footer>
        </div>
      )}
    </div>
  );
}
