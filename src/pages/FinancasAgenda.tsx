import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2,
  TrendingUp, TrendingDown, Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { PaginaSkeleton } from "@/components/ListState";
import {
  listarProximosVencimentos, confirmarPagamento, listarLancamentos,
  aprovarLancamento, rejeitarLancamento, brl,
  type FinVencimento, type FinLancamentoExtenso,
} from "@/services/finService";
import { hojeMaisDias } from "@/lib/data";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const URGENCIA_INFO: Record<FinVencimento["urgencia"], { cor: string; label: string }> = {
  vencido:      { cor: "text-destructive-text bg-destructive-soft border-destructive-line",        label: "Vencido" },
  vence_hoje:   { cor: "text-warning-text bg-warning-soft border-warning-line",      label: "Vence hoje" },
  urgente:      { cor: "text-warning-text bg-warning-soft/60 border-warning-line",   label: "Urgente" },
  esta_semana:  { cor: "text-info-text bg-info-soft border-info-line",         label: "Esta semana" },
  futuro:       { cor: "text-muted-foreground border-border",              label: "Futuro" },
};

export default function FinancasAgenda() {
  const [vencimentos, setVencimentos] = useState<FinVencimento[]>([]);
  // "Aguardando aprovação" é decisão, não vencimento — por isso não entra na
  // lista de cima (que é organizada por urgência de DATA). Carregada à
  // parte, sempre visível, independente do filtro Entrada/Saída de baixo:
  // uma aprovação parada não fica menos urgente por não bater com o filtro
  // do dia. Ver o comentário em `painelTesourariaService.listarPendencias`.
  const [aguardandoAprovacao, setAguardandoAprovacao] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entrada" | "saida">("saida");
  const [aprovando, setAprovando] = useState<FinLancamentoExtenso | null>(null);
  const [rejeitando, setRejeitando] = useState<FinLancamentoExtenso | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [decidindo, setDecidindo] = useState(false);

  useEffect(() => { carregar(); }, [filtroTipo]);

  async function carregar() {
    setLoading(true);
    try {
      const ate30 = hojeMaisDias(30);
      const [venc, pend] = await Promise.all([
        listarProximosVencimentos({
          ateData: ate30,
          tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
        }),
        listarLancamentos({ status: "aguardando_aprovacao" }),
      ]);
      setVencimentos(venc);
      setAguardandoAprovacao(pend);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function confirmar(v: FinVencimento) {
    if (!confirm(`Confirmar ${v.tipo === "saida" ? "pagamento" : "recebimento"} de ${brl(Number(v.valor))}?`)) return;
    try {
      await confirmarPagamento(v.id);
      toast.success(`${v.tipo === "saida" ? "Pago" : "Recebido"}!`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function confirmarAprovacao() {
    if (!aprovando) return;
    setDecidindo(true);
    try {
      await aprovarLancamento(aprovando.id);
      toast.success("Aprovado");
      setAprovando(null);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setDecidindo(false); }
  }

  async function confirmarRejeicao() {
    if (!rejeitando || !motivoRejeicao.trim()) return;
    setDecidindo(true);
    try {
      await rejeitarLancamento(rejeitando.id, motivoRejeicao);
      toast.success("Rejeitado");
      setRejeitando(null);
      setMotivoRejeicao("");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setDecidindo(false); }
  }

  // Agrupa por urgência
  const grupos: Record<string, FinVencimento[]> = { vencido: [], vence_hoje: [], urgente: [], esta_semana: [], futuro: [] };
  vencimentos.forEach(v => grupos[v.urgencia].push(v));

  const totalSaidas = vencimentos.filter(v => v.tipo === "saida").reduce((s, v) => s + Number(v.valor), 0);
  const totalEntradas = vencimentos.filter(v => v.tipo === "entrada").reduce((s, v) => s + Number(v.valor), 0);

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gold" /> Agenda Financeira
          </h1>
          <p className="text-xs text-muted-foreground">Próximos 30 dias — vencimentos e recebimentos previstos</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/financas/recorrencias">Gerenciar recorrências</Link></Button>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Mostrar:</span>
        {(["saida", "entrada", "todos"] as const).map(t => (
          <Button key={t} size="sm" variant={filtroTipo === t ? "default" : "outline"}
            onClick={() => setFiltroTipo(t)}
            className={
              filtroTipo === t
                ? t === "entrada" ? "bg-success hover:bg-success text-white" :
                  t === "saida"   ? "bg-destructive hover:bg-destructive text-white" : ""
                : ""
            }>
            {t === "saida" ? "A pagar" : t === "entrada" ? "A receber" : "Tudo"}
          </Button>
        ))}
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-destructive-soft/30 border-destructive-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> A pagar (30d)</p>
            <p className="text-base font-semibold text-destructive-text tabular-nums">{brl(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-success-soft/30 border-success-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-success-text flex items-center gap-1"><TrendingUp className="w-3 h-3" /> A receber (30d)</p>
            <p className="text-base font-semibold text-success-text tabular-nums">{brl(totalEntradas)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Aguardando aprovação ──────────────────────────────────────────
          Fica ANTES dos vencimentos por urgência: uma decisão parada não
          tem "dias para vencer" — ela só fica mais cara de resolver quanto
          mais espera. Ligado em 12/09/2026: o status já existia, o Painel
          da Tesouraria já listava, faltava o botão que decidisse. */}
      {aguardandoAprovacao.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground px-1 flex items-center gap-1">
            <Gavel className="w-3 h-3" /> Aguardando aprovação ({aguardandoAprovacao.length})
          </p>
          {aguardandoAprovacao.map(l => (
            <div key={l.id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-info-soft/40 border-info-line">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {l.tipo === "entrada"
                  ? <TrendingUp className="w-4 h-4 text-success-text shrink-0" />
                  : <TrendingDown className="w-4 h-4 text-destructive-text shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.descricao ?? "—"}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Clock className="w-2.5 h-2.5" /> {dataBr(l.data)}
                    {l.conta_nome && <> · {l.conta_nome}</>}
                    {l.centro_nome && <> · {l.centro_nome}</>}
                    {l.fornecedor_nome && <> · {l.fornecedor_nome}</>}
                  </p>
                </div>
              </div>
              <p className={`text-sm font-semibold tabular-nums mr-2 ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                {brl(Number(l.valor))}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setRejeitando(l)}
                  className="gap-1 h-7 text-xs text-destructive-text hover:text-destructive-text border-destructive-line hover:bg-destructive-soft">
                  <XCircle className="w-3 h-3" /> Rejeitar
                </Button>
                <Button size="sm" onClick={() => setAprovando(l)}
                  className="bg-success hover:bg-success text-white gap-1 h-7 text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Aprovar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {vencimentos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto opacity-30 text-success-text" />
            <p>Nenhum vencimento previsto nos próximos 30 dias.</p>
            <Link to="/financas/recorrencias" className="text-primary underline text-xs">
              Cadastrar recorrência →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(["vencido","vence_hoje","urgente","esta_semana","futuro"] as const).map(u => {
            const lista = grupos[u];
            if (lista.length === 0) return null;
            const info = URGENCIA_INFO[u];
            return (
              <div key={u} className="space-y-1.5">
                <p className="text-xs uppercase tracking-wide font-medium text-muted-foreground px-1">
                  {u === "vencido" && <AlertTriangle className="w-3 h-3 inline mr-1 text-destructive-text" />}
                  {info.label} ({lista.length})
                </p>
                {lista.map(v => (
                  <div key={v.id} className={`flex items-center justify-between border rounded-md px-3 py-2 ${info.cor}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {v.tipo === "entrada"
                        ? <TrendingUp className="w-4 h-4 text-success-text shrink-0" />
                        : <TrendingDown className="w-4 h-4 text-destructive-text shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{v.descricao ?? "—"}</p>
                        <p className="text-xs flex items-center gap-1.5">
                          <Clock className="w-2.5 h-2.5" /> {dataBr(v.data)}
                          {v.dias_para_vencer >= 0
                            ? <> · em <strong>{v.dias_para_vencer}d</strong></>
                            : <> · <strong>{-v.dias_para_vencer}d em atraso</strong></>}
                          {v.conta_nome && <> · {v.conta_nome}</>}
                          {v.fornecedor_nome && <> · {v.fornecedor_nome}</>}
                        </p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums mr-2 ${v.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {brl(Number(v.valor))}
                    </p>
                    <Button size="sm" onClick={() => confirmar(v)}
                      className="bg-success hover:bg-success text-white gap-1 h-7 text-xs">
                      <CheckCircle2 className="w-3 h-3" /> {v.tipo === "saida" ? "Pagar" : "Receber"}
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Aprovar ── */}
      <AlertDialog open={!!aprovando} onOpenChange={(v) => !v && setAprovando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovando && (
                <>
                  {aprovando.tipo === "saida" ? "Pagamento" : "Recebimento"} de{" "}
                  <strong className="text-foreground">{brl(Number(aprovando.valor))}</strong>
                  {" "}— {aprovando.descricao ?? "sem descrição"}.
                  {" "}Vira <strong className="text-foreground">realizado</strong>, com data de
                  pagamento hoje.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decidindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAprovacao} disabled={decidindo}
              className="bg-success hover:bg-success text-white">
              {decidindo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aprovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Rejeitar — pede o motivo, por isso é Dialog e não AlertDialog:
          o botão de confirmar precisa ficar desabilitado até haver texto. */}
      <Dialog open={!!rejeitando} onOpenChange={(v) => { if (!v) { setRejeitando(null); setMotivoRejeicao(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar lançamento</DialogTitle>
            <DialogDescription>
              {rejeitando && (
                <>
                  {brl(Number(rejeitando.valor))} — {rejeitando.descricao ?? "sem descrição"}.
                  {" "}Vira <strong className="text-foreground">cancelado</strong>. O motivo fica
                  registrado nas observações do lançamento.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoRejeicao}
            onChange={(e) => setMotivoRejeicao(e.target.value)}
            placeholder="Por que está sendo rejeitado?"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" disabled={decidindo}
              onClick={() => { setRejeitando(null); setMotivoRejeicao(""); }}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={decidindo || !motivoRejeicao.trim()}
              onClick={confirmarRejeicao}>
              {decidindo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
