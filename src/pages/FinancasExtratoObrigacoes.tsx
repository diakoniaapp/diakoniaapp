// ─── FinancasExtratoObrigacoes.tsx — "Extrato de Obrigações" ─────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido (16/10/2026): ver TODAS as obrigações de um período, tenham sido pagas pela igreja, reembolsadas ou quitadas por terceiros. A quitada por terceiro aparece normalmente,
// mesmo sem movimentação financeira (não há extrato de banco que a "prove"). Exporta Excel, PDF e CSV.
// 20/10/2026 (1): deixou de ser só consulta — cada linha tem as ações que cabem à sua situação (Visualizar, Editar, Pagar agora/Pagar reembolso, Documentação, Corrigir quitação), todas reaproveitando os
//   fluxos que a Mesa já usa (`useAcoesLancamento`, `LancamentoForm`, `PagarReembolsoDialog`, `QuitacaoDialog`, `DetalhesDoLancamento`, `DocumentacaoDaObrigacao`).
// 20/10/2026 (2): REDESENHO com a identidade da Prestação de Contas (proposta aprovada em 20/10): agrupado por DIA, com "TOTAL DO DIA"; resumo de 6 totais; selos de situação (cor + forma + palavra);
//   filtro de CONTA; "Em aberto" inclui os reembolsos a pagar; terceiros e reembolsos em destaque; impressão em RETRATO com modelos (Tesouraria, Contabilidade, Diretoria, Simplificado) escolhidos antes do PDF.
//   Tela e papel usam a mesma peça de linha (`components/financas/extrato/DiasDoExtrato.tsx`); a tela mostra tudo e as ações, o papel só os campos do modelo e nenhum botão.
// Leitura em `services/extratoDeObrigacoesService.ts`; regras em `lib/extratoDeObrigacoes.ts`; modelos de papel em `lib/perfilDeImpressaoDoExtrato.ts`; peças comuns de relatório em `relatorio/RelatorioKit.tsx`.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { saveAs } from "file-saver";
import { ArrowLeft, CheckCircle2, Download, Eye, FileSpreadsheet, Loader2, MoreHorizontal, Paperclip, Pencil, Printer, RefreshCw, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CampoData } from "@/components/CampoData";
import { PaginaSkeleton } from "@/components/ListState";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { DocumentacaoDaObrigacao } from "@/components/financas/DocumentacaoDaObrigacao";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { PagarReembolsoDialog } from "@/components/financas/PagarReembolsoDialog";
import { QuitacaoDialog, type AlvoDaQuitacao } from "@/components/financas/QuitacaoDialog";
import { DiaDoExtratoBloco } from "@/components/financas/extrato/DiasDoExtrato";
import { ImprimirExtratoDialog } from "@/components/financas/extrato/ImprimirExtratoDialog";
import { Assinaturas, CabecalhoDeRelatorio, CaixaDeResumo, RodapeDeRelatorio, TituloDeRelatorio } from "@/components/financas/relatorio/RelatorioKit";
import { useAcoesLancamento } from "@/hooks/useAcoesLancamento";
import { ROLES_FINANCEIRO } from "@/components/layout/navConfig";
import { mensagemErro } from "@/lib/erroRede";
import { CONTA_NAO_APLICAVEL_ID } from "@/lib/quitacao";
import { buscarLancamentoParaEditar } from "@/services/fechamentoMensalService";
import { quitacaoDaObrigacao, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import {
  brl, buscarVencimentoPorId, downloadCSV, listarCategoriasTodas, listarCentrosCustoTodas, listarContas, listarFornecedores, listarProjetosTodos,
  type FinCategoria, type FinCentroCusto, type FinConta, type FinFornecedor, type FinProjeto,
} from "@/services/finService";
import { carregarExtratoDeObrigacoes } from "@/services/extratoDeObrigacoesService";
import {
  CABECALHO_DO_EXTRATO, OPCOES_DE_SITUACAO, ROTULO_SEM_CONTA, acoesDaObrigacao, agruparPorDia, contagemPorConta, dataDoExtrato, filtrarPorConta, filtrarPorSituacao, gerarCSVDoExtrato,
  resumoDoExtrato, seloDaSituacao, type FiltroDeSituacao, type LinhaDoExtrato,
} from "@/lib/extratoDeObrigacoes";
import { CAMPOS_DA_TELA, MODELOS_DE_IMPRESSAO, guardarPerfil, perfilGuardado, type PerfilDeImpressao } from "@/lib/perfilDeImpressaoDoExtrato";
import { gerarXlsx, serialDoExcel, type Celula } from "@/lib/xlsxSimples";
import { hojeLocal, toYmd } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const TODOS = "__todos__";

/** Um filtro "Todos/Todas ou um item". Declarado FORA da tela: dentro dela seria um componente novo a cada renderização e remontaria os seletores. */
function Filtro({ rotulo, valor, onChange, itens, todos, destaque }: { rotulo: string; valor: string; onChange: (v: string) => void; itens: { id: string; nome: string }[]; todos: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`text-2xs mb-0.5 ${destaque ? "font-bold text-gold-text" : "text-muted-foreground"}`}>{rotulo}</p>
      <Select value={valor || TODOS} onValueChange={v => onChange(v === TODOS ? "" : v)}>
        <SelectTrigger className={`h-8 text-xs ${destaque ? "border-gold ring-2 ring-gold/15" : ""}`}><SelectValue placeholder={todos} /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={TODOS}>{todos}</SelectItem>
          {itens.map(i => <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * As ações da linha — o que existe vem de `acoesDaObrigacao` (lib), que carrega a regra por situação; AQUI só se decide o que fica à vista (revisão de 20/10/2026: os cinco botões
 * disputavam o espaço com o que importa — fornecedor, valor, situação, atraso, projeto, quem pagou).
 *   · à vista: o botão que mexe no dinheiro (Pagar agora / Pagar reembolso) e, onde a Documentação é o centro da decisão (terceiro e reembolso), ela também;
 *   · "⋯ Mais ações": Visualizar, Editar, Documentação (quando não está à vista) e Corrigir quitação. O nome do fornecedor também abre o detalhe.
 * Fora da tela para não remontar a cada renderização.
 */
function AcoesDaLinha({ l, podeOperar, ocupada, onVisualizar, onEditar, onPagar, onPagarReembolso, onDocumentacao, onCorrigirQuitacao }: {
  l: LinhaDoExtrato; podeOperar: boolean; ocupada: boolean;
  onVisualizar: () => void; onEditar: () => void; onPagar: () => void; onPagarReembolso: () => void; onDocumentacao: () => void; onCorrigirQuitacao: () => void;
}) {
  const a = acoesDaObrigacao(l);
  const quem = l.fornecedor || l.descricao || "obrigação";
  const btn = "h-7 gap-1 px-2 text-xs whitespace-nowrap";
  const centroDaDecisao = l.situacao === "quitada_por_terceiro" || l.situacao === "reembolso";
  const pagarAgora = a.pagar === "normal" && podeOperar;
  const pagarReembolso = a.pagar === "reembolso" && podeOperar;
  // a Documentação fica à vista nas de terceiro/reembolso: com o rótulo quando é a ação principal (não há o que pagar), só o clipe quando ao lado do Pagar
  const docComRotulo = centroDaDecisao && !pagarReembolso;
  const docAVista = a.documentacao && centroDaDecisao;
  return (
    <div className="flex items-center gap-1">
      {pagarAgora && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagar} aria-label={`Pagar agora — ${quem}`} title="Pagar agora">
          {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}<span className="hidden lg:inline">Pagar agora</span>
        </Button>
      )}
      {pagarReembolso && (
        <Button size="sm" variant="success" className={btn} disabled={ocupada} onClick={onPagarReembolso} aria-label={`Pagar reembolso — ${quem}`} title="Pagar reembolso">
          {ocupada ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}<span className="hidden lg:inline">Pagar reembolso</span>
        </Button>
      )}
      {docAVista && (
        <Button size="sm" variant={docComRotulo ? "default" : "outline"} className={docComRotulo ? btn : "h-7 w-7 p-0"} disabled={ocupada} onClick={onDocumentacao}
          aria-label={`Documentação de ${quem}`} title="Documentação">
          <Paperclip className="w-3.5 h-3.5" />{docComRotulo && <span className="hidden lg:inline">Documentação</span>}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" aria-label={`Mais ações de ${quem}`} title="Mais ações" disabled={ocupada}>
            {ocupada && !pagarAgora && !pagarReembolso ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[11rem]">
          {a.visualizar && <DropdownMenuItem onSelect={onVisualizar}><Eye className="w-3.5 h-3.5" /> Visualizar</DropdownMenuItem>}
          {a.editar && podeOperar && <DropdownMenuItem onSelect={onEditar}><Pencil className="w-3.5 h-3.5" /> Editar</DropdownMenuItem>}
          {a.documentacao && !docAVista && <DropdownMenuItem onSelect={onDocumentacao}><Paperclip className="w-3.5 h-3.5" /> Documentação</DropdownMenuItem>}
          {a.corrigirQuitacao && podeOperar && <DropdownMenuItem onSelect={onCorrigirQuitacao}><ShieldCheck className="w-3.5 h-3.5" /> Corrigir quitação</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
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
  const contaId = params.get("conta") || "";
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
  const [contas, setContas] = useState<FinConta[]>([]);
  // celular: os filtros recolhem atrás de "Filtros" (a faixa de contas e os filtros ativos continuam à vista)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // impressão: o modelo e os campos, lembrados neste navegador
  const [perfil, setPerfil] = useState<PerfilDeImpressao>(() => perfilGuardado());
  const [imprimindo, setImprimindo] = useState(false);
  // o cabeçalho do dia fica preso logo abaixo da barra de filtros: precisa saber a altura dela
  const barraRef = useRef<HTMLDivElement>(null);
  const [barraAltura, setBarraAltura] = useState(0);
  useLayoutEffect(() => {
    const medir = () => setBarraAltura(barraRef.current?.offsetHeight ?? 0);
    medir();
    const o = typeof ResizeObserver !== "undefined" && barraRef.current ? new ResizeObserver(medir) : null;
    if (o && barraRef.current) o.observe(barraRef.current);
    window.addEventListener("resize", medir);
    return () => { o?.disconnect(); window.removeEventListener("resize", medir); };
  }, []);

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
    Promise.all([listarFornecedores("", true), listarCategoriasTodas(), listarCentrosCustoTodas(), listarProjetosTodos(), listarContas(true)])
      .then(([f, c, cc, p, k]) => { setFornecedores(f); setCategorias(c.filter(x => x.tipo === "saida")); setCentros(cc); setProjetos(p); setContas(k); })
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

  // o filtro de Conta age sobre o que JÁ foi lido (e não no banco): assim o número ao lado de cada conta é verdadeiro mesmo com outra conta escolhida
  const daSituacao = useMemo(() => filtrarPorSituacao(linhas, situacao), [linhas, situacao]);
  const visiveis = useMemo(() => filtrarPorConta(daSituacao, contaId), [daSituacao, contaId]);
  const resumo = useMemo(() => resumoDoExtrato(visiveis), [visiveis]);
  const dias = useMemo(() => agruparPorDia(visiveis), [visiveis]);
  const porConta = useMemo(() => contagemPorConta(daSituacao), [daSituacao]);

  const itensDeConta = useMemo(() => [
    ...contas.filter(c => c.id !== CONTA_NAO_APLICAVEL_ID).map(c => ({ id: c.id, nome: `${c.nome} (${porConta.get(c.id) ?? 0})` })),
    { id: CONTA_NAO_APLICAVEL_ID, nome: `${ROTULO_SEM_CONTA} — pagas por terceiros (${porConta.get(CONTA_NAO_APLICAVEL_ID) ?? 0})` },
  ], [contas, porConta]);
  const nomeDaConta = contaId === CONTA_NAO_APLICAVEL_ID ? ROTULO_SEM_CONTA : contas.find(c => c.id === contaId)?.nome ?? "";

  const nomeDe = <T extends { id: string; nome: string }>(lista: T[], id: string) => lista.find(x => x.id === id)?.nome ?? "";
  const rotuloDaSituacao = OPCOES_DE_SITUACAO.find(o => o.valor === situacao)?.rotulo.trim() ?? "";
  // os filtros ativos: viram chips na tela (cada um com ✕) e uma linha de texto no papel
  const ativos: { chave: string; param: string; texto: string }[] = [
    contaId && { chave: "conta", param: "conta", texto: `Conta: ${nomeDaConta}` },
    situacao !== "todas" && { chave: "situacao", param: "situacao", texto: `Situação: ${rotuloDaSituacao}` },
    fornecedorId && { chave: "fornecedor", param: "fornecedor", texto: `Fornecedor: ${nomeDe(fornecedores, fornecedorId)}` },
    categoriaId && { chave: "categoria", param: "categoria", texto: `Categoria: ${nomeDe(categorias, categoriaId)}` },
    centroId && { chave: "centro", param: "centro", texto: `Centro de custo: ${nomeDe(centros, centroId)}` },
    projetoId && { chave: "projeto", param: "projeto", texto: `Projeto: ${nomeDe(projetos, projetoId)}` },
  ].filter(Boolean) as { chave: string; param: string; texto: string }[];
  const filtrosEmTexto = ativos.map(a => a.texto);
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
        seloDaSituacao(l).rotulo, l.responsavel, l.intencao, l.diasEmAtraso === null ? null : { v: l.diasEmAtraso, estilo: "inteiro" }, l.conta,
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
        { nome: "Obrigações", linhas: [...topo, cab, ...dados, total], larguras: [11, 28, 14, 34, 22, 22, 18, 15, 20, 26, 18, 10, 22], linhaDoCabecalho: topo.length },
        {
          nome: "Resumo", larguras: [38, 12, 16],
          linhas: [
            [{ v: "RESUMO", estilo: "titulo" }], [`Período: ${periodoEmTexto}`], [],
            [{ v: "Situação", estilo: "cabecalho" }, { v: "Quantidade", estilo: "cabecalho" }, { v: "Valor", estilo: "cabecalho" }],
            [{ v: "Total (valor sem canceladas)", estilo: "negrito" }, { v: resumo.quantidade, estilo: "inteiro" }, { v: resumo.valorTotal, estilo: "moedaNegrito" }],
            parte("Pagas (inclui reembolsos pagos)", resumo.pagas.quantidade, resumo.pagas.valor),
            parte("Em aberto (inclui reembolsos a pagar)", resumo.emAberto.quantidade, resumo.emAberto.valor),
            parte("   das quais vencidas", resumo.vencidas.quantidade, resumo.vencidas.valor),
            parte("   dos quais reembolsos a pagar", resumo.reembolsosPendentes.quantidade, resumo.reembolsosPendentes.valor),
            parte("Quitadas por terceiros", resumo.quitadasPorTerceiros.quantidade, resumo.quitadasPorTerceiros.valor),
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

  /** Escolhido o modelo no diálogo: guarda a escolha, fecha o diálogo e abre a impressão do navegador (o papel já está montado com os campos do modelo). */
  function gerarPdf() {
    guardarPerfil(perfil);
    setImprimindo(false);
    window.setTimeout(() => window.print(), 150);
  }

  const resumoPecas = [
    { rotulo: "Total de obrigações", valor: resumo.quantidade, detalhe: brl(resumo.valorTotal) },
    { rotulo: "Total pago", valor: brl(resumo.pagas.valor), detalhe: `${resumo.pagas.quantidade} ${resumo.pagas.quantidade === 1 ? "obrigação" : "obrigações"}`, tom: "sucesso" as const },
    { rotulo: "Total em aberto", valor: brl(resumo.emAberto.valor), tom: "aviso" as const, destaque: resumo.emAberto.quantidade > 0,
      detalhe: `${resumo.emAberto.quantidade} ${resumo.emAberto.quantidade === 1 ? "obrigação" : "obrigações"}${resumo.vencidas.quantidade > 0 ? ` · ${resumo.vencidas.quantidade} vencida${resumo.vencidas.quantidade === 1 ? "" : "s"} (${brl(resumo.vencidas.valor)})` : ""}` },
    { rotulo: "Reembolsos pendentes", valor: brl(resumo.reembolsosPendentes.valor), detalhe: `${resumo.reembolsosPendentes.quantidade} a pagar`, tom: "reembolso" as const, destaque: resumo.reembolsosPendentes.quantidade > 0 },
    { rotulo: "Quitadas por terceiros", valor: brl(resumo.quitadasPorTerceiros.valor), detalhe: `${resumo.quitadasPorTerceiros.quantidade} ${resumo.quitadasPorTerceiros.quantidade === 1 ? "compra" : "compras"}`, tom: "terceiro" as const },
    { rotulo: "Canceladas", valor: resumo.canceladas.quantidade, detalhe: "não entram no valor total", tom: "mudo" as const },
  ];

  return (
    <div className="bg-background min-h-screen">
      <style>{`
        .so-impressao { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 1.1cm 1.2cm 1.5cm; }
          .so-impressao { display: block !important; }
          .relatorio-page { font-size: 11px; }
        }
      `}</style>

      {/* Barra de controles e filtros */}
      <div ref={barraRef} className="no-print sticky top-0 z-10 bg-card border-b">
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
              <Button variant="gold" onClick={() => setImprimindo(true)} size="sm" disabled={carregando} className="gap-1.5">
                <Printer className="w-3.5 h-3.5" /> PDF / Imprimir
              </Button>
            </div>
          </div>

          {/* celular: a faixa de contas fica sempre à vista (é o filtro mais usado) e o resto recolhe em "Filtros" */}
          <div className="md:hidden">
            <div role="group" aria-label="Conta" className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: "", nome: "Todas" }, ...contas.filter(c => c.id !== CONTA_NAO_APLICAVEL_ID).map(c => ({ id: c.id, nome: c.nome })), { id: CONTA_NAO_APLICAVEL_ID, nome: "Sem conta" }].map(c => (
                <button key={c.id || "todas"} type="button" aria-pressed={contaId === c.id} onClick={() => mudar({ conta: c.id })}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs ${contaId === c.id ? "border-gold bg-gold font-semibold text-gold-foreground" : "bg-card"}`}>{c.nome}</button>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" className="mt-1 h-7 gap-1.5 text-xs" aria-expanded={filtrosAbertos} onClick={() => setFiltrosAbertos(a => !a)}>
              <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros{ativos.length > 0 ? ` (${ativos.length})` : ""}
            </Button>
          </div>

          <div className={`${filtrosAbertos ? "grid" : "hidden"} md:grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 items-end`}>
            <div className="min-w-0"><p className="text-2xs text-muted-foreground mb-0.5">Data inicial</p><CampoData value={de} onChange={v => v && mudar({ inicio: v })} /></div>
            <div className="min-w-0"><p className="text-2xs text-muted-foreground mb-0.5">Data final</p><CampoData value={ate} onChange={v => v && mudar({ fim: v })} /></div>
            <div className="min-w-0">
              <p className="text-2xs text-muted-foreground mb-0.5">Situação</p>
              <Select value={situacao} onValueChange={v => mudar({ situacao: v === "todas" ? "" : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{OPCOES_DE_SITUACAO.map(o => <SelectItem key={o.valor} value={o.valor}><span className="whitespace-pre">{o.rotulo}</span></SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Filtro rotulo="CONTA" destaque valor={contaId} onChange={v => mudar({ conta: v })} itens={itensDeConta} todos="Todas as contas" />
            <Filtro rotulo="Fornecedor" valor={fornecedorId} onChange={v => mudar({ fornecedor: v })} itens={fornecedores} todos="Todos" />
            <Filtro rotulo="Categoria" valor={categoriaId} onChange={v => mudar({ categoria: v })} itens={categorias} todos="Todas" />
            <Filtro rotulo="Centro de custo" valor={centroId} onChange={v => mudar({ centro: v })} itens={centros} todos="Todos" />
            <Filtro rotulo="Projeto" valor={projetoId} onChange={v => mudar({ projeto: v })} itens={projetos} todos="Todos" />
          </div>

          {ativos.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
              {ativos.map(a => (
                <span key={a.chave} className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold-text">
                  {a.texto}
                  <button type="button" aria-label={`Remover o filtro ${a.texto}`} onClick={() => mudar({ [a.param]: "" })} className="rounded-full p-0.5 hover:bg-gold/20"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <Button type="button" size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={() => mudar({ conta: "", situacao: "", fornecedor: "", categoria: "", centro: "", projeto: "" })}>Limpar filtros</Button>
            </div>
          )}
        </div>
      </div>

      {carregando && linhas.length === 0 ? <PaginaSkeleton /> : (
        <div className="relatorio-page max-w-5xl mx-auto bg-white text-foreground p-4 md:p-8 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
          <CabecalhoDeRelatorio emitidoPor={emitidoPor} />

          <TituloDeRelatorio rotulo="▤ Extrato de obrigações" titulo={periodoEmTexto}
            subtitulo={<>{resumo.quantidade} obrigaç{resumo.quantidade === 1 ? "ão" : "ões"} · pagas pela igreja, reembolsadas ou quitadas por terceiros</>} />

          {erro && <p role="alert" className="no-print rounded-md border border-destructive-line bg-destructive-soft px-3 py-2 text-sm text-destructive-text mb-4">{erro}</p>}

          <CaixaDeResumo rotulo="Resumo" pecas={resumoPecas} />
          <p className="text-[11px] text-muted-foreground mb-1">O valor total não inclui as canceladas; "Em aberto" é o que ainda falta pagar (inclui pagamentos parciais e reembolsos a pagar). Os dias são pelo vencimento.</p>
          <p className="text-[11px] text-muted-foreground mb-3">
            Conta: <b className="text-foreground">{nomeDaConta || "Todas"}</b>{filtrosEmTexto.filter(t => !t.startsWith("Conta:")).map(t => <span key={t}> · {t}</span>)} · Período: <b className="text-foreground">{periodoEmTexto}</b>
            <span className="hidden print:inline"> · modelo <b className="text-foreground">{perfil.modelo === "personalizado" ? "Personalizado" : MODELOS_DE_IMPRESSAO[perfil.modelo].rotulo}</b></span>
          </p>

          {visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-8 text-center">
              {carregando ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Nenhuma obrigação neste período, com estes filtros."}
            </p>
          ) : (
            <>
              {/* NA TELA: todos os campos e as ações; o cabeçalho de cada dia fica preso abaixo da barra de filtros */}
              <div className="no-print" data-visao="tela">
                {dias.map(d => (
                  <DiaDoExtratoBloco key={d.data} dia={d} campos={CAMPOS_DA_TELA} topoFixo={barraAltura} onAbrir={l => void visualizar(l)}
                    renderAcoes={l => (
                      <AcoesDaLinha l={l} podeOperar={podeOperar} ocupada={ocupado === l.obrigacaoId}
                        onVisualizar={() => void visualizar(l)} onEditar={() => void editar(l)} onPagar={() => void pagarAgora(l)}
                        onPagarReembolso={() => void pagarReembolso(l)} onDocumentacao={() => void documentacao(l)} onCorrigirQuitacao={() => void corrigirQuitacao(l)} />
                    )} />
                ))}
              </div>
              {/* NO PAPEL: só os campos do modelo escolhido, sem botão nenhum */}
              <div className="so-impressao" data-visao="papel">
                {dias.map(d => <DiaDoExtratoBloco key={d.data} dia={d} campos={perfil.campos} anexosZero />)}
              </div>
              <div className="avoid-break mt-3 flex items-baseline justify-between border-t-2 border-gold-text bg-gold/5 px-2 py-1.5 font-bold" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
                <span className="text-xs tracking-wide">TOTAL (sem canceladas)</span><span className="tabular-nums">{brl(resumo.valorTotal)}</span>
              </div>
              {perfil.campos.assinaturas && <div className="so-impressao"><Assinaturas /></div>}
            </>
          )}

          <RodapeDeRelatorio />

          {/* Os fluxos de sempre, montados uma vez: pagar (documento, Pix/QR, liquidação, comprovante) · detalhe · documentação · edição · pagar reembolso · corrigir quitação */}
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
            <ImprimirExtratoDialog aberto={imprimindo} onFechar={() => setImprimindo(false)} perfil={perfil} onMudar={setPerfil} onImprimir={gerarPdf} />
          </div>
        </div>
      )}
    </div>
  );
}
