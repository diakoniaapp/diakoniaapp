// ─── O relatório do pastor COM NOMES, sem valores (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Decisão dela: o modelo Pastor leva nome, última contribuição, frequência e situação — nunca valor individual, média individual nem total contribuído. Aqui se prova: que nenhum valor chega às
// linhas nem ao e-mail (nem como texto, nem como campo), as situações (recorrente, novo, sem contribuição no período, há mais de 90 e 180 dias), a ordem alfabética, o aviso de dados individuais,
// e que a função grava o registro de acesso ANTES de gerar os nomes e recusa se não conseguir (sem registro, sem nomes) — mais a migration que acrescenta as ações.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarContribuicoes, analisarSemContribuicao, resumirBase, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail, totalDeNomes } from "../../supabase/functions/_shared/contribuicoes/nominal";
import { montarEmailDeContribuicoes } from "../../supabase/functions/_shared/contribuicoes/email";
import { IDS_NOMINAIS, blocosDoModelo } from "../../supabase/functions/_shared/contribuicoes/blocos";

const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
const L = (pessoa_id: string, data: string, valor: number, categoria = "Dizimos"): LinhaDeContribuicao => ({ pessoa_id, data, valor, categoria });
const P = (id: string, nome: string, o: Partial<PessoaDaBase> = {}): PessoaDaBase => ({ id, nome, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null, ...o });
// valores ESCOLHIDOS para serem reconhecíveis: nenhum deles pode aparecer no e-mail como valor individual
const linhas = [
  L("zeca", "2026-07-10", 9451.77), L("zeca", "2026-08-10", 9451.77), L("zeca", "2026-09-10", 9451.77),   // recorrente (3 meses completos)
  L("ana", "2026-09-05", 7777.31),                                                                       // nova (antes não tinha nada)
  L("bia", "2026-05-02", 1234.56),                                                                       // antes, 151 dias → "mais de 90 dias"
  L("caio", "2026-02-01", 4321.09),                                                                      // 241 dias → "mais de 180 dias"
  L("inativo", "2026-08-15", 55.55),                                                                     // contribuiu, mas não está na base (inativo)
];
const pessoas = [P("zeca", "Zeca Teste"), P("ana", "Ana Teste"), P("bia", "Bia Teste"), P("caio", "Caio Teste"), P("duda", "Duda Teste")];   // duda nunca contribuiu
const nomes = new Map([["zeca", "Zeca Teste"], ["ana", "Ana Teste"], ["inativo", "Zé Inativo"]]);
const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: false });
const listas = listasNominaisDoEmail(linhas, periodo, nomes, sem);
const analise = analisarContribuicoes(linhas, periodo);
const email = montarEmailDeContribuicoes(analise, { blocos: [...blocosDoModelo("pastor"), ...IDS_NOMINAIS], base: resumirBase(sem), nominal: listas });   // nomes só quando as opções nominais são marcadas

describe("as linhas com nomes não têm valor", () => {
  it("quem contribuiu: #, nome, última, quantidade e situação — por padrão pela QUANTIDADE (maior para menor)", () => {
    expect(listas.contribuiram.map(l => [l.posicao, l.nome, l.contribuicoes, l.perfil])).toEqual([
      [1, "Zeca Teste", 3, "Recorrente"],        // a quantidade manda (3 contribuições)
      [2, "Ana Teste", 1, "Novo dizimista"],      // empate em 1: a última contribuição mais recente vem antes (ela só ORDENA, não é coluna)
      [3, "Zé Inativo", 1, "Novo dizimista"],     // não está na base, mas o nome vem do cadastro
    ]);
  });
  it("quem não contribuiu: nome, última contribuição e a situação por tempo (sem registro anterior, mais de 90, mais de 180 dias)", () => {
    // todos com 0 contribuições no período: desempata pela última contribuição (mais recente primeiro), depois pelo nome; quem não tem nenhuma fica por último
    expect(listas.semContribuicao.map(l => [l.posicao, l.nome, l.perfil])).toEqual([
      [1, "Bia Teste", "Sem contribuições no período analisado · última há mais de 90 dias"],
      [2, "Caio Teste", "Sem contribuições no período analisado · última há mais de 180 dias"],
      [3, "Duda Teste", "Sem contribuições no período analisado · sem registro anterior"],
    ]);
    expect(listas.semContribuicao.every(l => l.contribuicoes === null)).toBe(true);
  });
  it("NENHUM campo de valor, total ou média em nenhuma linha (garantia de tipo e de dado)", () => {
    for (const l of [...listas.contribuiram, ...listas.semContribuicao]) expect(Object.keys(l).sort()).toEqual(["contribuicoes", "nome", "perfil", "posicao"]);   // sem valor e SEM data da última contribuição
    expect(JSON.stringify(listas)).not.toMatch(/9451|7777|1234|4321|55\.55|valor|total|media/i);
  });
  it("conta quantos nomes saem (vai para o registro de acesso)", () => {
    expect(totalDeNomes(listas)).toBe(6);
  });
  it("nome não encontrado no cadastro aparece como tal, nunca como o identificador da pessoa", () => {
    const l = listasNominaisDoEmail([L("fantasma-uuid-1", "2026-08-01", 10)], periodo, new Map(), sem);
    expect(l.contribuiram[0].nome).toBe("(nome não encontrado)");
    expect(JSON.stringify(l)).not.toContain("fantasma-uuid-1");
  });
});

describe("o e-mail com nomes", () => {
  it("leva os nomes, as datas e as situações, e o aviso de dados individuais", () => {
    for (const t of ["Contém dados individuais", "Quem contribuiu", "Quem não contribuiu", "Zeca Teste", "Recorrente", "Duda Teste", "sem registro anterior", "há mais de 180 dias", "Perfil de contribuição", "Como interpretar este relatório"]) expect(email.html).toContain(t);
    for (const fora of [">Última<", ">Situação<", "10/09/2026", "05/09/2026"]) expect(email.html).not.toContain(fora);   // a coluna da última contribuição saiu
    expect(email.html).toContain("nenhum valor individual");
  });
  it("NENHUM valor individual aparece, em nenhuma forma (o agregado do período pode aparecer; o valor de uma pessoa, não)", () => {
    const quente = ["9.451,77", "9451", "7.777,31", "1.234,56", "4.321,09", "55,55"];
    for (const v of quente) { expect(email.html).not.toContain(v); expect(email.texto).not.toContain(v); }
  });
  it("a versão em texto também leva os nomes, sem valores", () => {
    expect(email.texto).toContain("Quem contribuiu (sem valores)");
    expect(email.texto).toContain("1. Zeca Teste — 3 contribuições — Recorrente");
    expect(email.texto).not.toContain("última:");
    expect(email.texto).toContain("Não encaminhe");
  });
  it("sem os blocos com nomes, nada de nomes nem do aviso — mesmo que as listas sejam passadas", () => {
    const sem = montarEmailDeContribuicoes(analise, { blocos: ["indicadores", "saude_da_base"], base: resumirBase(listas ? analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "qualquer", incluirMenores: false }) : (undefined as never)), nominal: listas });
    expect(sem.html).not.toContain("Zeca Teste");
    expect(sem.html).not.toContain("Contém dados individuais");
    expect(sem.html).toContain("apenas números agregados");
  });
  it("lista vazia diz isso, sem inventar nome", () => {
    const vazio = montarEmailDeContribuicoes(analise, { blocos: ["sem_contribuicao_nominal"], nominal: { contribuiram: [], semContribuicao: [] } });
    expect(vazio.html).toContain("Ninguém nesta situação no período.");
  });
  it("escapa o nome (cadastro com < > & não vira HTML)", () => {
    const l = { contribuiram: [{ posicao: 1, nome: "<b>X</b> & Cia", contribuicoes: 1, perfil: "Novo dizimista" }], semContribuicao: [] };
    const h = montarEmailDeContribuicoes(analise, { blocos: ["contribuintes_nominal"], nominal: l }).html;
    expect(h).toContain("&lt;b&gt;X&lt;/b&gt; &amp; Cia");
    expect(h).not.toContain("<b>X</b>");
  });
});

describe("a função: sem registro, sem nomes", () => {
  const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
  it("grava o registro de acesso ANTES de montar o e-mail com nomes, com a ação da prévia, do teste ou do envio", () => {
    expect(fn).toMatch(/const acaoDoRegistro = corpo\.acao === "previa" \? "previa_relatorio" : corpo\.acao === "teste" \? "teste_relatorio" : "enviar_relatorio"/);
    const iRegistro = fn.indexOf('from("contribuicoes_acessos").insert');
    const iEmail = fn.indexOf("montarEmailDeContribuicoes(analise");
    expect(iRegistro).toBeGreaterThan(0);
    expect(iRegistro).toBeLessThan(iEmail);
    expect(fn).toMatch(/total: totalDeNomes\(nominal\)/);
  });
  it("se o registro falhar, recusa com 503 e orienta a tirar os blocos com nomes", () => {
    expect(fn).toMatch(/if \(reg\.error\) return resposta\(\{ erro: "O registro de acessos não está disponível[^"]*o relatório com nomes não foi gerado[^"]*" \}, 503\)/);
  });
  it("só busca nomes quando um bloco com nomes foi pedido, e usa o resumo (não a lista) para o resto", () => {
    expect(fn).toContain("temBlocoNominal(pedido.blocos)");
    expect(fn).toMatch(/if \(comNomes && semContribuicaoAnalisada\)/);
    expect(fn).not.toMatch(/\.lista\b/);
  });
  it("o histórico diz que o envio levou nomes e quantos, sem os nomes", () => {
    expect(fn).toMatch(/comNomes, nomes: nominal \? totalDeNomes\(nominal\) : 0/);
  });
});

describe("migration 20261027200000 — o registro cobre o relatório com nomes", () => {
  const sql = readFileSync("supabase/migrations/20261027200000_contribuicoes_acessos_relatorio.sql", "utf8");
  it("acrescenta as três ações do relatório ao CHECK e mantém as cinco que já existiam", () => {
    for (const a of ["previa_relatorio", "teste_relatorio", "enviar_relatorio", "ver_pessoas", "ver_nao_contribuiram", "exportar_pessoas", "exportar_nao_contribuiram", "ver_pessoa"]) expect(sql).toContain(`'${a}'`);
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS contribuicoes_acessos_acao_check");
  });
  it("as ações que a função grava são exatamente as que o CHECK aceita", () => {
    const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
    for (const a of ["previa_relatorio", "teste_relatorio", "enviar_relatorio"]) { expect(fn).toContain(`"${a}"`); expect(sql).toContain(`'${a}'`); }
  });
  it("não toca em dados nem em política: só o CHECK; o rollback devolve o CHECK de antes", () => {
    expect(sql).not.toMatch(/CREATE POLICY|DELETE|UPDATE |DROP TABLE/i);
    const rollback = readFileSync("docs/CONTRIBUICOES_ACESSOS_RELATORIO_ROLLBACK.sql", "utf8");
    expect(rollback).not.toContain("enviar_relatorio'");
    expect(rollback).toContain("'ver_pessoa'");
  });
});
