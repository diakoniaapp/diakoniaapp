// O cartão da Mesa: com conta compatível, "Liquidar" é o caminho; a despesa nova só abre depois de "Não é esta conta" e com o motivo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./EscolhaDeFavorecido", () => ({ EscolhaDeFavorecido: () => <div data-testid="favorecido" /> }));

import { CartaoDaLinha } from "./CartaoDaLinha";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import type { Edicao } from "@/lib/gradeOfx";

const documento = {
  documento: { id: "ob-1", valor: 278.22, data: "2026-10-05", fornecedor_id: "f1", fornecedor_nome: "Verisure Brasil" },
  diferenca: 0, exato: true, incerto: false, confianca: 98, contrato: null, segundoContrato: false, ambiguo: false, outrosAbertos: [], contratoSemDocumento: null, motivo: "o valor é igual ao do documento do mesmo favorecido",
};
const sugestao = { confianca: 80, banda: "revisar" as const, motivos: ["nome no extrato"], categoriaId: "cat-1", alternativas: [] };
const linha = (extra: Partial<LinhaAnalisada> = {}): LinhaAnalisada => ({
  tx: { fitid: "N105B3", tipo: "saida", data: "2026-10-05", valor: 278.22, memo: "PAGTO ELETRON COBRANCA VERISURE" }, situacao: "nova", sugestao, ...extra,
} as LinhaAnalisada);

function Caso({ l, aoConfirmar, aoBuscar }: { l: LinhaAnalisada; aoConfirmar?: () => void; aoBuscar?: () => void }) {
  const [edicao, setEdicao] = useState<Edicao | undefined>(undefined);
  return (
    <CartaoDaLinha linha={l} edicao={edicao} marcada={false} ocupado={false} categorias={[]} opcoesDeCentro={[]} projetos={[]}
      nomeDaCategoria={() => "Categoria"} ignorarDisponivel={false} outrasContas={[]} contaNome="Bradesco"
      onEditar={p => setEdicao(e => ({ ...e, ...p }))} onMarcar={() => {}} onConfirmar={aoConfirmar ?? (() => {})} onFormulario={() => {}} onTransferencia={() => {}}
      onConfirmarTransferencia={() => {}} onLiquidar={() => {}} onIgnorar={() => {}} onBuscar={aoBuscar ?? (() => {})} />
  );
}

let raiz: Root | null = null;
let pai: HTMLDivElement | null = null;
function montar(el: JSX.Element) {
  pai = document.createElement("div"); document.body.appendChild(pai);
  raiz = createRoot(pai);
  act(() => { raiz!.render(el); });
  return pai;
}
afterEach(() => { act(() => { raiz?.unmount(); }); pai?.remove(); raiz = null; pai = null; });

const botao = (texto: RegExp | string) =>
  [...document.querySelectorAll("button")].find(b => (typeof texto === "string" ? (b.textContent ?? "").trim() === texto : texto.test(b.textContent ?? ""))) as HTMLButtonElement | undefined;
const clicar = (b: HTMLElement | undefined) => { if (!b) throw new Error("botão não achado"); act(() => { b.click(); }); };
function digitar(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { set.call(input, valor); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("CartaoDaLinha — a conta compatível vem antes da despesa nova", () => {
  it("com conta compatível: 'Liquidar esta conta' é o botão; categoria, centro e 'nova despesa' não aparecem", () => {
    montar(<Caso l={linha({ documentos: [documento] })} />);
    expect(document.body.textContent).toContain("Já existe uma conta compatível");
    expect(botao(/Liquidar esta conta/)).toBeTruthy();
    expect(botao(/Registrar como nova despesa/)).toBeUndefined();
    expect(document.querySelector('[aria-label="Centro de custo"]')).toBeNull();
    expect(document.querySelector('[aria-label="Categoria"]')).toBeNull();
  });

  it("'Não é esta conta' abre a despesa nova, mas o botão só habilita depois do MOTIVO", () => {
    const aoConfirmar = vi.fn();
    montar(<Caso l={linha({ documentos: [documento] })} aoConfirmar={aoConfirmar} />);
    clicar(botao(/Não é esta conta/));
    expect(botao(/Registrar como nova despesa/)!.disabled).toBe(true);
    expect(document.querySelector('[aria-label="Centro de custo"]')).toBeTruthy();
    clicar(botao("É outro pagamento do mesmo favorecido"));
    expect(botao(/Registrar como nova despesa/)!.disabled).toBe(false);
    clicar(botao(/Registrar como nova despesa/));
    expect(aoConfirmar).toHaveBeenCalledTimes(1);
  });

  it("um motivo digitado à mão também vale", () => {
    montar(<Caso l={linha({ documentos: [documento] })} />);
    clicar(botao(/Não é esta conta/));
    digitar(document.querySelector('input[aria-label="Outro motivo"]') as HTMLInputElement, "pagamento do mês seguinte");
    expect(botao(/Registrar como nova despesa/)!.disabled).toBe(false);
  });

  it("sem candidata: diz o que procurou, a despesa nova já está aberta e não pede motivo", () => {
    montar(<Caso l={linha()} />);
    expect(document.body.textContent).toContain("Nenhuma conta em aberto nem recorrência compatível");
    expect(botao(/Registrar como nova despesa/)!.disabled).toBe(false);
    expect(document.body.textContent).not.toContain("obrigatório");
  });

  it("'Buscar e associar' está em qualquer cenário", () => {
    const aoBuscar = vi.fn();
    montar(<Caso l={linha({ documentos: [documento] })} aoBuscar={aoBuscar} />);
    clicar(botao(/Buscar outra conta ou lançamento/));
    act(() => { raiz!.unmount(); }); pai!.remove();
    montar(<Caso l={linha()} aoBuscar={aoBuscar} />);
    clicar(botao(/Buscar e associar a um lançamento que já existe/));
    expect(aoBuscar).toHaveBeenCalledTimes(2);
  });

  it("valor diferente: o botão principal continua sendo liquidar (explicar a diferença), nunca criar", () => {
    montar(<Caso l={linha({ documentos: [{ ...documento, exato: false, diferenca: 12.5 }] })} />);
    expect(botao(/Liquidar esta conta \(explicar a diferença\)/)).toBeTruthy();
    expect(botao(/Registrar como nova despesa/)).toBeUndefined();
  });
});
