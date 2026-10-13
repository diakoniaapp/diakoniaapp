// O dossiê da OBRIGAÇÃO (Fase A, 13/10/2026): num pagamento parcial o boleto fica na linha original e o comprovante em cada parcela.
// A parcela herda o DOCUMENTO das irmãs; o COMPROVANTE nunca é herdado — cada pagamento prova o seu.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
let consultasDeAnexo = 0;

function builder(tabela: string) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const b: any = {
    select: () => b,
    not: (c: string, _op: string, v: unknown) => { filtros.push(l => l[c] !== v); return b; },
    neq: (c: string, v: unknown) => { filtros.push(l => l[c] !== v); return b; },
    in: (c: string, v: unknown[]) => { filtros.push(l => v.includes(l[c])); return b; },
    order: () => b,
    range: () => b,
    then: (res: (r: unknown) => unknown) => {
      if (tabela === "fin_lancamento_anexos") consultasDeAnexo++;
      return Promise.resolve({ data: (tabelas[tabela] ?? []).filter(l => filtros.every(f => f(l))), error: null }).then(res);
    },
  };
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));

import { documentosHerdados, esquecerGrupos, irmaosDasLinhas } from "./grupoDaObrigacaoService";

// Denise: raiz (paga 1.358) + resto (80). Verisure: obrigação de uma linha só.
const anexo = (id: string, lancamento_id: string, tipo: string) => ({ id, lancamento_id, tipo, url: `${id}.pdf`, nome: id, enviado_em: null });

describe("documentos herdados do grupo da obrigação", () => {
  beforeEach(() => {
    esquecerGrupos(); consultasDeAnexo = 0;
    tabelas.fin_lancamentos = [
      { id: "raiz", obrigacao_id: "raiz" }, { id: "resto", obrigacao_id: "raiz" }, { id: "verisure", obrigacao_id: "verisure" }, { id: "comum", obrigacao_id: null },
    ];
    tabelas.fin_lancamento_anexos = [
      anexo("boleto", "raiz", "boleto"), anexo("pix-raiz", "raiz", "comprovante"), anexo("pix-resto", "resto", "comprovante"), anexo("fatura", "verisure", "fatura"),
    ];
  });

  it("a parcela herda o boleto da linha original — e só o boleto: o comprovante da irmã não vem junto", async () => {
    const r = await documentosHerdados(["resto"]);
    expect([...r.keys()]).toEqual(["resto"]);
    expect(r.get("resto")).toEqual([expect.objectContaining({ lancamento_id: "resto", de: "raiz", tipo: "boleto", url: "boleto.pdf" })]);
  });

  it("a linha original não herda nada da parcela (a parcela só tinha comprovante)", async () => {
    expect((await documentosHerdados(["raiz"])).size).toBe(0);
  });

  it("obrigação de uma linha só e linha sem obrigação: ninguém herda, e nem se consulta anexo", async () => {
    expect((await documentosHerdados(["verisure", "comum"])).size).toBe(0);
    expect(consultasDeAnexo).toBe(0);
  });

  it("quem tem irmã é só o grupo com mais de uma linha", async () => {
    const m = await irmaosDasLinhas();
    expect([...m.keys()].sort()).toEqual(["raiz", "resto"]);
  });

  it("falha ao ler os grupos nunca derruba a tela: ninguém tem irmã", async () => {
    esquecerGrupos();
    const antes = tabelas.fin_lancamentos;
    tabelas.fin_lancamentos = undefined as unknown as Linha[];
    expect((await documentosHerdados(["resto"])).size).toBe(0);
    tabelas.fin_lancamentos = antes;
  });
});
