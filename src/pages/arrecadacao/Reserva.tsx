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
import { PosUsoCheckDialog } from "@/components/arrecadacao/PosUsoCheckDialog";
import { AprovacaoDialog } from "@/components/arrecadacao/AprovacaoDialog";
import { PreUsoCheckDialog } from "@/components/arrecadacao/PreUsoCheckDialog";
import { RecusarDialog } from "@/components/arrecadacao/RecusarDialog";
import { toast } from "sonner";
import {
  carregarReserva, listarChecklist, marcarChecklist,
  aprovarReserva, recusarReserva, iniciarUsoEAbrirCaixa, arquivarReserva,
  listarCaixasDeReserva, carregarResumoCaixa,
  listarChecklistPorTipo,
  type Reserva, type ChecklistItem, type ReservaStatus, type Caixa, type CaixaResumo, type ChecklistItemV2,
} from "@/services/arrecadacaoService";

const STATUS_LABEL: Record<ReservaStatus, string> = {
  solicitada: "Solicitada", aprovada: "Aprovada · aguardando aceite",
  recusada: "Recusada", confirmada: "Confirmada", em_uso: "Em uso",
  encerrada: "Encerrada", cancelada: "Cancelada", expirada: "Expirada",
} as any;

const STATUS_COR: Record<ReservaStatus, string> = {
  solicitada: "bg-amber-50 text-amber-700 border-amber-200",
  aprovada:   "bg-blue-50 text-blue-700 border-blue-200",
  confirmada: "bg-emerald-50 text-emerald-800 border-emerald-300",
  em_uso:     "bg-emerald-100 text-emerald-700 border-emerald-300",
  encerrada:  "bg-muted text-muted-foreground border-border",
  recusada:   "bg-rose-50 text-rose-700 border-rose-200",
  cancelada:  "bg-muted text-muted-foreground line-through",
  expirada:   "bg-orange-50 text-orange-700 border-orange-300 line-through",
} as any;

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
  const [posUsoOpen, setPosUsoOpen] = useState(false);
  const [aprovacaoOpen, setAprovacaoOpen] = useState(false);
  const [preUsoOpen, setPreUsoOpen] = useState(false);
  const [recusarOpen, setRecusarOpen] = useState(false);
  const [preUso, setPreUso] = useState<ChecklistItemV2[]>([]);
  const [posUsoCount, setPosUsoCount] = useState(0);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [r, c, cxs, split] = await Promise.all([
        carregarReserva(id), listarChecklist(id), listarCaixasDeReserva(id),
        listarChecklistPorTipo(id),
      ]);
      setReserva(r);
      setChecklist(c);
      setPreUso(split.pre_uso);
      setPosUsoCount(split.pos_uso.length);
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

  // V2: só PRE_USO obrigatório libera 'Iniciar uso' (pos_uso vem no fechamento)
  const preUsoObrigatorios = preUso.filter(c => c.obrigatorio);
  const preUsoObrigatoriosOk = preUsoObrigatorios.filter(c => c.ok).length;
  const podeIniciar = reserva.status === "confirmada"
    && preUsoObrigatoriosOk === preUsoObrigatorios.length;
  // Compat (usado em outros lugares):
  const obrigatorios = checklist.filter(c => c.obrigatorio);
  const obrigatoriosOk = obrigatorios.filter(c => c.ok).length;

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
            <Button size="sm" onClick={() => setAprovacaoOpen(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRecusarOpen(true)}
              className="gap-1.5 text-rose-600 hover:bg-rose-50">
              <XCircle className="w-3.5 h-3.5" /> Recusar
            </Button>
          </>
        )}
        {reserva.status === "confirmada" && (
          <Button size="sm" onClick={() => setPreUsoOpen(true)}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
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

      {/* Card de status do acordo (apenas em aprovada/expirada/confirmada) */}
      {reserva.status === "aprovada" && (reserva as any).acordo_token && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardContent className="p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-amber-800">
              ⏳ Aguardando aceite do solicitante
            </div>
            {(reserva as any).acordo_prazo_aceite && (
              <p>Prazo: até {new Date((reserva as any).acordo_prazo_aceite).toLocaleString("pt-BR")}</p>
            )}
            <div className="flex gap-2 flex-wrap items-center pt-1">
              <span className="text-muted-foreground">Link:</span>
              <a href={`/acordo/${(reserva as any).acordo_token}`}
                target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:underline">
                /acordo/{((reserva as any).acordo_token).slice(0,8)}...
              </a>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/acordo/${(reserva as any).acordo_token}`);
                toast.success("Link copiado");
              }} className="text-[10px] text-muted-foreground hover:text-foreground underline">copiar</button>
            </div>
          </CardContent>
        </Card>
      )}

      {reserva.status === "expirada" && (
        <Card className="border-orange-300 bg-orange-50/40">
          <CardContent className="p-3 text-xs">
            <div className="font-medium text-orange-800">⏰ Acordo expirou sem aceite</div>
            <p className="mt-1">A data foi liberada. Pra reaprovar, mude o status pra solicitada manualmente e aprove de novo.</p>
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
                <Button size="lg" variant="outline"
                  onClick={() => posUsoCount > 0 ? setPosUsoOpen(true) : setFechamentoOpen(true)}
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


      {aprovacaoOpen && reserva && (
        <AprovacaoDialog
          open={aprovacaoOpen}
          onOpenChange={setAprovacaoOpen}
          reserva={reserva}
          onAprovado={carregar}
        />
      )}

      {recusarOpen && reserva && (
        <RecusarDialog
          open={recusarOpen}
          onOpenChange={setRecusarOpen}
          reservaId={reserva.id}
          onRecusado={carregar}
        />
      )}

      {preUsoOpen && reserva && (
        <PreUsoCheckDialog
          open={preUsoOpen}
          onOpenChange={setPreUsoOpen}
          reservaId={reserva.id}
          onConfirmado={async () => {
            // Confirmou itens pré-uso → roda iniciarUsoEAbrirCaixa
            try {
              await acao("iniciar");
            } catch {}
          }}
        />
      )}

      {posUsoOpen && reserva && (
        <PosUsoCheckDialog
          open={posUsoOpen}
          onOpenChange={setPosUsoOpen}
          reservaId={reserva.id}
          onConcluido={() => setFechamentoOpen(true)}
        />
      )}

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
