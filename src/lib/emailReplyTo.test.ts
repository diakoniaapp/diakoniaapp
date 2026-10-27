// ─── Reply-To dos e-mails automáticos (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela: o remetente continua `resumo@diakoniaapp.com.br`, a RESPOSTA vai para um endereço configurável na Identidade da Igreja, e nunca existe `nao-responda@`.
// Estes testes travam: a ordem email_resposta → email_contato → nenhum; que a configuração nunca derruba um envio (coluna ausente, erro de rede, lixo no campo); que o rodapé convida ou
// desaconselha a resposta conforme haja endereço; e que TODAS as Edge Functions de e-mail usam o remetente central e passam o Reply-To.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { REMETENTE_AUTOMATICO, comReplyTo, emailDeRespostaValido, enderecoDeResposta, lerEnderecoDeResposta } from "../../supabase/functions/_shared/email/remetente";
import { aplicarNotaDeResposta, aplicarNotaDeRespostaNoTexto, moldura, textoDaNotaDeResposta } from "../../supabase/functions/_shared/email/desenho";

/** Um supabase-js de mentira: cada consulta devolve a próxima resposta da fila e guarda as colunas pedidas. */
function clienteFalso(respostas: Array<{ data?: unknown; error?: unknown } | Error>) {
  const pedidas: string[] = [];
  const fila = [...respostas];
  const cadeia: any = {
    select: (c: string) => { pedidas.push(c); return cadeia; },
    eq: () => cadeia, order: () => cadeia, limit: () => cadeia,
    maybeSingle: async () => { const r = fila.shift(); if (r instanceof Error) throw r; return r ?? { data: null, error: null }; },
  };
  return { cliente: { from: () => cadeia }, pedidas };
}

describe("emailDeRespostaValido", () => {
  it("aceita um e-mail comum e tira os espaços", () => { expect(emailDeRespostaValido("  tesouraria@qibrj.org.br ")).toBe("tesouraria@qibrj.org.br"); });
  it.each(["", "   ", "sem-arroba", "a@b", "dois@@x.com", "nome <a@b.com>", "a@b.com, c@d.com", null, undefined, 42])("recusa %p (a configuração nunca derruba um envio)", v => {
    expect(emailDeRespostaValido(v)).toBeNull();
  });
  it("recusa mais de 160 caracteres", () => { expect(emailDeRespostaValido(`${"a".repeat(160)}@x.com`)).toBeNull(); });
});

describe("enderecoDeResposta — a ordem", () => {
  it("o campo próprio vence o contato institucional", () => {
    expect(enderecoDeResposta({ email_resposta: "tesouraria@qibrj.org.br", email_contato: "contato@qibrj.org.br" })).toBe("tesouraria@qibrj.org.br");
  });
  it("em branco, vale o e-mail de contato", () => { expect(enderecoDeResposta({ email_resposta: "", email_contato: "contato@qibrj.org.br" })).toBe("contato@qibrj.org.br"); });
  it("resposta inválida também cai para o contato", () => { expect(enderecoDeResposta({ email_resposta: "lixo", email_contato: "contato@qibrj.org.br" })).toBe("contato@qibrj.org.br"); });
  it("sem nenhum dos dois: nulo", () => { expect(enderecoDeResposta({})).toBeNull(); expect(enderecoDeResposta(null)).toBeNull(); });
});

describe("lerEnderecoDeResposta — lê da Identidade sem nunca lançar", () => {
  it("lê as duas colunas de uma vez", async () => {
    const { cliente, pedidas } = clienteFalso([{ data: { email_resposta: "administracao@qibrj.org.br", email_contato: null } }]);
    expect(await lerEnderecoDeResposta(cliente)).toBe("administracao@qibrj.org.br");
    expect(pedidas).toEqual(["email_resposta, email_contato"]);
  });
  it("coluna nova ainda não existe (migration não aplicada): repete só com email_contato", async () => {
    const { cliente, pedidas } = clienteFalso([{ data: null, error: { message: "column identidade_igreja.email_resposta does not exist" } }, { data: { email_contato: "contato@qibrj.org.br" } }]);
    expect(await lerEnderecoDeResposta(cliente)).toBe("contato@qibrj.org.br");
    expect(pedidas).toEqual(["email_resposta, email_contato", "email_contato"]);
  });
  it("erro nas duas consultas: nulo, e o e-mail sai do mesmo jeito", async () => {
    const { cliente } = clienteFalso([{ data: null, error: { message: "x" } }, { data: null, error: { message: "y" } }]);
    expect(await lerEnderecoDeResposta(cliente)).toBeNull();
  });
  it("exceção de rede: nulo, nunca lança", async () => {
    const { cliente } = clienteFalso([new Error("rede caiu")]);
    await expect(lerEnderecoDeResposta(cliente)).resolves.toBeNull();
  });
  it("Identidade sem linha ativa: nulo", async () => {
    const { cliente } = clienteFalso([{ data: null, error: null }, { data: null, error: null }]);
    expect(await lerEnderecoDeResposta(cliente)).toBeNull();
  });
});

describe("comReplyTo — o corpo da chamada ao Resend", () => {
  it("com endereço: acrescenta reply_to e não mexe no resto", () => {
    expect(comReplyTo({ from: REMETENTE_AUTOMATICO, to: ["a@b.com"] }, "t@qibrj.org.br")).toEqual({ from: REMETENTE_AUTOMATICO, to: ["a@b.com"], reply_to: "t@qibrj.org.br" });
  });
  it("sem endereço: nenhum reply_to (nem vazio)", () => {
    expect("reply_to" in comReplyTo({ from: "x" }, null)).toBe(false);
    expect("reply_to" in comReplyTo({ from: "x" }, "")).toBe(false);
  });
  it("o remetente é resumo@ e nunca nao-responda@", () => {
    expect(REMETENTE_AUTOMATICO).toBe("Diakonia <resumo@diakoniaapp.com.br>");
    expect(REMETENTE_AUTOMATICO).not.toMatch(/nao-?responda|noreply|no-reply/i);
  });
});

describe("a nota do rodapé", () => {
  const html = moldura({ igreja: "Quarta Igreja Batista do Rio de Janeiro", assunto: "Teste", corpo: "<p>corpo</p>" });
  it("a moldura sai com a marca no lugar da nota", () => { expect(html).toContain("<!--nota-de-resposta-->"); });
  it("com Reply-To, convida a responder", () => {
    const t = aplicarNotaDeResposta(html, "t@qibrj.org.br");
    expect(t).not.toContain("<!--nota-de-resposta-->");
    expect(t).toContain("responda a esta mensagem");
  });
  it("sem Reply-To, pede para não responder e manda procurar a equipe", () => {
    const t = aplicarNotaDeResposta(html, null);
    expect(t).toContain("não responda");
    expect(t).toContain("equipe administrativa");
    expect(t).not.toContain("<!--nota-de-resposta-->");
  });
  it("o endereço de resposta NÃO é impresso na nota (só a ação)", () => { expect(aplicarNotaDeResposta(html, "t@qibrj.org.br")).not.toContain("t@qibrj.org.br"); });
  it("a versão em texto leva a mesma frase", () => {
    expect(aplicarNotaDeRespostaNoTexto("Olá", "t@qibrj.org.br")).toBe(`Olá\n\n${textoDaNotaDeResposta("t@qibrj.org.br")}`);
    expect(aplicarNotaDeRespostaNoTexto("Olá", null)).toContain("não responda");
  });
  it("html sem a marca passa intacto", () => { expect(aplicarNotaDeResposta("<p>x</p>", "t@qibrj.org.br")).toBe("<p>x</p>"); });
});

describe("contrato das Edge Functions de e-mail", () => {
  const dir = path.resolve(__dirname, "../../supabase/functions");
  const funcoes = ["resumo-diario", "resumo-diario-previa", "resumo-semanal", "resumo-semanal-previa", "alerta-ata-atrasada", "alerta-visitante-esfriando", "visitante-mensagem-teste"];
  it.each(funcoes)("%s usa o remetente central e lê o Reply-To da Identidade", f => {
    const src = fs.readFileSync(path.join(dir, f, "index.ts"), "utf8");
    expect(src).toContain("REMETENTE_AUTOMATICO");
    expect(src).toContain("lerEnderecoDeResposta");
    expect(src).not.toMatch(/Diakonia\s*<resumo@/);   // nenhum remetente escrito à mão
  });
  it("nenhuma função de e-mail envia para o Resend sem passar pelo Reply-To", () => {
    for (const f of funcoes) {
      const src = fs.readFileSync(path.join(dir, f, "index.ts"), "utf8");
      if (src.includes("api.resend.com")) expect(src, f).toMatch(/comReplyTo|enviarDiarioAosDestinatarios/);
    }
    const enviar = fs.readFileSync(path.join(dir, "_shared/pagamentos/enviarDiario.ts"), "utf8");
    expect(enviar).toContain("comReplyTo");
  });
  it("em lugar nenhum do código existe um remetente nao-responda@", () => {
    const achados: string[] = [];
    const varrer = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) varrer(p); else if (/\.ts$/.test(e.name) && /nao-?responda@/i.test(fs.readFileSync(p, "utf8").split("\n").filter(l => !l.trim().startsWith("//")).join("\n"))) achados.push(p); } };   // comentário pode citar o nome proibido
    varrer(dir);
    expect(achados).toEqual([]);
  });
});
