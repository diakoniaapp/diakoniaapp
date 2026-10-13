import { describe, expect, it } from "vitest";
import { cicloDaDespesa, ofxVinculado, ORDEM_DO_CICLO, periodoAprovadoCobre, type EntradaDoCiclo } from "./cicloDaDespesa";

// Verisure, vencimento 05/10/2026, R$ 278,22 — o exemplo dela, do nascimento ao malote
const base: EntradaDoCiclo = {
  tipo: "saida", status: "previsto", data: "2026-10-05", data_pagamento: null, observacoes: null, contaTipo: "banco", ultimoExtratoDaConta: "2026-10-05",
  temCategoria: true, temCentro: true, temDocumento: false, temComprovante: false, dispensaDocumento: false, hoje: "2026-10-01",
};
const ciclo = (o: Partial<EntradaDoCiclo>) => cicloDaDespesa({ ...base, ...o })!;

describe("o ciclo da despesa — Verisure, 05/10, R$ 278,22", () => {
  it("1) a obrigação nasce Prevista; NO DIA do vencimento vira Em Aberto; depois dele continua Em Aberto, só com o indicador de atraso (sem estado novo)", () => {
    expect(ciclo({})).toMatchObject({ estado: "prevista", naFilaOperacional: true });
    expect(ciclo({}).atrasoEmDias).toBeUndefined();
    expect(ciclo({ hoje: "2026-10-04" }).estado).toBe("prevista");                                              // véspera
    expect(ciclo({ hoje: "2026-10-05" })).toMatchObject({ estado: "em_aberto", atrasoEmDias: 0, naFilaOperacional: true });   // no dia
    expect(ciclo({ hoje: "2026-10-05" }).proximoPasso).toMatch(/vence hoje/);
    expect(ciclo({ hoje: "2026-10-06" })).toMatchObject({ estado: "em_aberto", atrasoEmDias: 1 });             // depois: mesmo estado
    expect(ciclo({ hoje: "2026-10-20" })).toMatchObject({ estado: "em_aberto", atrasoEmDias: 15 });
    expect(ciclo({ hoje: "2026-10-20" }).proximoPasso).toBe("Pagar — atrasada há 15 dias.");
    expect(ciclo({ hoje: "2026-10-06" }).proximoPasso).toBe("Pagar — atrasada há 1 dia.");
  });

  it("1b) paga (ou cancelada) não tem indicador de atraso, por mais antigo que seja o vencimento", () => {
    expect(ciclo({ hoje: "2026-12-01", status: "realizado", data_pagamento: "2026-10-05" }).atrasoEmDias).toBeUndefined();
    expect(ciclo({ hoje: "2026-12-01", status: "cancelado" }).atrasoEmDias).toBeUndefined();
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

  it("os oito estados vêm na ordem do ciclo (Atrasada NÃO é estado)", () => {
    expect(ORDEM_DO_CICLO).toEqual(["prevista", "em_aberto", "pagamento_realizado", "aguardando_conciliacao", "conciliada", "pronta_para_malote", "enviada", "arquivada"]);
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
  it("conta sem extrato (caixinha): sem OFX; documento + comprovante + CONFERÊNCIA humana bastam (Q4) — paga sozinha não chega a Pronta", () => {
    const paga = { contaTipo: "caixa", status: "realizado", data_pagamento: "2026-10-03", temDocumento: true, temComprovante: true, ultimoExtratoDaConta: null };
    const naoConferida = ciclo(paga);
    expect(naoConferida.estado).toBe("aguardando_conciliacao");
    expect(naoConferida.proximoPasso).toMatch(/Conferir o pagamento/);
    expect(naoConferida.etapas.find(x => x.chave === "ofx")).toMatchObject({ naoSeAplica: true, feita: true });
    const conferida = ciclo({ ...paga, status: "conciliado" });
    expect(conferida).toMatchObject({ estado: "pronta_para_malote", conferencia: "manual" });
    expect(conferida.etapas.find(x => x.chave === "conciliacao")).toMatchObject({ rotulo: "Conferência", feita: true, detalhe: "Conferida" });
  });
  it("Conciliada ≠ Conferida (D4): em conta com extrato, status 'conciliado' SEM vínculo não concilia — fica esperando o banco", () => {
    const c = ciclo({ status: "conciliado", data_pagamento: "2026-10-05", temDocumento: true, temComprovante: true, ultimoExtratoDaConta: "2026-10-05" });
    expect(c.estado).toBe("aguardando_conciliacao");
    expect(c.conferencia).toBe("manual");
    expect(c.etapas.find(x => x.chave === "conciliacao")).toMatchObject({ feita: false, detalhe: "Conferida (sem vínculo bancário)" });
  });
  it("Conferida (Histórico): o que veio do Omie não tem vínculo e é aceito como está — nunca é chamado de Conciliada", () => {
    const c = ciclo({ status: "conciliado", origem: "importado_omie", data_pagamento: "2026-08-10", temDocumento: true, temComprovante: true });
    expect(c).toMatchObject({ estado: "pronta_para_malote", conferencia: "historico" });
    expect(c.etapas.find(x => x.chave === "conciliacao")).toMatchObject({ feita: true, detalhe: "Conferida (Histórico)" });
    expect(c.etapas.find(x => x.chave === "ofx")).toMatchObject({ feita: true, naoSeAplica: true, detalhe: "histórico anterior ao extrato" });
  });
  it("com vínculo é Conciliada, venha de onde vier", () => {
    expect(ciclo({ status: "conciliado", origem: "importado_omie", observacoes: "[ofx:N5]", temDocumento: true, temComprovante: true }).conferencia).toBe("vinculo");
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

describe("Enviada e Arquivada (D6)", () => {
  const pronta = { status: "conciliado", data_pagamento: "2026-10-05", observacoes: "[ofx:N1]", temDocumento: true, temComprovante: true } as const;
  it("a despesa Pronta que consta de um envio ativo é ENVIADA; com o período aprovado, ARQUIVADA", () => {
    expect(ciclo(pronta).estado).toBe("pronta_para_malote");
    const e = ciclo({ ...pronta, envio: { ano: 2026, mes: 10, periodoAprovado: false } });
    expect(e).toMatchObject({ estado: "enviada", naFilaOperacional: false, pendencias: [] });
    expect(e.proximoPasso).toMatch(/Enviada ao malote de 10\/2026/);
    const a = ciclo({ ...pronta, envio: { ano: 2026, mes: 10, periodoAprovado: true } });
    expect(a.estado).toBe("arquivada");
    expect(a.proximoPasso).toMatch(/Arquivada.*10\/2026/);
  });
  it("NADA regride sozinho depois do envio: sem o comprovante a despesa continua Enviada — e diz o que regularizar", () => {
    const e = ciclo({ ...pronta, temComprovante: false, envio: { ano: 2026, mes: 10, periodoAprovado: false } });
    expect(e.estado).toBe("enviada");
    expect(e.pendencias.join(" ")).toMatch(/comprovante/);
    expect(e.proximoPasso).toMatch(/regularizar depois do envio/);
  });
  it("reaberta (sem envio ativo) volta a ser derivada dos fatos — e sem envio nunca é Enviada", () => {
    expect(ciclo({ ...pronta, envio: null }).estado).toBe("pronta_para_malote");
    expect(ciclo({ ...pronta, temComprovante: false, envio: null }).estado).toBe("conciliada");
  });
  it("só despesa PAGA entra no envio (uma previsão com item órfão continua Prevista/Em Aberto)", () => {
    expect(ciclo({ envio: { ano: 2026, mes: 10, periodoAprovado: true } }).estado).toBe("prevista");
  });
  it("cancelada continua cancelada", () => {
    expect(ciclo({ ...pronta, status: "cancelado", envio: { ano: 2026, mes: 10, periodoAprovado: false } }).estado).toBe("cancelada");
  });
  it("a regra do arquivamento: só período APROVADO que COBRE o mês do envio", () => {
    const f = (status: string, ano_inicio: number, mes_inicio: number, qtd_meses: number) => ({ status, ano_inicio, mes_inicio, qtd_meses });
    expect(periodoAprovadoCobre([f("aprovado", 2026, 10, 1)], 2026, 10)).toBe(true);
    expect(periodoAprovadoCobre([f("fechado", 2026, 10, 1)], 2026, 10)).toBe(false);          // fechado ainda não é aprovado
    expect(periodoAprovadoCobre([f("aprovado", 2026, 7, 3)], 2026, 9)).toBe(true);             // trimestre jul–set cobre setembro
    expect(periodoAprovadoCobre([f("aprovado", 2026, 7, 3)], 2026, 10)).toBe(false);           // ...mas não outubro
    expect(periodoAprovadoCobre([f("aprovado", 2025, 11, 4)], 2026, 2)).toBe(true);            // vira o ano
    expect(periodoAprovadoCobre([], 2026, 10)).toBe(false);
  });
});
