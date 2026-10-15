// Fase 2A (15/10/2026): a declaração manda. O motivo da edição viaja no mesmo UPDATE; a tela pergunta o impacto antes de gravar; a trilha e os nomes vêm do banco,
// e tudo continua funcionando (sem a pergunta, sem a trilha) enquanto a migration não estiver aplicada.
import { beforeEach, describe, expect, it, vi } from "vitest";

let rpcs: Record<string, { data?: unknown; error?: { message: string; code?: string } | null }> = {};
let historico: { data: unknown; error: unknown } = { data: [], error: null };
let perfis: { id: string; nome: string }[] = [];
const atualizacoes: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (nome: string) => { const r = rpcs[nome]; if (!r) return { data: null, error: { message: "function does not exist", code: "PGRST202" } }; return { data: r.data ?? null, error: r.error ?? null }; },
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (tabela: string) => {
      const b: any = {
        select: () => b, in: () => b, order: () => b, eq: () => b,
        update: (patch: Record<string, unknown>) => { atualizacoes.push(patch); return b; },
        then: (res: (r: unknown) => unknown) => {
          const r = tabela === "fin_lancamento_historico" ? historico : tabela === "profiles" ? { data: perfis, error: null } : { data: [{ id: "x" }], error: null };
          return Promise.resolve(r).then(res);
        },
      };
      return b;
    },
  },
}));

beforeEach(() => { rpcs = {}; historico = { data: [], error: null }; perfis = []; atualizacoes.length = 0; });

describe("o motivo da edição viaja no mesmo UPDATE", () => {
  it("com motivo: a coluna-canal vai junto (sem espaços sobrando)", async () => {
    const { atualizarLancamento } = await import("./finService");
    await atualizarLancamento("L1", { valor: 120 } as never, "  nota corrigida  ");
    expect(atualizacoes.at(-1)).toMatchObject({ valor: 120, motivo_edicao: "nota corrigida", audit_user_id: "u1" });
  });
  it("sem motivo: a coluna nem é enviada (funciona antes da migration)", async () => {
    const { atualizarLancamento } = await import("./finService");
    await atualizarLancamento("L1", { descricao: "x" } as never);
    expect(atualizacoes.at(-1)).not.toHaveProperty("motivo_edicao");
    await atualizarLancamento("L1", { descricao: "y" } as never, "   ");
    expect(atualizacoes.at(-1)).not.toHaveProperty("motivo_edicao");
  });
});

describe("a pergunta: o que esta edição invalida?", () => {
  it("devolve o impacto que o banco calculou", async () => {
    rpcs.fin_impacto_edicao = { data: { invalida: true, campos: ["valor"], declaracao_estado: "assinada", derruba_aprovacoes: true } };
    const { impactoDaEdicao } = await import("./edicaoLancamentoService");
    expect(await impactoDaEdicao("L1", { valor: 999 })).toEqual({ invalida: true, campos: ["valor"], declaracaoEstado: "assinada", derrubaAprovacoes: true });
  });
  it("sem a função no banco (migration não aplicada) não pergunta: devolve null", async () => {
    const { impactoDaEdicao } = await import("./edicaoLancamentoService");
    expect(await impactoDaEdicao("L1", { valor: 999 })).toBeNull();
  });
  it("erro do banco também não trava a edição: devolve null (o banco continua sendo a barreira)", async () => {
    rpcs.fin_impacto_edicao = { error: { message: "Sem permissão." } };
    const { impactoDaEdicao } = await import("./edicaoLancamentoService");
    expect(await impactoDaEdicao("L1", { valor: 999 })).toBeNull();
  });
});

describe("a trilha e os nomes", () => {
  it("lê a trilha, com o nome gravado na hora; quando falta, busca pela função do financeiro", async () => {
    historico = { error: null, data: [
      { id: "h1", lancamento_id: "L1", campo: "valor", antes: "100.00", depois: "120.00", antes_rotulo: null, depois_rotulo: null, motivo: "nota corrigida", invalidou_declaracao: true, por: "u9", por_nome: "Bia Tesouraria", em: "2026-10-15T12:00:00Z" },
      { id: "h2", lancamento_id: "L1", campo: "categoria", antes: "c1", depois: "c2", antes_rotulo: "Energia", depois_rotulo: "Manutenção", motivo: null, invalidou_declaracao: false, por: "u7", por_nome: null, em: "2026-10-15T13:00:00Z" },
    ] };
    rpcs.fin_nomes_dos_usuarios = { data: [{ id: "u7", nome: "Carlos Admin" }] };
    const { listarEdicoes } = await import("./edicaoLancamentoService");
    const e = await listarEdicoes(["L1", "L1"]);
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ campo: "valor", porNome: "Bia Tesouraria", invalidouDeclaracao: true, motivo: "nota corrigida" });
    expect(e[1]).toMatchObject({ campo: "categoria", antesRotulo: "Energia", depoisRotulo: "Manutenção", porNome: "Carlos Admin", invalidouDeclaracao: false });
  });
  it("sem a tabela (migration não aplicada) a lista é vazia, sem erro", async () => {
    historico = { data: null, error: { message: "relation does not exist" } };
    const { listarEdicoes } = await import("./edicaoLancamentoService");
    expect(await listarEdicoes(["L1"])).toEqual([]);
  });
  it("os nomes vêm da função do financeiro; sem ela, da leitura direta de profiles", async () => {
    const { nomesDosUsuarios } = await import("./usuariosNomesService");
    rpcs.fin_nomes_dos_usuarios = { data: [{ id: "u1", nome: " Ana " }, { id: "u2", nome: null }] };
    const a = await nomesDosUsuarios(["u1", "u2", null, "u1"]);
    expect([...a.entries()]).toEqual([["u1", "Ana"]]);
    rpcs = {}; perfis = [{ id: "u3", nome: "Dora" }];
    const b = await nomesDosUsuarios(["u3"]);
    expect(b.get("u3")).toBe("Dora");
    expect((await nomesDosUsuarios([])).size).toBe(0);
  });
});
