// ─── AgendamentoSemanal — o cartão "agendamento do resumo semanal" + "Testar agora" (saiu da tela Resumos por E-mail para a aba Agendamentos da Central) ──────────────────────────────────────
// Mesmo comportamento de antes (22/09/2026): interruptor, dia/hora/minuto, e o disparo real com confirmação. Só mudou de casa; o estado (`status`) vem da página, que também o entrega ao Histórico.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Mail, Loader2, Save, Send } from "lucide-react";
import {
  definirHorarioResumoSemanal, pausarResumoSemanal, dispararResumoSemanalAgora, DIA_SEMANA_LABEL, type ResumoSemanalStatus,
} from "@/services/sistemaService";

export function AgendamentoSemanal({ status, aoMudar }: { status: ResumoSemanalStatus | null; aoMudar: () => Promise<void> | void }) {
  const [salvandoHorario, setSalvandoHorario] = useState(false);
  const [alternandoAtivo, setAlternandoAtivo] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [confirmandoDisparo, setConfirmandoDisparo] = useState(false);
  const [diaSemana, setDiaSemana] = useState("5");
  const [hora, setHora] = useState("18");
  const [minuto, setMinuto] = useState("0");

  useEffect(() => {
    if (status?.dia_semana != null) setDiaSemana(String(status.dia_semana));
    if (status?.hora != null) setHora(String(status.hora));
    if (status?.minuto != null) setMinuto(String(status.minuto));
  }, [status?.dia_semana, status?.hora, status?.minuto]);

  async function salvarHorario() {
    setSalvandoHorario(true);
    try {
      await definirHorarioResumoSemanal(Number(diaSemana), Number(hora), Number(minuto));
      toast.success("Horário atualizado");
      await aoMudar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar horário");
    } finally {
      setSalvandoHorario(false);
    }
  }

  async function alternarAtivo(v: boolean) {
    setAlternandoAtivo(true);
    try {
      await pausarResumoSemanal(v);
      toast.success(v ? "Envio automático retomado" : "Envio automático pausado");
      await aoMudar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao alterar");
    } finally {
      setAlternandoAtivo(false);
    }
  }

  async function disparar() {
    setDisparando(true);
    try {
      const r = await dispararResumoSemanalAgora();
      if (!r.ok) { toast.error(r.erro ?? "Falha ao enviar"); return; }
      toast.success(`Enviado: ${r.enviados} · Falharam: ${r.falharam ?? 0}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao disparar");
    } finally {
      setDisparando(false);
    }
  }

  return (
    <>
      <Card className="shadow-card-soft" data-cartao="agendamento-semanal">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg">
            <Mail className="w-4 h-4 text-gold" /> Agendamento do resumo semanal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5 cursor-pointer">
            <div>
              <p className="text-sm font-medium">Envio automático</p>
              <p className="text-xs text-muted-foreground">
                {status?.ativo ? "Ativo — roda sozinho toda semana" : "Pausado — não envia até reativar"}
              </p>
            </div>
            <Switch checked={status?.ativo ?? false} onCheckedChange={alternarAtivo} disabled={alternandoAtivo} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Dia da semana</Label>
              <Select value={diaSemana} onValueChange={(v) => { if (v) setDiaSemana(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIA_SEMANA_LABEL.map((l, i) => (<SelectItem key={i} value={String(i)}>{l}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Hora</Label>
              <Input type="number" min={0} max={23} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Minuto</Label>
              <Input type="number" min={0} max={59} value={minuto} onChange={(e) => setMinuto(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Horário de Brasília. Muda o próximo disparo automático, não afeta envios já feitos.</p>

          <Button onClick={salvarHorario} disabled={salvandoHorario} className="gap-1.5">
            {salvandoHorario ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar horário
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-card-soft" data-cartao="testar-agora">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif flex items-center gap-2 text-lg">
            <Send className="w-4 h-4 text-gold" /> Enviar o resumo semanal agora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Dispara um envio real AGORA, para todos os perfis ligados na aba Modelos — não é uma prévia (para ver o e-mail sem enviar, use "Visualizar e-mail" no perfil, na aba Modelos).
            Fora do horário programado, então cada disparo aqui é um e-mail a mais na caixa de cada um.
          </p>
          <Button variant="outline" onClick={() => setConfirmandoDisparo(true)} disabled={disparando} className="gap-1.5">
            {disparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Disparar agora
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmandoDisparo} onOpenChange={(v) => !v && setConfirmandoDisparo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o resumo semanal agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Manda e-mail de verdade agora mesmo, para todas as pessoas dos perfis ligados na aba Modelos
              (e o endereço fixo da administração), cada uma com o que o perfil dela recebe. Não dá pra desfazer depois de enviado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disparando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); setConfirmandoDisparo(false); disparar(); }} disabled={disparando}>
              {disparando ? "Enviando…" : "Enviar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
