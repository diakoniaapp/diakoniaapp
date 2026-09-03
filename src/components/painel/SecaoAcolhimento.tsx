// ─── A porta da frente, dentro do painel de quem cuida dela ───────────────
//
// A quarta bancada. As três anteriores olham para dentro — quem está na
// classe, o que foi reservado, como vão os grupos. Esta olha para a soleira:
// quem chegou e ainda espera, e quem entrou e ainda não pertence a nada.
//
// ── A ORDEM DOS BLOCOS É A DA URGÊNCIA, E ELA NÃO É ÓBVIA ─────────────────
//
// As tarefas vencidas vêm primeiro não por serem mais importantes que a
// integração, mas porque têm prazo: um visitante procurado 32 dias depois
// já não é um visitante procurado. A integração de quem entrou há meses pode
// esperar mais uma semana; o recontato do domingo passado, não.

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { DoorOpen, AlarmClock, UserPlus, Link2Off, ArrowRight } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import type { BancadaAcolhimento } from "@/services/bancadaAcolhimentoService";

function emDias(n: number): string {
  if (n <= 0) return "no prazo";
  if (n === 1) return "1 dia de atraso";
  return `${n} dias de atraso`;
}

function desdeQuando(iso: string | null): string {
  if (!iso) return "sem data de entrada";
  const [a, m, d] = iso.split("-").map(Number);
  const dias = Math.round((Date.now() - new Date(a, m - 1, d).getTime()) / 86400000);
  if (dias < 31) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "há um mês" : `há ${meses} meses`;
}

export function SecaoAcolhimento({ ac }: { ac: BancadaAcolhimento }) {
  const vencidas = ac.tarefas.filter(t => t.atraso > 0);
  const noPrazo = ac.tarefas.filter(t => t.atraso <= 0);

  return (
    <section id="acolhimento" className="scroll-mt-[240px]">
      <TituloDaSecao icone={DoorOpen} tom="success" contagem={ac.visitantesAtivos}
        acao={
          <Link to="/membros" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Abrir as pessoas <ArrowRight className="w-3 h-3" />
          </Link>
        }>
        A porta da frente
      </TituloDaSecao>

      <p className="text-sm text-muted-foreground mb-2">
        {ac.visitantesAtivos === 0
          ? "Nenhum visitante em acompanhamento."
          : `${ac.visitantesAtivos} ${ac.visitantesAtivos === 1 ? "visitante" : "visitantes"} em acompanhamento`}
        {ac.ultimoAtoEm
          ? ` · último contato registrado ${desdeQuando(ac.ultimoAtoEm)}`
          : " · nenhum contato registrado ainda"}
      </p>

      {/* ── O que já passou do prazo ──────────────────────────────────── */}
      {vencidas.length > 0 && (
        <div className="rounded-md border border-destructive-line bg-destructive-soft px-3 py-2.5 mb-2">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive-text">
            <AlarmClock className="w-4 h-4 shrink-0" />
            {vencidas.length === 1
              ? "1 tarefa de acolhimento venceu"
              : `${vencidas.length} tarefas de acolhimento venceram`}
          </p>
          <ul className="mt-2 space-y-1">
            {vencidas.slice(0, 8).map(t => (
              <li key={t.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-destructive-text tabular-nums shrink-0 font-medium">
                  {emDias(t.atraso)}
                </span>
                <span className="text-foreground min-w-0">{t.titulo}</span>
              </li>
            ))}
          </ul>
          {vencidas.length > 8 && (
            <p className="text-xs text-destructive-text/80 mt-1.5">
              e mais {vencidas.length - 8}.
            </p>
          )}
        </div>
      )}

      {noPrazo.length > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {noPrazo.length === 1 ? "1 tarefa ainda no prazo" : `${noPrazo.length} tarefas ainda no prazo`}.
        </p>
      )}

      {ac.tarefasAbertas === 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          Nenhuma tarefa de acolhimento em aberto.
        </p>
      )}

      {/* ── Integração: quem entrou e ainda não pertence a nada ───────── */}
      <div className="rounded-md border bg-card px-3 py-2.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="w-4 h-4 shrink-0 text-muted-foreground" />
          Quem entrou nos últimos doze meses
        </p>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge variant="outline" className="text-xs font-normal">
            {ac.novos} {ac.novos === 1 ? "pessoa" : "pessoas"}
          </Badge>
          <Badge variant="outline" className="text-xs font-normal">Em classe de EBD · {ac.novosEmEbd}</Badge>
          <Badge variant="outline" className="text-xs font-normal">Em Pequeno Grupo · {ac.novosEmPgm}</Badge>
          <Badge variant="outline" className="text-xs font-normal">Servindo em área · {ac.novosServindo}</Badge>
        </div>

        {/* Congregado é quem frequenta sem ser membro. Zero deles servindo é
            o tipo de número que não aparece em lugar nenhum até alguém
            perguntar — e perguntar é o trabalho desta equipe. */}
        {ac.congregados > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Entre os {ac.congregados} congregados,{" "}
            {ac.congregadosServindo === 0
              ? <strong className="text-warning-text">nenhum serve em área nenhuma</strong>
              : <>{ac.congregadosServindo} servem em alguma área</>}.
          </p>
        )}
      </div>

      {/* ── A lista que vira convite ──────────────────────────────────── */}
      {ac.semLaco.length > 0 && (
        <div className="rounded-md border border-warning-line bg-warning-soft px-3 py-2.5 mt-2">
          <p className="flex items-center gap-2 text-sm font-medium text-warning-text">
            <Link2Off className="w-4 h-4 shrink-0" />
            {ac.semLaco.length === 1
              ? "1 pessoa sem classe, sem grupo e sem área"
              : `${ac.semLaco.length} pessoas sem classe, sem grupo e sem área`}
          </p>
          <p className="text-xs text-warning-text/90 mt-0.5">
            Estar em um dos três já conta. Estas não estão em nenhum — é onde um convite muda alguma coisa.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {ac.semLaco.slice(0, 12).map(p => (
              <span key={p.id}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-warning-line bg-background px-2.5 py-0.5 text-xs">
                <span className="font-medium">{p.nome}</span>
                <span className="text-muted-foreground">{desdeQuando(p.desde)}</span>
              </span>
            ))}
          </div>
          {ac.semLaco.length > 12 && (
            <p className="text-xs text-warning-text/80 mt-1.5">
              e mais {ac.semLaco.length - 12}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
