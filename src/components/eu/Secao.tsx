// ─── Secao — o título que some junto com o bloco ──────────────────────────
//
// Mesma mecânica que o `BlocoSecao` do painel antigo, extraída para poder ser
// usada fora dele. O bloco de dentro avisa pelo `VazioCtx` que não tem o que
// mostrar, e a seção inteira — título, subtítulo e conteúdo — se apaga.
//
// `hidden` em vez de devolver `null`: com `null` o filho desmonta, o aviso se
// perde, a seção reaparece e o ciclo recomeça. Escondido, o filho segue
// montado e segue reportando. O defeito é antigo e está documentado no painel.

import { useCallback, useState } from "react";
import { VazioCtx, type ReportarVazio } from "@/components/hoje/vazio";

export function Secao({ titulo, subtitulo, children }: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  const [vazio, setVazio] = useState(false);
  const reportar = useCallback<ReportarVazio>(v => setVazio(v), []);

  return (
    <VazioCtx.Provider value={reportar}>
      <section className="space-y-2" hidden={vazio} aria-hidden={vazio || undefined}>
        <div className="px-1">
          <h2 className="font-serif text-lg">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        <div>{children}</div>
      </section>
    </VazioCtx.Provider>
  );
}
