import { describe, expect, it, vi } from "vitest";

// `lib/pacoteContabil` usa `nomeExtrato` e os rótulos de `finService`, que
// importa o cliente do Supabase (exige variável de ambiente). Aqui só se
// testa lógica pura — o cliente nunca é chamado.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, supabaseRel: {} }));

import {
  auditarAnexos, csvPtBr, dataPasta, diaDoPagamento, dispensaDocumento, indiceCsv, nomeSeguro,
  pendenciasCsv, planejarPacote, resumirAuditoria,
  type AnexoPacote,
} from "./pacoteContabil";
import type { FinLancamentoExtenso } from "@/services/finService";

let seq = 0;
function saida(p: Partial<FinLancamentoExtenso>): FinLancamentoExtenso {
  seq += 1;
  return {
    id: `l${String(seq).padStart(3, "0")}`, data: "2026-09-15", data_pagamento: null,
    tipo: "saida", status: "realizado", conta_id: "c1", conta_nome: "Bradesco",
    valor: 100, origem: "importado_omie", descricao: null, fornecedor_nome: "Ecoprint",
    ...p,
  } as FinLancamentoExtenso;
}
const anexo = (l: FinLancamentoExtenso, tipo: AnexoPacote["tipo"], url = `${l.id}/${tipo}.pdf`, nome = "original.pdf"): AnexoPacote =>
  ({ lancamento_id: l.id, tipo, url, nome });

describe("dia da pasta", () => {
  it("usa data_pagamento; sem ela, cai em data (5.186 de 5.189 saídas não a têm)", () => {
    expect(diaDoPagamento({ data: "2026-09-10", data_pagamento: "2026-09-15" })).toBe("2026-09-15");
    expect(diaDoPagamento({ data: "2026-09-10", data_pagamento: null })).toBe("2026-09-10");
  });
  it("formata dd-mm-aaaa", () => expect(dataPasta("2026-09-05")).toBe("05-09-2026"));
});

describe("nomeSeguro", () => {
  it("tira caracteres proibidos em pasta e o ponto/espaço final", () => {
    expect(nomeSeguro('Casa "A/B": Ltda.')).toBe("Casa A B Ltda");
  });
  it("corta nome longo e nunca devolve vazio", () => {
    expect(nomeSeguro("x".repeat(80), 50)).toHaveLength(50);
    expect(nomeSeguro("???")).toBe("Sem nome");
    expect(nomeSeguro(null)).toBe("Sem nome");
  });
});

describe("planejarPacote", () => {
  it("monta Conta/dd-mm-aaaa/Fornecedor_Tipo.ext — sem subpasta de fornecedor", () => {
    const l = saida({ data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [l], [
      anexo(l, "nota_fiscal"), anexo(l, "boleto"), anexo(l, "comprovante"),
    ]);
    expect(p.raiz).toBe("Pacote_Contabil_2026_09");
    expect(p.arquivos.map(a => a.caminhoZip)).toEqual([
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint_NotaFiscal.pdf",
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint_Boleto.pdf",
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint_Comprovante.pdf",
    ]);
    expect(p.pendencias).toHaveLength(0);
  });

  it("todo documento do dia fica direto em Conta/Dia: 4 níveis, nenhum arquivo dentro de pasta de fornecedor", () => {
    const a = saida({ fornecedor_nome: "Agata", data_pagamento: "2026-09-15" });
    const m = saida({ fornecedor_nome: "Mundial", data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [a, m], [anexo(a, "nota_fiscal"), anexo(m, "boleto")]);
    for (const f of p.arquivos) expect(f.caminhoZip.split("/")).toHaveLength(4); // raiz/conta/dia/arquivo
    expect(new Set(p.arquivos.map(f => f.caminhoZip.split("/").slice(0, 3).join("/"))).size).toBe(1);
  });

  it("mesmo fornecedor mais de uma vez no dia: o valor entra no nome (Light, caso real de 15/09)", () => {
    const a = saida({ fornecedor_nome: "Light Servicos de Eletricidade S.A", valor: 1700 });
    const b = saida({ fornecedor_nome: "Light Servicos de Eletricidade S.A", valor: 281.46 });
    const p = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura"), anexo(b, "fatura")]);
    expect(p.arquivos.map(x => x.caminhoZip.split("/").pop()).sort()).toEqual([
      "Light Servicos de Eletricidade S.A_1700,00_Fatura.pdf",
      "Light Servicos de Eletricidade S.A_281,46_Fatura.pdf",
    ]);
  });

  it("nem o valor desempata (R$ 281,46 duas vezes): entra o início do ID do lançamento", () => {
    const a = saida({ id: "aaaaaa11-0000-0000-0000-000000000000", fornecedor_nome: "Light", valor: 281.46 });
    const b = saida({ id: "bbbbbb22-0000-0000-0000-000000000000", fornecedor_nome: "Light", valor: 281.46 });
    const c = saida({ fornecedor_nome: "Light", valor: 1700 });
    const p = planejarPacote(2026, 9, [a, b, c], [anexo(a, "fatura"), anexo(b, "fatura"), anexo(c, "fatura")]);
    const nomes = p.arquivos.map(x => x.caminhoZip.split("/").pop());
    expect(new Set(nomes.map(n => n!.toLowerCase())).size).toBe(3); // nenhuma colide
    expect(nomes).toContain("Light_1700,00_Fatura.pdf");
    expect(nomes).toContain("Light_281,46_aaaaaa_Fatura.pdf");
    expect(nomes).toContain("Light_281,46_bbbbbb_Fatura.pdf");
  });

  it("o nome do arquivo não muda quando outro lançamento do dia ganha ou perde documento", () => {
    const a = saida({ fornecedor_nome: "Light", valor: 100 });
    const b = saida({ fornecedor_nome: "Light", valor: 200 });
    const so_a = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura")]).arquivos[0].caminhoZip;
    const ambos = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura"), anexo(b, "fatura")]).arquivos[0].caminhoZip;
    expect(so_a).toBe(ambos);
  });

  it("fornecedores diferentes no mesmo dia não ganham valor (só quando há repetição)", () => {
    const a = saida({ fornecedor_nome: "Agata", valor: 53 });
    const m = saida({ fornecedor_nome: "Mundial", valor: 61.92 });
    const p = planejarPacote(2026, 9, [a, m], [anexo(a, "nota_fiscal"), anexo(m, "nota_fiscal")]);
    expect(p.arquivos.map(x => x.caminhoZip.split("/").pop())).toEqual(["Agata_NotaFiscal.pdf", "Mundial_NotaFiscal.pdf"]);
  });

  it("dois anexos do mesmo tipo não se sobrescrevem", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal", "a.pdf"), anexo(l, "nota_fiscal", "b.pdf")]);
    expect(p.arquivos.map(a => a.caminhoZip.split("/").pop())).toEqual(["Ecoprint_NotaFiscal.pdf", "Ecoprint_NotaFiscal (2).pdf"]);
  });

  it("saída sem anexo vai pra pendências e o índice, e o pacote continua montado", () => {
    const com = saida({ fornecedor_nome: "Agata" });
    const sem = saida({ fornecedor_nome: "Sem Doc", valor: 53 });
    const p = planejarPacote(2026, 9, [com, sem], [anexo(com, "nota_fiscal")]);
    expect(p.totalSaidas).toBe(2);
    expect(p.comAnexo).toBe(1);
    expect(p.pendencias.map(x => x.id)).toEqual([sem.id]);
    expect(p.indice.find(i => i.fornecedor === "Sem Doc")?.semAnexo).toBe(true);
    expect(pendenciasCsv(p)).toContain("Sem Doc");
    expect(pendenciasCsv(p)).not.toContain("Agata");
  });

  it("ordem não depende da ordem de entrada (pacote igual a cada geração)", () => {
    const x = saida({ fornecedor_nome: "Zeta", data_pagamento: "2026-09-02" });
    const y = saida({ fornecedor_nome: "Alfa", data_pagamento: "2026-09-02" });
    const an = [anexo(x, "boleto"), anexo(y, "boleto")];
    const um = planejarPacote(2026, 9, [x, y], an).arquivos.map(a => a.caminhoZip);
    const dois = planejarPacote(2026, 9, [y, x], an).arquivos.map(a => a.caminhoZip);
    expect(um).toEqual(dois);
  });

  it("fornecedor com caractere proibido (ou nome enorme) vira nome de arquivo válido", () => {
    const l = saida({ fornecedor_nome: 'Mercado "Bom/Preço": Ltda. ' + "x".repeat(80) });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "boleto")]);
    expect(p.arquivos[0].caminhoZip).not.toMatch(/[:*?"<>|\\]/);
    expect(p.arquivos[0].caminhoZip.split("/")).toHaveLength(4); // raiz/conta/dia/arquivo
    expect(p.arquivos[0].caminhoZip.split("/").pop()!.length).toBeLessThanOrEqual(40 + "_Boleto.pdf".length);
  });

  it("a extensão vem do arquivo guardado (XML, imagem)", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "xml", "p/1.XML"), anexo(l, "comprovante", "p/2.jpg")]);
    expect(p.arquivos.map(a => a.caminhoZip.split("/").pop()).sort()).toEqual(["Ecoprint_Comprovante.jpg", "Ecoprint_NotaFiscal-XML.xml"]);
  });
});

describe("tarifa bancária dispensa documento", () => {
  const tarifa = (p: Partial<FinLancamentoExtenso> = {}) =>
    saida({ fornecedor_nome: "Banco Bradesco S.A. 237", categoria_nome: "Tarifas Bancárias", valor: 9.8, ...p });

  it("reconhece as categorias que dispensam (com ou sem acento/maiúscula)", () => {
    for (const n of ["Tarifas Bancárias", "Tarifa Bancaria", "IOF", "iof", "Juros", "Encargos Bancários", "  Tarifas  Bancárias "]) {
      expect(dispensaDocumento({ categoria_nome: n }), n).toBe(true);
    }
    expect(dispensaDocumento({ categoria_nome: "Energia Elétrica" })).toBe(false);
    expect(dispensaDocumento({ categoria_nome: null })).toBe(false);
    expect(dispensaDocumento({})).toBe(false);
  });

  it("NÃO dispensa 'Encargos Trabalhistas' (guias de FGTS/INSS têm documento) nem 'Multas'", () => {
    expect(dispensaDocumento({ categoria_nome: "Encargos Trabalhistas" })).toBe(false);
    expect(dispensaDocumento({ categoria_nome: "Multas" })).toBe(false);
    expect(dispensaDocumento({ categoria_nome: "Impostos e Taxas" })).toBe(false);
  });

  it("é por categoria, não por fornecedor: o mesmo banco com outra categoria exige documento", () => {
    expect(dispensaDocumento({ categoria_nome: "Título de Capitalização", fornecedor_nome: "Banco Bradesco S.A. 237" } as any)).toBe(false);
    expect(dispensaDocumento({ categoria_nome: null, fornecedor_nome: "Banco Bradesco S.A. 237" } as any)).toBe(false);
    expect(dispensaDocumento({ categoria_nome: "Tarifas Bancárias", fornecedor_nome: "Qualquer Um" } as any)).toBe(true);
  });

  it("não entra em PENDENCIAS, mas é contada e aparece no índice como dispensa", () => {
    const real = saida({ fornecedor_nome: "Agata" });
    const t1 = tarifa(); const t2 = tarifa();
    const p = planejarPacote(2026, 9, [real, t1, t2], []);
    expect(p.totalSaidas).toBe(3);
    expect(p.dispensam).toBe(2);
    expect(p.pendencias.map(x => x.id)).toEqual([real.id]);
    expect(p.comAnexo + p.dispensam + p.pendencias.length).toBe(p.totalSaidas);
    expect(indiceCsv(p)).toContain("Dispensa documento (tarifa)");
    expect(pendenciasCsv(p)).not.toContain("Banco Bradesco");
  });

  it("as repetições de tarifa NÃO forçam valor/ID no nome de um documento real do mesmo fornecedor", () => {
    // Banco Bradesco: 10 tarifas de R$ 9,80 no dia + uma saída real do mesmo
    // fornecedor com documento. Sem a exceção, o nome real viraria
    // `Banco Bradesco S.A. 237_1500,00_Boleto.pdf` por causa das tarifas.
    const tarifas = Array.from({ length: 10 }, () => tarifa());
    const real = saida({ fornecedor_nome: "Banco Bradesco S.A. 237", categoria_nome: "Empréstimos", valor: 1500 });
    const p = planejarPacote(2026, 9, [...tarifas, real], [anexo(real, "boleto")]);
    expect(p.arquivos.map(a => a.caminhoZip.split("/").pop())).toEqual(["Banco Bradesco S.A. 237_Boleto.pdf"]);
  });

  it("tarifa que mesmo assim ganhou anexo entra no pacote e não colide", () => {
    const t1 = tarifa(); const t2 = tarifa();
    const p = planejarPacote(2026, 9, [t1, t2], [anexo(t1, "comprovante"), anexo(t2, "comprovante")]);
    const nomes = p.arquivos.map(a => a.caminhoZip.split("/").pop()!.toLowerCase());
    expect(new Set(nomes).size).toBe(2);
    expect(p.dispensam).toBe(0); // com anexo, conta como "com documento"
    expect(p.comAnexo).toBe(2);
  });
});

describe("auditoria de anexos", () => {
  it("toda saída cai em exatamente uma situação: total = com + sem + dispensa", () => {
    const comNf = saida({ fornecedor_nome: "A" });
    const comDois = saida({ fornecedor_nome: "B" });
    const sem = saida({ fornecedor_nome: "C" });
    const t = saida({ fornecedor_nome: "Banco", categoria_nome: "Tarifas Bancárias" });
    const linhas = auditarAnexos([comNf, comDois, sem, t], [
      anexo(comNf, "nota_fiscal"), anexo(comDois, "nota_fiscal"), anexo(comDois, "boleto"),
    ]);
    const r = resumirAuditoria(linhas);
    expect(r).toMatchObject({ total: 4, com: 2, sem: 1, dispensa: 1 });
    expect(r.com + r.sem + r.dispensa).toBe(r.total);
  });

  it("por tipo: saída com nota e boleto conta nos dois; dois anexos do mesmo tipo contam uma vez", () => {
    const a = saida({}); const b = saida({});
    const r = resumirAuditoria(auditarAnexos([a, b], [
      anexo(a, "nota_fiscal"), anexo(a, "nota_fiscal"), anexo(a, "boleto"), anexo(b, "nota_fiscal"),
    ]));
    expect(r.porTipo.nota_fiscal).toBe(2);
    expect(r.porTipo.boleto).toBe(1);
    expect(r.porTipo.comprovante).toBe(0);
    expect(r.porTipo.xml).toBe(0);
  });

  it("recorte vazio não quebra", () => {
    expect(resumirAuditoria([])).toMatchObject({ total: 0, com: 0, sem: 0, dispensa: 0 });
  });
});

describe("CSV", () => {
  it("usa ; BOM e vírgula decimal, e neutraliza fórmula vinda do Omie", () => {
    const csv = csvPtBr([["=CMD()", "1,50", "-12,00", "ok \"x\""]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=CMD()";"1,50";"-12,00";"ok ""x"""`);
  });
  it("o índice marca falha de download", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "boleto", "p/quebrado.pdf")]);
    expect(indiceCsv(p)).toContain('"Ok"');
    expect(indiceCsv(p, new Set(["p/quebrado.pdf"]))).toContain('"FALHA NO DOWNLOAD"');
  });
});
