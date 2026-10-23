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
    expect(painel).toContain('className="md:hidden sticky top-0 z-20');
    expect(painel).toContain('className="hidden md:flex');
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

describe("documentação: a primeira tela leva à Auditoria, não à importação (23/10/2026)", () => {
  const central = readFileSync("src/pages/FinancasCentralDocumentos.tsx", "utf8");
  const auditoria = readFileSync("src/pages/FinancasAuditoriaAnexos.tsx", "utf8");
  it("o chip é um por mês (a Mesa usa chipsDeDocumentacao) e o checklist não manda mais 'documentos' para a Central", () => {
    expect(mesa).toContain("chipsDeDocumentacao(hoje, dados.documentosAnterior, dados.documentos)");
    expect(mesa).toContain('["atrasadas", "hoje", "debitos", "documentos"]');
    expect(mesa).toContain("data-chip-documentos");
  });
  it("o cartão 'Documentos para a contabilidade' tem 'Resolver pendências' (Auditoria) e só um link discreto para a importação", () => {
    expect(mesa).toContain("Resolver pendências</Link>");
    expect(mesa).not.toContain("Abrir Central de Documentos");
    expect(mesa).toContain("Importar documentos em lote</Link>");
  });
  it("a Mesa só aponta para /financas/documentos pelo link discreto de importação (nenhum chip nem botão principal)", () => {
    expect(mesa.split('to="/financas/documentos"').length - 1).toBe(1);
  });
  it("a importação aponta de volta para as pendências e oferece 'Ver o que ainda falta' depois de gravar", () => {
    expect(central).toContain("data-voltar-pendencias");
    expect(central).toContain("data-ver-o-que-falta");
    expect(central).toContain("Importar documentos em lote</h1>");
  });
  it("o KPI do ano mora só na importação, com o nome de regularização", () => {
    const card = readFileSync("src/components/financas/CoberturaDocumentalCard.tsx", "utf8");
    expect(card).toContain("Andamento da regularização de {ano}");
    expect(card).toContain("concluído");
    expect(mesa).not.toContain("CoberturaDocumentalCard");
    expect(auditoria).not.toContain("CoberturaDocumentalCard");
  });
});

describe("as abas da Mesa: fichário na bancada, sem numeração (23/10/2026)", () => {
  it("os nomes não levam número: as áreas não são etapas de um fluxo", () => {
    for (const nome of ["Operações", "Gestão", "Cadastros", "Fechamento"]) expect(painel).toContain(`rotulo: "${nome}"`);
    for (const velho of ['["operacoes", "1 Operações"]', '["gestao", "2 Gestão"]', '["cadastros", "3 Cadastros"]', '["fechamento", "4 Fechamento"]']) expect(painel).not.toContain(velho);   // o rótulo da aba (comentários antigos ainda citam os nomes)
  });
  it("cada área tem seu ícone (raio, barras, pastas, visto) e os endereços (#operacoes…) seguem os mesmos", () => {
    for (const icone of ["Zap", "BarChart3", "Folders", "CheckCircle2"]) expect(painel).toContain(`Icone: ${icone}`);
    expect(painel).toContain('h === "operacoes" || h === "gestao" || h === "cadastros" || h === "fechamento"');
  });
  it("a aba ativa fica à frente: cobre a linha de base (-mb-px), da cor da página, com filete terracota no topo; as outras são mais baixas e mais escuras", () => {
    expect(painel).toContain("-mb-px border-t-2 border-t-gold bg-background");
    expect(painel).toContain("bg-muted text-muted-foreground");
  });
  it("é uma lista de abas de verdade para leitor de tela (tablist/tab/aria-selected), nas duas barras", () => {
    expect(painel.split('role="tablist"').length - 1).toBe(2);
    expect(painel).toContain('role="tab" aria-selected={ativa}');
  });
  it("no celular as quatro abas têm a mesma largura, com o ícone sobre o nome", () => {
    expect(painel).toContain("flex-1 flex flex-col items-center");
  });
});
