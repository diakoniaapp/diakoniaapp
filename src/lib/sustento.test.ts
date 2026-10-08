import { describe, expect, it } from "vitest";
import {
  sugerirCompetencia, sugerirModo, modoVigente, temSaldoPendente, tiposPermitidos, tipoSugerido, podeReceberPagamento, competenciaExiste, situacaoDaCompetencia, resumirBeneficiario, motivoParaNaoDesligar,
  rotuloCompetencia, mesSeguinte, mesAnterior, ROTULO_TIPO, type CompetenciaParaSugestao, type LinhaDaCompetencia,
} from "./sustento";

// uma competência FECHADA com rubricas do RSP (nItens > 0) — o caso do pastor titular
const c = (competencia: string, o: Partial<CompetenciaParaSugestao> = {}): CompetenciaParaSugestao => ({
  competencia, status: "fechada", modo: "avancado", liquidoPrevisto: 13728, saldoAPagar: 0, nItens: 5, ...o,
});

describe("quem usa a conta corrente", () => {
  it("qualquer tipo pode ter rótulo, inclusive funcionário — o tipo não decide comportamento", () => {
    expect(ROTULO_TIPO.funcionario).toBe("Funcionário");
    expect(Object.keys(ROTULO_TIPO)).toEqual(expect.arrayContaining(["pastor_titular", "pastor_missionario", "missionario_sustentado", "bolsa", "pam", "convenio_missionario"]));
  });
});

describe("sugerirCompetencia — a hierarquia que ela definiu", () => {
  it("1. competência com saldo pendente: agosto R$ 3.428 e PIX em 01/09 → agosto", () => {
    const s = sugerirCompetencia("2026-09-01", [c("2026-08-01", { saldoAPagar: 3428 }), c("2026-09-01", { status: "aberta", saldoAPagar: 0 })]);
    expect(s.competencia).toBe("2026-08-01");
    expect(s.motivo).toBe("saldo_pendente");
    expect(s.explicacao).toContain("Agosto/2026");
    expect(s.explicacao).toContain("3.428,00");
  });
  it("com saldo pendente, o dia 20 não decide nada: 25/09 ainda quita agosto", () => {
    const s = sugerirCompetencia("2026-09-25", [c("2026-08-01", { saldoAPagar: 3428 })]);
    expect(s.competencia).toBe("2026-08-01");
  });
  it("escolhe a MAIS ANTIGA entre várias pendentes", () => {
    const s = sugerirCompetencia("2026-10-03", [c("2026-09-01", { saldoAPagar: 100 }), c("2026-07-01", { saldoAPagar: 50 }), c("2026-08-01", { saldoAPagar: 70 })]);
    expect(s.competencia).toBe("2026-07-01");
  });
  it("2. sem pendência, até o dia 20 → competência atual (adiantamento de 09/09 → setembro)", () => {
    const s = sugerirCompetencia("2026-09-09", [c("2026-08-01", { status: "paga", saldoAPagar: -1 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "atual" });
  });
  it("o dia 20 ainda é do mês corrente", () => {
    expect(sugerirCompetencia("2026-08-20", []).competencia).toBe("2026-08-01");
  });
  it("3. sem pendência, depois do dia 20 → próxima (21/08 → setembro; 21/12 → janeiro do ano seguinte)", () => {
    expect(sugerirCompetencia("2026-08-21", []).competencia).toBe("2026-09-01");
    expect(sugerirCompetencia("2026-12-21", []).competencia).toBe("2027-01-01");
    expect(sugerirCompetencia("2026-08-21", []).motivo).toBe("proxima");
  });
  it("a competência aberta com RSP em andamento NÃO é dívida: o adiantamento de 15/09 fica em setembro", () => {
    const s = sugerirCompetencia("2026-09-15", [c("2026-09-01", { status: "aberta", liquidoPrevisto: 0, saldoAPagar: -4000, nItens: 0 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "atual" });
  });
  it("competência de mês futuro não disputa o item 1", () => {
    const s = sugerirCompetencia("2026-09-05", [c("2026-10-01", { saldoAPagar: 999 })]);
    expect(s.competencia).toBe("2026-09-01");
  });
  it("modo simples, só valor previsto: já é pendência mesmo sem fechar (quem recebe um valor fixo por mês)", () => {
    const s = sugerirCompetencia("2026-10-05", [c("2026-09-01", { status: "aberta", modo: "simples", liquidoPrevisto: 2362, saldoAPagar: 2362, nItens: 0 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "saldo_pendente" });
  });
});

describe("temSaldoPendente", () => {
  it("paga, zerada ou com pagamento a maior (−R$ 1,00) não pende", () => {
    expect(temSaldoPendente(c("2026-08-01", { status: "paga", saldoAPagar: 5 }))).toBe(false);
    expect(temSaldoPendente(c("2026-08-01", { saldoAPagar: 0 }))).toBe(false);
    expect(temSaldoPendente(c("2026-08-01", { saldoAPagar: -1 }))).toBe(false);
  });
  it("no modo avançado só pende depois de fechada; no simples, basta haver valor", () => {
    expect(temSaldoPendente(c("2026-09-01", { status: "aberta", saldoAPagar: 5728 }))).toBe(false);
    expect(temSaldoPendente(c("2026-09-01", { status: "fechada", saldoAPagar: 5728 }))).toBe(true);
    expect(temSaldoPendente(c("2026-09-01", { status: "aberta", modo: "simples", nItens: 0, liquidoPrevisto: 2362, saldoAPagar: 2362 }))).toBe(true);
  });
});

const linha = (o: Partial<LinhaDaCompetencia>): LinhaDaCompetencia => ({
  ...c("2026-09-01"), adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, ...o,
});

describe("situacaoDaCompetencia e resumo", () => {
  it("Aberta → Prevista → A pagar → Paga parcialmente → Paga", () => {
    expect(situacaoDaCompetencia(linha({ status: "aberta", adiantamentos: 8000, saldoAPagar: -8000, liquidoPrevisto: 0, nItens: 0 }))).toBe("Aberta");
    expect(situacaoDaCompetencia(linha({ status: "aberta", nItens: 0, liquidoPrevisto: 2362, saldoAPagar: 2362 }))).toBe("Prevista");
    expect(situacaoDaCompetencia(linha({ status: "fechada", adiantamentos: 8000, saldoAPagar: 5728 }))).toBe("A pagar");
    expect(situacaoDaCompetencia(linha({ liquidoPrevisto: 2362, saldoAPagar: 1000, pagamentosSimples: 1362 }))).toBe("Paga parcialmente");
    expect(situacaoDaCompetencia(linha({ status: "fechada", pagamentosFinais: 5000, adiantamentos: 8000, saldoAPagar: 728 }))).toBe("Paga parcialmente");
    expect(situacaoDaCompetencia(linha({ status: "fechada", saldoAPagar: -1 }))).toBe("Paga");
    expect(situacaoDaCompetencia(linha({ status: "paga", liquidoPrevisto: 2362, saldoAPagar: 0, pagamentosSimples: 2362 }))).toBe("Paga");
  });
  it("adiantamento não conta como pagamento parcial do líquido", () => {
    expect(situacaoDaCompetencia(linha({ status: "fechada", adiantamentos: 8000, saldoAPagar: 5728 }))).not.toBe("Paga parcialmente");
  });
  it("o resumo soma só o que pende e separa o adiantado em competência aberta", () => {
    const r = resumirBeneficiario([
      linha({ competencia: "2026-09-01", status: "fechada", saldoAPagar: 5728.1, adiantamentos: 8000 }),
      linha({ competencia: "2026-08-01", status: "paga", saldoAPagar: -1 }),
      linha({ competencia: "2026-10-01", status: "aberta", adiantamentos: 4000, saldoAPagar: -4000, liquidoPrevisto: 0, nItens: 0 }),
    ]);
    expect(r.saldoPendente).toBe(5728.1);
    expect(r.pendentes).toEqual(["2026-09-01"]);
    expect(r.adiantadoEmAberto).toBe(4000);
  });
});

const hist = (competencia: string, o: Partial<LinhaDaCompetencia> = {}) => ({
  competencia, adiantamentos: 0, nItens: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, ...o,
});

describe("sugerirModo — o Automático olha o histórico", () => {
  it("adiantamentos regulares viram Avançado, qualquer que seja o tipo (pastor missionário que passa a receber adiantamento)", () => {
    const r = sugerirModo("pastor_missionario", [hist("2026-08-01", { adiantamentos: 1000 }), hist("2026-09-01", { adiantamentos: 1000 })]);
    expect(r.modo).toBe("avancado");
    expect(r.motivo).toContain("2 das últimas 2");
  });
  it("RSP com rubricas também conta como uso regular", () => {
    expect(sugerirModo("funcionario", [hist("2026-08-01", { nItens: 4 }), hist("2026-09-01", { nItens: 4 })]).modo).toBe("avancado");
  });
  it("só pagamentos do líquido, sem adiantamento nem rubricas → Simples, mesmo sendo o pastor titular", () => {
    const r = sugerirModo("pastor_titular", [hist("2026-08-01", { pagamentosSimples: 2362 }), hist("2026-09-01", { pagamentosSimples: 2362 })]);
    expect(r.modo).toBe("simples");
  });
  it("um adiantamento isolado entre vários meses simples não vira Avançado", () => {
    const r = sugerirModo("pam", [hist("2026-07-01", { pagamentosSimples: 500 }), hist("2026-08-01", { pagamentosSimples: 500 }), hist("2026-09-01", { adiantamentos: 100 })]);
    expect(r.modo).toBe("simples");
  });
  it("só as 3 competências mais recentes com movimento contam", () => {
    const r = sugerirModo("pam", [
      hist("2026-03-01", { adiantamentos: 100 }), hist("2026-04-01", { adiantamentos: 100 }),
      hist("2026-07-01", { pagamentosSimples: 500 }), hist("2026-08-01", { pagamentosSimples: 500 }), hist("2026-09-01", { pagamentosSimples: 500 }),
    ]);
    expect(r.modo).toBe("simples");
  });
  it("sem histórico (menos de 2 competências com movimento), o rótulo do tipo é só o ponto de partida", () => {
    expect(sugerirModo("pastor_titular", []).modo).toBe("avancado");
    expect(sugerirModo("pastor_missionario", []).modo).toBe("simples");
    expect(sugerirModo("missionario_sustentado", [hist("2026-09-01", { pagamentosSimples: 2362 })]).modo).toBe("simples");
    expect(sugerirModo("pam", []).modo).toBe("simples");
    expect(sugerirModo("convenio_missionario", []).modo).toBe("simples");
  });
  it("competência sem movimento nenhum não entra na leitura", () => {
    expect(sugerirModo("pastor_missionario", [hist("2026-09-01"), hist("2026-08-01")]).motivo).toContain("ainda sem histórico");
  });
});

describe("modoVigente — a escolha da igreja vence o Automático", () => {
  const regular = [hist("2026-08-01", { adiantamentos: 1 }), hist("2026-09-01", { adiantamentos: 1 })];
  it("Automático segue o histórico e diz que é automático", () => {
    expect(modoVigente("automatico", "pam", regular)).toMatchObject({ modo: "avancado", automatico: true });
  });
  it("Simples e Avançado fixos ignoram o histórico e o tipo", () => {
    expect(modoVigente("simples", "pastor_titular", regular)).toMatchObject({ modo: "simples", automatico: false });
    expect(modoVigente("avancado", "pam", [])).toMatchObject({ modo: "avancado", automatico: false });
  });
});

describe("desligar o controle", () => {
  it("é bloqueado com saldo a pagar, e a mensagem diz quanto e onde", () => {
    const m = motivoParaNaoDesligar([linha({ competencia: "2026-09-01", status: "fechada", saldoAPagar: 5728 })]);
    expect(m).toContain("5.728,00");
    expect(m).toContain("setembro/2026");
  });
  it("é livre quando nada é devido, ou quando não há competência", () => {
    expect(motivoParaNaoDesligar([linha({ status: "paga", saldoAPagar: -1 })])).toBeNull();
    expect(motivoParaNaoDesligar([])).toBeNull();
  });
});

describe("datas", () => {
  it("rótulo e mês seguinte", () => {
    expect(rotuloCompetencia("2026-09-01")).toBe("setembro/2026");
    expect(mesSeguinte("2026-12-15")).toBe("2027-01-01");
    expect(mesSeguinte("2026-01-31")).toBe("2026-02-01");
    expect(mesAnterior("2026-08-03")).toBe("2026-07-01");
    expect(mesAnterior("2026-01-15")).toBe("2025-12-01");
  });
});

describe("ligar pagamentos — Fase 2", () => {
  it("o modo decide os tipos: simples só 'pagamento'; avançado distingue adiantamento, final e complemento", () => {
    expect(tiposPermitidos("simples")).toEqual(["pagamento"]);
    expect(tiposPermitidos("avancado")).toEqual(["adiantamento", "pagamento_final", "complemento"]);
  });
  it("tipo sugerido: antes do RSP fechar é adiantamento; depois, pagamento final; simples, pagamento", () => {
    expect(tipoSugerido({ modo: "avancado", status: "aberta" })).toBe("adiantamento");
    expect(tipoSugerido({ modo: "avancado", status: "fechada" })).toBe("pagamento_final");
    expect(tipoSugerido({ modo: "simples", status: "aberta" })).toBe("pagamento");
    expect(tipoSugerido({ modo: "simples", status: "fechada" })).toBe("pagamento");
  });
  it("competência paga não recebe pagamento; a sugerida pode não existir ainda", () => {
    expect(podeReceberPagamento({ status: "paga" })).toBe(false);
    expect(podeReceberPagamento({ status: "fechada" })).toBe(true);
    expect(podeReceberPagamento({ status: "aberta" })).toBe(true);
    expect(competenciaExiste("2026-10-01", [{ competencia: "2026-09-01" }])).toBe(false);
    expect(competenciaExiste("2026-09-01", [{ competencia: "2026-09-01" }])).toBe(true);
  });
});
