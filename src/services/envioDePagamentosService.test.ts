// O "Preparar envio" lê cada obrigação na ordem aprovada (linha > Pix do documento > Pix do cadastro ligado > favorecido achado pelo nome) e monta o ZIP documental com "00 RESUMO.pdf".
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinVencimento } from "@/services/finService";

const BRADESCO = "23790226079000020134447008430002715980000030000";
const fornecedores: Record<string, any> = {
  f1: { id: "f1", nome: "Caio Marcelo Mendes da Silva", chave_pix: "caio@email.com", tipo_chave_pix: "email", ativo: true },
  f2: { id: "f2", nome: "Light Serviços", chave_pix: null, tipo_chave_pix: null, ativo: true },
  f3: { id: "f3", nome: "Denise Teixeira Dinis", chave_pix: "denise@email.com", tipo_chave_pix: "email", ativo: true },
};
let leituras: Record<string, any[]> = {};
let anexos: any[] = [];
const salvos: { blob: Blob; nome: string }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: () => ({ order: async () => ({ data: anexos, error: null }) }) }) }) },
}));
vi.mock("@/services/finService", () => ({
  anexoSignedUrl: async (u: string) => `https://arquivo/${u}`,
  buscarFornecedor: async (id: string) => fornecedores[id] ?? null,
  listarFornecedores: async () => Object.values(fornecedores),
  nomeExtrato: (v: { fornecedor_nome?: string }) => ({ principal: v.fornecedor_nome ?? "Sem nome" }),
}));
vi.mock("@/services/documentoPagamentoService", () => ({ dadosParaPagarDoLancamento: async (id: string) => leituras[id] ?? [] }));
vi.mock("file-saver", () => ({ saveAs: (blob: Blob, nome: string) => { salvos.push({ blob, nome }); } }));

import { baixarPacote, baixarResumo, carregarItensDeEnvio } from "./envioDePagamentosService";

const venc = (id: string, o: Partial<FinVencimento> = {}) => ({
  id, data: "2026-10-20", valor: 100, descricao: null, fornecedor_id: null, fornecedor_nome: `Fornecedor ${id}`, categoria_nome: "Energia", centro_custo_nome: "Administração", dias_para_vencer: 0, ...o,
}) as unknown as FinVencimento;
const doc = (o: Record<string, any> = {}) => ({ anexoId: "a", nomeDoArquivo: "x.pdf", rotulo: "Boleto", valor: 100, vencimento: "2026-10-20", beneficiario: null, linhaDigitavel: null, codigoBarras: null, codigoValido: true, pix: null, origem: "guardado", ...o });
const anexo = (lancamento_id: string, tipo: string, nome = `${tipo}.pdf`) => ({ id: `${lancamento_id}-${tipo}`, lancamento_id, tipo, url: `${lancamento_id}/${tipo}.pdf`, nome, enviado_por: null, enviado_em: "2026-10-01" });

beforeEach(() => {
  leituras = {}; anexos = []; salvos.length = 0;
  (globalThis as any).fetch = async () => new Response(new Blob(["%PDF-1.4 fake"]));
});

describe("a ordem do meio de pagamento", () => {
  it("linha digitável do documento > Pix do documento > Pix do cadastro ligado", async () => {
    leituras = {
      a: [doc({ linhaDigitavel: BRADESCO, pix: { payload: "000201PIXDODOC", nome: null, crcValido: true } })],   // tem linha E Pix: a linha manda
      b: [doc({ pix: { payload: "000201PIXDODOC", nome: null, crcValido: true } })],
      c: [],
    };
    const itens = await carregarItensDeEnvio([
      { v: venc("a"), valor: 100 }, { v: venc("b", { fornecedor_id: "f1" }), valor: 100 }, { v: venc("c", { fornecedor_id: "f1" }), valor: 100 },
    ]);
    const por = Object.fromEntries(itens.map(i => [i.id, i]));
    expect(por.a.origem).toBe("linha_documento"); expect(por.a.pix).toBeNull();
    expect(por.b.origem).toBe("pix_documento"); expect(por.b.pix).toBe("000201PIXDODOC");     // o Pix do documento vence o do cadastro, mesmo havendo favorecido com Pix
    expect(por.c.origem).toBe("pix_cadastro"); expect(por.c.pix).toMatch(/^000201/);           // montado a partir da chave do favorecido, com o valor
    expect([por.a.marcadoPorPadrao, por.b.marcadoPorPadrao, por.c.marcadoPorPadrao]).toEqual([true, true, true]);
  });

  it("favorecido ligado SEM Pix cadastrado: sem meio automático", async () => {
    const [i] = await carregarItensDeEnvio([{ v: venc("x", { fornecedor_id: "f2" }), valor: 100 }]);
    expect(i.grupo).toBe("sem_dado"); expect(i.origem).toBeNull(); expect(i.marcadoPorPadrao).toBe(false);
  });

  it("sem favorecido ligado: o palpite pelo nome (um cadastro só) traz o Pix, mas pede 'Confirmar favorecido' e vem desmarcado", async () => {
    const [i] = await carregarItensDeEnvio([{ v: venc("n", { descricao: "Caio Marcelo", fornecedor_nome: null }), valor: 250 }]);
    expect(i.origem).toBe("pix_cadastro"); expect(i.favorecidoParaConfirmar).toBe("Caio Marcelo Mendes da Silva");
    expect(i.marcadoPorPadrao).toBe(false); expect(i.pix).toMatch(/^000201/);
  });

  it("nome ambíguo ou sem acerto: nada é sugerido", async () => {
    const [a] = await carregarItensDeEnvio([{ v: venc("m", { descricao: "Pagamento", fornecedor_nome: null }), valor: 10 }]);
    expect(a.grupo).toBe("sem_dado"); expect(a.favorecidoParaConfirmar).toBeNull();
  });

  it("documentos: conta o que acompanha o envio (nota fiscal sim; comprovante e provas de quitação não)", async () => {
    anexos = [anexo("a", "boleto"), anexo("a", "nota_fiscal"), anexo("a", "comprovante"), anexo("a", "declaracao_terceiro"), anexo("b", "fatura")];
    const itens = await carregarItensDeEnvio([{ v: venc("a"), valor: 1 }, { v: venc("b"), valor: 1 }, { v: venc("c"), valor: 1 }]);
    expect(itens.map(i => i.documentos)).toEqual([2, 1, 0]);
  });
});

describe("o pacote (ZIP + 00 RESUMO.pdf)", () => {
  it("pasta 20.OUT com os documentos renomeados (boleto antes da nota) e 00 RESUMO.pdf; LEIA-ME fora da pasta; arquivo 20.OUT.2026.zip", async () => {
    leituras = { a: [doc({ linhaDigitavel: BRADESCO })], b: [doc({ pix: { payload: "000201PIX", nome: null, crcValido: true } })] };
    anexos = [anexo("a", "nota_fiscal"), anexo("a", "boleto"), anexo("b", "fatura"), anexo("s", "boleto"), anexo("a", "comprovante")];
    const itens = await carregarItensDeEnvio([{ v: venc("a", { fornecedor_nome: "Junta de Missões" }), valor: 300 }, { v: venc("b", { fornecedor_nome: "Ana" }), valor: 800 }]);
    const [sem] = await carregarItensDeEnvio([{ v: venc("s", { fornecedor_nome: "ABC" }), valor: 37.8 }]);

    const r = await baixarPacote({ itens, semMeio: [sem], hojeYmd: "2026-10-20" });
    expect(r.arquivos).toBe(4);                                  // boleto + nota de A, fatura de B, boleto de ABC (o comprovante fica de fora)
    expect(salvos).toHaveLength(1); expect(salvos[0].nome).toBe("20.OUT.2026.zip");
    const zip = await JSZip.loadAsync(salvos[0].blob);
    const nomes = Object.keys(zip.files).filter(n => !zip.files[n].dir).sort();
    expect(nomes).toEqual([
      "20.OUT/00 RESUMO.pdf",
      "20.OUT/01 Bradesco - Junta de Missoes - 300,00 - boleto.pdf",
      "20.OUT/01 Bradesco - Junta de Missoes - 300,00 - nota fiscal.pdf",
      "20.OUT/02 Ana - 800,00 - fatura.pdf",
      "20.OUT/03 ABC - 37,80 - boleto.pdf",
      "LEIA-ME.txt",
    ]);
    const leia = await zip.file("LEIA-ME.txt")!.async("string");
    expect(leia).toContain("Pacote preparado automaticamente pelo DiakoniaApp.");
    expect(leia).toContain("03. ABC — R$ 37,80");
    expect(leia).toContain("(sem meio automático de pagamento)");
    const resumo = await zip.file("20.OUT/00 RESUMO.pdf")!.async("uint8array");
    expect(new TextDecoder().decode(resumo.slice(0, 5))).toBe("%PDF-");
  });

  it("nenhum documento baixável: não gera ZIP e diz quem ficou sem", async () => {
    const itens = await carregarItensDeEnvio([{ v: venc("z", { fornecedor_nome: "Sem papel" }), valor: 10 }]);
    const r = await baixarPacote({ itens, semMeio: [], hojeYmd: "2026-10-20" });
    expect(r).toEqual({ arquivos: 0, semDocumento: ["Sem papel"], falhas: [] });
    expect(salvos).toHaveLength(0);
  });

  it("um arquivo que não baixa não derruba os outros e é listado", async () => {
    anexos = [anexo("a", "boleto"), anexo("a", "nota_fiscal")];
    let n = 0;
    (globalThis as any).fetch = async () => { if (++n === 2) throw new Error("rede"); return new Response(new Blob(["x"])); };
    const itens = await carregarItensDeEnvio([{ v: venc("a", { fornecedor_nome: "Junta" }), valor: 1 }]);
    const r = await baixarPacote({ itens, semMeio: [], hojeYmd: "2026-10-20" });
    expect(r.arquivos).toBe(1); expect(r.falhas).toHaveLength(1);
  });

  it("baixarResumo: o PDF avulso, com o nome do lote", async () => {
    anexos = [anexo("a", "boleto")];
    const itens = await carregarItensDeEnvio([{ v: venc("a", { fornecedor_nome: "Junta" }), valor: 1 }]);
    await baixarResumo({ itens, semMeio: [], hojeYmd: "2026-10-20" });
    expect(salvos[0].nome).toBe("RESUMO 20.OUT.2026.pdf");
    expect(salvos[0].blob.type).toBe("application/pdf");
  });
});
