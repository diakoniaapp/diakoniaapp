// ─── Bazar e Cantina, dentro do painel da Administração ───────────────────
//
// A primeira seção do painel de um ministério que opera o módulo de
// arrecadação (`ministerios.modulo = 'arrecadacao'`).
//
// ── A ORDEM É A DA GRAVIDADE, E ELA TEM UM VENCEDOR CLARO ──────────────────
//
// Caixa aberto vem primeiro, sempre. Um caixa que não fecha é dinheiro sem
// dono e conciliação que não acontece; uma reserva vencida é papelada. Medido
// em 02/09/2026, os quatro caixas em aberto estavam assim há 67 a 79 dias.
//
// ── E O QUE ELA SE RECUSA A DIZER ──────────────────────────────────────────
//
// Nada sobre estoque enquanto `estoque_atual` for nulo nos dois produtos.
// "2 produtos abaixo do mínimo" seria verdade aritmética e mentira de fato —
// não há estoque baixo, há estoque não lançado.

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Wallet, CalendarClock, Wrench, ArrowRight } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import type { BancadaArrecadacao, ReservaEmAberto } from "@/services/bancadaArrecadacaoService";

const ROTULO_STATUS: Record<string, string> = {
  solicitada: "aguardando aprovação",
  aprovada: "aprovada",
  em_uso: "em uso",
};

function dataCurta(iso: string | null): string {
  if (!iso) return "sem data";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function SecaoArrecadacao({ arr }: { arr: BancadaArrecadacao }) {
  const nada =
    arr.caixasAbertos.length === 0 &&
    arr.reservasEmAberto.length === 0 &&
    arr.manutencao.length === 0;

  return (
    <section id="arrecadacao" className="scroll-mt-[240px]">
      <TituloDaSecao icone={ShoppingBag} tom="gold"
        acao={<Link to="/arrecadacao" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Abrir o Bazar <ArrowRight className="w-3 h-3" />
        </Link>}>
        Bazar e Cantina
      </TituloDaSecao>

      <p className="text-sm text-muted-foreground mb-2">
        {arr.espacos.map(e => e.nome).join(" e ")}
        {" · "}
        {arr.produtos} {arr.produtos === 1 ? "produto" : "produtos"}
        {/* O silêncio sobre estoque é dito em voz alta, uma vez, para que a
            ausência do alerta não se leia como "está tudo certo". */}
        {!arr.estoqueControlado && " · estoque ainda não lançado"}
      </p>

      {nada && (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Nenhum caixa aberto, nenhuma reserva pendente e nenhuma manutenção em aberto.
        </p>
      )}

      {/* ── Caixa aberto: o mais grave ─────────────────────────────────── */}
      {arr.caixasAbertos.length > 0 && (
        <div className="rounded-md border border-warning-line bg-warning-soft/40 mb-2">
          <p className="flex items-center gap-2 px-3 pt-2 text-sm font-medium text-warning-text">
            <Wallet className="w-4 h-4 shrink-0" />
            {arr.caixasAbertos.length === 1
              ? "1 caixa sem fechamento"
              : `${arr.caixasAbertos.length} caixas sem fechamento`}
          </p>
          <ul className="divide-y divide-warning-line/40 mt-1">
            {arr.caixasAbertos.map(c => (
              <li key={c.id} className="flex items-center gap-3 px-3 py-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{c.espaco ?? "Sem espaço vinculado"}</p>
                  <p className="text-xs text-muted-foreground">
                    aberto em {dataCurta(c.abertoEm)}
                    {c.estado !== "aberto" && ` · ${c.estado}`}
                  </p>
                </div>
                <Badge variant="outline"
                  className="shrink-0 text-xs text-warning-text border-warning-line whitespace-nowrap">
                  há {c.diasAberto} dias
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Reservas em aberto ─────────────────────────────────────────── */}
      {arr.reservasEmAberto.length > 0 && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium mb-1.5 mt-3">
            <CalendarClock className="w-4 h-4 shrink-0 text-muted-foreground" />
            {arr.reservasEmAberto.length === 1 ? "1 reserva em aberto" : `${arr.reservasEmAberto.length} reservas em aberto`}
            {arr.vencidas > 0 && (
              <span className="text-xs font-normal text-warning-text">
                — {arr.vencidas === arr.reservasEmAberto.length
                  ? "todas com o período já vencido"
                  : `${arr.vencidas} com o período já vencido`}
              </span>
            )}
          </p>
          <ul className="divide-y rounded-md border bg-card">
            {arr.reservasEmAberto.map(r => <LinhaDaReserva key={r.id} reserva={r} />)}
          </ul>
        </>
      )}

      {/* ── Manutenção ─────────────────────────────────────────────────── */}
      {arr.manutencao.length > 0 && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium mb-1.5 mt-3">
            <Wrench className="w-4 h-4 shrink-0 text-muted-foreground" />
            {arr.manutencao.length === 1
              ? "1 pendência de manutenção"
              : `${arr.manutencao.length} pendências de manutenção`}
          </p>
          <ul className="divide-y rounded-md border bg-card">
            {arr.manutencao.map(p => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.espaco ?? "sem espaço"}
                    {p.prioridade ? ` · prioridade ${p.prioridade}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs whitespace-nowrap">
                  {p.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function LinhaDaReserva({ reserva: r }: { reserva: ReservaEmAberto }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{r.finalidade || "Sem finalidade descrita"}</p>
        <p className="text-xs text-muted-foreground truncate">
          {r.espaco ?? "sem espaço"} · {dataCurta(r.inicio)} · {ROTULO_STATUS[r.status] ?? r.status}
        </p>
      </div>
      {r.vencida && (
        <Badge variant="outline"
          className="shrink-0 text-xs text-warning-text border-warning-line whitespace-nowrap">
          por encerrar
        </Badge>
      )}
    </li>
  );
}
