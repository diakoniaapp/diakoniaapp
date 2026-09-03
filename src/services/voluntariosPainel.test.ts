// O teto de escalas do mês passou a sair da FREQUÊNCIA que a pessoa escolheu,
// e não de `max_escalas_mes` — que valia 4 para as 76 pessoas, tivessem elas
// dito "toda semana" ou "uma vez por mês".
//
// O defeito só apareceu porque alguém perguntou por uma pessoa concreta: a
// Sunamyta disse "uma vez por mês", já tinha servido uma vez no mês, e a tela
// mostrava 1/4, barra verde, "Disponível". Ela já tinha feito exatamente o que
// se dispôs a fazer.
//
// Estes testes travam as duas metades da correção: o número de quem declarou
// um, e o silêncio de quem não declarou nenhum.
import { describe, it, expect } from "vitest";
import { tetoDeclarado, estadoDe, type VoluntarioDoPainel } from "./voluntariosPainel";

const v = (p: Partial<VoluntarioDoPainel>): VoluntarioDoPainel => ({
  pessoa_id: "p1", nome_completo: "Fulana", telefone: null, atuacoes: [],
  temPerfil: true, dias: [], turnos: [], frequencia: null, restricoes: null,
  emDescanso: false, descansoAte: null,
  cargaMes: 0, maxMes: null, sobrecarga: 0,
  ultimaEscala: null, diasSemServir: null,
  ...p,
});

describe("tetoDeclarado", () => {
  it("traduz a frequência escolhida em número de escalas no mês", () => {
    expect(tetoDeclarado("toda_semana")).toBe(4);
    expect(tetoDeclarado("quinzenal")).toBe(2);
    expect(tetoDeclarado("mensal")).toBe(1);
  });

  it("não inventa número para quem não declarou nenhum", () => {
    // "De vez em quando" e "quando precisarem" são condições, não quantidades.
    // Devolver 4 aqui seria repetir o defeito com outro valor.
    expect(tetoDeclarado("eventual")).toBeNull();
    expect(tetoDeclarado("sob_demanda")).toBeNull();
    expect(tetoDeclarado(null)).toBeNull();
  });
});

describe("estadoDe", () => {
  it("quem disse 'uma vez por mês' e já serviu uma vez está NO LIMITE", () => {
    // O caso da Sunamyta, e de mais seis pessoas medidas no mesmo dia.
    expect(estadoDe(v({ frequencia: "mensal", maxMes: 1, cargaMes: 1 }))).toBe("no_limite");
  });

  it("quem disse 'toda semana' e serviu uma vez continua disponível", () => {
    expect(estadoDe(v({ frequencia: "toda_semana", maxMes: 4, cargaMes: 1 }))).toBe("disponivel");
  });

  it("quem não declarou teto NUNCA chega ao limite", () => {
    // Não é que ela aguente tudo: é que ela não disse quanto aguenta. Pô-la
    // "no limite" seria pôr na boca dela uma frase que ela não falou.
    expect(estadoDe(v({ frequencia: "sob_demanda", maxMes: null, cargaMes: 9 }))).toBe("disponivel");
  });

  it("descanso ganha de tudo, inclusive do limite", () => {
    expect(estadoDe(v({ frequencia: "mensal", maxMes: 1, cargaMes: 1, emDescanso: true })))
      .toBe("descanso");
  });

  it("quem não tem perfil não entra em limite nenhum", () => {
    // Sem perfil não há frequência declarada, e portanto não há teto — a
    // pessoa aparece como "sem disponibilidade", que é a verdade.
    expect(estadoDe(v({ temPerfil: false, maxMes: null, cargaMes: 3 }))).toBe("sem_perfil");
  });

  it("no limite vem antes de sumido", () => {
    // Quem está cheio no mês não deve ser cobrado por ausência: são dois
    // avisos contraditórios sobre a mesma pessoa.
    expect(estadoDe(v({ frequencia: "mensal", maxMes: 1, cargaMes: 1, diasSemServir: 90 })))
      .toBe("no_limite");
  });
});
