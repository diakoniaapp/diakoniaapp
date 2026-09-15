// ─── Testes de `ocrService.ts` ───────────────────────────────────────────
//
// Cobre as duas partes puras (sem PDF/Tesseract de verdade): as heurísticas
// de campo (`extrairCamposDoTexto`, usadas tanto pra texto exato de PDF
// quanto pra saída do OCR) e a reconstrução de linha a partir de posição
// (x, y) do pdf.js (`agruparEmLinhas`) — foi exatamente aqui que um bug
// real apareceu ao escrever `textoDoPdf` (15/09/2026): juntar os
// fragmentos de texto sem reconstruir a linha visual quebrava
// `extrairRazaoSocial`, que depende de contar linhas.
import { describe, it, expect } from "vitest";
import { extrairCamposDoTexto, agruparEmLinhas } from "./ocrService";

describe("extrairCamposDoTexto", () => {
  it("lê valor (o maior — o total), data, CNPJ e razão social de um texto de DANFE simulado", () => {
    const texto = [
      "PREFEITURA DO RIO DE JANEIRO",
      "OBRAMAX ATACADO DE CONSTRUCAO LTDA",
      "CNPJ: 12.345.678/0001-90",
      "DANFE Nº 004512",
      "Data de emissão: 13/09/2026",
      "Item 1 - Cimento .......... 45,00",
      "Item 2 - Areia ............ 30,90",
      "VALOR TOTAL R$ 656,90",
    ].join("\n");

    const r = extrairCamposDoTexto(texto);
    expect(r.valor).toBe(656.90); // o maior valor do texto, não o primeiro
    expect(r.data).toBe("2026-09-13");
    expect(r.cnpj).toBe("12345678000190");
    expect(r.cnpjFormatado).toBe("12.345.678/0001-90");
    expect(r.razaoSocial).toBe("OBRAMAX ATACADO DE CONSTRUCAO LTDA");
    expect(r.numeroDoc).toBe("004512");
  });

  it("aceita CNPJ só em dígitos, sem máscara", () => {
    const r = extrairCamposDoTexto("EMPRESA TESTE LTDA\n12345678000190\nTotal 10,00");
    expect(r.cnpj).toBe("12345678000190");
    expect(r.razaoSocial).toBe("EMPRESA TESTE LTDA");
  });

  it("não inventa razão social quando não há CNPJ no texto", () => {
    const r = extrairCamposDoTexto("Recibo de pagamento\nValor 50,00\nSem CNPJ aqui");
    expect(r.cnpj).toBeNull();
    expect(r.razaoSocial).toBeNull();
  });

  it("ignora data no futuro (não pode ser a data da nota)", () => {
    const futuro = new Date();
    futuro.setFullYear(futuro.getFullYear() + 1);
    const dd = String(futuro.getDate()).padStart(2, "0");
    const mm = String(futuro.getMonth() + 1).padStart(2, "0");
    const texto = `Vencimento futuro ${dd}/${mm}/${futuro.getFullYear()}\nEmissão 01/01/2026`;
    const r = extrairCamposDoTexto(texto);
    expect(r.data).toBe("2026-01-01");
  });

  it("devolve tudo null pra texto sem nenhum campo reconhecível", () => {
    const r = extrairCamposDoTexto("texto qualquer sem nada estruturado");
    expect(r.valor).toBeNull();
    expect(r.data).toBeNull();
    expect(r.cnpj).toBeNull();
    expect(r.numeroDoc).toBeNull();
  });

  it("reconhece o número da nota em formatos comuns (NF-e, Nº, N°)", () => {
    expect(extrairCamposDoTexto("NF-e Nº 123456").numeroDoc).toBe("123456");
    expect(extrairCamposDoTexto("Nota Fiscal N° 98765").numeroDoc).toBe("98765");
  });
});

describe("agruparEmLinhas", () => {
  it("junta fragmentos na mesma altura (Y) numa única linha, em ordem X", () => {
    // pdf.js entrega fragmentos fora de ordem de leitura (ordem de desenho);
    // aqui simulado com "SOCIAL" vindo antes de "RAZÃO" no array.
    const itens = [
      { texto: "SOCIAL", x: 50, y: 700 },
      { texto: "RAZÃO", x: 10, y: 700 },
      { texto: "12.345.678/0001-90", x: 10, y: 680 },
    ];
    const linhas = agruparEmLinhas(itens);
    expect(linhas).toEqual(["RAZÃO SOCIAL", "12.345.678/0001-90"]);
  });

  it("trata Y quase igual (dentro da tolerância) como a mesma linha", () => {
    const itens = [
      { texto: "A", x: 0, y: 700.4 },
      { texto: "B", x: 10, y: 699.1 }, // 1.3px de diferença — mesma linha na prática
    ];
    expect(agruparEmLinhas(itens)).toEqual(["A B"]);
  });

  it("separa linhas com Y claramente diferente — é essa separação que faz o CNPJ ficar em linha própria, pra extrairRazaoSocial contar linhas acima dele", () => {
    const itens = [
      { texto: "EMPRESA TESTE LTDA", x: 0, y: 700 },
      { texto: "12345678000190", x: 0, y: 650 }, // 50px abaixo — outra linha, sem dúvida
    ];
    expect(agruparEmLinhas(itens)).toEqual(["EMPRESA TESTE LTDA", "12345678000190"]);
  });

  it("devolve lista vazia pra página sem itens de texto", () => {
    expect(agruparEmLinhas([])).toEqual([]);
  });
});
