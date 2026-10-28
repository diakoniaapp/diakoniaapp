// ─── Confiabilidade da lista "sem dízimo" / "sem contribuição" (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela, antes do primeiro relatório oficial ao pastor: a lista só vale se as contribuições estão identificadas. O relatório informa o % identificado, as pendências, o impacto potencial e a data dos
// dados; tem um indicador (alta/média/baixa) e uma trava que avisa a tesouraria ANTES da lista com nomes. A expressão "Não dizimistas" não existe: é "Sem dízimo registrado no período analisado".
import { describe, expect, it } from "vitest";
import {
  AVISO_SO_IDENTIFICADAS, PENDENTES_PARA_ALERTAR, calcularConfiabilidade, linhasDaConfiabilidade, textoDoAlerta,
} from "../../supabase/functions/_shared/contribuicoes/confiabilidade";
import type { LinhaDeContribuicao } from "../../supabase/functions/_shared/contribuicoes/analise";

const periodo = { ini: "2026-04-19", fim: "2026-10-19" };
let n = 0;
const L = (pessoa: string | null, valor: number, categoria = "Dizimos", data = "2026-08-10"): LinhaDeContribuicao & { id: string } => ({ id: `l${++n}`, pessoa_id: pessoa, data, valor, categoria });
const DIZ = ["dizimo" as const];
const TODAS = ["dizimo" as const, "oferta" as const, "missoes" as const];

describe("calcularConfiabilidade", () => {
  it("tudo identificado: alta, nenhuma pendência, impacto nenhum", () => {
    const c = calcularConfiabilidade([L("a", 100), L("b", 200)], periodo, { categorias: DIZ, tamanhoDaLista: 10 });
    expect(c.nivel).toBe("alta");
    expect(c.pctIdentificado).toBe(100);
    expect(c.pendentes).toEqual({ quantidade: 0, valor: 0 });
    expect(c.impacto.podemSair).toBe(0);
    expect(c.alertar).toBe(false);
  });
  it("percentual pelo VALOR: 95% identificado fica 'alta'; 90%, 'média'; 70%, 'baixa'", () => {
    const com = (pendente: number) => calcularConfiabilidade([L("a", 100 - pendente), L(null, pendente)], periodo, { categorias: DIZ, tamanhoDaLista: 5 });
    expect(com(5).nivel).toBe("alta");
    expect(com(10).nivel).toBe("media");
    expect(com(30).nivel).toBe("baixa");
    expect(com(10).pctIdentificado).toBe(90);
    expect(com(10).pctPendente).toBe(10);
  });
  it("pendente = sem pessoa E sem classificação: anônima/ignorada já classificadas NÃO são pendência", () => {
    const anon = L(null, 500), ign = L(null, 50), pend = L(null, 10), ok = L("a", 440);
    const c = calcularConfiabilidade([anon, ign, pend, ok], periodo, { categorias: DIZ, tamanhoDaLista: 3, decisoes: new Map([[anon.id, "anonimo"], [ign.id, "ignorado"]]) });
    expect(c.pendentes).toEqual({ quantidade: 1, valor: 10 });
    expect(c.classificadas).toEqual({ quantidade: 2, valor: 550 });
    expect(c.identificadas.quantidade).toBe(1);
    expect(c.nivel).toBe("alta");   // 10 de 1.000 pendentes = 1%
  });
  it("só conta o período e as categorias do relatório", () => {
    const c = calcularConfiabilidade([L(null, 100, "Dizimos", "2026-03-01"), L(null, 100, "Ofertas"), L(null, 100, "Eventos e Vendas"), L(null, 100, "Dizimos", "2026-05-01")], periodo, { categorias: DIZ, tamanhoDaLista: 4 });
    expect(c.total.quantidade).toBe(1);
    expect(c.pendentes.quantidade).toBe(1);
  });
  it("impacto potencial: no máximo uma pessoa por pendência, nunca mais que a lista", () => {
    const linhas = [L(null, 10), L(null, 10), L(null, 10), L("a", 970)];
    expect(calcularConfiabilidade(linhas, periodo, { categorias: DIZ, tamanhoDaLista: 139 }).impacto).toEqual({ podemSair: 3, tamanhoDaLista: 139, pctDaLista: 2.16 });
    expect(calcularConfiabilidade(linhas, periodo, { categorias: DIZ, tamanhoDaLista: 2 }).impacto.podemSair).toBe(2);
  });
  it("lista de DÍZIMO: só pendência de dízimo pode mudá-la; lista de contribuição: qualquer uma", () => {
    const linhas = [L(null, 10, "Dizimos"), L(null, 10, "Ofertas"), L(null, 10, "Ofertas para Missões"), L("a", 970)];
    expect(calcularConfiabilidade(linhas, periodo, { categorias: DIZ, tamanhoDaLista: 50 }).pendentesDaLista.quantidade).toBe(1);
    expect(calcularConfiabilidade(linhas, periodo, { categorias: TODAS, tamanhoDaLista: 50 }).pendentesDaLista.quantidade).toBe(3);
  });
  it("a data dos dados: a contribuição lançada mais recente (até o fim do período) e o último extrato, quando se sabe", () => {
    const c = calcularConfiabilidade([L("a", 1, "Dizimos", "2026-07-01"), L("a", 1, "Dizimos", "2026-10-15"), L("a", 1, "Dizimos", "2026-10-25")], periodo, { categorias: DIZ, tamanhoDaLista: 1, ultimoExtrato: "2026-10-20" });
    expect(c.ultimaContribuicao).toBe("2026-10-15");   // 25/10 é depois do fim do período
    expect(c.ultimoExtrato).toBe("2026-10-20");
  });
  it("a trava: média/baixa SEMPRE alerta; alta alerta quando há muitas pendências (20 ou mais)", () => {
    expect(calcularConfiabilidade([L("a", 80), L(null, 20)], periodo, { categorias: DIZ, tamanhoDaLista: 5 }).alertar).toBe(true);
    const muitas = [L("a", 1_000_000), ...Array.from({ length: PENDENTES_PARA_ALERTAR }, () => L(null, 1))];
    const c = calcularConfiabilidade(muitas, periodo, { categorias: DIZ, tamanhoDaLista: 500 });
    expect(c.nivel).toBe("alta");
    expect(c.alertar).toBe(true);
    expect(calcularConfiabilidade([L("a", 1_000_000), L(null, 1)], periodo, { categorias: DIZ, tamanhoDaLista: 500 }).alertar).toBe(false);
  });
  it("sem nenhuma contribuição no recorte não quebra (percentuais nulos, nível alta)", () => {
    const c = calcularConfiabilidade([], periodo, { categorias: DIZ, tamanhoDaLista: 0 });
    expect(c.pctIdentificado).toBeNull();
    expect(c.nivel).toBe("alta");
  });
});

describe("os textos do quadro", () => {
  const c = calcularConfiabilidade([L("a", 580), L(null, 20, "Dizimos"), L(null, 400, "Dizimos")], periodo, { categorias: DIZ, tamanhoDaLista: 139, ultimoExtrato: "2026-10-20" });
  const t = linhasDaConfiabilidade(c).join("\n");
  it("diz o nível, o % identificado, os pendentes, o impacto potencial e a data dos dados", () => {
    for (const x of ["Confiabilidade: Baixa", "Contribuições identificadas: 58%", "Contribuições pendentes de identificação: 2", "Impacto potencial: até 2 das 139 pessoas", "Dados atualizados até: último extrato importado em 20/10/2026"]) expect(t).toContain(x);
  });
  it("o alerta fala em quantidade, valor e qualidade da identificação, e avisa que o resultado pode mudar", () => {
    const a = textoDoAlerta(c);
    expect(a).toContain("2 contribuições pendentes de identificação");
    expect(a).toContain("podem mudar");
    expect(a).toContain("Qualidade da identificação: 58%");
  });
  it("o aviso explica que só contam contribuições identificadas e vinculadas a pessoas", () => {
    expect(AVISO_SO_IDENTIFICADAS).toContain("apenas contribuições identificadas e vinculadas a pessoas");
    expect(AVISO_SO_IDENTIFICADAS).toContain("sem ter deixado de contribuir");
  });
});

// ─── no e-mail ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { analisarContribuicoes, analisarSemContribuicao, resumirBase, type PessoaDaBase } from "../../supabase/functions/_shared/contribuicoes/analise";
import { listasNominaisDoEmail } from "../../supabase/functions/_shared/contribuicoes/nominal";
import { AVISO_DISCRETO, montarEmailDeContribuicoes, subtituloDoAcompanhamento } from "../../supabase/functions/_shared/contribuicoes/email";

describe("o e-mail da lista de acompanhamento pastoral (decisão dela, 27/10/2026): simples, para o pastor e a liderança", () => {
  const pessoas: PessoaDaBase[] = ["a", "b"].map(id => ({ id, nome: `Pessoa ${id}`, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null }));
  const linhas = [L("a", 580), L(null, 20), L(null, 400)];
  const an = analisarContribuicoes(linhas, periodo);
  const sem = analisarSemContribuicao(linhas, pessoas, periodo, { considerar: "dizimo", incluirMenores: true });
  const conf = calcularConfiabilidade(linhas, periodo, { categorias: DIZ, tamanhoDaLista: sem.naoContribuiram, ultimoExtrato: "2026-10-20" });
  const montar = (extra: Parameters<typeof montarEmailDeContribuicoes>[1] = {}) => montarEmailDeContribuicoes(an, {
    blocos: ["nao_contribuiram", "sem_contribuicao_nominal"], base: resumirBase(sem), nominal: listasNominaisDoEmail(linhas, periodo, new Map(), sem, "quantidade", "dízimo registrado"),
    baseAnalisada: "membros", categorias: DIZ, confiabilidade: conf, ...extra,
  });
  it("a lista se chama 'Oportunidades de acompanhamento pastoral', com o subtítulo 'Membros ativos sem dízimos registrados no período analisado.'", () => {
    const h = montar().html, t = montar().texto;
    expect(h).toContain("Oportunidades de acompanhamento pastoral");
    expect(h).toContain("Membros ativos sem dízimos registrados no período analisado.");
    expect(t).toContain("Oportunidades de acompanhamento pastoral");
    expect(t).toContain("Membros ativos sem dízimos registrados no período analisado.");
    expect(h).not.toContain("Quem não contribuiu");
    expect(`${h} ${t}`).not.toMatch(/n[aã]o dizimistas/i);
  });
  it("o subtítulo acompanha a base e as categorias escolhidas", () => {
    expect(subtituloDoAcompanhamento("membros", ["dizimo"])).toBe("Membros ativos sem dízimos registrados no período analisado.");
    expect(subtituloDoAcompanhamento("membros_congregados", ["dizimo"])).toBe("Membros e congregados ativos sem dízimos registrados no período analisado.");
    expect(subtituloDoAcompanhamento("membros_congregados_visitantes", ["dizimo", "oferta", "missoes"])).toBe("Membros, congregados e visitantes ativos sem contribuições registradas no período analisado.");
    expect(subtituloDoAcompanhamento("membros", ["oferta"])).toBe("Membros ativos sem ofertas registradas no período analisado.");
  });
  it("UM aviso discreto, e só ele: 'Este relatório considera contribuições identificadas e vinculadas a pessoas.'", () => {
    const h = montar().html, t = montar().texto;
    expect(h).toContain(AVISO_DISCRETO);
    expect((h.match(/considera contribuições identificadas e vinculadas a pessoas/g) ?? []).length).toBe(1);
    expect((t.match(/considera contribuições identificadas e vinculadas a pessoas/g) ?? []).length).toBe(1);
    expect(AVISO_DISCRETO).toBe("Este relatório considera contribuições identificadas e vinculadas a pessoas.");
  });
  it("o quadro técnico de confiabilidade (e o alerta) NÃO vão no e-mail: ficam na tela e na gaveta de envio", () => {
    const h = montar().html, t = montar().texto;
    for (const fora of ["Confiabilidade desta lista", "Confiabilidade: Baixa", "Atenção: há contribuições pendentes", "Impacto potencial", "Dados atualizados até", "Contribuições pendentes de identificação"]) { expect(h).not.toContain(fora); expect(t).not.toContain(fora); }
  });
  it("sem a lista nominal, o aviso discreto fecha o bloco agregado (e só aparece uma vez)", () => {
    const h = montarEmailDeContribuicoes(an, { blocos: ["nao_contribuiram"], base: resumirBase(sem), baseAnalisada: "membros", categorias: DIZ }).html;
    expect((h.match(/considera contribuições identificadas e vinculadas a pessoas/g) ?? []).length).toBe(1);
    expect(h).toContain("Sem dízimo registrado no período analisado");
  });
  it("com as três categorias, o bloco agregado mantém o título de sempre", () => {
    expect(montar({ categorias: TODAS, blocos: ["nao_contribuiram"] }).html).toContain("Não contribuíram no período");
  });
});

describe("em nenhum lugar do sistema existe 'não dizimistas'", () => {
  it("nem no código da tela nem no das funções", () => {
    for (const f of ["supabase/functions/_shared/contribuicoes/email.ts", "supabase/functions/_shared/contribuicoes/nominal.ts", "supabase/functions/_shared/contribuicoes/blocos.ts", "src/components/contribuicoes/SemContribuicao.tsx", "src/pages/FinancasDoadores.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/n[aã]o dizimistas/i);
    }
  });
});
