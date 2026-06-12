import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ScrollText, Plus, Loader2, Calendar, Users, FileText,
  Sparkles, Check, Trash2, MessageCircle, History, UserPlus, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarReuniao, atualizarReuniao, excluirReuniao,
  listarParticipantes, autoConvocarLideranca, marcarPresenca, removerParticipante,
  listarPautas, criarPauta, atualizarPauta, excluirPauta, sugerirPautas,
  listarHistorico, montarConvocacaoWhatsApp, gerarAssembleiaDaReuniao,
  REUNIAO_TIPO_LABEL, REUNIAO_STATUS_LABEL, REUNIAO_STATUS_COR,
  PAUTA_STATUS_LABEL,
  type GovReuniao, type GovParticipante, type GovPauta, type GovHistorico,
  type GovPautaClassificacao,
} from "@/services/governancaService";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";
import { supabase } from "@/integrations/supabase/client";

export default function GovernancaReuniao() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [reun, setReun] = useState<GovReuniao | null>(null);
  const [parts, setParts] = useState<GovParticipante[]>([]);
  const [pautas, setPautas] = useState<GovPauta[]>([]);
  const [hist, setHist] = useState<GovHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [pautaOpen, setPautaOpen] = useState(false);
  const [partOpen, setPartOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [r, p, pa, h] = await Promise.all([
        carregarReuniao(id),
        listarParticipantes(id),
        listarPautas(id),
        listarHistorico("reuniao", id),
      ]);
      setReun(r); setParts(p); setPautas(pa); setHist(h);
    } finally { setLoading(false); }
  }

  async function autoConvocar() {
    setBusy(true);
    try {
      const qtd = await autoConvocarLideranca(id);
      toast.success(`${qtd} pessoa(s) adicionada(s) à convocação`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function handleExcluir() {
    setBusy(true);
    try {
      await excluirReuniao(id);
      toast.success("Reunião excluída");
      navigate("/governanca");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function criarAssembleia() {
    if (!confirm("Gerar assembleia com as pautas marcadas?\nVai criar para o próximo domingo.")) return;
    setBusy(true);
    try {
      const a = await gerarAssembleiaDaReuniao(id);
      toast.success("Assembleia criada!");
      navigate(`/governanca/assembleia/${a.id}`);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function importarSugestoes() {
    setBusy(true);
    try {
      const sugs = await sugerirPautas();
      for (const s of sugs) {
        await criarPauta({
          reuniao_id: id,
          titulo: s.titulo,
          descricao: s.descricao,
          classificacao: s.classificacao,
          vinculo_tipo: s.vinculo_tipo,
          vinculo_id: s.vinculo_id,
        });
      }
      toast.success(`${sugs.length} sugestão(ões) importada(s)`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function trocarStatus(novoStatus: GovReuniao["status"]) {
    try {
      await atualizarReuniao(id, { status: novoStatus });
      toast.success("Status atualizado");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function enviarConvocacao(p: GovParticipante) {
    if (!reun) return;
    // pega telefone da pessoa
    let telefone: string | undefined;
    if (p.pessoa_id) {
      const { data } = await supabase.from("membros")
        .select("telefone_celular").eq("id", p.pessoa_id).maybeSingle();
      telefone = data?.telefone_celular ?? undefined;
    }
    // Inclui as pautas no convite (vão como parte da mensagem)
    if (pautas.length === 0) {
      if (!confirm("⚠ Nenhuma pauta cadastrada ainda. Enviar convocação sem pauta?\n\nSugestão: cadastre as pautas primeiro para enviar tudo no mesmo convite.")) return;
    }
    const { url } = montarConvocacaoWhatsApp(reun, { nome: p.pessoa_nome, telefone }, pautas);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copiarConvocacao(p: GovParticipante) {
    if (!reun) return;
    const { mensagem } = montarConvocacaoWhatsApp(reun, { nome: p.pessoa_nome, telefone: "" }, pautas);
    navigator.clipboard.writeText(mensagem).then(
      () => toast.success("Mensagem copiada"),
      () => toast.error("Falha ao copiar"),
    );
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;
  if (!reun) return <div className="p-8 text-center text-muted-foreground">
    Reunião não encontrada. <Link to="/governanca" className="text-primary underline">Voltar</Link>
  </div>;

  const presentes = parts.filter(p => p.presente).length;
  const deliberativas = pautas.filter(p => p.classificacao === "deliberativa").length;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/governanca">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 flex-wrap">
            <ScrollText className="w-5 h-5 text-gold" />
            <span className="truncate">{reun.titulo}</span>
            <Badge variant="outline" className="text-[10px]">{REUNIAO_TIPO_LABEL[reun.tipo]}</Badge>
            <Badge variant="outline" className={`text-[10px] ${REUNIAO_STATUS_COR[reun.status]}`}>
              {REUNIAO_STATUS_LABEL[reun.status]}
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
            <Calendar className="w-3 h-3" />
            {new Date(reun.data_reuniao + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            {reun.horario && ` · ${reun.horario.slice(0, 5)}`}
            {reun.local && ` · ${reun.local}`}
          </p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}
            className="gap-1.5 text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Convocados</p>
            <p className="text-base font-semibold">{parts.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/30 border-emerald-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-emerald-700 flex items-center gap-1"><Check className="w-3 h-3" /> Presentes</p>
            <p className="text-base font-semibold text-emerald-700">{presentes}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50/30 border-amber-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-amber-700 flex items-center gap-1"><FileText className="w-3 h-3" /> Pra assembleia</p>
            <p className="text-base font-semibold text-amber-700">{deliberativas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status quick actions */}
      <div className="flex gap-1 flex-wrap">
        {reun.status === "agendada" && (
          <Button size="sm" onClick={() => trocarStatus("em_andamento")}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
            ▶ Iniciar reunião
          </Button>
        )}
        {reun.status === "em_andamento" && (
          <Button size="sm" onClick={() => trocarStatus("concluida")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            ✓ Concluir
          </Button>
        )}
      </div>

      <Tabs defaultValue="pautas">
        <TabsList>
          <TabsTrigger value="pautas" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Pautas ({pautas.length})</TabsTrigger>
          <TabsTrigger value="participantes" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Participantes ({parts.length})</TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5"><History className="w-3.5 h-3.5" /> Histórico</TabsTrigger>
        </TabsList>

        {/* ── PAUTAS ─────────────────────────────────────────────── */}
        <TabsContent value="pautas" className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={importarSugestoes} disabled={busy}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Importar pendências do sistema
            </Button>
            <Button size="sm" onClick={() => setPautaOpen(true)} className="bg-gold hover:bg-gold/90 text-white">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova pauta
            </Button>
            {deliberativas > 0 && (
              <Button size="sm" onClick={criarAssembleia} disabled={busy}
                className="bg-purple-600 hover:bg-purple-700 text-white ml-auto">
                ⚖ Gerar assembleia ({deliberativas})
              </Button>
            )}
          </div>

          {pautas.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground italic">
              Sem pautas. Adicione manualmente ou importe pendências.
            </CardContent></Card>
          ) : (
            <div className="space-y-1.5">
              {pautas.map(p => (
                <PautaLinha key={p.id} pauta={p} onChange={carregar} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── PARTICIPANTES ─────────────────────────────────────── */}
        <TabsContent value="participantes" className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={autoConvocar} disabled={busy}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Auto-convocar liderança
            </Button>
            <Button size="sm" onClick={() => setPartOpen(true)} className="bg-gold hover:bg-gold/90 text-white">
              <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Adicionar pessoa
            </Button>
          </div>

          {parts.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-6 text-center text-sm text-muted-foreground italic">
              Sem convocados ainda.
            </CardContent></Card>
          ) : (
            <div className="space-y-1">
              {parts.map(p => (
                <div key={p.id} className="border rounded-md px-3 py-1.5 flex items-center gap-2">
                  <button
                    onClick={() => marcarPresenca(p.id, !p.presente).then(carregar)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${p.presente ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground"}`}>
                    {p.presente && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.pessoa_nome}</p>
                    <p className="text-[10px] text-muted-foreground">{p.papel}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-emerald-600"
                    onClick={() => enviarConvocacao(p)} title="Enviar WhatsApp">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => removerParticipante(p.id).then(carregar)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── HISTÓRICO ──────────────────────────────────────────── */}
        <TabsContent value="historico" className="space-y-1.5">
          {hist.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-6">Sem registros.</p>
          ) : (
            hist.map(h => (
              <div key={h.id} className="border-l-2 border-gold/40 pl-2 py-1 text-xs">
                <p className="font-medium">{h.descricao ?? h.acao}</p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                  {h.user_nome && ` · ${h.user_nome}`}
                </p>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <NovaPautaDialog reuniaoId={id} open={pautaOpen} onOpenChange={setPautaOpen} onSaved={carregar} />
      <NovoParticipanteDialog reuniaoId={id} open={partOpen} onOpenChange={setPartOpen} onSaved={carregar} />
      <EditarReuniaoDialog reuniao={reun} open={editOpen} onOpenChange={setEditOpen} onSaved={carregar} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{reun.titulo}</strong>.
              <br /><br />
              Isso vai apagar permanentemente:
              <br />• Todas as <strong>{pautas.length} pauta(s)</strong> cadastrada(s)
              <br />• Todos os <strong>{parts.length} participante(s)</strong> convocado(s)
              <br />• Histórico completo da reunião
              <br /><br />
              <strong>Esta ação não pode ser desfeita.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90">
              {busy ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────
function PautaLinha({ pauta, onChange }: { pauta: GovPauta; onChange: () => void }) {
  const [editandoDecisao, setEditandoDecisao] = useState(false);
  const [decisao, setDecisao] = useState(pauta.decisao ?? "");

  async function salvarDecisao() {
    try {
      await atualizarPauta(pauta.id, { decisao });
      setEditandoDecisao(false);
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function marcarParaAssembleia() {
    await atualizarPauta(pauta.id, { status: "para_assembleia" });
    toast.success("Marcada para assembleia");
    onChange();
  }

  async function deletar() {
    if (!confirm("Excluir esta pauta?")) return;
    try {
      await excluirPauta(pauta.id);
      onChange();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <Card className={pauta.classificacao === "deliberativa" ? "border-amber-300 bg-amber-50/20" : ""}>
      <CardContent className="py-2.5 px-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-medium text-sm">{pauta.titulo}</span>
              <Badge variant="outline" className={`text-[9px] ${
                pauta.classificacao === "deliberativa" ? "bg-amber-100 text-amber-700 border-amber-300" :
                "bg-blue-100 text-blue-700 border-blue-300"
              }`}>
                {pauta.classificacao === "deliberativa" ? "Deliberativa" : "Informativa"}
              </Badge>
              <Badge variant="outline" className="text-[9px]">{PAUTA_STATUS_LABEL[pauta.status]}</Badge>
            </div>
            {pauta.descricao && (
              <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap">{pauta.descricao}</p>
            )}
            {pauta.vinculo_tipo === "solicitacao_membresia" && pauta.vinculo_id && (
              <Link to={`/membresia/${pauta.vinculo_id}`} className="text-[10px] text-primary underline">
                → ver solicitação
              </Link>
            )}
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={deletar}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {/* Decisão */}
        {editandoDecisao ? (
          <div className="space-y-1.5">
            <Textarea rows={2} value={decisao} onChange={(e) => setDecisao(e.target.value)}
              placeholder="Decisão tomada nesta reunião..." />
            <div className="flex gap-1">
              <Button size="sm" onClick={salvarDecisao}>Salvar</Button>
              <Button size="sm" variant="outline" onClick={() => setEditandoDecisao(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px]">
            {pauta.decisao ? (
              <p className="flex-1 italic text-emerald-700">"{pauta.decisao}"</p>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditandoDecisao(true)} className="h-6 text-[10px]">
                Registrar decisão
              </Button>
            )}
            {pauta.classificacao === "deliberativa" && pauta.status === "rascunho" && (
              <Button size="sm" variant="outline" onClick={marcarParaAssembleia} className="h-6 text-[10px] text-amber-700">
                → Assembleia
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditarReuniaoDialog({ reuniao, open, onOpenChange, onSaved }: {
  reuniao: GovReuniao; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState(reuniao.titulo);
  const [tipo, setTipo] = useState<GovReuniao["tipo"]>(reuniao.tipo);
  const [data, setData] = useState(reuniao.data_reuniao);
  const [horario, setHorario] = useState(reuniao.horario ?? "");
  const [local, setLocal] = useState(reuniao.local ?? "");
  const [observacoes, setObservacoes] = useState(reuniao.observacoes ?? "");
  const [status, setStatus] = useState<GovReuniao["status"]>(reuniao.status);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(reuniao.titulo);
    setTipo(reuniao.tipo);
    setData(reuniao.data_reuniao);
    setHorario(reuniao.horario ?? "");
    setLocal(reuniao.local ?? "");
    setObservacoes(reuniao.observacoes ?? "");
    setStatus(reuniao.status);
  }, [open, reuniao]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    setBusy(true);
    try {
      await atualizarReuniao(reuniao.id, {
        titulo: titulo.trim(),
        tipo, status,
        data_reuniao: data,
        horario: horario || null,
        local: local.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      toast.success("Reunião atualizada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Editar reunião</DialogTitle>
          <DialogDescription>Ajuste detalhes da reunião.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REUNIAO_TIPO_LABEL) as [GovReuniao["tipo"], string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REUNIAO_STATUS_LABEL) as [GovReuniao["status"], string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NovaPautaDialog({ reuniaoId, open, onOpenChange, onSaved }: {
  reuniaoId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [classificacao, setClassificacao] = useState<GovPautaClassificacao>("informativa");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(""); setDescricao(""); setClassificacao("informativa");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    setBusy(true);
    try {
      await criarPauta({
        reuniao_id: reuniaoId,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        classificacao,
      });
      toast.success("Pauta criada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova pauta</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Button type="button" size="sm" variant={classificacao === "informativa" ? "default" : "outline"}
              onClick={() => setClassificacao("informativa")}>
              ℹ Informativa
            </Button>
            <Button type="button" size="sm" variant={classificacao === "deliberativa" ? "default" : "outline"}
              onClick={() => setClassificacao("deliberativa")}
              className={classificacao === "deliberativa" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}>
              ⚖ Deliberativa
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Deliberativa = vai pra assembleia depois
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NovoParticipanteDialog({ reuniaoId, open, onOpenChange, onSaved }: {
  reuniaoId: string; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [pessoaId, setPessoaId] = useState("");
  const [papel, setPapel] = useState("convidado");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPessoaId(""); setPapel("convidado");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pessoaId) { toast.error("Selecione uma pessoa"); return; }
    setBusy(true);
    try {
      const { data: pessoa } = await supabase.from("membros").select("nome_completo").eq("id", pessoaId).maybeSingle();
      const { error } = await supabase.from("gov_participantes").upsert({
        reuniao_id: reuniaoId,
        pessoa_id: pessoaId,
        pessoa_nome: pessoa?.nome_completo ?? "?",
        papel,
      } as any, { onConflict: "reuniao_id,pessoa_id" });
      if (error) throw error;
      toast.success("Adicionado");
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar participante</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Pessoa *</Label>
            <BuscaPessoa value={pessoaId} onChange={setPessoaId} placeholder="Buscar membro..." />
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={papel} onValueChange={setPapel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diretoria">Diretoria</SelectItem>
                <SelectItem value="lider_min">Líder de Ministério</SelectItem>
                <SelectItem value="lider_area">Líder de Área</SelectItem>
                <SelectItem value="convidado">Convidado</SelectItem>
                <SelectItem value="secretaria">Secretaria</SelectItem>
                <SelectItem value="conselho">Conselho Fiscal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Adicionar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
