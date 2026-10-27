// ─── "Como interpretar este relatório" e a coluna "Perfil de contribuição" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: tirar a coluna "Última contribuição" do relatório; antes da lista nominal, um bloco explicativo GERADO conforme o período (Recorrente, Contribuiu no período, Novo dizimista, Sem contribuição
// registrada); "Situação" vira "Perfil de contribuição"; a lista nominal ordenada por quantidade de contribuições (decrescente). Aqui: o texto dinâmico, a posição do bloco, as colunas e a ordem.
import { describe, expect, it } from "vitest";
import { analisarContribuicoes, analisarSemContribuicao, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";
import { montarEmailDeContribuicoes, textosParaInterpretar } from "../../supabase/functions/_shared/contribuicoes/email";

const L = (id: string, data: string, valor = 10): LinhaDeContribuicao => ({ pessoa_id: id, data, valor, categoria: "Dizimos" });
const analise = (ini: string, fim: string) => analisarContribuicoes([L("a", `${ini.slice(0, 7)}-10`)], { ini, fim });
const texto = (ini: string, fim: string, base: Parameters<typeof textosParaInterpretar>[1] = "membros_congregados") => Object.fromEntries(textosParaInterpretar(analise(ini, fim), base).map(t => [t.titulo, t.texto]));

describe("o texto é gerado conforme o período", () => {
  it("traz as quatro definições, na ordem pedida", () => {
    expect(textosParaInterpretar(analise("2026-07-01", "2026-09-30"), "membros_congregados").map(t => t.titulo)).toEqual(["Recorrente", "Parcial", "Novo dizimista", "Só ofertas", "Sem contribuições no período analisado"]);
  });
  it("Recorrente: diz quantos meses completos o período tem e quais são", () => {
    const t = texto("2026-07-01", "2026-09-30");
    expect(t["Recorrente"]).toContain("contribuiu em todos os meses do período analisado");
    expect(t["Recorrente"]).toContain("os 3 meses completos");
    expect(t["Recorrente"]).toContain("julho de 2026 a setembro de 2026");
    expect(t["Recorrente"]).toContain("entre 01/07/2026 e 30/09/2026");
  });
  it("período com meses incompletos nas pontas: só os completos entram, e o texto avisa", () => {
    const t = texto("2026-04-28", "2026-10-27");
    expect(t["Recorrente"]).toContain("os 5 meses completos");
    expect(t["Recorrente"]).toContain("maio de 2026 a setembro de 2026");
    expect(t["Recorrente"]).toContain("não entram nessa conta");
  });
  it("um único mês completo e nenhum mês completo", () => {
    expect(texto("2026-08-01", "2026-08-31")["Recorrente"]).toContain("o único mês completo");
    expect(texto("2026-08-05", "2026-09-20")["Recorrente"]).toContain("não tem nenhum mês completo; por isso ninguém é classificado como recorrente");
  });
  it("Parcial: dízimo em alguns dos meses completos; a coluna mostra quantos, e a quantidade de contribuições não muda o perfil", () => {
    const t = texto("2026-07-01", "2026-09-30")["Parcial"];
    expect(t).toContain("alguns, mas não em todos, dos meses completos");
    expect(t).toContain("Meses com dízimo");
    expect(t).toContain("2/3");
    expect(t).toContain("a quantidade de contribuições não muda o perfil");
  });
  it("período sem mês completo: não separa recorrente de parcial, e diz isso", () => {
    const t = texto("2026-08-05", "2026-09-20")["Parcial"];
    expect(t).toContain("Sem mês completo no período");
    expect(t).toContain("entre 05/08/2026 e 20/09/2026");
  });
  it("Só ofertas: contribuiu, mas nunca com dízimo", () => {
    expect(texto("2026-07-01", "2026-09-30")["Só ofertas"]).toContain("nunca com dízimo");
  });
  it("Novo dizimista: com histórico, explica a regra; começando no piso, diz que ninguém é novo (não há histórico)", () => {
    expect(texto("2026-07-01", "2026-09-30")["Novo dizimista"]).toContain("sem nenhum dízimo identificado antes de 01/07/2026");
    expect(texto("2026-07-01", "2026-09-30")["Novo dizimista"]).toContain("Pode já ter dado ofertas ou missões antes");
    const noPiso = texto("2026-01-01", "2026-06-30")["Novo dizimista"];
    expect(noPiso).toContain("o período começa em 01/01/2026");
    expect(noPiso).toContain("ninguém é classificado como novo dizimista");
  });
  it("Sem contribuições no período analisado: cita a base analisada e o período escolhido, e como ler 'há mais de 90/180 dias'", () => {
    const t = texto("2026-07-01", "2026-09-30", "membros")["Sem contribuições no período analisado"];
    expect(t).toContain("membros, ativos");
    expect(t).toContain("sem contribuições entre 01/07/2026 e 30/09/2026");
    expect(t).toContain("registro anterior ao período");
    expect(t).not.toContain("01/01/2026");
    expect(t).toContain("90 ou de 180 dias");
    expect(texto("2026-07-01", "2026-09-30", "membros_congregados_visitantes")["Sem contribuições no período analisado"]).toContain("visitantes ativos");
  });
});

describe("o bloco no e-mail", () => {
  const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
  const linhas = [L("a", "2026-07-05"), L("a", "2026-08-05"), L("a", "2026-09-05"), L("b", "2026-08-10"), L("b", "2026-09-10")];
  const pessoas: PessoaDaBase[] = ["a", "b", "c"].map(id => ({ id, nome: `Pessoa ${id}`, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null }));
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
  const nomes = new Map([["a", "Pessoa a"], ["b", "Pessoa b"]]);
  const a = analisarContribuicoes(linhas, periodo);
  const email = (blocos: Parameters<typeof montarEmailDeContribuicoes>[1] extends infer O ? (O extends { blocos?: infer B } ? B : never) : never) =>
    montarEmailDeContribuicoes(a, { blocos, nominal: listasNominaisDoEmail(linhas, periodo, nomes, sem), baseAnalisada: "membros_congregados" });

  it("vem ANTES da primeira lista com nomes", () => {
    const h = email(["contribuintes_nominal", "sem_contribuicao_nominal"]).html;
    expect(h).toContain("Como interpretar este relatório");
    expect(h.indexOf("Como interpretar este relatório")).toBeLessThan(h.indexOf("Quem contribuiu"));
    expect(h.indexOf("Como interpretar este relatório")).toBeLessThan(h.indexOf("Quem não contribuiu"));
  });
  it("traz as quatro definições com o período do relatório", () => {
    const h = email(["sem_contribuicao_nominal"]).html;
    for (const t of ["Recorrente:", "Parcial:", "Novo dizimista:", "Só ofertas:", "Sem contribuições no período analisado:", "01/07/2026 e 30/09/2026", "os 3 meses completos"]) expect(h).toContain(t);
  });
  it("só aparece quando há lista com nomes (sem nomes, o bloco não faz sentido)", () => {
    expect(email(["indicadores", "saude_da_base"]).html).not.toContain("Como interpretar este relatório");
  });
  it("as colunas: #, Nome, Contribuições e Perfil de contribuição — sem 'Última' e sem 'Situação'", () => {
    const h = email(["contribuintes_nominal"]).html;
    for (const col of [">#<", ">Nome<", ">Contribuições<", ">Meses com dízimo<", ">Perfil de contribuição<"]) expect(h).toContain(col);
    for (const fora of [">Última<", ">Situação<", "Última contribuição"]) expect(h).not.toContain(fora);
  });
  it("a lista de quem contribuiu sai por quantidade de contribuições, do maior para o menor (a com 3 antes da com 2)", () => {
    const h = email(["contribuintes_nominal"]).html;
    expect(h.indexOf("Pessoa a")).toBeLessThan(h.indexOf("Pessoa b"));
    expect(h).toContain("Ordem: quantidade de contribuições.");
  });
  it("os perfis mostrados são os do bloco explicativo", () => {
    const h = email(["contribuintes_nominal", "sem_contribuicao_nominal"]).html;
    expect(h).toContain(">Recorrente<");
    expect(h).toContain(">Meses com dízimo<");
    expect(h).toContain("Sem contribuições no período analisado");
  });
  it("a versão em texto também não tem a última contribuição", () => {
    const t = email(["contribuintes_nominal"]).texto;
    expect(t).toContain("1. Pessoa a — 3 contribuições — 3/3 meses com dízimo — Recorrente");
    expect(t).not.toContain("última");
  });
});

describe("nenhuma data fixa: só o período escolhido (decisão dela, 27/10/2026)", () => {
  const L2 = (id: string, data: string): LinhaDeContribuicao => ({ pessoa_id: id, data, valor: 10, categoria: "Dizimos" });
  const pessoas: PessoaDaBase[] = ["a", "b"].map(id => ({ id, nome: `Pessoa ${id}`, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null }));
  const nomes = new Map([["a", "Pessoa a"], ["b", "Pessoa b"]]);
  const gerar = (ini: string, fim: string) => {
    const linhas = [L2("a", `${ini.slice(0, 7)}-15`)];
    const periodo = { ini, fim };
    const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
    return montarEmailDeContribuicoes(analisarContribuicoes(linhas, periodo), { blocos: ["resumo", "tendencias", "nao_contribuiram", "criterios", "cobertura", "contribuintes_nominal", "sem_contribuicao_nominal"], nominal: listasNominaisDoEmail(linhas, periodo, nomes, sem), baseAnalisada: "membros_congregados" });
  };
  it("período que NÃO começa em 01/01/2026: o e-mail (HTML e texto) nunca cita essa data", () => {
    for (const [ini, fim] of [["2026-07-01", "2026-09-30"], ["2026-04-28", "2026-10-27"], ["2026-03-01", "2026-03-31"]]) {
      const e = gerar(ini, fim);
      expect(e.html).not.toContain("01/01/2026");
      expect(e.texto).not.toContain("01/01/2026");
      expect(e.html).not.toMatch(/nenhuma desde|a análise começa em/i);
    }
  });
  it("as datas que aparecem são as do filtro: 'entre 01/07/2026 e 30/09/2026'", () => {
    const e = gerar("2026-07-01", "2026-09-30");
    expect(e.html).toContain("entre 01/07/2026 e 30/09/2026");
  });
  it("a 01/01/2026 só aparece quando é o início do período escolhido", () => {
    expect(gerar("2026-01-01", "2026-06-30").html).toContain("01/01/2026");
  });
  it("o perfil de quem não contribuiu fala do período, sem data", () => {
    const e = gerar("2026-07-01", "2026-09-30");
    expect(e.html).toContain("Sem contribuições no período analisado");
  });
});

describe("Parcial × Recorrente: o exemplo dela (Maria 62 contribuições em 2 meses × Nelson 1 por mês)", () => {
  const periodo = { ini: "2026-05-01", fim: "2026-10-31" };
  const linhas: LinhaDeContribuicao[] = [
    ...Array.from({ length: 30 }, (_, i) => L("maria", `2026-05-${String((i % 28) + 1).padStart(2, "0")}`)),
    ...Array.from({ length: 32 }, (_, i) => L("maria", `2026-06-${String((i % 28) + 1).padStart(2, "0")}`)),
    ...["05", "06", "07", "08", "09", "10"].map(m => L("nelson", `2026-${m}-10`)),
    ...["05", "07", "08", "10"].map(m => L("bia", `2026-${m}-10`)),
    L("carlos", "2026-06-10"), L("carlos", "2026-07-10"),
    ...["maria", "nelson", "bia", "carlos"].map(id => L(id, "2026-02-10")),   // já contribuíam antes do período: ninguém é "novo" (Novo dizimista tem precedência sobre Parcial)
  ].map(l => (l.pessoa_id === "carlos" ? { ...l, categoria: "Ofertas" } : l));
  const pessoas: PessoaDaBase[] = ["maria", "nelson", "bia", "carlos"].map(id => ({ id, nome: id[0].toUpperCase() + id.slice(1), tipo_pessoa: "membro", status: "ativo", data_nascimento: "1970-01-01", familia_id: null }));
  const nomes = new Map(pessoas.map(p => [p.id, p.nome]));
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
  const listas = listasNominaisDoEmail(linhas, periodo, nomes, sem);
  const por = Object.fromEntries(listas.contribuiram.map(l => [l.nome, l]));

  it("Maria (62 contribuições, dízimo em 2 de 6 meses) é PARCIAL 2/6; Nelson (1 por mês) é RECORRENTE 6/6", () => {
    expect(por.Maria).toMatchObject({ contribuicoes: 62, meses: "2/6", perfil: "Parcial" });
    expect(por.Nelson).toMatchObject({ contribuicoes: 6, meses: "6/6", perfil: "Recorrente" });
  });
  it("Bia (4 dos 6 meses) é Parcial 4/6; quem só deu oferta é 'Só ofertas', sem contar meses com dízimo", () => {
    expect(por.Bia).toMatchObject({ meses: "4/6", perfil: "Parcial" });
    expect(por.Carlos).toMatchObject({ meses: null, perfil: "Só ofertas" });
  });
  it("a ordem segue a quantidade (Maria na frente), e a coluna explica por que ela não é recorrente", () => {
    expect(listas.contribuiram.map(l => l.nome)).toEqual(["Maria", "Nelson", "Bia", "Carlos"]);
    const h = montarEmailDeContribuicoes(analisarContribuicoes(linhas, periodo), { blocos: ["contribuintes_nominal"], nominal: listas, baseAnalisada: "membros_congregados" }).html;
    expect(h).toContain(">Meses com dízimo<");
    expect(h).toContain(">2/6<");
    expect(h).not.toContain("Contribuiu no período");
  });
});
