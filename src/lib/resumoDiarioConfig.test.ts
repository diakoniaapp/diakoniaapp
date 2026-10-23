import { describe, expect, it } from "vitest";
import { alternarDia, descreverAgenda, houveMudancaNoDiario, problemasDoDiario, proximoEnvio, quandoFoi, rotuloDaJanela } from "./resumoDiarioConfig";
import type { ResumoDiarioConfig } from "@/services/sistemaService";

const base: ResumoDiarioConfig = { ativo: false, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, incluir_sigilosos: true };

describe("configuração do resumo diário", () => {
  it("alterna dias e devolve ordenado, sem repetir", () => {
    expect(alternarDia([1, 2, 3], 6, true)).toEqual([1, 2, 3, 6]);
    expect(alternarDia([1, 2, 3], 2, false)).toEqual([1, 3]);
    expect(alternarDia([1, 2], 2, true)).toEqual([1, 2]);
  });
  it("descreve a agenda em português", () => {
    expect(descreverAgenda(base)).toBe("segunda a sexta, às 07:00");
    expect(descreverAgenda({ dias_semana: [1, 3, 5], hora: 7, minuto: 30 })).toBe("segunda, quarta e sexta, às 07:30");
    expect(descreverAgenda({ dias_semana: [0, 1, 2, 3, 4, 5, 6], hora: 18, minuto: 0 })).toBe("todos os dias, às 18:00");
    expect(descreverAgenda({ dias_semana: [2], hora: 9, minuto: 5 })).toBe("terça, às 09:05");
    expect(descreverAgenda({ dias_semana: [], hora: 9, minuto: 5 })).toBe("nenhum dia escolhido");
  });
  it("rótulo da janela", () => {
    expect(rotuloDaJanela(0)).toMatch(/Só o que vence hoje/);
    expect(rotuloDaJanela(1)).toBe("Também o que vence nos próximos 1 dia");
    expect(rotuloDaJanela(3)).toBe("Também o que vence nos próximos 3 dias");
  });
  it("detecta mudança na configuração (ordem dos dias e caixa do e-mail não contam) e nos destinatários", () => {
    const d = [{ nome: "Bruno", email: "bruno@x.org" }];
    const salvo = { config: base, destinatarios: d };
    expect(houveMudancaNoDiario({ config: { ...base, dias_semana: [5, 4, 3, 2, 1] }, destinatarios: [{ nome: "Bruno S.", email: "BRUNO@x.org" }] }, salvo)).toBe(false);
    expect(houveMudancaNoDiario({ config: { ...base, hora: 8 }, destinatarios: d }, salvo)).toBe(true);
    expect(houveMudancaNoDiario({ config: base, destinatarios: [...d, { nome: "Caio", email: "caio@x.org" }] }, salvo)).toBe(true);
  });
  it("ligar sem destinatário é problema; desligado sem destinatário não é", () => {
    expect(problemasDoDiario({ ...base, ativo: true }, [])).toEqual(["Cadastre ao menos um destinatário para ligar o resumo diário."]);
    expect(problemasDoDiario(base, [])).toEqual([]);
    expect(problemasDoDiario({ ...base, dias_semana: [] }, [{ nome: "B", email: "b@x.org" }])).toEqual(["Escolha ao menos um dia da semana."]);
  });
});

describe("o painel Resumo diário: próximo e último envio", () => {
  const ligado = { ...base, ativo: true };   // segunda a sexta, 07:00 (Brasília)
  it("antes do horário de hoje: hoje", () => {
    const p = proximoEnvio(ligado, new Date("2026-10-23T09:00:00Z"));   // sexta 06:00 em Brasília
    expect(p?.rotulo).toBe("hoje, 23/10 às 07:00");
    expect(p?.quando.toISOString()).toBe("2026-10-23T10:00:00.000Z");
  });
  it("depois do horário: o próximo dia escolhido (sexta → segunda, pulando o fim de semana)", () => {
    expect(proximoEnvio(ligado, new Date("2026-10-23T10:00:00Z"))?.rotulo).toBe("segunda, 26/10 às 07:00");   // 07:00 em ponto já passou
    expect(proximoEnvio(ligado, new Date("2026-10-23T22:00:00Z"))?.rotulo).toBe("segunda, 26/10 às 07:00");
  });
  it("no dia seguinte: amanhã", () => {
    expect(proximoEnvio(ligado, new Date("2026-10-22T21:00:00Z"))?.rotulo).toBe("amanhã, 23/10 às 07:00");   // quinta 18:00 em Brasília
  });
  it("conta o dia pelo relógio de Brasília, não pelo UTC (23:30 em Brasília já é o dia seguinte em UTC)", () => {
    expect(proximoEnvio(ligado, new Date("2026-10-23T02:30:00Z"))?.rotulo).toBe("amanhã, 23/10 às 07:00");   // quinta 23:30 em Brasília → sexta
  });
  it("desligado ou sem dia escolhido: nada", () => {
    expect(proximoEnvio(base, new Date("2026-10-23T09:00:00Z"))).toBeNull();
    expect(proximoEnvio({ ...ligado, dias_semana: [] }, new Date("2026-10-23T09:00:00Z"))).toBeNull();
  });
  it("só um dia na semana: pode ser daqui a 7 dias", () => {
    expect(proximoEnvio({ ...ligado, dias_semana: [5] }, new Date("2026-10-23T11:00:00Z"))?.rotulo).toBe("sexta, 30/10 às 07:00");
  });
  it("o último envio aparece no horário de Brasília", () => {
    expect(quandoFoi("2026-10-23T11:00:00Z")).toBe("23/10 às 08:00");
    expect(quandoFoi("2026-10-24T02:30:00Z")).toBe("23/10 às 23:30");
    expect(quandoFoi(null)).toBeNull();
    expect(quandoFoi("lixo")).toBeNull();
  });
});
