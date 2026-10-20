// "Preparar envio": o painel lista, confere e copia o e-mail dos tesoureiros. Atrasadas e de hoje com linha digitável vêm marcadas; sigiloso e Pix, nunca.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { montarItemDeEnvio, type ItemDeEnvio } from "@/lib/envioDePagamentos";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BRADESCO = "23790226079000020134447008430002715980000030000";
const NUBANK = "26091741037783826842679990000000311598000046833";
const mk = (id: string, fornecedor: string, valor: number, dias: number, l: Partial<Parameters<typeof montarItemDeEnvio>[1]> = {}, categoria = "Energia Elétrica", centro = "Administração"): ItemDeEnvio =>
  montarItemDeEnvio({ id, fornecedor, descricao: null, categoria, centro, valor, vencimento: dias <= 0 ? "2026-10-13" : "2026-10-18", diasParaVencer: dias },
    { linha: BRADESCO, pix: null, valorDoDocumento: valor, vencimentoDoDocumento: null, codigoValido: true, ...l });

let itensLidos: ItemDeEnvio[] = [];
const zips: ItemDeEnvio[][] = [];
vi.mock("@/services/envioDePagamentosService", () => ({
  carregarItensDeEnvio: async () => itensLidos,
  buscarPessoasComEmail: async (t: string) => (t.toLowerCase().startsWith("bre") ? [{ nome: "Breno Teixeira", email: "breno@qibrj.org.br" }] : []),
  baixarBoletos: async (itens: ItemDeEnvio[]) => { zips.push(itens); return { arquivos: itens.length, semDocumento: [] }; },
  lerPreferencias: () => { try { return JSON.parse(localStorage.getItem("teste-prefs") ?? "null") ?? { destinatarios: [], saudacao: null, introducao: null, incluirResumo: true, citarSemLinha: true }; } catch { return { destinatarios: [], saudacao: null, introducao: null, incluirResumo: true, citarSemLinha: true }; } },
  guardarPreferencias: (p: unknown) => localStorage.setItem("teste-prefs", JSON.stringify(p)),
}));
vi.mock("@/lib/whatsapp", () => ({ montarLinkWhatsApp: ({ texto }: { texto: string }) => `https://wa.me/?text=${encodeURIComponent(texto)}` }));

import { PrepararEnvioDialog } from "./PrepararEnvioDialog";

let raiz: Root | null = null;
const copiados: { html?: string; texto?: string }[] = [];
const abertos: string[] = [];
beforeEach(() => {
  copiados.length = 0; abertos.length = 0; zips.length = 0; localStorage.clear();
  class ClipboardItemFalso { constructor(public itens: Record<string, Blob>) {} }
  (globalThis as any).ClipboardItem = ClipboardItemFalso;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    // jsdom não tem Blob.text(): lê pelo FileReader
    write: async (xs: ClipboardItemFalso[]) => {
      const ler = (b: Blob) => new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsText(b); });
      const i = xs[0].itens; copiados.push({ html: await ler(i["text/html"]), texto: await ler(i["text/plain"]) });
    },
    writeText: async (t: string) => { copiados.push({ texto: t }); },
  } });
  vi.spyOn(window, "open").mockImplementation((u?: string | URL) => { abertos.push(String(u)); return null; });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { abertos.push(this.href); });
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.restoreAllMocks(); });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<PrepararEnvioDialog aberto onFechar={() => {}} candidatas={[]} hojeYmd="2026-10-13" onAbrirObrigacao={id => abertos.push("abrir:" + id)} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}
const doc = () => document.body;
const botao = (t: RegExp) => [...doc().querySelectorAll("button")].find(b => t.test(b.textContent ?? "")) as HTMLButtonElement;
const clicar = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
const marcada = (id: string) => doc().querySelector(`[data-item="${id}"] [role=checkbox]`)?.getAttribute("aria-checked") === "true";

describe("Preparar envio", () => {
  it("vem marcado só o que é pronto e de hoje ou atrasado; sigiloso, Pix e o que vence depois ficam desmarcados", async () => {
    itensLidos = [
      mk("junta", "Junta de Missões", 300, 0), mk("flora", "Flora Energia", 485.66, -1), mk("depois", "Verisure", 291.31, 3),
      mk("prebenda", "Lucio Paulo Paz Barreto", 8000, -5, {}, "Prebenda", "Pastoral · Sustento Pastoral"),
      mk("pix", "Ana Patrícia", 800, 0, { linha: null, pix: "00020126..." }), mk("nada", "ABC", 37.8, 0, { linha: null, pix: null }),
    ];
    await abrir();
    expect(["junta", "flora"].map(marcada)).toEqual([true, true]);
    expect(["depois", "prebenda", "pix"].map(marcada)).toEqual([false, false, false]);
    expect(doc().querySelector('[data-grupo="sem_dado"] [role=checkbox]')).toBeNull();      // sem dado automático não se marca: abre-se o documento
    expect(doc().textContent).toContain("2 pagamentos");
    expect(doc().querySelector("[data-previa]")!.textContent).toContain("JUNTA DE MISSÕES");
    expect(doc().querySelector("[data-previa]")!.textContent).not.toContain("LUCIO");
  });

  it("marcar um sigiloso avisa que vai no corpo; valor divergente mostra o aviso e vem desmarcado", async () => {
    itensLidos = [mk("prebenda", "Lucio Paulo Paz Barreto", 8000, -5, {}, "Prebenda", "Pastoral · Sustento Pastoral"), mk("dif", "Light", 100, 0, { valorDoDocumento: 120 })];
    await abrir();
    expect(doc().textContent).toContain("o documento traz R$ 120,00");
    expect(marcada("dif")).toBe(false);
    await clicar(doc().querySelector('[data-item="prebenda"] [role=checkbox]')!);
    expect(doc().querySelector("[role=alert]")!.textContent).toContain("prebenda");
  });

  it("'Sem dado automático' tem botão Abrir que leva à obrigação", async () => {
    itensLidos = [mk("nada", "ABC", 37.8, 0, { linha: null, pix: null })];
    await abrir();
    await clicar(botao(/Abrir$/));
    expect(abertos).toContain("abrir:nada");
  });

  it("Copiar e abrir e-mail: copia o HTML formatado + texto simples e abre o e-mail com destinatários e assunto", async () => {
    itensLidos = [mk("junta", "Junta de Missões", 300, 0), mk("letra", "Letra do Céu", 468.33, 0, { linha: NUBANK })];
    await abrir();
    // destinatário do Cadastro de Pessoas
    const campo = doc().querySelector<HTMLInputElement>('input[aria-label="Adicionar destinatário"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(campo, "Bre"); campo.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 320)); });
    await clicar(botao(/Breno Teixeira/));
    await clicar(botao(/Copiar e abrir e-mail/));
    await act(async () => { await new Promise(r => setTimeout(r, 100)); }); // a leitura dos Blobs e o mailto vêm depois do clique
    expect(copiados).toHaveLength(1);
    expect(copiados[0].html).toContain("<b>linha digitável disponível</b>");
    expect(copiados[0].html).toContain("23790 22607 90000 20134 44700 84300 02715 98000 00300 00");
    expect(copiados[0].texto).toContain("➡️ Boleto bancário · Bradesco · R$ 300,00 · vence 13/10/2026");
    expect(abertos.find(a => a.startsWith("mailto:"))).toBe("mailto:breno@qibrj.org.br?subject=Arquivos%20de%20pagamento%20%7C%20Vencimento%2013.10.2026");
    expect(JSON.parse(localStorage.getItem("teste-prefs")!).destinatarios).toEqual([{ nome: "Breno Teixeira", email: "breno@qibrj.org.br" }]); // lembrado para a próxima vez
  });

  it("WhatsApp abre a conversa com a mensagem; ZIP leva só os marcados", async () => {
    itensLidos = [mk("junta", "Junta de Missões", 300, 0), mk("depois", "Verisure", 291.31, 3)];
    await abrir();
    await clicar(botao(/WhatsApp/));
    expect(abertos.find(a => a.startsWith("https://wa.me/"))).toContain(encodeURIComponent("```23790 22607"));
    await clicar(botao(/Baixar boletos/));
    expect(zips).toHaveLength(1); expect(zips[0].map(i => i.id)).toEqual(["junta"]);
  });

  it("nada marcado: os botões ficam desligados", async () => {
    itensLidos = [mk("depois", "Verisure", 291.31, 3)];
    await abrir();
    expect(botao(/Copiar e abrir e-mail/).disabled).toBe(true);
    expect(botao(/Baixar boletos/).disabled).toBe(true);
  });
});
