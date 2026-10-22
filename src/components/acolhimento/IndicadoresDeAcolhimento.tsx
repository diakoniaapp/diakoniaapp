// ─── IndicadoresDeAcolhimento — os cinco números que respondem "o que pede a minha atenção agora?" ─────────────────────────────────────────────────────────────────────────────────────────────────
// Cada cartão é também um FILTRO da lista abaixo (aria-pressed): tocar em "Não voltaram" mostra só quem não voltou. Cor + número + frase — nunca só a cor. Sem número a cor some (cartão neutro): o que está
// em dia não disputa a atenção com o que não está.
import { CalendarPlus, HeartHandshake, PhoneCall, Repeat2, UserX } from "lucide-react";
import type { ComponentType } from "react";
import type { FiltroDaCentral, Indicadores } from "@/lib/centralDeAcolhimento";

type Tom = "critico" | "aviso" | "sucesso" | "info" | "neutro";
const CLASSE: Record<Tom, string> = {
  critico: "border-destructive-line bg-destructive-soft text-destructive-text",
  aviso: "border-warning-line bg-warning-soft text-warning-text",
  sucesso: "border-success-line bg-success-soft text-success-text",
  info: "border-info-line bg-info-soft text-info-text",
  neutro: "border-border bg-card text-muted-foreground",
};

interface Cartao { filtro: FiltroDaCentral; rotulo: string; n: number; dica: string; tom: Tom; icone: ComponentType<{ className?: string }> }

export function cartoesDosIndicadores(ind: Indicadores): Cartao[] {
  return [
    { filtro: "hoje", rotulo: "Contatar hoje", n: ind.contatarHoje, tom: ind.contatarHoje > 0 ? "aviso" : "neutro", icone: PhoneCall,
      dica: ind.contatarHoje === 0 ? "ninguém esperando" : ind.maisEsquecidoHaDias ? `o mais esquecido: ${ind.maisEsquecidoHaDias} ${ind.maisEsquecidoHaDias === 1 ? "dia" : "dias"}` : "veja quem" },
    { filtro: "cuidado", rotulo: "Precisam de cuidado", n: ind.cuidado, tom: ind.cuidado > 0 ? "critico" : "neutro", icone: HeartHandshake,
      dica: ind.cuidado === 0 ? "ninguém em alerta" : ind.pedidos > 0 ? `${ind.pedidos} ${ind.pedidos === 1 ? "pediu" : "pediram"} oração ou contato` : "prioridade alta" },
    { filtro: "nao_voltou", rotulo: "Não voltaram", n: ind.naoVoltaram, tom: ind.naoVoltaram > 0 ? "critico" : "neutro", icone: UserX, dica: "uma visita e mais de 15 dias" },
    { filtro: "retornaram", rotulo: "Retornaram", n: ind.retornaram, tom: ind.retornaram > 0 ? "sucesso" : "neutro", icone: Repeat2, dica: "duas visitas ou mais" },
    { filtro: "todos", rotulo: "Novos na semana", n: ind.novosNaSemana, tom: ind.novosNaSemana > 0 ? "info" : "neutro", icone: CalendarPlus, dica: `${ind.total} no total` },
  ];
}

export function IndicadoresDeAcolhimento({ ind, filtro, onFiltro }: { ind: Indicadores; filtro: FiltroDaCentral; onFiltro: (f: FiltroDaCentral) => void }) {
  return (
    <section aria-label="Indicadores do acolhimento" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-indicadores>
      {cartoesDosIndicadores(ind).map((c, i) => {
        const Icone = c.icone;
        const ativo = filtro === c.filtro && c.filtro !== "todos";
        return (
          <button key={c.filtro + c.rotulo} type="button" onClick={() => onFiltro(c.filtro)} aria-pressed={ativo} data-indicador={c.filtro} data-tom={c.tom}
            className={`min-w-0 rounded-lg border p-3 text-left ${i === 4 ? "col-span-2 sm:col-span-1" : ""} transition-shadow hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${CLASSE[c.tom]} ${ativo ? "ring-2 ring-primary" : ""}`}>
            <span className="flex items-center gap-1.5 text-xs font-semibold"><Icone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.rotulo}</span></span>
            <span className="mt-1 block text-3xl font-bold leading-none tabular-nums" data-numero>{c.n}</span>
            <span className="mt-1 block truncate text-[11px] opacity-90">{c.dica}</span>
          </button>
        );
      })}
    </section>
  );
}

/** A frase de uma linha que responde sozinha "o que eu faço agora?" — o resumo dos cartões em português. */
export function fraseDoDia(ind: Indicadores): { texto: string; tom: "critico" | "aviso" | "ok" } {
  const partes: string[] = [];
  if (ind.contatarHoje > 0) partes.push(`${ind.contatarHoje} ${ind.contatarHoje === 1 ? "pessoa para contatar" : "pessoas para contatar"}`);
  if (ind.cuidado > 0) partes.push(`${ind.cuidado} ${ind.cuidado === 1 ? "precisa" : "precisam"} de cuidado`);
  if (ind.naoVoltaram > 0) partes.push(`${ind.naoVoltaram} ${ind.naoVoltaram === 1 ? "não voltou" : "não voltaram"}`);
  if (partes.length === 0) return { texto: ind.total === 0 ? "Nenhum visitante no acolhimento ainda. Quem chegar pelo QR aparece aqui." : "Tudo em dia: ninguém precisa ser procurado hoje.", tom: "ok" };
  const [primeira, ...resto] = partes;
  return { texto: `Hoje: ${[primeira, ...resto].join(" · ")}.`, tom: ind.cuidado > 0 || ind.naoVoltaram > 0 ? "critico" : "aviso" };
}
