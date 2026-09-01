// ─── A minha vida na igreja ───────────────────────────────────────────────
//
// Três cartões pequenos que respondem "e eu?" nos três lugares onde o sistema
// só sabia responder pelo lado de quem organiza: a escala se vê pelo evento, a
// EBD pela classe, o Pequeno Grupo pelo grupo.
//
// ── A REGRA QUE ATRAVESSA OS TRÊS ──────────────────────────────────────────
//
// Nenhum deles mostra número sem mostrar a base. É o defeito que este projeto
// já cometeu várias vezes — a tela afirmando como fato o que era artefato do
// dado ausente. Aqui ele apareceria assim: a EBD tem 14 aulas lançadas e só 3
// com chamada registrada; dividir presenças por 14 daria 21% para quem nunca
// faltou, e a culpa é da chamada que não foi feita.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Home as Casa, CalendarClock, MessageCircle, Loader2 } from "lucide-react";
import {
  minhaEbd, meuPgm, minhaSemana, nomeDoDia,
  type MinhaEbd, type MeuPgm, type CompromissoMeu,
} from "@/services/meuEspacoService";
import { useReportarVazio } from "@/components/hoje/vazio";

// ─── A minha semana ───────────────────────────────────────────────────────

export function MinhaSemana({ pessoaId }: { pessoaId: string }) {
  const [itens, setItens] = useState<CompromissoMeu[] | null>(null);
  useEffect(() => { minhaSemana(pessoaId).then(setItens); }, [pessoaId]);

  // `true` também enquanto carrega: a seção nasce escondida e aparece já com
  // conteúdo, em vez de piscar vazia — está escrito no canal `vazio.ts`.
  useReportarVazio(!itens || itens.length === 0);
  if (!itens || itens.length === 0) return null;

  return (
    <div className="grid gap-2">
      {itens.map((c, i) => (
        <Card key={i}>
          <CardContent className="p-3 flex items-center gap-3">
            <CalendarClock className="w-4 h-4 shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{c.titulo}</p>
              <p className="text-xs text-muted-foreground truncate">
                {quando(c.data, c.hora)}
                {c.detalhe ? ` · ${c.detalhe}` : ""}
                {c.para ? ` · ${c.para}` : ""}
              </p>
            </div>
            {/* Escala ainda sem resposta é a única que pede algo de quem lê.
                As confirmadas ficam sem selo: um selo em tudo não destaca nada. */}
            {c.status === "convidado" && (
              <Badge variant="outline" className="text-xs shrink-0">confirmar</Badge>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** "hoje, 19:30" · "amanhã" · "domingo, 09:00" · "12/09, 19:30". */
function quando(iso: string, hora: string | null): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  const dia =
    dias === 0 ? "hoje"
    : dias === 1 ? "amanhã"
    : dias < 7 ? alvo.toLocaleDateString("pt-BR", { weekday: "long" })
    : `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  return hora ? `${dia}, ${hora}` : dia;
}

// ─── A minha classe da EBD ────────────────────────────────────────────────

export function MinhaEbdCard({ pessoaId }: { pessoaId: string }) {
  const [dados, setDados] = useState<MinhaEbd | null | undefined>(undefined);
  useEffect(() => { minhaEbd(pessoaId).then(setDados); }, [pessoaId]);

  useReportarVazio(dados === undefined || dados === null);
  if (!dados) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 shrink-0 text-muted-foreground" />
              <p className="font-medium truncate">{dados.classe}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dados.souProfessor
                ? `Você ensina nesta classe${dados.tipoProfessor ? ` — professor ${dados.tipoProfessor}` : ""}`
                : "Sua classe na Escola Bíblica Dominical"}
            </p>
          </div>
          <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs">
            <Link to={`/ebd/${dados.classeId}`}>Abrir</Link>
          </Button>
        </div>

        <Frequencia dados={dados} />
      </CardContent>
    </Card>
  );
}

/**
 * A frequência — e a base dela.
 *
 * Três estados, e nenhum deles é "0%":
 *
 *   sem chamada nenhuma   diz que ninguém foi chamado ainda. O silêncio é da
 *                         classe, não do aluno.
 *   com chamada           mostra a fração sobre as aulas CHAMADAS, dizendo
 *                         quantas foram.
 *   professor             não mostra frequência: quem dá a aula não é chamado
 *                         nela.
 */
function Frequencia({ dados }: { dados: MinhaEbd }) {
  if (dados.souProfessor) return null;

  if (dados.aulasComChamada === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {dados.aulasLancadas > 0
          ? `Ainda não há chamada registrada nesta classe — ${dados.aulasLancadas} ${dados.aulasLancadas === 1 ? "aula lançada" : "aulas lançadas"}, nenhuma com presença lançada.`
          : "Ainda não há aulas lançadas nesta classe."}
      </p>
    );
  }

  const pct = Math.round((dados.presencas / dados.aulasComChamada) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">
          <strong>{dados.presencas}</strong> de {dados.aulasComChamada}{" "}
          {dados.aulasComChamada === 1 ? "chamada" : "chamadas"}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-gold" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {/* A diferença entre aulas lançadas e aulas chamadas é informação para o
          aluno: explica por que a conta é sobre um número menor. */}
      {dados.aulasLancadas > dados.aulasComChamada && (
        <p className="text-xs text-muted-foreground">
          A classe tem {dados.aulasLancadas} aulas lançadas; {dados.aulasComChamada}{" "}
          {dados.aulasComChamada === 1 ? "teve" : "tiveram"} chamada.
        </p>
      )}
    </div>
  );
}

// ─── O meu Pequeno Grupo ──────────────────────────────────────────────────

export function MeuPgmCard({ pessoaId, bairro }: { pessoaId: string; bairro?: string | null }) {
  const [dados, setDados] = useState<MeuPgm | null>(null);
  useEffect(() => { meuPgm(pessoaId, bairro).then(setDados); }, [pessoaId, bairro]);

  const vazio = !dados || (!dados.meu && dados.sugestoes.length === 0);
  useReportarVazio(vazio);
  if (!dados) {
    return (
      <Card><CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> …
      </CardContent></Card>
    );
  }
  if (vazio) return null;

  if (dados.meu) {
    const g = dados.meu;
    return (
      <Card>
        <CardContent className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Casa className="w-4 h-4 shrink-0 text-muted-foreground" />
              <p className="font-medium truncate">{g.nome}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[nomeDoDia(g.dia_semana), g.horario ? `às ${String(g.horario).slice(0, 5)}` : null, g.bairro]
                .filter(Boolean).join(" · ") || "Seu Pequeno Grupo"}
            </p>
          </div>
          {g.whatsapp_link && (
            <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
              <a href={g.whatsapp_link} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-3.5 h-3.5" /> Grupo
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Quem não participa de nenhum. O convite vem com o grupo do bairro na
  // frente — proximidade é o que decide se alguém vai numa quinta à noite.
  const primeiro = dados.sugestoes[0];
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Casa className="w-4 h-4 shrink-0 text-muted-foreground" />
          <p className="font-medium">Você ainda não está num Pequeno Grupo</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {dados.sugestaoPorBairro
            ? `Há um grupo que se reúne no seu bairro: ${primeiro.nome}.`
            : `O mais perto que temos cadastrado é ${primeiro.nome}${primeiro.bairro ? `, em ${primeiro.bairro}` : ""}.`}
          {" "}
          {[nomeDoDia(primeiro.dia_semana),
            primeiro.horario ? `às ${String(primeiro.horario).slice(0, 5)}` : null]
            .filter(Boolean).join(", ")}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/pgm">Ver os Pequenos Grupos</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
