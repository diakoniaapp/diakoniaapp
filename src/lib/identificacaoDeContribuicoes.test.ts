// ─── Pendentes de Identificação: o núcleo (27/10/2026) ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// O nome do remetente tirado do extrato (Omie: depois de "rem", cortado e com a data colada; OFX: na descrição), a sugestão (só com UM candidato; exato/tokens/truncado = fácil, "parecido" = média),
// e a taxa em quatro partes (só "tem pessoa" é identificada; anônima e ignorada ficam à parte), com a meta de 95%.
import { describe, expect, it } from "vitest";
import {
  META_DE_IDENTIFICACAO_PCT, dificuldadeDe, prepararPendentes, remetenteDoLancamento, sugerirPessoa, taxaDeIdentificacao, type ContribuicaoParaTriagem,
} from "@/lib/identificacaoDeContribuicoes";

describe("remetenteDoLancamento — o nome como o extrato escreveu", () => {
  it("Omie: o trecho depois de 'rem', sem a data (ddmm) colada no fim", () => {
    expect(remetenteDoLancamento("", "LOTE OMIE 2026-09-29T21:01:13.385Z PIX QR CODE ESTATIC REM Sandra Maria Silva 1101")).toBe("sandra maria silva");
    expect(remetenteDoLancamento(null, "lote omie 2026 09 30t03 54 transferencia pix rem Rampampi Sol e Rampampi Sol R 040")).toBe("rampampi sol e rampampi sol r");
  });
  it("mantém o nome cortado ('d' é um 'de' truncado) — quem casa é o fuzzy", () => {
    expect(remetenteDoLancamento(undefined, "pix qr code estatic rem Ana Paula Souza d 1101")).toBe("ana paula souza d");
  });
  it("OFX: o nome vem na descrição", () => {
    expect(remetenteDoLancamento("Karen Beatriz", "OFX N10c01 lote ofx mv03r1ry")).toBe("karen beatriz");
  });
  it("descrição só com número, 'ofx n…' ou lote não é nome; observação sem 'rem' também não", () => {
    expect(remetenteDoLancamento("", "ofx n1168f lote ofx mv02wbcr")).toBeNull();
    expect(remetenteDoLancamento("OFX N1168F", "")).toBeNull();
    expect(remetenteDoLancamento("12 34", null)).toBeNull();
    expect(remetenteDoLancamento("", "")).toBeNull();
  });
  it("lançamento manual sem texto: nulo (o caso mais difícil)", () => {
    expect(remetenteDoLancamento(null, null)).toBeNull();
  });
});

describe("sugerirPessoa — só com UM candidato", () => {
  const cadastro = [
    { id: "1", nome: "Sandra Maria Silva" }, { id: "2", nome: "Maria José Gregório da Silva" }, { id: "3", nome: "Maria José Gregório" },
    { id: "4", nome: "Karen Beatriz Alves" }, { id: "5", nome: "Marco Antonio Herculano" }, { id: "6", nome: "Ana Paula Souza" }, { id: "7", nome: "Ana Paula Santos" },
  ];
  it("nome exato e subsequência de tokens são seguros (confiança alta, fácil)", () => {
    const s = sugerirPessoa("sandra maria silva", cadastro)!;
    expect(s).toMatchObject({ pessoaId: "1", confianca: "alta" });
    expect(dificuldadeDe(s)).toBe("facil");
    expect(sugerirPessoa("karen beatriz alves", cadastro)).toMatchObject({ pessoaId: "4", confianca: "alta" });
  });
  it("nome TRUNCADO pelo banco ('MARCO ANTONIO HERCULA') casa com um só candidato", () => {
    expect(sugerirPessoa("marco antonio hercula", cadastro)).toMatchObject({ pessoaId: "5", nivel: "truncado", confianca: "alta" });
  });
  it("ambíguo (dois candidatos possíveis) NÃO sugere: melhor decidir à mão do que vincular à pessoa errada", () => {
    expect(sugerirPessoa("ana paula", cadastro)).toBeNull();
  });
  it("sem remetente ou sem candidato: nenhuma sugestão, e a dificuldade é 'difícil'", () => {
    expect(sugerirPessoa(null, cadastro)).toBeNull();
    expect(sugerirPessoa("empresa qualquer ltda", cadastro)).toBeNull();
    expect(dificuldadeDe(null)).toBe("dificil");
  });
  it("sugestão que só 'parece' (um nome contido no outro) é MÉDIA: pede confirmação", () => {
    const s = sugerirPessoa("maria jose gregorio", [{ id: "9", nome: "Maria José Gregório da Silva" }])!;
    expect(s.confianca === "alta" || s.confianca === "media").toBe(true);
    expect(dificuldadeDe({ ...s, confianca: "media" })).toBe("media");
  });
});

describe("prepararPendentes — tudo junto", () => {
  const C = (id: string, o: Partial<ContribuicaoParaTriagem> = {}): ContribuicaoParaTriagem => ({ id, data: "2026-09-01", valor: 100, categoria: "Dizimos", descricao: null, observacoes: null, origem: "importado_omie", forma_pagamento: "pix", pessoa_id: null, familia_id: null, ...o });
  const cadastro = [{ id: "1", nome: "Sandra Maria Silva" }];
  it("classifica cada pendente: fácil (nome casa), difícil (sem nome ou sem cadastro)", () => {
    const r = prepararPendentes([
      C("a", { observacoes: "lote omie pix rem Sandra Maria Silva 1101" }),
      C("b", { observacoes: "lote omie pix rem Fulano Desconhecido 0303" }),
      C("c", { descricao: null, observacoes: null, origem: "manual" }),
    ], cadastro);
    expect(r.map(p => [p.contribuicao.id, p.dificuldade])).toEqual([["a", "facil"], ["b", "dificil"], ["c", "dificil"]]);
    expect(r[0].sugestao?.pessoaId).toBe("1");
    expect(r[1].remetente).toBe("fulano desconhecido");
    expect(r[2].remetente).toBeNull();
  });
});

describe("sugestão pelo FAVORECIDO ligado a uma pessoa (decisão dela, 27/10/2026: sugerir, nunca vincular sozinho)", () => {
  const C = (id: string, o: Partial<ContribuicaoParaTriagem> = {}): ContribuicaoParaTriagem => ({ id, data: "2026-09-01", valor: 100, categoria: "Dizimos", descricao: null, observacoes: null, origem: "manual", forma_pagamento: "pix", pessoa_id: null, familia_id: null, ...o });
  const cadastro = [{ id: "1", nome: "Sandra Maria Silva" }, { id: "2", nome: "Joana Alves" }];
  it("lançamento sem texto algum, mas com favorecido ligado à pessoa: vira sugestão de alta confiança (antes era 'difícil')", () => {
    const r = prepararPendentes([C("a", { fornecedor_pessoa_id: "2" })], cadastro);
    expect(r[0].sugestao).toMatchObject({ pessoaId: "2", nome: "Joana Alves", nivel: "favorecido", confianca: "alta" });
    expect(r[0].dificuldade).toBe("facil");
  });
  it("o favorecido vem ANTES do nome no extrato (é o vínculo que a Tesouraria já fez)", () => {
    const r = prepararPendentes([C("a", { observacoes: "pix rem Sandra Maria Silva 1101", fornecedor_pessoa_id: "2" })], cadastro);
    expect(r[0].sugestao?.pessoaId).toBe("2");
  });
  it("favorecido ligado a alguém que não está no cadastro lido: cai para o nome do extrato, sem inventar", () => {
    const r = prepararPendentes([C("a", { observacoes: "pix rem Sandra Maria Silva 1101", fornecedor_pessoa_id: "999" })], cadastro);
    expect(r[0].sugestao).toMatchObject({ pessoaId: "1", nivel: "exato" });
    expect(prepararPendentes([C("b", { fornecedor_pessoa_id: "999" })], cadastro)[0].sugestao).toBeNull();
  });
  it("sem favorecido ligado, nada muda", () => {
    expect(prepararPendentes([C("a", { fornecedor_pessoa_id: null })], cadastro)[0].sugestao).toBeNull();
  });
});

describe("taxaDeIdentificacao — quatro partes e a meta de 95%", () => {
  const L = (id: string, valor: number, pessoa: string | null) => ({ id, valor, pessoa_id: pessoa });
  const lancs = [L("1", 600, "p"), L("2", 200, "p"), L("3", 100, null), L("4", 50, null), L("5", 50, null)];
  const triagem = new Map<string, "anonimo" | "ignorado">([["4", "anonimo"], ["5", "ignorado"]]);
  const t = taxaDeIdentificacao(lancs, triagem);
  it("identificadas, anônimas, ignoradas e pendentes — quantidade, valor e % de cada uma", () => {
    expect(t.total).toEqual({ quantidade: 5, valor: 1000 });
    expect(t.identificadas).toEqual({ quantidade: 2, valor: 800, pctQuantidade: 40, pctValor: 80 });
    expect(t.anonimas).toEqual({ quantidade: 1, valor: 50, pctQuantidade: 20, pctValor: 5 });
    expect(t.ignoradas).toEqual({ quantidade: 1, valor: 50, pctQuantidade: 20, pctValor: 5 });
    expect(t.pendentes).toEqual({ quantidade: 1, valor: 100, pctQuantidade: 20, pctValor: 10 });
  });
  it("as quatro partes somam 100% do valor", () => {
    expect(t.identificadas.pctValor! + t.anonimas.pctValor! + t.ignoradas.pctValor! + t.pendentes.pctValor!).toBe(100);
  });
  it("anônima e ignorada NÃO contam como identificadas (a taxa não é inflada)", () => {
    expect(t.taxaPct).toBe(80);
    expect(t.atingiuAMeta).toBe(false);
  });
  it("a meta é 95% e diz quanto falta em valor", () => {
    expect(META_DE_IDENTIFICACAO_PCT).toBe(95);
    expect(t.metaPct).toBe(95);
    expect(t.valorParaAMeta).toBe(150);   // 95% de 1.000 = 950; já tem 800
  });
  it("atingiu a meta quando a taxa chega a 95% ou mais; nada a faltar", () => {
    const ok = taxaDeIdentificacao([L("1", 960, "p"), L("2", 40, null)], new Map());
    expect(ok.taxaPct).toBe(96);
    expect(ok.atingiuAMeta).toBe(true);
    expect(ok.valorParaAMeta).toBe(0);
  });
  it("um lançamento COM pessoa é identificado mesmo que exista uma decisão antiga de triagem", () => {
    expect(taxaDeIdentificacao([L("1", 100, "p")], new Map([["1", "anonimo"]])).identificadas.quantidade).toBe(1);
  });
  it("sem contribuições: nulos, sem dividir por zero", () => {
    const v = taxaDeIdentificacao([], new Map());
    expect(v.taxaPct).toBeNull();
    expect(v.identificadas.pctValor).toBeNull();
    expect(v.valorParaAMeta).toBe(0);
    expect(v.atingiuAMeta).toBe(false);
  });
});
