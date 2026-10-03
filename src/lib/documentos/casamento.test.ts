import { describe, expect, it } from "vitest";
import { acharParcelamento, casar, casarLote, semelhanca, type LancamentoPool } from "./casamento";
import type { DocumentoLido, ValorCandidato } from "./leitura";

// Tudo SINTÉTICO, modelado nos casos reais medidos em 03/10/2026.

let seq = 0;
function lanc(p: Partial<LancamentoPool> = {}): LancamentoPool {
  seq += 1;
  return {
    id: `l${String(seq).padStart(3, "0")}`, dia: "2026-08-13", valor: 52.74,
    fornecedorNome: "Supermercado Exemplo LTDA", fornecedorCnpj: "33304981000624",
    contaNome: "Caixinha", contaTipo: "caixa", status: "conciliado", temAnexo: false, ...p,
  };
}

const bruto = (valor: number): ValorCandidato => ({ valor, origem: `valor total ${valor}`, bruto: true });
const liquido = (valor: number, origem: string): ValorCandidato => ({ valor, origem, bruto: false });

function doc(p: Partial<DocumentoLido> = {}): DocumentoLido {
  return { tipo: "nfce", emitente: "SUPERMERCADO EXEMPLO LTDA", cnpj: "33304981000624", numero: "1", emissao: "2026-08-13", vencimento: null, valores: [bruto(52.74)], duplicatas: [], chave: null, ...p };
}

describe("semelhança de nomes", () => {
  it("ignora LTDA/SA, plural e caixa", () => {
    expect(semelhanca("SUPERMERCADO MUNDIAL", "Supermercados Mundial LTDA")).toBe(1);
    expect(semelhanca("AGATA DESCARTAVEIS", "Agata Com. Prod. de Hig. e Descartaveis")).toBe(1);
    expect(semelhanca("Padaria Sol", "Oficina Lua")).toBe(0);
  });
});

describe("casamento simples", () => {
  it("CNPJ + valor + data únicos → pronto, 100%, com o motivo por extenso", () => {
    const r = casar({ id: "a", leitura: doc() }, [lanc(), lanc({ valor: 99, dia: "2026-08-20" })]);
    expect(r.banda).toBe("pronto");
    expect(r.confianca).toBe(100);
    expect(r.candidatos[0].motivos.join("; ")).toContain("CNPJ 33.304.981/0006-24");
    expect(r.candidatos[0].motivos.join("; ")).toContain("valor R$ 52,74 igual");
    expect(r.candidatos[0].motivos.join("; ")).toContain("data 13/08/2026 igual");
  });

  it("cupom com desconto: casa pelo valor LÍQUIDO", () => {
    const d = doc({ valores: [liquido(86.13, "valor total 94,45 − descontos 8,32"), bruto(94.45)], emissao: "2026-08-25" });
    const r = casar({ id: "a", leitura: d }, [lanc({ valor: 86.13, dia: "2026-08-25" })]);
    expect(r.banda).toBe("pronto");
    expect(r.confianca).toBeGreaterThanOrEqual(85);
    expect(r.candidatos[0].motivos.join("; ")).toContain("valor R$ 86,13 = valor total 94,45 − descontos 8,32");
  });

  it("sem lançamento nenhum com esse valor/fornecedor → sem destino", () => {
    const r = casar({ id: "a", leitura: doc({ cnpj: "22753989000147", emitente: "DEL CASTILHO MADEIRAS", valores: [bruto(255.3)], emissao: "2026-08-10" }) }, [lanc()]);
    expect(r.banda).toBe("sem_destino");
    expect(r.candidatos.length).toBeLessThanOrEqual(5);
  });
});

describe("nunca automático quando o valor diverge", () => {
  it("mesmo fornecedor e dia, valor diferente (R$ 5.400 × R$ 5.940) → revisar com alerta", () => {
    const l = lanc({ valor: 5940, dia: "2026-08-25", fornecedorNome: "Agrottha Pisos LTDA", fornecedorCnpj: "11222333000181" });
    const r = casar({ id: "a", leitura: doc({ cnpj: "11222333000181", emitente: "AGROTTHA PISOS LTDA", valores: [bruto(5400)], emissao: "2026-08-25" }) }, [l]);
    expect(r.banda).toBe("revisar");
    expect(r.resumo).toContain("valor diverge");
    expect(r.candidatos[0].alerta).toContain("R$ 5400,00");
  });
});

describe("cartão: data da compra ≠ data da fatura", () => {
  it("CNPJ + valor batendo, compra em 18/07 e fatura em 10/08 → continua pronto", () => {
    const l = lanc({ valor: 271, dia: "2026-08-10", contaTipo: "cartao", contaNome: "Cartão de Crédito" });
    const r = casar({ id: "a", leitura: doc({ valores: [bruto(271)], emissao: "2026-07-18" }) }, [l]);
    expect(r.banda).toBe("pronto");
    expect(r.candidatos[0].motivos.join("; ")).toContain("cartão: compra em 18/07/2026");
  });

  it("a mesma diferença de data fora do cartão NÃO é perdoada", () => {
    const l = lanc({ valor: 271, dia: "2026-08-10", contaTipo: "caixa" });
    const r = casar({ id: "a", leitura: doc({ valores: [bruto(271)], emissao: "2026-07-18" }) }, [l]);
    expect(r.banda).not.toBe("pronto");
  });
});

describe("compra parcelada — 1 documento, N lançamentos", () => {
  const cartao = { contaTipo: "cartao", contaNome: "Cartão de Crédito", fornecedorCnpj: "47517276000105", fornecedorNome: "Modamusic.net LTDA" };

  it("5 parcelas lançadas uma a uma + 5 quitadas juntas (259,90) = 10 × 51,98 = NF de 519,80 → pronto", () => {
    const pool = [
      lanc({ ...cartao, valor: 51.98, dia: "2026-04-10" }), lanc({ ...cartao, valor: 51.98, dia: "2026-05-11" }),
      lanc({ ...cartao, valor: 51.98, dia: "2026-06-10" }), lanc({ ...cartao, valor: 51.98, dia: "2026-07-10" }),
      lanc({ ...cartao, valor: 51.98, dia: "2026-08-10" }), lanc({ ...cartao, valor: 259.9, dia: "2026-09-10" }),
      lanc({ ...cartao, fornecedorCnpj: "99999999000199", valor: 51.98, dia: "2026-06-10" }), // outro fornecedor: não entra
    ];
    const r = casar({ id: "nf9370", leitura: doc({ tipo: "nfe", cnpj: "47517276000105", emitente: "MODAMUSICNET LTDA", valores: [bruto(519.8)], emissao: "2026-03-24" }) }, pool);
    expect(r.banda).toBe("pronto");
    expect(r.parcelamento).toMatchObject({ n: 10, valorParcela: 51.98, encontradas: 10, faltam: 0 });
    expect(r.parcelamento!.lancamentos).toHaveLength(6);
    expect(r.resumo).toContain("10× de R$ 51,98");
  });

  it("parcela ainda não lançada (6 de 7) → revisar, dizendo quantas faltam", () => {
    const base = { ...cartao, fornecedorCnpj: "13206514000140", fornecedorNome: "M.F. Passarinho" };
    const pool = [
      lanc({ ...base, valor: 54.08, dia: "2026-06-10" }), lanc({ ...base, valor: 54.03, dia: "2026-07-10" }),
      lanc({ ...base, valor: 54.03, dia: "2026-08-10" }), lanc({ ...base, valor: 54.03, dia: "2026-09-10" }),
      lanc({ ...base, valor: 108.06, dia: "2026-10-13", status: "previsto" }),
    ];
    const r = casar({ id: "nf", leitura: doc({ tipo: "nfe", cnpj: "13206514000140", valores: [bruto(378.26)], emissao: "2026-05-13" }) }, pool);
    expect(r.banda).toBe("revisar");
    expect(r.parcelamento).toMatchObject({ n: 7, encontradas: 6, faltam: 1 });
    expect(r.resumo).toContain("faltam 1 parcela");
  });

  it("parcelas que somam 95% da nota (desconto fora da NF) NÃO viram parcelamento automático", () => {
    const base = { ...cartao, fornecedorCnpj: "08606542000114", fornecedorNome: "TNTINFO" };
    const pool = [lanc({ ...base, valor: 52.81, dia: "2026-05-11" }), lanc({ ...base, valor: 52.79, dia: "2026-06-10" }), lanc({ ...base, valor: 52.79, dia: "2026-07-10" }), lanc({ ...base, valor: 52.79, dia: "2026-08-10" }), lanc({ ...base, valor: 158.37, dia: "2026-09-10" })];
    expect(acharParcelamento({ id: "nf", leitura: doc({ cnpj: "08606542000114", valores: [bruto(389)], emissao: "2026-03-30" }) }, pool)).toBeNull();
    const r = casar({ id: "nf", leitura: doc({ cnpj: "08606542000114", valores: [bruto(389)], emissao: "2026-03-30" }) }, pool);
    expect(r.banda).not.toBe("pronto");
  });

  it("lançamentos anteriores à emissão não entram no parcelamento", () => {
    const base = { ...cartao };
    const pool = [lanc({ ...base, valor: 100, dia: "2026-01-10" }), lanc({ ...base, valor: 100, dia: "2026-02-10" })];
    expect(acharParcelamento({ id: "x", leitura: doc({ cnpj: "47517276000105", valores: [bruto(200)], emissao: "2026-03-01" }) }, pool)).toBeNull();
  });
});

describe("boleto: o vencimento faz o papel da data", () => {
  it("valor + CNPJ + vencimento no dia do pagamento → pronto, e o motivo diz 'vencimento'", () => {
    const l = lanc({ valor: 299.9, dia: "2026-09-23", contaTipo: "banco" });
    const r = casar({ id: "a", leitura: doc({ tipo: "boleto", emissao: null, vencimento: "2026-09-23", valores: [bruto(299.9)] }) }, [l]);
    expect(r.banda).toBe("pronto");
    expect(r.candidatos[0].motivos.join("; ")).toContain("vencimento 23/09/2026 igual");
  });
});

describe("valor de leitura aproximada vale menos", () => {
  it("só varredura + CNPJ + data = 28+40+20 = 88 → ainda pronto, mas sem passar dos exatos", () => {
    const aprox: ValorCandidato = { valor: 39.95, origem: "maior valor com R$", bruto: true, aproximado: true };
    const r = casar({ id: "a", leitura: doc({ valores: [aprox], emissao: "2026-08-13" }) }, [lanc({ valor: 39.95 })]);
    expect(r.candidatos[0].confianca).toBeLessThan(100);
    expect(r.candidatos[0].motivos.join("; ")).toContain("leitura aproximada");
  });
});

describe("duplicata", () => {
  it("hash igual ao de um anexo existente → duplicata, nunca liga de novo", () => {
    const r = casar({ id: "a", hash: "abc123", leitura: doc() }, [lanc()], { hashesExistentes: new Map([["abc123", "lanc-9"]]) });
    expect(r.banda).toBe("duplicata");
    expect(r.jaAnexadoEm).toBe("lanc-9");
    expect(r.candidatos).toEqual([]);
  });
});

describe("ambiguidade", () => {
  it("dois lançamentos iguais (mesmo valor, dia e fornecedor) → confiança cai e vai para revisar", () => {
    const r = casar({ id: "a", leitura: doc() }, [lanc(), lanc()]);
    expect(r.banda).toBe("revisar");
    expect(r.candidatos[0].motivos.join("; ")).toContain("outro lançamento quase igual");
  });
});

describe("só o nome do arquivo (OCR não leu nada)", () => {
  it("valor + data + fornecedor do nome, em lançamento único → pronto", () => {
    const vazio = doc({ cnpj: null, emitente: null, valores: [], emissao: null, tipo: "desconhecido" });
    const r = casar({ id: "a", leitura: vazio, nome: { data: "2026-08-13", valor: 52.74, fornecedor: "SUPERMERCADO EXEMPLO" } }, [lanc(), lanc({ valor: 7, dia: "2026-08-02" })]);
    expect(r.banda).toBe("pronto");
  });
});

describe("lote", () => {
  it("aplica em cada documento e preserva a ordem", () => {
    const rs = casarLote([{ id: "1", leitura: doc() }, { id: "2", leitura: doc({ valores: [bruto(1)] }) }], [lanc()]);
    expect(rs.map(r => r.id)).toEqual(["1", "2"]);
    expect(rs[0].banda).toBe("pronto");
    expect(rs[1].banda).not.toBe("pronto");
  });
});
