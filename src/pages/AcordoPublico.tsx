/**
 * /acordo/:token — Página PÚBLICA (sem auth) de aceite do acordo.
 * Acessível por qualquer pessoa com o token UUID.
 * Backend valida o token e o status; aqui só renderizamos.
 */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, FileCheck, CheckCircle2, AlertTriangle, XCircle, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import {
  consultarAcordoPublico, aceitarAcordoPublico,
  type AcordoConsulta,
} from "@/services/arrecadacaoService";

function fmtPeriodo(p: string) {
  // tstzrange: '["2026-10-26 00:00:00+00","2026-10-26 23:59:00+00")'
  const m = p.match(/\["?([^",]+)[",)]+"?([^",)]+)/);
  if (!m) return p;
  const ini = new Date(m[1]).toLocaleString("pt-BR");
  const fim = new Date(m[2]).toLocaleString("pt-BR");
  return `${ini} → ${fim}`;
}

export default function AcordoPublico() {
  const { token } = useParams<{ token: string }>();
  const [acordo, setAcordo] = useState<AcordoConsulta | null>(null);
  const [loading, setLoading] = useState(true);
  const [aceitando, setAceitando] = useState(false);

  async function carregar() {
    if (!token) return;
    setLoading(true);
    try { setAcordo(await consultarAcordoPublico(token)); }
    catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [token]);

  async function aceitar() {
    if (!token) return;
    setAceitando(true);
    try {
      const r = await aceitarAcordoPublico(token);
      if (!r.ok) {
        const msg = r.erro === "prazo_vencido" ? "Prazo de aceite vencido."
                  : r.erro === "estado_invalido" ? "Esta reserva não está mais aguardando aceite."
                  : r.erro === "token_invalido" ? "Link inválido."
                  : "Não foi possível aceitar.";
        toast.error(msg);
      } else {
        toast.success(r.ja_aceito ? "Você já havia aceitado antes." : "Acordo aceito!");
        await carregar();
      }
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setAceitando(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!acordo || acordo.erro) {
    return (
      <Tela tipo="erro" titulo="Link inválido"
        msg="Este link de acordo não existe ou foi revogado." />
    );
  }
  if (acordo.acordo_aceito_em) {
    return (
      <Tela tipo="ok" titulo="Acordo aceito ✓"
        msg={`Você aceitou em ${new Date(acordo.acordo_aceito_em).toLocaleString("pt-BR")}.`}
        acordo={acordo} />
    );
  }
  if (acordo.expirado || acordo.status === "expirada") {
    return (
      <Tela tipo="expirado" titulo="Prazo vencido"
        msg={`Este acordo expirou em ${new Date(acordo.acordo_prazo_aceite!).toLocaleString("pt-BR")}. Entre em contato com a secretaria pra solicitar nova aprovação.`}
        acordo={acordo} />
    );
  }
  if (acordo.status !== "aprovada") {
    return (
      <Tela tipo="erro" titulo="Estado inesperado"
        msg={`Status atual da reserva: ${acordo.status}`}
        acordo={acordo} />
    );
  }

  // Estado normal: aguardando aceite
  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <header className="text-center space-y-1">
          <h1 className="font-serif text-2xl md:text-3xl text-foreground">
            Acordo de uso
          </h1>
          <p className="text-xs text-muted-foreground">
            Quarta Igreja Batista do Rio de Janeiro
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-gold" />
              {acordo.acordo_titulo ?? "Reserva aprovada"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ResumoReserva acordo={acordo} />
            <div className="border-t pt-3">
              <Label>Texto do acordo</Label>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed mt-2 bg-muted/30 p-3 rounded-md max-h-96 overflow-y-auto">
{acordo.acordo_texto}
              </pre>
            </div>
            <div className="bg-amber-50/40 border border-amber-200 rounded-md p-3 text-xs flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                Prazo de aceite: até{" "}
                <strong>{new Date(acordo.acordo_prazo_aceite!).toLocaleString("pt-BR")}</strong>.
                Sem aceite no prazo, a reserva é cancelada e a data liberada pra outras áreas.
              </div>
            </div>
            <Button onClick={aceitar} disabled={aceitando}
              size="lg"
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 h-12 font-semibold text-base">
              {aceitando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Li e aceito as obrigações e regras
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Ao clicar, sua reserva passa pra status "confirmada" e fica garantida.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tela({ tipo, titulo, msg, acordo }: {
  tipo: "ok" | "erro" | "expirado";
  titulo: string;
  msg: string;
  acordo?: AcordoConsulta;
}) {
  const cor = tipo === "ok" ? "emerald" : tipo === "expirado" ? "amber" : "rose";
  const Icon = tipo === "ok" ? CheckCircle2 : tipo === "expirado" ? AlertTriangle : XCircle;
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className={`max-w-md w-full border-${cor}-200`}>
        <CardContent className="p-8 text-center space-y-3">
          <Icon className={`w-12 h-12 text-${cor}-600 mx-auto`} />
          <h1 className="font-serif text-xl">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{msg}</p>
          {acordo && <ResumoReserva acordo={acordo} className="mt-4 text-left text-xs border-t pt-3" />}
          <p className="text-[10px] text-muted-foreground pt-3 border-t">
            Quarta Igreja Batista do Rio de Janeiro · Diakonia APP
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ResumoReserva({ acordo, className }: { acordo: AcordoConsulta; className?: string }) {
  return (
    <div className={"space-y-1 " + (className ?? "")}>
      <Linha label="Espaço">{acordo.espaco_nome} <Badge variant="outline" className="text-[9px]">{acordo.espaco_codigo}</Badge></Linha>
      <Linha label="Finalidade">{acordo.finalidade}</Linha>
      <Linha label="Área">{acordo.area_nome}</Linha>
      <Linha label="Período">{acordo.periodo ? fmtPeriodo(acordo.periodo) : "—"}</Linha>
    </div>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{children}</div>;
}
