// "Arquivos de pagamento": o e-mail que a Tesouraria manda aos tesoureiros, montado pelo sistema — no formato do e-mail real de 13.10.2026.
import { describe, expect, it } from "vitest";
import {
  INTRODUCAO_PADRAO, SAUDACAO_PADRAO, assuntoDoEmail, bancoDaLinha, contadoresDoEnvio, ehSigiloso, entraNoZip, formatarLinha, linkDoEmail, montarEnvio, montarItemDeEnvio, nomeDaPasta,
  nomeDeArquivoSeguro, nomeDoDocumentoNoZip, nomeDoZip, periodoDoDia, rotuloDoCodigo,
  type ItemDeEnvio, type OpcoesDoEnvio,
} from "./envioDePagamentos";

// as quatro linhas digitáveis do e-mail real (Bradesco, Nubank, Flora, Banco do Brasil)
const BRADESCO = "23790226079000020134447008430002715980000030000";
const NUBANK = "26091741037783826842679990000000311598000046833";
const BB = "00190000090342661400800079603171115980000003780";
const SEM_BANCO = "40192026238000000000200001910975115970000048566";

const base = (o: Partial<Parameters<typeof montarItemDeEnvio>[0]> = {}) => ({
  id: "a", fornecedor: "Junta de Missões Nacionais da Conv Batista Brasileira", descricao: null, categoria: "Carreta Missionária", centro: "Evangelismo e Missões",
  valor: 300, vencimento: "2026-10-13", diasParaVencer: 0, ...o,
});
const leitura = (o: Partial<Parameters<typeof montarItemDeEnvio>[1]> = {}) => ({ linha: BRADESCO, pix: null, valorDoDocumento: 300, vencimentoDoDocumento: "2026-10-13", codigoValido: true, ...o });
const item = (o: Partial<ItemDeEnvio> = {}): ItemDeEnvio => ({ ...montarItemDeEnvio(base(), leitura()), ...o });
const opcoes = (o: Partial<OpcoesDoEnvio> = {}): OpcoesDoEnvio => ({ hojeYmd: "2026-10-13", hora: 9, saudacao: SAUDACAO_PADRAO, introducao: INTRODUCAO_PADRAO, incluirResumo: false, citarSemLinha: false, ...o });

describe("linha digitável", () => {
  it("o banco vem dos 3 primeiros dígitos do boleto bancário; banco desconhecido ou conta de consumo ficam sem banco", () => {
    expect(bancoDaLinha(BRADESCO)).toBe("Bradesco");
    expect(bancoDaLinha(NUBANK)).toBe("Nubank");
    expect(bancoDaLinha(BB)).toBe("Banco do Brasil");
    expect(bancoDaLinha(SEM_BANCO)).toBeNull();           // 401 não está na lista: a linha some, como no e-mail dela (Flora)
    expect(bancoDaLinha("836100000015" + "0".repeat(36))).toBeNull(); // 48 dígitos (arrecadação) não tem banco emissor
    expect(bancoDaLinha(null)).toBeNull();
  });

  it("agrupa de 5 em 5, como ela cola no e-mail", () => {
    expect(formatarLinha(BRADESCO)).toBe("23790 22607 90000 20134 44700 84300 02715 98000 00300 00");
    expect(formatarLinha("23790.22607 90000.201344")).toBe("23790 22607 90000 20134 4");
    expect(formatarLinha(null)).toBe("");
  });
});

describe("quem é sigiloso", () => {
  it("prebenda, salário, folha, RPA e Sustento", () => {
    expect(ehSigiloso({ categoria: "Prebenda", centro: "Pastoral · Sustento Pastoral" })).toBe(true);
    expect(ehSigiloso({ descricao: "Salario Caio" })).toBe(true);
    expect(ehSigiloso({ descricao: "RPA Ana Patricia" })).toBe(true);
    expect(ehSigiloso({ descricao: "Férias — Tayane" })).toBe(true);
  });
  it("o que não é remuneração segue o caminho normal (encargos, fornecedores, consumo)", () => {
    expect(ehSigiloso({ categoria: "Encargos Trabalhistas", centro: "Administração · Pessoal", fornecedor: "Receita Federal do Brasil (RFB)" })).toBe(false);
    expect(ehSigiloso({ categoria: "Energia Elétrica", fornecedor: "Light Serviços de Eletricidade S.A" })).toBe(false);
  });
});

describe("classificação do item", () => {
  it("com linha digitável e sem divergência: pronto e marcado (se é de hoje ou atrasado)", () => {
    const i = montarItemDeEnvio(base(), leitura());
    expect(i.grupo).toBe("padrao"); expect(i.marcadoPorPadrao).toBe(true); expect(i.avisos).toEqual([]);
  });
  it("o que vence depois de hoje vem desmarcado", () => {
    expect(montarItemDeEnvio(base({ diasParaVencer: 3 }), leitura()).marcadoPorPadrao).toBe(false);
  });
  it("atrasado vem marcado e se diz atrasado", () => {
    const i = montarItemDeEnvio(base({ diasParaVencer: -5, vencimento: "2026-10-08" }), leitura({ vencimentoDoDocumento: "2026-10-08" }));
    expect(i.atrasado).toBe(true); expect(i.marcadoPorPadrao).toBe(true);
  });
  it("valor do documento diferente da obrigação: avisa e NÃO vem marcado", () => {
    const i = montarItemDeEnvio(base(), leitura({ valorDoDocumento: 312.5 }));
    expect(i.avisos[0]).toContain("o documento traz"); expect(i.marcadoPorPadrao).toBe(false);
  });
  it("código de barras que não confere: avisa e NÃO vem marcado", () => {
    const i = montarItemDeEnvio(base(), leitura({ codigoValido: false }));
    expect(i.avisos[0]).toContain("não confere"); expect(i.marcadoPorPadrao).toBe(false);
  });
  it("vencimento do boleto diferente: só informa, usa o do boleto e continua marcado", () => {
    const i = montarItemDeEnvio(base(), leitura({ vencimentoDoDocumento: "2026-10-12" }));
    expect(i.vencimento).toBe("2026-10-12"); expect(i.avisos[0]).toContain("o boleto vence"); expect(i.marcadoPorPadrao).toBe(true);
  });
  it("sem linha: o Pix do DOCUMENTO e o do CADASTRO ligado à obrigação vêm marcados (de hoje/atrasado); sem nada, 'sem meio automático'", () => {
    const doc = montarItemDeEnvio(base(), leitura({ linha: null, pix: "00020126...", origemDoPix: "documento" }));
    expect(doc.grupo).toBe("pix"); expect(doc.origem).toBe("pix_documento"); expect(doc.marcadoPorPadrao).toBe(true);
    const cad = montarItemDeEnvio(base(), leitura({ linha: null, pix: "00020126...", origemDoPix: "cadastro", favorecidoDoPix: "Junta" }));
    expect(cad.origem).toBe("pix_cadastro"); expect(cad.marcadoPorPadrao).toBe(true); expect(cad.favorecidoParaConfirmar).toBeNull();
    const nada = montarItemDeEnvio(base(), leitura({ linha: null, pix: null }));
    expect(nada.grupo).toBe("sem_dado"); expect(nada.origem).toBeNull(); expect(nada.marcadoPorPadrao).toBe(false);
  });
  it("favorecido achado só pelo NOME: Pix do cadastro, mas 'Confirmar favorecido' — desmarcado, nunca vai sozinho", () => {
    const i = montarItemDeEnvio(base(), leitura({ linha: null, pix: "00020126...", origemDoPix: "cadastro_por_nome", favorecidoDoPix: "Junta de Missões Nacionais" }));
    expect(i.origem).toBe("pix_cadastro"); expect(i.favorecidoParaConfirmar).toBe("Junta de Missões Nacionais"); expect(i.marcadoPorPadrao).toBe(false);
  });
  it("a origem segue a ordem de prioridade: linha do documento > Pix do documento > Pix do cadastro", () => {
    expect(montarItemDeEnvio(base(), leitura({ pix: "x", origemDoPix: "documento" })).origem).toBe("linha_documento");   // tem linha E Pix: a linha manda
  });
  it("o Pix que vence depois de hoje vem desmarcado, qualquer que seja a origem", () => {
    expect(montarItemDeEnvio(base({ diasParaVencer: 3 }), leitura({ linha: null, pix: "x", origemDoPix: "documento" })).marcadoPorPadrao).toBe(false);
  });
  it("conta os documentos que acompanham a obrigação", () => {
    expect(montarItemDeEnvio(base(), leitura({ documentos: 2 })).documentos).toBe(2);
    expect(montarItemDeEnvio(base(), leitura()).documentos).toBe(0);
  });
  it("prebenda/folha: sigiloso mesmo com linha digitável, nunca marcado", () => {
    const i = montarItemDeEnvio(base({ fornecedor: "Lucio Paulo Paz Barreto", categoria: "Prebenda", centro: "Pastoral · Sustento Pastoral" }), leitura());
    expect(i.grupo).toBe("sigiloso"); expect(i.marcadoPorPadrao).toBe(false);
  });
});

describe("o e-mail", () => {
  const junta = item();
  const letra = item({ id: "b", fornecedor: "Letra do Céu Comércio e Distribuição LTDA", valor: 468.33, linha: NUBANK });
  const flora = item({ id: "c", fornecedor: "Flora Energia Renovável S.A.", valor: 485.66, linha: SEM_BANCO, vencimento: "2026-10-12" });

  it("assunto e nome da pasta no padrão dela", () => {
    expect(assuntoDoEmail("2026-10-13")).toBe("Arquivos de pagamento | Vencimento 13.10.2026");
    expect(nomeDaPasta("2026-10-13")).toBe("13.OUT");
  });

  it("cada item: cabeçalho com tipo, banco, valor e vencimento; beneficiário em maiúsculas; linha agrupada", () => {
    const e = montarEnvio([junta, letra, flora], opcoes());
    expect(e.texto).toContain("➡️ Boleto bancário · Bradesco · R$ 300,00 · vence 13/10/2026");
    expect(e.texto).toContain("JUNTA DE MISSÕES NACIONAIS DA CONV BATISTA BRASILEIRA");
    expect(e.texto).toContain("23790 22607 90000 20134 44700 84300 02715 98000 00300 00");
    expect(e.texto).toContain("➡️ Boleto bancário · Nubank · R$ 468,33 · vence 13/10/2026");
    // Flora: banco desconhecido → a linha do banco some (como no e-mail dela)
    expect(e.texto).toContain("➡️ Boleto bancário · R$ 485,66 · vence 12/10/2026");
    expect(e.quantidade).toBe(3); expect(e.total).toBeCloseTo(1253.99, 2);
  });

  it("a saudação troca {periodo} pela hora; a abertura leva a linha digitável em negrito", () => {
    // o PADRÃO agora é a saudação institucional dos resumos (sem período); o marcador {periodo} segue valendo para quem personalizou o texto
    expect(montarEnvio([junta], opcoes({ hora: 9 })).texto).toMatch(/^Prezados, graça e paz!/);
    const personalizada = { saudacao: "Olá, {periodo}!" };
    expect(montarEnvio([junta], opcoes({ hora: 9, ...personalizada })).texto).toMatch(/^Olá, bom dia!/);
    expect(montarEnvio([junta], opcoes({ hora: 15, ...personalizada })).texto).toContain("boa tarde");
    expect(montarEnvio([junta], opcoes({ hora: 20, ...personalizada })).texto).toContain("boa noite");
    const e = montarEnvio([junta], opcoes());
    expect(e.html).toContain("<b>linha digitável disponível</b>");
    expect(e.whatsapp).toContain("*linha digitável disponível*");
    expect(e.texto).toContain("com linha digitável disponível e os documentos");
    expect([periodoDoDia(5), periodoDoDia(12), periodoDoDia(18)]).toEqual(["bom dia", "boa tarde", "boa noite"]);
  });

  it("e-mail em HTML: linha em fonte monoespaçada; WhatsApp: linha em bloco de código", () => {
    const e = montarEnvio([junta], opcoes());
    expect(e.html).toMatch(/<span style="[^"]*monospace[^"]*">23790 22607/);
    expect(e.whatsapp).toContain("```23790 22607 90000 20134 44700 84300 02715 98000 00300 00```");
    expect(e.whatsapp.startsWith("*Arquivos de pagamento | Vencimento 13.10.2026*")).toBe(true);
  });

  it("a linha do beneficiário pode ser trocada à mão (como o 'Carteira' dela)", () => {
    const e = montarEnvio([junta], opcoes({ linhasDeDescricao: { a: "Carteira" } }));
    expect(e.texto).toContain("CARTEIRA"); expect(e.texto).not.toContain("JUNTA DE MISSÕES");
  });

  it("Pix: cabeçalho próprio e 'Pix copia e cola' com o código", () => {
    const pix = item({ id: "p", fornecedor: "Ana Patrícia", linha: null, pix: "00020126580014br.gov.bcb.pix0136abc", grupo: "pix", origem: "pix_documento", valor: 800 });
    const e = montarEnvio([pix], opcoes());
    expect(e.texto).toContain("➡️ Pix · R$ 800,00 · vence 13/10/2026");
    expect(e.texto).toContain("💳 PIX do documento — copia e cola:"); expect(e.texto).toContain("00020126580014br.gov.bcb.pix0136abc");
  });

  it("quadro-resumo opcional com o total; e a citação do que está só na pasta", () => {
    const sem = item({ id: "s", fornecedor: "ABC Associação", valor: 37.8, linha: null, grupo: "sem_dado" });
    const e = montarEnvio([junta, letra], opcoes({ incluirResumo: true, citarSemLinha: true, semDado: [sem] }));
    expect(e.html).toContain("VENCEM · 2 · R$ 768,33");
    expect(e.html).toContain("❓ Sem meio automático de pagamento — documentos na pasta do drive: ABC Associação (R$ 37,80).");
    expect(montarEnvio([junta], opcoes({ incluirResumo: false, citarSemLinha: false, semDado: [sem] })).html).not.toContain("documentos na pasta do drive");
  });

  it("a ORIGEM aparece sempre: 🧾 linha do documento · 💳 PIX do documento · 👤 PIX do cadastro (com a conferência do titular)", () => {
    const pixCad = item({ id: "c", linha: null, pix: "000201", grupo: "pix", origem: "pix_cadastro" });
    expect(rotuloDoCodigo(junta)).toBe("🧾 Linha digitável do documento:");
    expect(rotuloDoCodigo(item({ linha: null, pix: "000201", origem: "pix_documento" }))).toBe("💳 PIX do documento — copia e cola:");
    expect(rotuloDoCodigo(pixCad)).toBe("👤 PIX do cadastro do favorecido — copia e cola (confira o titular no aplicativo do banco):");
    const e = montarEnvio([junta, pixCad], opcoes());
    for (const t of [e.texto, e.whatsapp]) { expect(t).toContain("🧾 Linha digitável do documento:"); expect(t).toContain("👤 PIX do cadastro do favorecido"); }
    expect(e.html).toContain("🧾 Linha digitável do documento:");
  });

  it("contadores do painel: pagamentos, boletos, Pix, sem meio e documentos", () => {
    const pixDoc = item({ id: "p", linha: null, pix: "000201", grupo: "pix", origem: "pix_documento", documentos: 1 });
    const sem = item({ id: "s", linha: null, pix: null, grupo: "sem_dado", origem: null, documentos: 0 });
    const aConf = item({ id: "n", linha: null, pix: "000201", grupo: "pix", origem: "pix_cadastro", favorecidoParaConfirmar: "X" });
    const c = contadoresDoEnvio([item({ documentos: 2 }), pixDoc], [item({ documentos: 2 }), pixDoc, sem, aConf]);
    expect(c).toEqual({ pagamentos: 2, boletos: 1, pix: 1, semMeio: 1, documentos: 3, aConfirmar: 1 });
  });

  it("o ZIP é o dossiê: tudo da obrigação entra, menos comprovante, XML e as provas de quitação por terceiros", () => {
    for (const t of ["boleto", "guia", "fatura", "nota_fiscal", "contrato", "rpa", "documento", "outro"]) expect(entraNoZip(t), t).toBe(true);
    for (const t of ["comprovante", "xml", "declaracao_terceiro", "pedido_reembolso", "prova_pagamento_terceiro", "prova_cancelamento"]) expect(entraNoZip(t), t).toBe(false);
  });

  it("nome dos arquivos: número da mensagem, banco, favorecido, valor e o tipo do documento; o 2º do mesmo tipo leva (2)", () => {
    const nome = nomeDoDocumentoNoZip(3, junta, "boleto", 1, "pdf");
    expect(nome.startsWith("03 Bradesco - Junta de Missoes Nacionais")).toBe(true);
    expect(nome.endsWith(" - boleto.pdf")).toBe(true);
    expect(nome.length - " - boleto.pdf".length).toBeLessThanOrEqual(70);   // o nome do favorecido é cortado, o tipo do documento nunca
    expect(nomeDoDocumentoNoZip(1, letra, "nota_fiscal", 1, "pdf")).toMatch(/^01 Nubank - Letra do Ceu .* - 468,33 - nota fiscal\.pdf$/);
    expect(nomeDoDocumentoNoZip(2, flora, "fatura", 2, "png")).toMatch(/ - fatura \(2\)\.png$/);
    expect(nomeDoDocumentoNoZip(2, flora, "fatura", 1, "pdf")).not.toContain("Flora Energia Renovável");   // sem acento nem caracteres proibidos
  });

  it("o ZIP se chama como a pasta do Drive com o ano", () => {
    expect(nomeDoZip("2026-10-20")).toBe("20.OUT.2026.zip");
    expect(nomeDaPasta("2026-10-20")).toBe("20.OUT");
  });

  it("texto digitado nunca vira HTML (nome com < > &)", () => {
    const e = montarEnvio([item({ fornecedor: "A&B <script>alert(1)</script>" })], opcoes({ incluirResumo: true }));
    expect(e.html).not.toContain("<script>"); expect(e.html).toContain("A&amp;B &lt;SCRIPT&gt;");
  });

  it("link do e-mail: destinatários e assunto (o corpo vai pela área de transferência)", () => {
    expect(linkDoEmail(["a@x.com", "b@y.com"], "Arquivos de pagamento | Vencimento 13.10.2026")).toBe("mailto:a@x.com,b@y.com?subject=Arquivos%20de%20pagamento%20%7C%20Vencimento%2013.10.2026");
  });

  it("nome de arquivo do ZIP sem acento nem caracteres proibidos", () => {
    expect(nomeDeArquivoSeguro("01 Bradesco - Junta de Missões: 300,00")).toBe("01 Bradesco - Junta de Missoes 300,00");
  });
});
