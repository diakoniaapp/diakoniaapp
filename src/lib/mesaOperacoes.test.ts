import { describe, expect, it } from "vitest";
import {
  agruparVencimentos, coberturaDoCaixa, diasEntreDatas, montarChecklist, pendenciasDoChecklist,
  resumoDoCaixa, totalAPagar, type VencimentoLike,
} from "./mesaOperacoes";

const v = (id: string, dias: number, valor: number, forma?: string): VencimentoLike => ({
  id, dias_para_vencer: dias, valor, data: `2026-10-${String(6 + dias).padStart(2, "0")}`, tipo: "saida", forma_liquidacao: forma,
});

describe("agruparVencimentos", () => {
  const todos = [
    v("a", -2, 100), v("b", 0, 200), v("c", 1, 50), v("d", 4, 75), v("e", 7, 25), v("f", 8, 10), v("g", 30, 5), v("h", 31, 999),
    v("amil", 0, 2821.46, "debito_automatico"),
    v("pix", 3, 40, "pix_recorrente"),
    v("bol", 2, 300, "boleto_fatura"),
  ];
  const { aPagar, automaticos } = agruparVencimentos(todos);

  it("separa por janela: atrasadas, hoje, amanhã, 2 a 7 dias, 8 a 30 dias (e ignora além de 30)", () => {
    expect(aPagar.atrasadas.map(x => x.id)).toEqual(["a"]);
    expect(aPagar.hoje.map(x => x.id)).toEqual(["b"]);
    expect(aPagar.amanha.map(x => x.id)).toEqual(["c"]);
    expect(aPagar.semana.map(x => x.id)).toEqual(["bol", "d", "e"]);
    expect(aPagar.ate30.map(x => x.id)).toEqual(["f", "g"]);
  });

  it("débito automático e PIX recorrente NÃO entram em contas a pagar; boleto/fatura entra", () => {
    const ids = Object.values(aPagar).flat().map(x => x.id);
    expect(ids).not.toContain("amil");
    expect(ids).not.toContain("pix");
    expect(ids).toContain("bol");
    expect(automaticos.map(x => x.id)).toEqual(["amil", "pix"]);
  });

  it("sem a migration (forma ausente), tudo é conta a pagar — nada some", () => {
    const r = agruparVencimentos([v("x", 0, 10), v("y", -1, 20)]);
    expect(r.automaticos).toHaveLength(0);
    expect(r.aPagar.hoje).toHaveLength(1);
  });

  it("ignora entradas", () => {
    expect(agruparVencimentos([{ ...v("e", 0, 10), tipo: "entrada" }]).aPagar.hoje).toHaveLength(0);
  });

  it("totais por horizonte", () => {
    expect(totalAPagar(aPagar, "hoje")).toBe(300);          // atrasada 100 + hoje 200
    expect(totalAPagar(aPagar, "semana")).toBe(750);        // + amanhã 50 + semana (300+75+25)
    expect(totalAPagar(aPagar, "30d")).toBe(765);           // + 10 + 5
  });
});

describe("caixa", () => {
  it("disponível = banco + caixa + envelope; aplicação e cartão ficam à parte", () => {
    const r = resumoDoCaixa([
      { tipo: "banco", saldo_atual: 1 }, { tipo: "caixa", saldo_atual: 57.7 }, { tipo: "envelope", saldo_atual: 2130 },
      { tipo: "aplicacao", saldo_atual: 9108.1 }, { tipo: "aplicacao", saldo_atual: 15192.83 }, { tipo: "cartao", saldo_atual: -8249.72 },
    ]);
    expect(r).toEqual({ disponivel: 2188.7, aplicacoes: 24300.93, cartao: -8249.72 });
  });
  it("cobertura: sobra ou falta", () => {
    expect(coberturaDoCaixa(2188.7, 1000)).toEqual({ saldoDepois: 1188.7, cobre: true });
    expect(coberturaDoCaixa(500, 1200.5)).toEqual({ saldoDepois: -700.5, cobre: false });
  });
});

describe("checklist do dia", () => {
  const limpo = { atrasadas: 0, venceHoje: 0, debitosAConferir: 0, comprovantesPendentes: 0, diasSemExtrato: 1, aprovacoesParadas: 0, documentosFaltando: 0 };
  it("tudo em dia → nenhuma pendência", () => {
    const c = montarChecklist(limpo);
    expect(pendenciasDoChecklist(c)).toBe(0);
    expect(c.every(i => i.feito)).toBe(true);
  });
  it("conta o que falta e escreve no singular/plural", () => {
    const c = montarChecklist({ ...limpo, atrasadas: 1, venceHoje: 3, comprovantesPendentes: 2, documentosFaltando: 1 });
    expect(pendenciasDoChecklist(c)).toBe(4);
    expect(c.find(i => i.chave === "atrasadas")!.detalhe).toBe("1 conta atrasada");
    expect(c.find(i => i.chave === "hoje")!.detalhe).toBe("3 contas vencem hoje");
    expect(c.find(i => i.chave === "documentos")!.detalhe).toBe("1 pagamento sem documento neste mês");
  });
  it("extrato só vira pendência depois de 4 dias sem movimento no banco", () => {
    expect(montarChecklist({ ...limpo, diasSemExtrato: 4 }).find(i => i.chave === "extrato")!.feito).toBe(true);
    const i = montarChecklist({ ...limpo, diasSemExtrato: 9 }).find(i => i.chave === "extrato")!;
    expect(i.feito).toBe(false);
    expect(i.detalhe).toBe("último movimento há 9 dias");
    expect(montarChecklist({ ...limpo, diasSemExtrato: null }).find(i => i.chave === "extrato")!.feito).toBe(true);
  });
});

describe("diasEntreDatas", () => {
  it("conta dias inteiros, inclusive na virada de mês", () => {
    expect(diasEntreDatas("2026-09-28", "2026-10-06")).toBe(8);
    expect(diasEntreDatas("2026-10-06", "2026-10-06")).toBe(0);
  });
});
