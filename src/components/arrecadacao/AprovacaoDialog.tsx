import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, Loader2, MessageCircle, FileCheck, Copy, Phone, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  aprovarReservaComAcordo, montarWhatsAppAprovacao,
  listarDestinatariosTermo, type DestinatarioTermo,
  type Reserva,
} from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reserva: Reserva;
  onAprovado?: () => void;
}

interface DestinatarioState extends DestinatarioTermo {
  selecionado: boolean;
  telefone_editado: string;   // pra editar inline se vazio
  enviado: boolean;
}

function extrairPeriodo(tstzrange: string): { inicio: string; fim: string } {
  const m = tstzrange.match(/\["?([^",]+)[",)]+"?([^",)]+)/);
  if (!m) return { inicio: "", fim: "" };
  return { inicio: m[1], fim: m[2] };
}

export function AprovacaoDialog({ open, onOpenChange, reserva, onAprovado }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  const [acordoTexto, setAcordoTexto] = useState("");
  const [destinatarios, setDestinatarios] = useState<DestinatarioState[]>([]);
  const [carregandoDest, setCarregandoDest] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAprovado(false);
    setAcordoTexto("");
    setDestinatarios([]);
    setCarregandoDest(true);
    listarDestinatariosTermo(reserva.id)
      .then((lst) => {
        setDestinatarios(lst.map((d, i) => ({
          ...d,
          selecionado: i === 0,            // responsável marcado por padrão
          telefone_editado: d.telefone ?? "",
          enviado: false,
        })));
      })
      .catch(() => setDestinatarios([]))
      .finally(() => setCarregandoDest(false));
  }, [open, reserva.id]);

  async function aprovar() {
    setSalvando(true);
    try {
      const r = await aprovarReservaComAcordo(reserva.id);
      setAcordoTexto(r.acordo_texto);
      setAprovado(true);
      toast.success("Reserva aprovada — agora envie o termo");
      onAprovado?.();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("arr_reservas_sem_conflito") || msg.includes("exclusion constraint")) {
        toast.error(
          "⚠ Conflito de datas: já existe outra reserva APROVADA ou EM USO " +
          "deste mesmo espaço no período.",
          { duration: 9000 },
        );
      } else if (msg.includes("Nenhum template")) {
        toast.error("Nenhum template de acordo. Cadastre em arr_acordo_template.");
      } else {
        toast.error(msg || "Erro ao aprovar");
      }
    } finally { setSalvando(false); }
  }

  function montarLinkPara(d: DestinatarioState): { url: string; mensagem: string } {
    const periodo = extrairPeriodo(reserva.periodo);
    const wa = montarWhatsAppAprovacao(
      {
        finalidade: reserva.finalidade,
        espaco_nome: reserva.espaco?.nome ?? "",
        area_nome: reserva.area?.nome ?? "",
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
      },
      { nome: d.nome, telefone: d.telefone_editado },
      acordoTexto,
    );
    return wa;
  }

  function abrirWhatsApp(idx: number) {
    setDestinatarios(prev => prev.map((d, i) => {
      if (i !== idx) return d;
      if (!d.telefone_editado.replace(/\D/g, "")) {
        toast.error("Informe um telefone pra este destinatário");
        return d;
      }
      const { url } = montarLinkPara(d);
      window.open(url, "_blank", "noopener,noreferrer");
      return { ...d, enviado: true };
    }));
  }

  function copiarMensagem(idx: number) {
    const d = destinatarios[idx];
    if (!d) return;
    const { mensagem } = montarLinkPara(d);
    navigator.clipboard.writeText(mensagem);
    toast.success(`Mensagem para ${d.nome} copiada`);
  }

  function atualizarTel(idx: number, valor: string) {
    setDestinatarios(prev => prev.map((d, i) => i === idx ? { ...d, telefone_editado: valor } : d));
  }
  function toggleSelecionado(idx: number) {
    setDestinatarios(prev => prev.map((d, i) => i === idx ? { ...d, selecionado: !d.selecionado } : d));
  }

  const selecionados = destinatarios.filter(d => d.selecionado);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-gold" /> Aprovar reserva
          </DialogTitle>
        </DialogHeader>

        {/* Resumo sempre visível */}
        <div className="border rounded-md p-2 text-xs space-y-1 bg-muted/30">
          <Linha label="Espaço">{reserva.espaco?.nome ?? "—"}</Linha>
          <Linha label="Finalidade">{reserva.finalidade}</Linha>
          <Linha label="Área">{reserva.area?.nome ?? "—"}</Linha>
        </div>

        {!aprovado ? (
          <div className="space-y-3 text-sm">
            <p className="text-[11px] text-muted-foreground">
              Ao aprovar: a reserva fica <Badge variant="outline">aprovada</Badge>,
              a data fica reservada e os destinatários do termo aparecem aqui pra
              envio pelo WhatsApp.
            </p>
            <Button onClick={aprovar} disabled={salvando}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprovar e listar destinatários
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="border-2 border-emerald-300 bg-emerald-50/40 rounded-md p-2 flex items-center gap-2 text-emerald-700 text-xs">
              <CheckCircle2 className="w-4 h-4" /> Reserva aprovada · envie o termo pelos contatos abaixo
            </div>

            {carregandoDest && (
              <div className="text-center text-xs text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> buscando contatos...
              </div>
            )}

            {!carregandoDest && destinatarios.length === 0 && (
              <div className="border border-amber-300 bg-amber-50/50 rounded p-2 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Nenhum contato encontrado (responsável, líder ou solicitante). Use 'copiar' e envie manualmente.
              </div>
            )}

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {destinatarios.map((d, i) => (
                <div key={d.membro_id}
                  className={`border rounded-md p-2 space-y-1.5 ${d.selecionado ? "border-emerald-300 bg-emerald-50/30" : "border-border"}`}>
                  <div className="flex items-start gap-2">
                    <Checkbox checked={d.selecionado} onCheckedChange={() => toggleSelecionado(i)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-xs truncate">{d.nome}</span>
                        <Badge variant="outline" className="text-[9px]">{d.papel_label}</Badge>
                        {d.enviado && (
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-300">enviado</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                        <Input
                          value={d.telefone_editado}
                          onChange={(e) => atualizarTel(i, e.target.value)}
                          placeholder="ex: 21 9 1234-5678"
                          className={`h-7 text-[11px] ${!d.telefone_editado ? "border-amber-300" : ""}`}
                        />
                      </div>
                    </div>
                  </div>
                  {d.selecionado && (
                    <div className="flex gap-1.5 pl-6">
                      <Button size="sm" onClick={() => abrirWhatsApp(i)}
                        className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700 text-xs flex-1">
                        <MessageCircle className="w-3 h-3" /> Abrir WhatsApp
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => copiarMensagem(i)}
                        className="h-7 gap-1 text-xs">
                        <Copy className="w-3 h-3" /> copiar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {selecionados.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-center">
                {selecionados.length} destinatário(s) selecionado(s) — abra um por um.
              </p>
            )}

            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[80px]">{label}:</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
