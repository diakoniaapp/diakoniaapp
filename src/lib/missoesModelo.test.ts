import { describe, expect, it } from "vitest";
import {
  campanhaAberta, campanhaDoLancamento, campanhaSugeridaPorFornecedor, classeDoCentro, enviosDoPeriodo,
  fundoComAjustes, ofertasSemClassificacao, resumoDasCampanhas, resumoPermanentes, sugerirCampanhasPorCiclo,
  type LancamentoDeMissoes,
} from "./missoesModelo";

let n = 0;
const l = (data: string, valor: number, extra: Partial<LancamentoDeMissoes> = {}): LancamentoDeMissoes =>
  ({ id: `m${++n}`, data, valor, status: "conciliado", ...extra });

describe("classeDoCentro", () => {
  it("reconhece os subcentros novos e os 4 antigos", () => {
    expect(classeDoCentro("Evangelismo e Missões · Sustento Missionário")).toBe("sustento");
    expect(classeDoCentro("Evangelismo e Missões · Pastor Missionário")).toBe("sustento");
    expect(classeDoCentro("Evangelismo e Missões · Ofertas Missionárias")).toBe("sustento");
    expect(classeDoCentro("Evangelismo e Missões · Envios Missionários")).toBe("envios");
    expect(classeDoCentro("Evangelismo e Missões · Missões Mundiais")).toBe("envios");
    expect(classeDoCentro("Evangelismo e Missões · Missões Nacionais")).toBe("envios");
    expect(classeDoCentro("Evangelismo e Missões · Mobilização Missionária")).toBe("mobilizacao");
  });
  it("não confunde o centro-pai nem outros ministérios", () => {
    expect(classeDoCentro("Min. Evangelismo e Missões")).toBeNull();
    expect(classeDoCentro("Min. Educação Cristã")).toBeNull();
    expect(classeDoCentro(null)).toBeNull();
  });
});

describe("campanha do lançamento — a Junta de destino manda, não o centro", () => {
  it("o campo preenchido vence", () => {
    expect(campanhaDoLancamento(l("2025-02-27", 5000, { campanha_missionaria: "nacionais", fornecedor_nome: "Junta de Missoes Mundiais da Conv" }))).toBe("nacionais");
  });
  it("sem o campo, o fornecedor decide — mesmo com centro/descrição trocados (caso real: 783,58 pago à JMM, centro 'Nacionais')", () => {
    expect(campanhaDoLancamento(l("2025-09-19", 783.58, { fornecedor_nome: "Junta de Missoes Mundiais da Conv Batista Brasileira", centro_nome: "Evangelismo e Missões · Missões Nacionais" }))).toBe("mundiais");
    expect(campanhaDoLancamento(l("2025-02-27", 5000, { fornecedor_nome: "Junta de Missoes Nacionais da Conv Batista Brasileira", centro_nome: "Evangelismo e Missões · Missões Mundiais" }))).toBe("nacionais");
  });
  it("sem campo e sem Junta conhecida: nenhuma", () => {
    expect(campanhaDoLancamento(l("2025-01-01", 10))).toBeNull();
    expect(campanhaSugeridaPorFornecedor("Loja X")).toBeNull();
  });
});

describe("fundo registrado × ajustado", () => {
  const entradas = [l("2025-01-01", 145947.09)];
  const envios = [l("2025-06-01", 162554.89)];
  const ajuste = { id: "a", valor: 12032.69, ativo: true, descricao: "Primeiro ciclo de 2024", data_referencia: "2024-08-27" };

  it("o registrado é só o banco; o ajustado soma os ajustes ativos", () => {
    const f = fundoComAjustes(entradas, envios, [ajuste]);
    expect(f.saldo).toBe(-16607.8);
    expect(f.ajustes).toBe(12032.69);
    expect(f.saldoAjustado).toBe(-4575.11);
  });
  it("ajuste desativado não conta; sem ajuste o ajustado é igual ao registrado", () => {
    expect(fundoComAjustes(entradas, envios, [{ ...ajuste, ativo: false }]).saldoAjustado).toBe(-16607.8);
    expect(fundoComAjustes(entradas, envios, []).saldoAjustado).toBe(-16607.8);
  });
  it("sem a NF de R$ 337 no Envio Oficial: registrado −16.270,80 e ajustado −4.238,11", () => {
    const f = fundoComAjustes(entradas, [l("2025-06-01", 162217.89)], [ajuste]);
    expect(f.saldo).toBe(-16270.8);
    expect(f.saldoAjustado).toBe(-4238.11);
  });
});

describe("Envio Oficial × Esforço Total", () => {
  it("196.219,14 = 162.554,89 + 8.850,00 + 24.814,25", () => {
    const e = enviosDoPeriodo([l("2025-06-01", 162554.89)], [l("2025-01-01", 8850), l("2025-01-02", 24814.25)], []);
    expect(e).toEqual({ oficial: 162554.89, sustento: 33664.25, mobilizacao: 0, esforcoTotal: 196219.14 });
  });
  it("mobilização entra no esforço total (decisão dela); previsto não conta", () => {
    const e = enviosDoPeriodo([], [], [l("2026-10-01", 500), l("2026-10-02", 900, { status: "previsto" })]);
    expect(e.esforcoTotal).toBe(500);
  });
  it("um lançamento nunca conta duas vezes (o Envio Oficial manda)", () => {
    const dupl = l("2025-06-01", 100);
    expect(enviosDoPeriodo([dupl], [dupl], []).esforcoTotal).toBe(100);
  });
  it("respeita o período", () => {
    const e = enviosDoPeriodo([l("2025-06-01", 10), l("2026-06-01", 20)], [], [], "2026-01-01", "2026-12-31");
    expect(e.oficial).toBe(20);
  });
});

describe("missões permanentes", () => {
  const sust = [
    l("2026-05-05", 2763, { categoria_nome: "Prebenda", pessoa_id: "pastor" }),
    l("2026-06-05", 2362, { categoria_nome: "Prebenda", pessoa_id: "pastor" }),
    l("2026-06-10", 300, { categoria_nome: "Doações e Contribuições", fornecedor_id: "jmn" }),
    l("2024-01-12", 300, { categoria_nome: "Doações e Contribuições", fornecedor_id: "jmn-antigo" }),
  ];
  it("pastor × parcerias × total no período, e os favorecidos dos últimos 12 meses", () => {
    const r = resumoPermanentes(sust, "2026-05-01", "2026-06-30", null);
    expect(r.pastor).toBe(5125);
    expect(r.parcerias).toBe(300);
    expect(r.total).toBe(5425);
    expect(r.sustentados).toBe(2);              // pastor + JMN; o de 2024 saiu da janela de 12 meses
  });
  it("compromisso mensal: soma das recorrências ativas; sem nenhuma, null (não inventa média)", () => {
    expect(resumoPermanentes(sust, "2026-05-01", "2026-06-30", []).compromissoMensal).toBeNull();
    expect(resumoPermanentes(sust, "2026-05-01", "2026-06-30", [{ valor: 300 }, { valor: "2362.00" }]).compromissoMensal).toBe(2662);
  });
});

// Ciclos reais (docs/INDICADORES_MISSIONARIOS_VALIDACAO_JMM.md): 5 remessas ≥ R$ 20.000 fecham o ciclo.
const REMESSAS: LancamentoDeMissoes[] = [
  l("2024-07-12", 10327.58, { campanha_missionaria: "nacionais" }),
  l("2024-07-12", 1551.32, { campanha_missionaria: "mundiais" }),
  l("2024-08-27", 25955.2, { campanha_missionaria: "mundiais" }),
  l("2024-12-19", 4050, { campanha_missionaria: "nacionais" }),
  l("2024-12-30", 20000, { campanha_missionaria: "nacionais" }),
  l("2025-02-27", 5000, { campanha_missionaria: "nacionais" }),
  l("2025-05-27", 4493.56, { campanha_missionaria: "nacionais" }),
  l("2025-07-22", 34216.42, { campanha_missionaria: "mundiais" }),
  l("2025-09-19", 783.58, { campanha_missionaria: "mundiais" }),
  l("2025-12-10", 1000, { campanha_missionaria: "especial" }),
  l("2025-12-29", 28180, { campanha_missionaria: "nacionais" }),
  l("2026-07-07", 26660.23, { campanha_missionaria: "mundiais" }),
];
const OFERTAS: LancamentoDeMissoes[] = [
  l("2024-03-01", 25009.41), l("2024-08-01", 792),
  l("2024-11-01", 29494.52), l("2024-12-25", 69.1),
  l("2025-01-20", 497.59), l("2025-04-01", 5160.73), l("2025-06-20", 22890.57), l("2025-07-15", 1170),
  l("2025-08-15", 445.92), l("2025-11-20", 27599.05), l("2025-12-20", 191),
  l("2026-03-01", 28587.1), l("2026-08-01", 4040.1),
];

describe("sugestão de campanha por ciclo", () => {
  const grupos = sugerirCampanhasPorCiclo(OFERTAS, REMESSAS);
  const total = (chave: string) => grupos.find(g => g.chave === chave)?.total;

  it("os 6 ciclos batem com os totais da validação", () => {
    expect(grupos).toHaveLength(6);
    expect(total("mundiais@2024-08-27")).toBe(25801.41);
    expect(total("nacionais@2024-12-30")).toBe(29563.62);
    expect(total("mundiais@2025-07-22")).toBe(29718.89);
    expect(total("nacionais@2025-12-29")).toBe(28235.97);
    expect(total("mundiais@2026-07-07")).toBe(28587.1);
  });
  it("o ciclo aberto depois da última remessa é a campanha oposta (Mundiais fechou → Nacionais)", () => {
    const aberto = grupos.find(g => g.fechaEm === null)!;
    expect(aberto.campanha).toBe("nacionais");
    expect(aberto.total).toBe(4040.1);
    expect(campanhaAberta(REMESSAS)).toBe("nacionais");
  });
  it("só sugere para o que está sem campanha, e nunca inclui o mesmo id duas vezes", () => {
    const comUma = [{ ...OFERTAS[0], campanha_missionaria: "especial" }, ...OFERTAS.slice(1)];
    const g = sugerirCampanhasPorCiclo(comUma, REMESSAS);
    expect(g.flatMap(x => x.ids)).not.toContain(OFERTAS[0].id);
    expect(new Set(g.flatMap(x => x.ids)).size).toBe(g.flatMap(x => x.ids).length);
  });
  it("sem nenhuma remessa fechadora: não sugere nada", () => {
    expect(sugerirCampanhasPorCiclo(OFERTAS, [l("2025-02-27", 5000, { campanha_missionaria: "nacionais" })])).toEqual([]);
    expect(campanhaAberta([])).toBeNull();
  });
  it("oferta no mesmo dia da remessa pertence a esse ciclo", () => {
    const g = sugerirCampanhasPorCiclo([l("2024-08-27", 10)], REMESSAS);
    expect(g[0].chave).toBe("mundiais@2024-08-27");
  });
});

describe("campanhas: meta, arrecadado e percentual (o exemplo dela)", () => {
  const classificadas = [
    ...OFERTAS.slice(-2).map((o, i) => ({ ...o, campanha_missionaria: i === 0 ? "mundiais" : "nacionais" })),
  ];
  const metas = [{ campanha: "mundiais", ano: 2026, valor: 30000 }, { campanha: "nacionais", ano: 2026, valor: "20000.00" }];

  it("Mundiais 28.587,10 de 30.000 = 95,3%; Nacionais 4.040,10 de 20.000 = 20,2%", () => {
    const r = resumoDasCampanhas(classificadas, REMESSAS, metas, 2026);
    expect(r[0]).toMatchObject({ campanha: "mundiais", meta: 30000, arrecadado: 28587.1, percentual: 95.3, enviado: 26660.23 });
    expect(r[1]).toMatchObject({ campanha: "nacionais", meta: 20000, arrecadado: 4040.1, percentual: 20.2, enviado: 0 });
  });
  it("o ano vem da data: 2025 não mistura com 2026; sem meta o percentual é null", () => {
    const r = resumoDasCampanhas(classificadas, REMESSAS, metas, 2025);
    expect(r[0].arrecadado).toBe(0);
    expect(r[0].enviado).toBe(34216.42 + 783.58 + 0);       // 35.000,00 exatos em 2025 (confere com a Junta)
    expect(r[0].percentual).toBeNull();
  });
  it("campanha avulsa tem linha própria", () => {
    const r = resumoDasCampanhas([], REMESSAS, [], 2025);
    expect(r[2]).toMatchObject({ campanha: "especial", enviado: 1000 });
  });
});

describe("ofertas sem classificação", () => {
  it("conta o que está sem campanha e, à parte, o que está sem centro", () => {
    const e = [
      l("2025-01-01", 100), l("2025-01-02", 50, { centro_custo_id: "c1" }),
      l("2025-01-03", 70, { campanha_missionaria: "mundiais" }), l("2025-01-04", 999, { status: "previsto" }),
    ];
    expect(ofertasSemClassificacao(e)).toEqual({ quantidade: 2, total: 150, semCentro: 1, totalSemCentro: 100 });
  });
});
