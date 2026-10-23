import { describe, expect, it } from "vitest";
import { alertasDoDia, gradeDoMes, limitesDoMesDoCalendario, mesDe, rotuloDaSemana, semanaDe, somarDias, somarMeses, tomDoDia } from "./calendarioDeVencimentos";
import type { LinhaDoExtrato } from "./extratoDeObrigacoes";

const linha = (o: Partial<LinhaDoExtrato>): LinhaDoExtrato => ({
  obrigacaoId: "a", data: "2026-10-15", fornecedor: "X", documento: "", descricao: "", categoria: "", centro: "", projeto: "", valor: 100, saldoEmAberto: 0, situacao: "paga", responsavel: "Igreja",
  intencao: "—", diasEmAtraso: null, idEmAberto: null, reembolsoAPagar: false, saldoAReembolsar: null, contaId: "", conta: "", observacoes: "", anexos: 0, debito: null, documentacao: null, grau: null, ...o,
});
const dia = (...linhas: Partial<LinhaDoExtrato>[]) => ({ linhas: linhas.map(linha) });

describe("grade do mês", () => {
  it("outubro/2026 começa numa quinta (4 células vazias antes) e tem 31 dias em semanas de domingo a sábado", () => {
    const g = gradeDoMes(2026, 10);
    expect(g.every(s => s.length === 7)).toBe(true);
    expect(g[0].filter(c => c.data === null)).toHaveLength(4);
    expect(g[0][4]).toEqual({ data: "2026-10-01", dia: 1 });
    expect(g.flat().filter(c => c.data).length).toBe(31);
    expect(g.flat().filter(c => c.data).at(-1)!.data).toBe("2026-10-31");
  });
  it("fevereiro bissexto e mês que começa no domingo", () => {
    expect(gradeDoMes(2028, 2).flat().filter(c => c.data)).toHaveLength(29);
    expect(gradeDoMes(2026, 11)[0][0]).toEqual({ data: "2026-11-01", dia: 1 });   // 01/11/2026 é domingo
  });
});

describe("navegação entre meses", () => {
  it("vira o ano nos dois sentidos", () => {
    expect(somarMeses({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
    expect(somarMeses({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(mesDe("2026-10-20")).toEqual({ ano: 2026, mes: 10 });
    expect(limitesDoMesDoCalendario({ ano: 2026, mes: 2 })).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
  });
});

describe("tom do dia — o pior que há nele", () => {
  const hoje = "2026-10-20";
  it("sem obrigação, ou só cancelada: vazio", () => {
    expect(tomDoDia(null, hoje)).toBe("vazio");
    expect(tomDoDia(dia({ situacao: "cancelada" }), hoje)).toBe("vazio");
  });
  it("tudo pago: pago; só quitadas por terceiro: terceiro", () => {
    expect(tomDoDia(dia({ situacao: "paga" }, { situacao: "reembolso" }), hoje)).toBe("pago");
    expect(tomDoDia(dia({ situacao: "quitada_por_terceiro" }), hoje)).toBe("terceiro");
  });
  it("em aberto que ainda vai vencer: aberto; já vencida: atraso", () => {
    expect(tomDoDia(dia({ data: "2026-10-25", situacao: "em_aberto", saldoEmAberto: 100 }), hoje)).toBe("aberto");
    expect(tomDoDia(dia({ data: "2026-10-10", situacao: "em_aberto", saldoEmAberto: 100, diasEmAtraso: 10 }), hoje)).toBe("atraso");
    expect(tomDoDia(dia({ data: "2026-10-10", situacao: "paga_parcialmente", saldoEmAberto: 40, diasEmAtraso: 10 }), hoje)).toBe("atraso");
  });
  it("reembolso a pagar conta como em aberto", () => {
    expect(tomDoDia(dia({ data: "2026-10-25", situacao: "reembolso", reembolsoAPagar: true }), hoje)).toBe("aberto");
  });
  it("débito automático: pelo acompanhamento — previsto é só 'aberto'; aguardando é amarelo; possível falha é vermelho", () => {
    expect(tomDoDia(dia({ data: "2026-10-25", situacao: "em_aberto", debito: "previsto" }), hoje)).toBe("aberto");
    expect(tomDoDia(dia({ data: "2026-10-20", situacao: "em_aberto", debito: "previsto_hoje" }), hoje)).toBe("aberto");
    expect(tomDoDia(dia({ data: "2026-10-19", situacao: "em_aberto", debito: "aguardando", diasEmAtraso: 1 }), hoje)).toBe("aguardando");
    expect(tomDoDia(dia({ data: "2026-10-10", situacao: "em_aberto", debito: "nao_encontrado", diasEmAtraso: 10 }), hoje)).toBe("atraso");
  });
  it("a prioridade é a do pior: uma falha pinta o dia de vermelho mesmo com o resto pago", () => {
    expect(tomDoDia(dia({ situacao: "paga" }, { situacao: "em_aberto", debito: "nao_encontrado" }), hoje)).toBe("atraso");
  });
});

describe("alertasDoDia — quantas pedem atenção (a linha de alerta da célula)", () => {
  const hoje = "2026-10-21";
  it("dia sem alerta: tudo zero (a célula não ganha linha extra)", () => {
    expect(alertasDoDia(dia({ situacao: "paga" }, { situacao: "em_aberto", data: "2026-10-30" }), hoje)).toEqual({ vencidas: 0, possivelFalha: 0, aConferir: 0 });
    expect(alertasDoDia(null, hoje)).toEqual({ vencidas: 0, possivelFalha: 0, aConferir: 0 });
  });
  it("conta as vencidas em aberto (por data ou por dias em atraso), sem débito automático", () => {
    const d = dia({ obrigacaoId: "1", situacao: "em_aberto", data: "2026-10-15" }, { obrigacaoId: "2", situacao: "paga_parcialmente", data: "2026-10-20" },
      { obrigacaoId: "3", situacao: "em_aberto", data: "2026-10-21", diasEmAtraso: 2 }, { obrigacaoId: "4", situacao: "em_aberto", data: "2026-10-21" }, { obrigacaoId: "5", situacao: "paga", data: "2026-10-10" });
    expect(alertasDoDia(d, hoje).vencidas).toBe(3);
  });
  it("débito automático não encontrado é possível falha; aguardando é a conferir — e nenhum dos dois conta como vencida", () => {
    const d = dia({ situacao: "em_aberto", data: "2026-10-15", debito: "nao_encontrado" }, { obrigacaoId: "b", situacao: "em_aberto", data: "2026-10-15", debito: "aguardando" });
    expect(alertasDoDia(d, hoje)).toEqual({ vencidas: 0, possivelFalha: 1, aConferir: 1 });
  });
  it("cancelada não conta", () => {
    expect(alertasDoDia(dia({ situacao: "cancelada", data: "2026-10-01" }), hoje).vencidas).toBe(0);
  });
});

describe("a semana do celular", () => {
  it("vai de domingo a sábado e contém o dia pedido", () => {
    const s = semanaDe("2026-10-23");   // sexta
    expect(s.inicio).toBe("2026-10-18");
    expect(s.fim).toBe("2026-10-24");
    expect(s.dias.map(d => d.data)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(s.dias[0].dia).toBe(18);
  });
  it("domingo abre a própria semana; sábado fecha a dele", () => {
    expect(semanaDe("2026-10-18").inicio).toBe("2026-10-18");
    expect(semanaDe("2026-10-24").inicio).toBe("2026-10-18");
  });
  it("atravessa o mês e o ano sem escorregar um dia", () => {
    expect(semanaDe("2026-09-30")).toMatchObject({ inicio: "2026-09-27", fim: "2026-10-03" });   // quarta: a semana atravessa o mês
    expect(semanaDe("2026-10-31")).toMatchObject({ inicio: "2026-10-25", fim: "2026-10-31" });   // sábado: fecha a própria semana
    expect(semanaDe("2027-01-01")).toMatchObject({ inicio: "2026-12-27", fim: "2027-01-02" });
  });
  it("soma dias, inclusive para trás e na virada do mês", () => {
    expect(somarDias("2026-10-23", 7)).toBe("2026-10-30");
    expect(somarDias("2026-10-30", 7)).toBe("2026-11-06");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("o rótulo diz a semana em português", () => {
    expect(rotuloDaSemana(semanaDe("2026-10-23"))).toBe("18 a 24 de outubro");
    expect(rotuloDaSemana(semanaDe("2026-09-30"))).toBe("27 de setembro a 3 de outubro");
    expect(rotuloDaSemana(semanaDe("2027-01-01"))).toBe("27 de dezembro de 2026 a 2 de janeiro de 2027");
  });
});
