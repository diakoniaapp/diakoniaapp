import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampoData } from "@/components/CampoData";
import {
  ArrowLeft, DollarSign, Loader2, Plus, Search, Filter,
  TrendingUp, TrendingDown, Pencil, Trash2, Paperclip,
  CheckCircle2, Clock, XCircle, Scale, FileUp, Printer, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentosSemTeto, excluirLancamento, excluirLancamentosEmLote, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL, listarContas,
  conciliarLancamento, desconciliarLancamento, conciliarEmLote,
  type FinConta, type FinLancamentoExtenso, type FinMovimentoTipo, type FinStatus,
  STATUS_LABEL,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { saldoAcumuladoAntesDe } from "@/services/prestacaoContasService";
import { ImportacaoOmieDialog } from "@/components/financas/ImportacaoOmieDialog";
import { ImportacaoFaturaDialog } from "@/components/financas/ImportacaoFaturaDialog";
import { ArrowRightLeft } from "lucide-react";
import { PaginaSkeleton } from "@/components/ListState";
import { toYmd } from "@/lib/data";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const STATUS_COR: Record<FinStatus, string> = {
  realizado:  "text-foreground",
  conciliado: "text-success-text",
  previsto:   "text-warning-text",
  cancelado:  "text-muted-foreground line-through",
  aguardando_aprovacao: "text-info-text",
};

const STATUS_ICONE: Record<FinStatus, JSX.Element> = {
  realizado:  <CheckCircle2 className="w-3 h-3" />,
  conciliado: <CheckCircle2 className="w-3 h-3 text-success-text" />,
  previsto:   <Clock className="w-3 h-3 text-warning-text" />,
  cancelado:  <XCircle className="w-3 h-3 text-muted-foreground" />,
  aguardando_aprovacao: <Clock className="w-3 h-3 text-info-text" />,
};

export default function FinancasConta() {
  const { contaId = "" } = useParams();
  const navigate = useNavigate();
  // Persistência de filtros (item 4, "PRIORIDADE MÁXIMA" 22/09/2026):
  // escolhida a URL (query params), não localStorage nem só state em
  // memória. Motivo: trocar de conta pelo seletor (item 3) NÃO desmonta
  // este componente — mesma rota `/financas/conta/:contaId`, o React
  // Router só troca o param — então o `useState` já sobrevive sozinho à
  // troca de conta sem ajuda nenhuma. O que o `useState` sozinho NÃO
  // sobrevive é um F5 (atualizar) ou sair da tela e voltar (desmonta de
  // verdade) — casos que o pedido também cobre ("atualizar, retornar à
  // tela"). Guardar na URL resolve os dois: F5 relê os mesmos params, e
  // é o padrão mais simples que não precisa de storage nenhum (localStorage
  // vazaria filtro de uma conta pra outra aba/sessão sem relação).
  const [searchParams, setSearchParams] = useSearchParams();
  const [conta, setConta] = useState<FinConta | null>(null);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  // "transferencia" não é um `FinMovimentoTipo` (transferência grava uma
  // perna entrada e outra saída) — pedido da Telma em 15/09/2026 pra
  // filtrar só essas pernas, então o Select trata como uma 4ª opção que
  // vira `apenasTransferencia` em `listarLancamentos`, não `tipo`.
  const [filtroTipo, setFiltroTipo] = useState<FinMovimentoTipo | "transferencia" | "todos">(
    () => (searchParams.get("tipo") as any) || "todos",
  );
  const [busca, setBusca] = useState(() => searchParams.get("busca") ?? "");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const [transfOpen, setTransfOpen] = useState(false);
  const [ofxOpen, setOfxOpen] = useState(false);
  const [omieOpen, setOmieOpen] = useState(false);
  const [faturaOpen, setFaturaOpen] = useState(false);
  // Conciliação manual (item 6 do roadmap do ERP): seleção só de
  // `realizado` — não faz sentido conciliar algo que ainda não aconteceu
  // (previsto), que foi cancelado, ou que ainda espera aprovação.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conciliando, setConciliando] = useState(false);
  // `confirm()` nativo não funciona em WebView (Risco 3 do CLAUDE.md) —
  // devolve falso sem perguntar, então o código lia "cancelou" e a
  // lixeira parecia simplesmente não fazer nada. Achado ao vivo pela
  // Telma ("a lixeira não funciona") em 13/09/2026.
  const [apagando, setApagando] = useState<FinLancamentoExtenso | null>(null);
  const [excluindoBusy, setExcluindoBusy] = useState(false);
  // Exclusão em massa (item 2) — confirmação ÚNICA pro lote inteiro, não
  // um `AlertDialog` por linha. `apagandoLote` guarda só a CONTAGEM (não
  // precisa dos objetos inteiros) pro texto de confirmação.
  const [apagandoLote, setApagandoLote] = useState(false);
  const [excluindoLoteBusy, setExcluindoLoteBusy] = useState(false);
  // Saldo real da conta um instante antes de "Data inicial" — âncora da
  // coluna "Saldo" (acumulado), pedido da Telma pra bater com o jeito que
  // um extrato de banco/Omie de verdade se lê. Reaproveita a mesma conta
  // de `prestacaoContasService.saldoAcumuladoAntesDe` (soma saldo_inicial
  // da conta + movimento realizado/conciliado antes da data).
  const [saldoAntesDoPeriodo, setSaldoAntesDoPeriodo] = useState(0);

  // Altura real da faixa fixa (barra de ferramentas + filtros + resumo) —
  // medida em runtime porque o conteúdo dela muda de altura sozinho
  // (o `flex-wrap` da barra de botões quebra linha em telas estreitas, e
  // o card de filtros também muda de 2 pra 5 colunas). Um `top` fixo em
  // pixel quebraria em algum desses casos; `ResizeObserver` mede a altura
  // de verdade a cada mudança e o cabeçalho da tabela (`<thead>`) usa esse
  // valor como o próprio `top` do seu sticky, colando logo abaixo da
  // faixa em vez de rolar escondido atrás dela. Pedido da Telma
  // (16/09/2026): "aumente a faixa fixa para aparecer o título do
  // extrato" — antes só a faixa de cima ficava fixa; a linha
  // Situação/Data/Descrição.../Saldo rolava junto com os lançamentos.
  //
  // `useState` no lugar de `useRef` pro nó — um `ref={faixaFixaRef}` com
  // `useRef` comum some no primeiro `if (loading && !conta) return
  // <PaginaSkeleton />` (a div da faixa fixa só existe no JSX de baixo,
  // que só monta depois de `conta` carregar) — o `useEffect([])` de
  // montagem já tinha rodado E TERMINADO com `faixaFixaRef.current`
  // ainda `null` naquele instante, e como as dependências são `[]`, ele
  // nunca roda de novo quando a div de verdade aparece. Um "callback
  // ref" guardado em estado dispara de novo toda vez que o nó DOM muda
  // (inclusive de `null` pra montado, no exato momento em que o
  // skeleton vira a tela real) — achado ao vivo (thead sticky com
  // `top: 0px`, escondido atrás da faixa de cima, altura nunca saía
  // de 0).
  const [faixaFixaEl, setFaixaFixaEl] = useState<HTMLDivElement | null>(null);
  const [alturaFaixaFixa, setAlturaFaixaFixa] = useState(0);
  useEffect(() => {
    if (!faixaFixaEl) return;
    const medir = () => setAlturaFaixaFixa(faixaFixaEl.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(faixaFixaEl);
    return () => ro.disconnect();
  }, [faixaFixaEl]);

  // Período do filtro — mês atual por default. `toYmd` (não
  // `.toISOString().slice(0,10)`) — essa última converte pra UTC antes de
  // formatar, e lia o mês errado pertinho da virada (ver src/lib/data.ts).
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(
    () => searchParams.get("de") ?? toYmd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
  );
  const [dataFim, setDataFim] = useState(
    () => searchParams.get("ate") ?? toYmd(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  );
  // Telma reportou ao vivo (17/09/2026), na conta "Caixinha
  // Administrativo", em três rodadas: (1) "eu clico para alterar e ela
  // leva para meses que eu nao digitei" — o `min` dinâmico e o
  // cruzamento entre os dois campos; (2) mesmo corrigido isso, "continua
  // com erro para DIGITAR a data; está funcionando apenas se escolher no
  // ícone do calendário" — o teclado do `<input type="date">` nativo é
  // quem falha no WebView, não a lógica; (3) depois de trocar tudo pro
  // calendário em popover (sem `<input>` nenhum), "quero a opção de
  // digitar + a opção de escolher pelo calendário, como estava antes, mas
  // obedecendo a digitação, sem bugs" — tirar a digitação resolvia o
  // sintoma mas não era o que ela queria. `CampoData`
  // (components/CampoData.tsx) resolve as três: campo de texto com
  // máscara (não o `<input type="date">` nativo problemático) + botão de
  // calendário ao lado, e digitar de fato funciona.
  // Se a ordem sair invertida (final antes de inicial), a consulta abaixo
  // troca os dois só na hora de buscar — nenhum campo precisa mudar sozinho.
  const inicioEfetivo = dataInicio <= dataFim ? dataInicio : dataFim;
  const fimEfetivo = dataInicio <= dataFim ? dataFim : dataInicio;

  useEffect(() => { carregar(); }, [contaId, filtroTipo, inicioEfetivo, fimEfetivo, busca]);

  // Espelha os filtros na URL (`replace`, não empilha histórico a cada
  // tecla digitada) — é isso que sobrevive a F5 e a sair/voltar pra tela.
  useEffect(() => {
    const params = new URLSearchParams();
    if (filtroTipo !== "todos") params.set("tipo", filtroTipo);
    if (busca) params.set("busca", busca);
    params.set("de", dataInicio);
    params.set("ate", dataFim);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, busca, dataInicio, dataFim]);

  // Lista de contas pro seletor rápido (item 3) — carregada uma vez só,
  // não depende de `contaId`, e já vem ordenada por `ordem`/`nome`
  // (`listarContas`, item 6).
  useEffect(() => { listarContas().then(setContas); }, []);

  // Trocar de conta pelo seletor: preserva os filtros atuais na URL nova
  // (item 4 pedia isso nominalmente — "ao trocar de conta"). Como é a
  // MESMA rota (`/financas/conta/:contaId`), o React Router não desmonta
  // o componente, e o `useState` dos filtros já sobrevive sozinho; ainda
  // assim carrega a querystring atual explicitamente pra já nascer certa
  // na primeira renderização com o novo `contaId`.
  function trocarConta(novoContaId: string) {
    if (novoContaId === contaId) return;
    setSelecionados(new Set());
    navigate(`/financas/conta/${novoContaId}${window.location.search}`);
  }

  async function carregar() {
    if (!contaId) return;
    setLoading(true);
    try {
      const [c, ls, saldoAntes] = await Promise.all([
        carregarConta(contaId),
        // `listarLancamentos` (teto de 300) até 16/09/2026: os cartões
        // "Entradas"/"Saídas"/"Movimento do período" somam em memória a
        // partir desta mesma lista — um período largo (ou "todas as
        // contas" não, mas uma conta corrida de anos) já passa de 300 e os
        // cartões ficariam contando só os lançamentos mais recentes, não o
        // período inteiro. Mesmo bug achado e corrigido em
        // `gerarPrestacaoContas`.
        listarLancamentosSemTeto({
          contaId,
          tipo: filtroTipo !== "todos" && filtroTipo !== "transferencia" ? filtroTipo : undefined,
          apenasTransferencia: filtroTipo === "transferencia" ? true : undefined,
          dataInicio: inicioEfetivo, dataFim: fimEfetivo,
          busca: busca.length >= 2 ? busca : undefined,
        }),
        saldoAcumuladoAntesDe(inicioEfetivo, contaId),
      ]);
      setConta(c);
      setLancamentos(ls);
      setSaldoAntesDoPeriodo(saldoAntes);
    } finally { setLoading(false); }
  }

  async function abrirComprovante(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Não foi possível abrir o comprovante");
  }

  // `AlertDialogAction` é um `DialogPrimitive.Close` por baixo — fecha o
  // diálogo no clique, SÍNCRONO, antes de qualquer `await` deste handler
  // rodar (achado numa revisão em 13/09/2026, confirmado lendo o código-
  // fonte do Radix: `onClick` do Action é `composeEventHandlers(onClick, ()
  // => context.onOpenChange(false))`). Sem o `preventDefault()`, um erro na
  // exclusão (RLS barrando, rede) mostra o toast com o diálogo já fechado —
  // parece que funcionou. `preventDefault()` pula esse close automático
  // (Radix checa `event.defaultPrevented`); o fecho de verdade continua
  // sendo `setApagando(null)`, só que agora depois do resultado.
  async function confirmarExcluir(e: React.MouseEvent) {
    e.preventDefault();
    if (!apagando) return;
    setExcluindoBusy(true);
    try {
      await excluirLancamento(apagando.id);
      toast.success("Excluído");
      setApagando(null);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setExcluindoBusy(false); }
  }

  /** Alterna um lançamento entre realizado e conciliado — clique direto
      no selo de situação. Reversível: bater errado tem volta. */
  async function alternarConciliacao(l: FinLancamentoExtenso) {
    try {
      if (l.status === "conciliado") await desconciliarLancamento(l.id);
      else await conciliarLancamento(l.id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  function alternarSelecao(id: string) {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  // Conciliar só faz sentido pra quem já `realizado` (mesma regra de
  // sempre — não dá pra "bater com o extrato" algo previsto/cancelado/
  // aguardando aprovação). A seleção agora aceita QUALQUER linha (item 2
  // pediu seleção geral, pra também poder excluir em massa), então este
  // botão manda só o subconjunto conciliável da seleção — não o que
  // estiver marcado que não seja `realizado`.
  // `lancamentos` (não `lancamentosOrdenados`, que só existe depois de
  // `conta` carregar) — a ordem não importa aqui, só quais ids.
  const selecionadosConciliaveis = lancamentos
    .filter(l => selecionados.has(l.id) && l.status === "realizado")
    .map(l => l.id);

  async function conciliarSelecionados() {
    if (selecionadosConciliaveis.length === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(selecionadosConciliaveis);
      const n = selecionadosConciliaveis.length;
      toast.success(`${n} lançamento${n > 1 ? "s" : ""} conciliado${n > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setConciliando(false); }
  }

  async function confirmarExcluirSelecionados(e: React.MouseEvent) {
    e.preventDefault(); // mesmo motivo do `confirmarExcluir` acima — AlertDialogAction fecha antes do await
    if (selecionados.size === 0) return;
    setExcluindoLoteBusy(true);
    try {
      const ids = Array.from(selecionados);
      await excluirLancamentosEmLote(ids);
      toast.success(`${ids.length} lançamento${ids.length > 1 ? "s" : ""} excluído${ids.length > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      setApagandoLote(false);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setExcluindoLoteBusy(false); }
  }

  function alternarSelecionarTodos() {
    setSelecionados(prev => {
      const todosIds = lancamentosOrdenados.map(l => l.id);
      const todosMarcados = todosIds.length > 0 && todosIds.every(id => prev.has(id));
      return todosMarcados ? new Set() : new Set(todosIds);
    });
  }

  if (loading && !conta) {
    return <PaginaSkeleton />;
  }
  if (!conta) {
    return <div className="p-8 text-center text-muted-foreground">
      Conta não encontrada. <Link to="/financas" className="text-primary underline">Voltar</Link>
    </div>;
  }

  // Compute saldo anterior (do período)
  const totalEntradasPeriodo = lancamentos.filter(l => l.tipo === "entrada" && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidasPeriodo  = lancamentos.filter(l => l.tipo === "saida"   && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);

  // `listarLancamentos` busca do mais recente pro mais antigo (padrão do
  // serviço, usado por várias telas) — aqui na tela do extrato, a Telma
  // pediu ordem cronológica (mais antigo primeiro), igual o extrato do
  // Omie/banco de verdade lê. Reordenado só pra EXIBIÇÃO, sem mudar
  // `listarLancamentos` (que outras telas usam esperando a ordem atual).
  //
  // Na MESMA data, entrada vem antes de saída — pedido da Telma
  // (15/09/2026): no Cartão de Crédito, a transferência do Bradesco
  // chega no mesmo dia das despesas que ela paga, e ordenar só por
  // `created_at` podia mostrar a despesa antes da transferência que a
  // cobre — o saldo acumulado da linha (`saldoPorLancamento` abaixo)
  // mostrava um mergulho negativo artificial no meio do dia que nunca
  // existiu de verdade. Cobre transferência também: a perna que RECEBE é
  // sempre `tipo: "entrada"`, então ordenar por tipo já basta, sem
  // precisar checar `origem` à parte.
  const lancamentosOrdenados = [...lancamentos].sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    if (a.tipo !== b.tipo) return a.tipo === "entrada" ? -1 : 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  // Saldo acumulado por linha — só realizado/conciliado mexe no saldo
  // (previsto/cancelado/aguardando aprovação não aconteceram de verdade
  // ainda, mesma regra de `fin_recalc_saldo_conta` no banco). Com filtro
  // de tipo ou busca ativo, a coluna passa a acumular só o que está
  // filtrado — não é mais o saldo real da conta linha a linha, é só a
  // soma do que apareceu na tela; aceitável, não escondido, mas vale
  // saber se um dia isso confundir.
  let acumulado = saldoAntesDoPeriodo;
  const saldoPorLancamento = new Map<string, number>();
  for (const l of lancamentosOrdenados) {
    if (l.status === "realizado" || l.status === "conciliado") {
      acumulado += l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor);
    }
    saldoPorLancamento.set(l.id, acumulado);
  }

  return (
    <div className="relatorio-page p-3 md:p-5 max-w-7xl mx-auto space-y-3 print:max-w-full print:p-0">
      {/* Impressão — refeita em 15/09/2026 ("melhore a visualização do pdf
          de impressão... não está bom"). A primeira versão só marcava
          `print:hidden`/`print:block` DENTRO desta página e confiava que o
          resto cuidaria de si — não cuidava: o menu lateral do AppLayout
          nunca escondia (ia inteiro pro papel), e o `<main>` que envolve
          `<Outlet/>` tem `overflow-y-auto` dentro de um `h-screen
          overflow-hidden` — impressão não expande scroll, então só saía a
          página inteira que já cabia visível na tela, cortando o resto do
          extrato. A correção usa o mesmo padrão já comprovado em
          `FinancasRelatorio.tsx`: `.relatorio-page` escapa do layout via
          `position: absolute` (funciona porque nenhum ancestral entre aqui
          e o body tem `position` diferente de `static`) e
          `body * { visibility: hidden }` esconde tudo — inclusive o menu,
          sem precisar mexer em cada componente do AppLayout — enquanto
          `.relatorio-page, .relatorio-page *` volta a ficar visível. Além
          disso: `print:hidden` no AppLayout (defesa extra pra quem não usa
          esse padrão), paisagem A4 (a tabela tem 7 colunas — retrato
          apertaria Categoria/Centro custo/Saldo), `overflow: visible` no
          scroll horizontal da tabela (senão corta colunas do mesmo jeito
          que o `<main>` cortava linhas) e quebra de página evitada dentro
          de cada linha. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm 1.2cm; }
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          .relatorio-page, .relatorio-page * { visibility: visible !important; }
          .relatorio-page {
            position: absolute !important;
            left: 0 !important; top: 0 !important; right: 0 !important;
            width: 100% !important; max-width: 100% !important;
            margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; border: none !important;
            background: white !important;
          }
          .relatorio-page * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .relatorio-page .overflow-x-auto { overflow: visible !important; }
          /* table-layout fixed — sem isso, a coluna de Descrição/Fornecedor
             (a única sem largura fixa) cresce pelo CONTEÚDO real (nomes
             longos de fornecedor) em vez de dividir o que sobra depois das
             outras 6 colunas com largura fixa — e a tabela inteira passa a
             ultrapassar a página, cortando "Saldo" fora do papel. Achado
             pela Telma (16/09/2026) num PDF real onde "Saldo" saía cortado
             na borda direita. Com fixed, a única coluna sem largura fixa
             sempre recebe exatamente o que resta — nunca mais, nunca menos. */
          .relatorio-page table { width: 100% !important; table-layout: fixed !important; }
          .relatorio-page tr { page-break-inside: avoid; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      {/* Cabeçalho + filtros + resumo fixos ao rolar — pedido da Telma
          (16/09/2026): primeiro só filtros e resumo, depois ela pediu pra
          incluir também a barra de ferramentas ("lá tem a seta pra voltar,
          mostra qual caixa se refere"). `sticky top-0` funciona porque quem
          rola de verdade é o `<main>` do AppLayout (`overflow-y-auto`), não
          a `window` — este bloco é filho direto desse scroll. Margem
          negativa + padding de volta (`-mx-3 md:-mx-5 px-3 md:px-5`)
          estende o fundo sólido até a borda do container pra esconder as
          linhas da tabela passando por baixo ao rolar. `print:static`
          porque a impressão já resolve isso do jeito dela (ver o `<style>`
          de impressão acima) — sticky não faz sentido no papel. */}
      <div ref={setFaixaFixaEl} className="sticky top-0 z-20 -mx-3 md:-mx-5 px-3 md:px-5 pt-3 md:pt-5 pb-3 space-y-3 bg-background border-b print:static print:mx-0 print:px-0 print:pt-0 print:pb-0 print:border-0">
      {/* Barra de ferramentas — só na tela, `print:hidden` some no papel.
          O resto da página (cartões de resumo, tabela) é o MESMO layout
          nos dois casos, com só duas colunas (seleção e ações) escondidas
          por linha — ver comentário do `<style>` acima sobre o
          `.relatorio-page`. */}
      <div className="flex items-center justify-between gap-2 flex-wrap print:hidden">
        <div className="flex items-center gap-2 min-w-0">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="min-w-0">
          {/* Troca rápida entre contas (item 3, "PRIORIDADE MÁXIMA"
              22/09/2026) — pedido explícito: "sem sair da tela e sem
              perder o contexto". Vira o próprio título clicável: o
              `<Select>` só troca de visual (`variant="ghost"`-like via
              classes) pra continuar lendo como o cabeçalho de sempre, mas
              QUALQUER conta ativa (ordenada por `ordem`, item 6) está a um
              clique. `trocarConta` já leva os filtros atuais junto. */}
          <Select value={contaId} onValueChange={trocarConta}>
            <SelectTrigger className="h-auto border-0 shadow-none p-0 gap-1.5 font-serif text-lg hover:bg-muted/40 rounded-md px-1 -mx-1 [&>svg]:opacity-50">
              <DollarSign className="w-5 h-5 text-gold shrink-0" />
              <SelectValue>
                <span className="flex items-center gap-2 truncate">
                  {conta.nome}
                  <Badge variant="outline" className="text-xs font-sans font-normal">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {c.nome}
                    <span className="text-xs text-muted-foreground">{CONTA_TIPO_LABEL[c.tipo]}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground truncate">
            Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
          </p>
        </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {/* Barra de ações da seleção em massa (item 2, "PRIORIDADE MÁXIMA"
            22/09/2026) — aparece assim que qualquer linha é marcada.
            "Conciliar" só conta o subconjunto `realizado` da seleção (ver
            `selecionadosConciliaveis`); "Excluir" vale pra seleção inteira,
            qualquer situação. */}
        {selecionados.size > 0 && (
          <>
            {selecionadosConciliaveis.length > 0 && (
              <Button size="sm" onClick={conciliarSelecionados} disabled={conciliando || excluindoLoteBusy}
                className="gap-1.5 bg-success hover:bg-success text-white">
                <Scale className="w-3.5 h-3.5" />
                {conciliando ? "..." : `Conciliar ${selecionadosConciliaveis.length}`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setApagandoLote(true)} disabled={conciliando || excluindoLoteBusy}
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
              {`Excluir ${selecionados.size}`}
            </Button>
          </>
        )}
        {conta.tipo === "banco" && (
          <Button variant="outline" size="sm" onClick={() => setOfxOpen(true)} className="gap-1.5">
            <FileUp className="w-3.5 h-3.5" /> Importar OFX
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setOmieOpen(true)} className="gap-1.5">
          <FileUp className="w-3.5 h-3.5" /> Importar Omie
        </Button>
        {/* Pedido da Telma (15/09/2026): pagamentos de 2024 do cartão, que
            não passaram pelo Omie — só existem em PDF de fatura. Só faz
            sentido pra conta tipo "cartao", mesma lógica do OFX só pra
            "banco" acima. */}
        {conta.tipo === "cartao" && (
          <Button variant="outline" size="sm" onClick={() => setFaturaOpen(true)} className="gap-1.5">
            <FileUp className="w-3.5 h-3.5" /> Importar Fatura
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 text-info-text hover:text-info-text">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </Button>
        <Button onClick={() => { setEditando(null); setNovoOpen(true); }}
          className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Novo lançamento
        </Button>
        </div>
      </div>

      {/* Cabeçalho imprimível — mesmo padrão de financas/DashboardExecutivo.tsx */}
      <div className="avoid-break hidden print:block text-center mb-3 pb-3 border-b-2 border-gold/30">
        <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
        <h2 className="font-serif text-lg mt-1">Extrato — {conta.nome}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {dataBr(inicioEfetivo)} a {dataBr(fimEfetivo)} · Saldo atual: <strong>{brl(Number(conta.saldo_atual))}</strong>
          {" "}· Gerado em {new Date().toLocaleString("pt-BR")}
        </p>
      </div>

      {/* Filtros — `flex flex-wrap`, não grid de colunas fixas. `CampoData`
          (texto + botão de calendário) é mais largo que um `<input
          type="date">` sozinho ou o botão único de antes; num grid de
          coluna fixa, "dd/mm/aaaa" cortava (achado ao vivo, 17/09/2026).
          Cada campo tem sua própria largura mínima com `min-w-[Npx]` e
          quebra pra próxima linha sozinho quando não cabe, em vez de
          espremer — mesmo padrão já usado no cabeçalho de
          FinancasDoacoes.tsx nesta sessão. */}
      <Card className="print:hidden">
        <CardContent className="py-2.5 px-3 flex flex-wrap gap-2 items-end">
          {/* `CampoData` — pedido da Telma em 17/09/2026: "quero a opção
              de digitar + a opção de escolher pelo calendário, como
              estava antes, mas obedecendo a digitação, sem bugs". Ver o
              comentário grande no topo de `components/CampoData.tsx` pra
              todo o histórico (teclado nativo quebrado no WebView → só
              calendário tirou a digitação → esta versão devolve as duas,
              com máscara de texto em vez do input nativo). Cada campo só
              grava o que foi escolhido NELE; se sair invertido (final
              antes de inicial), `inicioEfetivo`/`fimEfetivo` resolve a
              ordem só na hora de buscar — o usuário nunca vê o próprio
              campo mudar sozinho. */}
          <div className="min-w-[150px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <CampoData value={dataInicio} onChange={setDataInicio} />
          </div>
          <div className="min-w-[150px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data final</label>
            <CampoData value={dataFim} onChange={setDataFim} />
          </div>
          <div className="w-28">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</label>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saídas</SelectItem>
                <SelectItem value="transferencia">Transferências</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Buscar descrição</label>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Digite..." />
            </div>
          </div>
          {/* Pedido da Telma (17/09/2026): recarregar sem precisar mexer na
              data — útil ao editar em outra aba/tela e voltar aqui. */}
          <Button type="button" variant="outline" size="sm" onClick={carregar} disabled={loading}
            className="h-8 text-xs gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </CardContent>
      </Card>

      {/* Resumo do período */}
      <div className="avoid-break grid grid-cols-3 gap-2 print:mb-2">
        <Card className="bg-success-soft/40 border-success-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-success-text flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
            <p className="text-sm font-semibold text-success-text tabular-nums">{brl(totalEntradasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive-soft/40 border-destructive-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
            <p className="text-sm font-semibold text-destructive-text tabular-nums">{brl(totalSaidasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-muted-foreground">Movimento do período</p>
            <p className="text-sm font-semibold tabular-nums">{brl(totalEntradasPeriodo - totalSaidasPeriodo)}</p>
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Tabela de lançamentos */}
      <Card>
        {/* `<thead sticky top-0>` dentro de um `overflow-x-auto` NÃO gruda
            no scroll da página (`<main>`) — tentativa inicial, revertida.
            A spec do CSS trava os dois eixos de overflow juntos: só
            declarar `overflow-x-auto` já faz o navegador computar
            `overflow-y` como `auto` também (achado medindo
            `getComputedStyle` ao vivo — nem `overflow-y-visible` escapa
            disso, o navegador reescreve de volta), e QUALQUER valor de
            overflow diferente de `visible` — inclusive `clip`/`hidden` —
            conta como "contêiner de scroll" pra fins de `position:
            sticky`. Resultado: o `<thead>` colava nesse CardContent (que
            nunca rolava de verdade, só existia pra permitir a tabela
            escapar pros lados em tela estreita) em vez de colar no
            `<main>`, e "grudava" a `top` medida a partir do topo do
            PRÓPRIO CardContent, empurrando o cabeçalho pra dentro do meio
            da lista em vez de ficar visível.
            Correção: em vez de brigar com a spec, esta área passa a ter
            SCROLL PRÓPRIO de verdade — altura máxima calculada a partir
            do que sobra da tela depois da faixa fixa (`alturaFaixaFixa`),
            então `overflow-x-auto`/`overflow-y-auto` deixam de ser um
            acidente e viram o scroll de verdade da tabela; `sticky top-0`
            no `<thead>` cola no topo DESSE scroll, que é exatamente onde
            a faixa fixa termina. É o mesmo padrão de qualquer grade de
            dados com cabeçalho fixo (Excel, Notion). Impressão ignora
            tudo isso: `.relatorio-page .overflow-x-auto { overflow:
            visible !important; }` já existia no `<style>` de impressão
            acima e continua batendo pelo nome da classe. */}
        <CardContent className="p-0 overflow-x-auto overflow-y-auto"
          style={{ maxHeight: alturaFaixaFixa ? `calc(100vh - ${alturaFaixaFixa}px - 7rem)` : undefined }}>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
            </div>
          ) : lancamentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              Nenhum lançamento no período. <button onClick={() => setNovoOpen(true)} className="text-primary underline">Criar o primeiro</button>
            </p>
          ) : (
            <table className="w-full text-xs">
              {/* `sticky top-0` no `<thead>` (não em cada `th`) — cola a
                  linha inteira de títulos no topo do scroll PRÓPRIO desta
                  área (ver comentário do `CardContent` acima sobre por que
                  não dá pra colar direto no `<main>`). `right-0` no `th`
                  de Ações continua funcionando junto — são dois eixos de
                  sticky independentes (vertical no thead relativo a este
                  scroll, horizontal na célula relativo ao mesmo scroll,
                  só que no eixo x), não um conflito. `print:static` porque
                  a impressão já resolve isso do jeito dela (repete o
                  cabeçalho por `page-break`, e o scroll interno vira
                  `overflow:visible` no `<style>` de impressão acima). */}
              <thead className="sticky top-0 z-10 bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground print:static">
                <tr>
                  <th className="w-8 print:hidden">
                    {/* Selecionar todos (item 2) — marca/desmarca todas as linhas
                        CARREGADAS na tela (o filtro de período já limita o que está
                        visível; "todos" é relativo ao que apareceu, igual o resto
                        da tela já trata filtro + busca). */}
                    {lancamentosOrdenados.length > 0 && (
                      <Checkbox
                        checked={lancamentosOrdenados.every(l => selecionados.has(l.id))}
                        onCheckedChange={alternarSelecionarTodos}
                        aria-label="Selecionar todos os lançamentos"
                      />
                    )}
                  </th>
                  {/* Situação e Centro custo saíram de coluna própria
                      (16/09/2026, pedido da Telma: "mostre Data - Descrição/
                      Fornecedor - Categoria - valor - saldo, como um
                      extrato de banco msm") — um extrato de banco de
                      verdade não tem coluna de "situação" nem "centro de
                      custo", só data/descrição/valor/saldo; a situação
                      (previsto/realizado/conciliado/cancelado) virou um
                      ícone colorido colado na própria data, clicável do
                      mesmo jeito que já era (marca conciliado), só sem uma
                      coluna e um texto só pra isso. Centro custo continua
                      no banco e no CSV/relatório detalhado — só saiu desta
                      tela, que agora imprime exatamente essas 5 colunas
                      (o resto já é `print:hidden`). */}
                  <th className="text-left py-2 px-2 w-24">Data</th>
                  <th className="text-left py-2 px-2">Descrição / Fornecedor</th>
                  {/* w-36 (144px) cortava nomes de categoria comuns
                      ("Rendimentos de Aplicações") no PDF — achado ao vivo
                      pela Telma na pré-visualização de impressão
                      (17/09/2026). w-48 (192px) — sobra de Descrição/
                      Fornecedor, a única coluna sem largura fixa, que tem
                      folga em A4 paisagem. */}
                  <th className="text-left py-2 px-2 w-48">Categoria</th>
                  <th className="text-right py-2 px-2 w-28">Valor</th>
                  <th className="text-right py-2 px-2 w-28">Saldo</th>
                  {/* Ações fixa na borda direita da área rolável — antes ficava
                      fora da tela em qualquer conta com muitas colunas visíveis,
                      obrigando rolar pra achar o lápis. Achado pela Telma em
                      13/09/2026. Some na impressão — lápis/lixeira/comprovante
                      não fazem sentido no papel. */}
                  <th className="w-28 sticky right-0 bg-muted/40 print:hidden"></th>
                </tr>
              </thead>
              <tbody>
                {/* Linha "Saldo inicial" — pedido da Telma (16/09/2026):
                    "insira a linha de saldo inicial para o primeiro
                    lançamento, para que o saldo corresponda corretamente".
                    A coluna Saldo já estava matematicamente certa (soma a
                    partir de `saldoAntesDoPeriodo`, calculado por
                    `saldoAcumuladoAntesDe`) — o que faltava era MOSTRAR de
                    onde esse acumulado começa, do jeito que um extrato de
                    banco de verdade sempre abre com "SALDO ANTERIOR". Só
                    aparece com `filtroTipo`/`busca` neutros: com um filtro
                    de tipo ou busca ativo a coluna Saldo já vira "soma só
                    do que apareceu na tela" (ver comentário acima, em
                    `saldoPorLancamento`) — mostrar um "saldo inicial" ao
                    lado de uma lista recortada seria mais confuso que
                    ajudar. Sem seleção, sem lápis/lixeira — não é um
                    lançamento de verdade, não dá pra editar nem excluir. */}
                {filtroTipo === "todos" && busca.length < 2 && (
                  <tr className="border-t bg-muted/20 text-muted-foreground italic">
                    <td className="py-1.5 px-2 print:hidden"></td>
                    <td className="py-1.5 px-2" colSpan={2}>Saldo inicial</td>
                    <td className="py-1.5 px-2">até {dataBr(inicioEfetivo)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums"></td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">{brl(saldoAntesDoPeriodo)}</td>
                    <td className="py-1.5 px-1 sticky right-0 bg-muted/20 print:hidden"></td>
                  </tr>
                )}
                {lancamentosOrdenados.map(l => {
                  const conciliavel = l.status === "realizado" || l.status === "conciliado";
                  return (
                  <tr key={l.id} className="border-t hover:bg-muted/30 group">
                    <td className="py-1.5 px-2 print:hidden">
                      {/* Seleção agora vale pra qualquer situação (item 2) —
                          antes só `realizado` podia marcar, porque só servia
                          pra conciliar; excluir em massa não tem essa
                          restrição. `conciliarSelecionados` filtra sozinho o
                          subconjunto conciliável na hora de agir. */}
                      <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
                        aria-label={`Selecionar ${l.descricao ?? "lançamento"}`} />
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      {/* Ícone de situação colado na data, não mais uma
                          coluna própria — mesmo clique de sempre (marca
                          conciliado), só que compacto. O texto do status
                          continua acessível pelo `title` do botão/span. */}
                      {conciliavel ? (
                        <button type="button" onClick={() => alternarConciliacao(l)}
                          title={l.status === "conciliado" ? "Bateu com o extrato — clique para desfazer" : "Marcar como conciliado (bateu com o extrato)"}
                          className={`inline-flex items-center gap-1 hover:underline decoration-dotted ${STATUS_COR[l.status]}`}>
                          {STATUS_ICONE[l.status]} {dataBr(l.data)}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 ${STATUS_COR[l.status]}`} title={STATUS_LABEL[l.status]}>
                          {STATUS_ICONE[l.status]} {dataBr(l.data)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 min-w-[200px] print:min-w-0">
                      <p className="font-medium truncate">{l.descricao ?? "—"}</p>
                      {/* Suprime a linha do fornecedor quando é o mesmo texto da
                          descrição — lançamentos importados do Omie/fatura
                          repetem o nome do fornecedor em `descricao`, e a
                          segunda linha idêntica só ocupava espaço (visível
                          duplicado no PDF: "SUPERMERCADO MUNDIAL LTDA" duas
                          vezes seguidas). Achado pela Telma (16/09/2026). */}
                      {l.fornecedor_nome && l.fornecedor_nome !== l.descricao && (
                        <p className="text-xs text-muted-foreground truncate">{l.fornecedor_nome}</p>
                      )}
                      {/* "de {pessoa_nome}" removida (16/09/2026, pedido da
                          Telma, print real do extrato): desde a
                          capitalização em massa das descrições, `descricao`
                          já mostra o nome legível ("José Dutra dos Santos")
                          — o "de Jose Dutra Dos Santos" embaixo virou
                          repetição visual, não informação nova. Mesma lógica
                          que já suprimia `fornecedor_nome` duplicado, agora
                          também pra `pessoa_nome`. */}
                    </td>
                    <td className="py-1.5 px-2 overflow-hidden">
                      {/* max-w-full + truncate — sem isso, uma categoria de
                          nome longo ("Assistência Social / Ação Social")
                          crescia além da largura da coluna e vazava por
                          cima da coluna vizinha (Valor) na impressão,
                          depois do table-layout:fixed passar a travar a
                          largura em vez de deixar crescer. Achado ao gerar
                          o PDF de teste (16/09/2026). */}
                      {l.categoria_nome && (
                        <Badge variant="outline" className="text-xs max-w-full truncate print:border-0 print:px-0 print:py-0 print:rounded-none print:bg-transparent print:font-normal"
                          style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
                          {l.categoria_nome}
                        </Badge>
                      )}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {brl(saldoPorLancamento.get(l.id) ?? 0)}
                    </td>
                    <td className="py-1.5 px-1 sticky right-0 bg-background group-hover:bg-muted/30 border-l print:hidden">
                      <div className="flex items-center gap-0.5 justify-end">
                        {l.comprovante_url && (
                          <button type="button" onClick={() => abrirComprovante(l.comprovante_url!)} title="Ver comprovante"
                            className="text-info-text hover:text-info-text">
                            <Paperclip className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditando(l); setNovoOpen(true); }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => setApagando(l)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right print:hidden">
        {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"} no período
      </p>

      {/* Dialogs */}
      <TransferenciaForm
        open={transfOpen}
        onOpenChange={setTransfOpen}
        contaOrigemPadrao={contaId}
        onSaved={carregar}
      />
      <ConciliacaoOFXDialog
        open={ofxOpen}
        onOpenChange={setOfxOpen}
        contaId={contaId}
        contaNome={conta.nome}
        onSaved={carregar}
      />
      <ImportacaoOmieDialog
        open={omieOpen}
        onOpenChange={setOmieOpen}
        contaId={contaId}
        contaNome={conta.nome}
        onSaved={carregar}
      />
      <ImportacaoFaturaDialog
        open={faturaOpen}
        onOpenChange={setFaturaOpen}
        contaId={contaId}
        contaNome={conta.nome}
        onSaved={carregar}
      />
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={contaId}
        lancamento={editando}
        onSaved={carregar}
      />

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.descricao ? `"${apagando.descricao}"` : "Este lançamento"} — {apagando && brl(Number(apagando.valor))}.
              Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluir} disabled={excluindoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {excluindoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação única pra exclusão em massa (item 2) — mesmo padrão
          `preventDefault()` do diálogo de exclusão individual acima. */}
      <AlertDialog open={apagandoLote} onOpenChange={(v) => !v && setApagandoLote(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selecionados.size} lançamento{selecionados.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoLoteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarExcluirSelecionados} disabled={excluindoLoteBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {excluindoLoteBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
