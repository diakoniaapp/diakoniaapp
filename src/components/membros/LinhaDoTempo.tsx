// ─── LinhaDoTempo.tsx ────────────────────────────────────────────────────────
// A história da pessoa, do mais recente para o mais antigo.
//
// Quem abre a ficha de alguém quase nunca quer conferir o CEP. Quer saber o
// que aconteceu com aquela pessoa: quando chegou, quando se tornou membro,
// onde serve, e há quanto tempo ninguém fala com ela.
//
// Por isso a ordem é do fim para o começo. "Última conversa há 3 dias" é a
// informação que muda o que se faz agora; "chegou em junho de 2024" é
// contexto, e contexto pode esperar o fim da lista.

import {
  DoorOpen, Sparkles, Crown, HandHeart, MessageCircle, type LucideIcon,
  FileText, NotebookPen,
} from "lucide-react";
import type { EventoDaHistoria, TipoEvento } from "@/services/historiaPessoa";

const APARENCIA: Record<TipoEvento, { Icone: LucideIcon; cor: string; ponto: string }> = {
  entrada:     { Icone: DoorOpen,      cor: "text-info-text",       ponto: "bg-info" },
  promocao:    { Icone: Sparkles,      cor: "text-success-text",    ponto: "bg-success" },
  consagracao: { Icone: Crown,         cor: "text-primary",         ponto: "bg-primary" },
  servico:     { Icone: HandHeart,     cor: "text-gold-text",       ponto: "bg-gold" },
  contato:     { Icone: MessageCircle, cor: "text-muted-foreground", ponto: "bg-muted-foreground/50" },
  // Ícone de arquivo, e não de conversa: ninguém falou com ninguém aqui — a
  // linha só entrou no sistema. Ver a nota em `TipoEvento`.
  cadastro:    { Icone: FileText,      cor: "text-muted-foreground", ponto: "bg-muted-foreground/30" },
  // A anotação pastoral tem bloco próprio na ficha e não entra aqui; a
  // entrada existe para o tipo ficar completo, não porque seja desenhada.
  anotacao:    { Icone: NotebookPen,   cor: "text-muted-foreground", ponto: "bg-muted-foreground/30" },
};

function quando(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00" : iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  // "há 3 dias" responde mais rápido que "19 ago 2026" para o que é recente;
  // para o que é antigo, a data é que situa. O corte em 60 dias é onde uma
  // coisa deixa de ser "outro dia" e vira "no ano passado".
  if (dias <= 0)  return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 60)  return `há ${dias} dias`;
  return data;
}

export function LinhaDoTempo({ eventos, limite = 8 }: { eventos: EventoDaHistoria[]; limite?: number }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground leading-relaxed">
        Ainda não há nada registrado sobre esta pessoa. Cada conversa, visita ou
        mensagem anotada aqui vira memória da igreja — e é o que permite saber,
        daqui a seis meses, quem anda sem contato.
      </p>
    );
  }

  const mostrados = eventos.slice(0, limite);
  const restantes = eventos.length - mostrados.length;

  return (
    <div className="relative">
      {/* O fio que liga os pontos. Ele para na altura do último ponto, e não
          no fim do bloco: linha sobrando embaixo parece lista cortada. */}
      <span
        aria-hidden="true"
        className="absolute left-[5px] top-2 bottom-4 w-px bg-border"
      />

      <ol className="space-y-3">
        {mostrados.map((e, i) => {
          const { Icone, cor, ponto } = APARENCIA[e.tipo];
          return (
            <li key={i} className="relative flex gap-3 pl-5">
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[7px] w-[11px] h-[11px] rounded-full ring-2 ring-card ${ponto}`}
              />
              <Icone className={`w-3.5 h-3.5 mt-[3px] shrink-0 ${cor}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{e.titulo}</span>
                  <span className="text-muted-foreground"> · {quando(e.data)}</span>
                </p>
                {e.detalhe && (
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{e.detalhe}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {restantes > 0 && (
        <p className="text-xs text-muted-foreground pl-5 pt-2.5">
          e mais {restantes} {restantes === 1 ? "registro" : "registros"} antes disso
        </p>
      )}
    </div>
  );
}
