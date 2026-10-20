// Fila do dia (Fase C): uma lista só, com um vocabulário só (a ação em verbo) e uma régua (Agora · Hoje · Em breve), juntando contas a pagar, débitos automáticos e quitações.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FinVencimento } from "@/services/finService";
import type { DebitoDoMes } from "@/services/mesaOperacoesService";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let filas: unknown[] = [];
let prazos: unknown[] = [];
let vigencia: string | null = null;
let sincronizou = 0;
vi.mock("@/services/quitacaoService", () => ({
  sincronizarQuitacoes: async () => { sincronizou++; return 0; },
  listarFilasDeQuitacao: async () => filas,
  prazosAbertos: async () => prazos,
  carregarParametros: async () => ({ vigencia }),
}));
vi.mock("@/services/finService", () => ({ brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ") }));

import { FilaDoDia, type AcoesDaFila } from "./FilaDoDia";

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; filas = []; prazos = []; vigencia = null; sincronizou = 0; });

const hoje = "2026-10-20";
const venc = (id: string, dias: number, o: Record<string, unknown> = {}) => ({ id, valor: 100, dias_para_vencer: dias, data: "2026-10-20", forma_liquidacao: "boleto_fatura", tipo: "saida", ...o }) as unknown as FinVencimento;
const deb = (id: string, data: string, fornecedor = "Claro"): DebitoDoMes => ({ id, data, valor: 50, status: "previsto", fornecedor, contaNome: "Bradesco", variavel: false, descricao: null, dataPagamento: null });
const quit = (id: string, fila: string, o: Record<string, unknown> = {}) => ({
  quitacaoId: "q-" + id, obrigacaoId: id, fila, valorDaObrigacao: 200, saldoAReembolsar: 90, dataDaDespesa: "2026-10-01", idadeEmDias: 19, bloqueiaFechamento: false,
  emitente: "Mercado Bom", responsavel: "pessoa", responsavelNome: "Ana", intencao: "reembolso", reembolsado: 0, ...o,
});

const chamadas: string[] = [];
const acoes: AcoesDaFila = {
  renderConta: (v, chip) => <li key={v.id} data-conta={v.id}>{chip}<button onClick={() => chamadas.push("pagar:" + v.id)}>Pagar agora</button></li>,
  onAbrirObrigacao: id => chamadas.push("abrir:" + id),
  onMarcarDebitado: id => chamadas.push("debitado:" + id),
  onPagarReembolso: q => chamadas.push("reembolso:" + q.obrigacaoId),
  podePagar: true,
};

async function abrir(p: Partial<{ vencimentos: FinVencimento[]; debitos: DebitoDoMes[]; comQuitacao: Set<string>; podePagar: boolean }> = {}) {
  chamadas.length = 0;
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => {
    raiz!.render(<FilaDoDia hoje={hoje} vencimentos={p.vencimentos ?? []} debitos={p.debitos ?? []} obrigacoesComQuitacao={p.comQuitacao ?? new Set()} chave={0} acoes={{ ...acoes, podePagar: p.podePagar ?? true }} />);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const clicar = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe("Fila do dia", () => {
  it("junta contas, débitos e quitações numa lista só, em Agora → Hoje → Em breve", async () => {
    filas = [quit("reemb", "reembolso_a_pagar"), quit("inv", "investigar")];
    prazos = [{ quitacaoId: "q-inv", situacao: "vencido", diasRestantes: -4 }];
    const el = await abrir({
      vencimentos: [venc("atrasada", -5), venc("hoje", 0), venc("amanha", 1)],
      debitos: [deb("falha", "2026-10-10"), deb("aguarda", "2026-10-19", "Light")],
    });
    expect([...el.querySelectorAll("[data-urgencia] h3")].map(h => h.textContent)).toEqual(["Agora · 3", "Hoje · 3", "Em breve · 1"]);
    const acoesNaOrdem = [...el.querySelectorAll("[data-acao]")].map(a => a.getAttribute("data-acao"));
    expect(acoesNaOrdem).toEqual(["debito_falhou", "pagar", "investigar", "pagar", "pagar_reembolso", "conferir_debito", "pagar"]);
    expect(sincronizou).toBe(1);                                              // a formalização vencida é realinhada ao abrir (como antes)
  });

  it("o vocabulário é o mesmo em toda origem: o verbo da ação, no chip", async () => {
    filas = [quit("a", "a_esclarecer"), quit("b", "formalizar"), quit("c", "aprovar_reembolso")];
    const el = await abrir({ debitos: [deb("falha", "2026-10-10")] });
    const rotulos = [...el.querySelectorAll("[data-acao]")].map(a => a.textContent!.replace(/^\S\s?/, "").trim());
    expect(rotulos).toEqual(expect.arrayContaining(["Possível falha no débito", "Esclarecer a intenção", "Formalizar", "Aprovar reembolso"]));
  });

  it("uma obrigação com Quitação aparece UMA vez (a igreja não paga ao fornecedor): a conta a pagar sai, a quitação fica", async () => {
    filas = [quit("terc", "formalizar")];
    const el = await abrir({ vencimentos: [venc("terc", -2)], comQuitacao: new Set(["terc"]) });
    expect(el.querySelector("[data-conta='terc']")).toBeNull();
    expect(el.querySelectorAll("[data-chave='quitacao:q-terc']")).toHaveLength(1);
  });

  it("'Marcar debitado' chama a conferência do débito; o débito de hoje só se acompanha (sem botão)", async () => {
    const el = await abrir({ debitos: [deb("falha", "2026-10-10"), deb("hojed", "2026-10-20", "Verisure")] });
    const botoes = [...el.querySelectorAll("button")].filter(b => b.textContent === "Marcar debitado");
    expect(botoes).toHaveLength(1);
    await clicar(botoes[0]);
    expect(chamadas).toEqual(["debitado:falha"]);
    expect(el.querySelector("[data-chave='debito:hojed']")!.textContent).toContain("o banco debita hoje");
  });

  it("reembolso a pagar: botão Pagar com o SALDO; as outras quitações: Resolver abre a obrigação", async () => {
    filas = [quit("reemb", "reembolso_a_pagar"), quit("esc", "a_esclarecer")];
    const el = await abrir();
    const linhaReemb = el.querySelector("[data-chave='quitacao:q-reemb']")!;
    expect(linhaReemb.textContent).toContain("R$ 90,00");
    await clicar([...linhaReemb.querySelectorAll("button")].find(b => b.textContent!.includes("Pagar"))!);
    expect(chamadas).toEqual(["reembolso:reemb"]);
    await clicar([...el.querySelector("[data-chave='quitacao:q-esc']")!.querySelectorAll("button")].find(b => b.textContent!.includes("Resolver"))!);
    expect(chamadas.at(-1)).toBe("abrir:esc");
  });

  it("quem não opera o dinheiro só consulta (sem Pagar nem Marcar debitado)", async () => {
    filas = [quit("reemb", "reembolso_a_pagar")];
    const el = await abrir({ debitos: [deb("falha", "2026-10-10")], podePagar: false });
    expect([...el.querySelectorAll("button")].some(b => b.textContent === "Marcar debitado")).toBe(false);
    expect([...el.querySelectorAll("button")].some(b => /Pagar$/.test(b.textContent ?? ""))).toBe(false);
  });

  it("diz a vigência da Política quando há quitação na fila", async () => {
    filas = [quit("a", "formalizar")];
    vigencia = "2026-11-01";
    const el = await abrir();
    expect(el.textContent).toContain("bloqueia o fechamento a partir de 01/11/2026");
  });

  it("fila vazia: diz que nada pede a Tesouraria agora", async () => {
    const el = await abrir();
    expect(el.querySelector("[data-fila-vazia]")!.textContent).toContain("Nada pede você agora");
  });
});
