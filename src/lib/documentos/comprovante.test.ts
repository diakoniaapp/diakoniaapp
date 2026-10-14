import { describe, expect, it } from "vitest";
import { lerComprovante, lerE2E } from "./comprovante";

// Textos no formato que os apps/internet banking imprimem (layouts públicos). Quando chegarem comprovantes REAIS da
// tesouraria, cada um vira um caso aqui — é assim que a leitura fica calibrada para os bancos que a igreja usa.
const HOJE = "2026-10-03";
// 28/09/2026 15:42 em Brasília = 18:42 UTC
const E2E_BRADESCO = "E60746948202609281842a1B2c3D4e5F";

describe("identificador do Pix (E2E)", () => {
  it("tira data, hora (Brasília) e banco do pagador", () => {
    expect(lerE2E(`ID da transação: ${E2E_BRADESCO}`)).toEqual({ e2e: E2E_BRADESCO, data: "2026-09-28", hora: "15:42", banco: "Bradesco" });
  });
  it("vira o dia certo perto da meia-noite (UTC já é o dia seguinte)", () => {
    expect(lerE2E("E00000000202609290130Xy12345678Z")).toMatchObject({ data: "2026-09-28", hora: "22:30", banco: "Banco do Brasil" });
  });
  it("aceita o ID quebrado em pedaços pelo PDF", () => {
    expect(lerE2E("E6070119020260928\n1842abcdefghijk")).toMatchObject({ data: "2026-09-28", banco: "Itaú" });
  });
  it("ignora o que não é ID válido", () => {
    expect(lerE2E("E60746948209913991842a1B2c3D4e5F")).toBeNull();
  });
});

describe("comprovantes por banco", () => {
  it("Bradesco — Pix com Data e Hora e o E2E: alta", () => {
    const r = lerComprovante(`Bradesco
Comprovante de Transação Pix
Data e Hora: 28/09/2026 - 15:42:10
Valor: R$ 1.500,00
Tipo de transferência: Pix
Dados de quem recebeu
Nome: FORNECEDOR EXEMPLO LTDA
Instituição: ITAU UNIBANCO S.A.
ID da transação: ${E2E_BRADESCO}
Comprovante emitido em 03/10/2026 às 09:12`, { hoje: HOJE, valorEsperado: 1500 });
    expect(r).toMatchObject({ data: "2026-09-28", hora: "15:42", valor: 1500, banco: "Bradesco", tipo: "pix", confianca: "alta" });
    expect(r.avisos).toEqual([]);
  });

  it("Itaú — 'realizado em … às …', rótulo e data na mesma linha", () => {
    const r = lerComprovante(`Itaú
comprovante de transferência
Pix realizado em 28/09/2026 às 15:42:10
valor da transferência R$ 1.500,00
recebedor: Fornecedor Exemplo
instituição: Banco Bradesco S.A.`, { hoje: HOJE, valorEsperado: 1500 });
    expect(r).toMatchObject({ data: "2026-09-28", hora: "15:42", valor: 1500, banco: "Itaú", confianca: "alta" });
  });

  it("Banco do Brasil — rótulos em cima, valores embaixo", () => {
    const r = lerComprovante(`BB
Comprovante Pix
DATA DA TRANSFERÊNCIA
28/09/2026
HORA
15:42:10
VALOR
R$ 1.500,00
Banco do Brasil S.A.`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", valor: 1500, banco: "Banco do Brasil", confianca: "alta" });
  });

  it("Caixa — Data/hora com hífen", () => {
    const r = lerComprovante(`CAIXA ECONÔMICA FEDERAL
Comprovante de Pix
Data/hora: 28/09/2026 - 15:42
Valor: R$ 1.500,00`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", hora: "15:42", banco: "Caixa", confianca: "alta" });
  });

  // a data vem só sob o título "Comprovante de transferência" (rótulo mais fraco que "Data da transferência"): média
  it("Nubank — mês por extenso abreviado", () => {
    const r = lerComprovante(`Comprovante de transferência
28 SET 2026 - 15:42:10
Valor R$ 1.500,00
Nu Pagamentos S.A.`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", hora: "15:42", banco: "Nubank", tipo: "transferencia", confianca: "media" });
  });

  it("TED com 'Data do débito'", () => {
    const r = lerComprovante(`Santander
Comprovante de TED
Data do débito: 28/09/2026
Valor: R$ 1.500,00`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", tipo: "ted", banco: "Santander", confianca: "alta" });
  });

  it("'28 de setembro de 2026'", () => {
    expect(lerComprovante("Pagamento realizado em 28 de setembro de 2026, às 15h42.", { hoje: HOJE })).toMatchObject({ data: "2026-09-28", hora: "15:42" });
  });
});

describe("datas que NÃO são do pagamento", () => {
  it("a data de emissão do comprovante não é sugerida", () => {
    const r = lerComprovante(`Comprovante emitido em 03/10/2026
Data da transferência: 28/09/2026`, { hoje: HOJE });
    expect(r.data).toBe("2026-09-28");
  });
  it("emissão e transferência na MESMA linha: cada data com o seu rótulo", () => {
    expect(lerComprovante("Emitido em 03/10/2026 · Transferência realizada em 28/09/2026", { hoje: HOJE }).data).toBe("2026-09-28");
  });
  it("vencimento do boleto não é a data do pagamento", () => {
    const r = lerComprovante(`Comprovante de pagamento de boleto
Vencimento: 05/10/2026
Data do pagamento: 29/09/2026
Valor pago: R$ 230,00`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-29", tipo: "boleto", valor: 230 });
  });
  it("só emissão: não sugere nada", () => {
    const r = lerComprovante("Documento emitido em 01/10/2026", { hoje: HOJE });
    expect(r.data).toBeNull();
    expect(r.confianca).toBeNull();
  });
  it("data futura é impossível para um pagamento feito", () => {
    const r = lerComprovante("Data da transferência: 15/10/2026", { hoje: HOJE });
    expect(r.data).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/futuras/);
  });
});

describe("confiança e avisos", () => {
  it("agendamento: baixa, com aviso para conferir o débito no extrato", () => {
    const r = lerComprovante(`Comprovante de agendamento
Pix agendado para 28/09/2026
Data da transferência: 28/09/2026`, { hoje: HOJE });
    expect(r.confianca).toBe("baixa");
    expect(r.avisos.join(" ")).toMatch(/AGENDAMENTO/);
  });
  it("valor diferente do pagamento rebaixa e avisa", () => {
    const r = lerComprovante("Data e hora: 28/09/2026 15:42\nValor: R$ 1.500,00", { hoje: HOJE, valorEsperado: 1358 });
    expect(r.confianca).toBe("media");
    expect(r.avisos.join(" ")).toMatch(/1\.358,00/);
  });
  it("rótulo e E2E discordam: baixa, mostrando as duas", () => {
    const r = lerComprovante(`Data da transferência: 27/09/2026\nID: ${E2E_BRADESCO}`, { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", confianca: "baixa" });
    expect(r.avisos[0]).toMatch(/27\/09\/2026.*28\/09\/2026/);
  });
  it("OCR fraco rebaixa (sem E2E)", () => {
    expect(lerComprovante("Data da transferência: 28/09/2026", { hoje: HOJE, fonte: "ocr", confiancaOcr: 62 }).confianca).toBe("media");
  });
  it("OCR com 'O' no lugar de zero ainda lê a data", () => {
    expect(lerComprovante("Data da transferência: 28/O9/2O26", { hoje: HOJE, fonte: "ocr", confiancaOcr: 90 }).data).toBe("2026-09-28");
  });
  it("única data sem rótulo: média", () => {
    expect(lerComprovante("PIX\n28/09/2026 15:42\nR$ 1.500,00", { hoje: HOJE })).toMatchObject({ data: "2026-09-28", hora: "15:42", confianca: "media", valor: 1500 });
  });
  it("várias datas sem rótulo: baixa, sugere a mais recente e lista todas", () => {
    const r = lerComprovante("28/09/2026\n15/09/2026", { hoje: HOJE });
    expect(r).toMatchObject({ data: "2026-09-28", confianca: "baixa" });
    expect(r.avisos[0]).toMatch(/15\/09\/2026/);
  });
  it("texto sem data nenhuma", () => {
    expect(lerComprovante("Comprovante Pix\nValor R$ 10,00", { hoje: HOJE })).toMatchObject({ data: null, confianca: null, valor: 10 });
  });
  it("tarifa e saldo não são o valor da operação", () => {
    expect(lerComprovante("Data da transferência: 28/09/2026\nTarifa: R$ 2,50\nSaldo disponível: R$ 9.000,00\nValor: R$ 1.500,00", { hoje: HOJE }).valor).toBe(1500);
  });
});
