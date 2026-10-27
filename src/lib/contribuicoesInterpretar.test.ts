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
    expect(textosParaInterpretar(analise("2026-07-01", "2026-09-30"), "membros_congregados").map(t => t.titulo)).toEqual(["Recorrente", "Contribuiu no período", "Novo dizimista", "Sem contribuição registrada"]);
  });
  it("Recorrente: diz quantos meses completos o período tem e quais são", () => {
    const t = texto("2026-07-01", "2026-09-30");
    expect(t["Recorrente"]).toContain("contribuiu em todos os meses do período analisado");
    expect(t["Recorrente"]).toContain("os 3 meses completos");
    expect(t["Recorrente"]).toContain("julho de 2026 a setembro de 2026");
    expect(t["Recorrente"]).toContain("01/07/2026 a 30/09/2026");
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
  it("Contribuiu no período: uma ou mais contribuições, mas não em todos os meses", () => {
    const t = texto("2026-07-01", "2026-09-30")["Contribuiu no período"];
    expect(t).toContain("uma ou mais contribuições entre 01/07/2026 a 30/09/2026");
    expect(t).toContain("mas não em todos os meses");
  });
  it("Novo dizimista: com histórico, explica a regra; começando no piso, diz que ninguém é novo (não há histórico)", () => {
    expect(texto("2026-07-01", "2026-09-30")["Novo dizimista"]).toContain("sem nenhuma contribuição identificada desde 01/01/2026 até a véspera do período");
    const noPiso = texto("2026-01-01", "2026-06-30")["Novo dizimista"];
    expect(noPiso).toContain("o período começa em 01/01/2026");
    expect(noPiso).toContain("ninguém é classificado como novo dizimista");
  });
  it("Sem contribuição registrada: cita a base analisada e o período, e como ler 'há mais de 90/180 dias'", () => {
    const t = texto("2026-07-01", "2026-09-30", "membros")["Sem contribuição registrada"];
    expect(t).toContain("membros, ativos");
    expect(t).toContain("sem contribuições entre 01/07/2026 a 30/09/2026");
    expect(t).toContain("nenhuma desde 01/01/2026");
    expect(t).toContain("90 ou de 180 dias");
    expect(texto("2026-07-01", "2026-09-30", "membros_congregados_visitantes")["Sem contribuição registrada"]).toContain("visitantes ativos");
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
    for (const t of ["Recorrente:", "Contribuiu no período:", "Novo dizimista:", "Sem contribuição registrada:", "01/07/2026 a 30/09/2026", "os 3 meses completos"]) expect(h).toContain(t);
  });
  it("só aparece quando há lista com nomes (sem nomes, o bloco não faz sentido)", () => {
    expect(email(["indicadores", "saude_da_base"]).html).not.toContain("Como interpretar este relatório");
  });
  it("as colunas: #, Nome, Contribuições e Perfil de contribuição — sem 'Última' e sem 'Situação'", () => {
    const h = email(["contribuintes_nominal"]).html;
    for (const col of [">#<", ">Nome<", ">Contribuições<", ">Perfil de contribuição<"]) expect(h).toContain(col);
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
    expect(h).toContain("Sem contribuição registrada");
  });
  it("a versão em texto também não tem a última contribuição", () => {
    const t = email(["contribuintes_nominal"]).texto;
    expect(t).toContain("1. Pessoa a — 3 contribuições — Recorrente");
    expect(t).not.toContain("última");
  });
});
