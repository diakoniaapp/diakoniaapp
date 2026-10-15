import { describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import type { PlanoPacote } from "@/lib/pacoteContabil";

// O malote leva os documentos do fechamento: pasta própria, índice com quem incluiu e quando, e um arquivo que falhar não derruba o pacote.
let salvo: Blob | null = null;
vi.mock("file-saver", () => ({ saveAs: (b: Blob) => { salvo = b; } }));
const baixaveis: Record<string, string | null> = { "2026-09/a-set.ofx": "OFX-BYTES", "2026-09/b-vendas.xlsx": "XLSX-BYTES", "2026-09/c-sumiu.pdf": null };
// (o Blob do jsdom não tem arrayBuffer(); o do navegador tem: o mock devolve só o que o serviço usa)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ download: async (p: string) => (baixaveis[p] == null ? { data: null, error: { message: "não encontrado" } } : { data: { arrayBuffer: async () => new TextEncoder().encode(baixaveis[p]!).buffer }, error: null }) }) } },
}));
vi.mock("@/services/finService", () => ({ FIN_ANEXO_TIPO_LABEL: {}, enriquecerLancamentos: async () => [] }));
vi.mock("@/services/quitacaoService", () => ({
  eventosDaQuitacao: async () => [], listarFilasDeQuitacao: async () => [], ofertaDisponivel: async () => false, quitacaoDisponivel: async () => false, quitacoesDasObrigacoes: async () => new Map(),
}));

import { baixarPacoteContabil } from "./pacoteContabilService";

const lerZip = (b: Blob) => new Promise<ArrayBuffer>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = rej; r.readAsArrayBuffer(b); }).then(buf => JSZip.loadAsync(buf));

const plano = (docs: PlanoPacote["documentosDoFechamento"], totalSaidas = 0): PlanoPacote => ({
  ano: 2026, mes: 9, raiz: "Pacote_Contabil_2026_09", totalSaidas, comAnexo: 0, dispensam: 0, nomesAjustados: 0, nomesComId: 0, dossies: [], totalArquivos: 0, totalXml: 0, indice: [], pendencias: [],
  ofertadas: 0, avisos: 0, quitacoesPendentes: [], documentosDoFechamento: docs,
});
const d = (id: string, tipo: PlanoPacote["documentosDoFechamento"][number]["tipo"], arquivoNome: string, storagePath: string) =>
  ({ id, tipo, arquivoNome, storagePath, descricao: null, contaNome: "Bradesco", tamanhoBytes: 2048, incluidoEm: "2026-10-05T15:30:00Z", incluidoPorNome: "Ana Tesoureira" });

describe("o malote leva os documentos do fechamento", () => {
  it("põe cada documento na pasta do tipo, com o índice (quem incluiu e quando)", async () => {
    const r = await baixarPacoteContabil(plano([d("1", "ofx", "set.ofx", "2026-09/a-set.ofx"), d("2", "adquirente_cielo", "vendas.xlsx", "2026-09/b-vendas.xlsx")]));
    expect(r.documentosDoFechamento).toBe(2);
    const zip = await lerZip(salvo!);
    const nomes = Object.keys(zip.files);
    expect(nomes).toContain("Pacote_Contabil_2026_09/Documentos do fechamento/OFX/set.ofx");
    expect(nomes).toContain("Pacote_Contabil_2026_09/Documentos do fechamento/Adquirentes/Cielo/vendas.xlsx");
    expect(await zip.file("Pacote_Contabil_2026_09/Documentos do fechamento/OFX/set.ofx")!.async("string")).toBe("OFX-BYTES");
    const indice = await zip.file("Pacote_Contabil_2026_09/Documentos do fechamento/INDICE_DOCUMENTOS.csv")!.async("string");
    expect(indice).toContain("Ana Tesoureira");
    expect(indice).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
    expect(indice).toContain("Relatório Cielo");
  });

  it("um arquivo que não baixa não derruba o pacote: vai para ERROS.txt e os outros entram", async () => {
    const r = await baixarPacoteContabil(plano([d("1", "ofx", "set.ofx", "2026-09/a-set.ofx"), d("3", "outro", "sumiu.pdf", "2026-09/c-sumiu.pdf")]));
    expect(r.documentosDoFechamento).toBe(1);
    expect(r.falhas).toHaveLength(1);
    const zip = await lerZip(salvo!);
    expect(Object.keys(zip.files)).toContain("Pacote_Contabil_2026_09/Documentos do fechamento/OFX/set.ofx");
    expect(await zip.file("Pacote_Contabil_2026_09/ERROS.txt")!.async("string")).toContain("sumiu.pdf");
  });

  it("sem documentos do fechamento, o pacote não ganha pasta nem índice novo", async () => {
    await baixarPacoteContabil(plano([], 1));
    const zip = await lerZip(salvo!);
    expect(Object.keys(zip.files).some(n => n.includes("Documentos do fechamento"))).toBe(false);
  });

  it("sem saída nenhuma e sem documento, continua recusando (como antes)", async () => {
    await expect(baixarPacoteContabil(plano([]))).rejects.toThrow(/Nenhuma saída paga/);
  });
});
