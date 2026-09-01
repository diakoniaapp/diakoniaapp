// ─── Os painéis que ESTA pessoa abre ──────────────────────────────────────
//
// A barra lateral já esconde o que a pessoa não pode abrir. Este bloco existe
// por outro motivo: dizer, na primeira tela, o que ela pode FAZER aqui.
//
// A diferença importa para quem entra pouco. O menu responde a quem já sabe o
// que procura; um card com nome, uma linha de explicação e um destino responde
// a quem ainda não sabe que o lugar existe.
//
// ── QUANDO ESTE BLOCO NÃO APARECE ──────────────────────────────────────────
//
// Quando a pessoa não tem painel nenhum — que é o caso da maioria dos 297
// cadastrados no dia em que cada um tiver acesso. Ela avisa a seção pelo canal
// `useReportarVazio`, e a seção inteira se apaga. Um bloco intitulado "Meus
// painéis" com nada dentro seria pior que ausência: diria que ela perdeu algo.

import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ClipboardCheck, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { useReportarVazio } from "@/components/hoje/vazio";

interface PainelDisponivel {
  to: string;
  nome: string;
  /** O que a pessoa RESOLVE lá — não o que a tela mostra. */
  paraQue: string;
  icon: LucideIcon;
  permissoes: string[];
}

const PAINEIS: PainelDisponivel[] = [
  { to: "/painel-pastoral", nome: "Painel Pastoral",
    paraQue: "Quem chegou, quem sumiu e quem precisa de uma visita",
    icon: Sparkles, permissoes: ["ver_painel_pastoral"] },
  { to: "/painel-secretaria", nome: "Painel da Secretaria",
    paraQue: "Cadastros a corrigir, membresia e o que a igreja precisa registrar",
    icon: ClipboardCheck, permissoes: ["ver_painel_secretaria", "ver_painel_admin"] },
  { to: "/painel-estrategico", nome: "Crescimento",
    paraQue: "Como a igreja tem crescido, e por onde as pessoas entram",
    icon: TrendingUp, permissoes: ["ver_painel_admin", "ver_painel_pastoral"] },
  { to: "/financas", nome: "Finanças",
    paraQue: "Entradas, saídas e o que vence nos próximos dias",
    icon: Wallet, permissoes: ["ver_painel_tesouraria", "ver_financeiro"] },
];

export function MeusPaineis({ permissoes }: { permissoes: Set<string> }) {
  const meus = PAINEIS.filter(p => p.permissoes.some(c => permissoes.has(c)));
  useReportarVazio(meus.length === 0);
  if (meus.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {meus.map(p => {
        const Icon = p.icon;
        return (
          <Link key={p.to} to={p.to}>
            <Card className="h-full hover:border-gold/40 transition-colors">
              {/* `min-w-0` no filho de flex com texto truncável: o mesmo
                  transbordo já apareceu seis vezes neste repositório e tem
                  teste e2e só para ele. */}
              <CardContent className="p-3 flex items-start gap-2.5">
                <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{p.nome}</p>
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{p.paraQue}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
