import { describe, expect, it } from "vitest";
import { lerExtratoConsolidado, pareceExtratoConsolidado } from "./extratoConsolidadoPdf";

// texto sintético com a FORMA do extrato consolidado do Bradesco (histórico em várias linhas, débito com sinal, saldo corrente)
const TEXTO = `
===== PAGINA 1 =====
Extrato Consolidado / Por Período
QUARTA IGREJA BATISTA DO RIO DE JANEIRO | CNPJ: 000
Nome do usuário: FULANO
Folha 1/2
Agência | Conta Total Disponível (R$) Total (R$)
02013 | 0199094-2 1,00 1,00
Extrato de: Ag: 2013 | CC: 0199094-2 | Entre 01/09/2026 e 30/09/2026
Data Lançamento Dcto. Crédito (R$) Débito (R$) Saldo (R$)
31/08/2026 SALDO ANTERIOR 1,00
01/09/2026 RESGATE INVEST FACIL 1027249 1.857,08 1.858,08
PIX RECEBIDO
221265 500,00 2.358,08
REM: VANESSA DO NASCIMENTO 01/09
TARIFA BANCARIA
310826 -9,80 2.348,28
TRANSF PGTO PIX
PAGTO ELETRONICO TRIBUTO
5956000 -31,51 2.316,77
INTERNET --P.M RIO JANEIRO/RJ
02/09/2026 APLIC.INVEST FACIL 1067645 -2.315,77 1,00
Total 2.357,08 -2.357,08 1,00
Os dados acima têm como base 05/10/2026 às 16h25 e estão sujeitos a alterações.
Últimos Lançamentos
Data Lançamento Dcto. Crédito (R$) Débito (R$) Saldo (R$)
01/10/2026 SALDO ANTERIOR 640,15
APLIC.INVEST FACIL 5643063 -639,15 1,00
PIX RECEBIDO
02/10/2026 821487 219,00 220,00
REM: LOURDES BEATRIZ RODRI 02/10
TRANSF.AUTORIZ.ENTRE C/C
2013692 830,00 1.050,00
CLAUDIA VILELA DE ALMEIDA
Total 1.049,00 -639,15 1.050,00
Saldos Invest Fácil / Plus
Data Histórico Valor (R$)
01/09/2026 SALDO INVEST FÁCIL 2.378,38
`;

describe("extrato consolidado do Bradesco (PDF → lançamentos)", () => {
  const r = lerExtratoConsolidado(TEXTO);

  it("reconhece o formato", () => {
    expect(pareceExtratoConsolidado(TEXTO)).toBe(true);
    expect(pareceExtratoConsolidado("qualquer outro papel")).toBe(false);
  });

  it("lê data, histórico em várias linhas, valor (débito negativo) e saldo", () => {
    expect(r.lancamentos).toHaveLength(8);
    expect(r.lancamentos[0]).toMatchObject({ data: "2026-09-01", historico: "RESGATE INVEST FACIL", documento: "1027249", valor: 1857.08, saldo: 1858.08 });
    expect(r.lancamentos[1]).toMatchObject({ data: "2026-09-01", valor: 500, historico: "PIX RECEBIDO REM: VANESSA DO NASCIMENTO 01/09" });
    expect(r.lancamentos[2]).toMatchObject({ valor: -9.8, historico: "TARIFA BANCARIA" });
    expect(r.lancamentos[3].historico).toContain("PAGTO ELETRONICO TRIBUTO");
    expect(r.lancamentos[3].historico).toContain("--P.M RIO JANEIRO/RJ");
  });

  it("a data só aparece no primeiro lançamento do dia: os seguintes herdam", () => {
    expect(r.lancamentos.slice(0, 4).map(l => l.data)).toEqual(["2026-09-01", "2026-09-01", "2026-09-01", "2026-09-01"]);
    expect(r.lancamentos[4].data).toBe("2026-09-02");
  });

  it("a data pode vir na linha de fechamento depois do histórico (PIX RECEBIDO / 02/10/2026 821487 …)", () => {
    const pix = r.lancamentos.find(l => l.documento === "821487")!;
    expect(pix).toMatchObject({ data: "2026-10-02", valor: 219 });
    expect(pix.historico).toContain("LOURDES BEATRIZ");
  });

  it("a continuação em maiúsculas (nome de quem transferiu) fica no histórico", () => {
    expect(r.lancamentos.at(-1)!.historico).toContain("CLAUDIA VILELA DE ALMEIDA");
  });

  it("dois blocos, cada um com saldo anterior e total; a cadeia de saldos fecha e os totais batem", () => {
    expect(r.blocos).toHaveLength(2);
    expect(r.blocos[0]).toMatchObject({ saldoAnterior: 1, dataSaldoAnterior: "2026-08-31", n: 5 });
    expect(r.blocos[1]).toMatchObject({ saldoAnterior: 640.15, dataSaldoAnterior: "2026-10-01", n: 3 });
    expect(r.quebras).toEqual([]);
    expect(r.totaisDivergentes).toEqual([]);
  });

  it("lê a agência e a conta do cabeçalho (a tela confere se o PDF é da conta certa)", () => {
    expect(r.contas).toEqual([{ agencia: "2013", conta: "0199094-2" }]);
  });

  it("o saldo do Invest Fácil por dia é lido à parte", () => {
    expect(r.saldosInvest).toEqual([{ data: "2026-09-01", saldo: 2378.38 }]);
  });

  it("uma linha lida errada aparece como quebra da cadeia — nunca em silêncio", () => {
    const errado = lerExtratoConsolidado(TEXTO.replace("221265 500,00 2.358,08", "221265 500,00 2.999,99"));
    expect(errado.quebras.length).toBeGreaterThan(0);
    expect(errado.quebras[0]).toMatchObject({ saldoLido: 2999.99, saldoEsperado: 2358.08 });
  });

  it("total impresso diferente do lido é sinalizado", () => {
    const errado = lerExtratoConsolidado(TEXTO.replace("Total 2.357,08 -2.357,08 1,00", "Total 9.999,00 -2.357,08 1,00"));
    expect(errado.totaisDivergentes).toEqual([{ bloco: 0, campo: "creditos", lido: 2357.08, impresso: 9999 }]);
  });
});
