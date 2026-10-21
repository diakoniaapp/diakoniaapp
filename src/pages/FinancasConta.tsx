import { useEffect, useLayoutEffect, useState } from "react";
import { useRotuloDaTela } from "@/hooks/useNavegacao";
import { Link, useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { centroESubcentro } from "@/lib/centroSubcentro";
import { Card } from "@/components/ui/card";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { paraNumero } from "@/lib/dinheiro";
import { daquiADias, hojeLocal } from "@/lib/data";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DollarSign, Loader2, Plus, Search,
  Pencil, Trash2, Paperclip, Files, Info,
  Scale, FileUp, Printer, RefreshCw, Layers, FolderKanban, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentosSemTeto, excluirLancamento, excluirLancamentosEmLote, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL, listarContas, nomeExtrato,
  conciliarEmLote, listarCategorias, listarCentrosCusto,
  type FinConta, type FinLancamentoExtenso,
  type FinCategoria, type FinCentroCusto,
  STATUS_LABEL, type FinStatus,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import {
  BarraDePeriodo, periodoInicialDoExtrato, periodoParaLembrar, lerContextoFinancasSalvo, salvarContextoFinancas,
} from "@/components/financas/SeletorPeriodo";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { EditarTransferenciaForm } from "@/components/financas/EditarTransferenciaForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { BotaoDeImportar } from "@/components/financas/contas/BotaoDeImportar";
import { calcularExtrato, dataEfetiva, fechamentosDoDia, vencimentoDiferente, saldoAntesDe } from "@/services/saldoService";
import { FechamentoDoDiaCelular, LinhaDeFechamentoDoDia, podeMostrarFechamentos } from "@/components/financas/LinhaDeFechamentoDoDia";
import { DetalheDeEncargos } from "@/components/financas/DetalheDeEncargos";
import { DetalhesDoLancamento } from "@/components/financas/DetalhesDoLancamento";
import { iconeConta } from "@/pages/Financas";
import { AbasDaConta } from "@/components/financas/contas/AbasDaConta";
import { ChipsDeFiltros, FiltrosAvancadosPopover } from "@/components/financas/extrato/FiltrosAvancadosPopover";
import { ColunasPopover } from "@/components/financas/extrato/ColunasPopover";
import { ResumoEmLinha } from "@/components/financas/extrato/ResumoEmLinha";
import { colunasVisiveis, gravarColunas, lerColunas, type ColunaId } from "@/lib/colunasDoExtrato";
import {
  consultaDaSituacao, filtrosDaUrl, filtrosParaUrl, type FiltrosAvancados,
} from "@/lib/filtrosDoExtrato";
import { ArrowRightLeft } from "lucide-react";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// `centroESubcentro` (Centro · Subcentro em dois pedaços) mora em lib/centroSubcentro.ts desde
// 06/10/2026 — o painel em tela cheia usa a mesma regra.

const STATUS_COR: Record<FinStatus, string> = {
  realizado:  "text-foreground",
  conciliado: "text-success-text",
  previsto:   "text-warning-text",
  cancelado:  "text-muted-foreground line-through",
  aguardando_aprovacao: "text-info-text",
  quitado_terceiro: "text-info-text",
};

// As colunas opcionais que ficam ENTRE a Descrição e o Valor, na ordem em que aparecem. Saldo vem depois do Valor; "detalhe" não é coluna (é a 2ª linha da Descrição).
type ColunaDoMeio = "conta" | "favorecido" | "categoria" | "centro" | "projeto" | "documento";
const COLUNAS_DO_MEIO: { id: ColunaDoMeio; rotulo: string; largura: string }[] = [
  { id: "conta", rotulo: "Conta", largura: "w-32" },
  { id: "favorecido", rotulo: "Favorecido", largura: "w-44" },
  { id: "categoria", rotulo: "Categoria", largura: "w-32" },
  { id: "centro", rotulo: "Centro de custo", largura: "w-40" },
  { id: "projeto", rotulo: "Projeto", largura: "w-32" },
  { id: "documento", rotulo: "Documento", largura: "w-28" },
];

// Espaço que a lista deixa abaixo de si: a linha de paginação (≈32 px), o respiro entre os blocos e o padding do container (20 px no computador).
const RESERVA_ABAIXO_DA_LISTA = 64;
const ALTURA_MINIMA_DA_LISTA = 280;

const armazemLocal = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

export default function FinancasConta() {
  const { contaId = "" } = useParams();
  const navigate = useNavigate();
  // "Todas as Contas" (pedido dela, 30/09/2026, vendo a "Movimentação de
  // Contas" do Omie) — mesmo sentinel de string usado no seletor do
  // `ExtratoContaDrawer` (lá é `null`; aqui, como `contaId` vem da URL,
  // vira o segmento literal "todas", `/financas/conta/todas`). Sem rota
  // nova: `:contaId` já aceita qualquer string, o componente é que decide
  // o que fazer com ela.
  const isTodasContas = contaId === "todas";
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
  useRotuloDaTela(conta?.nome ? `${conta.nome} · Extrato completo` : undefined); // nome real na trilha (BarraDeContexto)

  // O estado de navegação (`location.state`) é repassado ao espelho dos filtros na URL (`setSearchParams` com `replace` reescreve a entrada do histórico e, sem repassar o `state`, ele some).
  const location = useLocation();
  const isMobile = useIsMobile();
  const [contas, setContas] = useState<FinConta[]>([]);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);

  // O par de datas e os Filtros avançados nascem da URL (F5, link, favorito) → do último contexto lembrado → de "hoje" (23/09/2026: a tesouraria trabalha com "o que aconteceu hoje").
  // O seletor "Período" saiu em 21/10/2026: ficam Data inicial, Data final e os atalhos Hoje/Semana/Mês/30 dias, que só preenchem as datas — ver `BarraDePeriodo`.
  // Links antigos (`?periodo=mes_atual`, `?periodo=atrasados`) continuam abrindo certo — ver `periodoInicialDoExtrato`.
  const [aberturaDoPeriodo] = useState(() => periodoInicialDoExtrato({
    periodoUrl: searchParams.get("periodo"), de: searchParams.get("de"), ate: searchParams.get("ate"), contexto: lerContextoFinancasSalvo(),
  }));
  const [dataInicio, setDataInicio] = useState(aberturaDoPeriodo.inicio);
  const [dataFim, setDataFim] = useState(aberturaDoPeriodo.fim);
  // Tipo, Situação, Categoria, Centro de custo, Valor (de/até) e Data exata: o popover "Filtros". Favorecido e Projeto saíram (a busca já acha pelo favorecido).
  // "transferencia" não é um `FinMovimentoTipo` (transferência grava uma perna entrada e outra saída): vira `apenasTransferencia` em `listarLancamentos`.
  const [filtros, setFiltros] = useState<FiltrosAvancados>(() => filtrosDaUrl(searchParams, aberturaDoPeriodo.vencidos));
  const mudarFiltros = (parcial: Partial<FiltrosAvancados>) => setFiltros(f => ({ ...f, ...parcial }));
  const {
    tipo: filtroTipo, situacao, categoriaId: filtroCategoriaId, centroCustoId: filtroCentroCustoId,
    valorMin: filtroValorMinTexto, valorMax: filtroValorMaxTexto, dataExata: filtroDataEspecifica,
  } = filtros;

  const [busca, setBusca] = useState(() => searchParams.get("busca") ?? "");
  // Debounce (22/09/2026, achado ao vivo pela Telma): sem isso,
  // `carregar()` (efeito abaixo, dependente de `busca`) rodava a CADA
  // tecla — `setLoading(true)` trocava a tabela inteira (thead incluso)
  // por um spinner por uma fração de segundo, desmontando qualquer coisa
  // dentro dela. `buscaDebounced` é o valor que de fato dispara a busca;
  // `busca` (o valor do campo) continua instantâneo pra digitar sem travar.
  const [buscaDebounced, setBuscaDebounced] = useState(busca);
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);

  // ⚙ Colunas (21/10/2026) no lugar de Resumido/Analítico: Data, Descrição e Valor fixas, o resto liga e desliga; a escolha fica neste aparelho e o celular nasce Compacto.
  // Só grava quando a PESSOA muda (não grava o padrão do celular por cima de uma escolha futura feita na tela larga do mesmo navegador).
  const [colunas, setColunas] = useState<Set<ColunaId>>(() => lerColunas(armazemLocal(), typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches));
  function mudarColunas(novo: Set<ColunaId>) { setColunas(novo); gravarColunas(armazemLocal(), novo); }
  const col = colunasVisiveis(colunas, isTodasContas);
  const colunasDoMeio = COLUNAS_DO_MEIO.filter(c => col.has(c.id));

  // U3/F5 do roadmap "90 Dias" (22/09/2026, início pelo Financeiro): sem
  // paginação, uma conta com meses de histórico (algumas passam de 190
  // lançamentos no mês) renderizava a lista inteira de uma vez. Mesmo
  // padrão já em uso em Membros.tsx — `POR_PAGINA`, `pagina`, nav
  // "Anterior/Próxima" no rodapé. O acumulado da coluna Saldo continua
  // somando a lista INTEIRA (não só a página visível) — paginar é só
  // quanto aparece na tela, não muda a conta.
  const POR_PAGINA = 50;
  const [pagina, setPagina] = useState(1);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  // Editar uma perna de transferência abre um diálogo à parte (só Data/
  // Descrição), não o `LancamentoForm` — pedido da Telma (22/09/2026),
  // ver comentário grande em `EditarTransferenciaForm.tsx`.
  const [editandoTransf, setEditandoTransf] = useState<FinLancamentoExtenso | null>(null);
  // Fase 9 do roadmap Financeiro ERP (22/09/2026): ver/gerenciar os anexos
  // de UM lançamento — schema e serviço prontos desde a Fase 7, faltava só
  // a tela. Guarda o lançamento inteiro (não só o id) pra dar título ao
  // diálogo sem precisar recarregar nada.
  const [anexosPara, setAnexosPara] = useState<FinLancamentoExtenso | null>(null);
  // o painel de detalhes da despesa como uma entidade só (documento, pagamento, OFX, conciliação, comprovante, malote)
  const [detalhesDe, setDetalhesDe] = useState<FinLancamentoExtenso | null>(null);
  const [transfOpen, setTransfOpen] = useState(false);
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

  // "Só vencidos em aberto" (o antigo preset "Atrasados") filtra por SITUAÇÃO — previsto vencido, sem chão de data, até ontem —, então as datas da barra não valem nesse caso.
  // A ordem invertida (final antes da inicial) já não sai da barra (lib/intervaloDeDatas.ts); a troca abaixo só protege um link com `de`/`ate` trocados.
  const consulta = consultaDaSituacao(situacao, daquiADias(hojeLocal(), -1));
  const inicioEfetivo = consulta.ignoraDatas ? "" : (dataInicio <= dataFim ? dataInicio : dataFim);
  const fimEfetivo = consulta.ignoraDatas ? consulta.teto! : (dataInicio <= dataFim ? dataFim : dataInicio);
  const statusFiltro = consulta.status;

  useEffect(() => { carregar(); }, [contaId, filtroTipo, statusFiltro, inicioEfetivo, fimEfetivo, buscaDebounced, filtroCategoriaId, filtroCentroCustoId]);
  // Trocar de CONTA limpa a lista antes de buscar — sem isso, o fix logo
  // abaixo ("não mostrar spinner se já tem dado em mãos", pro popover não
  // fechar sozinho) mostraria por um instante o extrato da conta ANTERIOR
  // enquanto a nova carrega, já que `lancamentos` só troca quando a busca
  // termina. Filtro/data/categoria mudando na MESMA conta não entra
  // aqui de propósito — ali sim vale manter o dado antigo na tela até o
  // novo chegar (evita o "pisca" que fechava o popover).
  useEffect(() => { setLancamentos([]); }, [contaId]);
  // Voltar à página 1 quando o filtro muda — continuar na página 4 de um
  // período que agora só tem 1 página deixaria a tabela vazia. Valor
  // entra aqui também mesmo sendo filtro em memória (não refaz a busca no
  // servidor, mas muda quantas linhas sobram pra paginar).
  useEffect(() => { setPagina(1); }, [
    contaId, filtroTipo, situacao, inicioEfetivo, fimEfetivo, buscaDebounced,
    filtroCategoriaId, filtroCentroCustoId, filtroValorMinTexto, filtroValorMaxTexto, filtroDataEspecifica,
  ]);

  // Espelha os filtros na URL (`replace`, não empilha histórico a cada
  // tecla digitada) — é isso que sobrevive a F5 e a sair/voltar pra tela.
  // `periodo=` continua escrito (o atalho que o par de datas forma, senão "personalizado"): é o que faz um favorito de "Mês atual" continuar sendo o mês de HOJE.
  useEffect(() => {
    const params = new URLSearchParams();
    filtrosParaUrl(filtros, params);
    if (busca) params.set("busca", busca);
    params.set("periodo", periodoParaLembrar(dataInicio, dataFim));
    params.set("de", dataInicio);
    params.set("ate", dataFim);
    setSearchParams(params, { replace: true, state: location.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, busca, dataInicio, dataFim]);

  // Lista de contas pro seletor rápido (item 3) — carregada uma vez só,
  // não depende de `contaId`, e já vem ordenada por `ordem`/`nome`
  // (`listarContas`, item 6).
  useEffect(() => { listarContas().then(setContas); }, []);
  // Opções dos filtros de coluna — carregadas uma vez só, mesmo motivo
  // de `contas` acima (não dependem de conta/período, só do plano de
  // contas/centros ativos).
  useEffect(() => {
    listarCategorias().then(setCategorias);
    listarCentrosCusto().then(setCentros);
  }, []);

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
      // "Só vencidos em aberto" não tem chão de data (`inicioEfetivo` fica "") — chamar
      // `saldoAntesDe("")` pediria ao banco um saldo "antes de nenhuma data", sem sentido.
      // Sem período contínuo, saldo inicial/final não existem nesse caso (ver o resumo).
      const [c, ls, saldoAntes] = await Promise.all([
        isTodasContas ? Promise.resolve(null) : carregarConta(contaId),
        // `listarLancamentos` (teto de 300) até 16/09/2026: os cartões
        // "Entradas"/"Saídas"/"Movimento do período" somam em memória a
        // partir desta mesma lista — um período largo (ou "todas as
        // contas" não, mas uma conta corrida de anos) já passa de 300 e os
        // cartões ficariam contando só os lançamentos mais recentes, não o
        // período inteiro. Mesmo bug achado e corrigido em
        // `gerarPrestacaoContas`.
        listarLancamentosSemTeto({
          contaId: isTodasContas ? undefined : contaId,
          tipo: filtroTipo !== "todos" && filtroTipo !== "transferencia" ? filtroTipo : undefined,
          apenasTransferencia: filtroTipo === "transferencia" ? true : undefined,
          status: statusFiltro,
          dataInicio: inicioEfetivo, dataFim: fimEfetivo,
          porDataDeCaixa: true,   // extrato = caixa: o pagamento entra no dia em que o banco o debitou (ver saldoService.dataEfetiva)
          busca: buscaDebounced.length >= 2 ? buscaDebounced : undefined,
          categoriaId: filtroCategoriaId || undefined,
          centroCustoId: filtroCentroCustoId || undefined,
        }),
        consulta.ignoraDatas ? Promise.resolve(0) : saldoAntesDe(inicioEfetivo, isTodasContas ? undefined : contaId),
      ]);
      setConta(c);
      setLancamentos(ls);
      setSaldoAntesDoPeriodo(saldoAntes);
      // Lembra conta+período pra próxima entrada no sistema (ver comentário
      // de `CHAVE_CONTEXTO_FINANCAS`) — grava só depois de carregar
      // com sucesso, pra não lembrar uma conta que deu erro. Um par que é
      // exatamente um atalho (Hoje, Semana, Mês, 30 dias) é lembrado como o atalho (amanhã
      // abre o "hoje" de amanhã); qualquer outro, com as datas (achado ao vivo pela Telma, 29/09/2026).
      salvarContextoFinancas(contaId, periodoParaLembrar(dataInicio, dataFim), dataInicio, dataFim);
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

// D4 (13/10/2026): marcar à mão é CONFERIR (validação humana); CONCILIAR é ter o vínculo com a linha do banco (OFX ou PDF) — duas provas diferentes.
  async function conciliarSelecionados() {
    if (selecionadosConciliaveis.length === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(selecionadosConciliaveis);
      const n = selecionadosConciliaveis.length;
      toast.success(`${n} lançamento${n > 1 ? "s" : ""} conferido${n > 1 ? "s" : ""}`);
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
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
      // Diferente do delete de item único: em lote agora é possível parar
      // NO MEIO (`emLotes`, finService.ts) — alguns lotes já apagados,
      // outros não. Sem recarregar aqui, a tela continuaria mostrando como
      // "selecionado, ainda na lista" linhas que já sumiram do banco.
      setSelecionados(new Set());
      await carregar();
    }
    finally { setExcluindoLoteBusy(false); }
  }

  // Só a página atual — "selecionar todos" combina com o que o cabeçalho
  // da tabela enxerga na tela, não com o período inteiro escondido nas
  // outras páginas (U3/F5, paginação).
  function alternarSelecionarTodos() {
    setSelecionados(prev => {
      const todosIds = lancamentosPagina.map(l => l.id);
      const todosMarcados = todosIds.length > 0 && todosIds.every(id => prev.has(id));
      return todosMarcados ? new Set() : new Set(todosIds);
    });
  }

  // Pedido da Telma (22/09/2026), vendo "Excluir 50" e tendo que repetir
  // página por página: "permita excluir todo o período selecionado" — ela
  // estava selecionando de 50 em 50. Ação separada do checkbox do
  // cabeçalho (que continua só-página, de propósito — ver comentário
  // acima): esta pega TODO `lancamentosOrdenados`, as centenas que podem
  // estar escondidas nas outras páginas, respeitando os mesmos filtros já
  // aplicados (data, categoria, centro, valor, busca — é o que a tela já
  // mostra como "N lançamentos no período" no rodapé).
  function selecionarPeriodoInteiro() {
    setSelecionados(new Set(lancamentosOrdenados.map(l => l.id)));
  }

  // UMA rolagem só (21/10/2026). No computador a LISTA é a área rolável: a altura dela é o que sobra da tela depois do cabeçalho, da barra de consulta e do resumo — medida de
  // verdade, porque essas faixas mudam de altura sozinhas (chips de filtro, quebra de linha em tela estreita) — e a página em volta não rola. O cabeçalho da tabela cola no
  // topo DESSA área (um `<thead sticky>` dentro de um contêiner que rola cola nele, não na página — era a causa da rolagem dupla e do cabeçalho "fantasma" de antes).
  // No celular a lista corre solta e a PÁGINA rola (não há duas rolagens uma dentro da outra).
  const [topoEl, setTopoEl] = useState<HTMLDivElement | null>(null);
  const [listaEl, setListaEl] = useState<HTMLDivElement | null>(null);
  const [alturaDaLista, setAlturaDaLista] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!listaEl || isMobile) { setAlturaDaLista(undefined); return; }
    const principal = listaEl.closest("main");
    const medir = () => {
      const topoDoMain = principal ? principal.getBoundingClientRect().top : 0;
      const topoDaLista = listaEl.getBoundingClientRect().top - topoDoMain + (principal?.scrollTop ?? 0);
      const area = principal ? principal.clientHeight : window.innerHeight;
      setAlturaDaLista(Math.max(ALTURA_MINIMA_DA_LISTA, Math.floor(area - topoDaLista - RESERVA_ABAIXO_DA_LISTA)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (topoEl) ro.observe(topoEl);
    if (principal) ro.observe(principal);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [listaEl, topoEl, isMobile]);

  if (loading && !conta && !isTodasContas) {
    return <PaginaSkeleton />;
  }
  if (!conta && !isTodasContas) {
    return <div className="p-8 text-center text-muted-foreground">
      Conta não encontrada. <Link to="/financas" className="text-primary underline">Voltar</Link>
    </div>;
  }

  // Filtro de Valor (min/max) — em memória, sobre o que o servidor já
  // trouxe pro período (ver comentário do estado, acima). Tudo que
  // depende do que aparece na tela parte DAQUI, não de `lancamentos` cru,
  // senão o filtro de valor não bateria com os cartões de resumo, com a
  // paginação nem com "N lançamentos no período".
  const valorMin = filtroValorMinTexto.trim() ? paraNumero(filtroValorMinTexto) : null;
  const valorMax = filtroValorMaxTexto.trim() ? paraNumero(filtroValorMaxTexto) : null;
  // Filtro de Categoria só oferece o que a CONTA aceita (item 5: contas
  // têm `aceita_receitas`/`aceita_despesas`) — pedido da Telma
  // (22/09/2026, print real: uma conta só-receita mostrava categoria de
  // despesa tipo "Salários"/"Férias" na lista, que nunca poderia aparecer
  // ali mesmo). Conta que aceita os dois tipos (a maioria) continua
  // vendo a lista inteira. A categoria já selecionada no filtro fica
  // visível mesmo se não bater mais — não some sozinha da lista por
  // trocar de conta com um filtro já ativo.
  const categoriasParaFiltro = categorias.filter(c => {
    if (c.id === filtroCategoriaId) return true;
    if (conta?.aceita_receitas && !conta.aceita_despesas) return c.tipo === "entrada";
    if (conta?.aceita_despesas && !conta.aceita_receitas) return c.tipo === "saida";
    return true;
  });

  const lancamentosFiltrados = lancamentos.filter(l => {
    const v = Number(l.valor);
    if (valorMin != null && v < valorMin) return false;
    if (valorMax != null && v > valorMax) return false;
    if (filtroDataEspecifica && dataEfetiva(l) !== filtroDataEspecifica) return false;
    return true;
  });

  // Ordem, acumulado linha a linha, totais e saldo final vêm do serviço
  // único (`saldoService.calcularExtrato`) — mesma conta que o Extrato e o
  // Relatório por conta fazem, sem cópia local. Ordem cronológica (mais
  // antigo primeiro), entrada antes de saída na mesma data, e `id` como
  // desempate final (ver cabeçalho de `saldoService.ts`). Só realizado/
  // conciliado mexe no saldo. Com filtro de tipo ou busca ativo, a coluna
  // acumula só o que está filtrado — não é mais o saldo real da conta
  // linha a linha; aceitável, não escondido. Saldo final não existe em
  // "Só vencidos" — sem chão de data, "antes do período" não tem o que
  // significar (`saldoAntesDoPeriodo` fica 0, nem é buscado).
  const {
    ordenados: lancamentosOrdenados,
    saldoPorLancamento,
    totalEntradas: totalEntradasPeriodo,
    totalSaidas: totalSaidasPeriodo,
    saldoFinal: saldoFinalPeriodo,
  } = calcularExtrato(lancamentosFiltrados, saldoAntesDoPeriodo);
  // A lista só é "a conta" (saldo inicial e "SALDO DO DIA" valem) sem filtro de conteúdo nem busca e com a Situação "Todas" — com filtro o acumulado é parcial e o número seria falso.
  const listaCompletaDaTela = podeMostrarFechamentos({
    situacao, filtroTipo, busca: buscaDebounced, categoriaId: filtroCategoriaId, centroCustoId: filtroCentroCustoId,
    valorMin, valorMax, dataEspecifica: filtroDataEspecifica,
  });
  // "SALDO DO DIA" entre os dias (pedido dela, 08/10/2026): o saldo de fechamento de cada data, para conferir contra o extrato do banco.
  const fechamentos = fechamentosDoDia(lancamentosOrdenados, saldoPorLancamento);
  const comFechamentos = (lista: FinLancamentoExtenso[]) => lista.flatMap(l => {
    const f = listaCompletaDaTela ? fechamentos.get(l.id) : undefined;
    return f ? [renderLinha(l), <LinhaDeFechamentoDoDia key={`fechamento-${l.id}`} data={f.data} saldo={f.saldo} />] : [renderLinha(l)];
  });
  const comFechamentosCelular = (lista: FinLancamentoExtenso[]) => lista.flatMap(l => {
    const f = listaCompletaDaTela ? fechamentos.get(l.id) : undefined;
    return f ? [renderCartao(l), <FechamentoDoDiaCelular key={`fechamento-${l.id}`} data={f.data} saldo={f.saldo} />] : [renderCartao(l)];
  });
  // "Só vencidos" é filtro de SITUAÇÃO (todo `lancamentosFiltrados` já vem
  // `previsto` do servidor), não de período contínuo — os totais acima
  // dariam zero (eles só somam realizado/conciliado, de propósito, pro
  // resto da tela). Total à parte, líquido (entrada soma, saída subtrai).
  const totalVencido = lancamentosFiltrados.reduce((s, l) => s + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);

  // U3/F5 (paginação) — a tela mostra só uma página, mas a impressão
  // continua trazendo o período inteiro (senão "Imprimir/PDF" passaria a
  // sair cortado na página que estava aberta na hora do clique, quebrando
  // o que já foi corrigido nesta mesma tela em 15-17/09/2026). Por isso
  // a linha virou uma função — `renderLinha` — chamada duas vezes: uma
  // vez sobre `lancamentosPagina` (tbody de tela, `print:hidden`) e uma
  // vez sobre `lancamentosOrdenados` inteiro (tbody só de impressão,
  // `hidden print:table-row-group`), em vez de duplicar o JSX da linha.
  const totalPaginas = Math.max(1, Math.ceil(lancamentosOrdenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaAtual - 1) * POR_PAGINA;
  const lancamentosPagina = lancamentosOrdenados.slice(inicioPagina, inicioPagina + POR_PAGINA);

  // Com a coluna Favorecido ligada, a Descrição fica só com o texto digitado (ou a categoria) em vez de repetir o favorecido; sem ela, o favorecido manda (`nomeExtrato`, 23/09/2026:
  // "a primeira coisa que a tesouraria precisa ver é o favorecido, não a descrição digitada") e o texto digitado é a 2ª linha, se a coluna "Detalhe da descrição" estiver ligada.
  function textosDaDescricao(l: FinLancamentoExtenso) {
    const { principal, secundario } = nomeExtrato(l);
    const principalDaCelula = col.has("favorecido") ? (l.descricao || l.categoria_nome || "—") : principal;
    const segunda = !col.has("favorecido") && col.has("detalhe") && secundario && secundario !== l.categoria_nome ? secundario : null;
    return { principal, principalDaCelula, segunda };
  }

  function celulaDoMeio(id: ColunaDoMeio, l: FinLancamentoExtenso) {
    switch (id) {
      case "conta":
        return <td key={id} className="py-1.5 px-2 overflow-hidden"><span className="text-xs text-muted-foreground truncate block">{l.conta_nome ?? "—"}</span></td>;
      case "favorecido":
        return <td key={id} className="py-1.5 px-2 overflow-hidden"><span className="truncate block">{l.fornecedor_nome || l.pessoa_nome || "—"}</span></td>;
      case "categoria":
        // Uma linha só, sem badge grande (02/10/2026: com Categoria empilhada na Descrição a linha chegava a 92 px).
        return (
          <td key={id} className="py-1.5 px-2 overflow-hidden">
            {l.categoria_nome && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 max-w-full truncate print:border-0 print:px-0 print:py-0 print:rounded-none print:bg-transparent print:font-normal"
                style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
                {l.categoria_nome}
              </Badge>
            )}
          </td>
        );
      case "centro": {
        const cc = centroESubcentro(l.centro_nome);
        return (
          <td key={id} className="py-1.5 px-2 overflow-hidden">
            {cc && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: l.centro_cor ?? "#888" }} />
                <span className="truncate">{cc.centro}{cc.subcentro && <> › {cc.subcentro}</>}</span>
              </div>
            )}
          </td>
        );
      }
      case "projeto":
        return <td key={id} className="py-1.5 px-2 overflow-hidden"><span className="text-xs text-muted-foreground truncate block">{l.projeto_nome ?? ""}</span></td>;
      case "documento":
        return <td key={id} className="py-1.5 px-2 overflow-hidden"><span className="text-xs text-muted-foreground truncate block">{l.documento_numero ?? ""}</span></td>;
    }
  }

  function renderLinha(l: FinLancamentoExtenso) {
    const { principal, principalDaCelula, segunda } = textosDaDescricao(l);
    return (
      <tr key={l.id} className="border-t hover:bg-muted/30 group">
        <td className="py-1.5 px-2 print:hidden">
          {/* Seleção agora vale pra qualquer situação (item 2) —
              antes só `realizado` podia marcar, porque só servia
              pra conciliar; excluir em massa não tem essa
              restrição. `conciliarSelecionados` filtra sozinho o
              subconjunto conciliável na hora de agir. */}
          <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
            aria-label={`Selecionar ${principal}`} />
        </td>
        <td className="py-1.5 px-2 whitespace-nowrap">
          {/* Situação colada na data, sem ícone (22/09/2026) — dois pedidos
              seguidos da Telma: primeiro "mantenha a conciliação apenas
              pela caixa de seleção" (o selo era clicável e alternava
              conciliado/realizado na hora — achado como fonte de clique
              acidental), depois "tire o ícone de check da data" (o ícone
              STATUS_ICONE continuava ali, só sem função). Cor do texto
              ainda muda por status (STATUS_COR) — é o único sinal visual
              que sobrou; o `title` carrega o nome por extenso pra quem
              passar o mouse. */}
          <span className={STATUS_COR[l.status]} title={STATUS_LABEL[l.status]}>
            {dataBr(dataEfetiva(l))}
          </span>
          {vencimentoDiferente(l) && (
            <span className="ml-1 text-[10px] text-muted-foreground" title="Vencimento — o pagamento caiu em outro dia">
              venc. {dataBr(vencimentoDiferente(l)!).slice(0, 5)}
            </span>
          )}
        </td>
        <td className="py-1.5 px-2 min-w-[200px] print:min-w-0">
          <p className="font-medium truncate flex items-center gap-1">
            {/* Ícone de projeto (pedido dela, 30/09/2026): identificar de
                relance quais lançamentos estão vinculados a um projeto
                (120 Anos, Reforma do Templo...), sem precisar abrir cada
                um. Mesmo ícone/cor do `ExtratoContaDrawer`. Com a coluna
                Projeto ligada o nome já está ali — o ícone sai. */}
            {l.projeto_nome && !col.has("projeto") && (
              <span title={`Projeto: ${l.projeto_nome}`} className="shrink-0 print:hidden">
                <FolderKanban className="w-3 h-3 text-violeta" />
              </span>
            )}
            <span className="truncate">{principalDaCelula}</span>
          </p>
          {/* `nomeExtrato` já suprime a segunda linha quando ela seria
              idêntica à primeira (ex.: lançamento do Omie/fatura onde a
              descrição JÁ é o nome do fornecedor); esta linha some TAMBÉM
              quando é idêntica à Categoria (02/10/2026: descrição "Dizimos"
              e categoria "Dizimos" mostravam a MESMA palavra duas vezes). */}
          {segunda && <p className="text-xs text-muted-foreground truncate">{segunda}</p>}
          {/* Juros/multa/desconto não são linhas: a obrigação é UMA e o extrato mostra o total pago; o detalhe vem aqui embaixo (opção A, 13/10/2026). */}
          {col.has("detalhe") && <DetalheDeEncargos lancamento={l} />}
        </td>
        {colunasDoMeio.map(c => celulaDoMeio(c.id, l))}
        <td className={`py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
          {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
        </td>
        {col.has("saldo") && (
          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
            {brl(saldoPorLancamento.get(l.id) ?? 0)}
          </td>
        )}
        <td className="py-1.5 px-1 sticky right-0 bg-background group-hover:bg-muted/30 border-l print:hidden">
          <div className="flex items-center gap-0.5 justify-end">
            {l.comprovante_url && (
              <button type="button" onClick={() => abrirComprovante(l.comprovante_url!)} title="Ver comprovante"
                className="text-info-text hover:text-info-text">
                <Paperclip className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Anexos (Fase 9) sempre visível, ao contrário do Paperclip
                acima — este é o botão de GERENCIAR (ver, enviar, apagar
                quantos quiser), não só de abrir o único comprovante que já
                existe. Transferência não tem lançamento próprio pra
                anexar (as duas pernas dividem o mesmo diálogo de edição). */}
            <button type="button" onClick={() => setDetalhesDe(l)} title="Detalhes: documento, pagamento, OFX, conciliação e comprovante" aria-label="Detalhes do lançamento"
                className="text-muted-foreground hover:text-gold">
                <Info className="w-3.5 h-3.5" />
              </button>
            {l.origem !== "transferencia" && (
              <button type="button" onClick={() => setAnexosPara(l)} title="Anexos"
                className="text-muted-foreground hover:text-gold">
                <Files className="w-3.5 h-3.5" />
              </button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar lançamento"
              onClick={() => editar(l)}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Excluir lançamento"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={() => setApagando(l)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  function editar(l: FinLancamentoExtenso) {
    if (l.origem === "transferencia") setEditandoTransf(l);
    else { setEditando(l); setNovoOpen(true); }
  }

  // A mesma linha para o CELULAR (21/10/2026): no computador a tabela tem colunas; num telefone a tabela não cabe (a primeira linha só aparecia abaixo da tela de 812 px).
  // Cada lançamento vira um cartão fino de duas linhas — nome e valor em cima; data, situação e as colunas ligadas embaixo — e as ações vão para o "⋮".
  function renderCartao(l: FinLancamentoExtenso) {
    const { principal, principalDaCelula, segunda } = textosDaDescricao(l);
    const cc = col.has("centro") ? centroESubcentro(l.centro_nome) : null;
    const apoio = [
      col.has("favorecido") ? (l.fornecedor_nome || l.pessoa_nome) : null,
      isTodasContas && col.has("conta") ? l.conta_nome : null,
      col.has("categoria") ? l.categoria_nome : null,
      cc ? `${cc.centro}${cc.subcentro ? ` › ${cc.subcentro}` : ""}` : null,
      col.has("projeto") ? l.projeto_nome : null,
      col.has("documento") ? l.documento_numero : null,
    ].filter(Boolean) as string[];
    return (
      <li key={l.id} className="flex items-start gap-2 px-2 py-2">
        <Checkbox className="mt-1" checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)} aria-label={`Selecionar ${principal}`} />
        <button type="button" onClick={() => setDetalhesDe(l)} className="min-w-0 flex-1 text-left" aria-label={`Detalhes: ${principal}`}>
          <span className="flex items-center gap-1 font-medium text-sm">
            {l.projeto_nome && !col.has("projeto") && <FolderKanban className="w-3 h-3 shrink-0 text-violeta" aria-label={`Projeto: ${l.projeto_nome}`} />}
            <span className="truncate">{principalDaCelula}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className={STATUS_COR[l.status]} title={STATUS_LABEL[l.status]}>{dataBr(dataEfetiva(l))}</span>
            {vencimentoDiferente(l) && <span className="text-[10px]">venc. {dataBr(vencimentoDiferente(l)!).slice(0, 5)}</span>}
            {apoio.map((t, i) => <span key={i} className="truncate max-w-[10rem]">· {t}</span>)}
          </span>
          {segunda && <span className="block truncate text-xs text-muted-foreground">{segunda}</span>}
          {col.has("detalhe") && <DetalheDeEncargos lancamento={l} />}
        </button>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-medium tabular-nums ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
            {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
          </p>
          {col.has("saldo") && <p className="text-[11px] tabular-nums text-muted-foreground">{brl(saldoPorLancamento.get(l.id) ?? 0)}</p>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 h-8 w-8 shrink-0" aria-label="Ações do lançamento">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDetalhesDe(l)}><Info className="mr-2 h-4 w-4" /> Detalhes</DropdownMenuItem>
            {l.comprovante_url && <DropdownMenuItem onSelect={() => abrirComprovante(l.comprovante_url!)}><Paperclip className="mr-2 h-4 w-4" /> Ver comprovante</DropdownMenuItem>}
            {l.origem !== "transferencia" && <DropdownMenuItem onSelect={() => setAnexosPara(l)}><Files className="mr-2 h-4 w-4" /> Anexos</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => editar(l)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setApagando(l)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  }

  // A linha de abertura da lista ("Saldo inicial · até 01/10/26"), igual no papel e na tela. Pedido da Telma (16/09/2026): "insira a linha de saldo inicial para o primeiro
  // lançamento, para que o saldo corresponda corretamente" — o extrato de banco sempre abre com "SALDO ANTERIOR". Só com a lista completa (ver `listaCompletaDaTela`): com filtro a
  // coluna Saldo é "a soma do que apareceu", e um saldo inicial ao lado de uma lista recortada seria mais confuso que útil. Sem seleção nem ações — não é um lançamento.
  // Na tela só na página 1 (na 2+ o saldo de partida é a última linha da página anterior); a impressão traz o período inteiro e repete sempre.
  const linhaSaldoInicial = (
    <tr className="border-t bg-muted/20 text-muted-foreground italic">
      <td className="py-1.5 px-2 print:hidden"></td>
      <td className="py-1.5 px-2" colSpan={2}>
        {col.has("saldo")
          ? <>Saldo inicial · até {dataBr(inicioEfetivo)}</>
          : <>Saldo inicial: {brl(saldoAntesDoPeriodo)} · até {dataBr(inicioEfetivo)}</>}
      </td>
      {colunasDoMeio.map(c => <td key={c.id} className="py-1.5 px-2"></td>)}
      <td className="py-1.5 px-2 text-right tabular-nums"></td>
      {col.has("saldo") && (
        <td className="py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap">{brl(saldoAntesDoPeriodo)}</td>
      )}
      <td className="py-1.5 px-1 sticky right-0 bg-muted/20 print:hidden"></td>
    </tr>
  );

  const botaoIcone = "sm:w-auto w-8 px-0 sm:px-3"; // ações secundárias do cabeçalho: só o ícone no celular
  const temFiltroAtivo = filtroTipo !== "todos" || situacao !== "todas" || !!filtroCategoriaId || !!filtroCentroCustoId
    || !!filtroValorMinTexto.trim() || !!filtroValorMaxTexto.trim() || !!filtroDataEspecifica;

  return (
    <div className="relatorio-page p-3 md:p-5 max-w-[120rem] mx-auto space-y-2 md:space-y-3 print:max-w-full print:p-0">
      {/* Impressão — o escape do <main> e o `overflow-x-auto` da tabela
          agora são globais (src/index.css, "IMPRESSÃO — padrão único",
          01/10/2026). `table-layout: fixed` continua AQUI, não virou regra
          geral — achado em 16/09/2026 ("Saldo" cortado num PDF real) e só
          funciona bem porque cada `<th>` desta tabela já tem largura
          própria (a única sem largura é Descrição, que absorve o resto);
          forçado em tabela sem isso, espreme a coluna de rótulo (testado
          ao vivo, revertido — ver src/index.css). Paisagem A4 continua
          específica daqui.
          A área rolável da lista (`.extrato-scroll`, altura medida na tela) vira papel corrido; a tabela aparece sempre e a lista de cartões do celular nunca. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm 1.2cm; }
          .relatorio-page table { table-layout: fixed !important; }
          .relatorio-page .extrato-scroll { max-height: none !important; overflow: visible !important; }
          .relatorio-page .extrato-tabela { display: block !important; }
          .relatorio-page .extrato-lista-celular { display: none !important; }
        }
      `}</style>

      {/* Tudo acima da lista: a altura dele é medida (ResizeObserver) para a lista ocupar o resto da tela. */}
      <div ref={setTopoEl} className="space-y-2 md:space-y-3">
      {/* UMA barra de cabeçalho (21/10/2026): conta + saldo, abas e ações — eram duas linhas e as abas embaixo. A borda inferior é a linha onde as abas "sentam". Só na tela. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b print:hidden">
        <div className="flex min-w-0 flex-wrap items-end gap-x-5">
          <div className="min-w-0 pb-1">
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
                  {isTodasContas ? "Todas as Contas" : conta?.nome}
                  {conta && <Badge variant="outline" className="text-xs font-sans font-normal">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* "Todas as Contas" (pedido dela, 30/09/2026, vendo a
                  "Movimentação de Contas" do Omie) — visão consolidada,
                  mesmo sentinel de `ExtratoContaDrawer`, adaptado pra URL
                  (ver comentário de `isTodasContas` no topo do arquivo). */}
              <SelectItem value="todas">
                <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Todas as Contas</span>
              </SelectItem>
              {contas.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    {iconeConta(c, "w-3.5 h-3.5")}
                    {c.nome}
                    <span className="text-xs text-muted-foreground">{CONTA_TIPO_LABEL[c.tipo]}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {conta && (
            <p className="text-xs text-muted-foreground truncate">
              Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
            </p>
          )}
          </div>
          {/* Fase D (20/10/2026): Extrato · Conciliação · Diagnóstico · Importações — as abas da conta (só nas contas que têm mais de uma; "Todas as Contas" não tem) */}
          {!isTodasContas && conta && <AbasDaConta contaId={contaId} tipo={conta.tipo} aba="extrato" />}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap pb-1.5">
        {/* Barra de ações da seleção em massa (item 2, "PRIORIDADE MÁXIMA"
            22/09/2026) — aparece assim que qualquer linha é marcada.
            "Conciliar" só conta o subconjunto `realizado` da seleção (ver
            `selecionadosConciliaveis`); "Excluir" vale pra seleção inteira,
            qualquer situação. */}
        {selecionados.size > 0 && (
          <>
            {selecionadosConciliaveis.length > 0 && (
              <Button variant="success" size="sm" onClick={conciliarSelecionados} disabled={conciliando || excluindoLoteBusy} className="gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                {conciliando ? "..." : `Conferir ${selecionadosConciliaveis.length}`}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setApagandoLote(true)} disabled={conciliando || excluindoLoteBusy}
              className="gap-1.5 text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" />
              {`Excluir ${selecionados.size}`}
            </Button>
            {/* Só aparece enquanto sobrar algo fora da seleção — some
                sozinho assim que "selecionar todo o período" já pegou
                tudo, sem precisar de um segundo clique pra notar que não
                tem mais nada a fazer. */}
            {selecionados.size < lancamentosOrdenados.length && (
              <button type="button" onClick={selecionarPeriodoInteiro} disabled={conciliando || excluindoLoteBusy}
                className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 whitespace-nowrap">
                Selecionar os {lancamentosOrdenados.length} do período
              </button>
            )}
          </>
        )}
        {/* Importar arquivo (OFX no banco, fatura no cartão): UM botão, o mesmo do cabeçalho das outras abas da conta (`BotaoDeImportar`) — 21/10/2026.
            Pede uma conta-alvo certa: some em "Todas as Contas". */}
        {!isTodasContas && conta && <BotaoDeImportar contaId={contaId} contaNome={conta.nome} tipo={conta.tipo} onSaved={carregar} compacto />}
        {!isTodasContas && (
          <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className={`gap-1.5 text-info-text hover:text-info-text ${botaoIcone}`} title="Transferir" aria-label="Transferir">
            <ArrowRightLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Transferir</span>
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()} className={`gap-1.5 ${botaoIcone}`} title="Imprimir / PDF" aria-label="Imprimir / PDF">
          <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Imprimir / PDF</span>
        </Button>
        <Button variant="gold" size="sm" onClick={() => { setEditando(null); setNovoOpen(true); }} className="gap-1.5">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo lançamento</span><span className="sm:hidden">Novo</span>
        </Button>
        </div>
      </div>

      {/* Cabeçalho imprimível — mesmo padrão de financas/DashboardExecutivo.tsx */}
      <div className="avoid-break hidden print:block text-center mb-3 pb-3 border-b-2 border-gold/30">
        <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
        <h2 className="font-serif text-lg mt-1">Extrato — {conta?.nome ?? "Todas as Contas"}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {/* "Só vencidos" não tem chão de data (`inicioEfetivo` vazio) — não
              é uma faixa contínua pra ler como "de X a Y". */}
          {inicioEfetivo ? <>{dataBr(inicioEfetivo)} a {dataBr(fimEfetivo)}</> : <>Previstos vencidos até {dataBr(fimEfetivo)}</>}
          {conta && <>{" "}· Saldo atual: <strong>{brl(Number(conta.saldo_atual))}</strong></>}
          {" "}· Gerado em {new Date().toLocaleString("pt-BR")}
        </p>
        {busca.trim().length >= 2 && <p className="text-xs text-muted-foreground">Busca: “{busca.trim()}”</p>}
      </div>

      {/* UMA barra de consulta (21/10/2026): Data inicial – Data final + atalhos · busca · Filtros (n) · Colunas · Atualizar. Eram oito controles em duas linhas (160 px); `CampoData`
          (digitar + calendário, sem `<input type="date">` nativo — teclado quebrado em WebView) continua nos dois campos de data, com a regra do par de lib/intervaloDeDatas.ts. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
        <BarraDePeriodo inicio={dataInicio} fim={dataFim} desabilitado={consulta.ignoraDatas}
          onChange={(r) => { setDataInicio(r.inicio); setDataFim(r.fim); }} />
        <div className="relative min-w-[11rem] flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar descrição ou favorecido"
            className="h-8 text-base md:text-xs pl-8" placeholder="Buscar descrição ou favorecido…" />
        </div>
        <div className="flex items-center gap-1.5">
          <FiltrosAvancadosPopover valor={filtros} onChange={mudarFiltros} categorias={categoriasParaFiltro} centros={centros} />
          <ColunasPopover colunas={colunas} onChange={mudarColunas} todasContas={isTodasContas} />
          {/* Pedido da Telma (17/09/2026): recarregar sem precisar mexer na
              data — útil ao editar em outra aba/tela e voltar aqui. */}
          <Button type="button" variant="outline" size="icon" onClick={carregar} disabled={loading} className="h-8 w-8" title="Atualizar" aria-label="Atualizar">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Filtro ativo nunca fica escondido: um chip removível por filtro (e, no papel, a linha "Filtros: …"). */}
      <ChipsDeFiltros valor={filtros} onChange={mudarFiltros} categorias={categoriasParaFiltro} centros={centros} />

      {/* Resumo do período em UMA linha — "Só vencidos" não é uma faixa contínua (ver `consulta`), então saldo inicial/final não fazem sentido ali; mostra só contagem e total líquido. */}
      <ResumoEmLinha
        totais={{ saldoInicial: saldoAntesDoPeriodo, entradas: totalEntradasPeriodo, saidas: totalSaidasPeriodo, saldoFinal: saldoFinalPeriodo }}
        vencidos={situacao === "vencidos" ? { quantidade: lancamentosFiltrados.length, total: totalVencido } : undefined}
      />
      </div>

      {/* A lista. `<thead sticky top-0>` dentro de um `overflow-x-auto` sozinho NÃO gruda no scroll da página (a spec do CSS trava os dois eixos de overflow juntos e qualquer valor
          diferente de `visible` vira "contêiner de scroll" para o sticky) — por isso esta área TEM scroll próprio de verdade (`extrato-scroll`, altura medida em `alturaDaLista`) e o
          cabeçalho cola nele, que é onde o olho espera. Impressão ignora tudo isso (regras no `<style>` acima). */}
      <Card className="overflow-hidden">
        <div ref={setListaEl} className="extrato-scroll overflow-auto"
          style={{ maxHeight: !isMobile && alturaDaLista ? `${alturaDaLista}px` : undefined }}>
          {/* A causa de verdade do popover "fechando sozinho" (achado ao
              vivo pela Telma, 22/09/2026): não era só falta de debounce —
              era ISTO. `loading` virava `true` a cada novo `carregar()`
              (filtro mudou, período mudou, "Atualizar") e trocava a
              TABELA INTEIRA por este spinner, desmontando o `<thead>` e
              qualquer popover de filtro aberto dentro dele junto. Corrigido
              só mostrando o spinner no carregamento de verdade (ainda sem
              nenhum lançamento em mãos); um recarregamento com dado
              anterior na tela mantém a tabela montada — as linhas trocam
              quando o novo lote chega, o `<thead>` e o que estiver aberto
              nele nunca somem no meio do caminho. */}
          {loading && lancamentos.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
            </div>
          ) : lancamentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              Nenhum lançamento no período. <button onClick={() => setNovoOpen(true)} className="text-primary underline">Criar o primeiro</button>
            </p>
          ) : lancamentosFiltrados.length === 0 ? (
            // Existe lançamento no período, mas o filtro de Valor/Data exata escondeu
            // todos — diferente de "período vazio", não faz sentido
            // oferecer "criar o primeiro" aqui.
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              Nenhum lançamento com os filtros atuais.{temFiltroAtivo ? " Remova algum filtro acima." : ""}
            </p>
          ) : (
            <>
              {/* Celular: lista de cartões (a tabela não cabe). Nunca no papel. */}
              <div className="extrato-lista-celular md:hidden print:hidden">
                <div className="flex items-center gap-2 border-b bg-muted px-2 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Checkbox checked={lancamentosPagina.length > 0 && lancamentosPagina.every(l => selecionados.has(l.id))}
                    onCheckedChange={alternarSelecionarTodos} aria-label="Selecionar todos os lançamentos desta página" />
                  Selecionar todos
                </div>
                <ul className="divide-y">
                  {listaCompletaDaTela && paginaAtual === 1 && (
                    <li className="flex items-baseline justify-between gap-2 bg-muted/20 px-2 py-1.5 text-xs italic text-muted-foreground">
                      <span>Saldo inicial · até {dataBr(inicioEfetivo)}</span>
                      <span className="tabular-nums font-medium">{brl(saldoAntesDoPeriodo)}</span>
                    </li>
                  )}
                  {comFechamentosCelular(lancamentosPagina)}
                </ul>
              </div>

              {/* Computador (e papel): a tabela, com as colunas escolhidas em ⚙ Colunas. */}
              <div className="extrato-tabela hidden md:block print:block">
                <table className="w-full text-xs">
                  {/* `sticky top-0` no `<thead>` (não em cada `th`) cola a linha inteira de títulos no topo da área rolável. Fundo OPACO (`bg-muted`): com 40% de
                      transparência a primeira linha aparecia por trás do cabeçalho ao rolar. `right-0` no `th` de Ações é o eixo horizontal do mesmo sticky, sem conflito.
                      `print:static` porque a impressão repete o cabeçalho por `page-break`. Os filtros por coluna (Data, Descrição, Valor) saíram: moram na barra e em ⚙ Filtros. */}
                  <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground print:static">
                    <tr>
                      <th className="w-8 py-2 print:hidden">
                        {/* Selecionar todos (item 2) — marca/desmarca as linhas da
                            PÁGINA atual (U3/F5, paginação: "todos" passou a ser
                            relativo à página visível, não ao período inteiro,
                            que pode ter centenas de linhas fora da tela). */}
                        {lancamentosPagina.length > 0 && (
                          <Checkbox
                            checked={lancamentosPagina.every(l => selecionados.has(l.id))}
                            onCheckedChange={alternarSelecionarTodos}
                            aria-label="Selecionar todos os lançamentos desta página"
                          />
                        )}
                      </th>
                      {/* Situação saiu de coluna própria (16/09/2026, pedido da
                          Telma: "mostre Data - Descrição/Favorecido - Categoria
                          - valor - saldo, como um extrato de banco msm") — a situação
                          (previsto/realizado/conciliado/cancelado) é a cor da própria
                          data, sem coluna e sem texto só pra isso. Deixou de ser clicável
                          em 22/09/2026 ("mantenha a conciliação apenas pela caixa de seleção"). */}
                      <th className="text-left py-2 px-2 w-24">Data</th>
                      <th className="text-left py-2 px-2">{col.has("favorecido") ? "Descrição" : "Descrição / Favorecido"}</th>
                      {colunasDoMeio.map(c => <th key={c.id} className={`text-left py-2 px-2 ${c.largura}`}>{c.rotulo}</th>)}
                      <th className="text-right py-2 px-2 w-28">Valor</th>
                      {col.has("saldo") && <th className="text-right py-2 px-2 w-28">Saldo</th>}
                      {/* Ações fixa na borda direita da área rolável — antes ficava
                          fora da tela em qualquer conta com muitas colunas visíveis,
                          obrigando rolar pra achar o lápis. Achado pela Telma em
                          13/09/2026. Some na impressão — lápis/lixeira/comprovante
                          não fazem sentido no papel. */}
                      <th className="w-28 sticky right-0 bg-muted print:hidden"></th>
                    </tr>
                  </thead>
                  {/* tbody de TELA — só a página atual (U3/F5, item de "90 Dias") */}
                  <tbody className="print:hidden">
                    {listaCompletaDaTela && paginaAtual === 1 && linhaSaldoInicial}
                    {comFechamentos(lancamentosPagina)}
                  </tbody>
                  {/* tbody só de IMPRESSÃO — período inteiro, nunca paginado */}
                  <tbody className="hidden print:table-row-group">
                    {listaCompletaDaTela && linhaSaldoInicial}
                    {comFechamentos(lancamentosOrdenados)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Paginação (U3/F5, roadmap "90 Dias") — mesmo padrão já usado em
          Membros.tsx: "Anterior/Próxima" + contagem "de-até de total". Só
          aparece com mais de uma página; com tudo cabendo numa página só,
          o texto simples de antes já bastava. */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted-foreground">
          {lancamentosFiltrados.length} lançamento{lancamentosFiltrados.length === 1 ? "" : "s"} no período
        </p>
        {totalPaginas > 1 && (
          <nav className="flex items-center gap-2" aria-label="Paginação do extrato">
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
              disabled={paginaAtual === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {inicioPagina + 1}–{Math.min(inicioPagina + POR_PAGINA, lancamentosOrdenados.length)} de {lancamentosOrdenados.length}
            </span>
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
              disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
              Próxima
            </Button>
          </nav>
        )}
      </div>

      {/* Dialogs */}
      {/* OFX/Fatura/Transferir pedem uma conta-alvo certa — só
          montam quando `contaId` é real (botão de abrir já some no modo
          "Todas as Contas", ver botões acima). `LancamentoForm` é o único
          que funciona sem: sem `contaIdPadrao`, o próprio campo Conta do
          formulário vira seletor, em vez de vir travado. */}
      {!isTodasContas && (
        <>
          <TransferenciaForm
            open={transfOpen}
            onOpenChange={setTransfOpen}
            contaOrigemPadrao={contaId}
            onSaved={carregar}
          />
        </>
      )}
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={isTodasContas ? undefined : contaId}
        lancamento={editando}
        onSaved={carregar}
      />
      <EditarTransferenciaForm
        open={!!editandoTransf}
        onOpenChange={(v) => !v && setEditandoTransf(null)}
        lancamento={editandoTransf}
        onSaved={carregar}
      />
      <DetalhesDoLancamento lancamento={detalhesDe} onFechar={() => setDetalhesDe(null)} onAnexos={setAnexosPara} />
      {anexosPara && (
        <AnexosLancamentoDialog
          open={!!anexosPara}
          onOpenChange={(v) => !v && setAnexosPara(null)}
          lancamentoId={anexosPara.id}
          descricaoLancamento={nomeExtrato(anexosPara).principal}
        />
      )}

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {apagando?.origem === "transferencia" ? "Excluir transferência?" : "Excluir lançamento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.descricao ? `"${apagando.descricao}"` : "Este lançamento"} — {apagando && brl(Number(apagando.valor))}.
              {/* Item 7 (22/09/2026): a exclusão agora apaga as duas pernas
                  juntas (ver `excluirLancamento` em finService.ts) — avisa
                  antes, pra não ser uma surpresa sumir um lançamento na
                  OUTRA conta sem ter sido selecionado aqui. */}
              {apagando?.origem === "transferencia" && " Isso também exclui a outra perna dessa transferência, na outra conta."}
              {" "}Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExcluir} disabled={excluindoBusy}>
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
              {/* Volume grande (seleção do período inteiro, 22/09/2026) —
                  mostra o intervalo de datas pra conferir de novo ANTES de
                  confirmar. Sem isso, um período errado no filtro de
                  cima vira uma exclusão em massa silenciosa. */}
              {selecionados.size > POR_PAGINA &&
                (inicioEfetivo
                  ? `Isso inclui todo o período filtrado — de ${dataBr(inicioEfetivo)} a ${dataBr(fimEfetivo)}. `
                  : "Isso inclui todos os vencidos em aberto filtrados, de qualquer época. ")}
              {/* Item 7 (22/09/2026) — mesmo aviso do diálogo individual:
                  se a seleção tiver alguma perna de transferência, a outra
                  perna (na conta irmã) some junto, mesmo sem estar
                  marcada aqui. */}
              {lancamentos.some(l => selecionados.has(l.id) && l.origem === "transferencia") &&
                "Alguma transferência selecionada — a outra perna dela, na outra conta, também será excluída. "}
              Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoLoteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExcluirSelecionados} disabled={excluindoLoteBusy}>
              {excluindoLoteBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
