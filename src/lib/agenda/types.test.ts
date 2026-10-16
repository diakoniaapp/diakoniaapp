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

// ─── A agenda nunca abre vazia por filtro desmarcado (16/10/2026) ────────────────────────────────────────────────────────────────────────────
import {
  TODAS_AS_CATEGORIAS, TODOS_OS_STATUS, algumFiltroRestringe, filtrosTodosMarcados, incluirNovos,
} from "./types";

describe("migrarFiltros — nenhuma lista fica vazia", () => {
  it("status vazio (o que 'Mostrar tudo' gravava) volta com as três caixas marcadas", () => {
    expect(migrarFiltros({ status: [] }).status).toEqual(TODOS_OS_STATUS);
    expect(migrarFiltros({}).status).toEqual(TODOS_OS_STATUS);
  });
  it("categorias vazias (que escondiam a agenda inteira) voltam todas marcadas", () => {
    expect(migrarFiltros({ categorias: [] }).categorias).toEqual(TODAS_AS_CATEGORIAS);
  });
  it("a escolha que a pessoa fez de verdade é preservada", () => {
    const f = migrarFiltros({ status: ["agendado"], categorias: ["igreja", "feriado"] });
    expect(f.status).toEqual(["agendado"]);
    expect(f.categorias).toEqual(["igreja", "feriado", "arrecadacao"]);   // a camada de arrecadação entra, como sempre
  });
  it("o padrão de quem nunca abriu a agenda é tudo marcado", () => {
    expect(DEFAULT_FILTROS.status).toEqual(TODOS_OS_STATUS);
    expect(DEFAULT_FILTROS.categorias).toEqual(TODAS_AS_CATEGORIAS);
    expect(DEFAULT_FILTROS.tipos).toEqual(TODOS_OS_TIPOS);
  });
});

describe("filtrosTodosMarcados e algumFiltroRestringe", () => {
  const universo = { ministerios: ["m1", "m2", "m3"], areas: ["a1", "a2"], locais: ["l1", "l2"] };

  it("marca todas as opções, mantém só a preferência de cor", () => {
    const f = filtrosTodosMarcados({ ...DEFAULT_FILTROS, colorBy: "ministerio", ministerios: ["m1"], locais: ["l2"], status: ["cancelado"], categorias: ["igreja"] }, universo);
    expect(f).toMatchObject({ ministerios: ["m1", "m2", "m3"], areas: ["a1", "a2"], locais: ["l1", "l2"], status: TODOS_OS_STATUS, categorias: TODAS_AS_CATEGORIAS, tipos: TODOS_OS_TIPOS, colorBy: "ministerio" });
    expect(algumFiltroRestringe(f, universo)).toBe(false);
  });

  it("restringe quando falta ALGUMA opção; vazio ou tudo marcado não restringem (mesma definição do contador do botão)", () => {
    const todos = filtrosTodosMarcados(DEFAULT_FILTROS, universo);
    expect(algumFiltroRestringe(todos, universo)).toBe(false);
    expect(algumFiltroRestringe({ ...todos, locais: ["l1"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, status: ["agendado"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, categorias: ["igreja"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, ministerios: [] }, universo)).toBe(false);
  });
});

describe("incluirNovos — restaurar a última seleção sem perder o que nasceu depois", () => {
  it("lista vazia: tudo marcado", () => {
    expect(incluirNovos([], undefined, ["a", "b"])).toEqual({ selecionados: ["a", "b"], conhecidos: ["a", "b"], mudou: true });
  });
  it("com memória: o que foi desmarcado continua desmarcado e nada muda", () => {
    expect(incluirNovos(["a"], ["a", "b"], ["a", "b"])).toEqual({ selecionados: ["a"], conhecidos: ["a", "b"], mudou: false });
  });
  it("com memória: só o item NOVO entra marcado", () => {
    expect(incluirNovos(["a"], ["a", "b"], ["a", "b", "c"])).toEqual({ selecionados: ["a", "c"], conhecidos: ["a", "b", "c"], mudou: true });
  });
  it("sem memória (legado): todos contam como novos uma vez", () => {
    expect(incluirNovos(["a"], undefined, ["a", "b"])).toEqual({ selecionados: ["a", "b"], conhecidos: ["a", "b"], mudou: true });
  });
  it("não duplica", () => {
    expect(incluirNovos(["a", "c"], ["a"], ["a", "c"]).selecionados).toEqual(["a", "c"]);
  });
});
