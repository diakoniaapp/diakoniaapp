// Fase F: "Insights" virou a seção "Análises do período" do Painel de gestão — recolhida (não consulta nada até abrir) e aberta pelo link antigo.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const consultas: string[] = [];
vi.mock("@/services/finService", () => ({
  previsaoCaixa: async () => { consultas.push("previsao"); return { saldo_atual: 100, saldo_projetado_30d: 80, saldo_projetado_60d: 60, saldo_projetado_90d: 40, entradas_previstas_30d: 0, saidas_previstas_30d: 20, entradas_previstas_60d: 0, saidas_previstas_60d: 40, entradas_previstas_90d: 0, saidas_previstas_90d: 60 }; },
  comparativoMeses: async () => { consultas.push("comparativo"); return []; },
  topFornecedores: async () => { consultas.push("fornecedores"); return [{ fornecedor_id: "f1", fornecedor_nome: "Light", total: 1234 }]; },
  listarCentrosComResumo: async () => { consultas.push("centros"); return []; },
  brl: (n: number) => `R$ ${n}`,
}));
vi.mock("@/components/financas/DonutChart", () => ({ DonutChart: () => null }));

import { AnalisesDoPeriodo } from "./AnalisesDoPeriodo";

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; consultas.length = 0; });

async function montar(abertaInicial?: boolean) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<AnalisesDoPeriodo abertaInicial={abertaInicial} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo;
}

describe("Análises do período", () => {
  it("nasce recolhida e não consulta nada enquanto ninguém abre", async () => {
    const el = await montar();
    expect(el.querySelector("button[aria-expanded=false]")).not.toBeNull();
    expect(consultas).toEqual([]);
    expect(el.textContent).not.toContain("Previsão de Caixa");
  });

  it("ao abrir, mostra o que só os Insights tinham — e não repete alertas nem anomalias (são o bloco Alertas do painel)", async () => {
    const el = await montar();
    await act(async () => { el.querySelector<HTMLButtonElement>("button[aria-expanded]")!.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect([...consultas].sort()).toEqual(["centros", "comparativo", "fornecedores", "previsao"]);
    expect(el.textContent).toContain("Previsão de Caixa");
    expect(el.textContent).toContain("Top fornecedores");
    expect(el.textContent).not.toContain("Anomalias");
  });

  it("o link antigo dos Insights chega com a seção já aberta", async () => {
    const el = await montar(true);
    expect(el.querySelector("button[aria-expanded=true]")).not.toBeNull();
    expect(consultas.length).toBe(4);
  });
});

describe("endereço antigo dos Insights e abertura da Mesa", () => {
  it("/financas/insights redireciona para a seção aberta, e o painel lê ?analises=1", () => {
    expect(readFileSync("src/App.tsx", "utf8")).toContain(`path="/financas/insights" element={<Navigate to="/painel-tesouraria?analises=1#gestao" replace />}`);
    expect(readFileSync("src/pages/PainelTesouraria.tsx", "utf8")).toContain(`get("analises") === "1"`);
  });

  it("a Mesa abre sempre no Calendário; o botão do Calendário vem primeiro e a Fila só por troca ou ?mesa=fila", () => {
    const mesa = readFileSync("src/components/financas/MesaDoTesoureiro.tsx", "utf8");
    expect(mesa).toContain(`get("mesa") === "fila" ? "fila" : "calendario"`);
    expect(mesa).toContain(`(["calendario", "fila"] as const).map(v => (`);
  });
});
