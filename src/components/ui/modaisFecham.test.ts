// Todo modal (Dialog, AlertDialog, Sheet) sai da tela no mesmo quadro do clique — sem esperar animação de saída (relato de 20/10/2026: "Imprimir extrato não fecha").
//
// O Radix só desmonta o modal que está fechando quando a animação de saída termina (`animationend`). Em aba em segundo plano, aparelho em economia de bateria ou página
// ocupada o evento atrasa (medido: 2.114 ms com a animação, 130–220 ms sem ela) e, até ele chegar, o <body> segue com `pointer-events: none` — Cancelar, X e a página parecem mortos.
// Este teste guarda a regra nos três primitivos: se alguém recolocar uma classe de saída (`data-[state=closed]:animate-out`, `fade-out`, `zoom-out`, `slide-out`, duração de saída),
// o modal volta a depender de um evento que pode demorar.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PRIMITIVOS = ["dialog", "alert-dialog", "sheet"] as const;
const ler = (nome: string) => readFileSync(`src/components/ui/${nome}.tsx`, "utf8");

describe("modais: sem animação de saída", () => {
  for (const nome of PRIMITIVOS) {
    it(`${nome}.tsx não tem nenhuma classe data-[state=closed]: (a saída é imediata)`, () => {
      const achadas = [...ler(nome).matchAll(/data-\[state=closed\]:[^\s"'`]+/g)].map(m => m[0]);
      expect(achadas).toEqual([]);
    });
    it(`${nome}.tsx mantém a animação de ENTRADA (o modal continua aparecendo suavemente)`, () => {
      expect(ler(nome)).toContain("data-[state=open]:animate-in");
    });
  }

  it("o X e o Cancelar dependem só de onOpenChange/onClick: nenhum primitivo trava o fechamento", () => {
    for (const nome of PRIMITIVOS) {
      const fonte = ler(nome);
      expect(fonte).not.toMatch(/onInteractOutside|onPointerDownOutside|onEscapeKeyDown|onOpenAutoFocus=\{\s*\(e\)\s*=>\s*e\.preventDefault/);
    }
  });
});
