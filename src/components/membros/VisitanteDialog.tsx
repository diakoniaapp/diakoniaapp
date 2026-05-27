import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, CalendarCheck, Phone, Home as HomeIcon, ArrowRight, RotateCcw } from "lucide-react";
import { AcolhimentoPanel } from "./AcolhimentoPanel";
import type { Membro } from "@/pages/Membros";

interface VisitanteMembro extends Membro {
  numero_visitas?:   number | null;
  ultimo_contato_em?: string | null;
  data_congregado?:  string | null;
  data_membro?:      string | null;
  created_at:        string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pessoa: Membro | VisitanteMembro | null;
  onSaved?: () => void;
}

interface Visita {
  id: string;
  data: string;
  origem: string | null;
  acompanhado_por: string | null;
  observacoes: string | null;
}

interface Acompanhamento {
  id: string;
  status: "pendente" | "em_andamento" | "concluido" | "sem_retorno";
  contato_feito: boolean;
  data_contato: string | null;
  visita_realizada: boolean;
  data_visita: string | null;
  proximo_passo: string | null;
  observacoes: string | null;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  sem_retorno: "Sem retorno",
};

const statusColor: Record<string, string> = {
  pendente: "bg-warning/15 text-warning border-warning/30",
  em_andamento: "bg-primary/10 text-primary border-primary/30",
  concluido: "bg-success/15 text-success border-success/30",
  sem_retorno: "bg-muted text-muted-foreground border-border",
};

export default function VisitanteDialog({ open, onOpenChange, pessoa, onSaved }: Props) {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [acomp, setAcomp] = useState<Acompanhamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<"retorno" | "contato" | null>(null);

  // novo registro de visita
  const [novaVisita, setNovaVisita] = useState({
    data: new Date().toISOString().slice(0, 10),
    origem: "",
    acompanhado_por: "",
    observacoes: "",
  });

  // novo acompanhamento
  const [novoAcomp, setNovoAcomp] = useState({
    status: "pendente" as Acompanhamento["status"],
    contato_feito: false,
    data_contato: "",
    visita_realizada: false,
    data_visita: "",
    proximo_passo: "",
    observacoes: "",
  });

  // conversão
  const [novoTipo, setNovoTipo] = useState<"congregado" | "membro">("congregado");

  const load = async () => {
    if (!pessoa) return;
    setLoading(true);
    const [{ data: vs }, { data: as }] = await Promise.all([
      supabase.from("visitas").select("*").eq("membro_id", pessoa.id).order("data", { ascending: false }),
      supabase.from("acompanhamentos_visitante").select("*").eq("membro_id", pessoa.id).order("created_at", { ascending: false }),
    ]);
    setVisitas((vs ?? []) as Visita[]);
    setAcomp((as ?? []) as Acompanhamento[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && pessoa) load();
  }, [open, pessoa?.id]);

  const addVisita = async () => {
    if (!pessoa) return;
    if (!novaVisita.data) return toast.error("Informe a data");
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = {
      membro_id: pessoa.id,
      data: novaVisita.data,
      origem: novaVisita.origem || null,
      acompanhado_por: novaVisita.acompanhado_por || null,
      observacoes: novaVisita.observacoes || null,
      registrado_por: user?.id ?? null,
    };
    const { error } = await supabase.from("visitas").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Visita registrada");
    setNovaVisita({ data: new Date().toISOString().slice(0, 10), origem: "", acompanhado_por: "", observacoes: "" });
    load();
  };

  const removeVisita = async (id: string) => {
    const { error } = await supabase.from("visitas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const addAcomp = async () => {
    if (!pessoa) return;
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = {
      membro_id: pessoa.id,
      status: novoAcomp.status,
      contato_feito: novoAcomp.contato_feito,
      data_contato: novoAcomp.data_contato || null,
      visita_realizada: novoAcomp.visita_realizada,
      data_visita: novoAcomp.data_visita || null,
      proximo_passo: novoAcomp.proximo_passo || null,
      observacoes: novoAcomp.observacoes || null,
      registrado_por: user?.id ?? null,
    };
    const { error } = await supabase.from("acompanhamentos_visitante").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Acompanhamento registrado");
    setNovoAcomp({
      status: "pendente", contato_feito: false, data_contato: "",
      visita_realizada: false, data_visita: "", proximo_passo: "", observacoes: "",
    });
    load();
  };

  const registrarRetorno = async () => {
    if (!pessoa) return;
    setBusyAction("retorno");
    const p = pessoa as VisitanteMembro;
    const novaContagem = (p.numero_visitas ?? 1) + 1;
    const { error } = await supabase
      .from("membros")
      .update({
        numero_visitas: novaContagem,
        ...(novaContagem >= 2 ? { status_acolhimento: "retornou" } : {}),
      })
      .eq("id", pessoa.id);
    if (error) toast.error(error.message);
    else { toast.success("Retorno registrado!"); onSaved?.(); }
    setBusyAction(null);
  };

  const marcarContato = async () => {
    if (!pessoa) return;
    setBusyAction("contato");
    const { error } = await supabase
      .from("membros")
      .update({
        ultimo_contato_em: new Date().toISOString(),
        status_acolhimento: "em_acompanhamento",
      })
      .eq("id", pessoa.id);
    if (error) toast.error(error.message);
    else { toast.success("Contato registrado!"); onSaved?.(); }
    setBusyAction(null);
  };

  const converter = async () => {
    if (!pessoa) return;
    const ok = window.confirm(
      `Confirmar conversão de "${pessoa.nome_completo}" para ${novoTipo === "membro" ? "Membro" : "Congregado"}? A história como visitante será preservada.`
    );
    if (!ok) return;
    const agora = new Date().toISOString();
    const dataField = novoTipo === "congregado"
      ? { data_congregado: agora }
      : { data_membro: agora };
    const { error } = await supabase
      .from("membros")
      .update({ tipo_pessoa: novoTipo, ...dataField } as any)
      .eq("id", pessoa.id);
    if (error) return toast.error(error.message);
    toast.success(`${pessoa.nome_completo.split(" ")[0]} deu o próximo passo — agora é ${novoTipo === "membro" ? "Membro" : "Congregado"}! 🎉`);
    onSaved?.();
    onOpenChange(false);
  };

  if (!pessoa) return null;
  const isVisitante = pessoa.tipo_pessoa === "visitante";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle translate="no" className="font-serif text-2xl">
            Acompanhamento: {pessoa.nome_completo}
          </DialogTitle>
          <DialogDescription translate="no">
            Histórico de visitas, follow-up pastoral e conversão em congregado/membro.
          </DialogDescription>
        </DialogHeader>

        {/* Ações rápidas */}
        {isVisitante && (
          <div className="flex flex-wrap gap-2 pt-1 pb-2 border-b">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!!busyAction}
              onClick={registrarRetorno}
            >
              <RotateCcw className="w-4 h-4" />
              <span translate="no">Registrar retorno</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!!busyAction}
              onClick={marcarContato}
            >
              <Phone className="w-4 h-4" />
              <span translate="no">Marcar contato realizado</span>
            </Button>
          </div>
        )}

        {/* M3.5 — Jornada Pastoral */}
        {(() => {
          const p = pessoa as VisitanteMembro;
          const dataCongregado = p.data_congregado;
          const dataMembro     = p.data_membro;
          const fmtDate = (iso: string) =>
            new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
          return (
            <div className="rounded-lg border bg-muted/20 px-4 py-3 space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" translate="no">
                Jornada Pastoral
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span className="text-xs text-muted-foreground" translate="no">
                  🏠 Visitante desde{" "}
                  <span className="font-medium text-foreground">{fmtDate(p.created_at)}</span>
                </span>
                {dataCongregado && (
                  <span className="text-xs text-success" translate="no">
                    ✨ Congregado em{" "}
                    <span className="font-medium">{fmtDate(dataCongregado)}</span>
                  </span>
                )}
                {dataMembro && (
                  <span className="text-xs text-primary" translate="no">
                    🌟 Membro desde{" "}
                    <span className="font-medium">{fmtDate(dataMembro)}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })()}

        <Tabs defaultValue="visitas">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="visitas" translate="no">
              <CalendarCheck className="w-4 h-4 mr-1.5" /> Visitas
            </TabsTrigger>
            <TabsTrigger value="acomp" translate="no">
              <Phone className="w-4 h-4 mr-1.5" /> Acompanhamento
            </TabsTrigger>
            <TabsTrigger value="acolhimento" translate="no">
              Acolhimento 💙
            </TabsTrigger>
            <TabsTrigger value="conversao" translate="no" disabled={!isVisitante}>
              <ArrowRight className="w-4 h-4 mr-1.5" /> Converter
            </TabsTrigger>
          </TabsList>

          {/* VISITAS */}
          <TabsContent value="visitas" className="space-y-4 mt-4">
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="text-sm font-medium" translate="no">Registrar nova visita</div>
              <div className="grid md:grid-cols-3 gap-2">
                <div>
                  <Label translate="no" className="text-xs">Data</Label>
                  <Input type="date" value={novaVisita.data} onChange={(e) => setNovaVisita({ ...novaVisita, data: e.target.value })} />
                </div>
                <div>
                  <Label translate="no" className="text-xs">Origem / culto</Label>
                  <Input placeholder="Culto da noite, EBD..." value={novaVisita.origem} onChange={(e) => setNovaVisita({ ...novaVisita, origem: e.target.value })} />
                </div>
                <div>
                  <Label translate="no" className="text-xs">Acompanhado por</Label>
                  <Input placeholder="Quem trouxe / recebeu" value={novaVisita.acompanhado_por} onChange={(e) => setNovaVisita({ ...novaVisita, acompanhado_por: e.target.value })} />
                </div>
              </div>
              <Textarea rows={2} placeholder="Observações desta visita" value={novaVisita.observacoes} onChange={(e) => setNovaVisita({ ...novaVisita, observacoes: e.target.value })} />
              <Button size="sm" onClick={addVisita} className="gap-2">
                <Plus className="w-4 h-4" /> Registrar visita
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium" translate="no">Histórico ({visitas.length})</div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : visitas.length === 0 ? (
                <p className="text-sm text-muted-foreground" translate="no">Nenhuma visita registrada ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {visitas.map((v) => (
                    <li key={v.id} className="border rounded-md p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                          {v.origem && <Badge variant="outline">{v.origem}</Badge>}
                        </div>
                        {v.acompanhado_por && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <span translate="no">Acompanhado por:</span> {v.acompanhado_por}
                          </div>
                        )}
                        {v.observacoes && (
                          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{v.observacoes}</div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeVisita(v.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* ACOMPANHAMENTO */}
          <TabsContent value="acomp" className="space-y-4 mt-4">
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <div className="text-sm font-medium" translate="no">Novo acompanhamento pastoral</div>
              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <Label translate="no" className="text-xs">Status</Label>
                  <Select value={novoAcomp.status} onValueChange={(v: any) => setNovoAcomp({ ...novoAcomp, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="em_andamento">Em andamento</SelectItem>
                      <SelectItem value="concluido">Concluído</SelectItem>
                      <SelectItem value="sem_retorno">Sem retorno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label translate="no" className="text-xs">Próximo passo</Label>
                  <Input placeholder="Ligar, convidar para célula..." value={novoAcomp.proximo_passo} onChange={(e) => setNovoAcomp({ ...novoAcomp, proximo_passo: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <Checkbox id="contato" checked={novoAcomp.contato_feito} onCheckedChange={(v) => setNovoAcomp({ ...novoAcomp, contato_feito: !!v })} />
                  <Label htmlFor="contato" translate="no" className="text-sm">Contato feito</Label>
                  <Input className="ml-auto w-40" type="date" disabled={!novoAcomp.contato_feito} value={novoAcomp.data_contato} onChange={(e) => setNovoAcomp({ ...novoAcomp, data_contato: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <Checkbox id="visita" checked={novoAcomp.visita_realizada} onCheckedChange={(v) => setNovoAcomp({ ...novoAcomp, visita_realizada: !!v })} />
                  <Label htmlFor="visita" translate="no" className="text-sm">Visita realizada</Label>
                  <Input className="ml-auto w-40" type="date" disabled={!novoAcomp.visita_realizada} value={novoAcomp.data_visita} onChange={(e) => setNovoAcomp({ ...novoAcomp, data_visita: e.target.value })} />
                </div>
              </div>
              <Textarea rows={2} placeholder="Observações do acompanhamento" value={novoAcomp.observacoes} onChange={(e) => setNovoAcomp({ ...novoAcomp, observacoes: e.target.value })} />
              <Button size="sm" onClick={addAcomp} className="gap-2">
                <Plus className="w-4 h-4" /> Registrar acompanhamento
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium" translate="no">Histórico ({acomp.length})</div>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : acomp.length === 0 ? (
                <p className="text-sm text-muted-foreground" translate="no">Nenhum acompanhamento registrado ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {acomp.map((a) => (
                    <li key={a.id} className="border rounded-md p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={statusColor[a.status]}>{statusLabel[a.status]}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString("pt-BR")}
                        </span>
                        {a.contato_feito && (
                          <Badge variant="outline" className="bg-primary/5">
                            <Phone className="w-3 h-3 mr-1" /> {a.data_contato ? new Date(a.data_contato + "T00:00:00").toLocaleDateString("pt-BR") : "Contato feito"}
                          </Badge>
                        )}
                        {a.visita_realizada && (
                          <Badge variant="outline" className="bg-primary/5">
                            <HomeIcon className="w-3 h-3 mr-1" /> {a.data_visita ? new Date(a.data_visita + "T00:00:00").toLocaleDateString("pt-BR") : "Visita feita"}
                          </Badge>
                        )}
                      </div>
                      {a.proximo_passo && (
                        <div className="text-sm mt-1.5">
                          <span className="text-muted-foreground" translate="no">Próximo passo: </span>{a.proximo_passo}
                        </div>
                      )}
                      {a.observacoes && (
                        <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{a.observacoes}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {/* ACOLHIMENTO */}
          <TabsContent value="acolhimento" className="mt-4">
            <AcolhimentoPanel pessoa={pessoa} onUpdated={load} />
          </TabsContent>

          {/* CONVERSAO */}
          <TabsContent value="conversao" className="space-y-4 mt-4">
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm text-muted-foreground" translate="no">
                Promover este visitante. A pessoa permanece no banco e seu histórico (visitas, acompanhamento) é preservado. A mudança de tipo será registrada no histórico pastoral.
              </p>
              <div>
                <Label translate="no" className="text-xs">Converter para</Label>
                <Select value={novoTipo} onValueChange={(v: any) => setNovoTipo(v)}>
                  <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="congregado">Congregado</SelectItem>
                    <SelectItem value="membro">Membro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={converter} className="gap-2">
                <ArrowRight className="w-4 h-4" /> Confirmar conversão
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
                 }
