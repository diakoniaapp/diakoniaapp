import { describe, expect, it, vi } from "vitest";

// `lib/pacoteContabil` usa `nomeExtrato` e os rótulos de `finService`, que
// importa o cliente do Supabase (exige variável de ambiente). Aqui só se
// testa lógica pura — o cliente nunca é chamado.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, supabaseRel: {} }));

import {
  csvPtBr, dataPasta, diaDoPagamento, indiceCsv, nomeSeguro, pendenciasCsv, planejarPacote,
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
  it("monta Conta/dd-mm-aaaa/Fornecedor/Tipo.ext, como no exemplo dela", () => {
    const l = saida({ data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [l], [
      anexo(l, "nota_fiscal"), anexo(l, "boleto"), anexo(l, "comprovante"),
    ]);
    expect(p.raiz).toBe("Pacote_Contabil_2026_09");
    expect(p.arquivos.map(a => a.caminhoZip)).toEqual([
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint/NotaFiscal.pdf",
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint/Boleto.pdf",
      "Pacote_Contabil_2026_09/Bradesco/15-09-2026/Ecoprint/Comprovante.pdf",
    ]);
    expect(p.pendencias).toHaveLength(0);
  });

  it("dois lançamentos do mesmo fornecedor no mesmo dia ganham o valor na pasta, sem se misturar", () => {
    // Caso real: Light, 15/09/2026 — R$ 281,46 duas vezes e R$ 1.700.
    const a = saida({ fornecedor_nome: "Light Servicos de Eletricidade S.A", valor: 281.46 });
    const b = saida({ fornecedor_nome: "Light Servicos de Eletricidade S.A", valor: 281.46 });
    const c = saida({ fornecedor_nome: "Light Servicos de Eletricidade S.A", valor: 1700 });
    const p = planejarPacote(2026, 9, [a, b, c], [anexo(a, "fatura"), anexo(b, "fatura"), anexo(c, "fatura")]);
    const pastas = p.arquivos.map(x => x.caminhoZip.split("/")[3]);
    expect(new Set(pastas.map(s => s.toLowerCase())).size).toBe(3); // nenhuma colide
    expect(pastas).toContain("Light Servicos de Eletricidade S.A - R$ 1.700,00");
    expect(pastas).toContain("Light Servicos de Eletricidade S.A - R$ 281,46");
    expect(pastas).toContain("Light Servicos de Eletricidade S.A - R$ 281,46 (2)");
  });

  it("dois anexos do mesmo tipo não se sobrescrevem", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal", "a.pdf"), anexo(l, "nota_fiscal", "b.pdf")]);
    expect(p.arquivos.map(a => a.caminhoZip.split("/").pop())).toEqual(["NotaFiscal.pdf", "NotaFiscal (2).pdf"]);
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

  it("fornecedor com caractere proibido vira pasta válida", () => {
    const l = saida({ fornecedor_nome: 'Mercado "Bom/Preço": Ltda.' });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "boleto")]);
    expect(p.arquivos[0].caminhoZip).not.toMatch(/[:*?"<>|\\]/);
    expect(p.arquivos[0].caminhoZip.split("/")).toHaveLength(5); // raiz/conta/dia/pasta/arquivo
  });

  it("a extensão vem do arquivo guardado (XML, imagem)", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "xml", "p/1.XML"), anexo(l, "comprovante", "p/2.jpg")]);
    expect(p.arquivos.map(a => a.caminhoZip.split("/").pop()).sort()).toEqual(["Comprovante.jpg", "NotaFiscal-XML.xml"]);
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
