// ─── A ordenação das listas com nomes e a coluna # (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: o padrão da lista nominal do Pastor deixa de ser alfabético e passa a ser a QUANTIDADE de contribuições (maior para menor), com a classificação (#); desempate: quantidade → data da
// última contribuição → nome; e o construtor deixa escolher entre quantidade, valor total contribuído, última contribuição, nome A–Z, nome Z–A e tempo sem contribuir. O valor total só ORDENA:
// nunca aparece. Aqui se prova cada ordem, os empates, a coluna # no e-mail e na versão em texto, a validação e a gaveta.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analisarSemContribuicao, type LinhaDeContribuicao, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";
import { ORDENACAO_PADRAO, ORDENACOES_DAS_LISTAS, validarOrdenacao, type OrdenacaoDasListas } from "../../supabase/functions/_shared/contribuicoes/blocos";
import { montarEmailDeContribuicoes } from "../../supabase/functions/_shared/contribuicoes/email";
import { analisarContribuicoes } from "../../supabase/functions/_shared/contribuicoes/analise";
import { validarPedido } from "../../supabase/functions/_shared/contribuicoes/pedido";

const periodo = { ini: "2026-07-01", fim: "2026-09-30" };
const L = (id: string, data: string, valor: number): LinhaDeContribuicao => ({ pessoa_id: id, data, valor, categoria: "Dizimos" });
const P = (id: string, nome: string): PessoaDaBase => ({ id, nome, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null });

// Quem contribuiu (valores escolhidos para que a ordem por VALOR seja diferente da por QUANTIDADE):
//  amanda: 4 contribuições, R$ 40 no total, última 20/09
//  bruno : 4 contribuições, R$ 40 no total, última 25/09   (empata com amanda em quantidade e valor; a última contribuição decide)
//  carla : 2 contribuições, R$ 9.000 no total, última 01/08  (mais valor, menos contribuições)
//  davi  : 1 contribuição, R$ 5 , última 30/09
//  elisa : 1 contribuição, R$ 5 , última 30/09               (empata com davi em tudo: o nome decide)
const linhas = [
  L("amanda", "2026-07-05", 10), L("amanda", "2026-07-20", 10), L("amanda", "2026-08-20", 10), L("amanda", "2026-09-20", 10),
  L("bruno", "2026-07-06", 10), L("bruno", "2026-08-06", 10), L("bruno", "2026-09-06", 10), L("bruno", "2026-09-25", 10),
  L("carla", "2026-07-01", 4500), L("carla", "2026-08-01", 4500),
  L("davi", "2026-09-30", 5), L("elisa", "2026-09-30", 5),
];
const nomes = new Map([["amanda", "Amanda"], ["bruno", "Bruno"], ["carla", "Carla"], ["davi", "Davi"], ["elisa", "Elisa"]]);
// Quem NÃO contribuiu no período (última contribuição antes dele): fabio (15/06), gabi (02/03), hugo (nunca), iara (15/06)
const pessoas = [...["amanda", "bruno", "carla", "davi", "elisa"].map(i => P(i, nomes.get(i)!)), P("fabio", "Fábio"), P("gabi", "Gabi"), P("hugo", "Hugo"), P("iara", "Iara")];
const anteriores = [L("fabio", "2026-06-15", 1), L("gabi", "2026-03-02", 1), L("iara", "2026-06-15", 1)];
const todas = [...linhas, ...anteriores];
const sem = analisarSemContribuicao(todas, pessoas, periodo, { considerar: "qualquer", incluirMenores: true });
const ordem = (o?: OrdenacaoDasListas) => {
  const l = listasNominaisDoEmail(todas, periodo, nomes, sem, o);
  return { contribuiram: l.contribuiram.map(x => x.nome), sem: l.semContribuicao.map(x => x.nome), l };
};

describe("o PADRÃO: quantidade de contribuições, maior para menor", () => {
  it("é a quantidade quando nada é escolhido; desempate pela última contribuição (mais recente primeiro) e depois pelo nome", () => {
    expect(ORDENACAO_PADRAO).toBe("quantidade");
    expect(ordem().contribuiram).toEqual(["Bruno", "Amanda", "Carla", "Davi", "Elisa"]);
    //  Bruno e Amanda (4): Bruno tem a última mais recente · Carla (2) · Davi e Elisa (1, mesma última): nome
    expect(ordem().contribuiram).toEqual(ordem("quantidade").contribuiram);
  });
  it("a coluna # é a posição, de 1 em diante, na ordem exibida (nas duas listas)", () => {
    const { l } = ordem();
    expect(l.contribuiram.map(x => x.posicao)).toEqual([1, 2, 3, 4, 5]);
    expect(l.semContribuicao.map(x => x.posicao)).toEqual([1, 2, 3, 4]);
  });
  it("quem não contribuiu (0 contribuições para todos): a última contribuição mais recente primeiro, nome no empate, e 'nenhuma' por último", () => {
    expect(ordem().sem).toEqual(["Fábio", "Iara", "Gabi", "Hugo"]);   // fábio e iara: 15/06 (nome decide) · gabi: 02/03 · hugo: nunca
  });
});

describe("as seis ordenações", () => {
  it("valor total contribuído: Carla (R$ 9.000) vem primeiro — e o valor NÃO aparece em nenhuma linha", () => {
    const { contribuiram, l } = ordem("valor_total");
    expect(contribuiram).toEqual(["Carla", "Bruno", "Amanda", "Davi", "Elisa"]);   // valor; depois quantidade, última, nome
    expect(JSON.stringify(l)).not.toMatch(/9000|9\.000|4500|40|"total"|valor/);
    for (const x of [...l.contribuiram, ...l.semContribuicao]) expect(Object.keys(x).sort()).toEqual(["contribuicoes", "meses", "nome", "perfil", "posicao"]);
  });
  it("última contribuição: a mais recente primeiro; desempate por quantidade e nome", () => {
    expect(ordem("ultima_contribuicao").contribuiram).toEqual(["Davi", "Elisa", "Bruno", "Amanda", "Carla"]);
    expect(ordem("ultima_contribuicao").sem).toEqual(["Fábio", "Iara", "Gabi", "Hugo"]);
  });
  it("nome A–Z e Z–A", () => {
    expect(ordem("nome_az").contribuiram).toEqual(["Amanda", "Bruno", "Carla", "Davi", "Elisa"]);
    expect(ordem("nome_za").contribuiram).toEqual(["Elisa", "Davi", "Carla", "Bruno", "Amanda"]);
    expect(ordem("nome_az").sem).toEqual(["Fábio", "Gabi", "Hugo", "Iara"]);
  });
  it("tempo sem contribuir: quem está há mais tempo primeiro, e 'nenhuma desde 01/01/2026' antes de todos", () => {
    expect(ordem("tempo_sem_contribuir").sem).toEqual(["Hugo", "Gabi", "Fábio", "Iara"]);   // hugo: nunca · gabi: 211 dias · fábio e iara: 107 (nome)
    expect(ordem("tempo_sem_contribuir").contribuiram).toEqual(["Carla", "Amanda", "Bruno", "Davi", "Elisa"]);   // a última de cada um contra o fim do período
  });
  it("a ordem da lista de quem não contribuiu por valor cai nos critérios seguintes (ninguém tem valor no período)", () => {
    expect(ordem("valor_total").sem).toEqual(["Fábio", "Iara", "Gabi", "Hugo"]);
  });
  it("as seis opções existem, com rótulo e descrição do desempate", () => {
    expect(ORDENACOES_DAS_LISTAS.map(o => o.id)).toEqual(["quantidade", "valor_total", "ultima_contribuicao", "nome_az", "nome_za", "tempo_sem_contribuir"]);
    for (const o of ORDENACOES_DAS_LISTAS) { expect(o.rotulo.length).toBeGreaterThan(3); expect(o.descricao.length).toBeGreaterThan(3); }
    expect(ORDENACOES_DAS_LISTAS.find(o => o.id === "valor_total")!.descricao).toContain("os valores não aparecem na lista");
  });
});

describe("o e-mail mostra a classificação (#) e diz a ordem", () => {
  const a = analisarContribuicoes(todas, periodo);
  const email = (o?: OrdenacaoDasListas) => montarEmailDeContribuicoes(a, { blocos: ["contribuintes_nominal", "sem_contribuicao_nominal"], nominal: listasNominaisDoEmail(todas, periodo, nomes, sem, o), ordenacao: o });
  it("a tabela tem a coluna # como primeira e as posições na sequência", () => {
    const h = email().html;
    expect(h).toContain(">#<");
    for (const n of ["1", "2", "3", "4", "5"]) expect(h).toContain(`>${n}</td>`);
    expect(h.indexOf("Bruno")).toBeLessThan(h.indexOf("Amanda"));   // a ordem padrão aparece no e-mail
  });
  it("diz por qual critério a lista está ordenada, com o desempate", () => {
    expect(email().html).toContain("Ordem: quantidade de contribuições. Maior para menor; desempate pela última contribuição e pelo nome.");
    expect(email("nome_za").html).toContain("Ordem: nome z–a.");
  });
  it("na versão em texto a linha começa pela posição", () => {
    expect(email().texto).toMatch(/1\. Bruno — 4 contribuições — (\d)\/\1 meses com dízimo — Recorrente/);   // contribuiu em julho, agosto e setembro
  });
  it("mesmo ordenando por valor, nenhum valor individual aparece no e-mail", () => {
    const h = email("valor_total");
    for (const v of ["9.000", "9000", "4.500", "4500", "R$ 40,00", "R$ 5,00"]) { expect(h.html).not.toContain(v); expect(h.texto).not.toContain(v); }
  });
});

describe("validação e função", () => {
  it("validarOrdenacao: ausente = quantidade; valor desconhecido é recusado", () => {
    expect(validarOrdenacao(undefined)).toEqual({ ok: true, ordenacao: "quantidade" });
    expect(validarOrdenacao("nome_za")).toEqual({ ok: true, ordenacao: "nome_za" });
    for (const ruim of ["valor", "ranking", "", 3]) expect(validarOrdenacao(ruim).ok).toBe(false);
  });
  it("o pedido leva a ordenação (padrão: quantidade) e a recusa se for inválida", () => {
    const base = { periodo: { ini: "2026-03-01", fim: "2026-03-31" } };
    const r = validarPedido(base, "2026-10-27", false);
    expect(r.ok && r.pedido.ordenacao).toBe("quantidade");
    const r2 = validarPedido({ ...base, ordenacao: "tempo_sem_contribuir" }, "2026-10-27", false);
    expect(r2.ok && r2.pedido.ordenacao).toBe("tempo_sem_contribuir");
    expect(validarPedido({ ...base, ordenacao: "valor_individual" }, "2026-10-27", false).ok).toBe(false);
  });
  it("a função passa a ordenação às listas e ao e-mail e a registra (histórico e registro de acesso)", () => {
    const fn = readFileSync("supabase/functions/contribuicoes-enviar/index.ts", "utf8");
    expect(fn).toContain("listasNominaisDoEmail(linhas, pedido.periodo, nomes, semContribuicaoAnalisada, pedido.ordenacao)");
    expect(fn).toContain("ordenacao: pedido.ordenacao }, total: totalDeNomes(nominal)");
  });
  it("a chave do envio muda com a ordenação (outro critério = outro envio)", async () => {
    const { chaveDoEnvio } = await import("../../supabase/functions/_shared/contribuicoes/pedido");
    const p = { periodo: { ini: "a", fim: "b", ajustado: false }, destinatarios: ["x@x.com"], blocos: ["resumo" as const], base: "membros" as const, categorias: ["dizimo" as const] };
    expect(chaveDoEnvio({ ...p, ordenacao: "quantidade" })).not.toBe(chaveDoEnvio({ ...p, ordenacao: "nome_az" }));
  });
});
