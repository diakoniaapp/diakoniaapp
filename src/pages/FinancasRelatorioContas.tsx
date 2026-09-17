// ─── FinancasRelatorioContas.tsx ────────────────────────────────────────
//
// Pedido da Telma (16/09/2026): "crie IMPRIMIR os relatórios das contas,
// filtrando por escolha de conta, e escolha de datas... hoje temos
// impressão isolada em cada conta, mas quero a opção de visualizar o
// extrato completo das contas, filtrando quais quero visualizar e
// imprimir." Até aqui, `FinancasConta.tsx` só imprime UMA conta por vez
// (o botão Imprimir/PDF dentro da própria tela da conta). Esta tela
// combina várias contas escolhidas num único documento — uma seção de
// extrato por conta, com saldo acumulado próprio, no mesmo período.
// Aberta a partir do diálogo "Imprimir" em `Financas.tsx` (Contas
// correntes), que monta a query string ?contas=id1,id2&inicio=...&fim=....
//
// Reaproveita o MESMO padrão de impressão dos outros relatórios do
// sistema (cabeçalho institucional, `.relatorio-page` com
// `position:absolute` + `visibility` pra escapar do layout do AppLayout,
// `avoid-break`) e o mesmo cálculo de saldo acumulado de
// `FinancasConta.tsx` (`saldoAcumuladoAntesDe` + linha "Saldo inicial"
// por conta, pedida na mesma sessão) — não um relatório novo do zero.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Printer, Download, TrendingUp, TrendingDown, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  listarContas, listarLancamentosSemTeto, gerarCSV, downloadCSV, brl,
  CONTA_TIPO_LABEL,
  type FinConta, type FinLancamentoExtenso,
} from "@/services/finService";
import { saldoAcumuladoAntesDe } from "@/services/prestacaoContasService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Mesma ordem de leitura que `FinancasConta.tsx` já usa no extrato de uma
// conta só (cronológica, mais antigo primeiro; na mesma data, entrada
// antes de saída — pra não mostrar um mergulho negativo artificial num
// dia em que a transferência que cobre a despesa só teria `created_at`
// depois dela). Duplicado aqui de propósito, não extraído pra um util
// compartilhado: o padrão do repositório (`CLAUDE.md` §4.1) é lógica de
// tela ficar na tela, e as duas telas já divergem no que fazem com o
// resultado (uma mostra ações por linha, a outra soma por seção).
function ordenarLancamentos(lancs: FinLancamentoExtenso[]): FinLancamentoExtenso[] {
  return [...lancs].sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    if (a.tipo !== b.tipo) return a.tipo === "entrada" ? -1 : 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

export default function FinancasRelatorioContas() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const contaIds = useMemo(
    () => (searchParams.get("contas") ?? "").split(",").filter(Boolean),
    [searchParams],
  );
  const hoje = new Date();
  const dataInicio = searchParams.get("inicio")
    ?? new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const dataFim = searchParams.get("fim")
    ?? new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [contas, setContas] = useState<FinConta[]>([]);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [saldosIniciais, setSaldosIniciais] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");

  useEffect(() => { carregar(); }, [searchParams]);

  async function carregar() {
    if (contaIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    try {
      const [todasContas, ls] = await Promise.all([
        listarContas(true),
        // Sem `contaId` — mesmo padrão de `gerarPrestacaoContas`
        // (`listarLancamentosSemTeto` sem filtro de conta busca TODAS de
        // uma vez, sem teto de 300, e filtra em memória pras escolhidas)
        // — uma chamada só em vez de N em paralelo.
        listarLancamentosSemTeto({ dataInicio, dataFim }),
      ]);
      setContas(todasContas.filter(c => contaIds.includes(c.id)));
      // Só o que de fato aconteceu entra no extrato impresso — mesma
      // regra do malote mensal e da prestação de contas por centro de
      // custo (previsto/cancelado/aguardando aprovação não são dinheiro
      // que já circulou).
      setLancamentos(ls.filter(l =>
        contaIds.includes(l.conta_id) && (l.status === "realizado" || l.status === "conciliado")));

      const saldos = new Map<string, number>();
      await Promise.all(contaIds.map(async (id) => {
        saldos.set(id, await saldoAcumuladoAntesDe(dataInicio, id));
      }));
      setSaldosIniciais(saldos);

      if (user) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
        setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar relatório"); }
    finally { setLoading(false); }
  }

  function exportarCSV() {
    const csv = gerarCSV(lancamentos);
    downloadCSV(`QIBRJ_Extrato_${dataInicio}_a_${dataFim}.csv`, csv);
    toast.success("CSV exportado");
  }

  if (contaIds.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nenhuma conta selecionada. <Link to="/financas" className="text-primary underline">Voltar</Link>
      </div>
    );
  }
  if (loading) return <PaginaSkeleton />;

  const totalEntradas = lancamentos.filter(l => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidas = lancamentos.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);

  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-background min-h-screen">
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
          .relatorio-page table { width: 100% !important; table-layout: fixed !important; }
          .relatorio-page tr { page-break-inside: avoid; }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      {/* Barra de controles */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5"><Link to="/financas">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Link></Button>
          <span className="text-sm text-muted-foreground">
            {contas.length} conta{contas.length !== 1 ? "s" : ""} · {dataBr(dataInicio)} a {dataBr(dataFim)}
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <Button onClick={exportarCSV} size="sm" variant="outline" className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button onClick={() => window.print()} size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {/* PÁGINA DO RELATÓRIO */}
      <div className="relatorio-page max-w-6xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex flex-col items-center gap-1">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-14 w-auto object-contain"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }} draggable={false} />
            <div className="text-center">
              <h2 className="font-serif text-lg leading-tight">DiakoniaApp</h2>
              <p className="text-xs text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Gestão Ministerial
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hojeBr}</strong> às {horaBr}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Extrato consolidado de contas</p>
          <h1 className="font-serif text-3xl mt-2">
            {contas.length === 1 ? contas[0].nome : `${contas.length} contas`}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {dataBr(dataInicio)} a {dataBr(dataFim)} · {lancamentos.length} lançamento{lancamentos.length !== 1 ? "s" : ""} · realizados/conciliados
          </p>
        </div>

        <section className="avoid-break mb-6 p-5 rounded-md bg-gradient-verse border border-gold/30">
          <h3 className="text-xs uppercase tracking-wide text-gold mb-2 text-center">Demonstrativo consolidado</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase text-success-text flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Entradas
              </p>
              <p className="text-xl font-semibold text-success-text tabular-nums">{brl(totalEntradas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-destructive-text flex items-center justify-center gap-1">
                <TrendingDown className="w-3 h-3" /> Saídas
              </p>
              <p className="text-xl font-semibold text-destructive-text tabular-nums">{brl(totalSaidas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gold flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" /> Resultado
              </p>
              <p className={`text-xl font-semibold tabular-nums ${totalEntradas - totalSaidas >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                {totalEntradas - totalSaidas >= 0 ? "+" : ""}{brl(totalEntradas - totalSaidas)}
              </p>
            </div>
          </div>
        </section>

        {/* Uma seção de extrato por conta, cada uma com seu próprio saldo
            acumulado — não dá pra somar as linhas de contas diferentes
            numa coluna de saldo só, porque cada conta tem seu próprio
            saldo inicial e sua própria vida. */}
        {contas.map(conta => {
          const lancsConta = ordenarLancamentos(lancamentos.filter(l => l.conta_id === conta.id));
          const saldoInicial = saldosIniciais.get(conta.id) ?? 0;
          let acumulado = saldoInicial;
          const saldoPorLancamento = new Map<string, number>();
          for (const l of lancsConta) {
            acumulado += l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor);
            saldoPorLancamento.set(l.id, acumulado);
          }
          const entradasConta = lancsConta.filter(l => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0);
          const saidasConta = lancsConta.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);

          return (
            <section key={conta.id} className="mb-8">
              <div className="avoid-break flex items-baseline justify-between gap-3 mb-2 pb-1 border-b-2 border-gold/40">
                <h3 className="font-serif text-lg flex items-center gap-2">
                  {conta.nome}
                  <span className="text-xs font-sans font-normal text-muted-foreground uppercase tracking-wide">
                    {CONTA_TIPO_LABEL[conta.tipo]}
                  </span>
                </h3>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  Entradas <strong className="text-success-text">{brl(entradasConta)}</strong>
                  {" "}· Saídas <strong className="text-destructive-text">{brl(saidasConta)}</strong>
                  {" "}· Saldo final <strong>{brl(acumulado)}</strong>
                </p>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  {/* Só 5 colunas, igual `FinancasConta.tsx` (16/09/2026,
                      mesmo pedido: "como um extrato de banco msm") —
                      Situação virou ícone colado na data, Centro custo
                      saiu (continua no CSV, que exporta os lançamentos
                      crus com todos os campos). */}
                  <tr className="border-b-2 border-gold/40 text-left">
                    <th className="py-1 pr-1 w-16">Data</th>
                    <th className="py-1 pr-1">Descrição / Fornecedor</th>
                    {/* w-28 (112px) cortava nomes de categoria comuns
                        ("Rendimentos de Aplicações") — mesmo ajuste de
                        `FinancasConta.tsx` na mesma sessão (17/09/2026). */}
                    <th className="py-1 pr-1 w-40">Categoria</th>
                    {/* `w-20` (5rem) quebrava valores de 4 dígitos em duas
                        linhas ("+" numa linha, "R$ 1.285,00" na outra) —
                        achado ao vivo pela Telma num relatório com
                        dízimo de R$1.285. `w-24` + `whitespace-nowrap`
                        cobre até R$99.999,99 numa linha só. */}
                    <th className="py-1 pr-1 w-24 text-right">Valor</th>
                    <th className="py-1 pr-1 w-24 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Linha "Saldo inicial" — mesmo padrão pedido pra
                      `FinancasConta.tsx` na mesma sessão: mostra de onde o
                      acumulado da coluna Saldo começa, do jeito que um
                      extrato de banco de verdade sempre abre com "SALDO
                      ANTERIOR". */}
                  <tr className="border-b border-border/40 text-muted-foreground italic">
                    <td className="py-1 pr-1" colSpan={2}>Saldo inicial</td>
                    <td className="py-1 pr-1">até {dataBr(dataInicio)}</td>
                    <td className="py-1 pr-1 text-right"></td>
                    <td className="py-1 pr-1 text-right tabular-nums font-medium whitespace-nowrap">{brl(saldoInicial)}</td>
                  </tr>
                  {lancsConta.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-muted-foreground italic">
                        Nenhum lançamento realizado ou conciliado no período.
                      </td>
                    </tr>
                  ) : lancsConta.map(l => (
                    <tr key={l.id} className="border-b border-border/40">
                      {/* Sem ícone de situação aqui — diferente de
                          `FinancasConta.tsx`, este relatório já filtra só
                          realizado/conciliado no carregamento (ver
                          `carregar()`), então toda linha aqui É dinheiro
                          que já circulou; não há o que distinguir. */}
                      <td className="py-1 pr-1 whitespace-nowrap">{dataBr(l.data)}</td>
                      <td className="py-1 pr-1 truncate">
                        {l.descricao ?? "—"}
                        {l.fornecedor_nome && l.fornecedor_nome !== l.descricao && (
                          <span className="text-muted-foreground"> · {l.fornecedor_nome}</span>
                        )}
                      </td>
                      <td className="py-1 pr-1 text-muted-foreground truncate">{l.categoria_nome ?? "—"}</td>
                      <td className={`py-1 pr-1 text-right tabular-nums font-medium whitespace-nowrap ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                        {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                      </td>
                      <td className="py-1 pr-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">{brl(saldoPorLancamento.get(l.id) ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

        <section className="avoid-break mt-12 pt-4">
          <div className="grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Tesouraria</p>
                <p className="text-muted-foreground text-xs">Responsável pela conta</p>
              </div>
            </div>
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Conselho Fiscal</p>
                <p className="text-muted-foreground text-xs">Confere e aprova</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Tudo, porém, deve ser feito com decência e ordem."
          </p>
          <p className="text-xs text-gold tracking-wide mt-1">1 Coríntios 14:40</p>
        </footer>
      </div>
    </div>
  );
}
