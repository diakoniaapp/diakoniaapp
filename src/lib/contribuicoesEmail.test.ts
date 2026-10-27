// ─── O e-mail agregado ao pastor (27/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O que ela decidiu: por e-mail só o AGREGADO (período, dizimistas identificados, total, média mensal, maior adesão, novos, recorrentes), nunca nomes. Aqui se prova: o conteúdo, que nenhum
// identificador de pessoa chega ao HTML, a moldura única (mesmo cabeçalho/rodapé dos outros e-mails), a validação do pedido e a consulta compartilhada com a tela.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarContribuicoes, type LinhaDeContribuicao } from "../../supabase/functions/_shared/contribuicoes/analise";
import { montarEmailDeContribuicoes, resumoExecutivo } from "../../supabase/functions/_shared/contribuicoes/email";
import { MAXIMO_DE_DESTINATARIOS, chaveDoEnvio, validarPedido } from "../../supabase/functions/_shared/contribuicoes/pedido";
import { lerContribuicoesDoPiso } from "../../supabase/functions/_shared/contribuicoes/carregar";
import { blocosDoModelo } from "../../supabase/functions/_shared/contribuicoes/blocos";
import { aplicarNotaDeResposta } from "../../supabase/functions/_shared/email/desenho";

const L = (p: string | null, data: string, valor: number, categoria = "Dizimos"): LinhaDeContribuicao => ({ pessoa_id: p, data, valor, categoria });
const periodo = { ini: "2026-03-01", fim: "2026-04-30" };
const linhas = [
  L("pessoa-secreta-111", "2026-03-02", 100), L("pessoa-secreta-111", "2026-04-06", 100), L("pessoa-secreta-222", "2026-03-09", 200),
  L("pessoa-secreta-333", "2026-04-13", 300, "Ofertas para Missões"), L(null, "2026-03-23", 150), L("pessoa-secreta-111", "2026-02-10", 80),
];
const a = analisarContribuicoes(linhas, periodo);
const email = montarEmailDeContribuicoes(a, { igreja: "Quarta Igreja Batista do Rio de Janeiro" });

describe("o conteúdo do e-mail", () => {
  it("assunto com o período; resumo executivo em linguagem corrida e só com o que o cálculo sustenta", () => {
    expect(email.assunto).toBe("Relatório de contribuições — 01/03/2026 a 30/04/2026");
    expect(email.resumo).toContain("2 dizimistas identificados deram dízimo");
    expect(email.resumo).toContain("3 pessoas contribuíram ao todo, somando");
    expect(email.resumo).toContain("meses completos");
    expect(email.resumo).toContain("pela primeira vez");
    expect(email.resumo).toContain("A semana de maior adesão foi a de");
  });
  it("traz os indicadores pedidos: dizimistas, doadores, arrecadado, média mensal, recorrência, novos", () => {
    for (const rotulo of ["Dizimistas", "Doadores", "Arrecadado", "Média mensal", "Média por doador", "Recorrência", "Novos", "Frequência média"]) expect(email.html).toContain(rotulo);
    expect(email.html).toContain("Curva de adesão");
    expect(email.html).toContain("Distribuição mensal");
    expect(email.html).toContain("Destaques");
  });
  it("diz a cobertura da identificação e que a análise começa em 01/01/2026", () => {
    expect(email.html).toContain("sem identificação");
    expect(email.html).toContain("01/01/2026");
  });
  it("NUNCA leva um identificador de pessoa, nem valor individual de quem contribuiu", () => {
    expect(email.html).not.toMatch(/pessoa-secreta/);
    expect(email.texto).not.toMatch(/pessoa-secreta/);
    expect(email.html).toContain("apenas números agregados");
  });
  it("período sem contribuição: diz isso, sem inventar gráfico", () => {
    const vazio = montarEmailDeContribuicoes(analisarContribuicoes([], periodo));
    expect(vazio.resumo).toContain("não há contribuições registradas");
    expect(vazio.html).not.toContain("Curva de adesão");
    expect(vazio.preheader).toBe("Sem contribuições no período.");
  });
  it("período que começa no piso: 'novos' não se afirma (sem histórico anterior)", () => {
    expect(resumoExecutivo(analisarContribuicoes(linhas, { ini: "2026-01-01", fim: "2026-04-30" }))).not.toContain("pela primeira vez");
  });
  it("singular e plural: uma pessoa, uma pessoa", () => {
    const um = analisarContribuicoes([L("x", "2026-03-02", 50)], { ini: "2026-03-01", fim: "2026-03-31" });
    expect(resumoExecutivo(um)).toContain("1 dizimista identificado deu dízimo e 1 pessoa contribuiu");
  });
  it("a versão em texto leva os mesmos números", () => {
    expect(email.texto).toContain("Dizimistas: 2");
    expect(email.texto).toContain("Doadores: 3");
  });
});

describe("a moldura única dos e-mails do sistema", () => {
  it("sai da mesma moldura (cabeçalho com a igreja, rodapé do DiakoniaApp, versículo) e deixa a marca da nota de resposta", () => {
    expect(email.html).toContain("Quarta Igreja Batista do Rio de Janeiro");
    expect(email.html).toContain("DiakoniaApp");
    expect(email.html).toContain("Tudo, porém, deve ser feito com decência e ordem.");
    expect(email.html).toContain("<!--nota-de-resposta-->");
    expect(aplicarNotaDeResposta(email.html, "t@qibrj.org.br")).toContain("responda a esta mensagem");
  });
  it("o módulo não escreve o próprio <html> nem cor fora da paleta, e não importa nada que carregue nomes de pessoas", () => {
    const src = readFileSync("supabase/functions/_shared/contribuicoes/email.ts", "utf8");
    expect(src).not.toMatch(/<!doctype|<html/i);
    expect(src).not.toMatch(/#[0-9a-fA-F]{6}\b/);   // só `D.COR`
    expect(src).not.toMatch(/membros|nome_completo|pessoa_id/);
  });
  it("a prévia e o teste levam a faixa de aviso; o envio de verdade, não", () => {
    expect(montarEmailDeContribuicoes(a, { aviso: "PRÉVIA — nada foi enviado" }).html).toContain("PRÉVIA — nada foi enviado");
    expect(email.html).not.toContain("PRÉVIA");
  });
});

describe("validarPedido — a função não confia no que vem da chamada", () => {
  const hoje = "2026-10-27";
  const ok = (corpo: Parameters<typeof validarPedido>[0], exige = false) => validarPedido(corpo, hoje, exige);
  it("período válido passa; fim no futuro vira hoje; início antes do piso é ajustado", () => {
    expect(ok({ periodo: { ini: "2026-03-01", fim: "2026-12-31" } })).toEqual({ ok: true, pedido: { periodo: { ini: "2026-03-01", fim: "2026-10-27", ajustado: false }, destinatarios: [], blocos: blocosDoModelo("pastor"), base: "membros_congregados", categorias: ["dizimo", "oferta", "missoes"] } });
    const r = ok({ periodo: { ini: "2025-06-01", fim: "2026-03-31" } });
    expect(r.ok && r.pedido.periodo).toEqual({ ini: "2026-01-01", fim: "2026-03-31", ajustado: true });
  });
  it.each([[{}], [{ periodo: { ini: "2026-13-01", fim: "2026-03-01" } }], [{ periodo: { ini: "ontem", fim: "hoje" } }], [{ periodo: { ini: "2026-04-01", fim: "2026-03-01" } }], [{ periodo: { ini: "2025-01-01", fim: "2025-12-31" } }]])("recusa %j", corpo => {
    expect(ok(corpo as never).ok).toBe(false);
  });
  it("destinatários: e-mail válido, minúsculo, sem repetição", () => {
    const r = ok({ periodo: { ini: "2026-03-01", fim: "2026-03-31" }, destinatarios: ["Pastor@QIBRJ.org.br", "pastor@qibrj.org.br", " outro@x.com "] }, true);
    expect(r.ok && r.pedido.destinatarios).toEqual(["pastor@qibrj.org.br", "outro@x.com"]);
  });
  it("e-mail inválido, lista vazia no envio e mais do que o máximo são recusados", () => {
    const p = { periodo: { ini: "2026-03-01", fim: "2026-03-31" } };
    expect(ok({ ...p, destinatarios: ["sem-arroba"] }, true).ok).toBe(false);
    expect(ok({ ...p, destinatarios: [] }, true).ok).toBe(false);
    expect(ok({ ...p, destinatarios: [] }, false).ok).toBe(true);   // prévia e teste não exigem destinatário
    const muitos = Array.from({ length: MAXIMO_DE_DESTINATARIOS + 1 }, (_, i) => `p${i}@x.com`);
    expect(ok({ ...p, destinatarios: muitos }, true).ok).toBe(false);
  });
  it("a chave do envio ignora a ordem dos destinatários (clique duplo com a lista reordenada é o mesmo envio)", () => {
    const base = { periodo: { ini: "2026-03-01", fim: "2026-03-31", ajustado: false } };
    expect(chaveDoEnvio({ ...base, destinatarios: ["a@x.com", "b@x.com"], blocos: ["resumo" as const], base: "membros" as const, categorias: ["dizimo" as const] })).toBe(chaveDoEnvio({ ...base, destinatarios: ["b@x.com", "a@x.com"], blocos: ["resumo" as const], base: "membros" as const, categorias: ["dizimo" as const] }));
  });
});

describe("a consulta é a MESMA da tela", () => {
  it("lê categorias de entrada, filtra contribuição, pagina de 1.000 em 1.000 e devolve o nome da categoria", async () => {
    const paginas = [Array.from({ length: 1000 }, (_, i) => ({ pessoa_id: "p", data: "2026-03-02", valor: 1, categoria_id: "c1", n: i })), [{ pessoa_id: "q", data: "2026-03-03", valor: 5, categoria_id: "c2" }]];
    const pedidos: string[] = [];
    const cliente = { from: (t: string) => {
      const q: any = { select: () => q, eq: () => q, in: () => q, gte: () => q, lte: () => q, order: () => q,
        range: async (de: number) => ({ data: paginas[de / 1000], error: null }),
        then: (f: (v: unknown) => unknown) => f({ data: [{ id: "c1", nome: "Dizimos" }, { id: "c2", nome: "Ofertas" }, { id: "c3", nome: "Rendimentos de Aplicações" }], error: null }) };
      pedidos.push(t); return q;
    } };
    const r = await lerContribuicoesDoPiso(cliente, "2026-10-27");
    expect(r.length).toBe(1001);
    expect(r[0].categoria).toBe("Dizimos");
    expect(r[1000]).toEqual({ pessoa_id: "q", data: "2026-03-03", valor: 5, categoria: "Ofertas" });
    expect(pedidos).toEqual(["fin_categorias", "fin_lancamentos", "fin_lancamentos"]);
  });
  it("a tela e a Edge Function usam o mesmo módulo de consulta", () => {
    expect(readFileSync("src/services/contribuicoesService.ts", "utf8")).toContain("_shared/contribuicoes/carregar");
    expect(readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8")).toContain("_shared/contribuicoes/carregar.ts");
  });
});
