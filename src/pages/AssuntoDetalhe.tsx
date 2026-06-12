import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, CheckSquare, Loader2, History, Trash2, Pencil,
  Check, X, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarAssunto, atualizarAssunto, excluirAssunto, listarHistoricoAssunto,
  PRIORIDADE_ICONE, STATUS_LABEL, STATUS_COR, PRIORIDADE_COR,
  type Assunto, type HistoricoAssunto, type AssuntoStatus,
} from "@/services/assuntosService";
import { AssuntoForm } from "@/components/assuntos/AssuntoForm";

export default function AssuntoDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [assunto, setAssunto] = useState<Assunto | null>(null);
  const [hist, setHist] = useState<HistoricoAssunto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [a, h] = await Promise.all([
        carregarAssunto(id), listarHistoricoAssunto(id),
      ]);
      setAssunto(a); setHist(h);
    } finally { setLoading(false); }
  }

  async function trocarStatus(s: AssuntoStatus) {
    setBusy(true);
    try {
      await atualizarAssunto(id, { status: s });
      toast.success("Status atualizado");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function concluir() {
    const obs = prompt("Observação da conclusão (opcional):") ?? undefined;
    setBusy(true);
    try {
      await atualizarAssunto(id, {
        status: "concluido",
        data_conclusao: new Date().toISOString().slice(0, 10),
        observacao_conclusao: obs ?? null,
      });
      toast.success("Concluído ✓");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function handleExcluir() {
    setBusy(true);
    try {
      await excluirAssunto(id);
      toast.success("Excluído");
      navigate("/assuntos");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;
  if (!assunto) return <div className="p-8 text-center text-muted-foreground">
    Assunto não encontrado. <Link to="/assuntos" className="text-primary underline">Voltar</Link>
  </div>;

  const concluido = assunto.status === "concluido" || assunto.status === "cancelado";

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/assuntos">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 flex-wrap">
            <span>{PRIORIDADE_ICONE[assunto.prioridade]}</span>
            <span className="truncate">{assunto.titulo}</span>
            <Badge variant="outline" className={`text-[10px] ${STATUS_COR[assunto.status]}`}>
              {STATUS_LABEL[assunto.status]}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${PRIORIDADE_COR[assunto.prioridade]}`}>
              Prioridade {assunto.prioridade}
            </Badge>
          </h1>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}
            className="gap-1.5 text-destructive">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Detalhes */}
      <Card>
        <CardContent className="py-3 space-y-2 text-sm">
          {assunto.descricao && (
            <p className="text-muted-foreground whitespace-pre-wrap">{assunto.descricao}</p>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Responsável</p>
              <p className="font-medium">{assunto.responsavel_nome ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Prazo</p>
              <p className="font-medium">{assunto.prazo ? new Date(assunto.prazo + "T00:00").toLocaleDateString("pt-BR") : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Criado em</p>
              <p>{new Date(assunto.data_criacao + "T00:00").toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted-foreground">Discutido em</p>
              <p>{assunto.vezes_discutido}× reunião(ões)</p>
            </div>
          </div>
          {assunto.observacao_conclusao && (
            <div className="mt-2 border-l-2 border-emerald-400 pl-2 italic text-emerald-700 text-xs">
              "{assunto.observacao_conclusao}"
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ações rápidas */}
      {!concluido && (
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={concluir} disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <Check className="w-3.5 h-3.5" /> Concluir
          </Button>
          {assunto.status === "aberto" && (
            <Button size="sm" variant="outline" onClick={() => trocarStatus("em_andamento")} disabled={busy}>
              Iniciar
            </Button>
          )}
          {assunto.status === "em_andamento" && (
            <Button size="sm" variant="outline" onClick={() => trocarStatus("aguardando_terceiro")} disabled={busy}>
              Aguardando terceiros
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => trocarStatus("cancelado")} disabled={busy}
            className="text-rose-700">
            <X className="w-3.5 h-3.5 mr-1" /> Cancelar
          </Button>
        </div>
      )}

      {/* Histórico */}
      <Card>
        <CardContent className="py-3 space-y-1.5">
          <h3 className="text-xs uppercase tracking-wide font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="w-3 h-3" /> Histórico ({hist.length})
          </h3>
          {hist.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Sem registros.</p>
          ) : (
            hist.map(h => (
              <div key={h.id} className="border-l-2 border-gold/40 pl-2 py-0.5 text-xs">
                <p className="font-medium">{h.descricao ?? h.acao}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                  {h.user_nome && ` · ${h.user_nome}`}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AssuntoForm assunto={assunto} open={editOpen} onOpenChange={setEditOpen} onSaved={carregar} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este assunto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{assunto.titulo}</strong> será excluído permanentemente.
              <br />Vínculos com reuniões e histórico também serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} disabled={busy}
              className="bg-destructive text-white">
              {busy ? "..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
