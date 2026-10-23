// A primeira tela da Tesouraria (23/10/2026): as decisões dela para o celular e para o desktop, travadas no código-fonte (a página é grande demais para montar inteira aqui).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const painel = readFileSync("src/pages/PainelTesouraria.tsx", "utf8");
const mesa = readFileSync("src/components/financas/MesaDoTesoureiro.tsx", "utf8");

describe("Fechar o mês", () => {
  it("saiu de 'Meu trabalho' (levava à Prestação de Contas, um relatório; o fechamento é a aba 4)", () => {
    const meuTrabalho = painel.slice(painel.indexOf("Meu trabalho\n"), painel.indexOf("Meu trabalho\n") + 2600);
    expect(meuTrabalho).not.toContain("Fechar o mês</Link>");
    expect(meuTrabalho).not.toContain('to="/financas/prestacao-de-contas"');
  });
  it("em seu lugar a Mesa mostra o aviso do fechamento, que leva à aba 4", () => {
    expect(mesa).toContain("avisoDoFechamento(hoje, dados.documentosAnterior, dados.documentos)");
    expect(mesa).toContain('to="/painel-tesouraria#fechamento"');
    expect(mesa).toContain("data-aviso-fechamento");
  });
});

describe("Preparar envio → Resumo diário", () => {
  it("o botão do cartão da agenda é 'Resumo diário' e abre o painel", () => {
    expect(mesa).toContain("Resumo diário</Button>");
    expect(mesa).not.toContain("Preparar envio</Button>");
    expect(mesa).toContain("<ResumoDiarioPainel");
  });
  it("o envio manual (escolher, WhatsApp, ZIP) continua alcançável, de dentro do painel", () => {
    expect(mesa).toContain("onEnvioManual={() => setEnvioAberto(true)}");
    expect(mesa).toContain("<PrepararEnvioDialog");
  });
});

describe("o celular", () => {
  it("só as abas ficam fixas: o cabeçalho é fixo apenas de md para cima, e há uma barra de abas própria do celular", () => {
    expect(painel).toContain('className="md:sticky md:top-0 md:z-20 bg-background');
    expect(painel).toContain('<nav className="md:hidden sticky top-0 z-20');
    expect(painel).toContain('<nav className="hidden md:flex');
  });
  it("as ações viram o '+' (Novo lançamento, Registrar recebimento, Transferir, Importar extrato); a faixa de botões é só do computador", () => {
    expect(painel).toContain("data-acoes-do-celular");
    expect(painel).toContain('<section className="hidden md:flex flex-wrap items-center gap-1.5">');
    for (const rotulo of ["Novo lançamento", "Registrar recebimento", "Transferir", "Importar extrato"]) expect(painel.split(rotulo).length).toBeGreaterThan(2);
  });
  it("os favoritos vão para depois da agenda no celular (uma linha com rolagem lateral) e ficam no lugar de sempre no computador", () => {
    expect(painel).toContain("aposAAgenda={favoritosDaTesouraria(true)}");
    expect(painel).toContain('"hidden md:block"');
    expect(painel).toContain("overflow-x-auto");
    expect(mesa).toContain('<div className="md:hidden">{aposAAgenda}</div>');
  });
  it("a agenda abre na SEMANA no celular e no Calendário no computador; o mês fica a um toque", () => {
    expect(mesa).toContain('noCelular ? "semana" : "calendario"');
    expect(mesa).toContain('["semana", "calendario", "fila"]');
  });
});
