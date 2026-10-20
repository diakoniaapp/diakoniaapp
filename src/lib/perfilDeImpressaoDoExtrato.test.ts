// Modelos de impressão do Extrato de Obrigações (20/10/2026): cada público recebe só o que precisa; a escolha fica lembrada e nunca quebra a tela.
import { afterEach, describe, expect, it } from "vitest";
import {
  CAMPOS_DE_IMPRESSAO, MODELOS_DE_IMPRESSAO, guardarPerfil, modeloDosCampos, perfilDoModelo, perfilGuardado, type CampoDeImpressao,
} from "./perfilDeImpressaoDoExtrato";

afterEach(() => { try { localStorage.clear(); } catch { /* ok */ } });
const ligados = (m: keyof typeof MODELOS_DE_IMPRESSAO) => CAMPOS_DE_IMPRESSAO.filter(c => MODELOS_DE_IMPRESSAO[m].campos[c.campo]).map(c => c.campo);

describe("modelos de impressão", () => {
  it("Contabilidade: o que classifica (fornecedor, documento, categoria, centro, projeto), sem detalhe operacional", () => {
    expect(ligados("contabilidade")).toEqual(["fornecedor", "documento", "categoria", "centro", "projeto", "totalDoDia"]);
  });
  it("Diretoria: o essencial, com atraso e assinaturas — e o Fornecedor, que a lista original não trazia (sem ele a linha não diz a quem se paga)", () => {
    expect(ligados("diretoria")).toEqual(["fornecedor", "documento", "projeto", "diasAtraso", "totalDoDia", "assinaturas"]);
    for (const detalhe of ["categoria", "centro", "conta", "responsavel", "descricao", "observacoes"] as CampoDeImpressao[]) expect(MODELOS_DE_IMPRESSAO.diretoria.campos[detalhe], detalhe).toBe(false);
  });
  it("Simplificado: quem e quanto; Tesouraria: tudo da rotina, sem assinaturas", () => {
    expect(ligados("simplificado")).toEqual(["fornecedor", "totalDoDia"]);
    expect(MODELOS_DE_IMPRESSAO.tesouraria.campos.conta).toBe(true);
    expect(MODELOS_DE_IMPRESSAO.tesouraria.campos.assinaturas).toBe(false);
  });
  it("o modelo dos campos: reconhece o exato e chama de personalizado o resto", () => {
    expect(modeloDosCampos(perfilDoModelo("diretoria").campos)).toBe("diretoria");
    const mexido = { ...perfilDoModelo("tesouraria").campos, conta: false };
    expect(modeloDosCampos(mexido)).toBe("personalizado");
  });
  it("perfilDoModelo devolve uma CÓPIA: mexer nela não muda o modelo", () => {
    const p = perfilDoModelo("simplificado"); p.campos.categoria = true;
    expect(MODELOS_DE_IMPRESSAO.simplificado.campos.categoria).toBe(false);
  });
});

describe("a escolha lembrada neste navegador", () => {
  it("guarda e devolve (e o modelo é reconhecido de novo)", () => {
    guardarPerfil(perfilDoModelo("contabilidade"));
    expect(perfilGuardado().modelo).toBe("contabilidade");
    guardarPerfil({ modelo: "personalizado", campos: { ...perfilDoModelo("tesouraria").campos, projeto: false } });
    expect(perfilGuardado()).toMatchObject({ modelo: "personalizado" });
    expect(perfilGuardado().campos.projeto).toBe(false);
  });
  it("sem nada guardado, ou com lixo, volta à Tesouraria; campo estranho não passa", () => {
    expect(perfilGuardado().modelo).toBe("tesouraria");
    localStorage.setItem("diakonia:extrato-obrigacoes:impressao", "{isso não é json");
    expect(perfilGuardado().modelo).toBe("tesouraria");
    localStorage.setItem("diakonia:extrato-obrigacoes:impressao", JSON.stringify({ campos: { fornecedor: "sim", conta: false, inventado: true } }));
    const p = perfilGuardado();
    expect(p.campos.fornecedor).toBe(true);        // não-booleano é ignorado: vale o padrão
    expect(p.campos.conta).toBe(false);
    expect((p.campos as Record<string, boolean>).inventado).toBeUndefined();
  });
});
