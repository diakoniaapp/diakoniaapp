import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, PlayCircle, Trash2,
  Calendar, MapPin, Sparkles, ClipboardList, AlertCircle, ShoppingCart, FileBarChart, TrendingDown,
} from "lucide-react";
import { FechamentoDialog } from "@/components/arrecadacao/FechamentoDialog";
import { MovimentosDialog } from "@/components/arrecadacao/MovimentosDialog";
import { toast } from "sonner";
import {
  carregarReserva, listarChecklist, marcarChecklist,
  aprovarReserva, recusarReserva, iniciarUsoEAbrirCaixa, arquivarReserva,
  listarCaixasDeReserva, carregarResumoCaixa,
  type Reserva, type ChecklistItem, type ReservaStatus, type Caixa, type CaixaResumo,
} from "@/services/arrecadacaoService";

const STATUS_LABEL: Record<ReservaStatus, string> = {
  solicitada: "Solicitada", aprovada: "Aprovada", recusada: "Recusada",
  em_uso: "Em uso", encerrada: "Encerrada", cancelada: "Cancelada",
};

const STATUS_COR: Record<ReservaStatus, string> = {
  solicitada: "bg-amber-50 text-amber-700 border-amber-200",
  aprovada:   "bg-blue-50 text-blue-700 border-blue-200",
  em_uso:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  encerrada:  "bg-muted text-muted-foreground border-border",
  recusada:   "bg-rose-50 text-rose-700 border-rose-200",
  cancelada:  "bg-muted text-muted-foreground line-through",
};

function fmtPeriodo(p: string) {
  const m = p.match(/\["?([^",]+)[",)]+"?([^",)]+)/);
  if (!m) return p;
  const ini = new Date(m[1]).toLocaleDateString("pt-BR");
  const fim = new Date(m[2]).toLocaleDateString("pt-BR");
  return `${ini} → ${fim}`;
}

export default function ReservaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [resumo, setResumo] = useState<CaixaResumo | null>(null);
  const [fechamentoOpen, setFechamentoOpen] = useState(false);
  const [movimentosOpen, setMovimentosOpen] = useState(false);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [r, c, cxs] = await Promise.all([
        carregarReserva(id), listarChecklist(id), listarCaixasDeReserva(id),
      ]);
      setReserva(r); setChecklist(c);
      const cx = cxs[0] ?? null;
      setCaixa(cx);
      if (cx) setResumo(await carregarResumoCaixa(cx.id));
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [id]);

  async function acao(tipo: "aprovar" | "recusar" | "iniciar" | "arquivar") {
    if (!reserva) return;
    try {
      if (tipo === "aprovar") await aprovarReserva(reserva.id);
      if (tipo === "recusar") {
        if (!motivoRecusa.trim()) { toast.error("Informe o motivo da recusa"); return; }
        await recusarReserva(reserva.id, motivoRecusa);
        setMotivoRecusa("");
      }
      if (tipo === "iniciar") await iniciarUsoEAbrirCaixa(reserva.id);
      if (tipo === "arquivar") {
        if (!confirm("Arquivar esta reserva e todos os caixas/vendas vinculados?")) return;
        await arquivarReserva(reserva.id);
        nav("/arrecadacao"); return;
      }
      toast.success("Atualizado");
      await carregar();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  async function toggleChecklist(item: ChecklistItem, ok: boolean) {
    try {
      await marcarChecklist(item.id, ok);
      setChecklist(checklist.map(c => c.id === item.id ? { ...c, ok } : c));
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  if (loading || !reserva) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  const obrigatorios = checklist.filter(c => c.obrigatorio);
  const obrigatoriosOk = obrigatorios.filter(c => c.ok).length;
  const podeIniciar = reserva.status === "aprovada" && obrigatoriosOk === obrigatorios.length;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg md:text-xl truncate">{reserva.finalidade}</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[9px] ${STATUS_COR[reserva.status]}`}>
              {STATUS_LABEL[reserva.status]}
            </Badge>
            <Badge variant="outline" className="text-[9px]">{reserva.espaco?.codigo}</Badge>
          </div>
        </div>
        {reserva.status === "solicitada" && (
          <>
            <Button size="sm" onClick={() => acao("aprovar")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
            </Button>
          </>
        )}
        {reserva.status === "aprovada" && (
          <Button size="sm" onClick={() => acao("iniciar")} disabled={!podeIniciar}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            title={podeIniciar ? "" : "Conclua os itens obrigatórios do checklist"}>
            <PlayCircle className="w-3.5 h-3.5" /> Iniciar uso
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => acao("arquivar")} className="text-rose-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </header>

      {/* Resumo */}
      <Card>
        <CardContent className="p-3 text-xs space-y-1.5">
          <Linha icon={<MapPin className="w-3.5 h-3.5" />} label="Espaço">
            {reserva.espaco?.nome}
          </Linha>
          <Linha icon={<Calendar className="w-3.5 h-3.5" />} label="Período">
            {fmtPeriodo(reserva.periodo)}
          </Linha>
          <Linha icon={<Sparkles className="w-3.5 h-3.5" />} label="Área solicitante">
            {reserva.area?.nome ?? "—"}
          </Linha>
          <Linha icon={<Sparkles className="w-3.5 h-3.5" />} label="Responsável">
            {reserva.responsavel?.nome_completo ?? "—"}
          </Linha>
          {reserva.observacoes && (
            <Linha icon={<AlertCircle className="w-3.5 h-3.5" />} label="Observações">
              {reserva.observacoes}
            </Linha>
          )}
          {reserva.motivo_recusa && (
            <Linha icon={<XCircle className="w-3.5 h-3.5 text-rose-600" />} label="Motivo da recusa">
              <span className="text-rose-700">{reserva.motivo_recusa}</span>
            </Linha>
          )}
        </CardContent>
      </Card>

      {/* Recusar (somente solicitadas) */}
      {reserva.status === "solicitada" && (
        <Card className="border-rose-200">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-rose-700">
              <XCircle className="w-3.5 h-3.5" /> Recusar reserva
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)}
              placeholder="Motivo da recusa (obrigatório)" />
            <Button variant="outline" size="sm" onClick={() => acao("recusar")} disabled={!motivoRecusa.trim()}
              className="gap-1.5 text-rose-700 border-rose-300">
              <XCircle className="w-3.5 h-3.5" /> Confirmar recusa
            </Button>
          </CardContent>
        </Card>
      )}


      {/* Caixa do PDV (destaque) */}
      {(reserva.status === "em_uso" || reserva.status === "encerrada") && caixa && (
        <Card className={
          "border-2 shadow-md " +
          (caixa.estado === "aberto"      ? "border-emerald-400 bg-emerald-50/40" :
           caixa.estado === "conciliando" ? "border-amber-400 bg-amber-50/30" :
                                            "border-muted bg-muted/20")
        }>
          <CardHeader className="pb-2">
            <CardTitle className="text-base md:text-lg flex items-center gap-2">
              <ShoppingCart className={
                "w-5 h-5 " +
                (caixa.estado === "aberto"      ? "text-emerald-700" :
                 caixa.estado === "conciliando" ? "text-amber-700" : "text-muted-foreground")
              } />
              Caixa do PDV
              <Badge className={
                "ml-2 text-[10px] " +
                (caixa.estado === "aberto"      ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                 caixa.estado === "conciliando" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                                   "bg-muted text-muted-foreground")
              }>
                {caixa.estado.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resumo && (
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <BlocoGrande titulo="Vendas" valor={`${resumo.qtd_vendas}`} />
                <BlocoGrande titulo="Bruto"
                  valor={`R$ ${resumo.total_bruto.toFixed(2).replace(".", ",")}`}
                  cor="emerald" />
                <BlocoGrande titulo="Líquido"
                  valor={`R$ ${resumo.saldo_virtual.toFixed(2).replace(".", ",")}`}
                  destaque
                  cor={resumo.saldo_virtual >= 0 ? "emerald" : "rose"} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {caixa.estado === "aberto" && (
                <Button asChild size="lg"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 flex-1 md:flex-none h-12 text-base font-semibold shadow">
                  <Link to={`/arrecadacao/caixa/${caixa.id}`}>
                    <ShoppingCart className="w-5 h-5" /> Abrir PDV
                  </Link>
                </Button>
              )}
              {caixa.estado !== "fechado" && (
                <Button size="lg" variant="outline" onClick={() => setMovimentosOpen(true)}
                  className="gap-2 h-12 px-4">
                  <TrendingDown className="w-4 h-4" /> Movimentos
                </Button>
              )}
              {caixa.estado !== "fechado" && (
                <Button size="lg" variant="outline" onClick={() => setFechamentoOpen(true)}
                  className="gap-2 h-12 px-4">
                  <FileBarChart className="w-4 h-4" /> Fechar caixa
                </Button>
              )}
            </div>
            {resumo && resumo.saldo_virtual <= 0 && caixa.estado === "aberto" && (
              <p className="text-[11px] text-muted-foreground italic">
                💡 Registre vendas no PDV antes de lançar custos, reembolsos ou reversões.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-gold" />
            {reserva.status === "em_uso" || reserva.status === "encerrada"
              ? "Checklist (registro do uso)"
              : "Checklist de uso"}
            {obrigatorios.length > 0 && (
              <Badge variant="outline" className="text-[9px] ml-auto">
                {obrigatoriosOk}/{obrigatorios.length} obrigatórios
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {checklist.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhum item no checklist. (Verifique se há templates ativos em arr_checklist_template.)
            </p>
          ) : (
            <div className="space-y-1.5">
              {checklist.map(item => (
                <div key={item.id} className="flex items-start gap-2 p-2 border rounded-md text-sm">
                  <Checkbox checked={item.ok} onCheckedChange={(v) => toggleChecklist(item, !!v)}
                    className="mt-0.5" />
                  <div className="flex-1">
                    <span className={item.ok ? "line-through text-muted-foreground" : ""}>{item.item}</span>
                    {item.obrigatorio && (
                      <Badge variant="outline" className="text-[9px] ml-1.5 bg-amber-50 text-amber-700 border-amber-200">
                        obrigatório
                      </Badge>
                    )}
                    {item.ok && item.ok_em && (
                      <span className="text-[10px] text-muted-foreground ml-1.5">
                        ✓ {new Date(item.ok_em).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {fechamentoOpen && caixa && (
        <FechamentoDialog
          open={fechamentoOpen}
          onOpenChange={setFechamentoOpen}
          caixaId={caixa.id}
          reservaFinalidade={reserva.finalidade}
          espacoNome={reserva.espaco?.nome}
          onFechado={carregar}
        />
      )}

      {movimentosOpen && caixa && (
        <MovimentosDialog
          open={movimentosOpen}
          onOpenChange={setMovimentosOpen}
          caixaId={caixa.id}
          onChange={carregar}
        />
      )}
    </div>
  );
}

function BlocoGrande({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor?: string; destaque?: boolean }) {
  const corClasses: Record<string, string> = {
    emerald: "text-emerald-700",
    rose:    "text-rose-700",
  };
  return (
    <div className={
      "border-2 rounded-lg p-2.5 md:p-3 text-center " +
      (destaque ? "border-emerald-400 bg-white shadow-sm" : "border-border bg-white/70")
    }>
      <div className="text-[10px] md:text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</div>
      <div className={
        "text-lg md:text-2xl font-serif font-semibold mt-0.5 " +
        (cor ? corClasses[cor] : "text-foreground")
      }>{valor}</div>
    </div>
  );
}

function Bloco({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor?: string; destaque?: boolean }) {
  const corClasses: Record<string, string> = { emerald: "text-emerald-700", rose: "text-rose-700" };
  return (
    <div className={"border rounded-md p-2 " + (destaque ? "border-emerald-300 bg-emerald-50/40" : "")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className={"text-sm font-serif font-medium " + (cor ? corClasses[cor] : "")}>{valor}</div>
    </div>
  );
}

function Linha({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <span className="text-muted-foreground w-32 shrink-0">{label}:</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
