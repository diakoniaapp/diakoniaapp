import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Loader2, MessageCircle, FileCheck, ExternalLink,
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
  return {
    inicio: new Date(m[1]).toISOString().slice(0, 10),
    fim: new Date(m[2]).toISOString().slice(0, 10),
  };
}

export function AprovacaoDialog({ open, onOpenChange, reserva, onAprovado }: Props) {
  const [prazoDias, setPrazoDias] = useState(3);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ token: string; whatsappUrl: string; linkAceite: string } | null>(null);
  const [telefone, setTelefone] = useState<string>("");
  const [nomeResp, setNomeResp] = useState<string>("");

  useEffect(() => {
    if (!open || !reserva.responsavel_id) return;
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
      const r = await aprovarReservaComAcordo(reserva.id, prazoDias);
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
        r.token,
        prazoDias,
      );
      setResultado({
        token: r.token,
        whatsappUrl: wa.url,
        linkAceite: `${window.location.origin}/acordo/${r.token}`,
      });
      toast.success("Reserva aprovada · acordo gerado · WhatsApp pronto");
      onAprovado?.();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("arr_reservas_sem_conflito") || msg.includes("exclusion constraint")) {
        toast.error(
          "⚠ Conflito de datas: já existe outra reserva APROVADA, CONFIRMADA ou EM USO " +
          "deste mesmo espaço no período. Verifique a agenda em /arrecadacao antes de aprovar.",
          { duration: 9000 }
        );
      } else if (msg.includes("Nenhum template")) {
        toast.error("Nenhum template de acordo encontrado. Aplique Arrecadacao_F6_acordo_migration.sql primeiro.");
      } else {
        toast.error(msg || "Erro ao aprovar");
      }
    } finally { setSalvando(false); }
  }

  function copiarLink() {
    if (!resultado) return;
    navigator.clipboard.writeText(resultado.linkAceite);
    toast.success("Link copiado");
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
            <Field label="Prazo de aceite (dias)">
              <Input type="number" min={1} max={30} value={prazoDias}
                onChange={e => setPrazoDias(Math.max(1, Math.min(30, Number(e.target.value))))} />
            </Field>
            {!telefone && (
              <p className="text-[11px] text-amber-700">
                ⚠ Responsável sem telefone cadastrado. Link de aceite vai precisar ser enviado manualmente.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Ao aprovar: a reserva passa pra <strong>aprovada (aguardando aceite)</strong>,
              a data fica segurada e um link único é gerado pro solicitante aceitar.
            </p>
            <Button onClick={aprovar} disabled={salvando} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Aprovar e gerar acordo
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="border-2 border-emerald-300 bg-emerald-50/40 rounded-md p-3">
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" /> Reserva aprovada
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Agora envie o link de aceite pro solicitante. Sem aceite no prazo, a reserva expira.
              </p>
            </div>

            <Field label="Link de aceite (pra enviar manualmente se necessário)">
              <div className="flex gap-1.5">
                <Input value={resultado.linkAceite} readOnly className="text-xs" />
                <Button size="sm" variant="outline" onClick={copiarLink}>copiar</Button>
              </div>
            </Field>

            <Button asChild size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 h-12 font-semibold text-base">
              <a href={resultado.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-5 h-5" /> Abrir WhatsApp e enviar
              </a>
            </Button>
            <a href={resultado.linkAceite} target="_blank" rel="noopener noreferrer"
              className="block text-xs text-center text-gold hover:underline">
              <ExternalLink className="w-3 h-3 inline mr-1" /> Ver página de aceite (testar)
            </a>
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full">
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-24">{label}:</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
