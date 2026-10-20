import { describe, expect, it } from "vitest";
import {
  NATUREZA_DA_ACAO, ROTULO_DA_ACAO, itemDeDebito, itemDeQuitacao, itemDeVencimento, montarFilaDoDia, resumirFila, type QuitacaoDaFila,
} from "./filaDoDia";

const hoje = "2026-10-20";
const venc = (id: string, dias: number, o: Record<string, unknown> = {}) => ({ id, valor: 100, dias_para_vencer: dias, data: "2026-10-20", forma_liquidacao: "manual", tipo: "saida", ...o });
const deb = (id: string, data: string, status = "previsto") => ({ id, data, valor: 50, status });
const quit = (id: string, fila: QuitacaoDaFila["fila"], o: Partial<QuitacaoDaFila> = {}): QuitacaoDaFila => ({
  quitacaoId: "q-" + id, obrigacaoId: id, fila, valorDaObrigacao: 200, dataDaDespesa: "2026-10-01", idadeEmDias: 19, ...o,
});

describe("vocabulário único: a ação em verbo", () => {
  it("toda ação tem rótulo e natureza (para a cor)", () => {
    for (const a of Object.keys(ROTULO_DA_ACAO) as (keyof typeof ROTULO_DA_ACAO)[]) {
      expect(ROTULO_DA_ACAO[a].length).toBeGreaterThan(2);
      expect(NATUREZA_DA_ACAO[a]).toBeTruthy();
    }
    expect(ROTULO_DA_ACAO.pagar).toBe("Pagar");
    expect(ROTULO_DA_ACAO.debito_falhou).toBe("Possível falha no débito");
  });
});

describe("contas a pagar", () => {
  it("atrasada = agora; vence hoje = hoje; até 7 dias = em breve; além disso fica fora (o calendário mostra)", () => {
    expect(itemDeVencimento(venc("a", -3))).toMatchObject({ acao: "pagar", urgencia: 0, porque: "atrasada há 3 dias" });
    expect(itemDeVencimento(venc("b", 0))).toMatchObject({ urgencia: 1, porque: "vence hoje" });
    expect(itemDeVencimento(venc("c", 1))).toMatchObject({ urgencia: 2, porque: "vence amanhã" });
    expect(itemDeVencimento(venc("d", 7))).toMatchObject({ urgencia: 2, porque: "vence em 7 dias" });
    expect(itemDeVencimento(venc("e", 8))).toBeNull();
  });
  it("débito automático não é conta a pagar; entrada não entra", () => {
    expect(itemDeVencimento(venc("a", -1, { forma_liquidacao: "debito_automatico" }))).toBeNull();
    expect(itemDeVencimento(venc("a", -1, { forma_liquidacao: "pix_recorrente" }))).toBeNull();
    expect(itemDeVencimento(venc("a", -1, { tipo: "entrada" }))).toBeNull();
  });
});

describe("débitos automáticos", () => {
  it("🔴 possível falha = agora; 🟡 aguardando = hoje; 🔵 hoje = hoje (só acompanhar); futuro e confirmado ficam fora", () => {
    expect(itemDeDebito(deb("a", "2026-10-10"), hoje)).toMatchObject({ acao: "debito_falhou", urgencia: 0 });
    expect(itemDeDebito(deb("b", "2026-10-19"), hoje)).toMatchObject({ acao: "conferir_debito", urgencia: 1, porque: "venceu e o banco ainda não confirmou" });
    expect(itemDeDebito(deb("c", "2026-10-20"), hoje)).toMatchObject({ acao: "debito_hoje", urgencia: 1 });
    expect(itemDeDebito(deb("d", "2026-10-25"), hoje)).toBeNull();
    expect(itemDeDebito(deb("e", "2026-10-10", "conciliado"), hoje)).toBeNull();
    expect(itemDeDebito(deb("f", "2026-10-10", "cancelado"), hoje)).toBeNull();
  });
});

describe("quitações (Política de Compras por Terceiros)", () => {
  it("cada fila vira um verbo", () => {
    expect(itemDeQuitacao(quit("a", "investigar"))!.acao).toBe("investigar");
    expect(itemDeQuitacao(quit("a", "a_esclarecer"))!.acao).toBe("esclarecer");
    expect(itemDeQuitacao(quit("a", "formalizar"))!.acao).toBe("formalizar");
    expect(itemDeQuitacao(quit("a", "aprovar_reembolso"))!.acao).toBe("aprovar_reembolso");
    expect(itemDeQuitacao(quit("a", "reembolso_a_pagar"))!.acao).toBe("pagar_reembolso");
    expect(itemDeQuitacao(quit("a", null))).toBeNull();
  });
  it("o prazo manda na urgência: vencido = agora; vence em 7 dias = hoje", () => {
    expect(itemDeQuitacao(quit("a", "formalizar"), { quitacaoId: "q-a", situacao: "vencido", diasRestantes: -2 })).toMatchObject({ urgencia: 0, porque: "prazo vencido há 2 dias" });
    expect(itemDeQuitacao(quit("a", "formalizar"), { quitacaoId: "q-a", situacao: "vence_em_7_dias", diasRestantes: 0 })).toMatchObject({ urgencia: 1, porque: "o prazo vence hoje" });
    expect(itemDeQuitacao(quit("a", "formalizar"), { quitacaoId: "q-a", situacao: "vence_em_7_dias", diasRestantes: 3 })!.porque).toBe("o prazo vence em 3 dias");
  });
  it("sem prazo: o que bloqueia o fechamento e o reembolso aprovado são 'hoje'; o resto, 'em breve'", () => {
    expect(itemDeQuitacao(quit("a", "a_esclarecer", { bloqueiaFechamento: true }))).toMatchObject({ urgencia: 1, porque: "impede o fechamento do mês" });
    expect(itemDeQuitacao(quit("a", "reembolso_a_pagar"))).toMatchObject({ urgencia: 1, porque: "a igreja deve este reembolso" });
    expect(itemDeQuitacao(quit("a", "investigar"))).toMatchObject({ urgencia: 2, porque: "há 19 dias sem resposta" });
  });
  it("o valor do reembolso a pagar é o SALDO, não o da nota", () => {
    expect(itemDeQuitacao(quit("a", "reembolso_a_pagar", { saldoAReembolsar: 80 }))!.valor).toBe(80);
    expect(itemDeQuitacao(quit("a", "formalizar", { saldoAReembolsar: 80 }))!.valor).toBe(200);
  });
});

describe("a fila única", () => {
  const fila = () => montarFilaDoDia({
    hoje,
    vencimentos: [venc("atrasada", -5, { data: "2026-10-15" }), venc("hoje", 0), venc("amanha", 1, { data: "2026-10-21" }), venc("longe", 20), venc("auto", -2, { forma_liquidacao: "debito_automatico" }), venc("terc", -1)],
    debitos: [deb("falha", "2026-10-10"), deb("aguarda", "2026-10-19"), deb("hojed", "2026-10-20"), deb("futuro", "2026-10-30")],
    quitacoes: [quit("terc", "a_esclarecer"), quit("reemb", "reembolso_a_pagar", { saldoAReembolsar: 90 }), quit("inv", "investigar")],
    prazos: [{ quitacaoId: "q-inv", situacao: "vencido", diasRestantes: -4 }],
  });

  it("junta as três origens, numa ordem só: agora → hoje → em breve", () => {
    const f = fila();
    expect(f.map(i => i.urgencia)).toEqual([...f.map(i => i.urgencia)].sort());
    expect(f.filter(i => i.urgencia === 0).map(i => i.chave)).toEqual(["debito:falha", "pagar:atrasada", "quitacao:q-inv"]);
    expect(f.filter(i => i.urgencia === 1).map(i => i.chave)).toEqual(["pagar:hoje", "quitacao:q-reemb", "debito:aguarda", "debito:hojed"]);
    expect(f.filter(i => i.urgencia === 2).map(i => i.chave)).toEqual(["pagar:amanha", "quitacao:q-terc"]);
  });

  it("uma obrigação aparece UMA vez: a que tem Quitação sai das contas a pagar (a igreja não paga ao fornecedor)", () => {
    const f = fila();
    expect(f.filter(i => i.obrigacaoId === "terc")).toHaveLength(1);
    expect(f.find(i => i.obrigacaoId === "terc")!.origem).toBe("quitacao");
  });

  it("não entram: conta além de 7 dias, débito automático em 'a pagar', débito futuro", () => {
    const chaves = fila().map(i => i.chave);
    expect(chaves).not.toContain("pagar:longe");
    expect(chaves).not.toContain("pagar:auto");
    expect(chaves).not.toContain("debito:futuro");
  });

  it("o resumo conta por urgência e por ação; o valor não soma o débito que só se acompanha", () => {
    const r = resumirFila(fila());
    expect(r.total).toBe(9);
    expect(r.porUrgencia).toEqual({ 0: 3, 1: 4, 2: 2 });
    expect(r.porAcao.pagar).toBe(3);
    expect(r.porAcao.debito_hoje).toBe(1);
    expect(r.valor).toBe(100 + 100 + 100 + 50 + 50 + 200 + 90 + 200);   // pagar×3 (300) + falha 50 + aguarda 50 + terc 200 + reemb 90 + inv 200 = 890
  });

  it("fila vazia", () => {
    expect(montarFilaDoDia({ hoje, vencimentos: [], debitos: [], quitacoes: [], prazos: [] })).toEqual([]);
    expect(resumirFila([])).toMatchObject({ total: 0, valor: 0 });
  });
});
