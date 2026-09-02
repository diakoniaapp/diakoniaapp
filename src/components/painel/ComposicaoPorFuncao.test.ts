// A contagem de composição tem três sutilezas, e todas nasceram do dado real
// da igreja. Este arquivo trava as três.
import { describe, it, expect } from "vitest";
import { composicao } from "./ComposicaoPorFuncao";
import type { VoluntarioDoMinisterio } from "@/services/painelMinisterioService";

/** Só os campos que `composicao` lê — o resto da view não interessa aqui. */
const v = (pessoa_id: string, funcao: string | null, area_id = "a1") =>
  ({ pessoa_id, funcao, area_id } as unknown as VoluntarioDoMinisterio);

describe("composicao", () => {
  it("conta PESSOAS, não vínculos", () => {
    // O Ulisses serve em Músicos e em Vocal. Contando linhas daria dois
    // guitarristas onde há um. A pergunta que a tela responde é "quantos
    // guitarristas eu tenho".
    const r = composicao([
      v("p1", "Guitarrista", "musicos"),
      v("p1", "Guitarrista", "vocal"),
      v("p2", "Guitarrista", "musicos"),
    ]);
    expect(r.funcoes).toEqual([{ nome: "Guitarrista", pessoas: 2 }]);
    expect(r.total).toBe(2);
  });

  it("trata `Voluntário` como ausência de função, e não como função", () => {
    // Medido nos onze ministérios: 80 dos 128 vínculos ativos têm `funcao` em
    // branco ou "Voluntário". É a palavra que o cadastro usa quando ninguém
    // registrou o que a pessoa faz — mostrá-la ao lado de "Baterista" daria a
    // impressão de que existe um posto chamado Voluntário.
    const r = composicao([
      v("p1", "Voluntário"),
      v("p2", "voluntario"),
      v("p3", ""),
      v("p4", null),
      v("p5", "Baterista"),
    ]);
    expect(r.funcoes).toEqual([{ nome: "Baterista", pessoas: 1 }]);
    expect(r.semFuncao).toBe(4);
    expect(r.total).toBe(5);
  });

  it("quem tem função numa área e é genérico noutra NÃO entra em `semFuncao`", () => {
    // A pergunta é se a igreja sabe o que a pessoa faz. Sabe — está escrito
    // numa das duas linhas. Contá-la como "sem função" mandaria quem lidera
    // procurar uma informação que já existe.
    const r = composicao([
      v("p1", "Recepção", "recepcao"),
      v("p1", "Voluntário", "introducao"),
    ]);
    expect(r.semFuncao).toBe(0);
    expect(r.funcoes).toEqual([{ nome: "Recepção", pessoas: 1 }]);
  });

  it("ordena da função mais numerosa para a menos, e desempata por nome", () => {
    const r = composicao([
      v("p1", "Vocal"), v("p2", "Vocal"), v("p3", "Vocal"), v("p4", "Vocal"),
      v("p5", "Guitarrista"), v("p6", "Guitarrista"),
      v("p7", "Violão"),
      v("p8", "Baterista"),
    ]);
    expect(r.funcoes.map(f => f.nome)).toEqual([
      "Vocal", "Guitarrista", "Baterista", "Violão",
    ]);
  });

  it("equipe sem ninguém devolve tudo zerado, e a tela não desenha nada", () => {
    const r = composicao([]);
    expect(r.funcoes).toEqual([]);
    expect(r.semFuncao).toBe(0);
    expect(r.total).toBe(0);
  });
});
