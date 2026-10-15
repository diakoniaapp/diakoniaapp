import { describe, expect, it } from "vitest";
import { AVISO_DE_INVALIDACAO, impactoDaResposta, ladoDaEdicao, patchDeclarado, textoDaEdicao, type EdicaoDoLancamento } from "./edicaoDeLancamento";

const base: Pick<EdicaoDoLancamento, "campo" | "antes" | "depois" | "antesRotulo" | "depoisRotulo"> = { campo: "valor", antes: "100.00", depois: "120", antesRotulo: null, depoisRotulo: null };

describe("a trilha de edição, em linguagem de gente", () => {
  it("valor vira dinheiro e data vira dia/mês/ano", () => {
    expect(textoDaEdicao(base).replace(/\s/g, " ")).toBe("Valor: R$ 100,00 → R$ 120,00");
    expect(textoDaEdicao({ ...base, campo: "data", antes: "2026-10-20", depois: "2026-10-25" })).toBe("Data: 20/10/2026 → 25/10/2026");
  });

  it("fornecedor, categoria, centro, projeto e conta mostram o NOME gravado na hora (não o identificador)", () => {
    expect(textoDaEdicao({ campo: "categoria", antes: "uuid-1", depois: "uuid-2", antesRotulo: "Energia", depoisRotulo: "Manutenção" })).toBe("Categoria: Energia → Manutenção");
    expect(textoDaEdicao({ campo: "projeto", antes: null, depois: "uuid-9", antesRotulo: null, depoisRotulo: "Missões" })).toBe("Projeto: (vazio) → Missões");
  });

  it("sem rótulo, mostra o valor bruto; sem nada, '(vazio)'", () => {
    expect(ladoDaEdicao({ ...base, campo: "documento_numero", antes: "NF-1", depois: null }, "antes")).toBe("NF-1");
    expect(ladoDaEdicao({ ...base, campo: "documento_numero", antes: "NF-1", depois: null }, "depois")).toBe("(vazio)");
    expect(ladoDaEdicao({ ...base, antes: "", depois: "x" }, "antes")).toBe("(vazio)");
  });
});

describe("o impacto de uma edição, como o banco responde", () => {
  it("lê a resposta de fin_impacto_edicao", () => {
    expect(impactoDaResposta({ invalida: true, campos: ["valor", "número da nota"], declaracao_estado: "assinada", derruba_aprovacoes: true }))
      .toEqual({ invalida: true, campos: ["valor", "número da nota"], declaracaoEstado: "assinada", derrubaAprovacoes: true });
  });
  it("resposta vazia ou estranha não invalida nada (a tela não pergunta à toa)", () => {
    expect(impactoDaResposta(null)).toBeNull();
    expect(impactoDaResposta({})).toEqual({ invalida: false, campos: [], declaracaoEstado: null, derrubaAprovacoes: false });
  });
  it("o aviso é o combinado", () => {
    expect(AVISO_DE_INVALIDACAO).toBe("Esta alteração invalidará a declaração atual e cancelará quaisquer aprovações relacionadas.");
  });
  it("só os dados que a declaração declara vão na pergunta", () => {
    expect(patchDeclarado({ valor: 120, data: "2026-10-25", fornecedor_id: "f1", documento_numero: "NF-9" })).toEqual({ valor: 120, data: "2026-10-25", fornecedor_id: "f1", documento_numero: "NF-9" });
  });
});
