// "Novo acesso" cria a conta pela função do banco (só administrador) — nunca pelo cadastro PÚBLICO do Auth, que precisa poder ser fechado.
import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
let respostaDaCriacao: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let jaTemAcesso = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      return fn === "admin_criar_acesso" ? Promise.resolve(respostaDaCriacao) : Promise.resolve({ data: null, error: null });
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: jaTemAcesso ? { id: "x" } : null }) }) }) }),
  },
}));

import { criarAcessoPessoa } from "./acessoService";

const pedido = { pessoaId: "p1", nomeCompleto: "Breno Teixeira", telefone: "(21) 97930-3125", role: "secretaria" };

beforeEach(() => { chamadas.length = 0; jaTemAcesso = false; respostaDaCriacao = { data: [{ ok: true, erro: null, telefone: "5521979303125", user_id: "u1" }], error: null }; });

describe("criarAcessoPessoa", () => {
  it("chama admin_criar_acesso com a ficha, o papel e uma senha temporária — e devolve a senha para o WhatsApp", async () => {
    const r = await criarAcessoPessoa(pedido);
    expect(r.ok).toBe(true);
    const c = chamadas.find(x => x.fn === "admin_criar_acesso")!;
    expect(c.args).toMatchObject({ p_pessoa_id: "p1", p_role: "secretaria" });
    expect(String(c.args.p_senha)).toHaveLength(8);
    expect(r.senha).toBe(c.args.p_senha);
    expect(r.tel).toBe("21979303125");
  });

  it("registra a auditoria com o id da conta criada", async () => {
    await criarAcessoPessoa(pedido);
    const log = chamadas.find(x => x.fn === "registrar_audit_log")!;
    expect(log.args).toMatchObject({ p_tipo_evento: "acesso_criado", p_pessoa_id: "p1", p_user_id: "u1" });
  });

  it("a recusa do banco (não é administrador, já tem acesso…) chega como mensagem, sem senha e sem auditoria", async () => {
    respostaDaCriacao = { data: [{ ok: false, erro: "Apenas o administrador cria acessos", telefone: null, user_id: null }], error: null };
    const r = await criarAcessoPessoa(pedido);
    expect(r).toEqual({ ok: false, erro: "Apenas o administrador cria acessos" });
    expect(chamadas.some(x => x.fn === "registrar_audit_log")).toBe(false);
  });

  it("erro de rede/RPC vira mensagem", async () => {
    respostaDaCriacao = { data: null, error: { message: "boom" } };
    expect((await criarAcessoPessoa(pedido)).erro).toContain("boom");
  });

  it("telefone que já tem acesso nem chega ao banco", async () => {
    jaTemAcesso = true;
    const r = await criarAcessoPessoa(pedido);
    expect(r.ok).toBe(false);
    expect(chamadas.some(x => x.fn === "admin_criar_acesso")).toBe(false);
  });
});

describe("o app não usa mais o cadastro público do Auth", () => {
  it("nenhum arquivo de src/ chama auth.signUp (se algum voltar, fechar o cadastro público quebra a tela dele)", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const caminho = `${dir}/${e.name}`;
        if (e.isDirectory()) { varrer(caminho); continue; }
        if (!/\.(ts|tsx)$/.test(e.name) || e.name === "acessoService.criar.test.ts") continue;
        readFileSync(caminho, "utf8").split("\n").forEach((l, n) => { if (/\.signUp\(/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l)) achados.push(`${caminho}:${n + 1}`); });
      }
    };
    varrer("src");
    expect(achados).toEqual([]);
  });

  it("a função está registrada nos tipos e a migration só deixa usuário autenticado executá-la", () => {
    expect(readFileSync("src/integrations/supabase/types.ts", "utf8")).toContain("admin_criar_acesso: {");
    const mig = readFileSync("supabase/migrations/20261020200000_admin_criar_acesso.sql", "utf8");
    expect(mig).toContain("REVOKE ALL ON FUNCTION public.admin_criar_acesso(uuid, text, text) FROM PUBLIC, anon;");
    expect(mig).toContain("IF NOT public.is_admin() THEN");
  });
});
