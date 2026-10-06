import { beforeEach, describe, expect, it } from "vitest";
import {
  contextoParaQuery, lerContextoExtrato, lerRetorno, limparContextoExtrato, limparRetorno, prometerRetorno,
  queryParaContexto, salvarContextoExtrato, sanear, VALIDADE_DO_RETORNO_MS,
} from "./contextoExtrato";

beforeEach(() => { sessionStorage.clear(); });

describe("sanear", () => {
  it("só deixa passar campos válidos", () => {
    expect(sanear({ tipo: "entrada", de: "2026-06-28", ate: "2026-07-03", telaCheia: true, busca: "Aplicação" }))
      .toEqual({ tipo: "entrada", de: "2026-06-28", ate: "2026-07-03", telaCheia: true, busca: "Aplicação" });
    expect(sanear({ tipo: "qualquer", de: "28/06/2026", busca: 5, telaCheia: "sim", x: 1 })).toEqual({});
    expect(sanear(null)).toEqual({});
    expect(sanear("texto")).toEqual({});
  });
});

describe("contexto na sessão", () => {
  it("grava, mescla e lê", () => {
    expect(lerContextoExtrato()).toBeNull();
    salvarContextoExtrato({ de: "2026-06-28", ate: "2026-07-03", periodo: "personalizado" });
    salvarContextoExtrato({ categoriaId: "cat-1", busca: "Bradesco" });
    expect(lerContextoExtrato()).toEqual({ de: "2026-06-28", ate: "2026-07-03", periodo: "personalizado", categoriaId: "cat-1", busca: "Bradesco" });
  });
  it("o que se muda numa tela vale na outra: a última gravação vence, o resto fica", () => {
    salvarContextoExtrato({ tipo: "saida", busca: "luz" });
    salvarContextoExtrato({ tipo: "entrada" }); // mudou na outra tela
    expect(lerContextoExtrato()).toEqual({ tipo: "entrada", busca: "luz" });
  });
  it("limpar esquece tudo", () => {
    salvarContextoExtrato({ busca: "x" });
    limparContextoExtrato();
    expect(lerContextoExtrato()).toBeNull();
  });
  it("lixo no armazenamento não quebra", () => {
    sessionStorage.setItem("diakonia:extrato-contexto", "{não é json");
    expect(lerContextoExtrato()).toBeNull();
  });
});

describe("URL ↔ contexto (mesmos nomes que a página já usa)", () => {
  const ctx = {
    periodo: "personalizado", de: "2026-06-28", ate: "2026-07-03", tipo: "saida" as const,
    categoriaId: "c1", centroId: "cc1", fornecedorId: "f1", busca: "Aplicação", valorMin: "10", valorMax: "",
    telaCheia: false,
  };
  it("ida e volta sem perder nada", () => {
    const q = contextoParaQuery(ctx);
    expect(q.get("periodo")).toBe("personalizado");
    expect(q.get("categoria")).toBe("c1");
    expect(q.get("centro")).toBe("cc1");
    expect(q.get("busca")).toBe("Aplicação");
    expect(q.has("valorMax")).toBe(false);
    const volta = queryParaContexto(new URLSearchParams(q.toString()));
    expect(volta).toEqual({
      periodo: "personalizado", de: "2026-06-28", ate: "2026-07-03", tipo: "saida",
      categoriaId: "c1", centroId: "cc1", fornecedorId: "f1", busca: "Aplicação", valorMin: "10",
    });
  });
  it("tipo 'todos' não suja a URL", () => {
    expect(contextoParaQuery({ tipo: "todos", periodo: "mes" }).has("tipo")).toBe(false);
  });
});

describe("a volta prometida", () => {
  it("vale por 30 minutos e some depois", () => {
    prometerRetorno("/painel-tesouraria#cadastros", "9c67", 1_000);
    expect(lerRetorno(1_000 + 5_000)).toMatchObject({ origem: "/painel-tesouraria#cadastros", contaId: "9c67" });
    expect(lerRetorno(1_000 + VALIDADE_DO_RETORNO_MS + 1)).toBeNull();
  });
  it("guarda a rolagem para devolvê-la ao voltar", () => {
    prometerRetorno("/painel-tesouraria", "a", 1_000, 640.4);
    expect(lerRetorno(2_000)?.rolagem).toBe(640);
    prometerRetorno("/painel-tesouraria", "a", 1_000);
    expect(lerRetorno(2_000)?.rolagem).toBeUndefined();
  });
  it("recusa origem que não é caminho interno", () => {
    sessionStorage.setItem("diakonia:extrato-retorno", JSON.stringify({ origem: "https://x.com", contaId: "a", em: Date.now() }));
    expect(lerRetorno()).toBeNull();
    sessionStorage.setItem("diakonia:extrato-retorno", JSON.stringify({ origem: "//x.com", contaId: "a", em: Date.now() }));
    expect(lerRetorno()).toBeNull();
  });
  it("limpar apaga", () => {
    prometerRetorno("/painel-tesouraria", "a");
    limparRetorno();
    expect(lerRetorno()).toBeNull();
  });
});
