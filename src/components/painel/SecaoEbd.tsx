// ─── A Escola Bíblica, dentro do painel da Educação Cristã ────────────────
//
// A primeira seção do painel de um ministério que opera a EBD
// (`ministerios.modulo = 'ebd'`, migration 20260902100000). Vem ANTES de
// Áreas e Quem serve de propósito: o trabalho deste ministério é a Escola, e
// as três áreas dele são uma consequência disso, não o contrário.
//
// ── O QUE ELA MOSTRA, E POR QUE NESTA ORDEM ────────────────────────────────
//
// Primeiro o que está parado, depois o retrato. Medido em 02/09/2026: cinco
// das oito classes nunca tiveram chamada, o Berçário tem nove crianças e
// nenhum professor, e três alunos passaram da faixa da classe onde estão.
// Uma tabela bonita com esses números escondidos dentro dela seria um
// relatório; a bancada precisa dizer o que fazer hoje.

import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, AlertTriangle, UserX, CalendarX, ArrowRight } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import type { BancadaEbd, ClasseNaBancada } from "@/services/bancadaEbdService";

/** "há 10 dias" · "ontem" · "hoje" — a idade da última chamada. */
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

export function SecaoEbd({ ebd }: { ebd: BancadaEbd }) {
  return (
    <section id="ebd" className="scroll-mt-[240px]">
      <TituloDaSecao icone={GraduationCap} tom="violeta" contagem={ebd.classes.length}
        acao={<Link to="/ebd" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Abrir a Escola <ArrowRight className="w-3 h-3" />
        </Link>}>
        Escola Bíblica
      </TituloDaSecao>

      {/* ── A linha de contexto ──────────────────────────────────────── */}
      <p className="text-sm text-muted-foreground mb-2">
        {ebd.matriculados} {ebd.matriculados === 1 ? "matriculado" : "matriculados"}
        {" · "}
        {ebd.professores} {ebd.professores === 1 ? "professor" : "professores"}
        {ebd.ultimaChamada
          ? ` · última chamada ${haQuantoTempo(ebd.ultimaChamada)}`
          : " · nenhuma chamada registrada ainda"}
      </p>

      {/* ── O que está parado ────────────────────────────────────────── */}
      <div className="grid gap-2 mb-3">
        {ebd.semChamada.length > 0 && (
          <Aviso
            icone={CalendarX}
            titulo={`${ebd.semChamada.length} ${ebd.semChamada.length === 1 ? "classe sem chamada" : "classes sem chamada"}`}
            detalhe={ebd.semChamada.map(c => c.nome).join(" · ")}
          />
        )}
        {ebd.semProfessor.length > 0 && (
          <Aviso
            icone={UserX}
            titulo={`${ebd.semProfessor.length} ${ebd.semProfessor.length === 1 ? "classe com aluno e sem professor" : "classes com aluno e sem professor"}`}
            detalhe={ebd.semProfessor.map(c => `${c.nome} (${c.matriculados})`).join(" · ")}
          />
        )}
        {ebd.foraDaFaixa.length > 0 && (
          <Aviso
            icone={AlertTriangle}
            titulo={`${ebd.foraDaFaixa.length} ${ebd.foraDaFaixa.length === 1 ? "aluno passou da faixa da classe" : "alunos passaram da faixa da classe"}`}
            detalhe={ebd.foraDaFaixa
              .map(a => `${a.nome}, ${a.idade} anos${a.classeSugerida ? ` → ${a.classeSugerida}` : ""}`)
              .join(" · ")}
          />
        )}
      </div>

      {/* ── O retrato das classes ────────────────────────────────────── */}
      <ul className="divide-y rounded-md border bg-card">
        {ebd.classes.map(c => <LinhaDaClasse key={c.id} classe={c} />)}
      </ul>
    </section>
  );
}

function Aviso({ icone: Icone, titulo, detalhe }: {
  icone: typeof AlertTriangle; titulo: string; detalhe: string;
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

function LinhaDaClasse({ classe: c }: { classe: ClasseNaBancada }) {
  // A frequência só aparece quando existe chamada para dividir. Sem ela a
  // linha diz "sem chamada" — nunca "0%", que culparia o aluno pelo silêncio
  // da classe. É a mesma regra do cartão da Home.
  const temBase = c.aulasComChamada > 0;

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 min-w-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate min-w-0">{c.nome}</p>
        <p className="text-xs text-muted-foreground truncate">
          {c.publico ? `${c.publico}, ` : ""}{c.faixa}
          {" · "}
          {c.matriculados} {c.matriculados === 1 ? "aluno" : "alunos"}
          {" · "}
          {c.professores === 0
            ? "sem professor"
            : `${c.professores} ${c.professores === 1 ? "professor" : "professores"}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {temBase ? (
          <>
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {c.aulasComChamada} de {c.aulasLancadas} {c.aulasLancadas === 1 ? "aula" : "aulas"}
            </p>
            {c.ultimaChamada && (
              <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                {haQuantoTempo(c.ultimaChamada)}
              </p>
            )}
          </>
        ) : (
          <Badge variant="outline" className="text-xs text-warning-text border-warning-line whitespace-nowrap">
            {c.aulasLancadas === 0 ? "sem aula lançada" : "sem chamada"}
          </Badge>
        )}
      </div>
    </li>
  );
}
