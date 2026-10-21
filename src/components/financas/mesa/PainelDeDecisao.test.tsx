// As peças do painel: cabeçalho do movimento, caixa de resposta e a lista de ações (a principal destacada, a tecla à direita).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AcaoDoPainel, CabecalhoDoPainel, CaixaDeResposta, ListaDeAcoes } from "./PainelDeDecisao";

let raiz: Root | null = null; let pai: HTMLDivElement | null = null;
afterEach(() => { act(() => { raiz?.unmount(); }); pai?.remove(); raiz = null; pai = null; });
function montar(el: JSX.Element) { pai = document.createElement("div"); document.body.appendChild(pai); raiz = createRoot(pai); act(() => { raiz!.render(el); }); }

describe("PainelDeDecisao", () => {
  it("o cabeçalho mostra o texto do banco e, abaixo, dia · conta · sentido · valor", () => {
    montar(<CabecalhoDoPainel linha={{ tx: { fitid: "a", tipo: "saida", data: "2026-10-05", valor: 278.22, memo: "PAGTO ELETRON COBRANCA VERISURE" } }} contaNome="Bradesco" />);
    expect(pai!.textContent).toContain("PAGTO ELETRON COBRANCA VERISURE");
    expect(pai!.textContent).toMatch(/05\/10 · Bradesco · saída · − R\$\s*278,22/);
  });

  it("a caixa de resposta tem título, achado e o porquê; a lista de ações mostra a tecla à direita e dispara o clique", () => {
    const onClick = vi.fn();
    montar(
      <div>
        <CaixaDeResposta tom="h0" titulo="⚠ Este movimento já parece estar registrado" porque="o banco numerou de outro jeito">Verisure · R$ 278,22</CaixaDeResposta>
        <ListaDeAcoes>
          <AcaoDoPainel variante="principal" atalho="Enter" onClick={onClick}>Vincular ao lançamento existente</AcaoDoPainel>
          <AcaoDoPainel variante="fixa" atalho="/">Buscar e associar</AcaoDoPainel>
          <AcaoDoPainel dica="pede o motivo" disabled>Não é este movimento</AcaoDoPainel>
        </ListaDeAcoes>
      </div>,
    );
    expect(pai!.textContent).toContain("já parece estar registrado");
    expect(pai!.textContent).toContain("o banco numerou de outro jeito");
    const botoes = [...pai!.querySelectorAll("button")] as HTMLButtonElement[];
    expect(botoes.map(b => b.textContent)).toEqual(["Vincular ao lançamento existenteEnter", "Buscar e associar/", "Não é este movimentopede o motivo"]);
    expect(botoes[2].disabled).toBe(true);
    act(() => { botoes[0].click(); });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
