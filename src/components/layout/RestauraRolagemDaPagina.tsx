import { useState } from "react";
import { useRolagemRestaurada } from "@/hooks/useRolagemRestaurada";

/**
 * Vive DENTRO do `<main>` do AppLayout (que é remontado a cada mudança de caminho): guarda a rolagem da página e a devolve quando a pessoa chega por "Voltar" (22/10/2026).
 * Ficar dentro dele é o que faz o tipo de chegada (voltar × link novo) ser o da navegação que montou a tela — ver `useRolagemRestaurada`.
 */
export function RestauraRolagemDaPagina() {
  const [main, setMain] = useState<HTMLElement | null>(null);
  useRolagemRestaurada(main, "pagina");
  return <span hidden ref={n => setMain(n?.closest("main") ?? null)} />;
}
