// A contagem de composição mudou de fonte em 03/09/2026: lia
// `area_voluntarios.funcao`, texto livre, e passou a ler o POSTO declarado
// pela área.
//
// Três dos testes antigos desapareceram com a reescrita, e é bom que tenham
// desaparecido — travavam filtros defensivos ("Voluntário" é ausência, nome de
// área é ausência, ignore caixa e acentos) que só existiam porque qualquer
// palavra cabia na coluna. Agora um CHECK e um gatilho recusam as três coisas
// na entrada do catálogo, e o teste delas mudou de lugar: está no banco, e foi
// conferido no ensaio da migration 20260902270000.
//
// O que sobra aqui é o que continua sendo decisão desta função.
import { describe, it, expect } from "vitest";
import { composicao } from "./ComposicaoPorFuncao";
import type { VoluntarioDoMinisterio } from "@/services/painelMinisterioService";
import { chave, type PostosDoMinisterio, type Posto, type Ocupacao } from "@/services/postos";

const v = (pessoa_id: string, area_id = "areaA") =>
  ({ pessoa_id, area_id, area_nome: area_id, funcao: null } as unknown as VoluntarioDoMinisterio);

/**
 * Monta o retorno de `carregarPostos` a partir de uma lista legível:
 * [pessoa, área, ...postos que ela ocupa ali].
 */
function postosDe(linhas: [string, string, ...string[]][]): PostosDoMinisterio {
  const catalogo = new Map<string, Posto[]>();
  const vinculo = new Map<string, string>();
  const ocupacoes = new Map<string, Ocupacao[]>();
  const jaNoCatalogo = new Set<string>();

  for (const [pessoa, area, ...nomes] of linhas) {
    const vinculoId = `v:${pessoa}:${area}`;
    vinculo.set(chave(pessoa, area), vinculoId);
    if (!catalogo.has(area)) catalogo.set(area, []);
    if (!ocupacoes.has(vinculoId)) ocupacoes.set(vinculoId, []);

    for (const nome of nomes) {
      const postoId = `${area}:${nome}`;
      if (!jaNoCatalogo.has(postoId)) {
        jaNoCatalogo.add(postoId);
        catalogo.get(area)!.push({ id: postoId, area_id: area, nome, ordem: 0, min_por_escala: 0 });
      }
      ocupacoes.get(vinculoId)!.push({
        id: `l:${vinculoId}:${nome}`,
        area_voluntario_id: vinculoId,
        area_funcao_id: postoId,
        principal: false,
        pendente: false,
      });
    }
  }
  return { catalogo, vinculo, ocupacoes };
}

describe("composicao", () => {
  it("conta PESSOAS, não vínculos", () => {
    // O Ulisses serve em Músicos e em Vocal. Contando linhas daria dois
    // guitarristas onde há um. A pergunta que a tela responde é "quantos
    // guitarristas eu tenho".
    const r = composicao(
      [v("p1", "musicos"), v("p1", "vocal"), v("p2", "musicos")],
      postosDe([
        ["p1", "musicos", "Guitarrista"],
        ["p1", "vocal", "Guitarrista"],
        ["p2", "musicos", "Guitarrista"],
      ]),
    );
    expect(r.funcoes).toEqual([{ nome: "Guitarrista", pessoas: 2 }]);
    expect(r.total).toBe(2);
  });

  it("uma pessoa em dois postos entra nos dois", () => {
    // O caso real: um vínculo dizia "Tecladista/Trompetista" — uma pessoa com
    // dois instrumentos espremida num campo que só aceitava um. Virou duas
    // linhas na migration, e a contagem tem de refletir as duas.
    const r = composicao(
      [v("p1", "musicos")],
      postosDe([["p1", "musicos", "Tecladista", "Trompetista"]]),
    );
    expect(r.funcoes.map(f => f.nome).sort()).toEqual(["Tecladista", "Trompetista"]);
    expect(r.semFuncao).toBe(0);
    expect(r.total).toBe(1);
  });

  it("quem tem posto numa área e nenhum noutra NÃO entra na fila de quem falta", () => {
    // A pergunta é se a igreja sabe o que a pessoa faz. Sabe — está numa das
    // duas linhas. Cobrá-la de novo mandaria quem lidera procurar uma
    // informação que já existe.
    const r = composicao(
      [v("p1", "musicos"), v("p1", "vocal")],
      postosDe([["p1", "musicos", "Baterista"], ["p1", "vocal"]]),
    );
    expect(r.semFuncao).toBe(0);
    expect(r.funcoes).toEqual([{ nome: "Baterista", pessoas: 1 }]);
  });

  it("conta como sem posto quem não ocupa nenhum", () => {
    const r = composicao(
      [v("p1"), v("p2"), v("p3")],
      postosDe([["p1", "areaA", "Apoio"], ["p2", "areaA"], ["p3", "areaA"]]),
    );
    expect(r.funcoes).toEqual([{ nome: "Apoio", pessoas: 1 }]);
    expect(r.semFuncao).toBe(2);
    expect(r.total).toBe(3);
  });

  it("ordena do posto mais numeroso para o menos, e desempata por nome", () => {
    const r = composicao(
      ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map(p => v(p, "musicos")),
      postosDe([
        ["p1", "musicos", "Vocal"], ["p2", "musicos", "Vocal"],
        ["p3", "musicos", "Vocal"], ["p4", "musicos", "Vocal"],
        ["p5", "musicos", "Guitarrista"], ["p6", "musicos", "Guitarrista"],
        ["p7", "musicos", "Violão"],
        ["p8", "musicos", "Baterista"],
      ]),
    );
    expect(r.funcoes.map(f => f.nome)).toEqual([
      "Vocal", "Guitarrista", "Baterista", "Violão",
    ]);
  });

  it("enquanto os postos não chegaram, não afirma nada", () => {
    // `null` é o estado de carregamento. Anunciar "3 sem posto" antes de os
    // dados chegarem seria alarmar com o próprio atraso da consulta — e o
    // aviso apareceria e sumiria a cada abertura do painel.
    const r = composicao([v("p1"), v("p2"), v("p3")], null);
    expect(r.funcoes).toEqual([]);
    expect(r.semFuncao).toBe(0);
    expect(r.total).toBe(3);
  });

  it("equipe sem ninguém devolve tudo zerado, e a tela não desenha nada", () => {
    const r = composicao([], postosDe([]));
    expect(r.funcoes).toEqual([]);
    expect(r.semFuncao).toBe(0);
    expect(r.total).toBe(0);
  });
});
