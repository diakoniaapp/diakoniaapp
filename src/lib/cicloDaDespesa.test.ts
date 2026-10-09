import { describe, expect, it } from "vitest";
import { cicloDaDespesa, ofxVinculado, ORDEM_DO_CICLO, type EntradaDoCiclo } from "./cicloDaDespesa";

// Verisure, vencimento 05/10/2026, R$ 278,22 — o exemplo dela, do nascimento ao malote
const base: EntradaDoCiclo = {
  tipo: "saida", status: "previsto", data: "2026-10-05", data_pagamento: null, observacoes: null, contaTipo: "banco", ultimoExtratoDaConta: "2026-10-05",
  temCategoria: true, temCentro: true, temDocumento: false, temComprovante: false, dispensaDocumento: false, hoje: "2026-10-01",
};
const ciclo = (o: Partial<EntradaDoCiclo>) => cicloDaDespesa({ ...base, ...o })!;

describe("o ciclo da despesa — Verisure, 05/10, R$ 278,22", () => {
  it("1) a obrigação nasce Prevista e, vencida, vira Em Aberto — as duas pedem ação na Mesa de Operações", () => {
    expect(ciclo({})).toMatchObject({ estado: "prevista", naFilaOperacional: true });
    expect(ciclo({ hoje: "2026-10-06" })).toMatchObject({ estado: "em_aberto", naFilaOperacional: true });
  });

  it("2) o documento entra na obrigação (a pendência 'anexar documento' some)", () => {
    expect(ciclo({}).pendencias.join(" ")).toMatch(/anexar o documento/);
    expect(ciclo({ temDocumento: true }).pendencias.join(" ")).not.toMatch(/anexar o documento/);
  });

  it("3) Pagar tira a obrigação da fila operacional: Pagamento Realizado enquanto o extrato não chegou", () => {
    const c = ciclo({ status: "realizado", data_pagamento: "2026-10-05", temDocumento: true, ultimoExtratoDaConta: "2026-10-02" });
    expect(c).toMatchObject({ estado: "pagamento_realizado", naFilaOperacional: false });
    expect(c.etapas.find(x => x.chave === "pagamento")).toMatchObject({ feita: true, detalhe: "2026-10-05" });
  });

  it("4) o extrato já cobre o dia e nenhuma linha foi ligada → Aguardando Conciliação (conferir)", () => {
    const c = ciclo({ status: "realizado", data_pagamento: "2026-10-05", temDocumento: true, ultimoExtratoDaConta: "2026-10-05" });
    expect(c.estado).toBe("aguardando_conciliacao");
    expect(c.proximoPasso).toMatch(/Mesa de Conciliação/);
  });

  it("5) o OFX encontra o pagamento: a marca vincula e o status vira Conciliada", () => {
    const c = ciclo({ status: "conciliado", data_pagamento: "2026-10-05", observacoes: "[ofx:N11EAA]", temDocumento: true });
    expect(c.estado).toBe("conciliada");
    expect(c.etapas.find(x => x.chave === "ofx")).toMatchObject({ feita: true, detalhe: "N11EAA" });
    expect(c.pendencias).toEqual(["anexar o comprovante de pagamento"]);
  });

  it("6) comprovante anexado → Pronta para o malote, com tudo no mesmo registro", () => {
    const c = ciclo({ status: "conciliado", data_pagamento: "2026-10-05", observacoes: "[ofx:N11EAA]", temDocumento: true, temComprovante: true });
    expect(c).toMatchObject({ estado: "pronta_para_malote", pendencias: [], naFilaOperacional: false });
    expect(c.etapas.every(x => x.feita)).toBe(true);
  });

  it("os seis estados vêm na ordem do ciclo", () => {
    expect(ORDEM_DO_CICLO).toEqual(["prevista", "em_aberto", "pagamento_realizado", "aguardando_conciliacao", "conciliada", "pronta_para_malote"]);
  });
});

describe("casos de borda", () => {
  it("conciliada mas sem categoria ou sem centro NÃO vai para o malote (a regra de bloqueio do fechamento)", () => {
    const c = ciclo({ status: "conciliado", observacoes: "[ofx:N1]", temDocumento: true, temComprovante: true, temCentro: false });
    expect(c.estado).toBe("conciliada");
    expect(c.pendencias.join(" ")).toMatch(/classificar/);
  });
  it("tarifa bancária: não exige documento nem comprovante (o extrato é o comprovante)", () => {
    const c = ciclo({ status: "conciliado", observacoes: "[ofx:N2]", dispensaDocumento: true });
    expect(c.estado).toBe("pronta_para_malote");
    expect(c.etapas.find(x => x.chave === "documento")).toMatchObject({ feita: true, naoSeAplica: true });
  });
  it("conta sem extrato (caixinha): não há OFX nem conciliação — paga e documentada já segue para o malote", () => {
    const c = ciclo({ contaTipo: "caixa", status: "realizado", data_pagamento: "2026-10-03", temDocumento: true, temComprovante: true, ultimoExtratoDaConta: null });
    expect(c.estado).toBe("pronta_para_malote");
    expect(c.etapas.find(x => x.chave === "ofx")).toMatchObject({ naoSeAplica: true, feita: true });
  });
  it("pagamento sem nenhum extrato importado na conta: continua 'Pagamento realizado', não 'aguardando'", () => {
    expect(ciclo({ status: "realizado", data_pagamento: "2026-10-05", ultimoExtratoDaConta: null }).estado).toBe("pagamento_realizado");
  });
  it("cancelada e entrada: cancelada sai do ciclo; entrada não tem ciclo de despesa", () => {
    expect(ciclo({ status: "cancelado" })).toMatchObject({ estado: "cancelada", naFilaOperacional: false });
    expect(cicloDaDespesa({ ...base, tipo: "entrada" })).toBeNull();
  });
  it("a marca do OFX é lida de dentro da observação", () => {
    expect(ofxVinculado("pago pelo balcão\n[ofx:N1] [transferencia-ofx]")).toBe("N1");
    expect(ofxVinculado("[ofx:PDF:2026-09-02:APLICACAO:A:100.00]")).toBe("PDF:2026-09-02:APLICACAO:A:100.00");
    expect(ofxVinculado(null)).toBeNull();
    expect(ofxVinculado("sem marca")).toBeNull();
  });
});
