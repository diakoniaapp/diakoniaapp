import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, MessageCircle, FileCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  aprovarReservaComAcordo, montarWhatsAppAprovacao,
  type Reserva,
} from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reserva: Reserva;
  onAprovado?: () => void;
}

function extrairPeriodo(tstzrange: string): { inicio: string; fim: string } {
  const m = tstzrange.match(/\["?([^",]+)[",)]+"?([^",)]+)/);
  if (!m) return { inicio: "", fim: "" };
  return { inicio: m[1], fim: m[2] };
}

export function AprovacaoDialog({ open, onOpenChange, reserva, onAprovado }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ whatsappUrl: string; mensagem: string } | null>(null);
  const [telefone, setTelefone] = useState<string>("");
  const [nomeResp, setNomeResp] = useState<string>("");

  useEffect(() => {
    if (!open || !reserva.responsavel_id) return;
    setResultado(null);
    (async () => {
      const { data } = await supabase.from("membros")
        .select("nome_completo, telefone_celular")
        .eq("id", reserva.responsavel_id).maybeSingle();
      setNomeResp(data?.nome_completo ?? "");
      setTelefone(data?.telefone_celular ?? "");
    })();
  }, [open, reserva.responsavel_id]);

  async function aprovar() {
    setSalvando(true);
    try {
      const r = await aprovarReservaComAcordo(reserva.id);
      const periodo = extrairPeriodo(reserva.periodo);
      const wa = montarWhatsAppAprovacao(
        {
          finalidade: reserva.finalidade,
          espaco_nome: reserva.espaco?.nome ?? "",
          area_nome: reserva.area?.nome ?? "",
          periodo_inicio: periodo.inicio,
          periodo_fim: periodo.fim,
        },
        { nome: nomeResp || "irmão(ã)", telefone },
        r.acordo_texto,
      );
      setResultado({ whatsappUrl: wa.url, mensagem: wa.mensagem });
      toast.success("Reserva aprovada — envie o termo pelo WhatsApp");
      onAprovado?.();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("arr_reservas_sem_conflito") || msg.includes("exclusion constraint")) {
        toast.error(
          "⚠ Conflito de datas: já existe outra reserva APROVADA ou EM USO " +
          "deste mesmo espaço no período. Veja a agenda antes de aprovar.",
          { duration: 9000 }
        );
      } else if (msg.includes("Nenhum template")) {
        toast.error("Nenhum template de acordo. Cadastre em arr_acordo_template.");
      } else {
        toast.error(msg || "Erro ao aprovar");
      }
    } finally { setSalvando(false); }
  }

  function copiarMensagem() {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado.mensagem);
    toast.success("Mensagem copiada");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-gold" /> Aprovar reserva
          </DialogTitle>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-3 text-sm">
            <div className="border rounded-md p-2 text-xs space-y-1 bg-muted/30">
              <Linha label="Espaço">{reserva.espaco?.nome ?? "—"}</Linha>
              <Linha label="Finalidade">{reserva.finalidade}</Linha>
              <Linha label="Área">{reserva.area?.nome ?? "—"}</Linha>
              <Linha label="Responsável">{nomeResp || "—"}</Linha>
            </div>
            {!telefone && (
              <p className="text-[11px] text-amber-700">
                ⚠ Responsável sem telefone. O termo precisará ser enviado manualmente.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Ao aprovar: a reserva fica <Badge variant="outline">aprovada</Badge>,
              a data fica reservada e o termo de uso é montado pra você enviar pelo WhatsApp.
              Não há mais aceite digital — o uso é o aceite (Fase 7).
            </p>
            <Button onClick={aprovar} disabled={salvando}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprovar e montar mensagem
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="border-2 border-emerald-300 bg-emerald-50/40 rounded-md p-3">
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> Reserva aprovada
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Envie o termo de uso pelo WhatsApp do solicitante.
              </p>
            </div>

            <Button asChild size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 h-12 font-semibold text-base">
              <a href={resultado.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-5 h-5" /> Abrir WhatsApp e enviar
              </a>
            </Button>
            <Button variant="outline" onClick={copiarMensagem} className="w-full text-xs">
              copiar mensagem
            </Button>
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
