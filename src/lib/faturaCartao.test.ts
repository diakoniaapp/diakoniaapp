// ─── Testes de `faturaCartao.ts` ─────────────────────────────────────────
//
// Textos abaixo são o resultado REAL de `textoDoPdf` rodando contra dois
// extratos de cartão de janeiro/2024 (Bradesco Net Empresa) que a Telma
// baixou e passou — um por titular ("MARIA R M ALVES", "SIDNEY V FILHO").
// Conferido ao vivo no navegador antes de virar teste: os totais batem
// exatamente com o "Total:" impresso no extrato (901,79 e 3.042,12).
import { describe, it, expect } from "vitest";
import { lerFaturaCartao } from "./faturaCartao";

const EXTRATO_MARIA = `Extrato
Empresa: QUARTA IGREJA BATISTA DO RIO DE JANEIRO | CNPJ: 027.639.285/0001-61
Conta de débito: 1125 | 61094-1
Situação da fatura: Fechada
Situação: ATIVO
Matrícula:
Centro de custo: 2-0000001
Endereço da
empresa: R PARAIBA - RIO DE JANEIRO - RJ - 20271290
Nova Consulta de Extrato
Mês: Janeiro/2024
Detalhe do Extrato
Nome: MARIA R M ALVES - VISA
Número do cartão: XXXX.XXXX.XXXX.7682
Data de vencimento: 10/01/2024
Data Histórico Moeda US$ Cotação US$ R$
01/09 AUDIO SETUP 004/005 0,00 0,0000 376,20
05/12 PLANNINGCENTERBILL.COM 16,26 5,2100 84,71
13/12 PAG*MUNDODESCART 0,00 0,0000 151,00
14/12 DROGARIA MARIS E BARRO 0,00 0,0000 53,00
17/12 CONF COMETA 0,00 0,0000 32,47
19/12 MERCADOLIVRE*ROCHAMATERIA 0,00 0,0000 110,37
22/12 MERCADOLIVRE*LKMAGAZINE 0,00 0,0000 94,04
Total: 16,26 901,79
Taxas Mensais`;

const EXTRATO_SIDNEY = `Detalhe do Extrato
Nome: SIDNEY V FILHO - VISA
Número do cartão: XXXX.XXXX.XXXX.7688
Data de vencimento: 10/01/2024
Data Histórico Moeda US$ Cotação US$ R$
20/04 AMAZON MARKETPLAC 009/009 0,00 0,0000 50,03
30/11 abastec*abastece ai 0,00 0,0000 223,29
01/12 ABASTEC*abastece ai 0,00 0,0000 148,00
01/12 ABASTEC*abastece ai 0,00 0,0000 197,74
04/12 MERCADOLIVRE*3PRODUTOS 0,00 0,0000 131,93
06/12 ASSAI ATACADISTA 0,00 0,0000 1.997,12
13/12 DM*WEBLINK.COM.BR 0,00 0,0000 358,80
20/12 MERCADOLIVRE*3PRODUTOS 0,00 0,0000 - 64,79
Total: 0,00 3.042,12
Taxas Mensais
Mês: Janeiro/2024`;

describe("lerFaturaCartao", () => {
  it("lê titular, cartão, vencimento e as 7 transações do extrato da Maria", () => {
    const f = lerFaturaCartao(EXTRATO_MARIA);
    expect(f).not.toBeNull();
    expect(f!.titular).toBe("MARIA R M ALVES");
    expect(f!.numeroCartao).toBe("XXXX.XXXX.XXXX.7682");
    expect(f!.dataVencimento).toBe("2024-01-10");
    expect(f!.mesReferencia).toBe(1);
    expect(f!.anoReferencia).toBe(2024);
    expect(f!.transacoes).toHaveLength(7);
  });

  it("infere o ano certo (2023) pra transações com mês maior que o da fatura (Janeiro)", () => {
    const f = lerFaturaCartao(EXTRATO_MARIA)!;
    // 01/09 (setembro) e as de dezembro — nenhuma é "janeiro/2024" de
    // verdade, a fatura fecha antes e cobre o(s) mês(es) anterior(es).
    expect(f.transacoes[0].data).toBe("2023-09-01");
    expect(f.transacoes[1].data).toBe("2023-12-05");
  });

  it("bate o total calculado com o 'Total:' impresso no extrato — 901,79", () => {
    const f = lerFaturaCartao(EXTRATO_MARIA)!;
    expect(f.totalCalculado).toBe(901.79);
    expect(f.totalDeclarado).toBe(901.79);
  });

  it("SIDNEY: reconhece estorno (valor negativo no extrato) como entrada, não saída", () => {
    const f = lerFaturaCartao(EXTRATO_SIDNEY)!;
    const estorno = f.transacoes.find(t => t.historico === "MERCADOLIVRE*3PRODUTOS" && t.tipo === "entrada");
    expect(estorno).toBeDefined();
    expect(estorno!.valor).toBe(64.79);
  });

  it("SIDNEY: total calculado (saída − entrada) bate com 3.042,12, incluindo o estorno", () => {
    const f = lerFaturaCartao(EXTRATO_SIDNEY)!;
    expect(f.totalCalculado).toBe(3042.12);
  });

  it("SIDNEY: infere 2023 mesmo pra uma parcela de abril (009/009 — compra original bem antes)", () => {
    const f = lerFaturaCartao(EXTRATO_SIDNEY)!;
    expect(f.transacoes[0].data).toBe("2023-04-20");
  });

  it("mantém duas transações do mesmo dia e histórico como linhas separadas (duas compras reais no Assaí/Abastec no mesmo dia)", () => {
    const f = lerFaturaCartao(EXTRATO_SIDNEY)!;
    const doDia = f.transacoes.filter(t => t.dataRelativa === "01/12");
    expect(doDia).toHaveLength(2);
    expect(doDia.map(t => t.valor)).toEqual([148, 197.74]);
  });

  it("devolve null (não inventa) pra texto que não é um extrato de cartão reconhecido", () => {
    expect(lerFaturaCartao("Recibo qualquer\nValor 50,00")).toBeNull();
  });
});
