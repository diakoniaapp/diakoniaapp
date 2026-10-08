import { describe, expect, it } from "vitest";
import {
  chaveDoMemo, maisVotado, montarContexto, regraDoDizimo, resumirPainel, sugerir,
  type CategoriaRef, type Historico, type Linha,
} from "./classificacaoOfx";

const CATS: CategoriaRef[] = [
  { id: "diz", nome: "Dizimos", tipo: "entrada" },
  { id: "ofe", nome: "Ofertas", tipo: "entrada" },
  { id: "mis", nome: "Ofertas para Missões", tipo: "entrada" },
  { id: "ren", nome: "Rendimentos de Aplicações", tipo: "entrada" },
  { id: "tar", nome: "Tarifas Bancárias", tipo: "saida" },
  { id: "luz", nome: "Energia Elétrica", tipo: "saida" },
];
const CADASTRO = {
  pessoas: [
    { id: "p-vanessa", nome: "Vanessa do Nascimento" },
    { id: "p-joao", nome: "João Silva" },
    { id: "p-nova", nome: "Pessoa Sem Histórico" },
  ],
  fornecedores: [{ id: "f-light", nome: "Light Serviços de Eletricidade" }],
};
const linha = (p: Partial<Linha> = {}): Linha => ({ fitid: "1", tipo: "entrada", data: "2026-09-01", valor: 500, memo: "PIX RECEBIDO REM: VANESSA DO NASCIMENTO", ...p });
const hist = (p: Partial<Historico>): Historico => ({
  tipo: "entrada", dia: "2026-08-01", valor: 500, pessoaId: "p-vanessa", fornecedorId: null, categoriaId: "diz", centroId: "c-adm", chave: "", ...p,
});
/** n dízimos mensais, o mais recente 30 dias antes de 2026-09-01 */
const dizimosMensais = (n: number, valor = 500, pessoaId = "p-vanessa") =>
  Array.from({ length: n }, (_, i) => hist({ pessoaId, valor, dia: new Date(Date.UTC(2026, 7 - (n - 1 - i), 1)).toISOString().slice(0, 10) }));
const ctx = (h: Historico[]) => montarContexto(CADASTRO, CATS, h);

describe("regra do dízimo (a dela): cadastrada + mais de 3 + mesma faixa + mensal", () => {
  it("cumpre tudo → aplica", () => {
    const r = regraDoDizimo(dizimosMensais(6), "diz", 500, "2026-09-01");
    expect(r.aplica).toBe(true);
  });
  it("exatamente 3 dízimos NÃO basta (é 'mais de 3')", () => {
    expect(regraDoDizimo(dizimosMensais(3), "diz", 500, "2026-09-01")).toMatchObject({ aplica: false, parcial: false });
  });
  it("4 dízimos já basta", () => {
    expect(regraDoDizimo(dizimosMensais(4), "diz", 500, "2026-09-01").aplica).toBe(true);
  });
  it("valor fora da faixa (mediana 500, veio 1.200) → não aplica, fica como parcial", () => {
    expect(regraDoDizimo(dizimosMensais(6), "diz", 1200, "2026-09-01")).toMatchObject({ aplica: false, parcial: true });
  });
  it("faixa tolera ±30%: 400 e 640 passam; 340 e 700 não", () => {
    const h = dizimosMensais(6);
    expect(regraDoDizimo(h, "diz", 400, "2026-09-01").aplica).toBe(true);
    expect(regraDoDizimo(h, "diz", 640, "2026-09-01").aplica).toBe(true);
    expect(regraDoDizimo(h, "diz", 340, "2026-09-01").aplica).toBe(false);
    expect(regraDoDizimo(h, "diz", 700, "2026-09-01").aplica).toBe(false);
  });
  it("sem periodicidade mensal (tudo no mesmo mês ou de trimestre em trimestre) → não aplica", () => {
    const trimestral = [0, 3, 6, 9, 12].map(m => hist({ dia: new Date(Date.UTC(2025, m, 1)).toISOString().slice(0, 10) }));
    expect(regraDoDizimo(trimestral, "diz", 500, "2026-09-01")).toMatchObject({ aplica: false, parcial: true });
  });
  it("sem categoria Dízimo no cadastro de categorias: nunca aplica", () => {
    expect(regraDoDizimo(dizimosMensais(6), undefined, 500, "2026-09-01").aplica).toBe(false);
  });
});

describe("sugerir — entradas", () => {
  it("Vanessa, 6 dízimos mensais de R$ 500: Dízimo, 96%, identificada, com os motivos", () => {
    const s = sugerir(linha(), ctx(dizimosMensais(6)));
    expect(s).toMatchObject({ categoriaId: "diz", confianca: 96, banda: "identificada", forma: "pix", pessoa: { id: "p-vanessa" }, centroId: "c-adm" });
    expect(s.motivos.join(" ")).toMatch(/6 dízimos/);
    expect(s.motivos.join(" ")).toMatch(/mensal/);
  });

  it("o texto diz MISSÕES: Oferta para Missões, 92%", () => {
    const s = sugerir(linha({ memo: "PIX RECEBIDO REM: JOÃO SILVA MISSÕES", valor: 100 }), ctx([]));
    expect(s).toMatchObject({ categoriaId: "mis", confianca: 92, banda: "identificada", pessoa: { id: "p-joao" } });
  });

  it("cadastrada, valor aleatório, sem histórico: Oferta, 62% — vai para revisão", () => {
    const s = sugerir(linha({ memo: "PIX RECEBIDO REM: PESSOA SEM HISTORICO", valor: 137.9 }), ctx([]));
    expect(s).toMatchObject({ categoriaId: "ofe", confianca: 62, banda: "revisar" });
  });

  it("histórico dominado por Oferta, sem padrão de dízimo: Oferta com confiança proporcional", () => {
    const h = [100, 20, 340, 55, 80].map((v, i) => hist({ categoriaId: "ofe", valor: v, dia: `2026-0${i + 3}-${10 + i}` }));
    const s = sugerir(linha({ valor: 75 }), ctx(h));
    expect(s.categoriaId).toBe("ofe");
    expect(s.confianca).toBeGreaterThanOrEqual(85);
  });

  it("APRENDIZADO: ela corrigiu as últimas 3 de Oferta → Dízimo e a sugestão muda (as recentes pesam mais)", () => {
    const antigas = [1, 2, 3, 4, 5, 6].map(m => hist({ categoriaId: "ofe", valor: 80, dia: `2025-0${m}-15` }));
    const recentes = ["2026-07-15", "2026-08-15", "2026-09-15"].map(d => hist({ categoriaId: "diz", valor: 80, dia: d }));
    expect(maisVotado([...antigas, ...recentes], "categoriaId")?.id).toBe("diz");
    // sem as recentes, voltaria a Oferta
    expect(maisVotado(antigas, "categoriaId")?.id).toBe("ofe");
  });

  it("UMA correção isolada NÃO vira a regra (pode ser exceção); duas consistentes, sim", () => {
    const antigas = [1, 2, 3, 4, 5, 6].map(m => hist({ categoriaId: "ofe", dia: `2025-0${m}-15` }));
    expect(maisVotado([...antigas, hist({ categoriaId: "diz", dia: "2026-09-15" })], "categoriaId")?.id).toBe("ofe");
    expect(maisVotado([...antigas, hist({ categoriaId: "diz", dia: "2026-08-15" }), hist({ categoriaId: "diz", dia: "2026-09-15" })], "categoriaId")?.id).toBe("diz");
  });

  it("anônimo: Oferta, 60%, pede conferência", () => {
    const s = sugerir(linha({ memo: "PIX RECEBIDO REM: ANÔNIMO" }), ctx([]));
    expect(s).toMatchObject({ categoriaId: "ofe", confianca: 60, banda: "revisar" });
    expect(s.pessoa).toBeUndefined();
  });

  it("nome que NÃO está no cadastro: não inventa pessoa; oferta com confiança baixa → revisar", () => {
    const s = sugerir(linha({ memo: "PIX RECEBIDO REM: FULANO DE TAL INEXISTENTE" }), ctx([]));
    expect(s.pessoa).toBeUndefined();
    expect(s).toMatchObject({ categoriaId: "ofe", confianca: 62, banda: "revisar" });
    expect(s.motivos.join(" ")).toMatch(/não está no cadastro/);
  });

  it("nome só PARECIDO (sobrenome a mais no cadastro) sugere a pessoa, mas nunca passa de 80% → revisar", () => {
    const cad = { pessoas: [{ id: "p-mj", nome: "João Carlos Pereira Lima" }], fornecedores: [] };
    const h = Array.from({ length: 6 }, (_, i) => hist({ pessoaId: "p-mj", dia: `2026-0${i + 2}-01` }));
    const s = sugerir(linha({ memo: "PIX RECEBIDO REM: JOAO PEREIRA" }), montarContexto(cad, CATS, h));
    expect(s.pessoa).toMatchObject({ id: "p-mj" });
    expect(s.confianca).toBeLessThanOrEqual(80);
    expect(s.banda).toBe("revisar");
    expect(s.motivos.join(" ")).toMatch(/nome parecido/);
  });

  it("nome parecido AMBÍGUO (duas Marias José) não liga a ninguém", () => {
    const cad = { pessoas: [{ id: "a", nome: "João Carlos Pereira Lima" }, { id: "b", nome: "João Paulo Pereira Santos" }], fornecedores: [] };
    expect(sugerir(linha({ memo: "PIX RECEBIDO REM: JOAO PEREIRA" }), montarContexto(cad, CATS, [])).pessoa).toBeUndefined();
  });

  it("rendimento: pela categoria Rendimentos, mesmo sem histórico", () => {
    const s = sugerir(linha({ memo: "RENTAB.INVEST FACILCRED*", valor: 0.03 }), ctx([]));
    expect(s).toMatchObject({ categoriaId: "ren", banda: "identificada" });
  });

  it("texto repetido (depósito em ATM) aprende pelo histórico do próprio texto", () => {
    const chave = chaveDoMemo("DEP DINHEIRO ATM 0123");
    const h = [1, 2, 3].map(i => hist({ pessoaId: null, categoriaId: "ofe", chave, dia: `2026-0${i + 4}-01` }));
    expect(sugerir(linha({ memo: "DEP DINHEIRO ATM 0999", valor: 600 }), ctx(h)).categoriaId).toBe("ofe");
  });
});

describe("sugerir — saídas e transferências", () => {
  it("fornecedor conhecido: categoria e centro do histórico dele", () => {
    const h = Array.from({ length: 6 }, (_, i) => hist({ tipo: "saida", pessoaId: null, fornecedorId: "f-light", categoriaId: "luz", centroId: "c-infra", dia: `2026-0${i + 1}-10` }));
    const s = sugerir(linha({ tipo: "saida", memo: "PIX ENVIADO DES LIGHT SERVICOS DE ELETRICIDADE", valor: 281.46 }), ctx(h));
    expect(s).toMatchObject({ categoriaId: "luz", centroId: "c-infra", fornecedor: { id: "f-light" }, banda: "identificada" });
  });
  it("tarifa bancária, sem histórico: pela categoria Tarifas", () => {
    expect(sugerir(linha({ tipo: "saida", memo: "TARIFA BANCARIA TRANSF PGTO PIX", valor: 9.8 }), ctx([])))
      .toMatchObject({ categoriaId: "tar", banda: "identificada" });
  });
  it("transferência entre contas (poupança, autorizada): vira Transferência, nunca receita", () => {
    const s = sugerir(linha({ memo: "BAIXA AUTOMAT POUPANCA*", valor: 3000 }), ctx([]));
    expect(s.transferencia).toBe(true);
    expect(s.categoriaId).toBeUndefined();
    expect(s.banda).toBe("revisar");
  });
  it("'TRANSF AUTORIZ ENTRE AGS <nome de pessoa>' é contribuição de pessoa, NÃO transferência interna", () => {
    const s = sugerir(linha({ memo: "TRANSF AUTORIZ ENTRE AGS VANESSA DO NASCIMENTO", valor: 830 }), ctx(dizimosMensais(6, 830)));
    expect(s.transferencia).toBeFalsy();
    expect(s.pessoa?.id).toBe("p-vanessa");
    expect(s.motivos.join(" ")).toMatch(/TRANSF, mas o texto traz um nome de pessoa/);
  });
  it("com CPF no texto, também é pessoa; sem cadastro, fica para identificar — nunca transferência", () => {
    const s = sugerir(linha({ memo: "TRANSF AUTORIZ ENTRE AGS 123.456.789-09", valor: 100 }), ctx([]));
    expect(s.transferencia).toBeFalsy();
  });
  it("o nome da própria igreja não conta como pessoa: transferência entre agências dela continua interna", () => {
    expect(sugerir(linha({ memo: "TRANSF AUTORIZ ENTRE AGS QUARTA IGREJA BATISTA" }), ctx([])).transferencia).toBe(true);
    expect(sugerir(linha({ memo: "APLIC INVEST FACIL", tipo: "saida" }), ctx([])).transferencia).toBe(true);
  });
  it("saída para quem não conhecemos: não identificada", () => {
    expect(sugerir(linha({ tipo: "saida", memo: "PIX ENVIADO DES EMPRESA QUE NUNCA VIMOS" }), ctx([])).banda).toBe("nao_identificada");
  });
});

describe("faixas e painel", () => {
  it("o painel soma as três faixas (e as transferências à parte)", () => {
    const h = dizimosMensais(6);
    const linhas: Linha[] = [
      linha({ fitid: "a" }),                                                       // identificada
      linha({ fitid: "b", memo: "PIX RECEBIDO REM: PESSOA SEM HISTORICO" }),       // revisar
      linha({ fitid: "c", tipo: "saida", memo: "PIX ENVIADO DES FULANO ALHEIO INEXISTENTE" }), // não identificada
      linha({ fitid: "d", memo: "BAIXA AUTOMAT POUPANCA*" }),                      // transferência (revisar)
    ];
    const p = resumirPainel(linhas.map(l => sugerir(l, ctx(h))));
    expect(p).toEqual({ total: 4, identificadas: 1, revisar: 2, naoIdentificadas: 1, transferencias: 1 });
    expect(p.identificadas + p.revisar + p.naoIdentificadas).toBe(p.total);
  });
  it("chave do memo ignora números e acento", () => {
    expect(chaveDoMemo("TARIFA BANCARIA TRANSF PGTO PIX 0109")).toBe("tarifa bancaria transf pgto pix");
  });
});

describe("texto genérico de cobrança não sugere categoria (pedido dela, 08/10/2026)", () => {
  it("'PAGTO ELETRON COBRANCA PAG COBRANCA <empresa>' sem favorecido: genérico, sem categoria e sem alternativas", () => {
    const s = sugerir(linha({ tipo: "saida", memo: "PAGTO ELETRON COBRANCA PAG COBRANCA EMPRESA QUALQUER", valor: 300 }), ctx([]));
    expect(s.generico).toBe(true);
    expect(s.categoriaId).toBeUndefined();
    expect(s.alternativas).toEqual([]);
    expect(s.banda).toBe("nao_identificada");
  });
});
