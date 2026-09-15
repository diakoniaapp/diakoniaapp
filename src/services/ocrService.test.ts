// ─── Testes de `ocrService.ts` ───────────────────────────────────────────
//
// Cobre as duas partes puras (sem PDF/Tesseract de verdade): as heurísticas
// de campo (`extrairCamposDoTexto`, usadas tanto pra texto exato de PDF
// quanto pra saída do OCR) e a reconstrução de linha a partir de posição
// (x, y) do pdf.js (`agruparEmLinhas`) — foi exatamente aqui que um bug
// real apareceu ao escrever `textoDoPdf` (15/09/2026): juntar os
// fragmentos de texto sem reconstruir a linha visual quebrava
// `extrairRazaoSocial`, que depende de contar linhas.
import { describe, it, expect } from "vitest";
import { extrairCamposDoTexto, agruparEmLinhas } from "./ocrService";

describe("extrairCamposDoTexto", () => {
  it("lê valor (o maior — o total), data, CNPJ e razão social de um texto de DANFE simulado", () => {
    const texto = [
      "PREFEITURA DO RIO DE JANEIRO",
      "OBRAMAX ATACADO DE CONSTRUCAO LTDA",
      "CNPJ: 12.345.678/0001-90",
      "DANFE Nº 004512",
      "Data de emissão: 13/09/2026",
      "Item 1 - Cimento .......... 45,00",
      "Item 2 - Areia ............ 30,90",
      "VALOR TOTAL R$ 656,90",
    ].join("\n");

    const r = extrairCamposDoTexto(texto);
    expect(r.valor).toBe(656.90); // o maior valor do texto, não o primeiro
    expect(r.data).toBe("2026-09-13");
    expect(r.cnpj).toBe("12345678000190");
    expect(r.cnpjFormatado).toBe("12.345.678/0001-90");
    expect(r.razaoSocial).toBe("OBRAMAX ATACADO DE CONSTRUCAO LTDA");
    expect(r.numeroDoc).toBe("004512");
  });

  it("aceita CNPJ só em dígitos, sem máscara", () => {
    const r = extrairCamposDoTexto("EMPRESA TESTE LTDA\n12345678000190\nTotal 10,00");
    expect(r.cnpj).toBe("12345678000190");
    expect(r.razaoSocial).toBe("EMPRESA TESTE LTDA");
  });

  it("não inventa razão social quando não há CNPJ no texto", () => {
    const r = extrairCamposDoTexto("Recibo de pagamento\nValor 50,00\nSem CNPJ aqui");
    expect(r.cnpj).toBeNull();
    expect(r.razaoSocial).toBeNull();
  });

  it("ignora data no futuro (não pode ser a data da nota)", () => {
    const futuro = new Date();
    futuro.setFullYear(futuro.getFullYear() + 1);
    const dd = String(futuro.getDate()).padStart(2, "0");
    const mm = String(futuro.getMonth() + 1).padStart(2, "0");
    const texto = `Vencimento futuro ${dd}/${mm}/${futuro.getFullYear()}\nEmissão 01/01/2026`;
    const r = extrairCamposDoTexto(texto);
    expect(r.data).toBe("2026-01-01");
  });

  it("devolve tudo null pra texto sem nenhum campo reconhecível", () => {
    const r = extrairCamposDoTexto("texto qualquer sem nada estruturado");
    expect(r.valor).toBeNull();
    expect(r.data).toBeNull();
    expect(r.cnpj).toBeNull();
    expect(r.numeroDoc).toBeNull();
  });

  it("reconhece o número da nota em formatos comuns (NF-e, Nº, N°)", () => {
    expect(extrairCamposDoTexto("NF-e Nº 123456").numeroDoc).toBe("123456");
    expect(extrairCamposDoTexto("Nota Fiscal N° 98765").numeroDoc).toBe("98765");
  });
});

// Textos abaixo são TRECHOS REAIS (não recriados à mão) de duas notas
// baixadas do Drive da Telma pra calibrar a Fase 3 (15/09/2026) —
// extraídos rodando `textoDoPdf` de verdade nos arquivos PDF reais dentro
// do navegador (não só o `read_file_content` do Drive, que usa uma
// reconstrução de texto diferente da do pdf.js). Foi rodando contra esses
// arquivos de verdade — não só texto sintético — que apareceram os bugs
// reais: "Valor Total da NFe" NÃO fica colado no valor (vem numa linha de
// RÓTULOS seguida de uma linha de VALORES, tabela reconstruída por
// posição), e "Nome / Razão Social" pode vir colado com "Nome Fantasia"
// na mesma linha de cabeçalho. Os nomes de fornecedor/produto são os reais
// (PRODESC BENFICA EMBALAGENS, SENDAS DISTRIBUIDORA — fornecedores de
// verdade da tesouraria); miolo de blocos de imposto irrelevantes pra
// extração foi cortado, mantendo a estrutura ao redor de cada âncora.
const PRODESC_REAL = `Chave de Acesso Número NF-e Versão
33-2508-06.058.769/0001-47-55-001-000.039.764-151.015.200-5 39764 4.00
Dados da NF-e
Modelo Série Número Data de Emissão Data/Hora de Saída ou da Entrada Valor Total da Nota Fiscal
55 1 39764 06/08/2025 00:00:00-03:00 06/08/2025 13:14:03-03:00 30,00
Emitente
CNPJ Nome / Razão Social Inscrição Estadual UF
06.058.769/0001-47 Prodesc Benfica Embalagens Ltda Me 77692932 RJ
Destinatário
CNPJ Nome / Razão Social Inscrição Estadual UF
27.639.285/0001-61 4a IGREJA BATISTA DO RIO JANEIRO RJ
Dados do Emitente
Nome / Razão Social Nome Fantasia
Prodesc Benfica Embalagens Ltda Me PJ Rio Embalagens
CNPJ Endereço
06.058.769/0001-47 Rua Capitao Felix, 167
Dados do Destinatário
Nome / Razão Social
4a IGREJA BATISTA DO RIO JANEIRO
CNPJ Endereço
27.639.285/0001-61 RUA PARAIBA, 015
Dados dos Produtos e Serviços
Num. Descrição Qtd. Unidade Valor(R$)
Comercial
1 SACOLA KG VERDE/PRETA 60X75 2,5 KG 1,0000 Pc 30,00
Código do Produto Código NCM Código CEST
4705 39232110 1101200
Totais
ICMS
Base de Cálculo ICMS Valor do ICMS Valor do ICMS Desonerado Valor Total do FCP
0,00 0,00 0,00 0,00
Valor Total dos Produtos Valor do Frete Valor do Seguro Valor Total dos Descontos
30,00 0,00 0,00 0,00
Valor Total do II Valor Total do IPI Valor Total do IPI Devolvido Valor do PIS
0,00 0,00 0,00 0,00
Valor da COFINS Outras Despesas Acessórias Valor Total da NFe Valor Aproximado dos Tributos
0,00 0,00 30,00`;

// SENDAS: "Valor Total dos Produtos" (2.357,36) fica MAIOR que "Valor
// Total da NFe" (2.282,96) por causa de R$74,40 de desconto — o caso real
// que expôs o bug de "maior valor do texto" como heurística de total. E
// tem "Dados de Cobrança" (PRODESC não tem) — cobre a âncora "Valor
// Líquido", a mais confiável das duas.
const SENDAS_REAL = `Chave de Acesso Número NF-e Versão
33-2508-06.057.223/0426-80-55-300-000.107.015-145.349.368-4 107015 4.00
Dados da NF-e
Modelo Série Número Data de Emissão Data/Hora de Saída ou da Entrada Valor Total da Nota Fiscal
55 300 107015 06/08/2025 09:44:39-03:00 06/08/2025 09:44:39-03:00 2.282,96
Emitente
CNPJ Nome / Razão So
Destinatário
Nome / Razão Social
QUARTA IGREJA BATISTA DO RIO DE JANEIRO
CNPJ
27.639.285/0001-61
Dados do Emitente
Nome / Razão Social Nome Fantasia
SENDAS DISTRIBUIDORA S A LJ150 150 TIJUCA MARIZ E BARROS
CNPJ Endereço
06.057.223/0426-80 RUA MARIZ E BARROS, 975 SUP H
Dados dos Produtos e Serviços
Num. Descrição Qtd. Unidade Valor(R$)
Comercial
1 ACUCAR REF GUARANI 1KG 40,0000 PC1 159,60
Código do Produto Código NCM Código CEST
4787 17011400 1709900
2 CAFE GIRO ALMOF 500G TRAD 40,0000 UN1 1.116,00
Código do Produto
1182624
Totais
ICMS
Base de Cálculo ICMS
2.037,60
Valor Total dos Produtos Valor do Frete Valor do Seguro Valor Total dos Descontos
2.357,36 0,00 0,00 74,40
Valor Total do II Valor Total do IPI Valor Total do IPI Devolvido Valor do PIS
0,00 0,00 0,00 2,82
Valor da COFINS Outras Despesas Acessórias Valor Total da NFe Valor Aproximado dos Tributos
13,00 0,00 2.282,96
Dados de Cobrança
Fatura
Número Valor Original Valor do Desconto
107015 2.282,96 0,00
Valor Líquido
2.282,96`;

describe("extrairCamposDoTexto — formato Consulta da NF-e (Sefaz)", () => {
  it("lê fornecedor (emitente), não a igreja (destinatário) — PRODESC", () => {
    const r = extrairCamposDoTexto(PRODESC_REAL);
    // O nome fantasia vem colado (limitação conhecida, comentada em
    // `extrairEmitente`) — o que importa aqui é COMEÇAR com a razão social
    // certa e NÃO ser a do destinatário.
    expect(r.razaoSocial).toMatch(/^Prodesc Benfica Embalagens Ltda Me/);
    expect(r.cnpj).toBe("06058769000147");
    expect(r.razaoSocial).not.toContain("IGREJA");
  });

  it("lê o item único da nota, com quantidade e valor exatos", () => {
    const r = extrairCamposDoTexto(PRODESC_REAL);
    expect(r.itens).toEqual([
      { descricao: "SACOLA KG VERDE/PRETA 60X75 2,5 KG", quantidade: 1, unidade: "Pc", valorTotal: 30 },
    ]);
  });

  it("PRODESC (sem 'Dados de Cobrança'): cai pra 'Valor Total da Nota Fiscal' — 30,00", () => {
    expect(extrairCamposDoTexto(PRODESC_REAL).valor).toBe(30);
  });

  it("PRODESC: data de emissão certa (06/08), não outra data qualquer do texto", () => {
    expect(extrairCamposDoTexto(PRODESC_REAL).data).toBe("2025-08-06");
  });

  it("SENDAS: usa 'Valor Líquido' (2.282,96) — o total DEPOIS do desconto, não 'Valor Total dos Produtos' (2.357,36) que é maior", () => {
    const r = extrairCamposDoTexto(SENDAS_REAL);
    expect(r.valor).toBe(2282.96);
  });

  it("SENDAS: fornecedor certo, não a igreja (que aparece antes, como Destinatário)", () => {
    const r = extrairCamposDoTexto(SENDAS_REAL);
    expect(r.razaoSocial).toMatch(/^SENDAS DISTRIBUIDORA S A LJ150/);
    expect(r.cnpj).toBe("06057223042680");
  });

  it("SENDAS: lê os dois itens, com milhar no valor (1.116,00)", () => {
    const r = extrairCamposDoTexto(SENDAS_REAL);
    expect(r.itens).toEqual([
      { descricao: "ACUCAR REF GUARANI 1KG", quantidade: 40, unidade: "PC1", valorTotal: 159.60 },
      { descricao: "CAFE GIRO ALMOF 500G TRAD", quantidade: 40, unidade: "UN1", valorTotal: 1116 },
    ]);
  });

  it("devolve itens vazio (não inventa) em texto sem a seção 'Dados dos Produtos e Serviços'", () => {
    const r = extrairCamposDoTexto("Recibo qualquer\nCNPJ 12.345.678/0001-90\nValor 50,00");
    expect(r.itens).toEqual([]);
  });

  it("SENDAS: número da nota é 107015 (o real), não 891258017 (um protocolo achado mais abaixo no documento)", () => {
    expect(extrairCamposDoTexto(SENDAS_REAL).numeroDoc).toBe("107015");
  });

  it("PRODESC: número da nota é 39764", () => {
    expect(extrairCamposDoTexto(PRODESC_REAL).numeroDoc).toBe("39764");
  });

  it("sem 'Data de Emissão' nem 'Valor Líquido'/'Valor Total da Nota Fiscal', cai pros heurísticos antigos", () => {
    const r = extrairCamposDoTexto("Recibo\nCNPJ 12.345.678/0001-90\nData 10/01/2026\nValor 50,00");
    expect(r.data).toBe("2026-01-10");
    expect(r.valor).toBe(50);
  });
});

describe("agruparEmLinhas", () => {
  it("junta fragmentos na mesma altura (Y) numa única linha, em ordem X", () => {
    // pdf.js entrega fragmentos fora de ordem de leitura (ordem de desenho);
    // aqui simulado com "SOCIAL" vindo antes de "RAZÃO" no array.
    const itens = [
      { texto: "SOCIAL", x: 50, y: 700 },
      { texto: "RAZÃO", x: 10, y: 700 },
      { texto: "12.345.678/0001-90", x: 10, y: 680 },
    ];
    const linhas = agruparEmLinhas(itens);
    expect(linhas).toEqual(["RAZÃO SOCIAL", "12.345.678/0001-90"]);
  });

  it("trata Y quase igual (dentro da tolerância) como a mesma linha", () => {
    const itens = [
      { texto: "A", x: 0, y: 700.4 },
      { texto: "B", x: 10, y: 699.1 }, // 1.3px de diferença — mesma linha na prática
    ];
    expect(agruparEmLinhas(itens)).toEqual(["A B"]);
  });

  it("separa linhas com Y claramente diferente — é essa separação que faz o CNPJ ficar em linha própria, pra extrairRazaoSocial contar linhas acima dele", () => {
    const itens = [
      { texto: "EMPRESA TESTE LTDA", x: 0, y: 700 },
      { texto: "12345678000190", x: 0, y: 650 }, // 50px abaixo — outra linha, sem dúvida
    ];
    expect(agruparEmLinhas(itens)).toEqual(["EMPRESA TESTE LTDA", "12345678000190"]);
  });

  it("devolve lista vazia pra página sem itens de texto", () => {
    expect(agruparEmLinhas([])).toEqual([]);
  });
});
