// A linha de "contas a pagar" da Mesa (20/10/2026): Editar + Pagar agora; reembolso aprovado = Pagar reembolso; quitada por terceiro = sem Pagar, com o rótulo "Quitada por Terceiro".
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { FinVencimento } from "@/services/finService";
import type { QuitacaoDaObrigacao } from "@/services/quitacaoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}), rpc: async () => ({ data: null }) }, supabaseRel: {} }));

import { LinhaDeConta } from "./MesaDoTesoureiro";

const venc = { id: "v1", data: "2026-10-15", tipo: "saida", status: "previsto", valor: 1500, descricao: "Carpete", conta_id: "c", conta_nome: "Caixinha Administrativo", categoria_id: null, categoria_nome: null, categoria_cor: null, fornecedor_id: null, fornecedor_nome: "Leandro Dias", dias_para_vencer: -5, urgencia: "vencido", projeto_id: null, projeto_nome: null, centro_custo_id: null, centro_custo_nome: null } as unknown as FinVencimento;
const quit = (o: Partial<QuitacaoDaObrigacao>) => ({ responsavel: "pessoa", responsavelNome: "Lucio Paulo Paz Barreto", fila: null, saldoAReembolsar: null, valorDaObrigacao: 1500, ...o }) as unknown as QuitacaoDaObrigacao;

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });
const chamadas: string[] = [];
function montar(quitacao?: QuitacaoDaObrigacao) {
  chamadas.length = 0;
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  act(() => { raiz!.render(<MemoryRouter><ul><LinhaDeConta v={venc} temAnexo={false} quitacao={quitacao}
    onPagar={() => chamadas.push("pagar")} onPagarReembolso={() => chamadas.push("reembolso")} onEditar={() => chamadas.push("editar")} onAnexo={() => {}} onAbrir={() => chamadas.push("abrir")} /></ul></MemoryRouter>); });
  return alvo;
}
const rotulos = (el: HTMLElement) => [...el.querySelectorAll("button")].map(b => b.textContent!.replace(/\s+/g, " ").trim()).filter(Boolean);

describe("linha da Mesa", () => {
  it("obrigação normal: Editar + Pagar agora", () => {
    const el = montar();
    expect(rotulos(el)).toEqual(["Editar", "Pagar agora"]);
    act(() => { ([...el.querySelectorAll("button")].find(b => b.textContent!.includes("Pagar agora")) as HTMLButtonElement).click(); });
    act(() => { ([...el.querySelectorAll("button")].find(b => b.textContent!.includes("Editar")) as HTMLButtonElement).click(); });
    expect(chamadas).toEqual(["pagar", "editar"]);
  });

  it("reembolso aprovado a pagar: o botão é Pagar reembolso (outro fluxo), com o saldo e quem recebe", () => {
    const el = montar(quit({ fila: "reembolso_a_pagar", saldoAReembolsar: 1500 } as Partial<QuitacaoDaObrigacao>));
    expect(rotulos(el)).toEqual(["Editar", "Pagar reembolso"]);
    // quem recebe vem em DESTAQUE (é o título da linha); o fornecedor passa a ser "o que ele quitou"; e a conta prevista aparece (pedido dela, 22/10/2026)
    expect(el.querySelector("[data-quem-recebe]")!.textContent).toBe("Lucio Paulo Paz Barreto");
    expect(el.querySelector("[data-reembolso-detalhe]")!.textContent).toContain("Quitou:");
    expect(el.querySelector("[data-reembolso-detalhe]")!.textContent).toContain("Conta prevista para pagamento:");
    expect(el.textContent).toContain("Reembolso a pagar · saldo");
    act(() => { ([...el.querySelectorAll("button")].find(b => b.textContent!.includes("Pagar reembolso")) as HTMLButtonElement).click(); });
    expect(chamadas).toEqual(["reembolso"]);
  });

  it("quitada por terceiro: NÃO tem Pagar nem Editar; mostra 'Quitada por Terceiro' e só deixa ver a quitação", () => {
    const el = montar(quit({ fila: "formalizar" } as Partial<QuitacaoDaObrigacao>));
    expect(rotulos(el)).toEqual(["Ver quitação"]);
    expect(el.textContent).toContain("Quitada por Terceiro — Lucio Paulo Paz Barreto");
  });
});
