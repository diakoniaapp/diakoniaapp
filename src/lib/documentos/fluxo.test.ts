import { describe, expect, it } from "vitest";
import {
  acaoInicial, contagens, destinosEfetivos, grupoDe, ordemDeGravacao, podeGravar, tipoSugerido,
  type ItemCentral,
} from "./fluxo";
import type { Banda, Candidato, LancamentoPool, ResultadoCasamento } from "./casamento";

function lanc(id: string): LancamentoPool {
  return { id, dia: "2026-08-13", valor: 10, fornecedorNome: "F", fornecedorCnpj: null, contaNome: "C", contaTipo: "caixa", status: "conciliado", temAnexo: false };
}
const cand = (id: string): Candidato => ({ lancamento: lanc(id), confianca: 90, motivos: [] });
function resultado(banda: Banda, extra: Partial<ResultadoCasamento> = {}): ResultadoCasamento {
  return { id: "x", banda, confianca: 90, candidatos: [cand("a")], resumo: "", ...extra };
}
function item(p: Partial<ItemCentral> = {}): ItemCentral {
  return { id: "i", nome: "a.pdf", caminho: "a.pdf", bytes: 1, origem: "upload", etapa: "lido", tipo: "nota_fiscal", acao: "pendente", parcelasExcluidas: [], resultado: resultado("pronto"), ...p };
}

describe("grupos da tela", () => {
  it("cada banda cai no seu grupo: ✅ automática · ⚠ revisão · ❌ não identificado · ↺ já anexado", () => {
    expect(grupoDe(item({ resultado: resultado("pronto") }))).toBe("automatico");
    expect(grupoDe(item({ resultado: resultado("revisar") }))).toBe("revisao");
    expect(grupoDe(item({ resultado: resultado("sem_destino") }))).toBe("nao_identificado");
    expect(grupoDe(item({ resultado: resultado("duplicata") }))).toBe("ja_anexado");
  });
  it("ainda não lido não tem grupo; erro de leitura vai para 'não identificado'", () => {
    expect(grupoDe(item({ etapa: "lendo", resultado: undefined }))).toBeNull();
    expect(grupoDe(item({ etapa: "erro", resultado: undefined }))).toBe("nao_identificado");
  });
});

describe("o que já vem marcado", () => {
  it("só a vinculação automática vem confirmada; duplicata nasce ignorada", () => {
    expect(acaoInicial("pronto")).toBe("confirmado");
    expect(acaoInicial("revisar")).toBe("pendente");
    expect(acaoInicial("sem_destino")).toBe("pendente");
    expect(acaoInicial("duplicata")).toBe("ignorado");
  });
});

describe("pra onde o documento vai", () => {
  it("pronto/revisar: a melhor sugestão", () => {
    expect(destinosEfetivos(item({ resultado: resultado("revisar") })).map(l => l.id)).toEqual(["a"]);
  });

  it("'não identificado' NÃO vai a lugar nenhum sem escolha explícita", () => {
    expect(destinosEfetivos(item({ resultado: resultado("sem_destino") }))).toEqual([]);
  });

  it("'Escolher outro lançamento' vale no lugar da sugestão", () => {
    expect(destinosEfetivos(item({ escolhido: lanc("z") })).map(l => l.id)).toEqual(["z"]);
  });

  it("compra parcelada: o MESMO documento vai para TODAS as parcelas", () => {
    const parc = { n: 4, valorParcela: 10, total: 40, lancamentos: [lanc("p1"), lanc("p2"), lanc("p3"), lanc("p4")], encontradas: 4, faltam: 0 };
    expect(destinosEfetivos(item({ resultado: resultado("pronto", { parcelamento: parc }) })).map(l => l.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("parcela desmarcada fica de fora", () => {
    const parc = { n: 3, valorParcela: 10, total: 30, lancamentos: [lanc("p1"), lanc("p2"), lanc("p3")], encontradas: 3, faltam: 0 };
    const r = item({ resultado: resultado("pronto", { parcelamento: parc }), parcelasExcluidas: ["p2"] });
    expect(destinosEfetivos(r).map(l => l.id)).toEqual(["p1", "p3"]);
  });

  it("duplicata nunca tem destino", () => {
    expect(destinosEfetivos(item({ resultado: resultado("duplicata") }))).toEqual([]);
  });
});

describe("pode gravar", () => {
  it("só se confirmado, com destino e ainda não gravado", () => {
    expect(podeGravar(item({ acao: "confirmado" }))).toBe(true);
    expect(podeGravar(item({ acao: "pendente" }))).toBe(false);
    expect(podeGravar(item({ acao: "ignorado" }))).toBe(false);
    expect(podeGravar(item({ acao: "confirmado", gravado: true }))).toBe(false);
    expect(podeGravar(item({ acao: "confirmado", resultado: resultado("sem_destino") }))).toBe(false);
  });
});

describe("contagens do cabeçalho e do rodapé", () => {
  it("conta grupos, itens marcados e VÍNCULOS (compra parcelada vale N)", () => {
    const parc = { n: 3, valorParcela: 10, total: 30, lancamentos: [lanc("p1"), lanc("p2"), lanc("p3")], encontradas: 3, faltam: 0 };
    const c = contagens([
      item({ id: "1", acao: "confirmado" }),
      item({ id: "2", acao: "confirmado", resultado: resultado("pronto", { parcelamento: parc }) }),
      item({ id: "3", resultado: resultado("revisar") }),
      item({ id: "4", resultado: resultado("sem_destino") }),
      item({ id: "5", resultado: resultado("duplicata"), acao: "ignorado" }),
      item({ id: "6", etapa: "lendo", resultado: undefined }),
    ]);
    expect(c).toMatchObject({ total: 6, lidos: 5, automatico: 2, revisao: 1, nao_identificado: 1, ja_anexado: 1, confirmados: 2, vinculos: 4 });
  });
});

describe("tipo sugerido", () => {
  const lido = (tipo: string) => ({ tipo, emitente: null, cnpj: null, numero: null, emissao: null, vencimento: null, valores: [], duplicatas: [], chave: null }) as never;
  it("segue o que o leitor reconheceu, inclusive RPA, RPS e DPS", () => {
    expect(tipoSugerido(lido("nfce"))).toBe("nota_fiscal");
    expect(tipoSugerido(lido("boleto"))).toBe("boleto");
    expect(tipoSugerido(lido("fatura"))).toBe("fatura");
    expect(tipoSugerido(lido("rpa"))).toBe("rpa");
    expect(tipoSugerido(lido("rps"))).toBe("rps");
    expect(tipoSugerido(lido("dps"))).toBe("dps");
  });
  it("XML é sempre xml; sem pista nenhuma, 'outro'", () => {
    expect(tipoSugerido(undefined, undefined, true)).toBe("xml");
    expect(tipoSugerido(lido("desconhecido"))).toBe("outro");
  });
  it("na dúvida do conteúdo, o nome do arquivo da tesouraria decide", () => {
    const nome = (p: object) => ({ data: null, valor: null, nf: null, fornecedor: null, forma: null, parcela: null, tipoDocumento: null, recibo: null, ...p }) as never;
    expect(tipoSugerido(lido("desconhecido"), nome({ recibo: "RPA" }))).toBe("rpa");
    expect(tipoSugerido(lido("desconhecido"), nome({ tipoDocumento: "BOLETO" }))).toBe("boleto");
    expect(tipoSugerido(lido("desconhecido"), nome({ nf: "123" }))).toBe("nota_fiscal");
  });
});

describe("ordem de gravação = ordem das páginas do dossiê", () => {
  it("o comprovante vai depois do documento fiscal, mesmo solto antes", () => {
    const v = [{ tipo: "comprovante", n: 1 }, { tipo: "rpa", n: 2 }, { tipo: "boleto", n: 3 }];
    expect(ordemDeGravacao(v).map(x => x.n)).toEqual([2, 3, 1]);
  });
  it("entre iguais, a ordem em que apareceram", () => {
    const v = [{ tipo: "nota_fiscal", n: 1 }, { tipo: "nota_fiscal", n: 2 }];
    expect(ordemDeGravacao(v).map(x => x.n)).toEqual([1, 2]);
  });
});
