// ─── useIrAoTopoDaLista — mudar de página começa no TOPO da lista nova ───────────────────────────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): "Próxima página" tem de mostrar na hora o topo da nova página. Quem rola nesta aplicação não é a janela (`window.scrollY` é sempre 0): é o `<main>`, um diálogo
// ou uma lista com rolagem própria (o Extrato). Rolar uma SENTINELA para a vista funciona sem que a tela saiba qual ancestral tem a barra — e rola todos eles de uma vez.
// Ponha `<div ref={topoRef} />` logo acima da lista (dentro do contêiner que rola, se houver um só dela) e chame `irAoTopo()` junto de `setPagina`.
import { useCallback, useRef } from "react";

export function useIrAoTopoDaLista<T extends HTMLElement = HTMLDivElement>() {
  const topoRef = useRef<T>(null);
  const irAoTopo = useCallback(() => { topoRef.current?.scrollIntoView({ block: "start", behavior: "auto" }); }, []);
  return { topoRef, irAoTopo };
}
