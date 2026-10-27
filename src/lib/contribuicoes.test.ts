// ─── O cálculo único das contribuições (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cada regra com números feitos à mão: o piso de 01/01/2026, o que é contribuição, dizimista × doador, recorrência por meses COMPLETOS, "novo" só com histórico depois do piso, as semanas (segunda a
// domingo, inclusive as vazias), os destaques e o bloco "Não contribuíram" (base, menores, família, faixas de 30/60/90/180 dias).
import { describe, expect, it } from "vitest";
import {
  FAIXAS_SEM_CONTRIBUICAO, PISO_DE_IDENTIFICACAO, ajustarAoPiso, analisarContribuicoes, analisarSemContribuicao, destaquesDasSemanas, diasEntre, fazParteDaBase, idadeEm,
  intervaloDoPreset, mesesCompletos, resumirPessoas, mesesQueOPeriodoToca, segundaDaSemana, somarDias, tipoDaContribuicao,
  type LinhaDeContribuicao, type PessoaDaBase,
} from "@/lib/contribuicoes";

const L = (pessoa_id: string | null, data: string, valor: number, categoria: string | null = "Dizimos"): LinhaDeContribuicao => ({ pessoa_id, data, valor, categoria });

describe("o que é contribuição", () => {
  it.each([["Dizimos", "dizimo"], ["Dízimos", "dizimo"], ["Ofertas", "oferta"], ["Ofertas para Missões", "missoes"], ["Oferta missionária de Missões", "missoes"]] as const)("%s → %s", (nome, tipo) => {
    expect(tipoDaContribuicao(nome)).toBe(tipo);
  });
  it.each(["Rendimentos de Aplicações", "Descontos Obtidos", "Estornos e Recuperações", "", null, undefined])("%p NÃO é contribuição (transferência, rendimento, estorno)", nome => {
    expect(tipoDaContribuicao(nome as string | null)).toBeNull();
  });
});

describe("datas", () => {
  it("segunda-feira da semana (domingo pertence à semana que termina nele)", () => {
    expect(segundaDaSemana("2026-10-26")).toBe("2026-10-26");   // segunda
    expect(segundaDaSemana("2026-10-27")).toBe("2026-10-26");   // terça
    expect(segundaDaSemana("2026-11-01")).toBe("2026-10-26");   // domingo
    expect(segundaDaSemana("2026-11-02")).toBe("2026-11-02");
  });
  it("somar dias e diferença atravessam mês e ano sem fuso", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(diasEntre("2026-10-01", "2026-10-27")).toBe(26);
  });
  it("meses que o período toca × meses COMPLETOS dentro dele", () => {
    expect(mesesQueOPeriodoToca("2026-04-26", "2026-10-25")).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(mesesCompletos("2026-04-26", "2026-10-25")).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(mesesCompletos("2026-03-01", "2026-03-31")).toEqual(["2026-03"]);
    expect(mesesCompletos("2026-03-02", "2026-03-31")).toEqual([]);
  });
  it("idade em uma data (aniversário ainda não chegou = um ano a menos)", () => {
    expect(idadeEm("2008-11-01", "2026-10-31")).toBe(17);
    expect(idadeEm("2008-11-01", "2026-11-01")).toBe(18);
    expect(idadeEm(null, "2026-10-31")).toBeNull();
  });
});

describe("o piso de 01/01/2026", () => {
  it("o período nunca começa antes dele, e a tela é avisada", () => {
    expect(ajustarAoPiso("2025-06-01", "2026-03-31")).toEqual({ ini: "2026-01-01", fim: "2026-03-31", ajustado: true, vazio: false });
    expect(ajustarAoPiso("2026-02-01", "2026-03-31")).toEqual({ ini: "2026-02-01", fim: "2026-03-31", ajustado: false, vazio: false });
  });
  it("um período inteiro antes do piso fica vazio, em vez de calcular com dado de identificação falho", () => {
    expect(ajustarAoPiso("2025-01-01", "2025-12-31").vazio).toBe(true);
    expect(PISO_DE_IDENTIFICACAO).toBe("2026-01-01");
  });
  it("os atalhos de período (90 dias, 6 e 12 meses, ano, desde o piso) a partir de hoje", () => {
    expect(intervaloDoPreset("90d", "2026-10-27")).toEqual({ ini: "2026-07-30", fim: "2026-10-27" });
    expect(intervaloDoPreset("6m", "2026-10-27")).toEqual({ ini: "2026-04-28", fim: "2026-10-27" });
    expect(intervaloDoPreset("12m", "2026-10-27")).toEqual({ ini: "2025-10-28", fim: "2026-10-27" });
    expect(intervaloDoPreset("ano", "2026-10-27")).toEqual({ ini: "2026-01-01", fim: "2026-10-27" });
    expect(intervaloDoPreset("desde_piso", "2026-10-27")).toEqual({ ini: "2026-01-01", fim: "2026-10-27" });
  });
  it("6 meses atrás a partir de 31/08 cai no último dia do mês mais curto (28/02)", () => {
    expect(intervaloDoPreset("6m", "2026-08-31").ini).toBe("2026-03-01");
  });
});

describe("analisarContribuicoes — indicadores", () => {
  // Período fechado: março e abril de 2026 inteiros (2 meses completos, 61 dias).
  const periodo = { ini: "2026-03-01", fim: "2026-04-30" };
  const linhas = [
    L("a", "2026-03-02", 100), L("a", "2026-04-06", 100),                 // a: dízimo nos 2 meses → recorrente
    L("b", "2026-03-09", 200), L("b", "2026-03-16", 50, "Ofertas"),       // b: dízimo só em março + oferta
    L("c", "2026-04-13", 300, "Ofertas para Missões"),                    // c: só missões em abril → doador, não dizimista; novo
    L(null, "2026-03-23", 150),                                           // dízimo sem pessoa
    L(null, "2026-03-25", 999, null),                                     // transferência (sem categoria): fora
    L("a", "2026-04-20", 10, "Rendimentos de Aplicações"),                // rendimento: fora
    L("a", "2026-02-10", 80),                                             // antes do período: só conta como histórico
  ];
  const a = analisarContribuicoes(linhas, periodo);
  it("total, por tipo e cobertura (o que não tem pessoa aparece separado)", () => {
    expect(a.arrecadado).toBe(900);                                       // 100+100+200+50+300+150
    expect(a.porTipo).toEqual({ dizimo: 550, oferta: 50, missoes: 300 });
    expect(a.cobertura).toEqual({ valorIdentificado: 750, valorNaoIdentificado: 150, pctDoValor: 83.33, entradasSemPessoa: 1 });
  });
  it("dizimistas (com dízimo) × doadores (com qualquer contribuição)", () => {
    expect(a.dizimistas).toBe(2);   // a, b
    expect(a.doadores).toBe(3);     // a, b, c
  });
  it("médias: mensal por dias ÷ 30,4375; por doador sobre o valor identificado; frequência", () => {
    expect(a.mediaMensal).toBe(449.08);   // 900 ÷ (61 / 30,4375)
    expect(a.mediaPorDoador).toBe(250);   // 750 ÷ 3
    expect(a.frequenciaMedia).toBe(1.67);   // 5 contribuições identificadas ÷ 3 doadores
  });
  it("recorrência: dizimista que deu dízimo em TODOS os meses completos (março e abril), sobre os dizimistas", () => {
    expect(a.recorrentes).toEqual({ pessoas: 1, pct: 50, meses: 2 });   // só "a" (b só em março; c nem é dizimista); 1 de 2 dizimistas
  });
  it("novos: sem contribuição identificada entre o piso e o início do período (a já tinha fevereiro)", () => {
    expect(a.novos).toBe(2);   // b e c
  });
  it("período que começa no piso: 'novos' não se calcula (não há histórico anterior confiável)", () => {
    expect(analisarContribuicoes(linhas, { ini: "2026-01-01", fim: "2026-04-30" }).novos).toBeNull();
  });
  it("período sem mês completo: recorrência não se calcula", () => {
    expect(analisarContribuicoes(linhas, { ini: "2026-03-05", fim: "2026-04-20" }).recorrentes).toBeNull();
  });
  it("sem nenhuma contribuição: zeros e nulos, sem dividir por zero", () => {
    const v = analisarContribuicoes([], periodo);
    expect(v.arrecadado).toBe(0);
    expect(v.mediaPorDoador).toBeNull();
    expect(v.frequenciaMedia).toBeNull();
    expect(v.cobertura.pctDoValor).toBeNull();
    expect(v.recorrentes).toBeNull();
    expect(v.destaques).toEqual({ maiorAdesao: null, maiorArrecadacao: null, maiorCrescimento: null });
  });
});

describe("semanas, meses e destaques", () => {
  const periodo = { ini: "2026-03-02", fim: "2026-03-22" };   // 3 semanas: 02/03, 09/03, 16/03
  const linhas = [
    L("a", "2026-03-02", 100), L("b", "2026-03-03", 100), L("c", "2026-03-08", 100),   // semana 1: 3 pessoas, R$ 300 (domingo 08 pertence a ela)
    L("a", "2026-03-17", 600),                                                          // semana 3: 1 pessoa, R$ 600 (a semana 2 fica vazia)
  ];
  const a = analisarContribuicoes(linhas, periodo);
  it("todas as semanas aparecem, inclusive a vazia, com contribuintes DISTINTOS", () => {
    expect(a.semanas).toEqual([
      { inicio: "2026-03-02", contribuintes: 3, valor: 300 },
      { inicio: "2026-03-09", contribuintes: 0, valor: 0 },
      { inicio: "2026-03-16", contribuintes: 1, valor: 600 },
    ]);
  });
  it("a mesma pessoa duas vezes na semana conta uma vez", () => {
    const v = analisarContribuicoes([L("a", "2026-03-02", 10), L("a", "2026-03-04", 10)], periodo);
    expect(v.semanas[0]).toEqual({ inicio: "2026-03-02", contribuintes: 1, valor: 20 });
  });
  it("destaques: maior adesão, maior arrecadação e maior crescimento (só sobre a semana ANTERIOR)", () => {
    expect(a.destaques.maiorAdesao?.inicio).toBe("2026-03-02");
    expect(a.destaques.maiorArrecadacao?.inicio).toBe("2026-03-16");
    expect(a.destaques.maiorCrescimento).toBeNull();   // a semana de 600 vem depois de uma semana VAZIA (0): não há base de comparação
    const d = destaquesDasSemanas([{ inicio: "a", contribuintes: 2, valor: 100 }, { inicio: "b", contribuintes: 3, valor: 250 }, { inicio: "c", contribuintes: 1, valor: 200 }]);
    expect(d.maiorCrescimento).toMatchObject({ variacao: 150, semana: { inicio: "b" }, anterior: { inicio: "a" } });
  });
  it("meses: contribuintes distintos e valor por mês", () => {
    expect(a.meses).toEqual([{ mes: "2026-03", contribuintes: 3, valor: 900 }]);
  });
});

describe("Não contribuíram no período", () => {
  const P = (id: string, o: Partial<PessoaDaBase> = {}): PessoaDaBase => ({ id, nome: `Pessoa ${id}`, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-05-10", familia_id: null, ...o });
  const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
  const pessoas: PessoaDaBase[] = [
    P("contribuiu"),                                                                   // contribuiu no período
    P("antes30"),                                                                      // última em 15/06 → 107 dias até 30/09 (faixa 91–180)
    P("antes_recente"),                                                                // última em 26/06 → 96 dias: também 91–180
    P("nunca"),                                                                        // nada desde o piso
    P("menor", { data_nascimento: "2015-03-03" }),                                     // 11 anos
    P("semNasc", { data_nascimento: null }),
    P("conjuge", { familia_id: "f1" }), P("esposo", { familia_id: "f1" }),             // esposo contribui; cônjuge não
    P("congregado", { tipo_pessoa: "congregado" }),
    P("inativo", { status: "inativo" }), P("visitante", { tipo_pessoa: "visitante" }), P("falecido", { status: "falecido" }), P("exmembro", { tipo_pessoa: "ex_membro" }),
  ];
  const linhas = [
    L("contribuiu", "2026-08-02", 100), L("esposo", "2026-09-06", 100),
    L("antes30", "2026-06-15", 50), L("antes_recente", "2026-06-26", 50),
    L("contribuiu", "2026-01-10", 10, "Rendimentos de Aplicações"),                    // não é contribuição
  ];
  const r = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: false });
  const por = (id: string) => r.lista.find(p => p.id === id);

  it("a base é só membro e congregado ATIVO (visitante, ex-membro, inativo e falecido ficam fora)", () => {
    expect(fazParteDaBase(P("x"))).toBe(true);
    expect(pessoas.filter(fazParteDaBase).map(p => p.id)).toEqual(["contribuiu", "antes30", "antes_recente", "nunca", "menor", "semNasc", "conjuge", "esposo", "congregado"]);
  });
  it("menor de 18 anos sai da base por padrão (e é contado à parte); com a opção, entra", () => {
    expect(r.menoresFora).toBe(1);
    expect(por("menor")).toBeUndefined();
    const com = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
    expect(com.lista.find(p => p.id === "menor")?.menor).toBe(true);
    expect(com.base).toBe(r.base + 1);
  });
  it("totais: base, contribuíram, não contribuíram e adesão", () => {
    expect(r.base).toBe(8);               // 9 ativos − 1 menor
    expect(r.contribuiram).toBe(2);       // contribuiu e esposo
    expect(r.naoContribuiram).toBe(6);
    expect(r.adesaoPct).toBe(25);
  });
  it("nunca desde o piso × já contribuiu antes do período", () => {
    expect(r.nuncaDesdeOPiso).toBe(4);    // nunca, semNasc, conjuge, congregado
    expect(r.jaContribuiuAntes).toBe(2);  // antes30, antes_recente
    expect(por("nunca")).toMatchObject({ classificacao: "nunca", ultima: null, dias: null, faixa: null });
    expect(por("antes30")).toMatchObject({ classificacao: "antes", ultima: "2026-06-15", dias: 107, faixa: "de91a180" });
  });
  it("faixas de 30/60/90/180 dias contam só quem já contribuiu antes", () => {
    expect(r.faixas).toEqual({ ate30: 0, de31a60: 0, de61a90: 0, de91a180: 2, mais180: 0 });
    expect(FAIXAS_SEM_CONTRIBUICAO.map(f => f.id)).toEqual(["ate30", "de31a60", "de61a90", "de91a180", "mais180"]);
  });
  it("faixa nas bordas: 30 dias é 'até 30'; 31 é 'de 31 a 60'; 181 é 'mais de 180'", () => {
    const doze = (ultima: string, fim: string) => analisarSemContribuicao([L("p", ultima, 1)], [P("p")], { ini: "2026-02-01", fim }, { considerar: "qualquer", incluirMenores: true }).lista[0].faixa;
    expect(doze("2026-01-10", "2026-02-09")).toBe("ate30");    // 30 dias
    expect(doze("2026-01-10", "2026-02-10")).toBe("de31a60");  // 31 dias
    expect(doze("2026-01-02", "2026-07-01")).toBe("de91a180");  // 180 dias
    expect(doze("2026-01-02", "2026-07-02")).toBe("mais180");   // 181 dias
  });
  it("família: o cônjuge de quem contribuiu leva a marca 'a família contribui' (pode contribuir por outra pessoa)", () => {
    expect(por("conjuge")?.familiaContribui).toBe(true);
    expect(por("nunca")?.familiaContribui).toBe(false);
    expect(r.comFamiliaQueContribui).toBe(1);
  });
  it("sem data de nascimento: entra na lista, marcado (não se sabe se é menor)", () => {
    expect(por("semNasc")).toMatchObject({ semNascimento: true, menor: false });
  });
  it("a ordem é ALFABÉTICA (a lista não vira ranking)", () => {
    expect(r.lista.map(p => p.nome)).toEqual([...r.lista.map(p => p.nome)].sort((a, b) => a.localeCompare(b, "pt-BR")));
  });
  it("'só dízimo': quem deu apenas oferta passa a contar como sem dízimo", () => {
    const so = analisarSemContribuicao([L("contribuiu", "2026-08-02", 100, "Ofertas")], [P("contribuiu")], periodo, { considerar: "dizimo", incluirMenores: true });
    expect(so.naoContribuiram).toBe(1);
    expect(analisarSemContribuicao([L("contribuiu", "2026-08-02", 100, "Ofertas")], [P("contribuiu")], periodo, { considerar: "qualquer", incluirMenores: true }).naoContribuiram).toBe(0);
  });
  it("contribuição ANTES do piso não conta como 'já contribuiu' (a identificação de 2025 não é confiável)", () => {
    const v = analisarSemContribuicao([L("p", "2025-11-10", 100)], [P("p")], periodo, { considerar: "qualquer", incluirMenores: true });
    expect(v.lista[0].classificacao).toBe("nunca");
  });
  it("base vazia: sem divisão por zero", () => {
    expect(analisarSemContribuicao([], [], periodo, { considerar: "qualquer", incluirMenores: false })).toMatchObject({ base: 0, adesaoPct: null, naoContribuiram: 0 });
  });
});

describe("resumirPessoas — a lista da aba Pessoas", () => {
  const periodo = { ini: "2026-03-01", fim: "2026-04-30" };
  const linhas = [L("a", "2026-03-02", 100), L("a", "2026-04-06", 100), L("b", "2026-03-09", 50, "Ofertas"), L("c", "2026-04-13", 300), L("a", "2026-02-10", 80), L(null, "2026-03-23", 150), L("d", "2026-03-10", 20, "Rendimentos de Aplicações")];
  const r = resumirPessoas(linhas, periodo);
  const de = (id: string) => r.find(p => p.pessoaId === id);
  it("uma linha por pessoa que contribuiu (sem pessoa e sem categoria de contribuição ficam fora)", () => {
    expect(r.map(p => p.pessoaId).sort()).toEqual(["a", "b", "c"]);
  });
  it("total, quantidade, última dentro do período e se é dizimista", () => {
    expect(de("a")).toMatchObject({ total: 200, quantidade: 2, ultima: "2026-04-06", dizimista: true });
    expect(de("b")).toMatchObject({ total: 50, quantidade: 1, dizimista: false });
  });
  it("recorrente (todos os meses completos) e nova (sem contribuição desde o piso até o início do período)", () => {
    expect(de("a")).toMatchObject({ recorrente: true, nova: false });   // fevereiro já tinha
    expect(de("c")).toMatchObject({ recorrente: false, nova: true });
  });
  it("sem mês completo ou começando no piso: recorrente e nova ficam nulos (não se afirma o que o dado não sustenta)", () => {
    expect(resumirPessoas(linhas, { ini: "2026-03-05", fim: "2026-04-20" })[0].recorrente).toBeNull();
    expect(resumirPessoas(linhas, { ini: "2026-01-01", fim: "2026-04-30" })[0].nova).toBeNull();
  });
});
