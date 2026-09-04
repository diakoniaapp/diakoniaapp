// ─── A porta de entrada, dentro do painel da Diaconia ─────────────────────
//
// Uma linha por área — cestas básicas, e o que vier depois (culto de rua,
// jantar) quando a igreja criar as áreas. Cada linha leva à chamada de hoje
// e à lista de quem é atendido ali.

import { Link } from "react-router-dom";
import { HeartHandshake, ChevronRight } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import type { BancadaDiaconia } from "@/services/diaconiaService";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SecaoDiaconia({ dc, ministerioId }: { dc: BancadaDiaconia; ministerioId: string }) {
  return (
    <section id="diaconia" className="scroll-mt-[240px]">
      <TituloDaSecao icone={HeartHandshake} tom="success" contagem={dc.totalPessoas}>
        Quem é assistido
      </TituloDaSecao>

      <p className="text-sm text-muted-foreground mb-2">
        {dc.totalPessoas === 0
          ? "Ninguém cadastrado ainda."
          : `${dc.totalPessoas} ${dc.totalPessoas === 1 ? "pessoa assistida" : "pessoas assistidas"}`}
        {dc.atendimentosMes > 0 && ` · ${dc.atendimentosMes} ${dc.atendimentosMes === 1 ? "confirmação" : "confirmações"} este mês`}
      </p>

      {dc.areas.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          Este ministério ainda não tem área cadastrada.
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {dc.areas.map(a => (
            <li key={a.area_id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate min-w-0">{a.area_nome}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {a.pessoas} {a.pessoas === 1 ? "pessoa" : "pessoas"}
                </p>
              </div>
              <Link to={`/ministerios/${ministerioId}/diaconia/${a.area_id}/pessoas`}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                Pessoas <ChevronRight className="w-3 h-3" />
              </Link>
              <Link to={`/ministerios/${ministerioId}/diaconia/${a.area_id}/chamada?data=${hojeISO()}`}
                className="shrink-0 text-xs text-gold-text hover:underline inline-flex items-center gap-0.5">
                Chamada de hoje <ChevronRight className="w-3 h-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
