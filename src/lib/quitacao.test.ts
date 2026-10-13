import { describe, it, expect } from "vitest";
import {
  alcadaDoReembolso, aprovaOProprioReembolso, avaliarQuitacao, bloqueiaOFechamento, chaveNfeValida, cnpjDaChave, cnpjValido, ehDocumentoOriginal,
  grausDaQuitacao, menorGrau, problemasDoRegistro, resultadoDaQuitacao, type EntradaDaMatriz, type EntradaDoResultado,
} from "./quitacao";

// chave de NF-e de teste com o dígito verificador calculado aqui (módulo 11), do CNPJ de um emitente fictício
function chaveDeTeste(cnpjEmitente: string): string {
  const base = "33" + "2610" + cnpjEmitente + "55" + "001" + "000012345" + "1" + "12345678"; // 43 dígitos
  let peso = 2, soma = 0;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const r = soma % 11;
  return base + String(r === 0 || r === 1 ? 0 : 11 - r);
}

const PARAMS = { teto1: 500, prazoDeclaracaoDias: 30, tetoAnualTerceiro: 2000, qtdRelatadasTrimestre: 3, limiteCapitalizacao: null as number | null };

/** Uma oferta de consumo, NF com chave que confere, terceiro fora do circuito, tudo Relatado: o caso mais tranquilo. */
const base = (o: Partial<EntradaDaMatriz> = {}): EntradaDaMatriz => ({
  responsavel: "pessoa", intencao: "oferta", grauResponsavel: "relatado", grauIntencao: "relatado", naturezaItem: "consumo", valor: 60,
  temNotaAnexada: true, compradorCnpjIgreja: true, chaveValida: true, chaveConfereComEmitente: true,
  terceiroNoCircuito: false, terceiroMinistro: false, empresaComPagamentos12m: false, intencaoAlteradaRecentemente: false, pedeReciboFiscal: false,
  ofertaComCondicao: false, diasEntrePagamentoEDeclaracao: 0, acumuladoAnoDoTerceiro: 60, qtdRelatadasNoTrimestre: 1,
  periodoDaDespesaAprovado: false, formalizacaoVencida: false, aprovadoPeloAdministrador: false, parametros: PARAMS, ...o,
});

describe("CNPJ e chave de acesso", () => {
  it("valida o CNPJ da QIBRJ e recusa os inválidos", () => {
    expect(cnpjValido("27.639.285/0001-61")).toBe(true);
    expect(cnpjValido("27639285000161")).toBe(true);
    expect(cnpjValido("27.639.285/0001-62")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
    expect(cnpjValido(null)).toBe(false);
  });
  it("valida a chave de 44 dígitos pelo dígito verificador e extrai o CNPJ do emitente", () => {
    const chave = chaveDeTeste("27639285000161");
    expect(chave).toHaveLength(44);
    expect(chaveNfeValida(chave)).toBe(true);
    expect(cnpjDaChave(chave)).toBe("27639285000161");
    const errada = chave.slice(0, 43) + String((Number(chave[43]) + 1) % 10);
    expect(chaveNfeValida(errada)).toBe(false);
    expect(chaveNfeValida(chave.slice(0, 43))).toBe(false);
    expect(chaveNfeValida(null)).toBe(false);
  });
});

describe("o grau nasce dos anexos", () => {
  it("terceiro sem anexo é Relatado; a prova do pagamento torna o responsável Formal; a declaração torna a intenção Formal", () => {
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "oferta", anexos: [] })).toEqual({ responsavel: "relatado", intencao: "relatado" });
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "oferta", anexos: ["prova_pagamento_terceiro"] })).toEqual({ responsavel: "formal", intencao: "relatado" });
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "oferta", anexos: ["prova_pagamento_terceiro", "declaracao_terceiro"] })).toEqual({ responsavel: "formal", intencao: "formal" });
  });
  it("o Pedido de Reembolso vale para o reembolso, mas não para a oferta", () => {
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "reembolso", anexos: ["pedido_reembolso"] }).intencao).toBe("formal");
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "oferta", anexos: ["pedido_reembolso"] }).intencao).toBe("relatado");
  });
  it("Não declarada e Não localizado são Nenhum, e nenhum anexo muda isso", () => {
    expect(grausDaQuitacao({ responsavel: "pessoa", intencao: "nao_declarada", anexos: ["declaracao_terceiro", "prova_pagamento_terceiro"] }).intencao).toBe("nenhum");
    expect(grausDaQuitacao({ responsavel: "nao_localizado", intencao: "nao_se_aplica", anexos: ["prova_pagamento_terceiro"] })).toEqual({ responsavel: "nenhum", intencao: "nenhum" });
  });
  it("menorGrau fica com o mais fraco", () => {
    expect(menorGrau("formal", "relatado")).toBe("relatado");
    expect(menorGrau("nenhum", "formal")).toBe("nenhum");
  });
  it("as provas da quitação não contam como documento original da despesa", () => {
    expect(ehDocumentoOriginal("nota_fiscal")).toBe(true);
    expect(ehDocumentoOriginal("boleto")).toBe(true);
    expect(ehDocumentoOriginal("comprovante")).toBe(false);
    expect(ehDocumentoOriginal("declaracao_terceiro")).toBe(false);
    expect(ehDocumentoOriginal("pedido_reembolso")).toBe(false);
    expect(ehDocumentoOriginal("prova_pagamento_terceiro")).toBe(false);
  });
});

describe("Matriz de suficiência da prova — os exemplos da Política", () => {
  it("consumo de R$ 60, NF com chave, terceiro fora do circuito, oferta relatada: Baixo, o Relatado vale", () => {
    const r = avaliarQuitacao(base());
    expect(r.eixos).toEqual({ natureza: "baixo", patrimonio: "baixo", lastro: "baixo", relacao: "baixo" });
    expect(r.nivel).toBe("baixo");
    expect(r.suficiente).toBe(true);
  });
  it("a mesma compra, mas o terceiro participa do circuito (aprova): Alto, exige Formal", () => {
    const r = avaliarQuitacao(base({ terceiroNoCircuito: true }));
    expect(r.nivel).toBe("alto");
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toMatch(/Relatado não basta/);
  });
  it("com a prova Formal, o mesmo caso passa mesmo em nível Alto", () => {
    expect(avaliarQuitacao(base({ terceiroNoCircuito: true, grauResponsavel: "formal", grauIntencao: "formal" })).suficiente).toBe(true);
  });
  it("cabo de R$ 90 que vai à Ficha do Bem, com limite de capitalização de R$ 200: Médio, precisa do Administrador", () => {
    const e = base({ naturezaItem: "duravel", valor: 90, parametros: { ...PARAMS, limiteCapitalizacao: 200 } });
    const r = avaliarQuitacao(e);
    expect(r.eixos.patrimonio).toBe("medio");
    expect(r.nivel).toBe("medio");
    expect(r.suficiente).toBe(false);
    expect(r.exigeAprovacaoDoAdministrador).toBe(true);
    expect(avaliarQuitacao({ ...e, aprovadoPeloAdministrador: true }).suficiente).toBe(true);
  });
  it("bem durável sem limite de capitalização definido (padrão conservador): Alto", () => {
    expect(avaliarQuitacao(base({ naturezaItem: "duravel", valor: 10 })).eixos.patrimonio).toBe("alto");
  });
  it("bem durável a partir do limite: Alto", () => {
    expect(avaliarQuitacao(base({ naturezaItem: "duravel", valor: 200, parametros: { ...PARAMS, limiteCapitalizacao: 200 } })).eixos.patrimonio).toBe("alto");
  });
  it("oferta de R$ 50 de uma Empresa fornecedora da igreja: Alto — o valor baixo não salva", () => {
    const r = avaliarQuitacao(base({ responsavel: "empresa", valor: 50, empresaComPagamentos12m: true }));
    expect(r.eixos.relacao).toBe("alto");
    expect(r.nivel).toBe("alto");
    expect(r.suficiente).toBe(false);
  });
  it("Empresa sem histórico de pagamentos fica em Médio (padrão conservador aprovado)", () => {
    expect(avaliarQuitacao(base({ responsavel: "empresa" })).eixos.relacao).toBe("medio");
  });
  it("Entidade fica em Médio; pedir recibo com efeito fiscal leva a Alto", () => {
    expect(avaliarQuitacao(base({ responsavel: "entidade" })).eixos.relacao).toBe("medio");
    expect(avaliarQuitacao(base({ responsavel: "entidade", pedeReciboFiscal: true })).eixos.relacao).toBe("alto");
  });
  it("reembolso de R$ 40 relatado: Alto, insuficiente — reembolso nunca é pago com Relatado", () => {
    const r = avaliarQuitacao(base({ intencao: "reembolso", valor: 40 }));
    expect(r.eixos.natureza).toBe("alto");
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toMatch(/Reembolso só se paga com a prova Formal/);
  });
  it("reembolso com a prova Formal dos dois lados é suficiente", () => {
    expect(avaliarQuitacao(base({ intencao: "reembolso", grauResponsavel: "formal", grauIntencao: "formal" })).suficiente).toBe(true);
  });
  it("reembolso com a intenção Formal mas o pagamento só Relatado continua insuficiente (vale o mais fraco)", () => {
    const r = avaliarQuitacao(base({ intencao: "reembolso", grauResponsavel: "relatado", grauIntencao: "formal" }));
    expect(r.grauConjunto).toBe("relatado");
    expect(r.suficiente).toBe(false);
  });
  it("compensação de adiantamento também não aceita Relatado", () => {
    expect(avaliarQuitacao(base({ intencao: "compensacao_adiantamento" })).suficiente).toBe(false);
    expect(avaliarQuitacao(base({ intencao: "compensacao_adiantamento", grauResponsavel: "formal", grauIntencao: "formal" })).suficiente).toBe(true);
  });
  it("responsável com grau Nenhum nunca é suficiente, nem com a intenção Formal", () => {
    const r = avaliarQuitacao(base({ grauResponsavel: "nenhum", grauIntencao: "formal" }));
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toMatch(/quem pagou/);
  });
  it("intenção Não declarada nunca é suficiente", () => {
    const r = avaliarQuitacao(base({ intencao: "nao_declarada", grauIntencao: "nenhum" }));
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toMatch(/não foi declarada/);
  });
});

describe("os quatro eixos", () => {
  it("lastro: sem nota anexada é Alto; nota sem chave ou com chave que não confere é Médio; nota com chave que confere é Baixo", () => {
    expect(avaliarQuitacao(base({ temNotaAnexada: false })).eixos.lastro).toBe("alto");
    expect(avaliarQuitacao(base({ chaveValida: false })).eixos.lastro).toBe("medio");
    expect(avaliarQuitacao(base({ chaveConfereComEmitente: false })).eixos.lastro).toBe("medio");
    expect(avaliarQuitacao(base({ compradorCnpjIgreja: false })).eixos.lastro).toBe("medio");
    expect(avaliarQuitacao(base()).eixos.lastro).toBe("baixo");
  });
  it("natureza: oferta com condição ou destinação restrita é Médio", () => {
    expect(avaliarQuitacao(base({ ofertaComCondicao: true })).eixos.natureza).toBe("medio");
  });
  it("relação: ministro ou intenção alterada recentemente é Médio; pessoa no circuito ou pedindo recibo é Alto", () => {
    expect(avaliarQuitacao(base({ terceiroMinistro: true })).eixos.relacao).toBe("medio");
    expect(avaliarQuitacao(base({ intencaoAlteradaRecentemente: true })).eixos.relacao).toBe("medio");
    expect(avaliarQuitacao(base({ pedeReciboFiscal: true })).eixos.relacao).toBe("alto");
  });
  it("natureza do item não informada: o lado seguro (Alto)", () => {
    expect(avaliarQuitacao(base({ naturezaItem: null })).eixos.patrimonio).toBe("alto");
  });
});

describe("moduladores", () => {
  it("M1: declarada depois de 30 dias sobe um nível", () => {
    const r = avaliarQuitacao(base({ diasEntrePagamentoEDeclaracao: 31 }));
    expect(r.moduladores).toEqual(["M1"]);
    expect(r.nivel).toBe("medio");
  });
  it("30 dias exatos ainda não aciona", () => {
    expect(avaliarQuitacao(base({ diasEntrePagamentoEDeclaracao: 30 })).moduladores).toEqual([]);
  });
  it("M2: valor acima do teto 1 (e o valor nunca rebaixa nada)", () => {
    expect(avaliarQuitacao(base({ valor: 500 })).moduladores).toEqual([]);
    expect(avaliarQuitacao(base({ valor: 500.01 })).moduladores).toEqual(["M2"]);
  });
  it("M3: acumulado do ano acima de R$ 2.000 ou três Relatadas no trimestre", () => {
    expect(avaliarQuitacao(base({ acumuladoAnoDoTerceiro: 2000 })).moduladores).toEqual([]);
    expect(avaliarQuitacao(base({ acumuladoAnoDoTerceiro: 2000.01 })).moduladores).toEqual(["M3"]);
    expect(avaliarQuitacao(base({ qtdRelatadasNoTrimestre: 3 })).moduladores).toEqual(["M3"]);
  });
  it("M4: mês de competência com fechamento aprovado", () => {
    expect(avaliarQuitacao(base({ periodoDaDespesaAprovado: true })).moduladores).toEqual(["M4"]);
  });
  it("os moduladores M1–M4 sobem no máximo dois níveis", () => {
    const r = avaliarQuitacao(base({ diasEntrePagamentoEDeclaracao: 90, valor: 900, acumuladoAnoDoTerceiro: 5000, periodoDaDespesaAprovado: true }));
    expect(r.moduladores).toEqual(["M1", "M2", "M3", "M4"]);
    expect(r.nivel).toBe("alto");
  });
  it("D Flesh (oferta relatada ~2 anos depois, chave ainda pendente): no mínimo Médio", () => {
    const r = avaliarQuitacao(base({ valor: 137.28, chaveValida: false, diasEntrePagamentoEDeclaracao: 700 }));
    expect(r.eixos.lastro).toBe("medio");
    expect(["medio", "alto"]).toContain(r.nivel);
    expect(r.suficiente).toBe(false);
  });
  it("formalização vencida sobe um nível: o que era Baixo passa a exigir o Administrador", () => {
    const r = avaliarQuitacao(base({ formalizacaoVencida: true }));
    expect(r.nivel).toBe("medio");
    expect(r.moduladores).toEqual(["vencida"]);
    expect(r.suficiente).toBe(false);
    expect(r.exigeAprovacaoDoAdministrador).toBe(true);
  });
  it("formalização vencida sobe o Médio para Alto, que exige Formal", () => {
    const r = avaliarQuitacao(base({ ofertaComCondicao: true, formalizacaoVencida: true, aprovadoPeloAdministrador: true }));
    expect(r.nivel).toBe("alto");
    expect(r.suficiente).toBe(false);
  });
  it("a formalização vencida só conta quando o grau do conjunto é Relatado", () => {
    expect(avaliarQuitacao(base({ formalizacaoVencida: true, grauResponsavel: "formal", grauIntencao: "formal" })).moduladores).toEqual([]);
  });
});

describe("resultado, credor e fila", () => {
  const e = (o: Partial<EntradaDoResultado> = {}): EntradaDoResultado => ({ responsavel: "pessoa", intencao: "reembolso", suficiente: true, aprovacaoDoReembolso: null, paga: false, ...o });
  it("Igreja e Ninguém ainda são deduzidos", () => {
    expect(resultadoDaQuitacao(e({ responsavel: "igreja", intencao: "nao_se_aplica" }))).toEqual({ resultado: "pago_pela_igreja", credorAtual: "nenhum", fila: null });
    expect(resultadoDaQuitacao(e({ responsavel: "ninguem_ainda", intencao: "nao_se_aplica" }))).toEqual({ resultado: "em_aberto", credorAtual: "emitente", fila: null });
  });
  it("Não localizado vai para Investigar e o emitente continua credor", () => {
    expect(resultadoDaQuitacao(e({ responsavel: "nao_localizado", intencao: "nao_se_aplica", suficiente: false }))).toEqual({ resultado: "sem_quitacao_localizada", credorAtual: "emitente", fila: "investigar" });
  });
  it("Não declarada vai para A esclarecer", () => {
    expect(resultadoDaQuitacao(e({ intencao: "nao_declarada", suficiente: false })).fila).toBe("a_esclarecer");
  });
  it("prova insuficiente vai para Formalizar", () => {
    expect(resultadoDaQuitacao(e({ suficiente: false })).fila).toBe("formalizar");
  });
  it("reembolso suficiente aguarda aprovação: o credor ainda não é o terceiro (a dívida nasce na aprovação)", () => {
    expect(resultadoDaQuitacao(e())).toEqual({ resultado: "reembolso_em_analise", credorAtual: "em_analise", fila: "aprovar_reembolso" });
  });
  it("reembolso aprovado: dívida com o terceiro, na fila Reembolso a pagar", () => {
    expect(resultadoDaQuitacao(e({ aprovacaoDoReembolso: "aprovada" }))).toEqual({ resultado: "divida_com_terceiro", credorAtual: "terceiro", fila: "reembolso_a_pagar" });
  });
  it("reembolso aprovado e pago pela igreja: reembolsada, sem fila", () => {
    expect(resultadoDaQuitacao(e({ aprovacaoDoReembolso: "aprovada", paga: true }))).toEqual({ resultado: "reembolsada", credorAtual: "nenhum", fila: null });
  });
  it("reembolso recusado volta para A esclarecer (as três saídas da Política)", () => {
    expect(resultadoDaQuitacao(e({ aprovacaoDoReembolso: "recusada" })).fila).toBe("a_esclarecer");
  });
  it("oferta suficiente extingue, sem fila e sem credor", () => {
    expect(resultadoDaQuitacao(e({ intencao: "oferta" }))).toEqual({ resultado: "extinta_como_oferta", credorAtual: "nenhum", fila: null });
  });
});

describe("bloqueio do fechamento", () => {
  it("vigência vazia: nada bloqueia", () => {
    expect(bloqueiaOFechamento("a_esclarecer", "2026-10-01", null)).toBe(false);
  });
  it("só A esclarecer e Formalizar bloqueiam, e só a partir da vigência", () => {
    expect(bloqueiaOFechamento("a_esclarecer", "2026-11-05", "2026-11-01")).toBe(true);
    expect(bloqueiaOFechamento("formalizar", "2026-11-01", "2026-11-01")).toBe(true);
    expect(bloqueiaOFechamento("a_esclarecer", "2026-10-31", "2026-11-01")).toBe(false);
    expect(bloqueiaOFechamento("investigar", "2026-11-05", "2026-11-01")).toBe(false);
    expect(bloqueiaOFechamento("reembolso_a_pagar", "2026-11-05", "2026-11-01")).toBe(false);
    expect(bloqueiaOFechamento("aprovar_reembolso", "2026-11-05", "2026-11-01")).toBe(false);
    expect(bloqueiaOFechamento(null, "2026-11-05", "2026-11-01")).toBe(false);
  });
});

describe("aprovação do reembolso", () => {
  it("alçada: até o teto 1, a Tesouraria; acima, o Administrador", () => {
    expect(alcadaDoReembolso(500, 500)).toBe("tesouraria");
    expect(alcadaDoReembolso(500.01, 500)).toBe("administrador");
  });
  it("ninguém aprova o próprio reembolso", () => {
    expect(aprovaOProprioReembolso("p1", "p1")).toBe(true);
    expect(aprovaOProprioReembolso("p1", "p2")).toBe(false);
    expect(aprovaOProprioReembolso(null, "p2")).toBe(false);
    expect(aprovaOProprioReembolso("p1", null)).toBe(false);
  });
});

describe("validação do registro", () => {
  const ok = { responsavel: "pessoa" as const, intencao: "reembolso" as const, pessoaId: "p1", fornecedorId: null, pagoEm: "2026-10-01", declaradoEm: "2026-10-02",
    naturezaItem: "consumo" as const, hoje: "2026-10-13", emitenteId: "f1", cnpjDoFornecedor: null };
  it("um registro completo não tem problemas", () => { expect(problemasDoRegistro(ok)).toEqual([]); });
  it("exige a pessoa, a data do pagamento, a natureza e a data da declaração", () => {
    expect(problemasDoRegistro({ ...ok, pessoaId: null })).toContain("Escolha a pessoa que pagou.");
    expect(problemasDoRegistro({ ...ok, pagoEm: null })).toContain("Informe a data em que o terceiro pagou.");
    expect(problemasDoRegistro({ ...ok, naturezaItem: null }).join()).toMatch(/natureza do item/);
    expect(problemasDoRegistro({ ...ok, declaradoEm: null }).join()).toMatch(/declaração/);
  });
  it("recusa datas futuras", () => {
    expect(problemasDoRegistro({ ...ok, pagoEm: "2026-10-14" }).join()).toMatch(/futura/);
    expect(problemasDoRegistro({ ...ok, declaradoEm: "2026-10-14" }).join()).toMatch(/futura/);
  });
  it("Empresa e Entidade exigem CNPJ válido; o emitente não pode ser o próprio terceiro", () => {
    const emp = { ...ok, responsavel: "empresa" as const, pessoaId: null, fornecedorId: "f2" };
    expect(problemasDoRegistro({ ...emp, cnpjDoFornecedor: null }).join()).toMatch(/CNPJ válido/);
    expect(problemasDoRegistro({ ...emp, cnpjDoFornecedor: "27.639.285/0001-61" })).toEqual([]);
    expect(problemasDoRegistro({ ...emp, fornecedorId: "f1", cnpjDoFornecedor: "27.639.285/0001-61" }).join()).toMatch(/emitente/);
  });
  it("Não declarada não pede data de declaração", () => {
    expect(problemasDoRegistro({ ...ok, intencao: "nao_declarada", declaradoEm: null })).toEqual([]);
  });
  it("Não localizado exige intenção 'não se aplica'; Igreja e Ninguém ainda não se registram", () => {
    expect(problemasDoRegistro({ ...ok, responsavel: "nao_localizado", intencao: "nao_se_aplica", pessoaId: null, pagoEm: null, declaradoEm: null, naturezaItem: null })).toEqual([]);
    expect(problemasDoRegistro({ ...ok, responsavel: "nao_localizado", intencao: "oferta", pessoaId: null }).join()).toMatch(/não se aplica/);
    expect(problemasDoRegistro({ ...ok, responsavel: "igreja" }).join()).toMatch(/deduz/);
  });
});
