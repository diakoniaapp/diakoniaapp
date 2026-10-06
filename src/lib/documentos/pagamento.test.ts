import { describe, expect, it } from "vitest";
import { montarPayloadPix } from "../pix";
import { dadosParaGuardar, lerDocumentoDePagamento, acharCodigosNumericos } from "./pagamento";

// ── montagem de códigos VÁLIDOS (o teste não depende de um documento real) ──
function modulo10(c: string) {
  let s = 0, p = 2;
  for (let i = c.length - 1; i >= 0; i--) { let x = Number(c[i]) * p; if (x > 9) x = Math.floor(x / 10) + (x % 10); s += x; p = p === 2 ? 1 : 2; }
  const r = s % 10;
  return r === 0 ? 0 : 10 - r;
}
/** Linha digitável de cobrança (47) com banco, vencimento (ciclo novo do fator) e valor. */
function linhaDeBoleto(banco: string, vencimento: string, centavos: number) {
  const dias = Math.round((Date.parse(vencimento + "T00:00:00Z") - Date.parse("2025-02-22T00:00:00Z")) / 86400000);
  const fator = String(1000 + dias);
  const livre = "1234567890123456789012345";
  const c1 = banco + "9" + livre.slice(0, 5), c2 = livre.slice(5, 15), c3 = livre.slice(15, 25);
  return c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + "1" + fator + String(centavos).padStart(10, "0");
}
function barrasDeArrecadacao(segmento: string, centavos: number, resto: string) {
  const semDv = "8" + segmento + "6" + String(centavos).padStart(11, "0") + resto.padEnd(29, "0");
  return semDv.slice(0, 3) + modulo10(semDv) + semDv.slice(3);
}
const linha48 = (b: string) => Array.from({ length: 4 }, (_, i) => { const x = b.slice(i * 11, i * 11 + 11); return x + modulo10(x); }).join(" ");

describe("boleto bancário", () => {
  const linha = linhaDeBoleto("341", "2026-10-12", 132090);
  const texto = `Itaú Unibanco S.A.  341-7  ${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} ${linha.slice(21, 26)}.${linha.slice(26, 32)} ${linha.slice(32, 33)} ${linha.slice(33)}
Beneficiário
F5 INFORMATICA LTDA
CNPJ: 12.345.678/0001-95
Nosso número 109/12345678-9
Vencimento 12/10/2026
Valor do documento 1.320,90
Pagador: QUARTA IGREJA BATISTA DO RIO DE JANEIRO CNPJ 27.639.285/0001-61`;

  it("extrai linha digitável, valor, vencimento, banco, beneficiário e CNPJ", () => {
    const d = lerDocumentoDePagamento(texto);
    expect(d).toMatchObject({
      tipo: "boleto", valor: 1320.9, vencimento: "2026-10-12", beneficiario: "F5 INFORMATICA LTDA",
      cnpjBeneficiario: "12345678000195", codigoValido: true,
    });
    expect(d.banco).toEqual({ codigo: "341", nome: "Itaú" });
    expect(d.linhaDigitavel).toBe(linha);
    expect(d.confianca).toBeGreaterThan(85);
    expect(d.avisos).toEqual([]);
  });

  it("nunca devolve o CNPJ da própria igreja como beneficiário", () => {
    const d = lerDocumentoDePagamento(`Pagador CNPJ 27.639.285/0001-61\n${linha}`);
    expect(d.cnpjBeneficiario).toBeNull();
  });

  it("valor impresso diferente do código: vale o do código e AVISA", () => {
    const d = lerDocumentoDePagamento(texto.replace("1.320,90", "1.400,00"));
    expect(d.valor).toBe(1320.9);
    expect(d.avisos.join(" ")).toMatch(/difere/);
  });

  it("dígito trocado na linha: não inventa valor do código, avisa e usa o do texto", () => {
    const errada = linha.slice(0, 3) + (linha[3] === "1" ? "2" : "1") + linha.slice(4);
    const d = lerDocumentoDePagamento(`Beneficiário\nLoja X LTDA\nValor do documento 50,00\n${errada}`);
    expect(d.codigoValido).toBe(false);
    expect(d.valor).toBe(50);
    expect(d.avisos.join(" ")).toMatch(/verificadores/);
  });
});

describe("guias", () => {
  it("DARF: tipo, receita, valor total, vencimento e competência — beneficiário padrão da Receita", () => {
    const d = lerDocumentoDePagamento(`MINISTÉRIO DA FAZENDA — Documento de Arrecadação de Receitas Federais
DARF
Período de Apuração 31/08/2026
Código da Receita 6912
Data de Vencimento 20/10/2026
Valor Total do Documento 1.234,56`);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "darf", valor: 1234.56, vencimento: "2026-10-20", competencia: "2026-08", beneficiario: "Receita Federal do Brasil" });
    expect(d.rotulo).toBe("DARF · receita 6912");
  });

  it("DARF de IRRF (código 1708)", () => {
    const d = lerDocumentoDePagamento("DARF\nCódigo da Receita 1708\nVencimento 20/10/2026\nValor total 420,00");
    expect(d.subtipoGuia).toBe("irrf");
    expect(d.valor).toBe(420);
  });

  it("GPS (INSS) e FGTS", () => {
    expect(lerDocumentoDePagamento("GUIA DA PREVIDÊNCIA SOCIAL - GPS\nCompetência 09/2026\nVencimento 20/10/2026\nValor total 1.100,00")).toMatchObject({ tipo: "guia", subtipoGuia: "gps", competencia: "2026-09" });
    const f = lerDocumentoDePagamento("Guia de Recolhimento do FGTS - GRF\nCompetência 09/2026\nVencimento 07/10/2026\nValor a recolher 612,45\nValor a pagar 612,45");
    expect(f).toMatchObject({ tipo: "guia", subtipoGuia: "fgts", valor: 612.45, vencimento: "2026-10-07" });
    expect(f.beneficiario).toMatch(/Caixa/);
  });

  it("ISS da Prefeitura, com código de arrecadação de 48 dígitos (o exemplo dela: R$ 1.250,00)", () => {
    const barras = barrasDeArrecadacao("1", 125000, "00394460");
    const d = lerDocumentoDePagamento(`PREFEITURA DA CIDADE DO RIO DE JANEIRO
Guia de recolhimento de ISS — ISSQN
Vencimento 12/10/2026
${linha48(barras)}`);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "iss", valor: 1250, vencimento: "2026-10-12", codigoValido: true });
    expect(d.beneficiario).toMatch(/Prefeitura/);
    expect(d.codigoBarras).toBe(barras);
  });

  it("guia por segmento (prefeitura) mesmo sem a palavra 'guia' no texto", () => {
    const d = lerDocumentoDePagamento(`Documento de pagamento\nVencimento 15/10/2026\n${linha48(barrasDeArrecadacao("5", 33000, "11111111"))}`);
    expect(d.tipo).toBe("guia");
    expect(d.valor).toBe(330);
  });
});

describe("faturas", () => {
  it("fatura de energia com código de arrecadação (segmento 3)", () => {
    const b = barrasDeArrecadacao("3", 281146, "00012345");
    const d = lerDocumentoDePagamento(`LIGHT SERVIÇOS DE ELETRICIDADE S/A
Fatura de energia elétrica — Unidade consumidora 123
Vencimento 15/10/2026
${linha48(b)}`);
    expect(d).toMatchObject({ tipo: "fatura", subtipoFatura: "energia", valor: 2811.46, vencimento: "2026-10-15" });
    expect(d.rotulo).toBe("Fatura de energia");
    expect(d.convenio).toBe("3-0001");
  });

  it("fatura de internet paga por boleto de cobrança continua fatura", () => {
    const linha = linhaDeBoleto("756", "2026-10-25", 14990);
    const d = lerDocumentoDePagamento(`Fatura Provedor Fibra Internet\nBeneficiário\nNET FIBRA LTDA\n${linha}`);
    expect(d.tipo).toBe("fatura");
    expect(d.subtipoFatura).toBe("internet");
    expect(d.valor).toBe(149.9);
  });
});

describe("Pix", () => {
  const payload = montarPayloadPix({ chave: "12345678000199", tipoChave: "cnpj", nomeRecebedor: "Prefeitura RJ", valor: 1250 });
  it("só Pix: tipo pix, valor e recebedor do próprio payload", () => {
    const d = lerDocumentoDePagamento(`Pix copia e cola\n${payload}`);
    expect(d).toMatchObject({ tipo: "pix", valor: 1250, beneficiario: "PREFEITURA RJ" });
    expect(d.pix?.crcValido).toBe(true);
  });
  it("boleto híbrido: boleto com Pix junto", () => {
    const linha = linhaDeBoleto("237", "2026-11-05", 50000);
    const d = lerDocumentoDePagamento(`Beneficiário\nCondomínio Edifício X\n${linha}\n${payload}`);
    expect(d.tipo).toBe("boleto");
    expect(d.pix).not.toBeNull();
  });
});

describe("outros", () => {
  it("texto sem nada de pagamento: desconhecido, sem inventar campos", () => {
    const d = lerDocumentoDePagamento("Ata da reunião de diretoria de 10/09/2026.");
    expect(d).toMatchObject({ tipo: "desconhecido", valor: null, vencimento: null, linhaDigitavel: null });
    expect(d.confianca).toBeLessThan(40);
  });
  it("folha de pagamento que cita INSS e FGTS NÃO é guia", () => {
    expect(lerDocumentoDePagamento("Demonstrativo de Pagamento de Salário\nINSS 11% FGTS 8% Vencimento 05/10/2026").tipo).not.toBe("guia");
  });
  it("achar códigos: ignora números que não têm 44/47/48 dígitos", () => {
    expect(acharCodigosNumericos("CNPJ 12.345.678/0001-95 tel 21 98399-1229")).toEqual([]);
  });
  it("dadosParaGuardar leva só o que serve para pagar depois", () => {
    const d = lerDocumentoDePagamento("DARF\nCódigo da Receita 1708\nVencimento 20/10/2026\nValor total 420,00");
    const g = dadosParaGuardar(d);
    expect(g).toMatchObject({ versao: 1, tipo: "guia", subtipoGuia: "irrf", valor: 420, vencimento: "2026-10-20" });
    expect(JSON.stringify(g)).not.toContain("MINISTÉRIO");
  });
});

// ── layouts REAIS medidos em 06/10/2026 nos anexos da tesouraria (só texto de empresas) ─────────────────
describe("layouts reais — defeitos medidos nos anexos da igreja", () => {
  const linha = linhaDeBoleto("341", "2026-08-20", 36000);

  it("boleto cuja 2ª página cita 'documento de arrecadação do Simples' NÃO vira guia (medido: impressora)", () => {
    const texto = `RECIBO DO PAGADOR
341-7 ${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} ${linha.slice(21, 26)}.${linha.slice(26, 32)} ${linha.slice(32, 33)} ${linha.slice(33)}
Vencimento
20/08/2026
Beneficiário Agência/Código Beneficiário
ECOPRINT IMPRESSORAS LTDA CNPJ/CPF: 10.647.756/0001-80
Valor (=) Valor do Documento
157 R$ 360,00
Pagador: QUARTA IGREJA BATISTA DO RJ CNPJ/CPF: 27.639.285/0001-61
Declaramos que recolhemos e pagamos todos os impostos através do documento de arrecadação do Simples Nacional (DAS).`;
    const d = lerDocumentoDePagamento(texto);
    expect(d.tipo).toBe("boleto");
    expect(d.subtipoGuia).toBeNull();
    expect(d.valor).toBe(360);
    expect(d.vencimento).toBe("2026-08-20");
    expect(d.beneficiario).toBe("ECOPRINT IMPRESSORAS LTDA");
    expect(d.cnpjBeneficiario).toBe("10647756000180");
  });

  it("'Beneficiário final' é outro campo: não vira nome", () => {
    const d = lerDocumentoDePagamento(`Beneficiário final: CPF 123.456.789-00\nBeneficiário\nLOJA BOA LTDA\nValor do documento 50,00`);
    expect(d.beneficiario).toBe("LOJA BOA LTDA");
  });

  it("fatura de água: o valor está na linha de BAIXO do cabeçalho 'TOTAL A PAGAR' (tabela), e R$ 0,00% não é valor", () => {
    const d = lerDocumentoDePagamento(`FATURA DE AGUA E ESGOTO
MATRÍCULA REFERÊNCIA EMISSÃO TOTAL A PAGAR
QUARTA IGREJA BATISTA DO RJ CPF/CNPJ: 27639285000161 400048718-2 07/2026 09/09/2026 R$ 1.135,07
Nº DE FATURA IDENTIFICADOR VENCIMENTO
202893 22271 01/08/2026
DESCRIÇÃO DOS SERVIÇOS VALOR IBS M IBS E CBS
R$ 0,00% 0,10% 0,90%
VALOR AGUA 556,40 0,00 0,50 4,54`);
    expect(d.tipo).toBe("fatura");
    expect(d.valor).toBe(1135.07);
    expect(d.vencimento).toBe("2026-08-01");
  });

  it("guia do FGTS Digital: 'Valor a recolher' (cabeçalho) e 'Total da Guia', vencimento em 'Pagar este documento até'", () => {
    const d = lerDocumentoDePagamento(`GFD - Guia do FGTS Digital
Pagar este documento até
CPF/CNPJ do Empregador Nome/Razão Social do Empregador
20/08/2026
27.639.285 QUARTA IGREJA BATISTA DO RIO DE JANEIRO
às 21:59:59 (Brasília)
Valor a recolher
Núm. de Pág. Identificador Tag
793,75
1 0126073152375771-0 31/07/2026 13:18
Competência Trabalhadores FGTS Mensal Total
07/2026 3 793,75 0,00 793,75
Total da Guia: 793,75`);
    expect(d.tipo).toBe("guia");
    expect(d.subtipoGuia).toBe("fgts");
    expect(d.valor).toBe(793.75);
    expect(d.vencimento).toBe("2026-08-20");
    expect(d.beneficiario).toBe("Caixa Econômica Federal (FGTS)");
  });

  it("DANFE + página de fatura: beneficiário é o EMITENTE (nunca a igreja), valor e vencimento da fatura", () => {
    const d = lerDocumentoDePagamento(`RECEBEMOS DE HANDHELP SOLUCOES E INFORMATICA LTDA OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO. NF-e
DESTINATÁRIO / REMETENTE
NOME / RAZÃO SOCIAL CNPJ / CPF DATA EMISSÃO
QUARTA IGREJA BATISTA DO RIO DE JANEIRO 27.639.285/0001-61 17/06/2026
FATURA / DUPLICATA
001 002 003
Fatura a pagar
HANDHELP SOLUCOES E INFORMATICA LTDA
R$ 833,34
07.371.640/0001-57
Vencimento em 13/08/2026`);
    expect(d.beneficiario).toBe("HANDHELP SOLUCOES E INFORMATICA LTDA");
    expect(d.valor).toBe(833.34);
    expect(d.vencimento).toBe("2026-08-13");
    expect(d.cnpjBeneficiario).toBe("07371640000157");
  });
});

describe("layouts reais — texto padrão de banco e nota fiscal com 0,00", () => {
  it("o texto padrão do boleto ('pague pelo aplicativo, internet… SAC telefones') NÃO faz dele uma fatura de internet", () => {
    const linha = linhaDeBoleto("341", "2026-08-20", 36000);
    const d = lerDocumentoDePagamento(`RECIBO DO PAGADOR
${linha}
Local de pagamento: Pague pelo aplicativo, internet ou em agências e correspondentes.
Beneficiário
ECOPRINT IMPRESSORAS LTDA CNPJ: 10.647.756/0001-80
SAC 0800 704 0237 - Cancelamentos, reclamações e demais telefones. Deficiente auditivo ou de fala
Valor do documento R$ 360,00`);
    expect(d.tipo).toBe("boleto");
    expect(d.subtipoFatura).toBeNull();
  });

  it("DANFE: 'VALOR TOTAL DA NOTA 0,00' não é o valor a pagar — vale a 'Fatura a pagar'", () => {
    const d = lerDocumentoDePagamento(`RECEBEMOS DE LOJA DE INFORMATICA LTDA OS PRODUTOS CONSTANTES NA NOTA FISCAL
VALOR TOTAL DA NOTA
0,00 0,00 0,00 0,00 0,00 2.500,00
Fatura a pagar
LOJA DE INFORMATICA LTDA
R$ 833,34
Vencimento em 13/08/2026`);
    expect(d.valor).toBe(833.34);
  });
});

describe("DARM da Prefeitura do Rio — ISS e IPTU (mesmo layout, código da receita diferente)", () => {
  const iss = `01. RECEITA
101-5
02. INSCRIÇÃO MUNICIPAL
10. CONTRIBUÍNTE 03. DATA DE VENCIMENTO
QUARTA IGREJA BATISTA DO RIO DE JANEIRO 06/08/2026
05. GUIA (USO DA REPARTIÇÃO) BASE DE CÁLCULO: R$630,35 ALÍQUOTA: 5,00%
ISS - IMPOSTO SOBRE SERVIÇOS
ESTE DOCUMENTO DEVE SER UTILIZADO EXCLUSIVAMENTE PARA PAGAMENTO DE ISS
A RECEBER ESSE DARM APÓS 06/08/2026
09. VALOR TOTAL
R$ 31,51`;
  const iptu = `01.RECEITA
PREFEITURA DO RIO DE JANEIRO
310-7 DARM
Secretaria Municipal de Fazenda 02.INSCRIÇÃO IMOBILIARIA
Documento de Arrecadação de Receitas Municipais
10.CONTRIBUINTE 03.DATA DE VENCIMENTO
QUARTA I B R JANEIRO 07/08/2026
06.VALOR DO TRIBUTO
312,70
09.VALOR TOTAL
312,70 Emitido pelo Carioca Digital, em 05/08/2026 11:12:02`;

  it("ISS: tipo guia/iss, valor e vencimento", () => {
    const d = lerDocumentoDePagamento(iss);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "iss", valor: 31.51, vencimento: "2026-08-06" });
  });

  it("IPTU: tipo guia/iptu, beneficiário = a Prefeitura do documento", () => {
    const d = lerDocumentoDePagamento(iptu);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "iptu", valor: 312.7, vencimento: "2026-08-07" });
    expect(d.rotulo).toBe("Guia de IPTU");
  });

  it("ISS real (06/10/2026): linha digitável, competência e nº da guia — competência vem na linha de baixo do rótulo", () => {
    const real = `01. RECEITA
101-5
02. INSCRIÇÃO MUNICIPAL
99999926
10. CONTRIBUÍNTE 03. DATA DE VENCIMENTO
QUARTA IGREJA BATISTA DO RIO DE JANEIRO 06/10/2026
11. INFORMAÇÕES COMPLEMENTARES 04. COMPETÊNCIA
CNPJ: 27.639.285/0001-61 09/2026
05. GUIA (USO DA REPARTIÇÃO) BASE DE CÁLCULO: R$630,35 ALÍQUOTA: 5,00%
20260000002984 ISS ORIGINAL: R$31,51 ISS ATUALIZADO: R$31,51
06. VALOR DO TRIBUTO NOTA(S) FISCAL(IS): 19680587, 19680596
R$ 31,51
ISS - IMPOSTO SOBRE SERVIÇOS
ESTE DOCUMENTO DEVE SER UTILIZADO EXCLUSIVAMENTE PARA PAGAMENTO DE ISS *************
08. VALOR DA MULTA BANCOS OU CASAS LOTÉRICAS NÃO ESTÃO AUTORIZADOS
A RECEBER ESSE DARM APÓS 06/10/2026
*************
09. VALOR TOTAL
R$ 31,51
81680000000.1 31513659202.1 61006101202.3 60000002984.0`;
    const d = lerDocumentoDePagamento(real);
    expect(d).toMatchObject({
      tipo: "guia", subtipoGuia: "iss", valor: 31.51, vencimento: "2026-10-06", competencia: "2026-09",
      numeroDocumento: "20260000002984", codigoValido: true,
      linhaDigitavel: "816800000001315136592021610061012023600000029840",
    });
  });

  it("NFS-e que cita 'ISS retido' continua NÃO sendo guia", () => {
    expect(lerDocumentoDePagamento("NFS-e Nº 55 Prestador LOJA LTDA\nISS retido: R$ 10,00\nValor total 200,00").tipo).not.toBe("guia");
  });
});

describe("boleto em tabela — número do documento e competência (medido: boleto de impressora)", () => {
  it("'Núm. do documento' com a DATA na linha de baixo não vira número; boleto não tem competência", () => {
    const linha = linhaDeBoleto("341", "2026-08-20", 36000);
    const d = lerDocumentoDePagamento(`RECIBO DO PAGADOR
${linha}
Beneficiário
ECOPRINT IMPRESSORAS LTDA CNPJ: 10.647.756/0001-80
Data do documento Núm. do documento Espécie Doc. Aceite Data Processamento Nosso Número
07/08/2026 DSI N 07/08/2026 157 / 00061375 - 0
Valor do documento R$ 360,00`);
    expect(d.tipo).toBe("boleto");
    expect(d.numeroDocumento).toBeNull();
    expect(d.competencia).toBeNull();
  });
});
