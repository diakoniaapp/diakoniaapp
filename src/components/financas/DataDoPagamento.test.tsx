import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DataDoPagamento, type EstadoDaDataDoPagamento } from "./DataDoPagamento";
import { hojeLocal } from "@/lib/data";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// o arquivo nunca é lido de verdade aqui: o texto do "comprovante" é entregue pelo serviço simulado
const servico = vi.hoisted(() => ({ texto: "", jaAnexado: false }));
vi.mock("@/services/comprovanteService", async (orig) => {
  const real = await orig<typeof import("@/services/comprovanteService")>();
  return {
    ...real,
    comprovanteJaAnexado: vi.fn(async () => (servico.jaAnexado ? new File(["x"], "anexado.pdf", { type: "application/pdf" }) : null)),
    textoDoComprovante: vi.fn(async (f: File, origem: "agora" | "anexado" = "agora") => ({ texto: servico.texto, fonte: "pdf_texto" as const, confiancaOcr: null, arquivoNome: f.name, origem })),
  };
});

const PIX = "Bradesco\nComprovante de Transação Pix\nData e Hora: 28/09/2026 - 15:42:10\nValor: R$ 1.500,00";
const arquivo = (nome = "pix.pdf") => new File(["pdf"], nome, { type: "application/pdf" });

let raiz: Root | null = null; let alvo: HTMLDivElement | null = null;
let estados: EstadoDaDataDoPagamento[] = [];
const ultimo = () => estados[estados.length - 1];
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; });
beforeEach(() => { servico.texto = PIX; servico.jaAnexado = false; estados = []; });

function tela(arq: File | null, valor = 1500) {
  return <DataDoPagamento lancamentoId="l1" arquivo={arq} valorEsperado={valor} onMudar={e => estados.push(e)} />;
}
async function montar(arq: File | null, valor = 1500) {
  alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(tela(arq, valor)); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });   // deixa as leituras (promessas) terminarem
}
const texto = () => alvo!.textContent ?? "";
const botao = (nome: string) => [...alvo!.querySelectorAll("button")].find(b => b.textContent?.trim() === nome)!;
const clicar = async (nome: string) => { await act(async () => { botao(nome).click(); }); };
function digitar(sel: string, valor: string) {
  const el = alvo!.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
  act(() => { el.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("Data do pagamento sugerida pelo comprovante", () => {
  it("sem comprovante: vale hoje e pode confirmar", async () => {
    await montar(null);
    expect(ultimo()).toMatchObject({ data: hojeLocal(), pronto: true, comprovante: null });
  });

  it("com sugestão: mostra data, horário, valor e confiança, e ESPERA a escolha", async () => {
    await montar(arquivo());
    expect(texto()).toContain("28/09/2026");
    expect(texto()).toContain("15:42");
    expect(texto()).toMatch(/R\$\s?1\.500,00/);
    expect(texto()).toContain("Alta");
    expect(ultimo()).toMatchObject({ pronto: false });
    expect(ultimo().problema).toMatch(/Escolha/);
  });

  it("'Usar data sugerida' grava a data do comprovante", async () => {
    await montar(arquivo());
    await clicar("Usar data sugerida");
    expect(ultimo()).toMatchObject({ data: "2026-09-28", pronto: true, motivo: null });
    expect(ultimo().comprovante?.leitura.data).toBe("2026-09-28");
  });

  it("'Alterar manualmente' para outra data exige o motivo", async () => {
    await montar(arquivo());
    await clicar("Alterar manualmente");
    digitar("#data-pagamento", "2026-09-27");
    expect(ultimo()).toMatchObject({ data: "2026-09-27", pronto: false });
    expect(ultimo().problema).toMatch(/por que/);
    digitar("#motivo-data", "O extrato mostra 27/09");
    expect(ultimo()).toMatchObject({ pronto: true, motivo: "O extrato mostra 27/09" });
  });

  it("alterar manualmente e voltar à data do comprovante não pede motivo", async () => {
    await montar(arquivo());
    await clicar("Alterar manualmente");
    digitar("#data-pagamento", "2026-09-28");
    expect(ultimo()).toMatchObject({ data: "2026-09-28", pronto: true });
  });

  it("data futura é recusada", async () => {
    await montar(arquivo());
    await clicar("Alterar manualmente");
    digitar("#data-pagamento", "2099-01-01");
    digitar("#motivo-data", "x");
    expect(ultimo().problema).toMatch(/futura/);
  });

  it("comprovante sem data: avisa e vale hoje, editável", async () => {
    servico.texto = "Comprovante\nValor: R$ 1.500,00";
    await montar(arquivo());
    expect(texto()).toContain("Não foi possível identificar a data do comprovante");
    expect(ultimo()).toMatchObject({ data: hojeLocal(), pronto: true });
    expect(ultimo().comprovante?.leitura.data).toBeNull();
  });

  it("valor do comprovante diferente do pago: rebaixa a confiança e avisa", async () => {
    await montar(arquivo(), 1358);
    expect(texto()).toContain("Média");
    expect(texto()).toMatch(/O comprovante é de R\$\s?1\.500,00/);
  });

  it("comprovante já anexado à despesa também é lido", async () => {
    servico.jaAnexado = true;
    await montar(null);
    expect(texto()).toContain("28/09/2026");
    expect(texto()).toContain("comprovante já anexado");
  });

  it("trocar o arquivo zera a escolha feita sobre o anterior", async () => {
    await montar(arquivo());
    await clicar("Usar data sugerida");
    expect(ultimo()).toMatchObject({ pronto: true });
    servico.texto = "Pix realizado em 25/09/2026 às 10:00";
    await act(async () => { raiz!.render(tela(arquivo("outro.pdf"))); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(texto()).toContain("25/09/2026");
    expect(ultimo()).toMatchObject({ pronto: false });
  });
});
