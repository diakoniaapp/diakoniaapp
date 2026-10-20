// Favoritos da Tesouraria: toda tela do Financeiro é fixável por padrão (derivado do registro único das telas), salvo motivo técnico escrito no registro.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TELAS } from "./navegacao";
import { destinoDaRota, ehFixavel, telasFixaveis, tipoDoFavorito } from "./favoritosFinanceiros";

const rotasFinanceirasDoApp = (() => {
  const app = readFileSync("src/App.tsx", "utf8");
  const dentro = app.slice(app.indexOf("<AppLayout />"), app.indexOf('<Route path="*"'));
  return [...dentro.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)].filter(m => !(m[2] === "Navigate" || m[2].startsWith("Redireciona"))).map(m => m[1])
    .filter(r => r.startsWith("/financas") || r === "/painel-tesouraria");
})();

describe("telas fixáveis do Financeiro", () => {
  const lista = telasFixaveis();
  const rotas = lista.map(t => t.rota);

  it("as seis que já eram fixáveis continuam, e as novas entram sozinhas (Prestação de Contas, Extrato de Obrigações)", () => {
    for (const r of ["/financas/dre", "/financas/orcamento", "/financas/executivo", "/financas/prestacao-de-contas", "/financas/extrato-de-obrigacoes"]) expect(rotas).toContain(r);
  });

  it("outras telas recentes ou de apoio também são fixáveis (Malote, Central de Documentos, Fiscal, Auditoria do extrato, Reuniões, Conta de Sustento, Insights, Recorrências)", () => {
    for (const r of ["/financas/documentos", "/financas/fiscal", "/financas/auditoria-extrato", "/financas/reunioes", "/financas/sustento", "/financas/insights", "/financas/recorrencias"]) expect(rotas).toContain(r);
  });

  it("fica de fora o que tem parâmetro (não se escolhe numa lista), a própria Mesa e o que tem motivo técnico registrado", () => {
    expect(rotas.some(r => r.includes(":"))).toBe(false);
    expect(rotas).not.toContain("/painel-tesouraria");
    expect(rotas).not.toContain("/financas/relatorio-contas");
    expect(TELAS.find(t => t.padrao === "/financas/relatorio-contas")!.naoFixavel).toMatch(/contas/);
  });

  it("REGRA: toda rota do Financeiro no App.tsx é fixável por padrão — ou tem parâmetro, ou é a própria Mesa, ou registra um motivo técnico (nunca fica de fora em silêncio)", () => {
    expect(rotasFinanceirasDoApp.length).toBeGreaterThan(30);
    const silenciosas = rotasFinanceirasDoApp.filter(r => {
      if (r.includes(":") || r === "/painel-tesouraria") return false;
      const t = TELAS.find(x => x.padrao === r);
      return !t || (!rotas.includes(r) && !t.naoFixavel);
    });
    expect(silenciosas, `telas do Financeiro fora dos favoritos sem motivo: ${silenciosas.join(", ")}`).toEqual([]);
  });

  it("toda exceção tem um motivo escrito", () => {
    for (const t of TELAS.filter(x => x.naoFixavel !== undefined)) expect(t.naoFixavel!.trim().length, t.padrao).toBeGreaterThan(10);
  });

  it("só telas do Financeiro; ordem das abas do workspace (Operações antes de Gestão, Gestão antes de Cadastros, Cadastros antes de Fechamento)", () => {
    expect(TELAS.filter(t => rotas.includes(t.padrao)).every(t => t.modulo === "financeiro")).toBe(true);
    const secoes = lista.map(t => t.secao).filter(Boolean) as string[];
    const ordem = ["Operações", "Gestão", "Cadastros", "Fechamento"];
    expect(secoes.map(s => ordem.indexOf(s))).toEqual([...secoes.map(s => ordem.indexOf(s))].sort((a, b) => a - b));
    expect(lista.find(t => t.rota === "/financas/extrato-de-obrigacoes")).toMatchObject({ rotulo: "Extrato de Obrigações", secao: "Fechamento", tipo: "relatorio" });
  });

  it("o diálogo 'Fixar atalho' lê a lista do registro, não uma lista fixa", () => {
    const dialogo = readFileSync("src/components/financas/FixarFavoritoDialog.tsx", "utf8");
    expect(dialogo).toContain("telasFixaveis()");
    expect(dialogo).not.toMatch(/const RELATORIOS\s*=/);
  });
});

describe("tipo e destino do favorito", () => {
  it("o tipo gravado respeita o que a tabela aceita", () => {
    expect(tipoDoFavorito("/financas/conta/:contaId")).toBe("conta");
    expect(tipoDoFavorito("/financas/favorecido/:id")).toBe("fornecedor");
    expect(tipoDoFavorito("/financas/centro/:centroId")).toBe("centro_custo");
    expect(tipoDoFavorito("/financas/projeto/:id")).toBe("projeto");
    expect(tipoDoFavorito("/financas/dre/:ano")).toBe("outro");
    expect(tipoDoFavorito("/financas/dre")).toBe("relatorio");
  });

  it("destinoDaRota: tela sem parâmetro usa o título do registro; com parâmetro usa o nome real; fora do Financeiro, a Mesa e as exceções não têm botão", () => {
    expect(destinoDaRota("/financas/extrato-de-obrigacoes?inicio=2026-09-01")).toMatchObject({ rota: "/financas/extrato-de-obrigacoes", rotulo: "Extrato de Obrigações", tipo: "relatorio" });
    expect(destinoDaRota("/financas/conta/abc", "Bradesco · Extrato completo")).toMatchObject({ rota: "/financas/conta/abc", rotulo: "Bradesco · Extrato completo", tipo: "conta" });
    expect(destinoDaRota("/financas/conta/abc")).toMatchObject({ rotulo: "Conta" });
    expect(destinoDaRota("/membros")).toBeNull();
    expect(destinoDaRota("/painel-tesouraria")).toBeNull();
    expect(destinoDaRota("/financas/relatorio-contas?contas=a,b")).toBeNull();
    expect(destinoDaRota("/rota-que-nao-existe")).toBeNull();
  });

  it("ehFixavel: módulo financeiro e sem motivo em contrário", () => {
    expect(ehFixavel({ padrao: "/x", titulo: "X", modulo: "financeiro" })).toBe(true);
    expect(ehFixavel({ padrao: "/x", titulo: "X", modulo: "pessoas" })).toBe(false);
    expect(ehFixavel({ padrao: "/x", titulo: "X", modulo: "financeiro", naoFixavel: "precisa de parâmetro na URL" })).toBe(false);
  });
});
