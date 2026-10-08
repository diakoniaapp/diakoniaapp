// "Vincular Evidência PDF" sob concorrência: duas abas abrem a MESMA transferência feita à mão; a segunda a gravar nunca sobrescreve a primeira.
// O banco é simulado em memória, com a semântica que importa: o UPDATE condicional compara e troca numa operação só.
import { beforeEach, describe, expect, it, vi } from "vitest";

const linhas = new Map<string, { id: string; observacoes: string | null }>();
let depoisDaLeitura: (() => void) | null = null;   // "a outra aba escreve" logo depois da leitura desta

function builder(op: "select" | "update", payload?: { observacoes: string | null }) {
  const filtros: ((l: { id: string; observacoes: string | null }) => boolean)[] = [];
  const b: any = {
    eq: (c: string, v: unknown) => { filtros.push(l => (l as any)[c] === v); return b; },
    is: (c: string, v: null) => { filtros.push(l => (l as any)[c] === v); return b; },
    select: () => b,
    maybeSingle: async () => {
      const achada = [...linhas.values()].find(l => filtros.every(f => f(l)));
      const resposta = { data: achada ? { ...achada } : null, error: null };
      if (depoisDaLeitura) { const f = depoisDaLeitura; depoisDaLeitura = null; f(); }
      return resposta;
    },
    then: (res: (r: unknown) => unknown) => {
      const alvo = [...linhas.values()].filter(l => filtros.every(f => f(l)));
      if (op === "update") for (const l of alvo) l.observacoes = payload!.observacoes;
      return Promise.resolve({ data: alvo.map(l => ({ id: l.id })), error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => builder("select"), update: (p: { observacoes: string | null }) => builder("update", p) }) },
}));
vi.mock("@/services/auditoriaExtratoService", () => ({ textoDoPdf: async () => "" }));
vi.mock("@/services/importacaoOfxService", () => ({ ignorarLinha: async () => {}, listarIgnoradas: async () => ({ porFitid: new Map() }), registrarTransferenciaDoExtrato: async () => ({}) }));

import { vincularEvidencia } from "./investFacilService";
import { AVISO_VINCULO_ALTERADO, chavesNaObservacao, linhasDoInvestFacil } from "@/lib/investFacil";

const pdf = { arquivo: "extrato.pdf", hash: "h1", lidoEm: "2026-10-08T12:00:00.000Z" };
const [linhaX, linhaY] = linhasDoInvestFacil([
  { data: "2026-09-02", historico: "APLIC.INVEST FACIL", documento: "A", valor: -100, saldo: 0, bloco: 0 },
  { data: "2026-09-03", historico: "APLIC.INVEST FACIL", documento: "B", valor: -100, saldo: 0, bloco: 0 },
]);

beforeEach(() => { linhas.clear(); depoisDaLeitura = null; });

describe("Vincular Evidência PDF", () => {
  it("uso normal: acrescenta a evidência e preserva o texto que já existia", async () => {
    linhas.set("m", { id: "m", observacoes: "Aplicação feita no balcão" });
    await vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf });
    expect(linhas.get("m")!.observacoes).toContain("Aplicação feita no balcão");
    expect(chavesNaObservacao(linhas.get("m")!.observacoes)).toEqual([linhaX.chave]);
  });

  it("observação vazia (null) também vincula", async () => {
    linhas.set("m", { id: "m", observacoes: null });
    await vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf });
    expect(chavesNaObservacao(linhas.get("m")!.observacoes)).toEqual([linhaX.chave]);
  });

  it("a corrida: a aba B vincula a chave Y entre a leitura e a gravação da aba A — A é recusada e Y fica intacta", async () => {
    linhas.set("m", { id: "m", observacoes: null });
    depoisDaLeitura = () => { linhas.get("m")!.observacoes = "[invest-pdf:" + linhaY.chave + "] [origem:INVEST_FACIL_PDF]"; };   // a outra aba grava aqui
    await expect(vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf })).rejects.toThrow(AVISO_VINCULO_ALTERADO);
    expect(chavesNaObservacao(linhas.get("m")!.observacoes)).toEqual([linhaY.chave]);   // nada foi sobrescrito
  });

  it("a corrida também vale para texto livre: edição de outra pessoa no meio não é perdida", async () => {
    linhas.set("m", { id: "m", observacoes: "texto original" });
    depoisDaLeitura = () => { linhas.get("m")!.observacoes = "texto editado por outra pessoa"; };
    await expect(vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf })).rejects.toThrow(AVISO_VINCULO_ALTERADO);
    expect(linhas.get("m")!.observacoes).toBe("texto editado por outra pessoa");
  });

  it("transferência apagada no meio: mensagem própria, nada é recriado", async () => {
    linhas.set("m", { id: "m", observacoes: null });
    depoisDaLeitura = () => { linhas.delete("m"); };
    await expect(vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf })).rejects.toThrow("não existe mais");
    expect(linhas.size).toBe(0);
  });

  it("já tem evidência: recusa sem gravar", async () => {
    linhas.set("m", { id: "m", observacoes: "[invest-pdf:outra]" });
    await expect(vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf })).rejects.toThrow("já tem uma evidência");
  });

  it("desfazer devolve o texto original", async () => {
    linhas.set("m", { id: "m", observacoes: "texto original" });
    const r = await vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf });
    await r.desfazer();
    expect(linhas.get("m")!.observacoes).toBe("texto original");
  });

  it("desfazer NÃO apaga uma edição feita depois do vínculo", async () => {
    linhas.set("m", { id: "m", observacoes: null });
    const r = await vincularEvidencia({ lancamentoId: "m", linha: linhaX, pdf });
    linhas.get("m")!.observacoes += "\nnota da tesouraria";
    await expect(r.desfazer()).rejects.toThrow("alterada depois do vínculo");
    expect(linhas.get("m")!.observacoes).toContain("nota da tesouraria");
  });
});
