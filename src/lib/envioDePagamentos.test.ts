// "Arquivos de pagamento": o e-mail que a Tesouraria manda aos tesoureiros, montado pelo sistema — no formato do e-mail real de 13.10.2026.
import { describe, expect, it } from "vitest";
import {
  INTRODUCAO_PADRAO, SAUDACAO_PADRAO, assuntoDoEmail, bancoDaLinha, ehSigiloso, formatarLinha, linkDoEmail, montarEnvio, montarItemDeEnvio, nomeDaPasta, nomeDeArquivoSeguro, periodoDoDia,
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
  it("sem linha: Pix vai para o bloco Pix (desmarcado); sem nada, para 'sem dado automático'", () => {
    const pix = montarItemDeEnvio(base(), leitura({ linha: null, pix: "00020126..." }));
    expect(pix.grupo).toBe("pix"); expect(pix.marcadoPorPadrao).toBe(false);
    expect(montarItemDeEnvio(base(), leitura({ linha: null, pix: null })).grupo).toBe("sem_dado");
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
    expect(montarEnvio([junta], opcoes({ hora: 9 })).texto).toMatch(/^Olá irmãos, bom dia!\nGraça e paz!/);
    expect(montarEnvio([junta], opcoes({ hora: 15 })).texto).toContain("boa tarde");
    expect(montarEnvio([junta], opcoes({ hora: 20 })).texto).toContain("boa noite");
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
    const pix = item({ id: "p", fornecedor: "Ana Patrícia", linha: null, pix: "00020126580014br.gov.bcb.pix0136abc", grupo: "pix", valor: 800 });
    const e = montarEnvio([pix], opcoes());
    expect(e.texto).toContain("➡️ Pix · R$ 800,00 · vence 13/10/2026");
    expect(e.texto).toContain("Pix copia e cola:"); expect(e.texto).toContain("00020126580014br.gov.bcb.pix0136abc");
  });

  it("quadro-resumo opcional com o total; e a citação do que está só na pasta", () => {
    const sem = item({ id: "s", fornecedor: "ABC Associação", valor: 37.8, linha: null, grupo: "sem_dado" });
    const e = montarEnvio([junta, letra], opcoes({ incluirResumo: true, citarSemLinha: true, semDado: [sem] }));
    expect(e.html).toContain("VENCEM · 2 · R$ 768,33");
    expect(e.html).toContain("Na pasta do drive, sem linha digitável: ABC Associação (R$ 37,80).");
    expect(montarEnvio([junta], opcoes({ incluirResumo: false, citarSemLinha: false, semDado: [sem] })).html).not.toContain("Na pasta do drive");
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
