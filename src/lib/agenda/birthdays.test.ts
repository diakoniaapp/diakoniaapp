// Casamentos na Agenda: uma linha por CASAL, com os nomes dos dois juntos (16/10/2026).
import { describe, expect, it } from "vitest";
import { aniversariosNoIntervalo, casaisDeBodas, type PessoaAniv } from "./birthdays";

const pessoa = (id: string, nome: string, casamento: string | null, extra: Partial<PessoaAniv> = {}): PessoaAniv => ({
  id, nome_completo: nome, data_nascimento: null, data_casamento: casamento, tipo_pessoa: "membro", ...extra,
});
const bodas = (ps: PessoaAniv[], de: string, ate: string) =>
  aniversariosNoIntervalo(ps, new Date(`${de}T12:00:00`), new Date(`${ate}T12:00:00`)).filter((o) => o.categoria === "casamento");

describe("casais na agenda", () => {
  it("a mesma data de casamento: um evento com os dois nomes (como sempre foi)", () => {
    const r = bodas([pessoa("a", "Alexandre", "2010-05-08"), pessoa("b", "Elizabeth", "2010-05-08")], "2026-05-01", "2026-05-31");
    expect(r).toHaveLength(1);
    expect(r[0].evento.titulo).toBe("💍 Alexandre & Elizabeth");
    expect(r[0].evento.descricao).toContain("16 anos");
  });

  it("só um dos dois tem a data, e o vínculo de família os une: um evento, os dois nomes", () => {
    const r = bodas([
      pessoa("a", "Carlos", "2010-05-08", { conjuge_id: "b", conjuge_nome: "Marta", responsavel_familia: true }),
      pessoa("b", "Marta", null, { conjuge_id: "a", conjuge_nome: "Carlos" }),
    ], "2026-05-01", "2026-05-31");
    expect(r).toHaveLength(1);
    expect(r[0].evento.titulo).toBe("💍 Carlos & Marta");
  });

  it("o cônjuge nem aparece na lista (sem data nenhuma): o nome dele completa o casal", () => {
    const r = bodas([pessoa("a", "Carlos", "2010-05-08", { conjuge_id: "zz", conjuge_nome: "Marta" })], "2026-05-01", "2026-05-31");
    expect(r).toHaveLength(1);
    expect(r[0].evento.titulo).toBe("💍 Carlos & Marta");
  });

  it("os dois têm a data, com o ANO diferente (erro de digitação): um evento só, vale a data do responsável", () => {
    const r = bodas([
      pessoa("a", "Bittencourt Esposa", "2020-03-14", { conjuge_id: "b" }),
      pessoa("b", "Bittencourt Marido", "2018-03-14", { conjuge_id: "a", responsavel_familia: true }),
    ], "2026-03-01", "2026-03-31");
    expect(r).toHaveLength(1);
    expect(r[0].evento.titulo).toBe("💍 Bittencourt Marido & Bittencourt Esposa");   // o responsável primeiro
    expect(r[0].evento.descricao).toContain("8 anos");                                // 2026 − 2018
  });

  it("datas com DIA ou MÊS diferentes não se fundem: nunca se apaga um casamento por achar que é erro", () => {
    const ps = [
      pessoa("a", "Vitorino", "2010-03-14", { conjuge_id: "b" }),
      pessoa("b", "Vitorina", "2010-05-14", { conjuge_id: "a" }),
    ];
    expect(casaisDeBodas(ps)).toHaveLength(2);
  });

  it("duas pessoas sem relação com datas diferentes seguem separadas; e a pessoa sozinha aparece sozinha", () => {
    const ps = [pessoa("a", "Ana", "2001-02-03"), pessoa("b", "Bia", "2002-02-03"), pessoa("c", "Cris", "2003-04-05")];
    expect(casaisDeBodas(ps).map((c) => c.nomes)).toEqual([["Ana"], ["Bia"], ["Cris"]]);
  });

  it("no mesmo dia, o evento tem id estável e o casal não duplica se a lista vem na ordem inversa", () => {
    const a = pessoa("a", "Carlos", "2010-05-08", { conjuge_id: "b", responsavel_familia: true });
    const b = pessoa("b", "Marta", null, { conjuge_id: "a" });
    const um = bodas([a, b], "2026-05-08", "2026-05-08");
    const dois = bodas([b, a], "2026-05-08", "2026-05-08");
    expect(um).toHaveLength(1);
    expect(dois).toHaveLength(1);
    expect(um[0].key).toBe(dois[0].key);
  });
});
