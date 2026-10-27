// ─── Editar o e-mail antes de enviar (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "quero poder editar o e-mail antes de enviar". O que pode ser editado é o TEXTO: o assunto, uma mensagem de abertura e uma de encerramento. Os números e as listas continuam saindo só do
// cálculo do banco (a função nunca aceita um número da chamada). Aqui: a validação, o escape (texto puro), o lugar de cada texto no HTML e no texto simples, e a chave de "mesmo envio".
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarContribuicoes } from "../../supabase/functions/_shared/contribuicoes/analise";
import { montarEmailDeContribuicoes, textosParaInterpretar } from "../../supabase/functions/_shared/contribuicoes/email";
import { LIMITE_DO_ASSUNTO, LIMITE_DO_TEXTO, chaveDoEnvio, validarPedido, type PedidoValidado } from "../../supabase/functions/_shared/contribuicoes/pedido";

const hoje = "2026-10-27";
const base = { periodo: { ini: "2026-07-01", fim: "2026-09-30" } };
const ok = (extra: Record<string, unknown>) => { const r = validarPedido({ ...base, ...extra }, hoje, false); if (!r.ok) throw new Error((r as { ok: false; erro: string }).erro); return (r as { ok: true; pedido: PedidoValidado }).pedido; };
const erro = (extra: Record<string, unknown>) => { const r = validarPedido({ ...base, ...extra }, hoje, false); return r.ok ? null : (r as { ok: false; erro: string }).erro; };

describe("validação dos textos editáveis", () => {
  it("sem texto nenhum: nada muda (textos vazio)", () => {
    expect(ok({}).textos).toEqual({});
    expect(ok({ assunto: "", abertura: "   ", encerramento: null }).textos).toEqual({});
  });
  it("guarda o que foi escrito, sem espaços nas pontas", () => {
    expect(ok({ assunto: "  Relatório do trimestre  ", abertura: "  Pastor, segue.  ", encerramento: "Abraço." }).textos).toEqual({ assunto: "Relatório do trimestre", abertura: "Pastor, segue.", encerramento: "Abraço." });
  });
  it("o assunto é uma linha só (quebras viram espaço); a mensagem mantém os parágrafos, sem excesso de linhas em branco", () => {
    expect(ok({ assunto: "Linha 1\nLinha 2\r\nLinha 3" }).textos.assunto).toBe("Linha 1 Linha 2 Linha 3");
    expect(ok({ abertura: "A\n\n\n\n\nB" }).textos.abertura).toBe("A\n\nB");
  });
  it("caracteres de controle somem", () => {
    expect(ok({ abertura: "oi\u0000\u0007 tudo bem\u007F" }).textos.abertura).toBe("oi tudo bem");
  });
  it("respeita os limites: assunto e mensagens longas demais são recusados com mensagem clara", () => {
    expect(erro({ assunto: "a".repeat(LIMITE_DO_ASSUNTO + 1) })).toContain("O assunto passa de");
    expect(erro({ abertura: "a".repeat(LIMITE_DO_TEXTO + 1) })).toContain("A mensagem de abertura passa de");
    expect(erro({ encerramento: "a".repeat(LIMITE_DO_TEXTO + 1) })).toContain("A mensagem de encerramento passa de");
    expect(erro({ assunto: "a".repeat(LIMITE_DO_ASSUNTO) })).toBeNull();
  });
  it("só aceita texto (número, lista ou objeto na chamada é recusado)", () => {
    expect(erro({ assunto: 123 })).toContain("não é um texto válido");
    expect(erro({ abertura: ["x"] })).toContain("não é um texto válido");
    expect(erro({ encerramento: { a: 1 } })).toContain("não é um texto válido");
  });
});

describe("a chave do 'mesmo envio' considera o texto", () => {
  const p = (textos?: PedidoValidado["textos"]): PedidoValidado => ({ ...ok({}), destinatarios: ["a@x.com"], textos });
  it("sem texto, a chave é a de sempre (os envios anteriores continuam reconhecidos)", () => {
    expect(chaveDoEnvio(p())).toBe(chaveDoEnvio(p({})));
    expect(chaveDoEnvio(p())).not.toContain("|t");
  });
  it("texto diferente = envio diferente (corrigir uma frase e reenviar não é bloqueado como clique duplo); o mesmo texto = o mesmo envio", () => {
    expect(chaveDoEnvio(p({ abertura: "Oi" }))).not.toBe(chaveDoEnvio(p()));
    expect(chaveDoEnvio(p({ abertura: "Oi" }))).not.toBe(chaveDoEnvio(p({ abertura: "Olá" })));
    expect(chaveDoEnvio(p({ abertura: "Oi" }))).toBe(chaveDoEnvio(p({ abertura: "Oi" })));
  });
});

describe("o e-mail com o texto editado", () => {
  const a = analisarContribuicoes([{ pessoa_id: "p1", data: "2026-08-10", valor: 100, categoria: "Dizimos" }], { ini: "2026-07-01", fim: "2026-09-30" });
  const montar = (o: Parameters<typeof montarEmailDeContribuicoes>[1] = {}) => montarEmailDeContribuicoes(a, { blocos: ["resumo", "indicadores"], ...o });
  it("sem texto, sai igual ao de antes (assunto padrão, nenhuma mensagem)", () => {
    const e = montar();
    expect(e.assunto).toBe("Relatório de contribuições — 01/07/2026 a 30/09/2026");
    expect(e.html).toBe(montar({ abertura: undefined, encerramento: undefined, assunto: undefined }).html);
  });
  it("o assunto editado substitui o padrão", () => {
    expect(montar({ assunto: "Contribuições do 3º trimestre" }).assunto).toBe("Contribuições do 3º trimestre");
    expect(montar({ assunto: "   " }).assunto).toBe("Relatório de contribuições — 01/07/2026 a 30/09/2026");
  });
  it("a abertura vem ANTES dos números; o encerramento, DEPOIS deles e antes do aviso de confidencialidade", () => {
    const h = montar({ abertura: "MENSAGEM-ABERTURA", encerramento: "MENSAGEM-FIM" }).html;
    const [ia, ir, ie, ic] = [h.indexOf("MENSAGEM-ABERTURA"), h.indexOf("Em números"), h.indexOf("MENSAGEM-FIM"), h.indexOf("apenas números agregados")];
    expect(ia).toBeGreaterThan(-1);
    expect(ia).toBeLessThan(ir);
    expect(ir).toBeLessThan(ie);
    expect(ie).toBeLessThan(ic);
  });
  it("é TEXTO PURO: HTML digitado vira texto, nunca marcação (sem injeção)", () => {
    const h = montar({ abertura: '<script>alert(1)</script><img src=x onerror=alert(2)>', encerramento: '<a href="http://mau.com">clique</a>', assunto: "<b>x</b>" }).html;
    expect(h).not.toContain("<script>alert");
    expect(h).not.toContain("<img src=x");
    expect(h).not.toContain('<a href="http://mau.com">');
    expect(h).toContain("&lt;script&gt;");
  });
  it("quebras de linha da mensagem viram quebras no e-mail", () => {
    expect(montar({ abertura: "linha 1\nlinha 2" }).html).toContain("linha 1<br>linha 2");
  });
  it("a versão em texto leva abertura e encerramento também", () => {
    const t = montar({ abertura: "MENSAGEM-ABERTURA", encerramento: "MENSAGEM-FIM" }).texto;
    expect(t.indexOf("MENSAGEM-ABERTURA")).toBeGreaterThan(-1);
    expect(t.indexOf("MENSAGEM-ABERTURA")).toBeLessThan(t.indexOf("Dizimistas:"));
    expect(t.indexOf("MENSAGEM-FIM")).toBeGreaterThan(t.indexOf("Dizimistas:"));
  });
  it("editar o texto NUNCA altera um número: o resumo e os indicadores são os mesmos", () => {
    const sem = montar();
    const com = montar({ abertura: "Pastor, segue.", encerramento: "Abraço.", assunto: "Outro assunto" });
    expect(com.resumo).toBe(sem.resumo);
    for (const n of ["Dizimistas", "Doadores", "Arrecadado"]) expect(com.html).toContain(n);
    expect(com.texto).toMatch(/Arrecadado: R\$\s100,00/);
  });
});

describe("a Edge Function passa os textos validados ao e-mail e registra que houve texto próprio (sem guardar o texto)", () => {
  const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
  it("monta o e-mail com assunto, abertura e encerramento do pedido validado", () => {
    expect(fn).toContain("assunto: pedido.textos?.assunto");
    expect(fn).toContain("abertura: pedido.textos?.abertura");
    expect(fn).toContain("encerramento: pedido.textos?.encerramento");
  });
  it("no histórico fica só a marca 'texto_personalizado'", () => {
    expect(fn).toContain("texto_personalizado:");
  });
});

// ─── "Sem dízimos", não "sem contribuições" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Ao validar a lista com os extratos, ela viu que o relatório dizia "Sem contribuições no período analisado" para gente que SÓ deu oferta: o filtro era só Dízimos (26 das 139 deram oferta ou missões).
// O texto passou a dizer o que falta, conforme as categorias escolhidas.
import { oQueFaltaAQuemNaoContribuiu, analisarSemContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";

describe("o que falta a quem 'não contribuiu' diz as categorias escolhidas", () => {
  it("as três categorias = 'contribuições'; só dízimo = 'dízimos'; dízimo e oferta = 'dízimos e ofertas'", () => {
    expect(oQueFaltaAQuemNaoContribuiu(["dizimo", "oferta", "missoes"])).toBe("contribuições");
    expect(oQueFaltaAQuemNaoContribuiu(undefined)).toBe("contribuições");
    expect(oQueFaltaAQuemNaoContribuiu(["dizimo"])).toBe("dízimos");
    expect(oQueFaltaAQuemNaoContribuiu(["dizimo", "oferta"])).toBe("dízimos e ofertas");
  });
  const pessoas: PessoaDaBase[] = ["a", "b"].map(id => ({ id, nome: "Pessoa " + id, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null }));
  const periodo = { ini: "2026-04-19", fim: "2026-10-19" };
  const sem = analisarSemContribuicao([], pessoas, periodo, { considerar: "dizimo", incluirMenores: true });
  const nomes = new Map<string, string>();
  it("a lista com só dízimo escolhido diz 'Sem dízimos no período analisado' (e não 'contribuições')", () => {
    const l = listasNominaisDoEmail([], periodo, nomes, sem, "quantidade", "dízimos");
    expect(l.semContribuicao.length).toBe(2);
    for (const x of l.semContribuicao) { expect(x.perfil).toContain("Sem dízimos no período analisado"); expect(x.perfil).not.toContain("contribuições"); }
  });
  it("sem o parâmetro (as três categorias), o texto é o de sempre", () => {
    expect(listasNominaisDoEmail([], periodo, nomes, sem).semContribuicao[0].perfil).toContain("Sem contribuições no período analisado");
  });
  it("o 'Como interpretar' acompanha: o título e a explicação dizem 'dízimos' e avisam que pode ter contribuído de outra forma", () => {
    const a = analisarContribuicoes([{ pessoa_id: "p", data: "2026-08-10", valor: 1, categoria: "Dizimos" }], periodo);
    const t = Object.fromEntries(textosParaInterpretar(a, "membros", "dízimos").map(x => [x.titulo, x.texto]));
    expect(t["Sem dízimos no período analisado"]).toContain("sem dízimos entre");
    expect(t["Sem dízimos no período analisado"]).toContain("Pode ter contribuído de outra forma");
    expect(textosParaInterpretar(a, "membros").map(x => x.titulo)).toContain("Sem contribuições no período analisado");
  });
  it("o e-mail com só dízimo escolhido leva o texto novo nas duas listas e na definição", () => {
    const nomes2 = new Map([["p", "Fulana"]]);
    const linhas = [{ pessoa_id: "p", data: "2026-08-10", valor: 1, categoria: "Ofertas" }];
    const sem2 = analisarSemContribuicao(linhas.filter(l => l.categoria === "Dizimos"), pessoas, periodo, { considerar: "dizimo", incluirMenores: true });
    const a = analisarContribuicoes([], periodo);
    const e = montarEmailDeContribuicoes(a, { blocos: ["sem_contribuicao_nominal"], nominal: listasNominaisDoEmail([], periodo, nomes2, sem2, "quantidade", "dízimos"), baseAnalisada: "membros", categorias: ["dizimo"] });
    expect(e.html).toContain("Sem dízimos no período analisado");
    expect(e.html).not.toContain("Sem contribuições no período analisado");
  });
});
