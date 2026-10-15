import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAXIMO_BYTES, caminhoNoPacote, caminhoNoStorage, checklistDeDocumentos, estruturaDoFechamentoZip, extensaoDe, indiceDosDocumentosCsv, nomeSeguro, problemaDoArquivo,
  resumoDoChecklist, sugerirTipo, TIPOS_DE_DOCUMENTO, type TipoDeDocumento,
} from "./fechamentoDocumentos";

const doc = (tipo: TipoDeDocumento, removidoEm: string | null = null) => ({ tipo, removidoEm });

describe("o checklist de documentos do fechamento", () => {
  it("tem os quatro itens, na ordem pedida, todos faltando num mês vazio", () => {
    const c = checklistDeDocumentos([], []);
    expect(c.map(i => i.rotulo)).toEqual(["Extrato bancário anexado", "OFX anexado", "Cartão anexado", "Adquirente anexado"]);
    expect(c.every(i => i.estado === "faltando")).toBe(true);
    expect(resumoDoChecklist(c)).toEqual({ total: 4, atendidos: 0, faltando: 4, completo: false });
  });

  it("um arquivo do tipo certo marca o item; Cielo OU Rede atendem o adquirente", () => {
    const c = checklistDeDocumentos([doc("extrato_bancario"), doc("ofx"), doc("adquirente_rede")], []);
    expect(c.map(i => i.estado)).toEqual(["anexado", "anexado", "faltando", "anexado"]);
    expect(c[3].arquivos).toBe(1);
  });

  it("aplicação, rendimento e outros entram no malote mas não atendem item do checklist", () => {
    const c = checklistDeDocumentos([doc("aplicacao"), doc("rendimento"), doc("outro")], []);
    expect(c.every(i => i.estado === "faltando")).toBe(true);
  });

  it("documento removido não conta", () => {
    const c = checklistDeDocumentos([doc("ofx", "2026-10-02T10:00:00Z")], []);
    expect(c[1].estado).toBe("faltando");
  });

  it("'não se aplica' dispensa o item, com o motivo; desfeita, volta a faltar", () => {
    const c = checklistDeDocumentos([], [{ grupo: "cartao", motivo: "nenhum cartão usado" }]);
    expect(c[2]).toMatchObject({ estado: "dispensado", motivoDaDispensa: "nenhum cartão usado" });
    expect(resumoDoChecklist(c).faltando).toBe(3);
    expect(checklistDeDocumentos([], [{ grupo: "cartao", motivo: "x", desfeitaEm: "2026-10-03T00:00:00Z" }])[2].estado).toBe("faltando");
  });

  it("anexar vale mais que dispensar: se o arquivo chegou, o item está atendido de verdade", () => {
    const c = checklistDeDocumentos([doc("fatura_cartao")], [{ grupo: "cartao", motivo: "nenhum cartão usado" }]);
    expect(c[2]).toMatchObject({ estado: "anexado", motivoDaDispensa: null });
  });

  it("completo = nenhum item faltando (anexado ou dispensado)", () => {
    const c = checklistDeDocumentos([doc("extrato_bancario"), doc("ofx")], [{ grupo: "cartao", motivo: "sem cartão" }, { grupo: "adquirente", motivo: "sem vendas" }]);
    expect(resumoDoChecklist(c).completo).toBe(true);
  });
});

describe("o arquivo", () => {
  it("aceita os formatos do fechamento e recusa o resto, em português", () => {
    for (const n of ["extrato.pdf", "set.OFX", "relatorio.xlsx", "foto.JPG", "dados.csv"]) expect(problemaDoArquivo({ name: n, size: 1000 })).toBeNull();
    expect(problemaDoArquivo({ name: "programa.exe", size: 1000 })).toMatch(/Formato não aceito/);
    expect(problemaDoArquivo({ name: "semextensao", size: 1000 })).toMatch(/sem extensão/);
    expect(problemaDoArquivo({ name: "vazio.pdf", size: 0 })).toMatch(/vazio/);
    expect(problemaDoArquivo({ name: "grande.pdf", size: TAMANHO_MAXIMO_BYTES + 1 })).toMatch(/passa de 25 MB/);
  });

  it("sugere o tipo pelo nome (a pessoa confirma)", () => {
    expect(sugerirTipo("Extrato_Bradesco_set.pdf")).toBe("extrato_bancario");
    expect(sugerirTipo("movimento.ofx")).toBe("ofx");
    expect(sugerirTipo("Vendas Cielo 09.xlsx")).toBe("adquirente_cielo");
    expect(sugerirTipo("relatorio_rede_setembro.pdf")).toBe("adquirente_rede");
    expect(sugerirTipo("fatura cartão visa.pdf")).toBe("fatura_cartao");
    expect(sugerirTipo("rendimentos.pdf")).toBe("rendimento");
    expect(sugerirTipo("aplicação CDB.pdf")).toBe("aplicacao");
    expect(sugerirTipo("qualquer.pdf")).toBeNull();
  });

  it("nome seguro: sem acento nem caractere perigoso, com a extensão, nunca vazio", () => {
    expect(nomeSeguro("Extrato Março/2026 (final).PDF")).toBe("Extrato_Marco_2026_final.pdf");
    expect(nomeSeguro("../../etc/passwd.txt")).toBe("etc_passwd.txt");
    expect(nomeSeguro("###.pdf")).toBe("documento.pdf");
    expect(extensaoDe("a.b.OFX")).toBe("ofx");
  });

  it("o caminho no armazenamento leva o mês e um id único (nunca colide)", () => {
    expect(caminhoNoStorage(2026, 9, "abc", "Extrato Set.pdf")).toBe("2026-09/abc-Extrato_Set.pdf");
  });
});

describe("a estrutura do pacote e do ZIP do fechamento", () => {
  it("dentro do pacote: Documentos do fechamento / pasta do tipo / arquivo, sem colisão de nomes", () => {
    const usados = new Set<string>();
    const raiz = "Pacote_Contabil_2026_09";
    expect(caminhoNoPacote(raiz, { tipo: "extrato_bancario", arquivoNome: "extrato.pdf" }, usados)).toBe(`${raiz}/Documentos do fechamento/Extratos bancários/extrato.pdf`);
    expect(caminhoNoPacote(raiz, { tipo: "extrato_bancario", arquivoNome: "extrato.pdf" }, usados)).toBe(`${raiz}/Documentos do fechamento/Extratos bancários/extrato_2.pdf`);
    expect(caminhoNoPacote(raiz, { tipo: "adquirente_cielo", arquivoNome: "vendas.xlsx" }, usados)).toBe(`${raiz}/Documentos do fechamento/Adquirentes/Cielo/vendas.xlsx`);
    expect(caminhoNoPacote(raiz, { tipo: "ofx", arquivoNome: "EXTRATO.PDF" }, usados)).toContain("/OFX/");
  });

  it("FASE FUTURA: Fechamento_AAAA_MM.zip com malote, extratos, OFX, cartões e adquirentes", () => {
    const e = estruturaDoFechamentoZip(2026, 9);
    expect(e.raiz).toBe("Fechamento_2026_09");
    expect(e.arquivoZip).toBe("Fechamento_2026_09.zip");
    expect(e.malote).toBe("Fechamento_2026_09/Malote");
    expect(e.pastas.extrato_bancario).toBe("Fechamento_2026_09/Extratos bancários");
    expect(e.pastas.ofx).toBe("Fechamento_2026_09/OFX");
    expect(e.pastas.fatura_cartao).toBe("Fechamento_2026_09/Cartões");
    expect(e.pastas.adquirente_cielo).toBe("Fechamento_2026_09/Adquirentes/Cielo");
    expect(e.pastas.adquirente_rede).toBe("Fechamento_2026_09/Adquirentes/Rede");
    expect(Object.keys(e.pastas).sort()).toEqual(TIPOS_DE_DOCUMENTO.map(t => t.tipo).sort());
  });

  it("o índice registra tipo, arquivo, conta e QUEM incluiu e QUANDO; texto que vira fórmula é neutralizado", () => {
    const csv = indiceDosDocumentosCsv([{
      tipo: "ofx", arquivoNome: "set.ofx", caminho: "Documentos do fechamento/OFX/set.ofx", descricao: "=HIPERLINK(\"x\")", contaNome: "Bradesco", tamanhoBytes: 2048,
      incluidoEm: "2026-10-05T12:00:00Z", incluidoPorNome: "Ana",
    }], iso => `data(${iso})`);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("\"Tipo\";\"Arquivo\";\"Caminho no pacote\";\"Descrição\";\"Conta\";\"Tamanho (KB)\";\"Incluído em\";\"Incluído por\"");
    expect(csv).toContain("\"OFX\";\"set.ofx\"");
    expect(csv).toContain("\"2,0\";\"data(2026-10-05T12:00:00Z)\";\"Ana\"");
    expect(csv).toContain("\"'=HIPERLINK(");
  });
});
