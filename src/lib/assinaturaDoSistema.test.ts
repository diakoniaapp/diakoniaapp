// A assinatura discreta do DiakoniaApp: uma definição só, usada no e-mail, no WhatsApp, nos ZIPs e nos rodapés dos relatórios.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SISTEMA, assinaturaEmHtml, assinaturaEmTexto, assinaturaEmWhatsapp, leiaMeDoPacote, linhasDaAssinatura } from "./assinaturaDoSistema";
import { AVISO_DE_CONFERENCIA, montarEnvio, montarItemDeEnvio, SAUDACAO_PADRAO, INTRODUCAO_PADRAO } from "./envioDePagamentos";

describe("a assinatura", () => {
  it("diz o que o documento é, o slogan, a descrição e a autoria com CNPJ", () => {
    expect(linhasDaAssinatura("mensagem")).toEqual([
      "Mensagem preparada automaticamente pelo DiakoniaApp.",
      "Conectando pessoas, organizando o propósito.",
      "Plataforma de gestão administrativa, financeira e ministerial da igreja.",
      "Desenvolvimento e parametrização: Telma Souza · CNPJ 34.926.658/0001-40",
    ]);
    expect(linhasDaAssinatura("documento")[0]).toBe("Documento gerado automaticamente pelo DiakoniaApp.");
    expect(linhasDaAssinatura("pacote")[0]).toBe("Pacote preparado automaticamente pelo DiakoniaApp.");
  });

  it("o CNPJ pode sair de uma saída específica sem mexer nas outras", () => {
    expect(linhasDaAssinatura("mensagem", { comCnpj: false })[3]).toBe("Desenvolvimento e parametrização: Telma Souza");
    expect(assinaturaEmTexto("mensagem", { comCnpj: false })).not.toContain("CNPJ");
    expect(assinaturaEmTexto("mensagem")).toContain("CNPJ 34.926.658/0001-40");
  });

  it("o CNPJ é o mesmo do rodapé da tela de entrada (uma fonte só de verdade)", () => {
    expect(readFileSync("src/components/AuthShell.tsx", "utf8")).toContain(`CNPJ: ${SISTEMA.cnpj}`);
  });

  it("e-mail em HTML (cinza, pequeno), WhatsApp (itálico) e texto simples", () => {
    expect(assinaturaEmHtml("mensagem")).toMatch(/font-size:11px;[^"]*color:#777/);
    expect(assinaturaEmHtml("mensagem")).toContain("<b>DiakoniaApp</b> · Conectando pessoas, organizando o propósito.");
    expect(assinaturaEmWhatsapp("mensagem")).toContain("_DiakoniaApp · Conectando pessoas, organizando o propósito._");
    expect(assinaturaEmTexto("mensagem").startsWith("—\nDiakoniaApp · Conectando pessoas")).toBe(true);
  });

  it("LEIA-ME do pacote: título, linhas, assinatura de pacote, quebra de linha do Windows", () => {
    const t = leiaMeDoPacote("Pacote contábil — 2026-09", ["INDICE.csv — tudo o que há aqui."]);
    expect(t).toContain("Pacote contábil — 2026-09\r\n=");
    expect(t).toContain("INDICE.csv — tudo o que há aqui.");
    expect(t).toContain("Pacote preparado automaticamente pelo DiakoniaApp.");
    expect(t).toContain("CNPJ 34.926.658/0001-40");
    expect(t).not.toMatch(/[^\r]\n/);
  });
});

describe("onde a assinatura aparece", () => {
  const item = montarItemDeEnvio(
    { id: "a", fornecedor: "Junta", descricao: null, categoria: null, centro: null, valor: 300, vencimento: "2026-10-13", diasParaVencer: 0 },
    { linha: "23790226079000020134447008430002715980000030000", pix: null, valorDoDocumento: 300, vencimentoDoDocumento: null, codigoValido: true },
  );
  const o = { hojeYmd: "2026-10-13", hora: 9, saudacao: SAUDACAO_PADRAO, introducao: INTRODUCAO_PADRAO, incluirResumo: false, citarSemLinha: false };

  it("no fim do e-mail, do WhatsApp e do texto, depois do aviso de conferência", () => {
    const e = montarEnvio([item], o);
    for (const t of [e.html, e.whatsapp, e.texto]) {
      expect(t).toContain(AVISO_DE_CONFERENCIA);
      expect(t).toContain("Conectando pessoas, organizando o propósito.");
      expect(t.indexOf(AVISO_DE_CONFERENCIA)).toBeLessThan(t.indexOf("Conectando pessoas"));
    }
    expect(e.texto.trimEnd().endsWith("CNPJ 34.926.658/0001-40")).toBe(true);
  });

  it("nos rodapés dos relatórios (Extrato, Prestação, DRE, Centro, Projeto, Executivo) e nos ZIPs (boletos e malote)", () => {
    expect(readFileSync("src/components/financas/relatorio/RelatorioKit.tsx", "utf8")).toContain("<AssinaturaDoSistema />");
    for (const p of ["FinancasPrestacaoContas", "FinancasCentroPrestacaoContas", "FinancasDRE", "FinancasProjetoDetalhe", "financas/DashboardExecutivo"])
      expect(readFileSync(`src/pages/${p}.tsx`, "utf8"), p).toContain("<AssinaturaDoSistema />");
    expect(readFileSync("src/services/envioDePagamentosService.ts", "utf8")).toContain(`"LEIA-ME.txt"`);
    expect(readFileSync("src/services/pacoteContabilService.ts", "utf8")).toContain("LEIA-ME.txt");
  });
});
