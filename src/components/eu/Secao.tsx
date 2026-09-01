// ─── Secao — o título que some junto com o bloco ──────────────────────────
//
// Mesma mecânica que o `BlocoSecao` do painel antigo, extraída para poder ser
// usada fora dele. O bloco de dentro avisa pelo `VazioCtx` que não tem o que
// mostrar, e a seção inteira — título, subtítulo e conteúdo — se apaga.
//
// `hidden` em vez de devolver `null`: com `null` o filho desmonta, o aviso se
// perde, a seção reaparece e o ciclo recomeça. Escondido, o filho segue
// montado e segue reportando. O defeito é antigo e está documentado no painel.
//
// ── POR QUE ELA AVISA PARA CIMA TAMBÉM ─────────────────────────────────────
//
// A Home ganhou uma tira de atalhos no cabeçalho, no mesmo formato do Painel
// Pastoral. Um atalho para uma seção escondida rolaria a tela até nada — e
// pior, prometeria conteúdo que aquela pessoa não tem. Então a seção reporta
// o próprio estado a quem a montou, e a tira só oferece o que existe.

import { useCallback, useEffect, useState } from "react";
import { VazioCtx, type ReportarVazio } from "@/components/hoje/vazio";

export function Secao({ id, titulo, subtitulo, onVazio, children }: {
  /** Âncora do atalho. Vira o `id` do `<section>`, lido por `irParaSecao`. */
  id?: string;
  titulo: string;
  subtitulo?: string;
  /** Avisa quem montou a seção se ela tem ou não o que mostrar. */
  onVazio?: (id: string, vazio: boolean) => void;
  children: React.ReactNode;
}) {
  const [vazio, setVazio] = useState(false);
  const reportar = useCallback<ReportarVazio>(v => setVazio(v), []);

  useEffect(() => {
    if (id && onVazio) onVazio(id, vazio);
  }, [id, vazio, onVazio]);

  return (
    <VazioCtx.Provider value={reportar}>
      <section
        id={id}
        // `scroll-mt` para a navegação por âncora do navegador, que não passa
        // por `irParaSecao` e não mede o cabeçalho. O atalho da tira mede.
        className="space-y-2 scroll-mt-24"
        hidden={vazio}
        aria-hidden={vazio || undefined}
      >
        <div className="px-1">
          <h2 className="font-serif text-lg">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        <div>{children}</div>
      </section>
    </VazioCtx.Provider>
  );
}
