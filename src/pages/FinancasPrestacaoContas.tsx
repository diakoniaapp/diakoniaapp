// ─── FinancasPrestacaoContas.tsx ─────────────────────────────────────────
//
// Projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md §8.3) —
// a grade que a tesouraria hoje monta à mão no Excel, gerada ao vivo de
// `fin_lancamentos` por `prestacaoContasService.gerarPrestacaoContas()`.
//
// Revisado em 12/09/2026 (pedido explícito): o período é MENSAL por
// padrão, e "trimestral" é só um preset de largura entre outros (1, 3, 6,
// 12 meses, ou um número escolhido à mão) — não mais o formato fixo da
// tela. `?ano=&mes=&qtd=` na URL, não parâmetro de rota — mesmo padrão que
// `Financas.tsx` já usa pra `?lancar=true`.
//
// Fase 7 (12/09/2026): exportação PDF/impressão e CSV. Mesmo padrão de
// `.relatorio-page` + `@media print` que `FinancasDRE.tsx` já usa —
// cabeçalho institucional, assinaturas, rodapé com o mesmo versículo —
// reaproveitado, não reinventado, pra ficar indistinguível do que a
// diretoria já reconhece nos outros documentos financeiros do sistema.
//
// "Relatório por caixa" (12/09/2026): filtro opcional por conta
// (`?conta=`). O fechamento de período continua sempre de TODAS as contas
// juntas — filtrar pra uma conta é só uma lente de leitura, não muda o que
// "Fechar período" trava — por isso os controles de fechamento somem
// quando há filtro de conta, com uma nota explicando por quê, em vez de
// deixar parecer que fechar ali fecharia só aquela conta.
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, MessageSquarePlus,
  ScrollText, Minus, Plus, Lock, LockOpen, ShieldCheck, Loader2, Printer, Download, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { brl, downloadCSV, listarContas, type FinConta } from "@/services/finService";
import {
  gerarPrestacaoContas, gerarCSVPrestacaoContas,
  type PrestacaoContasResultado, type PrestacaoContasGrupo,
} from "@/services/prestacaoContasService";
import {
  buscarFechamento, fecharPeriodo, aprovarPeriodo, reabrirPeriodo,
  type FinFechamentoPeriodo,
} from "@/services/fechamentoPeriodoService";
import { NotaRelatorioModal } from "@/components/financas/NotaRelatorioModal";
import { PaginaSkeleton } from "@/components/ListState";
import { hojeLocal, daquiAMeses } from "@/lib/data";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const STATUS_FECHAMENTO_LABEL: Record<string, string> = {
  aberto: "Aberto", em_revisao: "Em revisão", fechado: "Fechado", aprovado: "Aprovado",
};

const NOME_MES_ABREV = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const PRESETS_LARGURA = [
  { qtd: 1, label: "Mensal" },
  { qtd: 3, label: "Trimestral" },
  { qtd: 6, label: "Semestral" },
  { qtd: 12, label: "Anual" },
];

// Sentinela pro Select — Radix não aceita `value=""` num SelectItem, mesmo
// padrão já usado em prestacaoContasService.ts (`CENTRO_SEM`).
const TODAS_CONTAS = "__todas__";

function periodoAtual(): { ano: number; mes: number } {
  const [ano, mes] = hojeLocal().split("-").map(Number);
  return { ano, mes };
}

export default function FinancasPrestacaoContas() {
  const { user, hasRole } = useAuth();
  const souAdmin = hasRole("admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const padrao = periodoAtual();
  const ano = Number(searchParams.get("ano")) || padrao.ano;
  const mes = Number(searchParams.get("mes")) || padrao.mes;
  const qtdMeses = Math.min(24, Math.max(1, Number(searchParams.get("qtd")) || 1));
  const contaId = searchParams.get("conta") || "";

  const [dados, setDados] = useState<PrestacaoContasResultado | null>(null);
  const [fechamento, setFechamento] = useState<FinFechamentoPeriodo | null>(null);
  const [contas, setContas] = useState<FinConta[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");
  const [processando, setProcessando] = useState(false);
  const [confirmandoFechar, setConfirmandoFechar] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [nota, setNota] = useState<{
    aberto: boolean; titulo: string; categoriaId: string; centroCustoId: string | null;
  }>({ aberto: false, titulo: "", categoriaId: "", centroCustoId: null });

  async function carregar() {
    setLoading(true);
    try {
      const [resultado, fech] = await Promise.all([
        gerarPrestacaoContas(ano, mes, qtdMeses, contaId || undefined),
        // Fechamento é sempre de todas as contas juntas — não recebe
        // contaId, mesmo com filtro ativo (ver comentário no topo do arquivo).
        buscarFechamento(ano, mes, qtdMeses),
      ]);
      setDados(resultado);
      setFechamento(fech);
      if (contas.length === 0) setContas(await listarContas());
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
        setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar a prestação de contas.");
    } finally {
      setLoading(false);
    }
  }

  async function onFechar() {
    setProcessando(true);
    try {
      await fecharPeriodo(ano, mes, qtdMeses);
      toast.success("Período fechado — lançamentos travados para edição.");
      setConfirmandoFechar(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível fechar o período.");
    } finally {
      setProcessando(false);
    }
  }

  async function onAprovar() {
    if (!fechamento) return;
    setProcessando(true);
    try {
      await aprovarPeriodo(fechamento.id);
      toast.success("Período aprovado.");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aprovar o período.");
    } finally {
      setProcessando(false);
    }
  }

  async function onReabrir() {
    if (!fechamento || !motivoReabertura.trim()) return;
    setProcessando(true);
    try {
      await reabrirPeriodo(fechamento.id, motivoReabertura.trim());
      toast.success("Período reaberto.");
      setReabrindo(false);
      setMotivoReabertura("");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reabrir o período.");
    } finally {
      setProcessando(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ano, mes, qtdMeses, contaId]);

  // `contaId` viaja junto por padrão (senão trocar de mês derrubaria o
  // filtro de conta sem avisar) — só quem quer trocar a conta passa
  // explicitamente.
  function atualizarParams(novoAno: number, novoMes: number, novaQtd: number, novaContaId = contaId) {
    const params: Record<string, string> = { ano: String(novoAno), mes: String(novoMes), qtd: String(novaQtd) };
    if (novaContaId) params.conta = novaContaId;
    setSearchParams(params);
  }

  function deslocarPeriodo(passosDeMes: number) {
    const [a, m] = daquiAMeses(`${ano}-${String(mes).padStart(2, "0")}-01`, passosDeMes).split("-").map(Number);
    atualizarParams(a, m, qtdMeses);
  }

  function mudarLargura(novaQtd: number) {
    atualizarParams(ano, mes, Math.min(24, Math.max(1, novaQtd)));
  }

  function mudarConta(novaContaId: string) {
    atualizarParams(ano, mes, qtdMeses, novaContaId === TODAS_CONTAS ? "" : novaContaId);
  }

  function abrirNota(titulo: string, categoriaId: string, centroCustoId: string | null) {
    setNota({ aberto: true, titulo, categoriaId, centroCustoId });
  }

  function exportarCSV() {
    if (!dados) return;
    const sufixoConta = contaAtual ? `_${contaAtual.nome.replace(/\s+/g, "")}` : "";
    downloadCSV(`QIBRJ_Prestacao_de_Contas_${ano}${String(mes).padStart(2, "0")}_${qtdMeses}m${sufixoConta}.csv`, gerarCSVPrestacaoContas(dados));
    toast.success("CSV exportado");
  }

  const contaAtual = contas.find(c => c.id === contaId) ?? null;

  if (loading) return <PaginaSkeleton />;
  if (!dados) return <div className="p-8 text-center text-muted-foreground">Não foi possível carregar.</div>;

  const primeiro = dados.meses[0];
  const ultimo = dados.meses[dados.meses.length - 1];
  const rotuloPeriodo = qtdMeses === 1
    ? `${primeiro.nome} · ${primeiro.ano}`
    : primeiro.ano === ultimo.ano
      ? `${NOME_MES_ABREV[primeiro.numero]}–${NOME_MES_ABREV[ultimo.numero]} · ${primeiro.ano}`
      : `${NOME_MES_ABREV[primeiro.numero]}/${primeiro.ano}–${NOME_MES_ABREV[ultimo.numero]}/${ultimo.ano}`;
  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="bg-background min-h-screen">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1.2cm 1.5cm; }
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
          .avoid-break { page-break-inside: avoid; }
          /* Botão de nota some no papel — o \`.no-print\` de fora já sumia
             sozinho (fora de .relatorio-page, pego pela regra de visibility
             acima); este está DENTRO da página impressa, por isso precisa
             da própria regra. */
          .relatorio-page .no-print { display: none !important; }
        }
      `}</style>

      {/* Barra de controles — período, fechamento, exportação */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-5xl mx-auto px-4 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/financas"><ArrowLeft className="w-3.5 h-3.5" /> Contas correntes</Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => deslocarPeriodo(-1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-sm font-medium px-1 min-w-36 text-center">{rotuloPeriodo}</span>
              <Button size="sm" variant="outline" onClick={() => deslocarPeriodo(1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button onClick={exportarCSV} size="sm" variant="outline" className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button onClick={() => window.print()} size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
                <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
              </Button>
            </div>
          </div>

          {/* "Relatório por caixa" — filtro opcional por conta. Some tudo
              junto por padrão (sempre foi assim); escolher uma conta aqui
              restringe a demonstração inteira só ao que se moveu nela. */}
          <div className="flex items-center justify-center gap-1.5">
            <Wallet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Select value={contaId || TODAS_CONTAS} onValueChange={mudarConta}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue placeholder="Todas as contas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS_CONTAS}>Todas as contas</SelectItem>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center gap-1 flex-wrap">
            {PRESETS_LARGURA.map(p => (
              <Button
                key={p.qtd}
                size="sm"
                variant={qtdMeses === p.qtd ? "default" : "outline"}
                className={qtdMeses === p.qtd ? "bg-gold hover:bg-gold/90 text-white" : ""}
                onClick={() => mudarLargura(p.qtd)}
              >
                {p.label}
              </Button>
            ))}
            <div className="flex items-center gap-0.5 ml-1 border rounded-md">
              <Button size="sm" variant="ghost" className="px-2" onClick={() => mudarLargura(qtdMeses - 1)} disabled={qtdMeses <= 1}>
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-xs w-14 text-center tabular-nums">{qtdMeses} {qtdMeses === 1 ? "mês" : "meses"}</span>
              <Button size="sm" variant="ghost" className="px-2" onClick={() => mudarLargura(qtdMeses + 1)} disabled={qtdMeses >= 24}>
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {!contaId && (
              <>
                <span className="mx-1 text-border">|</span>

                <StatusIcone status={fechamento?.status ?? "aberto"} />
                <Badge variant="outline" className={CLASSE_BADGE[fechamento?.status ?? "aberto"]}>
                  {STATUS_FECHAMENTO_LABEL[fechamento?.status ?? "aberto"]}
                </Badge>
                {(!fechamento || fechamento.status === "aberto" || fechamento.status === "em_revisao") && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConfirmandoFechar(true)}>
                    <Lock className="w-3.5 h-3.5" /> Fechar período
                  </Button>
                )}
                {fechamento?.status === "fechado" && souAdmin && (
                  <Button size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white" onClick={onAprovar} disabled={processando}>
                    <ShieldCheck className="w-3.5 h-3.5" /> Aprovar
                  </Button>
                )}
                {(fechamento?.status === "fechado" || fechamento?.status === "aprovado") && souAdmin && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReabrindo(true)}>
                    <LockOpen className="w-3.5 h-3.5" /> Reabrir
                  </Button>
                )}
              </>
            )}
          </div>
          {!contaId && (fechamento?.status === "fechado" || fechamento?.status === "aprovado") && (
            <p className="text-xs text-muted-foreground text-center">
              Lançamentos deste período estão travados para edição
              {fechamento.fechado_em && ` — fechado em ${new Date(fechamento.fechado_em).toLocaleDateString("pt-BR")}`}.
            </p>
          )}
          {contaId && (
            <p className="text-xs text-muted-foreground text-center">
              Fechamento sempre considera todas as contas juntas — volte para "Todas as contas" para fechar o período.
            </p>
          )}
        </div>
      </div>

      {/* PÁGINA DO RELATÓRIO */}
      <div className="relatorio-page max-w-5xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
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
            {fechamento && (fechamento.status === "fechado" || fechamento.status === "aprovado") && (
              <p className="text-gold font-medium">{STATUS_FECHAMENTO_LABEL[fechamento.status]}</p>
            )}
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold flex items-center justify-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" /> Prestação de Contas
          </p>
          <h1 className="font-serif text-3xl mt-2">{rotuloPeriodo}</h1>
          {contaAtual && (
            <p className="text-sm text-gold mt-1 flex items-center justify-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" /> {contaAtual.nome}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {dados.qtdLancamentos} lançamento{dados.qtdLancamentos !== 1 ? "s" : ""} · realizados/conciliados
          </p>
        </div>

        <section className="mb-6 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left font-medium py-1.5"></th>
                {dados.meses.map((m, i) => (
                  <th key={i} className="text-right font-medium py-1.5 uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    {m.nome}{m.ano !== dados.meses[0].ano ? `/${m.ano}` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LinhaTotal titulo="Saldo Anterior" valores={dados.saldoAnterior} />

              <LinhaSecao titulo="Receitas" />
              {dados.gruposReceita.length === 0 ? (
                <LinhaVazia texto="Sem receitas oficiais no período." colSpan={dados.meses.length + 1} />
              ) : dados.gruposReceita.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={null} onNota={abrirNota} corTotal="text-success-text" />
              ))}
              <LinhaTotal titulo="Total Receitas" valores={dados.totalReceitas} destaque cor="text-success-text" />

              <LinhaSecao titulo="Despesas" />
              {dados.gruposDespesaPorCentro.length === 0 ? (
                <LinhaVazia texto="Sem despesas oficiais no período." colSpan={dados.meses.length + 1} />
              ) : dados.gruposDespesaPorCentro.map(g => (
                <Bloco key={g.chave} grupo={g} centroCustoId={g.chave === "__sem_centro__" ? null : g.chave} onNota={abrirNota} corTotal="text-destructive-text" />
              ))}
              <LinhaTotal titulo="Total Despesas" valores={dados.totalDespesas} destaque cor="text-destructive-text" />

              {dados.grupoDespesasFinanceiras && (
                <>
                  <LinhaSecao titulo="Despesas Financeiras" />
                  <Bloco grupo={dados.grupoDespesasFinanceiras} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}
              {dados.grupoOutrasDespesas && (
                <>
                  <LinhaSecao titulo="Outras Despesas" />
                  <Bloco grupo={dados.grupoOutrasDespesas} centroCustoId={null} onNota={abrirNota}
                    corTotal="text-destructive-text" semSubtotalProprio />
                </>
              )}

              <LinhaTotal titulo="Resultado do Período" valores={dados.resultado} destaque forte
                cor={dados.resultado.every(v => v >= 0) ? "text-success-text" : undefined} />
              <LinhaTotal titulo="Saldo Final" valores={dados.saldoFinal} destaque />
            </tbody>
          </table>
        </section>

        {dados.qtdForaDoPlanoOficial > 0 && (
          <p className="avoid-break text-xs text-muted-foreground italic mb-6">
            {dados.qtdForaDoPlanoOficial} lançamento{dados.qtdForaDoPlanoOficial !== 1 ? "s" : ""} do período não
            {dados.qtdForaDoPlanoOficial !== 1 ? " entraram" : " entrou"} nesta demonstração — sem categoria do
            Plano de Contas Oficial, ou é transferência entre contas próprias.
          </p>
        )}

        {/* Assinaturas */}
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

      <NotaRelatorioModal
        open={nota.aberto}
        onOpenChange={(v) => setNota(n => ({ ...n, aberto: v }))}
        titulo={nota.titulo}
        ano={dados.mesAncoraNota.ano}
        mes={dados.mesAncoraNota.mes}
        categoriaId={nota.categoriaId}
        centroCustoId={nota.centroCustoId}
        onSalvo={carregar}
      />

      <AlertDialog open={confirmandoFechar} onOpenChange={(v) => !processando && setConfirmandoFechar(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar {rotuloPeriodo}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todo lançamento realizado ou conciliado deste período trava para edição e exclusão.
              Isso pode ser desfeito depois (um administrador pode reabrir, com motivo registrado),
              mas não é o passo de todo dia — feche quando o período estiver revisado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onFechar} disabled={processando} className="gap-1.5">
              {processando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Fechar período
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reabrir pede motivo, por isso é Dialog e não AlertDialog — mesmo padrão de FinancasAgenda.tsx */}
      <Dialog open={reabrindo} onOpenChange={(v) => { if (!processando) { setReabrindo(v); if (!v) setMotivoReabertura(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir {rotuloPeriodo}</DialogTitle>
            <DialogDescription>
              Destrava os lançamentos deste período para edição. O motivo fica registrado no
              histórico do fechamento, com data e hora.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoReabertura}
            onChange={(e) => setMotivoReabertura(e.target.value)}
            placeholder="Por que este período está sendo reaberto?"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" disabled={processando} onClick={() => { setReabrindo(false); setMotivoReabertura(""); }}>
              Cancelar
            </Button>
            <Button disabled={processando || !motivoReabertura.trim()} onClick={onReabrir} className="gap-1.5">
              {processando && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Reabrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusIcone({ status }: { status: string }) {
  if (status === "fechado" || status === "aprovado") return <Lock className="w-4 h-4 text-warning-text shrink-0" />;
  return <LockOpen className="w-4 h-4 text-muted-foreground shrink-0" />;
}

const CLASSE_BADGE: Record<string, string> = {
  aberto: "bg-muted text-muted-foreground border-border",
  em_revisao: "bg-info-soft text-info-text border-info-line",
  fechado: "bg-warning-soft text-warning-text border-warning-line",
  aprovado: "bg-success-soft text-success-text border-success-line",
};

function LinhaSecao({ titulo }: { titulo: string }) {
  return (
    <tr>
      <td colSpan={99} className="pt-4 pb-1">
        <h3 className="font-serif text-sm text-gold uppercase tracking-wide">{titulo}</h3>
      </td>
    </tr>
  );
}

function LinhaVazia({ texto, colSpan }: { texto: string; colSpan: number }) {
  return <tr><td colSpan={colSpan} className="py-1.5 text-muted-foreground italic">{texto}</td></tr>;
}

function LinhaTotal({ titulo, valores, destaque, forte, cor }: {
  titulo: string; valores: number[]; destaque?: boolean; forte?: boolean; cor?: string;
}) {
  return (
    <tr className={destaque ? `border-t-2 border-gold/40 font-semibold ${forte ? "text-sm" : ""}` : "text-muted-foreground"}>
      <td className={`py-1.5 ${destaque ? "uppercase tracking-wide" : ""}`}>{titulo}</td>
      {valores.map((v, i) => (
        <td key={i} className={`py-1.5 text-right tabular-nums whitespace-nowrap ${cor ?? ""}`}>{brl(v)}</td>
      ))}
    </tr>
  );
}

function Bloco({ grupo, centroCustoId, onNota, corTotal, semSubtotalProprio }: {
  grupo: PrestacaoContasGrupo;
  centroCustoId: string | null;
  onNota: (titulo: string, categoriaId: string, centroCustoId: string | null) => void;
  corTotal: string;
  semSubtotalProprio?: boolean;
}) {
  return (
    <>
      {!semSubtotalProprio && (
        <tr className="border-b border-border/40">
          <td className="py-1 font-medium">{grupo.titulo}</td>
          {grupo.valores.map((v, i) => (
            <td key={i} className={`py-1 text-right tabular-nums whitespace-nowrap font-medium ${corTotal}`}>{brl(v)}</td>
          ))}
        </tr>
      )}
      {grupo.linhas.map(l => (
        <tr key={l.categoriaId} className="border-b border-border/20 text-muted-foreground group">
          <td className="py-0.5 pl-4">
            <button
              type="button"
              onClick={() => onNota(`${l.nome} · ${grupo.titulo}`, l.categoriaId, centroCustoId)}
              className="no-print inline-flex items-center gap-1 hover:text-foreground transition-colors"
              title={l.temNota ? "Ver/editar nota" : "Adicionar nota"}
            >
              {l.nome}
              {l.temNota
                ? <MessageSquare className="w-3 h-3 text-gold shrink-0" />
                : <MessageSquarePlus className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />}
            </button>
            <span className="hidden print:inline">
              {l.nome}{l.temNota ? " 💬" : ""}
            </span>
          </td>
          {l.valores.map((v, i) => (
            <td key={i} className="py-0.5 text-right tabular-nums whitespace-nowrap">{v === 0 ? "—" : brl(v)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
