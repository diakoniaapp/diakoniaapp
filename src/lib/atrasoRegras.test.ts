// O leitor das regras de atraso impressas nos documentos (27/10/2026). Regra de ouro: NUNCA um número no chute — só o que o texto diz com todas as letras, com o trecho e a confiança.
import { describe, expect, it } from "vitest";
import { descreverRegras, lerRegrasDeAtraso, temRegraDeAtraso } from "./atrasoRegras";

describe("boleto bancário — instruções do beneficiário", () => {
  const r = lerRegrasDeAtraso("Instruções de responsabilidade do beneficiário:\nApós o vencimento, cobrar multa de 2,00% e juros de mora de 1,00% ao mês.\nNão receber após 30 dias.");
  it("lê multa e juros", () => {
    expect(r.multa).toEqual({ tipo: "pct", valor: 2 });
    expect(r.juros).toEqual({ tipo: "pct_mes", valor: 1 });
  });
  it("90 de confiança (os dois), com o trecho original e sem aviso", () => {
    expect(r.confianca).toBe(90);
    expect(r.avisos).toEqual([]);
    expect(r.trechos.join(" | ")).toMatch(/multa de 2,00%/i);
    expect(r.trechos.join(" | ")).toMatch(/juros de mora de 1,00% ao m[eê]s/i);
  });
  it("a frase da tela", () => expect(descreverRegras(r)).toBe("multa de 2% + juros de 1% ao mês"));
});

describe("fatura de concessionária", () => {
  it("'Multa: 2%  Juros de mora: 1% a.m.' após o vencimento", () => {
    const r = lerRegrasDeAtraso("Em caso de atraso no pagamento serão cobrados: Multa: 2%  Juros de mora: 1% a.m.  Atualização monetária pelo IPCA.");
    expect(r.multa).toEqual({ tipo: "pct", valor: 2 });
    expect(r.juros).toEqual({ tipo: "pct_mes", valor: 1 });
    expect(r.correcao).toBe("IPCA");
    expect(r.avisos.join(" ")).toMatch(/IPCA.*ainda não aplica índice/);
  });
});

describe("outras formas de escrever", () => {
  it("juros ao dia em percentual", () => expect(lerRegrasDeAtraso("Após o vencimento cobrar juros de 0,033% ao dia").juros).toEqual({ tipo: "pct_dia", valor: 0.033 }));
  it("juros e multa em reais, por dia", () => {
    const r = lerRegrasDeAtraso("Após o vencimento cobrar multa de R$ 2,00 e juros de R$ 0,33 ao dia");
    expect(r.multa).toEqual({ tipo: "fixo", valor: 2 });
    expect(r.juros).toEqual({ tipo: "fixo_dia", valor: 0.33 });
  });
  it("'mora diária de R$ 0,33'", () => expect(lerRegrasDeAtraso("Após o vencimento, mora diária de R$ 0,33").juros).toEqual({ tipo: "fixo_dia", valor: 0.33 }));
  it("percentual antes da palavra: '2% de multa'", () => expect(lerRegrasDeAtraso("Em caso de atraso: 2% de multa").multa).toEqual({ tipo: "pct", valor: 2 }));
  it("juros ao ANO são convertidos para ao mês (simples) e avisados", () => {
    const r = lerRegrasDeAtraso("Após o vencimento cobrar juros de 12% ao ano");
    expect(r.juros).toEqual({ tipo: "pct_mes", valor: 1 });
    expect(r.avisos.join(" ")).toMatch(/12% ao ano.*1% ao mês/);
    expect(r.confianca).toBeLessThan(55);
  });
});

describe("desconto e limite de pagamento", () => {
  it("desconto em reais até uma data", () => expect(lerRegrasDeAtraso("Desconto de R$ 10,00 até 05/11/2026").desconto).toEqual({ tipo: "fixo", valor: 10, ate: "2026-11-05" }));
  it("desconto em percentual", () => expect(lerRegrasDeAtraso("5% de desconto até 10/11/2026").desconto).toEqual({ tipo: "pct", valor: 5, ate: "2026-11-10" }));
  it("a guia de ISS real: bancos não podem receber após a data (degrau D: peça segunda via)", () => {
    const r = lerRegrasDeAtraso("08. VALOR DA MULTA BANCOS OU CASAS LOTÉRICAS NÃO ESTÃO AUTORIZADOS\nA RECEBER ESSE DARM APÓS 06/10/2026\n09. VALOR TOTAL R$ 31,51");
    expect(r.naoReceberApos).toBe("2026-10-06");
    expect(r.multa).toBeNull();       // "VALOR DA MULTA" é um rótulo, não uma regra
    expect(temRegraDeAtraso(r)).toBe(false);
  });
});

describe("nunca no chute", () => {
  it("texto sem regra: tudo nulo, confiança 0", () => {
    const r = lerRegrasDeAtraso("NOTA FISCAL DE SERVIÇOS ELETRÔNICA nº 123 — Valor total R$ 1.500,00 — Vencimento 10/11/2026");
    expect(r).toMatchObject({ multa: null, juros: null, desconto: null, naoReceberApos: null, correcao: null, confianca: 0 });
    expect(descreverRegras(r)).toBe("");
  });
  it("'Multa: R$ 0,00' é cobrança zerada, não regra", () => expect(lerRegrasDeAtraso("Juros: R$ 0,00  Multa: R$ 0,00").multa).toBeNull());
  it("texto vazio ou nulo não quebra", () => {
    expect(lerRegrasDeAtraso("").confianca).toBe(0);
    expect(lerRegrasDeAtraso(null as unknown as string).confianca).toBe(0);
  });
  it("'Multa R$ 2,35' solta numa fatura é cobrança do mês anterior: baixa confiança e aviso (sem 'após o vencimento' não é regra)", () => {
    const r = lerRegrasDeAtraso("Detalhamento da fatura\nConsumo do mês R$ 120,00\nMulta R$ 2,35\nTotal R$ 122,35");
    expect(r.confianca).toBeLessThanOrEqual(25);
    expect(r.avisos.join(" ")).toMatch(/não diz que é a regra/);
  });
  it("percentual fora do comum é lido, mas avisado e com confiança menor", () => {
    const r = lerRegrasDeAtraso("Após o vencimento cobrar multa de 50% e juros de 1% ao mês");
    expect(r.multa).toEqual({ tipo: "pct", valor: 50 });
    expect(r.avisos.join(" ")).toMatch(/50% é maior que o usual/);
    expect(r.confianca).toBeLessThan(90);
  });
  it("com ou sem acento e em qualquer caixa", () => {
    const r = lerRegrasDeAtraso("APÓS O VENCIMENTO COBRAR MULTA DE 2% E JUROS DE 1% AO MÊS");
    expect(r.multa?.valor).toBe(2);
    expect(r.juros).toEqual({ tipo: "pct_mes", valor: 1 });
  });
});
