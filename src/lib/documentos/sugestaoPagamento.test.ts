import { describe, expect, it } from "vitest";
import { lerDocumentoDePagamento } from "./pagamento";
import {
  aprendizadoDaEscolha, chavesDoDocumento, nomeDaCategoriaPadrao, normalizarNome, sugerirClassificacao,
  type BaseDeSugestao,
} from "./sugestaoPagamento";

const base = (p: Partial<BaseDeSugestao> = {}): BaseDeSugestao => ({
  fornecedores: [
    { id: "f-eco", nome: "Ecoprint Impressoras Ltda", cnpj_cpf: "10.647.756/0001-80", categoria_padrao_id: "c-loc", centro_custo_padrao_id: "ce-tec" },
    { id: "f-pref", nome: "Prefeitura da Cidade do Rio de Janeiro", cnpj_cpf: null, categoria_padrao_id: null, centro_custo_padrao_id: null },
  ],
  categorias: [
    { id: "c-loc", nome: "Locação de Equipamentos", tipo: "saida", centro_custo_padrao_id: "ce-tec" },
    { id: "c-ener", nome: "Energia Elétrica", tipo: "saida", centro_custo_padrao_id: "ce-infra" },
    { id: "c-agua", nome: "Água e Esgoto", tipo: "saida", centro_custo_padrao_id: "ce-infra" },
    { id: "c-enc", nome: "Encargos Trabalhistas", tipo: "saida", centro_custo_padrao_id: "ce-pessoal" },
    { id: "c-imp", nome: "Impostos e Taxas", tipo: "saida", centro_custo_padrao_id: "ce-inst" },
  ],
  conhecimento: [],
  ...p,
});

const boletoEco = lerDocumentoDePagamento(`Beneficiário\nECOPRINT IMPRESSORAS LTDA CNPJ: 10.647.756/0001-80\nVencimento 20/08/2026\nValor do documento 360,00`);

describe("normalizarNome", () => {
  it("tira acento, pontuação e sufixo societário", () => {
    expect(normalizarNome("ECOPRINT IMPRESSORAS LTDA")).toBe("ecoprint impressoras");
    expect(normalizarNome("Light Serviços de Eletricidade S.A.")).toBe("light servicos eletricidade");
  });
});

describe("chavesDoDocumento", () => {
  it("do mais confiável ao menos: CNPJ, depois o beneficiário", () => {
    const k = chavesDoDocumento(boletoEco);
    expect(k.map(x => x.tipo)).toEqual(["cnpj", "beneficiario"]);
    expect(k[0].chave).toBe("10647756000180");
  });
  it("DARF distingue pela receita", () => {
    const d = lerDocumentoDePagamento("DARF\nCódigo da receita 1708\nValor total do documento 100,00\nPagar até 20/08/2026");
    expect(chavesDoDocumento(d).find(x => x.tipo === "guia")?.chave).toBe("irrf:1708");
  });
});

describe("guia antes do convênio (ISS × IPTU da mesma Prefeitura)", () => {
  const iss = lerDocumentoDePagamento("01. RECEITA\n101-5\nDARM\nISS - IMPOSTO SOBRE SERVIÇOS\nESTE DOCUMENTO DEVE SER UTILIZADO EXCLUSIVAMENTE PARA PAGAMENTO DE ISS\n03. DATA DE VENCIMENTO 06/08/2026\n09. VALOR TOTAL\nR$ 31,51");
  const iptu = lerDocumentoDePagamento("01.RECEITA\n310-7 DARM\nDocumento de Arrecadação de Receitas Municipais\n02.INSCRIÇÃO IMOBILIARIA\n03.DATA DE VENCIMENTO 07/08/2026\n09.VALOR TOTAL\n312,70");

  it("a chave da guia precede a do convênio", () => {
    const k = chavesDoDocumento({ ...iss, convenio: "5-prefeitura" });
    expect(k.map(x => x.tipo)).toEqual(["guia", "convenio"]);
  });

  it("ISS e IPTU, com o MESMO convênio aprendido, seguem cada um o seu centro", () => {
    const conv = { chave_tipo: "convenio" as const, chave: "5-prefeitura", fornecedor_id: null, categoria_id: "c-imp", centro_custo_id: "ce-residencia", projeto_id: null, usos: 1 };
    const b = base({ conhecimento: [
      { chave_tipo: "guia", chave: "iss", fornecedor_id: null, categoria_id: "c-imp", centro_custo_id: "ce-servicos", projeto_id: null, usos: 1 },
      { chave_tipo: "guia", chave: "iptu", fornecedor_id: null, categoria_id: "c-imp", centro_custo_id: "ce-residencia", projeto_id: null, usos: 1 },
      conv,
    ] });
    expect(sugerirClassificacao({ ...iss, convenio: "5-prefeitura" }, b).centroId).toBe("ce-servicos");
    expect(sugerirClassificacao({ ...iptu, convenio: "5-prefeitura" }, b).centroId).toBe("ce-residencia");
  });
});

describe("sugerirClassificacao", () => {
  it("CNPJ do beneficiário acha o fornecedor e herda categoria e centro padrão", () => {
    const s = sugerirClassificacao(boletoEco, base());
    expect(s).toMatchObject({ fornecedorId: "f-eco", categoriaId: "c-loc", centroId: "ce-tec", origem: "cnpj" });
    expect(s.confianca).toBeGreaterThanOrEqual(80);
    expect(s.motivos.join(" ")).toMatch(/CNPJ do beneficiário confere/);
  });

  it("o APRENDIDO vence o padrão do fornecedor (a correção da tesouraria manda)", () => {
    const s = sugerirClassificacao(boletoEco, base({
      conhecimento: [{ chave_tipo: "cnpj", chave: "10647756000180", fornecedor_id: "f-eco", categoria_id: "c-imp", centro_custo_id: "ce-inst", projeto_id: null, usos: 3 }],
    }));
    expect(s).toMatchObject({ fornecedorId: "f-eco", categoriaId: "c-imp", centroId: "ce-inst", origem: "aprendido" });
    expect(s.confianca).toBeGreaterThan(90);
  });

  it("sem fornecedor cadastrado: guia de FGTS cai no padrão do tipo (Encargos Trabalhistas) e herda o centro da categoria", () => {
    const d = lerDocumentoDePagamento("GFD - Guia do FGTS Digital\nPagar este documento até\n20/08/2026\nValor a recolher\n793,75\nTotal da Guia: 793,75");
    const s = sugerirClassificacao(d, base());
    expect(nomeDaCategoriaPadrao(d)).toBe("Encargos Trabalhistas");
    expect(s).toMatchObject({ fornecedorId: null, categoriaId: "c-enc", centroId: "ce-pessoal", origem: "tipo" });
    expect(s.confianca).toBeLessThan(70);
  });

  it("fatura de energia → Energia Elétrica / centro da categoria", () => {
    const d = lerDocumentoDePagamento("Light Serviços de Eletricidade\nFatura de energia elétrica\nTotal a pagar R$ 1.489,15\nVencimento 17/08/2026");
    expect(sugerirClassificacao(d, base())).toMatchObject({ categoriaId: "c-ener", centroId: "ce-infra", origem: "tipo" });
  });

  it("nome parecido (sem CNPJ) sugere o fornecedor com confiança menor", () => {
    const d = lerDocumentoDePagamento("Beneficiário\nPREFEITURA DA CIDADE DO RIO DE JANEIRO\nValor do documento 50,00");
    const s = sugerirClassificacao(d, base());
    expect(s.fornecedorId).toBe("f-pref");
    expect(s.origem).toBe("nome");
    expect(s.confianca).toBeLessThan(70);
  });

  it("documento sem nada reconhecível: sugestão vazia, sem inventar", () => {
    const s = sugerirClassificacao(lerDocumentoDePagamento("texto qualquer sem pagamento"), base());
    expect(s).toMatchObject({ fornecedorId: null, categoriaId: null, centroId: null, origem: null, confianca: 0 });
  });
});

describe("aprendizadoDaEscolha", () => {
  it("uma linha por chave do documento, com o que ela escolheu", () => {
    const a = aprendizadoDaEscolha(boletoEco, { fornecedorId: "f-eco", categoriaId: "c-imp", centroId: "ce-inst", projetoId: null });
    expect(a.map(x => x.tipo)).toEqual(["cnpj", "beneficiario"]);
    expect(a.every(x => x.categoriaId === "c-imp" && x.centroId === "ce-inst")).toBe(true);
  });
  it("nada escolhido: não grava nada", () => {
    expect(aprendizadoDaEscolha(boletoEco, { fornecedorId: null, categoriaId: null, centroId: null, projetoId: null })).toEqual([]);
  });
});
