import { describe, expect, it } from "vitest";
import { CNPJ_DA_IGREJA, extrairChave, lerDocumento, valoresDoTexto } from "./leitura";

// Textos SINTÉTICOS no formato real de cada tipo de documento (estrutura de
// linhas como o pdf.js a reconstrói). Nada daqui é de um documento verdadeiro:
// os defeitos que motivaram o módulo estão reproduzidos, os dados não.

// chave: UF 33 · AAMM 2608 · CNPJ 33304981000624 · modelo 65 · série 001 · nº 000320130 · tpEmis 1 · cNF 12345678 · DV 0
const CHAVE_CUPOM = "3326083330498100062465001000320130112345678" + "0";

const CUPOM_COM_DESCONTO = `SUPERMERCADOS EXEMPLO LTDA
CNPJ: 33.304.981/0006-24
Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
Qtd. total de itens: 3
Valor total R$: 94,45
Descontos R$: 8,32
Valor a pagar R$: 86,13
Forma de pagamento Valor pago R$
Dinheiro 87,00
Troco 0,87
Número: 320130 Série: 1 Emissão: 25/08/2026 17:22:42-03:00 - Via Consumidor
Chave de acesso: ${CHAVE_CUPOM.replace(/(\d{4})(?=\d)/g, "$1 ")}
CONSUMIDOR CNPJ: ${CNPJ_DA_IGREJA.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
Valor aprox. tributos: Federal R$ 3,66 (15,27%), Estadual R$ 260,18 (1.084,08%). Fonte: IBPT
Data/Hora da Consulta: 01/10/2026 09:49:26`;

describe("cupom de supermercado com desconto (NFC-e)", () => {
  const d = lerDocumento(CUPOM_COM_DESCONTO);

  it("lê o valor LÍQUIDO antes do bruto — o lançamento tem o que foi pago", () => {
    expect(d.valores.map(v => v.valor)).toEqual([86.13, 94.45]);
    expect(d.valores[0].bruto).toBe(false);
    expect(d.valores[1].bruto).toBe(true);
    expect(d.valores[0].origem).toContain("valor a pagar");
  });

  it("emitente pela chave de acesso — nunca o CNPJ da igreja", () => {
    expect(d.cnpj).toBe("33304981000624");
    expect(d.cnpj).not.toBe(CNPJ_DA_IGREJA);
    expect(d.tipo).toBe("nfce");
    expect(d.numero).toBe("320130");
    expect(d.emitente).toBe("SUPERMERCADOS EXEMPLO LTDA");
  });

  it("emissão é a do rótulo, não a data da consulta", () => {
    expect(d.emissao).toBe("2026-08-25");
  });
});

describe("percentual de tributos NÃO é dinheiro", () => {
  it("cupom de R$ 24,00 com '(1.084,08%)' no rodapé não vira R$ 1.084,08", () => {
    const t = `AGATA EXEMPLO DESCARTAVEIS
CNPJ: 18.301.506/0001-04
TIRA COPO 200ML (Código: 000330 ) Vl. Total
Qtde.: 4 UN: UN Vl. Unit.: 6 24,00
Qtd. total de itens: 1
Valor a pagar R$:
Forma de pagamento: Valor pago R$:
Número: 14937 Série: 1 Emissão: 07/08/2026 17:22:42-03:00 - Via Consumidor 2
Valor aprox. tributos: Federal R$ 3,66 (15,27%), Estadual R$ 260,18 (1.084,08%). Fonte: IBPT`;
    const v = valoresDoTexto(t);
    expect(v.map(x => x.valor)).toEqual([24]);
    expect(v.some(x => x.valor === 1084.08)).toBe(false);
    expect(v[0].origem).toContain("item");
  });
});

describe("OCR com acento: 'VALOR À PAGAR'", () => {
  it("reconhece o valor a pagar mesmo com acento e traz o bruto depois", () => {
    const t = `DESCARTAVEIS EXEMPLO
VALOR TOTAL R$ 62,60
VALOR À PAGAR R$ 61,00
FORMA DE PAGAMENTO Valor Pago`;
    expect(valoresDoTexto(t).map(v => v.valor)).toEqual([61, 62.6]);
  });
});

describe("DANFE (NF-e modelo 55) com duplicata", () => {
  // chave: modelo 55 · CNPJ 47517276000105 · nº 000009370
  const chave = "3126034751727600010555001000009370" + "1" + "70125389" + "6";
  const DANFE = `RECEBEMOS DE MODAMUSICNET EXEMPLO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA ABAIXO.
NF-e EMISSÃO: 24/03/2026 VALOR TOTAL: R$ 519,80 DESTINATÁRIO: Quarta Igreja Batista Do Rio De Janeiro
Nº 9.370 DATA DE RECEBIMENTO IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR
DANFE
CHAVE DE ACESSO
${chave.replace(/(\d{4})(?=\d)/g, "$1 ")}
INSCRIÇÃO ESTADUAL INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT. CNPJ
4.413.374/0068 47.517.276/0001-05
DESTINATÁRIO / REMETENTE
NOME / RAZÃO SOCIAL CNPJ / CPF DATA DA EMISSÃO
Quarta Igreja Batista Do Rio De Janeiro 27.639.285/0001-61 24/03/2026
FATURA / DUPLICATA
Num. 001
Venc. 23/04/2026
Valor R$ 519,80`;
  const d = lerDocumento(DANFE);

  it("emitente, CNPJ e número vêm da chave; tipo nfe", () => {
    expect(d.tipo).toBe("nfe");
    expect(d.emitente).toBe("MODAMUSICNET EXEMPLO LTDA");
    expect(d.cnpj).toBe("47517276000105");
    expect(d.numero).toBe("9370");
  });

  it("emissão e valor", () => {
    expect(d.emissao).toBe("2026-03-24");
    expect(d.valores[0].valor).toBe(519.8);
  });

  it("lê a duplicata (vencimento e valor)", () => {
    expect(d.duplicatas).toEqual([{ vencimento: "2026-04-23", valor: 519.8 }]);
  });
});

describe("Consulta da NF-e (visualização do portal)", () => {
  // chave: modelo 55 · série 007 · CNPJ 22753989000147 · nº 000024553
  const chave = "33260822753989000147550070000245531000754460";
  const CONSULTA = `Chave de Acesso Número NF-e Versão
33 2608 22753989000147 55007 000024553 100075446 0 24553 4.00
Dados da NF-e
Modelo Série Número Data de Emissão Data/Hora de Saída ou da Entrada Valor Total da Nota Fiscal
55 7 24553 10/08/2026 15:35:44-03:00 10/08/2026 15:55:43-03:00 255,300
Emitente
CNPJ Nome / Razão Social Inscrição Estadual UF
22.753.989/0001-47 EXEMPLO MADEIRAS E CONSTRUCAO LTDA 86953730 RJ
Destinatário
CNPJ Nome / Razão Social Inscrição Estadual UF
27.639.285/0001-61 QUARTA IGREJA BATISTA RJ RJ
${chave}
Ciência da Operação pelo Destinatário (Órgão 591261849566022 11/08/2026 às 02:50:43-`;
  const d = lerDocumento(CONSULTA);

  it("valor de 3 casas decimais ('255,300') vira R$ 255,30", () => {
    expect(d.valores.map(v => v.valor)).toEqual([255.3]);
  });

  it("emissão é a da linha de dados, NÃO a da ciência da operação (11/08)", () => {
    expect(d.emissao).toBe("2026-08-10");
  });

  it("emitente e CNPJ certos (a razão não é o site do portal)", () => {
    expect(d.emitente).toBe("EXEMPLO MADEIRAS E CONSTRUCAO LTDA");
    expect(d.cnpj).toBe("22753989000147");
    expect(d.numero).toBe("24553");
  });
});

describe("sem chave de acesso", () => {
  it("o CNPJ do emitente é o primeiro que não é o da igreja", () => {
    const t = `Destinatário 27.639.285/0001-61 QUARTA IGREJA
Prestador CNPJ 11.222.333/0001-81 PRESTADOR EXEMPLO LTDA`;
    expect(lerDocumento(t).cnpj).toBe("11222333000181");
  });

  it("texto vazio não inventa nada", () => {
    const d = lerDocumento("");
    expect(d).toMatchObject({ tipo: "desconhecido", emitente: null, cnpj: null, numero: null, emissao: null, chave: null });
    expect(d.valores).toEqual([]);
  });
});

describe("lições dos formatos reais (03/10/2026)", () => {
  it("pagamento MISTO: só o total pago vira candidato, nunca as partes", () => {
    const t = `Valor total R$: 115,47
Descontos R$: 10,72
Valor a pagar R$:
104,75
Cartão de Débito 80,00
Dinheiro 50,00
Troco 25,25`;
    const v = valoresDoTexto(t).map(x => x.valor);
    expect(v).toContain(104.75);
    expect(v).not.toContain(80);     // parte paga no cartão
    expect(v).not.toContain(24.75);  // dinheiro − troco, sozinho
  });

  it("o total do cupom sozinho na linha de baixo ('Valor a pagar R$:' ⏎ '94,00')", () => {
    expect(valoresDoTexto("Valor a pagar R$:\n94,00\nDinheiro 94,00").map(x => x.valor)).toEqual([94]);
  });

  it("DANFE: o total é o último número da linha SEGUINTE a 'VALOR TOTAL DA NOTA'", () => {
    const t = `VALOR DO FRETE VALOR DO SEGURO DESCONTO OUTRAS DESPESAS VALOR TOTAL DO IPI VALOR DA COFINS VALOR TOTAL DA NOTA
0,00 0,00 0,00 0,00 0,00 28,38 389,00
TRANSPORTADOR / VOLUMES TRANSPORTADOS
10,00 20,00 30,00`;
    expect(valoresDoTexto(t).map(x => x.valor)).toEqual([389]);
  });

  it("NFS-e: emissão pelo rótulo 'Data e Hora da emissão da NFS-e' e nome do prestador na linha de baixo", () => {
    const t = `Número da NFS-e Competência da NFS-e Data e Hora da emissão da NFS-e
123 03/08/2026 03/08/2026 10:15:00
02.052.410/0001-01 - - Prestador do Serviço
EXEMPLO SERVICOS E CONVENIENCIAS LTDA -
Valor do Serviço R$ 297,00`;
    const d = lerDocumento(t);
    expect(d.tipo).toBe("nfse");
    expect(d.emissao).toBe("2026-08-03");
    expect(d.emitente).toBe("EXEMPLO SERVICOS E CONVENIENCIAS LTDA");
    expect(d.cnpj).toBe("02052410000101");
    expect(d.valores.map(v => v.valor)).toContain(297);
  });

  it("boleto: 'Valor do Documento' e o VENCIMENTO (não há emissão útil)", () => {
    const t = `Data da operação: 23/09/2026 - 18h42
Data de vencimento: 23/09/2026
Beneficiário: FORNECEDOR EXEMPLO LTDA
Valor do Documento: R$ 299,90
Desconto: R$ 0,00
Multa: R$ 0,00`;
    const d = lerDocumento(t);
    expect(d.tipo).toBe("boleto");
    expect(d.vencimento).toBe("2026-09-23");
    expect(d.valores.map(v => v.valor)).toEqual([299.9]);
  });

  it("varredura (OCR): acha 'TEF ON R$ 39,95' e ignora tributos e percentuais", () => {
    const t = `SUPERMERCADO EXEMPLO LTDA
UN X 7,93 PI 7,93
TEF ON R$ 39,95
Tributos Incid. Lei Federal 12,741/12 - R$ 0,90
Trib Federais: R$ 100,00 (21,28%)`;
    const v = valoresDoTexto(t);
    expect(v.map(x => x.valor)).toEqual([39.95]);
    expect(v[0].aproximado).toBe(true);
  });

  it("fatura de concessionária: o valor do 'R$' e o vencimento", () => {
    const t = `Nº DE FATURA IDENTIFICADOR VENCIMENTO
CPF/CNPJ: 27639285000161 400048718-2 07/2026 09/09/2026 R$ 1.135,07
VALOR AGUA 556,40 0,00 0,50 4,54`;
    const d = lerDocumento(t);
    expect(d.valores.map(v => v.valor)).toEqual([1135.07]);
    expect(d.vencimento).toBe("2026-09-09");
  });
});

describe("extrairChave", () => {
  it("aceita blocos de 4 dígitos com espaço ou 44 dígitos colados; recusa menos que 44", () => {
    const c = "33260822753989000147550070000245531000754460";
    expect(extrairChave(c)).toBe(c);
    expect(extrairChave(c.replace(/(\d{4})(?=\d)/g, "$1 "))).toBe(c);
    expect(extrairChave("1234 5678 9012")).toBeNull();
  });
});
