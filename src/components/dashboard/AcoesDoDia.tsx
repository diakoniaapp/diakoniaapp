// ─── AcoesDoDia.tsx — Bloco 4 do Dashboard ─────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Cake, Heart, MessageCircle, Sun, Loader2, GraduationCap, ChevronRight, Users, Church,
} from "lucide-react";
import {
  proximosDias, linkWhatsApp,
  type EventoPastoral, type TipoEfemeride,
} from "@/services/agendaPastoralService";
import { useReportarVazio } from "@/components/hoje/vazio";
import { formatarTelefoneSemDDI } from "@/lib/telefone";

function ehDomingo(): boolean {
  return new Date().getDay() === 0;
}

// Horizonte do "vem aí". Trinta dias e não sete porque as efemérides raras
// justamente não cabem numa semana: medido no banco, os próximos 30 dias têm
// 10 aniversários, 3 de membresia e nenhum de casamento ou pastorado. Com
// janela de uma semana, a maioria dos dias não mostra nada — e uma data de
// pastorado, que acontece uma vez por ano, passaria batida se ninguém abrisse
// a tela naquele dia exato.
const DIAS_ADIANTE = 30;
const QUANTOS_ADIANTE = 5;

// Os quatro sufixos dizem de que tipo de ano se trata, sempre — inclusive o
// aniversário, que antes era só "anos".
//
// Numa lista misturada, "12 anos" ao lado de "4 anos de casa" obriga quem lê a
// adivinhar o que cada número conta: idade? tempo de igreja? tempo de
// casamento? O nome do tipo custa duas palavras e tira a adivinhação.
const APARENCIA: Record<TipoEfemeride, { Icon: typeof Cake; sufixo: string; semAnos: string; grad: string; cor: string }> = {
  aniversario: { Icon: Cake,   sufixo: "anos de vida",      semAnos: "Aniversário",
    grad: "bg-gradient-to-br from-pink-100 to-pink-50 border-pink-200",   cor: "text-pink-600" },
  casamento:   { Icon: Heart,  sufixo: "anos de casamento", semAnos: "Aniversário de casamento",
    grad: "bg-gradient-to-br from-rose-100 to-rose-50 border-rose-200",   cor: "text-rose-700 dark:text-rose-400" },
  membresia:   { Icon: Users,  sufixo: "anos de membresia", semAnos: "Aniversário de membresia",
    grad: "bg-gradient-to-br from-sky-100 to-sky-50 border-sky-200",      cor: "text-sky-700" },
  pastorado:   { Icon: Church, sufixo: "anos de pastorado", semAnos: "Aniversário de pastorado",
    grad: "bg-gradient-to-br from-amber-100 to-amber-50 border-amber-200", cor: "text-amber-700 dark:text-amber-400" },
};

function quando(dias: number): string {
  if (dias === 1) return "amanhã";
  if (dias <= 7)  return `em ${dias} dias`;
  return `em ${dias} dias`;
}

export function AcoesDoDia() {
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [adiante, setAdiante] = useState<EventoPastoral[]>([]);
  const [loading, setLoading] = useState(true);

  // Some quando não há nada hoje nem à frente.
  useReportarVazio(loading || (eventos.length === 0 && adiante.length === 0));

  useEffect(() => {
    let cancelled = false;
    // Antes buscava 7 dias e descartava tudo que não fosse hoje. O dado do
    // que vem pela frente já vinha pelo fio e era jogado fora — e cuidado
    // pastoral quase sempre precisa de aviso prévio: descobrir um aniversário
    // na manhã do dia já é quase tarde.
    proximosDias(DIAS_ADIANTE)
      .then(e => {
        if (cancelled) return;
        setEventos(e.filter(ev => ev.dias_ate_evento === 0));
        setAdiante(e.filter(ev => (ev.dias_ate_evento ?? 0) > 0).slice(0, QUANTOS_ADIANTE));
      })
      .catch(() => { if (!cancelled) { setEventos([]); setAdiante([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando...
        </CardContent>
      </Card>
    );
  }

  const domingoHoje = ehDomingo();
  const semEventos = eventos.length === 0;

  if (semEventos && !domingoHoje && adiante.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 text-center text-muted-foreground text-sm">
          <Sun className="w-4 h-4 inline mr-1.5 text-amber-500" />
          Hoje está leve — nenhuma efeméride no calendário pastoral.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sugestão de domingo: fazer chamada */}
      {domingoHoje && (
        <Card className="border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/20 ring-1 ring-gold/40 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="font-medium text-sm">É domingo!</p>
                <p className="text-xs text-muted-foreground">Lembra de fazer a chamada da EBD?</p>
              </div>
            </div>
            <Button asChild size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white border-0"><Link to="/ebd">
                Abrir EBD <ChevronRight className="w-3.5 h-3.5" />
              </Link></Button>
          </CardContent>
        </Card>
      )}

      {/* Eventos pastorais de hoje */}
      {!semEventos && (
        <div className="grid md:grid-cols-2 gap-3">
          {eventos.map(ev => {
            const ap = APARENCIA[ev.tipo] ?? APARENCIA.aniversario;
            const { Icon, sufixo, grad } = ap;
            const iconCor = ap.cor;
            const hasTel = !!ev.telefone || !!ev.telefone_secundario;
            return (
              // min-w-0: sem isso um nome longo alarga o cartão além da
              // célula do grid e a tela rola de lado no celular.
              // Chave com o tipo junto: ref_id de "aniversario" e de
              // "membresia" sao ambos o id da pessoa, entao quem faz
              // aniversario e completa anos de casa no mesmo dia colidiria.
              <Card key={`${ev.tipo}-${ev.ref_id}`} className={`${grad} min-w-0`}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full bg-white/60 ring-1 ring-current/20 flex items-center justify-center shrink-0 ${iconCor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ev.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {(ev.anos_vai_completar ?? 0) > 0
                          ? `${ev.anos_vai_completar} ${sufixo}`
                          : ap.semAnos}
                      </p>
                      {ev.telefone && (
                        <p className="text-xs text-muted-foreground mt-0.5">📞 {formatarTelefoneSemDDI(ev.telefone)}</p>
                      )}
                    </div>
                  </div>
                  {hasTel && (
                    <Button
                      type="button" size="sm"
                      onClick={() => window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer")}
                      className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <MessageCircle className="w-4 h-4" /> Enviar mensagem
                    </Button>
                  )}
                  {!hasTel && (
                    <p className="text-xs text-muted-foreground text-center italic">
                      Sem telefone cadastrado
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Vem aí ──────────────────────────────────────────────────────────
          Deliberadamente discreto: uma linha por pessoa, sem cartão, sem
          botão. Hoje é o assunto da tela; o que vem pela frente serve para
          preparar, não para agir agora. Se isto ganhasse cartões, a tela
          viraria um calendário e deixaria de responder "o que faço hoje". */}
      {adiante.length > 0 && (
        <div className="pt-1">
          <p className="text-xs text-muted-foreground px-1 mb-1.5">Nas próximas semanas</p>
          <ul className="divide-y rounded-md border bg-card/50">
            {adiante.map(ev => {
              const ap = APARENCIA[ev.tipo] ?? APARENCIA.aniversario;
              const anos = ev.anos_vai_completar ?? 0;
              return (
                <li key={`${ev.tipo}-${ev.ref_id}`} className="flex items-center gap-2.5 px-3 py-2 min-w-0">
                  <ap.Icon className={`w-3.5 h-3.5 shrink-0 ${ap.cor}`} />
                  <span className="text-sm truncate flex-1 min-w-0">{ev.titulo}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {anos > 0 ? `${anos} ${ap.sufixo}` : ap.semAnos}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                    {quando(ev.dias_ate_evento ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
