import { describe, expect, it } from "vitest";
import { auditar, causaDoBanco, causaDoSistema, classeDoHistorico, decompor, parear, porDia, primeiroDiaQueDiverge, saldosNoCorte, type ItemBanco, type LinhaBanco, type LinhaSistema } from "./auditoriaExtrato";

const b = (data: string, valor: number, historico = "PIX RECEBIDO REM: FULANO"): LinhaBanco => ({ data, valor, historico });
let n = 0;
const s = (data: string, valor: number, origem = "importado_ofx"): LinhaSistema => ({ id: `s${++n}`, data, valor, origem, status: "conciliado", descricao: "" });

describe("classeDoHistorico", () => {
  it("aplicação, resgate e rendimento do Invest Fácil; o resto é 'outro'", () => {
    expect(classeDoHistorico("APLIC.INVEST FACIL 1067645")).toBe("aplicacao");
    expect(classeDoHistorico("TRANSF PGTO PIX APLIC.INVEST FACIL")).toBe("aplicacao");
    expect(classeDoHistorico("RESGATE INVEST FACIL 2331344")).toBe("resgate");
    expect(classeDoHistorico("RESG.AUTOM.INVEST FACIL* 21026")).toBe("resgate");
    expect(classeDoHistorico("RENTAB.INVEST FACILCRED* 1027249")).toBe("rendimento");
    expect(classeDoHistorico("PIX RECEBIDO REM: FULANO 01/09")).toBe("outro");
  });
});

describe("parear", () => {
  it("mesmo dia e valor: um para um, e duas linhas iguais exigem dois lançamentos", () => {
    const r = parear([b("2026-09-01", 500), b("2026-09-01", 500)], [s("2026-09-01", 500)]);
    expect(r.pares).toHaveLength(1);
    expect(r.soBanco).toHaveLength(1);
    expect(r.soSistema).toHaveLength(0);
  });

  it("mesmo valor em dia diferente (até 5 dias) pareia pelo mais próximo e registra a diferença", () => {
    const r = parear([b("2026-09-18", -360)], [s("2026-09-20", -360, "recorrencia"), s("2026-09-30", -360)]);
    expect(r.pares[0]).toMatchObject({ regra: "data_diferente", dias: 2 });
    expect(r.soSistema.map(x => x.data)).toEqual(["2026-09-30"]);
  });

  it("fora da janela de 5 dias não pareia", () => {
    const r = parear([b("2026-09-01", 100)], [s("2026-09-10", 100)]);
    expect(r.pares).toHaveLength(0);
    expect(r.soBanco).toHaveLength(1);
    expect(r.soSistema).toHaveLength(1);
  });

  it("AGRUPADO: um pagamento do banco lançado em principal + multa (R$ 325,20 = 312,70 + 12,50)", () => {
    const r = parear([b("2026-09-30", -325.2, "PAGTO ELETRONICO TRIBUTO")], [s("2026-09-30", -312.7, "recorrencia"), s("2026-09-30", -12.5, "liquidacao")]);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].regra).toBe("agrupado");
    expect(r.pares[0].sistema).toHaveLength(2);
    expect(r.soBanco).toHaveLength(0);
    expect(r.soSistema).toHaveLength(0);
  });

  it("AGRUPADO inverso: um lançamento do sistema que cobre duas linhas do banco", () => {
    const r = parear([b("2026-09-10", 250), b("2026-09-10", 285)], [s("2026-09-10", 535, "transferencia")]);
    expect(r.pares[0]).toMatchObject({ regra: "agrupado" });
    expect(r.pares[0].banco).toHaveLength(2);
  });

  it("sinais diferentes nunca se agrupam", () => {
    const r = parear([b("2026-09-10", -325.2)], [s("2026-09-10", 312.7), s("2026-09-10", 12.5)]);
    expect(r.pares).toHaveLength(0);
  });
});

describe("parear pela marca do OFX (FITID)", () => {
  it("três PIX de R$ 10 no mesmo dia e só dois lançamentos: a marca diz QUAL linha é a que falta", () => {
    const bs = [{ ...b("2026-09-08", 10, "REM: KAREN"), fitid: "F1" }, { ...b("2026-09-08", 10, "REM: NILZA"), fitid: "F2" }, { ...b("2026-09-08", 10, "REM: GUILHERME"), fitid: "F3" }];
    const ss = [{ ...s("2026-09-08", 10), fitids: ["F3"] }, { ...s("2026-09-08", 10), fitids: ["F1"] }];
    const r = parear(bs, ss);
    expect(r.pares.map(p => p.regra)).toEqual(["fitid", "fitid"]);
    expect(r.soBanco.map(x => x.fitid)).toEqual(["F2"]);        // NILZA é a que falta — não um sorteio
  });
  it("a marca só vale com o MESMO valor; senão cai nas regras de sempre", () => {
    const r = parear([{ ...b("2026-09-08", 10), fitid: "F1" }], [{ ...s("2026-09-08", 12), fitids: ["F1"] }]);
    expect(r.pares).toHaveLength(0);
  });
  it("cada linha e cada lançamento entram UMA vez só (a marca não deixa o mesmo par se repetir na passada do mesmo dia)", () => {
    const bs = [{ ...b("2026-09-08", 10), fitid: "F1" }];
    const ss = [{ ...s("2026-09-08", 10), fitids: ["F1"] }, s("2026-09-08", 10)];
    const r = parear(bs, ss);
    expect(r.pares).toHaveLength(1);
    expect(r.soSistema).toHaveLength(1);
  });
});

describe("causas do que o banco tem e o sistema não", () => {
  const item = (o: Partial<ItemBanco>): ItemBanco => ({ data: "2026-09-10", valor: 20, historico: "PIX RECEBIDO", classe: "outro", ...o });
  it("aplicação/resgate/rendimento são sempre causas próprias — a OFX nem os traz", () => {
    expect(causaDoBanco(item({ classe: "aplicacao", valor: -100 }))).toBe("aplicacao_nao_registrada");
    expect(causaDoBanco(item({ classe: "resgate" }))).toBe("resgate_nao_registrado");
    expect(causaDoBanco(item({ classe: "rendimento" }))).toBe("rendimento_nao_registrado");
  });
  it("outros: depende de o OFX trazer a linha e do que a Mesa fez com ela", () => {
    expect(causaDoBanco(item({}))).toBe("nao_lancada");                                         // sem OFX conferido
    expect(causaDoBanco(item({ noOfx: false }))).toBe("fora_do_ofx");                            // importação de verdade
    expect(causaDoBanco(item({ noOfx: true, mesa: "ja_registrada: já existe lançamento…" }))).toBe("oculta_pela_mesa");
    expect(causaDoBanco(item({ noOfx: true, mesa: "nova" }))).toBe("pendente_na_mesa");
  });
});

describe("decompor — a soma dos componentes TEM de dar a diferença de saldo", () => {
  const banco = [
    b("2026-09-01", 1000), b("2026-09-02", -9.8, "TARIFA BANCARIA"), b("2026-09-03", 500, "RESGATE INVEST FACIL 1"),
    b("2026-09-05", -800, "APLIC.INVEST FACIL 2"), b("2026-09-30", 20),
  ];
  const sistema = [
    s("2026-09-01", 1000), s("2026-09-02", -9.8), s("2026-09-04", -800, "transferencia"),   // aplicação lançada com 1 dia de diferença
    s("2026-09-20", -77, "recorrencia"),                                                        // lançamento sem banco
  ];
  const a = auditar({ banco, sistema, saldoInicialBanco: 1, saldoInicialSistema: 1, anotar: (l) => ({ noOfx: l.valor !== 500, mesa: "nova" }) });

  it("fim de setembro: o resgate e o PIX de R$ 20 faltam no sistema; a recorrência de R$ 77 sobra; a aplicação é só de dia", () => {
    const d = decompor(a, "2026-09-30");
    expect(d.saldoBanco).toBe(1 + 1000 - 9.8 + 500 - 800 + 20);
    expect(d.residuo).toBe(0);
    const v = Object.fromEntries(d.componentes.map(c => [c.chave, c.valor]));
    expect(v.resgate_nao_registrado).toBe(-500);      // o banco tem +500 a mais
    expect(v.pendente_na_mesa).toBe(-20);
    expect(v.recorrencia_sem_banco).toBe(-77);
    expect(d.diferenca).toBe(-597);
    expect(d.componentes.find(c => c.chave === "tempo")).toBeUndefined();   // as duas pontas da aplicação estão antes do corte
  });

  it("corte ENTRE os dois dias de um mesmo movimento aparece como 'tempo', e o resíduo continua zero", () => {
    const cedo = auditar({ banco: [b("2026-09-04", -800)], sistema: [s("2026-09-05", -800)], saldoInicialBanco: 0, saldoInicialSistema: 0 });
    const d = decompor(cedo, "2026-09-04");
    expect(d.diferenca).toBe(800);                    // o banco já debitou, o sistema ainda não
    expect(d.componentes).toHaveLength(1);
    expect(d.componentes[0]).toMatchObject({ chave: "tempo", valor: 800 });
    expect(d.residuo).toBe(0);
    expect(decompor(cedo, "2026-09-05").diferenca).toBe(0);
  });

  it("a diferença do saldo anterior entra como componente", () => {
    const x = auditar({ banco: [b("2026-09-01", 10)], sistema: [s("2026-09-01", 10)], saldoInicialBanco: 1, saldoInicialSistema: 63604.83 });
    const d = decompor(x, "2026-09-30");
    expect(d.componentes[0]).toMatchObject({ chave: "saldo_inicial", valor: 63603.83 });
    expect(d.residuo).toBe(0);
  });

  it("propriedade: com dados embaralhados o resíduo é sempre 0,00 em qualquer corte", () => {
    let semente = 42;
    const aleatorio = () => (semente = (semente * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let rodada = 0; rodada < 25; rodada++) {
      const bs: LinhaBanco[] = [], ss: LinhaSistema[] = [];
      for (let i = 0; i < 30; i++) {
        const data = `2026-09-${String(1 + Math.floor(aleatorio() * 28)).padStart(2, "0")}`;
        const valor = Math.round((aleatorio() - 0.4) * 200000) / 100;
        if (aleatorio() < 0.8) bs.push(b(data, valor, aleatorio() < 0.2 ? "APLIC.INVEST FACIL" : "PIX"));
        if (aleatorio() < 0.8) ss.push(s(aleatorio() < 0.3 ? `2026-09-${String(1 + Math.floor(aleatorio() * 28)).padStart(2, "0")}` : data, valor, ["manual", "recorrencia", "transferencia"][Math.floor(aleatorio() * 3)]));
      }
      bs.forEach((l, i) => { if (aleatorio() < 0.5) l.fitid = "F" + i; });
      ss.forEach((l) => { if (aleatorio() < 0.5) l.fitids = ["F" + Math.floor(aleatorio() * 30)]; });
      const x = auditar({ banco: bs, sistema: ss, saldoInicialBanco: 1, saldoInicialSistema: 1 + Math.round(aleatorio() * 100) / 100 });
      // partição: cada linha do banco e cada lançamento do sistema aparece EXATAMENTE uma vez entre os pares e os "sem par"
      expect(x.pares.reduce((n, p) => n + p.banco.length, 0) + x.soBanco.length).toBe(bs.length);
      expect(x.pares.reduce((n, p) => n + p.sistema.length, 0) + x.soSistema.length).toBe(ss.length);
      for (const corte of ["2026-09-10", "2026-09-20", "2026-09-30"]) expect(decompor(x, corte).residuo).toBe(0);
    }
  });
});

describe("dia a dia", () => {
  it("acha o primeiro dia em que o saldo deixa de bater", () => {
    const x = auditar({
      banco: [b("2026-09-01", 100), b("2026-09-02", 50), b("2026-09-03", 30)],
      sistema: [s("2026-09-01", 100), s("2026-09-03", 30)],
      saldoInicialBanco: 1, saldoInicialSistema: 1,
    });
    expect(primeiroDiaQueDiverge(x)).toBe("2026-09-02");
    const dias = porDia(x);
    expect(dias.map(d => d.acumulada)).toEqual([0, -50, -50]);
    expect(saldosNoCorte(x, "2026-09-03")).toEqual({ banco: 181, sistema: 131 });
  });
  it("sem divergência, devolve null", () => {
    expect(primeiroDiaQueDiverge(auditar({ banco: [b("2026-09-01", 5)], sistema: [s("2026-09-01", 5)], saldoInicialBanco: 0, saldoInicialSistema: 0 }))).toBeNull();
  });
});

describe("duplicatas no sistema", () => {
  it("lançamento sem par que repete o valor de um lançamento já pareado é 'provável duplicata' (manual + importado do mesmo PIX)", () => {
    const bs = [b("2026-10-02", -4138, "PIX ENVIADO DES: CAIO")];
    const ss = [{ ...s("2026-10-02", -4138, "importado_ofx"), id: "oficial" }, { ...s("2026-10-02", -4138, "manual"), id: "digitado" }];
    const x = auditar({ banco: bs, sistema: ss, saldoInicialBanco: 0, saldoInicialSistema: 0 });
    expect(x.soSistema.map(l => l.id)).toEqual(["digitado"]);
    expect(x.duplicatas).toEqual(["digitado"]);
    expect(causaDoSistema(x.soSistema[0], new Set(x.duplicatas))).toBe("duplicata_no_sistema");
    expect(decompor(x, "2026-10-05").componentes.map(c => c.chave)).toEqual(["duplicata_no_sistema"]);
  });
  it("sem outro lançamento igual pareado, é só 'sem banco' (não é duplicata)", () => {
    const x = auditar({ banco: [], sistema: [s("2026-10-02", -77, "manual")], saldoInicialBanco: 0, saldoInicialSistema: 0 });
    expect(x.duplicatas).toEqual([]);
  });
});
