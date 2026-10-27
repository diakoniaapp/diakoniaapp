// ─── ResumoDiarioPainel — o botão "Resumo diário" da Mesa (23/10/2026) ─────────────────────────────────────────────────────────────────────────────────────
// Decisão dela: o botão "Preparar envio" não diz mais o que a funcionalidade faz — a Tesouraria agora tem um e-mail diário automático. O painel responde, de uma vez: está ligado? quando saiu o último?
// quando sai o próximo? para quem? E dá as quatro ações: Visualizar, Enviar agora, Configurar e — enquanto o e-mail não leva os anexos (Fase 2) — o ENVIO MANUAL de antes (escolher itens, WhatsApp, ZIP).
// Ver, enviar e configurar são da administração (admin/diakonia: é a regra do banco e da Edge Function); o resto da Tesouraria só vê o atalho do envio manual.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Eye, FileText, Loader2, Mail, Send, Settings, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import * as sistema from "@/services/sistemaService";
import type { PreviaDoDiario, ResultadoDoEnvioAgora, ResumoDiarioStatus } from "@/services/sistemaService";
import { descreverAgenda, proximoEnvio, quandoFoi } from "@/lib/resumoDiarioConfig";

/** As chamadas ao servidor; a tela usa as reais e o teste injeta as dele. */
export interface ServicoDoPainelDiario {
  carregarStatusResumoDiario: typeof sistema.carregarStatusResumoDiario;
  previaDoResumoDiario: typeof sistema.previaDoResumoDiario;
  enviarResumoDiarioAgora: typeof sistema.enviarResumoDiarioAgora;
}
const SERVICO_REAL: ServicoDoPainelDiario = {
  carregarStatusResumoDiario: sistema.carregarStatusResumoDiario, previaDoResumoDiario: sistema.previaDoResumoDiario, enviarResumoDiarioAgora: sistema.enviarResumoDiarioAgora,
};

/** O que dizer depois do "Enviar agora" — o servidor recusa com um motivo em vez de errar. */
export function mensagemDoEnvioAgora(r: ResultadoDoEnvioAgora): { tipo: "ok" | "aviso"; texto: string } {
  if (r.enviados > 0) {
    const para = `${r.enviados} ${r.enviados === 1 ? "destinatário" : "destinatários"}`;
    const itens = r.itens + r.reembolsos;
    const falhas = r.falharam > 0 ? ` ${r.falharam} ${r.falharam === 1 ? "e-mail não saiu" : "e-mails não saíram"} — confira os endereços.` : "";
    return { tipo: r.falharam > 0 ? "aviso" : "ok", texto: `Resumo enviado a ${para}${itens > 0 ? ` · ${itens} ${itens === 1 ? "item" : "itens"}` : ""}.${falhas}` };
  }
  if (r.motivo === "sem_destinatarios") return { tipo: "aviso", texto: "Não há destinatários cadastrados — nada foi enviado. Cadastre em Configurar." };
  if (r.motivo === "enviado_ha_pouco") return { tipo: "aviso", texto: "Já saiu um resumo há menos de 20 minutos — nada foi enviado de novo." };
  if (r.motivo === "nada_a_pagar") return { tipo: "aviso", texto: "Não há nada a pagar hoje — nada foi enviado." };
  return { tipo: "aviso", texto: "Nada foi enviado." };
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  /** abre o "Preparar envio" de sempre (escolher itens, WhatsApp, ZIP) */
  onEnvioManual: () => void;
  servico?: ServicoDoPainelDiario;
  /** o relógio, para o teste */
  agora?: () => Date;
}

function Linha({ icone: Icone, rotulo, children }: { icone: typeof Mail; rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-t first:border-t-0">
      <Icone className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-2xs uppercase tracking-wide text-muted-foreground font-semibold">{rotulo}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export function ResumoDiarioPainel({ aberto, onFechar, onEnvioManual, servico = SERVICO_REAL, agora = () => new Date() }: Props) {
  const { hasRole } = useAuth();
  const podeGerir = hasRole(["admin", "diakonia"]);
  const [status, setStatus] = useState<ResumoDiarioStatus | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [previa, setPrevia] = useState<{ carregando: boolean; dados?: PreviaDoDiario; erro?: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setStatus(await servico.carregarStatusResumoDiario()); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar o resumo diário."); }
    finally { setCarregando(false); }
  }, [servico]);
  useEffect(() => { if (aberto && podeGerir) void carregar(); }, [aberto, podeGerir, carregar]);

  const visualizar = async () => {
    setPrevia({ carregando: true });
    try { setPrevia({ carregando: false, dados: await servico.previaDoResumoDiario() }); }
    catch (e) { setPrevia({ carregando: false, erro: e instanceof Error ? e.message : "Não foi possível montar o e-mail." }); }
  };

  const enviarAgora = async () => {
    setEnviando(true);
    try {
      const m = mensagemDoEnvioAgora(await servico.enviarResumoDiarioAgora());
      if (m.tipo === "ok") toast.success(m.texto); else toast.warning(m.texto);
      setConfirmando(false);
      void carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível enviar o resumo."); }
    finally { setEnviando(false); }
  };

  const config = status?.config;
  const destinatarios = status?.destinatarios ?? [];
  const ligado = !!config?.ativo;
  const proximo = config ? proximoEnvio(config, agora()) : null;
  const ultimo = quandoFoi(status?.ultimo_envio?.em);
  const agendamentoParado = ligado && !!status && (!status.agendamento_existe || !status.agendamento_ativo);
  const nomes = destinatarios.slice(0, 3).map(d => d.nome.split(" ")[0]).join(", ") + (destinatarios.length > 3 ? ` e mais ${destinatarios.length - 3}` : "");

  return (
    <>
      <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="font-serif flex items-center gap-2"><Mail className="w-4 h-4 text-gold" /> Resumo diário</DialogTitle>
            <DialogDescription>O e-mail que a Tesouraria recebe todo dia com o que há para pagar — linha digitável, Pix e origem de cada conta.</DialogDescription>
          </DialogHeader>

          {!podeGerir && (
            <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
              Quem liga, agenda e envia o resumo diário é a administração. Você pode preparar um envio à mão, escolhendo o que vai.
            </p>
          )}

          {podeGerir && carregando && !status && (
            <p className="py-6 text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo a situação…</p>
          )}
          {podeGerir && erro && <p role="alert" className="text-sm text-destructive-text border border-destructive-line rounded-md px-3 py-2">{erro}</p>}

          {podeGerir && status && config && (
            <div data-resumo-diario-situacao>
              <div className="flex items-center gap-2 mb-1">
                {ligado
                  ? <Badge variant="secondary" className="gap-1 text-success-text"><CheckCircle2 className="w-3 h-3" /> Ligado</Badge>
                  : <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="w-3 h-3" /> Desligado</Badge>}
                <span className="text-xs text-muted-foreground">{descreverAgenda(config)}</span>
              </div>
              {agendamentoParado && (
                <p className="text-xs text-warning-text border border-warning-line bg-warning-soft/40 rounded-md px-3 py-2 mb-1">
                  Está ligado, mas o agendamento no servidor não está ativo — o e-mail das {String(config.hora).padStart(2, "0")}:{String(config.minuto).padStart(2, "0")} não vai sair sozinho. Abra Configurar para religar.
                </p>
              )}
              <Linha icone={CheckCircle2} rotulo="Último envio">
                {ultimo ? <>{ultimo}{status.ultimo_envio?.itens ? <span className="text-muted-foreground"> · {status.ultimo_envio.itens} {status.ultimo_envio.itens === 1 ? "item" : "itens"}</span> : null}</> : <span className="text-muted-foreground">Ainda não enviou</span>}
              </Linha>
              <Linha icone={CalendarClock} rotulo="Próximo envio">
                {proximo ? proximo.rotulo : <span className="text-muted-foreground">{ligado ? "Sem dia escolhido" : "— desligado"}</span>}
              </Linha>
              <Linha icone={Users} rotulo="Destinatários">
                {destinatarios.length === 0
                  ? <span className="text-warning-text">Nenhum cadastrado</span>
                  : <>{destinatarios.length} <span className="text-muted-foreground">· {nomes}</span></>}
              </Linha>

              <div className="flex flex-wrap gap-2 pt-3">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={visualizar}><Eye className="w-3.5 h-3.5" /> Visualizar</Button>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setConfirmando(true)} disabled={destinatarios.length === 0}><Send className="w-3.5 h-3.5" /> Enviar agora</Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/comunicacao?aba=agendamentos" onClick={onFechar}><Settings className="w-3.5 h-3.5" /> Configurar</Link></Button>
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Enquanto o e-mail diário não leva os boletos anexados, o envio à mão continua: escolher o que vai, versão para WhatsApp e o ZIP dos boletos.</p>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5 px-2" onClick={() => { onFechar(); onEnvioManual(); }}>
              <FileText className="w-3.5 h-3.5" /> Envio manual (escolher, WhatsApp, ZIP)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmando} onOpenChange={o => { if (!enviando) setConfirmando(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o resumo de hoje agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai para {destinatarios.length} {destinatarios.length === 1 ? "destinatário" : "destinatários"} ({nomes}).
              {proximo ? ` O envio de ${proximo.rotulo} continua normalmente.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); void enviarAgora(); }} disabled={enviando}>
              {enviando ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Enviando…</> : "Enviar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previa} onOpenChange={o => { if (!o) setPrevia(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif">E-mail de hoje</DialogTitle>
            <DialogDescription>Como sairia agora, com os dados de hoje. Nada é enviado.</DialogDescription>
          </DialogHeader>
          {previa?.carregando && <p className="py-8 text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Montando o e-mail…</p>}
          {previa?.erro && <p role="alert" className="text-sm text-destructive-text">{previa.erro}</p>}
          {previa?.dados && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{previa.dados.assunto}</p>
              <iframe title="Prévia do resumo diário" sandbox="" srcDoc={previa.dados.html} className="w-full h-[60vh] rounded-md border bg-white" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
