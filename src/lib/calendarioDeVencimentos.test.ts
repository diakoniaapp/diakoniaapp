import { describe, expect, it } from "vitest";
import { gradeDoMes, limitesDoMesDoCalendario, mesDe, somarMeses, tomDoDia } from "./calendarioDeVencimentos";
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
