// ─── Filtros globais, tendências e cabeçalho de rastreabilidade (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisões dela: a BASE analisada (membros / membros e congregados / + visitantes ativos) e as CONTRIBUIÇÕES consideradas (cumulativas) valem para todos os indicadores; quem contribuiu fora da base aparece
// à parte; todo relatório declara período, base, contribuições, pessoas consideradas, quando e por quem foi gerado e a versão dos critérios; o padrão de todo modelo é só agregado.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CATEGORIAS_DE_CONTRIBUICAO, FILTROS_PADRAO, VERSAO_DOS_CRITERIOS, aplicarFiltros, analisarContribuicoes, analisarSemContribuicao, analisarTendencia, idsDaBase,
  linhasDoCabecalho, rotuloDasCategorias, type LinhaDeContribuicao, type PessoaDaBase,
} from "../../supabase/functions/_shared/contribuicoes/analise";
import { montarEmailDeContribuicoes } from "../../supabase/functions/_shared/contribuicoes/email";
import { validarPedido } from "../../supabase/functions/_shared/contribuicoes/pedido";

const L = (p: string | null, data: string, valor: number, categoria = "Dizimos"): LinhaDeContribuicao => ({ pessoa_id: p, data, valor, categoria });
const P = (id: string, tipo: string, o: Partial<PessoaDaBase> = {}): PessoaDaBase => ({ id, nome: `N-${id}`, tipo_pessoa: tipo, status: "ativo", data_nascimento: "1980-01-01", familia_id: null, ...o });
const periodo = { ini: "2026-07-01", fim: "2026-09-30" };

describe("as categorias consideradas (cumulativas)", () => {
  const linhas = [L("a", "2026-08-01", 100, "Dizimos"), L("b", "2026-08-02", 50, "Ofertas"), L("c", "2026-08-03", 30, "Ofertas para Missões")];
  it("padrão = as três; escolher só dízimos tira ofertas e missões de TODOS os indicadores", () => {
    expect(FILTROS_PADRAO.categorias).toEqual(["dizimo", "oferta", "missoes"]);
    const so = aplicarFiltros(linhas, { base: "membros_congregados", categorias: ["dizimo"] }, null, periodo).linhas;
    expect(so.map(l => l.pessoa_id)).toEqual(["a"]);
    expect(analisarContribuicoes(so, periodo).arrecadado).toBe(100);
  });
  it("dízimos + missões somam as duas e deixam as ofertas de fora", () => {
    const f = aplicarFiltros(linhas, { base: "membros_congregados", categorias: ["dizimo", "missoes"] }, null, periodo).linhas;
    expect(analisarContribuicoes(f, periodo).arrecadado).toBe(130);
  });
  it("o texto das categorias: um, dois e três", () => {
    expect(rotuloDasCategorias(["dizimo"])).toBe("Dízimos");
    expect(rotuloDasCategorias(["dizimo", "oferta"])).toBe("Dízimos e Ofertas");
    expect(rotuloDasCategorias(["dizimo", "oferta", "missoes"])).toBe("Dízimos, Ofertas e Ofertas para Missões");
    expect(CATEGORIAS_DE_CONTRIBUICAO.map(c => c.rotulo)).toEqual(["Dízimos", "Ofertas", "Ofertas para Missões"]);
  });
});

describe("a base analisada", () => {
  const pessoas = [P("m1", "membro"), P("c1", "congregado"), P("v1", "visitante"), P("x1", "membro", { status: "inativo" }), P("k1", "membro", { data_nascimento: "2015-01-01" })];
  it("quem está em cada base: só ATIVOS do vínculo (menor de 18 incluído, porque quem contribuiu não é 'de fora')", () => {
    expect([...idsDaBase(pessoas, "membros")].sort()).toEqual(["k1", "m1"]);
    expect([...idsDaBase(pessoas, "membros_congregados")].sort()).toEqual(["c1", "k1", "m1"]);
    expect([...idsDaBase(pessoas, "membros_congregados_visitantes")].sort()).toEqual(["c1", "k1", "m1", "v1"]);
  });
  const linhas = [L("m1", "2026-08-01", 100), L("c1", "2026-08-02", 50), L("v1", "2026-08-03", 20), L("x1", "2026-08-04", 10), L(null, "2026-08-05", 5)];
  it("quem contribuiu fora da base NÃO entra nos indicadores e aparece à parte (pessoas e valor)", () => {
    const r = aplicarFiltros(linhas, { base: "membros", categorias: ["dizimo"] }, idsDaBase(pessoas, "membros"), periodo);
    expect(r.linhas.map(l => l.pessoa_id)).toEqual(["m1", null]);   // o sem identificação continua (é a cobertura)
    expect(r.foraDaBase).toEqual({ pessoas: 3, valor: 80 });          // c1, v1, x1
    const a = analisarContribuicoes(r.linhas, periodo);
    expect(a.doadores).toBe(1);
    expect(a.cobertura.entradasSemPessoa).toBe(1);
  });
  it("incluir visitantes ativos os traz para dentro; o inativo continua fora", () => {
    const r = aplicarFiltros(linhas, { base: "membros_congregados_visitantes", categorias: ["dizimo"] }, idsDaBase(pessoas, "membros_congregados_visitantes"), periodo);
    expect(r.foraDaBase).toEqual({ pessoas: 1, valor: 10 });   // só x1 (inativo)
    expect(analisarContribuicoes(r.linhas, periodo).doadores).toBe(3);
  });
  it("só conta fora da base quem contribuiu DENTRO do período", () => {
    const r = aplicarFiltros([L("x1", "2026-01-15", 99)], { base: "membros", categorias: ["dizimo"] }, idsDaBase(pessoas, "membros"), periodo);
    expect(r.foraDaBase).toEqual({ pessoas: 0, valor: 0 });
  });
  it("'sem contribuição' respeita o vínculo escolhido: visitantes só entram quando a base os inclui", () => {
    const sem = (vinculos?: ("membro" | "congregado" | "visitante")[]) => analisarSemContribuicao([], pessoas, periodo, { considerar: "qualquer", incluirMenores: true, vinculos }).lista.map(p => p.id).sort();
    expect(sem()).toEqual(["c1", "k1", "m1"]);   // padrão de sempre: membros e congregados ativos
    expect(sem(["membro"])).toEqual(["k1", "m1"]);
    expect(sem(["membro", "congregado", "visitante"])).toEqual(["c1", "k1", "m1", "v1"]);
  });
});

describe("tendências", () => {
  const semana = (ini: string, valor: number) => L("p", ini, valor);
  it("com um período anterior que cabe depois do piso: compara com ele (variação % e os dois valores)", () => {
    const linhas = [L("a", "2026-04-10", 100), L("b", "2026-05-10", 100), L("a", "2026-07-10", 150), L("b", "2026-08-10", 150), L("c", "2026-09-10", 100)];
    const t = analisarTendencia(linhas, { ini: "2026-07-01", fim: "2026-09-30" })!;
    expect(t.modo).toBe("periodo_anterior");
    expect(t.anterior).toEqual({ ini: "2026-03-31", fim: "2026-06-30" });   // 92 dias antes do início: a mesma duração
    expect(t.arrecadado).toEqual({ atual: 400, anterior: 200, variacaoPct: 100 });
    expect(t.contribuintes).toEqual({ atual: 3, anterior: 2, variacaoPct: 50 });
  });
  it("quando o período anterior começaria ANTES do piso: usa a direção da própria série e não finge comparar", () => {
    const linhas = Array.from({ length: 12 }, (_, i) => semana(`2026-0${i < 4 ? 1 : i < 8 ? 2 : 3}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, i < 6 ? 100 : 200));
    const t = analisarTendencia(linhas, { ini: "2026-01-01", fim: "2026-03-31" })!;
    expect(t.modo).toBe("serie");
    expect(t.direcao).toBe("alta");
    expect((t.variacaoPct ?? 0)).toBeGreaterThan(5);
  });
  it("série plana é 'estável'; série curta ou vazia não diz nada", () => {
    const plana = Array.from({ length: 8 }, (_, i) => semana(`2026-0${1 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, "0")}`, 100));
    expect(analisarTendencia(plana, { ini: "2026-01-01", fim: "2026-02-22" })!.direcao).toBe("estavel");
    expect(analisarTendencia([], { ini: "2026-01-01", fim: "2026-02-28" })).toBeNull();
    expect(analisarTendencia([semana("2026-01-05", 10)], { ini: "2026-01-01", fim: "2026-01-14" })).toBeNull();
  });
});

describe("o cabeçalho de rastreabilidade", () => {
  const c = { periodo: { ini: "2026-04-28", fim: "2026-10-27" }, base: "membros_congregados" as const, categorias: ["dizimo" as const, "oferta" as const], pessoasNaBase: 257, contribuiram: 124, foraDaBase: 4, geradoEm: "2026-10-27T12:15:00Z", geradoPor: "Telma Souza", versao: VERSAO_DOS_CRITERIOS };
  const linhas = linhasDoCabecalho(c, "27/10/2026 09:15");
  it("declara período, base, contribuições, pessoas consideradas, quando e por quem foi gerado e a versão dos critérios", () => {
    expect(linhas.map(l => l.rotulo)).toEqual(["Período analisado", "Base analisada", "Contribuições consideradas", "Pessoas consideradas", "Gerado em", "Versão dos critérios"]);
    const d = Object.fromEntries(linhas.map(l => [l.rotulo, l.valor]));
    expect(d["Período analisado"]).toContain("28/04/2026 a 27/10/2026");
    expect(d["Base analisada"]).toBe("Membros e congregados (ativos)");
    expect(d["Contribuições consideradas"]).toBe("Dízimos e Ofertas");
    expect(d["Pessoas consideradas"]).toBe("257 na base, 124 contribuíram; contribuintes fora da base: 4");
    expect(d["Gerado em"]).toBe("27/10/2026 09:15 por Telma Souza");
    expect(d["Versão dos critérios"]).toBe(VERSAO_DOS_CRITERIOS);
  });
  it("sem o nome de quem gerou, não inventa um", () => {
    expect(linhasDoCabecalho({ ...c, geradoPor: null }, "27/10/2026 09:15").find(l => l.rotulo === "Gerado em")!.valor).toBe("27/10/2026 09:15");
  });
  it("o e-mail traz o cabeçalho no topo (em vez do parágrafo solto de período) e o bloco de critérios quando escolhido", () => {
    const a = analisarContribuicoes([L("a", "2026-08-01", 100)], { ini: "2026-07-01", fim: "2026-09-30" });
    const e = montarEmailDeContribuicoes(a, { blocos: ["criterios"], cabecalho: linhas });
    for (const t of ["Este relatório", "Base analisada", "Membros e congregados (ativos)", "Dízimos e Ofertas", "Gerado em", "Telma Souza", "Versão dos critérios", "Critérios da análise", "não na vida"]) expect(e.html).toContain(t);
    expect(e.texto).toContain("Gerado em: 27/10/2026 09:15 por Telma Souza");
  });
  it("o bloco Tendências do e-mail diz de onde vem a comparação", () => {
    const a = analisarContribuicoes([L("a", "2026-08-01", 100)], periodo);
    const anterior = { modo: "periodo_anterior" as const, anterior: { ini: "2026-04-01", fim: "2026-06-30" }, arrecadado: { atual: 400, anterior: 200, variacaoPct: 100 }, contribuintes: { atual: 3, anterior: 2, variacaoPct: 50 }, dizimistas: { atual: 2, anterior: 2, variacaoPct: 0 } };
    expect(montarEmailDeContribuicoes(a, { blocos: ["tendencias"], tendencia: anterior }).html).toContain("período anterior de mesma duração (01/04/2026 a 30/06/2026)");
    expect(montarEmailDeContribuicoes(a, { blocos: ["tendencias"], tendencia: { modo: "serie", direcao: "queda", variacaoPct: -12 } }).html).toContain("Arrecadação em queda");
    expect(montarEmailDeContribuicoes(a, { blocos: ["tendencias"], tendencia: null }).html).toContain("Não há dados suficientes");
  });
});

describe("validarPedido — base e categorias vêm de lista permitida", () => {
  const hoje = "2026-10-27";
  const periodoOk = { ini: "2026-03-01", fim: "2026-03-31" };
  it("ausentes: o padrão (membros e congregados; as três categorias)", () => {
    const r = validarPedido({ periodo: periodoOk }, hoje, false);
    expect(r.ok && r.pedido.base).toBe("membros_congregados");
    expect(r.ok && r.pedido.categorias).toEqual(["dizimo", "oferta", "missoes"]);
  });
  it("aceita a base e as categorias escolhidas, na ordem canônica e sem repetição", () => {
    const r = validarPedido({ periodo: periodoOk, base: "membros", categorias: ["missoes", "dizimo", "dizimo"] }, hoje, false);
    expect(r.ok && r.pedido.base).toBe("membros");
    expect(r.ok && r.pedido.categorias).toEqual(["dizimo", "missoes"]);
  });
  it.each([["todos"], ["admin"], [1]])("recusa a base %p", base => { expect(validarPedido({ periodo: periodoOk, base }, hoje, false).ok).toBe(false); });
  it.each([[["rendimentos"]], [[]], ["dizimo"], [["dizimo", "salario"]]])("recusa as categorias %p", categorias => { expect(validarPedido({ periodo: periodoOk, categorias }, hoje, false).ok).toBe(false); });
});

describe("a função aplica os filtros e carimba o cabeçalho", () => {
  const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
  it("filtra pela base e pelas categorias antes de calcular, e calcula a base de pessoas sempre", () => {
    expect(fn).toContain("aplicarFiltros(todasAsLinhas, { base: pedido.base, categorias: pedido.categorias }, idsDaBase(pessoasDaBase, pedido.base), pedido.periodo)");
    expect(fn).toContain("vinculos: VINCULOS_DA_BASE[pedido.base]");
  });
  it("o cabeçalho leva a hora de Brasília, quem gerou e a versão dos critérios; o histórico guarda base, categorias e versão", () => {
    expect(fn).toContain('timeZone: "America/Sao_Paulo"');
    expect(fn).toContain("versao: VERSAO_DOS_CRITERIOS");
    expect(fn).toMatch(/base: pedido\.base, categorias: pedido\.categorias, ordenacao: pedido\.ordenacao, versao: VERSAO_DOS_CRITERIOS/);
  });
});
