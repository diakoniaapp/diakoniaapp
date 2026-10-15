import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { QuitacaoDaObrigacao } from "@/services/quitacaoService";
import type { FinLancamentoExtenso } from "@/services/finService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let disponivel = true;
let quitacao: QuitacaoDaObrigacao | null = null;
let papeis: string[] = ["admin"];
let declDisp = false;
let situacao: unknown = null;
let eventosDoBanco: unknown[] = [];
const decidir = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (rs: string[]) => rs.some(r => papeis.includes(r)) }) }));
vi.mock("@/services/quitacaoService", () => ({
  quitacaoDisponivel: async () => disponivel,
  quitacaoDaObrigacao: async () => quitacao,
  carregarParametros: async () => ({ vigencia: null, teto1: 500, prazoDeclaracaoDias: 30, tetoAnualTerceiro: 2000, qtdRelatadasTrimestre: 3, prazoFormalizacaoDias: 30, prazoEsclarecimentoDias: 30, prazoReembolsoDias: 10, limiteCapitalizacao: null }),
  eventosDaQuitacao: async () => eventosDoBanco,
  decidirQuitacao: (...a: unknown[]) => decidir(...a),
  removerQuitacao: async () => undefined,
  dadosDaDespesaParaQuitar: async () => null,
  registrarQuitacao: async () => "x",
  alterarQuitacao: async () => undefined,
  pagarReembolso: async () => "liq1",
  declaracaoDisponivel: async () => declDisp,
  situacaoDaDeclaracao: async () => situacao,
  gerarDeclaracao: async () => "d1",
  registrarAssinaturaDaDeclaracao: async () => undefined,
  lancamentosDaLiquidacao: async () => [],
}));
const conciliar = vi.fn(async (..._a: unknown[]) => undefined);
const desconciliar = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/services/finService", async (orig) => ({ ...(await orig<typeof import("@/services/finService")>()), adicionarAnexo: vi.fn(), conciliarLancamento: (...a: unknown[]) => conciliar(...a), desconciliarLancamento: (...a: unknown[]) => desconciliar(...a) }));
import { QuitacaoCard } from "./QuitacaoCard";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; quitacao = null; declDisp = false; situacao = null; eventosDoBanco = []; disponivel = true; papeis = ["admin"]; decidir.mockClear(); conciliar.mockClear(); desconciliar.mockClear(); });

const lanc = (o: Partial<FinLancamentoExtenso> = {}) => ({ id: "l1", tipo: "saida", status: "previsto", valor: 100, descricao: "Material", ...o }) as unknown as FinLancamentoExtenso;
const q = (o: Partial<QuitacaoDaObrigacao> = {}): QuitacaoDaObrigacao => ({
  quitacaoId: "q1", obrigacaoId: "l1", responsavel: "pessoa", pessoaId: "p1", fornecedorId: null, responsavelNome: "Pr. Patrick", intencao: "reembolso", pagoEm: "2026-10-01", declaradoEm: "2026-10-02",
  condicao: null, pedeRecibo: false, registradoEm: "2026-10-03T10:00:00Z", registradoPor: "u1", grauResponsavel: "formal", grauIntencao: "formal", grauConjunto: "formal", nivelRisco: "alto",
  suficiente: true, exigeAprovacaoDoAdministrador: false, motivoInsuficiencia: null, moduladores: [], aprovacaoDoReembolso: null, aprovacaoDoRelatado: null, resultado: "reembolso_em_analise",
  credorAtual: "em_analise", fila: "aprovar_reembolso", bloqueiaFechamento: false, dataDaDespesa: "2026-10-05", valorDaObrigacao: 100, reembolsado: null, saldoAReembolsar: null, ...o,
});
async function montar(l: FinLancamentoExtenso) {
  alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<QuitacaoCard lancamento={l} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return alvo;
}
const botao = (el: Element, trecho: string) => [...el.querySelectorAll("button")].find(b => b.textContent!.includes(trecho));

describe("o cartão Quitação", () => {
  it("antes da migration não aparece nada (a tela segue igual)", async () => {
    disponivel = false;
    expect((await montar(lanc())).textContent).toBe("");
  });
  it("despesa em aberto sem quitação: oferece registrar quem pagou, e diz que a igreja não paga de novo se um terceiro pagou", async () => {
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Nenhuma quitação registrada/);
    expect(botao(el, "Outra pessoa pagou")).toBeTruthy();
  });
  it("despesa já paga e sem quitação: o cartão some", async () => {
    expect((await montar(lanc({ status: "realizado" }))).textContent).toBe("");
  });
  it("entrada não tem quitação", async () => {
    expect((await montar(lanc({ tipo: "entrada" }))).textContent).toBe("");
  });
  it("reembolso Formal aguardando aprovação: mostra o que o sistema deduziu e deixa o Administrador aprovar — dizendo que aprovar não paga", async () => {
    quitacao = q();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Pr\. Patrick/);
    expect(el.textContent).toMatch(/Reembolso em análise/);
    expect(el.textContent).toMatch(/Fila: Aprovar reembolso/);
    expect(el.textContent).toMatch(/pagamento Formal/);
    const aprovar = botao(el, "Aprovar reembolso");
    expect(aprovar).toBeTruthy();
    await act(async () => { aprovar!.click(); });
    expect(decidir).toHaveBeenCalledWith("q1", "reembolso", "aprovada", undefined);
  });
  it("sem prova suficiente o botão de aprovar fica travado e a tela diz o que falta", async () => {
    quitacao = q({ suficiente: false, grauConjunto: "relatado", grauResponsavel: "relatado", grauIntencao: "relatado", fila: "formalizar", resultado: "a_formalizar", motivoInsuficiencia: "Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro." });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Reembolso só se paga com a prova Formal/);
    expect(botao(el, "Anexar prova do pagamento")).toBeFalsy();   // são <label>, não <button>
    expect(el.textContent).toMatch(/Anexar Pedido de Reembolso/);
  });
  it("acima do teto, quem é só da Tesouraria não aprova: a tela pede o Administrador", async () => {
    papeis = ["tesouraria"];
    quitacao = q({ valorDaObrigacao: 900 });
    const el = await montar(lanc());
    expect(botao(el, "Aprovar reembolso")).toBeFalsy();
    expect(el.textContent).toMatch(/Administrador \(acima do teto\)/);
  });
  it("Não localizado: explica e não pede prova", async () => {
    quitacao = q({ responsavel: "nao_localizado", responsavelNome: null, intencao: "nao_se_aplica", pagoEm: null, declaradoEm: null, grauResponsavel: "nenhum", grauIntencao: "nenhum", grauConjunto: "nenhum", suficiente: false, fila: "investigar", resultado: "sem_quitacao_localizada", credorAtual: "emitente" });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Ninguém sabe quem pagou/);
    expect(el.textContent).toMatch(/Fila: Investigar/);
    expect(el.textContent).not.toMatch(/Anexar/);
  });
  it("reembolso aprovado: diz que a decisão não pagou e some o botão de aprovar", async () => {
    quitacao = q({ aprovacaoDoReembolso: "aprovada", fila: "reembolso_a_pagar", resultado: "divida_com_terceiro", credorAtual: "terceiro" });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Reembolso aprovado\. Aprovar não paga/);
    expect(el.textContent).toMatch(/O terceiro \(dívida da igreja\)/);
    expect(botao(el, "Aprovar reembolso")).toBeFalsy();
  });
  it("reembolso aprovado e a pagar: oferece Pagar reembolso com o saldo, e depois de um pagamento parcial diz quanto já foi e quanto falta", async () => {
    quitacao = q({ aprovacaoDoReembolso: "aprovada", fila: "reembolso_a_pagar", resultado: "divida_com_terceiro", credorAtual: "terceiro", valorDaObrigacao: 600, reembolsado: 200, saldoAReembolsar: 400 });
    const el = await montar(lanc({ status: "realizado", valor: 200 } as never));
    expect(botao(el, "Pagar reembolso")?.textContent).toMatch(/400,00/);
    expect(el.textContent).toMatch(/Reembolsado até agora: .*200,00.* falta .*400,00/);
  });
  it("quem não é do financeiro não vê o botão de pagar o reembolso", async () => {
    papeis = ["membro"];
    quitacao = q({ aprovacaoDoReembolso: "aprovada", fila: "reembolso_a_pagar", resultado: "divida_com_terceiro", credorAtual: "terceiro", saldoAReembolsar: 100, reembolsado: 0 });
    const el = await montar(lanc());
    expect(botao(el, "Pagar reembolso")).toBeFalsy();
  });
});

describe("a oferta já extinta (quitado_terceiro)", () => {
  const oferta = (o: Partial<QuitacaoDaObrigacao> = {}) => q({ intencao: "oferta", resultado: "extinta_como_oferta", credorAtual: "nenhum", fila: null, nivelRisco: "baixo", grauResponsavel: "relatado", grauIntencao: "relatado", grauConjunto: "relatado", ...o });
  it("avisa que a obrigação está extinta, sem caixa, sem banco e sem extrato, e que falta só a conferência", async () => {
    quitacao = oferta();
    const el = await montar(lanc({ status: "quitado_terceiro" } as never));
    expect(el.textContent).toMatch(/Quitada por terceiro/);
    expect(el.textContent).toMatch(/extinta.*sem caixa, sem banco e sem extrato; nenhum saldo mudou/);
    expect(el.textContent).toMatch(/Falta só a conferência/);
  });
  it("Conferir só carimba: chama a conferência (o status não troca) e não oferece Pagar nem aprovar reembolso", async () => {
    quitacao = oferta();
    const el = await montar(lanc({ status: "quitado_terceiro" } as never));
    expect(botao(el, "Aprovar reembolso")).toBeFalsy();
    const b = botao(el, "Conferir");
    expect(b).toBeTruthy();
    await act(async () => { b!.click(); });
    expect(conciliar).toHaveBeenCalledWith("l1");
  });
  it("já conferida: mostra quando e oferece desmarcar", async () => {
    quitacao = oferta();
    const el = await montar(lanc({ status: "quitado_terceiro", conferido_em: "2026-10-18T13:00:00Z" } as never));
    expect(el.textContent).toMatch(/Conferida em 18\/10\/2026/);
    const b = botao(el, "Desmarcar conferência");
    await act(async () => { b!.click(); });
    expect(desconciliar).toHaveBeenCalledWith("l1");
  });
  it("a quitação de uma oferta extinta ainda pode ser corrigida (se não enviada)", async () => {
    quitacao = oferta();
    const el = await montar(lanc({ status: "quitado_terceiro" } as never));
    expect(botao(el, "Corrigir")).toBeTruthy();
    expect(botao(el, "Remover")).toBeTruthy();
  });
  it("auditoria: o cartão mostra quem registrou e quando, com data e hora", async () => {
    quitacao = oferta({ registradoEm: "2026-10-13T17:45:00Z" });
    const el = await montar(lanc({ status: "quitado_terceiro" } as never));
    expect(el.textContent).toMatch(/Registrada por .* em 13\/10\/2026 às 14:45/);
  });
});

describe("a Declaração do Terceiro no cartão (Fase 1D-a)", () => {
  const sit = (estado: string, forma: string | null = "dinheiro") => ({ estado, forma, ultima: estado === "sem_declaracao" ? null : { id: "d1", numero: "DT-2026-0001", versao: 1, codigo: "abc", geradaEm: "2026-10-13T10:00:00Z", assinadaEm: estado === "assinada" ? "2026-10-13" : null, assinadaAnexoId: estado === "assinada" ? "a1" : null, conteudo: {} }, });
  const reembolso = () => q({ aprovacaoDoReembolso: null, fila: "aprovar_reembolso", resultado: "reembolso_em_analise" });

  it("sem a Fase 1D-a no banco o cartão segue como antes: os anexos de declaração e Pedido de Reembolso à mão", async () => {
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Anexar Pedido de Reembolso/);
    expect(el.textContent).not.toMatch(/Declaração do Terceiro/);
  });
  it("com a Declaração gerada pelo sistema, sai o botão do Pedido de Reembolso e entra o bloco da Declaração", async () => {
    declDisp = true; situacao = sit("sem_declaracao");
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).not.toMatch(/Anexar Pedido de Reembolso/);
    expect(el.textContent).toMatch(/Anexar prova do pagamento/);
    expect(el.textContent).toMatch(/Declaração do Terceiro/);
    expect(el.textContent).toMatch(/Ainda não gerada/);
    expect(botao(el, "Gerar Declaração (PDF)")).toBeTruthy();
  });
  it("sem a forma de pagamento do terceiro pede a forma e ainda não oferece gerar", async () => {
    declDisp = true; situacao = sit("sem_declaracao", null);
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Como o terceiro pagou o fornecedor/);
    expect(botao(el, "Gerar Declaração (PDF)")).toBeFalsy();
  });
  it("aguardando assinatura: mostra o número e a versão e oferece registrar a via assinada", async () => {
    declDisp = true; situacao = sit("aguardando_assinatura");
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Aguardando assinatura/);
    expect(el.textContent).toMatch(/DT-2026-0001 · versão 1/);
    expect(botao(el, "Registrar assinatura")).toBeTruthy();
  });
  it("desatualizada: avisa que a via assinada não vale mais e oferece gerar nova via", async () => {
    declDisp = true; situacao = sit("desatualizada");
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Desatualizada/);
    expect(el.textContent).toMatch(/a via assinada não vale mais/);
    expect(botao(el, "Gerar nova via")).toBeTruthy();
  });
  it("assinada: mostra a data e não oferece nova assinatura", async () => {
    declDisp = true; situacao = sit("assinada");
    quitacao = reembolso();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/assinada em 13\/10\/2026/);
    expect(botao(el, "Registrar assinatura")).toBeFalsy();
  });
  it("não aparece para quem não se sabe quem pagou nem para intenção não declarada", async () => {
    declDisp = true; situacao = sit("sem_declaracao");
    quitacao = q({ intencao: "nao_declarada", fila: "a_esclarecer", resultado: "a_esclarecer" });
    const el = await montar(lanc());
    expect(el.textContent).not.toMatch(/Ainda não gerada/);
  });
});

describe("oferta: simples; o alto risco aceita o comprovante OU a aprovação do Administrador (15/10/2026)", () => {
  const MOTIVO_ALTO = "Oferta de alto risco (bem durável, e o limite de capitalização ainda não foi definido): anexe o comprovante do pagamento do terceiro OU peça a aprovação formal do Administrador, com justificativa.";
  const oferta = (o: Partial<QuitacaoDaObrigacao> = {}) => q({ intencao: "oferta", grauResponsavel: "relatado", grauIntencao: "formal", grauConjunto: "formal", nivelRisco: "baixo", suficiente: true, fila: null, resultado: "extinta_como_oferta", credorAtual: "nenhum", ...o });
  const digitar = async (campo: HTMLTextAreaElement, texto: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(campo, texto);
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("oferta formalizada: não pede nem oferece o comprovante do pagamento, e diz que ele não é exigido", async () => {
    quitacao = oferta();
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/pagamento do terceiro: não exigido/);
    expect(el.textContent).not.toMatch(/Anexar prova do pagamento|Anexar comprovante do pagamento/);
    expect(el.textContent).toMatch(/Anexar declaração do terceiro/);
  });
  it("oferta ainda sem a nota: a mensagem manda anexar a nota e a tela não oferece o comprovante", async () => {
    quitacao = oferta({ suficiente: false, nivelRisco: "alto", grauConjunto: "relatado", motivoInsuficiencia: "Oferta ainda não formalizada: anexe a nota fiscal da compra.", fila: "formalizar", resultado: "a_formalizar" });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/anexe a nota fiscal da compra/);
    expect(el.textContent).not.toMatch(/Anexar prova do pagamento|Anexar comprovante do pagamento/);
  });
  it("oferta de alto risco: oferece anexar o comprovante do pagamento do terceiro e a aprovação do Administrador", async () => {
    quitacao = oferta({ suficiente: false, nivelRisco: "alto", grauConjunto: "relatado", exigeAprovacaoDoAdministrador: true, motivoInsuficiencia: MOTIVO_ALTO, fila: "formalizar", resultado: "a_formalizar" });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Anexar comprovante do pagamento do terceiro/);
    expect(botao(el, "Aprovar a oferta (Administrador)")).toBeTruthy();
    expect(el.textContent).toMatch(/pagamento Relatado/);
  });
  it("só o Administrador vê o botão de aprovar a oferta", async () => {
    papeis = ["tesouraria"];
    quitacao = oferta({ suficiente: false, nivelRisco: "alto", grauConjunto: "relatado", exigeAprovacaoDoAdministrador: true, motivoInsuficiencia: MOTIVO_ALTO });
    const el = await montar(lanc());
    expect(botao(el, "Aprovar a oferta")).toBeFalsy();
  });
  it("aprovar exige a justificativa (10 letras): sem ela o botão fica travado; com ela, vai para o banco", async () => {
    quitacao = oferta({ suficiente: false, nivelRisco: "alto", grauConjunto: "relatado", exigeAprovacaoDoAdministrador: true, motivoInsuficiencia: MOTIVO_ALTO });
    const el = await montar(lanc());
    await act(async () => { botao(el, "Aprovar a oferta (Administrador)")!.click(); });
    const campo = document.body.querySelector("textarea") as HTMLTextAreaElement;
    expect(campo).toBeTruthy();
    expect(document.body.textContent).toMatch(/fica registrada na quitação/);
    const confirmar = () => [...document.body.querySelectorAll("button")].find(b => b.textContent === "Aprovar") as HTMLButtonElement;
    expect(confirmar().disabled).toBe(true);
    await digitar(campo, "curta");
    expect(confirmar().disabled).toBe(true);
    await digitar(campo, "Bem durável doado; a diretoria avaliou e aceitou.");
    expect(confirmar().disabled).toBe(false);
    await act(async () => { confirmar().click(); });
    expect(decidir).toHaveBeenCalledWith("q1", "relatado", "aprovada", "Bem durável doado; a diretoria avaliou e aceitou.");
  });
  it("o reembolso continua oferecendo a prova do pagamento e não ganha o caminho do Administrador", async () => {
    quitacao = q({ suficiente: false, grauConjunto: "relatado", grauResponsavel: "relatado", grauIntencao: "formal", nivelRisco: "alto", fila: "formalizar", resultado: "a_formalizar", motivoInsuficiencia: "Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro." });
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/Anexar prova do pagamento/);
    expect(botao(el, "Aprovar a oferta")).toBeFalsy();
    expect(botao(el, "Aprovar o Relatado")).toBeFalsy();
  });
});

describe("a Declaração manda: a decisão que caiu e o histórico da invalidação (Fase 2A)", () => {
  const ev = (id: string, evento: string, em: string, o: Record<string, unknown> = {}) => ({ id, evento, decisao: null, motivo: null, em, por: "u1", porNome: "Pr. Ana", de: null, para: null, ...o });
  const oferta2 = (o: Partial<QuitacaoDaObrigacao> = {}) => q({ intencao: "oferta", grauResponsavel: "relatado", grauIntencao: "relatado", grauConjunto: "relatado", suficiente: false, exigeAprovacaoDoAdministrador: true, fila: "formalizar", resultado: "a_formalizar", ...o });

  it("a aprovação do Administrador que deixou de valer é dita com quem decidiu, quando, e o que fazer", async () => {
    quitacao = oferta2({ aprovacaoDoRelatado: null });
    eventosDoBanco = [ev("1", "registrada", "2026-10-10T10:00:00Z"), ev("2", "aprovacao_relatado", "2026-10-11T10:00:00Z", { decisao: "aprovada" }), ev("3", "declaracao_invalidada", "2026-10-12T10:00:00Z", { para: { campos: ["valor"] } })];
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/aprovação do Administrador dada por Pr\. Ana em 11\/10\/2026/);
    expect(el.textContent).toMatch(/deixou de valer/);
    expect(el.textContent).toMatch(/tomada de novo/);
  });
  it("a aprovação que ainda vale NÃO ganha o aviso", async () => {
    quitacao = oferta2({ aprovacaoDoRelatado: "aprovada", suficiente: true });
    eventosDoBanco = [ev("1", "registrada", "2026-10-10T10:00:00Z"), ev("2", "aprovacao_relatado", "2026-10-11T10:00:00Z", { decisao: "aprovada" })];
    const el = await montar(lanc());
    expect(el.textContent).not.toMatch(/deixou de valer/);
  });
  it("a aprovação de reembolso que caiu também é dita", async () => {
    quitacao = q({ aprovacaoDoReembolso: null });
    eventosDoBanco = [ev("1", "registrada", "2026-10-10T10:00:00Z"), ev("2", "aprovacao_reembolso", "2026-10-11T10:00:00Z", { decisao: "aprovada" }), ev("3", "declaracao_invalidada", "2026-10-12T10:00:00Z", { para: { campos: ["emitente (fornecedor)"] } })];
    const el = await montar(lanc());
    expect(el.textContent).toMatch(/aprovação do reembolso dada por Pr\. Ana/);
  });
  it("o histórico mostra a invalidação, o que mudou, quem e o motivo", async () => {
    quitacao = oferta2();
    eventosDoBanco = [ev("1", "registrada", "2026-10-10T10:00:00Z"), ev("3", "declaracao_invalidada", "2026-10-12T10:00:00Z", { motivo: "nota corrigida pelo fornecedor", para: { campos: ["valor", "número da nota"] } })];
    const el = await montar(lanc());
    await act(async () => { botao(el, "Histórico")!.click(); });
    expect(el.textContent).toMatch(/Declaração invalidada \(os dados mudaram\)/);
    expect(el.textContent).toMatch(/mudou: valor, número da nota/);
    expect(el.textContent).toMatch(/por Pr\. Ana — nota corrigida pelo fornecedor/);
  });
});
