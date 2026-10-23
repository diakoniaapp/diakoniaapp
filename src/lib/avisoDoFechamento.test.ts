import { describe, expect, it } from "vitest";
import { avisoDoFechamento } from "./avisoDoFechamento";

const setembro = { rotulo: "Setembro/2026", resumo: { prontidao: 83.4 } };

describe("o aviso do fechamento na Mesa", () => {
  it("nos primeiros 20 dias do mês, fala do mês anterior com o percentual do malote", () => {
    const a = avisoDoFechamento("2026-10-05", setembro, { prontidao: 10 });
    expect(a).toMatchObject({ rotulo: "Setembro/2026", prontidao: 83.4, pronto: false, fimDeMes: false });
    expect(a?.texto).toBe("Fechamento de Setembro/2026 · 83,4% do malote pronto");
  });
  it("o dia 20 ainda conta; do 21 em diante o aviso some (fora do fim do mês)", () => {
    expect(avisoDoFechamento("2026-10-20", setembro, null)).not.toBeNull();
    expect(avisoDoFechamento("2026-10-21", setembro, { prontidao: 50 })).toBeNull();
    expect(avisoDoFechamento("2026-10-23", setembro, { prontidao: 50 })).toBeNull();
  });
  it("sem a documentação do mês anterior (carregou com erro, ou passou do dia 20) não há aviso", () => {
    expect(avisoDoFechamento("2026-10-05", null, { prontidao: 90 })).toBeNull();
  });
  it("nos 3 últimos dias do mês, fala do próprio mês", () => {
    const a = avisoDoFechamento("2026-10-29", null, { prontidao: 71 });
    expect(a).toMatchObject({ rotulo: "Outubro/2026", fimDeMes: true, pronto: false });
    expect(a?.texto).toBe("Fechamento de Outubro/2026 · 71% do malote pronto");
    expect(avisoDoFechamento("2026-10-28", null, { prontidao: 71 })).toBeNull();   // 31 − 3 = 28: ainda cedo
    expect(avisoDoFechamento("2026-02-26", null, { prontidao: 71 })?.rotulo).toBe("Fevereiro/2026");   // fevereiro tem 28 dias
  });
  it("100%: o malote está pronto para gerar", () => {
    const a = avisoDoFechamento("2026-10-05", { rotulo: "Setembro/2026", resumo: { prontidao: 100 } }, null);
    expect(a).toMatchObject({ pronto: true });
    expect(a?.texto).toBe("Fechamento de Setembro/2026 · malote pronto para gerar");
  });
});
