import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import {
  ArrowLeft, DollarSign, Loader2, Plus, Search, Filter,
  TrendingUp, TrendingDown, Pencil, Trash2, Paperclip,
  CheckCircle2, Clock, XCircle, Scale, FileUp, Printer,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentosSemTeto, excluirLancamento, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL,
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
  const [conta, setConta] = useState<FinConta | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  // "transferencia" não é um `FinMovimentoTipo` (transferência grava uma
  // perna entrada e outra saída) — pedido da Telma em 15/09/2026 pra
  // filtrar só essas pernas, então o Select trata como uma 4ª opção que
  // vira `apenasTransferencia` em `listarLancamentos`, não `tipo`.
  const [filtroTipo, setFiltroTipo] = useState<FinMovimentoTipo | "transferencia" | "todos">("todos");
  const [busca, setBusca] = useState("");
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

  // Período do filtro — mês atual por default
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [dataFim, setDataFim] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)
  );

  useEffect(() => { carregar(); }, [contaId, filtroTipo, dataInicio, dataFim, busca]);

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
          dataInicio, dataFim,
          busca: busca.length >= 2 ? busca : undefined,
        }),
        saldoAcumuladoAntesDe(dataInicio, contaId),
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

  async function conciliarSelecionados() {
    if (selecionados.size === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(Array.from(selecionados));
      toast.success(`${selecionados.size} lançamento${selecionados.size > 1 ? "s" : ""} conciliado${selecionados.size > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setConciliando(false); }
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
            left: 0 !important; top: 0 !important;
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
      <div className="flex items-center gap-2 flex-wrap print:hidden">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 text-gold" />
            {conta.nome}
            <Badge variant="outline" className="text-xs">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>
          </h1>
          <p className="text-xs text-muted-foreground">
            Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
          </p>
        </div>
        {selecionados.size > 0 && (
          <Button size="sm" onClick={conciliarSelecionados} disabled={conciliando}
            className="gap-1.5 bg-success hover:bg-success text-white">
            <Scale className="w-3.5 h-3.5" />
            {conciliando ? "..." : `Conciliar ${selecionados.size}`}
          </Button>
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

      {/* Cabeçalho imprimível — mesmo padrão de financas/DashboardExecutivo.tsx */}
      <div className="avoid-break hidden print:block text-center mb-3 pb-3 border-b-2 border-gold/30">
        <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
        <h2 className="font-serif text-lg mt-1">Extrato — {conta.nome}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {dataBr(dataInicio)} a {dataBr(dataFim)} · Saldo atual: <strong>{brl(Number(conta.saldo_atual))}</strong>
          {" "}· Gerado em {new Date().toLocaleString("pt-BR")}
        </p>
      </div>

      {/* Filtros */}
      <Card className="print:hidden">
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          {/* min-w-0 — sem isso, o item do grid não encolhe abaixo da
              largura mínima do `<input type="date">` nativo (os segmentos
              dd/mm/aaaa + ícone de calendário do navegador), e a caixa
              estoura a coluna em telas estreitas. Mesmo transbordo já
              documentado no CLAUDE.md (§6.2) — achado pela Telma
              (15/09/2026) neste filtro.
              min/max — sem isso, o WebView deixa o segmento de ANO crescer
              sem limite de dígitos ao digitar/corrigir (ex.: "26666"),
              estourando a própria caixa por dentro — um transbordo
              diferente do de cima, que não some com min-w-0. Achado ao
              vivo pela Telma (16/09/2026), com print mostrando exatamente
              esse valor no ano. */}
          <div className="min-w-0">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <Input type="date" value={dataInicio} onChange={(e) => {
              const v = e.target.value;
              setDataInicio(v);
              // Pedido da Telma (16/09/2026): escolher uma inicial depois da
              // final deixava o período invertido (extrato vazio, sem
              // aviso — só "Entradas R$ 0,00" e "Saídas R$ 0,00" confusos).
              // Em vez de deixar o usuário descobrir isso pela lista vazia,
              // empurra a final pra igualar a nova inicial.
              if (v > dataFim) setDataFim(v);
            }} min="2000-01-01" max="2099-12-31" className="h-8 text-xs w-full" />
          </div>
          <div className="min-w-0">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data final</label>
            <Input type="date" value={dataFim} onChange={(e) => {
              const v = e.target.value;
              // `min` no input só marca :invalid — não impede o onChange de
              // disparar com uma data anterior à inicial (achado pela
              // Telma ao digitar direto no campo final: o atributo min não
              // bloqueia digitação manual, só a UI do seletor nativo).
              // Por isso a guarda tem que estar aqui também, simétrica à
              // da Data inicial.
              setDataFim(v < dataInicio ? dataInicio : v);
            }} min={dataInicio} max="2099-12-31" className="h-8 text-xs w-full" />
          </div>
          <div>
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
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Buscar descrição</label>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Digite..." />
            </div>
          </div>
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
                  <th className="w-8 print:hidden"></th>
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
                  <th className="text-left py-2 px-2 w-36">Categoria</th>
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
                    <td className="py-1.5 px-2">até {dataBr(dataInicio)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums"></td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-medium">{brl(saldoAntesDoPeriodo)}</td>
                    <td className="py-1.5 px-1 sticky right-0 bg-muted/20 print:hidden"></td>
                  </tr>
                )}
                {lancamentosOrdenados.map(l => {
                  const conciliavel = l.status === "realizado" || l.status === "conciliado";
                  return (
                  <tr key={l.id} className="border-t hover:bg-muted/30 group">
                    <td className="py-1.5 px-2 print:hidden">
                      {l.status === "realizado" && (
                        <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
                          aria-label={`Selecionar ${l.descricao ?? "lançamento"} para conciliar`} />
                      )}
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
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
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
    </div>
  );
}
