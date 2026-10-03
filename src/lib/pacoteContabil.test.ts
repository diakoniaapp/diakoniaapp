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

const nomeDoPdf = (d: { caminhoZip: string | null }) => d.caminhoZip!.split("/").pop()!;

describe("planejarPacote — Dossiê Contábil: um PDF por lançamento", () => {
  it("NF + boleto + comprovante viram UM arquivo, Conta/dd-mm-aaaa/DDMMAAAA_VALOR_DOCUMENTO_FORNECEDOR.pdf", () => {
    const l = saida({ data_pagamento: "2026-09-15", valor: 86.13, fornecedor_nome: "Supermercado Mundial LTDA", documento_numero: "12345" });
    const p = planejarPacote(2026, 9, [l], [
      anexo(l, "nota_fiscal"), anexo(l, "boleto"), anexo(l, "comprovante"),
    ]);
    expect(p.raiz).toBe("Pacote_Contabil_2026_09");
    expect(p.dossies).toHaveLength(1);
    expect(p.dossies[0].caminhoZip).toBe("Pacote_Contabil_2026_09/Bradesco/15-09-2026/15092026_86,13_12345_SUPERMERCADO_MUNDIAL_LTDA.pdf");
    expect(p.dossies[0].partes).toHaveLength(3);
    expect(p.pendencias).toHaveLength(0);
  });

  it("a ordem das páginas é a ORDEM DOCUMENTAL, não a do upload — comprovante sempre por último", () => {
    const l = saida({});
    const t = (tipo: AnexoPacote["tipo"], enviado: string): AnexoPacote => ({ ...anexo(l, tipo), url: `${l.id}/${tipo}.pdf`, enviado_em: enviado });
    // enviados em ordem EMBARALHADA de propósito
    const p = planejarPacote(2026, 9, [l], [
      t("comprovante", "2026-10-03T01:00"), t("boleto", "2026-10-03T01:01"), t("contrato", "2026-10-03T01:02"),
      t("nota_fiscal", "2026-10-03T01:03"), t("outro", "2026-10-03T01:04"), t("fatura", "2026-10-03T01:05"),
      t("dps", "2026-10-03T01:06"), t("rsp", "2026-10-03T01:07"), t("rpa", "2026-10-03T01:08"),
    ]);
    expect(p.dossies[0].partes.map(x => x.tipo)).toEqual(
      ["nota_fiscal", "rpa", "rsp", "dps", "fatura", "boleto", "contrato", "outro", "comprovante"]);
  });

  it("exemplo dela: NF + Contrato + Comprovante → página 1 NF, 2 Contrato, 3 Comprovante", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "comprovante"), anexo(l, "contrato"), anexo(l, "nota_fiscal")]);
    expect(p.dossies[0].partes.map(x => x.tipo)).toEqual(["nota_fiscal", "contrato", "comprovante"]);
  });

  it("dois do mesmo tipo seguem a ordem do upload dentro do tipo", () => {
    const l = saida({});
    const a: AnexoPacote = { ...anexo(l, "nota_fiscal", "p/2.pdf"), enviado_em: "2026-10-03T02:00" };
    const b: AnexoPacote = { ...anexo(l, "nota_fiscal", "p/1.pdf"), enviado_em: "2026-10-03T01:00" };
    expect(planejarPacote(2026, 9, [l], [a, b]).dossies[0].partes.map(x => x.storagePath)).toEqual(["p/1.pdf", "p/2.pdf"]);
  });

  it("RPA com comprovante, sem número: DDMMAAAA_760,00_RPA_NOME (exemplo dela)", () => {
    const l = saida({ data_pagamento: "2026-09-04", valor: 760, fornecedor_nome: "Ana Patrícia da Silva de Lima Oliveira" });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "rpa"), anexo(l, "comprovante")]);
    expect(nomeDoPdf(p.dossies[0])).toBe("04092026_760,00_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA.pdf");
    expect(p.dossies[0].partes.map(x => x.tipo)).toEqual(["rpa", "comprovante"]);
  });

  it("DPS sem número: DDMMAAAA_350,00_DPS_NOME", () => {
    const l = saida({ data_pagamento: "2026-09-05", valor: 350, fornecedor_nome: "Tayane Claudio Rezende de Souza" });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "dps"), anexo(l, "comprovante")]);
    expect(nomeDoPdf(p.dossies[0])).toBe("05092026_350,00_DPS_TAYANE_CLAUDIO_REZENDE_DE_SOUZA.pdf");
  });

  it("com número: RSP mantém a sigla depois do número; fatura e nota levam só o número", () => {
    const rsp = saida({ data_pagamento: "2026-09-12", valor: 1200, fornecedor_nome: "Apoio Contabil Ltda", documento_numero: "456" });
    const fat = saida({ data_pagamento: "2026-09-15", valor: 281.46, fornecedor_nome: "Light", documento_numero: "98765" });
    const p = planejarPacote(2026, 9, [rsp, fat], [anexo(rsp, "rsp"), anexo(fat, "fatura")]);
    expect(p.dossies.map(nomeDoPdf).sort()).toEqual([
      "12092026_1200,00_456_RSP_APOIO_CONTABIL_LTDA.pdf",
      "15092026_281,46_98765_LIGHT.pdf",
    ]);
  });

  it("valor sem milhar e sem moeda: 12548,92", () => {
    const l = saida({ valor: 12548.92, data_pagamento: "2026-09-02", fornecedor_nome: "Obra" });
    expect(nomeDoPdf(planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal")]).dossies[0])).toBe("02092026_12548,92_NF_OBRA.pdf");
  });

  it("sem documento_numero, usa o número que o NOME do anexo já traz (NF215273)", () => {
    const l = saida({ valor: 61.92, data_pagamento: "2026-09-01", fornecedor_nome: "Supermercados Mundial" });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal", "p/1.pdf", "01.09.2026 R$61,92 NF215273 SUPERMERCADOS MUNDIAL.pdf")]);
    expect(nomeDoPdf(p.dossies[0])).toBe("01092026_61,92_215273_SUPERMERCADOS_MUNDIAL.pdf");
  });

  it("XML: mesmo nome-base do PDF, ao lado, fora do merge", () => {
    const l = saida({ valor: 86.13, data_pagamento: "2026-09-01", fornecedor_nome: "Mundial", documento_numero: "12345" });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal"), anexo(l, "xml", "p/1.XML"), anexo(l, "comprovante")]);
    const d = p.dossies[0];
    expect(d.partes.map(x => x.tipo)).toEqual(["nota_fiscal", "comprovante"]); // o XML NÃO é parte
    expect(d.aoLado.map(x => x.caminhoZip)).toEqual(["Pacote_Contabil_2026_09/Bradesco/01-09-2026/01092026_86,13_12345_MUNDIAL.xml"]);
    expect(d.caminhoZip).toBe("Pacote_Contabil_2026_09/Bradesco/01-09-2026/01092026_86,13_12345_MUNDIAL.pdf");
    expect(p.totalXml).toBe(1);
    expect(p.totalArquivos).toBe(3);
  });

  it("lançamento só com XML: sai o XML com o nome-base, e nenhum PDF", () => {
    const l = saida({ valor: 50, data_pagamento: "2026-09-03", fornecedor_nome: "Loja" });
    const d = planejarPacote(2026, 9, [l], [anexo(l, "xml", "p/1.xml")]).dossies[0];
    expect(d.caminhoZip).toBeNull();
    expect(d.aoLado[0].caminhoZip.endsWith("03092026_50,00_NF_LOJA.xml")).toBe(true);
  });

  it("foto (JPG/PNG) é parte do dossiê, não vai ao lado", () => {
    const l = saida({});
    const d = planejarPacote(2026, 9, [l], [anexo(l, "nota_fiscal", "p/1.pdf"), anexo(l, "comprovante", "p/2.jpg"), anexo(l, "outro", "p/3.PNG")]).dossies[0];
    expect(d.partes.map(x => x.formato)).toEqual(["pdf", "png", "jpg"]); // nf, outro, comprovante
    expect(d.aoLado).toHaveLength(0);
  });

  it("COLISÃO: mesma data, valor, documento e fornecedor → entra o ID do lançamento (exemplo dela)", () => {
    const a = saida({ id: "7a44cf11-0000-0000-0000-000000000000", fornecedor_nome: "Light", valor: 281.46, data_pagamento: "2026-09-15" });
    const b = saida({ id: "bbbbbb22-0000-0000-0000-000000000000", fornecedor_nome: "Light", valor: 281.46, data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura"), anexo(b, "fatura")]);
    expect(p.dossies.map(nomeDoPdf).sort()).toEqual([
      "15092026_281,46_FATURA_LIGHT_7A44CF.pdf",
      "15092026_281,46_FATURA_LIGHT_BBBBBB.pdf",
    ]);
    expect(p.nomesComId).toBe(2);
    expect(p.nomesAjustados).toBe(0);
  });

  it("valor diferente NÃO precisa de ID: o valor já está no nome", () => {
    const a = saida({ fornecedor_nome: "Light", valor: 281.46, data_pagamento: "2026-09-15" });
    const b = saida({ fornecedor_nome: "Light", valor: 1700, data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura"), anexo(b, "fatura")]);
    expect(p.dossies.map(nomeDoPdf).sort()).toEqual(["15092026_1700,00_FATURA_LIGHT.pdf", "15092026_281,46_FATURA_LIGHT.pdf"]);
    expect(p.nomesComId).toBe(0);
  });

  it("o nome de um não muda quando o outro do grupo de colisão perde o anexo? NÃO: só quem tem arquivo entra no grupo", () => {
    // Quem NÃO gera arquivo não ocupa nome. Dois lançamentos iguais, só um anexado → nome sem ID.
    const a = saida({ fornecedor_nome: "Light", valor: 281.46, data_pagamento: "2026-09-15" });
    const b = saida({ fornecedor_nome: "Light", valor: 281.46, data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [a, b], [anexo(a, "fatura")]);
    expect(nomeDoPdf(p.dossies[0])).toBe("15092026_281,46_FATURA_LIGHT.pdf");
  });

  it("nome enorme (pessoa física): trunca só o fornecedor; data, valor e documento ficam", () => {
    const nome = "Maria das Graças Fernandes de Albuquerque Cavalcanti Nascimento Figueiredo Vasconcelos Bittencourt de Souza e Silva Pereira Mendonça Guimarães Carvalho";
    const l = saida({ fornecedor_nome: nome, valor: 760, data_pagamento: "2026-09-04", conta_nome: "Conta Corrente de Nome Realmente Muito Comprido Para Testar o Limite" });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "rpa"), anexo(l, "comprovante")]);
    const n = nomeDoPdf(p.dossies[0]);
    expect(n.startsWith("04092026_760,00_RPA_MARIA")).toBe(true);
    // o caminho relativo cabe no limite (200) mesmo com ID e "(2)" por vir
    expect(p.dossies[0].caminhoZip!.length).toBeLessThanOrEqual(200 - 11);
    expect(n.endsWith(".pdf")).toBe(true);
    expect(n).not.toMatch(/_\.pdf$/);
  });

  it("todo dossiê fica direto em Conta/Dia: 4 níveis, nunca pasta de fornecedor", () => {
    const a = saida({ fornecedor_nome: "Agata", data_pagamento: "2026-09-15" });
    const m = saida({ fornecedor_nome: "Mundial", data_pagamento: "2026-09-15" });
    const p = planejarPacote(2026, 9, [a, m], [anexo(a, "nota_fiscal"), anexo(m, "boleto")]);
    for (const d of p.dossies) expect(d.caminhoZip!.split("/")).toHaveLength(4); // raiz/conta/dia/arquivo
    expect(new Set(p.dossies.map(d => d.caminhoZip!.split("/").slice(0, 3).join("/"))).size).toBe(1);
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

  it("índice: UMA linha por lançamento, com os tipos na ordem das páginas", () => {
    const l = saida({});
    const p = planejarPacote(2026, 9, [l], [anexo(l, "comprovante"), anexo(l, "nota_fiscal")]);
    expect(p.indice).toHaveLength(1);
    expect(p.indice[0].tipo).toBe("Nota Fiscal + Comprovante de Pagamento");
    expect(p.indice[0].arquivoNoPacote.startsWith("Bradesco/15-09-2026/")).toBe(true);
  });

  it("ordem não depende da ordem de entrada (pacote igual a cada geração)", () => {
    const x = saida({ fornecedor_nome: "Zeta", data_pagamento: "2026-09-02" });
    const y = saida({ fornecedor_nome: "Alfa", data_pagamento: "2026-09-02" });
    const an = [anexo(x, "boleto"), anexo(y, "boleto")];
    const um = planejarPacote(2026, 9, [x, y], an).dossies.map(d => d.caminhoZip);
    const dois = planejarPacote(2026, 9, [y, x], an).dossies.map(d => d.caminhoZip);
    expect(um).toEqual(dois);
  });

  it("fornecedor com caractere proibido vira nome válido (sem : * ? \" < > | \\ /)", () => {
    const l = saida({ fornecedor_nome: 'Mercado "Bom/Preço": Ltda.' });
    const p = planejarPacote(2026, 9, [l], [anexo(l, "boleto")]);
    expect(nomeDoPdf(p.dossies[0])).toMatch(/^[A-Z0-9_,]+\.pdf$/);
    expect(p.dossies[0].caminhoZip!.split("/")).toHaveLength(4);
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
    expect(p.dossies.map(d => d.caminhoZip!.split("/").pop())).toEqual(["15092026_1500,00_BOLETO_BANCO_BRADESCO_S_A_237.pdf"]);
  });

  it("tarifa que mesmo assim ganhou anexo entra no pacote e não colide", () => {
    const t1 = tarifa(); const t2 = tarifa();
    const p = planejarPacote(2026, 9, [t1, t2], [anexo(t1, "comprovante"), anexo(t2, "comprovante")]);
    const nomes = p.dossies.map(d => d.caminhoZip!.split("/").pop()!.toLowerCase());
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
