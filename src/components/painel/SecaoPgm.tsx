// ─── Pequenos Grupos, dentro do painel do ministério que os cuida ─────────
//
// A terceira bancada, e a que faz uma pergunta que as outras duas não fazem.
//
// A Escola Bíblica olha para quem já está nela; o Bazar, para o que já foi
// reservado. Um ministério de Pequenos Grupos Multiplicadores existe para
// **multiplicar** — então a bancada dele tem de mostrar onde ainda não há
// grupo, e não só como vão os que existem.
//
// Por isso o bloco "onde ainda não há grupo" fica ao lado dos avisos, e não
// escondido no fim: para este ministério, um bairro com 40 membros e nenhum
// grupo não é um dado curioso, é a pauta da próxima reunião.

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Home as Casa, CalendarX, UserX, MapPin, ArrowRight } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import type { BancadaPgm, GrupoNaBancada } from "@/services/bancadaPgmService";

function haQuantoTempo(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((hoje.getTime() - alvo.getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "há um mês" : `há ${meses} meses`;
}

export function SecaoPgm({ pgm }: { pgm: BancadaPgm }) {
  const ativos = pgm.grupos.filter(g => g.ativo);

  return (
    <section id="pgm" className="scroll-mt-[240px]">
      <TituloDaSecao icone={Casa} tom="success" contagem={ativos.length}
        acao={<Link to="/pgm" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Abrir os grupos <ArrowRight className="w-3 h-3" />
        </Link>}>
        Pequenos Grupos
      </TituloDaSecao>

      <p className="text-sm text-muted-foreground mb-2">
        {pgm.participantes} {pgm.participantes === 1 ? "pessoa" : "pessoas"} em grupo
        {pgm.membrosDaIgreja > 0 && `, de ${pgm.membrosDaIgreja} na igreja`}
        {pgm.grupos.length > ativos.length &&
          ` · ${pgm.grupos.length - ativos.length} grupo${pgm.grupos.length - ativos.length === 1 ? "" : "s"} inativo${pgm.grupos.length - ativos.length === 1 ? "" : "s"}`}
      </p>

      <div className="grid gap-2 mb-3">
        {pgm.semReuniao.length > 0 && (
          <Aviso icone={CalendarX}
            titulo={pgm.semReuniao.length === 1
              ? "1 grupo sem nenhuma reunião registrada"
              : `${pgm.semReuniao.length} grupos sem nenhuma reunião registrada`}
            detalhe={pgm.semReuniao.map(g => g.nome).join(" · ")} />
        )}
        {pgm.semMembros.length > 0 && (
          <Aviso icone={UserX}
            titulo={pgm.semMembros.length === 1
              ? "1 grupo sem nenhum membro"
              : `${pgm.semMembros.length} grupos sem nenhum membro`}
            detalhe={pgm.semMembros.map(g => g.nome).join(" · ")} />
        )}
      </div>

      {/* ── Onde ainda não há grupo ──────────────────────────────────── */}
      {pgm.bairrosSemGrupo.length > 0 && (
        <div className="rounded-md border bg-card px-3 py-2.5 mb-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MapPin className="w-4 h-4 shrink-0 text-muted-foreground" />
            Onde a igreja tem gente e não tem grupo
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pgm.bairrosSemGrupo.map(b => (
              <Badge key={b.bairro} variant="outline" className="text-xs font-normal">
                {b.bairro} · {b.membros}
              </Badge>
            ))}
          </div>
          {/* Sem esta linha o bloco afirmaria mais do que sabe: quem não tem
              bairro na ficha não entra em conta nenhuma — nem na de quem tem
              grupo perto, nem na de quem não tem. */}
          {pgm.semBairroNaFicha > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {pgm.semBairroNaFicha} {pgm.semBairroNaFicha === 1 ? "ficha não tem" : "fichas não têm"} bairro
              preenchido e {pgm.semBairroNaFicha === 1 ? "ficou" : "ficaram"} fora desta conta.
            </p>
          )}
        </div>
      )}

      <ul className="divide-y rounded-md border bg-card">
        {pgm.grupos.map(g => <LinhaDoGrupo key={g.id} grupo={g} />)}
      </ul>
    </section>
  );
}

function Aviso({ icone: Icone, titulo, detalhe }: {
  icone: typeof CalendarX; titulo: string; detalhe: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 min-w-0">
      <Icone className="w-4 h-4 shrink-0 text-warning-text mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-warning-text">{titulo}</p>
        <p className="text-xs text-muted-foreground break-words">{detalhe}</p>
      </div>
    </div>
  );
}

function LinhaDoGrupo({ grupo: g }: { grupo: GrupoNaBancada }) {
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 min-w-0 ${g.ativo ? "" : "opacity-60"}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate min-w-0">{g.nome}</p>
        <p className="text-xs text-muted-foreground truncate">
          {g.lider ?? "sem líder"}
          {g.bairro ? ` · ${g.bairro}` : ""}
          {` · ${g.quando}`}
          {` · ${g.membros} ${g.membros === 1 ? "membro" : "membros"}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {!g.ativo ? (
          <Badge variant="outline" className="text-xs whitespace-nowrap">inativo</Badge>
        ) : g.ultimaReuniao ? (
          <>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {g.reunioes} {g.reunioes === 1 ? "reunião" : "reuniões"}
            </p>
            <p className="text-[11px] text-muted-foreground whitespace-nowrap">
              {haQuantoTempo(g.ultimaReuniao)}
            </p>
          </>
        ) : (
          <Badge variant="outline" className="text-xs text-warning-text border-warning-line whitespace-nowrap">
            sem reunião
          </Badge>
        )}
      </div>
    </li>
  );
}
