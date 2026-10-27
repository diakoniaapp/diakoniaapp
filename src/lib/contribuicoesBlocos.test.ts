// ─── Os blocos do relatório de contribuições (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Ela pediu escolher o que mostrar. Aqui se prova: o registro e os três modelos; que a validação do servidor só aceita blocos AGREGADOS (nada nominal entra por e-mail); que o e-mail monta só o que foi
// escolhido; que a "saúde da base" leva só quantidades (adesão, nunca contribuíram, há mais de 30/60/90/180 dias) e nenhum nome; e que a função usa tudo isso sem expor a lista.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BLOCOS_DE_CONTRIBUICOES, IDS_AGREGADOS, IDS_DOS_BLOCOS, IDS_NOMINAIS, MODELOS_DE_RELATORIO, blocosDoModelo, modeloDaSelecao, temBlocoNominal, validarBlocos,
} from "../../supabase/functions/_shared/contribuicoes/blocos";
import { analisarContribuicoes, analisarSemContribuicao, resumirBase, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { montarEmailDeContribuicoes } from "../../supabase/functions/_shared/contribuicoes/email";

describe("o registro de blocos e os modelos", () => {
  it("onze blocos agregados e DOIS com nomes; cada modelo só usa blocos que existem; nenhum bloco de valor, telefone ou contato", () => {
    expect(IDS_AGREGADOS).toEqual(["resumo", "indicadores", "categorias", "saude_da_base", "nao_contribuiram", "tendencias", "curva_adesao", "distribuicao_mensal", "destaques", "criterios", "cobertura"]);
    expect(IDS_NOMINAIS).toEqual(["contribuintes_nominal", "sem_contribuicao_nominal"]);
    expect(IDS_DOS_BLOCOS).toEqual([...IDS_AGREGADOS, ...IDS_NOMINAIS]);
    for (const m of MODELOS_DE_RELATORIO) for (const b of m.blocos) expect(IDS_DOS_BLOCOS).toContain(b);
    const titulos = BLOCOS_DE_CONTRIBUICOES.map(b => `${b.titulo} ${b.descricao}`).join(" ");
    expect(titulos).not.toMatch(/telefone|contato|e-mail de |média individual|total contribu/i);
    expect(BLOCOS_DE_CONTRIBUICOES.filter(b => /nome/i.test(b.titulo)).map(b => b.id)).toEqual(IDS_NOMINAIS);
    expect(temBlocoNominal(["resumo"])).toBe(false);
    expect(temBlocoNominal(["resumo", "sem_contribuicao_nominal"])).toBe(true);
  });
  it("NENHUM modelo leva nomes por padrão (decisão dela, 2ª rodada): Pastor = saúde da base, não contribuíram, tendências, gráficos; Tesouraria = todos os agregados", () => {
    expect(blocosDoModelo("pastor")).toEqual(expect.arrayContaining(["saude_da_base", "nao_contribuiram", "tendencias", "curva_adesao"]));
    expect(temBlocoNominal(blocosDoModelo("pastor"))).toBe(false);
    expect(blocosDoModelo("pastor")).not.toContain("categorias");
    expect(blocosDoModelo("diretoria")).toEqual(expect.arrayContaining(["categorias", "tendencias", "distribuicao_mensal"]));
    expect(blocosDoModelo("diretoria")).not.toContain("saude_da_base");
    expect(temBlocoNominal(blocosDoModelo("diretoria"))).toBe(false);
    expect(blocosDoModelo("tesouraria")).toEqual(IDS_AGREGADOS);
  });
  it("modeloDaSelecao reconhece o modelo pela seleção (em qualquer ordem) ou devolve null", () => {
    expect(modeloDaSelecao([...blocosDoModelo("pastor")].reverse())).toBe("pastor");
    expect(modeloDaSelecao(["resumo"])).toBeNull();
  });
});

describe("validarBlocos — só os blocos do registro; nada de valor, telefone ou contato", () => {
  it("ausente = o modelo padrão (Pastor)", () => {
    expect(validarBlocos(undefined)).toEqual({ ok: true, blocos: blocosDoModelo("pastor") });
  });
  it("normaliza: tira repetição e põe na ordem canônica", () => {
    expect(validarBlocos(["cobertura", "resumo", "resumo"])).toEqual({ ok: true, blocos: ["resumo", "cobertura"] });
  });
  it.each([["nomes"], ["lista_nominal"], ["valores_individuais"], ["total_contribuido"], ["telefone"], ["contato"], [42], [null]])("recusa o bloco %p (valor individual, telefone e contato não existem como bloco)", id => {
    const r = validarBlocos(["resumo", id]);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("Bloco não permitido");
  });
  it("aceita os dois blocos com nomes, que são os únicos", () => {
    expect(validarBlocos(["contribuintes_nominal", "sem_contribuicao_nominal"])).toEqual({ ok: true, blocos: IDS_NOMINAIS });
  });
  it("lista vazia e valor que não é lista são recusados", () => {
    expect(validarBlocos([]).ok).toBe(false);
    expect(validarBlocos("indicadores").ok).toBe(false);
  });
});

describe("o e-mail monta só o que foi escolhido", () => {
  const linhas: LinhaDeContribuicao[] = [
    { pessoa_id: "pessoa-secreta-1", data: "2026-03-02", valor: 100, categoria: "Dizimos" },
    { pessoa_id: "pessoa-secreta-2", data: "2026-04-06", valor: 200, categoria: "Ofertas" },
    { pessoa_id: null, data: "2026-03-23", valor: 50, categoria: "Dizimos" },
  ];
  const a = analisarContribuicoes(linhas, { ini: "2026-03-01", fim: "2026-04-30" });
  const html = (blocos: Parameters<typeof montarEmailDeContribuicoes>[1] extends infer O ? (O extends { blocos?: infer B } ? B : never) : never) => montarEmailDeContribuicoes(a, { blocos }).html;

  it("só o bloco 'indicadores': traz os indicadores e nenhum dos outros", () => {
    const h = html(["indicadores"]);
    expect(h).toContain("Em números");
    for (const fora of ["Por categoria", "Curva de adesão", "Distribuição mensal", "Destaques", "Saúde da base contribuinte", "Identificação:"]) expect(h).not.toContain(fora);
  });
  it("cada bloco aparece quando escolhido", () => {
    expect(html(["categorias"])).toContain("Por categoria");
    expect(html(["curva_adesao"])).toContain("Curva de adesão");
    expect(html(["distribuicao_mensal"])).toContain("Distribuição mensal");
    expect(html(["destaques"])).toContain("Semanas de destaque");
    expect(html(["cobertura"])).toContain("sem identificação");
  });
  it("sem o bloco de resumo, o parágrafo executivo não aparece; com ele, aparece", () => {
    expect(html(["indicadores"])).not.toContain("dizimista identificado");
    expect(html(["resumo"])).toContain("dizimista identificado");
  });
  it("sem 'blocos' (compatibilidade) vale todos os AGREGADOS (nomes nunca por omissão), e a saúde da base sem os números dela diz que não pôde ser calculada", () => {
    const h = montarEmailDeContribuicoes(a).html;
    for (const dentro of ["Em números", "Por categoria", "Curva de adesão", "Distribuição mensal"]) expect(h).toContain(dentro);
    expect(h).toContain("não pôde ser calculada");
    expect(h).not.toContain("Contém dados individuais");
  });
  it("nunca leva identificador de pessoa, com qualquer seleção", () => {
    expect(montarEmailDeContribuicoes(a).html).not.toMatch(/pessoa-secreta/);
    expect(montarEmailDeContribuicoes(a, { blocos: ["resumo"] }).texto).not.toMatch(/pessoa-secreta/);
  });
});

describe("Saúde da base contribuinte — só quantidades", () => {
  const P = (id: string, o: Partial<PessoaDaBase> = {}): PessoaDaBase => ({ id, nome: `NOME-SECRETO-${id}`, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null, ...o });
  const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
  const linhas: LinhaDeContribuicao[] = [
    { pessoa_id: "a", data: "2026-08-10", valor: 100, categoria: "Dizimos" },
    { pessoa_id: "b", data: "2026-06-20", valor: 50, categoria: "Dizimos" },   // 102 dias antes do fim
    { pessoa_id: "c", data: "2026-04-01", valor: 50, categoria: "Ofertas" },   // 182 dias
    { pessoa_id: "d", data: "2026-05-20", valor: 50, categoria: "Dizimos" },   // 133 dias
  ];
  const pessoas = [P("a"), P("b"), P("c"), P("d"), P("e"), P("f")];   // e e f nunca contribuíram
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: false });
  const base = resumirBase(sem);
  it("o resumo traz só números: base, contribuíram, não contribuíram, adesão, nunca, antes e 'há mais de 30/60/90/180 dias' (acumulado)", () => {
    expect(base).toEqual({
      base: 6, contribuiram: 1, naoContribuiram: 5, adesaoPct: 16.67, nuncaDesdeOPiso: 2, jaContribuiuAntes: 3,
      haMaisDe: { dias30: 3, dias60: 3, dias90: 3, dias180: 1 },   // b 102, d 133, c 182 → todos > 90; só c > 180
      menoresFora: 0,
    });
    expect(JSON.stringify(base)).not.toMatch(/NOME-SECRETO|"lista"/);
  });
  it("o e-mail mostra adesão, não contribuíram e as faixas, sem nenhum nome", () => {
    const a = analisarContribuicoes(linhas, periodo);
    const e = montarEmailDeContribuicoes(a, { blocos: ["saude_da_base", "nao_contribuiram"], base });
    for (const t of ["Saúde da base contribuinte", "Membros ativos", "Adesão da base", "16,7%", "Sem contribuição registrada", "Não contribuíram no período", "há mais de 30 dias: 3", "180 dias: 1", "Nenhuma contribuição registrada desde 01/01/2026: 2"]) expect(e.html).toContain(t);
    expect(e.html).not.toMatch(/NOME-SECRETO/);
    expect(e.texto).toContain("Sem contribuição há mais de 30 / 60 / 90 / 180 dias: 3 / 3 / 3 / 1");
    expect(e.texto).not.toMatch(/NOME-SECRETO/);
  });
  it("aparece mesmo sem arrecadação no período: 'ninguém contribuiu' também é informação", () => {
    const vazio = analisarContribuicoes([], periodo);
    const e = montarEmailDeContribuicoes(vazio, { blocos: ["saude_da_base"], base: resumirBase(analisarSemContribuicao([], pessoas, periodo, { considerar: "qualquer", incluirMenores: false })) });
    expect(e.html).toContain("Saúde da base contribuinte");
    expect(e.html).toContain("Adesão da base");
  });
});

describe("a Edge Function usa os blocos sem expor a lista", () => {
  const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
  it("valida os blocos pelo pedido, calcula a base só quando o bloco é pedido e entrega ao e-mail apenas o resumo", () => {
    expect(fn).toContain("validarPedido(corpo, hoje");
    expect(fn).toContain('pedido.blocos.includes("saude_da_base")');
    expect(fn).toContain("resumirBase(semContribuicaoAnalisada)");
    expect(fn).toMatch(/montarEmailDeContribuicoes\(analise, \{ igreja, aviso, blocos: pedido\.blocos, base: resumoDaBase, nominal, cabecalho, tendencia, ordenacao: pedido\.ordenacao \}\)/);
    expect(fn).not.toMatch(/\.lista\b/);   // a lista nominal (propriedade `lista` da análise) nunca é lida pela função
  });
  it("registra no histórico quais blocos foram", () => {
    expect(fn).toMatch(/parametros: \{ ini: pedido\.periodo\.ini, fim: pedido\.periodo\.fim, blocos: pedido\.blocos/);
  });
});
