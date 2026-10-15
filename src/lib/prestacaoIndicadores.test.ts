import { describe, expect, it } from "vitest";
import {
  chaveFinanceira, despesaTotalPorMes, despesasFinanceiras, fluxoDoRelatorio, granularidadeDoRelatorio, indicadoresGerenciais, resumoExecutivo, rotuloInstitucional,
  serieDoRelatorio, tendenciaMensal, type BaseDaPrestacao,
} from "./prestacaoIndicadores";

const linha = (nome: string, valores: number[]) => ({ categoriaId: nome, nome, valores, total: valores.reduce((s, v) => s + v, 0), temNota: false });

// Setembro e Outubro de 2026. Receitas 500/300; despesas dos ministérios 200/400; financeiras 110/25. O saldo de cada mês fecha com o do quadro.
const base = (): BaseDaPrestacao => ({
  meses: [{ ano: 2026, numero: 9, nome: "Setembro" }, { ano: 2026, numero: 10, nome: "Outubro" }],
  saldoAnterior: [1000, 1200], totalReceitas: [500, 300], totalDespesas: [200, 400],
  grupoDespesasFinanceiras: { linhas: [linha("Tarifas Bancárias", [10, 5]), linha("Título de Capitalização", [100, 0]), linha("Juros", [0, 20])], valores: [110, 25], total: 135 },
  grupoOutrasDespesas: null,
  resultado: [190, -125], saldoFinal: [1190, 1075],
  comprasOfertadas: { itens: [{}, {}], total: 117.9 },
  fluxo: [
    { data: "2026-09-05", tipo: "entrada", valor: 500 }, { data: "2026-09-10", tipo: "saida", valor: 200 }, { data: "2026-09-15", tipo: "saida", valor: 110 },
    { data: "2026-10-03", tipo: "entrada", valor: 300 }, { data: "2026-10-20", tipo: "saida", valor: 400 }, { data: "2026-10-25", tipo: "saida", valor: 25 },
  ],
});

describe("nomenclatura institucional (só na apresentação)", () => {
  it("Ofertas à Preletores → Ofertas a Preletores (sem crase diante de masculino)", () => {
    expect(rotuloInstitucional("Ofertas à Preletores")).toBe("Ofertas a Preletores");
    expect(rotuloInstitucional("Doação à Igreja")).toBe("Doação à Igreja");        // crase certa, feminino: fica
  });
  it("acentos que faltam", () => {
    expect(rotuloInstitucional("Dizimos")).toBe("Dízimos");
    expect(rotuloInstitucional("Pastoral · Residencia Pastoral")).toBe("Pastoral · Residência Pastoral");
  });
  it("'Min.' vira Ministério, com 'de' onde a língua pede", () => {
    expect(rotuloInstitucional("Min. Música")).toBe("Ministério de Música");
    expect(rotuloInstitucional("Min. Diaconia e Ação Social")).toBe("Ministério de Diaconia e Ação Social");
    expect(rotuloInstitucional("Min. Celebrando a Transformação")).toBe("Ministério Celebrando a Transformação");
    expect(rotuloInstitucional("Min. Comunhão, Integração e Crescimento")).toBe("Ministério Comunhão, Integração e Crescimento");
    expect(rotuloInstitucional("Min. Pastoral")).toBe("Ministério Pastoral");
  });
  it("o que já está certo não muda, e espaços sobrando saem", () => {
    expect(rotuloInstitucional("Energia Elétrica")).toBe("Energia Elétrica");
    expect(rotuloInstitucional("  Água   e Esgoto ")).toBe("Água e Esgoto");
  });
});

describe("resumo executivo", () => {
  it("sai dos mesmos totais da tabela e fecha: receita − despesa total = resultado", () => {
    const r = resumoExecutivo(base());
    expect(r).toMatchObject({ receitaTotal: 800, despesasDosMinisterios: 600, despesasFinanceiras: 135, outrasDespesas: 0, despesaTotal: 735, resultado: 65, situacao: "superavit", saldoInicial: 1000, saldoFinal: 1075, comprasOfertadasQtd: 2, comprasOfertadasValor: 117.9 });
    expect(r.receitaTotal - r.despesaTotal).toBeCloseTo(r.resultado, 2);
  });
  it("déficit e equilíbrio", () => {
    expect(resumoExecutivo({ ...base(), resultado: [-10, -5] }).situacao).toBe("deficit");
    expect(resumoExecutivo({ ...base(), resultado: [0, 0.001] }).situacao).toBe("equilibrio");
  });
  it("as compras ofertadas ficam de fora do resultado e do saldo", () => {
    const sem = resumoExecutivo({ ...base(), comprasOfertadas: { itens: [], total: 0 } });
    const com = resumoExecutivo(base());
    expect([com.resultado, com.saldoFinal, com.despesaTotal]).toEqual([sem.resultado, sem.saldoFinal, sem.despesaTotal]);
  });
  it("as despesas 'outras' entram na despesa total", () => {
    const r = resumoExecutivo({ ...base(), grupoOutrasDespesas: { valores: [10, 0], total: 10 } });
    expect(r.outrasDespesas).toBe(10);
    expect(r.despesaTotal).toBe(745);
  });
});

describe("despesas financeiras", () => {
  it("separa tarifas, título de capitalização e demais encargos, com subtotal e total", () => {
    const d = despesasFinanceiras(base());
    expect(d.subgrupos.map(g => [g.titulo, g.total])).toEqual([["Tarifas Bancárias", 15], ["Título de Capitalização", 100], ["Outros encargos financeiros", 20]]);
    expect(d.subgrupos[0].valores).toEqual([10, 5]);
    expect(d.valores).toEqual([110, 25]);
    expect(d.total).toBe(135);
  });
  it("sem despesa financeira, os três blocos aparecem zerados", () => {
    const d = despesasFinanceiras({ ...base(), grupoDespesasFinanceiras: null });
    expect(d.subgrupos).toHaveLength(3);
    expect(d.subgrupos.every(g => g.total === 0 && g.linhas.length === 0)).toBe(true);
    expect(d.total).toBe(0);
  });
  it("classifica por nome, sem depender de acento nem de caixa", () => {
    expect(chaveFinanceira("TARIFAS bancárias")).toBe("tarifas");
    expect(chaveFinanceira("Título de capitalizacao")).toBe("capitalizacao");
    expect(chaveFinanceira("Multas")).toBe("outros");
    expect(chaveFinanceira("Juros")).toBe("outros");
  });
});

describe("fluxo de caixa", () => {
  it("cada mês parte do seu Saldo Anterior: o saldo do último dia de cada mês é o Saldo Final da tabela", () => {
    const b = base();
    const s = serieDoRelatorio(b);
    expect(s).toHaveLength(30 + 31);
    expect(s[0].saldo).toBe(1000);                                  // 1º de setembro, antes de qualquer movimento
    expect(s[29].saldo).toBe(b.saldoFinal[0]);                      // 30 de setembro
    expect(s[30].saldo).toBe(1200);                                 // 1º de outubro recomeça do Saldo Anterior de outubro
    expect(s[s.length - 1].saldo).toBe(b.saldoFinal[1]);            // 31 de outubro
  });
  it("sem lançamentos, a série é só o saldo parado", () => {
    const s = serieDoRelatorio({ ...base(), fluxo: [] });
    expect(s.every(d => d.entradas === 0 && d.saidas === 0)).toBe(true);
    expect(s[0].saldo).toBe(1000);
  });
  it("Automático: até 2 meses é diário, até 6 semanal, acima mensal; a escolha manual vale sempre", () => {
    expect(granularidadeDoRelatorio(30, "automatico")).toBe("dia");
    expect(granularidadeDoRelatorio(61, "automatico")).toBe("dia");
    expect(granularidadeDoRelatorio(90, "automatico")).toBe("semana");
    expect(granularidadeDoRelatorio(186, "automatico")).toBe("semana");
    expect(granularidadeDoRelatorio(365, "automatico")).toBe("mes");
    expect(granularidadeDoRelatorio(30, "semanal")).toBe("semana");
    expect(granularidadeDoRelatorio(30, "mensal")).toBe("mes");
    expect(granularidadeDoRelatorio(400, "diario")).toBe("dia");
  });
  it("o agrupamento muda os pontos, não os totais nem o saldo final", () => {
    const b = base();
    const dia = fluxoDoRelatorio(b, "diario"), sem = fluxoDoRelatorio(b, "semanal"), mes = fluxoDoRelatorio(b, "mensal");
    expect([dia.pontos.length, mes.pontos.length]).toEqual([61, 2]);
    expect(sem.pontos.length).toBeGreaterThan(8);
    for (const f of [dia, sem, mes]) {
      expect(f.pontos.reduce((t, p) => t + p.entradas, 0)).toBe(800);
      expect(f.pontos.reduce((t, p) => t + p.saidas, 0)).toBe(735);
      expect(f.pontos[f.pontos.length - 1].saldo).toBe(1075);
    }
    expect(mes.pontos.map(p => p.saldo)).toEqual([1190, 1075]);
  });
});

describe("indicadores gerenciais", () => {
  it("maiores marcos mensais, menor saldo (do dia mais baixo) e médias", () => {
    const b = base();
    const g = indicadoresGerenciais(b, serieDoRelatorio(b));
    expect(g.maiorArrecadacao).toEqual({ valor: 500, mes: "Setembro" });
    expect(g.maiorDespesa).toEqual({ valor: 425, mes: "Outubro" });     // 400 + 25 financeiras
    expect(g.menorSaldo).toEqual({ valor: 1000, mes: "Setembro" });
    expect(g.mesesComSaldoNegativo).toBe(0);
    expect(g.totalDeMeses).toBe(2);
    expect(g.mediaMensalReceitas).toBe(400);
    expect(g.mediaMensalDespesas).toBe(367.5);                         // (310 + 425) / 2
  });
  it("conta os meses de saldo negativo e acha o menor saldo no mês certo", () => {
    const b: BaseDaPrestacao = { ...base(), saldoAnterior: [100, -50], saldoFinal: [-20, -300], fluxo: [{ data: "2026-09-10", tipo: "saida", valor: 120 }, { data: "2026-10-12", tipo: "saida", valor: 250 }] };
    const g = indicadoresGerenciais(b, serieDoRelatorio(b));
    expect(g.mesesComSaldoNegativo).toBe(2);
    expect(g.menorSaldo).toEqual({ valor: -300, mes: "Outubro" });
  });
  it("período que cruza o ano mostra o ano do mês que não é o primeiro", () => {
    const b: BaseDaPrestacao = { ...base(), meses: [{ ano: 2026, numero: 12, nome: "Dezembro" }, { ano: 2027, numero: 1, nome: "Janeiro" }], totalReceitas: [100, 900], fluxo: [] };
    expect(indicadoresGerenciais(b, serieDoRelatorio(b)).maiorArrecadacao).toEqual({ valor: 900, mes: "Janeiro/2027" });
  });
  it("sem receita ou sem despesa não inventa um 'maior'", () => {
    const b: BaseDaPrestacao = { ...base(), totalReceitas: [0, 0], totalDespesas: [0, 0], grupoDespesasFinanceiras: null, fluxo: [] };
    const g = indicadoresGerenciais(b, serieDoRelatorio(b));
    expect(g.maiorArrecadacao).toBeNull();
    expect(g.maiorDespesa).toBeNull();
  });
  it("despesa do mês = ministérios + financeiras + outras", () => {
    expect(despesaTotalPorMes({ ...base(), grupoOutrasDespesas: { valores: [5, 0], total: 5 } })).toEqual([315, 425]);
  });
});

describe("tendência", () => {
  it("compara a segunda metade com a primeira", () => {
    expect(tendenciaMensal([100, 100, 100, 150, 150, 150])).toEqual({ sentido: "alta", variacao: 50 });
    expect(tendenciaMensal([200, 200, 100, 100])).toEqual({ sentido: "queda", variacao: -50 });
    expect(tendenciaMensal([100, 101, 102, 103])?.sentido).toBe("estavel");
  });
  it("menos de 3 meses ou base zerada: nada a dizer", () => {
    expect(tendenciaMensal([100, 200])).toBeNull();
    expect(tendenciaMensal([0, 0, 50, 60])).toBeNull();
  });
});
