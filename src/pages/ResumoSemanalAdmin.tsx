// ─── ResumoSemanalAdmin.tsx ──────────────────────────────────────────────
//
// Pedido da Telma (22/09/2026): "construir uma tela de configuração, para
// perfil de administrador e dono do sistema" — depois de perguntar "onde
// o relatório semanal é configurado?" e descobrir que era só banco/Edge
// Function, sem tela nenhuma. Restrita a admin + diakonia (não
// `ROLES_ADMIN` do navConfig, que inclui secretaria — aqui é mais
// estreito de propósito, é configuração de sistema).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Mail, Loader2, Save, Send, CheckCircle2, XCircle, Users, History, Info,
} from "lucide-react";
import {
  carregarStatusResumoSemanal, definirHorarioResumoSemanal, pausarResumoSemanal,
  dispararResumoSemanalAgora,
  DIA_SEMANA_LABEL, PAPEL_LABEL,
  type ResumoSemanalStatus,
} from "@/services/sistemaService";

function fmtExecucao(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function ResumoSemanalAdmin() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<ResumoSemanalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvandoHorario, setSalvandoHorario] = useState(false);
  const [alternandoAtivo, setAlternandoAtivo] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [confirmandoDisparo, setConfirmandoDisparo] = useState(false);

  const [diaSemana, setDiaSemana] = useState("5");
  const [hora, setHora] = useState("18");
  const [minuto, setMinuto] = useState("0");

  useEffect(() => {
    if (!hasRole(["admin", "diakonia"])) navigate("/", { replace: true });
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const s = await carregarStatusResumoSemanal();
      setStatus(s);
      if (s.dia_semana != null) setDiaSemana(String(s.dia_semana));
      if (s.hora != null) setHora(String(s.hora));
      if (s.minuto != null) setMinuto(String(s.minuto));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar configuração");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function salvarHorario() {
    setSalvandoHorario(true);
    try {
      await definirHorarioResumoSemanal(Number(diaSemana), Number(hora), Number(minuto));
      toast.success("Horário atualizado");
      await carregar();
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
      await carregar();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Resumo Semanal por E-mail"
        description="Fase 4 da Bússola do Diakonia — quando dispara, quem recebe, e o histórico dos últimos envios"
      />

      <div className="p-4 md:p-8 space-y-6 max-w-2xl">

        {/* ── Agendamento ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Mail className="w-4 h-4 text-gold" /> Agendamento
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
                    {DIA_SEMANA_LABEL.map((l, i) => (
                      <SelectItem key={i} value={String(i)}>{l}</SelectItem>
                    ))}
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

        {/* ── Destinatários ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Users className="w-4 h-4 text-gold" /> Quem recebe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2.5">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Calculado sozinho a partir de quem tem cada papel (Usuários) e do e-mail
                cadastrado na ficha da pessoa — não dá pra editar aqui. Sem e-mail
                cadastrado, a pessoa não aparece na lista.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Admin / dono do sistema</p>
                <p className="text-xs text-muted-foreground">Resumo completo — pastoral, secretaria e tesouraria</p>
              </div>
              <Badge variant="outline">e-mail fixo em Secrets</Badge>
            </div>
            {(status?.destinatarios.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                Ninguém mais com e-mail cadastrado para pastor, secretaria ou tesouraria.
              </p>
            ) : (
              status?.destinatarios.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.nome}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.email}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0">{PAPEL_LABEL[d.papel]} — só a própria seção</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Últimas execuções ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <History className="w-4 h-4 text-gold" /> Últimas execuções
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(status?.execucoes.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">Nenhum disparo registrado ainda.</p>
            ) : (
              status?.execucoes.map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm">
                  {e.status === "succeeded"
                    ? <CheckCircle2 className="w-4 h-4 text-success-text shrink-0" />
                    : <XCircle className="w-4 h-4 text-destructive-text shrink-0" />}
                  <span className="text-muted-foreground shrink-0">{fmtExecucao(e.inicio)}</span>
                  <span className="truncate">{e.mensagem ?? e.status}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Testar agora ── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-3">
            <CardTitle className="font-serif flex items-center gap-2 text-lg">
              <Send className="w-4 h-4 text-gold" /> Testar agora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dispara um envio real AGORA, pros mesmos destinatários acima — não é uma prévia.
              Fora do horário programado, então cada disparo aqui é um e-mail a mais na caixa de cada um.
            </p>
            <Button variant="outline" onClick={() => setConfirmandoDisparo(true)} disabled={disparando} className="gap-1.5">
              {disparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Disparar agora
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmandoDisparo} onOpenChange={(v) => !v && setConfirmandoDisparo(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o resumo semanal agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Manda e-mail de verdade agora mesmo, pra {(status?.destinatarios.length ?? 0) + 1} pessoa(s)
              (admin/dono do sistema + {status?.destinatarios.length ?? 0} papel(éis) com e-mail cadastrado).
              Não dá pra desfazer depois de enviado.
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
    </div>
  );
}
