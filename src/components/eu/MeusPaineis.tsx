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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ClipboardCheck, Wallet, Boxes, type LucideIcon } from "lucide-react";
import { useReportarVazio } from "@/components/hoje/vazio";
import { meusMinisterios, type MinisterioQueLidero } from "@/services/painelMinisterioService";

interface PainelDisponivel {
  to: string;
  nome: string;
  /** O que a pessoa RESOLVE lá — não o que a tela mostra. */
  paraQue: string;
  icon: LucideIcon;
  permissoes: string[];
}

// Crescimento NÃO entra nesta lista, embora tenha rota própria
// (`/painel-estrategico`). Ele já é uma das abas do Painel Pastoral — o
// comentário no `App.tsx` registra que foi embutido lá justamente para não ter
// dois caminhos disputando o mesmo conteúdo. Um cartão aqui recriaria o
// segundo caminho que aquela decisão fechou.
const PAINEIS: PainelDisponivel[] = [
  { to: "/painel-pastoral", nome: "Painel Pastoral",
    paraQue: "Quem chegou, quem sumiu e quem precisa de uma visita",
    icon: Sparkles, permissoes: ["ver_painel_pastoral"] },
  { to: "/painel-secretaria", nome: "Painel da Secretaria",
    paraQue: "Cadastros a corrigir, membresia e o que a igreja precisa registrar",
    icon: ClipboardCheck, permissoes: ["ver_painel_secretaria", "ver_painel_admin"] },
  // "Tesouraria" e não "Finanças": é o nome do trabalho e de quem o faz na
  // igreja. "Finanças" nomeia o assunto; o cartão leva a uma bancada.
  { to: "/financas", nome: "Tesouraria",
    paraQue: "Entradas, saídas e o que vence nos próximos dias",
    icon: Wallet, permissoes: ["ver_painel_tesouraria", "ver_financeiro"] },
];

export function MeusPaineis({ permissoes, pessoaId }: {
  permissoes: Set<string>;
  /** Para descobrir os ministérios que esta pessoa lidera. */
  pessoaId?: string | null;
}) {
  const fixos = PAINEIS.filter(p => p.permissoes.some(c => permissoes.has(c)));

  // ── Os ministérios que a pessoa lidera ──────────────────────────────
  //
  // Não saem de uma lista escrita à mão como os quatro acima: dependem de
  // quem está olhando. São onze ministérios e vinte áreas, e a liderança de
  // cada um mora em `ministerios.lider_id` / `areas.lider_id`.
  //
  // Vai por permissão NENHUMA de propósito. Quem lidera uma área abre a
  // bancada dela por liderar, não por ter `ver_ministerios` — e é justamente
  // quem tem menos permissões que mais precisa de uma porta direta.
  const [meusMin, setMeusMin] = useState<MinisterioQueLidero[]>([]);
  useEffect(() => {
    if (!pessoaId) { setMeusMin([]); return; }
    meusMinisterios(pessoaId).then(setMeusMin).catch(() => setMeusMin([]));
  }, [pessoaId]);

  const total = fixos.length + meusMin.length;
  useReportarVazio(total === 0);
  if (total === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {fixos.map(p => (
        <CartaoDePainel key={p.to} to={p.to} nome={p.nome} paraQue={p.paraQue} icon={p.icon} />
      ))}
      {meusMin.map(m => (
        <CartaoDePainel
          key={m.id}
          to={`/ministerios/${m.id}/painel`}
          nome={m.nome}
          // O que a pessoa é ali, e não o que a tela mostra. "Líder de área ·
          // Bazar" diz por que este cartão apareceu para ela e não para o
          // vizinho — que é a pergunta que um cartão inesperado levanta.
          paraQue={[m.comoLidero, ...m.areasQueLidero].join(" · ")}
          icon={Boxes}
        />
      ))}
    </div>
  );
}

function CartaoDePainel({ to, nome, paraQue, icon: Icon }: {
  to: string; nome: string; paraQue: string; icon: LucideIcon;
}) {
  return (
    <Link to={to}>
      <Card className="h-full hover:border-gold/40 transition-colors">
        {/* `min-w-0` no filho de flex com texto truncável: o mesmo transbordo
            já apareceu sete vezes neste repositório e tem teste e2e só para
            ele. */}
        <CardContent className="p-3 flex items-start gap-2.5">
          <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{nome}</p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">{paraQue}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
