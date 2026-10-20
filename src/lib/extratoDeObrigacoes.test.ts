// Extrato de Obrigações (16/10/2026): a situação de cada obrigação, o agrupamento do pagamento parcial, o resumo e o CSV.
import { describe, expect, it } from "vitest";
import {
  CABECALHO_DO_EXTRATO, acoesDaObrigacao, agruparPorDia, contagemPorConta, diaDaSemana, diasEntre, filtrarPorConta, observacaoLegivel, seloDaSituacao, filtrarPorSituacao, gerarCSVDoExtrato, montarExtratoDeObrigacoes, resumoDoExtrato, situacaoDaObrigacao,
  type LinhaDeObrigacao, type NomesDoExtrato, type QuitacaoDoExtrato,
} from "./extratoDeObrigacoes";

const l = (o: Partial<LinhaDeObrigacao> & { id: string }): LinhaDeObrigacao => ({
  obrigacao_id: null, data: "2026-09-10", status: "previsto", valor: 100, valor_original: null, descricao: "Despesa", documento_numero: null,
  fornecedor_id: "f1", pessoa_id: null, categoria_id: "c1", centro_custo_id: "ce1", projeto_id: null, ...o,
});
const nomes: NomesDoExtrato = {
  fornecedores: new Map([["f1", "Papelaria Central"], ["f2", "Gráfica"]]), pessoas: new Map([["p1", "Ana Souza"]]),
  categorias: new Map([["c1", "Material de Consumo"]]), centros: new Map([["ce1", "Ministério Pastoral"]]), projetos: new Map([["pr1", "Reforma"]]),
};
const montar = (linhas: LinhaDeObrigacao[], quitacoes: [string, QuitacaoDoExtrato][] = [], hoje = "2026-10-16") =>
  montarExtratoDeObrigacoes({ linhas, quitacoes: new Map(quitacoes), nomes, hoje });

describe("situação da obrigação", () => {
  it("previsto sem quitação = em aberto; realizado/conciliado = paga; cancelado = cancelada", () => {
    expect(situacaoDaObrigacao([{ status: "previsto" }], null)).toBe("em_aberto");
    expect(situacaoDaObrigacao([{ status: "realizado" }], null)).toBe("paga");
    expect(situacaoDaObrigacao([{ status: "conciliado" }], null)).toBe("paga");
    expect(situacaoDaObrigacao([{ status: "cancelado" }], null)).toBe("cancelada");
  });
  it("quitada por terceiro (status quitado_terceiro, mesmo sem dinheiro) aparece como tal", () => {
    expect(situacaoDaObrigacao([{ status: "quitado_terceiro" }], { responsavel: "pessoa", responsavelNome: "Ana", intencao: "oferta" })).toBe("quitada_por_terceiro");
    expect(situacaoDaObrigacao([{ status: "quitado_terceiro" }], null)).toBe("quitada_por_terceiro");
  });
  it("terceiro pagou com intenção de reembolso = reembolso (a obrigação segue com a igreja, que reembolsa)", () => {
    expect(situacaoDaObrigacao([{ status: "previsto" }], { responsavel: "pessoa", responsavelNome: "Ana", intencao: "reembolso" })).toBe("reembolso");
    expect(situacaoDaObrigacao([{ status: "realizado" }], { responsavel: "empresa", responsavelNome: null, intencao: "reembolso" })).toBe("reembolso");
  });
  it("'não localizado' não é terceiro: a obrigação continua em aberto", () => {
    expect(situacaoDaObrigacao([{ status: "previsto" }], { responsavel: "nao_localizado", responsavelNome: null, intencao: "nao_se_aplica" })).toBe("em_aberto");
  });
  it("pagamento parcial: uma linha paga e outra prevista = paga parcialmente", () => {
    expect(situacaoDaObrigacao([{ status: "realizado" }, { status: "previsto" }], null)).toBe("paga_parcialmente");
  });
});

describe("montagem do extrato", () => {
  it("uma obrigação com pagamento parcial vira UMA linha: valor original, saldo em aberto e atraso do que falta", () => {
    const ex = montar([
      l({ id: "raiz", status: "realizado", valor: 60, valor_original: 100 }),
      l({ id: "filha", obrigacao_id: "raiz", status: "previsto", valor: 40, data: "2026-10-01" }),
    ]);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ obrigacaoId: "raiz", valor: 100, saldoEmAberto: 40, situacao: "paga_parcialmente", diasEmAtraso: 15 });
  });

  it("traz fornecedor (ou, sem ele, a pessoa), documento, categoria, centro e projeto pelos nomes", () => {
    const ex = montar([
      l({ id: "a", documento_numero: "NF 123", projeto_id: "pr1" }),
      l({ id: "b", fornecedor_id: null, pessoa_id: "p1", data: "2026-09-11" }),
    ]);
    expect(ex[0]).toMatchObject({ fornecedor: "Papelaria Central", documento: "NF 123", categoria: "Material de Consumo", centro: "Ministério Pastoral", projeto: "Reforma" });
    expect(ex[1].fornecedor).toBe("Ana Souza");
  });

  it("dias em atraso: só para o que está em aberto e já venceu; paga, futura e cancelada não têm", () => {
    const ex = montar([
      l({ id: "venc", data: "2026-10-01" }), l({ id: "futura", data: "2026-10-30" }), l({ id: "paga", status: "realizado", data: "2026-09-01" }),
      l({ id: "canc", status: "cancelado", data: "2026-09-01" }),
    ]);
    const por = Object.fromEntries(ex.map(x => [x.obrigacaoId, x.diasEmAtraso]));
    expect(por).toEqual({ venc: 15, futura: null, paga: null, canc: null });
  });

  it("responsável e intenção: igreja quando ela pagou; 'Ninguém ainda' em aberto; o nome do terceiro quando houve quitação; '—' na cancelada", () => {
    const ex = montar([
      l({ id: "igreja", status: "realizado", data: "2026-09-01" }), l({ id: "aberta", data: "2026-09-02" }),
      l({ id: "terc", status: "quitado_terceiro", data: "2026-09-03" }), l({ id: "canc", status: "cancelado", data: "2026-09-04" }),
    ], [["terc", { responsavel: "pessoa", responsavelNome: "Ana Souza", intencao: "oferta" }]]);
    const por = Object.fromEntries(ex.map(x => [x.obrigacaoId, [x.responsavel, x.intencao]]));
    expect(por.igreja).toEqual(["Igreja", "—"]);
    expect(por.aberta).toEqual(["Ninguém ainda", "—"]);
    expect(por.terc).toEqual(["Pessoa — Ana Souza", "Oferta"]);
    expect(por.canc).toEqual(["—", "—"]);
  });

  it("a quitada por terceiro entra no extrato normalmente, sem nenhuma movimentação financeira (valor integral, nenhum saldo em aberto)", () => {
    const ex = montar([l({ id: "t", status: "quitado_terceiro", valor: 250 })], [["t", { responsavel: "empresa", responsavelNome: "Mercado X", intencao: "oferta" }]]);
    expect(ex).toHaveLength(1);
    expect(ex[0]).toMatchObject({ situacao: "quitada_por_terceiro", valor: 250, saldoEmAberto: 0, diasEmAtraso: null });
  });

  it("ordena por data e, no empate, por fornecedor", () => {
    const ex = montar([
      l({ id: "3", data: "2026-09-12" }), l({ id: "2", data: "2026-09-10", fornecedor_id: "f2" }), l({ id: "1", data: "2026-09-10", fornecedor_id: "f1" }),
    ]);
    expect(ex.map(x => x.obrigacaoId)).toEqual(["2", "1", "3"]);
    expect(ex.map(x => x.fornecedor)).toEqual(["Gráfica", "Papelaria Central", "Papelaria Central"]);
  });
});

describe("filtro por situação e resumo", () => {
  const ex = montar([
    l({ id: "a1", data: "2026-10-01", valor: 100 }), l({ id: "a2", data: "2026-10-30", valor: 50 }),
    l({ id: "p1", status: "realizado", valor: 200, data: "2026-09-01" }),
    l({ id: "r1", valor: 300, data: "2026-09-02" }), l({ id: "r2", status: "conciliado", valor: 80, data: "2026-09-02" }), l({ id: "t1", status: "quitado_terceiro", valor: 400, data: "2026-09-03" }),
    l({ id: "c1", status: "cancelado", valor: 999, data: "2026-09-04" }),
    l({ id: "pp", status: "realizado", valor: 70, valor_original: 100, data: "2026-09-05" }), l({ id: "pp2", obrigacao_id: "pp", valor: 30, data: "2026-11-01" }),
  ], [
    ["r1", { responsavel: "pessoa", responsavelNome: "Ana", intencao: "reembolso", fila: "reembolso_a_pagar", resultado: "divida_com_terceiro", saldoAReembolsar: 300 }],
    ["r2", { responsavel: "pessoa", responsavelNome: "Ana", intencao: "reembolso", fila: null, resultado: "reembolsada", saldoAReembolsar: 0 }],
    ["t1", { responsavel: "empresa", responsavelNome: "Mercado", intencao: "oferta" }],
  ]);

  it("o resumo: em aberto INCLUI o reembolso a pagar; pago inclui o reembolso já pago; o total não inclui as canceladas; vencidas são parte do em aberto", () => {
    const r = resumoDoExtrato(ex);
    expect(r.quantidade).toBe(8);
    expect(r.valorTotal).toBe(100 + 50 + 200 + 300 + 80 + 400 + 100);   // 1.230, sem os 999 da cancelada
    expect(r.emAberto).toEqual({ quantidade: 4, valor: 100 + 50 + 30 + 300 });     // 2 abertas + a parcial (saldo) + o reembolso a pagar
    expect(r.pagas).toEqual({ quantidade: 2, valor: 200 + 80 });                    // a paga + o reembolso pago
    expect(r.reembolsosPendentes).toEqual({ quantidade: 1, valor: 300 });
    expect(r.quitadasPorTerceiros).toEqual({ quantidade: 1, valor: 400 });
    expect(r.canceladas).toEqual({ quantidade: 1, valor: 999 });
  });

  it("vencidas: só as em aberto que passaram do vencimento (o atraso é um indicador dentro do em aberto)", () => {
    const hoje = montar([l({ id: "v", data: "2026-10-01", valor: 100 }), l({ id: "f", data: "2026-10-30", valor: 50 }), l({ id: "p", status: "realizado", data: "2026-10-01", valor: 70 })], [], "2026-10-16");
    expect(resumoDoExtrato(hoje).vencidas).toEqual({ quantidade: 1, valor: 100 });
    expect(resumoDoExtrato(hoje).emAberto).toEqual({ quantidade: 2, valor: 150 });
  });

  it("o filtro de situação: 'em aberto' inclui a parcial E o reembolso a pagar; 'pagas' inclui o reembolso pago; 'apenas reembolsos' tem as duas metades", () => {
    expect(filtrarPorSituacao(ex, "todas")).toHaveLength(8);
    expect(filtrarPorSituacao(ex, "em_aberto").map(x => x.obrigacaoId).sort()).toEqual(["a1", "a2", "pp", "r1"]);
    expect(filtrarPorSituacao(ex, "paga").map(x => x.obrigacaoId).sort()).toEqual(["p1", "r2"]);
    expect(filtrarPorSituacao(ex, "reembolso").map(x => x.obrigacaoId).sort()).toEqual(["r1", "r2"]);
    expect(filtrarPorSituacao(ex, "reembolso_a_pagar").map(x => x.obrigacaoId)).toEqual(["r1"]);
    expect(filtrarPorSituacao(ex, "reembolso_pago").map(x => x.obrigacaoId)).toEqual(["r2"]);
    expect(filtrarPorSituacao(ex, "quitada_por_terceiro").map(x => x.obrigacaoId)).toEqual(["t1"]);
    expect(filtrarPorSituacao(ex, "cancelada").map(x => x.obrigacaoId)).toEqual(["c1"]);
  });
});

describe("dias e CSV", () => {
  it("diasEntre conta dias corridos sem fuso", () => {
    expect(diasEntre("2026-10-01", "2026-10-16")).toBe(15);
    expect(diasEntre("2026-02-27", "2026-03-02")).toBe(3);
    expect(diasEntre("2026-10-16", "2026-10-16")).toBe(0);
  });

  it("o CSV tem BOM, as 12 colunas na ordem pedida, data em dd/mm/aaaa, aspas onde há ';' e o resumo no fim", () => {
    const ex = montarExtratoDeObrigacoes({
      linhas: [l({ id: "a", descricao: 'Papel; "A4"', documento_numero: "NF 1" })], quitacoes: new Map(), nomes, hoje: "2026-10-16",
    });
    const csv = gerarCSVDoExtrato(ex, resumoDoExtrato(ex), ["Período: 01/09/2026 a 30/09/2026"]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas[0]).toBe("Data;Fornecedor;Documento;Descrição;Categoria;Centro de custo;Projeto;Valor;Situação;Responsável pela quitação;Intenção;Dias em atraso;Conta");
    expect(CABECALHO_DO_EXTRATO).toHaveLength(13);
    expect(linhas[1]).toBe('10/09/2026;Papelaria Central;NF 1;"Papel; ""A4""";Material de Consumo;Ministério Pastoral;;100.00;Em aberto;Ninguém ainda;—;36;');
    expect(csv).toContain("RESUMO;Quantidade;Valor");
    expect(csv).toContain("Total (valor sem canceladas);1;100.00");
    expect(csv).toContain("Em aberto (inclui reembolsos a pagar);1;100.00");
    expect(csv).toContain("Quitadas por terceiros;0;0.00");
    expect(csv).toContain("Filtros: Período: 01/09/2026 a 30/09/2026");
  });
});

describe("ações por linha (20/10/2026): o que o tesoureiro pode fazer sem sair do extrato", () => {
  const a = (situacao: Parameters<typeof acoesDaObrigacao>[0]["situacao"], extra: Partial<Parameters<typeof acoesDaObrigacao>[0]> = {}) =>
    acoesDaObrigacao({ situacao, idEmAberto: "x", reembolsoAPagar: false, ...extra });

  it("em aberto (e vencida: atraso é indicador, não estado) → Editar + Pagar agora", () => {
    for (const s of ["em_aberto", "paga_parcialmente"] as const) expect(a(s)).toEqual({ visualizar: true, editar: true, pagar: "normal", corrigirQuitacao: false, documentacao: true });
  });
  it("paga → só Visualizar; cancelada → só Visualizar", () => {
    for (const s of ["paga", "cancelada"] as const) expect(a(s)).toEqual({ visualizar: true, editar: false, pagar: null, corrigirQuitacao: false, documentacao: true });
  });
  it("quitada por terceiro → Visualizar + Corrigir quitação, e NUNCA Pagar agora (a igreja não paga)", () => {
    expect(a("quitada_por_terceiro")).toEqual({ visualizar: true, editar: false, pagar: null, corrigirQuitacao: true, documentacao: true });
  });
  it("reembolso a pagar → Pagar agora abre o pagamento do REEMBOLSO; reembolso já pago não tem pagar", () => {
    expect(a("reembolso", { reembolsoAPagar: true }).pagar).toBe("reembolso");
    expect(a("reembolso", { reembolsoAPagar: false }).pagar).toBeNull();
    expect(a("reembolso").corrigirQuitacao).toBe(true);
  });
  it("Documentação existe em TODA situação (inclusive cancelada e sem linha em aberto)", () => {
    for (const s of ["em_aberto", "paga_parcialmente", "paga", "reembolso", "quitada_por_terceiro", "cancelada"] as const) expect(a(s).documentacao, s).toBe(true);
    expect(a("em_aberto", { idEmAberto: null }).documentacao).toBe(true);
  });
  it("sem linha em aberto não há o que editar nem pagar, mesmo 'em aberto'", () => {
    expect(a("em_aberto", { idEmAberto: null })).toMatchObject({ editar: false, pagar: null });
  });
});

describe("montagem: a linha em aberto e o reembolso a pagar", () => {
  it("pagamento parcial: a linha a editar/pagar é a PARCELA em aberto, não a raiz já paga", () => {
    const x = montar([l({ id: "raiz", status: "realizado", valor: 40, valor_original: 100 }), l({ id: "parcela", obrigacao_id: "raiz", status: "previsto", valor: 60, data: "2026-10-30" })]);
    expect(x[0].situacao).toBe("paga_parcialmente");
    expect(x[0].idEmAberto).toBe("parcela");
  });
  it("com mais de uma linha em aberto, vale a mais antiga; paga e cancelada não têm", () => {
    const x = montar([l({ id: "b", status: "previsto", data: "2026-10-20" }), l({ id: "a", obrigacao_id: "b", status: "previsto", data: "2026-10-05" })]);
    expect(x[0].idEmAberto).toBe("a");
    expect(montar([l({ id: "p", status: "realizado" })])[0].idEmAberto).toBeNull();
    expect(montar([l({ id: "c", status: "cancelado" })])[0].idEmAberto).toBeNull();
  });
  it("reembolso: a pagar quando a fila ou o resultado dizem que a igreja deve; pago não; e só reembolso tem a marca", () => {
    const q = (extra: Partial<QuitacaoDoExtrato>): [string, QuitacaoDoExtrato] => ["r", { responsavel: "pessoa", responsavelNome: "Lucio", intencao: "reembolso", ...extra }];
    const aPagar = montar([l({ id: "r", status: "previsto", valor: 1500 })], [q({ fila: "reembolso_a_pagar", resultado: "divida_com_terceiro", saldoAReembolsar: 1500 })])[0];
    expect(aPagar).toMatchObject({ situacao: "reembolso", reembolsoAPagar: true, saldoAReembolsar: 1500 });
    const pago = montar([l({ id: "r", status: "conciliado", valor: 310.5 })], [q({ fila: null, resultado: "reembolsada", saldoAReembolsar: 0 })])[0];
    expect(pago).toMatchObject({ situacao: "reembolso", reembolsoAPagar: false, saldoAReembolsar: null });
    const oferta = montar([l({ id: "r", status: "quitado_terceiro" })], [q({ intencao: "oferta", resultado: "extinta_como_oferta" })])[0];
    expect(oferta.reembolsoAPagar).toBe(false);
  });
});

describe("redesenho de 20/10/2026: selos, dias, conta e observação", () => {
  it("selos: cor + forma + palavra; o reembolso se divide em a pagar e pago", () => {
    const s = (situacao: Parameters<typeof seloDaSituacao>[0]["situacao"], reembolsoAPagar = false) => seloDaSituacao({ situacao, reembolsoAPagar });
    expect(s("paga")).toEqual({ chave: "pago", glifo: "✓", rotulo: "Paga" });
    expect(s("em_aberto")).toEqual({ chave: "aberto", glifo: "!", rotulo: "Em aberto" });
    expect(s("paga_parcialmente").rotulo).toBe("Paga parcialmente");
    expect(s("reembolso", true)).toMatchObject({ chave: "reembolso_a_pagar", rotulo: "Reembolso a pagar" });
    expect(s("reembolso", false)).toMatchObject({ chave: "reembolso_pago", rotulo: "Reembolso pago" });
    expect(s("quitada_por_terceiro")).toMatchObject({ chave: "terceiro", glifo: "◆" });
    expect(s("cancelada")).toMatchObject({ chave: "cancelada", glifo: "✕" });
  });

  it("agrupa por dia (vencimento), com o total do dia sem as canceladas e o que ainda está em aberto", () => {
    const ex = montar([
      l({ id: "a", data: "2026-10-02", valor: 600, status: "conciliado" }), l({ id: "b", data: "2026-10-02", valor: 9.8, status: "previsto" }),
      l({ id: "c", data: "2026-10-02", valor: 500, status: "cancelado" }), l({ id: "d", data: "2026-10-01", valor: 1479.65, status: "conciliado" }),
    ], [], "2026-10-16");
    const dias = agruparPorDia(ex);
    expect(dias.map(d => d.data)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(dias[1].linhas).toHaveLength(3);
    expect(dias[1].total).toBe(609.8);          // 600 + 9,80 — a cancelada de 500 não soma
    expect(dias[1].emAberto).toBe(9.8);
    expect(dias[0]).toMatchObject({ total: 1479.65, emAberto: 0 });
  });

  it("o dia da semana sai da data, sem fuso (01/10/2026 é quinta-feira)", () => {
    expect(diaDaSemana("2026-10-01")).toBe("quinta-feira");
    expect(diaDaSemana("2026-09-05")).toBe("sábado");
    expect(diaDaSemana("2026-09-22")).toBe("terça-feira");
  });

  it("filtro de Conta: cada conta, e 'Sem conta financeira' para a conta estrutural das compras pagas por terceiros", () => {
    const comNomes = { ...nomes, contas: new Map([["k1", "Bradesco"], ["k2", "Caixinha Administrativo"]]) };
    const ex = montarExtratoDeObrigacoes({
      linhas: [l({ id: "a", conta_id: "k1" }), l({ id: "b", conta_id: "k1" }), l({ id: "c", conta_id: "k2" }), l({ id: "t", status: "quitado_terceiro", conta_id: "00000000-0000-4000-8000-0000000000a1" })],
      quitacoes: new Map(), nomes: comNomes, hoje: "2026-10-16",
    });
    expect(ex.find(x => x.obrigacaoId === "a")!.conta).toBe("Bradesco");
    expect(ex.find(x => x.obrigacaoId === "t")!.conta).toBe("Sem conta financeira");
    expect(filtrarPorConta(ex, "").length).toBe(4);
    expect(filtrarPorConta(ex, "k1").map(x => x.obrigacaoId).sort()).toEqual(["a", "b"]);
    expect(filtrarPorConta(ex, "00000000-0000-4000-8000-0000000000a1").map(x => x.obrigacaoId)).toEqual(["t"]);
    expect(contagemPorConta(ex).get("k1")).toBe(2);
    expect(contagemPorConta(ex).get("k2")).toBe(1);
  });

  it("observação: as marcas técnicas de importação ([ofx:…]) saem; a observação de verdade fica", () => {
    expect(observacaoLegivel("[ofx:NY0C7I] [ofx-sfx:muz0uzmh]")).toBe("");
    expect(observacaoLegivel("NF não entregue [ofx:AB12] | Resolver.")).toBe("NF não entregue | Resolver.");
    expect(observacaoLegivel(null)).toBe("");
    expect(montar([l({ id: "o", observacoes: "[ofx:X1] Aguardando resolução" })])[0].observacoes).toBe("Aguardando resolução");
  });

  it("a linha traz o grau de prova, a quantidade de documentos e o saldo a reembolsar", () => {
    const ex = montarExtratoDeObrigacoes({
      linhas: [l({ id: "r" })], hoje: "2026-10-16", nomes, anexos: new Map([["r", 3]]),
      quitacoes: new Map([["r", { responsavel: "pessoa", responsavelNome: "Lucio", intencao: "reembolso", fila: "reembolso_a_pagar", saldoAReembolsar: 1500, grau: "Formal" }]]),
    });
    expect(ex[0]).toMatchObject({ anexos: 3, grau: "Formal", saldoAReembolsar: 1500, reembolsoAPagar: true });
  });
});
