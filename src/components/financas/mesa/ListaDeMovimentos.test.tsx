// A lista da Central de decisões: uma linha por movimento, com a hipótese (H0–H4) num chip; escolher a linha seleciona; só linha livre pode ser marcada para o lote.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ListaDeMovimentos, chipDaLinha } from "./ListaDeMovimentos";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";

const sug = { confianca: 62, banda: "revisar" as const, motivos: ["sem histórico"], categoriaId: "c1", alternativas: [] };
const tx = (fitid: string, extra: Record<string, unknown> = {}) => ({ fitid, tipo: "saida", data: "2026-10-05", valor: 278.22, memo: `MEMO ${fitid}`, ...extra });
const doc = { documento: { id: "o1", valor: 278.22, data: "2026-10-05", fornecedor_id: "f" }, diferenca: 0, exato: true, incerto: false, confianca: 98, contrato: null, segundoContrato: false, ambiguo: false, outrosAbertos: [], contratoSemDocumento: null, motivo: "" };
const rec = { recorrenciaId: "r1", rotulo: "Light", valor: 100, valorVariavel: false, vencimento: "2026-10-15", diferenca: 0, motivo: "" };
const jaReg = { lancamento: { id: "l1", tipo: "saida", valor: 1, data: "2026-10-05", fitids: ["N1"], origem: "recorrencia", status: "conciliado", criadoEm: "" }, fitidAntigo: "N1", mesmoDiaDePagamento: true, motivo: "x" };

const linhas = [
  { tx: tx("a"), situacao: "vincular", lancamentoId: "l1", jaRegistrado: jaReg, sugestao: sug },
  { tx: tx("b"), situacao: "nova", sugestao: sug, documentos: [doc] },
  { tx: tx("c"), situacao: "nova", sugestao: sug, recorrenciaCompativel: rec },
  { tx: tx("d", { tipo: "entrada", valor: 123.45 }), situacao: "nova", sugestao: sug },
  { tx: tx("e"), situacao: "debito_encontrado", lancamentoId: "d1", sugestao: sug },
  { tx: tx("f"), situacao: "ja_registrada", motivoJaRegistrada: "x" },
] as unknown as LinhaAnalisada[];

let raiz: Root | null = null; let pai: HTMLDivElement | null = null;
afterEach(() => { act(() => { raiz?.unmount(); }); pai?.remove(); raiz = null; pai = null; });
function montar(props: Partial<React.ComponentProps<typeof ListaDeMovimentos>> = {}) {
  const f = { onSelecionar: vi.fn(), onMarcar: vi.fn(), onDesfazer: vi.fn() };
  pai = document.createElement("div"); document.body.appendChild(pai); raiz = createRoot(pai);
  act(() => { raiz!.render(<ListaDeMovimentos itens={linhas} selecionada={null} confirmadas={new Map()} marcadas={new Set()} podeMarcar={l => l.tx.fitid === "d"} ocupado={false} {...f} {...props} />); });
  return f;
}
const linha = (fitid: string) => pai!.querySelector(`li[data-fitid="${fitid}"]`) as HTMLElement;

describe("ListaDeMovimentos", () => {
  it("cada movimento mostra a hipótese num chip: H0 vincular · H1 · H2 · H4 com a confiança · H3 débito · já registrada", () => {
    montar();
    expect(linha("a").textContent).toContain("H0 · vincular");
    expect(linha("b").textContent).toContain("H1");
    expect(linha("c").textContent).toContain("H2");
    expect(linha("d").textContent).toContain("62% · revisar");
    expect(linha("e").textContent).toContain("H3 · débito");
    expect(linha("f").textContent).toContain("já registrada");
  });

  it("escolher a linha chama onSelecionar; a selecionada fica marcada e leva o painel inline (celular)", () => {
    const f = montar({ selecionada: "b", painelInline: <p data-testid="painel">PAINEL</p> });
    act(() => { (linha("c").querySelector("button:not([role=checkbox])") as HTMLButtonElement).click(); });
    expect(f.onSelecionar).toHaveBeenCalledWith("c");
    expect(linha("b").getAttribute("data-selecionada")).toBe("true");
    expect(linha("b").textContent).toContain("PAINEL");
    expect(linha("c").textContent).not.toContain("PAINEL");
  });

  it("só a linha livre tem caixa de marcar (H0, H1, H2 e H3 não vão em lote)", () => {
    const f = montar();
    expect([...pai!.querySelectorAll("li")].filter(li => li.querySelector("[role=checkbox]")).map(li => li.getAttribute("data-fitid"))).toEqual(["d"]);
    act(() => { (linha("d").querySelector("[role=checkbox]") as HTMLButtonElement).click(); });
    expect(f.onMarcar).toHaveBeenCalledWith("d", true);
  });

  it("a linha lançada agora vira 'lançado' e oferece Desfazer", () => {
    const f = montar({ confirmadas: new Map([["d", ["id1"]]]) });
    expect(linha("d").textContent).toContain("lançado");
    const desfazer = [...linha("d").querySelectorAll("button")].find(b => /Desfazer/.test(b.textContent ?? "")) as HTMLButtonElement;
    act(() => { desfazer.click(); });
    expect(f.onDesfazer).toHaveBeenCalledWith("d", ["id1"]);
    expect(linha("d").querySelector("[role=checkbox]")).toBeNull();
  });

  it("chipDaLinha: H4 mostra a confiança com a cor da faixa; lançada agora ganha o chip verde", () => {
    expect(chipDaLinha(linhas[3], false).texto).toBe("62% · revisar");
    expect(chipDaLinha(linhas[3], true).texto).toBe("lançado");
  });
});
