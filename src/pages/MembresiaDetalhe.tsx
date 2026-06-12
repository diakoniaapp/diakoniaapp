import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, FileText, Loader2, Camera, FileUp, X, Check, Paperclip,
  CheckCircle2, Circle, Calendar, History, Trash2, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarSolicitacao, listarDocumentos, listarHistorico,
  anexarDocumento, excluirDocumento, documentoSignedUrl,
  atualizarSolicitacao, aprovarSolicitacao, rejeitarSolicitacao, concluirSolicitacao,
  checklistDeSolicitacao,
  TIPO_LABEL, STATUS_LABEL, STATUS_COR, DOC_MAX_BYTES,
  type SolicitacaoMembresia, type DocumentoSolicitacao, type HistoricoSolicitacao,
} from "@/services/membresiaService";

export default function MembresiaDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [sol, setSol] = useState<SolicitacaoMembresia | null>(null);
  const [docs, setDocs] = useState<DocumentoSolicitacao[]>([]);
  const [hist, setHist] = useState<HistoricoSolicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Edição inline
  const [dataAssembleia, setDataAssembleia] = useState("");

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [s, d, h] = await Promise.all([
        carregarSolicitacao(id), listarDocumentos(id), listarHistorico(id),
      ]);
      setSol(s); setDocs(d); setHist(h);
      if (s?.data_assembleia) setDataAssembleia(s.data_assembleia);
    } finally { setLoading(false); }
  }

  async function escolheArquivo(file: File | null, tipo: DocumentoSolicitacao["tipo"]) {
    if (!file) return;
    if (file.size > DOC_MAX_BYTES) { toast.error("Arquivo > 10MB"); return; }
    setBusy(true);
    try {
      await anexarDocumento(id, file, tipo);
      toast.success("Documento anexado");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function abrirDoc(d: DocumentoSolicitacao) {
    const url = await documentoSignedUrl(d.arquivo_url);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function deletarDoc(d: DocumentoSolicitacao) {
    if (!confirm("Excluir este documento?")) return;
    try {
      await excluirDocumento(d.id, d.arquivo_url);
      toast.success("Excluído");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function salvarDataAssembleia() {
    setBusy(true);
    try {
      await atualizarSolicitacao(id, { data_assembleia: dataAssembleia });
      toast.success("Assembleia agendada");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function aprovar() {
    const obs = prompt("Observação da aprovação (opcional):") ?? undefined;
    setBusy(true);
    try {
      await aprovarSolicitacao(id, obs);
      toast.success("Aprovada");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function rejeitar() {
    const obs = prompt("Motivo da rejeição:");
    if (!obs) return;
    setBusy(true);
    try {
      await rejeitarSolicitacao(id, obs);
      toast.success("Rejeitada");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function concluir() {
    if (!confirm("Marcar como concluída? Isso encerra a solicitação.")) return;
    setBusy(true);
    try {
      await concluirSolicitacao(id);
      toast.success("Concluída");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;
  if (!sol) return <div className="p-8 text-center text-muted-foreground">
    Solicitação não encontrada. <Link to="/membresia" className="text-primary underline">Voltar</Link>
  </div>;

  const checklist = checklistDeSolicitacao(sol, docs);
  const docPedido = docs.find(d => d.tipo === "pedido");
  const docCarta = docs.find(d => d.tipo === "carta");

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/membresia">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 flex-wrap">
            <FileText className="w-5 h-5 text-gold" />
            {sol.pessoa_nome}
            <Badge variant="outline" className={`text-[10px] ${STATUS_COR[sol.status]}`}>
              {STATUS_LABEL[sol.status]}
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground">
            {TIPO_LABEL[sol.tipo]} · {new Date(sol.data_solicitacao + "T00:00").toLocaleDateString("pt-BR")}
          </p>
        </div>
      </div>

      {/* Checklist visual */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="text-xs uppercase tracking-wide font-medium text-muted-foreground">Progresso</h3>
          {checklist.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              {item.ok
                ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className={`text-sm flex-1 ${item.ok ? "text-foreground" : "text-muted-foreground"}`}>
                {item.label}
              </span>
              {!item.ok && item.acao && (
                <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300">
                  {item.acao}
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Documentos */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="text-xs uppercase tracking-wide font-medium text-muted-foreground flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" /> Documentos ({docs.length})
          </h3>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum documento anexado.</p>
          ) : (
            <div className="space-y-1">
              {docs.map(d => (
                <div key={d.id} className="flex items-center justify-between border rounded-md px-2 py-1.5">
                  <button onClick={() => abrirDoc(d)} className="text-left flex-1 min-w-0 hover:underline">
                    <p className="text-sm font-medium truncate">{d.arquivo_nome ?? d.tipo}</p>
                    <p className="text-[10px] text-muted-foreground">{d.tipo} · v{d.versao}</p>
                  </button>
                  <Button type="button" variant="ghost" size="icon"
                    onClick={() => deletarDoc(d)} className="h-7 w-7 text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <label className="cursor-pointer">
              <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null, "pedido")} disabled={busy} />
              <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-2 hover:border-gold/40 hover:bg-muted/30">
                <FileUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px]">Anexar pedido</span>
              </div>
            </label>
            <label className="cursor-pointer">
              <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null, "carta")} disabled={busy} />
              <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-2 hover:border-gold/40 hover:bg-muted/30">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px]">Anexar carta</span>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Assembleia */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="text-xs uppercase tracking-wide font-medium text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3 h-3" /> Assembleia
          </h3>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-xs">Data agendada</Label>
              <Input type="date" value={dataAssembleia} onChange={(e) => setDataAssembleia(e.target.value)} />
            </div>
            <Button size="sm" onClick={salvarDataAssembleia} disabled={busy || !dataAssembleia}>Salvar</Button>
          </div>
          {sol.data_aprovacao && (
            <p className="text-xs text-emerald-700 mt-2">
              ✓ Aprovada em {new Date(sol.data_aprovacao + "T00:00").toLocaleDateString("pt-BR")}
              {sol.observacao_aprovacao && ` — "${sol.observacao_aprovacao}"`}
            </p>
          )}
          {sol.observacao_rejeicao && (
            <p className="text-xs text-rose-700 mt-2">
              ✗ Rejeitada — "{sol.observacao_rejeicao}"
            </p>
          )}
        </CardContent>
      </Card>

      {/* Ações principais */}
      {sol.status === "pronta_assembleia" && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={aprovar} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
          </Button>
          <Button onClick={rejeitar} disabled={busy} variant="outline" className="text-destructive gap-1.5">
            <ThumbsDown className="w-3.5 h-3.5" /> Rejeitar
          </Button>
        </div>
      )}
      {sol.status === "aprovada" && (
        <Button onClick={concluir} disabled={busy} className="w-full bg-gold hover:bg-gold/90 text-white gap-1.5">
          <Check className="w-3.5 h-3.5" /> Marcar como concluída
        </Button>
      )}

      {/* Detalhes */}
      {(sol.motivo || sol.observacoes || sol.igreja_origem || sol.igreja_destino) && (
        <Card>
          <CardContent className="py-3 space-y-1 text-xs">
            {sol.igreja_origem && <p><strong>Origem:</strong> {sol.igreja_origem}</p>}
            {sol.igreja_destino && <p><strong>Destino:</strong> {sol.igreja_destino}</p>}
            {sol.motivo && <p><strong>Motivo:</strong> {sol.motivo}</p>}
            {sol.observacoes && <p><strong>Observações:</strong> {sol.observacoes}</p>}
          </CardContent>
        </Card>
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
              <div key={h.id} className="text-[11px] border-l-2 border-gold/40 pl-2 py-0.5">
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
    </div>
  );
}
