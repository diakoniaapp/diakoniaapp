// ─── PullToRefresh — arrastar a tela para baixo atualiza o sistema ──────────────────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (16/10/2026): "em qualquer tela do sistema... arrastando a tela para baixo e a atualização chega".
//
// Por que não é o gesto nativo do navegador: o `body` tem `overscroll-behavior-y: none` (src/index.css, para a tela não "puxar" por engano) e quem rola é o `<main>` do AppLayout, não a
// página — então o Chrome nunca oferece o "puxar para atualizar" aqui. O gesto é próprio e só vale onde é seguro:
//   · só com o dedo (touch); mouse e teclado não passam por aqui;
//   · só quando o conteúdo sob o dedo — e cada rolagem que o contém — já está NO TOPO. Puxar uma lista que está no meio dela continua sendo rolar a lista;
//   · só se o gesto é mais vertical que horizontal (tabelas e carrosséis rolam de lado sem disparar nada);
//   · nunca com diálogo, folha, menu ou seletor aberto, nem começando em campo de texto, mapa ou em algo marcado com `data-sem-puxar`: recarregar ali perderia o que a pessoa digita;
//   · só passando do limite (70 px) a atualização acontece; soltar antes volta ao lugar, sem nada.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { atualizarSistema } from "@/lib/atualizarSistema";

const LIMIAR = 70;       // px puxados (já com a resistência) para valer
const MAXIMO = 110;      // até onde o círculo desce
const RESISTENCIA = 0.5; // o dedo anda o dobro do que o círculo desce: dá a sensação de "elástico"

/** O que, se estiver aberto, tira o gesto de cena: a página não é mais a "dona" do toque. */
const CAMADAS_ABERTAS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-scroll-locked]';
/** Onde o toque não pode virar "puxar": digitar, mexer no mapa, ou o que a tela marcar. */
const SEM_PUXAR = 'input, textarea, select, [contenteditable="true"], .leaflet-container, [data-sem-puxar]';

/** O toque começou num lugar que PODE puxar? (nada aberto por cima, nada rolado para baixo no caminho) */
export function podePuxarDe(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof Element)) return false;
  if (document.querySelector(CAMADAS_ABERTAS) || document.body.hasAttribute("data-scroll-locked")) return false;
  if (alvo.closest(SEM_PUXAR)) return false;
  for (let el: Element | null = alvo; el && el !== document.documentElement; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    const rola = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
    if (rola && el.scrollTop > 0) return false;   // essa rolagem ainda tem conteúdo acima: o gesto é dela
  }
  return true;
}

type Estado = "parado" | "puxando" | "pronto" | "atualizando";

export function PullToRefresh({ onRefresh = atualizarSistema }: { onRefresh?: () => Promise<void> | void }) {
  const [altura, setAltura] = useState(0);
  const [estado, setEstado] = useState<Estado>("parado");
  const atualizando = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    let y0 = 0, x0 = 0, ativo = false, decidido = false, dist = 0;

    const soltar = () => { ativo = false; decidido = false; dist = 0; setAltura(0); setEstado("parado"); };

    const aoTocar = (e: TouchEvent) => {
      if (atualizando.current || e.touches.length !== 1 || !podePuxarDe(e.target)) { ativo = false; return; }
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; ativo = true; decidido = false; dist = 0;
    };

    const aoMover = (e: TouchEvent) => {
      if (!ativo) return;
      if (e.touches.length !== 1) return soltar();
      const dy = e.touches[0].clientY - y0;
      const dx = e.touches[0].clientX - x0;
      if (!decidido) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;           // ainda é só um toque
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { ativo = false; return; }   // subindo ou de lado: é rolagem, não puxão
        decidido = true;
      }
      dist = Math.min(MAXIMO, Math.max(0, dy) * RESISTENCIA);
      if (e.cancelable) e.preventDefault();                          // sem isso o iOS "estica" a tela por baixo do círculo
      setAltura(dist);
      setEstado(dist >= LIMIAR ? "pronto" : "puxando");
    };

    const aoSoltar = async () => {
      if (!ativo) return;
      const valeu = decidido && dist >= LIMIAR;
      ativo = false; decidido = false;
      if (!valeu) return soltar();
      atualizando.current = true;
      setAltura(LIMIAR); setEstado("atualizando");
      try { await onRefreshRef.current(); }
      finally { atualizando.current = false; soltar(); }             // o padrão recarrega a página; só um teste (ou uma falha) chega aqui
    };

    document.addEventListener("touchstart", aoTocar, { passive: true });
    document.addEventListener("touchmove", aoMover, { passive: false });
    document.addEventListener("touchend", aoSoltar, { passive: true });
    document.addEventListener("touchcancel", soltar, { passive: true });
    return () => {
      document.removeEventListener("touchstart", aoTocar);
      document.removeEventListener("touchmove", aoMover);
      document.removeEventListener("touchend", aoSoltar);
      document.removeEventListener("touchcancel", soltar);
    };
  }, []);

  if (estado === "parado") return null;
  const pronto = estado === "pronto" || estado === "atualizando";
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="puxar-atualizar"
      className="pointer-events-none fixed left-1/2 top-14 md:top-3 z-[60] print:hidden"
      style={{ transform: `translate(-50%, ${altura - 44}px)`, opacity: Math.min(1, altura / 40), transition: estado === "puxando" || estado === "pronto" ? "none" : "transform 0.2s, opacity 0.2s" }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-gold shadow-md">
        {estado === "atualizando"
          ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          : <ArrowDown className="h-5 w-5 transition-transform" style={{ transform: pronto ? "rotate(180deg)" : "none" }} aria-hidden />}
      </div>
      <span className="sr-only">{estado === "atualizando" ? "Atualizando…" : pronto ? "Solte para atualizar" : "Puxe para atualizar"}</span>
    </div>
  );
}
