import { createContext, useContext, useEffect } from "react";

/**
 * Canal pelo qual um widget avisa a faixa do HOJE que não tem o que mostrar.
 *
 * Mora fora de BlocoHoje.tsx de propósito: exportar hook e componente do
 * mesmo arquivo quebra o Fast Refresh do Vite.
 */
export type ReportarVazio = (vazio: boolean) => void;

export const VazioCtx = createContext<ReportarVazio | null>(null);

/**
 * Chamado pelo widget. Passe `true` enquanto carrega também: assim a faixa
 * nasce escondida e aparece já com conteúdo, sem piscar vazia.
 *
 * Fora do HOJE — no painel antigo, por exemplo — não há provider e o hook
 * é inerte. É o que permite converter os widgets um a um.
 */
export function useReportarVazio(vazio: boolean) {
  const reportar = useContext(VazioCtx);
  useEffect(() => {
    reportar?.(vazio);
  }, [vazio, reportar]);
}
