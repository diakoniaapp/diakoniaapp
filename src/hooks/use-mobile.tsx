import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * "Estou num celular?" JÁ NO PRIMEIRO RENDER (23/10/2026). `useIsMobile` começa `false` e só acerta depois do efeito — numa tela que escolhe a visão pela largura (a agenda da Tesouraria: semana no
 * celular, mês no computador) isso montaria a visão errada, carregaria os dados dela e trocaria em seguida. Aqui o valor inicial já vem de `matchMedia`; sem `matchMedia` (testes) vale "não".
 */
export function useNoCelular(): boolean {
  const consulta = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`) : null);
  const [celular, setCelular] = React.useState<boolean>(() => !!consulta()?.matches);
  React.useEffect(() => {
    const mql = consulta();
    if (!mql) return;
    const mudou = () => setCelular(mql.matches);
    mql.addEventListener("change", mudou);
    mudou();
    return () => mql.removeEventListener("change", mudou);
  }, []);
  return celular;
}
