import { describe, expect, it, vi } from "vitest";

type Linha = { quitacao_id: string; obrigacao_id: string; versao: number; assinada_anexo_id: string | null };
let linhas: Linha[] = [];
let erro: { message: string } | null = null;
let estados: Record<string, string> = {};
const rpc = vi.fn(async (_n: string, a: { p_quitacao: string }) => ({ data: estados[a.p_quitacao] ?? null, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ in: async (_c: string, ids: string[]) => ({ data: erro ? null : linhas.filter(l => ids.includes(l.obrigacao_id)), error: erro }) }) }),
    rpc: (n: string, a: { p_quitacao: string }) => rpc(n, a),
  },
}));

import { obrigacoesAguardandoAssinatura } from "./declaracaoAguardandoService";

describe("obrigacoesAguardandoAssinatura — a Declaração gerada que espera a assinatura (28/10/2026)", () => {
  it("só conta quem o BANCO diz 'aguardando_assinatura' (a via mais nova, atual e sem o arquivo assinado)", async () => {
    linhas = [
      { quitacao_id: "q1", obrigacao_id: "o1", versao: 1, assinada_anexo_id: null },        // aguardando
      { quitacao_id: "q2", obrigacao_id: "o2", versao: 1, assinada_anexo_id: "a1" },        // já assinada
      { quitacao_id: "q3", obrigacao_id: "o3", versao: 1, assinada_anexo_id: null },        // via desatualizada: a igreja é que precisa gerar outra
    ];
    estados = { q1: "aguardando_assinatura", q3: "desatualizada" };
    expect([...await obrigacoesAguardandoAssinatura(["o1", "o2", "o3", "o4"])]).toEqual(["o1"]);
  });
  it("só a versão MAIS NOVA vale: a v1 sem assinatura não conta se a v2 já foi assinada", async () => {
    linhas = [
      { quitacao_id: "q1", obrigacao_id: "o1", versao: 1, assinada_anexo_id: null },
      { quitacao_id: "q1", obrigacao_id: "o1", versao: 2, assinada_anexo_id: "a2" },
    ];
    estados = { q1: "aguardando_assinatura" };
    rpc.mockClear();
    expect((await obrigacoesAguardandoAssinatura(["o1"])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();   // nem pergunta ao banco: a mais nova já está assinada
  });
  it("sem a tabela ou sem permissão, ninguém espera assinatura (tudo continua cobrado como antes)", async () => {
    linhas = [{ quitacao_id: "q1", obrigacao_id: "o1", versao: 1, assinada_anexo_id: null }];
    erro = { message: "relation does not exist" };
    expect((await obrigacoesAguardandoAssinatura(["o1"])).size).toBe(0);
    erro = null;
  });
  it("lista vazia: não consulta nada", async () => {
    rpc.mockClear();
    expect((await obrigacoesAguardandoAssinatura([])).size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
