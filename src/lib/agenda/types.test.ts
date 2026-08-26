// ─── As migrações do filtro da agenda ──────────────────────────────────────
//
// O filtro vive no `localStorage` de cada pessoa. Isso quer dizer que toda
// mudança no formato tem de conviver com o que já está gravado no navegador
// de quem usa — e que o estrago de errar só aparece meses depois, na máquina
// dos outros. Não há como conferir olhando a tela hoje.
//
// Os dois casos que estes testes travam já aconteceram neste projeto:
//
//   1. Uma camada nova (`arrecadacao`) que não aparecia para quem já tinha
//      filtro gravado.
//   2. Um tipo de evento novo que nasceria ESCONDIDO. Enquanto `tipos`
//      nascia vazio — e vazio significava "sem restrição" —, um tipo novo
//      aparecia sozinho. Ao passar a gravar os nove tipos marcados, isso se
//      inverteu. `live`, `palestra` e `comunhao` entraram no enum em
//      26/08/2026; o próximo entraria mudo.

import { describe, it, expect } from "vitest";
import { migrarFiltros, DEFAULT_FILTROS, TODOS_OS_TIPOS } from "./types";

describe("migrarFiltros — tipos de evento", () => {
  it("filtro vazio vira todos marcados", () => {
    // Vazio nunca escondeu nada: quem gravou `[]` via todos os tipos. O que
    // muda é a tela dizer a verdade sobre isso.
    const f = migrarFiltros({ ...DEFAULT_FILTROS, tipos: [], tiposConhecidos: undefined });
    expect(f.tipos).toEqual(TODOS_OS_TIPOS);
  });

  it("um tipo NOVO no enum entra marcado, sem apagar o que a pessoa escolheu", () => {
    // A pessoa desmarcou "ensaio" quando o enum tinha 3 tipos. Hoje tem 9.
    // Os 6 que ela nunca viu entram; "ensaio" continua fora.
    const f = migrarFiltros({
      ...DEFAULT_FILTROS,
      tipos: ["culto", "reuniao"],
      tiposConhecidos: ["culto", "reuniao", "ensaio"],
    });
    expect(f.tipos).toContain("culto");
    expect(f.tipos).toContain("live");
    expect(f.tipos).toContain("palestra");
    expect(f.tipos).toContain("comunhao");
    expect(f.tipos).not.toContain("ensaio");
  });

  it("desmarcar continua desmarcado quando nada mudou no enum", () => {
    const f = migrarFiltros({
      ...DEFAULT_FILTROS,
      tipos: TODOS_OS_TIPOS.filter((t) => t !== "culto"),
      tiposConhecidos: TODOS_OS_TIPOS,
    });
    expect(f.tipos).not.toContain("culto");
    expect(f.tipos).toHaveLength(TODOS_OS_TIPOS.length - 1);
  });

  it("filtro antigo, sem memória de tipos, preserva a escolha da pessoa", () => {
    // Sem `tiposConhecidos` não há como saber se `["culto"]` é escolha ou
    // resquício. Preservar a escolha é o menor dano: perder a escolha de
    // alguém dói mais que um tipo antigo ficar desmarcado — e nenhum tipo
    // está nessa situação hoje.
    const f = migrarFiltros({ ...DEFAULT_FILTROS, tipos: ["culto"], tiposConhecidos: undefined });
    expect(f.tipos).toEqual(["culto"]);
  });

  it("grava a memória para a próxima vez", () => {
    const f = migrarFiltros({ ...DEFAULT_FILTROS, tipos: ["culto"] });
    expect(f.tiposConhecidos).toEqual(TODOS_OS_TIPOS);
  });

  it("nunca sai com tipo repetido", () => {
    // Concatenar os novos numa lista que já os tinha faria o chip anunciar
    // "12/9" e o `includes` do filtro trabalhar à toa.
    const f = migrarFiltros({
      ...DEFAULT_FILTROS,
      tipos: TODOS_OS_TIPOS,
      tiposConhecidos: ["culto"],
    });
    expect(new Set(f.tipos).size).toBe(f.tipos.length);
  });
});

describe("migrarFiltros — camada de arrecadação", () => {
  it("entra em filtro que não a conhecia", () => {
    const f = migrarFiltros({ ...DEFAULT_FILTROS, categorias: ["igreja", "batista"] });
    expect(f.categorias).toContain("arrecadacao");
  });

  it("não duplica quando já está lá", () => {
    const f = migrarFiltros({ ...DEFAULT_FILTROS, categorias: ["igreja", "arrecadacao"] });
    expect(f.categorias!.filter((c) => c === "arrecadacao")).toHaveLength(1);
  });
});

describe("migrarFiltros — o que não pode quebrar", () => {
  it("lixo no localStorage não derruba a agenda", () => {
    // `JSON.parse` de qualquer coisa gravada à mão, ou de uma versão futura
    // que voltou atrás. A tela tem de abrir.
    for (const entrada of [{}, { tipos: "culto" }, { categorias: 7 }, { tipos: null }]) {
      const f = migrarFiltros(entrada);
      expect(Array.isArray(f.tipos)).toBe(true);
      expect(f.tipos.length).toBeGreaterThan(0);
      expect(f.colorBy).toBeTruthy();
      expect(Array.isArray(f.status)).toBe(true);
    }
  });

  it("não perde os campos que não são migrados", () => {
    const f = migrarFiltros({ ...DEFAULT_FILTROS, locais: ["abc"], colorBy: "ministerio" });
    expect(f.locais).toEqual(["abc"]);
    expect(f.colorBy).toBe("ministerio");
  });
});
