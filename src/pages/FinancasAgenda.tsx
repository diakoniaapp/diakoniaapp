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
  TrendingUp, TrendingDown, Gavel, Copy, QrCode, Paperclip, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PaginaSkeleton } from "@/components/ListState";
import {
  listarProximosVencimentos, confirmarPagamento, listarLancamentosSemTeto,
  aprovarLancamento, rejeitarLancamento, brl, buscarFornecedor, adicionarAnexo,
  type FinVencimento, type FinLancamentoExtenso, type FinFornecedor,
} from "@/services/finService";
import { montarPayloadPix, formatarChavePix } from "@/lib/pix";
import QRCode from "qrcode";
import { hojeMaisDias } from "@/lib/data";
import { mensagemErro } from "@/lib/erroRede";

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
  // O botão "Pagar"/"Receber" usava `confirm()` nativo — reportado pela
  // Telma (17/09/2026, print real): "o botão pagar não leva a nenhum
  // lugar". Mesmo defeito documentado no CLAUDE.md (Risco 3) e já
  // corrigido em FinancasAdmin.tsx/FinancasConta.tsx na mesma sessão:
  // `confirm()` não dispara diálogo nenhum em WebView, devolve falso na
  // hora, e o código lia isso como "cancelou" — sem erro, sem aviso.
  const [confirmando, setConfirmando] = useState<FinVencimento | null>(null);
  const [confirmandoBusy, setConfirmandoBusy] = useState(false);

  // ── Fase 8 do roadmap Financeiro (Central de Pagamentos, 22/09/2026) ────
  //
  // "Pagar" deixa de ser só um clique de confirmação — ganha o que o
  // fornecedor já tem cadastrado (Fase 7): copiar a chave Pix, mostrar o
  // QR Code, e anexar o comprovante no mesmo instante em que marca como
  // pago, sem precisar abrir outra tela depois pra lembrar de fazer isso.
  // Só entra pra SAÍDA (pagamento) — "receber" não paga ninguém, o Pix é
  // de quem recebe o dinheiro, não de quem registra o recebimento.
  const [fornecedorPagando, setFornecedorPagando] = useState<FinFornecedor | null>(null);
  const [carregandoFornecedor, setCarregandoFornecedor] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);

  useEffect(() => {
    if (!confirmando || confirmando.tipo !== "saida" || !confirmando.fornecedor_id) {
      setFornecedorPagando(null);
      setQrDataUrl(null);
      return;
    }
    let cancelado = false;
    setCarregandoFornecedor(true);
    buscarFornecedor(confirmando.fornecedor_id)
      .then(f => {
        if (cancelado) return;
        setFornecedorPagando(f);
        if (f?.chave_pix) {
          const payload = montarPayloadPix({
            chave: f.chave_pix, nomeRecebedor: f.nome, valor: Number(confirmando.valor),
          });
          // Erro na geração do QR não pode travar o "Pagar" — Copiar PIX
          // continua funcionando mesmo se isso falhar; mesma régua de
          // "resolvedor que falha vira null" já usada em outros lugares
          // do sistema (ex.: tarefaPrincipal.ts).
          QRCode.toDataURL(payload, { margin: 1, width: 220 })
            .then(url => { if (!cancelado) setQrDataUrl(url); })
            .catch(() => { if (!cancelado) setQrDataUrl(null); });
        } else {
          setQrDataUrl(null);
        }
      })
      .finally(() => { if (!cancelado) setCarregandoFornecedor(false); });
    return () => { cancelado = true; };
  }, [confirmando]);

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
        // Sem data — a fila de aprovação não "expira" com o tempo (mesmo
        // motivo de painelTesourariaService.ts). `listarLancamentosSemTeto`
        // pra não perder pendência antiga do teto de 300 se o backlog crescer.
        listarLancamentosSemTeto({ status: "aguardando_aprovacao" }),
      ]);
      setVencimentos(venc);
      setAguardandoAprovacao(pend);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function confirmarPagamentoDialog() {
    if (!confirmando) return;
    setConfirmandoBusy(true);
    try {
      await confirmarPagamento(confirmando.id);
      // Anexo é melhoria, não pré-requisito — se a marcação como pago já
      // funcionou (o que importa de verdade: dinheiro saiu, registro
      // bate), uma falha só no upload do comprovante não pode desfazer
      // ou travar o pagamento. Avisa em separado, não perde o anexo.
      if (anexoArquivo) {
        try {
          await adicionarAnexo(confirmando.id, anexoArquivo, "comprovante");
        } catch (e: any) {
          toast.error(`Pago, mas o comprovante não subiu: ${e?.message ?? "erro"}`);
        }
      }
      toast.success(`${confirmando.tipo === "saida" ? "Pago" : "Recebido"}!`);
      setConfirmando(null);
      setAnexoArquivo(null);
      await carregar();
    } catch (e: any) {
      // "TypeError: Failed to fetch" cru assustava mais do que ajudava —
      // achado ao vivo pela Telma (17/09/2026) tentando confirmar um
      // pagamento com a conexão instável. `mensagemErro` (lib/erroRede.ts)
      // troca isso por um aviso que diz o que fazer.
      toast.error(mensagemErro(e, "Não foi possível confirmar"));
    }
    finally { setConfirmandoBusy(false); }
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
                    <Button size="sm" onClick={() => setConfirmando(v)}
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

      <AlertDialog open={!!confirmando} onOpenChange={(v) => { if (!v) { setConfirmando(null); setAnexoArquivo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar {confirmando?.tipo === "saida" ? "pagamento" : "recebimento"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando?.descricao ?? "Este lançamento"} — {confirmando && brl(Number(confirmando.valor))}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Central de Pagamentos — só pra saída, e só quando dá pra
              fazer algo de verdade (fornecedor com chave Pix cadastrada). */}
          {confirmando?.tipo === "saida" && (
            <div className="space-y-2.5">
              {carregandoFornecedor && (
                <p className="text-xs text-muted-foreground">Carregando dados do fornecedor…</p>
              )}
              {fornecedorPagando?.chave_pix && (
                <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-gold" /> Pix de {fornecedorPagando.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatarChavePix(fornecedorPagando.chave_pix, fornecedorPagando.tipo_chave_pix)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5"
                      onClick={() => {
                        const payload = montarPayloadPix({
                          chave: fornecedorPagando.chave_pix!, nomeRecebedor: fornecedorPagando.nome,
                          valor: Number(confirmando.valor),
                        });
                        navigator.clipboard.writeText(payload);
                        toast.success("Código Pix copiado — cole no app do seu banco");
                      }}>
                      <Copy className="w-3.5 h-3.5" /> Copiar Pix
                    </Button>
                    {qrDataUrl && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> ou escaneie:
                      </span>
                    )}
                  </div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="QR Code do Pix" width={140} height={140}
                      className="rounded border bg-white p-1 mx-auto" />
                  )}
                </div>
              )}
              {!carregandoFornecedor && confirmando.fornecedor_id && !fornecedorPagando?.chave_pix && (
                <p className="text-xs text-muted-foreground">
                  Este fornecedor ainda não tem chave Pix cadastrada.{" "}
                  <Link to={`/financas/fornecedor/${confirmando.fornecedor_id}`} className="text-primary hover:underline">
                    Cadastrar
                  </Link>
                </p>
              )}

              <div>
                <label className="text-xs font-medium flex items-center gap-1.5 mb-1 cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5" /> Anexar comprovante (opcional)
                </label>
                <input type="file" accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setAnexoArquivo(e.target.files?.[0] ?? null)}
                  className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-background" />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarPagamentoDialog(); }} disabled={confirmandoBusy}
              className="bg-success hover:bg-success text-white">
              {confirmandoBusy ? "..." : (confirmando?.tipo === "saida" ? "Marcar como pago" : "Receber")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
