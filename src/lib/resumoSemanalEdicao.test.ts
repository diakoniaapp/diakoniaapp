import { describe, expect, it } from "vitest";
import { alternarBloco, houveMudanca, moverBloco, quantosAtivos, trocarPerfil } from "./resumoSemanalEdicao";
import { mesclarConfig } from "./resumoSemanalCatalogo";

const tes = () => mesclarConfig(null).find(p => p.perfil === "tesouraria")!;

describe("edição da configuração do resumo semanal", () => {
  it("subir e descer trocam com o vizinho e renumeram 1..n", () => {
    const b = tes().blocos;
    const subiu = moverBloco(b, "vencimentos_semana", -1);
    expect(subiu.slice(0, 2).map(x => x.bloco)).toEqual(["vencimentos_semana", "contas_atrasadas"]);
    expect(subiu.map(x => x.ordem)).toEqual(subiu.map((_, i) => i + 1));
    const desceu = moverBloco(b, "contas_atrasadas", 1);
    expect(desceu.slice(0, 2).map(x => x.bloco)).toEqual(["vencimentos_semana", "contas_atrasadas"]);
  });
  it("nas pontas não faz nada", () => {
    const b = tes().blocos;
    expect(moverBloco(b, b[0].bloco, -1).map(x => x.bloco)).toEqual(b.map(x => x.bloco));
    expect(moverBloco(b, b[b.length - 1].bloco, 1).map(x => x.bloco)).toEqual(b.map(x => x.bloco));
  });
  it("ligar e desligar um bloco; o 'em preparação' não liga", () => {
    const b = tes().blocos;
    expect(alternarBloco(b, "saldo_contas", false).find(x => x.bloco === "saldo_contas")!.ativo).toBe(false);
    expect(alternarBloco(b, "fiscal", true).find(x => x.bloco === "fiscal")!.ativo).toBe(true);
    expect(alternarBloco(b, "prontidao_malote", true).find(x => x.bloco === "prontidao_malote")!.ativo).toBe(false);
  });
  it("houveMudanca: igual ao salvo = não; mexer em qualquer coisa = sim; voltar ao que era = não", () => {
    const salvo = mesclarConfig(null);
    expect(houveMudanca(salvo, salvo)).toBe(false);
    const mexido = trocarPerfil(salvo, "tesouraria", p => ({ ...p, blocos: alternarBloco(p.blocos, "saldo_contas", false) }));
    expect(houveMudanca(mexido, salvo)).toBe(true);
    const desfeito = trocarPerfil(mexido, "tesouraria", p => ({ ...p, blocos: alternarBloco(p.blocos, "saldo_contas", true) }));
    expect(houveMudanca(desfeito, salvo)).toBe(false);
    expect(houveMudanca(trocarPerfil(salvo, "pastoral", p => ({ ...p, ativo: false })), salvo)).toBe(true);
  });
  it("quantosAtivos conta só os ligados", () => {
    expect(quantosAtivos(tes())).toBe(6);
  });
});
