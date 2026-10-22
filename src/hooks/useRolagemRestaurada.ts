// ─── useRolagemRestaurada — guarda a rolagem de um contêiner e a devolve quando a pessoa VOLTA para a tela ─────────────────────────────────────
//
// Uso: o `<main>` do AppLayout (nome "pagina", via <RestauraRolagemDaPagina />) e qualquer lista com rolagem interna (nome próprio). Só restaura quando a tela foi alcançada por
// "Voltar"/histórico (POP): ir a uma tela por link continua começando no topo. O tipo de chegada é o da PRIMEIRA renderização de quem chama o gancho — depois o espelho dos filtros na URL
// (`replace`) muda o tipo de navegação e não pode contar como "chegada".
// `pronto` diz que os dados já chegaram; a tentativa só roda UMA vez por montagem e espera a lista crescer o bastante (ver `podeRestaurar`). Se a pessoa mexer na rolagem antes,
// desistimos: nunca disputamos o controle com ela.
import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import {
  esquecerRolagemAPartir, gravarRolagem, podeRestaurar, posicaoNoHistorico, rolagemGuardada,
} from "@/lib/rolagemRestaurada";

export function useRolagemRestaurada(el: HTMLElement | null, nome: string, pronto = true) {
  const caminho = useLocation().pathname;
  const tipoDaChegada = useRef(useNavigationType()).current;
  const idxDaChegada = useRef(posicaoNoHistorico()).current;
  const jaRestaurou = useRef(false);

  // chegou por link/botão (push): o que havia guardado deste índice em diante é de outra história
  useEffect(() => {
    if (tipoDaChegada === "PUSH") esquecerRolagemAPartir(idxDaChegada);
  }, [tipoDaChegada, idxDaChegada]);

  // guarda a posição enquanto a pessoa rola (um quadro de animação por vez)
  useEffect(() => {
    if (!el) return;
    let quadro = 0;
    const guardar = () => {
      quadro = 0;
      gravarRolagem(posicaoNoHistorico(), nome, caminho, el.scrollTop);
    };
    const aoRolar = () => { if (!quadro) quadro = requestAnimationFrame(guardar); };
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => { el.removeEventListener("scroll", aoRolar); if (quadro) cancelAnimationFrame(quadro); };
  }, [el, nome, caminho]);

  // voltou (POP): devolve a posição assim que a lista tiver altura para isso
  useEffect(() => {
    if (!el || !pronto || jaRestaurou.current || tipoDaChegada !== "POP") return;
    const alvo = rolagemGuardada(idxDaChegada, nome, caminho);
    if (alvo <= 0) { jaRestaurou.current = true; return; }
    const inicio = performance.now();
    let quadro = 0;
    let desistiu = false;
    // só vira "já restaurou" quando terminou de verdade: o StrictMode (e uma mudança de `pronto`) desmonta e remonta o efeito no meio da espera
    const desistir = () => { desistiu = true; jaRestaurou.current = true; };
    const tentar = () => {
      if (desistiu) return;
      const rolavel = el.scrollHeight - el.clientHeight;
      if (podeRestaurar(alvo, rolavel, performance.now() - inicio)) { el.scrollTop = alvo; jaRestaurou.current = true; return; }
      quadro = requestAnimationFrame(tentar);
    };
    const eventos = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    eventos.forEach(e => el.addEventListener(e, desistir, { passive: true, once: true }));
    tentar();
    return () => { desistiu = true; if (quadro) cancelAnimationFrame(quadro); eventos.forEach(e => el.removeEventListener(e, desistir)); };
  }, [el, nome, caminho, pronto, tipoDaChegada, idxDaChegada]);
}
