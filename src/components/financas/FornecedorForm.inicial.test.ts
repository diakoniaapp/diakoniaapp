import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/finService", () => ({ listarCategorias: async () => [], listarCentrosCusto: async () => [], criarFornecedor: vi.fn(), atualizarFornecedor: vi.fn() }));
vi.mock("@/components/financas/FavorecidoEscolha", () => ({ FavorecidoEscolha: () => null }));
vi.mock("@/services/favorecidoService", () => ({ pessoaDoFavorecido: async () => null }));

import { camposIniciaisDoFornecedor } from "./FornecedorForm";

describe("camposIniciaisDoFornecedor — o que a NF já sabe do fornecedor novo", () => {
  it("nome e CNPJ da nota: empresa (14 dígitos), CNPJ só com dígitos, nome sem espaços nas pontas", () => {
    const c = camposIniciaisDoFornecedor({ nome: "  SOS SOBRADO MALHAS ME ", cnpjCpf: "01.728.300/0161-55" });
    expect(c).toMatchObject({ nome: "SOS SOBRADO MALHAS ME", cnpjCpf: "01728300016155", tipo: "juridica" });
  });
  it("11 dígitos = CPF: pessoa física", () => {
    expect(camposIniciaisDoFornecedor({ nome: "João", cnpjCpf: "123.456.789-09" }).tipo).toBe("fisica");
  });
  it("sem dados: formulário vazio, empresa por padrão (como sempre foi)", () => {
    expect(camposIniciaisDoFornecedor()).toMatchObject({ nome: "", cnpjCpf: "", tipo: "juridica", email: "", chavePix: "" });
    expect(camposIniciaisDoFornecedor({ nome: null, cnpjCpf: null })).toMatchObject({ nome: "", cnpjCpf: "" });
  });
  it("só o nome (digitado na busca): CNPJ em branco para preencher", () => {
    expect(camposIniciaisDoFornecedor({ nome: "Papelaria Nova" })).toMatchObject({ nome: "Papelaria Nova", cnpjCpf: "" });
  });
});
