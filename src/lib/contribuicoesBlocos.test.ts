// ─── Os blocos do relatório de contribuições (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Ela pediu escolher o que mostrar. Aqui se prova: o registro e os três modelos; que a validação do servidor só aceita blocos AGREGADOS (nada nominal entra por e-mail); que o e-mail monta só o que foi
// escolhido; que a "saúde da base" leva só quantidades (adesão, nunca contribuíram, há mais de 30/60/90/180 dias) e nenhum nome; e que a função usa tudo isso sem expor a lista.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BLOCOS_DE_CONTRIBUICOES, IDS_AGREGADOS, IDS_DOS_BLOCOS, IDS_NOMINAIS, MODELOS_DE_RELATORIO, blocosDoModelo, modeloDaSelecao, temBlocoNominal, validarBlocos,
} from "../../supabase/functions/_shared/contribuicoes/blocos";
import { analisarContribuicoes, analisarSemContribuicao, resumirBase, resumirPessoas, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";
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
    expect(base).toMatchObject({
      base: 6, contribuiram: 1, naoContribuiram: 5, adesaoPct: 16.67, nuncaDesdeOPiso: 2, jaContribuiuAntes: 3,
      haMaisDe: { dias30: 3, dias60: 3, dias90: 3, dias180: 1 },   // b 102, d 133, c 182 → todos > 90; só c > 180
      menoresFora: 0,
    });
    expect(JSON.stringify(base)).not.toMatch(/NOME-SECRETO|"lista"/);
  });
  it("o e-mail mostra adesão, não contribuíram e as faixas, sem nenhum nome", () => {
    const a = analisarContribuicoes(linhas, periodo);
    const e = montarEmailDeContribuicoes(a, { blocos: ["saude_da_base", "nao_contribuiram"], base });
    for (const t of ["Saúde da base contribuinte", "Saúde da contribuição", "Saúde do dízimo", "Base ativa", "Adesão à contribuição", "Adesão ao dízimo", "16,7%", "Sem contribuição registrada", "Não contribuíram no período", "há mais de 30 dias: 3", "180 dias: 1", "Sem contribuição no período e sem registro anterior: 2"]) expect(e.html).toContain(t);
    expect(e.html).not.toContain("01/01/2026");   // nunca uma data fixa: só o período escolhido
    expect(e.html).not.toMatch(/NOME-SECRETO/);
    expect(e.texto).toContain("Sem contribuição há mais de 30 / 60 / 90 / 180 dias: 3 / 3 / 3 / 1");
    expect(e.texto).not.toMatch(/NOME-SECRETO/);
  });
  it("aparece mesmo sem arrecadação no período: 'ninguém contribuiu' também é informação", () => {
    const vazio = analisarContribuicoes([], periodo);
    const e = montarEmailDeContribuicoes(vazio, { blocos: ["saude_da_base"], base: resumirBase(analisarSemContribuicao([], pessoas, periodo, { considerar: "qualquer", incluirMenores: false })) });
    expect(e.html).toContain("Saúde da base contribuinte");
    expect(e.html).toContain("Adesão à contribuição");
    expect(e.html).toContain("Adesão ao dízimo");
  });
});

describe("a Edge Function usa os blocos sem expor a lista", () => {
  const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
  it("valida os blocos pelo pedido, calcula a base só quando o bloco é pedido e entrega ao e-mail apenas o resumo", () => {
    expect(fn).toContain("validarPedido(corpo, hoje");
    expect(fn).toContain('pedido.blocos.includes("saude_da_base")');
    expect(fn).toContain("resumirBase(semContribuicaoAnalisada)");
    expect(fn).toMatch(/montarEmailDeContribuicoes\(analise, \{ igreja, aviso, blocos: pedido\.blocos, base: resumoDaBase, nominal, cabecalho, tendencia, ordenacao: pedido\.ordenacao, baseAnalisada: pedido\.base, assunto: pedido\.textos\?\.assunto, abertura: pedido\.textos\?\.abertura, encerramento: pedido\.textos\?\.encerramento \}\)/);
    expect(fn).not.toMatch(/\.lista\b/);   // a lista nominal (propriedade `lista` da análise) nunca é lida pela função
  });
  it("registra no histórico quais blocos foram", () => {
    expect(fn).toMatch(/parametros: \{ ini: pedido\.periodo\.ini, fim: pedido\.periodo\.fim, blocos: pedido\.blocos/);
  });
});

// ─── As duas saúdes e os dois "novos" (decisão dela, 27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Antes: "adesão" contava qualquer contribuição e "novos dizimistas" contava qualquer contribuinte novo (41 contra 21 no dado real). Agora: saúde da contribuição × saúde do dízimo, com a quebra por vínculo;
// novos contribuintes (1ª contribuição de qualquer tipo) × novos dizimistas (1º DÍZIMO, mesmo que já tivesse ofertas).
describe("saúde da contribuição × saúde do dízimo", () => {
  const P = (id: string, tipo_pessoa: string): PessoaDaBase => ({ id, nome: `P-${id}`, tipo_pessoa, status: "ativo", data_nascimento: "1980-01-01", familia_id: null });
  const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
  const L = (pessoa_id: string, data: string, categoria: string): LinhaDeContribuicao => ({ pessoa_id, data, valor: 10, categoria });
  const pessoas = [P("m1", "membro"), P("m2", "membro"), P("m3", "membro"), P("c1", "congregado"), P("c2", "congregado"), P("v1", "visitante")];
  const linhas = [L("m1", "2026-08-10", "Dizimos"), L("m2", "2026-08-12", "Ofertas"), L("c1", "2026-09-01", "Dizimos"), L("v1", "2026-09-05", "Ofertas para Missões")];
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true, vinculos: ["membro", "congregado", "visitante"] });

  it("a adesão à contribuição conta qualquer tipo; a adesão ao dízimo, só dízimo — mesma base", () => {
    expect(sem.saude.contribuicao).toMatchObject({ base: 6, contribuiram: 4, adesaoPct: 66.67 });
    expect(sem.saude.dizimo).toMatchObject({ base: 6, contribuiram: 2, adesaoPct: 33.33 });
  });
  it("a quebra por vínculo: membros, congregados e visitantes (cada um contra a própria base)", () => {
    expect(sem.saude.contribuicao.porVinculo).toEqual({ membro: { base: 3, contribuiram: 2, adesaoPct: 66.67 }, congregado: { base: 2, contribuiram: 1, adesaoPct: 50 }, visitante: { base: 1, contribuiram: 1, adesaoPct: 100 } });
    expect(sem.saude.dizimo.porVinculo).toEqual({ membro: { base: 3, contribuiram: 1, adesaoPct: 33.33 }, congregado: { base: 2, contribuiram: 1, adesaoPct: 50 }, visitante: { base: 1, contribuiram: 0, adesaoPct: 0 } });
  });
  it("só os vínculos da base escolhida aparecem na quebra", () => {
    const so = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true, vinculos: ["membro"] });
    expect(Object.keys(so.saude.dizimo.porVinculo)).toEqual(["membro"]);
  });
  it("a opção 'considerar' da lista não muda as duas saúdes", () => {
    const soDizimo = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "dizimo", incluirMenores: true, vinculos: ["membro", "congregado", "visitante"] });
    expect(soDizimo.saude).toEqual(sem.saude);
  });
  it("o resumo do e-mail leva as duas saúdes (números, sem nomes) e o e-mail mostra cada uma com a quebra por vínculo", () => {
    const base = resumirBase(sem);
    expect(base.saude).toEqual(sem.saude);
    const e = montarEmailDeContribuicoes(analisarContribuicoes(linhas, periodo), { blocos: ["saude_da_base"], base, baseAnalisada: "membros_congregados_visitantes" });
    for (const t of ["Saúde da contribuição", "Saúde do dízimo", "Adesão à contribuição", "66,7%", "Adesão ao dízimo", "33,3%", "Membros: 2 de 3", "Congregados: 1 de 2", "Visitantes: 0 de 1"]) expect(e.html).toContain(t);
    expect(e.texto).toContain("Adesão ao dízimo: 33,3%");
    expect(e.html).not.toMatch(/P-m1|P-c1/);
  });
});

describe("novos contribuintes × novos dizimistas", () => {
  const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
  const L = (pessoa_id: string, data: string, categoria: string): LinhaDeContribuicao => ({ pessoa_id, data, valor: 10, categoria });
  const linhas = [
    L("m1", "2026-02-10", "Dizimos"), L("m1", "2026-08-10", "Dizimos"),                    // já dizimava: não é novo de nenhum tipo
    L("c1", "2026-08-15", "Dizimos"),                                                       // primeira contribuição E primeiro dízimo
    L("m4", "2026-03-01", "Ofertas"), L("m4", "2026-09-01", "Dizimos"),                    // já ofertava; o 1º dízimo é agora: novo DIZIMISTA, não novo contribuinte
    L("m2", "2026-08-01", "Ofertas"),                                                       // novo contribuinte, mas não dizimista
  ];
  const a = analisarContribuicoes(linhas, periodo);
  it("novos contribuintes = 1ª contribuição de qualquer tipo; novos dizimistas = 1º dízimo (mesmo que já tivesse ofertas)", () => {
    expect(a.novos).toBe(2);             // c1 e m2
    expect(a.novosDizimistas).toBe(2);   // c1 e m4
  });
  it("por pessoa: m4 é novo dizimista e não novo contribuinte; m2 é o contrário", () => {
    const por = Object.fromEntries(resumirPessoas(linhas, periodo).map(r => [r.pessoaId, r]));
    expect(por.m4).toMatchObject({ nova: false, novaDizimista: true });
    expect(por.m2).toMatchObject({ nova: true, novaDizimista: false });
    expect(por.m1).toMatchObject({ nova: false, novaDizimista: false });
    expect(por.c1).toMatchObject({ nova: true, novaDizimista: true });
  });
  it("período que começa no piso: sem histórico, os dois são nulos", () => {
    const b = analisarContribuicoes(linhas, { ini: "2026-01-01", fim: "2026-09-30" });
    expect(b.novos).toBeNull();
    expect(b.novosDizimistas).toBeNull();
  });
  it("quem só deu oferta, mesmo sendo novo, NÃO aparece como 'Novo dizimista' na lista com nomes (é 'Só ofertas')", () => {
    const nomes = new Map([["m1", "M1"], ["c1", "C1"], ["m4", "M4"], ["m2", "M2"]]);
    const sem = analisarSemContribuicao(linhas, [], periodo, { considerar: "qualquer", incluirMenores: true });
    const por = Object.fromEntries(listasNominaisDoEmail(linhas, periodo, nomes, sem).contribuiram.map(l => [l.nome, l.perfil]));
    expect(por.M2).toBe("Só ofertas");
    expect(por.C1).toBe("Novo dizimista");
    expect(por.M4).toBe("Novo dizimista");
  });
  it("o resumo executivo e o e-mail citam os dois, com rótulos próprios", () => {
    const e = montarEmailDeContribuicoes(a, { blocos: ["resumo", "indicadores"] });
    expect(e.resumo).toContain("começaram a dizimar");
    for (const t of ["Novos contribuintes", "Novos dizimistas"]) expect(e.html).toContain(t);
    expect(e.texto).toContain("Novos dizimistas: 2");
  });
});
