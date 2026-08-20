// ─── AcoesDoDia.tsx — Bloco 4 do Dashboard ─────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Cake, Heart, MessageCircle, Sun, Loader2, GraduationCap, ChevronRight, Users, Church,
  Check,
} from "lucide-react";
import {
  proximosDias, linkWhatsApp,
  type EventoPastoral, type TipoEfemeride,
} from "@/services/agendaPastoralService";
import { useReportarVazio } from "@/components/hoje/vazio";
import { toast } from "sonner";
import {
  felicitacoesDeHoje, marcarFelicitada, chaveDaEfemeride,
} from "@/services/efemerideFeita";
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
    grad: "bg-gradient-to-br bg-celebracao-soft border-celebracao-line",   cor: "text-celebracao-text" },
  casamento:   { Icon: Heart,  sufixo: "anos de casamento", semAnos: "Aniversário de casamento",
    grad: "bg-celebracao-soft border-celebracao-line",   cor: "text-celebracao-text" },
  membresia:   { Icon: Users,  sufixo: "anos de membresia", semAnos: "Aniversário de membresia",
    grad: "bg-info-soft border-info-line",      cor: "text-info-text" },
  pastorado:   { Icon: Church, sufixo: "anos de pastorado", semAnos: "Aniversário de pastorado",
    grad: "bg-warning-soft border-warning-line", cor: "text-warning-text" },
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
  const [feitas,  setFeitas]  = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState<string | null>(null);

  // O que ainda espera alguém. Cumprimentar tira da lista — o bloco é
  // uma fila de tarefas do dia, não um relatório do que o calendário diz.
  const pendentes = eventos.filter(ev => !feitas.has(chaveDaEfemeride(ev)));
  const tudoFeitoHoje = eventos.length > 0 && pendentes.length === 0;

  // Some quando não sobrou tarefa para hoje nem aviso para os próximos
  // dias. O que já foi cumprimentado não conta: o dia foi resolvido, e o
  // espaço volta para quem ainda precisa dele.
  useReportarVazio(loading || (pendentes.length === 0 && adiante.length === 0));

  useEffect(() => {
    let cancelled = false;
    // Antes buscava 7 dias e descartava tudo que não fosse hoje. O dado do
    // que vem pela frente já vinha pelo fio e era jogado fora — e cuidado
    // pastoral quase sempre precisa de aviso prévio: descobrir um aniversário
    // na manhã do dia já é quase tarde.
    // As duas consultas juntas: a lista do dia não pode aparecer antes de
    // saber o que já foi feito, ou os cartões piscariam na tela e sumiriam
    // — e alguém mandaria a mensagem duas vezes nesse intervalo.
    Promise.all([proximosDias(DIAS_ADIANTE), felicitacoesDeHoje()])
      .then(([e, jaFeitas]) => {
        if (cancelled) return;
        setEventos(e.filter(ev => ev.dias_ate_evento === 0));
        setAdiante(e.filter(ev => (ev.dias_ate_evento ?? 0) > 0).slice(0, QUANTOS_ADIANTE));
        setFeitas(jaFeitas);
      })
      .catch(() => { if (!cancelled) { setEventos([]); setAdiante([]); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Cumprimentar e marcar sao o MESMO gesto, de proposito.
  //
  // Um botao separado de "marcar como feito" parece mais seguro, mas na
  // pratica ninguem aperta o segundo botao — e uma lista de tarefas que
  // nunca esvazia deixa de ser lista de tarefas. Quem clica em "Enviar
  // mensagem" esta cumprimentando; e disso que o registro fala.
  //
  // `visita_historico` nao tem politica de DELETE: nao ha como desfazer.
  // Por isso a marca so nasce de um clique deliberado num botao grande e
  // nomeado, nunca de passar o mouse ou de rolar a tela.
  async function cumprimentar(ev: EventoPastoral, resumo: string, abrirWhatsApp: boolean) {
    // A janela abre ANTES de qualquer await: o navegador so permite
    // window.open dentro do gesto do usuario, e um await no meio faz o
    // bloqueador de pop-up engolir o WhatsApp em silencio.
    if (abrirWhatsApp) window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer");

    const chave = chaveDaEfemeride(ev);
    setSalvando(chave);
    // Otimista: o cartao sai na hora. Esperar o banco para so entao
    // remover deixaria o cartao piscando enquanto a pessoa ja esta no
    // WhatsApp, e ela voltaria sem saber se contou ou nao.
    setFeitas(prev => new Set(prev).add(chave));

    const r = await marcarFelicitada(ev, resumo);
    setSalvando(null);
    if (!r.ok) {
      // Devolve o cartao para a lista. Sumir por engano e o pior desfecho
      // possivel aqui: a pessoa fica sem ser cumprimentada e ninguem sabe.
      setFeitas(prev => { const n = new Set(prev); n.delete(chave); return n; });
      toast.error(r.erro ?? "Não foi possível registrar o cumprimento.");
    }
  }

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
  // "Sem evento" aqui quer dizer "sem nada a fazer", e nao "o calendario
  // esta vazio": um aniversario ja cumprimentado nao e tarefa nenhuma.
  const semEventos = pendentes.length === 0;

  if (semEventos && !domingoHoje && adiante.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 text-center text-muted-foreground text-sm">
          <Sun className="w-4 h-4 inline mr-1.5 text-warning-text" />
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

      {/* ── Quando hoje nao tem nada ────────────────────────────────────

          Sem esta linha, um dia vazio mostrava direto a lista do que vem
          pela frente — e quem lia entendia que o aniversario de daqui a
          cinco dias era hoje. O bloco se chama "Ações de hoje": se hoje nao
          tem nada, ele precisa DIZER isso, e nao deixar a proxima lista
          ocupar o lugar da resposta.

          Nao usa o cartao "Hoje esta leve" de cima porque aquele encerra o
          assunto — e aqui o assunto continua, logo abaixo. */}
      {semEventos && adiante.length > 0 && (
        <p className="text-sm text-muted-foreground px-1">
          {/* Uma linha, nao um cartao: o dia foi resolvido, e o espaco
              volta para quem ainda precisa dele. Mas dizer que foi
              resolvido importa — sem isso, quem cumprimentou tres pessoas
              ve o bloco vazio e fica na duvida se a tela carregou. */}
          {tudoFeitoHoje ? (
            <>
              <Check className="w-3.5 h-3.5 inline mr-1.5 text-success" />
              Tudo cumprimentado hoje.
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 inline mr-1.5 text-warning-text" />
              Nenhuma efeméride hoje.
            </>
          )}
        </p>
      )}

      {/* Eventos pastorais de hoje */}
      {!semEventos && (
        <div className="grid md:grid-cols-2 gap-3">
          {pendentes.map(ev => {
            const ap = APARENCIA[ev.tipo] ?? APARENCIA.aniversario;
            const { Icon, sufixo, grad } = ap;
            const iconCor = ap.cor;
            const hasTel = !!ev.telefone || !!ev.telefone_secundario;
            // A mesma frase que a pessoa le no cartao e a que fica
            // guardada na ficha dela. Escrita uma vez, para nao divergirem.
            const resumo = (ev.anos_vai_completar ?? 0) > 0
              ? `${ev.anos_vai_completar} ${sufixo}`
              : ap.semAnos;
            const ocupado = salvando === chaveDaEfemeride(ev);
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
                      <p className="text-xs text-muted-foreground">{resumo}</p>
                      {ev.telefone && (
                        <p className="text-xs text-muted-foreground mt-0.5">📞 {formatarTelefoneSemDDI(ev.telefone)}</p>
                      )}
                    </div>
                  </div>
                  {hasTel && (
                    <Button
                      type="button" size="sm" disabled={ocupado}
                      onClick={() => cumprimentar(ev, resumo, true)}
                      className="w-full gap-1.5 bg-success hover:bg-success text-white"
                    >
                      <MessageCircle className="w-4 h-4" /> Enviar mensagem
                    </Button>
                  )}
                  {/* Sem telefone o cartao ficava sem saida nenhuma: a
                      pessoa era cumprimentada no culto, no corredor, por
                      um filho — e o cartao continuava ali dizendo
                      "sem telefone cadastrado" ate o dia acabar. */}
                  {!hasTel && (
                    <Button
                      type="button" size="sm" variant="outline" disabled={ocupado}
                      onClick={() => cumprimentar(ev, resumo, false)}
                      className="w-full gap-1.5"
                    >
                      <Check className="w-4 h-4" /> Já cumprimentei
                    </Button>
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
          {/* O rótulo segue a distância real do que está na lista: dizer
              "próximas semanas" para uma lista que vai de 5 a 8 dias faz o
              leitor descartar como distante o que é desta semana e da que vem.
              O corte é 14 dias — daí em diante "semanas" passa a ser verdade. */}
          <p className="text-xs text-muted-foreground px-1 mb-1.5">
            {(adiante[adiante.length - 1]?.dias_ate_evento ?? 0) <= 14
              ? "Nos próximos dias"
              : "Nas próximas semanas"}
          </p>
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
